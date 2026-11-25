"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { executeApprovedHandoff } = require("../integrations/vega_edit_executor.js");

async function makeWorkspace(t, files = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vega-executor-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, content);
  }
  return root;
}

function makePayload(root, targetFiles = ["sample.js"], fileOperations = [], overrides = {}) {
  const markdown = [
    "# Feature Spec: Executor Test",
    "",
    "## Target Files & Interfaces",
    ...targetFiles.map((file) => `- \`${file}\``)
  ].join("\n");
  return {
    schema_version: "1.0",
    spec_id: "executor-test",
    approved_by_user: true,
    approval_tier: "apply_edits",
    mode: "plan_and_apply",
    readme_spec_markdown: markdown,
    ide_context: { workspace_root: root },
    constraints: { stay_within_scope: true, require_approval_for_destructive_ops: true },
    file_operations: fileOperations,
    ...overrides
  };
}

function replacement(pathname, search, replace) {
  return { op: "replace", path: pathname, search, replace };
}

test("unapproved apply is rejected without changing files", async (t) => {
  const root = await makeWorkspace(t, { "sample.js": "const value = 'before';\n" });
  const file = path.join(root, "sample.js");
  const before = await fs.readFile(file);
  const result = await executeApprovedHandoff(makePayload(root, ["sample.js"], [
    replacement("sample.js", "before", "after")
  ], { approved_by_user: false }), { workspaceRoot: root });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "explicit_approval_required");
  assert.deepEqual(await fs.readFile(file), before);
});

test("out-of-scope, environment, and traversal paths fail without writes", async (t) => {
  const root = await makeWorkspace(t, {
    "sample.js": "const value = 'before';\n",
    "outside.js": "const value = 'outside';\n",
    ".env": "KEY=kept\n"
  });
  const before = await fs.readFile(path.join(root, "sample.js"));
  const candidates = [
    { targets: ["sample.js"], operation: replacement("outside.js", "outside", "changed") },
    { targets: ["sample.js", ".env"], operation: replacement(".env", "KEY=kept", "KEY=changed") },
    { targets: ["sample.js"], operation: replacement("../outside.js", "outside", "changed") }
  ];
  for (const candidate of candidates) {
    const result = await executeApprovedHandoff(
      makePayload(root, candidate.targets, [candidate.operation]),
      { workspaceRoot: root }
    );
    assert.equal(result.ok, false);
    assert.deepEqual(await fs.readFile(path.join(root, "sample.js")), before);
    assert.equal(await fs.readFile(path.join(root, ".env"), "utf8"), "KEY=kept\n");
  }
});

test("approved target edit writes and passes JavaScript syntax verification", async (t) => {
  const root = await makeWorkspace(t, { "sample.js": "const value = 'before';\n" });
  const result = await executeApprovedHandoff(makePayload(root, ["sample.js"], [
    replacement("sample.js", "before", "after")
  ]), { workspaceRoot: root });
  assert.equal(result.ok, true);
  assert.equal(result.status, "completed");
  assert.deepEqual(result.changed_files, ["sample.js"]);
  assert.ok(result.checks.some((check) => check.check === "node --check" && check.status === "passed"));
  assert.equal(await fs.readFile(path.join(root, "sample.js"), "utf8"), "const value = 'after';\n");
});

test("syntax verification failure restores original bytes exactly", async (t) => {
  const root = await makeWorkspace(t);
  const file = path.join(root, "sample.js");
  const original = Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from("const value = 'before';\r\n")]);
  await fs.writeFile(file, original);
  const result = await executeApprovedHandoff(makePayload(root, ["sample.js"], [
    replacement("sample.js", "'before'", "(")
  ]), { workspaceRoot: root });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "verification_failed");
  assert.equal(result.rolled_back, true);
  assert.deepEqual(await fs.readFile(file), original);
});

test("cancellation after a write restores original bytes exactly", async (t) => {
  const root = await makeWorkspace(t, { "sample.js": "const value = 'before';\n" });
  const file = path.join(root, "sample.js");
  const original = await fs.readFile(file);
  const controller = new AbortController();
  const result = await executeApprovedHandoff(makePayload(root, ["sample.js"], [
    replacement("sample.js", "before", "after")
  ]), {
    workspaceRoot: root,
    signal: controller.signal,
    reportProgress: (message) => {
      if (message.startsWith("Verifying")) controller.abort("cancelled_by_user");
    }
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "cancelled_by_user");
  assert.equal(result.rolled_back, true);
  assert.deepEqual(await fs.readFile(file), original);
});

test("create operations create only listed workspace files", async (t) => {
  const root = await makeWorkspace(t);
  const result = await executeApprovedHandoff(makePayload(root, ["created.js"], [
    { op: "create", path: "created.js", content: "const created = true;\n" }
  ]), { workspaceRoot: root });
  assert.equal(result.ok, true);
  assert.deepEqual(result.changed_files, ["created.js"]);
  assert.equal(await fs.readFile(path.join(root, "created.js"), "utf8"), "const created = true;\n");
});
