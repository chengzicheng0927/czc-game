/* 独立小游戏层：Pointer Events、键盘、暂停与统一结算。 */
(function () {
  'use strict';
  const G = window.Game;
  G.ui = G.ui || {};
  const runtime = G.runtime.minigames;
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const button = (text, fn, cls) => { const node = el('button', cls || 'ui-button', text); node.type = 'button'; node.addEventListener('click', fn); return node; };
  const rules = () => G.sys.minigames.rules;
  const configFor = id => G.data.minigames.find(game => game.id === id);
  // 先分别抽取朋友和家具，避免扩充居民后把家具挤出所有难度的牌池。
  function memoryPool(residents, furniture, pairs, rng = Math.random) {
    if (!Number.isInteger(pairs) || pairs < 1) return [];
    const shuffle = list => {
      const result = list.slice();
      for (let i = result.length - 1; i > 0; i--) {
        const value = Number(rng()), unit = Math.max(0, Math.min(.999999999, Number.isFinite(value) ? value : 0)), j = Math.floor(unit * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    };
    const group = (list, type) => {
      const seen = new Set();
      return shuffle(list.filter(item => {
        if (!item || typeof item.id !== 'string' || seen.has(item.id)) return false;
        seen.add(item.id); return true;
      }).map(item => ({ type, id: item.id, name: item.name })));
    };
    const friends = group(residents, 'resident'), objects = group(furniture, 'furniture');
    const selected = friends.splice(0, Math.ceil(pairs / 2)).concat(objects.splice(0, Math.floor(pairs / 2)));
    return shuffle(selected.concat(shuffle(friends.concat(objects)).slice(0, Math.max(0, pairs - selected.length))));
  }
  function catalog() {
    return G.data.minigames.map(game => {
      const kitchen = game.id === 'bakery' && !Object.values(G.state.house.rooms).some(room => room.type === 'kitchen');
      return Object.assign({}, game, { locked: kitchen || G.state.level < game.unlockLv, unlockText: kitchen ? '先建一间厨房吧' : G.state.level < game.unlockLv ? 'Lv.' + game.unlockLv + ' 开放' : '' });
    });
  }
  function showResult(session, result, early) {
    const body = el('div', 'ui-stack bakery-result');
    body.append(el('div', 'bakery-stars', '⭐'.repeat(result.stars)), el('h3', '', early ? '玩过的每一步，都有小礼物。' : '收下一份软乎乎的快乐！'), el('p', '', session.summary ? session.summary() : '收集 ' + result.score + ' 分'), el('p', 'ui-notice', '🍬 糖果币 +' + result.coin + '　⭐ 经验 +' + result.exp));
    if (result.half) body.append(el('p', 'ui-small ui-muted', '今天的大奖已领完，继续玩也有小奖励哦。'));
    let modal;
    body.append(button('把礼物带回小屋', () => { modal.close(); G.ui.open('play'); }, 'ui-button ui-button-primary'), button('再玩一局', () => { modal.close(); start(session.id, session.options); }));
    modal = G.ui.modal({ title: configFor(session.id).icon + ' ' + configFor(session.id).name + ' · 小礼物', content: body });
    G.ui.audio.play('level'); G.ui.refresh();
  }
  function host(id, options) {
    const config = configFor(id), body = el('div', 'ui-stack minigame');
    const stats = el('div', 'minigame-stats bakery-stats'), counter = el('strong', '', '准备好了吗？'), score = el('strong', '', '0 分');
    stats.append(counter, score);
    const status = el('p', 'minigame-status ui-notice', '3 · 小云朵正在准备礼物'); status.setAttribute('aria-live', 'polite');
    const stage = el('div', 'minigame-stage'), actions = el('div', 'ui-actions');
    const session = runtime.running = { id, options, body, stage, counter, scoreNode: score, status, score: 0, elapsed: 0, ready: false, paused: false, finished: false, countdown: 3, tasks: [], disposers: [], raf: null, sessionId: G.sys.minigames.begin(id), resultStars: () => rules().scoreStars(id, session.score) };
    const pause = button('⏸ 休息一下', () => {
      if (!session.ready || session.finished) return;
      session.paused = !session.paused; pause.textContent = session.paused ? '▶ 接着玩' : '⏸ 休息一下';
      status.textContent = session.paused ? '☁ 时间也在休息，准备好再继续。' : session.help;
      if (session.onPause) session.onPause(session.paused);
    });
    actions.append(pause, button('收好本局礼物', () => session.finish(true), 'ui-button ui-button-soft'));
    body.append(stats, status, actions, stage, el('p', 'ui-small ui-muted', '每一局都有礼物。按 Esc 或关闭窗口，也会收好本局奖励。'));
    session.delay = (seconds, fn) => session.tasks.push({ remaining: seconds, fn });
    session.listen = (node, type, fn, opts) => { node.addEventListener(type, fn, opts); session.disposers.push(() => node.removeEventListener(type, fn, opts)); };
    session.canPlay = () => session.ready && !session.paused && !session.finished;
    session.setScore = value => { session.score = Math.max(0, Math.floor(value)); score.textContent = session.score + ' 分'; };
    session.finish = early => {
      if (session.finished) return;
      session.finished = true; cancelAnimationFrame(session.raf); session.tasks = [];
      session.disposers.forEach(fn => fn()); runtime.running = null;
      const result = G.sys.minigames.finish(id, { score: session.score, stars: early ? 1 : session.resultStars(), sessionId: session.sessionId });
      if (session.modal) session.modal.close();
      if (result.ok) showResult(session, result, early);
    };
    G.ui.panel.close();
    session.modal = G.ui.modal({ title: config.icon + ' ' + config.name, content: body, lockBackdrop: true, onClose() { if (!session.finished) setTimeout(() => session.finish(true), 0); } });
    session.modal.element.classList.add('minigame-modal');
    session.listen(document, 'visibilitychange', () => { if (document.hidden && session.ready && !session.paused) pause.click(); });
    let last = performance.now();
    function frame(now) {
      if (session.finished) return;
      const dt = Math.min(.15, Math.max(0, (now - last) / 1000)); last = now;
      if (!session.ready) {
        session.countdown -= dt;
        const count = Math.ceil(session.countdown);
        if (count > 0) status.textContent = count + ' · 小云朵正在准备礼物';
        else { session.ready = true; status.textContent = session.help; if (session.onReady) session.onReady(); }
      } else if (!session.paused) {
        session.elapsed += dt;
        const pending = session.tasks; session.tasks = [];
        pending.forEach(task => { task.remaining -= dt; if (task.remaining <= 0) { if (!session.finished) task.fn(); } else session.tasks.push(task); });
        if (!session.finished && session.update) session.update(dt);
      }
      if (!session.finished) session.raf = requestAnimationFrame(frame);
    }
    session.raf = requestAnimationFrame(frame);
    return session;
  }
  function drawFlower(canvas, cell) {
    const c = canvas.getContext('2d'), flower = G.data.minigameFlowers[cell.color];
    c.clearRect(0, 0, 80, 80); c.save(); c.translate(40, 40); c.fillStyle = flower.color;
    for (let i = 0; i < 6; i++) { c.save(); c.rotate(i * Math.PI / 3); c.beginPath(); c.ellipse(0, -17, 12, 18, 0, 0, Math.PI * 2); c.fill(); c.restore(); }
    c.fillStyle = flower.center; c.strokeStyle = '#8F6A69'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 13, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#71545D'; c.beginPath(); c.arc(-4, -1, 1.4, 0, Math.PI * 2); c.arc(4, -1, 1.4, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(0, 3, 3, 0, Math.PI); c.stroke();
    if (cell.special) { c.font = '27px sans-serif'; c.textAlign = 'center'; c.fillText(cell.special === 'row' ? '🦋' : '🌈', 19, 27); }
    c.restore();
  }
  function startMatch(options) {
    const config = configFor('match3'), s = host('match3', options), r = rules();
    let board = r.createBoard(config.size, config.colors), moves = config.moves, selected = null, busy = false, combo = 0;
    const grid = el('div', 'match3-board'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', '7乘7花朵棋盘，先选一朵，再选相邻的一朵交换。方向键移动焦点，回车选择。');
    const tiles = [], canvases = [];
    s.help = '点两朵相邻花交换，也可以拖动。三连收花，蝴蝶清一行，彩虹清同色。';
    for (let i = 0; i < board.length; i++) {
      const tile = button('', () => choose(i), 'flower-tile'); tile.dataset.cell = i;
      const canvas = el('canvas'); canvas.width = 80; canvas.height = 80; canvas.setAttribute('aria-hidden', 'true'); tile.append(canvas); tiles.push(tile); canvases.push(canvas); grid.append(tile);
      let down = null;
      s.listen(tile, 'pointerdown', event => { if (!s.canPlay() || busy) return; down = { x: event.clientX, y: event.clientY, pointer: event.pointerId }; tile.setPointerCapture(event.pointerId); });
      s.listen(tile, 'pointerup', event => {
        if (!down || down.pointer !== event.pointerId || !s.canPlay() || busy) { down = null; return; }
        const dx = event.clientX - down.x, dy = event.clientY - down.y; down = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) return;
        const target = i + (Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : Math.sign(dy) * config.size);
        if (r.adjacent(i, target, config.size)) { tile.dataset.swiped = 'yes'; swap(i, target); setTimeout(() => delete tile.dataset.swiped, 0); }
      });
      s.listen(tile, 'pointercancel', () => { down = null; });
      s.listen(tile, 'keydown', event => {
        const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -config.size, ArrowDown: config.size }[event.key];
        if (!delta) return; event.preventDefault(); const target = i + delta;
        if (target >= 0 && target < board.length && (Math.abs(delta) !== 1 || Math.floor(target / config.size) === Math.floor(i / config.size))) tiles[target].focus();
      });
    }
    s.stage.append(grid);
    s.stage.append(button('💡 看一眼提示', () => {
      if (!s.canPlay() || busy || moves <= 0) return; const move = r.findMove(board, config.size);
      tiles.forEach(tile => tile.classList.remove('is-hint'));
      if (move) { selected = move[0]; render(); tiles[move[1]].classList.add('is-hint'); s.delay(1.5, () => tiles[move[1]].classList.remove('is-hint')); s.status.textContent = '这两朵花，好像想换个位置。'; }
    }));
    function render() {
      s.counter.textContent = '🌿 还可以交换 ' + moves + ' 次';
      board.forEach((cell, i) => {
        if (cell) { drawFlower(canvases[i], cell); tiles[i].setAttribute('aria-label', '第' + (Math.floor(i / config.size) + 1) + '行第' + (i % config.size + 1) + '列，' + G.data.minigameFlowers[cell.color].name + (cell.special === 'row' ? '，蝴蝶，交换可消一整行' : cell.special === 'color' ? '，彩虹花，交换可消同色' : '')); }
        tiles[i].classList.toggle('is-selected', selected === i); tiles[i].setAttribute('aria-pressed', selected === i ? 'true' : 'false');
        tiles[i].classList.toggle('special-row', !!cell && cell.special === 'row'); tiles[i].classList.toggle('special-color', !!cell && cell.special === 'color');
      });
    }
    function choose(i) {
      if (tiles[i].dataset.swiped || !s.canPlay() || busy || moves <= 0) return;
      if (selected === null) { selected = i; render(); return; }
      if (selected === i) { selected = null; render(); return; }
      if (r.adjacent(selected, i, config.size)) swap(selected, i); else { selected = i; render(); }
    }
    function swap(a, b) {
      if (busy || !s.canPlay() || moves <= 0) return;
      tiles.forEach(tile => tile.classList.remove('is-hint'));
      selected = null; busy = true; const valid = r.validSwap(board, a, b, config.size);
      board = r.swapped(board, a, b); render();
      if (!valid) {
        s.status.textContent = '这两朵还没连起来，轻轻换回去，不用步数。'; G.ui.audio.play('soft');
        s.delay(.25, () => { board = r.swapped(board, a, b); busy = false; render(); }); return;
      }
      moves--; combo = 0;
      const activated = [];
      if (board[a].special) activated.push({ index: a, color: board[b].color });
      if (board[b].special) activated.push({ index: b, color: board[a].color });
      s.delay(.18, () => resolve([b, a], activated));
    }
    function resolve(preferred, activated) {
      const round = r.clearRound(board, config.size, preferred, activated);
      if (!round.removed.length) {
        if (!r.findMove(board, config.size)) { board = r.reshuffle(board, config.size, config.colors); s.status.textContent = '风儿帮花朵换了位置，现在又可以继续啦。'; render(); }
        else s.status.textContent = s.help;
        busy = moves <= 0; render(); if (moves <= 0) s.delay(.5, () => s.finish(false)); return;
      }
      combo++; s.setScore(s.score + round.score * combo);
      s.status.textContent = combo > 1 ? '✨ 连锁 ' + combo + ' 次！花香又多了一点。' : round.created.length ? '🦋 一朵特别的花，正在等你！' : '🌼 收下 ' + round.removed.length + ' 朵花的香气。';
      round.removed.forEach(i => tiles[i].classList.add('is-clearing')); G.ui.audio.play('success');
      s.delay(.22, () => {
        board = r.refill(round.board, config.size, config.colors); tiles.forEach(tile => tile.classList.remove('is-clearing')); render();
        // 防止极端补充序列永远连锁；正常情况下会继续自动补充到稳定棋盘。
        if (combo >= 40) { board = r.createBoard(config.size, config.colors); render(); busy = false; if (moves <= 0) s.finish(false); }
        else s.delay(.18, () => resolve([], []));
      });
    }
    s.summary = () => '收集 ' + s.score + ' 分 · 用了 ' + (config.moves - moves) + ' 步';
    render();
  }
  function startMemory(options) {
    const config = configFor('memory'), difficulty = config.difficulties.find(d => d.id === options.difficulty) || config.difficulties[0];
    const s = host('memory', Object.assign({}, options, { difficulty: difficulty.id })), pairs = difficulty.columns * difficulty.rows / 2;
    let flips = 0, found = 0, open = [], busy = false, completedAt = null;
    const unique = memoryPool(G.data.residents, G.data.furniture, pairs);
    const cards = rules().shuffle([...unique, ...unique].map(item => Object.assign({}, item, { matched: false, open: false })));
    const board = el('div', 'memory-board'); board.style.gridTemplateColumns = 'repeat(' + difficulty.columns + ', minmax(0, 1fr))'; board.setAttribute('role', 'group'); board.setAttribute('aria-label', difficulty.columns + '列' + difficulty.rows + '行记忆卡片');
    const tiles = [], images = [];
    s.help = '一次翻开两张，找到一样的朋友或家具。慢慢想，没有时间限制。';
    cards.forEach((card, index) => {
      const tile = button('', () => flip(index), 'memory-tile');
      const back = el('span', 'memory-back', '☁'), canvas = el('canvas', 'memory-face'); canvas.width = 120; canvas.height = 100; canvas.setAttribute('aria-hidden', 'true'); back.setAttribute('aria-hidden', 'true');
      tile.append(back, canvas); board.append(tile); tiles.push(tile); images.push(canvas);
      s.listen(tile, 'keydown', event => {
        const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -difficulty.columns, ArrowDown: difficulty.columns }[event.key];
        if (!delta) return; event.preventDefault(); const target = index + delta;
        if (target >= 0 && target < cards.length) tiles[target].focus();
      });
    });
    s.stage.append(board);
    function render() {
      s.counter.textContent = '找到 ' + found + ' / ' + pairs + ' 对';
      s.scoreNode.textContent = '翻牌 ' + flips + ' 次 · ' + Math.floor(s.elapsed) + ' 秒';
      cards.forEach((card, i) => {
        tiles[i].classList.toggle('is-open', card.open); tiles[i].classList.toggle('is-matched', card.matched);
        tiles[i].setAttribute('aria-label', '第' + (i + 1) + '张，' + (card.matched ? card.name + '，已经找到一对' : card.open ? card.name : '棉花糖背面'));
        tiles[i].setAttribute('aria-pressed', card.open || card.matched ? 'true' : 'false');
      });
    }
    function flip(index) {
      const card = cards[index]; if (!s.canPlay() || busy || card.open || card.matched) return;
      flips++; card.open = true; open.push(index); G.ui.audio.play('flip'); render();
      if (open.length < 2) return;
      busy = true; const [a, b] = open;
      if (cards[a].id === cards[b].id && cards[a].type === cards[b].type) {
        cards[a].matched = cards[b].matched = true; found++; s.setScore(found * 100); s.status.textContent = '❤ 找到一对' + card.name + '！'; G.ui.audio.play('success'); open = []; busy = false; render();
        if (found === pairs) { busy = true; completedAt = s.elapsed; s.delay(.7, () => s.finish(false)); }
      } else {
        s.status.textContent = '☁ 记住它们的位置，再试一次就好。';
        s.delay(.9, () => { cards[a].open = cards[b].open = false; open = []; busy = false; render(); });
      }
    }
    s.resultStars = () => rules().memoryStars(pairs, flips, completedAt === null ? s.elapsed : completedAt, found === pairs);
    s.summary = () => '找到 ' + found + ' / ' + pairs + ' 对 · 翻牌 ' + flips + ' 次 · 用时 ' + Math.floor(completedAt === null ? s.elapsed : completedAt) + ' 秒';
    s.update = render;
    s.delay(.01, () => cards.forEach((card, i) => { if (card.type === 'resident') G.render.drawCharacter(images[i], card.id); else G.render.drawThumbnail(images[i], card.id); }));
    render();
  }
  function drawStar(c, x, y, radius, color) {
    c.beginPath();
    for (let p = 0; p < 10; p++) { const angle = -Math.PI / 2 + p * Math.PI / 5, r = p % 2 ? radius * .47 : radius; if (!p) c.moveTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r); else c.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r); }
    c.closePath(); c.fillStyle = color; c.fill(); c.strokeStyle = '#C49E58'; c.lineWidth = 1.5; c.stroke();
  }
  function startCatch(options) {
    const config = configFor('catch_stars'), s = host('catch_stars', options);
    const canvas = el('canvas', 'catch-board'); canvas.width = 600; canvas.height = 380; canvas.tabIndex = 0; canvas.setAttribute('role', 'application'); canvas.setAttribute('aria-label', '接星星游戏区。移动鼠标或拖动手指控制篮子，也可以使用左右方向键。'); canvas.style.touchAction = 'none';
    s.stage.append(canvas);
    const c = canvas.getContext('2d'), drops = [], sparkles = [], keys = new Set();
    let basketX = 300, targetX = 300, spawn = .2, wetUntil = 0, doubleUntil = 0, uiAt = 0, caught = 0;
    const moved = G.data.residents.filter(resident => G.state.residents[resident.id] && G.state.residents[resident.id].movedIn);
    const resident = moved.length ? moved[Math.floor(Math.random() * moved.length)] : G.data.residents[0];
    const avatar = el('canvas'); avatar.width = 100; avatar.height = 100;
    s.delay(.01, () => G.render.drawCharacter(avatar, resident.id));
    s.help = '⭐ +10　🍬 +20　🌈 +50 并双倍5秒。小乌云只让篮子湿2秒，不扣分。';
    function point(event) {
      if (!s.canPlay()) return;
      const rect = canvas.getBoundingClientRect(); targetX = Math.max(43, Math.min(557, (event.clientX - rect.left) / rect.width * 600));
    }
    s.listen(canvas, 'pointerdown', event => { event.preventDefault(); canvas.focus(); canvas.setPointerCapture(event.pointerId); point(event); });
    s.listen(canvas, 'pointermove', event => { if (event.pointerType === 'mouse' || canvas.hasPointerCapture(event.pointerId)) point(event); });
    s.listen(canvas, 'keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); if (s.canPlay()) keys.add(event.key); } });
    s.listen(canvas, 'keyup', event => keys.delete(event.key)); s.listen(canvas, 'blur', () => keys.clear());
    s.onPause = () => keys.clear(); s.onReady = () => canvas.focus();
    function collect(drop) {
      caught++;
      const effect = rules().catchEffect(drop.kind, s.elapsed, { score: s.score, wetUntil, doubleUntil });
      wetUntil = effect.wetUntil; doubleUntil = effect.doubleUntil;
      if (drop.kind === 'cloud') { s.status.textContent = '💧 小篮子湿了，慢慢滑两秒就会干。'; G.ui.audio.play('soft'); return; }
      s.setScore(effect.score);
      sparkles.push({ x: drop.x, y: 285, text: '+' + effect.points, life: .75 }); G.ui.audio.play(drop.kind === 'rainbow' ? 'success' : 'click');
    }
    function draw() {
      const gradient = c.createLinearGradient(0, 0, 0, 380); gradient.addColorStop(0, '#DDEEFF'); gradient.addColorStop(1, '#FFF4E3'); c.fillStyle = gradient; c.fillRect(0, 0, 600, 380);
      c.fillStyle = '#FFFFFF'; c.globalAlpha = .65;
      [[70, 47], [320, 75], [520, 38]].forEach(([x, y]) => { c.beginPath(); c.ellipse(x, y, 50, 17, 0, 0, Math.PI * 2); c.fill(); }); c.globalAlpha = 1;
      drops.forEach(drop => {
        c.save(); c.translate(drop.x, drop.y); c.rotate(Math.sin(s.elapsed * 2 + drop.x) * .15);
        if (drop.kind === 'star') drawStar(c, 0, 0, 17, '#FFE18A');
        else if (drop.kind === 'candy') {
          c.fillStyle = '#E7A6C0'; c.beginPath(); c.moveTo(-9, 0); c.lineTo(-22, -11); c.lineTo(-22, 11); c.closePath(); c.moveTo(9, 0); c.lineTo(22, -11); c.lineTo(22, 11); c.closePath(); c.fill();
          c.fillStyle = '#F4BDCF'; c.strokeStyle = '#CA8CA8'; c.lineWidth = 2; c.beginPath(); c.roundRect(-12, -11, 24, 22, 9); c.fill(); c.stroke(); c.strokeStyle = '#FFF2ED'; c.beginPath(); c.moveTo(-5, -9); c.lineTo(4, 9); c.moveTo(3, -9); c.lineTo(10, 5); c.stroke();
        } else if (drop.kind === 'rainbow') {
          ['#F5AAC0', '#F5C38B', '#F4DF8D', '#A9D7B5', '#A6CDEA', '#C8B4E2'].forEach((color, i) => { c.strokeStyle = color; c.lineWidth = 4; c.beginPath(); c.arc(0, 5, 22 - i * 3, Math.PI, 0); c.stroke(); });
        } else {
          c.fillStyle = '#B0ADC6'; c.beginPath(); c.ellipse(0, 3, 24, 13, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(-7, -5, 13, 0, Math.PI * 2); c.arc(8, -8, 12, 0, Math.PI * 2); c.fill(); c.fillStyle = '#6C657C'; c.fillRect(-7, 2, 3, 3); c.fillRect(6, 2, 3, 3);
        }
        c.restore();
      });
      c.drawImage(avatar, basketX - 48, 282, 96, 96);
      c.fillStyle = s.elapsed < wetUntil ? '#B4CEE2' : '#E8BE91'; c.strokeStyle = '#B18A71'; c.lineWidth = 3; c.beginPath(); c.moveTo(basketX - 43, 288); c.lineTo(basketX + 43, 288); c.lineTo(basketX + 31, 324); c.quadraticCurveTo(basketX, 336, basketX - 31, 324); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(143,104,78,.35)'; c.lineWidth = 2; for (let x = -24; x <= 24; x += 12) { c.beginPath(); c.moveTo(basketX + x, 292); c.lineTo(basketX + x * .8, 324); c.stroke(); } c.beginPath(); c.moveTo(basketX - 37, 305); c.lineTo(basketX + 37, 305); c.stroke();
      if (s.elapsed < doubleUntil) { c.strokeStyle = '#E9ADCD'; c.lineWidth = 4; c.beginPath(); c.roundRect(basketX - 50, 281, 100, 58, 18); c.stroke(); }
      c.textAlign = 'center'; c.font = 'bold 20px sans-serif'; c.fillStyle = '#806178'; sparkles.forEach(spark => { c.globalAlpha = Math.max(0, spark.life / .75); c.fillText(spark.text, spark.x, spark.y - (1 - spark.life / .75) * 30); }); c.globalAlpha = 1;
      if (s.paused) { c.fillStyle = 'rgba(255,248,251,.75)'; c.fillRect(0, 0, 600, 380); c.fillStyle = '#806178'; c.fillText('☁ 小篮子正在休息', 300, 190); }
    }
    s.update = dt => {
      if (keys.size) targetX = Math.max(43, Math.min(557, targetX + (keys.has('ArrowRight') - keys.has('ArrowLeft')) * 520 * dt));
      const speed = s.elapsed < wetUntil ? 145 : 900; basketX += Math.max(-speed * dt, Math.min(speed * dt, targetX - basketX));
      spawn -= dt;
      if (spawn <= 0) {
        const chance = Math.random(), kind = chance < .10 ? 'cloud' : chance < .17 ? 'rainbow' : chance < .42 ? 'candy' : 'star';
        drops.push({ x: 25 + Math.random() * 550, y: -28, kind, speed: 100 + s.elapsed * 1.7 + Math.random() * 35 }); spawn = .62 - Math.min(.29, s.elapsed * .004);
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const drop = drops[i]; drop.y += drop.speed * dt;
        if (drop.y >= 279 && drop.y <= 315 && Math.abs(drop.x - basketX) < 47) { collect(drop); drops.splice(i, 1); }
        else if (drop.y > 410) drops.splice(i, 1);
      }
      for (let i = sparkles.length - 1; i >= 0; i--) { sparkles[i].life -= dt; if (sparkles[i].life <= 0) sparkles.splice(i, 1); }
      if (s.elapsed >= uiAt) {
        s.counter.textContent = '⏱ ' + Math.ceil(Math.max(0, config.duration - s.elapsed)) + ' 秒';
        s.status.textContent = s.elapsed < doubleUntil ? '🌈 双倍星光中！还剩 ' + Math.ceil(doubleUntil - s.elapsed) + ' 秒' + (s.elapsed < wetUntil ? ' · 篮子有点湿' : '') : s.elapsed < wetUntil ? '💧 篮子湿了，' + Math.ceil(wetUntil - s.elapsed) + ' 秒后恢复。' : s.help; uiAt = s.elapsed + .2;
      }
      draw(); if (s.elapsed >= config.duration) s.finish(false);
    };
    s.onPause = () => { keys.clear(); draw(); }; s.summary = () => '收集 ' + s.score + ' 分 · 接住 ' + caught + ' 份天空小礼物';
    s.counter.textContent = '⏱ 75 秒'; draw();
  }
  function chooseMemory() {
    const config = configFor('memory'), body = el('div', 'ui-stack'); let difficulty = 'easy', modal;
    body.append(el('p', '', '选一片喜欢的棉花糖。三种难度都有礼物，也都可以慢慢想。'));
    const select = G.ui.controls.select(config.difficulties.map(item => ({ id: item.id, name: item.name })), difficulty, value => { difficulty = value; });
    body.append(G.ui.controls.label(select, '卡片数量'), button('翻开小惊喜', () => { modal.close(); start('memory', { difficulty }); }, 'ui-button ui-button-primary'));
    modal = G.ui.modal({ title: '☁ 记忆翻翻乐', content: body });
  }
  function start(id, options) {
    options = options || {};
    if (runtime.running || G.ui.bakery && G.ui.bakery.isRunning()) { G.ui.toast('小礼物还在这一局里，先收好它吧。'); return; }
    const game = catalog().find(item => item.id === id); if (!game) return;
    if (game.locked) { G.ui.toast(game.unlockText); return; }
    if (id === 'bakery') G.ui.bakery.start();
    else if (id === 'match3') startMatch(options);
    else if (id === 'catch_stars') startCatch(options);
    else if (id === 'memory' && !options.difficulty) chooseMemory();
    else if (id === 'memory') startMemory(options);
  }
  G.ui.minigames = { catalog, start, memoryPool, isRunning: () => !!runtime.running };
})();
