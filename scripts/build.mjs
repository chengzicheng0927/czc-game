import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// 构建只生成同源静态资源；不启动服务器，不选择或激活运行中的版本。
await mkdir('js/building', { recursive: true });
await build({ entryPoints: ['src/building/domain.ts'], outfile: 'js/building/schema.js', bundle: true, format: 'iife', globalName: 'CottageBuilding', target: 'es2022', minify: true, legalComments: 'inline' });
await build({ entryPoints: ['src/app.ts'], outfile: 'js/building/app.js', bundle: true, format: 'iife', target: 'es2022', minify: true, legalComments: 'inline' });
await writeFile('css/building.css', await readFile('src/styles.css'));
const legacy = JSON.parse(await readFile('scripts/legacy-assets.json', 'utf8'));
const css = ["css/style.css", "css/quests.css", "css/creative.css", "css/gifts.css", "css/observatory.css", "css/deals.css", "css/login.css", "css/collection-book.css", "css/crafting.css", "css/concert.css", "css/birthday.css", "css/harvest-feedback.css", "css/resident-life.css", "css/furniture-rarity.css", "css/photography.css", "css/cloud-account.css", "css/neighbors.css", "css/live-room.css", "css/visit.css", "css/visit-session.css", "css/game-feel.css", "css/character-visual.css", "css/garden-visual.css", "css/shell.css", "css/house-design.css", "css/house-blueprints.css", "css/yard.css", "css/building.css"];
const fingerprint = async path => createHash('sha256').update(await readFile(path)).digest('hex').slice(0, 10);
const scripts = await Promise.all([...legacy, 'js/building/app.js'].map(async path => `  <script src="${path}?v=${await fingerprint(path)}"></script>`));
const styles = await Promise.all(css.map(async path => `  <link rel="stylesheet" href="${path}?v=${await fingerprint(path)}">`));
// 明确声明按需美术资源：自定义link关系不触发下载，实际图卡/远景读取后才载入。
const artManifest = JSON.parse(await readFile('assets/runtime/manifest.json', 'utf8'));
let artBytes = 0;
const artLinks = await Promise.all(artManifest.assets.map(async asset => {
  if (!/^[a-z0-9-]+$/.test(asset.id) || !/^assets\/runtime\/[a-z0-9-]+\.(?:jpg|png|webp)$/.test(asset.file)) throw new Error('运行美术资源路径无效。');
  const content = await readFile(asset.file); artBytes += content.length;
  return `  <link rel="cottage-asset" id="art-${asset.id}" data-art="${asset.id}" href="${asset.file}?v=${createHash('sha256').update(content).digest('hex').slice(0, 10)}">`;
}));
if (artBytes > artManifest.maxBytes) throw new Error('运行美术资源超过预算：' + artBytes);
const html = (await readFile('src/shell.html', 'utf8')).replace('<!-- STYLES -->', [...styles, ...artLinks].join('\n')).replace('<!-- SCRIPTS -->', scripts.join('\n'));
await writeFile('index.html', html);
console.log(`Built free-building application: ${legacy.length + 1} scripts, ${css.length} styles, ${artLinks.length} art assets (${artBytes} bytes); source fingerprints generated.`);
