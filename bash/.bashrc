#
# ~/.bashrc
#

# If not running interactively, don't do anything
[[ $- != *i* ]] && return

# ---------------------------------------------------------------------------
# Aliases
# ---------------------------------------------------------------------------

# Use eza instead of ls (better output, git integration)
alias ls='eza --group-directories-first'
alias ll='eza -la --group-directories-first --git'
alias lt='eza -T --group-directories-first --level=2'

alias grep='grep --color=auto'

# Lazygit
alias lg='lazygit'

# ---------------------------------------------------------------------------
# Yazi — cd into directory on exit (shell wrapper)
# ---------------------------------------------------------------------------
function y() {
    local tmp="$(mktemp -t "yazi-cwd.XXXXXX")" cwd
    yazi "$@" --cwd-file="$tmp"
    if cwd="$(command cat -- "$tmp")" && [ -n "$cwd" ] && [ "$cwd" != "$PWD" ]; then
        builtin cd -- "$cwd"
    fi
    rm -f -- "$tmp"
}

# ---------------------------------------------------------------------------
# Tool integrations
# ---------------------------------------------------------------------------

# fd integration with fzf (faster, respects .gitignore)
export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_ALT_C_COMMAND='fd --type d --hidden --follow --exclude .git'

# fzf keybindings and completion (Ctrl+T for files, Alt+C for cd)
eval "$(fzf --bash)"

# Atuin (enhanced shell history — replaces Ctrl+R)
eval "$(atuin init bash)"

# zoxide (smarter cd — use 'z' instead of 'cd')
eval "$(zoxide init bash)"

# Starship prompt
eval "$(starship init bash)"
