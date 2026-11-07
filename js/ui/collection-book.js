/* 收藏图鉴：真实目录与历史发现来自系统；筛选、焦点和失效令牌只留运行态。 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {};
  const defaults = () => ({ kind: 'furniture', status: 'all', query: '', theme: 'all', category: 'all', page: 1, filtersOpen: false, badgesOpen: false, feedback: null });
  const view = G.runtime.collectionBookV2 = defaults(), pending = new Set();
  let epoch = 0, activeRoot = null, detail = null;
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const key = (node, value) => { node.dataset.uiFocus = 'collection-' + value; return node; };
  const button = (text, action, cls, focusKey, valid) => {
    const node = key(el('button', cls || 'ui-button', text), focusKey); node.type = 'button';
    node.addEventListener('click', () => { if (node.disabled || !node.isConnected || !valid()) return; node.focus({ preventScroll: true }); action(); }); return node;
  };
  const number = value => Number(value || 0).toLocaleString('zh-CN');
  function restore(root, focusKey, fallback) {
    const next = focusKey && root.querySelector('[data-ui-focus="' + focusKey + '"]');
    (next && !next.disabled ? next : fallback)?.focus({ preventScroll: true });
  }
  function previewLook(item) {
    const source = G.state.avatar, look = Object.assign({}, source, { acc: (source.acc || []).slice() });
    if (item.category === 'dress') { look.dress = item.id; look.top = look.bottom = null; }
    else if (item.category === 'top' || item.category === 'bottom') { look.dress = null; look.top = look.top || G.data.avatarConfig.defaultTop; look.bottom = look.bottom || G.data.avatarConfig.defaultBottom; look[item.category] = item.id; }
    else if (item.category === 'acc') { look.acc = look.acc.filter(id => G.data.outfitById[id]?.slot !== item.slot); look.acc.push(item.id); }
    else look.shoes = item.id;
    return look;
  }
  function draw(canvas, item) {
    if (item.kind === 'furniture') G.render.drawThumbnail(canvas, item.id);
    else if (item.kind === 'residents') G.render.drawCharacter(canvas, item.id);
    else if (item.kind === 'outfits') G.render.drawAvatar(canvas, previewLook(item.definition), { facing: 1 });
    else {
      const rect = canvas.getBoundingClientRect(), width = rect.width || 120, height = rect.height || 100, ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
      ui.garden.drawCrop(ctx, item.id, 3, width / 2, height * .83, Math.min(width * .95, height * 1.04));
    }
  }
  function schedule(pictures, valid) {
    requestAnimationFrame(() => { if (!valid()) return; pictures.forEach(({ canvas, item }) => { if (canvas.isConnected) draw(canvas, item); }); });
  }
  function art(item, large) {
    const canvas = el('canvas', 'collection-art' + (item.collected ? '' : ' is-undiscovered') + (large ? ' is-large' : ''));
    canvas.width = 180; canvas.height = 160; canvas.setAttribute('aria-hidden', 'true'); return canvas;
  }
  function navigate(action, api) {
    if (action.panel === 'avatar' && G.runtime.avatarUI) G.runtime.avatarUI.tab = 'clothes';
    if (action.panel === 'calendar') return ui.calendar.open(action.eventId);
    if (api.navigate) return api.navigate(action);
    return ui.open(action.panel, action);
  }
  function openDetail(kind, id, api) {
    api = api || {};
    const item = G.sys.collectionBook.get(kind, id); if (!item) return;
    detail?.close();
    const token = epoch, body = el('div', 'collection-detail'), illustration = art(item, true), copy = el('div', 'collection-detail-copy');
    let closed = false, handle;
    const valid = () => token === epoch && !closed && body.isConnected;
    copy.append(el('p', 'collection-detail-status' + (item.collected ? ' is-collected' : ''), item.collected ? '已经点亮 · 发现会一直保留' : '等待发现 · 名字留给相遇那天'));
    if (item.collected) {
      const text = kind === 'residents' ? item.definition.intro : kind === 'crops' ? item.definition.description : kind === 'furniture' ? (G.data.themes[item.theme]?.name || '') + ' · ' + item.categoryName : item.categoryName + ' · 衣橱里的一份小心意';
      copy.append(el('p', 'collection-description', text));
    }
    const facts = el('dl', 'collection-facts');
    const fact = (label, value) => facts.append(el('dt', '', label), el('dd', '', value));
    fact('历史发现', item.collected ? '已发现' : '尚未发现');
    fact('获取来源', item.source); fact('开放等级', 'Lv.' + item.level + (item.locked ? ' · 小屋现在 Lv.' + G.state.level : ' · 已开放'));
    fact(kind === 'residents' ? '当前入住' : kind === 'crops' ? '当前收获篮' : kind === 'outfits' ? '当前衣橱' : '当前拥有', number(item.count) + (kind === 'residents' ? ' 位' : kind === 'crops' ? ' 份' : ' 件'));
    copy.append(facts, el('h3', '', '获取线索'), el('p', 'collection-clue', item.hint));
    if (item.collected && !item.count) copy.append(el('p', 'collection-history-note', '现在用完或送出了，曾经发现的这一页依然亮着。'));
    const feedback = el('p', 'collection-detail-feedback'); feedback.setAttribute('role', 'status');
    const go = button(item.actionLabel, () => {
      // 点击时重读来源，保留系统action的所有字段，不在图鉴发放任何资源。
      const current = G.sys.collectionBook.get(kind, id); if (!current) return;
      handle.close(); navigate(current.action, api);
    }, 'ui-button collection-primary', 'detail-go', valid);
    copy.append(go, feedback); body.append(illustration, copy);
    if (kind === 'furniture') ui.furnitureRarity?.decorate(body, item.definition, { preview: illustration, discovered: item.collected });
    handle = ui.modal({ title: item.collected ? item.name : '？？？ · 获取线索', content: body, onClose() {
      closed = true; if (detail === handle) detail = null;
      // 自动刷新可能已更换原卡片；关闭后仍回到同一条目的入口。
      if (token === epoch && activeRoot?.isConnected) restore(activeRoot, 'collection-entry-' + kind + '-' + id);
    } });
    handle.element?.classList.add('collection-detail-modal'); detail = handle;
    schedule([{ canvas: illustration, item }], valid); return handle;
  }
  function panel(options) {
    const api = options || {}, sys = G.sys.collectionBook, body = el('div', 'ui-stack collection-book'), token = epoch;
    activeRoot = body;
    const valid = () => token === epoch && activeRoot === body && body.isConnected;
    const makeButton = (text, action, cls, name) => button(text, action, cls, name, valid);
    function render(focusKey) {
      body.replaceChildren();
      const summary = sys.summary();
      if (!summary.some(kind => kind.id === view.kind)) view.kind = summary[0]?.id || 'furniture';
      const tabs = el('div', 'collection-kind-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', '收藏图鉴分类与发现进度');
      summary.forEach(kind => {
        const tab = makeButton('', () => { view.kind = kind.id; view.theme = view.category = 'all'; view.page = 1; view.query = ''; view.feedback = null; render('collection-kind-' + kind.id); }, 'collection-kind' + (view.kind === kind.id ? ' is-active' : ''), 'kind-' + kind.id);
        tab.dataset.collectionKind = kind.id; tab.setAttribute('aria-pressed', String(view.kind === kind.id)); tab.setAttribute('aria-label', kind.name + '，已发现 ' + kind.done + ' / ' + kind.total + '，完成 ' + kind.percent + '%');
        tab.append(el('strong', '', kind.name), el('span', 'collection-kind-count', number(kind.total))); tabs.append(tab);
      });
      body.append(tabs);
      const activeKind = summary.find(kind => kind.id === view.kind), overview = el('div', 'collection-overview'), overviewCopy = el('div');
      const discovered = el('strong', 'collection-overview-count', number(activeKind?.done));
      discovered.append(el('span', '', ' / ' + number(activeKind?.total)));
      overviewCopy.append(discovered, el('small', '', (activeKind?.name || '') + ' · 已发现的心意'));
      const bookMark = el('span', 'collection-book-mark'); bookMark.setAttribute('aria-hidden', 'true'); bookMark.append(el('i'), el('i')); overview.append(overviewCopy, bookMark); body.append(overview);
      const search = key(el('input', 'ui-input collection-search'), 'search');
      search.type = 'search'; search.value = view.query; search.maxLength = 80; search.placeholder = '搜索已发现名称、主题或获取线索'; search.setAttribute('aria-label', '搜索已知名字、主题或获取线索'); body.append(search);
      const filters = el('details', 'collection-filter-box'), filterHeading = key(el('summary'), 'filters'), filterSummary = el('span', 'collection-filter-summary'), toolbar = el('div', 'collection-toolbar');
      if (['collection-status', 'collection-theme', 'collection-category'].includes(focusKey)) view.filtersOpen = true;
      filters.open = view.filtersOpen; filterHeading.append(el('strong', '', '筛选收藏'), filterSummary); filters.append(filterHeading, toolbar);
      filters.addEventListener('toggle', () => { if (valid() && filters.isConnected) view.filtersOpen = filters.open; });
      function select(items, value, name, label) {
        const control = key(ui.controls.select(items, value, value => { if (!valid() || !control.isConnected) return; view[name] = value; view.page = 1; renderResults(); }), name);
        control.setAttribute('aria-label', label); toolbar.append(ui.controls.label(control, label));
      }
      select([{ id: 'all', name: '全部小发现' }, { id: 'collected', name: '已经点亮' }, { id: 'missing', name: '等待发现' }], view.status, 'status', '发现状态');
      if (view.kind === 'furniture') {
        select([{ id: 'all', name: '所有主题' }].concat(sys.themes().map(theme => ({ id: theme.id, name: theme.name }))), view.theme, 'theme', '家具主题');
        select([{ id: 'all', name: '所有家具类别' }].concat([...new Set(G.data.furniture.map(def => def.category))].map(id => ({ id, name: sys.categoryNames[id] || id }))), view.category, 'category', '家具类别');
      }
      body.append(filters);
      const heading = el('div', 'collection-results-heading'), count = key(el('p', 'collection-result-count'), 'results'), results = el('div', 'collection-grid'), pagination = el('nav', 'collection-pagination');
      count.tabIndex = -1; count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite'); results.setAttribute('aria-label', '收藏条目'); pagination.setAttribute('aria-label', '收藏图鉴翻页');
      const clear = makeButton('重置筛选', () => { view.status = view.theme = view.category = 'all'; view.query = ''; view.page = 1; render('collection-search'); }, 'ui-button collection-reset', 'reset');
      filters.append(clear); heading.append(count); body.append(heading, results, pagination);
      search.addEventListener('input', () => { if (!valid() || !search.isConnected) return; view.query = search.value; view.page = 1; renderResults(); });
      function renderResults(pageFocus) {
        const page = sys.list(view); view.page = page.page; results.replaceChildren(); pagination.replaceChildren();
        const kind = summary.find(entry => entry.id === view.kind);
        count.textContent = (kind?.name || '') + ' · 找到 ' + number(page.total) + ' 份' + (page.total ? ' · 每页 ' + page.pageSize + ' 份' : '');
        clear.hidden = !view.query && view.status === 'all' && view.theme === 'all' && view.category === 'all';
        const labels = [];
        if (view.status !== 'all') labels.push(view.status === 'collected' ? '已点亮' : '待发现');
        if (view.kind === 'furniture' && view.theme !== 'all') labels.push(sys.themes().find(theme => theme.id === view.theme)?.name || '指定主题');
        if (view.kind === 'furniture' && view.category !== 'all') labels.push(sys.categoryNames[view.category] || view.category);
        filterSummary.textContent = (labels.join(' · ') || '全部状态与类别') + ' · ' + number(page.total) + '项';
        if (!page.items.length) {
          const empty = el('div', 'collection-empty'); empty.append(el('strong', '', view.status === 'missing' && !view.query && view.theme === 'all' && view.category === 'all' ? '这一册的心意都点亮啦！' : '暂时没有符合条件的小发现'), el('p', '', '清空搜索与筛选，再翻翻这本小册子。'), makeButton('清空搜索与筛选', () => { view.status = view.theme = view.category = 'all'; view.query = ''; view.page = 1; render('collection-search'); }, 'ui-button collection-secondary', 'empty-clear')); results.append(empty);
        }
        const pictures = [];
        page.items.forEach((item, index) => {
          const card = makeButton('', () => openDetail(item.kind, item.id, api), 'collection-entry' + (item.collected ? ' is-collected' : ' is-missing'), 'entry-' + item.kind + '-' + item.id);
          card.setAttribute('aria-label', item.collected ? item.name + '，已发现，当前 ' + number(item.count) + '，查看详情' : '等待发现的' + (kind?.name || '条目') + '，第 ' + ((page.page - 1) * page.pageSize + index + 1) + ' 份，查看获取线索');
          const canvas = art(item); card.append(canvas, el('strong', 'collection-entry-name', item.name), el('span', 'collection-entry-state', item.collected ? '已点亮 · 当前 ' + number(item.count) : item.locked ? 'Lv.' + item.level + ' · 获取线索' : '等待发现 · 获取线索'));
          if (item.kind === 'furniture') ui.furnitureRarity?.decorate(card, item.definition, { preview: canvas, discovered: item.collected });
          results.append(card); pictures.push({ canvas, item });
        });
        if (page.total) {
          const turn = delta => { view.page += delta; renderResults('collection-page-' + (delta < 0 ? 'previous' : 'next')); };
          const previous = makeButton('← 上一页', () => turn(-1), 'ui-button collection-secondary', 'page-previous'), next = makeButton('下一页 →', () => turn(1), 'ui-button collection-secondary', 'page-next');
          previous.disabled = page.page === 1; next.disabled = page.page === page.pages;
          const pageNumber = key(el('span', 'collection-page-number', page.page + ' / ' + page.pages + ' 页'), 'page-number'); pageNumber.tabIndex = -1;
          pagination.append(previous, pageNumber, next); if (pageFocus) restore(pagination, pageFocus, pageNumber);
        } else if (pageFocus) count.focus({ preventScroll: true });
        schedule(pictures, valid);
      }
      renderResults();
      body.append(el('p', 'collection-footnote', '灰色剪影等待相遇；曾经发现的心意，用完或送出后也会一直点亮。'));
      if (view.kind === 'furniture') {
        const badges = el('details', 'collection-badges'); badges.open = view.badgesOpen;
        badges.addEventListener('toggle', () => { if (valid() && badges.isConnected) view.badgesOpen = badges.open; });
        const themes = sys.themes(), ready = themes.filter(theme => theme.complete && !theme.claimed).length;
        const summaryNode = key(el('summary', '', '主题套装徽章 · ' + themes.filter(theme => theme.claimed).length + ' / ' + themes.length + (ready ? ' · ' + ready + ' 份待领取' : '')), 'badges'); badges.append(summaryNode);
        badges.append(el('p', 'collection-badge-intro', '每套集齐 38 件常规家具，手动领取 500 糖果、徽章记录与一段回忆。庭院、节日、特别礼物和加工成品不计入套装。'));
        const feedback = el('p', 'collection-feedback' + (view.feedback?.ok === false ? ' is-error' : '')); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite'); feedback.textContent = view.feedback?.message || ''; feedback.hidden = !view.feedback; badges.append(feedback);
        themes.forEach(theme => {
          const row = key(el('div', 'collection-theme-row' + (theme.claimed ? ' is-claimed' : theme.complete ? ' is-ready' : '')), 'theme-row-' + theme.id); row.tabIndex = -1;
          const medal = el('span', 'collection-theme-medal', theme.claimed ? '✓' : theme.complete ? '✧' : '·'); medal.setAttribute('aria-hidden', 'true');
          const text = el('div', 'collection-theme-copy'); text.append(el('strong', '', theme.name), el('span', '', theme.done + ' / ' + theme.total + ' · ' + theme.percent + '%'), el('small', '', theme.claimed ? '徽章已记录 · 500糖果已领取' : theme.complete ? '已集齐 · 500糖果与徽章待领取' : '等待集齐 · 奖励500糖果与徽章'));
          let action;
          if (theme.complete || theme.claimed) {
            action = makeButton(theme.claimed ? '已经收好' : '领取徽章与糖果', () => {
              if (pending.has(theme.id)) return;
              pending.add(theme.id); action.disabled = true;
              let result;
              try { result = sys.claimTheme(theme.id); } catch (_) { result = { ok: false, message: '这份礼物暂时没有领好，请稍后重试。' }; }
              pending.delete(theme.id); if (!valid()) return;
              view.feedback = result || { ok: false, message: '这次未能领取，请重试。' }; view.badgesOpen = true;
              render(view.feedback.ok ? 'collection-theme-row-' + theme.id : 'collection-theme-' + theme.id);
              // 共享doAction可能同步重挂面板，稳定焦点键与运行态反馈会跟随新面板。
              try { if (api.doAction) api.doAction(view.feedback); else ui.toast(view.feedback.message); } catch (_) { /* 图鉴内反馈仍然可见。 */ }
            }, 'ui-button ' + (theme.claimed ? 'collection-secondary' : 'collection-primary'), 'theme-' + theme.id);
            action.disabled = theme.claimed || pending.has(theme.id);
          } else action = makeButton('找找缺少的', () => { view.theme = theme.id; view.status = 'missing'; view.query = ''; view.category = 'all'; view.page = 1; render('collection-theme'); }, 'ui-button collection-secondary', 'theme-' + theme.id);
          row.append(medal, text, action); badges.append(row);
        });
        body.append(badges);
      }
      if (focusKey) restore(body, focusKey, count);
    }
    render(); return { title: '我的收藏图鉴', subtitle: '把相遇过的小美好，一页一页珍藏', content: body };
  }
  function focus(options) {
    const opts = options || {}, kinds = G.sys.collectionBook.summary().map(kind => kind.id);
    if (kinds.includes(opts.kind)) view.kind = opts.kind;
    if (['all', 'collected', 'missing', 'owned', 'unowned'].includes(opts.status)) view.status = opts.status;
    ['query', 'theme', 'category'].forEach(name => { if (typeof opts[name] === 'string') view[name] = name === 'query' ? opts[name].slice(0, 80) : opts[name]; });
    if (view.status === 'owned') view.status = 'collected'; if (view.status === 'unowned') view.status = 'missing';
    if (!['all', ...G.sys.collectionBook.themes().map(theme => theme.id)].includes(view.theme)) view.theme = 'all';
    if (!['all', ...G.data.furniture.map(def => def.category)].includes(view.category)) view.category = 'all';
    if (view.kind !== 'furniture') view.theme = view.category = 'all';
    view.page = 1;
    if (view.status !== 'all' || view.theme !== 'all' || view.category !== 'all') view.filtersOpen = true;
  }
  G.bus.on('state:replace', () => { epoch++; activeRoot = null; pending.clear(); Object.assign(view, defaults()); detail?.close(); detail = null; });
  ui.collectionBook = { panel, openDetail, focus };
})(window.Game);
