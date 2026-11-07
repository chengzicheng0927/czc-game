/* 原蛋仔衣橱布局与互动保持，舞台通过共享Babylon绘制；付费服饰走真实购买规则。 */
(function (G) {
  'use strict';
  G.ui = G.ui || {};

  const TAU = Math.PI * 2;

  // 8 大圆滚滚可爱卡通蛋仔预设
  const PRESETS = [
    {
      id: 'preset_sunny', name: '🍓 草莓团团',
      hairColor: '#D998AE', bodyColor: '#FF9EBB', faceColor: '#FFF6F0', blush: '#FF6B92',
      ears: 'twin_tails', face: 'smile',
      outfitKey: 'dress_pink', shoesKey: 'shoes_mary', accKeys: ['bow_red']
    },
    {
      id: 'preset_pony', name: '🍋 奶黄布丁',
      hairColor: '#D8B77A', bodyColor: '#FFE169', faceColor: '#FFF7EC', blush: '#FF85A1',
      ears: 'ponytail', face: 'cheer',
      outfitKey: 'set_cloud', shoesKey: 'shoes_sneaker', accKeys: ['acc_star']
    },
    {
      id: 'preset_bun', name: '🐰 蜜桃兔兔',
      hairColor: '#E5C4B1', bodyColor: '#FFC2D1', faceColor: '#FFF8F4', blush: '#FF759F',
      ears: 'buns', face: 'calm',
      outfitKey: 'dress_cloud', shoesKey: 'shoes_ballet', accKeys: ['acc_flower']
    },
    {
      id: 'preset_curl', name: '🧸 奶咖小熊',
      hairColor: '#B77D50', bodyColor: '#E6CCB2', faceColor: '#FFF7F0', blush: '#FF8FA3',
      ears: 'curls', face: 'wink',
      outfitKey: 'set_overalls', shoesKey: 'shoes_boots', accKeys: ['bow_red', 'acc_teddy']
    },
    {
      id: 'preset_braid', name: '🫐 香芋星宝',
      hairColor: '#B497CC', bodyColor: '#CDB4DB', faceColor: '#FFF7F5', blush: '#FF85A1',
      ears: 'princess_braid', face: 'shy',
      outfitKey: 'dress_lavender', shoesKey: 'shoes_mary', accKeys: ['acc_crown', 'acc_wings']
    },
    {
      id: 'preset_bob', name: '🍵 薄荷喵喵',
      hairColor: '#8EBBA8', bodyColor: '#A8E6CF', faceColor: '#FFF8F2', blush: '#FF8FA3',
      ears: 'bob', face: 'surprise',
      outfitKey: 'dress_blue', shoesKey: 'shoes_fluffy', accKeys: ['acc_beret']
    },
    {
      id: 'preset_short', name: '🍊 蜜柑柴柴',
      hairColor: '#C77362', bodyColor: '#FFBE98', faceColor: '#FFF8F0', blush: '#FF7597',
      ears: 'short', face: 'smile',
      outfitKey: 'dress_rain', shoesKey: 'shoes_rain', accKeys: ['acc_flower']
    },
    {
      id: 'preset_taro', name: '☁️ 云朵羊羊',
      hairColor: '#859DC6', bodyColor: '#A2D2FF', faceColor: '#FFF9F5', blush: '#FF8FA3',
      ears: 'side_swept', face: 'cheer',
      outfitKey: 'dress_pink', shoesKey: 'shoes_fluffy', accKeys: ['acc_heartglasses', 'acc_bag']
    }
  ];

  // 萌物换装槽位数据定义
  const EAR_STYLES = [
    { id: 'twin_tails', name: '🍓 双团呆毛' },
    { id: 'ponytail', name: '🍮 Q弹布丁揪' },
    { id: 'buns', name: '🐰 长垂耳兔' },
    { id: 'curls', name: '🧸 圆圆小熊耳' },
    { id: 'princess_braid', name: '🌙 星月软角' },
    { id: 'bob', name: '🐱 软萌猫咪耳' },
    { id: 'short', name: '🐶 元气柴柴耳' },
    { id: 'side_swept', name: '☁️ 蓬蓬云朵耳' }
  ];

  // 糖果机身颜色：使用合法的发色ID与马卡龙高饱和展示色映射
  const BODY_COLORS = [
    { id: '#D998AE', hex: '#FF9EBB', name: '草莓粉' },
    { id: '#D8B77A', hex: '#FFE169', name: '布丁黄' },
    { id: '#E5C4B1', hex: '#FFC2D1', name: '水蜜桃' },
    { id: '#B497CC', hex: '#CDB4DB', name: '香芋紫' },
    { id: '#8EBBA8', hex: '#A8E6CF', name: '薄荷绿' },
    { id: '#859DC6', hex: '#A2D2FF', name: '云朵蓝' },
    { id: '#C77362', hex: '#FFBE98', name: '蜜柑橘' },
    { id: '#B77D50', hex: '#E6CCB2', name: '奶咖杏' }
  ];

  const COLOR_MAP = {
    '#D998AE': '#FF9EBB',
    '#D8B77A': '#FFE169',
    '#E5C4B1': '#FFC2D1',
    '#B497CC': '#CDB4DB',
    '#8EBBA8': '#A8E6CF',
    '#859DC6': '#A2D2FF',
    '#C77362': '#FFBE98',
    '#B77D50': '#E6CCB2',
    '#8B5A3C': '#E6CCB2',
    '#3D3545': '#CDB4DB',
    '#F2D8A6': '#FFE169',
    '#BDB9CE': '#A2D2FF'
  };

  const OUTFITS = {
    none: { id: 'none', name: '🥚 原味奶油肚皮', type: 'belly', col: '#FFFFFF', trim: '#FF4D79' },
    dress_pink: { id: 'dress_pink', name: '🍓 草莓蕾丝裙圈', type: 'tutu', col: '#FF6B96', trim: '#FFF5E8', motif: 'bow' },
    dress_cloud: { id: 'dress_cloud', name: '☁️ 云朵蓬蓬裙圈', type: 'tutu', col: '#BDE0FE', trim: '#FFFFFF', motif: 'cloud' },
    dress_lavender: { id: 'dress_lavender', name: '🪻 星河花瓣裙圈', type: 'tutu', col: '#B892FF', trim: '#FFF0F6', motif: 'star' },
    dress_blue: { id: 'dress_blue', name: '⚓ 海盐水手领巾', type: 'sailor', col: '#72EFDD', trim: '#FFFDF7', motif: 'sailor' },
    dress_rain: { id: 'dress_rain', name: '🍋 波点小斗篷', type: 'cape', col: '#FFD166', trim: '#FFFFFF', motif: 'flower' },
    set_overalls: { id: 'bottom_pants', name: '👖 小熊背带裤兜', type: 'overalls', col: '#95D5B2', trim: '#FFE169', motif: 'bear' },
    set_cloud: { id: 'top_cloud', name: '👕 云朵贴花小围兜', type: 'bib', col: '#FFFDF7', trim: '#90E0EF', motif: 'cloud' }
  };

  const SHOES = {
    shoes_mary: { id: 'shoes_mary', name: '👠 草莓小皮鞋', col: '#FF5D8F', sole: '#FFFFFF' },
    shoes_sneaker: { id: 'shoes_sneaker', name: '👟 活力橘脚丫', col: '#FF9F1C', sole: '#FFFFFF' },
    shoes_ballet: { id: 'shoes_ballet', name: '🩰 蜜桃粉脚丫', col: '#FF85A1', sole: '#FFF0F5' },
    shoes_boots: { id: 'shoes_boots', name: '🥾 奶茶小短靴', col: '#B08968', sole: '#FFF8F0' },
    shoes_rain: { id: 'shoes_rain', name: '👢 柠檬黄雨靴', col: '#FFD166', sole: '#FFFFFF' },
    shoes_fluffy: { id: 'shoes_fluffy', name: '🐾 奶油白团脚', col: '#FFFFFF', sole: '#FFC2D1' }
  };

  const ACCESSORIES = [
    { id: 'bow_red', name: '🎀 草莓蝴蝶结', slot: 'head' },
    { id: 'acc_crown', name: '👑 迷你金皇冠', slot: 'head' },
    { id: 'acc_beret', name: '🎨 甜心贝雷帽', slot: 'head' },
    { id: 'acc_flower', name: '🌼 奶油小雏菊', slot: 'head' },
    { id: 'acc_star', name: '⭐ 双星小发卡', slot: 'head' },
    { id: 'acc_heartglasses', name: '🕶️ 粉色爱心镜', slot: 'face' },
    { id: 'acc_wings', name: '🪽 扑腾小翅膀', slot: 'back' },
    { id: 'acc_bag', name: '🍓 草莓斜挎包', slot: 'bag' },
    { id: 'acc_teddy', name: '🧸 小熊斜挎包', slot: 'bag' }
  ];

  // 辅助 DOM 工具
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const button = (text, action, className) => {
    const node = el('button', className || 'ui-button', text);
    node.type = 'button';
    if (action) node.addEventListener('click', action);
    return node;
  };

  let activePanelLifecycle = null;

  // 挑选预设初始形象弹窗（首次启动或衣橱重挑）
  function pickPreset(options) {
    options = options || {};
    const sys = G.sys.avatar, D = G.data;
    let selected = options.initial && D.avatarPresetById[options.initial] ? options.initial : sys.randomPresetId(), done = false;
    const body = el('div', 'ui-stack preset-picker character-visual');
    const grid = el('div', 'preset-grid');
    const cards = [];
    const summary = el('p', 'preset-summary');
    summary.setAttribute('role', 'status');
    summary.setAttribute('aria-live', 'polite');

    const isFirstOrLogin = !!(options.first || options.fromLogin);
    const introText = options.fromLogin
      ? '欢迎来到棉花糖岛！先挑一个喜欢的小伙伴作为你的专属形象，之后随时能在换装间自由微调搭配！'
      : (options.first
        ? '先挑一个喜欢的小伙伴，之后随时能在衣橱里换装捏脸！'
        : '换上预设会换上一整套可爱的蛋仔形象，已买的衣服都会好好留着。');

    body.append(
      el('p', 'ui-small ui-muted', introText),
      grid,
      summary
    );

    PRESETS.forEach(preset => {
      const card = el('button', 'preset-card');
      const art = el('canvas', 'preset-art');
      const name = el('span', 'preset-name', preset.name);
      const check = el('span', 'preset-check', '✓');
      check.hidden = true;
      card.type = 'button';
      card.dataset.presetId = preset.id;
      const p = D.avatarPresetById?.[preset.id] || preset;
      const hairName = D.avatarHairStyles?.find(h => h.id === (p.hair || preset.ears))?.name || '';
      card.setAttribute('aria-label', (p.name || preset.name) + (hairName ? ' · ' + hairName : ''));
      card.setAttribute('aria-pressed', 'false');
      art.width = 110;
      art.height = 140;
      card.append(check, art, name);
      card.addEventListener('click', () => { selected = preset.id; mark(); });
      grid.append(card);
      cards.push({ card, preset, art, check });
    });

    function mark() {
      cards.forEach(({ card, preset, check }) => {
        const on = preset.id === selected;
        check.hidden = !on;
        card.classList.toggle('is-selected', on);
        card.setAttribute('aria-pressed', String(on));
      });
      const p = D.avatarPresetById?.[selected] || PRESETS.find(p => p.id === selected) || PRESETS[0];
      summary.textContent = '已选「' + (p.name || selected) + '」';
    }

    function finish() {
      if (done) return;
      done = true;
      const result = sys.applyPreset(selected);
      if (result.ok) {
        G.ui.toast(result.message);
        G.ui.audio?.play('success');
        G.ui.refresh?.();
      }
      if (options.onDone) options.onDone();
    }

    const confirmText = isFirstOrLogin ? '就是我啦！' : '换上这个形象';
    const confirm = button(confirmText, () => { finish(); modal.close(); }, 'ui-button ui-button-primary');
    const actions = el('div', 'ui-actions');
    actions.append(confirm);
    if (isFirstOrLogin) {
      const customize = button('去换装间调整', () => {
        finish();
        modal.close();
        if (G.ui && typeof G.ui.open === 'function') G.ui.open('avatar');
      }, 'ui-button ui-button-soft');
      actions.append(customize);
    }
    body.append(actions);
    const modalTitle = options.fromLogin ? '设置你的个人形象' : (options.first ? '挑一个你的样子' : '预设小伙伴');
    const modal = G.ui.modal({ title: modalTitle, content: body, onClose() { finish(); } });
    if (modal.element) modal.element.classList.add('character-picker-modal');
    mark();

    // 绘制预设缩略图
    queueMicrotask(() => cards.forEach(({ art, preset }) => {
      if (art.isConnected) G.render.drawAvatar(art, Object.assign({}, sys.current(), D.avatarPresetLook(preset.id)), { facing: 1 });
    }));

    return modal;
  }

  // 主换装面板
  function panel() {
    activePanelLifecycle?.dispose();

    const sys = G.sys.avatar, D = G.data;
    const body = el('div', 'ui-stack avatar-panel character-visual');

    // 当前换装与交互状态
    let actMode = 'waddle';
    let camAngle = 0.15;
    let camElev = 0.22;
    let dragging = false;
    let lastX = 0, lastY = 0;
    let showAll8 = false;
    let activePresetIdx = 0;
    let stageBridge = null;
    let disposed = false;

    // 1. 顶部预设快速切换栏（8 个蛋仔胶囊 + 全家福切换）
    const presetHeader = el('div', 'avatar-preset-bar-wrap');
    const presetGrid = el('div', 'avatar-preset-pills');
    const viewAllBtn = button('👥 8只全家福 / 单只换装台', () => {
      showAll8 = !showAll8;
      updatePresetPills();
    }, 'ui-button ui-button-soft avatar-all8-btn');

    PRESETS.forEach((p, idx) => {
      const b = button(p.name, async () => {
        if (!await wearVisualPreset(p)) return;
        showAll8 = false; activePresetIdx = idx;
        updatePresetPills(); syncDressUpUI(false);
      }, 'avatar-preset-pill');
      b.dataset.presetIdx = String(idx);
      presetGrid.append(b);
    });

    presetHeader.append(presetGrid, viewAllBtn);
    body.append(presetHeader);

    function updatePresetPills() {
      presetGrid.querySelectorAll('.avatar-preset-pill').forEach((btn, idx) => {
        const on = !showAll8 && idx === activePresetIdx;
        btn.classList.toggle('is-active', on);
      });
      viewAllBtn.classList.toggle('is-active', showAll8);
      stageWrap.classList.toggle('is-all8', showAll8);
      stageBridge?.setGroupMode(showAll8);
    }

    // 2. 3D WebGL 交互展示舞台与上方动作条（彻底避免遮挡蛋仔头部）
    const stageContainer = el('div', 'avatar-stage-container');
    const stageHeader = el('div', 'avatar-stage-header');
    const actGroup = el('div', 'avatar-act-group');

    const actions = [
      { id: 'waddle', label: '🐧 快乐企鹅步' },
      { id: 'wave', label: '👋 扑腾打招呼' },
      { id: 'bounce', label: '🍮 果冻Q弹跳' },
      { id: 'idle', label: '✨ 歪头眨眼' }
    ];

    function setAction(id) {
      actMode = id;
      stageBridge?.setAction(id);
      actions.forEach(a => {
        actButtons[a.id]?.classList.toggle('is-active', a.id === id);
      });
    }

    const actButtons = {};
    actions.forEach(a => {
      const btn = button(a.label, e => {
        e.stopPropagation();
        e.preventDefault();
        setAction(a.id);
      }, 'avatar-act-btn' + (a.id === actMode ? ' is-active' : ''));
      actButtons[a.id] = btn;
      actGroup.append(btn);
    });

    const dragTip = el('span', 'avatar-drag-tip', '拖拽 360° 旋转看小尾巴/小翅膀');
    stageHeader.append(actGroup, dragTip);

    const stageWrap = el('div', 'avatar-stage-wrap');
    stageWrap.style.background = 'radial-gradient(circle at 50% 25%, #fffdf9 0%, #ffe8f2 55%, #f5d4e6 100%)';

    const glCanvas = el('canvas', 'avatar-stage-gl');
    const hudCanvas = el('canvas', 'avatar-stage-hud');
    glCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    hudCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block;';

    stageWrap.append(glCanvas, hudCanvas);
    stageContainer.append(stageHeader, stageWrap);
    body.append(stageContainer);

    // 360° 鼠标/触屏拖拽交互
    stageWrap.addEventListener('pointerdown', e => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      stageWrap.setPointerCapture?.(e.pointerId);
    });
    stageWrap.addEventListener('pointermove', e => {
      if (!dragging) return;
      camAngle -= (e.clientX - lastX) * 0.01;
      camElev = Math.max(0.05, Math.min(0.60, camElev + (e.clientY - lastY) * 0.006));
      lastX = e.clientX;
      lastY = e.clientY;
      stageBridge?.setOrbit(camAngle, camElev);
    });
    stageWrap.addEventListener('pointerup', () => { dragging = false; });
    stageWrap.addEventListener('pointercancel', () => { dragging = false; });

    // 原舞台DOM/CSS保留，共享Babylon绘制原蛋仔几何与原动作。
    if (G.render && typeof G.render.createAvatarStage === 'function') {
      stageBridge = G.render.createAvatarStage(glCanvas, hudCanvas);
      stageBridge.setLook(sys.current());
      stageBridge.setAction(actMode);
      stageBridge.setGroupMode(showAll8);
      stageBridge.setOrbit(camAngle, camElev);
    } else stageWrap.append(el('p', 'ui-notice', '形象舞台暂不可用，请收好面板后重新打开。'));

    async function buyMissing(ids) {
      const missing = Array.from(new Set(ids.filter(id => id && id !== 'none'))).filter(id => !sys.current().owned[id]);
      if (!missing.length) return true;
      const defs = missing.map(id => D.outfitById[id]);
      if (defs.some(item => !item)) { G.ui.toast?.('这件衣服暂时不能购买。'); return false; }
      const blocked = defs.find(item => item.source !== 'shop' || G.state.level < item.unlockLv);
      if (blocked) { G.ui.toast?.('「' + blocked.name + '」还没解锁，可以先在全家福里看看。'); return false; }
      const price = defs.reduce((sum, item) => sum + item.price, 0);
      if (G.state.wallet.coin < price) { G.ui.toast?.('这套搭配还差 ' + (price - G.state.wallet.coin) + ' 颗糖果，已有衣服继续保留。'); return false; }
      if (!await G.ui.confirm('把「' + defs.map(item => item.name).join('、') + '」带回衣橱，需要 ' + price + ' 颗糖果。购买并穿上吗？', { title: '把新衣服带回家', accept: '购买并穿上' })) return false;
      try { for (const id of missing) { const result = sys.buy(id); if (!result.ok) { G.ui.toast?.(result.message); return false; } } return true; }
      catch (error) { G.ui.toast?.(error.message || '这次购买没有保存好，已有进度继续保留。'); return false; }
    }
    async function wearVisualPreset(preset) {
      const outfit = preset.outfitKey === 'set_overalls' ? 'bottom_pants' : preset.outfitKey === 'set_cloud' ? 'top_cloud' : preset.outfitKey;
      const wear = [outfit, preset.shoesKey].concat(preset.accKeys || []).filter(id => id && id !== 'none');
      if (!await buyMissing(wear)) return false;
      try {
        for (const result of [sys.setHair(preset.ears), sys.setHairColor(preset.hairColor || preset.bodyColor), sys.setFace(preset.face)]) if (!result.ok) { G.ui.toast?.(result.message); return false; }
        for (const id of wear) { const result = sys.equip(id); if (!result.ok) { G.ui.toast?.(result.message); return false; } }
        return true;
      } catch (error) { G.ui.toast?.(error.message || '这次换装没有保存，请保留当前进度后重试。'); return false; }
    }

    // 4. 圆滚滚萌物专属换装槽（完全匹配设计原型）
    const dressUpBox = el('div', 'avatar-slots-container');
    const dressUpTitle = el('div', 'avatar-slots-heading');
    dressUpTitle.append(
      el('span', 'avatar-slots-title-text', '🎨 圆滚滚萌物换装槽（点选立即换装）'),
      el('span', 'avatar-current-badge', '🍓 草莓团团')
    );
    dressUpBox.append(dressUpTitle);

    // ① 头顶萌耳/揪揪槽
    const slotEarsWrap = el('div', 'avatar-slot-block');
    slotEarsWrap.append(el('span', 'avatar-slot-title', '① 头顶萌耳 / 揪揪槽 (hair · 8种Q弹头顶造型)'));
    const slotEars = el('div', 'avatar-slot-pills');
    EAR_STYLES.forEach(item => {
      const b = button(item.name, () => {
        sys.setHair(item.id);
        syncDressUpUI();
      }, 'avatar-slot-btn');
      b.dataset.earId = item.id;
      slotEars.append(b);
    });
    slotEarsWrap.append(slotEars);

    // ② 糖果机身颜色
    const slotColorWrap = el('div', 'avatar-slot-block');
    slotColorWrap.append(el('span', 'avatar-slot-title', '② 糖果机身颜色 (hairColor · 全马卡龙粉嫩色)'));
    const slotColor = el('div', 'avatar-color-pills');
    BODY_COLORS.forEach(item => {
      const b = el('button', 'avatar-color-pill');
      b.type = 'button';
      b.style.backgroundColor = item.hex;
      b.title = item.name;
      b.dataset.colId = item.id;
      b.addEventListener('click', () => {
        const res = sys.setHairColor(item.id);
        if (res && res.ok) {
          G.ui.toast?.(item.name + '果冻体色换好啦！');
        }
        syncDressUpUI();
      });
      slotColor.append(b);
    });
    slotColorWrap.append(slotColor);

    // ③ 圆肚肚穿搭槽
    const slotOutfitWrap = el('div', 'avatar-slot-block');
    slotOutfitWrap.append(el('span', 'avatar-slot-title', '③ 圆肚肚穿搭槽 (dress / top+bottom · 套在圆蛋身体上)'));
    const slotOutfit = el('div', 'avatar-slot-pills');
    Object.entries(OUTFITS).forEach(([k, item]) => {
      const b = button(item.name, async () => {
        if (k === 'none') {
          sys.equip(D.avatarConfig.defaultTop);
          sys.equip(D.avatarConfig.defaultBottom);
        } else {
          if (!await buyMissing([item.id])) return;
          const result = sys.equip(item.id); if (!result.ok) { G.ui.toast?.(result.message); return; }
        }
        syncDressUpUI();
      }, 'avatar-slot-btn');
      b.dataset.outfitKey = k;
      slotOutfit.append(b);
    });
    slotOutfitWrap.append(slotOutfit);

    // ④ 小胖脚鞋槽
    const slotShoesWrap = el('div', 'avatar-slot-block');
    slotShoesWrap.append(el('span', 'avatar-slot-title', '④ 小胖脚鞋槽 (shoes · 6款小短脚鞋)'));
    const slotShoes = el('div', 'avatar-slot-pills');
    Object.entries(SHOES).forEach(([k, item]) => {
      const b = button(item.name, async () => {
        if (!await buyMissing([item.id])) return;
        const result = sys.equip(item.id); if (!result.ok) { G.ui.toast?.(result.message); return; }
        syncDressUpUI();
      }, 'avatar-slot-btn');
      b.dataset.shoesKey = k;
      slotShoes.append(b);
    });
    slotShoesWrap.append(slotShoes);

    // ⑤ 配饰叠加槽
    const slotAccWrap = el('div', 'avatar-slot-block');
    slotAccWrap.append(el('span', 'avatar-slot-title', '⑤ 配饰叠加槽 (acc · 头饰/眼镜/小翅膀/斜挎包)'));
    const slotAcc = el('div', 'avatar-slot-pills');
    ACCESSORIES.forEach(item => {
      const b = button(item.name, async () => {
        const cur = sys.current();
        const wearing = (cur.acc || []).includes(item.id);
        if (wearing) {
          sys.removeAccessory(item.id);
        } else {
          if (!await buyMissing([item.id])) return;
          const result = sys.equip(item.id); if (!result.ok) { G.ui.toast?.(result.message); return; }
        }
        syncDressUpUI();
      }, 'avatar-slot-btn');
      b.dataset.accId = item.id;
      slotAcc.append(b);
    });
    slotAccWrap.append(slotAcc);

    dressUpBox.append(slotEarsWrap, slotColorWrap, slotOutfitWrap, slotShoesWrap, slotAccWrap);
    body.append(dressUpBox);

    // 同步高亮选中状态
    function syncDressUpUI(notify = true) {
      const cur = sys.current();
      const curColor = String(cur.hairColor || '').toUpperCase();
      const curEars = cur.hair || 'twin_tails';
      const curAcc = Array.isArray(cur.acc) ? cur.acc : [];

      // 萌耳高亮
      slotEars.querySelectorAll('.avatar-slot-btn').forEach(b => {
        b.classList.toggle('is-active', b.dataset.earId === curEars);
      });

      // 颜色圆点高亮
      slotColor.querySelectorAll('.avatar-color-pill').forEach(b => {
        b.classList.toggle('is-active', b.dataset.colId.toUpperCase() === curColor);
      });

      // 穿搭高亮
      slotOutfit.querySelectorAll('.avatar-slot-btn').forEach(b => {
        const k = b.dataset.outfitKey;
        const active = (k === 'none' && !cur.dress) ||
          (k === 'set_overalls' && cur.bottom === 'bottom_pants') ||
          (k === 'set_cloud' && cur.top === 'top_cloud' && !cur.dress) ||
          (cur.dress === k);
        b.classList.toggle('is-active', Boolean(active));
      });

      // 鞋子高亮
      slotShoes.querySelectorAll('.avatar-slot-btn').forEach(b => {
        b.classList.toggle('is-active', b.dataset.shoesKey === cur.shoes);
      });

      // 配饰高亮
      slotAcc.querySelectorAll('.avatar-slot-btn').forEach(b => {
        b.classList.toggle('is-active', curAcc.includes(b.dataset.accId));
      });

      // 徽标名称
      const p = PRESETS[activePresetIdx] || PRESETS[0];
      dressUpTitle.querySelector('.avatar-current-badge').textContent = showAll8 ? '👥 8只全家福' : p.name;

      stageBridge?.setLook(sys.current());
      // 实时通知主场景刷新主角 3D 模型与颜色（系统层已通知过的操作不再重复）
      if (notify) { G.bus?.emit?.('avatar:changed', {}); G.render?.redraw?.(); }
    }

    // 启动动画循环与同步
    updatePresetPills();
    syncDressUpUI();
    stageBridge?.setLook(sys.current());

    const lifecycle = {
      body,
      dispose() {
        if (disposed) return;
        disposed = true;
        stageBridge?.dispose();
        stageBridge = null;
        G.bus?.emit?.('avatar:changed', {});
        G.render?.redraw?.();
        if (activePanelLifecycle === lifecycle) activePanelLifecycle = null;
      }
    };
    activePanelLifecycle = lifecycle;

    return { title: '我的换装间', subtitle: '今天，想做什么样的自己？', content: body };
  }

  G.bus?.on?.('panel:change', event => {
    if (activePanelLifecycle && (event?.open === false || !activePanelLifecycle.body.isConnected)) {
      activePanelLifecycle.dispose();
    }
  });

  G.bus?.on?.('state:replace', () => activePanelLifecycle?.dispose());

  G.ui.avatar = {
    panel,
    pickPreset,
    hasConfigured: () => (G.sys && G.sys.avatar && typeof G.sys.avatar.hasConfigured === 'function') ? G.sys.avatar.hasConfigured() : true,
    needsPreset: () => G.sys.avatar.needsPreset()
  };
})(window.Game);
