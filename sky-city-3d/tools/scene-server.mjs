import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const runtime = path.join(root, 'artifacts', 'runtime');
const pidFile = path.join(runtime, 'vite.pid');
const url = 'http://127.0.0.1:4400';
mkdirSync(runtime, { recursive: true });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function isSceneServer() {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok && (await response.text()).includes('天空之城');
  } catch { return false; }
}

async function start({ open = true } = {}) {
  if (!await isSceneServer()) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response) throw new Error('端口 4400 已被其他程序占用。');
    } catch (error) {
      if (error.message.includes('占用')) throw error;
    }
    const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
    if (!existsSync(vite)) throw new Error('缺少本地依赖，请先在项目目录运行 npm install。');
    const stdout = openSync(path.join(runtime, 'vite.out.log'), 'a');
    const stderr = openSync(path.join(runtime, 'vite.error.log'), 'a');
    const child = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', '4400'], {
      cwd: root,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', stdout, stderr],
      env: { ...process.env, npm_config_cache: path.join(root, '.npm-cache') },
    });
    closeSync(stdout);
    closeSync(stderr);
    child.unref();
    writeFileSync(pidFile, String(child.pid));
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await delay(120);
      if (await isSceneServer()) { ready = true; break; }
    }
    if (!ready) throw new Error(`场景未能启动，请查看 ${path.join(runtime, 'vite.error.log')}`);
  }
  if (open) spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, windowsHide: true, stdio: 'ignore' }).unref();
  console.log(`天空之城已启动：${url}`);
}

async function stop() {
  if (!existsSync(pidFile)) {
    console.log('没有找到由本项目启动的场景服务。');
    return;
  }
  const pid = Number(readFileSync(pidFile, 'utf8').trim());
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('PID 文件无效，已拒绝停止进程。');
  const query = spawnSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}") | Select-Object Name,CommandLine | ConvertTo-Json -Compress`,
  ], { encoding: 'utf8', windowsHide: true });
  let processInfo = null;
  try { processInfo = JSON.parse(query.stdout.trim()); } catch {}
  const owned = processInfo?.Name?.toLowerCase() === 'node.exe'
    && processInfo.CommandLine?.includes(root)
    && processInfo.CommandLine?.includes('vite.js');
  if (!owned) throw new Error('PID 当前不属于本项目的 Vite 进程，已拒绝停止。');
  try { process.kill(pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  rmSync(pidFile, { force: true });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (!await isSceneServer()) break;
    await delay(100);
  }
  if (await isSceneServer()) throw new Error('场景服务仍在运行，请查看 artifacts/runtime。');
  console.log('天空之城场景服务已停止。');
}

const command = process.argv[2];
if (command === 'start') await start({ open: !process.argv.includes('--no-open') });
else if (command === 'stop') await stop();
else throw new Error('用法：node tools/scene-server.mjs start [--no-open] | stop');
