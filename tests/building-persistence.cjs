'use strict';

// 独立内存存储与临时SQLite；不监听端口、不读取真实账号或存档。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { prepareRelease, activateRelease, hash } = require('../server/releases.cjs');
const { createSaveValidator, contractHash } = require('../server/save-validator.cjs');
const { openCloudStore } = require('../server/cloud-store.cjs');
const { createCloudApi, etagFor } = require('../server/cloud-api.cjs');
const root = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));

function sandbox(options = {}) {
  const memory = new Map();
  const context = vm.createContext({ console, Date, TextEncoder,
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    document: { hidden: false, addEventListener() {} } });
  context.window = context;
  context.addEventListener = () => {};
  context.localStorage = { getItem: key => memory.has(key) ? memory.get(key) : null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key) };
  const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const files = [...source.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1].split('?')[0]);
  assert.ok(files.includes('js/building/schema.js'), '真实入口必须加载建筑schema bundle');
  const selected = new Set(['js/core/namespace.js', 'js/core/utils.js', 'js/core/bus.js', 'js/building/schema.js', 'js/core/store.js', 'js/core/save.js', 'js/core/public-house.js', 'js/core/content-spaces.js']);
  if (options.life) for (const file of ['js/core/content-spaces.js', 'js/systems/systems.js', 'js/systems/quests.js', 'js/systems/resident-wishes.js', 'js/systems/resident-life.js']) {
    assert.ok(files.includes(file), '真实入口缺少生活模块：' + file); selected.add(file);
  }
  for (const file of files.filter(file => selected.has(file) || file.startsWith('js/data/'))) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  assert.ok(context.Game.publicHouse && context.Game.save);
  return { G: context.Game, context, memory };
}

function legacyFixture(G) {
  const old = plain(G.store.defaultState()); delete old.building;
  old.profile.name = 'PRIVATE_PROFILE_MARKER'; old.profile.birthday = '08-19';
  old.wallet.coin = 719; old.wallet.heart = 23;
  old.inventory.bed_basic = 0; old.inventory.nightstand_basic = 0; old.inventory.desk_lamp_basic = 0;
  old.house.name = 'PRIVATE_HOUSE_MARKER';
  old.house.floors = [{ slots: ['legacy_bedroom', null, null] }];
  old.house.rooms.legacy_bedroom = {
    type: 'bedroom', paidPrice: 0,
    wallpaper: { pattern: 'solid', color: '#FFE3C9', color2: '#FFF8FB' },
    floor: { pattern: 'wood', color: '#EED7B9' }, light: 'warm',
    items: [
      { uid: 'legacy_bed', defId: 'bed_basic', x: 15, y: 130, z: 1, flip: false, color: null, parent: null, depth: .75 },
      { uid: 'legacy_table', defId: 'nightstand_basic', x: 200, y: 140, z: 2, flip: false, color: '#F1B8CF', parent: null, depth: .35 },
      { uid: 'legacy_lamp', defId: 'desk_lamp_basic', x: 205, y: 130, z: 3, flip: true, color: null, parent: 'legacy_table' }
    ]
  };
  old.residents.lily = { movedIn: true, roomId: 'legacy_bedroom', affection: 31, happiness: 75, heartBubbles: 1, lastBubbleAt: 1234, patsToday: 0 };
  old.customArts = [{ id: 'unused_private_art', name: 'PRIVATE_ART_MARKER', pixels: '1' + '.'.repeat(255) }];
  old.album = [{ id: 'private_photo', at: 1234, name: 'PRIVATE_PHOTO_MARKER', image: 'data:image/jpeg;base64,YQ==', width: 1, height: 1 }];
  old.quests.stats.photos = 1;
  old.memories.push({ at: 1234, text: 'PRIVATE_MEMORY_MARKER' });
  // 使用现有v1规则补齐历史兼容字段，随后仍以没有building的完整旧档作为输入。
  const canonical = plain(G.store.validate(old)); delete canonical.building;
  return canonical;
}

function withoutBuilding(value) { const output = plain(value); delete output.building; return output; }

async function request(api, release, actor, body, etag) {
  const bytes = Buffer.from(JSON.stringify(body));
  const req = Readable.from([bytes]);
  Object.assign(req, { method: 'PUT', url: '/api/v1/save', socket: { remoteAddress: '127.0.0.1' }, headers: {
    origin: 'http://game.test', 'content-type': 'application/json', 'content-length': String(bytes.length),
    'x-mc-protocol': '1', 'x-mc-build': release.id, 'x-mc-account': actor.id,
    cookie: api.cookieName + '=' + actor.token, 'x-csrf-token': hash('mc-csrf:' + actor.token), 'if-match': etag
  } });
  const response = { status: null, body: null };
  await api.handle(req, { writeHead(status) { response.status = status; }, end(data) { response.body = JSON.parse(Buffer.from(data).toString()); } }, '/save');
  return response;
}

(async () => {
  let count = 0;
  const check = async (name, run) => { await run(); count++; console.log('✓ ' + name); };
  const { G, memory } = sandbox();
  const legacy = legacyFixture(G), originalLegacy = JSON.stringify(legacy);
  let migrated;
  await check('新存档是空自由地块，没有预设房间迁移内容', () => {
    const state = G.store.defaultState();
    assert.equal(state.building.schema, 2);
    assert.equal(state.building.walls.length, 0); assert.equal(state.building.furniture.length, 0);
    assert.equal(state.building.migration, undefined);
    assert.deepEqual(plain(G.store.validate(state).building), plain(state.building));
  });
  await check('完整合法旧档一次迁移，账号外层资料、经济、居民、相册与UID保持', () => {
    migrated = plain(G.store.validate(legacy));
    assert.equal(JSON.stringify(legacy), originalLegacy, '迁移不得修改输入原文');
    assert.deepEqual(withoutBuilding(migrated), legacy);
    assert.equal(migrated.building.schema, 2); assert.ok(migrated.building.walls.length >= 4);
    assert.deepEqual(migrated.building.furniture.map(item => item.id).sort(), ['legacy_bed', 'legacy_lamp', 'legacy_table']);
    assert.ok(migrated.building.migration);
    const again = plain(G.store.validate(migrated)); assert.deepEqual(again, migrated);
    const oldChanged = plain(migrated); oldChanged.house.rooms.legacy_bedroom.items[0].x += 20;
    assert.deepEqual(plain(G.store.validate(oldChanged).building), migrated.building, '已有新doc不能被旧house再次生成覆盖');
  });
  await check('已有坏文档、未来schema和残缺字段拒绝，不补默认也不重迁移', () => {
    for (const mutate of [
      value => { value.building = null; },
      value => { value.building = {}; },
      value => { value.building.schema = 999; },
      value => { delete value.building.floors; },
      value => { value.building.privateExtra = { wallet: 999 }; },
      value => { value.building.walls[0].floorId = 'missing_floor'; },
      value => { value.building.furniture[0].position.x = Infinity; },
      value => { value.building = JSON.parse(JSON.stringify(value.building).replace('"schema":2', '"schema":2,"__proto__":{}')); }
    ]) { const bad = plain(migrated); mutate(bad); assert.throws(() => G.store.validate(bad)); }
    const invalidLegacy = plain(legacy); invalidLegacy.wallet.coin = -1;
    assert.throws(() => G.store.validate(invalidLegacy), '坏旧档不能通过迁移变成可恢复存档');
  });
  await check('建筑实体预算由schema决定，合法自由文档不受旧房间数组上限误伤', () => {
    const state = G.store.defaultState(), floorId = state.building.floors[0].id;
    state.building.furniture = Array.from({ length: 2001 }, (_, index) => ({ id: 'budget_furniture_' + index, defId: 'bed_basic', floorId,
      position: { x: index % 40, y: 0, z: Math.floor(index / 40) }, rotation: 0, dimensions: { width: 1.5, height: .8, depth: 2 } }));
    assert.equal(G.store.validate(state).building.furniture.length, 2001);
  });
  await check('自由建筑保存刷新恢复，拒写保持内存和磁盘上的原文档', () => {
    G.store.init(migrated); assert.ok(G.save.commit(G.state));
    const revised = plain(migrated); revised.building.walls[0].color = '#E7A6BF'; revised.building.revision++;
    assert.ok(G.save.restore(revised, { source: 'cloud' }).ok);
    assert.deepEqual(plain(G.save.snapshot().state), revised);
    assert.deepEqual(plain(G.save.load()), revised);
    const before = memory.get(G.data.balance.saveKey), current = G.state;
    assert.throws(() => G.store.update(next => { next.building.schema = 999; }, { persist: true }));
    assert.equal(G.state, current); assert.equal(memory.get(G.data.balance.saveKey), before);
    const bad = plain(revised); delete bad.building.openings;
    assert.equal(G.save.restore(bad).ok, false); assert.equal(memory.get(G.data.balance.saveKey), before);
  });
  await check('公开建筑白名单不带迁移来源或私密内容，新参观直接读doc，旧快照仍可迁移', () => {
    const snapshot = plain(G.publicHouse.project(migrated, { title: '公开建筑' }));
    assert.equal(snapshot.building.schema, 2);
    assert.equal(snapshot.building.migration, undefined);
    snapshot.building.furniture.forEach(item => assert.equal(item.legacyRoomId, undefined));
    const serialized = JSON.stringify(snapshot);
    for (const privateKey of ['PRIVATE_', 'sourceHash', 'legacyRoomId', 'wallet', 'inventory', 'birthday', 'album', 'settings', 'memories']) assert.ok(!serialized.includes(privateKey), privateKey);
    const defaultState = G.store.defaultState;
    try { G.store.defaultState = () => { throw new Error('新参观不得合成完整私档'); }; assert.deepEqual(plain(G.publicHouse.readBuilding(snapshot)), snapshot.building); }
    finally { G.store.defaultState = defaultState; }
    const old = plain(snapshot); delete old.building;
    old.house.floors = plain(legacy.house.floors);
    old.house.rooms.legacy_bedroom = plain(legacy.house.rooms.legacy_bedroom); delete old.house.rooms.legacy_bedroom.paidPrice;
    old.residents = Object.entries(legacy.residents).filter(([, resident]) => resident.movedIn).map(([id, resident]) => ({ id, roomId: resident.roomId }));
    assert.equal(G.publicHouse.readBuilding(old).schema, 2);
    assert.equal(G.publicHouse.readBuilding(old).furniture.length, 3, '旧视觉快照仍迁移真实布局');
    assert.deepEqual(snapshot.house.rooms, {}, '新公开模样不夹带归档布局');
    assert.deepEqual(snapshot.house.yard.items, []);
    const publicRooms = G.contentSpaces.rooms({ building: snapshot.building });
    assert.ok(Object.keys(publicRooms).length > 0);
    assert.ok(snapshot.residents.every(resident => Object.hasOwn(publicRooms, resident.roomId)), '公开人物空间引用必须可解析');
    assert.ok(snapshot.residents[0].roomId.startsWith('space_'), '公开人物引用当前可推导空间，不泄露迁移关联');
    assert.equal(G.publicHouse.materialize(snapshot).building.migration, undefined);
    const bad = plain(snapshot); bad.building.schema = 999; assert.throws(() => G.publicHouse.readBuilding(bad));
  });
  await check('当前作品删除不会被归档引用阻止，公开模样只包含新建筑实际引用的画作', () => {
    const old = plain(legacy);
    old.house.rooms.legacy_bedroom.wallpaper = { pattern: 'custom', color: '#FFE3C9', color2: '#FFFFFF', artId: 'unused_private_art' };
    const migratedArt = plain(G.store.validate(old));
    assert.ok(migratedArt.building.walls.some(wall => wall.artId === 'unused_private_art'));
    const before = plain(G.publicHouse.project(migratedArt, { title: '当前作品' }));
    assert.deepEqual(before.customArts.map(art => art.id), ['unused_private_art']);
    const removed = plain(migratedArt);
    removed.building.walls.forEach(wall => { delete wall.artId; });
    removed.customArts = [];
    const checked = plain(G.store.validate(removed));
    assert.deepEqual(checked.house, migratedArt.house, '归档凭据不得为删除当前作品而改写');
    assert.equal(checked.house.rooms.legacy_bedroom.wallpaper.artId, 'unused_private_art');
    const published = plain(G.publicHouse.project(checked, { title: '当前作品' }));
    assert.deepEqual(published.customArts, []); assert.ok(!JSON.stringify(published).includes('unused_private_art'));
    const dangling = plain(checked); dangling.building.walls[0].artId = 'unused_private_art';
    assert.throws(() => G.store.validate(dangling), '当前建筑的悬空作品引用仍须拒绝');
  });
  await check('真实自由卧室可邀请朋友，拆墙保留朋友历史且升级不再生成旧格子', () => {
    const life = sandbox({ life: true }), game = life.G, state = game.store.defaultState(), floorId = state.building.floors[0].id;
    assert.ok(game.contentSpaces && game.sys.residents && game.sys.quests && game.sys.residentLife, '真实入口应加载生活适配和系统');
    const points = [{ x: -2, z: -2 }, { x: 2, z: -2 }, { x: 2, z: 2 }, { x: -2, z: 2 }];
    state.building.walls = points.map((start, index) => ({ id: 'life_wall_' + index, floorId, start, end: points[(index + 1) % points.length], height: 2.7, thickness: .16, color: '#F4DDE7' }));
    state.building.furniture = [{ id: 'life_bed', defId: 'bed_basic', floorId, position: { x: 0, y: 0, z: 0 }, rotation: 0, dimensions: { width: 1.5, height: .8, depth: 2 } }];
    game.store.init(state);
    assert.equal(game.sys.building, undefined, '旧格子建造命令已退役');
    assert.deepEqual(Object.keys(game.sys.decorating).sort(), ['clearUndo', 'score']);
    assert.equal(game.sys.quests.metric('roomCount'), 1); assert.equal(game.sys.quests.metric('bed'), 1);
    const eligibility = game.sys.residents.eligibility('lily'); assert.equal(eligibility.ok, true, eligibility.message);
    const roomId = eligibility.roomIds[0]; assert.ok(roomId && !Object.hasOwn(game.state.house.rooms, roomId));
    assert.equal(game.sys.residents.invite('lily', roomId).ok, true);
    const resident = plain(game.state.residents.lily), archive = JSON.stringify(game.state.house);
    assert.ok(game.sys.economy.addExp(1000).ok); assert.equal(JSON.stringify(game.state.house), archive);
    game.store.update(next => { next.building.walls.pop(); next.building.revision++; });
    assert.deepEqual(plain(game.state.residents.lily), resident);
    assert.equal(game.contentSpaces.get(roomId), null); assert.equal(game.sys.quests.metric('roomCount'), 0);
    assert.equal(game.sys.residentLife.snapshot().length, 0, '未闭合旧位置不制造虚构生活空间');
    assert.ok(game.save.commit(game.state)); assert.equal(game.save.load().residents.lily.roomId, roomId);
    const bad = plain(game.state); bad.residents.lily.roomId = '../../invalid-room';
    assert.throws(() => game.store.validate(bad), '非法引用格式仍须拒绝');
  });

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-building-persistence-'));
  let store, api;
  try {
    const release = prepareRelease({ sourceRoot: root, dataDir, basePath: '/' });
    activateRelease({ dataDir, releaseId: release.id });
    const checker = createSaveValidator({ dataDir, releaseId: release.id });
    await check('服务端使用同一schema bundle校验、迁移和公开投影，缺schema的旧build不可写', () => {
      const checked = checker.validate(legacy);
      assert.deepEqual(withoutBuilding(checked.save), legacy);
      assert.deepEqual(checked.save.building, migrated.building);
      assert.deepEqual(checker.validate(checked.save).save, checked.save);
      const bad = plain(checked.save); bad.building.schema = 999; assert.throws(() => checker.validate(bad));
      assert.equal(checker.projectPublic(checked.save, { title: '服务器公开建筑' }).building.migration, undefined);
      assert.equal(checker.countBuildingRooms(checked.save.building), 1, '新房间摘要来自墙体闭合空间');
      const open = plain(checked.save.building); open.walls.pop();
      assert.equal(checker.countBuildingRooms(open), 0, '旧house仍有卧室也不能冒充已闭合新空间');
      assert.throws(() => contractHash({ ...release, files: release.files.filter(file => file.path !== 'js/building/schema.js') }));
    });
    const actor = { id: 'synthetic_account', token: crypto.randomBytes(32).toString('base64url') };
    let epoch;
    await check('epoch轮换保留八张表、账号存档和不公开偏好，只撤销会话与公开链接', async () => {
      store = openCloudStore({ dataDir }); const db = store.db;
      const tables = () => db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
      const originalTables = tables(); assert.equal(originalTables.length, 8);
      const checked = checker.validate(migrated), oldEpoch = store.epoch();
      db.prepare('INSERT INTO accounts(id,username,display_name,password_salt,password_hash,created_at) VALUES (?,?,?,?,?,?)').run(actor.id, 'synthetic_user', '合成测试', 'synthetic_salt', 'synthetic_hash', 1);
      db.prepare('INSERT INTO saves(account_id,revision,json,content_hash,updated_at) VALUES (?,?,?,?,?)').run(actor.id, 1, checked.json, checked.contentHash, 1);
      db.prepare('INSERT INTO sessions(token_hash,account_id,expires_at,created_at,epoch) VALUES (?,?,?,?,?)').run(hash(actor.token), actor.id, Date.now() + 60000, 1, oldEpoch);
      db.prepare('INSERT INTO publications(id,account_id,title,display_name,snapshot_json,source_revision,room_count,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(crypto.randomUUID(), actor.id, '旧链接', '合成测试', '{}', 1, 1, 1);
      db.prepare('INSERT INTO metadata(key,value) VALUES (?,?)').run('private:' + actor.id, '1');
      epoch = store.rotateEpoch();
      assert.notEqual(epoch, oldEpoch); assert.deepEqual(tables(), originalTables);
      assert.equal(db.prepare('SELECT value FROM metadata WHERE key=?').get('private:' + actor.id).value, '1');
      assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
      assert.equal(db.prepare('SELECT count(*) AS n FROM publications').get().n, 0);
      assert.equal(db.prepare('SELECT json FROM saves WHERE account_id=?').get(actor.id).json, checked.json);
      assert.equal(db.prepare('SELECT count(*) AS n FROM accounts').get().n, 1);
      await store.close(); store = null;
    });
    await check('轮换后继续保存新doc也不会自动重新公开已选择私密的小屋', async () => {
      api = createCloudApi({ dataDir, basePath: '/', origin: 'http://game.test' });
      api.store.db.prepare('INSERT INTO sessions(token_hash,account_id,expires_at,created_at,epoch) VALUES (?,?,?,?,?)').run(hash(actor.token), actor.id, Date.now() + 60000, Date.now(), epoch);
      const row = api.store.db.prepare('SELECT * FROM saves WHERE account_id=?').get(actor.id);
      const next = plain(migrated); next.building.revision++; next.building.walls[0].color = '#B9CFE4';
      const response = await request(api, release, actor, { save: next, mutationId: 'synthetic_building_save', expectedEpoch: epoch }, etagFor(epoch, row));
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.equal(api.store.db.prepare('SELECT count(*) AS n FROM publications WHERE account_id=?').get(actor.id).n, 0);
      assert.equal(api.store.db.prepare('SELECT value FROM metadata WHERE key=?').get('private:' + actor.id).value, '1');
      assert.deepEqual(JSON.parse(api.store.db.prepare('SELECT json FROM saves WHERE account_id=?').get(actor.id).json).building, next.building);
    });
  } finally {
    if (api) await api.close();
    if (store) await store.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  console.log(count + ' 组建筑迁移、保存、公开和隐私恢复检查通过。');
})().catch(error => { console.error(error); process.exitCode = 1; });
