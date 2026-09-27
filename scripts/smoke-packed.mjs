import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const root = process.cwd();
const temp = mkdtempSync(join(tmpdir(), 'depwire-packed-'));
const env = { ...process.env, DEPWIRE_NO_TELEMETRY: '1' };
function npm(args, cwd) {
  // npm.cmd needs cmd.exe on Windows; every argument here is controlled locally.
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    cwd, env, encoding: 'utf8', shell: process.platform === 'win32',
  });
  if (result.status !== 0) throw new Error(`npm ${args[0]} failed: ${result.error ?? result.stderr}`);
  return result.stdout;
}
try {
  const packDestination = process.platform === 'win32' ? `"${temp}"` : temp;
  const [{ filename }] = JSON.parse(npm(['pack', '--json', '--pack-destination', packDestination], root));
  const install = join(temp, 'install');
  const fixture = join(temp, 'fixture');
  mkdirSync(install);
  cpSync(join(root, 'test/fixtures/sample-project'), fixture, { recursive: true });
  npm(['init', '-y'], install);
  const tarball = join(temp, filename);
  npm(['install', process.platform === 'win32' ? `"${tarball}"` : tarball], install);
  const cli = join(install, 'node_modules/depwire-cli/dist/index.js');
  function cliRun(args) {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: install, env, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr || String(result.error));
    return result.stdout.trim();
  }
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  // Preserve the original smoke test's installed npm bin/shim check.
  const shim = join(install, 'node_modules/.bin', process.platform === 'win32' ? 'depwire.cmd' : 'depwire');
  const installedCommand = spawnSync(process.platform === 'win32' ? `"${shim}"` : shim, ['--version'], {
    cwd: install, env, encoding: 'utf8', shell: process.platform === 'win32',
  });
  if (installedCommand.status !== 0 || installedCommand.stdout.trim() !== version) {
    throw new Error(`Installed depwire command failed: ${installedCommand.error ?? installedCommand.stderr}`);
  }
  cliRun(['parse', fixture, '--output', join(temp, 'output')]);
  const child = spawn(process.execPath, [cli, 'mcp', fixture, '--no-cache'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  const send = message => child.stdin.write(JSON.stringify(message) + '\n');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr += chunk; });
  try {
    const list = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`MCP timeout: ${stderr}`)), 30000);
      const fail = error => { clearTimeout(timer); reject(error); };
      child.once('error', fail);
      child.once('exit', code => fail(new Error(`MCP exited ${code}: ${stderr}`)));
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        stdout += chunk;
        let end;
        while ((end = stdout.indexOf('\n')) >= 0) {
          const line = stdout.slice(0, end).trim(); stdout = stdout.slice(end + 1);
          if (!line) continue;
          try {
            const message = JSON.parse(line);
            if (message.error) return fail(new Error(JSON.stringify(message.error)));
            if (message.id === 1) {
              send({ jsonrpc: '2.0', method: 'notifications/initialized' });
              send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
            } else if (message.id === 2) { clearTimeout(timer); resolve(message.result?.tools); }
          } catch (error) { fail(error); }
        }
      });
      send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'depwire-ci-smoke', version: '1.0.0' } } });
    });
    if (!Array.isArray(list) || list.length !== 24) throw new Error(`Expected 24 tools, got ${list?.length}`);
    console.log(`Packed version ${version}; parse passed; MCP tools/list = ${list.length}`);
  } finally {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    if (child.exitCode === null && child.signalCode === null) await exited;
  }
} finally { rmSync(temp, { recursive: true, force: true }); }
