(function (G) {
  'use strict';
  var ui = G.ui = G.ui || {}, body = null, nodes = {}, mode = 'login', working = '', feedback = '', feedbackError = false, initialized = false, lastAccountId = null, backupKey = '', launcher = null;
  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function append(parent) { Array.prototype.slice.call(arguments, 1).filter(Boolean).forEach(function (child) { parent.append(child); }); return parent; }
  function text(value, fallback) { return typeof value === 'string' && value ? value : fallback || ''; }
  function status() {
    if (!G.cloud || typeof G.cloud.status !== 'function') return { available: false, phase: 'offline', account: null, binding: false, busy: false };
    try { return G.cloud.status() || {}; } catch (_) { return { available: false, phase: 'error', message: '账号服务暂时没有准备好，本机小屋仍可保存和备份。' }; }
  }
  function setHidden(node, hidden) { node.classList.toggle('hidden', !!hidden); }
  function presenceNames(names) { return names.slice(0, 2).map(function (name) { var letters = Array.from(name); return letters.slice(0, 8).join('') + (letters.length > 8 ? '…' : ''); }).join('、') + (names.length > 2 ? ' 等' + names.length + '位' : ''); }
  function buildLauncher() {
    if (launcher || typeof document.getElementById !== 'function') return;
    var app = document.getElementById('app'), world = document.getElementById('world');
    if (!app || !world || typeof app.insertBefore !== 'function') return;
    var bar = el('section', 'account-bar'); bar.id = 'account-bar'; bar.setAttribute('aria-label', '账号与邻居');
    var accountButton = el('button', 'account-launch ui-button ui-button-primary'); accountButton.type = 'button'; accountButton.id = 'account-entry';
    var name = el('span', 'account-launch-name'), detail = el('span', 'account-launch-detail'); append(accountButton, name, detail);
    accountButton.addEventListener('click', function () { ui.cloudAccount.open(); });
    var neighbors = el('button', 'neighbors-launch ui-button ui-button-soft', '邻居小屋'); neighbors.type = 'button'; neighbors.id = 'neighbors-entry';
    neighbors.addEventListener('click', function () { if (ui.neighbors) ui.neighbors.open(); });
    var reception = el('a', 'neighbors-launch neighbors-reception ui-button ui-button-soft'); reception.id = 'neighbors-reception'; reception.target = '_blank'; reception.rel = 'noopener noreferrer'; setHidden(reception, true);
    var note = el('p', 'account-bar-note', '不登录也能玩，登录后可以跨设备继续。'); note.setAttribute('role', 'status'); note.setAttribute('aria-live', 'polite'); append(bar, accountButton, neighbors, reception, note);
    app.insertBefore(bar, world); app.classList.add('has-account-bar'); launcher = { bar: bar, button: accountButton, name: name, detail: detail, note: note, neighbors: neighbors, reception: reception };
  }
  function paintLauncher() {
    if (!launcher) return;
    var s = status(), signedIn = !!s.account && s.phase !== 'expired';
    var labels = { ready: '已同步', pending: '等待同步', syncing: '正在同步', offline: '离线保留中', conflict: '请选择进度', choose: '先关联小屋', expired: '请重新登录', error: '同步需重试', incompatible: '请更新页面', other_tab: '此页只读' };
    var name = signedIn ? text(s.account.displayName, text(s.account.username, '我的账号')) : '登录 / 注册';
    launcher.name.textContent = name; launcher.detail.textContent = signedIn ? labels[s.phase] || '查看账号' : s.phase === 'expired' ? '重新登录继续同步' : '不登录也能玩';
    launcher.button.classList.toggle('is-signed-in', signedIn); launcher.button.setAttribute('title', signedIn ? name + ' · ' + launcher.detail.textContent : '登录或注册账号，也可以继续单机游玩');
    launcher.button.setAttribute('aria-label', signedIn ? '账号：' + name + '，' + launcher.detail.textContent + '，打开账号与云存档' : '登录或注册账号，不登录也能继续玩');
    var presence = signedIn && G.neighbors && G.neighbors.homePresence ? G.neighbors.homePresence() : null, guests = !!(presence && presence.count > 0);
    launcher.bar.classList.toggle('has-visitors', guests); setHidden(launcher.reception, !guests);
    launcher.reception.textContent = guests ? (presence.full ? '我家满员 · ' : '接待朋友 · ') + presence.count + '位' : '';
    launcher.reception.classList.toggle('has-guests', guests);
    if (guests) {
      launcher.reception.href = presence.href;
      // 主场景接待：未满员且可用时直接进入自己家的屋主同屋（经 visitSession → hostRoom），否则仍打开旧页。
      if (!presence.full && G.neighbors.bindVisit && G.neighbors.ownId && G.neighbors.ownId()) G.neighbors.bindVisit(launcher.reception, G.neighbors.ownId(), true);
      launcher.reception.setAttribute('aria-label', '我家有' + presence.count + '位朋友来串门。正在这里玩：' + presence.displayNames.join('、') + (presence.full ? '。小屋暂时满员，打开查看。' : '。打开新页面接待朋友并聊天。'));
    } else { launcher.reception.removeAttribute('href'); launcher.reception.removeAttribute('aria-label'); }
    launcher.note.textContent = guests ? '我家正在玩：' + presenceNames(presence.displayNames) + (presence.full ? '。小屋暂时满员。' : '。点「接待朋友」一起走动、聊天。') : presence && presence.stale ? '正在重新确认家里的访客状态。' : signedIn ? '先保存在本机，再自动同步到自己的账号。' : '不登录也能玩，登录后可以跨设备继续。';
  }
  function action(label, fn, kind, className) {
    var node = el('button', className || 'ui-button', label); node.type = 'button'; node.dataset.cloudAction = kind || 'network';
    node.addEventListener('click', fn); return node;
  }
  function currentSummary(value) {
    var s = value || G.state || {}, house = s.house || {}, wallet = s.wallet || {}, count = null;
    try {
      // 旧副本仅在独立校验结果里迁移，以便读出空间数；不换档或触发保存。
      var checked = s.building ? s : G.store.validate(s);
      count = G.contentSpaces.list(checked).length;
    } catch (_) { /* 摘要无法计算时显示未知，不能拿旧格子数量代替当前建筑。 */ }
    return { name: house.name || '本机小屋', level: s.level, coin: wallet.coin, roomCount: count };
  }
  function number(value) { return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('zh-CN') : '—'; }
  function date(value) { var d = new Date(value); return value && Number.isFinite(d.getTime()) ? d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; }
  function summary(title, value) {
    var section = el('section', 'cloud-version'), data = value || {}, list = el('dl', 'cloud-version-facts');
    var fullState = data.state || data.save || data.snapshot && data.snapshot.state || data.house && data;
    if (fullState && fullState.house) data = Object.assign({}, data, currentSummary(fullState));
    append(section, el('h3', '', title), el('p', 'cloud-house-name', text(data.name, '还没有保存的小屋')));
    [['等级', number(data.level)], ['糖果', number(data.coin)], ['房间', number(data.roomCount)]].forEach(function (row) { append(list, el('dt', '', row[0]), el('dd', '', row[1])); });
    section.append(list); if (date(data.updatedAt)) section.append(el('p', 'ui-small ui-muted', '保存于 ' + date(data.updatedAt))); return section;
  }
  function showFeedback(message, error) { feedback = text(message); feedbackError = !!error; paint(); }
  function localBackup() {
    try { G.save.exportJson(); showFeedback('当前小屋的JSON存档已准备下载，请保留好这份文件。', false); }
    catch (error) { showFeedback(error && error.message || '这次没有准备好备份，请保留页面后再试。', true); }
  }
  async function run(name, fn) {
    if (working) return { ok: false };
    working = name; feedback = ''; paint();
    try {
      var result = await fn();
      if (!result || result.ok !== true) { feedback = result && result.message || '这次没有完成，本机进度仍在。请稍后再试。'; feedbackError = true; }
      else { feedback = result.warning || result.message || '已经收好。'; feedbackError = !!result.warning; }
      return result;
    } catch (error) { feedback = error && error.message || '暂时没有连上云端，本机进度仍在。请稍后重试。'; feedbackError = true; return { ok: false, message: feedback }; }
    finally { working = ''; paint(); }
  }
  function call(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    return run(name, function () { if (!G.cloud || typeof G.cloud[name] !== 'function') return { ok: false, message: '这项云存档功能暂时不可用，先下载JSON备份也能保留小屋。' }; return G.cloud[name].apply(G.cloud, args); });
  }
  function accountId(s) { return s.account && s.account.id || null; }
  function maybeGuideAvatarSetup() {
    var s = status();
    if (!s.account || s.phase === 'expired' || !s.binding) return false;
    if (G.sys && G.sys.avatar && typeof G.sys.avatar.hasConfigured === 'function') {
      if (!G.sys.avatar.hasConfigured()) {
        if (ui.panel && typeof ui.panel.close === 'function') ui.panel.close();
        else if (typeof ui.close === 'function') ui.close();
        setTimeout(function () {
          if (ui.avatar && typeof ui.avatar.pickPreset === 'function') {
            ui.avatar.pickPreset({ first: true, fromLogin: true });
          }
        }, 120);
        return true;
      }
    }
    return false;
  }
  async function choose(message, accept, name, value) {
    var before = status(), owner = accountId(before), remote = before.remote && before.remote.revision;
    if (working || before.busy) return;
    if (typeof ui.confirm !== 'function' || !await ui.confirm(message, { title: '选好这次继续的小屋', accept: accept, cancel: '先保留两份', danger: true })) return;
    var after = status();
    if (owner !== accountId(after) || remote !== (after.remote && after.remote.revision)) { showFeedback('账号里的进度有了变化，请重新看看两份小屋，再选择一次。', true); return; }
    var result = value === undefined ? await call(name) : await call(name, value);
    if (result && result.ok) maybeGuideAvatarSetup();
    return result;
  }
  async function signOut() {
    var s = status();
    if (working || s.busy) return;
    var message = s.dirty || s.phase === 'pending' || s.phase === 'conflict' ? '这台设备还有尚未同步的进度。建议先下载JSON；退出时会尝试保留本机副本，保存不成功就不退出。确定退出这个账号吗？' : '退出后可以换另一个孩子的账号，或继续本机的小屋。当前账号会先保留本机副本。确定退出吗？';
    if (typeof ui.confirm === 'function' && await ui.confirm(message, { title: '退出当前账号', accept: '保留副本并退出', cancel: '先不退出' })) { var result = await call('logout'); if (result && result.ok) { nodes.password.value = ''; nodes.username.value = ''; nodes.displayName.value = ''; } }
  }
  async function takeover() {
    if (typeof ui.confirm !== 'function' || !await ui.confirm('这页目前只读，另一个页面正在保存。改在这里继续后，另一个页面会暂停写入。先下载需要保留的JSON，再接着玩。', { title: '在这个页面继续', accept: '在此页继续', cancel: '保持只读' })) return;
    await call('takeover');
  }
  function field(labelText, input, hint, id) {
    var label = el('label', 'cloud-field', labelText), description = el('span', 'ui-small ui-muted', hint); description.id = id; input.setAttribute('aria-describedby', id); append(label, input, description); return label;
  }
  function input(type, name) {
    var node = el('input', 'ui-input'); node.type = type; node.name = name; node.id = 'cloud-' + name; node.dataset.uiFocus = 'cloud-' + name;
    node.addEventListener('input', function () { node.removeAttribute('aria-invalid'); }); return node;
  }
  function invalid(node, message) { node.setAttribute('aria-invalid', 'true'); showFeedback(message, true); node.focus(); }
  async function authenticate(event) {
    event.preventDefault(); if (working || status().busy) return;
    if (status().readOnly) return showFeedback('这页目前只读。请先下载需要保留的JSON，再选择“在此页继续”。', true);
    var username = nodes.username.value.trim(), password = nodes.password.value, displayName = nodes.displayName.value.trim();
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) return invalid(nodes.username, '账号名请用3～32位字母、数字或下划线，不要填真实姓名。');
    if (password.length < 8 || password.length > 128) return invalid(nodes.password, '密码需要8～128个字符，请家长帮忙设置并记好。');
    if (mode === 'register' && ([...displayName].length > 24 || /[\x00-\x1f\x7f]/.test(displayName))) return invalid(nodes.displayName, '昵称最多24个字，不能换行；也可以留空。');
    var details = { username: username.toLowerCase(), password: password }; if (mode === 'register' && displayName) details.displayName = displayName;
    var result = await call(mode, details);
    if (result && result.ok) {
      nodes.password.value = '';
      maybeGuideAvatarSetup();
    }
  }
  function setMode(value) { if (working) return; mode = value; feedback = ''; paint(); }
  function build() {
    body = el('div', 'ui-stack cloud-account');
    nodes.status = el('p', 'cloud-status-line'); nodes.status.setAttribute('role', 'status'); nodes.status.setAttribute('aria-live', 'polite');
    nodes.description = el('p', 'ui-small ui-muted cloud-description'); nodes.identity = el('p', 'cloud-identity');
    nodes.feedback = el('p', 'cloud-feedback'); nodes.feedback.setAttribute('role', 'status'); nodes.feedback.setAttribute('aria-live', 'polite');
    nodes.auth = el('form', 'ui-stack cloud-auth'); nodes.auth.noValidate = true;
    nodes.username = input('text', 'username'); nodes.username.autocomplete = 'username'; nodes.username.required = true; nodes.username.minLength = 3; nodes.username.maxLength = 32; nodes.username.autocapitalize = 'none'; nodes.username.spellcheck = false;
    nodes.password = input('password', 'password'); nodes.password.required = true; nodes.password.minLength = 8; nodes.password.maxLength = 128;
    nodes.displayName = input('text', 'display-name'); nodes.displayName.autocomplete = 'nickname'; nodes.displayName.maxLength = 48;
    nodes.nickname = field('小屋昵称（可不填）', nodes.displayName, '可以随意起名字，最多24个字。', 'cloud-name-hint');
    nodes.loginTab = action('登录账号', function () { setMode('login'); }, 'tab', 'ui-tab'); nodes.registerTab = action('新建账号', function () { setMode('register'); }, 'tab', 'ui-tab');
    var tabs = append(el('div', 'ui-tabs cloud-auth-tabs'), nodes.loginTab, nodes.registerTab); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', '登录或新建账号');
    nodes.submit = el('button', 'ui-button ui-button-primary'); nodes.submit.type = 'submit'; nodes.submit.dataset.cloudAction = 'auth'; nodes.submit.dataset.uiFocus = 'cloud-auth-submit';
    append(nodes.auth, tabs, field('账号名', nodes.username, '3～32位字母、数字或下划线，大小写视为同一账号。', 'cloud-username-hint'), field('密码', nodes.password, '8～128个字符。请家长帮忙记好，不要与别人共用。', 'cloud-password-hint'), nodes.nickname, nodes.submit);
    nodes.auth.addEventListener('submit', authenticate);
    nodes.choice = el('section', 'ui-stack cloud-choice');
    nodes.choiceTitle = el('h3', '', '这次继续哪座小屋？'); nodes.choiceText = el('p', 'ui-small ui-muted'); nodes.versions = el('div', 'cloud-versions');
    nodes.localChoice = action('把本机小屋存到账号', function () {
      var s = status(), hasRemote = s.remote || s.conflict && s.conflict.cloud;
      var message = hasRemote ? '继续本机这份，会用它替换账号当前的小屋进度。建议先下载本机和云端两份JSON，再确认使用这一份。' : '把当前本机小屋存入这个账号，开始自动同步吗？建议也下载一份JSON，自己留好备份。';
      return choose(message, '保存本机这份', s.phase === 'conflict' ? 'resolveConflict' : 'bindLocal', s.phase === 'conflict' ? 'local' : undefined);
    }, 'write', 'ui-button ui-button-primary');
    nodes.cloudChoice = action('用账号里的小屋继续', function () { return choose('使用账号里的小屋，会替换这页正在玩的进度。系统会先尝试保留本机副本，不能保存就停止；建议也下载JSON备份。', '使用云端这份', status().phase === 'conflict' ? 'resolveConflict' : 'useCloud', status().phase === 'conflict' ? 'cloud' : undefined); }, 'write', 'ui-button ui-button-soft');
    nodes.newChoice = action('为这个账号新建小屋', function () { return choose('为这个账号新建一座小屋吗？系统会先保留当前本机小屋的副本，再开始全新的旅程。建议也下载一份JSON，留好原来的小屋。', '新建这个账号的小屋', 'startNew'); }, 'write', 'ui-button ui-button-primary');
    append(nodes.choice, nodes.choiceTitle, nodes.choiceText, nodes.versions, append(el('div', 'cloud-choice-actions'), nodes.newChoice, nodes.localChoice, nodes.cloudChoice));
    nodes.connected = el('section', 'ui-stack cloud-connected'); nodes.syncDetail = el('p', 'ui-small ui-muted');
    nodes.sync = action('现在同步', function () { return call('syncNow'); }, 'write', 'ui-button ui-button-primary');
    nodes.logout = action('退出账号', signOut, 'account');
    append(nodes.connected, nodes.syncDetail, append(el('div', 'ui-actions'), nodes.sync, nodes.logout));
    nodes.takeover = action('在此页继续', takeover, 'takeover', 'ui-button ui-button-soft');
    nodes.backupActions = append(el('div', 'cloud-backup-actions'), action('下载本机JSON', localBackup, 'local-backup'), nodes.cloudDownload = action('下载云端JSON', function () { return call('downloadCloud'); }, 'network'));
    nodes.backups = el('details', 'cloud-backups'); nodes.backupHeading = el('summary', '', '本机保留的副本'); nodes.backupList = el('div', 'ui-stack cloud-backup-list'); append(nodes.backups, nodes.backupHeading, el('p', 'ui-small ui-muted', '先下载JSON再整理。这里只移除这台设备的副本，不删除账号里的云存档。'), nodes.backupList);
    append(body, nodes.status, nodes.identity, nodes.description, nodes.auth, nodes.feedback, nodes.takeover, nodes.choice, nodes.connected, nodes.backupActions, nodes.backups);
    nodes.offline = el('p', 'ui-small ui-muted'); nodes.offline.setAttribute('role', 'status'); nodes.offline.setAttribute('aria-live', 'polite'); body.append(nodes.offline);
    body.append(el('p', 'ui-small ui-muted', '每个孩子使用自己的账号。也可以不登录，继续单机和JSON备份。MD回忆录仍只用于阅读。'));
  }
  function renderBackups(s) {
    var backups = Array.isArray(s.backups) ? s.backups : [], key = JSON.stringify(backups);
    setHidden(nodes.backups, !backups.length); nodes.backupHeading.textContent = '本机保留的副本（' + backups.length + '）'; if (key === backupKey) return; backupKey = key;
    nodes.backupList.replaceChildren();
    backups.forEach(function (value) {
      var row = el('section', 'cloud-backup-row'), name = value.account && (value.account.displayName || value.account.username) || '单机小屋';
      append(row, el('h4', '', name + (value.active ? ' · 正在使用' : '')), el('p', 'ui-small ui-muted', text(value.name, '小屋副本') + ' · 等级' + number(value.level) + ' · ' + number(value.roomCount) + '间房'));
      var actions = el('div', 'ui-actions'); actions.append(action('下载这份JSON', function () { return call('downloadBackup', value.id); }, 'local-backup'));
      if (!value.active) actions.append(action('移除本机副本', async function () {
        if (typeof ui.confirm !== 'function' || !await ui.confirm('移除“' + text(value.name, name) + '”在这台设备的副本？未同步的内容可能只在这份副本里，请先下载JSON。云存档不会因此删除。', { title: '整理本机副本', accept: '已备份，移除副本', cancel: '先保留', danger: true })) return;
        await call('forgetBackup', value.id);
      }, 'write', 'ui-button ui-button-danger'));
      row.append(actions); nodes.backupList.append(row);
    });
  }
  function paint() {
    paintLauncher();
    if (!body) return;
    var s = status(), id = accountId(s), authenticated = !!s.account && s.phase !== 'expired', busy = !!working || !!s.busy, choice = authenticated && (!s.binding || s.phase === 'choose' || s.phase === 'conflict');
    var labels = { offline: s.available ? '暂时离线，本机进度还在' : '当前使用离线玩法', guest: '还没有登录账号', ready: '账号与本机进度已同步', pending: '本机有新进度，等待同步', syncing: '正在把进度存到账号…', conflict: '两边都有新进度，需要选一份', choose: '先选择这次继续的小屋', expired: '登录已过期，本机进度还在', error: '云端暂时没有同步', incompatible: '需要更新游戏页面后再同步', other_tab: '这页只读，另一个页面正在保存' };
    nodes.status.textContent = labels[s.phase] || '正在查看小屋存档';
    nodes.identity.textContent = s.account ? '当前账号：' + text(s.account.displayName, s.account.username) + (s.account.username ? '（' + s.account.username + '）' : '') : '';
    setHidden(nodes.identity, !s.account);
    nodes.description.textContent = !s.available ? '离线文件版不能登录云存档，仍可保存本机进度和下载JSON。到网站入口登录后，再选择关联小屋。' : s.phase === 'incompatible' ? '先下载JSON备份，再刷新游戏。没有同步的进度会先保留在本机。' : s.phase === 'other_tab' ? '先在原页面保存好；想换到这里玩，请主动选择“在此页继续”。' : text(s.message, authenticated ? '先保存在本机，再自动保存到自己的账号；离线时继续玩，联网后再同步。' : '登录自己的账号，换设备也能继续同一座小屋。不要求真实姓名或邮箱。');
    setHidden(nodes.auth, !s.available || authenticated); nodes.auth.setAttribute('aria-busy', String(!!working));
    nodes.loginTab.setAttribute('aria-pressed', String(mode === 'login')); nodes.registerTab.setAttribute('aria-pressed', String(mode === 'register'));
    nodes.loginTab.classList.toggle('is-active', mode === 'login'); nodes.registerTab.classList.toggle('is-active', mode === 'register');
    nodes.password.autocomplete = mode === 'register' ? 'new-password' : 'current-password'; setHidden(nodes.nickname, mode !== 'register');
    nodes.submit.textContent = working === 'login' ? '正在登录…' : working === 'register' ? '正在新建账号…' : mode === 'register' ? '新建我的账号' : '登录我的账号';
    [nodes.username, nodes.password, nodes.displayName].forEach(function (node) { node.readOnly = working === 'login' || working === 'register'; });
    if (id && id !== lastAccountId) nodes.password.value = ''; lastAccountId = id;
    nodes.feedback.textContent = feedback; nodes.feedback.setAttribute('role', feedbackError ? 'alert' : 'status'); nodes.feedback.setAttribute('aria-live', feedbackError ? 'assertive' : 'polite'); setHidden(nodes.feedback, !feedback);
    setHidden(nodes.choice, !choice); setHidden(nodes.connected, !authenticated); setHidden(nodes.takeover, s.phase !== 'other_tab');
    nodes.choiceTitle.textContent = s.phase === 'conflict' ? '这次继续哪份进度？' : '先关联这座小屋';
    nodes.choiceText.textContent = s.phase === 'conflict' ? '这台设备和云端都玩过新内容。先下载两份JSON，再选接下来继续哪份；金币、家具不会自动拼在一起。' : s.remote ? '账号里已经有小屋，本机这座不会自动被换掉。先看看两份，再主动选择。' : '账号里还没有小屋。可以新建一座，也可以使用这台设备的小屋；原来的本机小屋会先保留副本，确认选择后才开始自动同步。';
    if (s.restoreRequired) nodes.choiceText.textContent = '本机存档没有完整读出，请先保留原文和JSON备份。暂不新建或上传这份临时小屋；可以主动选择恢复账号里的进度。';
    var local = s.conflict && s.conflict.local || currentSummary(), remote = s.conflict && s.conflict.cloud || s.remote;
    nodes.versions.classList.toggle('cloud-versions-single', !remote);
    nodes.versions.replaceChildren(summary('这台设备的小屋', local)); if (remote) nodes.versions.append(summary('账号里的小屋', remote));
    nodes.localChoice.textContent = s.phase === 'conflict' ? '继续本机这份' : '把本机小屋存到账号'; nodes.cloudChoice.textContent = s.phase === 'conflict' ? '继续云端这份' : '用账号里的小屋继续'; setHidden(nodes.cloudChoice, !remote);
    setHidden(nodes.newChoice, !choice || !!remote); nodes.localChoice.classList.toggle('ui-button-primary', !!remote); nodes.localChoice.classList.toggle('ui-button-soft', !remote);
    nodes.syncDetail.textContent = !s.binding ? '选择小屋后才开始自动同步。' : s.dirty ? '还有新进度等待同步；离开这台设备前，请确认已同步或下载JSON。' : s.remote && date(s.remote.updatedAt) ? '云端最近保存：' + date(s.remote.updatedAt) + '。换设备后登录同一账号继续。' : '登录同一账号即可在另一台设备继续。JSON仍可自己下载保留。';
    nodes.sync.textContent = s.phase === 'error' || s.phase === 'offline' ? '重试同步' : '现在同步';
    var offline = G.offline && typeof G.offline.status === 'function' ? G.offline.status() : null;
    nodes.offline.textContent = offline && offline.message || '网址的离线副本是否准备好，请以这里的状态提示为准；JSON备份始终可以自己保留。';
    setHidden(nodes.cloudDownload, !authenticated || !remote);
    renderBackups(s);
    body.querySelectorAll('[data-cloud-action]').forEach(function (button) {
      var kind = button.dataset.cloudAction;
      button.disabled = kind === 'local-backup' ? false : busy || (['write', 'account', 'auth'].includes(kind) && (!!s.readOnly || s.phase === 'incompatible'));
    });
    nodes.sync.disabled = busy || !s.binding || !!s.readOnly || s.phase === 'conflict' || s.phase === 'choose' || s.phase === 'incompatible';
    if (s.restoreRequired) { nodes.localChoice.disabled = true; nodes.newChoice.disabled = true; }
  }
  ui.cloudAccount = {
    panel: function () { if (!body) build(); paint(); return { title: '账号与云存档', subtitle: '每个孩子一座自己的小屋', content: body }; },
    open: function () { if (typeof ui.open === 'function') ui.open('cloudAccount'); },
    close: function () { if (nodes.password) nodes.password.value = ''; },
    entry: function () { return action('账号与云存档', function () { ui.cloudAccount.open(); }, 'entry', 'ui-button ui-button-soft cloud-account-entry'); },
    maybeGuideAvatarSetup: maybeGuideAvatarSetup,
    init: function () {
      if (initialized) return;
      initialized = true;
      buildLauncher();
      paintLauncher();
      var guidedAccountId = null;
      function onCloudChange() {
        paint();
        var s = status();
        if (s.account && s.binding && s.phase !== 'expired') {
          if (guidedAccountId !== s.account.id) {
            guidedAccountId = s.account.id;
            maybeGuideAvatarSetup();
          }
        } else if (!s.account) {
          guidedAccountId = null;
        }
      }
      if (G.bus && G.bus.on) {
        G.bus.on('cloud:change', onCloudChange);
        G.bus.on('offline:change', paint);
        G.bus.on('neighbors:presence', paintLauncher);
      }
    }
  };
})(window.Game);
