import {existsSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';

import {app, ipcMain} from 'electron';

import {resolveBinary} from './binary-resolver.js';
import {collectProcess, startProcess} from './process-runner.js';

// Python environment management: detect an interpreter, create an isolated,
// app-scoped venv, and install dependencies into it. Python is never bundled
// (Electron can't ship an interpreter cleanly), so we locate the user's Python
// and manage a venv for them -- which keeps installs out of their system site.
//
// Security: same posture as Step 2. The renderer sends intent; MAIN builds
// commands from templates; package specs are validated; anything outside the
// managed REQUIRED set needs an explicit third-party confirmation.

export const PYTHON_ENV_DIR = join(app.getPath('userData'), 'python-env');
export const VENV_DIR = join(PYTHON_ENV_DIR, 'venv');

const isWin = process.platform === 'win32';

// Packages the GUI manages by default. pytest is intentionally unpinned so pip
// resolves a version compatible with whatever interpreter is present.
export const REQUIRED_PACKAGES = ['Appium-Python-Client', 'pytest'];

// Robot Framework runs on the same venv (it's Python). Installing these adds
// `.robot` execution. Managed (no third-party confirmation needed).
export const ROBOT_PACKAGES = ['robotframework', 'robotframework-appiumlibrary'];

// Appium-Python-Client requires >= 3.9; that's our interpreter floor.
const MIN_PYTHON = [3, 9];

// PyPI distribution name, optional ==version pin. Must start alphanumeric
// (never '-', which could be parsed as a pip flag -> argument injection).
const PYPI_SPEC = /^[a-z0-9][a-z0-9._-]{0,100}(==[a-z0-9][a-z0-9._*-]*)?$/i;

export function venvPython() {
  return isWin ? join(VENV_DIR, 'Scripts', 'python.exe') : join(VENV_DIR, 'bin', 'python');
}

export function venvExists() {
  return existsSync(venvPython());
}

/** Register the Python-environment IPC channels. Call from setupIPCListeners(). */
export function setupPythonEnvIPC() {
  ipcMain.handle('python:status', () => status());
  ipcMain.handle('python:detect', () => detectInterpreter());
  ipcMain.handle('python:createVenv', (evt) => createVenv(evt.sender));
  ipcMain.handle('python:installDeps', (evt, payload) => installDeps(evt.sender, payload));
}

function validatePkg(spec) {
  if (typeof spec !== 'string' || spec.startsWith('-') || !PYPI_SPEC.test(spec)) {
    throw new Error(`Invalid package spec: ${String(spec)}`);
  }
}

async function detectInterpreter() {
  const {path, source} = await resolveBinary('python');
  const probe =
    'import sys,json;print(json.dumps({"v":list(sys.version_info[:3]),"exe":sys.executable}))';
  const {stdout, code, error} = await collectProcess({command: path, args: ['-c', probe]});
  if (error || code !== 0) {
    return {found: false, source, error: error || `python exited with code ${code}`};
  }
  let info;
  try {
    // take the last non-empty line in case of any preamble
    info = JSON.parse(stdout.trim().split('\n').pop());
  } catch {
    return {found: false, source, error: 'Could not parse interpreter version'};
  }
  const [maj, min, patch] = info.v;
  const meetsMinimum = maj > MIN_PYTHON[0] || (maj === MIN_PYTHON[0] && min >= MIN_PYTHON[1]);
  return {
    found: true,
    source,
    path,
    executable: info.exe,
    version: `${maj}.${min}.${patch}`,
    meetsMinimum,
    minimum: MIN_PYTHON.join('.'),
  };
}

async function installedPackages() {
  if (!venvExists()) {
    return {};
  }
  const {stdout, code} = await collectProcess({
    command: venvPython(),
    args: ['-m', 'pip', 'list', '--format=json', '--disable-pip-version-check'],
  });
  if (code !== 0) {
    return {};
  }
  let list = [];
  try {
    list = JSON.parse(stdout.trim().split('\n').pop());
  } catch {
    return {};
  }
  const map = {};
  for (const p of list) {
    map[String(p.name).toLowerCase()] = p.version;
  }
  return map;
}

async function status() {
  const python = await detectInterpreter();
  const venv = venvExists();
  const pkgs = venv ? await installedPackages() : {};
  const required = REQUIRED_PACKAGES.map((name) => {
    const key = name.toLowerCase();
    return {name, installed: key in pkgs, version: pkgs[key] ?? null};
  });
  const ready =
    python.found && python.meetsMinimum && venv && required.every((r) => r.installed);
  const robotReady =
    venv && 'robotframework' in pkgs && 'robotframework-appiumlibrary' in pkgs;
  return {python, venv, packages: pkgs, required, ready, robotReady};
}

async function createVenv(sender) {
  const det = await detectInterpreter();
  if (!det.found) {
    throw new Error('No usable Python interpreter found on PATH.');
  }
  if (!det.meetsMinimum) {
    throw new Error(`Python ${MIN_PYTHON.join('.')}+ required (found ${det.version}).`);
  }
  mkdirSync(PYTHON_ENV_DIR, {recursive: true});
  const {runId} = startProcess(sender, {command: det.path, args: ['-m', 'venv', VENV_DIR]});
  return {status: 'started', runId, op: 'createVenv'};
}

async function installDeps(sender, {packages = REQUIRED_PACKAGES, allowThirdParty = false} = {}) {
  if (!venvExists()) {
    return {status: 'venv_missing'};
  }
  const requiredBases = new Set(
    [...REQUIRED_PACKAGES, ...ROBOT_PACKAGES].map((p) => p.toLowerCase().split('==')[0]),
  );
  for (const spec of packages) {
    validatePkg(spec);
    const base = spec.toLowerCase().split('==')[0];
    if (!requiredBases.has(base) && !allowThirdParty) {
      // Installing anything beyond the managed set is a deliberate choice.
      return {status: 'needs_confirmation', package: spec};
    }
  }
  const {runId} = startProcess(sender, {
    command: venvPython(),
    args: ['-m', 'pip', 'install', '--disable-pip-version-check', ...packages],
  });
  return {status: 'started', runId, op: 'installDeps'};
}
