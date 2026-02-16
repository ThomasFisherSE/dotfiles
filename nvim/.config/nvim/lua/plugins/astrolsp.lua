---@type LazySpec
return {
  "AstroNvim/astrolsp",
  ---@type AstroLSPOpts
  opts = {
    formatting = {
      format_on_save = {
        enabled = true,
        ignore_filetypes = { "c", "cpp" },
      },
      timeout_ms = 500,
    },
  },
}
