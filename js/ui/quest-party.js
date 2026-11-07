/* 彩虹派对：沿用小屋手绘人物，在客厅共舞；重播只演出，不重复发奖。 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {};
  const colors = ['#EAA2B4', '#EDBE93', '#EFDA91', '#ADC99F', '#9BCDD3', '#A8BBDD', '#C3AED8'];
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  function round(c, x, y, w, h, r, fill, stroke) { c.beginPath(); c.roundRect(x, y, w, h, r); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); } }
  function open() {
    if (!G.sys.quests.ending().unlocked) { ui.toast('集齐七片彩虹、完成最后的心愿，再一起开派对吧。'); return; }
    const body = el('div', 'quest-party'), canvas = el('canvas', 'quest-party-canvas'); canvas.width = 680; canvas.height = 360;
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', '12位朋友在客厅的彩虹派对，彩带轻轻落下');
    const copy = el('p', 'quest-ending-copy', G.data.rainbowEnding?.closing || '彩虹回来了！谢谢你把一座小屋，变成了每位朋友都想回来的家。');
    const names = el('p', 'ui-small ui-muted', G.data.residents.map(d => d.name).join('、') + '，一个也不少。');
    const lines = G.data.rainbowEnding?.story || [], dialogue = el('div', 'quest-party-dialogue'), speaker = el('strong'), sentence = el('p'), storyActions = el('div', 'ui-actions'), actions = el('div', 'ui-actions');
    let lineIndex = 0;
    const listen = el('button', 'ui-button', '听一听'); listen.type = 'button'; listen.dataset.listenLabel = '听一听'; listen.addEventListener('click', () => ui.speak(sentence.textContent || copy.textContent, listen));
    const next = el('button', 'ui-button ui-button-soft', '下一句'); next.type = 'button'; next.addEventListener('click', () => { G.audio.stopSpeech(); lineIndex = (lineIndex + 1) % Math.max(1, lines.length); showLine(); });
    function showLine() { const line = lines[lineIndex]; if (!line) return; const def = G.data.residents.find(d => d.id === line.speaker); speaker.textContent = (def ? def.name : '糯米') + ' · ' + (lineIndex + 1) + ' / ' + lines.length; sentence.textContent = line.text; listen.dataset.speechKey = 'rainbow-party-ending-' + lineIndex; listen.textContent = '听一听'; listen.setAttribute('aria-pressed', 'false'); next.textContent = lineIndex === lines.length - 1 ? '再读一遍' : '下一句'; }
    sentence.setAttribute('aria-live', 'polite'); dialogue.append(speaker, sentence); storyActions.append(listen); if (lines.length) storyActions.append(next); showLine();
    const close = el('button', 'ui-button ui-button-primary', '把快乐收好'); close.type = 'button';
    actions.append(close); body.append(canvas); if (lines.length) body.append(dialogue); body.append(storyActions, copy, names, actions);
    let stopped = false, raf = null, last = 0, activeTime = 0, previous = 0;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 缓存同一套居民绘图，仅舞步与彩带逐帧绘制，关窗立即释放。
    const holder = el('div', 'quest-sprite-holder'); holder.setAttribute('aria-hidden', 'true'); document.body.append(holder);
    const sprites = G.data.residents.map(def => { const sprite = el('canvas'); sprite.style.width = '96px'; sprite.style.height = '124px'; holder.append(sprite); G.render.drawCharacter(sprite, def.id); return { def, sprite }; }); holder.remove();
    function draw() {
      if (stopped || document.hidden) return;
      const c = canvas.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1), rect = canvas.getBoundingClientRect(), ratio = Math.max(1, rect.width || 680) * dpr / 680;
      const pixelWidth = Math.round(680 * ratio), pixelHeight = Math.round(360 * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
      c.setTransform(ratio, 0, 0, ratio, 0, 0); c.clearRect(0, 0, 680, 360);
      round(c, 0, 0, 680, 360, 22, '#F9EADB'); round(c, 18, 16, 644, 238, 14, '#F9DBE3', '#DDBAC1');
      c.fillStyle = '#E8C8A7'; c.fillRect(18, 207, 644, 137); c.strokeStyle = '#CDAA8A'; c.lineWidth = 1;
      for (let y = 218; y < 344; y += 24) { c.beginPath(); c.moveTo(18, y); c.lineTo(662, y); c.stroke(); }
      for (const x of [68, 527]) { round(c, x, 65, 84, 101, 15, '#D3E8E8', '#C4A897'); c.strokeStyle = '#F9F0D9'; c.lineWidth = 6; c.beginPath(); c.moveTo(x + 42, 65); c.lineTo(x + 42, 166); c.moveTo(x, 116); c.lineTo(x + 84, 116); c.stroke(); }
      // 七色拱线与小旗，是派对自己的庆祝图案。
      for (let i = 0; i < 7; i++) { c.strokeStyle = colors[i]; c.lineWidth = 8; c.beginPath(); c.arc(340, 122, 78 - i * 8, Math.PI, 0); c.stroke(); }
      c.strokeStyle = '#B69A98'; c.lineWidth = 2; c.beginPath(); c.moveTo(36, 31); c.quadraticCurveTo(340, 98, 644, 31); c.stroke();
      for (let i = 0; i < 13; i++) { const x = 50 + i * 48, y = 32 + Math.sin((i + 1) / 14 * Math.PI) * 28; c.fillStyle = colors[i % 7]; c.beginPath(); c.moveTo(x - 10, y); c.lineTo(x + 10, y + 2); c.lineTo(x + 1, y + 21); c.closePath(); c.fill(); }
      const t = activeTime / 1000;
      sprites.forEach(({ def, sprite }, index) => {
        const row = Math.floor(index / 6), col = index % 6, x = 80 + col * 104, foot = 214 + row * 109, phase = t * 3.5 + index * .8, bounce = reduced ? 0 : Math.sin(phase) * 5;
        c.fillStyle = '#A0846D25'; c.beginPath(); c.ellipse(x, foot + 1, 28, 6, 0, 0, Math.PI * 2); c.fill();
        c.save(); c.translate(x, foot + bounce); c.rotate(reduced ? 0 : Math.sin(phase) * .035); c.drawImage(sprite, -36, -90, 72, 90); c.restore();
        c.fillStyle = '#765566'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '12px "PingFang SC", sans-serif'; c.fillText(def.name, x, foot + 14);
      });
      const count = reduced ? 12 : 36;
      for (let i = 0; i < count; i++) { const x = 23 + ((i * 79 + (reduced ? 0 : Math.sin(t + i) * 10)) % 636), y = reduced ? 28 + i % 3 * 18 : (i * 49 + t * (21 + i % 5 * 4)) % 315; c.save(); c.translate(x, y); c.rotate(i + (reduced ? 0 : t * .5)); c.fillStyle = colors[i % 7]; c.fillRect(-3, -1, 6, 3); c.restore(); }
    }
    function frame(now) {
      if (stopped || document.hidden || reduced) return;
      if (!previous) previous = now; activeTime += Math.min(80, now - previous); previous = now;
      if (now - last >= 1000 / 24) { last = now; draw(); }
      raf = requestAnimationFrame(frame);
    }
    function visibility() { if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = null; previous = 0; } else { draw(); if (!reduced && !raf && !stopped) raf = requestAnimationFrame(frame); } }
    const modal = ui.modal({ title: '彩虹派对', content: body, onClose() { stopped = true; if (raf) cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', visibility); sprites.length = 0; } });
    close.addEventListener('click', () => { const result = G.sys.quests.markEndingSeen(); if (result && !result.ok) { ui.toast(result.message); return; } modal.close(); ui.refresh(); });
    document.addEventListener('visibilitychange', visibility); requestAnimationFrame(() => { draw(); if (!reduced && !stopped && !document.hidden) raf = requestAnimationFrame(frame); });
  }
  ui.questParty = { open };
})(window.Game);
