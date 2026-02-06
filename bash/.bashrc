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

# fzf keybindings and completion (Ctrl+R for history, Ctrl+T for files, Alt+C for cd)
eval "$(fzf --bash)"

# zoxide (smarter cd — use 'z' instead of 'cd')
eval "$(zoxide init bash)"

# Starship prompt
eval "$(starship init bash)"
