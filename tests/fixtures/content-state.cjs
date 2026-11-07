'use strict';

// 纯内容规则的隔离环境，按当前实际清单加载，不创建DOM、GPU、服务或真实存档。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const spaces = require('./free-spaces.cjs');
const root = path.resolve(__dirname, '../..');
const core = new Set(['js/core/namespace.js', 'js/core/utils.js', 'js/core/bus.js', 'js/building/schema.js', 'js/core/store.js', 'js/core/save.js', 'js/core/content-spaces.js']);
const files = JSON.parse(fs.readFileSync(path.join(root, 'scripts/legacy-assets.json'), 'utf8')).filter(file => core.has(file) || file.startsWith('js/data/') || file.startsWith('js/systems/'));
function setup(saved) {
  let clock = new Date(2026, 9, 28, 12).getTime(); const RealDate = Date, memory = new Map();
  class TestDate extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const context = vm.createContext({ console, Blob, URL, Date: TestDate, TextEncoder, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, document: { addEventListener() {} } });
  context.window = context; context.addEventListener = () => {}; context.localStorage = { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, String(value)) };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game, parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context);
  spaces.register(G, context.CottageBuilding); G.store.init(saved ? parse(saved) : undefined); G.sys.init();
  return { G, parse, context, memory, clock: () => clock, at(date, hour = 12) { const parts = date.split('-').map(Number); clock = new RealDate(parts[0], parts[1] - 1, parts[2], hour).getTime(); } };
}
module.exports = { setup };
