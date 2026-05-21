import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const configPath = path.join(os.homedir(), ".pi", "agent", "skill-dirs.json");

const candidates = [
  {
    key: "agents",
    label: "Agent Skills (~/.agents/skills) [Pi auto-discovers this already]",
    path: "/home/sandbox/.agents/skills",
    defaultEnabled: false,
    note: "Usually leave off here because Pi auto-discovers it separately.",
  },
  {
    key: "codex",
    label: "Codex Skills (~/.codex/skills)",
    path: "/home/sandbox/.codex/skills",
    defaultEnabled: true,
  },
  {
    key: "claude",
    label: "Claude Skills (~/.claude/skills)",
    path: "/home/sandbox/.claude/skills",
    defaultEnabled: false,
  },
];

type Config = { enabled: Record<string, boolean> };

function defaultConfig(): Config {
  return { enabled: Object.fromEntries(candidates.map((candidate) => [candidate.key, candidate.defaultEnabled])) };
}

function loadConfig(): Config {
  const defaults = defaultConfig();
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as Partial<Config>;
    return { enabled: { ...defaults.enabled, ...(parsed.enabled ?? {}) } };
  } catch {
    return defaults;
  }
}

function saveConfig(config: Config) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
}

function existingEnabledPaths(config: Config): string[] {
  return candidates
    .filter((candidate) => config.enabled[candidate.key] && fs.existsSync(candidate.path))
    .map((candidate) => candidate.path);
}

function statusLines(config: Config): string[] {
  return candidates.map((candidate) => {
    const enabled = config.enabled[candidate.key] ? "on " : "off";
    const exists = fs.existsSync(candidate.path) ? "exists" : "missing";
    return `${enabled}  ${exists.padEnd(7)}  ${candidate.key.padEnd(7)}  ${candidate.path}${candidate.note ? `  (${candidate.note})` : ""}`;
  });
}

export default function (pi: ExtensionAPI) {
  pi.on("resources_discover", async () => {
    return { skillPaths: existingEnabledPaths(loadConfig()) };
  });

  pi.registerCommand("skill-dirs", {
    description: "Toggle extra skill directories discovered by pi-sandbox, then reload resources.",
    handler: async (_args, ctx) => {
      const config = loadConfig();

      while (true) {
        const choice = await ctx.ui.select(
          `Extra skill directories\n\n${statusLines(config).join("\n")}\n\nChoose a directory to toggle, then Save + reload.`,
          [
            ...candidates.map((candidate) => `${config.enabled[candidate.key] ? "✓" : " "} ${candidate.key} — ${candidate.label}`),
            "Save + reload",
            "Cancel",
          ],
        );

        if (!choice || choice === "Cancel") return;
        if (choice === "Save + reload") {
          saveConfig(config);
          ctx.ui.notify(`Saved skill directory config to ${configPath}`, "info");
          await ctx.reload();
          return;
        }

        const candidate = candidates.find((item) => choice.includes(` ${item.key} —`));
        if (candidate) config.enabled[candidate.key] = !config.enabled[candidate.key];
      }
    },
  });
}
