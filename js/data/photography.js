/* 相框与贴纸均为本地绘制数据，不加载外部素材。 */
(function (G) {
  'use strict';
  const D = G.data;
  D.photoFrames = [
    { id: 'none', name: '不加相框', color: '#E8D9DF' },
    { id: 'cream', name: '奶油花边', color: '#F4E4B2' },
    { id: 'strawberry', name: '草莓心意', color: '#EAB7C7' },
    { id: 'forest', name: '森林来信', color: '#B7CEA3' },
    { id: 'ocean', name: '贝壳海风', color: '#B3D9E0' },
    { id: 'starry', name: '晚安星光', color: '#C5B8DE' },
    { id: 'cloud', name: '云朵抱抱', color: '#E7EFF4' },
    { id: 'rainbow', name: '七色小约定', color: '#E8B9CF' },
    { id: 'polaroid', name: '小屋拍立得', color: '#F7F0DD' }
  ];
  D.photoStickers = [
    ['heart', '爱心', '💗'], ['star', '星星', '⭐'], ['rainbow', '彩虹', '🌈'], ['cloud', '云朵', '☁️'],
    ['sun', '太阳', '☀️'], ['moon', '月亮', '🌙'], ['flower', '小花', '🌸'], ['leaf', '绿叶', '🍃'],
    ['strawberry', '草莓', '🍓'], ['cake', '小蛋糕', '🧁'], ['ribbon', '蝴蝶结', '🎀'], ['sparkles', '闪闪亮', '✨'],
    ['rabbit', '小兔', '🐰'], ['bear', '小熊', '🐻'], ['fox', '小狐狸', '🦊'], ['cat', '小猫', '🐱'],
    ['penguin', '小企鹅', '🐧'], ['unicorn', '独角兽', '🦄'], ['butterfly', '蝴蝶', '🦋'], ['gift', '礼物', '🎁']
  ].map(([id, name, emoji]) => ({ id, name, emoji }));
  D.defaultPhotoDecor = () => ({ frame: 'none', caption: '', stickers: [] });
  D.validatePhotoDecor = value => {
    const record = v => v && Object.prototype.toString.call(v) === '[object Object]';
    const invalid = () => { throw new Error('相片装饰的格式不完整，请保留原照片后重新选择。'); };
    if (!record(value) || Object.keys(value).length !== 3 || !Object.keys(value).every(key => ['frame', 'caption', 'stickers'].includes(key))) invalid();
    if (!D.photoFrames.some(frame => frame.id === value.frame) || typeof value.caption !== 'string' || [...value.caption].length > 30 || /[\u0000-\u001f\u007f]/.test(value.caption) || !Array.isArray(value.stickers) || value.stickers.length > 20) invalid();
    const ids = new Set();
    value.stickers.forEach(sticker => {
      if (!record(sticker) || Object.keys(sticker).length !== 5 || !Object.keys(sticker).every(key => ['uid', 'stickerId', 'x', 'y', 'scale'].includes(key))) invalid();
      if (typeof sticker.uid !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(sticker.uid) || ids.has(sticker.uid) || !D.photoStickers.some(def => def.id === sticker.stickerId)) invalid();
      ids.add(sticker.uid);
      if (![sticker.x, sticker.y, sticker.scale].every(number => typeof number === 'number' && Number.isFinite(number)) || sticker.x < 0 || sticker.x > 1 || sticker.y < 0 || sticker.y > 1 || sticker.scale < .4 || sticker.scale > 3) invalid();
    });
    return { frame: value.frame, caption: value.caption, stickers: value.stickers.map(sticker => Object.assign({}, sticker)) };
  };
})(window.Game);
