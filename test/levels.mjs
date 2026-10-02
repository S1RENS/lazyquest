import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('../engine.js'); const { expandSolution, Game } = require('../game.js'); const { LEVELS } = require('../levels.js');
let fails = 0;
for (const lv of LEVELS) {
  const { keys, game: g, errors } = expandSolution(lv);
  const ok = g.won && !errors.length;
  const par = keys.length;
  if (!ok) {
    fails++;
    console.log(`\n✗ ${lv.id} ${lv.title}  par=${par} errors=${errors.join('; ')}`);
    console.log('  gems:', JSON.stringify(g.gems.map(x => [x.file, x.r, x.c, x.got])));
    console.log('  mode:', g.vim.mode, 'idle:', g.idle, 'cursor:', g.vim.buf.name, g.vim.buf.r, g.vim.buf.c, 'msg:', g.vim.msg);
    for (const t of g.targetStatus()) if (!t.ok) { console.log('  target', t.name, '\n  HAVE:', JSON.stringify(t.have), '\n  WANT:', JSON.stringify(t.want)); }
  } else console.log(`✓ ${lv.id} ${lv.title} par=${par}`);
  // banned keys must never be needed
}
console.log(fails ? `${fails} failing` : 'all levels solvable');
