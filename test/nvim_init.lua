local home = os.getenv('HOME')
vim.opt.rtp:append(home .. '/.local/share/nvim/lazy/mini.ai')
vim.opt.rtp:append(home .. '/.local/share/nvim/lazy/mini.surround')
vim.o.shiftwidth = 2; vim.o.expandtab = true; vim.o.ignorecase = true; vim.o.smartcase = true
vim.o.autoindent = true; vim.o.swapfile = false; vim.o.shada = ''; vim.o.timeoutlen = 10000
local ai = require('mini.ai')
ai.setup({ n_lines = 500, custom_textobjects = {
  d = { '%f[%d]%d+' },
  e = { { '%u[%l%d]+%f[^%l%d]', '%f[%S][%l%d]+%f[^%l%d]', '%f[%P][%l%d]+%f[^%l%d]', '^[%l%d]+%f[^%l%d]' }, '^().*()$' },
  u = ai.gen_spec.function_call(),
}})
require('mini.surround').setup({ mappings = { add = 'gsa', delete = 'gsd', find = 'gsf', find_left = 'gsF', highlight = 'gsh', replace = 'gsr', update_n_lines = 'gsn' } })
vim.keymap.set('n', 'n', "'Nn'[v:searchforward]", { expr = true })
vim.keymap.set('n', 'N', "'nN'[v:searchforward]", { expr = true })
function RunCases(inp, outp)
  local cases = vim.json.decode(table.concat(vim.fn.readfile(inp), '\n'))
  local res = {}
  for i, c in ipairs(cases) do
    vim.cmd('enew!')
    vim.bo.undolevels = -1
    vim.api.nvim_buf_set_lines(0, 0, -1, false, c.lines)
    vim.bo.undolevels = 1000
    vim.fn.setreg('"', ''); vim.fn.setreg('0', ''); vim.fn.setreg('/', '')
    vim.fn.cursor(c.cursor[1] + 1, c.cursor[2] + 1)
    local keys = vim.api.nvim_replace_termcodes(c.keys, true, true, true)
    local ok, err = pcall(vim.api.nvim_feedkeys, keys, 'mtx', false)
    local mode = vim.api.nvim_get_mode().mode
    if mode ~= 'n' then vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes('<Esc><Esc>', true, false, true), 'nx', false) end
    local cur = vim.api.nvim_win_get_cursor(0)
    res[i] = { lines = vim.api.nvim_buf_get_lines(0, 0, -1, false), cursor = { cur[1] - 1, cur[2] }, mode = mode, err = (not ok) and tostring(err) or nil }
  end
  vim.fn.writefile({ vim.json.encode(res) }, outp)
end
vim.keymap.set('x', '<', '<gv'); vim.keymap.set('x', '>', '>gv')
