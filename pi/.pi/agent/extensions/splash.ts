import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type Theme = {
  fg: (color: string, text: string) => string;
  bg: (color: string, text: string) => string;
  bold: (text: string) => string;
};

const widgetId = "pi-splash";
let showing = false;
let animationTimer: ReturnType<typeof setInterval> | undefined;

function projectLabel(cwd: string) {
  const display = process.env.PI_SANDBOX_HOST_PROJECT_DISPLAY || process.env.PI_SANDBOX_HOST_PROJECT;
  if (display) return display;

  const home = process.env.HOME;
  if (home && cwd === home) return "~";
  if (home && cwd.startsWith(`${home}/`)) return `~/${cwd.slice(home.length + 1)}`;
  return cwd;
}

function shortProjectName(cwd: string) {
  const label = projectLabel(cwd);
  if (label === "~") return label;
  return path.basename(label) || label;
}

function isSandboxed() {
  return process.env.PI_SANDBOX === "1";
}

function center(text: string, width: number) {
  const len = visibleWidth(text);
  if (len >= width) return truncateToWidth(text, width);
  const left = Math.floor((width - len) / 2);
  return " ".repeat(left) + text;
}

function line(theme: Theme, width: number, text = "") {
  const innerWidth = Math.max(0, width - 4);
  const content = truncateToWidth(text, innerWidth);
  const pad = " ".repeat(Math.max(0, innerWidth - visibleWidth(content)));
  return theme.fg("borderMuted", "│ ") + content + pad + theme.fg("borderMuted", " │");
}

function border(theme: Theme, width: number, kind: "top" | "bottom") {
  if (width < 4) return theme.fg("borderMuted", kind === "top" ? "╭╮" : "╰╯");
  const left = kind === "top" ? "╭" : "╰";
  const right = kind === "top" ? "╮" : "╯";
  return theme.fg("borderMuted", left + "─".repeat(width - 2) + right);
}

function metric(theme: Theme, color: string, label: string, value: string) {
  return theme.fg("dim", label) + " " + theme.fg(color, value);
}

function shimmerPi(_theme: Theme, frame: number) {
  const base = (s: string) => `\x1b[38;2;137;143;191m${s}\x1b[0m`;   // muted lavender / model-pill-ish
  const mid = (s: string) => `\x1b[38;2;166;173;220m${s}\x1b[0m`;    // soft lavender
  const glint = (s: string) => `\x1b[38;2;190;198;245m${s}\x1b[0m`;  // restrained highlight
  const shadow = (s: string) => `\x1b[38;2;88;91;112m${s}\x1b[0m`;
  const art = [
    "        ████████████████        ",
    "      ████████████████████      ",
    "          ████      ████       ",
    "          ████      ████       ",
    "          ████      ████       ",
    "          ████      ████       ",
    "         █████     █████       ",
    "       █████     █████         ",
  ];

  const period = 96;
  const phase = (frame % period) / period;
  const center = -8 + phase * 48;
  const fade = Math.sin(phase * Math.PI); // eases in/out so the loop seam is invisible

  return art.map((raw, y) =>
    raw.split("").map((char, x) => {
      if (char === " ") return " ";
      const diagonal = x + y * 0.75;
      const distance = Math.abs(diagonal - center);
      if (fade > 0.08 && distance < 0.55) return glint(char);
      if (fade > 0.08 && distance < 1.65) return mid(char);
      if (y >= art.length - 2 || x < 8) return shadow(char);
      return base(char);
    }).join(""),
  );
}

function stopAnimation() {
  if (!animationTimer) return;
  clearInterval(animationTimer);
  animationTimer = undefined;
}

function showSplash(ctx: any) {
  if (!ctx.hasUI) return;
  showing = true;

  ctx.ui.setWidget(
    widgetId,
    (tui: any, theme: Theme) => {
      stopAnimation();
      animationTimer = setInterval(() => tui.requestRender(), 90);

      return {
        invalidate() {},
        render(width: number): string[] {
          const w = Math.max(28, Math.min(width, 88));
          const project = shortProjectName(ctx.cwd);
          const sandbox = isSandboxed() ? theme.fg("success", "sandboxed ✓") : theme.fg("warning", "host-ish ✗");
          const vault = process.env.PI_OBSIDIAN_VAULT ? theme.fg("success", "vault mounted") : theme.fg("dim", "no vault");
          const model = ctx.model?.id ? theme.fg("accent", ctx.model.id) : theme.fg("dim", "model pending");

          const title = theme.fg("accent", theme.bold("π")) + theme.fg("text", "  coding agent");
          const pi = shimmerPi(theme, Math.floor(Date.now() / 85));
          const meta = [
            metric(theme, "customMessageLabel", "repo", project),
            metric(theme, isSandboxed() ? "success" : "warning", "mode", sandbox),
            metric(theme, "accent", "model", model),
            metric(theme, process.env.PI_OBSIDIAN_VAULT ? "success" : "dim", "obsidian", vault),
          ].join(theme.fg("borderMuted", "  ┊  "));

          const hint = theme.fg("dim", "type a prompt to begin");

          return [
            border(theme, w, "top"),
            line(theme, w, ""),
            line(theme, w, center(title, w - 4)),
            line(theme, w, ""),
            ...pi.map((piLine) => line(theme, w, center(piLine, w - 4))),
            line(theme, w, ""),
            line(theme, w, center(meta, w - 4)),
            line(theme, w, center(hint, w - 4)),
            line(theme, w, ""),
            border(theme, w, "bottom"),
          ];
        },
      };
    },
    { placement: "aboveEditor" },
  );
}

function hideSplash(ctx: any) {
  if (!showing) return;
  showing = false;
  stopAnimation();
  ctx.ui.setWidget(widgetId, undefined);
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (event, ctx) => {
    if (event.reason === "reload") return;
    showSplash(ctx);
  });

  pi.on("input", async (_event, ctx) => {
    hideSplash(ctx);
    return { action: "continue" as const };
  });

  pi.registerCommand("splash", {
    description: "Show the Pi startup splash widget",
    handler: async (_args, ctx) => {
      showSplash(ctx);
    },
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    hideSplash(ctx);
  });
}
