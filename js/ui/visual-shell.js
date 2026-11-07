/* 正式公共外壳：只读游戏状态，统一导航、图形与相机遮挡区域。 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {};
  const $ = id => document.getElementById(id);
  const paths = {
    home: 'M3 11 12 3l9 8M5 10v11h14V10M9 21v-7h6v7',
    sofa: 'M4 12V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v4M6 13h12M4 11a2 2 0 0 0-2 2v5h20v-5a2 2 0 0 0-4 0v3H6v-3a2 2 0 0 0-2-2ZM5 18v3m14-3v3',
    people: 'M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 9v-3a6 6 0 0 1 12 0v3M16 4a4 4 0 0 1 0 8m1 3a5 5 0 0 1 5 5v1',
    map: 'm3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15',
    game: 'M7 7h10a5 5 0 0 1 5 5v6a3 3 0 0 1-5 2l-3-3h-4l-3 3a3 3 0 0 1-5-2v-6a5 5 0 0 1 5-5Zm0 4v5m-2-2.5h4m7-1h.01M19 15h.01',
    leaf: 'M20 3C8 1 2 8 6 15c6 7 15 1 14-12ZM4 21 16 8M10 14l-1-4m1 4 5 1',
    bag: 'M4 7h16l1 15H3L4 7Zm4 0V5a4 4 0 0 1 8 0v2M8 11v1m8-1v1',
    book: 'M12 5C8 2 4 3 2 4v16c3-2 7-2 10 0 3-2 7-2 10 0V4c-3-2-7-1-10 1Zm0 0v15M5 8h4M5 11h4m6-3h4m-4 3h4',
    shirt: 'm8 3-6 5 4 4 2-2v12h8V10l2 2 4-4-6-5q-4 5-8 0Z',
    camera: 'M3 7h4l2-3h6l2 3h4v14H3V7Zm9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM18 10h.01',
    gift: 'M2 9h20v5H2V9Zm2 5v8h16v-8M12 9v13m0-13C2 9 4 1 8 3c2 1 4 6 4 6Zm0 0c10 0 8-8 4-6-4 6Z',
    mail: 'M3 5h18v15H3V5Zm0 0 9 8 9-8M3 20l6-9m12 9-6-9',
    plus: 'M12 4v16M4 12h16', minus: 'M4 12h16',
    focus: 'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    cloud: 'M6 18a5 5 0 0 1-1-9 7 7 0 0 1 13-1 5 5 0 1 1 1 10H6M8 13h.01M16 13h.01M10 15q2 2 4 0',
    settings: 'm9 3 1-2h4l1 2 3 2 2 1 2 3-1 3v3l-1 3-3 1-2 2h-4l-2-2-3-1-1-3v-3L2 9l2-3 2-1 3-2ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    volume: 'M3 9h4l6-5v16l-6-5H3V9Zm13-2a7 7 0 0 1 0 10m3-13a11 11 0 0 1 0 16',
    mute: 'M3 9h4l6-5v16l-6-5H3V9Zm13-1 6 8m0-8-6 8',
    stop: 'M6 6h12v12H6V6Z',
    heart: 'M12 21 3.5 13A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 8.5 7L12 21Z',
    candy: 'm8 7 9 2 1 8-9-2-1-8ZM8 7 3 6l1 6 5 3m8-6 4-3 1 7-4 4m-8-8 5 5',
    star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z',
    cake: 'M3 13h18v9H3v-9Zm0 4q3 4 6 0 3 4 6 0 3 4 6 0M5 13V9h14v4M8 9V6m4 3V5m4 4V6M8 3h.01M12 2h.01M16 3h.01'
  };
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'shell-icon'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', paths[name] || paths.home); svg.append(path); return svg;
  }
  const surfaces = {
    home: ['我的云上小屋', '把喜欢的日子，慢慢装进小屋。'],
    decorate: ['建造与装饰', '一件家具、一间房，布置自己的小天地。'],
    neighbors: ['去云海串个门', '看看主动公开的小屋，和邻居打个招呼。'],
    residents: ['住在一起的朋友', '聊天、送心意，慢慢认识彼此。'],
    play: ['云端游乐场', '玩一会儿，把小小的快乐带回家。'],
    garden: ['小屋前的花园', '播下种子，照顾自己的花果与小工坊。'],
    shop: ['云朵杂货铺', '选一件喜欢的，给小屋添点新模样。'],
    memories: ['把日子收进书里', '照片、画作和每一段真实的小屋回忆。'],
    avatar: ['今天想穿什么', '穿上喜欢的颜色，去小屋里走走。'],
    quests: ['小屋成长册', '每一小步，都让家更温暖。'],
    settings: ['照自己舒服的方式', '声音、账号与存档，都在这里照顾。'],
    cloudAccount: ['我的账号与小屋', '本机可以继续玩，云端同步由你选择。'],
    help: ['糯米陪你慢慢来', '从第一间房开始，把云岛变成家。']
  };
  const decoration = ['build', 'decor', 'yard', 'exterior', 'houseDesign', 'roomLayout'];
  const recollection = ['memories', 'collection', 'crafting', 'observatory', 'login'];
  let panelKind = null, initialized = false, scheduled = false, wishesKey = '', peopleKey = '', observedLayoutKey = '';
  function group(kind) { return !kind ? 'home' : decoration.includes(kind) ? 'decorate' : recollection.includes(kind) ? 'memories' : kind; }
  function sync(kind) {
    panelKind = kind || null;
    const app = $('app'); if (!app) return;
    if (panelKind) app.classList.remove('home-paper-open');
    app.classList.toggle('has-open-panel', !!panelKind || app.classList.contains('home-paper-open')); app.dataset.surface = panelKind || 'home';
    const current = group(panelKind), copy = surfaces[panelKind] || surfaces[current] || surfaces.memories;
    if ($('location-title')) $('location-title').textContent = copy[0];
    if ($('location-copy')) $('location-copy').textContent = copy[1];
    if ($('home-paper')) $('home-paper').setAttribute('aria-hidden', String(!!panelKind));
    document.querySelectorAll('#dock [data-nav]').forEach(node => {
      const active = node.dataset.nav === current;
      node.classList.toggle('is-active', active); node.setAttribute('aria-pressed', String(active));
      if (active) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
    });
    document.querySelectorAll('#quick-nav [data-panel]').forEach(node => {
      const active = node.dataset.panel === panelKind; node.classList.toggle('is-active', active); node.setAttribute('aria-pressed', String(active));
    });
    scheduleLayout();
  }
  function rect(node) {
    const b = node.getBoundingClientRect();
    return { x: b.left, y: b.top, left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height };
  }
  function visible(node) {
    if (!node || !node.getClientRects().length) return false;
    const style = window.getComputedStyle ? window.getComputedStyle(node) : node.style;
    return !style || style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse';
  }
  function takingOver() {
    const body = document.body;
    return !!(body && (body.classList.contains('is-photographing') || body.classList.contains('is-creating')) || visible(document.querySelector('.minigame-modal, .bakery-modal')));
  }
  function getLayoutState() {
    const scene = $('scene'), panel = $('panel'), home = $('home-paper');
    if (!scene) return null;
    const sceneBounds = rect(scene), mobile = window.matchMedia('(max-width: 600px)').matches;
    const open = !!panel && !panel.classList.contains('hidden'), takeover = takingOver();
    const paper = open ? panel : home, paperBounds = !takeover && visible(paper) ? rect(paper) : null;
    // 接管期间纸面、HUD、底座已隐藏；visibility:hidden仍有rect，不能当遮挡。
    const clear = mobile || takeover;
    const left = !clear && visible($('quick-nav')) ? 106 : 0, top = !clear && visible($('hud')) ? 104 : 0;
    const bottom = !clear && visible(document.querySelector('.dock-wrap')) ? 130 : 0;
    const right = clear ? 0 : paperBounds ? Math.max(26, sceneBounds.right - paperBounds.left + 28) : 28;
    const safeScene = { x: left, y: top, left, top, width: Math.max(1, sceneBounds.width - left - right), height: Math.max(1, sceneBounds.height - top - bottom) };
    safeScene.right = safeScene.left + safeScene.width; safeScene.bottom = safeScene.top + safeScene.height;
    return {
      version: 1, panelKind, mobile, takeover, placement: mobile ? 'flow' : 'side',
      sceneBounds, safeScene, insets: { top, right, bottom, left },
      panel: { open, kind: panelKind, placement: mobile ? 'flow' : 'side', bounds: open ? paperBounds : null },
      homePaperBounds: !open ? paperBounds : null,
      // safeScene相对于scene；bounds相对于浏览器视口。侧栏和正常流都不扣整幅画布的高度。
      bottomOcclusion: 0
    };
  }
  function sceneViewport() {
    const scene = $('scene'), state = getLayoutState();
    const full = scene ? rect(scene) : { width: window.innerWidth || 0, height: window.innerHeight || 0 };
    if (!state || !initialized || !full.width || !full.height) return { x: 0, y: 0, width: full.width, height: full.height, layout: 'none', panel: null };
    const paper = state.panel.bounds || state.homePaperBounds;
    const intersects = paper && paper.right > full.left && paper.left < full.right && paper.bottom > full.top && paper.top < full.bottom;
    const bounds = intersects ? { x: paper.left - full.left, y: paper.top - full.top, width: paper.width, height: paper.height } : null;
    return { x: state.safeScene.x, y: state.safeScene.y, width: state.safeScene.width, height: state.safeScene.height, layout: bounds ? 'side' : 'none', panel: bounds };
  }
  function publishLayout() {
    const state = getLayoutState(); if (!state) return;
    observedLayoutKey = layoutKey(state);
    const viewport = sceneViewport();
    state.viewport = viewport;
    if (G.runtime) G.runtime.shellLayout = state;
    const app = $('app');
    if (app) { app.style.setProperty('--open-panel-height', '0px'); app.classList.remove('panel-covers-scene'); }
    G.bus.emit('panel:change', { open: state.panel.open, height: state.panel.open && state.panel.bounds ? state.panel.bounds.height : 0, layout: viewport.layout, bounds: state.panel.bounds, panel: viewport.panel, viewport });
    G.bus.emit('shell:layout', state);
    return state;
  }
  function scheduleLayout() {
    if (scheduled) return; scheduled = true;
    requestAnimationFrame(() => { scheduled = false; publishLayout(); });
  }
  function layoutKey(state) {
    return state ? JSON.stringify([state.takeover, state.panel.open, state.sceneBounds, state.safeScene, state.panel.bounds, state.homePaperBounds]) : '';
  }
  function observeVisibility() {
    if (!window.MutationObserver) return;
    observedLayoutKey = layoutKey(getLayoutState());
    const changed = () => {
      const key = layoutKey(getLayoutState());
      if (key === observedLayoutKey) return;
      observedLayoutKey = key; scheduleLayout();
    };
    const attributes = { attributes: true, attributeFilter: ['class', 'style', 'hidden'] };
    const shellObserver = new window.MutationObserver(changed);
    [document.body, $('panel'), $('home-paper'), $('hud'), $('quick-nav'), document.querySelector('.dock-wrap')].filter(Boolean).forEach(node => shellObserver.observe(node, attributes));
    const root = $('modal-root');
    if (root) {
      // 只观察modal根的增删及dialog本身的类；不监听棋子、计数等高频内容。
      const dialogObserver = new window.MutationObserver(changed);
      const watchDialogs = () => {
        dialogObserver.disconnect(); root.querySelectorAll('.modal-card').forEach(node => dialogObserver.observe(node, attributes));
      };
      const modalObserver = new window.MutationObserver(() => { watchDialogs(); changed(); });
      modalObserver.observe(root, { childList: true }); watchDialogs();
    }
    // 不观察app.style：publishLayout写入的兼容变量不能反向触发布局循环。
  }
  function action(name) {
    if (name === 'home') {
      // 还原到初始干净全景：不再切换 home-paper（展开仍由 #home-paper-toggle 专管，这里只收起）。
      // 正在串门时先回自己的小屋；leave 幂等。
      if (G.visitSession && typeof G.visitSession.leave === 'function') G.visitSession.leave();
      if (ui.controls) ui.controls.close(false);
      // 关闭弹层（走各自的关闭按钮以触发 onClose），再关面板与 home-paper。
      document.querySelectorAll('#modal-root .modal-card [aria-label="关闭对话框"]').forEach(node => node.click());
      ui.panel.close();
      G.buildingEditor?.cancelPlacement?.();
      const app = $('app');
      if (app) { app.classList.remove('home-paper-open'); app.classList.remove('has-open-panel'); }
      G.runtime.mode = 'explore'; G.runtime.placing = null; G.runtime.selected = null; G.runtime.activeRoomId = null;
      ui.selection();
      // 玩家回默认站位，清掉按住的方向键。
      if (G.playerMovement) { if (G.playerMovement.resetKeys) G.playerMovement.resetKeys(); if (G.playerMovement.toYard && G.runtime.player) G.playerMovement.toYard(); }
      // 先把 panelKind 发布成 null，相机才不会因旧的 surface 又进花园页/舞台页。
      sync(null); publishLayout();
      if (G.render.camera && G.render.camera.goHome) G.render.camera.goHome();
      else { if (G.render.setHouseView) G.render.setHouseView({ floor: 'all', previewFourFloors: false }); if (G.render.camera) G.render.camera.fit(); }
      window.scrollTo({ top: 0, behavior: 'auto' });
    } else if (name === 'photography' && ui.photography) ui.photography.open();
    else if (name === 'calendar' && ui.calendar) ui.calendar.open();
  }
  let avatarKey = '';
  const PRESET_NAMES = {
    preset_sunny: '🍓 草莓团团',
    preset_pony: '🍋 奶黄布丁',
    preset_bun: '🐰 蜜桃兔兔',
    preset_curl: '🧸 奶咖小熊',
    preset_braid: '🫐 香芋星宝',
    preset_bob: '🍵 薄荷喵喵',
    preset_short: '🍊 蜜柑柴柴',
    preset_taro: '☁️ 云朵羊羊'
  };
  function getPlayerAvatarName(avatar) {
    if (!avatar) return '🍓 草莓团团';
    const D = G.data;
    if (D && D.avatarPresets) {
      for (const p of D.avatarPresets) {
        if (p.hair === avatar.hair && (p.dress === avatar.dress || (!p.dress && !avatar.dress && p.top === avatar.top && p.bottom === avatar.bottom))) {
          return PRESET_NAMES[p.id] || p.name || '我的专属形象';
        }
      }
    }
    return '✨ 我的今日装扮';
  }

  function renderAvatarHead(canvas, avatar) {
    if (!canvas || !avatar) return;
    const ctx = canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = 60, h = 60;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (G.draw?.avatar) {
      G.draw.avatar(ctx, avatar, w / 2, h + 16, 0.46, { still: true, facing: 1 });
    } else if (G.render?.drawAvatar) {
      G.render.drawAvatar(canvas, avatar, { width: w, height: h, facing: 1 });
    }
  }

  function refreshPlayerAvatar() {
    if (!G.state?.avatar) return;
    const avatar = G.sys.avatar?.current ? G.sys.avatar.current() : G.state.avatar;
    const key = G.data?.avatarFingerprint ? G.data.avatarFingerprint(avatar) : JSON.stringify(avatar);
    if (key === avatarKey) return;
    avatarKey = key;

    const avatarName = getPlayerAvatarName(avatar);
    const hudBadgeName = $('hud-avatar-name');
    if (hudBadgeName) hudBadgeName.textContent = avatarName;

    const homeAvatarName = $('home-my-avatar-name');
    if (homeAvatarName) homeAvatarName.textContent = avatarName;

    const hudCanvas = $('hud-avatar-canvas');
    if (hudCanvas) {
      requestAnimationFrame(() => renderAvatarHead(hudCanvas, avatar));
    }

    const homeCanvas = $('home-my-avatar-canvas');
    if (homeCanvas && G.render?.drawAvatar) {
      requestAnimationFrame(() => G.render.drawAvatar(homeCanvas, avatar, { width: 108, height: 128, facing: 1 }));
    }
  }

  function refresh() {
    if (!G.state) return;
    refreshPlayerAvatar();
    if (!$('home-wishes')) return;
    const quests = G.sys.quests.list().filter(q => !q.locked && !q.claimed).slice(0, 3);
    const key = JSON.stringify(quests.map(q => [q.id, q.title || q.name, q.progress, q.target, q.done]));
    if (key !== wishesKey) {
      wishesKey = key; $('home-wishes').replaceChildren();
      quests.forEach(q => {
        const row = document.createElement('button'); row.type = 'button'; row.className = 'home-wish';
        row.append(icon(q.done ? 'gift' : q.type === 'daily' ? 'leaf' : 'star'));
        const copy = document.createElement('span'), title = document.createElement('strong'), detail = document.createElement('small');
        title.textContent = q.title || q.name || '小屋心愿';
        detail.textContent = q.done ? '已经完成 · 去成长册收下心意' : (q.description || '打开成长册，看看下一小步');
        copy.append(title, detail); row.append(copy); row.addEventListener('click', () => { if (ui.questBook && ui.questBook.focus) ui.questBook.focus(q); ui.open('quests'); });
        $('home-wishes').append(row);
      });
      if (!quests.length) { const p = document.createElement('p'); p.className = 'ui-muted'; p.textContent = '今天也可以按自己的节奏，照顾小屋和朋友。'; $('home-wishes').append(p); }
    }
    const people = G.data.residents.filter(def => G.state.residents[def.id] && G.state.residents[def.id].movedIn);
    const pKey = people.map(def => def.id).join(',');
    if (pKey !== peopleKey || !$('home-residents').children.length) {
      peopleKey = pKey; $('home-residents').replaceChildren();
      const portraits = document.createElement('div'); portraits.className = 'home-portraits'; portraits.setAttribute('aria-hidden', 'true');
      people.slice(0, 4).forEach(def => { const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 80; portraits.append(canvas); requestAnimationFrame(() => G.render.drawCharacter && G.render.drawCharacter(canvas, def.id)); });
      const copy = document.createElement('p'); copy.textContent = people.length ? people.length + ' 位朋友住在小屋里' : '第一位朋友，正等着你邀请。';
      const open = document.createElement('button'); open.type = 'button'; open.className = 'home-resident-link'; open.append(portraits, copy); open.addEventListener('click', () => ui.open('residents')); $('home-residents').append(open);
    }
    const muted = G.state.settings.music <= 0 && G.state.settings.sfx <= 0;
    $('sound-toggle').replaceChildren(icon(muted ? 'mute' : 'volume'));
  }
  function init() {
    if (initialized) return; initialized = true;
    document.querySelectorAll('[data-icon]').forEach(node => node.prepend(icon(node.dataset.icon)));
    [['zoom-in', 'plus'], ['zoom-out', 'minus'], ['zoom-fit', 'focus'], ['zoom-yard', 'leaf'], ['zoom-sea', 'cloud'], ['settings-button', 'settings']].forEach(([id, name]) => $(id).replaceChildren(icon(name)));
    document.querySelector('.currency.coin .currency-icon').replaceChildren(icon('candy'));
    document.querySelector('.currency.heart .currency-icon').replaceChildren(icon('heart'));
    document.querySelectorAll('[data-shell-action]').forEach(node => node.addEventListener('click', () => action(node.dataset.shellAction)));
    const playerBadge = $('player-avatar-badge');
    if (playerBadge) playerBadge.addEventListener('click', () => ui.open('avatar'));
    const homeQuickPick = $('home-avatar-quick-pick');
    if (homeQuickPick) homeQuickPick.addEventListener('click', () => G.ui.avatar?.pickPreset?.());
    const zoomPlayer = $('zoom-player');
    if (zoomPlayer) zoomPlayer.addEventListener('click', () => {
      if (G.render?.camera?.focusPlayer) {
        G.render.camera.focusPlayer();
      } else {
        G.render?.camera?.fit?.();
      }
      ui.toast('✨ 今天的我超可爱！点击可换装细看');
    });
    G.bus?.on?.('avatar:changed', () => { avatarKey = ''; refreshPlayerAvatar(); });
    G.bus?.on?.('state:replace', () => { avatarKey = ''; refreshPlayerAvatar(); });
    window.addEventListener('resize', scheduleLayout);
    if (window.ResizeObserver) { const observer = new ResizeObserver(scheduleLayout); ['world', 'panel', 'home-paper', 'hud'].forEach(id => $(id) && observer.observe($(id))); }
    observeVisibility();
    sync(null); refresh();
  }
  ui.visualShell = { init, sync, refresh, refreshPlayerAvatar, icon, action, getLayoutState, sceneViewport, publishLayout, scheduleLayout };
  ui.getLayoutState = getLayoutState;
  ui.sceneViewport = sceneViewport;
})(window.Game);
