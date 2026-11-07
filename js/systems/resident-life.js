/* 居民白天的小日常只留在内存；暂停、换档和拍照不会写入逐帧位置。 */
(function (G) {
  'use strict';
  const runtime = G.runtime.residentLife = { actors: Object.create(null), clock: 0, lastNow: null };
  let initialized = false;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const hash = id => Array.from(id).reduce((value, ch) => (value * 31 + ch.charCodeAt(0)) >>> 0, 173);
  const room = id => G.contentSpaces.get(id, G.state);
  const definition = id => G.data.residentById?.[id] || G.data.residents.find(value => value.id === id);
  const moved = () => Object.entries(G.state.residents).filter(([, value]) => value.movedIn && room(value.roomId));
  function random(actor) { actor.seed = (Math.imul(actor.seed, 1664525) + 1013904223) >>> 0; return actor.seed / 4294967296; }
  const between = (actor, low, high) => low + random(actor) * (high - low);
  function start(actor, pose, duration) { actor.pose = pose; actor.startedAt = runtime.clock; actor.until = runtime.clock + duration; }
  function create(id, resident) {
    const actor = { id, homeRoomId: resident.roomId, roomId: resident.roomId, seed: hash(id), x: 130 + hash(id) % 110, depth: .42 + (hash(id) % 15) / 100, facing: 1, favoriteUid: null, destination: null };
    actor.nextVisitAt = runtime.clock + between(actor, 30000, 90000); start(actor, 'pause', between(actor, 2000, 6000)); return actor;
  }
  function favoriteItems(id, roomId) {
    const profile = definition(id), current = room(roomId); if (!profile || !current) return [];
    return current.items.filter(item => {
      const def = G.data.furnitureById[item.defId];
      return def && (def.theme === profile.favoriteTheme || item.color === profile.favoriteColor || profile.favoriteItem && def.name.includes(profile.favoriteItem));
    });
  }
  function walk(actor, destination, after, favoriteUid) {
    actor.fromX = actor.x; actor.fromDepth = actor.depth; actor.toX = destination.x; actor.toDepth = destination.depth;
    actor.facing = destination.x < actor.x ? -1 : 1; actor.afterWalk = after || 'pause'; actor.favoriteUid = favoriteUid || null;
    start(actor, 'walk', between(actor, 5000, 10000));
  }
  function choose(actor) {
    const favorites = favoriteItems(actor.id, actor.roomId);
    if (favorites.length && random(actor) < .4) {
      const item = favorites[Math.floor(random(actor) * favorites.length)], def = G.data.furnitureById[item.defId];
      const side = item.x + def.w / 2 < 160 ? 1 : -1;
      walk(actor, { x: clamp(item.x + def.w / 2 + side * (def.w / 2 + 24), 42, 278), depth: clamp((Number.isFinite(item.depth) ? item.depth : .45) + .06, .25, .82) }, 'favorite', item.uid); return;
    }
    if (random(actor) < .53) { walk(actor, { x: between(actor, 48, 272), depth: between(actor, .3, .78) }); return; }
    const poses = ['sit', 'stretch', 'read', 'hop'], pose = poses[Math.floor(random(actor) * poses.length)];
    actor.favoriteUid = null; start(actor, pose, pose === 'hop' ? 1100 : between(actor, 3500, 6500));
  }
  function update(actor, phase) {
    const resident = G.state.residents[actor.id];
    if (!room(actor.roomId) || actor.homeRoomId !== resident.roomId) Object.assign(actor, create(actor.id, resident));
    if (phase === 'night') {
      actor.roomId = resident.roomId; actor.destination = null; actor.favoriteUid = null; actor.x = 145 + hash(actor.id) % 65; actor.depth = .5;
      if (actor.pose !== 'sleep') start(actor, 'sleep', 1); return;
    }
    if (actor.pose === 'sleep') { actor.nextVisitAt = runtime.clock + between(actor, 30000, 90000); start(actor, 'pause', between(actor, 2000, 5000)); }
    if (actor.favoriteUid && !room(actor.roomId).items.some(item => item.uid === actor.favoriteUid)) { actor.favoriteUid = null; start(actor, 'pause', 1000); }
    if (actor.pose === 'walk') {
      const progress = clamp((runtime.clock - actor.startedAt) / (actor.until - actor.startedAt), 0, 1), smooth = progress * progress * (3 - 2 * progress);
      actor.x = actor.fromX + (actor.toX - actor.fromX) * smooth; actor.depth = actor.fromDepth + (actor.toDepth - actor.fromDepth) * smooth;
    }
    if (runtime.clock >= actor.nextVisitAt && !['depart', 'arrive'].includes(actor.pose)) {
      actor.nextVisitAt = runtime.clock + between(actor, 30000, 90000);
      const others = G.contentSpaces.list(G.state).map(value => value.id).filter(id => id !== actor.roomId);
      if (others.length && random(actor) < .5) {
        actor.destination = actor.roomId !== actor.homeRoomId && random(actor) < .6 ? actor.homeRoomId : others[Math.floor(random(actor) * others.length)];
        actor.favoriteUid = null; start(actor, 'depart', 900); return;
      }
    }
    if (runtime.clock < actor.until) return;
    if (actor.pose === 'depart') {
      actor.roomId = room(actor.destination) ? actor.destination : actor.homeRoomId; actor.destination = null; actor.x = between(actor, 90, 250); actor.depth = between(actor, .35, .7); start(actor, 'arrive', 900);
    } else if (actor.pose === 'arrive') start(actor, 'pause', between(actor, 2000, 5000));
    else if (actor.pose === 'walk') start(actor, actor.afterWalk, between(actor, 3000, 6000));
    else choose(actor);
  }
  function snapshot(options) {
    const settings = options || {};
    return moved().map(([id, resident]) => {
      const stored = runtime.actors[id], actor = stored && stored.homeRoomId === resident.roomId && room(stored.roomId) ? stored : { id, roomId: resident.roomId, homeRoomId: resident.roomId, x: 130 + hash(id) % 110, depth: .5, facing: 1, pose: 'pause', startedAt: runtime.clock, until: runtime.clock + 1 };
      const progress = clamp((runtime.clock - actor.startedAt) / Math.max(1, actor.until - actor.startedAt), 0, 1);
      const result = { id, homeRoomId: resident.roomId, roomId: actor.roomId, x: actor.x, depth: actor.depth, facing: actor.facing, pose: actor.pose, progress, alpha: actor.pose === 'depart' ? 1 - progress : actor.pose === 'arrive' ? progress : 1, favoriteUid: actor.favoriteUid || null };
      // 取景可以读取同一时刻的状态；夜晚投影回家也不改内存里的日间路线。
      if (settings.phase === 'night') Object.assign(result, { roomId: resident.roomId, pose: 'sleep', alpha: 1, favoriteUid: null });
      else if (settings.reducedMotion) Object.assign(result, { pose: 'pause', alpha: 1, progress: 0 });
      return result;
    });
  }
  function advance(now, options) {
    const settings = options || {}, stamp = Number.isFinite(now) ? now : 0;
    if (settings.hidden || typeof document !== 'undefined' && document.hidden) { runtime.lastNow = null; return snapshot(settings); }
    const elapsed = runtime.lastNow === null ? 0 : clamp(stamp - runtime.lastNow, 0, 1000); runtime.lastNow = stamp;
    if (!settings.reducedMotion) runtime.clock += elapsed;
    const residents = moved(), active = new Set(residents.map(([id]) => id));
    Object.keys(runtime.actors).forEach(id => { if (!active.has(id)) delete runtime.actors[id]; });
    residents.forEach(([id, resident]) => {
      const actor = runtime.actors[id] || (runtime.actors[id] = create(id, resident));
      if (!settings.reducedMotion || settings.phase === 'night' || actor.homeRoomId !== resident.roomId || !room(actor.roomId)) update(actor, settings.phase);
    });
    return snapshot(settings);
  }
  function reset() { runtime.actors = Object.create(null); runtime.clock = 0; runtime.lastNow = null; }
  function notices() {
    const eligible = G.data.residents.filter(profile => !G.state.residents[profile.id]?.movedIn && G.sys.residents.eligibility(profile.id).ok).map(profile => profile.id), seen = G.state.residentNotices || [];
    return { eligible, unseen: eligible.filter(id => !seen.includes(id)) };
  }
  function acknowledge(ids) {
    const current = notices(), fresh = Array.isArray(ids) ? current.unseen.filter(id => ids.includes(id)) : current.unseen;
    if (!fresh.length) return { ok: true, ids: [] };
    try { G.store.update(state => { state.residentNotices = Array.from(new Set((state.residentNotices || []).concat(fresh))); }, { persist: true }); return { ok: true, ids: fresh }; }
    catch (error) { return { ok: false, ids: [], message: error.message || '糯米的小纸条还没有存好，稍后再试试。' }; }
  }
  function init() {
    reset(); if (initialized) return; initialized = true;
    G.bus.on('state:replace', reset);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { runtime.lastNow = null; });
  }
  G.sys.residentLife = { init, advance, snapshot, reset, favoriteItems, notices, acknowledge };
})(window.Game);
