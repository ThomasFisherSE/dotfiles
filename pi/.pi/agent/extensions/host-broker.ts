import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const socketPath = process.env.PI_HOST_BROKER_SOCKET || "/run/pi-host-broker.sock";
const approvalsPath = path.join(os.homedir(), ".pi", "agent", "host-broker-approvals.json");

type BrokerResponse<T = unknown> =
  | { ok: true; result: T }
  | { ok: false; error: string };

function brokerRequest<T>(request: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let data = "";
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      fn();
    };

    const onAbort = () => finish(() => reject(new Error("Host broker request aborted")));
    signal?.addEventListener("abort", onAbort, { once: true });

    socket.setEncoding("utf8");
    socket.setTimeout(5 * 60 * 1000, () => finish(() => reject(new Error("Host broker request timed out"))));
    socket.on("connect", () => socket.write(JSON.stringify(request) + "\n"));
    socket.on("data", (chunk) => {
      data += chunk;
    });
    socket.on("end", () => {
      signal?.removeEventListener("abort", onAbort);
      finish(() => {
        let response: BrokerResponse<T>;
        try {
          response = JSON.parse(data) as BrokerResponse<T>;
        } catch (error) {
          reject(new Error(`Invalid host broker response: ${String(error)}`));
          return;
        }
        if (!response.ok) reject(new Error(response.error));
        else resolve(response.result);
      });
    });
    socket.on("error", (error) => {
      signal?.removeEventListener("abort", onAbort);
      finish(() => reject(new Error(`Host broker unavailable at ${socketPath}: ${error.message}`)));
    });
  });
}

type PolicyResult = { path: string; policy: { decision: "allow" | "ask" | "deny"; reason: string } };

type ApprovalRule = {
  op: string;
  path: string;
  recursive: boolean;
  createdAt: string;
};

function loadRules(): ApprovalRule[] {
  try {
    return JSON.parse(fs.readFileSync(approvalsPath, "utf8")) as ApprovalRule[];
  } catch {
    return [];
  }
}

function saveRules(rules: ApprovalRule[]) {
  fs.mkdirSync(path.dirname(approvalsPath), { recursive: true });
  fs.writeFileSync(approvalsPath, JSON.stringify(rules, null, 2) + "\n", { mode: 0o600 });
}

function isSameOrChild(candidate: string, root: string) {
  const rel = path.relative(root, candidate);
  return rel === "" || (!!rel && !rel.startsWith("..") && !path.isAbsolute(rel));
}

function isRemembered(op: string, target: string) {
  return loadRules().some((rule) => {
    if (rule.op !== op) return false;
    return rule.recursive ? isSameOrChild(target, rule.path) : target === rule.path;
  });
}

function remember(op: string, target: string, recursive: boolean) {
  const rules = loadRules();
  if (!rules.some((rule) => rule.op === op && rule.path === target && rule.recursive === recursive)) {
    rules.push({ op, path: target, recursive, createdAt: new Date().toISOString() });
    saveRules(rules);
  }
}

async function approvedRequest<T>(ctx: { ui: { select: (title: string, items: string[]) => Promise<string | undefined | null> } }, action: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const op = action;
  const classification = await brokerRequest<PolicyResult>({ action: "classify", op, ...params }, signal);
  if (classification.policy.decision === "deny") {
    throw new Error(`Denied by policy: ${classification.policy.reason}`);
  }

  let approved = classification.policy.decision === "allow" || isRemembered(op, classification.path);
  if (!approved) {
    const parent = path.dirname(classification.path);
    const choice = await ctx.ui.select(
      `Host access approval\n\nOperation: ${op}\nPath: ${classification.path}\nReason: ${classification.policy.reason}`,
      [
        "Allow once",
        "Always allow this exact path",
        `Always allow ${op} under parent directory: ${parent}`,
        "Deny",
      ],
    );

    if (choice === "Allow once") approved = true;
    else if (choice === "Always allow this exact path") {
      remember(op, classification.path, false);
      approved = true;
    } else if (choice === `Always allow ${op} under parent directory: ${parent}`) {
      remember(op, parent, true);
      approved = true;
    }
  }

  if (!approved) {
    throw new Error(`Denied by user: ${classification.policy.reason}`);
  }
  return brokerRequest<T>({ action, ...params, approved }, signal);
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("host-approvals", {
    description: "Show or clear remembered host broker approvals. Use /host-approvals clear to reset.",
    handler: async (args, ctx) => {
      if (args.trim() === "clear") {
        try { fs.unlinkSync(approvalsPath); } catch {}
        ctx.ui.notify("Cleared remembered host broker approvals.", "info");
        return;
      }
      const rules = loadRules();
      ctx.ui.notify(
        rules.length === 0
          ? "No remembered host broker approvals."
          : `Remembered host broker approvals:\n${rules.map((rule) => `${rule.op} ${rule.recursive ? "under" : "path"} ${rule.path}`).join("\n")}`,
        "info",
      );
    },
  });

  pi.registerTool({
    name: "host_list_dir",
    label: "Host List Dir",
    description: "List a directory on the host outside the sandbox through the approved host broker.",
    promptSnippet: "List host directories outside the sandbox through the host broker permission policy",
    promptGuidelines: [
      "Use host_list_dir only when the user asks to inspect host files outside /workspace.",
      "Prefer normal read/list tools for paths inside /workspace.",
    ],
    parameters: Type.Object({
      path: Type.String({ description: "Absolute host path, or ~/... path, to list." }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await approvedRequest<{ path: string; entries: Array<{ name: string; type: string; size?: number; mtimeMs?: number }>; policy: unknown }>(
        ctx,
        "list_dir",
        { path: params.path },
        signal,
      );
      const lines = result.entries.map((entry) => `${entry.type.padEnd(9)} ${String(entry.size ?? "").padStart(10)} ${entry.name}`);
      return {
        content: [{ type: "text", text: `Host directory: ${result.path}\n${lines.join("\n")}` }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "host_read_file",
    label: "Host Read File",
    description: "Read a text file on the host outside the sandbox through the approved host broker.",
    promptSnippet: "Read host text files outside the sandbox through the host broker permission policy",
    promptGuidelines: [
      "Use host_read_file only when the user asks to inspect host files outside /workspace.",
      "Do not use host_read_file for secrets, credentials, keys, browser profiles, or token files.",
      "Prefer the normal read tool for paths inside /workspace.",
    ],
    parameters: Type.Object({
      path: Type.String({ description: "Absolute host path, or ~/... path, to read." }),
      maxBytes: Type.Optional(Type.Number({ description: "Maximum bytes to read, capped by the broker default." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await approvedRequest<{ path: string; content: string; bytes: number; policy: unknown }>(
        ctx,
        "read_file",
        { path: params.path, maxBytes: params.maxBytes },
        signal,
      );
      return {
        content: [{ type: "text", text: result.content }],
        details: { path: result.path, bytes: result.bytes, policy: result.policy },
      };
    },
  });

  pi.registerTool({
    name: "host_write_file",
    label: "Host Write File",
    description: "Write a UTF-8 text file on the host outside the sandbox through the approved host broker. Always requires approval by default.",
    promptSnippet: "Write host text files outside the sandbox through the host broker permission policy",
    promptGuidelines: [
      "Use host_write_file only when the user explicitly asks to modify host files outside /workspace.",
      "Do not use host_write_file for secrets, credentials, keys, browser profiles, or token files.",
      "Prefer normal edit/write tools for paths inside /workspace.",
    ],
    parameters: Type.Object({
      path: Type.String({ description: "Absolute host path, or ~/... path, to write." }),
      content: Type.String({ description: "Complete UTF-8 file contents to write." }),
      createDirs: Type.Optional(Type.Boolean({ description: "Create missing parent directories." })),
      backup: Type.Optional(Type.Boolean({ description: "Create a timestamped backup if the file exists. Defaults to true." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await approvedRequest<{ path: string; bytes: number; backupPath?: string; policy: unknown }>(
        ctx,
        "write_file",
        { path: params.path, content: params.content, createDirs: params.createDirs, backup: params.backup },
        signal,
      );
      return {
        content: [{ type: "text", text: `Wrote ${result.bytes} bytes to ${result.path}${result.backupPath ? `\nBackup: ${result.backupPath}` : ""}` }],
        details: result,
      };
    },
  });
}
