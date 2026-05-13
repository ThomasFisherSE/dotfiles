---@type LazySpec
return {
  "AstroNvim/astrocore",
  ---@type AstroCoreOpts
  opts = {
    features = {
      large_buf = { size = 1024 * 256, lines = 10000 },
      autopairs = true,
      cmp = true,
      diagnostics = { virtual_text = true, virtual_lines = false },
      highlighturl = true,
      notifications = true,
    },
    diagnostics = {
      update_in_insert = false,
      severity_sort = true,
      float = { border = "rounded", source = "if_many" },
      underline = { severity = vim.diagnostic.severity.ERROR },
      virtual_text = true,
      virtual_lines = false,
    },
    options = {
      opt = {
        number = true,
        relativenumber = true,
        mouse = "a",
        showmode = false,
        clipboard = "unnamedplus",
        breakindent = true,
        undofile = true,
        ignorecase = true,
        smartcase = true,
        signcolumn = "yes",
        updatetime = 250,
        timeoutlen = 300,
        splitright = true,
        splitbelow = true,
        list = true,
        listchars = { tab = "» ", trail = "·", nbsp = "␣" },
        inccommand = "split",
        cursorline = true,
        scrolloff = 10,
        confirm = true,
      },
    },
    mappings = {
      n = {
        -- Clear search highlights
        ["<Esc>"] = { "<cmd>nohlsearch<CR>", desc = "Clear search highlights" },
        -- Familiar desktop-editor aliases. Native Vim motions remain available.
        ["<C-z>"] = { "u", desc = "Undo" },
        ["<C-y>"] = { "<C-r>", desc = "Redo" },
        -- Neo-tree toggle with backslash
        ["\\"] = { "<cmd>Neotree toggle<CR>", desc = "Toggle Neo-tree" },
        -- Diagnostics quickfix
        ["<Leader>q"] = { vim.diagnostic.setloclist, desc = "Quickfix diagnostics" },
      },
      i = {
        ["<C-z>"] = { "<C-g>u<C-o>u", desc = "Undo" },
        ["<C-y>"] = { "<C-o><C-r>", desc = "Redo" },
      },
      v = {
        ["<C-z>"] = { "<Esc>u", desc = "Undo" },
        ["<C-y>"] = { "<Esc><C-r>", desc = "Redo" },
      },
      t = {
        -- Exit terminal mode
        ["<Esc><Esc>"] = { "<C-\\><C-n>", desc = "Exit terminal mode" },
      },
    },
    autocmds = {
      highlight_yank = {
        {
          event = "TextYankPost",
          desc = "Highlight when yanking text",
          callback = function()
            vim.hl.on_yank()
          end,
        },
      },
    },
    treesitter = {
      ensure_installed = {
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
      },
    },
  },
}
