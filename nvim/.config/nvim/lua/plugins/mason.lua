---@type LazySpec
return {
  {
    "mason-org/mason.nvim",
    opts = {},
  },
  {
    "WhoIsSethDaniel/mason-tool-installer.nvim",
    opts = {
      ensure_installed = {
        "stylua",
        "prettier",
        "black",
        "clang-format",
      },
    },
  },
}
