#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { prepareRelease, activateRelease, listReleases, verifyRelease, readActiveId, normalizeBasePath } = require('./releases.cjs');
const { createHandler } = require('./handler.cjs');
const HELP = `棉花糖小屋网站服务（Node.js 24，无第三方依赖）
  node server/cli.cjs prepare [--source-root DIR] [--data-dir DIR] [--base-path /cottage] [--activate]
  node server/cli.cjs list [--data-dir DIR]
  node server/cli.cjs activate RELEASE_ID [--data-dir DIR]
  node server/cli.cjs serve --host 127.0.0.1 --port 8080 [--data-dir DIR] [--base-path /cottage] [--origin https://game.example.com] [--secure-cookies]
  node server/cli.cjs backup [--data-dir DIR]
  node server/cli.cjs rotate-epoch [--data-dir DIR]
prepare/activate/list 不监听端口。serve 必须明确 host 和 port。默认 data-dir 为项目/.server-data。
`;
function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.some(value => typeof value !== 'string')) throw new Error('命令参数无效。');
  const command = argv[0], options = {}, positional = [];
  const allowed = { prepare: new Set(['source-root', 'data-dir', 'base-path', 'activate']), list: new Set(['data-dir']), activate: new Set(['data-dir']), serve: new Set(['data-dir', 'base-path', 'host', 'port', 'origin', 'secure-cookies']), backup: new Set(['data-dir']), 'rotate-epoch': new Set(['data-dir']) };
  if (['--help', '-h', 'help'].includes(command) || !command) return { command: 'help', options };
  if (!allowed[command]) throw new Error('未知命令：' + command);
  for (let i = 1; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) { positional.push(token); continue; }
    const key = token.slice(2);
    if (!allowed[command].has(key) || Object.hasOwn(options, key)) throw new Error('未知或重复选项：' + token);
    if (key === 'activate' || key === 'secure-cookies') options[key] = true;
    else { const value = argv[++i]; if (!value || value.startsWith('--')) throw new Error('选项缺少值：' + token); options[key] = value; }
  }
  if (command === 'activate' ? positional.length !== 1 : positional.length !== 0) throw new Error('位置参数数量无效。');
  if (options['base-path'] !== undefined) normalizeBasePath(options['base-path']);
  if (command === 'serve') {
    if (!options.host || !/^[A-Za-z0-9.:-]+$/.test(options.host)) throw new Error('serve 需要明确 --host；本地使用 127.0.0.1。');
    if (!options.port || !/^\d+$/.test(options.port) || Number(options.port) < 1 || Number(options.port) > 65535) throw new Error('serve 需要明确 --port，范围 1–65535。');
  }
  return { command, options, releaseId: positional[0] };
}
async function run(argv) {
  const { command, options, releaseId } = parseArgs(argv);
  if (command === 'help') { process.stdout.write(HELP); return; }
  const projectRoot = path.resolve(__dirname, '..'), dataDir = path.resolve(options['data-dir'] || path.join(projectRoot, '.server-data')), basePath = options['base-path'] || '/';
  if (command === 'prepare') {
    const manifest = prepareRelease({ sourceRoot: path.resolve(options['source-root'] || projectRoot), dataDir, basePath });
    if (options.activate) activateRelease({ dataDir, releaseId: manifest.id });
    process.stdout.write(JSON.stringify({ releaseId: manifest.id, basePath: manifest.basePath || '/', files: manifest.files.length, active: !!options.activate }) + '\n'); return;
  }
  if (command === 'list') { process.stdout.write(JSON.stringify(listReleases(dataDir), null, 2) + '\n'); return; }
  if (command === 'activate') { const manifest = activateRelease({ dataDir, releaseId }); process.stdout.write(JSON.stringify({ active: manifest.id, basePath: manifest.basePath || '/' }) + '\n'); return; }
  if (command === 'backup' || command === 'rotate-epoch') {
    const store = require('./cloud-store.cjs').openCloudStore({ dataDir, mustExist: true });
    try { process.stdout.write(JSON.stringify(command === 'backup' ? { backup: await store.backupDatabase() } : { serverEpoch: store.rotateEpoch(), sessionsRevoked: true }) + '\n'); }
    finally { await store.close(); }
    return;
  }
  const manifest = verifyRelease(dataDir, readActiveId(dataDir));
  if (manifest.basePath !== normalizeBasePath(basePath)) throw new Error('serve 的 base-path 必须与活动 release 一致。');
  if (!options.origin && !['127.0.0.1', 'localhost', '::1'].includes(options.host)) throw new Error('对外监听必须明确 --origin，不能根据代理请求头猜测。');
  const hostname = options.host.includes(':') ? '[' + options.host + ']' : options.host;
  const origin = options.origin || 'http://' + hostname + ':' + Number(options.port);
  const cloudApi = require('./cloud-api.cjs').createCloudApi({ dataDir, basePath, origin, secureCookies: !!options['secure-cookies'] });
  const server = require('node:http').createServer(createHandler({ dataDir, basePath, cloudApi }));
  const backupTimer = setInterval(() => { cloudApi.backupDatabase().catch(() => process.stderr.write('账号备份未完成，请检查私有数据目录与磁盘空间。\n')); }, 24 * 60 * 60 * 1000); backupTimer.unref();
  void cloudApi.backupDatabase().catch(() => process.stderr.write('启动备份未完成，请检查私有数据目录与磁盘空间。\n'));
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
  server.on('error', error => { clearInterval(backupTimer); void cloudApi.close(); process.stderr.write('网站服务启动失败：' + error.message + '\n'); process.exitCode = 1; });
  server.listen(Number(options.port), options.host, () => process.stdout.write(JSON.stringify({ listening: true, host: options.host, port: Number(options.port), basePath: normalizeBasePath(basePath) || '/', releaseId: manifest.id }) + '\n'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { clearInterval(backupTimer); cloudApi.closeLive(); server.close(async () => { try { await cloudApi.backupDatabase(); } catch (_) { process.stderr.write('退出备份未完成。\n'); } await cloudApi.close(); process.exitCode = 0; }); });
  server.cloudApi = cloudApi;
  return server;
}
if (require.main === module) {
  run(process.argv.slice(2)).catch(error => { process.stderr.write('网站服务：' + error.message + '\n'); process.exitCode = 1; });
}
module.exports = { parseArgs, run, HELP };
