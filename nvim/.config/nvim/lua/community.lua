---@type LazySpec
return {
  "AstroNvim/astrocommunity",

  -- Theme
  { import = "astrocommunity.colorscheme.catppuccin" },

  -- Formatting
  { import = "astrocommunity.editing-support.conform-nvim" },

  -- Language packs (LSP + treesitter + formatters)
  { import = "astrocommunity.pack.lua" },
  { import = "astrocommunity.pack.python" },
  { import = "astrocommunity.pack.rust" },
  { import = "astrocommunity.pack.typescript" },
  { import = "astrocommunity.pack.cpp" },
  { import = "astrocommunity.pack.cs-omnisharp" },
}
