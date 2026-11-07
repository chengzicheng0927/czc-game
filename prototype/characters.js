/* 八套真实起始人物的软陶设计稿；仅用于审核原型，不读取或修改正式衣橱。 */
(function () {
  'use strict';
  const skinColors = ['#F8D9C2', '#EDBB99', '#CA9270', '#9B6B55'];
  const clothing = { shirt: '#FFF5DF', cloud: '#A8C5D8', shorts: '#E7D7BD', dress: '#ECB9CC', trim: '#FFF0D7', shoes: '#B87885', strap: '#F6D5D2', bow: '#CB8797' };
  const rows = [
    ['preset_sunny', '阳光糖糖', 0, 'twin_tails', '#8B5A3C', 'smile', true, true, '#D9A2A4', '把每一天，过成小晴天。', ['糖果双马尾', '栗子棕发', '奶油杏肤色', '微笑与草莓红结']],
    ['preset_pony', '元气小马', 1, 'ponytail', '#3D3545', 'cheer', false, false, '#97B4CF', '跑向朋友，也跑向风。', ['高高的马尾', '可可黑发', '暖蜜桃肤色', '开心弯弯眼']],
    ['preset_bun', '云朵团子', 0, 'buns', '#D8B77A', 'calm', true, false, '#D7C58B', '慢慢来，云朵会等你。', ['两颗圆圆丸子', '蜂蜜金发', '奶油杏肤色', '安静小圆嘴']],
    ['preset_curl', '卷卷小熊', 2, 'curls', '#B77D50', 'wink', false, true, '#BDA48B', '把好心情，卷进每一缕头发。', ['蓬蓬小卷发', '焦糖棕发', '焦糖蜜肤色', '俏皮眨眼']],
    ['preset_braid', '麦穗公主', 3, 'princess_braid', '#3D3545', 'shy', true, true, '#AF9FC3', '把小心愿，编进柔软的辫子。', ['花环辫与长麻花', '可可黑发', '可可棕肤色', '害羞红脸颊']],
    ['preset_bob', '薄荷波波', 1, 'bob', '#8EBBA8', 'surprise', false, false, '#8EBBA8', '转过街角，又是一个惊喜。', ['圆圆波波头', '薄荷绿发', '暖蜜桃肤色', '惊喜圆圆眼']],
    ['preset_short', '清爽小橘', 2, 'short', '#C77362', 'smile', false, true, '#D8A178', '轻轻出发，带一点橘子味的勇气。', ['轻盈小短发', '红茶橘发', '焦糖蜜肤色', '甜甜微笑']],
    ['preset_taro', '香芋刘海', 0, 'side_swept', '#B497CC', 'cheer', true, false, '#B497CC', '把一缕晚霞，藏在刘海里。', ['不对称侧分刘海', '香芋紫发', '奶油杏肤色', '开心弯弯眼']]
  ];
  const presets = rows.map(r => {
    const defaults = { skin: r[2], hair: r[3], hairColor: r[4], face: r[5], top: r[6] ? null : 'top_cloud', bottom: r[6] ? null : 'bottom_cream', dress: r[6] ? 'dress_pink' : null, shoes: 'shoes_mary', acc: r[7] ? ['bow_red'] : [] };
    return { id: r[0], name: r[1], skin: skinColors[r[2]], skinIndex: r[2], hair: r[3], hairColor: r[4], face: r[5], dress: r[6], bow: r[7], accent: r[8], tagline: r[9], marks: r[10].slice(), defaults };
  });
  const byId = Object.fromEntries(presets.map(p => [p.id, p]));
  const get = id => byId[id] || presets[0];
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function tint(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const vals = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.min(255, Math.max(0, Math.round(v + amount))));
    return '#' + vals.map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function validColor(value, fallback) { return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback; }

  const EGGY_BODY_BY_HAIR = {
    twin_tails: '#FF9EBB', ponytail: '#FFE169', buns: '#FFC2D1', curls: '#CDB4DB',
    princess_braid: '#A2D2FF', bob: '#A8E6CF', short: '#FFBE98', side_swept: '#FDE2E4'
  };

  // 所有人物共用1.65左右的身高、同一套一头身Q弹蛋仔身体；差异来自8款萌耳/揪揪、配色和表情。
  function draw(g, x, z, s, presetId, y, options) {
    const p = get(presetId), scale = Number.isFinite(s) && s > 0 ? s : 1;
    y = Number.isFinite(y) ? y : 0; options = options || {};
    const hair = p.hairColor, skin = p.skin, skinLight = tint(skin, 12), ink = '#362028';
    const bodyColor = EGGY_BODY_BY_HAIR[p.hair] || '#FF9EBB';
    const shirt = validColor(options.shirtColor, p.dress ? clothing.dress : clothing.shirt);
    const accessory = validColor(options.accessoryColor, clothing.bow);
    const pos = (a, b, c) => [x + a * scale, y + b * scale, z + c * scale];
    const size = (a, b, c) => [a * scale, b * scale, c * scale];
    const ball = (a, b, c, rx, ry, rz, color, segments = 14, rings = 10) => g.sphere(pos(a, b, c), size(rx, ry, rz), color, segments, rings);
    const box = (a, b, c, w, h, d, color, r = .04, rotation) => g.box(pos(a, b, c), size(w, h, d), color, r * scale, rotation);
    const cylinder = (a, b, c, r, h, color, top, seg = 16, rotation) => g.cylinder(pos(a, b, c), r * scale, h * scale, color, top == null ? undefined : top * scale, seg, rotation);

    ball(0, .025, 0, .44, .018, .36, '#D8B4C8', 18, 6);
    for (const side of [-1, 1]) {
      ball(side * .21, .13, .05, .148, .115, .195, clothing.shoes, 16, 10);
      ball(side * .21, .08, .055, .152, .045, .198, '#FFFFFF', 14, 8);
      box(side * .21, .17, .12, .18, .034, .055, clothing.strap, .016);
      ball(side * .21 - side * .025, .185, .155, .026, .02, .014, clothing.trim, 8, 5);
    }
    ball(0, .80, 0, .54, .58, .49, bodyColor, 26, 16);
    ball(0, .58, 0, .56, .40, .50, bodyColor, 24, 14);
    ball(0, .44, -.49, .12, .12, .11, '#FFFFFF', 12, 8);
    ball(0, .52, -.49, .04, .04, .025, hair, 8, 5);

    ball(0, 1.19, .015, .31, .21, .24, skin, 16, 10);
    ball(0, .88, .18, .42, .35, .36, skin, 24, 16);
    ball(-.08, 1.05, .44, .12, .06, .025, skinLight, 10, 6);

    if (p.dress) {
      ball(0, .47, .24, .32, .22, .29, shirt, 18, 12);
      ball(0, .35, .22, .33, .10, .28, clothing.trim, 16, 8);
      ball(-.075, .65, .495, .075, .048, .035, accessory, 10, 8);
      ball(.075, .65, .495, .075, .048, .035, accessory, 10, 8);
      ball(0, .65, .51, .038, .038, .03, clothing.trim, 8, 6);
    } else {
      ball(0, .51, .24, .31, .19, .29, shirt, 18, 12);
      ball(0, .38, .22, .32, .14, .28, clothing.shorts, 18, 10);
      ball(0, .44, .27, .30, .045, .26, clothing.trim, 14, 8);
      ball(-.06, .645, .495, .055, .042, .03, clothing.cloud, 10, 6);
      ball(0, .66, .502, .07, .055, .032, clothing.trim, 10, 6);
      ball(.06, .645, .495, .055, .042, .03, clothing.cloud, 10, 6);
    }
    for (const side of [-1, 1]) {
      ball(side * .53, .73, .05, .095, .075, .10, shirt, 12, 8);
      ball(side * .55, .66, .06, .105, .17, .115, bodyColor, 14, 10);
      ball(side * .57, .54, .07, .088, .09, .095, skin, 12, 8);
    }
    if (p.hair === 'twin_tails' || p.hair === 'ponytail') {
      cylinder(0, 1.43, 0, .038, .16, bodyColor, .032, 12);
      ball(0, 1.55, 0, .098, .095, .098, bodyColor, 14, 10);
      if (p.hair === 'twin_tails') {
        ball(-.11, 1.35, .12, .10, .065, .05, accessory, 10, 8);
        ball(.11, 1.35, .12, .10, .065, .05, accessory, 10, 8);
        ball(0, 1.35, .14, .048, .048, .04, '#FFFDF5', 8, 6);
      } else {
        ball(0, 1.35, 0, .075, .035, .075, '#FFFDF5', 10, 6);
      }
    } else if (p.hair === 'buns') {
      for (const side of [-1, 1]) {
        ball(side * .21, 1.46, 0, .11, .22, .075, bodyColor, 14, 10);
        ball(side * .21, 1.45, .05, .065, .16, .035, '#FFF0F5', 10, 8);
      }
    } else if (p.hair === 'curls') {
      for (const side of [-1, 1]) {
        ball(side * .33, 1.30, .02, .14, .14, .09, bodyColor, 14, 10);
        ball(side * .33, 1.30, .08, .08, .08, .04, '#FAF5FF', 10, 8);
      }
      cylinder(0, 1.42, 0, .032, .12, bodyColor, .026, 10);
      ball(0, 1.51, 0, .075, .072, .075, bodyColor, 12, 8);
    } else if (p.hair === 'princess_braid') {
      for (const side of [-1, 1]) {
        ball(side * .34, 1.29, 0, .15, .15, .15, '#FFFFFF', 14, 10);
        ball(side * .27, 1.21, .10, .07, .045, .045, accessory, 8, 6);
      }
      ball(0, 1.48, .02, .09, .075, .08, '#FFFFFF', 12, 8);
    } else if (p.hair === 'bob') {
      for (const side of [-1, 1]) {
        cylinder(side * .30, 1.33, .02, .135, .18, bodyColor, .022, 14);
        ball(side * .30, 1.30, .075, .062, .075, .03, '#FF9EBB', 10, 8);
      }
      cylinder(0, 1.42, 0, .03, .12, bodyColor, .024, 10);
      ball(0, 1.50, 0, .068, .065, .068, bodyColor, 12, 8);
    } else if (p.hair === 'short') {
      for (const side of [-1, 1]) {
        ball(side * .30, 1.35, .03, .11, .18, .08, bodyColor, 14, 10);
        ball(side * .30, 1.34, .08, .06, .11, .035, '#FFFDF7', 10, 8);
        ball(side * .12, 1.03, .475, .036, .022, .015, '#FFFFFF', 8, 6);
      }
    } else {
      for (const side of [-1, 1]) {
        ball(side * .38, 1.20, .02, .15, .15, .14, '#FFFDF9', 14, 10);
        ball(side * .44, 1.12, .06, .10, .10, .10, '#FFE5EC', 12, 8);
      }
      ball(0, 1.45, .02, .13, .10, .11, '#FFFDF9', 14, 10);
    }
    if (p.bow && p.hair !== 'twin_tails') {
      const bx = p.hair === 'princess_braid' ? .26 : -.25, by = 1.38;
      for (const side of [-1, 1]) ball(bx + side * .075, by, .15, .085, .058, .04, accessory, 10, 6);
      ball(bx, by, .18, .035, .042, .028, tint(accessory, 18), 8, 5);
    }
    const eyeY = p.face === 'shy' ? .89 : .91, eyeZ = .515;
    function eye(cx, closed) {
      if (closed) {
        for (let i = -2; i <= 2; i++) {
          const tArc = i / 2;
          ball(cx + tArc * .05, eyeY + (1 - tArc * tArc) * .03, eyeZ + .01, .021, .019, .015, ink, 8, 6);
        }
      } else {
        const rScale = p.face === 'surprise' ? 1.12 : 1;
        ball(cx, eyeY, eyeZ, .055 * rScale, .070 * rScale, .028, ink, 14, 10);
        ball(cx - .018, eyeY + .023, eyeZ + .023, .021, .023, .012, '#FFFFFF', 8, 6);
        ball(cx + .015, eyeY - .021, eyeZ + .021, .011, .011, .010, '#FFFFFF', 6, 6);
      }
    }
    eye(-.155, p.face === 'cheer'); eye(.155, p.face === 'cheer' || p.face === 'wink');
    for (const side of [-1, 1]) {
      ball(side * .255, .82, .455, p.face === 'shy' ? .085 : .074, .042, .025, '#FF7597', 12, 8);
      ball(side * .028, .825, .528, .025, .016, .014, '#D9536F', 8, 6);
    }
    if (p.face === 'surprise' || p.face === 'cheer') {
      ball(0, .81, .525, .044, p.face === 'surprise' ? .042 : .032, .018, '#E85D75', 10, 8);
      ball(0, .802, .533, .028, .02, .014, '#FF9EBB', 8, 6);
    } else if (p.face === 'calm') {
      ball(0, .818, .53, .022, .022, .014, '#D9536F', 8, 6);
    }
    return { id: p.id, name: p.name, height: 1.69 * scale, skin: p.skin, hair: p.hair };
  }

  let portraitCounter = 0;
  function portrait(id, options) {
    const p = get(id); options = options || {};
    const uid = 'cottage-person-' + (++portraitCounter), bodyColor = EGGY_BODY_BY_HAIR[p.hair] || '#FF9EBB';
    const shirt = validColor(options.shirtColor, p.dress ? clothing.dress : clothing.shirt);
    let topEar = '';
    if (p.hair === 'twin_tails' || p.hair === 'ponytail') {
      topEar = '<rect x="57" y="18" width="6" height="14" rx="3" fill="' + bodyColor + '"/><circle cx="60" cy="15" r="8" fill="' + bodyColor + '"/>' +
        (p.hair === 'twin_tails' ? '<ellipse cx="52" cy="28" rx="7" ry="4.5" fill="' + clothing.bow + '"/><ellipse cx="68" cy="28" rx="7" ry="4.5" fill="' + clothing.bow + '"/><circle cx="60" cy="28" r="3.5" fill="#FFFDF5"/>' : '');
    } else if (p.hair === 'buns') {
      topEar = '<ellipse cx="44" cy="20" rx="8" ry="16" fill="' + bodyColor + '"/><ellipse cx="44" cy="21" rx="4.5" ry="11" fill="#FFF0F5"/><ellipse cx="76" cy="20" rx="8" ry="16" fill="' + bodyColor + '"/><ellipse cx="76" cy="21" rx="4.5" ry="11" fill="#FFF0F5"/>';
    } else if (p.hair === 'curls') {
      topEar = '<circle cx="36" cy="30" r="10" fill="' + bodyColor + '"/><circle cx="36" cy="30" r="5.5" fill="#FAF5FF"/><circle cx="84" cy="30" r="10" fill="' + bodyColor + '"/><circle cx="84" cy="30" r="5.5" fill="#FAF5FF"/>';
    } else if (p.hair === 'princess_braid') {
      topEar = '<circle cx="35" cy="32" r="11" fill="#FFFFFF"/><circle cx="85" cy="32" r="11" fill="#FFFFFF"/><circle cx="41" cy="38" r="4" fill="' + clothing.bow + '"/><circle cx="79" cy="38" r="4" fill="' + clothing.bow + '"/>';
    } else if (p.hair === 'bob') {
      topEar = '<path d="M30 38 L36 16 L46 32 Z" fill="' + bodyColor + '"/><path d="M90 38 L84 16 L74 32 Z" fill="' + bodyColor + '"/><ellipse cx="38" cy="28" rx="4" ry="5" fill="#FF9EBB"/><ellipse cx="82" cy="28" rx="4" ry="5" fill="#FF9EBB"/>';
    } else if (p.hair === 'short') {
      topEar = '<ellipse cx="38" cy="26" rx="8" ry="13" fill="' + bodyColor + '"/><ellipse cx="38" cy="27" rx="4" ry="8" fill="#FFFDF7"/><ellipse cx="82" cy="26" rx="8" ry="13" fill="' + bodyColor + '"/><ellipse cx="82" cy="27" rx="4" ry="8" fill="#FFFDF7"/>';
    } else {
      topEar = '<circle cx="32" cy="40" r="11" fill="#FFFDF9"/><circle cx="27" cy="46" r="7" fill="#FFE5EC"/><circle cx="88" cy="40" r="11" fill="#FFFDF9"/><circle cx="93" cy="46" r="7" fill="#FFE5EC"/>';
    }
    let eyes = '';
    const closedEye = cx => '<path d="m' + (cx - 4) + ' 62q4-5 8 0" fill="none" stroke="#362028" stroke-width="2.6" stroke-linecap="round"/>';
    for (const [cx, i] of [[49, 0], [71, 1]]) {
      eyes += p.face === 'cheer' || (p.face === 'wink' && i === 1)
        ? closedEye(cx)
        : '<ellipse cx="' + cx + '" cy="62" rx="' + (p.face === 'surprise' ? 4.4 : 3.8) + '" ry="' + (p.face === 'surprise' ? 5.6 : 4.8) + '" fill="#362028"/><circle cx="' + (cx - 1.2) + '" cy="60.2" r="1.5" fill="#ffffff"/>';
    }
    const mouth = p.face === 'surprise' ? '<ellipse cx="60" cy="69" rx="3" ry="3.4" fill="#E85D75"/>' : '<path d="M56 68q2 2.5 4 0q2 2.5 4 0" fill="none" stroke="#D9536F" stroke-width="1.8" stroke-linecap="round"/>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150" class="character-portrait ' + escape(options.className || '') + '" role="img" aria-label="' + escape(p.name + '：' + p.marks.join('、')) + '"><defs><radialGradient id="' + uid + '-egg" cx=".38" cy=".32" r=".68"><stop stop-color="' + tint(bodyColor, 18) + '"/><stop offset="1" stop-color="' + bodyColor + '"/></radialGradient></defs><ellipse cx="60" cy="136" rx="32" ry="5" fill="#D8B4C8" opacity=".4"/>' + topEar + '<ellipse cx="45" cy="130" rx="11" ry="7.5" fill="' + clothing.shoes + '"/><ellipse cx="75" cy="130" rx="11" ry="7.5" fill="' + clothing.shoes + '"/><ellipse cx="22" cy="82" rx="7" ry="12" fill="' + bodyColor + '"/><ellipse cx="98" cy="82" rx="7" ry="12" fill="' + bodyColor + '"/><ellipse cx="60" cy="78" rx="38" ry="44" fill="url(#' + uid + '-egg)"/><ellipse cx="60" cy="63" rx="29" ry="23" fill="#FFF7F2"/><ellipse cx="60" cy="103" rx="22" ry="15" fill="' + shirt + '"/><ellipse cx="54" cy="86" rx="5.5" ry="3.5" fill="' + clothing.bow + '"/><ellipse cx="66" cy="86" rx="5.5" ry="3.5" fill="' + clothing.bow + '"/><circle cx="60" cy="86" r="2.8" fill="#FFFDF5"/>' + eyes + '<ellipse cx="41" cy="68" rx="5.5" ry="3" fill="#FF7597"/><ellipse cx="79" cy="68" rx="5.5" ry="3" fill="#FF7597"/>' + mouth + '</svg>';
  }

  function drawLineup(g, selectedId) {
    const placements = [];
    presets.forEach((p,i) => {
      const x = (i%4-1.5)*1.8, z = i<4?-1.2:1.1, active=p.id===selectedId;
      g.cylinder([x,.12,z],.66,.22,active?p.accent:'#EBDCC1',.66,24);
      g.cylinder([x,.24,z],.61,.045,'#FFF4DC',.61,24);
      draw(g,x,z,.83,p.id,.27);
      placements.push({id:p.id,x,z,selected:active});
    });
    return placements;
  }
  window.CottageCharacters = { presets, get, portrait, draw, drawLineup };
})();
