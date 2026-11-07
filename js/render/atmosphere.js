/* 天空、季节天气与独立夜幕；所有坐标是画布的 CSS 逻辑像素。 */
(function (G) {
  'use strict';
  const TAU = Math.PI * 2;
  const runtime = G.runtime.atmosphere = { weatherKey: '', particles: [], lastAt: null, skyKey: '', stars: [], mask: null, maskContext: null };
  const clamp = (n, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(n)) ? Number(n) : min));
  function seed(text) { let value = 2166136261; for (const char of String(text)) value = Math.imul(value ^ char.charCodeAt(0), 16777619); return value >>> 0; }
  function random(seedValue) { let value = seedValue >>> 0; return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; }; }
  function mix(a, b, value) {
    const x = a.match(/\w\w/g).map(part => parseInt(part, 16)), y = b.match(/\w\w/g).map(part => parseInt(part, 16));
    return '#' + x.map((part, index) => Math.round(part + (y[index] - part) * value).toString(16).padStart(2, '0')).join('');
  }
  function dimensions(options) { return { width: clamp(options.width, 1, 10000), height: clamp(options.height, 1, 10000) }; }
  function snapshot(options) { return options.time || (G.sys.time && G.sys.time.current ? G.sys.time.current() : { phase: 'day', nightness: 0, weather: 'clear', date: 'local' }); }
  function weatherType(time) { const value = typeof time.weather === 'object' ? time.weather.type : time.weather; return ['clear', 'cloudy', 'rain', 'snow', 'sakura', 'leaves'].includes(value) ? value : 'clear'; }
  function reduced(options) { return !!options.reducedMotion; }
  function nowValue(options) { return Number.isFinite(options.now) ? options.now : typeof performance !== 'undefined' ? performance.now() : Date.now(); }
  function hidden() { return typeof document !== 'undefined' && document.hidden; }
  function circle(c, x, y, radius, fill) { c.fillStyle = fill; c.beginPath(); c.arc(x, y, radius, 0, TAU); c.fill(); }
  function cloud(c, x, y, size, fill, highlight) {
    c.save(); c.translate(x, y); c.scale(size, size);
    const grad = c.createLinearGradient(0, -48, 0, 22);
    grad.addColorStop(0, highlight || fill); grad.addColorStop(1, fill);
    c.fillStyle = grad;
    c.beginPath(); c.moveTo(-47, 7); c.bezierCurveTo(-63, -9, -40, -29, -23, -21); c.bezierCurveTo(-17, -49, 25, -47, 29, -19); c.bezierCurveTo(52, -30, 71, 0, 51, 13); c.bezierCurveTo(30, 22, -28, 22, -47, 7); c.fill();
    c.restore();
  }
  function star(c, x, y, radius, opacity, tone) {
    c.save(); c.globalAlpha *= opacity;
    const halo = c.createRadialGradient(x, y, 0, x, y, radius * 2.4);
    halo.addColorStop(0, tone || '#FFF6D6'); halo.addColorStop(.4, 'rgba(255,244,214,0.32)'); halo.addColorStop(1, 'rgba(255,244,214,0)');
    c.fillStyle = halo; c.beginPath(); c.arc(x, y, radius * 2.4, 0, TAU); c.fill();
    c.fillStyle = '#FFFFFF';
    c.beginPath(); c.moveTo(x, y - radius); c.quadraticCurveTo(x + radius * .18, y - radius * .18, x + radius, y); c.quadraticCurveTo(x + radius * .18, y + radius * .18, x, y + radius); c.quadraticCurveTo(x - radius * .18, y + radius * .18, x - radius, y); c.quadraticCurveTo(x - radius * .18, y - radius * .18, x, y - radius); c.fill(); c.restore();
  }
  function rainbow(c, width, height, nightness, permanent) {
    const x = width * (permanent ? .55 : .19), y = height * (permanent ? .62 : .42), radius = Math.max(12, Math.min(width * (permanent ? .36 : .18), height * (permanent ? .5 : .28))), band = Math.min(Math.max(3, radius * .045), radius / 9);
    const baseAlpha = permanent ? .68 - nightness * .26 : .64 * (1 - nightness * .88);
    c.save(); c.globalAlpha *= baseAlpha; c.lineCap = 'round'; c.lineWidth = band * 1.28;
    // 柔光大气背光层，消除生硬线条感。
    const bloom = c.createRadialGradient(x, y, Math.max(1, radius - band * 8.5), x, y, radius + band * 2.5);
    bloom.addColorStop(0, 'rgba(255,255,255,0)'); bloom.addColorStop(.55, 'rgba(255,246,228,0.22)'); bloom.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = bloom; c.beginPath(); c.arc(x, y, radius + band * 2, Math.PI, TAU); c.fill();
    // 连续渐变七色光带：外圈暖色强、内圈冷色柔，且两端柔化消隐、左上主光区鲜明。
    const bands = [
      { rgb: '246,118,148', weight: 1.00 },
      { rgb: '252,172,112', weight: .93 },
      { rgb: '252,226,124', weight: .96 },
      { rgb: '152,222,166', weight: .80 },
      { rgb: '126,206,238', weight: .84 },
      { rgb: '156,172,236', weight: .70 },
      { rgb: '202,156,232', weight: .60 }
    ];
    bands.forEach((entry, index) => {
      const r = Math.max(2, radius - index * (band * .92));
      const grad = c.createLinearGradient(x - r, y, x + r, y);
      const w = entry.weight;
      grad.addColorStop(0, `rgba(${entry.rgb},0)`);
      grad.addColorStop(.14, `rgba(${entry.rgb},${(w * .38).toFixed(3)})`);
      grad.addColorStop(.36, `rgba(${entry.rgb},${w.toFixed(3)})`);
      grad.addColorStop(.64, `rgba(${entry.rgb},${(w * .82).toFixed(3)})`);
      grad.addColorStop(.86, `rgba(${entry.rgb},${(w * .32).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${entry.rgb},0)`);
      c.strokeStyle = grad; c.beginPath(); c.arc(x, y, r, Math.PI, TAU); c.stroke();
    });
    cloud(c, x - radius + band * 3, y + 2, .36, '#FFF9F0', '#FFFFFF'); cloud(c, x + radius - band * 3, y + 2, .36, '#FFF9F0', '#FFFFFF'); c.restore();
  }
  function sky(c, options) {
    options = options || {};
    const { width, height } = dimensions(options), time = snapshot(options), nightness = clamp(time.nightness, 0, 1), kind = weatherType(time), at = reduced(options) ? 0 : nowValue(options) / 1000;
    let top = nightness < .46 ? mix('CDEAF2', '8A80AA', nightness / .46) : mix('8A80AA', '14213D', (nightness - .46) / .54);
    let mid = nightness < .46 ? mix('E6F4F8', 'D898A8', nightness / .46) : mix('D898A8', '223254', (nightness - .46) / .54);
    let bottom = nightness < .46 ? mix('FFF6E5', 'FFC3A6', nightness / .46) : mix('FFC3A6', '344769', (nightness - .46) / .54);
    if (kind === 'cloudy' || kind === 'rain' || kind === 'snow') { const amount = kind === 'rain' ? .4 : .22; top = mix(top.slice(1), '9DAABD', amount * (1 - nightness * .6)); mid = mix(mid.slice(1), 'B8C0CF', amount * (1 - nightness * .6)); bottom = mix(bottom.slice(1), 'D6D2DB', amount * (1 - nightness * .6)); }
    c.save(); const gradient = c.createLinearGradient(0, 0, 0, height); gradient.addColorStop(0, top); gradient.addColorStop(.52, mid); gradient.addColorStop(1, bottom); c.fillStyle = gradient; c.fillRect(0, 0, width, height);
    // 星图按日期稳定，具有强弱明暗与冷暖色温层次。
    const key = String(time.date || 'local');
    const starTones = ['#FFF8E7', '#FFE5B4', '#D8ECFF', '#FFFFFF', '#F2DCFF'];
    if (runtime.skyKey !== key || !runtime.stars.length) {
      const rng = random(seed(key + 'stars')); runtime.skyKey = key;
      runtime.stars = Array.from({ length: 86 }, (_, index) => ({
        x: rng(), y: Math.pow(rng(), 1.12) * .72,
        radius: index % 9 === 0 ? 1.35 + rng() * .95 : index % 3 === 0 ? .85 + rng() * .65 : .45 + rng() * .45,
        weight: index % 9 === 0 ? 1 : index % 3 === 0 ? .76 : .42 + rng() * .25,
        phase: rng() * TAU, glint: index % 9 === 0, halo: index % 3 === 0,
        tone: starTones[index % starTones.length]
      }));
    }
    const starOpacity = clamp((nightness - .24) / .68, 0, 1);
    if (starOpacity > 0) {
      // 银河柔光星云色差带
      const nebula = c.createRadialGradient(width * .48, height * .26, 8, width * .48, height * .26, Math.max(width, height) * .42);
      nebula.addColorStop(0, `rgba(166,142,232,${(starOpacity * .18).toFixed(3)})`);
      nebula.addColorStop(.48, `rgba(112,166,232,${(starOpacity * .09).toFixed(3)})`);
      nebula.addColorStop(1, 'rgba(30,44,82,0)');
      c.fillStyle = nebula; c.fillRect(0, 0, width, height * .78);
      runtime.stars.forEach(point => {
        const twinkle = reduced(options) ? .86 : .68 + Math.sin(at * .85 + point.phase) * .30;
        const alpha = clamp(starOpacity * (point.weight || .8) * twinkle, 0, 1);
        const sx = point.x * width, sy = point.y * height;
        if (point.glint) star(c, sx, sy, point.radius * 2.2, alpha, point.tone);
        else {
          c.save(); c.globalAlpha = alpha;
          if (point.halo) {
            const g = c.createRadialGradient(sx, sy, 0, sx, sy, point.radius * 2.6);
            g.addColorStop(0, point.tone || '#FFF8DB'); g.addColorStop(1, 'rgba(255,248,219,0)');
            c.fillStyle = g; c.beginPath(); c.arc(sx, sy, point.radius * 2.6, 0, TAU); c.fill();
          }
          circle(c, sx, sy, point.radius, point.tone || '#FFF8DB');
          c.restore();
        }
      });
    }
    if (nightness < .94 && kind !== 'rain' && kind !== 'snow') {
      const x = width * .15, y = height * (.16 + nightness * .57), radius = clamp(width * .025, 19, 30);
      c.save(); c.globalAlpha *= (1 - nightness) * (kind === 'cloudy' ? .5 : 1);
      // 丁达尔斜射柔光光束（强弱交替）
      for (let i = 0; i < 6; i++) {
        const angle = .22 + i * .19 + Math.sin(at * .25 + i) * .015;
        const spread = i % 2 === 0 ? .07 : .045, rayLen = radius * (i % 2 === 0 ? 7.2 : 5.2);
        const ray = c.createRadialGradient(x, y, radius * .4, x, y, rayLen);
        ray.addColorStop(0, i % 2 === 0 ? 'rgba(255,246,212,0.20)' : 'rgba(255,246,212,0.12)');
        ray.addColorStop(1, 'rgba(255,246,212,0)');
        c.fillStyle = ray; c.beginPath(); c.moveTo(x, y); c.arc(x, y, rayLen, angle - spread, angle + spread); c.closePath(); c.fill();
      }
      // 多层柔光日冕与暖阳核心（去除生硬卡通五官）
      const glow = c.createRadialGradient(x, y, radius * .3, x, y, radius * 3.8);
      glow.addColorStop(0, 'rgba(255,245,200,0.68)'); glow.addColorStop(.38, 'rgba(255,226,162,0.26)'); glow.addColorStop(1, 'rgba(255,231,176,0)');
      c.fillStyle = glow; c.fillRect(x - radius * 3.8, y - radius * 3.8, radius * 7.6, radius * 7.6);
      const core = c.createRadialGradient(x - radius * .18, y - radius * .18, radius * .08, x, y, radius);
      core.addColorStop(0, '#FFFFFF'); core.addColorStop(.58, '#FFF0B8'); core.addColorStop(1, '#FFD685');
      circle(c, x, y, radius, core); c.restore();
    }
    if (nightness > .24) {
      const x = width * .84, y = height * .17, radius = clamp(width * .031, 23, 36);
      c.save(); c.globalAlpha *= clamp((nightness - .24) / .66, 0, 1);
      const glow = c.createRadialGradient(x, y, radius * .4, x, y, radius * 3.4);
      glow.addColorStop(0, 'rgba(255,242,198,0.36)'); glow.addColorStop(.42, 'rgba(192,216,255,0.14)'); glow.addColorStop(1, 'rgba(249,232,187,0)');
      c.fillStyle = glow; c.fillRect(x - radius * 3.4, y - radius * 3.4, radius * 6.8, radius * 6.8);
      // 地球照暗面微光 + 渐变亮面弯月
      circle(c, x, y, radius, 'rgba(128,152,196,0.22)');
      const moonGrad = c.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
      moonGrad.addColorStop(0, '#FFFDF4'); moonGrad.addColorStop(.65, '#FFECB3'); moonGrad.addColorStop(1, '#F2C97D');
      c.fillStyle = moonGrad; c.beginPath(); c.moveTo(x, y - radius); c.arc(x, y, radius, -Math.PI / 2, Math.PI / 2); c.quadraticCurveTo(x - radius * .53, y, x, y - radius); c.fill();
      star(c, x - radius * 1.65, y + radius * 1.1, 5, .85, '#FFF6D6'); c.restore();
    }
    const cloudCount = kind === 'cloudy' || kind === 'rain' || kind === 'snow' ? 7 : options.fewClouds ? 2 : 4;
    for (let index = 0; index < cloudCount; index++) {
      const drift = at * (index % 2 ? 2.1 : 1.1), x = ((width * (.07 + index * .24) + drift) % (width + 180)) - 90, y = height * (.16 + (index % 3) * .11);
      const color = kind === 'rain' ? mix('C5C4D1', '52627D', nightness) : mix('F2EFE9', '485A78', nightness);
      const highlight = kind === 'rain' ? mix('E2E1EC', '6C7E9B', nightness) : mix('FFFFFF', '6B7FA1', nightness);
      c.save(); c.globalAlpha *= nightness > .7 ? .48 : .76; cloud(c, x, y, .8 + index % 3 * .25, color, highlight); c.restore();
    }
    const pieces = options.state && options.state.rainbowPieces || [], permanentRainbow = new Set(pieces.filter(color => ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'].includes(color))).size === 7;
    if (permanentRainbow || time.rainbow) rainbow(c, width, height, nightness, permanentRainbow);
    c.restore(); return { phase: time.phase, nightness, weather: kind, stars: starOpacity > 0 ? runtime.stars.length : 0, permanentRainbow };
  }
  function particleField(kind, date, width, height, smallMotion) {
    const limit = kind === 'rain' ? 68 : kind === 'snow' ? 42 : 26;
    const count = smallMotion ? Math.min(8, limit) : Math.max(12, Math.min(limit, Math.floor(width * height / (kind === 'rain' ? 9000 : 15000))));
    const key = kind + ':' + date + ':' + count;
    if (runtime.weatherKey === key) return;
    const rng = random(seed(key)); runtime.weatherKey = key; runtime.lastAt = null;
    runtime.particles = Array.from({ length: count }, (_, index) => ({ x: rng(), y: rng(), size: 2 + rng() * (kind === 'snow' ? 2.5 : 4.5), speed: .65 + rng() * .8, rotation: rng() * TAU, phase: rng() * TAU, index }));
  }
  function petal(c, point, kind, x, y) {
    c.save(); c.translate(x, y); c.rotate(point.rotation); const size = point.size;
    if (kind === 'sakura') {
      c.fillStyle = point.index % 2 ? '#F2BDD0' : '#FFE0E9'; c.strokeStyle = '#E1A6BD'; c.lineWidth = .6;
      c.beginPath(); c.moveTo(0, -size); c.bezierCurveTo(size * 1.2, -size, size * 1.2, size, 0, size * 1.5); c.bezierCurveTo(-size, size, -size, -size, -size * .25, -size); c.lineTo(0, -size * .55); c.closePath(); c.fill(); c.stroke();
    } else {
      c.fillStyle = ['#DCA16D', '#E7BA72', '#C78D70'][point.index % 3]; c.strokeStyle = '#A67E62'; c.lineWidth = .7;
      c.beginPath(); c.moveTo(0, -size * 1.6); c.bezierCurveTo(size * 1.3, -size * .7, size, size, 0, size * 1.3); c.bezierCurveTo(-size * 1.4, size * .8, -size * .8, -size, 0, -size * 1.6); c.fill(); c.beginPath(); c.moveTo(0, -size); c.lineTo(0, size * 1.7); c.moveTo(0, 0); c.lineTo(size * .5, -size * .4); c.moveTo(0, size * .3); c.lineTo(-size * .55, -size * .1); c.stroke();
    }
    c.restore();
  }
  function weather(c, options) {
    options = options || {};
    const { width, height } = dimensions(options), time = snapshot(options), kind = weatherType(time), smallMotion = reduced(options);
    if (hidden()) { runtime.lastAt = null; return { weather: kind, count: 0, hidden: true }; }
    if (!['rain', 'snow', 'sakura', 'leaves'].includes(kind)) { runtime.weatherKey = ''; runtime.particles = []; runtime.lastAt = null; return { weather: kind, count: 0 }; }
    particleField(kind, time.date || 'local', width, height, smallMotion);
    const at = nowValue(options), dt = smallMotion || runtime.lastAt === null ? 0 : clamp((at - runtime.lastAt) / 1000, 0, .04); runtime.lastAt = at;
    c.save(); c.lineCap = 'round';
    runtime.particles.forEach(point => {
      if (dt) {
        point.y += dt * (kind === 'rain' ? 190 : kind === 'snow' ? 22 : 31) * point.speed / height;
        point.x += dt * (kind === 'rain' ? -31 : 8 + Math.sin(at / 1800 + point.phase) * 15) / width;
        point.rotation += dt * (kind === 'sakura' ? .55 : .23) * point.speed;
        if (point.y > 1.04) { point.y = -.04; point.x = (point.x + .381966) % 1; }
        if (point.x < -.05) point.x += 1.1; if (point.x > 1.05) point.x -= 1.1;
      }
      const x = point.x * width, y = point.y * height;
      if (kind === 'rain') {
        c.globalAlpha = .3 + point.speed * .16; c.strokeStyle = time.nightness > .5 ? '#C0D9F2' : '#92AFCB'; c.lineWidth = point.index % 3 ? 1 : 1.5;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x - 2.5, y + 10 + point.size); c.stroke();
        if (point.index % 9 === 0) { c.globalAlpha *= .5; c.beginPath(); c.ellipse(x, height * (.84 + point.y * .12), point.size * 1.6, point.size * .35, 0, 0, TAU); c.stroke(); }
      } else if (kind === 'snow') {
        c.globalAlpha = .55 + point.speed * .2; circle(c, x, y, point.size * .7, '#FFFFFF');
        if (point.index % 7 === 0) { c.strokeStyle = '#F8FCFF'; c.lineWidth = 1; for (let arm = 0; arm < 3; arm++) { const angle = arm * Math.PI / 3; c.beginPath(); c.moveTo(x - Math.cos(angle) * point.size * 1.5, y - Math.sin(angle) * point.size * 1.5); c.lineTo(x + Math.cos(angle) * point.size * 1.5, y + Math.sin(angle) * point.size * 1.5); c.stroke(); } }
      } else { c.globalAlpha = .8; petal(c, point, kind, x, y); }
    });
    c.restore(); return { weather: kind, count: runtime.particles.length, reducedMotion: smallMotion };
  }
  function maskCanvas(width, height) {
    if (!runtime.mask) {
      if (typeof OffscreenCanvas === 'function') runtime.mask = new OffscreenCanvas(1, 1);
      else if (typeof document !== 'undefined' && document.createElement) runtime.mask = document.createElement('canvas');
      if (!runtime.mask) return null;
      runtime.maskContext = runtime.mask.getContext('2d');
    }
    if (runtime.mask.width !== width) runtime.mask.width = width;
    if (runtime.mask.height !== height) runtime.mask.height = height;
    return runtime.maskContext;
  }
  function night(c, options) {
    options = options || {};
    const { width, height } = dimensions(options), time = snapshot(options), nightness = clamp(options.nightness === undefined ? time.nightness : options.nightness, 0, 1);
    if (nightness < .025) return { nightness, lights: 0 };
    const lights = (options.lights || []).filter(light => Number.isFinite(light.x) && Number.isFinite(light.y)).slice(0, 64);
    // 离屏最大边为1600，避免高DPI和大显示器为夜幕额外分配巨量显存。
    const scale = Math.min(1, 1600 / Math.max(width, height)), maskWidth = Math.max(1, Math.round(width * scale)), maskHeight = Math.max(1, Math.round(height * scale));
    const mask = maskCanvas(maskWidth, maskHeight);
    if (!mask) return { nightness, lights: 0, unavailable: true };
    mask.save(); mask.setTransform(scale, 0, 0, scale, 0, 0); mask.globalCompositeOperation = 'source-over'; mask.globalAlpha = 1; mask.clearRect(0, 0, width, height);
    mask.fillStyle = 'rgba(16,23,48,' + nightness * .56 + ')'; mask.fillRect(0, 0, width, height); mask.globalCompositeOperation = 'destination-out';
    lights.forEach(light => {
      const radius = clamp(light.radius === undefined ? 85 : light.radius, 10, 360), strength = clamp(light.strength === undefined ? .93 : light.strength, 0, 1);
      const glow = mask.createRadialGradient(light.x, light.y, radius * .06, light.x, light.y, radius);
      glow.addColorStop(0, 'rgba(255,255,255,' + strength + ')'); glow.addColorStop(.26, 'rgba(255,255,255,' + strength * .92 + ')'); glow.addColorStop(1, 'rgba(255,255,255,0)'); mask.fillStyle = glow; mask.beginPath(); mask.arc(light.x, light.y, radius, 0, TAU); mask.fill();
    });
    mask.restore(); c.save(); c.drawImage(runtime.mask, 0, 0, maskWidth, maskHeight, 0, 0, width, height);
    lights.forEach(light => {
      const radius = clamp(light.radius === undefined ? 85 : light.radius, 10, 360), strength = clamp(light.strength === undefined ? .93 : light.strength, 0, 1);
      const glow = c.createRadialGradient(light.x, light.y, 0, light.x, light.y, radius * .8);
      glow.addColorStop(0, 'rgba(255,210,131,' + .17 * nightness * strength + ')'); glow.addColorStop(.45, 'rgba(255,222,160,' + .07 * nightness * strength + ')'); glow.addColorStop(1, 'rgba(255,227,177,0)'); c.fillStyle = glow; c.beginPath(); c.arc(light.x, light.y, radius * .8, 0, TAU); c.fill();
    });
    c.restore(); return { nightness, lights: lights.length };
  }
  function reset() { runtime.weatherKey = ''; runtime.particles = []; runtime.lastAt = null; runtime.skyKey = ''; runtime.stars = []; runtime.mask = null; runtime.maskContext = null; }
  G.atmosphere = { sky, weather, night, reset };
})(window.Game);
