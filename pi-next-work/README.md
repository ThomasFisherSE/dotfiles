# pi-next-work

Local Pi package for scouting non-overlapping follow-up work and launching it in a new git worktree.

## What It Provides

- `/next-work scout` starts a background `codex exec` scout.
- `/next-work` opens a Pi picker for queued candidates.
- `/next-work cleanup` opens a Pi picker for launched next-work worktrees.
- Selected candidates create a sibling git worktree and open a new Pi session in tmux.
- The launched agent gets a scaffold prompt that asks it to inspect, plan, and wait for approval before editing.

The package helper lives at `bin/pi-next-work`. The sandboxed Pi extension reaches it through the host broker action in the main `pi` stow package.
