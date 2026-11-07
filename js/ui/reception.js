/* 屋主接待：打开后朋友可以敲门；敲门提醒以小卡片出现，屋主同意才会让朋友进来。默认关闭，偏好只存在本机。 */
(function (G) {
  'use strict';
  var ui = G.ui = G.ui || {}, KEY = 'mc_reception', initialized = false, starting = false, current = { open: false, requests: [], error: '' };
  var seen = new Set(), dismissed = new Set(), answering = new Set(), cardBox = null, pill = null, section = null, nodes = {};
  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function button(label, fn, kind) { var node = el('button', 'ui-button ' + (kind || 'ui-button-soft'), label); node.type = 'button'; node.addEventListener('click', fn); return node; }
  function pref() { try { return window.localStorage.getItem(KEY); } catch (_) { return null; } }
  function setPref(value) { try { window.localStorage.setItem(KEY, value); } catch (_) {} }
  function status() { try { return G.cloud && G.cloud.status ? G.cloud.status() : { available: false }; } catch (_) { return { available: false }; } }
  function canHost() { var s = status(); return !!(s.available && s.account && G.neighbors && G.neighbors.ownId && G.neighbors.ownId() && G.live && G.live.reception); }
  function toast(text) { if (ui.toast) ui.toast(text); }

  // 按偏好和条件开关接待：登录、已公开小屋、偏好为“开放”才会在服务器上显示“在家”。
  function sync() {
    if (!G.live || !G.live.reception) return;
    var want = pref() === '1' && canHost();
    if (want && !current.open && !starting) {
      starting = true;
      G.live.reception.start().then(function (result) { starting = false; if (!result.ok) { current = { open: false, requests: [], error: result.message }; paint(); } }, function () { starting = false; });
    } else if (!want && current.open) G.live.reception.stop();
    paint();
  }

  function paintCards() {
    var list = current.requests.filter(function (item) { return !dismissed.has(item.id); }), waiting = current.requests.length - list.length;
    if (!cardBox) { cardBox = el('div', 'reception-cards'); cardBox.setAttribute('role', 'region'); cardBox.setAttribute('aria-label', '朋友敲门提醒'); document.body.append(cardBox); }
    if (!pill) { pill = button('', function () { dismissed.clear(); paintCards(); }, 'reception-pill'); pill.hidden = true; document.body.append(pill); }
    cardBox.replaceChildren();
    list.forEach(function (item) {
      var card = el('article', 'reception-card'), art = el('canvas', 'reception-art'), copy = el('div', 'reception-copy'), actions = el('div', 'reception-actions'), busy = answering.has(item.id);
      art.width = 70; art.height = 88; art.setAttribute('aria-hidden', 'true');
      copy.append(el('strong', '', item.displayName), el('span', 'ui-small', '来敲门啦，想进来一起玩。'));
      var yes = button('请进', function () { answer(item, true); }, 'ui-button-primary'), no = button('婉拒', function () { answer(item, false); }), later = button('稍后', function () { dismissed.add(item.id); paintCards(); });
      yes.disabled = no.disabled = busy; actions.append(yes, no, later); card.append(art, copy, actions); cardBox.append(card);
      if (!seen.has(item.id)) { seen.add(item.id); if (ui.audio && ui.audio.play) ui.audio.play('soft'); }
      requestAnimationFrame(function () { if (art.isConnected && G.render && G.render.drawAvatar) { try { G.render.drawAvatar(art, Object.assign({}, G.sys.avatar.current(), item.avatar), { facing: 1 }); } catch (_) {} } });
    });
    pill.hidden = !waiting; pill.textContent = '🚪 还有' + waiting + '位朋友在等';
  }
  async function answer(item, accept) {
    if (answering.has(item.id)) return; answering.add(item.id); paintCards();
    var result = await G.live.reception.answer(item.id, accept); answering.delete(item.id);
    if (result.ok) {
      toast(accept ? '请进啦！朋友会来到你现在的位置。' : '已婉拒，对方只会看到“现在不方便”。');
      if (accept && G.hostRoom && G.hostRoom.enter) G.hostRoom.enter();
    } else toast(result.message || '这位朋友已经离开啦。');
    paintCards();
  }

  function paint() {
    paintCards();
    if (!section) return;
    var allowed = canHost(); section.hidden = !allowed;
    if (nodes.toggle) nodes.toggle.checked = pref() === '1';
    nodes.status.textContent = current.error ? current.error : pref() === '1' ? (current.open ? '接待中：有朋友敲门会在屏幕上提醒你。请保持这个页面打开。' : '正在准备接待…') : '现在没有接待：朋友来敲门时会看到“主人不在家”。';
  }
  // 放进“邻居小屋”面板：开关接待，说明默认关闭。
  function makeSection() {
    if (section) return section;
    section = el('section', 'ui-stack reception-section'); section.hidden = true;
    var label = el('label', 'reception-toggle'); nodes.toggle = el('input'); nodes.toggle.type = 'checkbox'; nodes.toggle.setAttribute('role', 'switch');
    nodes.toggle.addEventListener('change', function () { setPref(nodes.toggle.checked ? '1' : '0'); sync(); });
    label.append(nodes.toggle, el('span', '', '接待朋友敲门'));
    nodes.status = el('p', 'ui-small neighbors-my-status'); nodes.status.setAttribute('role', 'status');
    section.append(el('h3', '', '朋友敲门'), el('p', 'ui-small ui-muted', '打开后，朋友可以来敲门。你点“请进”，朋友才会进来，一起在小屋里走动、聊天；不开放时，朋友只能路过看看，你不会被打扰。'), label, nodes.status);
    paint(); return section;
  }
  // 第一次公开小屋后问一次，之后用开关管理。
  function askOnce() {
    if (pref() !== null || !ui.modal) return;
    var body = el('div', 'ui-stack'), actions = el('div', 'ui-actions'), modal;
    var open = button('开放敲门', function () { setPref('1'); modal.close(); sync(); toast('接待已开放，朋友敲门时会提醒你。'); }, 'ui-button-primary'), later = button('先不开放', function () { setPref('0'); modal.close(); sync(); });
    actions.append(open, later); body.append(el('p', '', '想让朋友来敲门，和你一起在小屋里玩吗？你同意了朋友才能进来，随时可以请他们离开，也可以在“邻居小屋”里关闭。'), actions);
    modal = ui.modal({ title: '要让朋友来敲门吗？', content: body, onClose: function () { if (pref() === null) setPref('0'); } });
  }

  ui.reception = {
    init: function () {
      if (initialized) return; initialized = true;
      if (G.live && G.live.reception) G.live.reception.subscribe(function (value) { current = value; paint(); });
      if (G.bus && G.bus.on) { G.bus.on('cloud:change', sync); G.bus.on('neighbors:published', function () { askOnce(); sync(); }); }
      if (window.addEventListener) { window.addEventListener('pagehide', function () { if (current.open && G.live) G.live.reception.stop(); }); window.addEventListener('pageshow', sync); }
      sync();
    },
    section: makeSection, refresh: sync,
    status: function () { return { open: current.open, pending: current.requests.length, preference: pref() }; }
  };
})(window.Game);
