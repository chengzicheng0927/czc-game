/* 场景质感：小岛土层与草坪体积、房子屋檐阴影与木柱高光、全屏柔光。只叠加半透明图层，不改变任何命中或存档。 */
(function (G) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (n, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(n)) ? Number(n) : min));
  function ellipsePath(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); }
  function line(c, x1, y1, x2, y2, color, width) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = color; c.lineWidth = width; c.stroke(); }

  function box(c, x, y, w, h, top, bottom) {
    c.beginPath(); c.moveTo(x + top, y); c.lineTo(x + w - top, y); c.quadraticCurveTo(x + w, y, x + w, y + top); c.lineTo(x + w, y + h - bottom); c.quadraticCurveTo(x + w, y + h, x + w - bottom, y + h);
    c.lineTo(x + bottom, y + h); c.quadraticCurveTo(x, y + h, x, y + h - bottom); c.lineTo(x, y + top); c.quadraticCurveTo(x, y, x + top, y); c.closePath();
  }

  // 小岛在云海上的柔和落影，画在小岛之前。
  function islandUnder(c) {
    c.save();
    ellipsePath(c, 0, 392, 640, 40); c.fillStyle = 'rgba(120,98,150,.10)'; c.fill();
    ellipsePath(c, 0, 372, 470, 24); c.fillStyle = 'rgba(120,98,150,.09)'; c.fill();
    c.restore();
  }

  // 土层、草坪体积感与前缘草丛，画在小岛地面之后、花园与房子之前。
  function islandOver(c, env) {
    env = env || {};
    const sway = env.reducedMotion ? 0 : Math.sin((env.time || 0) * .7);
    c.save();
    // 1. 泥土：只在草坪下方露出的一圈里加深，越往下越暖褐，再叠几道断续的地层线和小石子。
    ellipsePath(c, 0, 220, 679, 105); c.moveTo(710, 143); c.ellipse(0, 143, 710, 158, 0, 0, TAU); c.save(); c.clip('evenodd');
    const soil = c.createLinearGradient(0, 170, 0, 326); soil.addColorStop(0, 'rgba(150,112,84,0)'); soil.addColorStop(1, 'rgba(140,100,76,.42)');
    c.fillStyle = soil; c.fillRect(-720, 140, 1440, 200);
    const side = c.createLinearGradient(-690, 0, 690, 0); side.addColorStop(0, 'rgba(140,100,76,.20)'); side.addColorStop(.18, 'rgba(140,100,76,0)'); side.addColorStop(.82, 'rgba(140,100,76,0)'); side.addColorStop(1, 'rgba(120,86,70,.26)');
    c.fillStyle = side; c.fillRect(-720, 140, 1440, 200);
    c.setLineDash([54, 20, 26, 16]); c.lineWidth = 2.2; c.strokeStyle = 'rgba(150,112,84,.30)';
    [34, 62, 88].forEach(drop => { c.beginPath(); c.ellipse(0, 143 + drop, 706 - drop * .9, 158, 0, .06, Math.PI - .06); c.stroke(); });
    c.setLineDash([]);
    for (let i = 0; i < 16; i++) {
      const x = Math.sin(i * 3.1) * 520, y = 214 + (i * 29) % 88;
      c.beginPath(); c.ellipse(x, y, 9 + i % 3 * 3, 5 + i % 2 * 2, 0, 0, TAU); c.fillStyle = i % 2 ? 'rgba(236,216,184,.55)' : 'rgba(150,112,84,.32)'; c.fill();
    }
    c.restore();
    // 2. 草坪：左上受光、边缘与前缘略深，像微微鼓起的小山坡。
    ellipsePath(c, 0, 143, 710, 158); c.save(); c.clip();
    const lit = c.createRadialGradient(-180, 70, 20, -180, 70, 760); lit.addColorStop(0, 'rgba(255,255,236,.30)'); lit.addColorStop(.6, 'rgba(255,255,236,.06)'); lit.addColorStop(1, 'rgba(255,255,236,0)');
    c.fillStyle = lit; c.fillRect(-720, -30, 1440, 340);
    const front = c.createLinearGradient(0, 215, 0, 301); front.addColorStop(0, 'rgba(86,130,98,0)'); front.addColorStop(1, 'rgba(86,130,98,.26)');
    c.fillStyle = front; c.fillRect(-720, 200, 1440, 110);
    c.restore();
    c.beginPath(); c.ellipse(0, 129, 690, 142, 0, Math.PI * 1.08, Math.PI * 1.92); c.strokeStyle = 'rgba(255,255,244,.55)'; c.lineWidth = 3; c.stroke();
    // 3. 前缘草丛，轻轻摇摆。
    for (let i = 0; i < 46; i++) {
      const angle = .08 + i / 45 * (Math.PI - .16), x = Math.cos(angle) * 704, y = 143 + Math.sin(angle) * 154 - 3, lean = Math.sin(i * 2.7) * 3 + sway * 1.6;
      const color = i % 3 ? 'rgba(122,168,128,.85)' : 'rgba(150,190,140,.85)';
      line(c, x, y, x + lean - 3, y - 11, color, 2); line(c, x, y, x + lean + 1, y - 14, color, 2); line(c, x, y, x + lean + 5, y - 10, color, 2);
    }
    c.restore();
  }

  // 房子：屋檐落在墙上的阴影、木柱的受光/背光，以及脚下的接触阴影。
  function house(c, env) {
    const top = env.top, height = env.floors * 220;
    c.save();
    const eave = c.createLinearGradient(0, top + 17, 0, top + 82); eave.addColorStop(0, 'rgba(110,70,72,.24)'); eave.addColorStop(1, 'rgba(110,70,72,0)');
    c.fillStyle = eave; c.fillRect(-496, top + 17, 992, 65);
    for (let i = 0; i < 4; i++) {
      const x = -489 + i * 320;
      c.fillStyle = 'rgba(255,255,255,.38)'; c.fillRect(x + 3, top + 6, 4, height);
      c.fillStyle = 'rgba(120,90,70,.16)'; c.fillRect(x + 13, top + 6, 4, height);
    }
    // 右侧受影的侧墙：光从左上来，右边那一面更暗，房子像一只立体的小盒子。
    const side = c.createLinearGradient(496, 0, 532, 0); side.addColorStop(0, 'rgba(120,84,76,.62)'); side.addColorStop(1, 'rgba(96,66,66,.74)');
    c.beginPath(); c.moveTo(496, top + 17); c.lineTo(530, top + 29); c.lineTo(530, 22); c.lineTo(496, 13); c.closePath(); c.fillStyle = '#E3C8A4'; c.fill(); c.fillStyle = side; c.fill(); c.strokeStyle = 'rgba(120,84,76,.55)'; c.lineWidth = 2; c.stroke();
    // 地基台座：有高光的上沿和更深的前脸，把房子稳稳垫在草坪上。
    box(c, -510, 11, 1040, 22, 9, 9); c.fillStyle = '#D8C0A0'; c.fill(); c.strokeStyle = '#BCA283'; c.lineWidth = 2; c.stroke();
    box(c, -504, 13, 1028, 6, 3, 3); c.fillStyle = 'rgba(255,255,255,.5)'; c.fill();
    box(c, -510, 25, 1040, 8, 0, 9); c.fillStyle = 'rgba(120,90,70,.28)'; c.fill();
    const foot = c.createLinearGradient(0, 33, 0, 55); foot.addColorStop(0, 'rgba(110,90,70,.20)'); foot.addColorStop(1, 'rgba(110,90,70,0)');
    c.fillStyle = foot; c.fillRect(-500, 33, 1000, 22);
    c.restore();
  }

  // 全屏柔光：白天左上角的暖阳、四周极淡的暗角、清晨黄昏的一层桃色；夜里自动退场。
  function light(c, env) {
    const width = clamp(env.width, 1, 10000), height = clamp(env.height, 1, 10000), time = env.time || {}, night = clamp(time.nightness, 0, 1), day = 1 - night;
    const kind = typeof time.weather === 'object' && time.weather ? time.weather.type : time.weather, calm = kind === 'rain' ? .3 : kind === 'cloudy' || kind === 'snow' ? .6 : 1;
    c.save();
    if (day > .02) {
      const sun = c.createRadialGradient(width * .15, height * .18, 0, width * .15, height * .18, Math.max(width, height) * .75);
      sun.addColorStop(0, 'rgba(255,238,190,' + (.2 * day * calm).toFixed(3) + ')'); sun.addColorStop(.5, 'rgba(255,244,214,' + (.07 * day * calm).toFixed(3) + ')'); sun.addColorStop(1, 'rgba(255,244,214,0)');
      c.fillStyle = sun; c.fillRect(0, 0, width, height);
      const edge = c.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .45, width / 2, height / 2, Math.max(width, height) * .8);
      edge.addColorStop(0, 'rgba(130,90,120,0)'); edge.addColorStop(1, 'rgba(130,90,120,' + (.1 * day).toFixed(3) + ')');
      c.fillStyle = edge; c.fillRect(0, 0, width, height);
    }
    const warm = clamp(1 - Math.abs(night - .28) / .28, 0, 1);
    if (warm > 0) { c.fillStyle = 'rgba(255,168,120,' + (.1 * warm).toFixed(3) + ')'; c.fillRect(0, 0, width, height); }
    c.restore();
  }

  G.polish = { islandUnder: islandUnder, islandOver: islandOver, house: house, light: light };
})(window.Game = window.Game || {});
