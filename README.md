# dotfiles

GNU Stow-managed dotfiles for an Arch Linux (KDE Plasma) terminal workflow. Each package mirrors the `$HOME` directory layout and is symlinked into place with `stow`.

## What's Included

| Package | Config | Highlights |
|---------|--------|------------|
| **alacritty** | `.config/alacritty/alacritty.toml` | JetBrainsMono Nerd Font, Shift+Return binding |
| **ghostty** | `.config/ghostty/config` | Alacritty-style visuals, maximized tmux startup, JetBrainsMono Nerd Font, Shift+Enter binding |
| **bash** | `.bashrc`, `.local/bin/disk-audit` | eza, fzf, zoxide, starship, yazi shell wrapper, lazygit alias, fd/fzf integration, atuin, disk cleanup report |
| **git** | `.config/git/config` | delta pager (side-by-side diffs, line numbers, navigate mode) |
| **nvim** | `.config/nvim/init.lua` | kickstart.nvim, Catppuccin Mocha, LSP + formatters |
| **starship** | `.config/starship.toml` | Catppuccin Mocha palette, minimal git-aware prompt |
| **tmux** | `.config/tmux/tmux.conf` | `C-a` prefix, vim-style navigation, Catppuccin theme, session persistence |
| **light-cargo** | `.cargo/config.toml`, `.local/bin/cargo*` | Parallel Cargo builds with globally serialized, agent-visible link steps; optional whole-build throttling |
| **pi** | `.pi/agent/`, `.local/bin/pi*` | Sandboxed Pi launcher, host broker, custom extensions, local web-tool package wiring |

## Dependencies

- [GNU Stow](https://www.gnu.org/software/stow/)
- [Alacritty](https://alacritty.org/) or [Ghostty](https://ghostty.org/)
- [Neovim](https://neovim.io/)
- [tmux](https://github.com/tmux/tmux) + [tpm](https://github.com/tmux-plugins/tpm)
- [Starship](https://starship.rs/)
- [eza](https://github.com/eza-community/eza), [fzf](https://github.com/junegunn/fzf), [zoxide](https://github.com/ajeetdsouza/zoxide), [yazi](https://github.com/sxyazi/yazi), [lazygit](https://github.com/jesseduffield/lazygit)
- [fd](https://github.com/sharkdp/fd), [ripgrep](https://github.com/BurntSushi/ripgrep), [sd](https://github.com/chmln/sd), [dust](https://github.com/bootandy/dust), [procs](https://github.com/dalance/procs), [delta](https://github.com/dandavison/delta), [atuin](https://github.com/atuinsh/atuin), [tealdeer](https://github.com/tealdeer-rs/tealdeer)
- `flock` from util-linux (used to serialize memory-heavy Cargo link steps)
- [JetBrainsMono Nerd Font](https://www.nerdfonts.com/)

## Usage

```bash
# Clone into ~/dotfiles
git clone git@github.com:ThomasFisherSE/dotfiles.git ~/dotfiles
cd ~/dotfiles

# Stow individual packages
stow alacritty bash git ghostty nvim starship tmux light-cargo

# Remove symlinks for a package
stow -D <package>
```

After stowing tmux, install plugins inside a tmux session with `prefix + I`.

## Helper Commands

```bash
# Read-only report of likely disk cleanup targets and data-driven suggestions
disk-audit

# Faster report that skips the full home-directory scan
disk-audit --fast

# More detailed home-directory scan
disk-audit --deep
```

## Pi Local Web

The Pi settings install a local-first web extension from `~/dev/pi-local-web`. It provides:

- `web_fetch` for direct URL/page fetches with markdown or homepage-link extraction.
- `web_search` for SearXNG-backed search without paid search APIs.

Install or refresh the package after cloning/restoring the extension checkout:

```bash
scripts/install-pi-local-web.sh
```

If `~/dev/pi-local-web` is missing, the script clones `git@github.com:ThomasFisherSE/pi-local-web.git` first. Override with `PI_LOCAL_WEB_REPO_URL` or `PI_LOCAL_WEB_REPO` if needed.

For search, run or point at a SearXNG instance:

```bash
export PI_LOCAL_WEB_SEARXNG_URL=http://127.0.0.1:8080
```

Create the local Docker setup with:

```bash
scripts/setup-searxng-local.sh
```

If port 8080 is busy, pick another local port consistently:

```bash
SEARXNG_PORT=8888 scripts/setup-searxng-local.sh --start
export SEARXNG_PORT=8888
```

The Pi sandbox forwards `PI_LOCAL_WEB_SEARXNG_URL` and `SEARXNG_URL` when present.

## Reloading Configs

- **Alacritty / Ghostty / Starship** — hot-reload on save
- **Bash** — `source ~/.bashrc` or open a new shell
- **tmux** — `prefix + r` or `tmux source-file ~/.config/tmux/tmux.conf`
- **Neovim** — restart nvim
