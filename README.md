# LazyQuest

A keyboard-only browser game that teaches Vim the way [LazyVim](https://www.lazyvim.org) ships it: flash jumps, mini.surround, mini.ai text objects, auto-pairs, which-key, the file picker and LSP keys. 35 levels, no mouse.

**Play:** https://s1rens.github.io/lazyquest/

## Develop

```sh
node build.mjs          # bundles the source into index.html
node test/levels.mjs    # replays every level's reference solution
node test/fuzz.mjs 1 500   # compares the editor against real Neovim (needs nvim + mini.ai + mini.surround)
```

The editor engine (`engine.js`) is a small Vim emulator with LazyVim's defaults: flash char mode and jumps, mini.ai and mini.surround behaviour, mini.pairs, `<A-j>`/`<A-k>`, `H`/`L` buffers and `gco`.
