import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("clear", {
    description: "Start a new session, like /new.",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      const result = await ctx.newSession();
      if (result.cancelled) {
        ctx.ui.notify("New session cancelled.", "info");
      }
    },
  });
}
