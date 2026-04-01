---@type LazySpec
return {
  "AstroNvim/astrocommunity",

  -- Theme
  { import = "astrocommunity.colorscheme.catppuccin" },

  -- Formatting
  { import = "astrocommunity.editing-support.conform-nvim" },

  -- Editing enhancements
  { import = "astrocommunity.editing-support.nvim-treesitter-context" },
  { import = "astrocommunity.editing-support.undotree" },

  -- LSP enhancements
  { import = "astrocommunity.lsp.lsp-signature-nvim" },

  -- Testing
  { import = "astrocommunity.test.neotest" },

  -- Language packs (LSP + treesitter + formatters)
  { import = "astrocommunity.pack.lua" },
  { import = "astrocommunity.pack.python" },
  { import = "astrocommunity.pack.rust" },
  { import = "astrocommunity.pack.typescript" },
  { import = "astrocommunity.pack.cpp" },
  { import = "astrocommunity.pack.cs-omnisharp" },
}
