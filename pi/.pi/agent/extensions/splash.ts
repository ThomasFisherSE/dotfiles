import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type Theme = {
  fg: (color: string, text: string) => string;
  bg: (color: string, text: string) => string;
  bold: (text: string) => string;
};

const widgetId = "pi-splash";
const shimmerDelayMs = 500;
const shimmerDurationMs = 900;
const shimmerFrameCount = 96;
const shimmerIntervalMs = 100;
let showing = false;
let animationTimer: ReturnType<typeof setInterval> | undefined;
let animationStartedAt = 0;

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

function version() {
  try {
    return JSON.parse(fs.readFileSync("/opt/pi-coding-agent/package.json", "utf8")).version as string;
  } catch {
    return "unknown";
  }
}

function namesFromDir(dir: string, kind: "skills" | "extensions") {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name.startsWith(".")) return [];
      if (kind === "extensions") {
        if (entry.isFile() && entry.name.endsWith(".ts")) return [entry.name];
        if (entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, "index.ts"))) return [entry.name];
        return [];
      }
      if (entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, "SKILL.md"))) return [entry.name];
      return [];
    });
  } catch {
    return [];
  }
}

function wrapItems(items: string[], innerWidth: number, indent = "  ") {
  const sorted = [...new Set(items)].sort((a, b) => a.localeCompare(b));
  if (sorted.length === 0) return [`${indent}none loaded`];

  const lines: string[] = [];
  let current = indent;

  for (const item of sorted) {
    const suffix = current.trimEnd() === indent.trimEnd() ? item : `, ${item}`;
    if (visibleWidth(current + suffix) > innerWidth && current !== indent) {
      lines.push(current);
      current = indent + item;
    } else {
      current += suffix;
    }
  }

  lines.push(current);
  return lines;
}

function section(theme: Theme, title: string, items: string[], innerWidth: number) {
  return [
    theme.fg("customMessageLabel", theme.bold(title)),
    ...wrapItems(items, innerWidth).map((text) => theme.fg("dim", text)),
  ];
}

function contextFiles(cwd: string) {
  const files: string[] = [];
  const global = path.join(os.homedir(), ".pi", "agent", "AGENTS.md");
  if (fs.existsSync(global)) files.push("~/.pi/agent/AGENTS.md");
  if (fs.existsSync(path.join(cwd, "AGENTS.md"))) files.push("AGENTS.md");
  return files;
}

function skillNames(pi: ExtensionAPI) {
  const commandSkills = pi.getCommands()
    .filter((command) => command.source === "skill")
    .map((command) => command.name.replace(/^skill:/, ""));
  if (commandSkills.length > 0) return commandSkills;

  return [
    ...namesFromDir(path.join(os.homedir(), ".agents", "skills"), "skills"),
    ...namesFromDir(path.join(os.homedir(), ".codex", "skills"), "skills"),
  ];
}

function extensionNames(cwd: string) {
  return [
    ...namesFromDir(path.join(os.homedir(), ".pi", "agent", "extensions"), "extensions"),
    ...namesFromDir(path.join(cwd, ".pi", "extensions"), "extensions"),
  ];
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
  // Style contiguous runs instead of every glyph. This keeps the animation visually
  // the same, but dramatically reduces ANSI output per frame and avoids redraw churn.
  const colors = {
    base: "\x1b[38;2;137;143;191m",   // muted lavender / model-pill-ish
    mid: "\x1b[38;2;166;173;220m",    // soft lavender
    glint: "\x1b[38;2;190;198;245m",  // restrained highlight
    shadow: "\x1b[38;2;88;91;112m",
  } as const;
  const reset = "\x1b[0m";
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

  return art.map((raw, y) => {
    let out = "";
    let activeColor: keyof typeof colors | undefined;

    for (let x = 0; x < raw.length; x++) {
      const char = raw[x];
      let color: keyof typeof colors | undefined;

      if (char !== " ") {
        const diagonal = x + y * 0.75;
        const distance = Math.abs(diagonal - center);
        if (fade > 0.08 && distance < 0.55) color = "glint";
        else if (fade > 0.08 && distance < 1.65) color = "mid";
        else if (y >= art.length - 2 || x < 8) color = "shadow";
        else color = "base";
      }

      if (color !== activeColor) {
        if (activeColor) out += reset;
        if (color) out += colors[color];
        activeColor = color;
      }
      out += char;
    }

    if (activeColor) out += reset;
    return out;
  });
}

function stopAnimation() {
  if (!animationTimer) return;
  clearInterval(animationTimer);
  animationTimer = undefined;
}

function showSplash(pi: ExtensionAPI, ctx: any) {
  if (!ctx.hasUI) return;
  showing = true;

  ctx.ui.setWidget(
    widgetId,
    (tui: any, theme: Theme) => {
      stopAnimation();
      animationStartedAt = Date.now();
      animationTimer = setInterval(() => {
        if (Date.now() - animationStartedAt >= shimmerDelayMs + shimmerDurationMs) {
          stopAnimation();
        }
        tui.requestRender();
      }, shimmerIntervalMs);

      return {
        invalidate() {},
        render(width: number): string[] {
          const w = Math.max(0, width);
          const project = shortProjectName(ctx.cwd);
          const sandbox = isSandboxed() ? theme.fg("success", "sandboxed ✓") : theme.fg("warning", "host-ish ✗");
          const vault = process.env.PI_OBSIDIAN_VAULT ? theme.fg("success", "vault mounted") : theme.fg("dim", "no vault");
          const model = ctx.model?.id ? theme.fg("accent", ctx.model.id) : theme.fg("dim", "model pending");

          const title = theme.fg("accent", theme.bold("π")) + theme.fg("text", "  coding agent");
          const elapsed = animationTimer ? Date.now() - animationStartedAt : 0;
          const shimmerElapsed = Math.max(0, elapsed - shimmerDelayMs);
          const frame = Math.min(
            shimmerFrameCount - 1,
            Math.floor((shimmerElapsed / shimmerDurationMs) * shimmerFrameCount),
          );
          const piArt = shimmerPi(theme, frame);
          const meta = [
            metric(theme, "customMessageLabel", "repo", project),
            metric(theme, isSandboxed() ? "success" : "warning", "mode", sandbox),
            metric(theme, "accent", "model", model),
            metric(theme, process.env.PI_OBSIDIAN_VAULT ? "success" : "dim", "obsidian", vault),
          ].join(theme.fg("borderMuted", "  ┊  "));

          const hint = theme.fg("dim", "type a prompt to begin");
          const innerWidth = w - 4;
          const startupLines = [
            center(theme.fg("accent", `pi v${version()}`), innerWidth),
            center(theme.fg("dim", "escape interrupt · ctrl+c/ctrl+d clear/exit · / commands · ! bash · ctrl+o more"), innerWidth),
            center(theme.fg("dim", "Press ctrl+o to show full startup help and loaded resources."), innerWidth),
            "",
            center(theme.fg("dim", "Pi can explain its own features and look up its docs. Ask it how to use or extend Pi."), innerWidth),
            "",
            ...section(theme, "Context", contextFiles(ctx.cwd), innerWidth),
            "",
            ...section(theme, "Skills", skillNames(pi), innerWidth),
            "",
            ...section(theme, "Extensions", extensionNames(ctx.cwd), innerWidth),
          ];

          return [
            border(theme, w, "top"),
            line(theme, w, ""),
            line(theme, w, center(title, innerWidth)),
            line(theme, w, ""),
            ...piArt.map((piLine) => line(theme, w, center(piLine, innerWidth))),
            line(theme, w, ""),
            line(theme, w, center(meta, innerWidth)),
            line(theme, w, center(hint, innerWidth)),
            line(theme, w, ""),
            ...startupLines.map((text) => line(theme, w, text)),
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

    // Only show the startup splash before there are real transcript messages.
    // Starting Pi via resume still uses reason === "startup", but a restored
    // session already has message entries; showing a live widget there can sit
    // underneath the resume UI and cause redraw artifacts. Some fresh sessions
    // can still have non-message bookkeeping entries, so don't check length.
    if (ctx.sessionManager.getBranch().some((entry: any) => entry.type === "message")) return;

    showSplash(pi, ctx);
  });

  pi.on("input", async (_event, ctx) => {
    hideSplash(ctx);
    return { action: "continue" as const };
  });

  pi.on("session_before_switch", async (_event, ctx) => {
    hideSplash(ctx);
  });

  pi.on("session_before_fork", async (_event, ctx) => {
    hideSplash(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    hideSplash(ctx);
  });
}
