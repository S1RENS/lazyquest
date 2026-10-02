/* LazyQuest game layer: level parsing, gems, targets, bans, scoring. Pure (no DOM). */
(function (G) {
  'use strict';
  const { Vim } = G.LazyVimEngine;
  const GLOBAL_BANNED = ['<Left>', '<Right>', '<Up>', '<Down>'];

  function tok(s) {
    const out = [];
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '<') {
        const j = s.indexOf('>', i);
        const t = j > i ? s.slice(i, j + 1) : '';
        if (/^<(flash|label):/.test(t) || /^<[A-Za-z][-A-Za-z0-9]*>$/.test(t)) {
          out.push(t);
          i = j;
          continue;
        }
      }
      out.push(s[i]);
    }
    return out;
  }

  function parseText(text) {
    let cursor = null;
    const gems = [];
    const lines = text.split('\n').map((line, r) => {
      let s = '';
      for (const ch of line) {
        if (ch === '‸') cursor = [r, s.length];
        else if (ch === '¤') gems.push([r, s.length]);
        else s += ch;
      }
      return s;
    });
    return { text: lines.join('\n'), cursor, gems };
  }

  const norm = (t) =>
    t
      .split('\n')
      .map((l) => l.replace(/\s+$/, ''))
      .join('\n')
      .replace(/\n+$/, '');

  class Game {
    constructor(level, opts) {
      opts = opts || {};
      this.level = level;
      const files = level.files.map((f) => {
        const p = parseText(f.text);
        return { name: f.name, text: p.text, cursor: p.cursor || [0, 0], open: f.open, gems: p.gems };
      });
      this.gems = [];
      files.forEach((f) => f.gems.forEach(([r, c]) => this.gems.push({ file: f.name, r, c, got: false })));
      this.vim = new Vim({ files, diagnostics: level.diagnostics, hover: level.hover, jk: opts.jk });
      this.targets = {};
      for (const f of level.files) if (f.target !== undefined) this.targets[f.name] = f.target;
      this.banned = new Set([...(level.banned || []), ...GLOBAL_BANNED]);
      this.keys = 0;
      this.won = false;
      this.rejected = null;
    }
    get idle() {
      return !this.vim.gen;
    }
    press(key, counted) {
      this.rejected = null;
      if (this.won) return false;
      if (this.vim.ctx === 'cmd' && this.banned.has(key)) {
        this.rejected = key;
        return false;
      }
      if (counted !== false) this.keys++;
      this.vim.feed(key);
      this.check();
      return true;
    }
    collect() {
      const v = this.vim;
      if (!(this.idle || v.mode === 'visual' || v.mode === 'vline')) return [];
      if (v.flash || v.cmdline || v.picker) return [];
      const got = [];
      for (const g of this.gems)
        if (!g.got && g.file === v.buf.name && g.r === v.buf.r && g.c === v.buf.c) {
          g.got = true;
          got.push(g);
        }
      return got;
    }
    targetStatus() {
      const out = [];
      for (const [name, want] of Object.entries(this.targets)) {
        const bf = this.vim.files.find((f) => f.name === name);
        out.push({ name, ok: norm(bf.text()) === norm(want), want, have: bf.text() });
      }
      return out;
    }
    check() {
      this.lastGems = this.collect();
      const gemsOk = this.gems.every((g) => g.got);
      const tOk = this.targetStatus().every((t) => t.ok);
      if (gemsOk && tOk && this.idle && this.vim.mode === 'normal') this.won = true;
      return this.won;
    }
    stars(par) {
      if (this.keys <= par) return 3;
      if (this.keys <= par + Math.max(3, Math.ceil(par * 0.5))) return 2;
      return 1;
    }
  }

  // Expand a level's solution into concrete keys. <flash:pat@r:c> = s + pat + label,
  // <label:pat@r:c> = pat + label (for remote `r`). Labels come from simulating the engine.
  function expandSolution(level) {
    const g = new Game(level);
    const keys = [];
    const errors = [];
    for (const t of tok(level.solution)) {
      const m = t.match(/^<(flash|label):(.+)@(\d+):(\d+)>$/);
      if (!m) {
        keys.push(t);
        if (!g.press(t)) errors.push('rejected ' + t);
        continue;
      }
      const seq = (m[1] === 'flash' ? ['s'] : []).concat(m[2].split(''));
      for (const k of seq) {
        keys.push(k);
        g.press(k);
      }
      const fl = g.vim.flash;
      const hit = fl && fl.matches.find((x) => x.r === +m[3] && x.c === +m[4]);
      if (!hit || !hit.label) {
        errors.push(`no flash label for ${t}`);
        continue;
      }
      keys.push(hit.label);
      g.press(hit.label);
    }
    return { keys, game: g, errors };
  }

  G.LazyQuest = { Game, tok, parseText, expandSolution, GLOBAL_BANNED };
  if (typeof module !== 'undefined') module.exports = G.LazyQuest;
})(typeof globalThis !== 'undefined' ? globalThis : this);
