/* 三款小游戏的纯规则与四款共用结算。 */
(function () {
  'use strict';
  const G = window.Game;
  const runtime = G.runtime.minigames = G.runtime.minigames || { running: null, sessions: new Map() };
  const sessions = runtime.sessions;
  const copy = board => board.map(cell => cell ? { color: cell.color, special: cell.special || null } : null);
  function shuffle(list, rng) {
    const result = list.slice(); rng = rng || Math.random;
    for (let i = result.length - 1; i > 0; i--) { const j = Math.min(i, Math.floor(rng() * (i + 1))); [result[i], result[j]] = [result[j], result[i]]; }
    return result;
  }
  function adjacent(a, b, size) { return Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a < size * size && b < size * size && Math.abs(a % size - b % size) + Math.abs(Math.floor(a / size) - Math.floor(b / size)) === 1; }
  function matches(board, size) {
    const runs = [];
    for (let axis = 0; axis < 2; axis++) {
      for (let line = 0; line < size; line++) {
        let run = [];
        const flush = () => { if (run.length >= 3) runs.push(run); run = []; };
        for (let p = 0; p <= size; p++) {
          const index = axis === 0 ? line * size + p : p * size + line;
          if (p === size || !board[index]) { flush(); continue; }
          if (run.length && board[run[0]].color !== board[index].color) flush();
          run.push(index);
        }
      }
    }
    return runs;
  }
  function swapped(board, a, b) { const result = copy(board); [result[a], result[b]] = [result[b], result[a]]; return result; }
  function validSwap(board, a, b, size) {
    if (!adjacent(a, b, size) || !board[a] || !board[b]) return false;
    if (board[a].special || board[b].special) return true;
    return matches(swapped(board, a, b), size).some(run => run.includes(a) || run.includes(b));
  }
  function findMove(board, size) {
    for (let i = 0; i < board.length; i++) {
      for (const j of [i + 1, i + size]) if (validSwap(board, i, j, size)) return [i, j];
    }
    return null;
  }
  function createBoard(size, colors, rng) {
    rng = rng || Math.random;
    for (let attempt = 0; attempt < 120; attempt++) {
      const board = [];
      for (let i = 0; i < size * size; i++) {
        const excluded = [];
        if (i % size >= 2 && board[i - 1].color === board[i - 2].color) excluded.push(board[i - 1].color);
        if (i >= size * 2 && board[i - size].color === board[i - size * 2].color) excluded.push(board[i - size].color);
        const available = Array.from({ length: colors }, (_, c) => c).filter(c => !excluded.includes(c));
        board.push({ color: available[Math.min(available.length - 1, Math.floor(rng() * available.length))], special: null });
      }
      if (findMove(board, size)) return board;
    }
    // 极端随机源也保证可玩：前三格交换后构成三连，初始没有三连。
    const board = Array.from({ length: size * size }, (_, i) => ({ color: (i + Math.floor(i / size)) % colors, special: null }));
    [0, 2, size + 1].forEach(i => { board[i].color = 0; }); board[1].color = 1;
    return board;
  }
  function reshuffle(board, size, colors, rng) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = shuffle(copy(board), rng);
      if (!matches(result, size).length && findMove(result, size)) return result;
    }
    return createBoard(size, colors, rng);
  }
  function clearRound(board, size, preferred, activated) {
    const runs = matches(board, size), removed = new Set(), created = new Map();
    runs.forEach(run => {
      run.forEach(i => removed.add(i));
      if (run.length >= 4) {
        const anchor = (preferred || []).find(i => run.includes(i)) ?? run[Math.floor(run.length / 2)];
        const special = run.length >= 5 ? 'color' : 'row';
        if (!created.has(anchor) || special === 'color') created.set(anchor, { color: board[anchor].color, special });
      }
    });
    const queue = (activated || []).map(entry => ({ index: entry.index, color: entry.color })), expanded = new Set();
    function add(index) { if (!removed.has(index)) removed.add(index); if (board[index] && board[index].special && !expanded.has(index)) queue.push({ index }); }
    [...removed].forEach(add);
    while (queue.length) {
      const entry = queue.shift(), index = entry.index, cell = board[index];
      if (!cell || !cell.special || expanded.has(index)) continue;
      expanded.add(index); removed.add(index); created.delete(index);
      if (cell.special === 'row') { const row = Math.floor(index / size); for (let col = 0; col < size; col++) add(row * size + col); }
      else board.forEach((other, i) => { if (other && other.color === (entry.color === undefined ? cell.color : entry.color)) add(i); });
    }
    const next = copy(board); removed.forEach(i => { next[i] = null; });
    created.forEach((cell, i) => { next[i] = cell; });
    return { board: next, removed: [...removed], created: [...created.keys()], score: Math.max(0, removed.size - created.size) * 10 + created.size * 25 };
  }
  function refill(board, size, colors, rng) {
    rng = rng || Math.random; const result = copy(board);
    for (let col = 0; col < size; col++) {
      const cells = [];
      for (let row = size - 1; row >= 0; row--) if (result[row * size + col]) cells.push(result[row * size + col]);
      for (let row = size - 1; row >= 0; row--) result[row * size + col] = cells[size - row - 1] || { color: Math.min(colors - 1, Math.floor(rng() * colors)), special: null };
    }
    return result;
  }
  function memoryStars(pairs, flips, seconds, completed) {
    if (!completed) return 1;
    if (flips <= pairs * 3 && seconds <= pairs * 10) return 3;
    if (flips <= pairs * 5 && seconds <= pairs * 18) return 2;
    return 1;
  }
  function scoreStars(id, score) {
    const config = G.data.minigames.find(game => game.id === id);
    return config && config.starScores ? 1 + config.starScores.filter(target => score >= target).length : 1;
  }
  function catchEffect(kind, elapsed, current) {
    const config = G.data.minigames.find(game => game.id === 'catch_stars');
    const result = Object.assign({}, current, { points: 0 });
    if (kind === 'cloud') { result.wetUntil = elapsed + config.wetSeconds; return result; }
    const base = { star: 10, candy: 20, rainbow: 50 }[kind] || 0;
    result.points = base * (elapsed < current.doubleUntil ? 2 : 1);
    result.score = current.score + result.points;
    if (kind === 'rainbow') result.doubleUntil = elapsed + config.doubleSeconds;
    return result;
  }
  function finish(id, result) {
    result = result || {};
    const session = sessions.get(result.sessionId);
    if (!session || session.id !== id) return { ok: false, message: '这一局还没有开始哦。' };
    if (session.finished) return { ok: false, duplicate: true, message: '本局礼物已经收好啦。' };
    const score = Number(result.score), stars = Number(result.stars);
    if (!Number.isFinite(score) || score < 0 || score > 1000000 || id === 'bakery' && !Number.isInteger(score) || !Number.isInteger(stars) || stars < 1 || stars > 3) return { ok: false, message: '本局成绩还没准备好。' };
    const today = G.utils.dateKey(), record = G.state.minigames[id] || { best: 0, playsToday: 0, date: '' };
    const todayPlays = record.date === today ? record.playsToday : 0, reward = G.data.minigameRewards;
    const half = todayPlays >= reward.fullPlays, factor = half ? .5 : 1;
    const coin = Math.floor(reward.coin[stars - 1] * factor), exp = Math.floor(reward.exp[stars - 1] * factor);
    session.finished = true;
    G.store.update(state => {
      state.minigames[id] = { best: Math.max(record.best || 0, Math.floor(score)), playsToday: Math.min(1000000, todayPlays + 1), date: today };
      if (id === 'bakery') { state.quests.stats.bakeryPlays = Math.min(1000000000, (state.quests.stats.bakeryPlays || 0) + 1); state.quests.stats.bakeryOrders = Math.min(1000000000, (state.quests.stats.bakeryOrders || 0) + score); }
    });
    const config = G.data.minigames.find(game => game.id === id);
    G.sys.economy.reward(coin, exp, config.name);
    const event = { ok: true, id, score: Math.floor(score), stars, coin, exp, half, sessionId: result.sessionId };
    G.bus.emit('minigame:finished', event);
    // 完成记录在当前运行期保留，防止计时器、关闭事件与结算按钮重复奖励。
    return event;
  }
  G.sys.minigames = {
    begin(id) {
      if (!G.data.minigames.some(game => game.id === id)) return null;
      const sessionId = G.utils.uid('mini'); sessions.set(sessionId, { id, finished: false }); return sessionId;
    },
    finish,
    rules: { adjacent, matches, swapped, validSwap, findMove, createBoard, reshuffle, clearRound, refill, shuffle, memoryStars, scoreStars, catchEffect }
  };
})();
