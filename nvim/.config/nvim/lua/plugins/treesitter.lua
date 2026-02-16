---@type LazySpec
return {
  "nvim-treesitter/nvim-treesitter",
  branch = "master",
  opts = function(_, opts)
    -- Extra parsers not already provided by language packs
    if not opts.ensure_installed then opts.ensure_installed = {} end
    vim.list_extend(opts.ensure_installed, {
      "bash",
      "css",
      "diff",
      "html",
      "json",
      "luadoc",
      "markdown",
      "markdown_inline",
      "query",
      "toml",
      "vim",
      "vimdoc",
      "yaml",
    })

    -- Stale-cwd workaround: skip parser install if cwd is gone (tmux restore)
    if not vim.uv.fs_stat(vim.fn.getcwd()) then opts.ensure_installed = {} end
  end,
}
