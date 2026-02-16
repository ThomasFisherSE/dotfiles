-- Treesitter stale-cwd workaround for tmux session restore.
-- tar extracts to cwd, which may be stale after tmux resurrect.
-- Skip parser installation if cwd doesn't exist on disk.
if not vim.uv.fs_stat(vim.fn.getcwd()) then
  vim.api.nvim_create_autocmd("User", {
    pattern = "LazyDone",
    once = true,
    callback = function()
      -- Disable automatic treesitter install when cwd is stale
      local ok, ts_install = pcall(require, "nvim-treesitter.install")
      if ok then ts_install.ensure_installed = {} end
    end,
  })
end
