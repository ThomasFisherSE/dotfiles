import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const socketPath = process.env.PI_HOST_BROKER_SOCKET || "/run/pi-host-broker.sock";
const statusKey = "next-work";
const maxConversationChars = 10_000;
const autoIntervalMs = Math.max(1, Number(process.env.PI_NEXT_WORK_AUTO_MINUTES || "20")) * 60 * 1000;

type BrokerResponse<T = unknown> =
  | { ok: true; result: T }
  | { ok: false; error: string };

type Candidate = {
  id: string;
  title: string;
  rationale?: string;
  nonOverlapReason?: string;
  likelyFiles?: string[];
  risk?: string;
  size?: string;
  status?: string;
  branch?: string;
  worktreePath?: string;
};

type ListResult = {
  ok: true;
  command: "list" | "scout";
  stateFile?: string;
  generatedAt?: string | null;
  startedAt?: string | null;
  running?: boolean;
  started?: boolean;
  pid?: number;
  candidates: Candidate[];
  rejected?: Array<{ title?: string; reason?: string }>;
  error?: string;
};

type LaunchResult = {
  ok: true;
  command: "launch";
  id: string;
  title: string;
  branch: string;
  worktreePath: string;
  tmux?: { started: boolean; kind?: string; target?: string; reason?: string };
  commandLine?: string;
};

type CleanupItem = {
  id: string;
  title: string;
  status?: string;
  branch?: string;
  worktreePath?: string;
  launchedAt?: string;
  exists: boolean;
  dirty: boolean;
};

type CleanupListResult = {
  ok: true;
  command: "cleanup-list";
  stateFile?: string;
  items: CleanupItem[];
};

type CleanupResult = {
  ok: true;
  command: "cleanup";
  id: string;
  title: string;
  worktreePath?: string;
  branch?: string;
  worktreeRemoved?: boolean;
  branchDeleted?: boolean;
};

const runningScouts = new Map<string, Promise<ListResult | undefined>>();
const lastScoutAt = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    socket.setTimeout(16 * 60 * 1000, () => finish(() => reject(new Error("Host broker request timed out"))));
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

function hostProject(ctx: any): string {
  return process.env.PI_SANDBOX_HOST_PROJECT || ctx.cwd;
}

function shortPath(p: string): string {
  const home = os.homedir();
  if (p === home) return "~";
  if (p.startsWith(`${home}/`)) return `~/${p.slice(home.length + 1)}`;
  return p;
}

function isStaleContextError(error: any): boolean {
  return String(error?.message || error).includes("extension ctx is stale");
}

function setStatus(ctx: any, text: string, color = "dim"): boolean {
  try {
    const theme = ctx.ui?.theme;
    ctx.ui?.setStatus?.(statusKey, theme?.fg ? theme.fg(color, text) : text);
    return true;
  } catch (error) {
    if (isStaleContextError(error)) return false;
    throw error;
  }
}

function notify(ctx: any, message: string, level: "info" | "warning" | "error" = "info"): boolean {
  try {
    ctx.ui.notify(message, level);
    return true;
  } catch (error) {
    if (isStaleContextError(error)) return false;
    throw error;
  }
}

function textFromContent(content: any): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((part) => {
    if (part?.type === "text" && typeof part.text === "string") return [part.text];
    if (part?.type === "toolCall") {
      const args = part.arguments ? ` ${JSON.stringify(part.arguments).slice(0, 600)}` : "";
      return [`[tool:${part.name || "unknown"}${args}]`];
    }
    return [];
  }).join("\n");
}

function normalizeRepoPath(value: string, projectPath: string): string {
  let p = value.trim().replace(/^['"]|['"]$/g, "");
  if (!p || /^https?:\/\//.test(p)) return "";
  if (p.startsWith(`${projectPath}/`)) p = p.slice(projectPath.length + 1);
  if (p.startsWith("/workspace/")) p = p.slice("/workspace/".length);
  if (p.startsWith("./")) p = p.slice(2);
  if (p.startsWith("/") || p.includes("://")) return "";
  return p;
}

function pathsFromUnknown(value: any, projectPath: string, out = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    const direct = normalizeRepoPath(value, projectPath);
    if (direct.includes("/") && !direct.includes(" ")) out.add(direct);

    const matches = value.match(/(?:\.\/|\/workspace\/|[A-Za-z0-9_.-]+\/)[A-Za-z0-9_./-]+/g) || [];
    for (const match of matches) {
      const normalized = normalizeRepoPath(match, projectPath);
      if (normalized && normalized.includes("/") && !normalized.includes(" ")) out.add(normalized);
    }
    return out;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => pathsFromUnknown(item, projectPath, out));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => pathsFromUnknown(item, projectPath, out));
  }
  return out;
}

function buildScoutContext(ctx: any) {
  const branch = ctx.sessionManager?.getBranch?.() || [];
  const projectPath = hostProject(ctx);
  const entries = branch.slice(-16);
  const lines: string[] = [];
  const activeFiles = new Set<string>();
  let lastUser = "";
  let lastAssistant = "";

  for (const entry of entries) {
    if (entry?.type !== "message") continue;
    const message = entry.message;
    const role = message?.role || "unknown";
    const text = textFromContent(message?.content).trim();
    if (!text) continue;
    pathsFromUnknown(message?.content, projectPath, activeFiles);

    const clipped = text.length > 1200 ? `${text.slice(0, 1200)}\n[clipped]` : text;
    lines.push(`## ${role}\n${clipped}`);
    if (role === "user") lastUser = clipped;
    if (role === "assistant") lastAssistant = clipped;
  }

  const conversation = lines.join("\n\n").slice(-maxConversationChars);
  const currentWorkSummary = [
    lastUser ? `Latest user request:\n${lastUser}` : "",
    lastAssistant ? `Latest assistant progress:\n${lastAssistant}` : "",
  ].filter(Boolean).join("\n\n");

  return {
    currentWorkSummary,
    conversation,
    activeFiles: [...activeFiles].slice(0, 120),
    sessionFile: ctx.sessionManager?.getSessionFile?.(),
  };
}

async function nextWork<T>(command: string, ctx: any, extra: Record<string, unknown> = {}): Promise<T> {
  const projectPath = String(extra.projectPath || hostProject(ctx));
  const request = {
    action: "next_work",
    command,
    ...extra,
    projectPath,
  };

  try {
    return await brokerRequest<T>(request);
  } catch (error) {
    if (process.env.PI_SANDBOX === "1") throw error;
    return await directNextWork<T>(command, ctx, { ...extra, projectPath });
  }
}

function directNextWork<T>(command: string, ctx: any, extra: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const script = [
      path.join(os.homedir(), ".local", "bin", "pi-next-work"),
      path.join(os.homedir(), "dotfiles", "pi-next-work", "bin", "pi-next-work"),
      "pi-next-work",
    ]
      .find((candidate) => candidate === "pi-next-work" || fs.existsSync(candidate));
    const projectPath = String(extra.projectPath || hostProject(ctx));
    const args = [command, "--project", projectPath, "--json"];
    if (command === "launch" || command === "cleanup") args.push("--id", String(extra.id || ""));
    if (command === "cleanup" && extra.deleteBranch) args.push("--delete-branch");
    if (command === "cleanup" && extra.force) args.push("--force");

    const child = spawn(script || "pi-next-work", args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        const parsed = JSON.parse(stdout || "{}");
        if (code !== 0 || parsed.ok === false) reject(new Error(parsed.error || stderr || `pi-next-work exited ${code}`));
        else resolve(parsed as T);
      } catch (error) {
        reject(new Error(`Invalid pi-next-work output: ${String(error)}\n${stdout || stderr}`));
      }
    });

    if (command === "scout") child.stdin.end(JSON.stringify(extra.context || {}));
    else child.stdin.end();
  });
}

async function refreshStatus(ctx: any): Promise<ListResult | undefined> {
  try {
    const result = await nextWork<ListResult>("list", ctx);
    if (result.running) {
      setStatus(ctx, "Next: scouting", "accent");
      return result;
    }
    const open = (result.candidates || []).filter((candidate) => candidate.status !== "launched").length;
    setStatus(ctx, open > 0 ? `Next: ${open}` : "Next: none");
    return result;
  } catch {
    setStatus(ctx, "Next: unavailable", "warning");
    return undefined;
  }
}

function notifySavedCandidates(ctx: any, result: ListResult | undefined) {
  if (!result || result.running) return;
  const open = (result.candidates || []).filter((candidate) => candidate.status !== "launched").length;
  if (open <= 0) return;
  notify(
    ctx,
    `Next-work has ${open} saved suggestion${open === 1 ? "" : "s"} from a previous scout. Run /next-work to review.`,
    "info",
  );
}

function maybeAutoScout(ctx: any) {
  if (process.env.PI_NEXT_WORK_AUTO === "0") return;
  const project = hostProject(ctx);
  const now = Date.now();
  if (runningScouts.has(project)) return;
  if (now - (lastScoutAt.get(project) || 0) < autoIntervalMs) return;
  lastScoutAt.set(project, now);
  void runScout(ctx, false, true);
}

async function runScout(ctx: any, notifyUser: boolean, notifyWhenAvailable = notifyUser): Promise<ListResult | undefined> {
  const project = hostProject(ctx);
  const context = buildScoutContext(ctx);
  const existing = runningScouts.get(project);
  if (existing) {
    if (notifyUser) notify(ctx, "Next-work scout is already running.", "info");
    return existing;
  }

  setStatus(ctx, "Next: scouting", "accent");
  if (notifyUser) {
    notify(ctx, "Next-work scout started. This runs in the background and may take a few minutes.", "info");
  }
  const run = nextWork<ListResult>("scout", ctx, { projectPath: project, context })
    .then(async (result) => {
      if (result.started || result.running) {
        result = await waitForScout(ctx, project);
        if (!result) return undefined;
      }
      const count = (result.candidates || []).filter((candidate) => candidate.status !== "launched").length;
      setStatus(ctx, count > 0 ? `Next: ${count}` : "Next: none");
      if (notifyUser) {
        const suffix = count > 0 ? " Run /next-work to choose one." : "";
        notify(ctx, `Next-work scout found ${count} candidate${count === 1 ? "" : "s"}.${suffix}`, "info");
      } else if (notifyWhenAvailable && count > 0) {
        notify(
          ctx,
          `Next-work found ${count} suggestion${count === 1 ? "" : "s"}. Run /next-work to review.`,
          "info",
        );
      }
      return result;
    })
    .catch((error) => {
      setStatus(ctx, "Next: scout failed", "warning");
      if (notifyUser) notify(ctx, `Next-work scout failed: ${error.message || String(error)}`, "error");
      return undefined;
    })
    .finally(() => {
      runningScouts.delete(project);
    });

  runningScouts.set(project, run);
  return run;
}

async function waitForScout(ctx: any, projectPath: string): Promise<ListResult | undefined> {
  for (let i = 0; i < 240; i++) {
    await sleep(5000);
    const current = await nextWork<ListResult>("list", ctx, { projectPath });
    if (!current.running) return current;
    setStatus(ctx, "Next: scouting", "accent");
  }
  notify(ctx, "Next-work scout is still running after 20 minutes. Use /next-work status to check later.", "warning");
  return undefined;
}

function candidateLabel(candidate: Candidate): string {
  const status = candidate.status === "launched" ? "launched" : `${candidate.risk || "?"}/${candidate.size || "?"}`;
  return `${status}  ${candidate.title}  [${candidate.id}]`;
}

function candidateDetails(candidate: Candidate): string {
  const files = candidate.likelyFiles?.length ? candidate.likelyFiles.join("\n") : "(none named)";
  return [
    candidate.title,
    "",
    `Risk/size: ${candidate.risk || "?"}/${candidate.size || "?"}`,
    "",
    "Rationale:",
    candidate.rationale || "(none provided)",
    "",
    "Non-overlap reason:",
    candidate.nonOverlapReason || "(none provided)",
    "",
    "Likely files:",
    files,
  ].join("\n");
}

function cleanupLabel(item: CleanupItem): string {
  const state = item.exists ? item.dirty ? "dirty" : "clean" : "missing";
  return `${state}  ${item.title}  [${item.id}]`;
}

function cleanupDetails(item: CleanupItem): string {
  return [
    item.title,
    "",
    `Worktree: ${item.worktreePath || "(none)"}`,
    `Branch: ${item.branch || "(none)"}`,
    `Launched: ${item.launchedAt || "(unknown)"}`,
    `State: ${item.exists ? item.dirty ? "dirty" : "clean" : "missing"}`,
  ].join("\n");
}

async function showCleanupPicker(ctx: any) {
  const result = await nextWork<CleanupListResult>("cleanup-list", ctx);
  const items = result.items || [];
  if (items.length === 0) {
    ctx.ui.notify("No launched next-work worktrees to clean up.", "info");
    return;
  }

  const labels = items.map(cleanupLabel);
  const choice = await ctx.ui.select("Clean up launched next-work worktrees", [...labels, "Cancel"]);
  if (!choice || choice === "Cancel") return;

  const item = items[labels.indexOf(choice)];
  if (!item) return;

  let force = false;
  if (item.exists && item.dirty) {
    const dirtyChoice = await ctx.ui.select(
      `Dirty worktree\n\n${cleanupDetails(item)}\n\nThis worktree has uncommitted changes. Refusing safe cleanup by default.`,
      ["Cancel", "Force remove dirty worktree"],
    );
    if (dirtyChoice !== "Force remove dirty worktree") return;
    force = true;
  }

  const deleteBranch = item.branch
    ? await ctx.ui.confirm(
        "Delete branch too?",
        `${cleanupDetails(item)}\n\nRemove the worktree${force ? " with --force" : ""} and delete branch ${item.branch}? Choose No to remove only the worktree and keep the branch.`,
      )
    : false;

  if (!deleteBranch) {
    const ok = await ctx.ui.confirm(
      "Remove worktree?",
      `${cleanupDetails(item)}\n\nRemove the worktree${force ? " with --force" : ""} and keep the branch?`,
    );
    if (!ok) return;
  }

  try {
    const cleaned = await nextWork<CleanupResult>("cleanup", ctx, {
      id: item.id,
      deleteBranch,
      force,
    });
    ctx.ui.notify(
      [
        `Cleaned next-work item: ${cleaned.title}`,
        cleaned.worktreeRemoved ? `Removed worktree: ${cleaned.worktreePath}` : "Worktree was already missing.",
        cleaned.branchDeleted ? `Deleted branch: ${cleaned.branch}` : cleaned.branch ? `Kept branch: ${cleaned.branch}` : "",
      ].filter(Boolean).join("\n"),
      "info",
    );
    await refreshStatus(ctx);
  } catch (error: any) {
    ctx.ui.notify(`Cleanup failed: ${error.message || String(error)}`, "error");
  }
}

async function showPicker(ctx: any, initial?: ListResult) {
  let result = initial || await nextWork<ListResult>("list", ctx);
  if (result.running) {
    ctx.ui.notify(
      `Next-work scout is still running${result.startedAt ? ` since ${result.startedAt}` : ""}. I will update the footer when it finishes.`,
      "info",
    );
    setStatus(ctx, "Next: scouting", "accent");
    return;
  }
  let candidates = result.candidates || [];

  if (candidates.length === 0) {
    const choice = await ctx.ui.select(
      "No next-work candidates yet.",
      ["Run scout now", "Cancel"],
    );
    if (choice !== "Run scout now") return;
    const fresh = await runScout(ctx, true);
    if (!fresh) return;
    result = fresh;
    candidates = result.candidates || [];
    if (candidates.length === 0) {
      ctx.ui.notify("Scout completed but did not find a non-overlapping candidate.", "info");
      return;
    }
  }

  const labels = candidates.map(candidateLabel);
  const extra = ["Run fresh scout", "Cancel"];
  const choice = await ctx.ui.select(
    `Next work for ${shortPath(hostProject(ctx))}\n${result.generatedAt ? `Generated: ${result.generatedAt}` : "No scout timestamp"}`,
    [...labels, ...extra],
  );
  if (!choice || choice === "Cancel") return;
  if (choice === "Run fresh scout") {
    const fresh = await runScout(ctx, true);
    if (fresh) await showPicker(ctx, fresh);
    return;
  }

  const index = labels.indexOf(choice);
  const candidate = candidates[index];
  if (!candidate) return;
  if (candidate.status === "launched") {
    ctx.ui.notify(`Already launched: ${candidate.worktreePath || candidate.branch || candidate.title}`, "info");
    return;
  }

  const ok = await ctx.ui.confirm(
    "Launch next work?",
    `${candidateDetails(candidate)}\n\nThis will create a sibling git worktree and start a new Pi session in tmux with a planning-only prompt.`,
  );
  if (!ok) return;

  try {
    const launched = await nextWork<LaunchResult>("launch", ctx, { id: candidate.id });
    const tmuxText = launched.tmux?.started
      ? `Started tmux ${launched.tmux.kind}: ${launched.tmux.target}`
      : `Tmux not started. Run: ${launched.commandLine || launched.worktreePath}`;
    ctx.ui.notify(
      `Next work launched.\nWorktree: ${launched.worktreePath}\nBranch: ${launched.branch}\n${tmuxText}`,
      "info",
    );
    await refreshStatus(ctx);
  } catch (error: any) {
    ctx.ui.notify(`Launch failed: ${error.message || String(error)}`, "error");
  }
}

export default function (pi: ExtensionAPI) {
  const globalState = globalThis as typeof globalThis & { __piNextWorkLoaded?: boolean };
  if (globalState.__piNextWorkLoaded) return;
  globalState.__piNextWorkLoaded = true;

  pi.on("session_start", async (_event, ctx) => {
    const result = await refreshStatus(ctx);
    notifySavedCandidates(ctx, result);
  });

  pi.on("turn_end", async (_event, ctx) => {
    maybeAutoScout(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    try {
      ctx.ui.setStatus(statusKey, undefined);
    } catch (error) {
      if (!isStaleContextError(error)) throw error;
    }
    globalState.__piNextWorkLoaded = false;
  });

  pi.registerCommand("next-work", {
    description: "Scout non-overlapping follow-up work and launch a selected candidate in a new worktree.",
    handler: async (args, ctx) => {
      const command = args.trim();

      if (command === "scout") {
        void runScout(ctx, true);
        return;
      }

      if (command === "status") {
        await refreshStatus(ctx);
        const result = await nextWork<ListResult>("list", ctx);
        const count = (result.candidates || []).filter((candidate) => candidate.status !== "launched").length;
        ctx.ui.notify(
          [
            `Next-work candidates: ${count}`,
            result.running ? `Scout: running${result.startedAt ? ` since ${result.startedAt}` : ""}` : "Scout: idle",
            `State: ${result.stateFile || "(unknown)"}`,
          ].join("\n"),
          "info",
        );
        return;
      }

      if (command === "cleanup") {
        await showCleanupPicker(ctx);
        return;
      }

      if (command && command !== "list") {
        ctx.ui.notify("Usage: /next-work [list|scout|status|cleanup]", "warning");
        return;
      }

      await showPicker(ctx);
    },
  });
}
