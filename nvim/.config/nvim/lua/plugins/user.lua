---@type LazySpec
return {
  -- Catppuccin overrides
  {
    "catppuccin/nvim",
    name = "catppuccin",
    ---@type CatppuccinOptions
    opts = {
      flavour = "mocha",
      no_italic = true,
      integrations = {
        gitsigns = true,
        mason = true,
        mini = true,
        native_lsp = { enabled = true },
        neotree = true,
        snacks = true,
        treesitter = true,
        which_key = true,
      },
    },
  },

  -- Gitsigns: custom signs
  {
    "lewis6991/gitsigns.nvim",
    opts = {
      signs = {
        add = { text = "+" },
        change = { text = "~" },
        delete = { text = "_" },
        topdelete = { text = "‾" },
        changedelete = { text = "~" },
      },
    },
  },

  -- mini.ai: better around/inside textobjects
  {
    "echasnovski/mini.ai",
    opts = { n_lines = 500 },
    event = "VeryLazy",
  },

  -- mini.surround: add/delete/replace surroundings
  {
    "echasnovski/mini.surround",
    opts = {},
    event = "VeryLazy",
  },

  -- Inline color highlighting
  {
    "NvChad/nvim-colorizer.lua",
    event = "BufReadPost",
    opts = {
      filetypes = { "*" },
      user_default_options = {
        RGB = true,
        RRGGBB = true,
        names = false,
        RRGGBBAA = true,
        rgb_fn = true,
        hsl_fn = true,
        mode = "background",
      },
    },
  },

  -- Todo/note highlighting in comments
  {
    "folke/todo-comments.nvim",
    event = "VimEnter",
    dependencies = { "nvim-lua/plenary.nvim" },
    opts = { signs = false },
  },

  -- Auto-detect indentation
  {
    "NMAC427/guess-indent.nvim",
    event = "BufReadPost",
    opts = {},
  },

  -- Conform: formatters by filetype
  {
    "stevearc/conform.nvim",
    opts = {
      formatters_by_ft = {
        lua = { "stylua" },
        python = { "black" },
        javascript = { "prettier" },
        typescript = { "prettier" },
        javascriptreact = { "prettier" },
        typescriptreact = { "prettier" },
        html = { "prettier" },
        css = { "prettier" },
        json = { "prettier" },
        yaml = { "prettier" },
        markdown = { "prettier" },
        c = { "clang-format" },
        cpp = { "clang-format" },
      },
    },
  },
}
