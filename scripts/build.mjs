import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// 构建只生成同源静态资源；不启动服务器，不选择或激活运行中的版本。
await mkdir('js/building', { recursive: true });
await build({ entryPoints: ['src/building/domain.ts'], outfile: 'js/building/schema.js', bundle: true, format: 'iife', globalName: 'CottageBuilding', target: 'es2022', minify: true, legalComments: 'inline' });
await build({ entryPoints: ['src/app.ts'], outfile: 'js/building/app.js', bundle: true, format: 'iife', target: 'es2022', minify: true, legalComments: 'inline' });
await writeFile('css/building.css', await readFile('src/styles.css'));
const legacy = JSON.parse(await readFile('scripts/legacy-assets.json', 'utf8'));
const css = ["css/style.css", "css/quests.css", "css/creative.css", "css/gifts.css", "css/observatory.css", "css/deals.css", "css/login.css", "css/collection-book.css", "css/crafting.css", "css/concert.css", "css/birthday.css", "css/harvest-feedback.css", "css/resident-life.css", "css/furniture-rarity.css", "css/photography.css", "css/cloud-account.css", "css/neighbors.css", "css/live-room.css", "css/visit.css", "css/visit-session.css", "css/game-feel.css", "css/character-visual.css", "css/garden-visual.css", "css/shell.css", "css/house-design.css", "css/building.css"];
const fingerprint = async path => createHash('sha256').update(await readFile(path)).digest('hex').slice(0, 10);
const scripts = await Promise.all([...legacy, 'js/building/app.js'].map(async path => `  <script src="${path}?v=${await fingerprint(path)}"></script>`));
const styles = await Promise.all(css.map(async path => `  <link rel="stylesheet" href="${path}?v=${await fingerprint(path)}">`));
const html = (await readFile('src/shell.html', 'utf8')).replace('<!-- STYLES -->', styles.join('\n')).replace('<!-- SCRIPTS -->', scripts.join('\n'));
await writeFile('index.html', html);
console.log(`Built free-building application: ${legacy.length + 1} scripts, ${css.length} styles; source fingerprints generated.`);
