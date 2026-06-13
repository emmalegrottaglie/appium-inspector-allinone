import {ipcMain} from 'electron';

import {buildAppiumCommand} from './appium-launch.js';
import {collectProcess, startProcess} from './process-runner.js';

// Driver & plugin management: a thin, HARDENED wrapper over the Appium
// extension CLI (`appium {driver|plugin} list|install|update|uninstall|doctor`).
//
// Security model (the renderer is treated as untrusted):
//   1. Constrained IPC      - the renderer sends INTENT (type/name/source/flags),
//                             never an executable or free-form args. MAIN builds
//                             every command from fixed templates.
//   2. Strict validation    - names/specs matched against tight regexes and can
//                             never begin with '-' (argument-injection guard).
//   3. Secure-by-default     - official short-names install with no --source.
//      sourcing                Anything else needs explicit allowThirdParty
//                             (the UI gates this behind a confirmation dialog).
//   4. Limited sources      - only 'npm' and 'github' accepted; 'git' and
//                             'local' (arbitrary URLs / filesystem paths) are
//                             refused outright -- highest-risk install vectors.
//   5. Explicit --unsafe     - major-version updates require unsafe:true opt-in.
//   6. Isolated APPIUM_HOME  - installs land in an app-scoped home (appium-launch).
//   7. Concurrency guard     - no overlapping ops on the same extension.
//   8. No `run` subcommand   - executing extension-defined scripts is not exposed.

// --- validation -----------------------------------------------------------

const EXT_TYPES = new Set(['driver', 'plugin']);

// Official short-name / npm short name. MUST start alphanumeric (never '-',
// which the CLI could parse as a flag), then a restricted charset.
const SHORT_NAME = /^[a-z0-9][a-z0-9._-]{0,80}$/i;

// npm install-spec: optional @scope, name, optional @version/tag.
const NPM_SPEC = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(@[a-z0-9._-]+)?$/i;

// GitHub source must be an https github.com repo URL, optional #ref. https only:
// blocks git://, ssh, and arbitrary hosts.
const GITHUB_URL =
  /^https:\/\/github\.com\/[a-z0-9](?:[a-z0-9-]){0,38}\/[a-z0-9._-]{1,100}(#[\w./-]+)?$/i;

function assertType(type) {
  if (!EXT_TYPES.has(type)) {
    throw new Error(`Invalid extension type: ${String(type)}`);
  }
}

function assertShortName(name) {
  if (typeof name !== 'string' || name.startsWith('-') || !SHORT_NAME.test(name)) {
    throw new Error(`Invalid extension name: ${String(name)}`);
  }
}

function parseJsonLoose(text) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    // CLI may interleave a stray log line; salvage the JSON object body.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        /* give up */
      }
    }
    return null;
  }
}

// --- operations ------------------------------------------------------------

const inFlight = new Set(); // `${type}:${label}` ops currently running

/** Register the extension-management IPC channels. Call from setupIPCListeners(). */
export function setupExtensionsIPC() {
  ipcMain.handle('extensions:list', (_evt, type, opts) => list(type, opts));
  ipcMain.handle('extensions:install', (evt, payload) => install(evt.sender, payload));
  ipcMain.handle('extensions:update', (evt, payload) => update(evt.sender, payload));
  ipcMain.handle('extensions:uninstall', (evt, payload) => uninstall(evt.sender, payload));
  ipcMain.handle('extensions:doctor', (evt, payload) => doctor(evt.sender, payload));
}

async function list(type, {installedOnly = false, withUpdates = false} = {}) {
  assertType(type);
  const args = [type, 'list', '--json'];
  if (installedOnly) {
    args.push('--installed');
  }
  if (withUpdates) {
    args.push('--updates'); // newer-version info; npm-installed exts only
  }
  const spec = await buildAppiumCommand(args);
  const {stdout, stderr, code, error} = await collectProcess(spec);
  if (error) {
    throw new Error(error);
  }
  const data = parseJsonLoose(stdout) ?? parseJsonLoose(stderr) ?? {};
  return {ok: code === 0, data, raw: stdout || stderr};
}

async function knownNames(type) {
  // `list` WITHOUT --installed returns installed + all official-known exts.
  // Their keys form a live, rot-proof allow-list of names installable WITHOUT
  // the third-party confirmation gate.
  const {data} = await list(type, {installedOnly: false});
  return new Set(Object.keys(data || {}));
}

function spawnExt(sender, type, label, args) {
  const key = `${type}:${label}`;
  if (inFlight.has(key)) {
    throw new Error(`An operation for "${label}" is already in progress.`);
  }
  inFlight.add(key);
  return buildAppiumCommand(args)
    .then((spec) => {
      const {runId} = startProcess(sender, spec, {onExit: () => inFlight.delete(key)});
      return {status: 'started', runId, type, label};
    })
    .catch((err) => {
      inFlight.delete(key);
      throw err;
    });
}

async function install(sender, {type, name, source = null, packageName = null, allowThirdParty = false}) {
  assertType(type);

  // --- official install: bare short-name, no --source ---
  if (!source) {
    assertShortName(name);
    const known = await knownNames(type);
    if (known.has(name)) {
      return spawnExt(sender, type, name, [type, 'install', name, '--json']);
    }
    // Unknown name: do NOT silently treat it as an arbitrary npm install.
    // Surface a confirmation request the UI can act on.
    return {status: 'needs_confirmation', kind: 'not_official', type, name};
  }

  // --- third-party install: requires explicit user confirmation ---
  if (!allowThirdParty) {
    return {status: 'needs_confirmation', kind: 'third_party', type, name, source};
  }

  if (source === 'npm') {
    if (typeof name !== 'string' || name.startsWith('-') || !NPM_SPEC.test(name)) {
      throw new Error(`Invalid npm package spec: ${String(name)}`);
    }
    return spawnExt(sender, type, name, [type, 'install', name, '--source=npm', '--json']);
  }

  if (source === 'github') {
    if (typeof name !== 'string' || !GITHUB_URL.test(name)) {
      throw new Error(`Invalid GitHub repo URL: ${String(name)}`);
    }
    assertShortName(packageName); // --package is required for github source
    return spawnExt(sender, type, name, [
      type,
      'install',
      name,
      '--source=github',
      `--package=${packageName}`,
      '--json',
    ]);
  }

  // 'git' and 'local' are intentionally unsupported from the renderer:
  // arbitrary Git URLs / local paths are the highest-risk install vectors.
  throw new Error(`Unsupported install source: ${String(source)}`);
}

async function update(sender, {type, name, unsafe = false}) {
  assertType(type);
  if (name !== 'installed') {
    assertShortName(name); // 'installed' = update all; otherwise a real name
  }
  const args = [type, 'update', name, '--json'];
  if (unsafe) {
    args.push('--unsafe'); // major-version bumps: explicit opt-in only
  }
  return spawnExt(sender, type, name, args);
}

async function uninstall(sender, {type, name}) {
  assertType(type);
  assertShortName(name);
  return spawnExt(sender, type, name, [type, 'uninstall', name, '--json']);
}

async function doctor(sender, {type, name}) {
  assertType(type);
  assertShortName(name);
  // No --json: doctor's human-readable output reads well in a log panel.
  return spawnExt(sender, type, name, [type, 'doctor', name]);
}
