import {existsSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

import {ipcMain} from 'electron';

import {collectProcess, startProcess} from './process-runner.js';

// Detect and prepare the system toolchains used to RUN non-Python recorded
// tests: Ruby (.rb), Node + WebdriverIO (.js), and the Oxygen CLI (.js).
//
// Unlike Python, these are NOT bundled or isolated — they must already be on the
// user's PATH. We only detect them, install the per-language client deps, and
// (in python-tests.js) invoke them. Same security posture: fixed command
// templates, shell:false, no renderer-supplied executables.

const isWin = process.platform === 'win32';
// node/ruby are real executables; npm/gem/oxygen are .cmd shims on Windows that
// won't resolve under shell:false.
const winCmd = (name) => (isWin ? `${name}.cmd` : name);

/** Register the system-runtime IPC channels. Call from setupIPCListeners(). */
export function setupRuntimesIPC() {
  ipcMain.handle('runtimes:detect', () => detectRuntimes());
  ipcMain.handle('runtimes:installRubyGems', (evt) => installRubyGems(evt.sender));
  ipcMain.handle('runtimes:installJsDeps', (evt, {workingDir} = {}) =>
    installJsDeps(evt.sender, workingDir),
  );
}

// .exe (ruby/node) spawn fine under shell:false; .cmd shims (npm/gem/oxygen)
// must run through a shell on Windows or Node throws EINVAL.
const needsShell = (command) => command.endsWith('.cmd');

async function probe(command) {
  const {code, error, stdout, stderr} = await collectProcess({
    command,
    args: ['--version'],
    shell: needsShell(command),
  });
  if (error) {
    return {found: false}; // spawn failed -> not on PATH
  }
  const version = (stdout || stderr || '').trim().split('\n')[0] || null;
  return {found: true, version, ok: code === 0};
}

async function detectRuntimes() {
  const [ruby, node, npm, oxygen] = await Promise.all([
    probe('ruby'),
    probe('node'),
    probe(winCmd('npm')),
    probe(winCmd('oxygen')),
  ]);
  return {ruby, node, npm, oxygen};
}

/** Install the Appium Ruby core client (appium_lib_core) for running .rb tests. */
function installRubyGems(sender) {
  const command = winCmd('gem');
  const {runId} = startProcess(sender, {
    command,
    args: ['install', 'appium_lib_core'],
    shell: needsShell(command),
  });
  return {status: 'started', runId, op: 'installRubyGems'};
}

/** Install WebdriverIO into the working dir so node can run recorded .js tests. */
function installJsDeps(sender, workingDir) {
  if (typeof workingDir !== 'string' || !existsSync(workingDir)) {
    throw new Error('A valid working directory is required.');
  }
  // ESM `import {remote} from 'webdriverio'` needs the dir marked as a module.
  const pkgJson = join(workingDir, 'package.json');
  if (!existsSync(pkgJson)) {
    writeFileSync(
      pkgJson,
      JSON.stringify({name: 'appium-tests', private: true, type: 'module'}, null, 2),
      'utf8',
    );
  }
  const command = winCmd('npm');
  const {runId} = startProcess(sender, {
    command,
    args: ['install', 'webdriverio'],
    options: {cwd: workingDir},
    shell: needsShell(command),
  });
  return {status: 'started', runId, op: 'installJsDeps'};
}
