"use strict";

const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const MAX_OPERATIONS = 100;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_CHECK_TIMEOUT_MS = 15_000;
const LOOPBACK_EXECUTOR_HOST = "127.0.0.1";
const SECRET_FILE_NAMES = new Set([
  ".npmrc", ".netrc", "credentials", "credentials.json", "secrets.json", "security.json",
  "token.json", "id_rsa", "id_ed25519", "authorized_keys"
]);

class ExecutorError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ExecutorError";
    this.code = code;
    this.details = details;
  }
}

function redactText(value) {
  let text = typeof value === "string" ? value : String(value == null ? "" : value);
  text = text.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "[REDACTED_TOKEN]");
  text = text.replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[REDACTED_TOKEN]");
  text = text.replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[REDACTED_TOKEN]");
  text = text.replace(/\bgsk_[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_TOKEN]");
  text = text.replace(/\bsk-or-v1-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_TOKEN]");
  text = text.replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_TOKEN]");
  text = text.replace(/([A-Z]:[\\/][^\s"'<>]*?\\\.env(?:\.[^\\/\s"'<>]+)?|(?:^|[\\/])\.env(?:\.[^\\/\s"'<>]+)?)/gi, "[REDACTED_ENV_PATH]");
  text = text.replace(/\b[A-Z]:\\Users\\[^\\\s"'<>]+(?:\\[^\s"'<>]*)?/gi, "[REDACTED_USER_PATH]");
  text = text.replace(/(?<![A-Za-z0-9])\/(?:home|Users)\/[^/\s"'<>]+(?:\/[^\s"'<>]*)?/g, "[REDACTED_USER_PATH]");
  text = text.replace(/\b(api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|passwd|secret|client[_ -]?secret)(\s*[:=]\s*)[^\s,;]+/gi, "$1$2[REDACTED]");
  return text;
}

function fail(code, message, details) {
  throw new ExecutorError(code, message, details);
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function normalizeRelativePath(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 500) {
    fail("invalid_path", "Every operation needs a short relative file path.");
  }
  const raw = value.trim();
  if (path.isAbsolute(raw) || /^[a-z]:/i.test(raw) || raw.startsWith("/") || raw.startsWith("\\\\")) {
    fail("absolute_path_rejected", "Absolute file paths are not allowed.");
  }
  const normalized = raw.replace(/\\/g, "/");
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    fail("path_traversal_rejected", "Relative paths cannot contain empty, dot, or parent segments.");
  }
  const lowered = parts.map((part) => part.toLowerCase());
  const basename = lowered[lowered.length - 1];
  if (lowered.some((part) => part.startsWith(".env") || part === ".git" || part === ".aws" || part === ".ssh")) {
    fail("protected_path_rejected", "Environment and private metadata paths are protected.");
  }
  if (SECRET_FILE_NAMES.has(basename)
      || /(?:secret|credential|password|passwd|token)/i.test(basename)
      || /\.(?:pem|key|pfx|p12|p7b|jks|keystore)$/i.test(basename)) {
    fail("credential_file_rejected", "Credential and private key files are protected.");
  }
  return parts.join("/");
}

function assertPatchTextSafe(value) {
  const text = String(value || "");
  const containsSecret = /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{20,}|gsk_[A-Za-z0-9_-]{20,}|sk-or-v1-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})\b/i.test(text)
    || /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|passwd|client[_ -]?secret)\s*[:=]\s*["']?[^\s"',;]{8,}/i.test(text)
    || /\b[A-Z]:\\Users\\[^\\\s"'<>]+/i.test(text)
    || /(?<![A-Za-z0-9])\/(?:home|Users)\/[^/\s"'<>]+/i.test(text);
  if (containsSecret) fail("sensitive_patch_rejected", "Patch text contains a token, credential value, or personal home path.");
}

function extractTargetFiles(markdown) {
  if (typeof markdown !== "string") return [];
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+Target Files\s*&\s*Interfaces\s*$/i.test(line.trim()));
  if (start < 0) return [];
  const targets = new Set();
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (/^##\s+/.test(line)) break;
    const item = line.match(/^[-*]\s+(.+)$/);
    if (!item) continue;
    let target = item[1].trim();
    const codePath = target.match(/^`([^`]+)`(?:\s*(?:—|\-|:).*)?$/);
    if (codePath) target = codePath[1].trim();
    else target = target.split(/\s+(?:—|–)\s+/, 1)[0].trim();
    try {
      targets.add(normalizeRelativePath(target).toLowerCase());
    } catch (_) {
      // Invalid or descriptive bullets never expand the approved path set.
    }
  }
  return [...targets];
}

function normalizeOperation(operation, allowedTargets) {
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
    fail("invalid_operation", "Each file operation must be an object.");
  }
  const op = typeof operation.op === "string" ? operation.op.toLowerCase() : "";
  if (!["replace", "insert", "create", "patch"].includes(op)) {
    fail("unsupported_operation", "Supported file operations are replace, insert, create, and patch.");
  }
  const relativePath = normalizeRelativePath(operation.path);
  if (!allowedTargets.has(relativePath.toLowerCase())) {
    fail("target_not_approved", "The file is not listed in the approved Target Files section.", { target: relativePath });
  }
  if (op === "create") {
    if (typeof operation.content !== "string") fail("invalid_operation", "Create operations need text content.");
    assertPatchTextSafe(operation.content);
    return { op, path: relativePath, content: operation.content };
  }
  if (op === "replace" || op === "insert") {
    const search = typeof operation.search === "string" ? operation.search : "";
    const replacement = typeof operation.replace === "string" ? operation.replace : "";
    if (!search) fail("invalid_operation", `${op} operations need a non-empty search string.`);
    assertPatchTextSafe(search);
    assertPatchTextSafe(replacement);
    const expectedMatches = operation.expectedMatches === undefined ? 1 : operation.expectedMatches;
    if (!Number.isInteger(expectedMatches) || expectedMatches < 1 || expectedMatches > 1000) {
      fail("invalid_operation", "expectedMatches must be an integer from 1 to 1000.");
    }
    const position = operation.position === undefined ? "after" : operation.position;
    if (op === "insert" && !["before", "after"].includes(position)) {
      fail("invalid_operation", "Insert position must be before or after.");
    }
    if (op === "insert" && expectedMatches !== 1) {
      fail("invalid_operation", "Insert operations must use exactly one anchor match.");
    }
    return { op, path: relativePath, search, replace: replacement, expectedMatches, position };
  }
  if (!Array.isArray(operation.changes) || operation.changes.length < 1 || operation.changes.length > MAX_OPERATIONS) {
    fail("invalid_operation", "Patch operations need a bounded, non-empty changes array.");
  }
  const changes = operation.changes.map((change) => {
    if (!change || typeof change !== "object" || Array.isArray(change)
        || typeof change.search !== "string" || !change.search
        || typeof change.replace !== "string") {
      fail("invalid_operation", "Each patch change needs search and replace strings.");
    }
    assertPatchTextSafe(change.search);
    assertPatchTextSafe(change.replace);
    const expectedMatches = change.expectedMatches === undefined ? 1 : change.expectedMatches;
    if (!Number.isInteger(expectedMatches) || expectedMatches < 1 || expectedMatches > 1000) {
      fail("invalid_operation", "Patch expectedMatches must be an integer from 1 to 1000.");
    }
    return { search: change.search, replace: change.replace, expectedMatches };
  });
  return { op, path: relativePath, changes };
}

function applyChange(text, change, operationName) {
  let count = 0;
  let index = 0;
  while ((index = text.indexOf(change.search, index)) !== -1) {
    count += 1;
    index += change.search.length;
  }
  if (count !== change.expectedMatches) {
    fail("match_count_mismatch", `${operationName} expected ${change.expectedMatches} match(es), found ${count}.`);
  }
  if (operationName === "insert") {
    const indexOfAnchor = text.indexOf(change.search);
    return change.position === "before"
      ? text.slice(0, indexOfAnchor) + change.replace + text.slice(indexOfAnchor)
      : text.slice(0, indexOfAnchor + change.search.length) + change.replace + text.slice(indexOfAnchor + change.search.length);
  }
  return text.split(change.search).join(change.replace);
}

function parseUtf8(buffer, relativePath) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch (_) {
    fail("binary_file_rejected", `Binary or non-UTF-8 target rejected: ${relativePath}.`);
  }
}

async function resolveWorkspaceRoot(payload, activeWorkspaceRoot) {
  if (typeof activeWorkspaceRoot !== "string" || !activeWorkspaceRoot.trim()) {
    fail("workspace_unavailable", "Open a Vega-IDE workspace before applying edits.");
  }
  const activeRoot = await fs.realpath(activeWorkspaceRoot);
  const contextRoot = payload && payload.ide_context && payload.ide_context.workspace_root;
  if (typeof contextRoot !== "string" || !contextRoot.trim() || contextRoot.startsWith("[REDACTED_")) {
    fail("workspace_context_unavailable", "The reviewed IDE workspace root is unavailable or redacted.");
  }
  const reviewedRoot = await fs.realpath(contextRoot);
  if (path.resolve(activeRoot).toLowerCase() !== path.resolve(reviewedRoot).toLowerCase()) {
    fail("workspace_mismatch", "The reviewed workspace does not match the active Vega-IDE workspace.");
  }
  const stat = await fs.stat(activeRoot);
  if (!stat.isDirectory()) fail("workspace_invalid", "The active workspace root is not a directory.");
  return activeRoot;
}

async function resolveTarget(root, relativePath, allowMissing = false) {
  const segments = relativePath.split("/");
  const absolutePath = path.resolve(root, ...segments);
  if (!isInside(root, absolutePath) || absolutePath === root) {
    fail("path_traversal_rejected", "Resolved file path escaped the active workspace.");
  }
  let current = root;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) fail("symlink_rejected", "Symbolic links are not editable through the handoff bridge.");
      const isFinal = index === segments.length - 1;
      if (!isFinal && !stat.isDirectory()) fail("invalid_parent", "Every target parent must be an existing directory.");
      if (isFinal && !stat.isFile()) fail("non_file_target", "Only regular text files may be edited.");
    } catch (error) {
      if (error && error.code === "ENOENT" && allowMissing && index === segments.length - 1) break;
      if (error instanceof ExecutorError) throw error;
      if (error && error.code === "ENOENT") fail("target_not_found", "The target or its parent directory does not exist.");
      throw error;
    }
  }
  const parentRealPath = await fs.realpath(path.dirname(absolutePath));
  if (!isInside(root, parentRealPath)) fail("path_traversal_rejected", "Target parent resolves outside the active workspace.");
  return absolutePath;
}

function validateExecutorUrl(value) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch (_) {
    fail("executor_url_invalid", "VEGA_IDE_EXECUTOR_URL must be a loopback HTTP URL.");
  }
  if (url.protocol !== "http:" || url.hostname !== LOOPBACK_EXECUTOR_HOST || !url.port
      || url.username || url.password || url.search || url.hash) {
    fail("executor_url_invalid", "Only an explicit 127.0.0.1 HTTP executor URL is allowed.");
  }
  return url;
}

function fetchExternalOperations(url, payload, allowedTargetPaths, signal, timeoutMs) {
  const body = JSON.stringify({
    schema_version: payload.schema_version,
    spec_id: payload.spec_id,
    title: payload.title,
    readme_spec_markdown: payload.readme_spec_markdown,
    ide_context: payload.ide_context,
    constraints: payload.constraints,
    allowed_target_files: allowedTargetPaths
  });
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(value);
    };
    const request = http.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "Accept": "application/json"
      },
      timeout: timeoutMs
    }, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_RESPONSE_BYTES) {
          request.destroy(new ExecutorError("executor_response_too_large", "External executor response exceeded the size limit."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        if (response.statusCode !== 200) {
          finish(new ExecutorError("external_executor_rejected", `External executor returned HTTP ${response.statusCode}.`));
          return;
        }
        try {
          const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (!result || !Array.isArray(result.file_operations)) {
            fail("external_executor_invalid", "External executor must return a file_operations array.");
          }
          finish(null, result.file_operations);
        } catch (error) {
          finish(error instanceof ExecutorError ? error : new ExecutorError("external_executor_invalid", "External executor returned invalid JSON."));
        }
      });
    });
    request.on("error", (error) => finish(error instanceof ExecutorError ? error : new ExecutorError("external_executor_unavailable", "The configured loopback executor is unavailable.")));
    request.on("timeout", () => request.destroy(new ExecutorError("external_executor_timeout", "The configured loopback executor timed out.")));
    const onAbort = () => request.destroy(new ExecutorError("cancelled_by_user", "The handoff was cancelled."));
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener("abort", onAbort, { once: true });
    }
    request.end(body);
  });
}

function parseExternalCommand(value) {
  if (!value) return null;
  let command;
  try {
    command = JSON.parse(value);
  } catch (_) {
    fail("executor_command_invalid", "VEGA_IDE_EXECUTOR_CMD must be a JSON array of executable and arguments.");
  }
  if (!Array.isArray(command) || command.length < 1 || command.length > 32
      || command.some((part) => typeof part !== "string" || !part || part.length > 2000)) {
    fail("executor_command_invalid", "VEGA_IDE_EXECUTOR_CMD must be a bounded JSON string array.");
  }
  return command;
}

function runExternalCommand(command, payload, signal, timeoutMs) {
  const body = JSON.stringify({
    schema_version: payload.schema_version,
    spec_id: payload.spec_id,
    title: payload.title,
    readme_spec_markdown: payload.readme_spec_markdown,
    ide_context: payload.ide_context,
    constraints: payload.constraints,
    allowed_target_files: extractTargetFiles(payload.readme_spec_markdown)
  });
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(new ExecutorError("cancelled_by_user", "The handoff was cancelled."));
      return;
    }
    const child = spawn(command[0], command.slice(1), {
      cwd: payload.ide_context.workspace_root,
      env: process.env,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let output = Buffer.alloc(0);
    let diagnostics = "";
    let settled = false;
    let timedOut = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(value);
    };
    const onAbort = () => child.kill();
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (chunk) => {
      if (output.length + chunk.length > MAX_RESPONSE_BYTES) {
        child.kill();
        finish(new ExecutorError("executor_response_too_large", "External executor response exceeded the size limit."));
      } else output = Buffer.concat([output, chunk]);
    });
    child.stderr.on("data", (chunk) => { diagnostics = (diagnostics + chunk.toString("utf8")).slice(-4000); });
    child.on("error", (error) => finish(new ExecutorError(
      error && error.code === "ENOENT" ? "executor_command_unavailable" : "executor_command_failed",
      "Could not start the configured edit generator."
    )));
    child.on("close", (code) => {
      if (settled) return;
      if (signal && signal.aborted) {
        finish(new ExecutorError(signal.reason === "timeout" ? "timeout" : "cancelled_by_user", "The handoff was cancelled."));
      } else if (timedOut) {
        finish(new ExecutorError("external_executor_timeout", "The configured edit generator timed out."));
      } else if (code !== 0) {
        finish(new ExecutorError("external_executor_failed", "The configured edit generator failed.", { output: redactText(diagnostics).slice(-2000) }));
      } else {
        try {
          const result = JSON.parse(output.toString("utf8"));
          if (!result || !Array.isArray(result.file_operations)) {
            fail("external_executor_invalid", "External executor must return a file_operations array.");
          }
          finish(null, result.file_operations);
        } catch (error) {
          finish(error instanceof ExecutorError ? error : new ExecutorError("external_executor_invalid", "External executor returned invalid JSON."));
        }
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(body);
  });
}

async function buildChangeSet(root, payload, operations, signal) {
  if (!Array.isArray(operations) || operations.length < 1 || operations.length > MAX_OPERATIONS) {
    fail("file_operations_required", "Provide 1 to 100 reviewed file operations before applying edits.");
  }
  const allowedTargetPaths = new Set(extractTargetFiles(payload.readme_spec_markdown));
  if (!allowedTargetPaths.size) fail("target_files_required", "The approved spec must list target files explicitly.");
  const normalized = operations.map((operation) => normalizeOperation(operation, allowedTargetPaths));
  const changes = new Map();
  for (const operation of normalized) {
    if (signal && signal.aborted) fail(signal.reason === "timeout" ? "timeout" : "cancelled_by_user", "The handoff was cancelled.");
    const existingChange = changes.get(operation.path);
    let absolutePath;
    if (existingChange) {
      absolutePath = existingChange.absolutePath;
    } else {
      absolutePath = await resolveTarget(root, operation.path, operation.op === "create");
    }
    if (operation.op === "create") {
      if (existingChange || await fileExists(absolutePath)) fail("create_target_exists", "Create operations cannot overwrite an existing file.");
      if (Buffer.byteLength(operation.content, "utf8") > MAX_FILE_BYTES) fail("file_too_large", "New file exceeds the edit size limit.");
      changes.set(operation.path, {
        relativePath: operation.path,
        absolutePath,
        original: null,
        originalMode: null,
        nextText: operation.content
      });
      continue;
    }
    let change = existingChange;
    if (!change) {
      const stat = await fs.stat(absolutePath);
      if (stat.size > MAX_FILE_BYTES) fail("file_too_large", "Target file exceeds the edit size limit.");
      const original = await fs.readFile(absolutePath);
      change = {
        relativePath: operation.path,
        absolutePath,
        original,
        originalMode: stat.mode,
        nextText: parseUtf8(original, operation.path)
      };
      changes.set(operation.path, change);
    }
    if (operation.op === "replace") {
      change.nextText = applyChange(change.nextText, operation, "replace");
    } else if (operation.op === "insert") {
      change.nextText = applyChange(change.nextText, operation, "insert");
    } else {
      for (const patch of operation.changes) change.nextText = applyChange(change.nextText, patch, "patch");
    }
    if (Buffer.byteLength(change.nextText, "utf8") > MAX_FILE_BYTES) fail("file_too_large", "Edited file exceeds the size limit.");
  }
  return [...changes.values()].map((change) => ({ ...change, next: Buffer.from(change.nextText, "utf8") }));
}

async function fileExists(filePath) {
  try {
    await fs.lstat(filePath);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function atomicReplace(filePath, content, mode) {
  const directory = path.dirname(filePath);
  const temporary = path.join(directory, `.vega-${crypto.randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, content, { flag: "wx", mode: mode || 0o600 });
    await fs.rename(temporary, filePath);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function rollbackChanges(changes) {
  const errors = [];
  for (const change of [...changes].reverse()) {
    try {
      if (change.original === null) await fs.rm(change.absolutePath, { force: true });
      else await atomicReplace(change.absolutePath, change.original, change.originalMode);
    } catch (_) {
      errors.push(change.relativePath);
    }
  }
  return { rolledBack: errors.length === 0, errors };
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    if (options.signal && options.signal.aborted) {
      reject(new ExecutorError("cancelled_by_user", "The handoff was cancelled."));
      return;
    }
    let child;
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env || process.env,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (_) {
      reject(new ExecutorError("check_start_failed", "Could not start a post-edit verification check."));
      return;
    }
    let output = "";
    let settled = false;
    let timedOut = false;
    const append = (chunk) => { output = (output + chunk.toString("utf8")).slice(-16_000); };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs || DEFAULT_CHECK_TIMEOUT_MS);
    const onAbort = () => child.kill();
    if (options.signal) options.signal.addEventListener("abort", onAbort, { once: true });
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (options.signal) options.signal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(value);
    };
    child.on("error", (error) => {
      if (error && error.code === "ENOENT") finish(new ExecutorError("check_unavailable", "A required syntax checker is unavailable."));
      else finish(new ExecutorError("check_start_failed", "Could not start a post-edit verification check."));
    });
    child.on("close", (code) => {
      if (options.signal && options.signal.aborted) {
        finish(new ExecutorError(options.signal.reason === "timeout" ? "timeout" : "cancelled_by_user", "The handoff was cancelled during verification."));
      } else if (timedOut) {
        finish(new ExecutorError("verification_timeout", "A post-edit verification check timed out."));
      } else if (code !== 0) {
        finish(new ExecutorError("verification_failed", "A post-edit verification check failed.", { output: redactText(output).slice(-2000) }));
      } else {
        finish(null, { command, code, output: redactText(output).slice(-2000) });
      }
    });
  });
}

async function verifyChangeSet(root, changes, signal, options = {}) {
  const checks = [];
  for (const change of changes) {
    if (signal && signal.aborted) fail(signal.reason === "timeout" ? "timeout" : "cancelled_by_user", "The handoff was cancelled during verification.");
    const written = await fs.readFile(change.absolutePath);
    if (!written.equals(change.next)) fail("content_verification_failed", "A changed file did not match the approved patch.");
    checks.push({ file: change.relativePath, check: "content_match", status: "passed" });
    if (change.relativePath.toLowerCase().endsWith(".js")) {
      const result = await runCommand(process.execPath, ["--check", change.absolutePath], {
        cwd: root, signal, timeoutMs: options.checkTimeoutMs
      });
      checks.push({ file: change.relativePath, check: "node --check", status: "passed", exit_code: result.code });
    } else if (change.relativePath.toLowerCase().endsWith(".py")) {
      const cachePrefix = await fs.mkdtemp(path.join(os.tmpdir(), "vega-pycache-"));
      const env = { ...process.env, PYTHONPYCACHEPREFIX: cachePrefix };
      const python = process.env.VEGA_PYTHON || "python";
      try {
        const result = await runCommand(python, ["-m", "py_compile", change.absolutePath], {
          cwd: root, env, signal, timeoutMs: options.checkTimeoutMs
        });
        checks.push({ file: change.relativePath, check: "python -m py_compile", status: "passed", exit_code: result.code });
      } finally {
        const resolvedCache = path.resolve(cachePrefix);
        const resolvedTemp = path.resolve(os.tmpdir());
        if (isInside(resolvedTemp, resolvedCache) && path.basename(resolvedCache).startsWith("vega-pycache-")) {
          await fs.rm(resolvedCache, { recursive: true, force: true });
        }
      }
    }
  }
  return checks;
}

async function executeApprovedHandoff(payload, options = {}) {
  let root;
  let changes = [];
  let written = [];
  const checks = [];
  try {
    if (!payload || payload.approved_by_user !== true || !payload.constraints
        || payload.constraints.stay_within_scope !== true
        || payload.approval_tier !== "apply_edits" || payload.mode !== "plan_and_apply") {
      fail("explicit_approval_required", "Explicit approval and stay-within-scope constraints are required.");
    }
    if (options.signal && options.signal.aborted) fail(options.signal.reason === "timeout" ? "timeout" : "cancelled_by_user", "The handoff was cancelled.");
    root = await resolveWorkspaceRoot(payload, options.workspaceRoot);
    const allowedTargetPaths = extractTargetFiles(payload.readme_spec_markdown);
    if (!allowedTargetPaths.length) fail("target_files_required", "The approved spec must list target files explicitly.");
    let operations = Array.isArray(payload.file_operations) ? payload.file_operations : [];
    if (!operations.length) {
      const command = parseExternalCommand(process.env.VEGA_IDE_EXECUTOR_CMD);
      if (command) {
        operations = await runExternalCommand(command, payload, options.signal, options.externalTimeoutMs || 30_000);
      } else {
        const url = validateExecutorUrl(process.env.VEGA_IDE_EXECUTOR_URL);
        if (url) operations = await fetchExternalOperations(
          url, payload, allowedTargetPaths, options.signal, options.externalTimeoutMs || 30_000
        );
      }
    }
    if (typeof options.reportProgress === "function") options.reportProgress("Validating approved target files and patch operations.");
    changes = await buildChangeSet(root, payload, operations, options.signal);
    for (const change of changes) {
      const current = await fileExists(change.absolutePath) ? await fs.readFile(change.absolutePath) : null;
      if (change.original === null ? current !== null : current === null || !current.equals(change.original)) {
        fail("target_changed", "A target file changed after the patch was prepared.", { target: change.relativePath });
      }
      await resolveTarget(root, change.relativePath, change.original === null);
    }
    if (options.signal && options.signal.aborted) fail(options.signal.reason === "timeout" ? "timeout" : "cancelled_by_user", "The handoff was cancelled before writing.");
    for (const change of changes) {
      if (options.signal && options.signal.aborted) fail(options.signal.reason === "timeout" ? "timeout" : "cancelled_by_user", "The handoff was cancelled during writing.");
      if (change.original === null) {
        const handle = await fs.open(change.absolutePath, "wx", 0o600);
        written.push(change);
        try { await handle.writeFile(change.next); } finally { await handle.close(); }
      } else {
        written.push(change);
        await atomicReplace(change.absolutePath, change.next, change.originalMode);
      }
    }
    if (typeof options.reportProgress === "function") options.reportProgress("Verifying changed files and syntax.");
    if (options.signal && options.signal.aborted) fail(options.signal.reason === "timeout" ? "timeout" : "cancelled_by_user", "The handoff was cancelled during verification.");
    const verified = await verifyChangeSet(root, changes, options.signal, options);
    checks.push(...verified);
    if (options.signal && options.signal.aborted) fail(options.signal.reason === "timeout" ? "timeout" : "cancelled_by_user", "The handoff was cancelled after verification.");
    return {
      ok: true,
      status: "completed",
      changed_files: changes.map((change) => change.relativePath),
      checks,
      rolled_back: false,
      summary_text: `Applied and verified ${changes.length} approved file change(s).`,
      check_summary: `${checks.length} post-edit check(s) passed.`
    };
  } catch (error) {
    const code = error instanceof ExecutorError ? error.code : "executor_failed";
    if (error instanceof ExecutorError && error.details && error.details.output) {
      checks.push({ check: code, status: "failed", diagnostic: redactText(error.details.output).slice(-2000) });
    }
    let rolledBack = false;
    let rollbackErrors = [];
    if (written.length) {
      const rollback = await rollbackChanges(written);
      rolledBack = rollback.rolledBack;
      rollbackErrors = rollback.errors;
      if (rollbackErrors.length) checks.push({ check: "rollback", status: "failed", files: rollbackErrors });
      else checks.push({ check: "rollback", status: "passed" });
    }
    const summary = rolledBack
      ? "Verification failed; all changed files were restored."
      : written.length && !rolledBack
        ? "Handoff failed and rollback needs attention."
        : redactText(error && error.message || "Vega-IDE rejected the edit plan safely.");
    return {
      ok: false,
      status: "failed",
      reason: code,
      changed_files: [],
      attempted_files: written.map((change) => change.relativePath),
      checks,
      rolled_back: rolledBack,
      rollback_errors: rollbackErrors,
      summary_text: summary.slice(0, 500),
      check_summary: checks.length ? `${checks.filter((check) => check.status === "passed").length} check(s) passed; ${checks.filter((check) => check.status === "failed").length} failed.` : "No files were written."
    };
  }
}

module.exports = {
  ExecutorError,
  executeApprovedHandoff,
  extractTargetFiles,
  normalizeRelativePath,
  validateExecutorUrl
};
