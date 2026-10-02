import { spawn } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const dir = new URL('..', import.meta.url).pathname;
require(dir + 'engine.js'); const { expandSolution } = require(dir + 'game.js'); const { LEVELS } = require(dir + 'levels.js');
const page = dir + 'test/page.html';
fs.writeFileSync(page, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>' + fs.readFileSync(dir + 'dist/lazyquest.html', 'utf8') + '</body></html>');
const shots = dir + 'test/shots/'; fs.mkdirSync(shots, { recursive: true });
const port = 9333;
const W = +(process.env.W || 1366), H = +(process.env.H || 900);
const chrome = spawn('chromium-browser', ['--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}test/chrprofile-${Date.now()}`, '--disable-crash-reporter', '--disable-breakpad', '--no-first-run', `--window-size=${W},${H}`, '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); const logs = [];
async function connect() {
  for (let i = 0; i < 50; i++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = l.find(t => t.type === 'page'); if (p) return p.webSocketDebuggerUrl; } catch (e) {} await sleep(200); }
  throw new Error('no chrome');
}
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const SPECIAL = { '<Esc>': ['Escape', 'Escape', 27], '<CR>': ['Enter', 'Enter', 13], '<BS>': ['Backspace', 'Backspace', 8], '<Tab>': ['Tab', 'Tab', 9] };
async function key(k) {
  let mods = 0, keyv = k, code = '', vk = 0, text = k;
  if (SPECIAL[k]) { [keyv, code, vk] = SPECIAL[k]; text = k === '<CR>' ? '\r' : ''; }
  else if (/^<C-(.)>$/.test(k)) { const c = k[3]; mods = 2; keyv = c; code = 'Key' + c.toUpperCase(); vk = c.toUpperCase().charCodeAt(0); text = ''; }
  else if (/^<A-(.)>$/.test(k)) { const c = k[3]; mods = 1; keyv = c; code = 'Key' + c.toUpperCase(); vk = c.toUpperCase().charCodeAt(0); text = ''; }
  else { if (/[a-z]/i.test(k)) { code = 'Key' + k.toUpperCase(); vk = k.toUpperCase().charCodeAt(0); } if (k === ' ') { code = 'Space'; vk = 32; } if (/[A-Z]/.test(k)) mods = 8; }
  await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: keyv, code, windowsVirtualKeyCode: vk, modifiers: mods, text });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyv, code, windowsVirtualKeyCode: vk, modifiers: mods });
}
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(shots + name + '.png', Buffer.from(r.data, 'base64')); }
(async () => {
  ws = new WebSocket(await connect());
  await new Promise(r => ws.onopen = r);
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + JSON.stringify(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text)); if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') logs.push('ERR ' + d.params.args.map(a => a.value || a.description).join(' ')); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'file://' + page }); await sleep(1500);
  const mode = process.argv[2] || 'all';
  if (mode === 'mobile') { await shot('m1-title'); await key('m'); await sleep(150); await shot('m2-map'); await key('<CR>'); await sleep(200); await shot('m3-level'); } else if (mode === 'shots') {
    await shot('01-title');
    await key('<CR>'); await sleep(200); await shot('02-level1');
    await evalJs(`document.querySelector('[data-act=map]').click()`); await sleep(200); await shot('03-map');
    await evalJs(`(${(() => { try { localStorage.setItem('lazyquest:settings', JSON.stringify({ unlockAll: true, sound: false })); } catch (e) {} }).toString()})()`);
    await send('Page.reload'); await sleep(1200);
    await key('m'); await sleep(100);
    const go = async (id) => { await key('<Esc>'); await key('<Esc>'); await evalJs(`document.querySelector('[data-act=map]').click()`); await sleep(100); const i = LEVELS.findIndex(l => l.id === id); await evalJs(`document.querySelector('[data-play="${i}"]').click()`); await sleep(200); };
    await go('2-2'); await key('s'); await key('l'); await key('a'); await sleep(150); await shot('04-flash');
    await key('<Esc>'); await go('8-3'); await key(' '); await sleep(600); await shot('05-whichkey');
    await key(' '); await key('t'); await sleep(150); await shot('06-picker');
    await key('<Esc>'); await go('8-1'); for (const k of [']', 'd']) await key(k); await sleep(150); await shot('07-diag');
    await go('3-4'); for (const k of ['i', '"', 'W']) await key(k); await key(':'); await sleep(100); await shot('08-insert');
    await key('<Esc>'); await key(':'); await key('%'); await key('s'); await sleep(100); await shot('09-cmdline');
    await key('<Esc>'); await go('5-3'); await key('d'); await key('i'); await sleep(600); await shot('10-whichkey-textobj');
    await key('<Esc>'); await go('1-1'); for (const k of expandSolution(LEVELS[0]).keys) await key(k); await sleep(300); await shot('11-win');
  } else {
    await evalJs(`localStorage.setItem('lazyquest:settings', JSON.stringify({ unlockAll: true, sound: false }))`);
    await send('Page.reload'); await sleep(1200);
    let bad = 0;
    for (let i = 0; i < LEVELS.length; i++) {
      await evalJs(`document.querySelectorAll('.modal').forEach(m=>m.remove())`);
      await key('m'); await sleep(50);
      await evalJs(`document.querySelector('[data-act=map]')?.click()`); await sleep(50);
      await evalJs(`document.querySelector('[data-play="${i}"]').click()`); await sleep(100);
      for (const k of expandSolution(LEVELS[i]).keys) await key(k);
      await sleep(150);
      const won = await evalJs(`!!document.querySelector('.modal .win')`);
      if (!won) { bad++; await shot('fail-' + LEVELS[i].id); console.log('✗', LEVELS[i].id, await evalJs(`document.getElementById('cmdrow')?.textContent + ' | ' + document.getElementById('status')?.textContent`)); }
      else console.log('✓', LEVELS[i].id);
      await key('m'); await sleep(50);
    }
    console.log(bad ? bad + ' failed in browser' : 'all levels won in browser');
  }
  console.log(logs.length ? logs.join('\n') : 'no console errors');
  chrome.kill(); process.exit(0);
})().catch(e => { console.error(e); chrome.kill(); process.exit(1); });
