/* 家具稀有度只装饰现有预览；不增加绘图循环，文字与颜色一起表达。 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {};
  const definitions = {
    common: { id: 'common', name: '普通' },
    fine: { id: 'fine', name: '精致' },
    rare: { id: 'rare', name: '稀有' },
    limited: { id: 'limited', name: '限定' }
  };
  function info(definition) { const id = definition?.rarity; return Object.prototype.hasOwnProperty.call(definitions, id) ? definitions[id] : definitions.common; }
  function badge(definition) {
    const rarity = info(definition), node = document.createElement('span');
    node.className = 'furniture-rarity-badge rarity-' + rarity.id; node.textContent = rarity.name;
    node.setAttribute('aria-label', '家具稀有度：' + rarity.name); return node;
  }
  function decorate(container, definition, options = {}) {
    if (!container || options.discovered === false) return null;
    const rarity = info(definition), previous = container.querySelector?.('.furniture-rarity-badge');
    Object.keys(definitions).forEach(id => container.classList.remove('rarity-' + id));
    container.classList.add('furniture-rarity-surface', 'rarity-' + rarity.id); container.dataset.rarity = rarity.id;
    if (options.preview) { options.preview.classList.add('furniture-rarity-preview'); options.preview.dataset.rarity = rarity.id; }
    const label = badge(definition); if (previous) previous.replaceWith(label); else container.append(label); return label;
  }
  ui.furnitureRarity = { info, badge, decorate };
})(window.Game);
