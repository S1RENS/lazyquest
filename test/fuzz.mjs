import { compare } from './diff.mjs';
let seed = +(process.argv[2] || 1);
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const corpus = [
  'const total = items.reduce((sum, x) => sum + x.price, 0);',
  'function greet(name, greeting) {',
  '  return `${greeting}, ${name}!`;',
  '}',
  '',
  'let user = { id: 42, name: "Ada", tags: ["admin", \'dev\'] };',
  'if (a && (b || c)) {',
  '    console.log("hello world", foo(bar, baz[1]));',
  'the quick brown fox jumps over the lazy dog',
  '  indented line with  double  spaces',
  'x = 10; y = -3; z = x+y;',
  'print(getUserName(42), "done")',
  'foo.bar_baz(qux) -- comment',
  '    ',
  'end',
];
const cmds0 = ['h','l','j','k','w','b','e','W','B','E','0','^','$','gg','G','2G','%','}','{','ge',
 '3w','2b','2e','5l','2j',
 'dw','d2w','2dw','cwNEW<Esc>','ceZ<Esc>','cbQ<Esc>','db','de','dd','2dd','yyp','yyP','ywP','yeP','x','3x','X','D','CTAIL<Esc>','J','3J','~','3~','rX','3rY','>>','<<','dj','dk','d$','d0','d^','dG','dgg','dl','dh',
 'ciwW<Esc>','caw<Esc>','diw','daw','ci(I<Esc>','ca(<Esc>','di(','da(','di)','di"','da"','ci"S<Esc>','dib','dab','ciqQ<Esc>','daq','dia','daa','ciaA<Esc>','di{','da[','di[','did','cieE<Esc>','diu','dau',
 'd}','d{','yiwP','yiwp','p','P','u','<C-r>','.','AEND<Esc>','IBEG<Esc>','oNEW<Esc>','ONEW<Esc>','aA<Esc>','iI<Esc>','ccCC<Esc>','Yp','xp','ddp','viwd','vjd','Vd','Vjd','veyP','viw~','vU','vjU','gUiw','guu','g~~','gUU','gUw','dt)','df,','cf)F<Esc>','ct(T<Esc>','d/o<CR>','*','#','n','N','<C-a>','<C-x>','5<C-a>',
 'gsaiw)','gsaiw(','gsaiw"','gsae]','gsd(','gsd)','gsr)]','gsr"\'','gsdq','gsd"','gsr({','vegsa)',
 'fo','to','Fe','Te',';',',','dfo','dto','yfe',
 '3Jx','vjJ','Vj>','Vj<','v$d','vbd','v%d','d%','y%P','c%X<Esc>','vipd','dip','dap','yipP',
];
const cmds = cmds0.filter(c => !/[fFtT;,]/.test(c.replace(/<[^>]+>/g,'')) || /^(df,|vipd|dip|yipP|dap)$/.test(c));
const N = +(process.argv[3] || 400);
const cases = [];
for (let i = 0; i < N; i++) {
  const nl = 3 + Math.floor(rnd() * 4);
  const lines = []; for (let j = 0; j < nl; j++) lines.push(pick(corpus));
  const r = Math.floor(rnd() * nl); const c = Math.floor(rnd() * Math.max(1, lines[r].length));
  const nc = 1 + Math.floor(rnd() * 2);
  let keys = ''; for (let j = 0; j < nc; j++) keys += pick(cmds);
  cases.push({ lines, cursor: [r, c], keys });
}
const bad = compare(cases);
console.log(`${cases.length - bad.length}/${cases.length} match`);
const byKey = {};
for (const b of bad) (byKey[b.case.keys] = byKey[b.case.keys] || []).push(b);
for (const [k, list] of Object.entries(byKey).slice(0, +(process.argv[4] || 25))) {
  const b = list[0];
  console.log('\n### keys:', JSON.stringify(k), 'x' + list.length, 'cursor', JSON.stringify(b.case.cursor));
  console.log('in    :', JSON.stringify(b.case.lines));
  console.log('nvim  :', JSON.stringify(b.nvim.lines), JSON.stringify(b.nvim.cursor), b.nvim.err || '');
  console.log('engine:', JSON.stringify(b.engine.lines), JSON.stringify(b.engine.cursor));
}
