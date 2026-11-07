/* 串门操作使用稳定DOM；昵称、消息与成员名称只作为文字显示。 */
(function (G) {
  'use strict';
  var scriptSource = document.currentScript && document.currentScript.src || '', match = /^(https?:\/\/[^/]+)(.*?)\/releases\/r-[a-f0-9]{64}\//.exec(scriptSource), prefix = match ? match[2] : '';
  var nextId = 0, quickTexts = ['你好呀！', '你的小屋真好看！', '一起去前院吧！', '我先回家啦！'];
  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function button(text, handler, primary) { var node = el('button', 'ui-button ' + (primary ? 'ui-button-primary' : 'ui-button-soft'), text); node.type = 'button'; node.addEventListener('click', handler); return node; }
  function hide(node, value) { node.hidden = !!value; }
  function mount(container, options) {
    options = options || {};
    var live = G.live, destroyed = false, busy = false, sending = false, checking = true, muted = new Set(), confirmKick = null, memberRows = new Map(), messageRows = new Map(), conversationKey = null, serial = 0;
    var current = live.status(), id = 'live-room-' + (++nextId), root = el('section', 'live-room'), heading = el('div', 'live-room-heading'), title = el('h2', '', '一起串门'), count = el('p', 'live-room-count');
    root.setAttribute('aria-label', '实时串门和同屋聊天'); heading.append(title, count);
    var status = el('p', 'live-room-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    var feedback = el('p', 'live-room-feedback'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite'); hide(feedback, true);
    var guest = el('div', 'live-room-guest'), guestText = el('p', '', '登录自己的账号后，就能一起走动和聊天。现在也可以继续看看小屋。'), login = el('a', 'ui-button ui-button-primary', '回小屋登录 / 注册'); login.href = prefix + '/'; guest.append(guestText, login);
    var joinForm = el('form', 'live-join-form'); joinForm.noValidate = true;
    var nameLabel = el('label', 'live-field', '这次串门的展示昵称'), nickname = el('input', 'ui-input'); nickname.type = 'text'; nickname.name = 'live-display-name'; nickname.id = id + '-nickname'; nickname.value = '小小建筑师'; nickname.maxLength = 48; nickname.autocomplete = 'off'; nickname.spellcheck = false;
    var nameHint = el('span', 'ui-small live-field-note', '邻居列表和同屋的小朋友会看到这个称呼，最多24个字。'); nameHint.id = id + '-name-hint'; nickname.setAttribute('aria-describedby', nameHint.id); nameLabel.append(nickname, nameHint);
    var joinButton = el('button', 'ui-button ui-button-primary', '加入串门'); joinButton.type = 'submit'; joinForm.append(nameLabel, joinButton);
    var joinHint = el('p', 'ui-small live-field-note live-join-hint', '朋友的小屋需要主人同意：点击后会先敲敲门，主人请你进去才能一起玩。'); joinForm.append(joinHint);
    var knocking = false, knockBox = el('div', 'live-knock-box'), knockText = el('p', 'live-knock-text', '已经敲门啦，请等主人回应…'), knockCancel = button('先不进去了', function () { live.cancelKnock(); }); knockText.setAttribute('role', 'status'); knockBox.append(knockText, knockCancel); hide(knockBox, true);
    var passerby = el('p', 'live-room-passerby ui-small', '现在是「路过」模式：只能看看小屋，主人不会知道你来过。想一起玩，就敲敲门吧。');
    var retry = button('重新确认登录', check), joined = el('div', 'live-room-joined');
    var moveSection = el('div', 'live-room-movement'), moveHint = el('p', 'ui-small', '点地面走过去，也可以用方向按钮。'), directionPad = el('div', 'live-room-directions'); directionPad.setAttribute('role', 'group'); directionPad.setAttribute('aria-label', '走动方向');
    [['left', '向左走'], ['up', '向前走'], ['down', '向后走'], ['right', '向右走']].forEach(function (entry) { var node = button(entry[1], function () { if (current.phase === 'connected' && typeof options.onMove === 'function') options.onMove(entry[0]); }); node.dataset.liveDirection = entry[0]; directionPad.append(node); }); moveSection.append(moveHint, directionPad); if (typeof options.onMove !== 'function') hide(moveSection, true);
    var membersHeading = el('h3', '', '同屋小朋友'), members = el('ul', 'live-members'); members.setAttribute('aria-label', '同屋小朋友');
    var chatHeading = el('h3', '', '同屋聊天'), messages = el('ol', 'live-messages'); messages.setAttribute('role', 'log'); messages.setAttribute('aria-label', '这次串门的聊天消息'); messages.setAttribute('aria-live', 'polite'); messages.setAttribute('aria-relevant', 'additions'); messages.tabIndex = 0;
    var empty = el('p', 'live-chat-empty ui-small', '还没有新消息，打个招呼吧。'), quick = el('div', 'live-quick-chat'); quick.setAttribute('role', 'group'); quick.setAttribute('aria-label', '快捷招呼');
    quickTexts.forEach(function (text) { quick.append(button(text, function () { send(text, false); })); });
    var chatForm = el('form', 'live-chat-form'); chatForm.noValidate = true;
    var chatLabel = el('label', 'live-field', '给同屋小朋友的话'), chatInput = el('input', 'ui-input'); chatInput.id = id + '-message'; chatInput.name = 'live-message'; chatInput.type = 'text'; chatInput.maxLength = 160; chatInput.autocomplete = 'off'; chatInput.spellcheck = false;
    var textHint = el('span', 'ui-small live-field-note', '1～80个字，消息只在这次串门中显示。'); textHint.id = id + '-text-hint'; chatInput.setAttribute('aria-describedby', textHint.id); chatLabel.append(chatInput, textHint);
    var sendButton = el('button', 'ui-button ui-button-primary', '发送'); sendButton.type = 'submit'; chatForm.append(chatLabel, sendButton);
    var leaveButton = button('结束这次串门', leave), note = el('p', 'live-room-note ui-small', '屏蔽只影响这次串门中的聊天显示。小屋里的家具和各自进度不会被串门操作改变。');
    joined.append(moveSection, membersHeading, members, chatHeading, empty, messages, quick, chatForm, note, leaveButton);
    root.append(heading, status, feedback, passerby, guest, joinForm, knockBox, retry, joined); container.append(root);
    function show(text, bad) { var repeated = bad && !checking && !['connected', 'joining'].includes(current.phase) && text === current.error; feedback.textContent = repeated ? '' : text || ''; feedback.classList.toggle('is-error', !!bad); hide(feedback, !text || repeated); }
    function connected() { return current.phase === 'connected'; }
    function emitState() {
      if (typeof options.onState !== 'function') return;
      var visibleMessages = (current.messages || []).filter(function (message) { return message && !muted.has(message.peerId); });
      options.onState(Object.assign({}, current, { messages: visibleMessages }));
    }
    function roster() {
      var me = current.peers.find(function (peer) { return peer.id === current.peerId; }), keep = new Set();
      current.peers.forEach(function (peer) {
        keep.add(peer.id); var row = memberRows.get(peer.id);
        if (!row) {
          var node = el('li', 'live-member'), name = el('span', 'live-member-name'), actions = el('div', 'live-member-actions');
          var mute = button('屏蔽聊天', function () { if (muted.has(peer.id)) muted.delete(peer.id); else muted.add(peer.id); paint(); emitState(); });
          var kick = button('请离', async function () {
            if (busy || !connected()) return;
            if (confirmKick !== peer.id) { confirmKick = peer.id; paint(); return; }
            busy = true; paint(); var at = serial; var answer = await live.kick(peer.id); if (destroyed || at !== serial) return; busy = false; confirmKick = null; show(answer.ok ? '已请这位小朋友离开。' : answer.message, !answer.ok); paint();
          });
          var cancelKick = button('取消', function () { confirmKick = null; paint(); }); actions.append(mute, kick, cancelKick); node.append(name, actions); row = { node: node, name: name, mute: mute, kick: kick, cancelKick: cancelKick }; memberRows.set(peer.id, row); members.append(node);
        }
        row.name.textContent = peer.displayName + (peer.id === current.peerId ? ' · 我' : '') + (peer.isHost ? ' · 屋主' : '');
        row.mute.textContent = muted.has(peer.id) ? '恢复聊天' : '屏蔽聊天'; row.mute.setAttribute('aria-pressed', String(muted.has(peer.id))); row.mute.setAttribute('aria-label', (muted.has(peer.id) ? '恢复' : '屏蔽') + peer.displayName + '的聊天'); hide(row.mute, peer.id === current.peerId);
        row.kick.textContent = confirmKick === peer.id ? '确认请离' : '请离'; row.kick.disabled = busy || !connected(); row.kick.setAttribute('aria-label', (confirmKick === peer.id ? '确认请离' : '请离') + peer.displayName); hide(row.kick, !me || !me.isHost || peer.id === current.peerId); hide(row.cancelKick, confirmKick !== peer.id);
      });
      memberRows.forEach(function (row, peerId) { if (!keep.has(peerId)) { if (row.node.parentElement) row.node.parentElement.removeChild(row.node); memberRows.delete(peerId); if (confirmKick === peerId) confirmKick = null; } });
    }
    function conversation() {
      var list = current.messages.filter(function (message) { return !muted.has(message.peerId); }), key = list.map(function (message) { return message.seq; }).join(':'), keep = new Set(), atBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 48;
      if (key === conversationKey) return; conversationKey = key;
      list.forEach(function (message) {
        var key = String(message.seq); keep.add(key); if (messageRows.has(key)) return;
        var row = el('li', 'live-message'), name = el('strong', '', message.displayName + (message.peerId === current.peerId ? ' · 我' : '')), text = el('p', '', message.text); row.append(name, text); messageRows.set(key, row); messages.append(row);
      });
      messageRows.forEach(function (row, key) { if (!keep.has(key)) { if (row.parentElement) row.parentElement.removeChild(row); messageRows.delete(key); } });
      // 恢复被屏蔽者时也保持服务器消息顺序，不插入任何HTML。
      list.forEach(function (message, index) { var row = messageRows.get(String(message.seq)); if (row && messages.children[index] !== row) messages.insertBefore(row, messages.children[index] || null); });
      hide(empty, !!list.length); hide(messages, !list.length); if (atBottom && list.length) messages.scrollTop = messages.scrollHeight;
    }
    function paint() {
      if (destroyed) return;
      var inRoom = !!current.peerId && ['connected', 'reconnecting'].includes(current.phase), waiting = checking || current.phase === 'joining';
      count.textContent = inRoom ? current.peers.length + ' / 8人' : current.authenticated ? '尚未加入' : '登录后可加入';
      status.textContent = checking ? '正在确认登录…' : current.phase === 'joining' ? '正在加入这座小屋…' : current.phase === 'connected' ? '已经同屋，可以走动和聊天。' : current.phase === 'reconnecting' ? current.error || '正在恢复连接，消息不会自动重发。' : current.error || (current.phase === 'left' ? '这次串门已结束，可以继续参观或再次加入。' : '先选一个展示称呼，再加入小朋友们。');
      hide(guest, waiting || current.authenticated || inRoom); hide(joinForm, waiting || knocking || !current.authenticated || inRoom); hide(retry, waiting || knocking || inRoom); hide(joined, !inRoom); hide(knockBox, !knocking); hide(passerby, inRoom || knocking);
      nickname.readOnly = busy || waiting; joinButton.disabled = busy || waiting; joinButton.textContent = waiting ? '正在加入…' : '加入串门'; leaveButton.disabled = busy;
      sendButton.disabled = sending || !connected(); sendButton.textContent = sending ? '正在发送…' : '发送'; chatInput.readOnly = sending;
      quick.querySelectorAll('button').forEach(function (node) { node.disabled = sending || !connected(); }); directionPad.querySelectorAll('button').forEach(function (node) { node.disabled = !connected(); });
      roster(); conversation();
    }
    async function check(allowQuickJoin) {
      if (checking && !root.parentElement) return; checking = true; busy = sending = false; show(''); paint(); var at = ++serial;
      var answer = await live.probe(); if (destroyed || at !== serial) return; checking = false; current = live.status(); if (!answer.ok) show(answer.message, true); paint();
      // 只有本次入口在可见页已确认登录时尝试一次；游客或失败不留下以后执行的意图。
      if (allowQuickJoin === true && answer.ok && current.authenticated && !current.peerId && !document.hidden && typeof live.quickJoin === 'function') await join(null, true);
    }
    async function join(event, automatic) {
      if (event) event.preventDefault(); if (busy || checking || current.phase === 'joining') return;
      var name = nickname.value.trim();
      if (!automatic && ([...name].length < 1 || [...name].length > 24 || /[\x00-\x1f\x7f]/.test(name))) { nickname.setAttribute('aria-invalid', 'true'); show('展示昵称请写1～24个字，不能换行。', true); nickname.focus(); return; }
      busy = true; sending = false; show(''); paint(); var at = ++serial, answer = automatic ? await live.quickJoin(options.houseId) : await live.join(options.houseId, name);
      if (destroyed || at !== serial) return;
      // 不是屋主：改为敲门，等屋主同意拿到入场凭证后再加入。
      if (!answer.ok && answer.code === 'LIVE_KNOCK_REQUIRED' && typeof live.knock === 'function') {
        knocking = true; show(''); paint();
        var knocked = await live.knock(options.houseId, function (text) { if (!destroyed && at === serial) knockText.textContent = text; });
        if (destroyed || at !== serial) return; knocking = false; knockText.textContent = '已经敲门啦，请等主人回应…';
        // 可选：把敲门结果（同意/婉拒/不在家/没回应/取消）告诉宿主，例如主场景串门会话。
        if (typeof options.onKnockResult === 'function') { try { options.onKnockResult(knocked); } catch (_) { /* 宿主回调出错不影响串门组件 */ } }
        if (destroyed || at !== serial) return;
        if (!knocked.ok) { busy = false; current = live.status(); show(knocked.message, knocked.status !== 'declined' && knocked.status !== 'host_away' && knocked.status !== 'expired' && knocked.status !== 'cancelled'); paint(); return; }
        answer = automatic ? await live.quickJoin(options.houseId, knocked.ticket) : await live.join(options.houseId, name, knocked.ticket); if (destroyed || at !== serial) return;
      }
      busy = false; current = live.status(); if (!answer.ok) show(answer.message, true); else { muted.clear(); confirmKick = null; if (automatic) { var self = current.peers.find(function (peer) { return peer.id === current.peerId; }); if (self) nickname.value = self.displayName; } } paint();
    }
    async function send(text, fromInput) {
      if (sending || !connected()) return;
      if ([...text.trim()].length < 1 || [...text.trim()].length > 80 || /[\x00-\x1f\x7f]/.test(text)) { chatInput.setAttribute('aria-invalid', 'true'); show('消息请写1～80个字，不能换行。', true); chatInput.focus(); return; }
      sending = true; show(''); paint(); var at = serial, original = chatInput.value, answer = await live.chat(text);
      if (destroyed || at !== serial) return; sending = false; if (answer.ok) { if (fromInput && chatInput.value === original) chatInput.value = ''; show('消息已发出。'); } else show(answer.message, true); paint();
    }
    async function leave() {
      if (busy) return; busy = true; serial++; sending = false; show(''); paint(); await live.leave(); if (destroyed) return; busy = false; confirmKick = null; muted.clear(); current = live.status(); paint();
    }
    joinForm.addEventListener('submit', join); chatForm.addEventListener('submit', function (event) { event.preventDefault(); send(chatInput.value, true); });
    nickname.addEventListener('input', function () { nickname.removeAttribute('aria-invalid'); }); chatInput.addEventListener('input', function () { chatInput.removeAttribute('aria-invalid'); });
    var unsubscribe = live.subscribe(function (next) { if (destroyed) return; var before = current.phase; current = next; if (before !== next.phase && ['error', 'left', 'joining'].includes(next.phase)) show(''); paint(); emitState(); });
    paint(); emitState(); check(options.quickJoin === true);
    return { destroy: function () { if (destroyed) return; destroyed = true; serial++; unsubscribe(); live.leave(true); if (root.parentElement) root.parentElement.removeChild(root); } };
  }
  G.ui = G.ui || {}; G.ui.liveRoom = { mount: mount };
})(window.Game);
