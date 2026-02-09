# dotfiles

GNU Stow-managed dotfiles for an Arch Linux (KDE Plasma) terminal workflow. Each package mirrors the `$HOME` directory layout and is symlinked into place with `stow`.

## What's Included

| Package | Config | Highlights |
|---------|--------|------------|
| **alacritty** | `.config/alacritty/alacritty.toml` | JetBrainsMono Nerd Font, Shift+Return binding |
| **bash** | `.bashrc` | eza, fzf, zoxide, starship, yazi shell wrapper, lazygit alias |
| **nvim** | `.config/nvim/init.lua` | kickstart.nvim, Catppuccin Mocha, LSP + formatters |
| **starship** | `.config/starship.toml` | Catppuccin Mocha palette, minimal git-aware prompt |
| **tmux** | `.config/tmux/tmux.conf` | `C-a` prefix, vim-style navigation, Catppuccin theme, session persistence |

## Dependencies

- [GNU Stow](https://www.gnu.org/software/stow/)
- [Alacritty](https://alacritty.org/)
- [Neovim](https://neovim.io/)
- [tmux](https://github.com/tmux/tmux) + [tpm](https://github.com/tmux-plugins/tpm)
- [Starship](https://starship.rs/)
- [eza](https://github.com/eza-community/eza), [fzf](https://github.com/junegunn/fzf), [zoxide](https://github.com/ajeetdsouza/zoxide), [yazi](https://github.com/sxyazi/yazi), [lazygit](https://github.com/jesseduffield/lazygit)
- [JetBrainsMono Nerd Font](https://www.nerdfonts.com/)

## Usage

```bash
# Clone into ~/dotfiles
git clone git@github.com:ThomasFisherSE/dotfiles.git ~/dotfiles
cd ~/dotfiles

# Stow individual packages
stow alacritty bash nvim starship tmux

# Remove symlinks for a package
stow -D <package>
```

After stowing tmux, install plugins inside a tmux session with `prefix + I`.

## Reloading Configs

- **Alacritty / Starship** — hot-reload on save
- **Bash** — `source ~/.bashrc` or open a new shell
- **tmux** — `prefix + r` or `tmux source-file ~/.config/tmux/tmux.conf`
- **Neovim** — restart nvim
