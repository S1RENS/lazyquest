/* LazyQuest editor engine — a small, testable Vim + LazyVim emulator.
   Keys are strings: printable chars as themselves, specials as <Esc> <CR> <BS> <Tab> <C-r> <A-j> ...
   Leader is a literal space " ". */
(function (G) {
  'use strict';

  const isWS = (ch) => ch === ' ' || ch === '\t';
  const isKW = (ch) => ch !== undefined && /[A-Za-z0-9_]/.test(ch);
  function cls(ch, big) {
    if (ch === undefined || isWS(ch)) return 0;
    if (big) return 1;
    return isKW(ch) ? 2 : 1;
  }
  const indentOf = (s) => s.match(/^\s*/)[0];
  const fnbCol = (s) => {
    const m = s.search(/\S/);
    return m < 0 ? Math.max(0, s.length - 1) : m;
  };
  const OPEN = { '(': ')', '[': ']', '{': '}', '<': '>' };
  const CLOSE = { ')': '(', ']': '[', '}': '{', '>': '<' };
  const QUOTES = '"\'`';
  const LABELS = 'asdfghjklqwertyuiopzxcvbnm';
  const FT = { js: 'javascript', ts: 'typescript', lua: 'lua', py: 'python', sh: 'sh', md: 'markdown', txt: 'text', toml: 'toml', log: 'log', csv: 'text' };
  const COMMENT = { javascript: '//', typescript: '//', lua: '--', python: '#', sh: '#', text: '#', markdown: '>', toml: '#', log: '#' };
  const ftOf = (name) => FT[(name.split('.').pop() || '').toLowerCase()] || 'text';

  // Convert a (magic) Vim regex into a JS RegExp source.
  function vimRe(p) {
    let out = '';
    for (let i = 0; i < p.length; i++) {
      const ch = p[i];
      if (ch === '\\' && i + 1 < p.length) {
        const n = p[++i];
        if (n === '<' || n === '>') out += '\\b';
        else if ('()|+?={}'.includes(n)) out += n === '=' ? '?' : n;
        else out += '\\' + n;
      } else if ('()|+?{}'.includes(ch)) out += '\\' + ch;
      else out += ch;
    }
    return out;
  }
  function vimRep(r) {
    let out = '';
    for (let i = 0; i < r.length; i++) {
      const ch = r[i];
      if (ch === '\\' && i + 1 < r.length) {
        const n = r[++i];
        if (/[0-9]/.test(n)) out += n === '0' ? '$&' : '$' + n;
        else if (n === 'r' || n === 'n') out += '\n';
        else if (n === 't') out += '\t';
        else out += n === '$' ? '$$' : n;
      } else if (ch === '&') out += '$&';
      else if (ch === '$') out += '$$';
      else out += ch;
    }
    return out;
  }
  function makeRe(pat, flags) {
    const icase = pat === pat.toLowerCase();
    try {
      return new RegExp(vimRe(pat), (flags === undefined ? 'g' : flags.replace('i', '')) + (icase || (flags || '').includes('i') ? 'i' : ''));
    } catch (e) {
      return null;
    }
  }

  class Buffer {
    constructor(name, text, ft) {
      this.name = name;
      this.lines = text.split('\n');
      this.r = 0;
      this.c = 0;
      this.want = 0;
      this.undo = [];
      this.redo = [];
      this.ft = ft || ftOf(name);
    }
    text() {
      return this.lines.join('\n');
    }
  }

  class Vim {
    constructor(opts) {
      opts = opts || {};
      const files = opts.files || [{ name: 'scratch.txt', text: opts.text || '' }];
      this.files = files.map((f) => {
        const b = new Buffer(f.name, f.text, f.ft);
        if (f.cursor) {
          b.r = f.cursor[0];
          b.c = f.cursor[1];
          b.want = b.c;
        }
        return b;
      });
      this.open = this.files.filter((b, i) => i === 0 || files[i].open !== false);
      this.buf = this.open[0];
      this.alt = null;
      this.mode = 'normal';
      this.regs = { '"': { text: '', line: false } };
      this.macros = {};
      this.lastMacro = null;
      this.recording = null;
      this.lastFind = null;
      this.charActive = false;
      this.lastSearch = null;
      this.hl = false;
      this.lastChange = null;
      this.queue = [];
      this.busy = false;
      this.gen = null;
      this.ctx = 'cmd';
      this.msg = '';
      this.msgErr = false;
      this.cmdline = null;
      this.flash = null;
      this.tsnodes = null;
      this.vis = null;
      this.picker = null;
      this.popup = null;
      this.jumps = [];
      this.jumpFwd = [];
      this.events = [];
      this.diagDefs = opts.diagnostics || [];
      this.hover = opts.hover || {};
      this.jk = !!opts.jk;
      this.pairs = opts.pairs !== false;
      this.curKeys = [];
      this.columns = 80;
    }

    // ---------- basic accessors ----------
    get L() {
      return this.buf.lines;
    }
    text() {
      return this.buf.lines.join('\n');
    }
    setText(t) {
      this.buf.lines = t.split('\n');
    }
    off(r, c) {
      const L = this.L;
      let o = 0;
      for (let i = 0; i < r; i++) o += L[i].length + 1;
      return o + c;
    }
    pos(o) {
      const L = this.L;
      let r = 0;
      while (r < L.length - 1 && o > L[r].length) {
        o -= L[r].length + 1;
        r++;
      }
      return { r, c: Math.min(o, L[r].length) };
    }
    get cur() {
      return { r: this.buf.r, c: this.buf.c };
    }
    setCur(r, c, keepWant) {
      const L = this.L;
      r = Math.max(0, Math.min(L.length - 1, r));
      const max = this.mode === 'insert' ? L[r].length : Math.max(0, L[r].length - 1);
      c = Math.max(0, Math.min(max, c));
      this.buf.r = r;
      this.buf.c = c;
      if (!keepWant) this.buf.want = c;
    }
    wantCol(r) {
      return Math.min(this.buf.want, Math.max(0, this.L[r].length - 1));
    }
    say(m, err) {
      this.msg = m;
      this.msgErr = !!err;
    }
    emit(ev) {
      this.events.push(ev);
    }

    // ---------- key loop ----------
    feed(key, src) {
      this.queue.push([key, src || 'user']);
      if (this.busy) return;
      this.busy = true;
      try {
        let guard = 0;
        while (this.queue.length && guard++ < 20000) {
          const [k, s] = this.queue.shift();
          this.step(k, s);
        }
        if (this.queue.length) {
          this.queue = [];
          this.say('E: macro recursion stopped', true);
        }
      } finally {
        this.busy = false;
      }
    }
    feedAll(keys, src) {
      for (const k of keys) this.feed(k, src);
    }
    begin() {
      this.snap = { buf: this.buf, lines: this.L.slice(), r: this.buf.r, c: this.buf.c };
      this.curKeys = [];
      this.cmdSrc = null;
      this.noUndo = false;
      this.gen = this.normalCmd();
      const r = this.gen.next();
      this.ctx = r.value || 'cmd';
    }
    step(key, src) {
      if (!this.gen) this.begin();
      if (this.recording && src === 'user') this.recording.keys.push(key);
      if (src === 'dot') this.cmdSrc = 'dot';
      this.curKeys.push(key);
      let res;
      try {
        res = this.gen.next(key);
      } catch (e) {
        if (typeof console !== 'undefined') console.error(e);
        this.say('E: ' + e.message, true);
        res = { done: true };
        this.mode = 'normal';
        this.vis = this.flash = this.cmdline = this.picker = this.tsnodes = null;
      }
      if (res.done) this.finish();
      else this.ctx = res.value || 'cmd';
    }
    finish() {
      const s = this.snap;
      const changed = s.buf.lines.length !== s.lines.length || s.buf.lines.join('\n') !== s.lines.join('\n');
      if (changed && !this.noUndo) {
        s.buf.undo.push({ lines: s.lines, r: s.r, c: s.c });
        if (s.buf.undo.length > 500) s.buf.undo.shift();
        s.buf.redo = [];
        if (this.cmdSrc !== 'dot') this.lastChange = this.curKeys.slice();
      }
      this.gen = null;
      this.ctx = 'cmd';
      this.mode = 'normal';
      this.vis = null;
      this.flash = null;
      this.tsnodes = null;
      this.cmdline = null;
      this.picker = null;
      this.setCur(this.buf.r, this.buf.c, true);
    }
    get pending() {
      return this.gen && this.mode === 'normal' && !this.cmdline && !this.flash ? this.curKeys.join('') : '';
    }

    // ---------- registers ----------
    setReg(name, text, line, yank) {
      if (name === '_') return;
      const v = { text, line: !!line };
      if (name && /[a-z]/.test(name)) this.regs[name] = v;
      if (name && /[A-Z]/.test(name)) {
        const o = this.regs[name.toLowerCase()] || { text: '', line: false };
        this.regs[name.toLowerCase()] = { text: o.text + (line ? '\n' : '') + text, line: o.line || line };
      }
      this.regs['"'] = v;
      if (yank && !name) this.regs['0'] = v;
    }
    getReg(name) {
      return this.regs[name || '"'] || null;
    }

    // ---------- undo ----------
    undo(n) {
      const b = this.buf;
      let done = 0;
      for (let i = 0; i < n && b.undo.length; i++, done++) {
        const u = b.undo.pop();
        b.redo.push({ lines: b.lines.slice(), r: b.r, c: b.c });
        b.lines = u.lines.slice();
        this.setCur(u.r, u.c);
      }
      this.say(done ? `${done} change${done > 1 ? 's' : ''}; undone` : 'Already at oldest change');
    }
    redoN(n) {
      const b = this.buf;
      let done = 0;
      for (let i = 0; i < n && b.redo.length; i++, done++) {
        const u = b.redo.pop();
        b.undo.push({ lines: b.lines.slice(), r: b.r, c: b.c });
        b.lines = u.lines.slice();
        this.setCur(u.r, u.c);
      }
      this.say(done ? `${done} change${done > 1 ? 's' : ''}; redone` : 'Already at newest change');
    }

    // ---------- word motions ----------
    wordFwd(p, big, forOp) {
      const L = this.L;
      let { r, c } = p;
      let line = L[r];
      const k = cls(line[c], big);
      if (k !== 0) while (c < line.length && cls(line[c], big) === k) c++;
      for (;;) {
        if (c >= line.length) {
          if (r >= L.length - 1) return { r, c: forOp ? line.length : Math.max(0, line.length - 1), end: true };
          r++;
          c = 0;
          line = L[r];
          if (line.length === 0) return { r, c };
          continue;
        }
        if (cls(line[c], big) === 0) {
          c++;
          continue;
        }
        return { r, c };
      }
    }
    // `w` as the last count of an operator: stop at the end of the line (Vim's fwd_word eol rule)
    wordFwdEol(p, big) {
      const L = this.L;
      let { r, c } = p;
      let line = L[r];
      if (line.length === 0) return r >= L.length - 1 ? { r, c: 0 } : { r: r + 1, c: 0 };
      const k = cls(line[c], big);
      if (k !== 0) while (c < line.length && cls(line[c], big) === k) c++;
      if (c >= line.length) return { r, c: line.length };
      while (c < line.length && cls(line[c], big) === 0) c++;
      return { r, c };
    }
    wordEnd(p, big) {
      const L = this.L;
      let { r, c } = p;
      let line = L[r];
      c++;
      for (;;) {
        if (c >= line.length) {
          if (r >= L.length - 1) return { r, c: Math.max(0, line.length - 1) };
          r++;
          c = 0;
          line = L[r];
          continue;
        }
        if (cls(line[c], big) === 0) {
          c++;
          continue;
        }
        break;
      }
      const k = cls(line[c], big);
      while (c + 1 < line.length && cls(line[c + 1], big) === k) c++;
      return { r, c };
    }
    wordBack(p, big) {
      const L = this.L;
      let { r, c } = p;
      let line = L[r];
      c--;
      for (;;) {
        if (c < 0) {
          if (r === 0) return { r: 0, c: 0 };
          r--;
          line = L[r];
          c = line.length - 1;
          if (line.length === 0) return { r, c: 0 };
          continue;
        }
        if (cls(line[c], big) === 0) {
          c--;
          continue;
        }
        break;
      }
      const k = cls(line[c], big);
      while (c > 0 && cls(line[c - 1], big) === k) c--;
      return { r, c };
    }
    wordEndBack(p, big) {
      const L = this.L;
      let { r, c } = p;
      let line = L[r];
      const k0 = cls(line[c], big);
      if (k0 !== 0) while (c >= 0 && cls(line[c], big) === k0) c--;
      for (;;) {
        if (c < 0) {
          if (r === 0) return { r: 0, c: 0 };
          r--;
          line = L[r];
          c = line.length - 1;
          if (line.length === 0) return { r, c: 0 };
          continue;
        }
        if (cls(line[c], big) === 0) {
          c--;
          continue;
        }
        return { r, c };
      }
    }

    // ---------- char find (flash char mode: multi-line, clever-f) ----------
    findChar(k, ch, n, repeat) {
      const L = this.L;
      let { r, c } = this.cur;
      const fwd = k === 'f' || k === 't';
      const till = k === 't' || k === 'T';
      let res = null;
      for (let i = 0; i < n; i++) {
        let rr = r,
          cc = c + (fwd ? 1 : -1);
        if (till && (repeat || i > 0)) cc += fwd ? 1 : -1;
        let found = null;
        while (rr >= 0 && rr < L.length) {
          const line = L[rr];
          if (fwd) {
            const j = line.indexOf(ch, Math.max(0, cc));
            if (j >= 0) {
              found = { r: rr, c: j };
              break;
            }
            rr++;
            cc = 0;
          } else {
            const j = cc < 0 ? -1 : line.lastIndexOf(ch, cc);
            if (j >= 0) {
              found = { r: rr, c: j };
              break;
            }
            rr--;
            if (rr >= 0) cc = L[rr].length - 1;
          }
        }
        if (!found) break;
        r = found.r;
        c = found.c;
        res = found;
        if (till) {
          c += fwd ? -1 : 1;
          res = { r, c };
        }
      }
      if (!res) return null;
      if (res.c < 0) res.c = 0;
      return { r: res.r, c: res.c, type: fwd ? 'incl' : 'excl' };
    }

    // ---------- pairs / brackets ----------
    bracketPairs(types) {
      const t = this.text();
      const stacks = {};
      const out = [];
      for (let i = 0; i < t.length; i++) {
        const ch = t[i];
        if (types.includes(ch) && OPEN[ch]) (stacks[ch] = stacks[ch] || []).push(i);
        else if (CLOSE[ch] && types.includes(CLOSE[ch])) {
          const st = stacks[CLOSE[ch]];
          if (st && st.length) out.push({ o: st.pop(), c: i, ch: CLOSE[ch] });
        }
      }
      return out;
    }
    quotePairs(q) {
      const out = [];
      let o = 0;
      for (const line of this.L) {
        let open = -1;
        for (let i = 0; i < line.length; i++) {
          if (line[i] === q && line[i - 1] !== '\\') {
            if (open < 0) open = i;
            else {
              out.push({ o: o + open, c: o + i, ch: q });
              open = -1;
            }
          }
        }
        o += line.length + 1;
      }
      return out;
    }
    // choose a pair: method 'cover_or_next' | 'cover' | 'next' | 'last'
    pickPair(pairs, at, method) {
      const cover = pairs.filter((p) => p.o <= at && at <= p.c).sort((a, b) => a.c - a.o - (b.c - b.o));
      if (method === 'next') return pairs.filter((p) => p.o > at).sort((a, b) => a.o - b.o)[0] || null;
      if (method === 'last') return pairs.filter((p) => p.c < at).sort((a, b) => b.c - a.c)[0] || null;
      if (cover.length) return cover[0];
      if (method === 'cover') return null;
      return pairs.filter((p) => p.o > at).sort((a, b) => a.o - b.o)[0] || null;
    }
    pairsFor(ch) {
      if (ch === 'b') return this.bracketPairs('([{');
      if (ch === 'q') return [...this.quotePairs('"'), ...this.quotePairs("'"), ...this.quotePairs('`')];
      if (OPEN[ch]) return this.bracketPairs(ch);
      if (CLOSE[ch]) return this.bracketPairs(CLOSE[ch]);
      if (QUOTES.includes(ch)) return this.quotePairs(ch);
      return null;
    }

    // ---------- function / indent helpers ----------
    fnHeaders() {
      const L = this.L;
      const ft = this.buf.ft;
      const out = [];
      for (let i = 0; i < L.length; i++) {
        const s = L[i];
        let hit = false;
        if (ft === 'python') hit = /^\s*(async\s+)?def\s/.test(s);
        else if (ft === 'lua') hit = /\bfunction\b/.test(s) && !/\bend\b\s*\)?,?\s*$/.test(s);
        else
          hit =
            (/\bfunction\b/.test(s) || /=>\s*\{\s*$/.test(s) || /^\s*(async\s+)?(?!if\b|for\b|while\b|switch\b|catch\b)[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{\s*$/.test(s)) &&
            s.includes('{');
        if (!hit) continue;
        const end = this.fnEnd(i);
        if (end !== null) out.push({ r1: i, r2: end });
      }
      return out;
    }
    fnEnd(i) {
      const L = this.L;
      const ft = this.buf.ft;
      const ind = indentOf(L[i]).length;
      if (ft === 'python') {
        let last = i;
        for (let j = i + 1; j < L.length; j++) {
          if (L[j].trim() === '') continue;
          if (indentOf(L[j]).length <= ind) break;
          last = j;
        }
        return last;
      }
      if (ft === 'lua') {
        for (let j = i + 1; j < L.length; j++) if (indentOf(L[j]).length === ind && /^\s*end\b/.test(L[j])) return j;
        return null;
      }
      const o = this.off(i, L[i].lastIndexOf('{'));
      const p = this.bracketPairs('{').find((q) => q.o === o);
      return p ? this.pos(p.c).r : null;
    }
    lineIndent(i) {
      const L = this.L;
      if (L[i].trim() !== '') return indentOf(L[i]).length;
      let up = -1,
        dn = -1;
      for (let j = i - 1; j >= 0; j--)
        if (L[j].trim() !== '') {
          up = indentOf(L[j]).length;
          break;
        }
      for (let j = i + 1; j < L.length; j++)
        if (L[j].trim() !== '') {
          dn = indentOf(L[j]).length;
          break;
        }
      return Math.max(up, dn, 0);
    }
    indentScope(r) {
      const L = this.L;
      let level = this.lineIndent(r);
      let start = r;
      if (r + 1 < L.length && L[r].trim() !== '' && this.lineIndent(r + 1) > level) {
        level = this.lineIndent(r + 1);
        start = r + 1;
      }
      let r1 = start,
        r2 = start;
      while (r1 > 0 && (L[r1 - 1].trim() === '' || this.lineIndent(r1 - 1) >= level)) r1--;
      while (r2 < L.length - 1 && (L[r2 + 1].trim() === '' || this.lineIndent(r2 + 1) >= level)) r2++;
      while (r1 < r2 && L[r1].trim() === '') r1++;
      while (r2 > r1 && L[r2].trim() === '') r2--;
      return { r1, r2, level };
    }

    // ---------- text objects ----------
    *textObject(ai, n) {
      let k = yield 'cmd';
      let method = 'cover_or_next';
      if (k === 'n' || k === 'l') {
        method = k === 'n' ? 'next' : 'last';
        k = yield 'cmd';
      }
      return this.objectRange(ai, k, method);
    }
    objectRange(ai, k, method) {
      const L = this.L;
      const { r, c } = this.cur;
      const at = this.off(r, c);
      const inner = ai === 'i';
      const line = L[r];
      if (k === 'w' || k === 'W') {
        const big = k === 'W';
        if (line.length === 0) return { kind: 'char', s: at, e: at };
        const kk = cls(line[c], big);
        let s = c,
          e = c;
        while (s > 0 && cls(line[s - 1], big) === kk) s--;
        while (e + 1 < line.length && cls(line[e + 1], big) === kk) e++;
        if (!inner) {
          if (kk !== 0) {
            if (e + 1 < line.length && isWS(line[e + 1])) {
              while (e + 1 < line.length && isWS(line[e + 1])) e++;
            } else {
              while (s > 0 && isWS(line[s - 1])) s--;
            }
          } else if (e + 1 < line.length) {
            const k2 = cls(line[e + 1], big);
            e++;
            while (e + 1 < line.length && cls(line[e + 1], big) === k2) e++;
          }
        }
        return { kind: 'char', s: this.off(r, s), e: this.off(r, e) + 1 };
      }
      if (k === 'p') {
        const blank = (i) => L[i].trim() === '';
        const b = blank(r);
        let r1 = r,
          r2 = r;
        while (r1 > 0 && blank(r1 - 1) === b) r1--;
        while (r2 < L.length - 1 && blank(r2 + 1) === b) r2++;
        if (!inner) {
          if (r2 < L.length - 1) {
            const nb = blank(r2 + 1);
            while (r2 < L.length - 1 && blank(r2 + 1) === nb) r2++;
          } else if (!b) while (r1 > 0 && blank(r1 - 1)) r1--;
        }
        return { kind: 'line', r1, r2 };
      }
      if (k === 'g') {
        if (!inner) return { kind: 'line', r1: 0, r2: L.length - 1 };
        let r1 = 0,
          r2 = L.length - 1;
        while (r1 < r2 && L[r1].trim() === '') r1++;
        while (r2 > r1 && L[r2].trim() === '') r2--;
        return { kind: 'line', r1, r2 };
      }
      if (k === 'i') {
        const sc = this.indentScope(r);
        if (inner) return { kind: 'line', r1: sc.r1, r2: sc.r2 };
        return { kind: 'line', r1: Math.max(0, sc.r1 - 1), r2: Math.min(L.length - 1, sc.r2 + 1) };
      }
      if (k === 'f') {
        const fns = this.fnHeaders().map((f) => ({ o: f.r1, c: f.r2 }));
        const f = this.pickPair(fns, r, method);
        if (!f) return null;
        if (!inner) return { kind: 'line', r1: f.o, r2: f.c };
        if (this.buf.ft === 'python') return f.c > f.o ? { kind: 'line', r1: f.o + 1, r2: f.c } : null;
        if (f.c - f.o >= 2) return { kind: 'line', r1: f.o + 1, r2: f.c - 1 };
        return null;
      }
      if (k === 'd') {
        const ds = [];
        const t = this.text();
        const re = /\d+/g;
        let m;
        while ((m = re.exec(t))) ds.push({ o: m.index, c: m.index + m[0].length - 1 });
        const p = this.pickPair(ds, at, method);
        return p ? { kind: 'char', s: p.o, e: p.c + 1 } : null;
      }
      if (k === 'e') {
        const segs = [];
        const re = /[A-Z][a-z0-9]+|[A-Z]+(?![a-z])|[a-z0-9]+/g;
        let m;
        const tt = this.text();
        while ((m = re.exec(tt))) segs.push({ o: m.index, c: m.index + m[0].length - 1 });
        const p = this.pickPair(segs, at, method);
        return p ? { kind: 'char', s: p.o, e: p.c + 1 } : null;
      }
      if (k === 'a') return this.argRange(inner, at, method);
      if (k === 'u' || k === 'U') {
        const t = this.text();
        const calls = this.bracketPairs('(')
          .map((p) => {
            let s = p.o;
            const re = k === 'u' ? /[\w.$]/ : /[\w$]/;
            while (s > 0 && re.test(t[s - 1])) s--;
            return s < p.o ? { o: s, c: p.c, ip: p.o } : null;
          })
          .filter(Boolean);
        const p = this.pickPair(calls, at, method);
        if (!p) return null;
        return inner ? { kind: 'char', s: p.ip + 1, e: p.c } : { kind: 'char', s: p.o, e: p.c + 1 };
      }
      const pairs = this.pairsFor(k);
      if (!pairs) return null;
      const p = this.pickPair(pairs, at, method);
      if (!p) return null;
      if (!inner) return { kind: 'char', s: p.o, e: p.c + 1 };
      let s = p.o + 1,
        e = p.c;
      if (OPEN[k] && k !== '<') {
        const t = this.text();
        while (s < e && /\s/.test(t[s])) s++;
        while (e > s && /\s/.test(t[e - 1])) e--;
      }
      return { kind: 'char', s, e };
    }
    argRange(inner, at, method) {
      const t = this.text();
      const trim = ([a, b]) => {
        while (a < b && /\s/.test(t[a])) a++;
        while (b > a && /\s/.test(t[b - 1])) b--;
        return [a, b];
      };
      const cands = [];
      for (const p of this.bracketPairs('([{')) {
        if (t.slice(p.o + 1, p.c).trim() === '') continue;
        const spans = [];
        let depth = 0,
          quote = null,
          st = p.o + 1;
        for (let i = p.o + 1; i < p.c; i++) {
          const ch = t[i];
          if (quote) {
            if (ch === quote && t[i - 1] !== '\\') quote = null;
            continue;
          }
          if (QUOTES.includes(ch)) quote = ch;
          else if ('([{'.includes(ch)) depth++;
          else if (')]}'.includes(ch)) depth--;
          else if (ch === ',' && depth === 0) {
            spans.push([st, i]);
            st = i + 1;
          }
        }
        spans.push([st, p.c]);
        spans.forEach((sp, i) => {
          const [a, b] = trim(sp);
          let oa = a,
            ob = b;
          if (spans.length > 1) {
            if (i > 0) oa = trim(spans[i - 1])[1];
            else ob = sp[1] + 1;
          }
          cands.push({ o: sp[0], c: Math.max(sp[0], sp[1] - 1), ia: a, ib: b, oa, ob });
        });
      }
      const p = this.pickPair(cands, at, method);
      if (!p) return null;
      return inner ? { kind: 'char', s: p.ia, e: p.ib } : { kind: 'char', s: p.oa, e: p.ob };
    }

    // ---------- range helpers ----------
    rangeFrom(m) {
      const { r, c } = this.cur;
      if (m.type === 'line') return { kind: 'line', r1: Math.min(r, m.r), r2: Math.max(r, m.r) };
      let a = { r, c },
        b = { r: m.r, c: m.c };
      if (b.r < a.r || (b.r === a.r && b.c < a.c)) [a, b] = [b, a];
      if (m.type === 'incl') {
        const len = this.L[b.r].length;
        if (m.nl && len === 0 && b.r < this.L.length - 1) return { kind: 'char', s: this.off(a.r, a.c), e: this.off(b.r, 0) + 1 };
        return { kind: 'char', s: this.off(a.r, a.c), e: this.off(b.r, Math.min(len, b.c + 1)) };
      }
      if (b.c === 0 && b.r > a.r) {
        if (a.c <= indentOf(this.L[a.r]).length) return { kind: 'line', r1: a.r, r2: b.r - 1, fnb: true };
        return { kind: 'char', s: this.off(a.r, a.c), e: this.off(b.r - 1, this.L[b.r - 1].length) };
      }
      return { kind: 'char', s: this.off(a.r, a.c), e: this.off(b.r, b.c) };
    }
    rangeText(rg) {
      if (rg.kind === 'line') return this.L.slice(rg.r1, rg.r2 + 1).join('\n');
      return this.text().slice(rg.s, rg.e);
    }
    deleteRange(rg, reg, noReg) {
      const L = this.L;
      if (rg.kind === 'line') {
        const removed = L.splice(rg.r1, rg.r2 - rg.r1 + 1);
        if (!noReg) this.setReg(reg, removed.join('\n'), true);
        if (!L.length) L.push('');
        const nr = Math.min(rg.r1, L.length - 1);
        if (rg.fnb) this.setCur(nr, fnbCol(L[nr]));
        else this.setCur(nr, this.wantCol(nr), true);
        return;
      }
      const t = this.text();
      if (!noReg) this.setReg(reg, t.slice(rg.s, rg.e), false);
      this.setText(t.slice(0, rg.s) + t.slice(rg.e));
      const p = this.pos(rg.s);
      this.setCur(p.r, p.c);
    }

    // ---------- the normal-mode command ----------
    *normalCmd() {
      this.mode = 'normal';
      let k = yield 'cmd';
      let reg = null;
      if (k === '"') {
        reg = yield 'text';
        k = yield 'cmd';
      }
      let count = 0;
      while (/^[1-9]$/.test(k) || (count && k === '0')) {
        count = count * 10 + +k;
        k = yield 'cmd';
      }
      const n = count || 1;
      const wasChar = this.charActive;
      this.charActive = false;
      this.popup = null;
      if (k !== ':' ) this.msg = this.msg && k === '<Esc>' ? '' : this.msg;
      const L = this.L;
      const b = this.buf;

      if (wasChar && this.lastFind && k.length === 1 && 'fFtT'.includes(k) && k.toLowerCase() === this.lastFind.k.toLowerCase()) {
        const m = this.repeatFind(k, n);
        if (m) {
          this.moveTo(m);
          this.charActive = true;
        }
        return;
      }

      switch (k) {
        case '<Esc>':
          this.hl = false;
          this.msg = '';
          return;
        case 'i':
          return yield* this.insert();
        case 'a':
          if (L[b.r].length) b.c++;
          return yield* this.insert();
        case 'I':
          b.c = L[b.r].trim() === '' ? L[b.r].length : fnbCol(L[b.r]);
          return yield* this.insert();
        case 'A':
          b.c = L[b.r].length;
          return yield* this.insert();
        case 'o':
        case 'O': {
          const ind = indentOf(L[b.r]) + (k === 'o' && this.opensBlock(L[b.r]) ? '  ' : '');
          const at = k === 'o' ? b.r + 1 : b.r;
          L.splice(at, 0, ind);
          b.r = at;
          b.c = ind.length;
          this.aiLine = at;
          return yield* this.insert();
        }
        case 'v':
        case 'V':
          return yield* this.visual(k === 'V' ? 'line' : 'char');
        case 'x':
        case 'X': {
          if (!L[b.r].length) return;
          const m = k === 'x' ? { r: b.r, c: Math.min(L[b.r].length, b.c + n), type: 'excl' } : { r: b.r, c: Math.max(0, b.c - n), type: 'excl' };
          const rg = this.rangeFrom(m);
          if (rg.s === rg.e) return;
          this.deleteRange(rg, reg);
          return;
        }
        case 'D':
        case 'C':
        case 'Y': {
          const r2 = Math.min(L.length - 1, b.r + n - 1);
          const rg = { kind: 'char', s: this.off(b.r, b.c), e: this.off(r2, L[r2].length) };
          if (k === 'Y') {
            this.setReg(reg, this.rangeText(rg), false, true);
            return;
          }
          this.deleteRange(rg, reg);
          if (k === 'C') return yield* this.insert();
          this.setCur(b.r, b.c);
          return;
        }
        case 'p':
        case 'P':
          this.paste(k === 'p', n, reg);
          return;
        case 'u':
          this.noUndo = true;
          this.undo(n);
          return;
        case '<C-r>':
          this.noUndo = true;
          this.redoN(n);
          return;
        case '.': {
          if (!this.lastChange) return;
          let keys = this.lastChange.slice();
          if (count) {
            let i = 0;
            if (keys[0] === '"') i = 2;
            let j = i;
            while (j < keys.length && /^[0-9]$/.test(keys[j]) && !(j === i && keys[j] === '0')) j++;
            keys = [...keys.slice(0, i), ...String(count).split(''), ...keys.slice(j)];
          }
          this.queue.unshift(...keys.map((x) => [x, 'dot']));
          return;
        }
        case 'J': {
          const times = Math.min(Math.max(1, n - 1), L.length - 1 - b.r);
          if (times <= 0) {
            this.setCur(b.r, 0);
            return;
          }
          for (let i = 0; i < times && b.r < L.length - 1; i++) {
            const curL = L[b.r];
            const nt = L[b.r + 1].replace(/^\s+/, '');
            const sep = curL.length === 0 || /\s$/.test(curL) || nt === '' || nt[0] === ')' ? '' : ' ';
            L[b.r] = curL + sep + nt;
            L.splice(b.r + 1, 1);
            b.c = curL.length + (sep ? 0 : 0) - (sep ? 0 : curL.length && !nt ? 1 : 0);
            if (sep) b.c = curL.length;
            else b.c = Math.max(0, curL.length - (nt === '' ? 1 : 0));
          }
          this.setCur(b.r, b.c);
          return;
        }
        case 'r': {
          const ch = yield 'text';
          if (ch.length !== 1) return;
          if (b.c + n > L[b.r].length) return;
          L[b.r] = L[b.r].slice(0, b.c) + ch.repeat(n) + L[b.r].slice(b.c + n);
          this.setCur(b.r, b.c + n - 1);
          return;
        }
        case '~': {
          const line = L[b.r];
          const e = Math.min(line.length, b.c + n);
          const seg = [...line.slice(b.c, e)].map((ch) => (ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase())).join('');
          L[b.r] = line.slice(0, b.c) + seg + line.slice(e);
          this.setCur(b.r, e);
          return;
        }
        case '<C-a>':
        case '<C-x>': {
          const line = L[b.r];
          const re = /-?\d+/g;
          let m;
          while ((m = re.exec(line))) {
            if (m.index + m[0].length > b.c) {
              const v = parseInt(m[0], 10) + (k === '<C-a>' ? n : -n);
              const s = String(v);
              L[b.r] = line.slice(0, m.index) + s + line.slice(m.index + m[0].length);
              this.setCur(b.r, m.index + s.length - 1);
              return;
            }
          }
          return;
        }
        case 'q': {
          if (this.recording) {
            const rec = this.recording;
            rec.keys.pop();
            this.macros[rec.reg] = rec.keys;
            this.recording = null;
            this.say('');
            return;
          }
          const rg = yield 'text';
          if (!/^[a-z]$/.test(rg)) return;
          this.recording = { reg: rg, keys: [] };
          this.noUndo = true;
          return;
        }
        case '@': {
          let rg = yield 'text';
          if (rg === '@') rg = this.lastMacro;
          if (!rg || !this.macros[rg]) return;
          this.lastMacro = rg;
          const keys = [];
          for (let i = 0; i < n; i++) keys.push(...this.macros[rg]);
          this.queue.unshift(...keys.map((x) => [x, 'macro']));
          return;
        }
        case ':': {
          const s = yield* this.prompt(':', count ? `.,.+${count - 1}` : '');
          if (s !== null) this.ex(s);
          return;
        }
        case '<C-s>':
          this.say(`"${b.name}" written`);
          this.emit('write');
          return;
        case '<A-j>':
        case '<A-k>':
          this.moveLines(b.r, b.r, k === '<A-j>' ? n : -n);
          return;
        case 'H':
        case 'L':
          this.cycleBuffer(k === 'L' ? n : -n);
          return;
        case 'K': {
          const w = this.wordUnder();
          if (w) this.popup = { r: b.r, c: b.c, text: this.hover[w.word] || `${w.word}: no hover info` };
          return;
        }
        case 'S': {
          const rg = yield* this.flashTS();
          if (!rg) return;
          const s = this.pos(rg.s),
            e = this.pos(Math.max(rg.s, rg.e - 1));
          return yield* this.visual('char', { ar: s.r, ac: s.c, r: e.r, c: e.c });
        }
        case 'z':
          yield 'cmd';
          return;
        case '<C-o>':
        case '<C-i>':
        case '<Tab>': {
          const from = k === '<C-o>' ? this.jumps : this.jumpFwd;
          const to = k === '<C-o>' ? this.jumpFwd : this.jumps;
          const j = from.pop();
          if (!j) return;
          to.push({ buf: this.buf, r: b.r, c: b.c });
          if (this.files.includes(j.buf)) this.openBuffer(j.buf);
          this.setCur(j.r, j.c);
          return;
        }
        case ' ':
          return yield* this.leader();
        case 'd':
        case 'c':
        case 'y':
        case '>':
        case '<':
        case '=':
          return yield* this.operator(k, count, reg);
        case 'g': {
          const k2 = yield 'cmd';
          if (k2 === 'c') {
            const k3 = yield 'cmd';
            if (k3 === 'o' || k3 === 'O') return yield* this.commentLine(k3 === 'o');
            return yield* this.operator('gc', count, reg, k3);
          }
          if (k2 === 'U' || k2 === 'u' || k2 === '~') return yield* this.operator('g' + k2, count, reg);
          if (k2 === 's') {
            const k3 = yield 'cmd';
            if (k3 === 'a') return yield* this.operator('gsa', count, reg);
            if (k3 === 'd' || k3 === 'r') return yield* this.surroundChange(k3);
            this.say('mini.surround: only gsa, gsd and gsr are in this game');
            return;
          }
          if (k2 === 'd') return this.gotoDef();
          if (k2 === 'r') return this.refsList();
          const m = yield* this.motion('g' + k2, count, null);
          if (m) this.moveTo(m);
          return;
        }
        case ']':
        case '[': {
          const k2 = yield 'cmd';
          const fwd = k === ']';
          if (k2 === 'd' || k2 === 'e' || k2 === 'w') return this.jumpDiag(fwd, n);
          if (k2 === ']' || k2 === '[') return this.jumpRef(fwd, n);
          if (k2 === 'b') return this.cycleBuffer(fwd ? n : -n);
          const m = yield* this.motion(k + k2, count, null);
          if (m) this.moveTo(m);
          return;
        }
        default: {
          const m = yield* this.motion(k, count, null);
          if (m) this.moveTo(m);
          else if (m === undefined) this.say(`${k} is not a command here`, true);
        }
      }
    }

    opensBlock(s) {
      const ft = this.buf.ft;
      if (/[\[{(]\s*$/.test(s)) return true;
      if (ft === 'python' && /:\s*$/.test(s)) return true;
      if (ft === 'lua' && /(\bthen|\bdo|\bfunction\b.*\))\s*$/.test(s)) return true;
      return false;
    }

    moveTo(m) {
      if (m.jump) {
        this.jumps.push({ buf: this.buf, r: this.buf.r, c: this.buf.c });
        this.jumpFwd = [];
      }
      const b = this.buf;
      const max = Math.max(0, this.L[m.r].length - 1);
      b.r = m.r;
      b.c = Math.min(m.c, this.mode === 'insert' ? this.L[m.r].length : max);
      if (m.want !== undefined) b.want = m.want;
      else if (!m.keepWant) b.want = b.c;
    }

    repeatFind(k, n) {
      const lf = this.lastFind;
      const base = lf.k;
      let use;
      if (k === base.toLowerCase()) use = base;
      else if (k === base.toUpperCase()) use = base === base.toLowerCase() ? base.toUpperCase() : base.toLowerCase();
      else return this.findChar(k, lf.ch, n, false);
      return this.findChar(use, lf.ch, n, true);
    }

    // ---------- motions ----------
    *motion(k, count, op) {
      const n = count || 1;
      const L = this.L;
      const { r, c } = this.cur;
      switch (k) {
        case 'h':
        case '<Left>':
          if (op && c === 0) return null;
          return { r, c: Math.max(0, c - n), type: 'excl' };
        case 'l':
        case '<Right>': {
          const lim = op ? L[r].length : Math.max(0, L[r].length - 1);
          return { r, c: Math.min(lim, c + n), type: 'excl' };
        }
        case 'j':
        case '<Down>':
        case 'k':
        case '<Up>': {
          const d = k === 'j' || k === '<Down>' ? n : -n;
          const nr = Math.max(0, Math.min(L.length - 1, r + d));
          if (op && nr === r) return null;
          return { r: nr, c: this.wantCol(nr), type: 'line', keepWant: true };
        }
        case '0':
        case '<Home>':
          return { r, c: 0, type: 'excl' };
        case '^':
          return { r, c: fnbCol(L[r]), type: 'excl' };
        case '$':
        case '<End>': {
          const nr = Math.min(L.length - 1, r + n - 1);
          return { r: nr, c: Math.max(0, L[nr].length - 1), type: 'incl', want: Infinity };
        }
        case 'w':
        case 'W': {
          const big = k === 'W';
          if (op === 'c' && cls(L[r][c], big) !== 0) {
            let p = { r, c };
            for (let i = 0; i < n; i++) {
              const pe = this.wordEnd(i === 0 ? { r: p.r, c: p.c - 1 } : p, big);
              p = pe;
            }
            return { r: p.r, c: p.c, type: 'incl' };
          }
          let p = { r, c };
          for (let i = 0; i < n; i++) p = op && i === n - 1 ? this.wordFwdEol(p, big) : this.wordFwd(p, big, false);
          return { r: p.r, c: p.c, type: 'excl', noLine: !!op && p.r === r };
        }
        case 'b':
        case 'B': {
          if (op && r === 0 && c === 0) return null;
          let p = { r, c };
          for (let i = 0; i < n; i++) p = this.wordBack(p, k === 'B');
          return { r: p.r, c: p.c, type: 'excl' };
        }
        case 'e':
        case 'E': {
          let p = { r, c };
          for (let i = 0; i < n; i++) p = this.wordEnd(p, k === 'E');
          return { r: p.r, c: p.c, type: 'incl' };
        }
        case 'ge':
        case 'gE': {
          let p = { r, c };
          for (let i = 0; i < n; i++) p = this.wordEndBack(p, k === 'gE');
          return { r: p.r, c: p.c, type: 'incl' };
        }
        case 'gg':
        case 'G':
        case '<C-End>': {
          const nr = count ? Math.min(L.length, count) - 1 : k === 'gg' ? 0 : L.length - 1;
          return { r: nr, c: this.wantCol(nr), type: 'line', jump: true, keepWant: true };
        }
        case 'f':
        case 'F':
        case 't':
        case 'T': {
          const ch = yield 'text';
          if (ch.length !== 1) return null;
          this.lastFind = { k, ch };
          const m = this.findChar(k, ch, n, false);
          if (!op) this.charActive = true;
          return m;
        }
        case ';':
        case ',': {
          if (!this.lastFind) return null;
          const lf = this.lastFind;
          const kk = k === ';' ? lf.k : lf.k === lf.k.toLowerCase() ? lf.k.toUpperCase() : lf.k.toLowerCase();
          if (!op) this.charActive = true;
          return this.findChar(kk, lf.ch, n, true);
        }
        case '%': {
          const line = L[r];
          let i = c;
          while (i < line.length && !'()[]{}'.includes(line[i])) i++;
          const fail = op ? { r, c, type: 'incl', nl: true } : null;
          if (i >= line.length) return fail;
          const o = this.off(r, i);
          const ch = line[i];
          const pr = this.bracketPairs(OPEN[ch] ? ch : CLOSE[ch]).find((p) => p.o === o || p.c === o);
          if (!pr) return fail;
          const t = pr.o === o ? pr.c : pr.o;
          const p = this.pos(t);
          return { r: p.r, c: p.c, type: 'incl', jump: true };
        }
        case '}':
        case '{': {
          let i = r;
          const fwd = k === '}';
          for (let t = 0; t < n; t++) {
            if (fwd) {
              if (t > 0 || L[i] === '') i++;
              while (i < L.length && L[i] === '') i++;
              while (i < L.length && L[i] !== '') i++;
              if (i >= L.length) return { r: L.length - 1, c: Math.max(0, L[L.length - 1].length - (op ? 0 : 1)), type: op ? 'excl' : 'excl', jump: true };
            } else {
              if (t > 0 || L[i] === '') i--;
              while (i > 0 && L[i] === '') i--;
              while (i > 0 && L[i] !== '') i--;
              if (i <= 0) return { r: 0, c: 0, type: 'excl', jump: true };
            }
          }
          return { r: i, c: 0, type: 'excl', jump: true };
        }
        case 'n':
        case 'N': {
          if (!this.lastSearch) return null;
          const fwd = k === 'n';
          const p = this.searchFrom(this.lastSearch, fwd, n);
          if (!p) {
            this.say('E486: Pattern not found: ' + this.lastSearch, true);
            return null;
          }
          this.hl = true;
          return { r: p.r, c: p.c, type: 'excl', jump: true };
        }
        case '*':
        case '#': {
          let w = this.wordUnder();
          let pat;
          if (w) pat = '\\<' + w.word + '\\>';
          else {
            const line = L[r];
            let s0 = c;
            while (s0 < line.length && isWS(line[s0])) s0++;
            if (s0 >= line.length) return null;
            let e0 = s0;
            while (e0 + 1 < line.length && !isWS(line[e0 + 1])) e0++;
            w = { word: line.slice(s0, e0 + 1), s: s0 };
            pat = w.word.replace(/[\\.*\[\]^$~/]/g, '\\$&');
          }
          this.lastSearch = pat;
          this.lastSearchIcase = true;
          this.hl = true;
          this.buf.c = w.s;
          const p = this.searchFrom(this.lastSearch, k === '*', n, true);
          this.buf.c = c;
          return p ? { r: p.r, c: p.c, type: 'excl', jump: true } : null;
        }
        case '/':
        case '?': {
          const s = yield* this.prompt(k);
          if (s === null) return null;
          if (s !== '') {
            this.lastSearch = s;
            this.lastSearchIcase = false;
          }
          if (!this.lastSearch) return null;
          const p = this.searchFrom(this.lastSearch, k === '/', n);
          if (!p) {
            this.say('E486: Pattern not found: ' + this.lastSearch, true);
            return null;
          }
          this.hl = true;
          return { r: p.r, c: p.c, type: 'excl', jump: true };
        }
        case 's': {
          const p = yield* this.flashJump();
          if (!p) return null;
          return { r: p.r, c: p.c, type: op ? 'incl' : 'excl', jump: true };
        }
        case ']f':
        case '[f': {
          const hs = this.fnHeaders().map((f) => f.r1);
          const t = k === ']f' ? hs.find((h) => h > r) : hs.filter((h) => h < r).pop();
          if (t === undefined) return null;
          return { r: t, c: fnbCol(L[t]), type: 'excl', jump: true };
        }
        default:
          return undefined;
      }
    }

    wordUnder() {
      const line = this.L[this.buf.r];
      let c = this.buf.c;
      while (c < line.length && !isKW(line[c])) c++;
      if (c >= line.length) return null;
      let s = c,
        e = c;
      while (s > 0 && isKW(line[s - 1])) s--;
      while (e + 1 < line.length && isKW(line[e + 1])) e++;
      return { word: line.slice(s, e + 1), s, e };
    }

    searchFrom(pat, fwd, n, inclusiveStart) {
      const re = makeRe(pat, 'g');
      if (!re) return null;
      if (this.lastSearchIcase && !re.flags.includes('i')) return this.searchFromRe(new RegExp(re.source, 'gi'), fwd, n, inclusiveStart);
      return this.searchFromRe(re, fwd, n, inclusiveStart);
    }
    searchFromRe(re, fwd, n) {
      const t = this.text();
      const all = [];
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(t))) {
        all.push(m.index);
        if (m[0].length === 0) re.lastIndex++;
      }
      if (!all.length) return null;
      let at = this.off(this.buf.r, this.buf.c);
      for (let i = 0; i < n; i++) {
        let nx;
        if (fwd) nx = all.find((o) => o > at);
        else nx = [...all].reverse().find((o) => o < at);
        if (nx === undefined) {
          nx = fwd ? all[0] : all[all.length - 1];
          this.say('search hit BOTTOM, continuing at TOP');
        }
        at = nx;
      }
      return this.pos(at);
    }
    searchMatches() {
      if (!this.hl && !(this.cmdline && (this.cmdline.prefix === '/' || this.cmdline.prefix === '?'))) return [];
      const pat = this.cmdline && (this.cmdline.prefix === '/' || this.cmdline.prefix === '?') ? this.cmdline.text : this.lastSearch;
      if (!pat) return [];
      let re = makeRe(pat, 'g');
      if (!re) return [];
      if (this.lastSearchIcase && !(this.cmdline && this.cmdline.text)) re = new RegExp(re.source, 'gi');
      const out = [];
      this.L.forEach((line, r) => {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line))) {
          if (m[0].length === 0) {
            re.lastIndex++;
            continue;
          }
          out.push({ r, c: m.index, len: m[0].length });
        }
      });
      return out;
    }

    // ---------- operators ----------
    *operator(op, count, reg, firstKey) {
      const dbl = { d: 'd', c: 'c', y: 'y', '>': '>', '<': '<', '=': '=', gc: 'c', gU: 'U', gu: 'u', 'g~': '~' }[op];
      let k = firstKey !== undefined ? firstKey : yield 'cmd';
      let c2 = 0;
      while (/^[1-9]$/.test(k) || (c2 && k === '0')) {
        c2 = c2 * 10 + +k;
        k = yield 'cmd';
      }
      const hasCount = count || c2;
      const n = (count || 1) * (c2 || 1);
      const L = this.L;
      const b = this.buf;
      let rg = null;
      if (k === 'g' || k === ']' || k === '[') {
        const k2 = yield 'cmd';
        if (op.startsWith('g') && k === 'g' && k2 === dbl) k = dbl;
        else k = k + k2;
      }
      if (k === dbl || (op.length === 2 && k === op)) {
        if (b.r + n - 1 > L.length - 1 && n > 1) return;
        rg = { kind: 'line', r1: b.r, r2: Math.min(L.length - 1, b.r + n - 1) };
      } else if (k === 'i' || k === 'a') {
        rg = yield* this.textObject(k, n);
        if (!rg && op === 'c') return yield* this.insert();
      } else if (k === 'r') {
        return yield* this.remote(op, reg);
      } else if (k === 'S') {
        rg = yield* this.flashTS();
      } else if (k === '<Esc>') {
        return;
      } else {
        const m = yield* this.motion(k, hasCount ? n : 0, op);
        if (!m) return;
        rg = this.rangeFrom(m);
        if (m.noLine && rg.kind === 'line') rg = { kind: 'char', s: this.off(b.r, b.c), e: this.off(m.r, m.c) };
      }
      if (!rg) return;
      return yield* this.applyOp(op, rg, reg);
    }

    *remote(op, reg) {
      const save = { r: this.buf.r, c: this.buf.c };
      const len0 = this.text().length;
      const saveOff = this.off(save.r, save.c);
      const t = yield* this.flashJump();
      if (!t) return;
      this.setCur(t.r, t.c);
      const k = yield 'cmd';
      let rg;
      if (k === 'i' || k === 'a') rg = yield* this.textObject(k, 1);
      else {
        const m = yield* this.motion(k, 0, op);
        if (!m) return;
        rg = this.rangeFrom(m);
      }
      if (!rg) return;
      const sAt = rg.kind === 'line' ? this.off(rg.r1, 0) : rg.s;
      yield* this.applyOp(op, rg, reg);
      if (this.mode === 'insert') return;
      let o = saveOff;
      if (sAt < saveOff) o += this.text().length - len0;
      const p = this.pos(Math.max(0, o));
      this.setCur(p.r, p.c);
    }

    *applyOp(op, rg, reg) {
      const L = this.L;
      const b = this.buf;
      switch (op) {
        case 'd':
          if (rg.kind === 'char') {
            const a = this.pos(rg.s),
              z = this.pos(rg.e);
            if (z.r > a.r && a.c <= indentOf(L[a.r]).length && L[z.r].slice(z.c).trim() === '' && rg.e > rg.s)
              rg = { kind: 'line', r1: a.r, r2: z.r, fnb: true };
          }
          this.deleteRange(rg, reg);
          return;
        case 'y': {
          this.setReg(reg, this.rangeText(rg), rg.kind === 'line', true);
          if (rg.kind === 'line') this.setCur(rg.r1, rg.r1 === b.r ? b.c : b.c, true);
          else {
            const p = this.pos(rg.s);
            this.setCur(p.r, p.c);
          }
          return;
        }
        case 'c': {
          if (rg.kind === 'line') {
            const removed = L.slice(rg.r1, rg.r2 + 1);
            this.setReg(reg, removed.join('\n'), true);
            const ind = indentOf(L[rg.r1]);
            L.splice(rg.r1, rg.r2 - rg.r1 + 1, ind);
            b.r = rg.r1;
            b.c = ind.length;
          } else {
            const t = this.text();
            this.setReg(reg, t.slice(rg.s, rg.e), false);
            this.setText(t.slice(0, rg.s) + t.slice(rg.e));
            const p = this.pos(rg.s);
            b.r = p.r;
            b.c = p.c;
          }
          return yield* this.insert();
        }
        case '>':
        case '<':
        case '=': {
          const { r1, r2 } = this.linesOf(rg);
          if (op !== '=')
            for (let i = r1; i <= r2; i++) {
              if (op === '>') {
                if (L[i].length) L[i] = '  ' + L[i];
              } else L[i] = L[i].replace(/^( {1,2}|\t)/, '');
            }
          this.setCur(rg.kind === 'line' ? b.r : r1, b.c, true);
          return;
        }
        case 'gc': {
          const { r1, r2 } = this.linesOf(rg);
          this.toggleComment(r1, r2);
          if (rg.kind === 'line' && rg.r1 === rg.r2) return;
          this.setCur(r1, b.c);
          return;
        }
        case 'gU':
        case 'gu':
        case 'g~': {
          const f = (ch) => (op === 'gU' ? ch.toUpperCase() : op === 'gu' ? ch.toLowerCase() : ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase());
          const t = this.text();
          let s, e;
          if (rg.kind === 'line') {
            s = this.off(rg.r1, 0);
            e = this.off(rg.r2, L[rg.r2].length);
          } else {
            s = rg.s;
            e = rg.e;
          }
          this.setText(t.slice(0, s) + [...t.slice(s, e)].map(f).join('') + t.slice(e));
          const p = rg.kind === 'line' ? { r: rg.r1, c: fnbCol(L[rg.r1]) } : this.pos(s);
          this.setCur(p.r, p.c);
          return;
        }
        case 'gsa': {
          const ch = yield 'text';
          const pair = yield* this.surroundPair(ch);
          if (!pair) return;
          let s, e;
          if (rg.kind === 'line') {
            s = this.off(rg.r1, 0);
            e = this.off(rg.r2, L[rg.r2].length);
          } else {
            s = rg.s;
            e = rg.e;
          }
          const t = this.text();
          this.setText(t.slice(0, s) + pair[0] + t.slice(s, e) + pair[1] + t.slice(e));
          const p = this.pos(s + pair[0].length);
          this.setCur(p.r, p.c);
          return;
        }
      }
    }
    linesOf(rg) {
      if (rg.kind === 'line') return { r1: rg.r1, r2: rg.r2 };
      const a = this.pos(rg.s),
        z = this.pos(Math.max(rg.s, rg.e - 1));
      return { r1: a.r, r2: z.r };
    }
    commentStr() {
      return COMMENT[this.buf.ft] || '#';
    }
    toggleComment(r1, r2) {
      const L = this.L;
      const cs = this.commentStr();
      const lines = [];
      for (let i = r1; i <= r2; i++) if (L[i].trim() !== '') lines.push(i);
      if (!lines.length) return;
      const all = lines.every((i) => L[i].trimStart().startsWith(cs));
      if (all) {
        for (const i of lines) {
          const ind = indentOf(L[i]);
          let rest = L[i].slice(ind.length + cs.length);
          if (rest.startsWith(' ')) rest = rest.slice(1);
          L[i] = ind + rest;
        }
      } else {
        const min = Math.min(...lines.map((i) => indentOf(L[i]).length));
        for (const i of lines) L[i] = L[i].slice(0, min) + cs + ' ' + L[i].slice(min);
      }
    }
    *commentLine(below) {
      const L = this.L;
      const b = this.buf;
      const ind = indentOf(L[b.r]);
      const at = below ? b.r + 1 : b.r;
      const pre = ind + this.commentStr() + ' ';
      L.splice(at, 0, pre);
      b.r = at;
      b.c = pre.length;
      return yield* this.insert();
    }
    moveLines(r1, r2, d) {
      const L = this.L;
      const b = this.buf;
      if (d > 0) d = Math.min(d, L.length - 1 - r2);
      else d = Math.max(d, -r1);
      if (!d) return 0;
      const block = L.splice(r1, r2 - r1 + 1);
      L.splice(r1 + d, 0, ...block);
      b.r += d;
      return d;
    }
    paste(after, n, reg) {
      const v = this.getReg(reg);
      if (!v || (!v.text && !v.line)) return;
      const L = this.L;
      const b = this.buf;
      if (v.line) {
        const lines = [];
        for (let i = 0; i < n; i++) lines.push(...v.text.split('\n'));
        const at = after ? b.r + 1 : b.r;
        L.splice(at, 0, ...lines);
        this.setCur(at, fnbCol(L[at]));
        return;
      }
      const t = this.text();
      const col = after && L[b.r].length ? b.c + 1 : b.c;
      const o = this.off(b.r, col);
      const ins = v.text.repeat(n);
      this.setText(t.slice(0, o) + ins + t.slice(o));
      const p = ins.includes('\n') ? this.pos(o) : this.pos(o + ins.length - 1);
      this.setCur(p.r, p.c);
    }

    // ---------- surround ----------
    *surroundPair(ch) {
      const P = {
        '(': ['( ', ' )'],
        ')': ['(', ')'],
        b: ['(', ')'],
        '[': ['[ ', ' ]'],
        ']': ['[', ']'],
        '{': ['{ ', ' }'],
        '}': ['{', '}'],
        B: ['{', '}'],
        '<': ['< ', ' >'],
        '>': ['<', '>'],
        q: ['"', '"'],
      };
      if (P[ch]) return P[ch];
      if (ch === 'f') {
        const name = yield* this.prompt('Function name: ');
        if (!name) return null;
        return [name + '(', ')'];
      }
      if (ch === 't') {
        const tag = yield* this.prompt('Tag name: ');
        if (!tag) return null;
        return ['<' + tag + '>', '</' + tag.split(/\s/)[0] + '>'];
      }
      if (ch.length !== 1 || ch === ' ') return null;
      return [ch, ch];
    }
    findSurround(ch, method) {
      const t = this.text();
      const at = this.off(this.buf.r, this.buf.c);
      let pairs;
      if (ch === 'f') {
        pairs = this.bracketPairs('(')
          .map((p) => {
            let s = p.o;
            while (s > 0 && /[\w.$]/.test(t[s - 1])) s--;
            return s < p.o ? { o: s, c: p.c, li: p.o + 1 } : null;
          })
          .filter(Boolean);
      } else pairs = this.pairsFor(ch);
      if (!pairs) {
        if (ch.length !== 1) return null;
        pairs = this.quotePairs(ch);
      }
      const m = method === 'cover' ? 'cover' : method;
      const p = this.pickPair(pairs, at, m);
      if (!p) return null;
      let lo = p.o,
        li = p.li || p.o + 1,
        ri = p.c,
        ro = p.c + 1;
      if (OPEN[ch] && ch !== '<') {
        while (li < ri && /\s/.test(t[li])) li++;
        while (ri > li && /\s/.test(t[ri - 1])) ri--;
      }
      return { lo, li, ri, ro };
    }
    *surroundChange(kind) {
      let ch = yield 'text';
      let method = 'cover';
      if (ch === 'n' || ch === 'l') {
        method = ch === 'n' ? 'next' : 'last';
        ch = yield 'text';
      }
      const f = this.findSurround(ch, method);
      if (!f) {
        this.say(`(mini.surround) No surrounding "${ch}" found within 20 lines and \`config.search_method = 'cover'\`.`, true);
        return;
      }
      const t = this.text();
      if (kind === 'd') {
        this.setText(t.slice(0, f.lo) + t.slice(f.li, f.ri) + t.slice(f.ro));
        const p = this.pos(f.lo);
        this.setCur(p.r, p.c);
        return;
      }
      const nch = yield 'text';
      const pair = yield* this.surroundPair(nch);
      if (!pair) return;
      this.setText(t.slice(0, f.lo) + pair[0] + t.slice(f.li, f.ri) + pair[1] + t.slice(f.ro));
      const p = this.pos(f.lo + pair[0].length);
      this.setCur(p.r, p.c);
    }

    // ---------- insert mode ----------
    *insert() {
      this.mode = 'insert';
      const b = this.buf;
      let prevJ = false;
      for (;;) {
        const k = yield 'text';
        const L = this.L;
        if (this.jk && prevJ && k === 'k' && b.c > 0 && L[b.r][b.c - 1] === 'j') {
          L[b.r] = L[b.r].slice(0, b.c - 1) + L[b.r].slice(b.c);
          b.c--;
          return this.leaveInsert();
        }
        prevJ = k === 'j';
        if (k === '<Esc>' || k === '<C-c>' || k === '<C-[>') return this.leaveInsert();
        if (k === '<C-s>') {
          this.say(`"${b.name}" written`);
          this.emit('write');
          return this.leaveInsert();
        }
        if (k !== '<CR>') this.aiLine = -1;
        if (k === '<BS>') this.backspace();
        else if (k === '<CR>') this.newline();
        else if (k === '<Tab>') this.insText('  ');
        else if (k === '<A-j>' || k === '<A-k>') this.moveLines(b.r, b.r, k === '<A-j>' ? 1 : -1);
        else if (k === '<Left>') b.c = Math.max(0, b.c - 1);
        else if (k === '<Right>') b.c = Math.min(L[b.r].length, b.c + 1);
        else if (k === '<C-w>') {
          const line = L[b.r];
          let s = b.c;
          while (s > 0 && isWS(line[s - 1])) s--;
          const kk = cls(line[s - 1]);
          while (s > 0 && cls(line[s - 1]) === kk && kk !== 0) s--;
          L[b.r] = line.slice(0, s) + line.slice(b.c);
          b.c = s;
        } else if (k.length === 1) this.typeChar(k);
      }
    }
    leaveInsert() {
      const b = this.buf;
      const L = this.L;
      if (this.aiLine === b.r && L[b.r].trim() === '') {
        L[b.r] = '';
        b.c = 0;
      }
      this.aiLine = -1;
      this.mode = 'normal';
      if (b.c > 0) b.c--;
      b.want = b.c;
    }
    insText(s) {
      const b = this.buf;
      const line = this.L[b.r];
      this.L[b.r] = line.slice(0, b.c) + s + line.slice(b.c);
      b.c += s.length;
    }
    typeChar(ch) {
      const b = this.buf;
      const line = this.L[b.r];
      const next = line[b.c];
      const prev = line[b.c - 1];
      if (this.pairs) {
        const skipNext = next !== undefined && /[\w%'\[".`$]/.test(next);
        if ('([{'.includes(ch)) {
          const close = OPEN[ch];
          let unbalanced = false;
          if (next === close) {
            const opens = line.split(ch).length - 1;
            const closes = line.split(close).length - 1;
            unbalanced = closes > opens;
          }
          if (prev !== '\\' && !skipNext && !unbalanced) {
            this.insText(ch + close);
            b.c--;
            return;
          }
        } else if (')]}'.includes(ch) && next === ch) {
          b.c++;
          return;
        } else if (QUOTES.includes(ch)) {
          if (next === ch) {
            b.c++;
            return;
          }
          const neigh = ch === "'" ? !(prev && /[A-Za-z\\]/.test(prev)) : prev !== '\\';
          const inStr = (line.slice(0, b.c).split(ch).length - 1) % 2 === 1;
          if (neigh && !skipNext && !inStr) {
            this.insText(ch + ch);
            b.c--;
            return;
          }
        }
      }
      this.insText(ch);
    }
    backspace() {
      const b = this.buf;
      const L = this.L;
      if (b.c === 0) {
        if (b.r === 0) return;
        const pl = L[b.r - 1].length;
        L[b.r - 1] += L[b.r];
        L.splice(b.r, 1);
        b.r--;
        b.c = pl;
        return;
      }
      const line = L[b.r];
      const prev = line[b.c - 1],
        next = line[b.c];
      const both = this.pairs && next !== undefined && ({ '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' }[prev] === next);
      L[b.r] = line.slice(0, b.c - 1) + line.slice(b.c + (both ? 1 : 0));
      b.c--;
    }
    newline() {
      const b = this.buf;
      const L = this.L;
      const line = L[b.r];
      const before = line.slice(0, b.c),
        after = line.slice(b.c).replace(/^\s+/, '');
      const ind = indentOf(line);
      if (this.pairs && /[\[{(]$/.test(before) && after.length && OPEN[before[before.length - 1]] === after[0]) {
        L.splice(b.r, 1, before, ind + '  ', ind + after);
        b.r++;
        b.c = ind.length + 2;
        this.aiLine = b.r;
        return;
      }
      const extra = this.opensBlock(before) ? '  ' : '';
      L.splice(b.r, 1, before, ind + extra + after);
      b.r++;
      b.c = ind.length + extra.length;
      this.aiLine = after ? -1 : b.r;
    }

    // ---------- visual mode ----------
    visRange() {
      const v = this.vis;
      const b = this.buf;
      if (v.kind === 'line') return { kind: 'line', r1: Math.min(v.ar, b.r), r2: Math.max(v.ar, b.r) };
      let a = { r: v.ar, c: v.ac },
        z = { r: b.r, c: b.c };
      if (z.r < a.r || (z.r === a.r && z.c < a.c)) [a, z] = [z, a];
      const len = this.L[z.r].length;
      const zIsCur = z.r === b.r && z.c === b.c;
      const eol = z.r < this.L.length - 1 && (len === 0 || (zIsCur && b.want >= len));
      return { kind: 'char', s: this.off(a.r, a.c), e: this.off(z.r, Math.min(len, z.c + 1)) + (eol ? 1 : 0) };
    }
    *visual(kind, preset) {
      const b = this.buf;
      this.vis = preset ? { kind, ar: preset.ar, ac: preset.ac } : { kind, ar: b.r, ac: b.c };
      if (preset) this.setCur(preset.r, preset.c);
      this.mode = kind === 'line' ? 'vline' : 'visual';
      for (;;) {
        this.mode = this.vis.kind === 'line' ? 'vline' : 'visual';
        let k = yield 'cmd';
        let count = 0;
        while (/^[1-9]$/.test(k) || (count && k === '0')) {
          count = count * 10 + +k;
          k = yield 'cmd';
        }
        const n = count || 1;
        const wasChar = this.charActive;
        this.charActive = false;
        let reg = null;
        if (k === '"') {
          reg = yield 'text';
          k = yield 'cmd';
        }
        if (wasChar && this.lastFind && k.length === 1 && 'fFtT'.includes(k) && k.toLowerCase() === this.lastFind.k.toLowerCase()) {
          const m = this.repeatFind(k, n);
          if (m) {
            this.moveTo(m);
            this.charActive = true;
          }
          continue;
        }
        if (k === '<Esc>' || k === '<C-c>') break;
        if (k === 'v' || k === 'V') {
          const nk = k === 'V' ? 'line' : 'char';
          if (nk === this.vis.kind) break;
          this.vis.kind = nk;
          continue;
        }
        if (k === 'o') {
          const { ar, ac } = this.vis;
          this.vis.ar = b.r;
          this.vis.ac = b.c;
          this.setCur(ar, ac);
          continue;
        }
        if (k === 'i' || k === 'a') {
          const rg = yield* this.textObject(k, n);
          if (!rg) continue;
          if (rg.kind === 'line') {
            this.vis.kind = 'line';
            this.vis.ar = rg.r1;
            this.vis.ac = 0;
            this.setCur(rg.r2, 0);
          } else {
            const s = this.pos(rg.s),
              e = this.pos(Math.max(rg.s, rg.e - 1));
            this.vis.ar = s.r;
            this.vis.ac = s.c;
            this.setCur(e.r, e.c);
          }
          continue;
        }
        const rg = this.visRange();
        const exit = () => {
          this.vis = null;
          this.mode = 'normal';
        };
        if (k === 'd' || k === 'x' || k === '<Del>') {
          exit();
          this.deleteRange(rg, reg);
          return;
        }
        if (k === 'c') {
          exit();
          return yield* this.applyOp('c', rg, reg);
        }
        if (k === 'y') {
          exit();
          yield* this.applyOp('y', rg, reg);
          if (rg.kind === 'line') this.setCur(rg.r1, 0);
          return;
        }
        if ('XDYCSR'.includes(k) && k.length === 1) {
          const { r1, r2 } = this.linesOf(rg);
          exit();
          const lr = { kind: 'line', r1, r2 };
          if (k === 'X' || k === 'D') this.deleteRange(lr, reg);
          else if (k === 'Y') {
            yield* this.applyOp('y', lr, reg);
            this.setCur(r1, 0);
          } else return yield* this.applyOp('c', lr, reg);
          return;
        }
        if (k === '>' || k === '<') {
          const { r1, r2 } = this.linesOf(rg);
          const save = { ...this.vis };
          const cr = b.r,
            cc = b.c;
          for (let t = 0; t < n; t++) yield* this.applyOp(k, { kind: 'line', r1, r2 }, reg);
          this.vis = save;
          this.setCur(cr, cc);
          continue;
        }
        if (k === '~' || k === 'u' || k === 'U') {
          exit();
          yield* this.applyOp(k === 'U' ? 'gU' : k === 'u' ? 'gu' : 'g~', rg, reg);
          return;
        }
        if (k === 'J') {
          const { r1, r2 } = this.linesOf(rg);
          exit();
          this.setCur(r1, 0);
          this.queue.unshift(...String(Math.max(2, r2 - r1 + 1)).split('').map((x) => [x, 'macro']), ['J', 'macro']);
          return;
        }
        if (k === 'r') {
          const ch = yield 'text';
          exit();
          if (ch.length !== 1) return;
          const t = this.text();
          let s, e;
          if (rg.kind === 'line') {
            s = this.off(rg.r1, 0);
            e = this.off(rg.r2, this.L[rg.r2].length);
          } else ({ s, e } = rg);
          this.setText(t.slice(0, s) + t.slice(s, e).replace(/[^\n]/g, ch) + t.slice(e));
          const p = this.pos(s);
          this.setCur(p.r, p.c);
          return;
        }
        if (k === 'p' || k === 'P') {
          exit();
          const v = this.getReg(reg);
          if (!v) return;
          const old = this.rangeText(rg);
          if (rg.kind === 'line') {
            const lines = v.line ? v.text.split('\n') : [v.text];
            this.L.splice(rg.r1, rg.r2 - rg.r1 + 1, ...lines);
            this.setCur(rg.r1, fnbCol(this.L[rg.r1]));
          } else {
            const t = this.text();
            const ins = v.line ? '\n' + v.text + '\n' : v.text;
            this.setText(t.slice(0, rg.s) + ins + t.slice(rg.e));
            const p = this.pos(rg.s + Math.max(0, ins.length - 1));
            this.setCur(p.r, p.c);
          }
          if (k === 'p') this.setReg(null, old, rg.kind === 'line');
          return;
        }
        if (k === ':') {
          exit();
          const s = yield* this.prompt(':', "'<,'>");
          this.vrange = this.linesOf(rg);
          if (s !== null) this.ex(s);
          return;
        }
        if (k === '<A-j>' || k === '<A-k>') {
          const { r1, r2 } = this.linesOf(rg);
          const d = this.moveLines(r1, r2, k === '<A-j>' ? n : -n);
          this.vis.ar += d;
          continue;
        }
        if (k === 'S') {
          const r2 = yield* this.flashTS();
          if (r2) {
            const s = this.pos(r2.s),
              e = this.pos(Math.max(r2.s, r2.e - 1));
            this.vis = { kind: 'char', ar: s.r, ac: s.c };
            this.setCur(e.r, e.c);
          }
          continue;
        }
        if (k === 'g') {
          const k2 = yield 'cmd';
          if (k2 === 'c') {
            exit();
            yield* this.applyOp('gc', rg, reg);
            return;
          }
          if (k2 === 'U' || k2 === 'u' || k2 === '~') {
            exit();
            yield* this.applyOp('g' + k2, rg, reg);
            return;
          }
          if (k2 === 's') {
            const k3 = yield 'cmd';
            if (k3 === 'a') {
              exit();
              yield* this.applyOp('gsa', rg, reg);
              return;
            }
            continue;
          }
          const m = yield* this.motion('g' + k2, count, null);
          if (m) this.moveTo(m);
          continue;
        }
        if (k === ']' || k === '[') {
          const k2 = yield 'cmd';
          const m = yield* this.motion(k + k2, count, null);
          if (m) this.moveTo(m);
          continue;
        }
        const m = yield* this.motion(k, count, null);
        if (m) this.moveTo(m);
      }
      this.vis = null;
      this.mode = 'normal';
    }

    // ---------- prompts ----------
    *prompt(prefix, init) {
      this.cmdline = { prefix, text: init || '' };
      for (;;) {
        const k = yield 'text';
        const cl = this.cmdline;
        if (k === '<Esc>' || k === '<C-c>') {
          this.cmdline = null;
          return null;
        }
        if (k === '<CR>') {
          this.cmdline = null;
          return cl.text;
        }
        if (k === '<BS>') {
          if (!cl.text) {
            this.cmdline = null;
            return null;
          }
          cl.text = cl.text.slice(0, -1);
        } else if (k === '<C-u>') cl.text = '';
        else if (k.length === 1) cl.text += k;
      }
    }

    // ---------- ex commands ----------
    ex(s) {
      const L = this.L;
      const b = this.buf;
      s = s.trim();
      if (!s) return;
      if (/^\d+$/.test(s)) {
        this.jumps.push({ buf: b, r: b.r, c: b.c });
        const r = Math.min(L.length, Math.max(1, +s)) - 1;
        this.setCur(r, fnbCol(L[r]));
        return;
      }
      let r1 = b.r,
        r2 = b.r;
      const addr = (a) => {
        if (a === '.') return b.r;
        if (a === '$') return L.length - 1;
        if (a === "'<") return this.vrange ? this.vrange.r1 : b.r;
        if (a === "'>") return this.vrange ? this.vrange.r2 : b.r;
        const m = a.match(/^([.$]|\d+)?([+-]\d+)?$/);
        if (!m) return null;
        let base = m[1] === undefined || m[1] === '.' ? b.r : m[1] === '$' ? L.length - 1 : +m[1] - 1;
        if (m[2]) base += +m[2];
        return base;
      };
      let m = s.match(/^(%|(?:'<|'>|[.$]|\d+)?(?:[+-]\d+)?(?:,(?:'<|'>|[.$]|\d+)?(?:[+-]\d+)?)?)(.*)$/);
      let rest = s;
      if (m && m[1]) {
        rest = m[2].trim();
        if (m[1] === '%') {
          r1 = 0;
          r2 = L.length - 1;
        } else {
          const [a, z] = m[1].split(',');
          r1 = addr(a);
          r2 = z === undefined ? r1 : addr(z);
          if (r1 === null || r2 === null) return this.say('E14: Invalid address', true);
          if (r1 > r2) [r1, r2] = [r2, r1];
          r1 = Math.max(0, r1);
          r2 = Math.min(L.length - 1, r2);
        }
      }
      let mm;
      if ((mm = rest.match(/^s(?:ubstitute)?([^\w\s])(.*)$/))) {
        const d = mm[1];
        const parts = this.splitDelim(mm[2], d);
        const pat = parts[0] === '' ? this.lastSearch : parts[0];
        const rep = parts[1] || '';
        const flags = parts[2] || '';
        if (!pat) return this.say('E35: No previous regular expression', true);
        this.lastSearch = pat;
        const re = makeRe(pat, (flags.includes('g') ? 'g' : '') + (flags.includes('i') ? 'i' : ''));
        if (!re) return this.say('E486: bad pattern', true);
        let count = 0,
          last = -1;
        for (let i = r1; i <= r2; i++) {
          const before = L[i];
          const after = before.replace(re, (...args) => {
            count++;
            return args[0].replace(new RegExp(re.source, re.flags.replace('g', '')), vimRep(rep));
          });
          if (after !== before) {
            L[i] = after;
            last = i;
          }
        }
        if (last >= 0) {
          const split = [];
          for (let i = 0; i < L.length; i++) split.push(...L[i].split('\n'));
          b.lines = split;
          this.setCur(Math.min(last, b.lines.length - 1), fnbCol(b.lines[Math.min(last, b.lines.length - 1)]));
          this.say(count > 1 ? `${count} substitutions` : '');
        } else this.say('E486: Pattern not found: ' + pat, true);
        return;
      }
      if ((mm = rest.match(/^(g|v|g!)([^\w\s])(.*)$/))) {
        const parts = this.splitDelim(mm[3], mm[2]);
        const re = makeRe(parts[0], '');
        const cmd = (parts[1] || 'p').trim();
        const inv = mm[1] !== 'g';
        if (!re) return;
        if (!m || !m[1]) {
          r1 = 0;
          r2 = L.length - 1;
        }
        if (cmd === 'd') {
          const keep = [];
          L.forEach((line, i) => {
            if (i < r1 || i > r2 || re.test(line) === inv) keep.push(line);
          });
          b.lines = keep.length ? keep : [''];
          this.setCur(Math.min(b.r, b.lines.length - 1), 0);
        } else this.say('Only :g/pattern/d is supported here');
        return;
      }
      if (rest === 'd') {
        this.setReg(null, L.slice(r1, r2 + 1).join('\n'), true);
        L.splice(r1, r2 - r1 + 1);
        if (!L.length) L.push('');
        this.setCur(Math.min(r1, L.length - 1), 0);
        return;
      }
      if (rest === 'sort' || rest === 'sort!') {
        if (!m || !m[1]) {
          r1 = 0;
          r2 = L.length - 1;
        }
        const seg = L.slice(r1, r2 + 1).sort();
        if (rest === 'sort!') seg.reverse();
        L.splice(r1, r2 - r1 + 1, ...seg);
        return;
      }
      if (/^(w|write|up|update)$/.test(rest)) {
        this.say(`"${b.name}" ${L.length}L written`);
        this.emit('write');
        return;
      }
      if (/^(q|q!|qa|qa!|quit|wq|x|wqa|xa)$/.test(rest)) {
        this.emit('quit');
        return;
      }
      if (/^e!?$/.test(rest)) {
        this.emit('reset');
        return;
      }
      if (/^noh(lsearch)?$/.test(rest)) {
        this.hl = false;
        return;
      }
      if (/^(h|help)\b/.test(rest)) {
        this.emit('help');
        return;
      }
      this.say(`E492: Not an editor command: ${s}`, true);
    }
    splitDelim(s, d) {
      const parts = [];
      let cur = '';
      for (let i = 0; i < s.length; i++) {
        if (s[i] === '\\' && s[i + 1] === d) {
          cur += d;
          i++;
        } else if (s[i] === d) {
          parts.push(cur);
          cur = '';
        } else cur += s[i];
      }
      parts.push(cur);
      return parts;
    }

    // ---------- flash ----------
    computeFlash(pat, prev) {
      const out = [];
      if (pat) {
        const icase = pat === pat.toLowerCase();
        const P = icase ? pat.toLowerCase() : pat;
        const { r: cr, c: cc } = this.cur;
        this.L.forEach((line, r) => {
          const hay = icase ? line.toLowerCase() : line;
          let i = hay.indexOf(P);
          while (i >= 0) {
            if (!(r === cr && i === cc)) out.push({ r, c: i, next: line[i + P.length] });
            i = hay.indexOf(P, i + 1);
          }
        });
        const W = this.columns;
        const from = cr * W + cc;
        out.sort((a, b) => Math.abs(a.r * W + a.c - from) - Math.abs(b.r * W + b.c - from));
        const skip = new Set();
        for (const m of out)
          if (m.next !== undefined) {
            skip.add(m.next);
            if (icase) {
              skip.add(m.next.toLowerCase());
              skip.add(m.next.toUpperCase());
            }
          }
        const pool = (LABELS + LABELS.toUpperCase()).split('').filter((l) => !skip.has(l));
        const used = new Set();
        for (const m of out) {
          const old = prev.get(m.r + ':' + m.c);
          if (old && pool.includes(old) && !used.has(old) && old === old.toLowerCase()) {
            m.label = old;
            used.add(old);
          }
        }
        let pi = 0;
        for (const m of out) {
          if (m.label) continue;
          while (pi < pool.length && used.has(pool[pi])) pi++;
          if (pi >= pool.length) break;
          m.label = pool[pi];
          used.add(pool[pi]);
        }
        prev.clear();
        for (const m of out) if (m.label) prev.set(m.r + ':' + m.c, m.label);
      }
      this.flash = { pat, matches: out };
    }
    *flashJump() {
      let pat = '';
      const prev = new Map();
      this.computeFlash(pat, prev);
      for (;;) {
        const k = yield 'text';
        if (k === '<Esc>' || k === '<C-c>') {
          this.flash = null;
          return null;
        }
        if (k === '<BS>') {
          if (!pat) {
            this.flash = null;
            return null;
          }
          pat = pat.slice(0, -1);
          this.computeFlash(pat, prev);
          continue;
        }
        if (k === '<CR>') {
          const m = this.flash.matches[0];
          this.flash = null;
          return m || null;
        }
        if (k.length !== 1) continue;
        if (pat) {
          const hit = this.flash.matches.find((m) => m.label === k);
          if (hit) {
            this.flash = null;
            return hit;
          }
        }
        pat += k;
        this.computeFlash(pat, prev);
        if (!this.flash.matches.length) {
          this.flash = null;
          return null;
        }
      }
    }
    tsCandidates() {
      const t = this.text();
      const at = this.off(this.buf.r, this.buf.c);
      const cands = [];
      const add = (s, e) => {
        if (s <= at && at < e && e > s) cands.push({ s, e });
      };
      const line = this.L[this.buf.r];
      const lo = this.off(this.buf.r, 0);
      if (isKW(t[at])) {
        let s = at,
          e = at;
        while (s > 0 && isKW(t[s - 1])) s--;
        while (e < t.length && isKW(t[e])) e++;
        add(s, e);
      }
      for (const q of QUOTES) for (const p of this.quotePairs(q)) add(p.o, p.c + 1);
      for (const p of this.bracketPairs('([{')) {
        add(p.o, p.c + 1);
        let s = p.o;
        while (s > 0 && /[\w.$]/.test(t[s - 1])) s--;
        if (s < p.o) add(s, p.c + 1);
      }
      const f = fnbCol(line);
      add(lo + f, lo + line.replace(/[;,]?\s*$/, '').length);
      add(lo + f, lo + line.length);
      for (const fn of this.fnHeaders()) add(this.off(fn.r1, fnbCol(this.L[fn.r1])), this.off(fn.r2, this.L[fn.r2].length));
      const seen = new Set();
      return cands
        .sort((a, b) => a.e - a.s - (b.e - b.s))
        .filter((c) => {
          const key = c.s + ':' + c.e;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 26)
        .map((c, i) => ({ ...c, label: 'abcdefghijklmnopqrstuvwxyz'[i] }));
    }
    *flashTS() {
      const nodes = this.tsCandidates();
      if (!nodes.length) return null;
      this.tsnodes = nodes;
      const k = yield 'text';
      this.tsnodes = null;
      const hit = k === '<CR>' ? nodes[0] : nodes.find((n) => n.label === k);
      return hit ? { kind: 'char', s: hit.s, e: hit.e } : null;
    }

    // ---------- leader / buffers / picker / LSP-ish ----------
    *leader() {
      const k = yield 'cmd';
      if (k === ' ') return yield* this.pickFiles();
      if (k === '`') return this.altBuffer();
      if (k === 'f') {
        const k2 = yield 'cmd';
        if (k2 === 'f' || k2 === 'F') return yield* this.pickFiles();
        if (k2 === 'b') return yield* this.pickFiles(true);
        return this.say('<leader>f' + k2 + ' is not in this game');
      }
      if (k === ',') return yield* this.pickFiles(true);
      if (k === 'b') {
        const k2 = yield 'cmd';
        if (k2 === 'd') return this.closeBuffer();
        if (k2 === 'b') return this.altBuffer();
        if (k2 === 'o') {
          this.open = [this.buf];
          return;
        }
        return;
      }
      if (k === 'c') {
        const k2 = yield 'cmd';
        if (k2 === 'r') return yield* this.rename();
        if (k2 === 'd') return this.lineDiag();
        return this.say('<leader>c' + k2 + ' is not in this game');
      }
      if (k === 'q') {
        const k2 = yield 'cmd';
        if (k2 === 'q') this.emit('quit');
        return;
      }
      if (k === 's') {
        const k2 = yield 'cmd';
        if (k2 === 'g' || k2 === 'w') return this.say('Grep is not in this game; try * or /');
        return;
      }
      if (k === '<Esc>') return;
      this.say(`<leader>${k} is not in this game`);
    }
    openBuffer(bf) {
      if (bf === this.buf) return;
      if (!this.open.includes(bf)) this.open.push(bf);
      this.alt = this.buf;
      this.buf = bf;
    }
    cycleBuffer(d) {
      const i = this.open.indexOf(this.buf);
      const j = (((i + d) % this.open.length) + this.open.length) % this.open.length;
      this.openBuffer(this.open[j]);
    }
    altBuffer() {
      if (this.alt && this.open.includes(this.alt)) this.openBuffer(this.alt);
    }
    closeBuffer() {
      if (this.open.length <= 1) return this.say('Last buffer — nothing to switch to');
      const i = this.open.indexOf(this.buf);
      this.open.splice(i, 1);
      const nb = this.alt && this.open.includes(this.alt) ? this.alt : this.open[Math.min(i, this.open.length - 1)];
      this.buf = nb;
      this.alt = null;
    }
    fuzzy(q, s) {
      if (!q) return 1;
      let i = 0,
        score = 0,
        last = -2;
      const S = s.toLowerCase();
      for (const ch of q.toLowerCase()) {
        const j = S.indexOf(ch, i);
        if (j < 0) return 0;
        score += j === last + 1 ? 3 : 1;
        last = j;
        i = j + 1;
      }
      return score;
    }
    *pickFiles(buffersOnly) {
      this.picker = { title: buffersOnly ? 'Buffers' : 'Files', q: '', idx: 0, items: [] };
      const list = buffersOnly ? this.open : this.files;
      const refresh = () => {
        const p = this.picker;
        p.items = list
          .map((bf) => ({ bf, s: this.fuzzy(p.q, bf.name) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s)
          .map((x) => x.bf);
        p.idx = Math.min(p.idx, Math.max(0, p.items.length - 1));
      };
      refresh();
      for (;;) {
        const k = yield 'text';
        const p = this.picker;
        if (k === '<Esc>' || k === '<C-c>') break;
        if (k === '<CR>') {
          const bf = p.items[p.idx];
          this.picker = null;
          if (bf) {
            this.jumps.push({ buf: this.buf, r: this.buf.r, c: this.buf.c });
            this.openBuffer(bf);
          }
          return;
        }
        if (k === '<C-j>' || k === '<C-n>' || k === '<Down>') p.idx = Math.min(p.items.length - 1, p.idx + 1);
        else if (k === '<C-k>' || k === '<C-p>' || k === '<Up>') p.idx = Math.max(0, p.idx - 1);
        else if (k === '<BS>') p.q = p.q.slice(0, -1);
        else if (k.length === 1) {
          p.q += k;
          p.idx = 0;
        }
        refresh();
      }
      this.picker = null;
    }
    *rename() {
      const w = this.wordUnder();
      if (!w) return;
      const nn = yield* this.prompt('New Name: ', w.word);
      if (!nn || nn === w.word) return;
      const re = new RegExp('\\b' + w.word + '\\b', 'g');
      let total = 0,
        files = 0;
      for (const bf of this.files) {
        if (bf.ft !== this.buf.ft) continue;
        const t = bf.text();
        const cnt = (t.match(re) || []).length;
        if (!cnt) continue;
        total += cnt;
        files++;
        if (bf !== this.buf) {
          bf.undo.push({ lines: bf.lines.slice(), r: bf.r, c: bf.c });
          bf.redo = [];
        }
        bf.lines = t.replace(re, nn).split('\n');
      }
      this.say(`Renamed ${total} instance${total > 1 ? 's' : ''} in ${files} file${files > 1 ? 's' : ''}`);
    }
    gotoDef() {
      const w = this.wordUnder();
      if (!w) return;
      const re = new RegExp(
        `(\\b(function|const|let|var|class|def|local function|local)\\s+${w.word}\\b)|(\\b${w.word}\\s*=\\s*(async\\s*)?(function\\b|\\())`
      );
      for (const bf of [this.buf, ...this.files.filter((f) => f !== this.buf)]) {
        for (let r = 0; r < bf.lines.length; r++) {
          const m = bf.lines[r].match(re);
          if (m) {
            const c = bf.lines[r].indexOf(w.word, m.index);
            this.jumps.push({ buf: this.buf, r: this.buf.r, c: this.buf.c });
            this.jumpFwd = [];
            this.openBuffer(bf);
            this.setCur(r, c);
            return;
          }
        }
      }
      this.say('No definition found for ' + w.word, true);
    }
    refsList() {
      const w = this.wordUnder();
      if (!w) return;
      const re = new RegExp('\\b' + w.word + '\\b', 'g');
      let n = 0;
      for (const bf of this.files) n += (bf.text().match(re) || []).length;
      this.say(`${n} references to ${w.word} — use ]] and [[ to hop between them`);
    }
    jumpRef(fwd, n) {
      const w = this.wordUnder();
      if (!w || w.s > this.buf.c) return;
      const re = new RegExp('\\b' + w.word + '\\b', 'g');
      const save = this.buf.c;
      this.buf.c = w.s;
      const p = this.searchFromRe(re, fwd, n);
      this.buf.c = save;
      this.msg = '';
      if (p) this.setCur(p.r, p.c);
    }
    diagnostics(bf) {
      bf = bf || this.buf;
      const out = [];
      for (const d of this.diagDefs) {
        if (d.file && d.file !== bf.name) continue;
        const re = new RegExp(d.pattern, 'g');
        bf.lines.forEach((line, r) => {
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(line))) {
            out.push({ r, c: m.index, len: Math.max(1, m[0].length), msg: d.message, sev: d.severity || 'error' });
            if (!m[0].length) re.lastIndex++;
          }
        });
      }
      return out.sort((a, b) => a.r - b.r || a.c - b.c);
    }
    jumpDiag(fwd, n) {
      const ds = this.diagnostics();
      if (!ds.length) return this.say('No more diagnostics');
      let { r, c } = this.cur;
      let hit = null;
      for (let i = 0; i < n; i++) {
        hit = fwd ? ds.find((d) => d.r > r || (d.r === r && d.c > c)) || ds[0] : [...ds].reverse().find((d) => d.r < r || (d.r === r && d.c < c)) || ds[ds.length - 1];
        r = hit.r;
        c = hit.c;
      }
      this.jumps.push({ buf: this.buf, r: this.buf.r, c: this.buf.c });
      this.setCur(hit.r, hit.c);
      this.popup = { r: hit.r, c: hit.c, text: hit.msg, sev: hit.sev };
    }
    lineDiag() {
      const d = this.diagnostics().find((x) => x.r === this.buf.r);
      if (d) this.popup = { r: d.r, c: d.c, text: d.msg, sev: d.sev };
    }
  }

  G.LazyVimEngine = { Vim, Buffer, vimRe, makeRe };
  if (typeof module !== 'undefined') module.exports = G.LazyVimEngine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
