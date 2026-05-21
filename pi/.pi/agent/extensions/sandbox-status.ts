import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

function sandboxLabel() {
  const display = process.env.PI_SANDBOX_HOST_PROJECT_DISPLAY || process.env.PI_SANDBOX_HOST_PROJECT;
  if (!display) return undefined;
  return `${display} [Sandbox]`;
}

function formatTokens(n: number) {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const label = sandboxLabel();
    if (!label) return;

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
          const left = theme.fg("dim", `${label}${branch ? ` (${branch})` : ""}`);
          const right = theme.fg(
            "dim",
            `↑${formatTokens(input)} ↓${formatTokens(output)} $${cost.toFixed(3)} ${ctx.model?.id || "no-model"}`,
          );
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
