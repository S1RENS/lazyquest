import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { Vim } = require('../engine.js');
const dir = new URL('.', import.meta.url).pathname;

// tokenize "dw<Esc>" -> ['d','w','<Esc>']
export function tok(s) { const out = []; for (let i = 0; i < s.length; i++) { if (s[i] === '<') { const j = s.indexOf('>', i); if (j > i + 1 && /^<[A-Za-z][-A-Za-z0-9]*>$/.test(s.slice(i, j + 1))) { out.push(s.slice(i, j + 1)); i = j; continue; } } out.push(s[i]); } return out; }
const toNvim = (keys) => keys.map(k => k === '<' ? '<lt>' : k).join('');

export function runEngine(c) {
  const v = new Vim({ files: [{ name: 't.txt', text: c.lines.join('\n'), cursor: c.cursor }], pairs: false });
  v.feedAll(tok(c.keys));
  if (v.mode !== 'normal') { v.feed('<Esc>'); v.feed('<Esc>'); }
  return { lines: v.L, cursor: [v.buf.r, v.buf.c] };
}
export function runNvim(cases) {
  const inp = dir + 'cases.json', outp = dir + 'out.json';
  fs.writeFileSync(inp, JSON.stringify(cases.map(c => ({ ...c, keys: toNvim(tok(c.keys)) }))));
  execFileSync('nvim', ['--clean', '--headless', '-u', dir + 'nvim_init.lua', '-c', `lua RunCases('${inp}','${outp}')`, '-c', 'qa!'], { stdio: 'pipe', timeout: 120000 });
  return JSON.parse(fs.readFileSync(outp, 'utf8'));
}
export function compare(cases, { cursor = true } = {}) {
  const nv = runNvim(cases);
  const bad = [];
  cases.forEach((c, i) => {
    const e = runEngine(c), n = nv[i];
    const textOk = JSON.stringify(e.lines) === JSON.stringify(n.lines);
    const curOk = !cursor || c.noCursor || (e.cursor[0] === n.cursor[0] && e.cursor[1] === n.cursor[1]);
    if (!textOk || !curOk) bad.push({ case: c, engine: e, nvim: n });
  });
  return bad;
}
