'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
// 账号/规则检查始终串行；不会启动浏览器、监听端口或读取玩家数据。
const checks = [
  [path.join('node_modules', 'tsx', 'dist', 'cli.mjs'), '--test', '--test-concurrency=1', 'tests/building-domain.test.ts'],
  [path.join('node_modules', 'tsx', 'dist', 'cli.mjs'), '--test', '--test-concurrency=1', 'tests/roof-footprints.test.ts'],
  [path.join('node_modules', 'tsx', 'dist', 'cli.mjs'), '--test', '--test-concurrency=1', 'tests/roof-surface.test.ts'],
  [path.join('node_modules', 'tsx', 'dist', 'cli.mjs'), '--test', '--test-concurrency=1', 'tests/roof-mesh.test.ts'],
  ...['building-persistence','building-life','resident-rehousing','building-content','content-expansion','album-storage','birthday','time','minigames','photography','crafting','concert','garden-boundaries','collection-boundaries','creative-boundaries','avatar-presets','rarity-outfit-rewards','residents-visual-ui','collection-book-visual-ui','quests-visual-ui','save-ui','exterior','house-styles','house-blueprints','house-design-ui','live-space','host-room','visit-session','save-restore','cloud-core','cloud-sync','cloud-api','cloud-e2e','server','offline','live-hub','knock-hub'].map(name => ['tests/' + name + '.cjs'])
];
for (const args of checks) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('全部 ' + checks.length + ' 个领域、内容、存档与服务检查入口通过；真实浏览器验收另行记录。');
