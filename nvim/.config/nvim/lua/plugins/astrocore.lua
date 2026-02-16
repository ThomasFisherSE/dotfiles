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
        relativenumber = false,
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
        -- Neo-tree toggle with backslash
        ["\\"] = { "<cmd>Neotree toggle<CR>", desc = "Toggle Neo-tree" },
        -- Diagnostics quickfix
        ["<Leader>q"] = { vim.diagnostic.setloclist, desc = "Quickfix diagnostics" },
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
          callback = function() vim.hl.on_yank() end,
        },
      },
    },
  },
}
