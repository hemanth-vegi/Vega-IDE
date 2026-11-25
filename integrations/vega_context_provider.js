"use strict";

const http = require("node:http");
const path = require("node:path");

const CONTEXT_PATH = "/api/vega/context";
const HANDOFF_PATH = "/api/vega/handoff";
const CANCEL_PATH = "/api/vega/cancel";
const DEFAULT_PORT = 47640;
const MAX_DIAGNOSTICS_BYTES = 4096;
const MAX_HANDOFF_BYTES = 512 * 1024;
const HANDOFF_TIMEOUT_MS = 5 * 60 * 1000;
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

let activeServer = null;

function bridgeEnabled(env = process.env) {
  return ["1", "true", "yes", "on"].includes(String(env.VEGA_IDE_BRIDGE_ENABLED || "0").trim().toLowerCase());
}

function redactSensitiveText(value) {
  let text = typeof value === "string" ? value : String(value == null ? "" : value);
  text = text.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "[REDACTED_TOKEN]");
  text = text.replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[REDACTED_TOKEN]");
  text = text.replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[REDACTED_TOKEN]");
  text = text.replace(/\bgsk_[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_TOKEN]");
  text = text.replace(/\bsk-or-v1-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_TOKEN]");
  text = text.replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_TOKEN]");
  text = text.replace(/^\s*[A-Za-z_][A-Za-z0-9_.-]*\s*=\s*[^\r\n]*$/gim, "[REDACTED_ENV_LINE]");
  text = text.replace(/([A-Z]:[\\/][^\s"'<>]*?\\\.env(?:\.[^\\/\s"'<>]+)?|(?:^|[\\/])\.env(?:\.[^\\/\s"'<>]+)?)/gi, "[REDACTED_ENV_PATH]");
  text = text.replace(/\b[A-Z]:\\Users\\[^\\\s"'<>]+(?:\\[^\s"'<>]*)?/gi, "[REDACTED_USER_PATH]");
  text = text.replace(/(?<![A-Za-z0-9])\/(?:home|Users)\/[^/\s"'<>]+(?:\/[^\s"'<>]*)?/g, "[REDACTED_USER_PATH]");
  text = text.replace(/\b(api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|passwd|secret|client[_ -]?secret)(\s*[:=]\s*)[^\s,;]+/gi, "$1$2[REDACTED]");
  return text;
}

function isEnvironmentFile(filePath) {
  return path.basename(String(filePath || "")).toLowerCase().startsWith(".env");
}

function safeDiagnostics(vscode, uri) {
  let diagnostics = [];
  try {
    diagnostics = uri && vscode.languages && typeof vscode.languages.getDiagnostics === "function"
      ? vscode.languages.getDiagnostics(uri)
      : [];
  } catch (_) {
    diagnostics = [];
  }
  const result = [];
  for (const diagnostic of Array.isArray(diagnostics) ? diagnostics.slice(0, 100) : []) {
    const range = diagnostic && diagnostic.range;
    const item = {
      message: redactSensitiveText(diagnostic && diagnostic.message).slice(0, 1000),
      severity: Number.isInteger(diagnostic && diagnostic.severity) ? diagnostic.severity : null,
      source: redactSensitiveText(diagnostic && diagnostic.source).slice(0, 120),
      range: range && range.start && range.end ? {
        start: { line: range.start.line, character: range.start.character },
        end: { line: range.end.line, character: range.end.character }
      } : null
    };
    const candidate = result.concat(item);
    if (Buffer.byteLength(JSON.stringify(candidate), "utf8") > MAX_DIAGNOSTICS_BYTES) break;
    result.push(item);
  }
  return result;
}

function getVegaContext(vscode) {
  const context = {
    workspace_root: "",
    active_file: "",
    selected_text: "",
    recent_diagnostics: []
  };
  try {
    const folder = vscode.workspace && Array.isArray(vscode.workspace.workspaceFolders)
      ? vscode.workspace.workspaceFolders[0]
      : null;
    const workspaceRoot = folder && folder.uri && folder.uri.fsPath;
    context.workspace_root = redactSensitiveText(workspaceRoot || "");

    const editor = vscode.window && vscode.window.activeTextEditor;
    if (!editor || !editor.document) return context;
    const filePath = editor.document.uri && editor.document.uri.fsPath || "";
    context.active_file = isEnvironmentFile(filePath)
      ? "[REDACTED_ENV_PATH]"
      : redactSensitiveText(filePath);
    if (!isEnvironmentFile(filePath) && typeof editor.document.getText === "function") {
      context.selected_text = redactSensitiveText(editor.document.getText(editor.selection).slice(0, 4096));
    }
    context.recent_diagnostics = safeDiagnostics(vscode, editor.document.uri);
  } catch (_) {
    return context;
  }
  return context;
}

function isLoopbackRequest(request, port) {
  const remoteAddress = request.socket && request.socket.remoteAddress || "";
  if (!LOOPBACK_ADDRESSES.has(remoteAddress)) return false;
  const hostHeader = String(request.headers.host || "").toLowerCase();
  const separator = hostHeader.lastIndexOf(":");
  const hostname = separator >= 0 ? hostHeader.slice(0, separator) : hostHeader;
  const hostPort = separator >= 0 ? Number(hostHeader.slice(separator + 1)) : port;
  if (!LOOPBACK_HOSTS.has(hostname) || hostPort !== port) return false;
  const origin = request.headers.origin;
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.protocol !== "http:" || !LOOPBACK_HOSTS.has(originUrl.hostname.toLowerCase())
          || originUrl.host.toLowerCase() !== hostHeader) return false;
    } catch (_) {
      return false;
    }
  }
  return true;
}

function resolvePort(options = {}, env = process.env) {
  if (options.port === 0) return 0;
  const candidate = Number(options.port || env.VEGA_IDE_PORT || DEFAULT_PORT);
  return Number.isInteger(candidate) && candidate >= 1024 && candidate <= 65535 ? candidate : DEFAULT_PORT;
}

function readJsonBody(request, maxBytes = MAX_HANDOFF_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        const error = new Error("request_too_large");
        error.statusCode = 413;
        reject(error);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("error", reject);
    request.on("end", () => {
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_json_object");
        resolve(value);
      } catch (_) {
        const error = new Error("invalid_json");
        error.statusCode = 400;
        reject(error);
      }
    });
  });
}

function validHandoff(payload) {
  return !!payload
    && payload.schema_version === "1.0"
    && typeof payload.spec_id === "string" && payload.spec_id.trim().length > 0
    && typeof payload.run_id === "string" && payload.run_id.trim().length > 0
    && Number.isInteger(payload.seq) && payload.seq >= 1
    && typeof payload.readme_spec_markdown === "string" && payload.readme_spec_markdown.trim().length > 0
    && ["read_only", "apply_edits"].includes(payload.approval_tier)
    && ["plan_only", "plan_and_apply"].includes(payload.mode)
    && payload.constraints && payload.constraints.stay_within_scope === true
    && payload.constraints.require_approval_for_destructive_ops === true
    && !(payload.approval_tier === "read_only" && payload.mode !== "plan_only");
}

function sendJson(response, statusCode, body) {
  if (response.writableEnded || response.destroyed) return;
  const serialized = JSON.stringify(body);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(serialized, "utf8"),
    "Cache-Control": "no-store"
  });
  response.end(serialized);
}

function safeRunSummary(value) {
  return redactSensitiveText(typeof value === "string" ? value : "").slice(0, 2000);
}

function safeChangedFiles(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string").slice(0, 100).map((item) => redactSensitiveText(item).slice(0, 500))
    : [];
}

function safeChecks(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((check) => {
    if (!check || typeof check !== "object" || Array.isArray(check)) return null;
    const safe = {};
    for (const key of ["file", "check", "status", "diagnostic"]) {
      if (typeof check[key] === "string") safe[key] = redactSensitiveText(check[key]).slice(0, 2000);
    }
    if (Number.isInteger(check.exit_code)) safe.exit_code = check.exit_code;
    if (Array.isArray(check.files)) safe.files = safeChangedFiles(check.files);
    return safe;
  }).filter(Boolean);
}

async function handleHandoff(request, response, options, activeRuns, seenRuns) {
  let payload;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    sendJson(response, error.statusCode || 400, { ok: false, reason: error.message || "invalid_request" });
    return;
  }
  if (!validHandoff(payload)) {
    sendJson(response, 400, { ok: false, reason: "invalid_handoff" });
    return;
  }
  const readOnlyDryRun = payload.approval_tier === "read_only" && payload.mode === "plan_only";
  if (!readOnlyDryRun && (payload.approved_by_user !== true
      || payload.approval_tier !== "apply_edits" || payload.mode !== "plan_and_apply")) {
    sendJson(response, 403, { ok: false, reason: "explicit_approval_required" });
    return;
  }
  if (seenRuns.has(payload.run_id)) {
    sendJson(response, 409, { ok: false, reason: "duplicate_run_id" });
    return;
  }
  seenRuns.add(payload.run_id);
  while (seenRuns.size > 1000) seenRuns.delete(seenRuns.values().next().value);

  const controller = new AbortController();
  const state = { specId: payload.spec_id, controller, response, seq: payload.seq };
  activeRuns.set(payload.run_id, state);
  response.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Connection": "keep-alive"
  });
  const emit = (status, fields = {}) => {
    if (response.writableEnded || response.destroyed) return;
    const event = {
      spec_id: payload.spec_id,
      run_id: payload.run_id,
      seq: ++state.seq,
      status,
      changed_files: [],
      checks: [],
      rolled_back: false,
      ...fields
    };
    response.write(`${JSON.stringify(event)}\n`);
  };
  const onClose = () => {
    if (!response.writableEnded && !controller.signal.aborted) controller.abort("client_disconnected");
  };
  response.on("close", onClose);
  emit("running", { summary_text: "Vega-IDE accepted the approved handoff.", changed_files: [] });

  let timeout;
  try {
    if (readOnlyDryRun) {
      emit("completed", {
        summary_text: "Read-only handoff completed; no files changed.",
        check_summary: "Plan received and protocol verified.",
        changed_files: []
      });
      return;
    }
    if (typeof options.executeHandoff !== "function") {
      emit("failed", {
        reason: "executor_unavailable",
        summary_text: "Vega-IDE edit executor is unavailable; no files were changed.",
        changed_files: [],
        checks: [],
        rolled_back: false
      });
      return;
    }

    timeout = setTimeout(() => {
      controller.abort("timeout");
    }, HANDOFF_TIMEOUT_MS);
    const executionPromise = Promise.resolve(options.executeHandoff(payload, {
      signal: controller.signal,
      reportProgress: (summary) => emit("running", { summary_text: safeRunSummary(summary), changed_files: [] })
    }));
    const result = await executionPromise;
    if (!result || result.ok !== true) {
      emit("failed", {
        reason: safeRunSummary(result && result.reason || "executor_failed") || "executor_failed",
        summary_text: safeRunSummary(result && result.summary_text || "Vega-IDE could not apply this handoff."),
        check_summary: safeRunSummary(result && result.check_summary || ""),
        changed_files: safeChangedFiles(result && result.changed_files),
        attempted_files: safeChangedFiles(result && result.attempted_files),
        checks: safeChecks(result && result.checks),
        rolled_back: result && result.rolled_back === true
      });
      return;
    }
    emit("completed", {
      summary_text: safeRunSummary(result.summary_text || "Approved handoff completed."),
      check_summary: safeRunSummary(result.check_summary || ""),
      changed_files: safeChangedFiles(result.changed_files),
      checks: safeChecks(result.checks),
      rolled_back: false
    });
  } catch (error) {
    const cancelled = controller.signal.aborted && controller.signal.reason !== "timeout";
    emit("failed", {
      reason: controller.signal.reason === "timeout" ? "timeout" : cancelled ? "cancelled_by_user" : "executor_failed",
      summary_text: controller.signal.reason === "timeout" ? "Handoff timed out and rollback completed." : cancelled ? "Handoff cancelled and rollback completed." : "Vega-IDE executor failed safely.",
      changed_files: [],
      checks: [],
      rolled_back: false
    });
  } finally {
    if (timeout) clearTimeout(timeout);
    response.removeListener("close", onClose);
    if (!response.writableEnded && !response.destroyed) response.end();
    activeRuns.delete(payload.run_id);
  }
}

async function handleCancel(request, response, activeRuns) {
  let payload;
  try {
    payload = await readJsonBody(request, 16 * 1024);
  } catch (error) {
    sendJson(response, error.statusCode || 400, { ok: false, reason: error.message || "invalid_request" });
    return;
  }
  const state = typeof payload.run_id === "string" ? activeRuns.get(payload.run_id) : null;
  if (!state || state.specId !== payload.spec_id) {
    sendJson(response, 404, { ok: false, reason: "run_not_found" });
    return;
  }
  state.controller.abort("cancelled_by_user");
  sendJson(response, 200, { ok: true, spec_id: state.specId, run_id: payload.run_id, status: "cancelling" });
}

function registerVegaContextProvider(vscode, options = {}) {
  const port = resolvePort(options, options.env || process.env);
  let executeHandoff = options.executeHandoff;
  if (typeof executeHandoff !== "function") {
    executeHandoff = (payload, runOptions) => {
      const activeRoot = options.workspaceRoot || vscode.workspace && Array.isArray(vscode.workspace.workspaceFolders)
        && vscode.workspace.workspaceFolders[0] && vscode.workspace.workspaceFolders[0].uri
        && vscode.workspace.workspaceFolders[0].uri.fsPath;
      return require("./vega_edit_executor.js").executeApprovedHandoff(payload, {
        ...runOptions,
        workspaceRoot: typeof activeRoot === "string" ? activeRoot : ""
      });
    };
  }
  const receiverOptions = { ...options, executeHandoff };
  const activeRuns = new Map();
  const seenRuns = new Set();
  const server = http.createServer((request, response) => {
    if (!isLoopbackRequest(request, server.address() && server.address().port || port)) {
      response.writeHead(403, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ error: "forbidden" }));
      return;
    }
    if (request.method === "GET" && request.url === CONTEXT_PATH) {
      const context = getVegaContext(vscode);
      const body = JSON.stringify(context);
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body, "utf8"),
        "Cache-Control": "no-store"
      });
      response.end(body);
      return;
    }
    if (request.method === "POST" && request.url === HANDOFF_PATH) {
      handleHandoff(request, response, receiverOptions, activeRuns, seenRuns).catch(() => {
        sendJson(response, 500, { ok: false, reason: "receiver_error" });
      });
      return;
    }
    if (request.method === "POST" && request.url === CANCEL_PATH) {
      handleCancel(request, response, activeRuns).catch(() => {
        sendJson(response, 500, { ok: false, reason: "receiver_error" });
      });
      return;
    }
    {
      response.writeHead(404, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ error: "not_found" }));
    }
  });
  server.on("error", () => {});
  server.listen(port, "127.0.0.1");
  return server;
}

function activate(context) {
  if (!bridgeEnabled()) return undefined;
  let vscode;
  try {
    vscode = require("vscode");
  } catch (_) {
    return undefined;
  }
  activeServer = registerVegaContextProvider(vscode);
  const disposable = {
    dispose() {
      if (activeServer && activeServer.listening) activeServer.close();
      activeServer = null;
    }
  };
  if (context && Array.isArray(context.subscriptions)) context.subscriptions.push(disposable);
  return disposable;
}

function deactivate() {
  if (activeServer && activeServer.listening) activeServer.close();
  activeServer = null;
}

module.exports = {
  activate,
  bridgeEnabled,
  deactivate,
  getVegaContext,
  handleCancel,
  handleHandoff,
  redactSensitiveText,
  registerVegaContextProvider,
  resolvePort,
  validHandoff
};

