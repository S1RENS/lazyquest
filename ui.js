/* LazyQuest UI: screens, editor rendering, overlays, input. */
(function () {
  'use strict';
  const { Game, tok, expandSolution } = window.LazyQuest;
  const { CHAPTERS, LEVELS } = window.LazyQuestLevels;
  const app = document.getElementById('app');

  // ---------- storage ----------
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('lazyquest:' + k);
        return v ? JSON.parse(v) : d;
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('lazyquest:' + k, JSON.stringify(v));
      } catch (e) {
        /* storage unavailable: progress lasts for this visit only */
      }
    },
  };

  const S = {
    screen: 'title',
    progress: store.get('progress', {}),
    settings: Object.assign({ jk: false, sound: true, unlockAll: false }, store.get('settings', {})),
    idx: 0,
    game: null,
    par: 0,
    solution: [],
    mapSel: 0,
    showHint: false,
    showSol: false,
    modal: null,
    focused: true,
  };
  const PARS = {};
  LEVELS.forEach((lv) => {
    try {
      PARS[lv.id] = expandSolution(lv).keys.length;
    } catch (e) {
      PARS[lv.id] = 99;
    }
  });

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const unlocked = (i) => S.settings.unlockAll || i === 0 || !!S.progress[LEVELS[i - 1].id];
  const starsHtml = (n, total = 3) => `<span class="stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(total - n)}</span></span>`;
  const totalStars = () => Object.values(S.progress).reduce((a, p) => a + (p.stars || 0), 0);
  const keyLabel = (k) =>
    ({ ' ': 'Space', '<Esc>': 'Esc', '<CR>': 'Enter', '<BS>': 'Bksp', '<Tab>': 'Tab', '<C-r>': 'Ctrl-r', '<C-u>': 'Ctrl-u', '<A-j>': 'Alt-j', '<A-k>': 'Alt-k', '<C-o>': 'Ctrl-o' }[k] ||
    k.replace(/^<C-(.)>$/, 'Ctrl-$1').replace(/^<A-(.)>$/, 'Alt-$1'));
  const kc = (s) => `<span class="kc">${esc(s)}</span>`;
  const teachKey = (s) =>
    s
      .replace(/<leader>/g, '␣')
      .replace(/<space>/g, '␣')
      .replace(/<CR>/g, '⏎')
      .replace(/<Esc>/g, 'Esc')
      .replace(/<BS>/g, 'Bksp')
      .replace(/<C-(.)>/g, 'Ctrl-$1')
      .replace(/<A-(.)>/g, 'Alt-$1');

  // ---------- sound ----------
  let actx = null;
  function beep(kind) {
    if (!S.settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const notes = { gem: [880, 1320], win: [523, 659, 784, 1047], nope: [180], step: [] }[kind] || [];
      notes.forEach((f, i) => {
        const o = actx.createOscillator();
        const g = actx.createGain();
        o.type = kind === 'nope' ? 'sawtooth' : 'square';
        o.frequency.value = f;
        const t0 = actx.currentTime + i * 0.08;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + (kind === 'win' ? 0.22 : 0.12));
        o.connect(g).connect(actx.destination);
        o.start(t0);
        o.stop(t0 + 0.25);
      });
    } catch (e) {
      /* audio not available */
    }
  }

  // ---------- owl sprite ----------
  const OWL = ['..O....O..', '.OOOOOOOO.', 'OOWWOOWWOO', 'OWEWOOWEWO', 'OOWWOYWWOO', '.OOOYYOOO.', '.OBBBBBBO.', '.OBBBBBBO.', '..OO..OO..', '..YY..YY..'];
  const OWLC = { O: '#bb9af7', W: '#c0caf5', E: '#1a1b26', Y: '#e0af68', B: '#9d7cd8' };
  const owlSvg = `<svg class="owl" viewBox="0 0 10 10" aria-hidden="true">${OWL.map((row, y) =>
    [...row].map((ch, x) => (OWLC[ch] ? `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${OWLC[ch]}"/>` : '')).join('')
  ).join('')}</svg>`;

  // ---------- syntax highlight ----------
  const KW = {
    javascript: 'const let var function return if else for of in while new import from export async await class this true false null undefined typeof',
    typescript: 'const let var function return if else for of in while new import from export async await class this true false null undefined typeof',
    python: 'def return if else elif for in while import from class pass True False None and or not with as lambda print',
    lua: 'local function end if then else elseif for do while return nil true false and or not',
    toml: 'true false',
  };
  const KWS = Object.fromEntries(Object.entries(KW).map(([k, v]) => [k, new Set(v.split(' '))]));
  function highlight(line, ft) {
    const cls = new Array(line.length).fill('');
    const fill = (s, e, c) => {
      for (let i = s; i < e && i < line.length; i++) cls[i] = c;
    };
    if (ft === 'markdown') {
      if (/^#/.test(line)) fill(0, line.length, 't-head');
      else {
        const m = line.match(/^(\s*[-*] )(\[[ x]\])?/);
        if (m) {
          fill(0, m[1].length, 't-punc');
          if (m[2]) fill(m[1].length, m[0].length, 't-kw');
        }
      }
      return cls;
    }
    if (ft === 'log') {
      const re = /\[[\d:]+\]|ERROR|WARN|INFO/g;
      let m;
      while ((m = re.exec(line))) fill(m.index, m.index + m[0].length, m[0][0] === '[' ? 't-num' : m[0] === 'ERROR' ? 't-err' : m[0] === 'WARN' ? 't-warn' : 't-info');
      return cls;
    }
    if (ft === 'text') return cls;
    const cm = { javascript: '//', typescript: '//', python: '#', lua: '--', toml: '#', sh: '#' }[ft];
    const kw = KWS[ft] || new Set();
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (cm && line.startsWith(cm, i)) {
        fill(i, line.length, 't-com');
        break;
      }
      if ('"\'`'.includes(ch)) {
        let j = i + 1;
        while (j < line.length && line[j] !== ch) j += line[j] === '\\' ? 2 : 1;
        fill(i, j + 1, 't-str');
        i = j + 1;
        continue;
      }
      if (/[0-9]/.test(ch) && !/[\w$]/.test(line[i - 1] || '')) {
        let j = i;
        while (j < line.length && /[0-9.]/.test(line[j])) j++;
        fill(i, j, 't-num');
        i = j;
        continue;
      }
      if (/[A-Za-z_$]/.test(ch)) {
        let j = i;
        while (j < line.length && /[\w$]/.test(line[j])) j++;
        const w = line.slice(i, j);
        if (kw.has(w)) fill(i, j, 't-kw');
        else if (line[j] === '(') fill(i, j, 't-fn');
        else if (line[i - 1] === '.') fill(i, j, 't-prop');
        i = j;
        continue;
      }
      if ('()[]{}'.includes(ch)) cls[i] = 't-brk';
      else if (/[=+\-*/<>!&|:;,.%]/.test(ch)) cls[i] = 't-op';
      i++;
    }
    return cls;
  }

  // ---------- which-key tables ----------
  const NI = null; // shown dimmed: real LazyVim key that this game does not simulate
  const WK = {
    ' ': [
      ['␣', 'Find Files'],
      [',', 'Switch Buffer'],
      ['`', 'Other Buffer'],
      ['b', '+buffer', 1],
      ['c', '+code', 1],
      ['f', '+file/find', 1],
      ['q', '+quit/session', 1],
      ['s', '+search', 1],
      ['e', 'Explorer', NI],
      ['/', 'Grep', NI],
      ['g', '+git', NI],
      ['u', '+ui', NI],
      ['w', '+windows', NI],
      ['x', '+diagnostics/quickfix', NI],
    ],
    ' b': [
      ['b', 'Switch to Other Buffer'],
      ['d', 'Delete Buffer'],
      ['o', 'Delete Other Buffers'],
    ],
    ' c': [
      ['r', 'Rename'],
      ['d', 'Line Diagnostics'],
      ['a', 'Code Action', NI],
      ['f', 'Format', NI],
    ],
    ' f': [
      ['f', 'Find Files'],
      ['b', 'Buffers'],
      ['n', 'New File', NI],
      ['r', 'Recent', NI],
    ],
    ' q': [['q', 'Quit All (back to map)']],
    ' s': [['g', 'Grep', NI], ['w', 'Word', NI], ['r', 'Search and Replace', NI]],
    g: [
      ['g', 'First Line'],
      ['d', 'Goto Definition'],
      ['r', 'References'],
      ['c', '+comment', 1],
      ['s', '+surround', 1],
      ['U', 'Uppercase'],
      ['u', 'Lowercase'],
      ['~', 'Toggle Case'],
      ['e', 'Prev Word End'],
    ],
    gs: [
      ['a', 'Add Surrounding'],
      ['d', 'Delete Surrounding'],
      ['r', 'Replace Surrounding'],
      ['f', 'Find Right Surrounding', NI],
      ['h', 'Highlight Surrounding', NI],
    ],
    gc: [
      ['c', 'Toggle Comment Line'],
      ['o', 'Add Comment Below'],
      ['O', 'Add Comment Above'],
      ['j', '…or any motion'],
    ],
    ']': [
      ['d', 'Next Diagnostic'],
      ['e', 'Next Error'],
      [']', 'Next Reference'],
      ['f', 'Next Function Start'],
      ['b', 'Next Buffer'],
      ['q', 'Next Quickfix', NI],
    ],
    '[': [
      ['d', 'Prev Diagnostic'],
      ['e', 'Prev Error'],
      ['[', 'Prev Reference'],
      ['f', 'Prev Function Start'],
      ['b', 'Prev Buffer'],
      ['q', 'Prev Quickfix', NI],
    ],
  };
  const TEXTOBJ = [
    ['w W', 'word / WORD'],
    ['( ) b', 'parens / any bracket'],
    ['[ ] { }', 'brackets / braces'],
    ['" \' ` q', 'quotes / any quote'],
    ['a', 'argument'],
    ['f', 'function'],
    ['u', 'function call'],
    ['i', 'indent scope'],
    ['g', 'entire buffer'],
    ['d', 'digits'],
    ['e', 'camelCase segment'],
    ['p', 'paragraph'],
    ['n l', 'next / last …'],
  ];
  const OPS = { d: 'delete', c: 'change', y: 'yank', '>': 'indent', '<': 'dedent', gc: 'comment', gU: 'uppercase', gu: 'lowercase', gsa: 'surround' };
  function whichKeyFor(v) {
    if (!v.gen || v.cmdline || v.flash || v.picker || v.tsnodes) return null;
    if (v.mode !== 'normal' && v.mode !== 'visual' && v.mode !== 'vline') return null;
    let keys = v.curKeys.slice();
    if (v.mode !== 'normal') return null;
    if (keys[0] === '"') keys = keys.slice(2);
    while (keys.length && /^[0-9]$/.test(keys[0])) keys.shift();
    const p = keys.join('');
    if (!p) return null;
    if (WK[p]) return { title: p === ' ' ? '<leader>' : p.replace(/^ /, '<leader>'), items: WK[p] };
    const m = p.match(/^(d|c|y|>|<|gc|gU|gu|gsa)[0-9]*([ia])$/);
    if (m) return { title: `${OPS[m[1]]}: ${m[2] === 'i' ? 'inside' : 'around'}`, items: TEXTOBJ.map(([k, d]) => [k, d]) };
    if (/^(d|c|y|gU|gu|gsa)[0-9]*$/.test(p) && p !== 'g')
      return {
        title: `${OPS[p.replace(/[0-9]/g, '')] || 'operator'}: motion or text object`,
        items: [
          ['i a', 'inside / around…', 1],
          ['w e b', 'words'],
          ['$ 0 ^', 'line edges'],
          ['f t', 'to a char'],
          ['s', 'flash jump'],
          ['r', 'remote flash'],
          ['j k', 'lines'],
          [p.slice(-1), 'whole line'],
        ],
      };
    return null;
  }

  // ---------- screens ----------
  function setScreen(s) {
    S.screen = s;
    S.modal = null;
    render();
  }
  function render() {
    if (S.screen === 'title') renderTitle();
    else if (S.screen === 'map') renderMap();
    else if (S.screen === 'codex') renderCodex();
    else if (S.screen === 'level') renderLevelShell();
  }

  function topbar(extra) {
    return `<header class="topbar">
      <button class="brand" data-act="title" title="Title screen"><span class="blk"></span>LazyQuest</button>
      ${extra || ''}
      <span class="spacer"></span>
      <span class="meter"><span class="stars">★</span> ${totalStars()} / ${LEVELS.length * 3}</span>
      <button class="btn" data-act="map">Map <kbd>m</kbd></button>
      <button class="btn" data-act="codex">Codex</button>
    </header>`;
  }

  function demoEditor() {
    const lines = [
      ['function ', 't-kw'],
      ['ride', 't-fn'],
    ];
    void lines;
    const rows = [
      'local quest = {',
      '  hero = "cursor",',
      '  keys = { "s", "gsa", "ciw" },',
      '  mouse = false,',
      '}',
    ];
    return `<div class="demo" aria-hidden="true">
      <div class="bufferline"><span class="tab on">quest.lua</span><span class="tab">keys.lua</span></div>
      <div class="buffer" style="min-height:0;padding:8px 0">${rows
        .map((r, i) => {
          const cls = highlight(r, 'lua');
          const html = [...r]
            .map((ch, c) => {
              let k = cls[c];
              if (i === 2 && c >= 13 && c <= 15) k += ' fm';
              if (i === 2 && c === 16) return `<span class="c fl">a</span>`;
              if (i === 1 && c === 2) k += ' cur idle';
              return `<span class="c ${k}">${esc(ch)}</span>`;
            })
            .join('');
          return `<div class="row ${i === 1 ? 'curline' : ''}"><span class="gutter">${i === 1 ? 2 : Math.abs(i - 1)}</span><span class="sign"></span><span class="text">${html}</span></div>`;
        })
        .join('')}</div>
      <div class="statusline"><span class="mode m-normal">NORMAL</span><span class="sl-file">quest.lua</span><span class="sl-fill"></span><span class="sl-cmd">s"gs</span><span class="sl-pos">2:3</span></div>
    </div>`;
  }

  function renderTitle() {
    const started = Object.keys(S.progress).length > 0;
    const next = LEVELS.findIndex((lv) => !S.progress[lv.id]);
    app.innerHTML = `
      <div class="mobile-note">LazyQuest is played with a physical keyboard. Plug one in or come back on a laptop.</div>
      <section class="title">
        <div>
          <h1 class="logo"><span class="z">Lazy</span><br><span class="q">Quest</span></h1>
          <p class="tag">Learn Vim the way <b>LazyVim</b> ships it: flash jumps, mini.surround, mini.ai text objects, auto-pairs, which-key and the picker. ${LEVELS.length} levels, 8 regions, no mouse.</p>
          <div class="cta">
            <button class="btn primary" data-act="${started ? 'continue' : 'start'}">${started ? 'Continue' : 'Start the quest'} <kbd>⏎</kbd></button>
            <button class="btn" data-act="map">Level map <kbd>m</kbd></button>
          </div>
          <div class="settings">
            <label><input type="checkbox" id="set-jk" ${S.settings.jk ? 'checked' : ''}> jk / kj escapes Insert mode <small>(a common personal mapping)</small></label>
            <label><input type="checkbox" id="set-sound" ${S.settings.sound ? 'checked' : ''}> Sound effects</label>
            <label><input type="checkbox" id="set-unlock" ${S.settings.unlockAll ? 'checked' : ''}> Unlock every level <small>(for people who already know Vim)</small></label>
          </div>
          <p class="note">Click inside the page first so it receives your keys. Your browser keeps Ctrl-w for itself, so this game never asks for it. Progress is saved in this browser.${started && next >= 0 ? ` Next up: ${esc(LEVELS[next].id)} ${esc(LEVELS[next].title)}.` : ''}</p>
        </div>
        ${demoEditor()}
      </section>`;
    app.querySelector('#set-jk').onchange = (e) => saveSetting('jk', e.target.checked);
    app.querySelector('#set-sound').onchange = (e) => saveSetting('sound', e.target.checked);
    app.querySelector('#set-unlock').onchange = (e) => saveSetting('unlockAll', e.target.checked);
  }
  function saveSetting(k, v) {
    S.settings[k] = v;
    store.set('settings', S.settings);
  }

  function renderMap() {
    let i = 0;
    const html = CHAPTERS.map((ch) => {
      const lv = LEVELS.filter((l) => l.ch === ch.id);
      const tiles = lv
        .map((l) => {
          const idx = LEVELS.indexOf(l);
          const p = S.progress[l.id];
          const lock = !unlocked(idx);
          i++;
          return `<button class="tile ${lock ? 'locked' : ''} ${p ? 'done' : ''} ${S.mapSel === idx ? 'sel' : ''}" data-play="${idx}" ${lock ? 'aria-disabled="true"' : ''}>
            <span class="id">${l.id}</span><span class="nm">${esc(l.title)}</span>${lock ? '<span class="stars off">🔒</span>' : starsHtml(p ? p.stars : 0)}
          </button>`;
        })
        .join('');
      return `<section class="chapter"><span class="cn">REGION ${ch.id}</span><h2>${esc(ch.name)}</h2><p>${esc(ch.blurb)}</p><div class="tiles">${tiles}</div></section>`;
    }).join('');
    app.innerHTML = `${topbar()}
      <div class="maphead"><h1>The Map of Bufferia</h1><span class="sub">Move with <span class="kc">h j k l</span> and press <span class="kc">⏎</span> to enter a level. Or click.</span></div>
      <div class="map">${html}</div>`;
  }

  function renderCodex() {
    const cards = CHAPTERS.map((ch) => {
      const items = LEVELS.filter((l) => l.ch === ch.id)
        .map((l) => {
          const done = !!S.progress[l.id];
          return l.teaches.map((t) => `<span class="${done ? '' : 'locked'}">${kc(teachKey(t.k))}</span><span class="d ${done ? '' : 'locked'}">${esc(t.d)}</span>`).join('');
        })
        .join('');
      return `<section class="card"><h3>${esc(ch.name)}</h3><div class="teach">${items}</div></section>`;
    }).join('');
    app.innerHTML = `${topbar()}<div class="maphead"><h1>Codex</h1><span class="sub">Every key you have learned. Greyed keys unlock as you clear levels.</span></div><div class="codex">${cards}</div>`;
  }

  // ---------- level ----------
  function startLevel(idx) {
    if (!unlocked(idx)) return;
    S.idx = idx;
    S.mapSel = idx;
    const lv = LEVELS[idx];
    S.game = new Game(lv, { jk: S.settings.jk });
    const ex = expandSolution(lv);
    S.solution = ex.keys;
    S.par = ex.keys.length;
    S.showHint = false;
    S.showSol = false;
    S.modal = null;
    S.notifyMsg = '';
    S.screen = 'level';
    renderLevelShell();
  }

  function renderLevelShell() {
    const lv = LEVELS[S.idx];
    const ch = CHAPTERS.find((c) => c.id === lv.ch);
    const banned = (lv.banned || []).filter((k) => k.length < 4);
    app.innerHTML = `${topbar(`<span class="crumb">${esc(ch.name)} · <b>${lv.id} ${esc(lv.title)}</b></span>`)}
      <div class="mobile-note">This level needs a physical keyboard.</div>
      <div class="level">
        <div class="editor" id="editor" tabindex="0" aria-label="Editor. Type Vim keys here.">
          <div class="bufferline" id="bufferline"></div>
          <div class="buffer" id="buf"></div>
          <div class="statusline" id="status"></div>
          <div class="cmdrow" id="cmdrow"></div>
          <div id="overlays"></div>
        </div>
        <aside class="panel">
          <section class="card">
            <h2 class="lvtitle">${esc(lv.title)}</h2>
            <div class="speaker">${owlSvg}<p class="story">${esc(lv.story)}</p></div>
            <p class="goal"><b>GOAL</b>${esc(lv.goal)}</p>
          </section>
          <section class="card">
            <h3>New keys</h3>
            <div class="teach">${lv.teaches.map((t) => `${kc(teachKey(t.k))}<span class="d">${esc(t.d)}</span>`).join('')}</div>
            ${banned.length ? `<div class="sealed">Sealed here: ${banned.map((k) => kc(k)).join(' ')}</div>` : ''}
          </section>
          <section class="card" id="progress"></section>
          <section class="card">
            <h3>Stuck?</h3>
            <div class="helprow">
              <button class="btn" data-act="hint">Hint</button>
              <button class="btn" data-act="solution">Show a solution</button>
              <button class="btn" data-act="reset">Restart <kbd>:e!</kbd></button>
            </div>
            <div id="help"></div>
          </section>
        </aside>
      </div>`;
    renderEditor();
    renderPanel();
    renderHelp();
    const ed = document.getElementById('editor');
    try {
      ed.focus({ preventScroll: true });
    } catch (e) {
      /* focus not permitted yet */
    }
  }

  function renderHelp() {
    const lv = LEVELS[S.idx];
    const el = document.getElementById('help');
    if (!el) return;
    el.innerHTML =
      (S.showHint ? `<p class="hinttext">${esc(lv.hint)}</p>` : '') +
      (S.showSol ? `<div class="solution">${S.solution.map((k) => kc(keyLabel(k))).join('')}</div>` : '');
  }

  function renderPanel() {
    const g = S.game;
    const el = document.getElementById('progress');
    if (!el) return;
    const gems = g.gems.length ? `<div class="gemcount">Gems ${g.gems.map((x) => `<span class="g ${x.got ? '' : 'off'}">◆</span>`).join('')}</div>` : '';
    const ts = g.targetStatus();
    let tgt = '';
    if (ts.length) {
      tgt = ts
        .map((t) => {
          const want = t.want.split('\n');
          const have = t.have.split('\n');
          const lines = want.map((w, i) => `<span class="ln ${(have[i] || '').replace(/\s+$/, '') === w.replace(/\s+$/, '') ? 'ok' : 'bad'}">${esc(w) || ' '}</span>`).join('');
          return `${ts.length > 1 ? `<div class="fname">${esc(t.name)} ${t.ok ? '✓' : ''}</div>` : ''}<pre>${lines}</pre>`;
        })
        .join('');
      tgt = `<div class="target">${tgt}</div>`;
    }
    const best = S.progress[LEVELS[S.idx].id];
    el.innerHTML = `<h3>${ts.length ? 'Make it look like this' : 'Collect'}</h3>${gems}${tgt}
      <div class="meter" style="margin-top:10px"><span class="keys">keys <b>${g.keys}</b> · par <b>${S.par}</b></span>${best ? `<span class="keys">best <b>${best.keys}</b></span>` : ''}</div>`;
  }

  function renderEditor() {
    const g = S.game;
    if (!g) return;
    const v = g.vim;
    const b = v.buf;
    const L = b.lines;
    // bufferline
    const bl = document.getElementById('bufferline');
    bl.innerHTML =
      v.open.map((f) => `<span class="tab ${f === b ? 'on' : ''}">${esc(f.name)}${f.undo.length ? '<span class="dot">●</span>' : ''}</span>`).join('') +
      (v.files.length > v.open.length ? `<span class="ghost">+${v.files.length - v.open.length} more in the picker</span>` : '');

    // visual range
    let selS = -1,
      selE = -1,
      selLine = null;
    if (v.vis) {
      const rg = v.visRange();
      if (rg.kind === 'line') selLine = [rg.r1, rg.r2];
      else {
        selS = rg.s;
        selE = rg.e;
      }
    }
    const search = {};
    for (const m of v.searchMatches()) for (let i = 0; i < m.len; i++) search[m.r + ':' + (m.c + i)] = 1;
    const fm = {},
      fl = {};
    if (v.flash) {
      const pl = v.flash.pat.length;
      for (const m of v.flash.matches) {
        for (let i = 0; i < pl; i++) fm[m.r + ':' + (m.c + i)] = 1;
        if (m.label) fl[m.r + ':' + (m.c + pl)] = m.label;
      }
    }
    const tsBefore = {},
      tsAfter = {},
      tsIn = {};
    if (v.tsnodes) {
      for (const n of v.tsnodes) {
        (tsBefore[n.s] = tsBefore[n.s] || []).push(n.label);
        (tsAfter[n.e] = tsAfter[n.e] || []).push(n.label);
      }
      const n0 = v.tsnodes[v.tsnodes.length - 1];
      for (let o = n0.s; o < n0.e; o++) tsIn[o] = 1;
    }
    const diags = v.diagnostics();
    const dmap = {};
    const drow = {};
    for (const d of diags) {
      for (let i = 0; i < d.len; i++) dmap[d.r + ':' + (d.c + i)] = 1;
      if (!drow[d.r]) drow[d.r] = d;
    }
    const gems = {};
    for (const x of g.gems) if (!x.got && x.file === b.name) gems[x.r + ':' + x.c] = 1;
    const showCursor = !v.picker;
    const insert = v.mode === 'insert';
    let off = 0;
    const rows = [];
    for (let r = 0; r < L.length; r++) {
      const line = L[r];
      const hl = highlight(line, b.ft);
      let extra = 0;
      if (r === b.r) extra = Math.max(extra, b.c - line.length + 1);
      if (line.length === 0) extra = Math.max(extra, 1);
      for (const k of Object.keys(fl)) {
        const [rr, cc] = k.split(':').map(Number);
        if (rr === r && cc >= line.length) extra = Math.max(extra, cc - line.length + 1);
      }
      for (const k of Object.keys(gems)) {
        const [rr, cc] = k.split(':').map(Number);
        if (rr === r && cc >= line.length) extra = Math.max(extra, cc - line.length + 1);
      }
      const n = line.length + Math.max(0, extra);
      let html = '';
      for (let c = 0; c < n; c++) {
        const o = off + c;
        const key = r + ':' + c;
        if (tsBefore[o]) html += tsBefore[o].map((l) => `<span class="tsl">${l}</span>`).join('');
        let ch = c < line.length ? line[c] : ' ';
        let k = 'c ' + (hl[c] || '');
        if (selLine ? r >= selLine[0] && r <= selLine[1] : o >= selS && o < selE) k += ' sel';
        if (search[key]) k += ' srch';
        if (dmap[key]) k += ' diag';
        if (tsIn[o]) k += ' tsr';
        if (fm[key]) k += ' fm';
        if (fl[key]) {
          k += ' fl';
          ch = fl[key];
        }
        if (gems[key]) k += ' gem' + (ch === ' ' ? ' blank' : '');
        if (showCursor && r === b.r && c === b.c) k += ' cur' + (insert ? ' ins' : '') + (v.gen ? '' : ' idle');
        html += `<span class="${k}" data-rc="${key}">${esc(ch)}</span>`;
        if (tsAfter[o + 1]) html += tsAfter[o + 1].map((l) => `<span class="tsl">${l}</span>`).join('');
      }
      off += line.length + 1;
      const isCur = r === b.r;
      const num = isCur ? r + 1 : Math.abs(r - b.r);
      const d = drow[r];
      rows.push(
        `<div class="row ${isCur ? 'curline' : ''}"><span class="gutter">${num}</span><span class="sign ${d ? 'err' : ''}">${d ? '●' : ''}</span><span class="text">${html}</span>${
          d ? `<span class="vt">● ${esc(d.msg)}</span>` : ''
        }</div>`
      );
    }
    const buf = document.getElementById('buf');
    buf.innerHTML = rows.join('');
    buf.parentElement.classList.toggle('flash-on', !!v.flash);
    const curEl = buf.querySelector('.cur');
    if (curEl && curEl.scrollIntoView) curEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });

    // statusline
    const modeName = v.cmdline && v.cmdline.prefix === ':' ? 'command' : v.gen && v.mode === 'normal' && v.curKeys.length && /^(d|c|y|>|<|g[cUu~]|gsa)/.test(v.curKeys.join('').replace(/^[0-9]+/, '')) ? 'pending' : v.mode;
    const label = { normal: 'NORMAL', insert: 'INSERT', visual: 'VISUAL', vline: 'V-LINE', command: 'COMMAND', pending: 'O-PENDING' }[modeName] || 'NORMAL';
    document.getElementById('status').innerHTML = `<span class="mode m-${modeName}">${label}</span><span class="sl-file">${esc(b.name)}${b.undo.length ? ' ●' : ''}</span><span class="sl-fill"></span>${
      v.recording ? `<span class="sl-rec">recording @${v.recording.reg}</span>` : ''
    }<span class="sl-cmd">${esc(v.pending.replace(/ /g, '␣').replace(/<Esc>/g, ''))}</span><span class="sl-pos">${b.r + 1}:${b.c + 1}</span>`;
    const cr = document.getElementById('cmdrow');
    const bottomSearch = v.cmdline && (v.cmdline.prefix === '/' || v.cmdline.prefix === '?');
    if (bottomSearch) cr.innerHTML = `${esc(v.cmdline.prefix + v.cmdline.text)}<span class="caret"></span>`;
    else cr.textContent = v.cmdline ? '' : insert ? '-- INSERT --' : v.msg || (v.recording ? `recording @${v.recording.reg}` : '');
    cr.classList.toggle('err', !!v.msgErr && !insert);

    // overlays
    let ov = '';
    if (v.cmdline && !bottomSearch) {
      const p = v.cmdline.prefix;
      const isSearch = p === '/' || p === '?';
      const title = p === ':' ? 'Cmdline' : isSearch ? 'Search' : p.replace(/:\s*$/, '');
      const icon = p === ':' ? '❯' : isSearch ? (p === '/' ? '' : '') : '✎';
      ov += `<div class="float noice ${isSearch ? 'search' : ''}"><span class="ttl"> ${esc(title)} </span><span class="icon">${isSearch ? esc(p) : icon}</span>${esc(v.cmdline.text)}<span class="caret"></span></div>`;
    }
    if (v.flash) ov += `<div class="float flashp">⚡ ${esc(v.flash.pat) || '<span style="color:var(--comment)">type a few letters of your target</span>'}</div>`;
    if (v.tsnodes) ov += `<div class="float flashp">⚡ treesitter: pick a label</div>`;
    if (v.picker) {
      const p = v.picker;
      const items = p.items
        .map((f, i) => {
          let hlName = esc(f.name);
          if (p.q) {
            let j = 0;
            hlName = [...f.name]
              .map((ch) => {
                if (j < p.q.length && ch.toLowerCase() === p.q[j].toLowerCase()) {
                  j++;
                  return `<span class="hl">${esc(ch)}</span>`;
                }
                return esc(ch);
              })
              .join('');
          }
          return `<li class="${i === p.idx ? 'on' : ''}">${hlName}</li>`;
        })
        .join('');
      const sel = p.items[p.idx];
      ov += `<div class="float picker"><span class="ttl"> ${p.title} </span><div class="pl"><div class="in"><span class="p">❯</span>${esc(p.q)}<span class="caret"></span></div><ul>${items || '<li>No results</li>'}</ul></div><div class="pv">${
        sel ? esc(sel.lines.slice(0, 14).join('\n')) : ''
      }</div></div>`;
    }
    const wk = whichKeyFor(v);
    if (wk && S.wkReady) {
      ov += `<div class="float whichkey"><span class="ttl"> ${esc(wk.title)} </span><div class="grid">${wk.items
        .map(([k, d, grp]) => `<span class="it ${grp === NI ? 'dim' : ''}"><span class="k">${esc(k)}</span><span class="d ${grp === 1 ? 'grp' : ''}">${esc(d)}</span></span>`)
        .join('')}</div><div class="foot">Esc to cancel${wk.items.some((x) => x[2] === NI) ? ' · dimmed keys exist in LazyVim but not in this game' : ''}</div></div>`;
    }
    if (v.popup && curEl) {
      const top = curEl.offsetTop + curEl.offsetHeight + 6 + document.getElementById('bufferline').offsetHeight;
      const left = Math.min(curEl.offsetLeft, 320);
      ov += `<div class="float popup ${v.popup.sev ? 'err' : ''}" style="top:${top}px;left:${left}px">${esc(v.popup.text)}</div>`;
    }
    if (S.notifyMsg) ov += `<div class="float notify ${S.notifyErr ? 'err' : ''}" id="notify">${esc(S.notifyMsg)}</div>`;
    if (S.toast) ov += `<div class="toast">${S.toast}</div>`;
    if (!S.focused) ov += `<div class="focuscover" data-act="focus">Click here to give LazyQuest your keyboard</div>`;
    document.getElementById('overlays').innerHTML = ov;
  }

  // which-key appears after a short pause, like the real plugin
  let wkTimer = null;
  function scheduleWhichKey() {
    S.wkReady = false;
    clearTimeout(wkTimer);
    wkTimer = setTimeout(() => {
      S.wkReady = true;
      if (S.screen === 'level') renderEditor();
    }, 380);
  }

  let toastTimer = null;
  function toast(html) {
    S.toast = html;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      S.toast = null;
      if (S.screen === 'level') renderEditor();
    }, 1800);
  }
  let notifyTimer = null;
  function notify(msg, err) {
    S.notifyMsg = msg;
    S.notifyErr = err;
    clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => {
      S.notifyMsg = '';
    }, 3200);
  }

  function sparkle(r, c) {
    const el = document.querySelector(`#buf [data-rc="${r}:${c}"]`);
    const ed = document.getElementById('editor');
    if (!el || !ed) return;
    const s = document.createElement('span');
    s.className = 'sparkle';
    s.textContent = '+◆';
    const a = el.getBoundingClientRect(),
      e = ed.getBoundingClientRect();
    s.style.left = a.left - e.left + 'px';
    s.style.top = a.top - e.top - 6 + 'px';
    ed.appendChild(s);
    setTimeout(() => s.remove(), 950);
  }

  function pressInLevel(key) {
    const g = S.game;
    const v = g.vim;
    const prevMsg = v.msg;
    const ok = g.press(key);
    if (!ok && g.rejected) {
      beep('nope');
      toast(`<b>${esc(keyLabel(g.rejected))}</b> is sealed in this level`);
    }
    // events from the engine (:q, :e!, <leader>qq)
    const evs = v.events.splice(0);
    for (const ev of evs) {
      if (ev === 'quit') return setScreen('map');
      if (ev === 'reset') return startLevel(S.idx);
      if (ev === 'help') S.showHint = true;
    }
    if (v.msg && v.msg !== prevMsg && /Renamed|written|substitutions/.test(v.msg)) notify(v.msg);
    const got = g.lastGems || [];
    renderEditor();
    renderPanel();
    renderHelp();
    if (got.length) {
      beep('gem');
      got.forEach((x) => sparkle(x.r, x.c));
    }
    if (whichKeyFor(v)) scheduleWhichKey();
    else S.wkReady = false;
    if (g.won) finishLevel();
  }

  function finishLevel() {
    const g = S.game;
    const lv = LEVELS[S.idx];
    const stars = g.stars(S.par);
    const prev = S.progress[lv.id];
    S.progress[lv.id] = { stars: Math.max(stars, prev ? prev.stars : 0), keys: Math.min(g.keys, prev ? prev.keys : Infinity) };
    store.set('progress', S.progress);
    beep('win');
    S.modal = 'win';
    const last = S.idx === LEVELS.length - 1;
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = `<div class="win" role="dialog" aria-label="Level complete">
      <h2>${last ? 'Bufferia is free' : 'Gate opened'}</h2>
      <div class="bigstars">${'★'.repeat(stars)}<span class="off">${'★'.repeat(3 - stars)}</span></div>
      <p>${g.keys} keys · par ${S.par}${g.keys <= S.par ? ' · at or under par' : stars === 2 ? ' · close to par' : ' · try for fewer keys'}</p>
      <div class="learned">${lv.teaches.map((t) => kc(teachKey(t.k))).join('')}</div>
      ${last ? '<p>You beat the Mouse King. Everything here works the same in real LazyVim, so go and use it.</p>' : ''}
      <div class="row2">
        ${last ? '' : '<button class="btn primary" data-act="next">Next level <kbd>⏎</kbd></button>'}
        <button class="btn" data-act="retry">Retry <kbd>r</kbd></button>
        <button class="btn" data-act="map">Map <kbd>m</kbd></button>
      </div></div>`;
    document.body.appendChild(m);
  }
  function closeModal() {
    S.modal = null;
    document.querySelectorAll('.modal').forEach((x) => x.remove());
  }

  // ---------- input ----------
  function keyName(e) {
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph', 'Dead'].includes(e.key)) return null;
    if (e.metaKey) return null;
    const named = { Escape: '<Esc>', Enter: '<CR>', Backspace: '<BS>', Tab: '<Tab>', ArrowLeft: '<Left>', ArrowRight: '<Right>', ArrowUp: '<Up>', ArrowDown: '<Down>', Delete: '<Del>', Home: '<Home>', End: '<End>' };
    if (named[e.key]) return named[e.key];
    if (e.ctrlKey && e.altKey) return e.key.length === 1 ? e.key : null; // AltGr
    if (e.ctrlKey) {
      if (e.key === '[') return '<Esc>';
      if (e.key === ' ') return '<C-space>';
      const m = e.code && e.code.match(/^Key([A-Z])$/);
      if (m) return '<C-' + m[1].toLowerCase() + '>';
      return null;
    }
    if (e.altKey) {
      const m = e.code && e.code.match(/^Key([A-Z])$/);
      return m ? '<A-' + m[1].toLowerCase() + '>' : null;
    }
    return e.key.length === 1 ? e.key : null;
  }

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      const k = keyName(e);
      if (!k) return;
      if (S.modal === 'win') {
        e.preventDefault();
        if (k === '<CR>' || k === 'n') {
          closeModal();
          if (S.idx < LEVELS.length - 1) startLevel(S.idx + 1);
          else setScreen('map');
        } else if (k === 'r') {
          closeModal();
          startLevel(S.idx);
        } else if (k === 'm' || k === '<Esc>') {
          closeModal();
          setScreen('map');
        }
        return;
      }
      if (S.screen === 'level' && S.game) {
        e.preventDefault();
        S.focused = true;
        pressInLevel(k);
        return;
      }
      if (S.screen === 'title') {
        if (k === '<CR>') {
          e.preventDefault();
          act(Object.keys(S.progress).length ? 'continue' : 'start');
        } else if (k === 'm') setScreen('map');
        return;
      }
      if (S.screen === 'map' || S.screen === 'codex') {
        if (k === 'm' && S.screen === 'codex') return setScreen('map');
        if (S.screen === 'codex') {
          if (k === '<Esc>') setScreen('map');
          return;
        }
        const cur = LEVELS[S.mapSel];
        const sameCh = LEVELS.map((l, i) => [l, i]).filter(([l]) => l.ch === cur.ch);
        const pos = sameCh.findIndex(([, i]) => i === S.mapSel);
        let ni = S.mapSel;
        if (k === 'j' || k === '<Down>') ni = sameCh[Math.min(sameCh.length - 1, pos + 1)][1];
        else if (k === 'k' || k === '<Up>') ni = sameCh[Math.max(0, pos - 1)][1];
        else if (k === 'l' || k === '<Right>' || k === 'h' || k === '<Left>') {
          const nc = Math.max(1, Math.min(CHAPTERS.length, cur.ch + (k === 'l' || k === '<Right>' ? 1 : -1)));
          const list = LEVELS.map((l, i) => [l, i]).filter(([l]) => l.ch === nc);
          ni = list[Math.min(pos, list.length - 1)][1];
        } else if (k === 'gg' || k === 'g') ni = 0;
        else if (k === 'G') ni = LEVELS.length - 1;
        else if (k === '<CR>' || k === ' ') {
          e.preventDefault();
          if (unlocked(S.mapSel)) startLevel(S.mapSel);
          return;
        } else if (k === '<Esc>') return setScreen('title');
        else return;
        e.preventDefault();
        S.mapSel = ni;
        renderMap();
        const sel = app.querySelector('.tile.sel');
        if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
      }
    },
    true
  );

  function act(a, el) {
    if (a === 'title') return setScreen('title');
    if (a === 'map') {
      closeModal();
      return setScreen('map');
    }
    if (a === 'codex') return setScreen('codex');
    if (a === 'start') return startLevel(0);
    if (a === 'continue') {
      const next = LEVELS.findIndex((lv) => !S.progress[lv.id]);
      return next >= 0 ? startLevel(next) : setScreen('map');
    }
    if (a === 'next') {
      closeModal();
      return S.idx < LEVELS.length - 1 ? startLevel(S.idx + 1) : setScreen('map');
    }
    if (a === 'retry' || a === 'reset') {
      closeModal();
      return startLevel(S.idx);
    }
    if (a === 'hint') {
      S.showHint = !S.showHint;
      return renderHelp();
    }
    if (a === 'solution') {
      S.showSol = !S.showSol;
      return renderHelp();
    }
    if (a === 'focus') {
      S.focused = true;
      renderEditor();
    }
    void el;
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act],[data-play]');
    if (!t) {
      if (S.screen === 'level' && e.target.closest('#editor')) {
        S.focused = true;
        renderEditor();
      }
      return;
    }
    if (t.dataset.play !== undefined) {
      const i = +t.dataset.play;
      S.mapSel = i;
      if (unlocked(i)) startLevel(i);
      else renderMap();
    } else act(t.dataset.act, t);
    if (t.blur) t.blur();
  });

  window.addEventListener('blur', () => {
    S.focused = false;
    if (S.screen === 'level') renderEditor();
  });
  window.addEventListener('focus', () => {
    S.focused = true;
    if (S.screen === 'level') renderEditor();
  });

  try {
    S.focused = document.hasFocus();
  } catch (e) {
    S.focused = true;
  }
  render();
})();
