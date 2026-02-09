# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A GNU Stow-managed dotfiles repository for an Arch Linux (KDE Plasma) terminal workflow. Configs are symlinked from `~/dotfiles/<package>/` into `$HOME` via `stow <package>`.

## Stow Packages

| Package | Target config | Key details |
|---------|--------------|-------------|
| `alacritty` | `.config/alacritty/alacritty.toml` | JetBrainsMono Nerd Font, Shift+Return binding |
| `bash` | `.bashrc` | eza/fzf/zoxide/starship/atuin integrations, yazi wrapper, fd+fzf |
| `git` | `.config/git/config` | delta pager (side-by-side diffs), credential helper |
| `starship` | `.config/starship.toml` | Catppuccin Mocha palette, minimal prompt |
| `tmux` | `.config/tmux/tmux.conf` | C-a prefix, vim-style nav, tpm plugins |
| `nvim` | `.config/nvim/init.lua` | kickstart.nvim, Catppuccin Mocha, LSP + formatters |

## Deploying Changes

```bash
# Stow a single package (from ~/dotfiles)
stow <package>

# Stow all packages
stow alacritty bash git nvim starship tmux

# Unstow (remove symlinks)
stow -D <package>

# Reload tmux after editing tmux.conf
tmux source-file ~/.config/tmux/tmux.conf
```

Alacritty and Starship hot-reload on config change. Bash requires `source ~/.bashrc` or a new shell.

## Key Conventions

- **Theme**: Catppuccin Mocha everywhere (tmux, starship). New configs should match.
- **Stow structure**: Each package mirrors `$HOME` directory layout. A file at `tmux/.config/tmux/tmux.conf` symlinks to `~/.config/tmux/tmux.conf`.
- **Plugins are gitignored**: tmux plugins live in `tmux/.config/tmux/plugins/` but are managed by tpm, not this repo. Install them with `prefix + I` inside tmux.
- **Special characters**: The tmux config contains Nerd Font glyphs (powerline separators U+E0B4, U+E0B6). Use raw byte writes (`printf '\xee\x82\xb4'`) rather than the Edit tool for these characters, as they may get stripped.
