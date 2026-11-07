/* 相册只整理系统已保存的照片；相机与装饰草稿仍由原编辑器管理。 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {};
  let session = null, serial = 0;
  const sys = () => G.sys.photography;
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const live = owner => session === owner && !owner.closed;
  const current = view => live(view.owner) && view.owner.view === view && view.body.isConnected;
  const key = (node, value) => { node.dataset.uiFocus = 'album-v2-' + value; return node; };
  function button(view, text, action, name, style = '') {
    const node = key(el('button', 'ui-button av-button ' + style, text), name); node.type = 'button';
    node.addEventListener('click', event => { if (current(view) && !node.disabled) action(event); }); return node;
  }
  function focusNow(view, name) {
    if (!current(view)) return;
    const target = [...view.body.querySelectorAll('[data-ui-focus]')].find(node => node.dataset.uiFocus === 'album-v2-' + name && !node.disabled && !node.hidden);
    (target || view.handle.element).focus({ preventScroll: true });
  }
  function focus(view, name) { requestAnimationFrame(() => focusNow(view, name)); }
  function report(view, text, failed = false) {
    if (!current(view)) return;
    view.status.textContent = text; view.status.classList.toggle('is-error', failed);
  }
  function close() {
    const owner = session; if (!owner) return;
    owner.closed = true; owner.editor = null; session = null;
    const handle = owner.view?.handle; owner.view = null; handle?.close();
  }
  function modal(owner, title, type) {
    const body = el('div', 'av-book ' + type); body.tabIndex = -1;
    const status = el('p', 'av-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
    const content = el('div', 'av-content'); body.append(content, status);
    const view = { owner, body, content, status, busy: false, id: ++serial };
    // 先转移所有权，旧弹窗的关闭通知就不会取消下一张相册页。
    owner.view = view; owner.editor = null;
    view.handle = ui.modal({ title, content: body, onClose() {
      if (owner.view !== view) return;
      const returnPanel = owner.returnPanel;
      owner.view = null; owner.closed = true; owner.editor = null; if (session === owner) session = null;
      if (returnPanel && ui.open) ui.open(returnPanel);
    } });
    view.handle.element.classList.add('photography-album-v2');
    view.handle.element.classList.add(type === 'av-detail' ? 'av-detail-dialog' : type === 'av-name-form' || type === 'av-confirm' ? 'av-form-dialog' : 'av-album-dialog');
    return view;
  }
  async function read() {
    const [album, trash] = await Promise.all([Promise.resolve().then(() => sys().list()), Promise.resolve().then(() => sys().trash())]);
    if (!Array.isArray(album) || !Array.isArray(trash)) throw new Error('相册内容暂时没有读好。');
    return { album, trash };
  }
  function locate(snapshot, id, tab) { return snapshot[tab].find(photo => photo.id === id); }
  function stamp(photo) {
    const at = new Date(photo.at), node = el('time', 'av-date');
    if (Number.isFinite(at.getTime())) { node.dateTime = at.toISOString(); node.textContent = at.toLocaleString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    else node.textContent = '拍摄时间暂不可用';
    return node;
  }
  function load(view, render, preferredFocus, feedback) {
    let reading = false;
    const retry = button(view, '重新读取', run, 'read-retry'); retry.hidden = true; view.body.append(retry);
    async function run() {
      if (!current(view) || reading) return;
      if (document.activeElement === retry) view.handle.element.focus({ preventScroll: true });
      reading = true; retry.hidden = true; report(view, '正在翻开相册…');
      try {
        const snapshot = await read(); if (!current(view)) return;
        view.content.replaceChildren(); render(snapshot); report(view, feedback || '', !!feedback);
        if (preferredFocus) focus(view, preferredFocus);
      } catch (error) {
        if (current(view)) { report(view, '相册暂时没有读好，请点「重新读取」重试。', true); retry.hidden = false; }
      } finally { reading = false; }
    }
    run();
  }
  // 系统合成缩略图后仍等待浏览器解码；重试及旧图片事件都有各自的票据。
  function picture(view, photo, mount, focusTarget) {
    let attempt = 0;
    const retry = button(view, '重试相片', run, 'image-retry-' + photo.id, 'av-image-retry'); retry.hidden = true;
    function run() {
      if (!current(view)) return;
      if (document.activeElement === retry) focusNow(view, focusTarget);
      const ticket = ++attempt, image = el('img', 'av-image'), status = el('span', 'av-image-status', '正在展开相片…');
      image.alt = photo.name; image.hidden = true; image.decoding = 'async';
      status.setAttribute('role', 'status'); mount.setAttribute('aria-busy', 'true'); mount.replaceChildren(image, status); retry.hidden = true;
      const valid = () => current(view) && ticket === attempt && image.isConnected;
      const failed = message => {
        if (!valid()) return;
        image.hidden = true; status.textContent = message || '相片没有展开，请重试。'; mount.setAttribute('aria-busy', 'false'); retry.hidden = false;
      };
      image.addEventListener('load', () => {
        if (!valid()) return;
        image.hidden = false; status.textContent = ''; mount.setAttribute('aria-busy', 'false');
        if (document.activeElement === retry) focusNow(view, focusTarget);
        retry.hidden = true;
      });
      image.addEventListener('error', () => failed('相片没有展开，请重试。'));
      Promise.resolve().then(() => { if (valid()) return sys().image(photo.id); }).then(result => {
        if (!valid()) return;
        if (result?.ok && result.image) image.src = result.image;
        else failed(result?.message);
      }).catch(() => failed('相片没有展开，请重试。'));
    }
    Promise.resolve().then(run); return retry;
  }
  async function act(view, control, id, tab, method, value, onSuccess) {
    if (!current(view) || view.busy) return;
    view.busy = true; control.disabled = true; control.setAttribute('aria-busy', 'true'); report(view, method === 'download' ? '正在准备PNG…' : '正在整理相片…');
    try {
      const snapshot = await read(); if (!current(view)) return;
      const photo = locate(snapshot, id, tab);
      if (!photo) { report(view, '相片的位置有了变化，请返回相册重新查看。', true); return; }
      const result = await sys()[method](id, value); if (!current(view)) return;
      if (!result?.ok) { report(view, result?.message || '这次整理没有完成，请重试。', true); return; }
      report(view, result.message || (method === 'download' ? '照片已准备下载。' : '相片已经整理好。'));
      if (result.message) ui.toast(result.message); G.audio.play('success');
      if (onSuccess) onSuccess(result);
    } catch (error) { report(view, method === 'download' ? '相片暂时没有下载成功，请重试。' : '这次整理没有完成，请重试。', true); }
    finally {
      if (current(view)) { view.busy = false; control.disabled = false; control.removeAttribute('aria-busy'); }
    }
  }
  function showAlbum(owner, tab = 'album', preferredFocus = 'tab-' + tab, feedback) {
    if (!live(owner)) return;
    owner.tab = tab; const view = modal(owner, '我的小相册', 'av-album');
    load(view, snapshot => {
      const intro = el('div', 'av-intro'), copy = el('div');
      copy.append(el('strong', '', tab === 'trash' ? '回收夹' : '我的相册'), el('span', 'av-capacity-count', snapshot[tab].length + ' / ' + sys().maxPhotos));
      intro.append(copy, button(view, '去取景', () => openEditor(owner), 'camera', 'ui-button-primary'));
      const tabs = el('div', 'av-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '相片分组');
      const items = [{ id: 'album', name: '相册' }, { id: 'trash', name: '回收夹' }];
      items.forEach((item, index) => {
        const control = button(view, '', () => showAlbum(owner, item.id), 'tab-' + item.id, 'av-tab' + (tab === item.id ? ' is-active' : ''));
        control.append(el('span', '', item.name), el('span', 'av-tab-count', snapshot[item.id].length + ' / ' + sys().maxPhotos));
        control.id = 'album-tab-' + view.id + '-' + item.id; control.setAttribute('role', 'tab'); control.setAttribute('aria-selected', String(tab === item.id)); control.setAttribute('aria-controls', 'album-page-' + view.id); control.tabIndex = tab === item.id ? 0 : -1;
        control.addEventListener('keydown', event => {
          if (!current(view)) return;
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : ['ArrowRight', 'ArrowLeft'].includes(event.key) ? 1 - index : -1;
          if (next < 0) return; event.preventDefault(); showAlbum(owner, items[next].id);
        }); tabs.append(control);
      }); view.content.append(tabs, intro);
      const page = el('section', 'av-page'); page.id = 'album-page-' + view.id; page.setAttribute('role', 'tabpanel'); page.setAttribute('aria-labelledby', 'album-tab-' + view.id + '-' + tab);
      page.append(el('p', 'av-note', tab === 'trash' ? '先收在这里，随时可以放回相册。只有确认永久删除后，相片才会消失。' : '最多收好12张，不会自动覆盖。下载PNG会带上相框、贴纸和配文。'));
      if (snapshot[tab].length >= sys().maxPhotos) page.append(el('p', 'av-capacity', tab === 'trash' ? '回收夹已满12张。先恢复或永久删除一张，才能继续移入。' : '相册已满12张。先移一张到回收夹，为新的回忆留个位置。'));
      if (snapshot[tab].length) {
        const grid = el('div', 'av-grid'); grid.setAttribute('aria-label', tab === 'trash' ? '回收夹里的相片' : '保存的小屋相片');
        snapshot[tab].slice().reverse().forEach(photo => {
          const card = el('article', 'av-entry'), choose = button(view, '', () => showDetail(owner, photo.id, tab), 'entry-' + photo.id, 'av-entry-open');
          choose.setAttribute('aria-label', '查看相片：' + photo.name);
          const frame = el('span', 'av-thumbnail'); if (Number.isFinite(photo.width) && photo.width > 0 && Number.isFinite(photo.height) && photo.height > 0) frame.style.aspectRatio = photo.width + ' / ' + photo.height; choose.append(frame, el('strong', 'av-name', photo.name), stamp(photo));
          card.append(choose, picture(view, photo, frame, 'entry-' + photo.id)); grid.append(card);
        }); page.append(grid);
      } else {
        const empty = el('div', 'av-empty'), symbol = el('span', 'av-empty-symbol' + (tab === 'trash' ? ' av-empty-book' : ' av-empty-camera')); symbol.setAttribute('aria-hidden', 'true'); symbol.append(el('span', 'av-camera-lens'), el('span', 'av-camera-flash'));
        empty.append(symbol, el('h3', '', tab === 'trash' ? '回收夹空空的' : '第一张，会是什么呢？'), el('p', '', tab === 'trash' ? '想整理相册时，把暂时不用的相片移到这里就好。' : '去小屋选一个喜欢的镜头，加上装饰，按下快门吧。'));
        if (tab === 'album') empty.append(button(view, '拍第一张', () => openEditor(owner), 'first-photo', 'ui-button-primary'));
        page.append(empty);
      }
      view.content.append(page, el('p', 'av-footnote', '相册只属于这份小屋存档，不会出现在公开小屋里。'));
    }, preferredFocus, feedback);
  }
  function showDetail(owner, id, tab, feedback) {
    if (!live(owner)) return;
    const view = modal(owner, tab === 'trash' ? '回收夹里的相片' : '相片详情', 'av-detail');
    load(view, snapshot => {
      const photo = locate(snapshot, id, tab);
      const back = button(view, '返回' + (tab === 'trash' ? '回收夹' : '相册'), () => showAlbum(owner, tab, 'entry-' + id), 'back', 'av-back');
      if (!photo) { view.content.append(el('p', 'av-note', '相片的位置有了变化，请返回相册重新查看。'), back); return; }
      view.content.append(back);
      const layout = el('div', 'av-detail-layout'), preview = key(el('figure', 'av-preview'), 'preview'); preview.tabIndex = -1;
      const frame = el('div', 'av-full-image'), caption = el('figcaption'); caption.append(stamp(photo)); preview.append(frame, caption);
      const aside = el('div', 'av-detail-info'); aside.append(el('h3', 'av-detail-name', photo.name));
      const note = el('div', 'av-caption'); note.append(el('strong', '', '照片配文'), el('p', '', photo.decor?.caption || '还没有配文')); aside.append(note);
      const actions = el('div', 'av-actions'), save = button(view, '下载PNG', () => act(view, save, id, tab, 'download'), 'download'); actions.append(save);
      if (tab === 'trash') {
        const restore = button(view, '放回相册', () => act(view, restore, id, tab, 'restore', undefined, () => showDetail(owner, id, 'album')), 'restore', 'ui-button-primary');
        actions.append(restore, button(view, '永久删除', () => showPurge(owner, id), 'purge', 'ui-button-danger'));
        aside.append(el('p', 'av-note', '先放回相册，就能继续改名和装饰。'));
      } else {
        const edit = button(view, '编辑装饰', async () => {
          if (view.busy) return; view.busy = true; edit.disabled = true;
          try {
            const fresh = await read(); if (!current(view)) return;
            const value = locate(fresh, id, 'album');
            if (value) openEditor(owner, value); else report(view, '先把相片恢复到相册，再来编辑。', true);
          } catch (error) { report(view, '相片暂时没有读好，请重试。', true); }
          finally { if (current(view)) { view.busy = false; edit.disabled = false; } }
        }, 'edit', 'ui-button-primary');
        const remove = button(view, '移入回收夹', () => act(view, remove, id, tab, 'remove', undefined, () => showAlbum(owner, 'album')), 'remove', 'ui-button-soft');
        actions.append(edit, button(view, '改名字', () => showRename(owner, id), 'rename'), remove);
        aside.append(el('p', 'av-note', '改名与装饰不会增加拍照次数。配文在「编辑装饰」里单独修改。'));
      }
      aside.append(actions, el('p', 'av-footnote', 'PNG由保存的底图和装饰合成；不同照片的清晰度可能不同。'));
      preview.append(picture(view, photo, frame, 'preview')); layout.append(preview, aside); view.content.append(layout);
    }, 'back', feedback);
  }
  function showRename(owner, id) {
    if (!live(owner)) return;
    const view = modal(owner, '给相片改个名字', 'av-name-form');
    load(view, snapshot => {
      const photo = locate(snapshot, id, 'album');
      if (!photo) { view.content.append(el('p', 'av-note', '先把相片恢复到相册，再来改名。'), button(view, '返回相册', () => showAlbum(owner), 'back')); return; }
      const form = el('form', 'av-rename'), input = key(el('input', 'ui-input av-name-input'), 'name'); input.type = 'text'; input.value = photo.name; input.autofocus = true;
      const hint = el('p', 'av-note', '写1–30个字，表情也可以。这里只改名字，相片里的配文会保留。'); hint.id = 'album-name-hint-' + view.id;
      const error = el('p', 'av-form-error'); error.id = 'album-name-error-' + view.id; error.setAttribute('role', 'alert');
      const count = el('span', 'av-character-count'); count.id = 'album-name-count-' + view.id; input.setAttribute('aria-describedby', hint.id + ' ' + count.id + ' ' + error.id);
      let composing = false;
      const normalize = () => {
        input.value = [...input.value.replace(/[\r\n\t\u0000-\u001f\u007f]/g, '')].slice(0, 30).join('');
        count.textContent = [...input.value].length + ' / 30 字'; error.textContent = ''; input.removeAttribute('aria-invalid');
      };
      input.addEventListener('compositionstart', () => { if (current(view)) composing = true; });
      input.addEventListener('input', event => { if (current(view) && !composing && !event.isComposing) normalize(); });
      input.addEventListener('compositionend', () => { if (current(view)) { composing = false; normalize(); } }); normalize();
      const actions = el('div', 'av-actions av-form-actions');
      const submit = button(view, '收好名字', () => { if (!composing) form.requestSubmit(); }, 'submit-name', 'ui-button-primary');
      actions.append(button(view, '返回相片', () => showDetail(owner, id, 'album'), 'back'), submit);
      form.append(ui.controls.label(input, '相片名字'), count, hint, error, actions); view.content.append(form);
      form.addEventListener('submit', event => {
        event.preventDefault(); if (!current(view) || composing || event.isComposing || view.busy) return;
        normalize(); const name = input.value.trim();
        if (!name) { error.textContent = '请写1到30个字的相片名字。'; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
        act(view, submit, id, 'album', 'rename', name, () => showDetail(owner, id, 'album'));
      });
    }, 'name');
  }
  function showPurge(owner, id) {
    if (!live(owner)) return;
    const view = modal(owner, '永久删除这张相片？', 'av-confirm');
    load(view, snapshot => {
      const photo = locate(snapshot, id, 'trash');
      const back = button(view, '返回回收夹', () => showAlbum(owner, 'trash', 'entry-' + id), 'back');
      if (!photo) { view.content.append(el('p', 'av-note', '回收夹里没有找到这张相片。'), back); return; }
      view.content.append(el('h3', 'av-detail-name', photo.name), el('p', 'av-confirm-copy', '确认后将永久删除，不能再从回收夹恢复。想留念的话，可以先返回相片下载PNG。'));
      const actions = el('div', 'av-actions av-form-actions'), confirm = button(view, '确认永久删除', () => act(view, confirm, id, 'trash', 'purge', undefined, () => showAlbum(owner, 'trash')), 'confirm-purge', 'ui-button-danger');
      actions.append(back, confirm); view.content.append(actions);
    }, 'back');
  }
  function openEditor(owner, photo) {
    if (!live(owner)) return;
    const view = owner.view; owner.view = null; owner.editor = null;
    const ticket = ++serial; owner.editor = ticket; owner.editorOpening = true;
    const returnTo = callback => () => { if (!live(owner) || owner.editor !== ticket) return; owner.editor = null; callback(); };
    const options = { onAlbum: returnTo(() => showAlbum(owner, 'album')), onSaved: returnTo(() => photo ? showDetail(owner, photo.id, 'album') : showAlbum(owner, 'album')) };
    if (photo) options.photo = photo;
    try {
      ui.photoEditor.open(options);
      // 真编辑器由共享modal关闭旧页；兼容不创建modal的调用方替身。
      if (view?.body.isConnected) view.handle.close();
    } catch (error) {
      if (live(owner) && owner.editor === ticket) {
        owner.editor = null; const message = '照相馆暂时没有打开，请再试一次。';
        if (view?.body.isConnected) { owner.view = view; report(view, message, true); }
        else if (photo) showDetail(owner, photo.id, 'album', message);
        else showAlbum(owner, 'album', 'tab-album', message);
      }
    }
    finally { owner.editorOpening = false; }
  }
  function open(options = {}) {
    const previousPanel = G.ui?.view?.panel || null;
    close();
    ui.panel.close();
    ui.controls.close();
    const owner = { closed: false, view: null, editor: null, editorOpening: false, tab: 'album', returnPanel: previousPanel }; session = owner;
    if (options.mode === 'album') showAlbum(owner); else openEditor(owner);
  }
  // 编辑器按现有协议先close再同步callback；微任务后才废弃被关闭的编辑入口。
  G.bus.on('modal:closed', () => {
    const owner = session, ticket = owner?.editor;
    if (!ticket || owner.editorOpening) return;
    Promise.resolve().then(() => { if (live(owner) && owner.editor === ticket) { owner.editor = null; owner.closed = true; if (session === owner) session = null; } });
  });
  G.bus.on('state:replace', close);
  ui.photography = { open, close };
})(window.Game);
