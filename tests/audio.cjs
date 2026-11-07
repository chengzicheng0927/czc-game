'use strict';
// 使用可推进的时钟和真实模块，验证音频生命周期；无需声卡、浏览器或网络。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');

function sandbox(options = {}) {
  let now = 0, sequence = 0;
  const timers = new Map(), contexts = [], documentEvents = {}, windowEvents = {}, utterances = [];
  const clock = {
    set(fn, delay, interval) { const id = ++sequence; timers.set(id, { fn, at: now + delay, interval }); return id; },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const next = [...timers].filter(([, value]) => value.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; contexts.forEach(context => context.finish());
        if (next[1].interval) next[1].at += next[1].interval; else timers.delete(next[0]);
        next[1].fn();
      }
      now = until; contexts.forEach(context => context.finish());
    },
    intervals() { return [...timers.values()].filter(timer => timer.interval).length; },
    timeouts() { return [...timers.values()].filter(timer => !timer.interval).length; }
  };
  class Param {
    constructor(value = 0) { this.value = value; this.events = []; }
    setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
    linearRampToValueAtTime(value, time) { this.value = value; this.events.push(['linear', value, time]); }
    exponentialRampToValueAtTime(value, time) { this.value = value; this.events.push(['exponential', value, time]); }
    cancelAndHoldAtTime(time) { this.events.push(['hold', time]); }
    cancelScheduledValues(time) { this.events.push(['cancel', time]); }
  }
  class Node {
    constructor(type) {
      this.nodeType = type; this.connections = []; this.disconnected = false;
      this.gain = new Param(1); this.frequency = new Param(440); this.Q = new Param(1); this.detune = new Param(); this.pan = new Param();
    }
    connect(node) { this.connections.push(node); return node; }
    disconnect() { this.connections = []; this.disconnected = true; }
    setPeriodicWave(wave) { this.wave = wave; }
    start(at) { this.started = at; }
    stop(at) { this.stopped = at; }
  }
  class AudioContext {
    constructor() { contexts.push(this); this.sampleRate = 1200; this.state = options.suspended ? 'suspended' : 'running'; this.destination = new Node('destination'); this.nodes = []; this.resumeCount = 0; }
    get currentTime() { return now / 1000; }
    create(type) { const node = new Node(type); this.nodes.push(node); return node; }
    createGain() { return this.create('gain'); }
    createConvolver() { return this.create('convolver'); }
    createBiquadFilter() { return this.create('filter'); }
    createStereoPanner() { return this.create('panner'); }
    createOscillator() { return this.create('oscillator'); }
    createBufferSource() { return this.create('bufferSource'); }
    createBuffer(channels, length) { const data = Array.from({ length: channels }, () => new Float32Array(length)); return { getChannelData: channel => data[channel] }; }
    createPeriodicWave(real, imag) { return { real, imag }; }
    resume() { this.resumeCount++; this.state = 'running'; if (this.onstatechange) this.onstatechange(); return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    finish() {
      this.nodes.forEach(node => {
        if (!node.ended && node.started !== undefined && node.stopped <= this.currentTime) { node.ended = true; if (node.onended) node.onended(); }
      });
    }
    sources() { return this.nodes.filter(node => ['oscillator', 'bufferSource'].includes(node.nodeType)); }
    active() { return this.sources().filter(node => !node.ended); }
  }
  const voices = options.voices || [
    { name: 'Online natural', voiceURI: 'online', lang: 'zh-CN', localService: false },
    { name: 'English', voiceURI: 'english', lang: 'en-US', localService: true },
    { name: 'Tingting', voiceURI: 'tingting', lang: 'zh-CN', localService: true },
    { name: 'Tingting Enhanced', voiceURI: 'tingting-enhanced', lang: 'zh-CN', localService: true }
  ];
  const synthesis = { cancelCount: 0, getVoices: () => voices, speak: utterance => utterances.push(utterance), cancel() { this.cancelCount++; } };
  const environment = vm.createContext({
    console, Float32Array, Set, Promise,
    setTimeout: (fn, delay) => clock.set(fn, delay || 0, 0), clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => clock.set(fn, delay, delay), clearInterval: id => timers.delete(id),
    document: { hidden: false, addEventListener(name, fn) { (documentEvents[name] ||= []).push(fn); } },
    addEventListener(name, fn) { (windowEvents[name] ||= []).push(fn); },
    AudioContext: options.noAudio ? undefined : AudioContext,
    speechSynthesis: synthesis, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    Date: class extends Date { static now() { return now; } getHours() { return 12; } }
  });
  environment.window = environment;
  for (const file of ['js/core/namespace.js', 'js/core/bus.js', 'js/data/audio.js', 'js/data/concert.js', 'js/core/audio.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), environment, { filename: file });
  const G = environment.Game;
  G.state = { settings: { music: 0.22, sfx: 0.45, tts: false, ttsVoice: '', dayMode: 'day' } };
  G.store = { update(fn) { fn(G.state); G.bus.emit('state:change'); } };
  const change = values => G.store.update(state => Object.assign(state.settings, values));
  const visibility = isHidden => { environment.document.hidden = isHidden; (documentEvents.visibilitychange || []).forEach(fn => fn()); };
  return { G, clock, contexts, environment, change, visibility, synthesis, utterances, documentEvents, windowEvents };
}

let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('✓ ' + name); }
async function run() {
  await test('交互前不创建音频；重复初始化和解锁只有一个上下文与调度器', async () => {
    const { G, contexts, clock, documentEvents } = sandbox({ suspended: true });
    G.audio.init(); G.audio.init(); assert.equal(contexts.length, 0); assert.equal(documentEvents.visibilitychange.length, 1);
    await Promise.all([G.audio.unlock(), G.audio.unlock(), G.audio.unlock()]);
    assert.equal(contexts.length, 1); assert.equal(clock.intervals(), 1); assert.equal(contexts[0].resumeCount, 1);
    clock.advance(20000); assert.ok(contexts[0].sources().length > 20); assert.ok(contexts[0].active().length < 20);
    assert.ok(contexts[0].sources().every(source => source.wave && source.wave.imag.length > 3));
  });
  await test('音量即时改变；音乐静音取消后续音符并释放已发声节点', async () => {
    const { G, contexts, clock, change } = sandbox(); G.audio.init(); await G.audio.unlock();
    const ac = contexts[0], musicOut = ac.nodes[1];
    change({ music: 0.1 }); assert.equal(musicOut.gain.value, 0.1 * G.data.audio.mix.music); assert.equal(clock.intervals(), 1);
    change({ music: 0 }); assert.equal(musicOut.gain.value, 0); assert.equal(clock.intervals(), 0);
    clock.advance(200); assert.equal(ac.active().length, 0); assert.ok(ac.sources().every(source => source.disconnected));
    G.audio.play('click'); assert.equal(clock.timeouts(), 1); change({ sfx: 0 }); assert.equal(clock.timeouts(), 0);
    const count = ac.sources().length; clock.advance(10000); assert.equal(ac.sources().length, count);
  });
  await test('切后台停止音乐和触音，恢复时没有积压补播或重复调度器', async () => {
    const { G, contexts, clock, visibility } = sandbox(); G.audio.init(); await G.audio.unlock();
    G.audio.play('preview'); const ac = contexts[0]; visibility(true);
    assert.equal(clock.intervals(), 0); assert.equal(ac.nodes[1].gain.value, 0); assert.equal(ac.nodes[2].gain.value, 0);
    clock.advance(60000); assert.equal(ac.active().length, 0); const count = ac.sources().length;
    visibility(false); assert.equal(clock.intervals(), 1); assert.ok(ac.sources().length - count < 6);
    await G.audio.unlock(); assert.equal(clock.intervals(), 1);
  });
  await test('同一动作的显式音效和全局按钮音合并，快速重复音被节流', async () => {
    const { G, contexts, clock, change } = sandbox(); G.audio.init(); await G.audio.unlock(); change({ music: 0 }); clock.advance(200);
    const ac = contexts[0], count = ac.sources().length;
    G.audio.play('click'); G.audio.play('success'); G.audio.play('click'); G.audio.play('success');
    assert.equal(clock.timeouts(), 0); assert.equal(ac.sources().length - count, 3);
    clock.advance(180); G.audio.play('click'); G.audio.play('click'); clock.advance(30);
    assert.equal(ac.sources().length - count, 4); assert.equal(ac.sources().at(-1).nodeType, 'oscillator');
  });
  await test('轻快配乐保留完整乐段、短音与留白，预览在三秒内收尾', async () => {
    const { G, contexts, clock, change } = sandbox();
    for (const name of ['day', 'night']) {
      const track = G.data.audio[name]; assert.ok((track.bars.length * track.beatsPerBar + track.breath) * 60 / track.bpm > 45);
      assert.ok(track.bars.length >= 24); assert.ok(track.breath <= 1);
      assert.ok(track.bars.some(bar => bar.notes.some(note => note[2] < 0.5)));
      assert.ok(track.bars.some(bar => bar.backing && bar.backing.some(note => note[4] === 'chord')));
    }
    G.audio.init(); await G.audio.unlock(); change({ music: 0 }); clock.advance(200);
    G.audio.play('preview'); const ac = contexts[0], preview = ac.active(); assert.equal(preview.length, 4);
    assert.ok(Math.max(...preview.map(source => source.stopped)) - ac.currentTime < 3);
    clock.advance(3000); assert.equal(ac.active().length, 0);
  });
  await test('三声部曲谱的音高、拍位和时长有效，低音与反拍和弦各自调度', async () => {
    const { G, contexts, clock } = sandbox();
    for (const name of ['day', 'night']) {
      const track = G.data.audio[name]; assert.ok(track.bpm >= 100 && track.bpm <= 140);
      for (const bar of track.bars) for (const note of [...bar.notes, ...(bar.backing || [])]) {
        assert.ok(Number.isFinite(note[0]) && note[0] >= 0 && note[0] < track.beatsPerBar);
        assert.ok(Number.isInteger(note[1]) && note[1] >= 36 && note[1] <= 88);
        assert.ok(Number.isFinite(note[2]) && note[2] > 0 && note[0] + note[2] <= track.beatsPerBar);
        assert.ok(Number.isFinite(note[3]) && note[3] > 0 && note[3] <= 1);
        if (note[4]) assert.ok(['bass', 'chord'].includes(note[4]));
      }
    }
    G.audio.init(); await G.audio.unlock(); clock.advance(2500);
    const sources = contexts[0].sources();
    assert.equal(new Set(sources.map(source => JSON.stringify(Array.from(source.wave.imag)))).size, 3);
    for (const tone of Object.values(G.data.audio.musicInstrument)) { assert.ok(tone.attack > 0); assert.ok(tone.release < 0.1); }
  });
  await test('快节奏持续循环不会堆积声部，静音和后台取消已排入的短音', async () => {
    for (const dayMode of ['day', 'night']) {
      const { G, contexts, clock, change, visibility } = sandbox(); change({ dayMode });
      G.audio.init(); await G.audio.unlock(); let maxActive = 0;
      for (let i = 0; i < 1800; i++) { clock.advance(100); maxActive = Math.max(maxActive, contexts[0].active().length); }
      assert.ok(contexts[0].sources().length > 500); assert.ok(maxActive <= 24, String(maxActive)); assert.equal(clock.intervals(), 1);
      visibility(true); clock.advance(200); assert.equal(contexts[0].active().length, 0); assert.equal(clock.intervals(), 0);
      visibility(false); assert.equal(clock.intervals(), 1);
      change({ music: 0 }); clock.advance(200); assert.equal(contexts[0].active().length, 0); assert.equal(clock.intervals(), 0);
    }
  });
  await test('朗读默认关闭；只选本机中文增强声线，正常语速并在句间停顿', async () => {
    const { G, change, utterances, clock } = sandbox(); G.audio.init(); await G.audio.unlock();
    assert.equal(G.audio.speak('你好。').ok, false); assert.equal(utterances.length, 0);
    assert.deepEqual(Array.from(G.audio.getVoices(), voice => voice.voiceURI), ['tingting-enhanced', 'tingting']);
    change({ tts: true }); assert.equal(G.audio.speak('☁ 你好。今天的小屋很温暖！').ok, true);
    assert.equal(utterances[0].voice.voiceURI, 'tingting-enhanced'); assert.equal(utterances[0].rate, 1); assert.equal(utterances[0].pitch, 1); assert.equal(utterances[0].text, '你好。');
    utterances[0].onend(); clock.advance(200); assert.equal(utterances.length, 1); clock.advance(10); assert.equal(utterances.length, 2);
  });
  await test('静音、关朗读和切后台都会取消朗读及未播放的分句', async () => {
    for (const action of ['mute', 'tts', 'hidden']) {
      const { G, change, utterances, clock, synthesis, visibility } = sandbox(); G.audio.init(); await G.audio.unlock(); change({ tts: true });
      G.audio.speak('第一句话。第二句话。'); utterances[0].onend();
      if (action === 'mute') change({ music: 0, sfx: 0 }); else if (action === 'tts') change({ tts: false }); else visibility(true);
      assert.equal(synthesis.cancelCount, 1); clock.advance(1000); assert.equal(utterances.length, 1);
    }
  });
  await test('无本机中文声线时明确返回原因，不使用英文或在线语音', async () => {
    const { G, change, utterances } = sandbox({ voices: [{ name: 'Online', lang: 'zh-CN', localService: false }, { name: 'English', lang: 'en-US', localService: true }] });
    change({ tts: true }); const result = G.audio.speak('你好。'); assert.equal(result.ok, false); assert.match(result.message, /中文声线/); assert.equal(utterances.length, 0);
  });
  await test('默认关闭朗读也能主动试听；重复点击同一按钮停止并恢复音乐', async () => {
    const { G, contexts, clock, change, utterances, synthesis } = sandbox(); const events = [];
    G.bus.on('speech:change', event => events.push(event)); G.audio.init(); await G.audio.unlock();
    const music = contexts[0].nodes[1].gain;
    assert.equal(G.audio.speak('🌷 这里有一朵花。', { manual: true, key: 'resident_lily' }).ok, true);
    assert.equal(utterances[0].text, '这里有一朵花。'); assert.equal(G.state.settings.tts, false);
    assert.equal(music.value, 0.22 * G.data.audio.mix.music * 0.35);
    change({ dayMode: 'day' }); clock.advance(30000); assert.equal(synthesis.cancelCount, 0);
    const result = G.audio.speak('🌷 这里有一朵花。', { manual: true, key: 'resident_lily' });
    assert.equal(result.stopped, true); assert.equal(synthesis.cancelCount, 1); assert.equal(music.value, 0.22 * G.data.audio.mix.music);
    assert.deepEqual(events.map(event => event.reason), ['started', 'stopped']);
    assert.equal(events[0].key, 'resident_lily'); assert.equal(events[0].voiceURI, 'tingting-enhanced');
  });
  await test('主动试听期间关掉已开启的朗读、换声线、关闭对话会取消播放', async () => {
    for (const action of ['tts', 'voice', 'close']) {
      const { G, clock, change, utterances, synthesis } = sandbox(); G.audio.init(); await G.audio.unlock();
      G.audio.speak('第一句。第二句。', { manual: true }); utterances[0].onend();
      if (action === 'tts') { change({ tts: true }); change({ tts: false }); }
      else if (action === 'voice') change({ ttsVoice: 'tingting' });
      else G.audio.stopSpeech();
      clock.advance(1000); assert.equal(synthesis.cancelCount, 1); assert.equal(utterances.length, 1);
    }
  });
  await test('自动声线优先普通话和增强品质，彻底过滤新奇角色声；允许试听常规所选声线', async () => {
    const novelty = ['Eddy', 'Flo', 'Grandma', 'Grandpa', 'Reed', 'Rocko', 'Sandy', 'Shelley'];
    const { G, utterances, change } = sandbox({ voices: [
      ...novelty.map(name => ({ name: name + '（中文）', voiceURI: 'com.apple.voice.compact.zh-CN.' + name, lang: 'zh-CN', localService: true, default: true })),
      { name: '中文声线', voiceURI: 'com.apple.voice.compact.zh-CN.Grandma', lang: 'zh-CN', localService: true },
      { name: 'Meijia Enhanced', voiceURI: 'meijia-premium', lang: 'zh-TW', localService: true },
      { name: 'Ting-Ting', voiceURI: 'tingting-base', lang: 'zh-CN', localService: true },
      { name: 'Tingting', voiceURI: 'com.apple.voice.enhanced.zh-CN.tingting', lang: 'zh-CN', localService: true }
    ] });
    assert.deepEqual(Array.from(G.audio.getVoices(), voice => voice.voiceURI), ['com.apple.voice.enhanced.zh-CN.tingting', 'tingting-base', 'meijia-premium']);
    assert.equal(G.audio.speak('你好呀。', { manual: true }).ok, true); assert.equal(utterances[0].voice.voiceURI, 'com.apple.voice.enhanced.zh-CN.tingting');
    G.audio.stopSpeech(); G.audio.speak('你好呀。', { manual: true, voiceURI: 'tingting-base' }); assert.equal(utterances[1].voice.voiceURI, 'tingting-base');
    G.audio.stopSpeech(); change({ ttsVoice: 'com.apple.voice.compact.zh-CN.Eddy' });
    G.audio.speak('旧存档的声线也会重新筛选。', { manual: true }); assert.equal(utterances[2].voice.voiceURI, 'com.apple.voice.enhanced.zh-CN.tingting');
    G.audio.stopSpeech(); G.audio.speak('不能显式试听角色声线。', { manual: true, voiceURI: 'com.apple.voice.compact.zh-CN.Grandma' }); assert.equal(utterances[3].voice.voiceURI, 'com.apple.voice.enhanced.zh-CN.tingting');
    const onlyNovelty = sandbox({ voices: novelty.map(name => ({ name, voiceURI: name, lang: 'zh-CN', localService: true })) });
    assert.equal(onlyNovelty.G.audio.getVoices().length, 0); assert.equal(onlyNovelty.G.audio.speak('你好。', { manual: true }).ok, false); assert.equal(onlyNovelty.utterances.length, 0);
  });
  await test('手动朗读的开始、停止与结束事件只触发一次，取消后的旧回调不能干扰新对话', async () => {
    const { G, contexts, clock, utterances, synthesis } = sandbox(); const events = [];
    G.bus.on('speech:change', event => events.push({ ...event })); G.audio.init(); await G.audio.unlock();
    assert.equal(G.state.settings.tts, false);
    G.audio.speak('第一段。', { manual: true, key: 'first' }); const first = utterances[0];
    assert.equal(G.audio.speak('第一段。', { manual: true, key: 'first' }).stopped, true);
    G.audio.speak('第二段。', { manual: true, key: 'second' }); const second = utterances[1];
    first.onend(); first.onerror(); clock.advance(300); assert.equal(utterances.length, 2);
    second.onend(); assert.equal(clock.timeouts(), 0); assert.equal(contexts[0].nodes[1].gain.value, 0.22 * G.data.audio.mix.music);
    // 浏览器可能在cancel后补发回调；已经结束的回调也不能再次发finished。
    second.onend(); second.onerror(); G.audio.stopSpeech(); clock.advance(300);
    assert.deepEqual(events.map(event => [event.key, event.speaking, event.reason]), [['first', true, 'started'], ['first', false, 'stopped'], ['second', true, 'started'], ['second', false, 'finished']]);
    assert.equal(synthesis.cancelCount, 1);
    G.audio.speak('第二段。', { manual: true, key: 'second' }); assert.equal(utterances.length, 3); assert.equal(events.at(-1).reason, 'started');
  });
  await test('生日小曲只在主动收礼事件后奏响，不自动朗读；音乐服从统一昼夜状态', async () => {
    const { G, contexts, clock, change, utterances } = sandbox();
    G.sys.time = { current: () => ({ phase: 'night' }) }; G.audio.init(); await G.audio.unlock();
    const nightBass = G.data.audio.night.bars[0].backing.find(note => note[4] === 'bass')[1];
    const nightFrequency = 440 * Math.pow(2, (nightBass - 69) / 12);
    const ac = contexts[0]; assert.ok(ac.sources().some(source => Math.abs(source.frequency.value - nightFrequency) < 1));
    change({ music: 0 }); clock.advance(200); const count = ac.sources().length;
    G.bus.emit('time:change', { events: [{ festivalId: 'player_birthday' }] }); assert.equal(ac.sources().length, count);
    G.bus.emit('festival:claimed', { festivalId: 'halloween' }); assert.equal(ac.sources().length, count);
    G.bus.emit('festival:claimed', { festivalId: 'player_birthday' }); G.audio.play('success');
    const tune = ac.sources().slice(count); assert.equal(tune.length, 7); assert.equal(utterances.length, 0);
    assert.ok(Math.max(...tune.map(source => source.stopped)) - ac.currentTime < 4);
    clock.advance(4000); assert.equal(ac.active().length, 0);
    change({ sfx: 0 }); G.bus.emit('festival:claimed', { festivalId: 'player_birthday' }); assert.equal(ac.sources().length, count + 7);
  });
  await test('统一昼夜切换先淡出再进入新乐句，后台/静音取消切换且不残留调度器', async () => {
    const { G, contexts, clock, change, visibility } = sandbox(); let phase = 'day';
    G.sys.time = { current: () => ({ phase }) }; G.audio.init(); await G.audio.unlock(); clock.advance(200);
    const ac = contexts[0], music = ac.nodes[1].gain; phase = 'night'; G.bus.emit('time:change');
    assert.equal(music.value, 0); assert.equal(clock.intervals(), 0); assert.equal(clock.timeouts(), 1);
    clock.advance(100); change({ sfx: .4 }); assert.equal(music.value, 0); clock.advance(80);
    assert.equal(clock.intervals(), 1); assert.equal(clock.timeouts(), 0); assert.equal(music.value, .22 * G.data.audio.mix.music);
    const nightBass = G.data.audio.night.bars[0].backing.find(note => note[4] === 'bass')[1];
    const nightFrequency = 440 * Math.pow(2, (nightBass - 69) / 12);
    assert.ok(ac.sources().some(source => source.started >= .37 && Math.abs(source.frequency.value - nightFrequency) < 1));
    phase = 'day'; G.bus.emit('time:change'); assert.equal(clock.timeouts(), 1); visibility(true);
    assert.equal(clock.timeouts(), 0); assert.equal(clock.intervals(), 0); clock.advance(1000); assert.equal(ac.active().length, 0);
    visibility(false); assert.equal(clock.intervals(), 1); phase = 'night'; G.bus.emit('time:change'); change({ music: 0 });
    assert.equal(clock.timeouts(), 0); assert.equal(clock.intervals(), 0);
  });
  await test('音乐会三段只主动奏乐，切段/关窗/后台/静音取消未起音声部', async () => {
    const { G, contexts, clock, change, visibility, utterances } = sandbox(); G.audio.init(); await G.audio.unlock(); change({ music: 0 }); clock.advance(200);
    const ac = contexts[0], before = ac.sources().length;
    G.audio.play('concert_0'); assert.equal(ac.sources().length, before + 5); assert.equal(utterances.length, 0);
    const first = ac.sources().slice(before); G.audio.play('concert_1'); assert.equal(ac.sources().length, before + 10);
    assert.ok(first.every(node => node.stopped <= ac.currentTime + .16));
    G.audio.stopConcert(); clock.advance(200); assert.equal(ac.active().length, 0);
    G.audio.play('concert_2'); visibility(true); clock.advance(200); assert.equal(ac.active().length, 0);
    visibility(false); clock.advance(200); G.audio.play('concert_0'); change({ sfx: 0 }); clock.advance(200); assert.equal(ac.active().length, 0);
    const count = ac.sources().length; G.audio.play('concert_1'); assert.equal(ac.sources().length, count); assert.equal(clock.intervals(), 0);
  });
  await test('音乐会解锁声卡前立即关窗，不在异步恢复后继续奏乐', async () => {
    const { G, contexts, clock, utterances } = sandbox({ suspended: true }); G.state.settings.music = 0;
    G.audio.play('concert_0'); G.audio.stopConcert(); await Promise.resolve(); await Promise.resolve(); clock.advance(200);
    assert.equal(contexts[0].sources().length, 0); assert.equal(utterances.length, 0);
  });
  await test('九种动作有独立的轻柔音色，短包络不自动开启朗读', async () => {
    const { G, contexts, clock, utterances } = sandbox(); G.state.settings.music = 0; await G.audio.unlock();
    const ac = contexts[0], signatures = new Set();
    for (const kind of ['click', 'place', 'coin', 'level', 'error', 'happy', 'water', 'harvest', 'flip']) {
      const before = ac.sources().length; G.audio.play(kind); clock.advance(35);
      const sources = ac.sources().slice(before), effect = G.data.audio.effects[kind];
      assert.equal(sources.length, effect.parts.length, kind);
      assert.ok(sources.every(source => source.stopped - source.started < 1), kind + ' 应是短反馈');
      signatures.add(JSON.stringify(sources.map(source => [source.nodeType, source.frequency.events, source.frequency.value, source.started - ac.currentTime])));
      clock.advance(1100); assert.equal(ac.active().length, 0, kind + ' 应自动释放声部');
    }
    assert.equal(signatures.size, 9); assert.equal(utterances.length, 0); assert.equal(G.state.settings.tts, false);
    const peaks = ac.nodes.filter(node => node.nodeType === 'gain').flatMap(node => node.gain.events.filter(event => event[0] === 'linear').map(event => event[1]));
    assert.ok(Math.max(...peaks) <= 0.2, '保留低峰值与统一音量总线');
  });
  await test('真实成功事件各自发声，初始化重复和装饰提示不会重复订阅或改奖励', async () => {
    const { G, contexts, clock, utterances } = sandbox(); G.state.settings.music = 0;
    G.state.wallet = { coin: 12 }; G.state.inventory = { turnip: 1 }; G.audio.init(); G.audio.init(); await G.audio.unlock();
    const ac = contexts[0], original = JSON.stringify(G.state);
    for (const [name, kind] of Object.entries(G.data.audio.feedbackEvents)) {
      const count = ac.sources().length; G.bus.emit(name, { coin: 2 });
      assert.equal(ac.sources().length - count, G.data.audio.effects[kind].parts.length, name);
      clock.advance(1000);
    }
    const count = ac.sources().length;
    G.bus.emit('scene:harvested', { count: 999 }); G.bus.emit('scene:placed', {}); G.bus.emit('garden:water_failed', {});
    G.bus.emit('reward:received', { coin: 0, exp: 10 }); G.bus.emit('reward:received', { coin: -1 });
    assert.equal(ac.sources().length, count);
    G.bus.emit('reward:received', { coin: 2 }); assert.equal(ac.sources().length - count, G.data.audio.effects.coin.parts.length);
    assert.equal(JSON.stringify(G.state), original); assert.equal(utterances.length, 0);
  });
  await test('浇水反馈合并按钮音和旧成功音，同种快速重入受冷却限制', async () => {
    const { G, contexts, clock } = sandbox(); G.state.settings.music = 0; await G.audio.unlock(); const ac = contexts[0];
    G.audio.play('click'); G.bus.emit('garden:watered', {}); G.audio.play('success'); G.audio.play('click');
    assert.equal(clock.timeouts(), 0); assert.equal(ac.sources().length, 3);
    clock.advance(180); G.bus.emit('garden:watered', {}); assert.equal(ac.sources().length, 3);
    clock.advance(80); G.bus.emit('garden:watered', {}); assert.equal(ac.sources().length, 6);
    clock.advance(500); G.audio.play('soft'); assert.equal(ac.sources().length, 7);
  });
  await test('高优先级升级取消同一瞬间的交易声部，保留完整上行三音', async () => {
    const { G, contexts, clock } = sandbox(); G.state.settings.music = 0; await G.audio.unlock(); const ac = contexts[0];
    G.bus.emit('item:bought', {}); const coin = ac.sources().slice();
    G.bus.emit('level:up', { level: 2 }); G.bus.emit('level:up', { level: 3 }); G.audio.play('success'); G.audio.play('click');
    assert.equal(ac.sources().length, coin.length + 3); assert.ok(coin.every(node => node.stopped <= ac.currentTime + 0.04));
    assert.equal(clock.timeouts(), 0); clock.advance(1000); assert.equal(ac.active().length, 0);
  });
  await test('动作声部和待播点击在静音、后台、换档及停止后全部释放', async () => {
    for (const action of ['mute', 'hidden', 'replace', 'stop']) {
      const { G, contexts, clock, change, visibility } = sandbox(); G.state.settings.music = 0; await G.audio.unlock();
      G.audio.play('water'); clock.advance(60);
      if (action === 'mute') change({ sfx: 0 }); else if (action === 'hidden') visibility(true);
      else if (action === 'replace') G.bus.emit('state:replace', G.state); else G.audio.stop();
      clock.advance(200); assert.equal(contexts[0].active().length, 0, action); assert.equal(clock.timeouts(), 0);
      if (action === 'mute') change({ sfx: 0.45 }); else if (action === 'hidden') visibility(false);
      const count = contexts[0].sources().length; clock.advance(2000); assert.equal(contexts[0].sources().length, count, action + ' 不补播');
    }
  });
  await test('声卡异步解锁中的动作在静音后恢复、切后台后恢复、换档及停止后不会迟响', async () => {
    for (const action of ['mute', 'hidden', 'replace', 'stop']) {
      const { G, contexts, clock, change, visibility } = sandbox({ suspended: true }); G.state.settings.music = 0;
      G.audio.play('harvest');
      if (action === 'mute') { change({ sfx: 0 }); change({ sfx: 0.45 }); }
      else if (action === 'hidden') { visibility(true); visibility(false); }
      else if (action === 'replace') G.bus.emit('state:replace', G.state); else G.audio.stop();
      await Promise.resolve(); await Promise.resolve(); clock.advance(1000);
      assert.equal(contexts[0].sources().length, 0, action); assert.equal(clock.timeouts(), 0);
    }
  });
  await test('生日曲独立取消，重复领奖提示不叠曲，主动重播仍能重新奏响七音', async () => {
    const { G, contexts, clock } = sandbox(); G.state.settings.music = 0; await G.audio.unlock(); const ac = contexts[0];
    const receipt = { festivalId: 'player_birthday', key: '2026:player_birthday' };
    G.bus.emit('festival:claimed', receipt); G.bus.emit('festival:claimed', receipt); assert.equal(ac.sources().length, 7);
    const first = ac.sources().slice(); G.audio.play('birthday'); assert.equal(ac.sources().length, 14);
    assert.ok(first.every(node => node.stopped <= ac.currentTime + 0.16));
    clock.advance(500); G.audio.play('water'); const water = ac.sources().slice(-3); G.audio.stopBirthday();
    assert.ok(water.every(node => node.stopped > ac.currentTime + 0.15));
    clock.advance(1000); assert.equal(ac.active().length, 0);
    G.audio.play('birthday'); assert.equal(ac.sources().length, 24); G.audio.stopBirthday(); clock.advance(200); assert.equal(ac.active().length, 0);
  });
  await test('生日关窗取消尚未解锁的七音；换档后同一领奖键可再次正常使用', async () => {
    const { G, contexts, clock } = sandbox({ suspended: true }); G.state.settings.music = 0;
    const receipt = { festivalId: 'player_birthday', key: '2026:player_birthday' };
    G.audio.init(); G.bus.emit('festival:claimed', receipt); G.audio.stopBirthday();
    await Promise.resolve(); await Promise.resolve(); clock.advance(200); assert.equal(contexts[0].sources().length, 0);
    G.bus.emit('state:replace', G.state); G.bus.emit('festival:claimed', receipt); assert.equal(contexts[0].sources().length, 7);
    G.audio.stopBirthday(); clock.advance(200); assert.equal(contexts[0].active().length, 0);
  });
  await test('停止清理所有待办音频；缺少WebAudio时可安全继续游戏', async () => {
    const { G, contexts, clock } = sandbox(); G.audio.init(); await G.audio.unlock(); G.audio.play('click'); G.audio.stop(); G.audio.stop();
    assert.equal(clock.intervals(), 0); assert.equal(clock.timeouts(), 0); clock.advance(200); assert.equal(contexts[0].active().length, 0);
    const unavailable = sandbox({ noAudio: true }); unavailable.G.audio.init(); assert.equal(await unavailable.G.audio.unlock(), false); unavailable.G.audio.play('success');
  });
  console.log('\n' + passed + ' 组音频验证通过。');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
