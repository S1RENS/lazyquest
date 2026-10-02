import fs from 'fs';
const dir = new URL('.', import.meta.url).pathname;
const r = (f) => fs.readFileSync(dir + f, 'utf8');
const html = `<title>LazyQuest</title>
<meta name="description" content="Learn LazyVim keybindings by playing: flash, mini.surround, mini.ai and more.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=JetBrains+Mono:ital,wght@0,400;0,700;0,800;1,400&family=Silkscreen&display=swap">
<style>
${r('style.css')}
</style>
<main class="app" id="app"></main>
<script>
${r('engine.js')}
</script>
<script>
${r('game.js')}
</script>
<script>
${r('levels.js')}
</script>
<script>
${r('ui.js')}
</script>
`;
fs.mkdirSync(dir + 'dist', { recursive: true });
fs.writeFileSync(dir + 'dist/lazyquest.html', html);
// standalone page for GitHub Pages (the artifact host adds this skeleton itself)
fs.writeFileSync(dir + 'index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${html}`.replace('<main class="app"', '</head>\n<body>\n<main class="app"') + '</body>\n</html>\n');
console.log('built', (html.length / 1024).toFixed(1) + 'KB');
