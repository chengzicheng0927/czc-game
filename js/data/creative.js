/* 画板颜色与编码固定，旧作品不会随主题或换色改变。 */
(function (G) {
  'use strict';
  const D = G.data, symbols = '0123456789abcdefghijklmn';
  D.creativeConfig = {
    size: 16, maxArts: 20, unlockLv: 7, roomType: 'studio',
    symbols, transparent: '.', palette: D.balance.colors.slice(0, 24),
    paletteNames: ['草莓粉', '奶油黄', '薄荷绿', '天空蓝', '薰衣草紫', '蜜桃橙', '雪白', '蜂蜜棕', '焦糖棕', '可可棕', '莓果粉', '樱花浅粉', '金麦黄', '嫩叶绿', '鼠尾草绿', '湖水蓝', '暮蓝', '丁香紫', '橘子橙', '米杏', '陶土粉', '雾绿', '雾蓝', '藕荷灰'],
    frameId: 'custom_art_frame', frameWidth: 66, frameHeight: 66,
    exportSize: 512, maxUndo: 50, defaultName: '我的小画',
    texts: {
      needLevel: '小屋到 Lv.7，再建一间画室，就能画下自己的小世界。',
      needStudio: '先建一间画室，就能打开画板，把喜欢的颜色画成故事。',
      ready: '16×16 的小小画布，也装得下很多喜欢。',
      full: '20幅画都收好啦。可以编辑旧作品，或先下载留念后再整理。',
      invalidName: '给画作起一个1到20字的名字吧，放在同一行就好。',
      invalidPixels: '画作需要完整的16×16像素，请保留原作品后重新打开。',
      unavailable: '这次修改暂时没能放进存档，原作品保持原样。先下载JSON备份，再试一次吧。'
    }
  };
  D.validCreativeName = name => typeof name === 'string' && name.length <= 40 && [...name].length >= 1 && [...name].length <= 20 && !!name.trim() && !/[\u0000-\u001f\u007f]/.test(name);
  D.validCreativePixels = pixels => typeof pixels === 'string' && /^[.0-9a-n]{256}$/.test(pixels);
  D.validateCreativeArt = value => {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]' || Object.keys(value).length !== 3 || !['id', 'name', 'pixels'].every(key => Object.prototype.hasOwnProperty.call(value, key)) || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.id)) throw new Error('这幅画的存档格式不完整，请保留原文件。');
    if (!D.validCreativeName(value.name)) throw new Error(D.creativeConfig.texts.invalidName);
    if (!D.validCreativePixels(value.pixels)) throw new Error(D.creativeConfig.texts.invalidPixels);
    return { id: value.id, name: value.name, pixels: value.pixels };
  };
  // 画作沿用家具命中与拖动，仅注册内部挂件，不加入普通家具目录或图鉴。
  D.furnitureById.custom_art_frame = {
    id: 'custom_art_frame', name: '我的画作', template: 'custom_art_frame', customArt: true,
    theme: 'creative', category: 'wall', place: 'wall', w: 66, h: 66, surface: null,
    price: 0, currency: 'none', comfort: 3, recolor: false, tags: ['custom_art'],
    unlockLv: 7, rewardOnly: true, rarity: 'creative'
  };
})(window.Game);
