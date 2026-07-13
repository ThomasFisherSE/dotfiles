# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## What This Is

A GNU Stow-managed dotfiles repository for an Arch Linux (KDE Plasma) terminal workflow. Configs are symlinked from `~/dotfiles/<package>/` into `$HOME` via `stow <package>`.

## Stow Packages

| Package | Target config | Key details |
|---------|--------------|-------------|
| `alacritty` | `.config/alacritty/alacritty.toml` | JetBrainsMono Nerd Font, Shift+Return binding |
| `ghostty` | `.config/ghostty/config` | Alacritty-style visuals, maximized tmux startup, JetBrainsMono Nerd Font, Shift+Enter binding |
| `bash` | `.bashrc`, `.local/bin/disk-audit` | eza/fzf/zoxide/starship/atuin integrations, yazi wrapper, fd+fzf, read-only disk cleanup report |
| `git` | `.config/git/config` | delta pager (side-by-side diffs), credential helper |
| `starship` | `.config/starship.toml` | Catppuccin Mocha palette, minimal prompt |
| `tmux` | `.config/tmux/tmux.conf` | C-a prefix, vim-style nav, tpm plugins |
| `nvim` | `.config/nvim/` | AstroNvim v6 (requires Neovim 0.12+ and `tree-sitter-cli`), Catppuccin Mocha, LSP + formatters. Uses nvim-treesitter `main` branch; extra parsers go in `astrocore.lua` under `treesitter.ensure_installed`. |
| `agents` | `.agents/skills/` | Cross-agent skills shared by Pi, Claude, Codex, and other Agent Skills-compatible tools. |
| `light-cargo` | `.cargo/config.toml`, `.local/bin/cargo*` | Parallel Cargo builds with globally serialized, agent-visible link steps. |
| `pi` | `.pi/agent/extensions/`, `.pi/agent/bin/`, `.local/bin/pi*` | Pi sandbox launcher, host broker, sandbox command wrappers, and extensions. |

## Deploying Changes

Agents should deploy dotfile changes themselves when it is safe to do so. After editing files in a stow package, run the matching `stow <package>` command from the repository root unless the user explicitly asks not to deploy.

```bash
# Stow a single package (from ~/dotfiles or this repository root)
stow <package>

# Stow all packages
stow agents alacritty bash git ghostty light-cargo nvim pi starship tmux

# Unstow (remove symlinks)
stow -D <package>

# Reload tmux after editing tmux.conf
tmux source-file ~/.config/tmux/tmux.conf
```

For Pi changes, agents should usually run `stow pi` after editing `pi/.pi/...` or `pi/.local/...`, then tell the user to run `/reload` or restart Pi if needed. Alacritty and Starship hot-reload on config change. Bash requires `source ~/.bashrc` or a new shell.

## Key Conventions

- **Theme**: Catppuccin Mocha for tmux and starship. Terminal emulator configs stay visually minimal unless explicitly themed.
- **Stow structure**: Each package mirrors `$HOME` directory layout. A file at `tmux/.config/tmux/tmux.conf` symlinks to `~/.config/tmux/tmux.conf`.
- **Plugins are gitignored**: tmux plugins live in `tmux/.config/tmux/plugins/` but are managed by tpm, not this repo. Install them with `prefix + I` inside tmux.
- **Cargo linking**: Rust compilation may run concurrently, but `cargo-linker` serializes memory-heavy link steps globally through a shared `/tmp` lock. If it reports that it is waiting, leave the build running; status heartbeats confirm that it is healthy, and retrying only adds more work to the queue. If the queue is unavailable, the wrapper warns and links normally instead of failing the build.
- **Special characters**: The tmux config contains Nerd Font glyphs (powerline separators U+E0B4, U+E0B6). Use raw byte writes (`printf '\xee\x82\xb4'`) rather than the Edit tool for these characters, as they may get stripped.
