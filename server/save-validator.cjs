'use strict';

// VM 只执行发布时校验过的本项目代码；用户 JSON 通过变量传入 JSON.parse，永不拼进代码。
const vm = require('node:vm');
const { hash, readManifest, readReleaseFile } = require('./releases.cjs');
const MAX_SAVE_BYTES = 3 * 1024 * 1024, MAX_SAVE_CHARS = 2500000;
function contractFiles(manifest) {
  const selected = manifest.files.filter(file => file.path.startsWith('js/data/') || ['js/core/namespace.js', 'js/core/utils.js', 'js/building/schema.js', 'js/core/store.js'].includes(file.path));
  const schemaIndex = selected.findIndex(file => file.path === 'js/building/schema.js'), storeIndex = selected.findIndex(file => file.path === 'js/core/store.js');
  if (schemaIndex < 0 || storeIndex < 0 || schemaIndex > storeIndex) throw new Error('发布版本缺少建筑校验模块或加载顺序有误。');
  return selected;
}
function contractHash(manifest) { return hash(JSON.stringify(contractFiles(manifest).map(file => [file.path, file.sha256]))); }
function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
  return value;
}
function createSaveValidator({ dataDir, releaseId }) {
  const manifest = readManifest(dataDir, releaseId), context = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
  context.window = context;
  for (const file of contractFiles(manifest)) {
    const { content } = readReleaseFile(dataDir, manifest, file.path);
    new vm.Script(content.toString('utf8'), { filename: file.path }).runInContext(context, { timeout: 1000 });
  }
  if (!context.Game?.store?.validate || !context.Game?.store?.defaultState) throw new Error('发布版本没有完整存档校验器。');
  // 公开投影不参与私有存档兼容身份；增加展示能力不应使旧私有存档页面失效。
  const projector = manifest.files.find(file => file.path === 'js/core/public-house.js');
  if (projector) {
    const { content } = readReleaseFile(dataDir, manifest, projector.path);
    new vm.Script(content.toString('utf8'), { filename: projector.path }).runInContext(context, { timeout: 1000 });
  }
  const validateScript = new vm.Script('JSON.stringify(Game.store.validate(JSON.parse(__inputJson)))');
  const defaultScript = new vm.Script('JSON.stringify(Game.store.defaultState())');
  const projectScript = new vm.Script('JSON.stringify(Game.publicHouse.project(JSON.parse(__publicSave), JSON.parse(__publicOptions)))');
  const roomCountScript = new vm.Script('(function () { var document = CottageBuilding.validateDocument(JSON.parse(__buildingSummary), Game.data.furnitureById); return document.floors.reduce(function (count, floor) { return count + CottageBuilding.deriveSpaces(document, floor.id).length; }, 0); })()');
  function validate(value) {
    const input = JSON.stringify(value);
    if (typeof input !== 'string' || input.length > MAX_SAVE_CHARS || Buffer.byteLength(input) > MAX_SAVE_BYTES) throw new Error('存档超过 3MiB 或字符容量。');
    context.__inputJson = input;
    try {
      const validated = validateScript.runInContext(context, { timeout: 1500 });
      const json = JSON.stringify(canonicalValue(JSON.parse(validated)));
      if (json.length > MAX_SAVE_CHARS || Buffer.byteLength(json) > MAX_SAVE_BYTES) throw new Error('存档超过容量。');
      return { save: JSON.parse(json), json, contentHash: hash(json) };
    } finally { delete context.__inputJson; }
  }
  function projectPublic(save, options) {
    if (!context.Game?.publicHouse?.project) throw new Error('当前版本尚未提供公开小屋投影。');
    context.__publicSave = validate(save).json;
    context.__publicOptions = JSON.stringify(options);
    try {
      const json = projectScript.runInContext(context, { timeout: 1500 });
      if (typeof json !== 'string' || json.length > MAX_SAVE_CHARS || Buffer.byteLength(json) > MAX_SAVE_BYTES) throw new Error('公开小屋超过容量。');
      const value = JSON.parse(json);
      if (!value || Array.isArray(value) || value.version !== 1) throw new Error('公开小屋投影不完整。');
      return value;
    } finally { delete context.__publicSave; delete context.__publicOptions; }
  }
  function countBuildingRooms(building) {
    const json = JSON.stringify(building);
    if (typeof json !== 'string' || json.length > MAX_SAVE_CHARS || Buffer.byteLength(json) > MAX_SAVE_BYTES) throw new Error('公开建筑超过容量。');
    context.__buildingSummary = json;
    try { return roomCountScript.runInContext(context, { timeout: 1500 }); }
    finally { delete context.__buildingSummary; }
  }
  return { releaseId, contractHash: contractHash(manifest), validate, projectPublic, countBuildingRooms, defaultSave: () => JSON.parse(defaultScript.runInContext(context, { timeout: 1000 })) };
}
module.exports = { createSaveValidator, contractHash, MAX_SAVE_BYTES, MAX_SAVE_CHARS };
