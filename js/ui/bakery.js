/* 甜甜蛋糕屋：时间结束与提前结束都走同一个、只能运行一次的结算。 */
(function () {
  'use strict';
  const G = window.Game;
  G.ui = G.ui || {};
  let running = null;
  const bases = [
    { id: 'vanilla', name: '香草', icon: '🍰', color: '#EFCF95' },
    { id: 'cocoa', name: '可可', icon: '🍫', color: '#AD7966' },
    { id: 'berry', name: '草莓', icon: '🍓', color: '#E7A1B1' }
  ];
  const creams = [
    { id: 'white', name: '奶油白', icon: '☁', color: '#FFF9E7' },
    { id: 'pink', name: '草莓粉', icon: '🌸', color: '#FFB6C8' },
    { id: 'mint', name: '薄荷绿', icon: '🍃', color: '#BDECD6' },
    { id: 'purple', name: '香芋紫', icon: '💜', color: '#D9C8FF' }
  ];
  const toppings = [
    { id: 'strawberry', name: '草莓', icon: '🍓', color: '#EC899B' },
    { id: 'star', name: '星星', icon: '⭐', color: '#F9DB77' },
    { id: 'heart', name: '爱心', icon: '❤', color: '#ED91B2' },
    { id: 'candle', name: '蜡烛', icon: '🕯', color: '#D3B4EB' },
    { id: 'cherry', name: '樱桃', icon: '🍒', color: '#D97488' },
    { id: 'flower', name: '花朵', icon: '🌼', color: '#FFE9A8' }
  ];
  const all = [...bases, ...creams, ...toppings];
  const find = id => all.find(item => item.id === id);
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const button = (text, fn, cls) => { const node = el('button', cls || 'ui-button', text); node.type = 'button'; node.addEventListener('click', fn); return node; };
  function random(list) { return list[Math.floor(Math.random() * list.length)].id; }
  function drawCake(canvas, ingredients) {
    const context = canvas.getContext('2d');
    const width = canvas.width, height = canvas.height;
    context.clearRect(0, 0, width, height);
    context.save(); context.translate(width / 2, height - 25);
    context.fillStyle = '#E8E1ED'; context.beginPath(); context.ellipse(0, 8, 82, 12, 0, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#FFF8FB'; context.strokeStyle = '#D4BDCA'; context.lineWidth = 2; context.beginPath(); context.ellipse(0, 1, 90, 12, 0, 0, Math.PI * 2); context.fill(); context.stroke();
    let y = -5;
    const basesCount = ingredients.filter(id => bases.some(i => i.id === id)).length;
    const size = basesCount > 1 ? 118 : 142;
    ingredients.forEach(id => {
      const ingredient = find(id); if (!ingredient) return;
      if (bases.some(item => item.id === id)) {
        context.fillStyle = ingredient.color; context.strokeStyle = '#C59B86'; context.lineWidth = 2; context.beginPath(); context.roundRect(-size / 2, y - 32, size, 36, 10); context.fill(); context.stroke();
        context.fillStyle = 'rgba(255,255,255,.25)'; context.fillRect(-size / 2 + 8, y - 20, size - 16, 4); y -= 30;
      } else if (creams.some(item => item.id === id)) {
        context.fillStyle = ingredient.color; context.strokeStyle = '#D3B9C6'; context.lineWidth = 1.5;
        context.beginPath(); context.roundRect(-size / 2 - 3, y - 11, size + 6, 18, 8); context.fill(); context.stroke();
        for (let x = -size / 2 + 10; x < size / 2; x += 20) { context.beginPath(); context.arc(x, y - 9, 9, Math.PI, 0); context.fill(); } y -= 16;
      } else {
        context.fillStyle = ingredient.color; context.textAlign = 'center'; context.textBaseline = 'bottom'; context.font = '30px sans-serif'; context.fillText(ingredient.icon, 0, y + 4); y -= 28;
      }
    });
    if (!ingredients.length) { context.fillStyle = '#A7889A'; context.textAlign = 'center'; context.font = '16px sans-serif'; context.fillText('选一块蛋糕底吧', 0, -35); }
    context.restore();
  }
  G.ui.bakery = {
    start() {
      if (running || G.ui.minigames && G.ui.minigames.isRunning()) { G.ui.toast('这一局的小礼物还没收好，先把它带回家吧。'); return; }
      if (!G.contentSpaces.list(G.state).some(room => G.contentSpaces.isType(room, 'kitchen'))) { G.ui.toast('先建一间厨房，再来做蛋糕吧。'); return; }
      const config = G.data.balance.bakery;
      const duration = config.duration || 60;
      const customers = G.data.minigames.find(game => game.id === 'bakery');
      const session = running = { sessionId: G.sys.minigames.begin('bakery'), finished: false, closing: false, served: 0, gifts: 0, selected: [], order: [], started: performance.now(), timer: null, modal: null, customerId: 0, customerActive: false, customerAt: 0, customerUntil: 0, nextCustomerAt: 0, pausedAt: null };
      let unsubscribe = null;
      G.ui.panel.close();
      const body = el('div', 'ui-stack bakery');
      const stats = el('div', 'bakery-stats ui-row');
      const time = el('strong', 'bakery-time', '⏱ ' + duration + '秒'), count = el('strong', '', '完成 0 单');
      const timerBar = el('progress', 'ui-progress'); timerBar.max = duration; timerBar.value = duration; timerBar.setAttribute('aria-label', '本局剩余时间');
      stats.append(time, count, timerBar); body.append(stats);
      const board = el('div', 'bakery-board');
      const orderCard = el('section', 'bakery-order'), bowl = el('section', 'bakery-bowl');
      const customerHeading = el('h3', 'ui-card-head', '🐰 朋友想要的蛋糕'); orderCard.append(customerHeading);
      const orderCanvas = el('canvas', 'bakery-cake'); orderCanvas.width = 240; orderCanvas.height = 190; orderCanvas.setAttribute('role', 'img');
      const orderText = el('p', 'bakery-recipe'); orderText.setAttribute('aria-live', 'polite');
      const patience = el('span', 'bakery-patience-copy', '😊 慢慢来，我等你'), patienceTrack = el('div', 'bakery-patience'), patienceFill = el('i');
      patienceTrack.setAttribute('role', 'progressbar'); patienceTrack.setAttribute('aria-label', '朋友的耐心'); patienceTrack.setAttribute('aria-valuemin', '0'); patienceTrack.setAttribute('aria-valuemax', '100');
      patienceTrack.append(patienceFill); orderCard.append(orderCanvas, orderText, patience, patienceTrack);
      bowl.append(el('h3', 'ui-card-head', '👩‍🍳 你正在做的蛋糕'));
      const ownCanvas = el('canvas', 'bakery-cake'); ownCanvas.width = 240; ownCanvas.height = 190; ownCanvas.setAttribute('role', 'img');
      const stageText = el('p', 'bakery-stage', '先选蛋糕底'), feedback = el('p', 'bakery-feedback'); feedback.setAttribute('aria-live', 'polite');
      bowl.append(ownCanvas, stageText); board.append(orderCard, bowl); body.append(board);
      const ingredientArea = el('div', 'bakery-ingredients');
      const groups = [
        { title: '① 蛋糕底', type: 'base', items: bases },
        { title: '② 奶油', type: 'cream', items: creams },
        { title: '③ 装饰', type: 'topping', items: toppings }
      ];
      const buttons = [];
      groups.forEach(group => {
        const line = el('div', 'bakery-ingredient-group'), options = el('div', 'ui-row'); line.append(el('span', 'ui-small', group.title));
        group.items.forEach(ingredient => {
          const choose = button(ingredient.icon + ' ' + ingredient.name, () => {
            if (!available(performance.now()) || choose.disabled) return;
            session.selected.push(ingredient.id); G.ui.audio.play('click'); feedback.textContent = ''; renderSelection();
          }, 'ui-button bakery-ingredient');
          choose.style.setProperty('--ingredient-color', ingredient.color); choose.dataset.ingredient = ingredient.id; choose.dataset.group = group.type; buttons.push(choose); options.append(choose);
        }); line.append(options); ingredientArea.append(line);
      });
      body.append(ingredientArea, feedback);
      const actions = el('div', 'ui-actions');
      const serve = button('🎂 做好啦，出餐', () => {
        if (!available(performance.now()) || serve.disabled) return;
        const correct = session.selected.length === session.order.length && session.selected.every((id, index) => id === session.order[index]);
        if (!correct) { feedback.textContent = '🐰 没关系，再看看订单，我愿意等你～'; G.ui.audio.play('soft'); return; }
        session.served++; count.textContent = '完成 ' + session.served + ' 单';
        if (session.served === 1 || Math.random() < 0.4) session.gifts++;
        G.ui.audio.play('success'); feedback.textContent = '❤ 好香呀！谢谢小厨师！'; newOrder();
      }, 'ui-button ui-button-primary');
      const restart = button('↶ 重新做', () => { if (!available(performance.now())) return; session.selected = []; feedback.textContent = '重新选就好，没有关系。'; renderSelection(); });
      actions.append(serve, restart, button('收好本局礼物', () => finish(true), 'ui-button ui-button-soft'));
      body.append(actions, el('p', 'ui-small ui-muted', '每一局都有奖励。想休息时，可以随时收好礼物。'));
      function nextGroup() { const index = session.selected.length; if (index >= session.order.length) return null; return index === session.order.length - 1 ? 'topping' : index % 2 === 0 ? 'base' : 'cream'; }
      function renderSelection() {
        drawCake(ownCanvas, session.selected); const group = nextGroup();
        stageText.textContent = !session.customerActive ? '收拾好盘子，等下一位朋友' : group === 'base' ? (session.selected.length ? '再放一层蛋糕底' : '先选一块蛋糕底') : group === 'cream' ? '再抹上喜欢的奶油' : group === 'topping' ? '最后放上小装饰' : '做好啦，可以出餐！';
        ownCanvas.setAttribute('aria-label', session.selected.length ? '正在制作：' + session.selected.map(id => find(id).name).join('、') : '空盘子');
        buttons.forEach(b => { b.disabled = !session.customerActive || b.dataset.group !== group; b.classList.toggle('is-active', session.selected.includes(b.dataset.ingredient)); });
        serve.disabled = !session.customerActive || !!group; restart.disabled = !session.customerActive;
      }
      function renderPatience(now) {
        const ratio = session.customerActive ? Math.max(0, Math.min(1, (session.customerUntil - now) / (session.customerUntil - session.customerAt))) : 0;
        const copy = !session.customerActive ? '🙂 有点饿啦，一会儿再来' : ratio > .55 ? '😊 慢慢来，我等你' : ratio > .25 ? '🙂 香味飘过来啦' : '🙂 肚子咕咕叫，我有一点饿啦';
        patience.textContent = copy; patienceFill.style.width = (ratio * 100).toFixed(1) + '%';
        patienceTrack.setAttribute('aria-valuenow', String(Math.ceil(ratio * 100))); patienceTrack.setAttribute('aria-valuetext', copy);
      }
      function newOrder(now = performance.now()) {
        if (session.finished || session.closing) return;
        session.order = [random(bases), random(creams)];
        if (session.served >= 3) session.order.push(random(bases), random(creams));
        session.order.push(random(toppings)); session.selected = []; session.customerAt = now; session.customerActive = true; session.customerId++;
        session.customerUntil = now + (session.order.length > 3 ? customers.layeredPatienceSeconds : customers.patienceSeconds) * 1000;
        customerHeading.textContent = '🐰 朋友想要的蛋糕'; orderCard.dataset.customer = String(session.customerId);
        orderText.textContent = session.order.map(id => find(id).icon + find(id).name).join(' ＋ '); orderCanvas.setAttribute('aria-label', '订单：' + session.order.map(id => find(id).name).join('、'));
        drawCake(orderCanvas, session.order); renderSelection(); renderPatience(now);
      }
      function leaveCustomer(now) {
        if (!session.customerActive) return;
        session.customerActive = false; session.selected = []; session.nextCustomerAt = now + customers.customerChangeSeconds * 1000;
        customerHeading.textContent = '🐰 朋友有点饿，先去找点心啦'; orderText.textContent = '下一位朋友马上来';
        orderCanvas.setAttribute('aria-label', '朋友暂时离开，正在等待下一位顾客'); drawCake(orderCanvas, []);
        feedback.textContent = '朋友先去吃点心啦，没有扣糖果。收拾好盘子，再迎接下一位吧。'; renderSelection(); renderPatience(now);
      }
      function tick(now) {
        if (session.finished || session.closing || session.pausedAt !== null) return;
        const left = Math.max(0, duration - (now - session.started) / 1000); time.textContent = '⏱ ' + Math.ceil(left) + '秒'; timerBar.value = left;
        if (left <= 0) { finish(false); return; }
        if (session.customerActive && now >= session.customerUntil) leaveCustomer(now);
        else if (!session.customerActive && now >= session.nextCustomerAt) newOrder(now);
        if (session.customerActive) renderPatience(now);
      }
      function available(now) {
        tick(now);
        return !session.finished && !session.closing && session.pausedAt === null && session.customerActive;
      }
      function stopClock() { if (session.timer !== null) { clearInterval(session.timer); session.timer = null; } }
      function startClock() { if (!session.finished && !session.closing && session.pausedAt === null && session.timer === null) session.timer = setInterval(() => tick(performance.now()), 100); }
      function visibility() {
        const now = performance.now();
        if (document.hidden && session.pausedAt === null) { session.pausedAt = now; stopClock(); }
        else if (!document.hidden && session.pausedAt !== null) {
          const paused = now - session.pausedAt; session.started += paused; session.customerAt += paused; session.customerUntil += paused; session.nextCustomerAt += paused; session.pausedAt = null;
          tick(now); startClock();
        }
      }
      function cleanup() {
        stopClock(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', cancel);
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      }
      function cancel() {
        if (session.finished) return;
        session.finished = true; cleanup(); running = null;
        G.runtime.minigames.sessions.delete(session.sessionId);
        if (session.modal) session.modal.close();
      }
      function finish(early) {
        if (session.finished) return;
        session.finished = true; cleanup(); running = null;
        const stars = early ? 1 : session.served >= 6 ? 3 : session.served >= 3 ? 2 : 1;
        const reward = G.sys.minigames.finish('bakery', { score: session.served, stars, sessionId: session.sessionId });
        if (!reward.ok) { if (session.modal) session.modal.close(); G.ui.toast(reward.message); return; }
        const coins = reward.coin, exp = reward.exp, half = reward.half;
        if (session.gifts) G.store.update(state => { state.inventory.cake_strawberry = (state.inventory.cake_strawberry || 0) + session.gifts; state.collection.cake_strawberry = true; });
        if (session.modal) session.modal.close(); G.ui.audio.play('level');
        const result = el('div', 'ui-stack bakery-result');
        result.append(el('div', 'bakery-stars', '⭐'.repeat(stars)), el('h3', '', early ? '甜蜜的心意，已经收到啦！' : session.served ? '好香呀，小厨师真棒！' : '第一次尝试，也值得一颗星！'), el('p', '', '完成 ' + session.served + ' 单 · 🍬 ' + coins + ' · ⭐ 经验 ' + exp));
        if (session.gifts) result.append(el('p', 'ui-notice', '🎂 点心盒里多了' + session.gifts + '份蛋糕，可以送给小屋的朋友。'));
        if (half) result.append(el('p', 'ui-small ui-muted', '今天的大奖已领完，继续玩也有小奖励哦。'));
        result.append(button('把礼物带回小屋', () => { modal.close(); G.ui.open('play'); }, 'ui-button ui-button-primary'), button('再做一局', () => { modal.close(); G.ui.bakery.start(); }));
        const modal = G.ui.modal({ title: '🎁 烘焙小礼物', content: result }); G.ui.refresh();
      }
      session.modal = G.ui.modal({ title: '🎂 甜甜蛋糕屋', content: body, lockBackdrop: true, onClose() {
        if (!session.finished) { session.closing = true; stopClock(); Promise.resolve().then(() => finish(true)); }
      } });
      session.modal.element.classList.add('bakery-modal');
      document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', cancel); unsubscribe = G.bus.on('state:replace', cancel);
      newOrder(); if (document.hidden) visibility(); else startClock();
    },
    isRunning() { return !!running; }
  };
})();
