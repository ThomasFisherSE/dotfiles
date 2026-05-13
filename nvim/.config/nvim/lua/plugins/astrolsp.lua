local function lsp_from_insert(action)
  return function()
    vim.cmd.stopinsert()
    vim.schedule(action)
  end
end

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
    mappings = {
      n = {
        ["<F2>"] = { vim.lsp.buf.rename, desc = "Rename symbol", cond = "textDocument/rename" },
        ["<F12>"] = { vim.lsp.buf.definition, desc = "Go to definition", cond = "textDocument/definition" },
        ["<S-F12>"] = { vim.lsp.buf.references, desc = "Find references", cond = "textDocument/references" },
        ["<A-CR>"] = { vim.lsp.buf.code_action, desc = "Code action", cond = "textDocument/codeAction" },
      },
      i = {
        ["<F2>"] = { lsp_from_insert(vim.lsp.buf.rename), desc = "Rename symbol", cond = "textDocument/rename" },
        ["<F12>"] = {
          lsp_from_insert(vim.lsp.buf.definition),
          desc = "Go to definition",
          cond = "textDocument/definition",
        },
        ["<S-F12>"] = {
          lsp_from_insert(vim.lsp.buf.references),
          desc = "Find references",
          cond = "textDocument/references",
        },
        ["<A-CR>"] = {
          lsp_from_insert(vim.lsp.buf.code_action),
          desc = "Code action",
          cond = "textDocument/codeAction",
        },
      },
    },
  },
}
