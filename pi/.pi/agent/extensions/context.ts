import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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

export default function (pi: ExtensionAPI) {
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
