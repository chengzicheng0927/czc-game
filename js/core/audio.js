/* 原创轻快配乐与木质触音；所有音色均本地合成，无网络请求。 */
(function (G) {
  'use strict';
  const config = G.data.audio;
  const voices = new Set();
  let context, graph, wave, musicWaves, noise, timer = null, pendingClick = null, musicTransition = null;
  let initialized = false, unlocked = false, stopped = false, resuming = null;
  let mode = '', score = null, cursor = 0, origin = 0, seed = 76231;
  let concertToken = 0, birthdayToken = 0, effectToken = 0, lastBirthdayClaim = '';
  let lastEffect = -Infinity, lastEffectPriority = 0, lastEffectKind = '', effectTimes = {};
  let speechToken = 0, speechTimer = null, speaking = false;
  let speechManual = false, speechKey = '', speechVoiceURI = '', activeVoiceSetting = '', lastTts = false;
  let lastMusicGain = -1, lastSfxGain = -1, remembered = { music: 0.22, sfx: 0.45 };
  const settings = () => (G.state && G.state.settings) || { music: 0, sfx: 0, tts: false };
  const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const frequency = note => 440 * Math.pow(2, (note - 69) / 12);
  const hidden = () => !!document.hidden;
  const allMuted = () => clamp(settings().music) === 0 && clamp(settings().sfx) === 0;
  const effectFor = kind => Object.prototype.hasOwnProperty.call(config.effects, kind) ? config.effects[kind] : null;

  function ramp(param, value, seconds) {
    const now = context.currentTime;
    // cancelAndHold 保留正在淡入/淡出的真实值，连续拖动音量也不会产生跳变。
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
    else { param.cancelScheduledValues(now); param.setValueAtTime(param.value, now); }
    param.linearRampToValueAtTime(value, now + seconds);
  }
  function disconnect(node) { try { node.disconnect(); } catch (_) {} }
  function makeContext() {
    if (context) return context;
    const Constructor = window.AudioContext || window.webkitAudioContext;
    if (!Constructor) return null;
    try {
      context = new Constructor();
      const musicIn = context.createGain(), musicOut = context.createGain(), sfxOut = context.createGain();
      const reverb = context.createConvolver(), wet = context.createGain(), reverbFilter = context.createBiquadFilter();
      musicOut.gain.value = 0; sfxOut.gain.value = 0; wet.gain.value = config.mix.wet;
      reverbFilter.type = 'lowpass'; reverbFilter.frequency.value = 1450;
      // 固定种子的短房间脉冲，不带长而亮的电子尾音。
      const impulse = context.createBuffer(2, Math.ceil(context.sampleRate * 1.45), context.sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const samples = impulse.getChannelData(channel); let previous = 0;
        for (let i = 0; i < samples.length; i++) {
          previous = previous * 0.55 + (random() * 2 - 1) * 0.45;
          samples[i] = previous * Math.pow(1 - i / samples.length, 3.5) * 0.35;
        }
      }
      reverb.buffer = impulse;
      musicIn.connect(musicOut); musicIn.connect(reverb); reverb.connect(reverbFilter); reverbFilter.connect(wet); wet.connect(musicOut);
      musicOut.connect(context.destination); sfxOut.connect(context.destination);
      const real = new Float32Array(config.instrument.harmonics.length), imag = new Float32Array(config.instrument.harmonics);
      wave = context.createPeriodicWave(real, imag, { disableNormalization: false });
      musicWaves = Object.create(null);
      Object.keys(config.musicInstrument).forEach(role => {
        const harmonics = config.musicInstrument[role].harmonics;
        musicWaves[role] = context.createPeriodicWave(new Float32Array(harmonics.length), new Float32Array(harmonics), { disableNormalization: false });
      });
      noise = context.createBuffer(1, Math.ceil(context.sampleRate * config.feedback.noiseSeconds), context.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = (random() * 2 - 1) * Math.pow(1 - i / samples.length, 2);
      graph = { musicIn, musicOut, sfxOut, reverb, reverbFilter, wet };
      context.onstatechange = () => { if (context.state === 'running') refresh(); else { haltMusic(); cancelEffects(); } };
      return context;
    } catch (_) {
      if (context && context.close) { try { const closing = context.close(); if (closing && closing.catch) closing.catch(() => {}); } catch (_) {} }
      context = null; graph = null; return null;
    }
  }
  function track(source, nodes, group, start, envelope) {
    const voice = { source, nodes, group, start, envelope };
    voices.add(voice);
    source.onended = () => { nodes.forEach(disconnect); voices.delete(voice); };
    return voice;
  }
  function stopVoices(group, fade) {
    if (!context) return;
    const seconds = fade === undefined ? config.mix.fade : fade, end = context.currentTime + seconds + 0.01;
    voices.forEach(voice => {
      if ((group && voice.group !== group) || voice.stopping) return;
      voice.stopping = true;
      // 尚未起音的声部直接取消，已经发声的声部随总线淡出。
      if (voice.envelope && voice.start <= context.currentTime) ramp(voice.envelope.gain, 0.0001, seconds);
      try { voice.source.stop(voice.start > context.currentTime ? context.currentTime : end); } catch (_) {}
    });
  }
  function felt(note, start, duration, velocity, group, pan) {
    const oscillator = context.createOscillator(), envelope = context.createGain(), filter = context.createBiquadFilter();
    oscillator.setPeriodicWave(wave); oscillator.frequency.value = frequency(note);
    oscillator.detune.value = (random() - 0.5) * 3;
    filter.type = 'lowpass'; filter.Q.value = 0.35;
    const cutoff = (group === 'music' && mode === 'night' ? 1100 : config.instrument.cutoff) * (0.85 + velocity * 0.2);
    filter.frequency.setValueAtTime(cutoff, start); filter.frequency.exponentialRampToValueAtTime(620, start + 0.65);
    const peak = velocity * (group === 'music' ? 0.09 : 0.11), release = group === 'music' ? config.instrument.release : 0.3;
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(peak, start + config.instrument.attack);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.38), start + Math.min(duration, 0.32));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration + release);
    oscillator.connect(filter); filter.connect(envelope);
    const nodes = [oscillator, filter, envelope];
    if (context.createStereoPanner) {
      const panner = context.createStereoPanner(); panner.pan.value = pan || 0; envelope.connect(panner); panner.connect(group === 'music' ? graph.musicIn : graph.sfxOut); nodes.push(panner);
    } else envelope.connect(group === 'music' ? graph.musicIn : graph.sfxOut);
    track(oscillator, nodes, group, start, envelope); oscillator.start(start); oscillator.stop(start + duration + release + 0.03);
  }
  function musicNote(event, start, duration, velocity) {
    const role = event.role || 'melody', tone = config.musicInstrument[role], night = mode === 'night';
    const oscillator = context.createOscillator(), envelope = context.createGain(), filter = context.createBiquadFilter();
    oscillator.setPeriodicWave(musicWaves[role]); oscillator.frequency.value = frequency(event.note);
    // 短起音与短尾音保留跳跃节奏，避免长毡琴尾音把八分音符糊在一起。
    filter.type = 'lowpass'; filter.Q.value = 0.45; filter.frequency.value = tone.cutoff * (night ? 0.78 : 1);
    const peak = velocity * tone.level * (night ? 0.86 : 1), attackEnd = start + Math.min(tone.attack, duration * 0.25);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(peak, attackEnd);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * tone.sustain), start + duration);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration + tone.release);
    oscillator.connect(filter); filter.connect(envelope);
    const nodes = [oscillator, filter, envelope];
    if (context.createStereoPanner) {
      const panner = context.createStereoPanner(); panner.pan.value = event.pan || 0; envelope.connect(panner); panner.connect(graph.musicIn); nodes.push(panner);
    } else envelope.connect(graph.musicIn);
    track(oscillator, nodes, 'music', start, envelope); oscillator.start(start); oscillator.stop(start + duration + tone.release + 0.02);
  }
  function wood(soft) {
    const start = context.currentTime + 0.005, source = context.createBufferSource(), filter = context.createBiquadFilter(), envelope = context.createGain();
    source.buffer = noise; filter.type = 'bandpass'; filter.frequency.value = soft ? 430 : 760; filter.Q.value = 0.75;
    envelope.gain.setValueAtTime(0, start); envelope.gain.linearRampToValueAtTime(soft ? 0.10 : 0.16, start + 0.004); envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.065);
    source.connect(filter); filter.connect(envelope); envelope.connect(graph.sfxOut);
    track(source, [source, filter, envelope], 'sfx', start, envelope); source.start(start); source.stop(start + 0.08);
  }

  function feedbackPart(part, start) {
    if (part.type === 'felt') { felt(part.note, start, part.duration, part.velocity, 'sfx', part.pan); return; }
    const source = part.type === 'noise' ? context.createBufferSource() : context.createOscillator();
    const filter = context.createBiquadFilter(), envelope = context.createGain();
    filter.type = part.filter || 'lowpass'; filter.Q.value = part.q || 0.35;
    if (part.type === 'noise') {
      source.buffer = noise; filter.frequency.setValueAtTime(part.frequency, start);
      if (part.endFrequency) filter.frequency.exponentialRampToValueAtTime(part.endFrequency, start + part.duration);
    } else {
      source.type = 'sine'; source.frequency.setValueAtTime(part.frequency, start);
      if (part.endFrequency) source.frequency.exponentialRampToValueAtTime(part.endFrequency, start + part.duration);
      filter.frequency.value = part.cutoff;
    }
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(part.gain, start + part.attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + part.duration);
    source.connect(filter); filter.connect(envelope); envelope.connect(graph.sfxOut);
    track(source, [source, filter, envelope], 'sfx', start, envelope);
    source.start(start); source.stop(start + part.duration + 0.01);
  }
  function clearClick() { if (pendingClick !== null) { clearTimeout(pendingClick); pendingClick = null; } }
  function stopBirthday() {
    birthdayToken++; stopVoices('birthday');
    if (lastEffectKind === 'birthday') { lastEffect = -Infinity; lastEffectPriority = 0; lastEffectKind = ''; }
  }
  function stopConcert() { concertToken++; stopVoices('concert'); }
  function cancelEffects() {
    effectToken++; stopBirthday(); stopConcert(); clearClick(); stopVoices('sfx');
    lastEffect = -Infinity; lastEffectPriority = 0; lastEffectKind = ''; effectTimes = {};
  }

  function musicMode() {
    if (G.sys.time && G.sys.time.current) return G.sys.time.current().phase === 'night' ? 'night' : 'day';
    const preference = settings().dayMode, hour = new Date().getHours();
    return preference === 'night' || (preference === 'real' && (hour >= 20 || hour < 6)) ? 'night' : 'day';
  }
  function makeScore(name) {
    const track = config[name], events = [];
    track.bars.forEach((bar, index) => {
      const position = index * track.beatsPerBar;
      if (bar.backing) bar.backing.forEach(note => events.push({ beat: position + note[0], note: note[1], duration: note[2], velocity: note[3], role: note[4], pan: note[5] || 0 }));
      else bar.chord.forEach((note, voice) => events.push({ beat: position + voice * 0.12, note, duration: 0.45, velocity: voice === 0 ? 0.30 : 0.22, role: voice === 0 ? 'bass' : 'chord', pan: -0.22 + voice * 0.13 }));
      bar.notes.forEach(note => events.push({ beat: position + note[0], note: note[1], duration: note[2], velocity: note[3], pan: 0.10 }));
    });
    events.sort((a, b) => a.beat - b.beat);
    return { events, beatSeconds: 60 / track.bpm, beats: track.bars.length * track.beatsPerBar + track.breath };
  }
  function schedule() {
    if (!context || context.state !== 'running' || hidden() || stopped || !clamp(settings().music)) { haltMusic(); return; }
    if (musicMode() !== mode) { changeMusic(); return; }
    const horizon = context.currentTime + config.mix.lookAhead;
    while (score && score.events.length) {
      const event = score.events[cursor], at = origin + event.beat * score.beatSeconds;
      if (at > horizon) break;
      // 设备从休眠返回时跳过过期音符，绝不一次补播几十颗音。
      if (at >= context.currentTime - 0.025) {
        const timing = (random() - 0.5) * 0.006, velocity = event.velocity * (0.98 + random() * 0.04);
        musicNote(event, Math.max(context.currentTime + 0.005, at + timing), event.duration * score.beatSeconds, velocity);
      }
      cursor++;
      if (cursor >= score.events.length) { cursor = 0; origin += score.beats * score.beatSeconds; }
      if (origin + score.beats * score.beatSeconds < context.currentTime) origin = context.currentTime + 0.18;
    }
  }
  function haltMusic() {
    if (timer !== null) { clearInterval(timer); timer = null; }
    stopVoices('music');
  }
  function changeMusic() {
    if (musicTransition !== null) return;
    haltMusic(); ramp(graph.musicOut.gain, 0, config.mix.fade); lastMusicGain = 0;
    musicTransition = setTimeout(() => { musicTransition = null; mode = ''; refresh(); }, config.mix.fade * 1000 + 30);
  }
  function beginMusic() {
    const nextMode = musicMode();
    if (mode !== nextMode || !score) { mode = nextMode; score = makeScore(mode); cursor = 0; }
    origin = context.currentTime + 0.18 - score.events[cursor].beat * score.beatSeconds;
    timer = setInterval(schedule, config.mix.tick); schedule();
  }
  function refresh() {
    const ttsDisabled = lastTts && !settings().tts;
    lastTts = !!settings().tts;
    if ((!settings().tts && !speechManual) || ttsDisabled || hidden() || allMuted() || (speaking && activeVoiceSetting !== (settings().ttsVoice || ''))) stopSpeech();
    // 即使 resume() 尚未完成，也要让静音/后台后的旧请求失效。
    if (stopped || hidden() || !clamp(settings().sfx)) cancelEffects();
    if (!context || !graph) return;
    const allowed = unlocked && !stopped && !hidden() && context.state === 'running';
    const wantedMusic = allowed ? clamp(settings().music) * config.mix.music * (speaking ? 0.35 : 1) : 0;
    if (!wantedMusic && musicTransition !== null) { clearTimeout(musicTransition); musicTransition = null; mode = ''; }
    if (wantedMusic && timer !== null && musicMode() !== mode) changeMusic();
    const musicVolume = musicTransition !== null ? 0 : wantedMusic;
    const sfxVolume = allowed ? clamp(settings().sfx) * config.mix.sfx : 0;
    if (musicVolume !== lastMusicGain) { ramp(graph.musicOut.gain, musicVolume, config.mix.fade); lastMusicGain = musicVolume; }
    if (sfxVolume !== lastSfxGain) { ramp(graph.sfxOut.gain, sfxVolume, config.mix.fade); lastSfxGain = sfxVolume; }
    if (!musicVolume) haltMusic();
    else if (timer === null && musicTransition === null) beginMusic();
    if (!sfxVolume) { clearClick(); stopVoices('sfx'); stopVoices('concert'); stopVoices('birthday'); }
  }
  function init() {
    if (initialized) return;
    initialized = true;
    if (G.bus) {
      G.bus.on('state:change', refresh); G.bus.on('time:change', refresh);
      G.bus.on('state:replace', () => { cancelEffects(); stopSpeech(); haltMusic(); mode = ''; score = null; lastBirthdayClaim = ''; refresh(); });
      Object.keys(config.feedbackEvents).forEach(name => G.bus.on(name, () => play(config.feedbackEvents[name])));
      G.bus.on('reward:received', event => { if (event && event.coin > 0) play('coin'); });
      G.bus.on('festival:claimed', event => {
        if (!event || event.festivalId !== 'player_birthday' || (event.key && event.key === lastBirthdayClaim)) return;
        lastBirthdayClaim = event.key || ''; play('birthday');
      });
    }
    if (window.speechSynthesis && window.speechSynthesis.addEventListener) window.speechSynthesis.addEventListener('voiceschanged', () => { if (G.bus) G.bus.emit('audio:voices', getVoices()); });
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pagehide', stop);
  }
  function unlock() {
    init(); stopped = false; unlocked = true;
    const ac = makeContext(); if (!ac) return Promise.resolve(false);
    if (ac.state === 'suspended' && !resuming) {
      try { resuming = Promise.resolve(ac.resume()).then(() => { resuming = null; refresh(); return ac.state === 'running'; }, () => { resuming = null; return false; }); }
      catch (_) { return Promise.resolve(false); }
    }
    refresh(); return resuming || Promise.resolve(ac.state === 'running');
  }
  function play(kind) {
    if (hidden() || !clamp(settings().sfx) || stopped) return;
    kind = kind === 'soft' ? 'error' : (kind || 'click');
    const requestedConcert = /^concert_[0-2]$/.test(kind);
    if (!effectFor(kind) && !requestedConcert && !['birthday', 'preview', 'shutter'].includes(kind)) return;
    // 显式重播替换旧段落；关闭窗口会取消相应 token，包括尚未解锁的声卡。
    if (kind === 'birthday') stopBirthday();
    if (requestedConcert) stopConcert();
    const ticket = { effect: effectToken, concert: concertToken, birthday: birthdayToken };
    if (!context || !unlocked || context.state === 'suspended') {
      unlock().then(ok => {
        if (!ok || ticket.effect !== effectToken || (requestedConcert && ticket.concert !== concertToken) || (kind === 'birthday' && ticket.birthday !== birthdayToken)) return;
        performEffect(kind, requestedConcert);
      });
      return;
    }
    performEffect(kind, requestedConcert);
  }
  function performEffect(kind, requestedConcert) {
    if (hidden() || stopped || !clamp(settings().sfx) || !context || !unlocked) return;
    if (context.state !== 'running') return;
    const concertVerse = requestedConcert && G.data.concert ? Number(kind.slice(-1)) : -1;
    const effect = effectFor(kind), priority = effect ? effect.priority : kind === 'birthday' ? config.birthday.priority : 8;
    const now = context.currentTime;
    const special = concertVerse >= 0 || kind === 'birthday';
    if (!special && effect && effectTimes[kind] !== undefined && now - effectTimes[kind] < effect.cooldown) return;
    if (!special && now - lastEffect < config.feedback.overlap && priority <= lastEffectPriority) return;
    if (kind === 'click') {
      if (pendingClick !== null) return;
      pendingClick = setTimeout(() => {
        pendingClick = null;
        if (hidden() || stopped || !clamp(settings().sfx) || context.state !== 'running') return;
        // 具体动作在按钮冒泡前奏响时，不再补一颗通用点击音。
        if (context.currentTime - lastEffect < config.feedback.overlap && lastEffectPriority >= priority) return;
        lastEffect = context.currentTime; lastEffectPriority = priority; lastEffectKind = kind; effectTimes[kind] = lastEffect;
        effect.parts.forEach(part => feedbackPart(part, context.currentTime + 0.005 + (part.delay || 0)));
      }, config.feedback.clickDelay);
      return;
    }
    clearClick();
    if (special || (now - lastEffect < config.feedback.overlap && priority > lastEffectPriority)) stopVoices('sfx', config.feedback.preemptFade);
    lastEffect = now; lastEffectPriority = priority; lastEffectKind = kind; effectTimes[kind] = now;
    if (concertVerse >= 0) {
      stopBirthday();
      G.data.concert.verses[concertVerse].notes.forEach((note, i) => felt(note, now + .02 + i * .38, i === 4 ? .65 : .3, .36, 'concert', (i % 3 - 1) * .06));
    }
    else if (kind === 'birthday') {
      stopConcert();
      config.birthday.notes.forEach(([delay, note], i) => felt(note, now + 0.02 + delay, i === config.birthday.notes.length - 1 ? .65 : .38, .45 - (i % 3) * .035, 'birthday', (i % 3 - 1) * .08));
    }
    else if (kind === 'shutter') { wood(true); felt(48, now + 0.065, 0.045, 0.13, 'sfx', 0); }
    else if (kind === 'preview') [60, 64, 67, 64].forEach((note, i) => felt(note, now + 0.02 + i * 0.55, 0.65, 0.45 - i * 0.03, 'sfx', (i - 1.5) * 0.06));
    else if (effect) effect.parts.forEach(part => feedbackPart(part, now + 0.005 + (part.delay || 0)));
  }

  function getVoices() {
    if (!window.speechSynthesis) return [];
    // 这些声线是角色效果，即使系统标注中文也不适合作为对话朗读选项。
    const noveltyVoice = voice => /\b(eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|boing|bad news|good news|whisper)\b/i.test(voice.name + ' ' + voice.voiceURI);
    const scoreVoice = voice => {
      const identity = voice.name + ' ' + voice.voiceURI;
      const standardMandarin = /zh[-_]CN|zh[-_]Hans/i.test(voice.lang);
      return (standardMandarin ? 100 : 30) + (/enhanced|premium|增强|高质量/i.test(identity) ? 90 : 0) + (/natural|siri|自然/i.test(identity) ? 65 : 0) + (/ting[ -]?ting|婷婷/i.test(identity) ? 45 : 0) + (voice.default ? 3 : 0);
    };
    // 仅列出设备已安装的常规中文声线；旧存档中的角色声线也不能绕过筛选。
    return window.speechSynthesis.getVoices().filter(voice => /^zh([_-]|$)/i.test(voice.lang) && voice.localService === true && !noveltyVoice(voice)).sort((a, b) => scoreVoice(b) - scoreVoice(a));
  }
  function speechChanged(reason) {
    if (G.bus) G.bus.emit('speech:change', { speaking, key: speechKey, voiceURI: speechVoiceURI, reason });
  }
  function stopSpeech() {
    const wasSpeaking = speaking;
    speechToken++; speaking = false; speechManual = false;
    if (speechTimer !== null) { clearTimeout(speechTimer); speechTimer = null; }
    if (wasSpeaking && window.speechSynthesis) window.speechSynthesis.cancel();
    if (wasSpeaking) speechChanged('stopped');
    if (wasSpeaking && graph && context) { lastMusicGain = -1; refresh(); }
  }
  function speak(text, options = {}) {
    const clean = String(text || '').replace(/[\u{1F000}-\u{1FAFF}\u2600-\u27BF\uFE0F\u200D★☆♡♥]/gu, '').replace(/[ \t]+/g, ' ').slice(0, 1400).trim();
    const key = options.key || clean;
    if (speaking && speechKey === key) { stopSpeech(); return { ok: true, stopped: true }; }
    if (!settings().tts && !options.manual) return { ok: false, message: '先在声音设置中打开朗读，再试着听一听。' };
    if (hidden() || allMuted()) return { ok: false, message: '小屋现在是静音状态，打开声音后就可以试听。' };
    if (!window.SpeechSynthesisUtterance) return { ok: false, message: '这个浏览器没有本机朗读功能，可以直接阅读对话。' };
    const available = getVoices(), voice = available.find(item => item.voiceURI === (options.voiceURI || settings().ttsVoice)) || available[0];
    if (!voice) return { ok: false, message: '还没找到设备已安装的中文声线，可以在系统语音设置中添加中文声线后再试。' };
    stopSpeech();
    const chunks = clean.match(/[^。！？!?；;\n]{1,72}[。！？!?；;]?/g) || [];
    if (!chunks.length) return { ok: false, message: '这里还没有可以朗读的文字。' };
    const token = ++speechToken; let index = 0;
    speechManual = !!options.manual; speechKey = key; speechVoiceURI = voice.voiceURI; activeVoiceSetting = settings().ttsVoice || '';
    speaking = true; refresh(); speechChanged('started');
    function finish() {
      if (token !== speechToken) return;
      speechToken++; speaking = false; speechManual = false; speechTimer = null;
      refresh(); speechChanged('finished');
    }
    function next() {
      speechTimer = null;
      if (token !== speechToken || (!settings().tts && !speechManual) || hidden() || allMuted()) { stopSpeech(); return; }
      if (index >= chunks.length) { finish(); return; }
      const utterance = new window.SpeechSynthesisUtterance(chunks[index++].trim());
      utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = 1; utterance.pitch = 1; utterance.volume = 0.8;
      utterance.onend = () => {
        if (token !== speechToken) return;
        if (index >= chunks.length) finish(); else speechTimer = setTimeout(next, 210);
      };
      utterance.onerror = () => { if (token === speechToken) stopSpeech(); };
      try { window.speechSynthesis.speak(utterance); } catch (_) { stopSpeech(); }
    }
    next(); return { ok: true };
  }
  function toggleMute() {
    if (!G.state || !G.store) return;
    if (!allMuted()) remembered = { music: clamp(settings().music), sfx: clamp(settings().sfx) };
    const muted = allMuted();
    G.store.update(state => { state.settings.music = muted ? remembered.music : 0; state.settings.sfx = muted ? remembered.sfx : 0; });
    unlock();
  }
  function stop() {
    stopped = true; unlocked = false; haltMusic();
    cancelEffects();
    stopSpeech(); refresh(); stopVoices();
  }
  G.audio = { init, unlock, play, speak, stopSpeech, refresh, getVoices, toggleMute, stop, stopConcert, stopBirthday };
})(window.Game);
