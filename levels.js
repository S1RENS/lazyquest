/* LazyQuest levels. In file text, ‸ marks the cursor and ¤ marks a gem on the next character.
   `solution` is the reference run; its key count is the level's par. */
(function (G) {
  'use strict';
  const t = (...lines) => lines.join('\n');
  const MOVE = ['h', 'j', 'k', 'l'];
  const WORDS = ['w', 'b', 'e', 'W', 'B', 'E'];

  const CHAPTERS = [
    { id: 1, name: 'Home Row Hollow', blurb: 'Your fingers rest on h j k l. Learn to walk, count and hop.' },
    { id: 2, name: 'Flashwood', blurb: 'flash.nvim turns the screen into a jump map. Stop walking, start teleporting.' },
    { id: 3, name: 'Insert Isles', blurb: 'Write text, then leave Insert mode the moment you are done.' },
    { id: 4, name: 'Operator Keep', blurb: 'Verbs and motions: d, c, y combine with everything you know.' },
    { id: 5, name: 'Textobject Temple', blurb: 'mini.ai gives you words, quotes, brackets, arguments, indents and functions.' },
    { id: 6, name: 'Surround Spire', blurb: 'mini.surround adds, deletes and swaps the things around your text.' },
    { id: 7, name: 'Visual Vale', blurb: 'Select first, then act. Comment, indent, move and shout.' },
    { id: 8, name: 'LSP Lighthouse', blurb: 'Diagnostics, go-to-definition, rename, buffers and the file picker.' },
  ];

  const LEVELS = [
    // ───────────── Chapter 1 ─────────────
    {
      id: '1-1',
      ch: 1,
      title: 'First Steps',
      story: 'The Mouse King stole the mouse from every editor in Bufferia, and good riddance. Here you move with four keys under your right hand.',
      goal: 'Collect every gem.',
      teaches: [
        { k: 'h', d: 'left' },
        { k: 'j', d: 'down' },
        { k: 'k', d: 'up' },
        { k: 'l', d: 'right' },
      ],
      hint: 'j looks like an arrow pointing down. Hold your fingers on j k l ; like typing.',
      files: [{ name: 'welcome.txt', text: t('‸Bufferia has no mouse.', 'Only ¤keys.', 'h left   l ¤right', 'j down   k ¤up', 'Grab every gem¤.') }],
      solution: 'jllllljlllllljjlll',
    },
    {
      id: '1-2',
      ch: 1,
      title: 'Counting Stones',
      story: 'LazyVim shows relative line numbers in the gutter. The number next to a line is how far away it is. Put a count before a move to repeat it.',
      goal: 'Collect the three gems using counts like 8j and 11l.',
      teaches: [
        { k: '5j', d: 'move 5 lines down (any count + motion)' },
        { k: '3l', d: 'move 3 columns right' },
      ],
      hint: 'Read the gutter: the row with the first gem says how many lines down it is.',
      files: [
        {
          name: 'stones.txt',
          text: t(
            '‸The gutter on the left counts lines away from you.',
            'Type a number before a move to repeat it.',
            '5j jumps five lines down. 3l steps three right.',
            '',
            '  ·  ·  ·  ·  ·',
            '  ·  ·  ·  ·  ·',
            '  ·  ·  ·  ·  ·',
            '  ·  ·  ·  ·  ·',
            '  ·  ·  ·  ¤·  ·',
            '  ·  ·  ·  ·  ·',
            '  ·  ¤·  ·  ·  ·',
            '  ·  ·  ·  ·  ·',
            '  ·  ·  ·  ·  ¤·'
          ),
        },
      ],
      solution: '8j11l2j6h2j9l',
    },
    {
      id: '1-3',
      ch: 1,
      title: 'Word Hopping',
      story: 'Words are stepping stones. w hops to the start of the next word, e lands on the end of a word, b hops back. h and l are sealed on this crossing.',
      goal: 'Collect the gems with w, e and b. Counts work too: 3w.',
      teaches: [
        { k: 'w', d: 'start of next word' },
        { k: 'e', d: 'end of word' },
        { k: 'b', d: 'back to start of word' },
        { k: 'W B E', d: 'same, but WORDS split only on spaces' },
      ],
      banned: ['h', 'l'],
      hint: '3w hops three words at once.',
      files: [
        {
          name: 'river.txt',
          text: t(
            '‸Words are stepping ¤stones across the river.',
            'w hops to the start of the nex¤t word,',
            'e lands on the ¤end of a word,',
            'and b hops back to the star¤t.',
            'No h or l allowed on this crossing!'
          ),
        },
      ],
      solution: '3wj3ej4bj3e',
    },
    {
      id: '1-4',
      ch: 1,
      title: 'Edges of the World',
      story: 'Lines have edges and files have ends. 0 goes to column zero, ^ to the first letter, $ to the last character. gg flies to the top and G drops to the bottom.',
      goal: 'Collect all five gems. h and l are sealed.',
      teaches: [
        { k: '0', d: 'start of line' },
        { k: '^', d: 'first non-blank character' },
        { k: '$', d: 'end of line' },
        { k: 'gg', d: 'first line' },
        { k: 'G', d: 'last line (5G = line 5)' },
      ],
      banned: ['h', 'l'],
      hint: 'Neovim keeps your column when you jump with G or gg. After $ that column is "the end".',
      files: [
        {
          name: 'edges.txt',
          text: t(
            '¤    ¤Indented ‸lines hide their first letter.',
            '0 jumps to column zero, ^ to the first letter,',
            '$ runs to the very end of the line¤.',
            'gg flies to the top. G drops to the bottom.',
            '',
            '    ¤The bottom line ends with a gem¤!'
          ),
        },
      ],
      solution: '02j$G^gg',
    },

    // ───────────── Chapter 2 ─────────────
    {
      id: '2-1',
      ch: 2,
      title: 'Find a Letter',
      story: 'f then a letter jumps to that letter. With flash.nvim it even crosses lines. Press f again to hop to the next match. t stops one step before the letter, and F and T go backwards.',
      goal: 'Collect the gems. h, l and word motions are sealed.',
      teaches: [
        { k: 'f{char}', d: 'jump to char (flash: any line)' },
        { k: 'f again', d: 'next match (F = previous)' },
        { k: 't{char}', d: 'jump to just before char' },
        { k: 'F T', d: 'backwards versions' },
      ],
      banned: ['h', 'l', ...WORDS],
      hint: 'After fp, pressing f again repeats the search for p. Any other key ends the repeat.',
      files: [
        {
          name: 'flash.txt',
          text: t('‸Flash finds letters fast: ¤press f and a letter.', 'Press f again to ho¤p to the next one.', 'Use t to stop one ¤step before a¤ letter.'),
        },
      ],
      solution: 'fpftlFs',
    },
    {
      id: '2-2',
      ch: 2,
      title: 'Flash Jump',
      story: 'Press s and type the first letters of where you want to go. Every match gets a coloured label. Type the label and you are there. Look at your target first, then type two letters from it.',
      goal: 'Collect the gems with s. Walking, words and f/t are sealed.',
      teaches: [
        { k: 's', d: 'flash jump: type chars, then the label' },
        { k: '<CR>', d: 'jump to the nearest match' },
      ],
      banned: [...MOVE, ...WORDS, 'f', 't', 'F', 'T', '/', '?'],
      hint: 'Labels never use the letter that comes next in a match, so if you are not sure, keep typing the word.',
      files: [
        {
          name: 'jump.txt',
          text: t(
            '‸Flash turns the whole screen into a jump map.',
            'Press s, type the first letters of where you want to go,',
            'and coloured ¤labels appear next to every match.',
            'Type the label to land there. No counting, no stepping.',
            '',
            'The trick is to look at your ¤target first,',
            'then type two letters from it. Labels ¤never',
            'reuse the next letter of a match, so you can',
            'keep typing the word if you are not ¤sure.'
          ),
        },
      ],
      solution: '<flash:la@2:13><flash:ta@5:29><flash:ne@6:38><flash:su@8:36>',
    },
    {
      id: '2-3',
      ch: 2,
      title: 'Search the Logs',
      story: 'Something is failing on the server. / starts a search, Enter jumps to the match, n goes to the next one and N to the previous. * searches for the word under the cursor.',
      goal: 'Land on the third ERROR, then on the second mention of mara.',
      teaches: [
        { k: '/text<CR>', d: 'search forward' },
        { k: 'n N', d: 'next / previous match' },
        { k: '*', d: 'search word under cursor' },
        { k: '<Esc>', d: 'clear the highlight' },
      ],
      banned: [...MOVE, ...WORDS, 'f', 't', 'F', 'T', 's'],
      hint: 'Searches ignore case unless you type a capital letter.',
      files: [
        {
          name: 'server.log',
          text: t(
            '‸[09:00] INFO  boot ok',
            '[09:01] WARN  disk 81%',
            '[09:02] ERROR db timeout',
            '[09:03] INFO  retry',
            '[09:04] ERROR db timeout',
            '[09:05] INFO  cache warm',
            '[09:06] ¤ERROR auth failed',
            '[09:07] INFO  user mara logged in',
            '[09:08] INFO  user ¤mara logged out'
          ),
        },
      ],
      solution: '/err<CR>nn/mar<CR>*',
    },
    {
      id: '2-4',
      ch: 2,
      title: 'Matching Pairs',
      story: '% jumps between matching brackets. } and { jump between paragraphs, which are blocks separated by blank lines.',
      goal: 'Collect the gems. Only j, k, $, %, { and } are needed.',
      teaches: [
        { k: '%', d: 'matching bracket' },
        { k: '} {', d: 'next / previous blank line' },
      ],
      banned: ['h', 'l', ...WORDS, 'f', 't', 'F', 'T', 's', '/', '?'],
      hint: '% uses the first bracket at or after the cursor, so go to the { first with $.',
      files: [
        {
          name: 'bakery.js',
          text: t(
            '‸function bake(cake) {',
            '  if (cake.ready) {',
            '    serve(cake);',
            '  }',
            '  return cake;',
            '¤}',
            '¤',
            'function clean(kitchen) {',
            '  kitchen.wipe();',
            '¤}'
          ),
        },
      ],
      solution: '$%}j$%',
    },
    {
      id: '2-5',
      ch: 2,
      title: 'Remote Grab',
      story: 'In LazyVim, r after an operator is remote flash. yr jumps away, yanks a text object there, and brings the cursor straight back. You never leave your spot.',
      goal: 'Put the hero\'s name between the quotes: yr, flash to Wren, iw, then p.',
      teaches: [{ k: 'yr{flash}iw', d: 'remote yank: grab a word without moving' }],
      hint: 'yr, type wr, then the label, then iw. The cursor jumps back to the quote and p pastes after it.',
      files: [
        {
          name: 'hero.js',
          text: t('let hero = ‸"";', '// Our hero, Wren, guards the keys.'),
          target: t('let hero = "Wren";', '// Our hero, Wren, guards the keys.'),
        },
      ],
      solution: 'yr<label:wr@1:13>iwp',
    },

    // ───────────── Chapter 3 ─────────────
    {
      id: '3-1',
      ch: 3,
      title: 'Insert and Append',
      story: 'i inserts before the cursor and a appends after it. I and A jump to the start or end of the line first. Esc takes you back to Normal mode, which is where you should spend most of your time.',
      goal: 'Make the text match the target on the right.',
      teaches: [
        { k: 'i a', d: 'insert before / after cursor' },
        { k: 'I A', d: 'insert at line start / end' },
        { k: '<Esc>', d: 'back to Normal mode' },
      ],
      hint: 'A jumps to the end of the line, wherever the cursor is.',
      files: [
        {
          name: 'greeting.txt',
          text: t('‸ello, Bufferia', 'The cursor is ready', 'remember to press Escape'),
          target: t('Hello, Bufferia!', 'The cursor is ready to learn.', 'Always remember to press Escape.'),
        },
      ],
      solution: 'iH<Esc>A!<Esc>jA to learn.<Esc>jIAlways <Esc>A.<Esc>',
    },
    {
      id: '3-2',
      ch: 3,
      title: 'Open a Line',
      story: 'o opens a new line below and O opens one above, already indented. You also get mini.pairs: type a quote and its partner appears. Type the closing quote and the cursor just steps over it.',
      goal: 'Add "map" above "rope" and "bread" below "lantern".',
      teaches: [
        { k: 'o O', d: 'open line below / above' },
        { k: '"', d: 'mini.pairs closes quotes and brackets' },
      ],
      hint: 'Type the full "bread", including both quotes. The second one steps over the auto-inserted quote.',
      files: [
        {
          name: 'pack.js',
          text: t('const pack = [', '  "rope",', '  ‸"lantern",', '];'),
          target: t('const pack = [', '  "map",', '  "rope",', '  "lantern",', '  "bread",', '];'),
        },
      ],
      solution: 'o"bread",<Esc>kkO"map",<Esc>',
    },
    {
      id: '3-3',
      ch: 3,
      title: 'Small Repairs',
      story: 'Small fixes, all from Normal mode. x deletes a character, r replaces one, ~ flips its case and J joins the next line onto this one.',
      goal: 'Repair the sentence so it matches the target.',
      teaches: [
        { k: 'x', d: 'delete character' },
        { k: 'r{char}', d: 'replace character' },
        { k: '~', d: 'toggle case' },
        { k: 'J', d: 'join lines' },
      ],
      hint: 'fg lands on the first g of "Kingg". J adds the space for you.',
      files: [
        {
          name: 'notice.txt',
          text: t('‸the Mouse Kingg stole', 'the keys of', 'Bufferia, we want them back!'),
          target: 'The Mouse King stole the keys of Bufferia. We want them back!',
        },
      ],
      solution: '~fgxJJf,r.w~',
    },
    {
      id: '3-4',
      ch: 3,
      title: 'Auto Pairs',
      story: 'mini.pairs closes (, [, { and quotes for you. When the closer is already there, typing it again just steps over it, so type as if it was not there.',
      goal: 'Fill in the hero object.',
      teaches: [
        { k: '( [ {', d: 'auto-closed by mini.pairs' },
        { k: ') ] }', d: 'steps over an existing closer' },
        { k: '<BS>', d: 'between a pair, deletes both' },
      ],
      hint: 'Type the whole line normally, closers included. mini.pairs keeps it tidy.',
      files: [
        {
          name: 'hero.js',
          text: t('const hero = {', '  name: ‸,', '};'),
          target: t('const hero = {', '  name: "Wren",', '  tools: ["map", "lamp"],', '};'),
        },
      ],
      solution: 'i"Wren<Esc>otools: ["map", "lamp"],<Esc>',
    },

    // ───────────── Chapter 4 ─────────────
    {
      id: '4-1',
      ch: 4,
      title: 'The Delete Verb',
      story: 'Operators are verbs. d means delete and it waits for a motion: dw deletes a word, d3w three words, dd a whole line, D to the end of the line.',
      goal: 'Delete the extra words and lines.',
      teaches: [
        { k: 'dw d3w', d: 'delete word(s)' },
        { k: 'dd', d: 'delete line' },
        { k: 'D', d: 'delete to end of line' },
      ],
      hint: 'f. lands on the full stop, l steps past it, D removes the rest.',
      files: [
        {
          name: 'cleanup.txt',
          text: t(
            '‸Remove the the extra words.',
            'This line should not exist at all.',
            'Keep this part. Cut everything after the full stop. Like this.',
            'Delete these three words: alpha beta gamma'
          ),
          target: t('Remove the extra words.', 'Keep this part.', 'Delete these three words:'),
        },
      ],
      solution: 'wdwjddf.lDjfad3w',
    },
    {
      id: '4-2',
      ch: 4,
      title: 'The Change Verb',
      story: 'c is delete-and-insert. cw changes to the end of the word, ce the same, cc the whole line, C to the end of the line. Type the new text and press Esc.',
      goal: 'Make the code match the target.',
      teaches: [
        { k: 'cw ce', d: 'change word' },
        { k: 'cc', d: 'change whole line' },
        { k: 'C', d: 'change to end of line' },
      ],
      hint: 'cw on "colour" only changes the word. The = stays put.',
      files: [
        {
          name: 'paint.js',
          text: t('‸let colour = "red";', 'const size = 10;', '// TODO: write this comment properly'),
          target: t('let color = "blue";', 'const size = 42;', '// Explains the colour choice'),
        },
      ],
      solution: 'wcwcolor<Esc>frcwblue<Esc>jbce42<Esc>jcc// Explains the colour choice<Esc>',
    },
    {
      id: '4-3',
      ch: 4,
      title: 'Yank and Put',
      story: 'y yanks (copies), p puts after the cursor and P before it. ddp is a classic: cut a line and put it below the next one to swap them.',
      goal: 'Fix the recipe order and add step four.',
      teaches: [
        { k: 'yy', d: 'yank line' },
        { k: 'p P', d: 'put after / before' },
        { k: 'ddp', d: 'swap two lines' },
      ],
      hint: 'Copy "step three" with yyp, then change its words.',
      files: [
        {
          name: 'recipe.txt',
          text: t('‸step two: mix', 'step one: crack eggs', 'step three: bake'),
          target: t('step one: crack eggs', 'step two: mix', 'step three: bake', 'step four: eat'),
        },
      ],
      solution: 'ddpGyypwcwfour<Esc>wwcweat<Esc>',
    },
    {
      id: '4-4',
      ch: 4,
      title: 'Undo and Dot',
      story: 'u undoes and Ctrl-r redoes. The dot . repeats your last change. Make the change once, jump to the next spot with n, and press dot.',
      goal: 'Rename every "price" to "cost".',
      teaches: [
        { k: 'u', d: 'undo' },
        { k: '<C-r>', d: 'redo' },
        { k: '.', d: 'repeat last change' },
        { k: '* n .', d: 'find next, repeat' },
      ],
      hint: '* searches for price. cwcost<Esc> once, then n . n . n .',
      files: [
        {
          name: 'cart.js',
          text: t('‸let total = price * qty;', 'log(price);', 'if (price > 100) discount(price);'),
          target: t('let total = cost * qty;', 'log(cost);', 'if (cost > 100) discount(cost);'),
        },
      ],
      solution: 'fp*cwcost<Esc>n.n.n.',
    },
    {
      id: '4-5',
      ch: 4,
      title: 'Record a Macro',
      story: 'qa starts recording into register a and q stops. @a plays it back and @@ plays the last macro again. Record one line, end on the next line, and the rest is free.',
      goal: 'Turn the CSV into objects.',
      teaches: [
        { k: 'qa … q', d: 'record macro a' },
        { k: '@a', d: 'play macro a' },
        { k: '@@', d: 'play last macro again' },
      ],
      hint: 'Inside the macro: I{ name: "<Esc>, f, then cl", age: <Esc>, A },<Esc>, j0.',
      files: [
        {
          name: 'people.csv',
          text: t('‸ada,36', 'grace,85', 'linus,54'),
          target: t('{ name: "ada", age: 36 },', '{ name: "grace", age: 85 },', '{ name: "linus", age: 54 },'),
        },
      ],
      solution: 'qaI{ name: "<Esc>f,cl", age: <Esc>A },<Esc>j0q@a@@',
    },

    // ───────────── Chapter 5 ─────────────
    {
      id: '5-1',
      ch: 5,
      title: 'Inner Word',
      story: 'Text objects describe a thing, not a direction. iw is the inner word under the cursor, aw is the word plus its space. ciw works from anywhere inside a word.',
      goal: 'Rename the variable and delete the extra "really"s.',
      teaches: [
        { k: 'ciw', d: 'change inner word' },
        { k: 'daw', d: 'delete a word (with space)' },
      ],
      hint: 'You are in the middle of userName, and ciw does not care where.',
      files: [
        {
          name: 'user.js',
          text: t('const user‸Name = getUser(id).name;', '// this is really really really slow'),
          target: t('const displayName = getUser(id).name;', '// this is really slow'),
        },
      ],
      solution: 'ciwdisplayName<Esc>jdaw.',
    },
    {
      id: '5-2',
      ch: 5,
      title: 'Quotes and Brackets',
      story: 'i" is inside quotes, i( inside parentheses, i[ inside brackets. mini.ai also searches forward, so ci" works even before the quotes. Add n for the next one: cin( skips past the brackets you are in.',
      goal: 'Edit the strings and brackets to match.',
      teaches: [
        { k: 'ci" di( da[', d: 'quotes and brackets' },
        { k: 'iq ib', d: 'any quote / any bracket' },
        { k: 'cin(', d: 'next bracket pair (mini.ai)' },
      ],
      hint: 'From the start of the line, ci" jumps forward into "Hello".',
      files: [
        {
          name: 'greet.js',
          text: t('‸greet("Hello", (name || "stranger"));', 'const list = [1, 2, 3];'),
          target: t('greet("Howdy", (user));', 'const list = [];'),
        },
      ],
      solution: 'ci"Howdy<Esc>cin(user<Esc>jdi[',
    },
    {
      id: '5-3',
      ch: 5,
      title: 'Arguments',
      story: 'ia is an argument and aa is an argument with its comma. mini.ai knows where each argument starts and ends, even in nested calls.',
      goal: 'Remove the unwanted arguments and change retries to 3.',
      teaches: [
        { k: 'daa', d: 'delete argument + comma' },
        { k: 'cia', d: 'change argument' },
      ],
      hint: 'After daa the cursor sits on a comma, and cia picks the next argument.',
      files: [
        {
          name: 'net.js',
          text: t('resize(width, height, ‸true);', 'connect(host, port, timeout, retries);'),
          target: t('resize(width, height);', 'connect(host, port, 3);'),
        },
      ],
      solution: 'daajdaacia3<Esc>',
    },
    {
      id: '5-4',
      ch: 5,
      title: 'Indent Scope',
      story: 'ii is every line at this indent level, and ai adds the lines around it. In Python that makes cii the fastest way to rewrite a body.',
      goal: 'Replace the whole body of greet with a single return.',
      teaches: [
        { k: 'cii dii', d: 'change / delete indent scope' },
        { k: 'ai', d: 'scope plus border lines' },
      ],
      hint: 'cii keeps the indentation for you.',
      files: [
        {
          name: 'greet.py',
          text: t('def greet(name):', '    ‸print("hi")', '    print("debug 1")', '    print("debug 2")', '    return name', '', 'def bye():', '    pass'),
          target: t('def greet(name):', '    return f"hi {name}"', '', 'def bye():', '    pass'),
        },
      ],
      solution: 'ciireturn f"hi {name}"<Esc>',
    },
    {
      id: '5-5',
      ch: 5,
      title: 'Functions',
      story: 'With treesitter, if is the inside of a function and af is the whole function. cif rewrites a body, daf removes a function and yaf copies one.',
      goal: 'Replace the body of add with a single line.',
      teaches: [
        { k: 'cif', d: 'change function body' },
        { k: 'daf yaf', d: 'delete / yank whole function' },
        { k: 'ig ag', d: 'whole buffer (yig = copy file)' },
      ],
      hint: 'The cursor does not have to be inside the body. cif finds the function.',
      files: [
        {
          name: 'add.js',
          text: t('‸function add(a, b) {', '  // TODO', '  console.log(a, b);', '  return a + b;', '}'),
          target: t('function add(a, b) {', '  return a + b;', '}'),
        },
      ],
      solution: 'cifreturn a + b;<Esc>',
    },

    // ───────────── Chapter 6 ─────────────
    {
      id: '6-1',
      ch: 6,
      title: 'Add Surroundings',
      story: 'gsa means "surround add". Give it a motion or text object, then the character: gsaiw" wraps a word in quotes. ) wraps tightly and ( adds spaces inside.',
      goal: 'Quote the string and wrap the maths and the argument.',
      teaches: [
        { k: 'gsaiw"', d: 'surround word with quotes' },
        { k: 'gsat;)', d: 'surround until ; with ()' },
        { k: ') vs (', d: 'tight vs spaced' },
      ],
      hint: 'gsaiw[ with the open bracket adds spaces inside: [ value ].',
      files: [
        {
          name: 'wrap.js',
          text: t('‸const msg = hello;', 'const total = price * qty;', 'log value'),
          target: t('const msg = "hello";', 'const total = (price * qty);', 'log [ value ]'),
        },
      ],
      solution: 'fhgsaiw"fpgsat;)fvgsaiw[',
    },
    {
      id: '6-2',
      ch: 6,
      title: 'Delete and Replace',
      story: 'gsd" deletes the quotes around the cursor. gsr\'" replaces single quotes with double ones. The cursor has to be inside the surrounding.',
      goal: 'Fix the quotes, swap the brackets and drop the extra parentheses.',
      teaches: [
        { k: 'gsd(', d: 'delete surrounding (and inner spaces)' },
        { k: "gsr'\"", d: 'replace surrounding' },
      ],
      hint: 'gsd( with an open bracket also removes the spaces just inside.',
      files: [
        {
          name: 'swap.py',
          text: t("‸title = 'Bufferia'", 'items = [[1, 2], [3, 4]]', 'call(( x ))'),
          target: t('title = "Bufferia"', 'items = [(1, 2), [3, 4]]', 'call(x)'),
        },
      ],
      solution: "fBgsr'\"jf1gsr])fxgsd(",
    },
    {
      id: '6-3',
      ch: 6,
      title: 'Function Calls',
      story: 'Surround with f and mini.surround asks for a function name. In Visual mode, gsa wraps the selection. V selects whole lines.',
      goal: 'Wrap the lines in function calls.',
      teaches: [
        { k: 'gsa$f', d: 'wrap to end of line in a call' },
        { k: 'V gsa)', d: 'surround a visual selection' },
      ],
      hint: 'gsa$f, then type upper and press Enter.',
      files: [
        {
          name: 'calls.js',
          text: t('‸user.name.trim()', 'total + tax'),
          target: t('upper(user.name.trim())', 'log((total + tax) * 2)'),
        },
      ],
      solution: 'gsa$fupper<CR>jVgsa)A * 2<Esc>Vgsaflog<CR>',
    },

    // ───────────── Chapter 7 ─────────────
    {
      id: '7-1',
      ch: 7,
      title: 'Select, Then Act',
      story: 'v starts a selection and V selects whole lines. Move with any motion, then press an operator like d, y or c. o jumps to the other end of the selection.',
      goal: 'Cut the middle of the sentence and the two junk lines.',
      teaches: [
        { k: 'v', d: 'visual (characters)' },
        { k: 'V', d: 'visual line' },
        { k: 'o', d: 'other end of selection' },
      ],
      hint: 'fR, v, f. (flash crosses the line), l, d.',
      files: [
        {
          name: 'cut.txt',
          text: t('‸Keep this. Remove from here', 'until here. Keep this too.', 'line to delete', 'line to delete', 'Last line stays.'),
          target: t('Keep this. Keep this too.', 'Last line stays.'),
        },
      ],
      solution: 'fRvf.ldjVjd',
    },
    {
      id: '7-2',
      ch: 7,
      title: 'Comments',
      story: 'gc is the comment operator. gcc toggles the current line and gcj does two lines. LazyVim adds gco, which opens a comment line below.',
      goal: 'Comment out the debug logs and add a note under the answer.',
      teaches: [
        { k: 'gcc', d: 'toggle comment on line' },
        { k: 'gc{motion}', d: 'comment a range: gcj gcip' },
        { k: 'gco gcO', d: 'add comment below / above' },
      ],
      hint: 'gco puts you in Insert mode right after the //.',
      files: [
        {
          name: 'answer.js',
          text: t('‸console.log("debug 1");', 'const answer = 42;', 'console.log("debug 2");', 'console.log("debug 3");', '', 'function f() {}'),
          target: t(
            '// console.log("debug 1");',
            'const answer = 42;',
            '// the answer',
            '// console.log("debug 2");',
            '// console.log("debug 3");',
            '',
            'function f() {}'
          ),
        },
      ],
      solution: 'gccjgcothe answer<Esc>jgcj',
    },
    {
      id: '7-3',
      ch: 7,
      title: 'Move and Indent',
      story: 'Alt-j and Alt-k move lines down and up, also with a count or a selection. > and < indent. In LazyVim a visual indent keeps the selection, so you can press > again.',
      goal: 'Put the lines in order inside the function and indent them.',
      teaches: [
        { k: '<A-j> <A-k>', d: 'move line(s) down / up' },
        { k: '> <', d: 'indent / dedent (>> on a line)' },
      ],
      hint: 'G, then 3 Alt-k lifts init() three lines.',
      files: [
        {
          name: 'setup.js',
          text: t('‸function setup() {', 'start();', 'configure();', '}', 'init();'),
          target: t('function setup() {', '  init();', '  configure();', '  start();', '}'),
        },
      ],
      solution: 'G3<A-k>j<A-j>Vkk><Esc>',
    },
    {
      id: '7-4',
      ch: 7,
      title: 'Loud and Quiet',
      story: 'gU makes things uppercase and gu makes them lowercase. They are operators, so gUiw works on a word and guu on a line. In Visual mode, U and u do the same.',
      goal: 'Fix the case of each line.',
      teaches: [
        { k: 'gUiw', d: 'uppercase word' },
        { k: 'guu', d: 'lowercase line' },
        { k: 'v U u ~', d: 'case in visual' },
      ],
      hint: 'Underscores are part of a word, so iw grabs api_key whole.',
      files: [
        {
          name: 'consts.js',
          text: t('‸const api_key = "abc";', 'THIS LINE IS SHOUTING', 'make me a constant: max_size'),
          target: t('const API_KEY = "abc";', 'this line is shouting', 'make me a constant: MAX_SIZE'),
        },
      ],
      solution: 'wgUiwjguuj$gUiw',
    },

    // ───────────── Chapter 8 ─────────────
    {
      id: '8-1',
      ch: 8,
      title: 'Squash the Squiggles',
      story: 'The language server underlines mistakes. ]d jumps to the next diagnostic and shows the message, and [d goes back. <leader>cd shows the message for the current line.',
      goal: 'Fix every diagnostic.',
      teaches: [
        { k: ']d [d', d: 'next / previous diagnostic' },
        { k: '<leader>cd', d: 'line diagnostics' },
      ],
      hint: ']d, then ciw and the right word. Three times.',
      diagnostics: [
        { pattern: '\\bcosnt\\b', message: "Cannot find name 'cosnt'. Did you mean 'const'?" },
        { pattern: '\\blenght\\b', message: "Property 'lenght' does not exist. Did you mean 'length'?" },
        { pattern: '\\bretrun\\b', message: "Cannot find name 'retrun'. Did you mean 'return'?" },
      ],
      files: [
        {
          name: 'items.js',
          text: t('‸// ]d jumps to the next red squiggle', 'cosnt items = load();', 'for (const item of items) {', '  if (item.lenght > 3) {', '    retrun item;', '  }', '}'),
          target: t('// ]d jumps to the next red squiggle', 'const items = load();', 'for (const item of items) {', '  if (item.length > 3) {', '    return item;', '  }', '}'),
        },
      ],
      solution: ']dciwconst<Esc>]dciwlength<Esc>]dciwreturn<Esc>',
    },
    {
      id: '8-2',
      ch: 8,
      title: 'Definitions and Renames',
      story: 'gd jumps to where a name is defined, even in another file. <leader>cr renames a symbol everywhere it is used. Space is the leader key in LazyVim. Wait a moment after pressing it and which-key shows what comes next.',
      goal: 'Rename result to product, jump to calc\'s definition, and rename calc to multiply.',
      teaches: [
        { k: 'gd', d: 'go to definition' },
        { k: '<C-o>', d: 'jump back' },
        { k: '<leader>cr', d: 'rename symbol (Ctrl-u clears the prompt)' },
      ],
      hint: 'The rename prompt starts with the old name. Ctrl-u clears it.',
      files: [
        {
          name: 'main.js',
          text: t('import { calc } from "./math.js";', '', 'const ‸result = calc(2, 3);', 'console.log(result);'),
          target: t('import { multiply } from "./math.js";', '', 'const product = multiply(2, 3);', 'console.log(product);'),
        },
        {
          name: 'math.js',
          open: false,
          text: t('export function ¤calc(a, b) {', '  return a * b;', '}'),
          target: t('export function multiply(a, b) {', '  return a * b;', '}'),
        },
      ],
      solution: ' cr<C-u>product<CR>wwgd cr<C-u>multiply<CR>',
    },
    {
      id: '8-3',
      ch: 8,
      title: 'Buffers and the Picker',
      story: '<leader><space> opens the file picker. Type a few letters and press Enter. Open files sit in the bufferline at the top, and H and L move between them.',
      goal: 'Move the finished task from todo.md to done.md, then go back to README.md and collect the gem.',
      teaches: [
        { k: '<leader><space>', d: 'find files' },
        { k: 'H L', d: 'previous / next buffer' },
        { k: '<leader>bd', d: 'close buffer' },
        { k: '<leader>,', d: 'switch buffer' },
      ],
      hint: '<leader><space>, type tod, Enter. Then dd, and the same trick for done.md.',
      files: [
        { name: 'README.md', text: t('‸# Chores', 'Find todo.md and done.md with <leader><space>.', '¤Come back here with H when you are done.') },
        { name: 'todo.md', open: false, text: t('# Todo', '- [x] oil the hinge', '- [ ] water the plants'), target: t('# Todo', '- [ ] water the plants') },
        { name: 'done.md', open: false, text: t('# Done'), target: t('# Done', '- [x] oil the hinge') },
      ],
      solution: '  tod<CR>jdd  don<CR>p2HG',
    },
    {
      id: '8-4',
      ch: 8,
      title: 'Search and Replace',
      story: ':%s/old/new/g replaces in the whole file. :g/pattern/d deletes every line that matches. Both use Vim regex, where \\| means "or".',
      goal: 'Delete the comment and debug lines, then make the team green.',
      teaches: [
        { k: ':%s/a/b/g', d: 'substitute in file' },
        { k: ':g/pat/d', d: 'delete matching lines' },
      ],
      hint: 'One :g with ^#\\|debug removes four lines at once.',
      files: [
        {
          name: 'team.toml',
          text: t('‸# TODO: remove debug lines', 'debug = true', 'color = "blue"', 'debug_level = 3', 'title = "blue team"', '# TODO: check colors'),
          target: t('color = "green"', 'title = "green team"'),
        },
      ],
      solution: ':g/^#\\|debug/d<CR>:%s/blue/green/g<CR>',
    },
    {
      id: '8-5',
      ch: 8,
      title: 'The Mouse King\'s Config',
      story: 'The Mouse King left his last trap in this function. Use everything you have learned. There are many ways through, but par is tight.',
      goal: 'Rename mouse to cursor, steal to find, use double quotes, and drop the console.log lines.',
      teaches: [{ k: 'everything', d: 'you are ready for real LazyVim' }],
      hint: 'f<space> and 2x for the spaces, <leader>cr for mouse, /steal and ciw, :s/\'/"/g, then 2dd.',
      files: [
        {
          name: 'king.js',
          text: t('‸function   loadKeys(mouse) {', "  const keys = mouse.steal('h', 'j', 'k', 'l');", '  console.log("stolen");', '  console.log("ha ha");', '  return keys;', '}'),
          target: t('function loadKeys(cursor) {', '  const keys = cursor.find("h", "j", "k", "l");', '  return keys;', '}'),
        },
      ],
      solution: 'f 2xfm cr<C-u>cursor<CR>/steal<CR>ciwfind<Esc>:s/\'/"/g<CR>j2dd',
    },
  ];

  G.LazyQuestLevels = { CHAPTERS, LEVELS };
  if (typeof module !== 'undefined') module.exports = G.LazyQuestLevels;
})(typeof globalThis !== 'undefined' ? globalThis : this);
