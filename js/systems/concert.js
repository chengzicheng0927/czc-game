/* 演出会话只在本页内存中；第一次完整谢幕先保存再公布完成。 */
(function (G) {
  'use strict';
  let session = null, serial = 0, busy = false;
  const fail = message => ({ ok: false, message });
  const guests = () => G.data.residents.filter(def => G.state.residents[def.id]?.movedIn).map(def => def.id);
  function status() {
    const rooms = G.contentSpaces.list(G.state).filter(room => G.contentSpaces.isType(room, 'music')).map(room => room.id), people = guests();
    return { roomIds: rooms, guests: people, completed: (G.state.quests.stats.concerts || 0) > 0, canStart: rooms.length > 0 && people.length > 0, reason: !rooms.length ? '先建好一间音乐室，再邀请朋友来听歌。' : !people.length ? '先邀请一位朋友入住，小合奏就能开始啦。' : '三段小合奏，和已入住的朋友一起完成。没有倒计时。' };
  }
  function current(id) {
    if (!session || typeof id !== 'string' || session.id !== id) return null;
    if (!G.contentSpaces.isType(G.contentSpaces.get(session.roomId, G.state), 'music') || guests().join('|') !== session.guests.join('|')) return null;
    return session;
  }
  function begin(roomId) {
    if (busy) return fail('正在收好这次演出，请稍等一下。');
    const available = status();
    if (!available.canStart) return fail(available.reason);
    if (roomId !== undefined && (typeof roomId !== 'string' || available.roomIds.indexOf(roomId) < 0)) return fail('这间音乐室已经不在这里啦，请重新选一间。');
    session = { id: 'concert_' + (++serial), roomId: roomId || available.roomIds[0], guests: available.guests, verse: 0 };
    return { ok: true, sessionId: session.id, guests: session.guests.slice(), verse: 0 };
  }
  function advance(id) {
    if (busy) return fail('正在收好这次演出，请稍等一下。');
    const active = current(id); if (!active) return fail('小合奏已经暂停，请重新邀请大家入场。');
    if (active.verse >= G.data.concert.verses.length - 1) return fail('已经到谢幕啦，把这段回忆收好吧。');
    active.verse++; return { ok: true, verse: active.verse };
  }
  function finish(id) {
    if (busy) return fail('正在收好这次演出，请稍等一下。');
    const active = current(id); if (!active) return fail('小合奏已经暂停，请重新邀请大家入场。');
    if (active.verse !== G.data.concert.verses.length - 1) return fail('还有旋律没奏完，我们慢慢听到谢幕吧。');
    busy = true;
    try {
      const first = !status().completed;
      if (first) G.store.update(s => {
        s.quests.stats.concerts = 1;
        s.memories.push({ at: Date.now(), text: '在音乐室和' + active.guests.map(id => G.data.residents.find(def => def.id === id).name).join('、') + '举办了海风与森林的小合奏。' });
        if (s.memories.length > G.data.balance.maxMemories) s.memories.splice(0, s.memories.length - G.data.balance.maxMemories);
      }, { persist: true });
      session = null;
      if (first) G.bus.emit('concert:finished', { roomId: active.roomId, guests: active.guests.slice() });
      return { ok: true, first, message: first ? '小合奏圆满谢幕，这段音乐会回忆已经收好。' : '又一起听了一遍喜欢的旋律，不会重复发奖。' };
    } catch (error) { return fail(error.message || '回忆暂时没能保存，请再试一次。'); }
    finally { busy = false; }
  }
  function cancel(id) { if (!busy && session && (!id || session.id === id)) session = null; }
  G.bus.on('state:replace', () => cancel());
  G.sys.concert = { status, begin, advance, finish, cancel };
})(window.Game);
