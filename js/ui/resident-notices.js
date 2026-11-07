/* 糯米把新朋友的来信放在场景边；纸条可收起，信封始终可主动打开。 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {};
  let initialized = false, queued = false, root = null, letter = null, count = null, note = null, sentence = null, message = null, active = null;
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const button = (text, action, cls) => { const node = el('button', cls || 'ui-button', text); node.type = 'button'; node.addEventListener('click', action); return node; };
  const profile = id => G.data.residents.find(value => value.id === id);
  function busy() { const panel = document.getElementById('panel'); return document.hidden || !G.state.tutorial.done || !!document.querySelector('.modal-backdrop') || panel && !panel.classList.contains('hidden'); }
  function acknowledge(ids) {
    const result = G.sys.residentLife.acknowledge(ids);
    if (message) message.textContent = result.ok ? '' : result.message;
    return result;
  }
  function invite(id) {
    if (!G.sys.residents.eligibility(id).ok) { ui.toast('朋友的房间条件有变化，去名册看看吧。'); schedule(); return; }
    acknowledge([id]); if (note) note.hidden = true;
    active?.close(); ui.controls?.close(); ui.panel?.close();
    G.bus.emit('resident:invite_requested', { id });
  }
  function open() {
    const current = G.sys.residentLife.notices(); if (!current.eligible.length) { schedule(); return false; }
    acknowledge(current.unseen); note.hidden = true;
    if (current.eligible.length === 1) { invite(current.eligible[0]); return true; }
    const body = el('div', 'resident-letter-list');
    body.append(el('p', 'resident-letter-intro', '有新朋友想搬进来！先听听他们的自我介绍，再挑一间温暖的卧室。'));
    current.eligible.forEach(id => {
      const def = profile(id), row = el('div', 'resident-letter-friend'), portrait = el('canvas', 'resident-letter-portrait');
      portrait.width = 90; portrait.height = 106; portrait.setAttribute('aria-hidden', 'true');
      const copy = el('div', 'resident-letter-copy'); copy.append(el('strong', '', def.name), el('p', '', def.animal + ' · ' + def.personality));
      row.append(portrait, copy, button('听' + def.name + '介绍', () => invite(id), 'ui-button ui-button-primary')); body.append(row);
      requestAnimationFrame(() => { if (portrait.isConnected) G.render.drawCharacter(portrait, id); });
    });
    const handle = ui.modal({ title: '糯米收到了新朋友的信', content: body, onClose() { if (active === handle) active = null; } }); active = handle;
    handle.element.classList.add('resident-letter-modal'); return true;
  }
  function render() {
    if (!root || !G.state || !G.sys.residentLife) return;
    const current = G.sys.residentLife.notices(), blocked = busy(); root.hidden = !current.eligible.length || blocked;
    if (!current.eligible.length) { note.hidden = true; return; }
    count.textContent = '新朋友 · ' + current.eligible.length; letter.setAttribute('aria-label', '打开新朋友的来信，' + current.eligible.length + ' 位朋友想搬进来');
    if (!blocked && current.unseen.length) {
      const names = current.unseen.map(id => profile(id).name).join('、'); sentence.textContent = '有新朋友想搬进来！' + names + '在等你打开信封。'; note.hidden = false; acknowledge(current.unseen);
    }
  }
  function schedule() {
    if (queued || !initialized) return; queued = true;
    Promise.resolve().then(() => { queued = false; render(); });
  }
  function init() {
    if (initialized) return; initialized = true;
    root = el('aside', 'resident-letter'); root.hidden = true; root.setAttribute('aria-label', '新朋友的来信');
    letter = button('', open, 'resident-letter-button'); const icon = el('span', 'resident-letter-icon'); icon.setAttribute('aria-hidden', 'true');
    count = el('span', 'resident-letter-count', '新朋友'); letter.append(icon, count);
    note = el('div', 'resident-letter-note'); note.hidden = true;
    const cloud = el('span', 'guide-cloud resident-letter-cloud'); cloud.setAttribute('aria-hidden', 'true'); cloud.append(el('i'), el('i'), el('b', '', '⌣'));
    const copy = el('div'); sentence = el('p', 'resident-letter-sentence'); sentence.setAttribute('role', 'status');
    message = el('p', 'resident-letter-error'); message.setAttribute('role', 'status');
    copy.append(sentence, button('打开信封', open, 'ui-button ui-button-primary'), message);
    const close = button('×', () => { note.hidden = true; letter.focus(); }, 'resident-letter-dismiss'); close.setAttribute('aria-label', '收起糯米的小纸条');
    note.append(cloud, copy, close); root.append(letter, note); (document.getElementById('world') || document.body).append(root);
    G.bus.on('state:change', schedule); G.bus.on('modal:closed', schedule); G.bus.on('panel:change', schedule);
    G.bus.on('state:replace', () => { active?.close(); active = null; note.hidden = true; schedule(); });
    document.addEventListener('visibilitychange', schedule); render();
  }
  ui.residentNotices = { init, open, refresh: schedule };
})(window.Game);
