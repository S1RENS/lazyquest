import { compare } from './diff.mjs';
const cases = JSON.parse(process.argv[2]);
for (const b of compare(cases)) console.log(JSON.stringify(b.case.keys), JSON.stringify(b.case.lines), '\n  nvim  ', JSON.stringify(b.nvim.lines), b.nvim.cursor, '\n  engine', JSON.stringify(b.engine.lines), b.engine.cursor);
console.log('checked', cases.length);
