import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

function projectLabel(cwd: string) {
  const display = process.env.PI_SANDBOX_HOST_PROJECT_DISPLAY || process.env.PI_SANDBOX_HOST_PROJECT;
  if (display) return display;

  const home = process.env.HOME;
  if (home && cwd === home) return "~";
  if (home && cwd.startsWith(`${home}/`)) return `~/${cwd.slice(home.length + 1)}`;
  return cwd;
}

function isSandboxed() {
  return process.env.PI_SANDBOX === "1";
}

function formatTokens(n: number) {
  if (!Number.isFinite(n)) return "?";
  if (n < 1000) return `${Math.round(n)}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

function formatStatusTokens(n: number) {
  if (!Number.isFinite(n)) return "?";
  if (n < 1000) return `${Math.round(n)}`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}m`;
}

function formatPercent(percent: number | null | undefined): string {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) return "?";
  return `${percent.toFixed(percent >= 10 ? 0 : 1)}%`;
}

type PillBg = "selectedBg" | "toolPendingBg" | "toolSuccessBg" | "toolErrorBg" | "customMessageBg" | "userMessageBg";

const fallbackEdgeColors: Record<PillBg, string> = {
  selectedBg: "\x1b[38;2;69;71;90m",
  toolPendingBg: "\x1b[38;2;30;30;46m",
  toolSuccessBg: "\x1b[38;2;30;46;30m",
  toolErrorBg: "\x1b[38;2;46;30;30m",
  customMessageBg: "\x1b[38;2;49;50;68m",
  userMessageBg: "\x1b[38;2;49;50;68m",
};

function edge(theme: any, bg: PillBg, char: string) {
  const bgAnsi = theme.bgColors?.get?.(bg);
  const fgAnsi = typeof bgAnsi === "string" ? bgAnsi.replace("[48;", "[38;").replace("[48:", "[38:") : fallbackEdgeColors[bg];
  return `${fgAnsi}${char}\x1b[0m`;
}

function pill(theme: any, bg: PillBg, fg: string, text: string) {
  return edge(theme, bg, "") + theme.bg(bg, theme.fg(fg, ` ${text} `)) + edge(theme, bg, "");
}

function joinPills(parts: string[]) {
  return parts.filter(Boolean).join(" ");
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const label = projectLabel(ctx.cwd);
    const sandboxed = isSandboxed();

    ctx.ui.setTitle(`pi - ${label}`);
    ctx.ui.setFooter((tui, theme, footerData) => {
      const unsubs = [footerData.onBranchChange(() => tui.requestRender())];

      return {
        dispose: () => unsubs.forEach((unsub) => unsub()),
        invalidate() {},
        render(width: number): string[] {
          let input = 0;
          let output = 0;
          let cost = 0;
          for (const entry of ctx.sessionManager.getBranch()) {
            if (entry.type === "message" && entry.message.role === "assistant") {
              const message = entry.message as AssistantMessage;
              input += message.usage.input;
              output += message.usage.output;
              cost += message.usage.cost.total;
            }
          }

          const branch = footerData.getGitBranch();
          const left = joinPills([
            pill(theme, "customMessageBg", "customMessageLabel", `󰉋 ${label}`),
            branch ? pill(theme, "selectedBg", "muted", ` ${branch}`) : "",
            sandboxed
              ? pill(theme, "toolSuccessBg", "success", ` Sandboxed ✓`)
              : pill(theme, "toolErrorBg", "warning", ` Not Sandboxed ✗`),
          ]);

          const usage = ctx.getContextUsage();
          const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow;
          const percent = usage?.percent ?? (usage && contextWindow ? (usage.tokens / contextWindow) * 100 : undefined);
          const context = usage
            ? `Context: ${formatStatusTokens(usage.tokens)} ${formatPercent(percent)}`
            : contextWindow
              ? `Context: ?/${formatStatusTokens(contextWindow)}`
              : "Context: ?";
          const model = ctx.model?.id || "no-model";
          const right = joinPills([
            pill(theme, "toolPendingBg", "accent", `󰍛 ${context}`),
            pill(theme, "toolSuccessBg", "success", `󰆦 ↑${formatTokens(input)} ↓${formatTokens(output)}`),
            pill(theme, "toolErrorBg", "warning", ` ${cost.toFixed(3)}`),
            pill(theme, "selectedBg", "text", `󰚩 ${model}`),
          ]);

          const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
          return [truncateToWidth(left + pad + right, width)];
        },
      };
    });
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    ctx.ui.setFooter(undefined);
  });
}
