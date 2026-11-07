/* 衣橱数据：轮廓、图案、价格与可选形象全部在此定义。 */
(function (G) {
  'use strict';
  const hairRows = [['long_straight', '柔柔长直发'], ['twin_tails', '糖果双马尾'], ['buns', '云朵丸子头'], ['bob', '圆圆波波头'], ['curls', '松软卷卷发'], ['princess_braid', '花环公主辫'], ['ponytail', '元气高马尾'], ['short', '轻盈短发'], ['pigtail_braid', '小麦双麻花'], ['side_swept', '星光侧分发']];
  G.data.avatarHairStyles = hairRows.map(row => ({ id: row[0], name: row[1] }));
  G.data.avatarHairColors = [
    ['#8B5A3C', '栗子棕'], ['#3D3545', '可可黑'], ['#B77D50', '焦糖棕'], ['#D8B77A', '蜂蜜金'], ['#F2D8A6', '奶油金'], ['#D998AE', '草莓粉'], ['#B497CC', '香芋紫'], ['#859DC6', '雾霭蓝'], ['#8EBBA8', '薄荷绿'], ['#C77362', '红茶橘'], ['#BDB9CE', '月光灰'], ['#E5C4B1', '奶茶米']
  ].map(row => ({ id: row[0], name: row[1], color: row[0] }));
  // 保留四个既有肤色ID：旧存档、预设和搭配盒直接映射为同一自然暖黄色系，无需改写存档。
  G.data.avatarSkins = [{ id: 0, name: '奶油浅肤', color: '#FFF1E7' }, { id: 1, name: '象牙浅肤', color: '#FDEDE1' }, { id: 2, name: '自然浅肤', color: '#FAE8DA' }, { id: 3, name: '暖白浅肤', color: '#F7E4D4' }];
  G.data.avatarFaces = [{ id: 'smile', name: '甜甜微笑' }, { id: 'cheer', name: '开心弯弯眼' }, { id: 'wink', name: '俏皮眨眼' }, { id: 'calm', name: '安静小圆嘴' }, { id: 'surprise', name: '哇，好惊喜' }, { id: 'shy', name: '害羞红脸颊' }];
  const rows = [
    ['top_cloud', '云朵小衫', 'top', 0, 1, 'tee', 'cloud', '#FFF5DF', '#A8C5D8'],
    ['top_berry', '草莓泡泡袖', 'top', 40, 1, 'puff', 'berry', '#EBB3C4', '#FFF0DE'],
    ['top_sailor', '海风水手衫', 'top', 55, 2, 'sailor', 'stripe', '#D2E4ED', '#829EB9'],
    ['top_knit', '麻花小毛衣', 'top', 60, 2, 'knit', 'knit', '#E9D6B4', '#CBB291'],
    ['top_mint', '薄荷连帽衫', 'top', 65, 3, 'hoodie', 'pocket', '#B4D7C7', '#EDF5E8'],
    ['top_ribbon', '蝴蝶结衬衣', 'top', 65, 3, 'blouse', 'bow', '#F9E9ED', '#CD9CB4'],
    ['top_star', '星星背心', 'top', 70, 4, 'vest', 'star', '#B6ACD6', '#F4D990'],
    ['top_flower', '小花针织开衫', 'top', 75, 4, 'cardigan', 'flower', '#D1DAB3', '#FFF0CF'],
    ['top_bear', '小熊口袋卫衣', 'top', 75, 5, 'hoodie', 'bear', '#D7B590', '#F2DEBC'],
    ['top_lace', '奶油蕾丝上衣', 'top', 80, 5, 'blouse', 'lace', '#F6E9CC', '#DEC8B3'],
    ['top_cape', '月亮小斗篷', 'top', 95, 7, 'cape', 'moon', '#ABA4C9', '#F5D999'],
    ['top_coat', '冬日糖果外套', 'top', 110, 8, 'coat', 'buttons', '#D9B7C9', '#F7EFDC'],
    ['bottom_cream', '奶油小短裤', 'bottom', 0, 1, 'shorts', 'plain', '#E7D7BD', '#C2AA8D'],
    ['bottom_denim', '天空牛仔裙', 'bottom', 35, 1, 'skirt', 'pocket', '#9EBBCF', '#DFEBED'],
    ['bottom_pleats', '格纹百褶裙', 'bottom', 45, 2, 'pleated', 'plaid', '#C5B2CD', '#F1DFE8'],
    ['bottom_pants', '森林背带裤', 'bottom', 55, 2, 'overalls', 'buttons', '#A5BEAA', '#E8DEBC'],
    ['bottom_lace', '软软蛋糕裙', 'bottom', 55, 3, 'tiered', 'lace', '#EAC4D1', '#FFF1DC'],
    ['bottom_wide', '奶茶阔腿裤', 'bottom', 60, 3, 'wide', 'plain', '#C4AB91', '#EDDFCC'],
    ['bottom_star', '星光灯笼裤', 'bottom', 65, 4, 'bloomers', 'star', '#ADA8CE', '#F4DDA0'],
    ['bottom_rain', '跳水洼短裤', 'bottom', 60, 4, 'shorts', 'dot', '#F1D382', '#D7AE70'],
    ['bottom_long', '云絮长长裤', 'bottom', 70, 5, 'trousers', 'stripe', '#B8C8D0', '#F0F0E6'],
    ['bottom_tutu', '花瓣芭蕾裙', 'bottom', 90, 7, 'tutu', 'petals', '#D3BBD9', '#F6E7EC'],
    ['dress_pink', '草莓奶油裙', 'dress', 0, 1, 'aline', 'bow', '#ECB9CC', '#FFF0D7'],
    ['dress_daisy', '小雏菊围裙', 'dress', 65, 1, 'pinafore', 'flower', '#D9DDAA', '#FFF3D1'],
    ['dress_blue', '海盐水手裙', 'dress', 75, 2, 'sailor', 'stripe', '#A9CADB', '#F1EEE2'],
    ['dress_cloud', '云朵蓬蓬裙', 'dress', 80, 2, 'tutu', 'cloud', '#D4E3EB', '#FFF3DF'],
    ['dress_forest', '森林格子裙', 'dress', 85, 3, 'pinafore', 'plaid', '#A9BEA2', '#EFE4C4'],
    ['dress_peach', '蜜桃泡泡裙', 'dress', 85, 3, 'puff', 'dot', '#EBC2A2', '#F7E8D4'],
    ['dress_lace', '奶油花边裙', 'dress', 95, 4, 'tiered', 'lace', '#ECDDBB', '#FFF7E3'],
    ['dress_lavender', '薰衣草公主裙', 'dress', 110, 5, 'princess', 'flower', '#C4AFD5', '#F5E0EA'],
    ['dress_star', '星河小礼服', 'dress', 115, 6, 'princess', 'star', '#A29BC2', '#F2D692'],
    ['dress_rain', '柠檬雨衣裙', 'dress', 100, 6, 'raincoat', 'buttons', '#E6CF88', '#F6E8B7'],
    ['dress_kimono', '樱花和风裙', 'dress', 125, 7, 'kimono', 'petals', '#E5ADC1', '#B9C2A2'],
    ['dress_mermaid', '贝壳人鱼裙', 'dress', 135, 8, 'mermaid', 'scales', '#A2C8C6', '#C9B4D5'],
    ['dress_winter', '雪绒小冬裙', 'dress', 140, 9, 'winter', 'fur', '#BCD2DE', '#FFF4E6'],
    ['dress_rainbow', '彩虹庆典裙', 'dress', 180, 12, 'rainbow', 'rainbow', '#E5BED5', '#FFF0CD'],
    ['shoes_mary', '红豆玛丽珍', 'shoes', 0, 1, 'mary', 'strap', '#B87885', '#F6D5D2'],
    ['shoes_sneaker', '云朵运动鞋', 'shoes', 30, 1, 'sneaker', 'laces', '#E8E8DE', '#A5BECD'],
    ['shoes_ballet', '缎带芭蕾鞋', 'shoes', 35, 2, 'ballet', 'ribbon', '#DEADBF', '#F3DBE3'],
    ['shoes_boots', '森林小短靴', 'shoes', 45, 3, 'boots', 'buttons', '#AC8D73', '#E6D0AD'],
    ['shoes_rain', '柠檬雨靴', 'shoes', 45, 3, 'rainboots', 'stripe', '#E2C778', '#F5E6AA'],
    ['shoes_fluffy', '奶油毛毛鞋', 'shoes', 50, 4, 'fluffy', 'fur', '#E7D2BF', '#FFF2DE'],
    ['shoes_star', '星光小皮鞋', 'shoes', 60, 6, 'mary', 'star', '#ADA6C9', '#F2D58C'],
    ['shoes_sandals', '贝壳凉凉鞋', 'shoes', 55, 5, 'sandals', 'shell', '#B0D0CB', '#F1DBB5'],
    ['bow_red', '草莓红蝴蝶结', 'acc', 0, 1, 'bow', 'plain', '#CB8797', '#F4C7D3', 'head'],
    ['acc_flower', '雏菊小发夹', 'acc', 25, 1, 'flower', 'plain', '#FFF1CA', '#D7B96E', 'head'],
    ['acc_star', '星星双发卡', 'acc', 30, 2, 'stars', 'plain', '#F3D78B', '#DBAF71', 'head'],
    ['acc_crown', '云朵小皇冠', 'acc', 100, 8, 'crown', 'plain', '#E8CE88', '#E6A6BF', 'head'],
    ['acc_beret', '画家贝雷帽', 'acc', 50, 3, 'beret', 'plain', '#BAA2BC', '#EDD9E1', 'head'],
    ['acc_straw', '田园小草帽', 'acc', 55, 4, 'straw', 'plain', '#DEC490', '#C58F9C', 'head'],
    ['acc_bunny', '兔耳软发箍', 'acc', 65, 5, 'bunny', 'plain', '#F4E7D6', '#E7B1C4', 'head'],
    ['acc_moon', '月亮纱头饰', 'acc', 85, 7, 'moon', 'plain', '#C2B3D9', '#F7E2A8', 'head'],
    ['acc_glasses', '圆圆金丝镜', 'acc', 35, 2, 'glasses', 'plain', '#B79B74', '#F5E4C4', 'face'],
    ['acc_heartglasses', '爱心小眼镜', 'acc', 55, 4, 'heartglasses', 'plain', '#D99FB4', '#F5D5DF', 'face'],
    ['acc_stickers', '星光脸贴', 'acc', 30, 2, 'stickers', 'plain', '#F1D28B', '#D5B2DB', 'face'],
    ['acc_wings', '奶油小翅膀', 'acc', 120, 9, 'wings', 'plain', '#F6EBDC', '#D8BED3', 'back'],
    ['acc_fairy', '薄荷精灵翼', 'acc', 140, 12, 'fairy', 'plain', '#B8D9C9', '#DAC6E2', 'back'],
    ['acc_bag', '草莓斜挎包', 'acc', 45, 3, 'berrybag', 'plain', '#DCA2B4', '#A2BE9B', 'bag'],
    ['acc_basket', '小花编织篮', 'acc', 50, 4, 'basket', 'plain', '#D3B18B', '#E6C3CC', 'bag'],
    ['acc_teddy', '小熊抱抱包', 'acc', 65, 6, 'teddybag', 'plain', '#C9A47E', '#EFDCB6', 'bag']
  ];
  const starters = ['top_cloud', 'bottom_cream', 'dress_pink', 'shoes_mary', 'bow_red'];
  G.data.outfits = rows.map(row => ({ id: row[0], name: row[1], category: row[2], price: row[3], unlockLv: row[4], shape: row[5], pattern: row[6], color: row[7], accent: row[8], slot: row[9] || null, source: row[3] === 0 ? 'starter' : 'shop' }));
  G.data.outfitById = {}; G.data.outfits.forEach(item => { G.data.outfitById[item.id] = item; });
  // 原有衣物仍可购买；额外心意和购买共享同一份永久所有权，不复制衣物。
  G.data.outfitRewardSources = [
    { outfitId: 'dress_daisy', kind: 'achievement', id: 'baker_3', category: 'baker', title: '忙碌的小围裙', hint: '完成 15 份蛋糕订单，依次收好小厨师前三阶成就；第三阶额外送一件小围裙。' },
    { outfitId: 'dress_winter', kind: 'festival', id: 'christmas', title: '圣诞节', hint: '12月20日至26日的圣诞庆祝期间打开糯米的节日信，领取节日礼物时，一起收下一件冬日连衣裙。' }
  ];
  G.data.outfitRewardSources.forEach(source => { G.data.outfitById[source.outfitId].rewardSources = [source]; });
  G.data.festivalOutfitReward = id => G.data.outfitRewardSources.find(source => source.kind === 'festival' && source.id === id)?.outfitId || null;
  // store 在全部凭据验证后调用：只补旧领取记录对应的衣服，绝不补发钱、家具或经验。
  G.data.applyOutfitRewardEntitlements = state => {
    const granted = [];
    G.data.outfitRewardSources.forEach(source => {
      const entitled = source.kind === 'achievement' ? state.quests?.achievements?.[source.id] === true : Object.keys(state.calendar?.claimed || {}).some(key => /^\d{4}:[a-z_]+$/.test(key) && key.slice(5) === source.id && state.calendar.claimed[key] === true);
      if (entitled && state.avatar?.owned && state.avatar.owned[source.outfitId] !== true) { state.avatar.owned[source.outfitId] = true; granted.push(source.outfitId); }
    });
    return granted;
  };
  G.data.avatarConfig = { starterIds: starters, defaultTop: 'top_cloud', defaultBottom: 'bottom_cream', maxSaved: 3, maxAccessories: 4, maxName: 12 };
  G.data.defaultAvatar = () => ({ skin: 0, hair: 'twin_tails', hairColor: '#8B5A3C', face: 'smile', top: null, bottom: null, dress: 'dress_pink', shoes: 'shoes_mary', acc: ['bow_red'], outfits: [], owned: Object.fromEntries(starters.map(id => [id, true])) });
  // 预设人物：只使用初始衣橱里的 5 件物品，发型、发色、肤色、表情、穿法各不相同；不送额外衣物。
  G.data.avatarPresets = [
    { id: 'preset_sunny', name: '阳光糖糖', skin: 0, hair: 'twin_tails', hairColor: '#8B5A3C', face: 'smile', top: null, bottom: null, dress: 'dress_pink', shoes: 'shoes_mary', acc: ['bow_red'] },
    { id: 'preset_pony', name: '元气小马', skin: 1, hair: 'ponytail', hairColor: '#3D3545', face: 'cheer', top: 'top_cloud', bottom: 'bottom_cream', dress: null, shoes: 'shoes_mary', acc: [] },
    { id: 'preset_bun', name: '云朵团子', skin: 0, hair: 'buns', hairColor: '#D8B77A', face: 'calm', top: null, bottom: null, dress: 'dress_pink', shoes: 'shoes_mary', acc: [] },
    { id: 'preset_curl', name: '卷卷小熊', skin: 2, hair: 'curls', hairColor: '#B77D50', face: 'wink', top: 'top_cloud', bottom: 'bottom_cream', dress: null, shoes: 'shoes_mary', acc: ['bow_red'] },
    { id: 'preset_braid', name: '麦穗公主', skin: 3, hair: 'princess_braid', hairColor: '#3D3545', face: 'shy', top: null, bottom: null, dress: 'dress_pink', shoes: 'shoes_mary', acc: ['bow_red'] },
    { id: 'preset_bob', name: '薄荷波波', skin: 1, hair: 'bob', hairColor: '#8EBBA8', face: 'surprise', top: 'top_cloud', bottom: 'bottom_cream', dress: null, shoes: 'shoes_mary', acc: [] },
    { id: 'preset_short', name: '清爽小橘', skin: 2, hair: 'short', hairColor: '#C77362', face: 'smile', top: 'top_cloud', bottom: 'bottom_cream', dress: null, shoes: 'shoes_mary', acc: ['bow_red'] },
    { id: 'preset_taro', name: '香芋刘海', skin: 0, hair: 'side_swept', hairColor: '#B497CC', face: 'cheer', top: null, bottom: null, dress: 'dress_pink', shoes: 'shoes_mary', acc: [] }
  ];
  G.data.avatarPresetById = {}; G.data.avatarPresets.forEach(preset => { G.data.avatarPresetById[preset.id] = preset; });
  G.data.avatarPresetLook = id => { const preset = G.data.avatarPresetById[id]; return preset ? { skin: preset.skin, hair: preset.hair, hairColor: preset.hairColor, face: preset.face, top: preset.top, bottom: preset.bottom, dress: preset.dress, shoes: preset.shoes, acc: preset.acc.slice() } : null; };
  // 形象指纹：只看外观字段，用来判断两位小朋友是否“撞脸”。
  G.data.avatarFingerprint = avatar => avatar ? JSON.stringify([avatar.skin, avatar.hair, String(avatar.hairColor || '').toUpperCase(), avatar.face, avatar.top || null, avatar.bottom || null, avatar.dress || null, avatar.shoes || null, (Array.isArray(avatar.acc) ? avatar.acc : []).slice().sort()]) : '';
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const record = value => !!value && Object.prototype.toString.call(value) === '[object Object]';
  const check = condition => { if (!condition) throw new Error('换装存档格式有误，请使用完整的本地存档。'); };
  const lookKeys = ['skin', 'hair', 'hairColor', 'face', 'top', 'bottom', 'dress', 'shoes', 'acc'];
  function look(raw, owned) {
    check(record(raw)); const result = {};
    check(Number.isInteger(raw.skin) && raw.skin >= 0 && raw.skin < 4); result.skin = raw.skin;
    check(G.data.avatarHairStyles.some(item => item.id === raw.hair)); result.hair = raw.hair;
    check(typeof raw.hairColor === 'string' && G.data.avatarHairColors.some(item => item.id === raw.hairColor.toUpperCase())); result.hairColor = raw.hairColor.toUpperCase();
    check(G.data.avatarFaces.some(item => item.id === raw.face)); result.face = raw.face;
    for (const category of ['top', 'bottom', 'dress', 'shoes']) {
      const id = raw[category]; check(id === null || typeof id === 'string' && own(G.data.outfitById, id) && G.data.outfitById[id].category === category && owned[id] === true); result[category] = id;
    }
    check(result.dress ? result.top === null && result.bottom === null : !!result.top && !!result.bottom);
    const accessories = typeof raw.acc === 'string' ? [raw.acc] : raw.acc;
    check(Array.isArray(accessories) && accessories.length <= 4 && new Set(accessories).size === accessories.length);
    const slots = new Set(); [...accessories].forEach(id => { check(typeof id === 'string' && own(G.data.outfitById, id) && G.data.outfitById[id].category === 'acc' && owned[id] === true); const slot = G.data.outfitById[id].slot; check(!slots.has(slot)); slots.add(slot); }); result.acc = accessories.slice();
    return result;
  }
  G.data.validateAvatar = function (raw) {
    check(record(raw) && Object.keys(raw).every(key => lookKeys.concat(['owned', 'outfits']).includes(key)));
    const sourceOwned = raw.owned === undefined ? {} : raw.owned; check(record(sourceOwned)); const owned = {};
    Object.keys(sourceOwned).forEach(id => { check(own(G.data.outfitById, id) && sourceOwned[id] === true); owned[id] = true; });
    starters.forEach(id => { owned[id] = true; });
    const result = look(raw, owned), saved = raw.outfits === undefined ? [] : raw.outfits;
    check(Array.isArray(saved) && saved.length <= 3);
    result.outfits = [...saved].map(entry => {
      if (entry === null) return null;
      check(record(entry) && Object.keys(entry).every(key => lookKeys.concat(['name']).includes(key)));
      check(typeof entry.name === 'string' && [...entry.name].length >= 1 && [...entry.name].length <= 12 && !/[\u0000-\u001f]/.test(entry.name));
      return Object.assign({ name: entry.name }, look(entry, owned));
    }); result.owned = owned; return result;
  };
})(window.Game);
