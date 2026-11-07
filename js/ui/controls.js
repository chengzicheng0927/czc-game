/* 糖果风控件：DOM value / change 接口与原生表单一致，弹层独立于滚动面板。 */
(function () {
  'use strict';
  const G = window.Game;
  G.ui = G.ui || {};
  let nextId = 0;
  let opened = null;
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const uid = prefix => prefix + '-' + (++nextId);
  function focusKey(prefix, values) {
    let hash = 0;
    String(values).split('').forEach(char => { hash = (hash * 31 + char.charCodeAt(0)) >>> 0; });
    return prefix + '-' + hash.toString(36);
  }
  function event(node, type) { node.dispatchEvent(new Event(type, { bubbles: true })); }
  function close(restoreFocus) {
    const current = opened; if (!current) return;
    opened = null;
    current.anchor.setAttribute('aria-expanded', 'false');
    current.anchor.removeAttribute('aria-activedescendant');
    current.anchor.classList.remove('is-open');
    current.menu.remove();
    document.removeEventListener('pointerdown', current.outside, true);
    document.removeEventListener('keydown', current.keyboard, true);
    document.removeEventListener('focusin', current.focusOutside, true);
    document.removeEventListener('scroll', current.scroll, true);
    window.removeEventListener('resize', current.resize);
    current.observer.disconnect();
    if (restoreFocus && current.anchor.isConnected) current.anchor.focus({ preventScroll: true });
  }
  function place(current) {
    const anchor = current.anchor.getBoundingClientRect();
    const menu = current.menu;
    const width = Math.min(window.innerWidth - 24, current.width || Math.max(anchor.width, 190));
    menu.style.position = 'fixed'; menu.style.width = width + 'px'; menu.style.maxWidth = 'calc(100vw - 24px)';
    menu.style.left = Math.min(Math.max(12, anchor.left), window.innerWidth - width - 12) + 'px';
    const limit = current.maxHeight || 340;
    menu.style.top = '0px'; menu.style.maxHeight = limit + 'px';
    const desired = Math.min(menu.scrollHeight || 300, limit), below = window.innerHeight - anchor.bottom - 18, above = anchor.top - 18;
    const upwards = below < desired && above > below;
    const available = Math.max(80, upwards ? above : below);
    menu.style.maxHeight = Math.min(limit, available) + 'px';
    const height = Math.min(desired, available);
    menu.style.top = (upwards ? Math.max(12, anchor.top - height - 7) : anchor.bottom + 7) + 'px';
    menu.dataset.placement = upwards ? 'top' : 'bottom';
  }
  function open(anchor, menu, options) {
    close(false);
    const current = { anchor, menu, width: options.width, maxHeight: options.maxHeight, keyboard: null, observer: null };
    opened = current; document.body.append(menu);
    anchor.setAttribute('aria-expanded', 'true'); anchor.setAttribute('aria-controls', menu.id); anchor.classList.add('is-open');
    current.outside = e => { if (!anchor.contains(e.target) && !menu.contains(e.target)) close(false); };
    current.keyboard = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(true); return; }
      if (options.keyboard) options.keyboard(e);
    };
    current.focusOutside = e => { if (!anchor.contains(e.target) && !menu.contains(e.target)) close(false); };
    current.scroll = e => { if (e.target === menu || menu.contains(e.target)) return; close(false); };
    current.resize = () => close(false);
    current.observer = new MutationObserver(() => { if (!anchor.isConnected) close(false); });
    current.observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('pointerdown', current.outside, true);
    document.addEventListener('keydown', current.keyboard, true);
    document.addEventListener('focusin', current.focusOutside, true);
    document.addEventListener('scroll', current.scroll, true);
    window.addEventListener('resize', current.resize);
    place(current);
    return current;
  }
  function createSelect(options, value, onChange) {
    const node = make('button', 'ui-input cute-select'); node.type = 'button'; node.id = uid('cute-select'); node.dataset.cuteControl = 'select';
    node.dataset.uiFocus = focusKey('dropdown', options.map(option => option.id).join('|'));
    node.setAttribute('role', 'combobox'); node.setAttribute('aria-haspopup', 'listbox'); node.setAttribute('aria-expanded', 'false'); node.setAttribute('aria-label', '选择选项');
    const text = make('span', 'cute-select-value'); const arrow = make('span', 'cute-select-arrow', '⌄'); arrow.setAttribute('aria-hidden', 'true'); node.append(text, arrow);
    let selected = options.some(option => String(option.id) === String(value)) ? String(value) : String((options[0] || {}).id || '');
    let activeIndex = Math.max(0, options.findIndex(option => String(option.id) === selected));
    function update() {
      const option = options.find(item => String(item.id) === selected); text.textContent = option ? option.name : '请选择';
      if (opened && opened.anchor === node) {
        opened.menu.querySelectorAll('[role=option]').forEach((item, index) => { const chosen = String(options[index].id) === selected; item.setAttribute('aria-selected', String(chosen)); item.classList.toggle('is-selected', chosen); });
      }
    }
    Object.defineProperty(node, 'value', { configurable: true, get: () => selected, set: newValue => { selected = options.some(option => String(option.id) === String(newValue)) ? String(newValue) : ''; update(); } });
    function markActive(index) {
      if (!options.length) return;
      activeIndex = Math.max(0, Math.min(options.length - 1, index));
      if (!opened || opened.anchor !== node) return;
      const items = [...opened.menu.querySelectorAll('[role=option]')];
      items.forEach((item, i) => item.classList.toggle('is-active', i === activeIndex));
      node.setAttribute('aria-activedescendant', items[activeIndex].id);
      items[activeIndex].scrollIntoView({ block: 'nearest' });
    }
    function choose(index) {
      if (!options[index]) return;
      const previous = selected; node.value = options[index].id; close(true);
      if (previous !== selected) { event(node, 'input'); event(node, 'change'); }
    }
    function expand(index) {
      if (!options.length || node.disabled) return;
      const menu = make('div', 'cute-popover cute-select-menu'); menu.id = uid('cute-options'); menu.setAttribute('role', 'listbox');
      const labelledby = node.getAttribute('aria-labelledby');
      if (labelledby) menu.setAttribute('aria-labelledby', labelledby); else menu.setAttribute('aria-label', node.getAttribute('aria-label') || '可选项目');
      options.forEach((option, i) => {
        const item = make('button', 'cute-option', option.name); item.type = 'button'; item.id = uid('cute-option'); item.tabIndex = -1; item.setAttribute('role', 'option'); item.setAttribute('aria-selected', String(String(option.id) === selected)); item.classList.toggle('is-selected', String(option.id) === selected);
        item.addEventListener('pointerdown', e => e.preventDefault());
        item.addEventListener('pointermove', () => markActive(i));
        item.addEventListener('click', () => choose(i)); menu.append(item);
      });
      open(node, menu, { keyboard(e) {
        if (e.key === 'Tab') { close(false); return; }
        const handled = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(e.key);
        if (!handled) return; e.preventDefault(); e.stopImmediatePropagation();
        if (e.key === 'ArrowDown') markActive(activeIndex + 1);
        else if (e.key === 'ArrowUp') markActive(activeIndex - 1);
        else if (e.key === 'Home') markActive(0);
        else if (e.key === 'End') markActive(options.length - 1);
        else choose(activeIndex);
      } });
      markActive(index === undefined ? Math.max(0, options.findIndex(option => String(option.id) === selected)) : index);
    }
    node.addEventListener('click', () => { if (opened && opened.anchor === node) close(true); else expand(); });
    node.addEventListener('keydown', e => {
      if (opened && opened.anchor === node) return;
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) { e.preventDefault(); expand(e.key === 'End' ? options.length - 1 : e.key === 'Home' ? 0 : undefined); }
    });
    if (onChange) node.addEventListener('change', () => onChange(node.value));
    update(); return node;
  }
  function normalizeHex(value) {
    let hex = String(value || '').trim(); if (!hex.startsWith('#')) hex = '#' + hex;
    if (/^#[0-9a-f]{3}$/i.test(hex)) hex = '#' + hex.slice(1).split('').map(char => char + char).join('');
    return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toUpperCase() : null;
  }
  function createColor(value, key) {
    const node = make('button', 'ui-input cute-color'); node.type = 'button'; node.id = uid('cute-color'); node.dataset.cuteControl = 'color';
    node.dataset.uiFocus = key || focusKey('color', value); node.setAttribute('aria-label', '选择颜色'); node.setAttribute('aria-haspopup', 'dialog'); node.setAttribute('aria-expanded', 'false');
    const preview = make('span', 'cute-color-preview'); preview.setAttribute('aria-hidden', 'true');
    const label = make('span', 'cute-color-value'); const arrow = make('span', 'cute-select-arrow', '⌄'); arrow.setAttribute('aria-hidden', 'true'); node.append(preview, label, arrow);
    let selected = normalizeHex(value) || '#FFB6C8', colorMenu = null, hexInput = null;
    function update() {
      preview.style.backgroundColor = selected; node.style.setProperty('--selected-color', selected); label.textContent = selected;
      if (hexInput && colorMenu && colorMenu.isConnected) hexInput.value = selected;
      if (colorMenu) colorMenu.querySelectorAll('.cute-color-swatch').forEach(item => { const chosen = item.dataset.color === selected; item.setAttribute('aria-pressed', String(chosen)); item.classList.toggle('is-selected', chosen); });
    }
    Object.defineProperty(node, 'value', { configurable: true, get: () => selected, set: newValue => { const valid = normalizeHex(newValue); if (valid) { selected = valid; update(); } } });
    function commit(value) { const previous = selected; node.value = value; if (selected !== previous) { event(node, 'input'); event(node, 'change'); } }
    function expand() {
      colorMenu = make('section', 'cute-popover cute-color-menu'); colorMenu.id = uid('cute-palette'); colorMenu.setAttribute('role', 'dialog'); colorMenu.setAttribute('aria-modal', 'false'); colorMenu.setAttribute('aria-label', '选择喜欢的颜色');
      const heading = make('div', 'cute-color-heading'); heading.append(make('strong', '', '🎨 挑一颗糖果色'));
      const dismiss = make('button', 'ui-button cute-popover-close', '✕'); dismiss.type = 'button'; dismiss.setAttribute('aria-label', '收起调色盘'); dismiss.addEventListener('click', () => close(true)); heading.append(dismiss); colorMenu.append(heading);
      const palette = make('div', 'cute-palette'); palette.setAttribute('role', 'group'); palette.setAttribute('aria-label', '24种糖果颜色');
      const paletteColors = G.data.palette || G.data.balance.colors;
      const paletteButtons = [];
      paletteColors.forEach((color, index) => {
        const hex = normalizeHex(color); const swatch = make('button', 'cute-color-swatch'); swatch.type = 'button'; swatch.style.setProperty('--swatch-color', hex); swatch.style.backgroundColor = hex; swatch.dataset.color = hex; swatch.tabIndex = index === 0 ? 0 : -1; swatch.setAttribute('aria-label', '颜色 ' + hex); swatch.setAttribute('aria-pressed', String(hex === selected));
        swatch.addEventListener('click', () => { commit(hex); swatch.focus({ preventScroll: true }); });
        swatch.addEventListener('focus', () => paletteButtons.forEach(item => { item.tabIndex = item === swatch ? 0 : -1; }));
        swatch.addEventListener('keydown', e => {
          let next = index;
          if (e.key === 'ArrowRight') next++;
          else if (e.key === 'ArrowLeft') next--;
          else if (e.key === 'ArrowDown') next += 5;
          else if (e.key === 'ArrowUp') next -= 5;
          else if (e.key === 'Home') next = 0;
          else if (e.key === 'End') next = paletteButtons.length - 1;
          else return;
          e.preventDefault(); paletteButtons[Math.max(0, Math.min(paletteButtons.length - 1, next))].focus({ preventScroll: true });
        }); paletteButtons.push(swatch); palette.append(swatch);
      }); colorMenu.append(palette);
      const row = make('div', 'cute-hex-row'); hexInput = make('input', 'ui-input cute-hex-input'); hexInput.type = 'text'; hexInput.value = selected; hexInput.maxLength = 7; hexInput.spellcheck = false; hexInput.setAttribute('aria-label', '颜色HEX值，例如#FFB6C8'); hexInput.dataset.uiFocus = 'color-hex';
      const error = make('p', 'cute-color-error'); error.id = uid('cute-color-error'); error.setAttribute('aria-live', 'polite'); hexInput.setAttribute('aria-describedby', error.id);
      const apply = make('button', 'ui-button ui-button-primary', '用这个色'); apply.type = 'button';
      function applyHex() { const color = normalizeHex(hexInput.value); if (!color) { error.textContent = '写上#和6位颜色代码，例如#FFB6C8。'; hexInput.setAttribute('aria-invalid', 'true'); hexInput.focus(); return; } error.textContent = ''; hexInput.removeAttribute('aria-invalid'); commit(color); hexInput.value = color; }
      apply.addEventListener('click', applyHex); hexInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyHex(); } }); hexInput.addEventListener('input', () => { error.textContent = ''; hexInput.removeAttribute('aria-invalid'); }); row.append(hexInput, apply); colorMenu.append(row, error);
      open(node, colorMenu, { width: 328, maxHeight: 480, keyboard(e) {
        if (e.key !== 'Tab') return;
        const items = [...colorMenu.querySelectorAll('button:not([tabindex="-1"]),input')]; const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === node)) { e.preventDefault(); first.focus(); }
      } });
      update(); const chosen = paletteButtons.find(item => item.dataset.color === selected) || paletteButtons[0]; if (chosen) chosen.focus({ preventScroll: true });
    }
    node.addEventListener('click', () => { if (opened && opened.anchor === node) close(true); else expand(); });
    update(); return node;
  }
  function enhanceRange(node) {
    node.classList.add('cute-range');
    function sync() { const min = Number(node.min || 0), max = Number(node.max || 100), progress = Math.max(0, Math.min(100, (Number(node.value) - min) / (max - min || 1) * 100)); node.style.setProperty('--range-progress', progress + '%'); }
    node.addEventListener('input', sync); node.addEventListener('change', sync); requestAnimationFrame(sync);
  }
  G.ui.controls = {
    select: createSelect, color: createColor, enhanceRange,
    isOpen: () => !!opened,
    isInteracting(root) { return !!(opened && opened.anchor.isConnected && (!root || root.contains(opened.anchor))); },
    close,
    label(control, label) {
      const wrapper = make(control.dataset.cuteControl ? 'div' : 'label', 'ui-field');
      if (!control.id) control.id = uid('cute-field');
      const text = make('span', 'ui-field-label', label); text.id = uid('cute-label'); control.setAttribute('aria-labelledby', text.id);
      if (wrapper.tagName === 'LABEL') wrapper.htmlFor = control.id;
      else text.addEventListener('click', () => control.focus());
      wrapper.append(text, control); return wrapper;
    }
  };
})();
