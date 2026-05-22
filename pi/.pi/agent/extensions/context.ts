import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens)) return "?";
  if (tokens < 1000) return `${Math.round(tokens)}`;
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${(tokens / 1_000_000).toFixed(1)}m`;
}

function formatPercent(percent: number | null | undefined): string {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) return "?";
  return `${percent.toFixed(percent >= 10 ? 0 : 1)}%`;
}

function formatStatusTokens(tokens: number): string {
  if (!Number.isFinite(tokens)) return "?";
  if (tokens < 1000) return `${Math.round(tokens)}`;
  if (tokens < 1_000_000) return `${Math.round(tokens / 1000)}k`;
  return `${(tokens / 1_000_000).toFixed(tokens >= 10_000_000 ? 0 : 1)}m`;
}

function formatStatus(ctx: ExtensionContext): string {
  const usage = ctx.getContextUsage();
  const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow;

  if (!usage) {
    return contextWindow ? `Context: ? / ${formatStatusTokens(contextWindow)}` : "Context: ?";
  }

  const percent = usage.percent ?? (contextWindow ? (usage.tokens / contextWindow) * 100 : undefined);
  return `Context: ${formatStatusTokens(usage.tokens)} (${formatPercent(percent)})`;
}

function updateStatus(ctx: ExtensionContext): void {
  ctx.ui.setStatus("context-usage", ctx.ui.theme.fg("dim", formatStatus(ctx)));
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    updateStatus(ctx);
  });

  pi.on("model_select", async (_event, ctx) => {
    updateStatus(ctx);
  });

  pi.on("message_end", async (_event, ctx) => {
    updateStatus(ctx);
  });

  pi.on("turn_end", async (_event, ctx) => {
    updateStatus(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    ctx.ui.setStatus("context-usage", undefined);
  });

  pi.registerCommand("context", {
    description: "Show the current context usage for the active model.",
    handler: async (_args, ctx) => {
      const usage = ctx.getContextUsage();
      const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow;
      const model = ctx.model?.id ?? "no model selected";

      if (!usage) {
        const message = contextWindow
          ? `Context usage unavailable yet. Window: ${formatTokens(contextWindow)} tokens.\nModel: ${model}`
          : `Context usage unavailable yet.\nModel: ${model}`;
        pi.sendMessage({ customType: "context-usage", content: message, display: true });
        return;
      }

      const remaining = contextWindow ? Math.max(0, contextWindow - usage.tokens) : undefined;
      const parts = [
        `Context: ${formatTokens(usage.tokens)}${contextWindow ? ` / ${formatTokens(contextWindow)}` : ""} tokens`,
        `Used: ${formatPercent(usage.percent)}`,
      ];
      if (remaining !== undefined) parts.push(`Remaining: ${formatTokens(remaining)} tokens`);
      parts.push(`Model: ${model}`);

      pi.sendMessage({ customType: "context-usage", content: parts.join("\n"), display: true });
    },
  });
}
