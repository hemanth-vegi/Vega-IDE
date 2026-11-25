"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const test = require("node:test");

const {
  bridgeEnabled,
  getVegaContext,
  registerVegaContextProvider
} = require("../integrations/vega_context_provider.js");

function makeVscodeMock() {
  const workspaceRoot = ["C:", "Users", "example", "project"].join("\\");
  const document = {
    uri: { fsPath: path.join(workspaceRoot, ".env") },
    getText: () => "GITHUB_TOKEN=ghp_" + "a".repeat(32)
  };
  return {
    workspace: { workspaceFolders: [{ uri: { fsPath: workspaceRoot } }] },
    window: { activeTextEditor: { document, selection: {} } },
    languages: {
      getDiagnostics: () => [{
        message: "Bearer " + "b".repeat(40),
        severity: 1,
        source: "typescript",
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } }
      }]
    }
  };
}

function makeHandoff(overrides = {}) {
  return {
    schema_version: "1.0",
    spec_id: "spec-test",
    spec_version: 1,
    run_id: `run-${Date.now()}-${Math.random()}`,
    seq: 1,
    title: "Test handoff",
    status: "running",
    approved_by_user: true,
    approval_tier: "apply_edits",
    mode: "plan_and_apply",
    readme_spec_markdown: "# Feature Spec: Test\n\n## Goal\n- Verify the handoff protocol.",
    ide_context: { workspace_root: "", active_file: "", selected_text: "", recent_diagnostics: [] },
    glossary_terms: [],
    constraints: { stay_within_scope: true, require_approval_for_destructive_ops: true },
    ...overrides
  };
}

function postJson(port, route, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = http.request({
      hostname: "127.0.0.1", port, path: route, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, (response) => {
      let data = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { data += chunk; });
      response.on("end", () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch (_) { parsed = data; }
        resolve({ status: response.statusCode, body: parsed });
      });
    });
    request.on("error", reject);
    request.end(body);
  });
}

function startNdjson(port, payload) {
  let firstLineResolve;
  const firstLine = new Promise((resolve) => { firstLineResolve = resolve; });
  const responsePromise = new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = http.request({
      hostname: "127.0.0.1", port, path: "/api/vega/handoff", method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "Accept": "application/x-ndjson" }
    }, (response) => {
      let buffer = "";
      const events = [];
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line);
          events.push(event);
          if (events.length === 1) firstLineResolve(event);
        }
      });
      response.on("end", () => resolve({ status: response.statusCode, events }));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end(body);
  });
  return { firstLine, responsePromise };
}

test("bridge remains disabled unless an environment flag explicitly enables it", () => {
  assert.equal(bridgeEnabled({}), false);
  assert.equal(bridgeEnabled({ VEGA_IDE_BRIDGE_ENABLED: "1" }), true);
});

test("context redacts environment paths, personal paths, tokens, and bounds diagnostics", () => {
  const context = getVegaContext(makeVscodeMock());
  const serialized = JSON.stringify(context);
  assert.equal(context.active_file, "[REDACTED_ENV_PATH]");
  assert.equal(context.workspace_root, "[REDACTED_USER_PATH]");
  assert.doesNotMatch(serialized, /example/);
  assert.doesNotMatch(serialized, /ghp_|Bearer b/);
  assert.ok(Buffer.byteLength(JSON.stringify(context.recent_diagnostics), "utf8") <= 4096);
});

test("context endpoint binds to loopback and serves only its read-only route", async (t) => {
  const server = registerVegaContextProvider(makeVscodeMock(), { port: 0 });
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.equal(address.address, "127.0.0.1");

  const result = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${address.port}/api/vega/context`, (response) => {
      let data = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { data += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(data) }));
    }).on("error", reject);
  });
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.body), ["workspace_root", "active_file", "selected_text", "recent_diagnostics"]);
});

test("handoff streams a read-only completion and default executor fails closed without a real workspace", async (t) => {
  const server = registerVegaContextProvider(makeVscodeMock(), { port: 0 });
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;

  const readOnly = await new Promise((resolve, reject) => {
    const body = JSON.stringify(makeHandoff({
      run_id: "read-only-run", approved_by_user: false,
      approval_tier: "read_only", mode: "plan_only"
    }));
    http.request({ hostname: "127.0.0.1", port, path: "/api/vega/handoff", method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, (response) => {
      let buffer = "";
      const events = [];
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) if (line) events.push(JSON.parse(line));
      });
      response.on("end", () => resolve({ status: response.statusCode, type: response.headers["content-type"], events }));
    }).on("error", reject).end(body);
  });
  assert.equal(readOnly.status, 200);
  assert.match(readOnly.type, /application\/x-ndjson/);
  assert.deepEqual(readOnly.events.map((event) => event.status), ["running", "completed"]);
  assert.deepEqual(readOnly.events.map((event) => event.seq), [2, 3]);
  assert.deepEqual(readOnly.events[1].changed_files, []);

  const apply = await new Promise((resolve, reject) => {
    const body = JSON.stringify(makeHandoff({ run_id: "missing-executor-run" }));
    http.request({ hostname: "127.0.0.1", port, path: "/api/vega/handoff", method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, (response) => {
      let buffer = "";
      const events = [];
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) if (line) events.push(JSON.parse(line));
      });
      response.on("end", () => resolve({ status: response.statusCode, events }));
    }).on("error", reject).end(body);
  });
  assert.equal(apply.status, 200);
  assert.equal(apply.events.at(-1).status, "failed");
  assert.notEqual(apply.events.at(-1).reason, undefined);
  assert.deepEqual(apply.events.at(-1).changed_files, []);
});

test("handoff cancellation aborts an injected executor and reports a terminal failure", async (t) => {
  const server = registerVegaContextProvider(makeVscodeMock(), {
    port: 0,
    executeHandoff: (_payload, { signal }) => new Promise((resolve) => {
      signal.addEventListener("abort", () => resolve({ ok: false, reason: signal.reason }), { once: true });
    })
  });
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const payload = makeHandoff({ run_id: "cancel-test-run" });
  const stream = startNdjson(port, payload);
  const first = await stream.firstLine;
  assert.equal(first.status, "running");
  const cancelled = await postJson(port, "/api/vega/cancel", { spec_id: payload.spec_id, run_id: payload.run_id });
  assert.equal(cancelled.status, 200);
  const final = await stream.responsePromise;
  assert.equal(final.status, 200);
  assert.equal(final.events.at(-1).status, "failed");
  assert.equal(final.events.at(-1).reason, "cancelled_by_user");
});

test("default receiver applies an approved listed patch and streams checks in order", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vega-receiver-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const target = path.join(root, "sample.js");
  await fs.writeFile(target, "const value = 'before';\n");
  const vscode = {
    workspace: { workspaceFolders: [{ uri: { fsPath: root } }] },
    window: {},
    languages: { getDiagnostics: () => [] }
  };
  const server = registerVegaContextProvider(vscode, { port: 0 });
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const payload = makeHandoff({
    run_id: "real-executor-run",
    readme_spec_markdown: "# Feature Spec: Test\n\n## Target Files & Interfaces\n- `sample.js`",
    ide_context: { workspace_root: root, active_file: "", selected_text: "", recent_diagnostics: [] },
    file_operations: [{ op: "replace", path: "sample.js", search: "before", replace: "after" }]
  });
  const stream = await startNdjson(server.address().port, payload).responsePromise;
  assert.equal(stream.status, 200);
  assert.deepEqual(stream.events.map((event) => event.status), ["running", "running", "running", "completed"]);
  assert.deepEqual(stream.events.map((event) => event.seq), [2, 3, 4, 5]);
  const completed = stream.events.at(-1);
  assert.deepEqual(completed.changed_files, ["sample.js"]);
  assert.equal(completed.rolled_back, false);
  assert.ok(completed.checks.some((check) => check.check === "node --check" && check.status === "passed"));
  assert.equal(await fs.readFile(target, "utf8"), "const value = 'after';\n");
});

