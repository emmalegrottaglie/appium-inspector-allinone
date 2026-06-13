import http from 'node:http';

import {ipcMain} from 'electron';

import {buildAppiumCommand} from './appium-launch.js';
import {cancelProcess, startProcess} from './process-runner.js';

// Manages the lifecycle of a single local Appium server. The process itself
// runs through the Step 0 runner (so its log streams over 'process:output'
// like everything else); this module adds the things a long-lived service
// needs that a one-shot command doesn't: readiness detection, graceful stop,
// and a status lifecycle the UI can render.

const DEFAULTS = {
  host: '127.0.0.1',
  port: 4723,
  basePath: '/',
  plugins: [], // names of installed plugins to enable via --use-plugins
  allowCors: true, // needed for browser-context WebDriver calls / Inspector sessions
  // Insecure features to enable. `session_discovery` lets the "Attach to
  // Session" tab enumerate running sessions (GET /appium/sessions). Safe here
  // because the server is bound to loopback; only local processes can reach it.
  // Appium 3 requires the scoped `<automationName>:<feature>` form (or the `*`
  // wildcard to apply to all drivers) — a bare feature name is rejected.
  insecureFeatures: ['*:session_discovery'],
};

const READINESS_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 600;

// status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error'
let server = null; // {runId, sender, status, source, host, port, basePath, plugins, allowCors}
let pollTimer = null;

/** Register the server's IPC channels. Call from setupIPCListeners(). */
export function setupAppiumIPC() {
  ipcMain.handle('appium:start', (evt, cfg) => start(evt.sender, cfg));
  ipcMain.on('appium:stop', () => stop());
  ipcMain.handle('appium:getState', () => publicState());
}

function publicState() {
  if (!server) {
    return {status: 'stopped'};
  }
  const {runId, status, source, host, port, basePath} = server;
  return {runId, status, source, host, port, basePath};
}

function emit(extra = {}) {
  const sender = server?.sender;
  if (sender && !sender.isDestroyed()) {
    sender.send('appium:status', {...publicState(), ...extra});
  }
}

function statusUrl({host, port, basePath}) {
  // Appium exposes readiness at `<basePath>/status`; basePath defaults to '/'.
  const base = basePath === '/' ? '' : basePath.replace(/\/+$/, '');
  return `http://${host}:${port}${base}/status`;
}

function pingStatus(cfg) {
  return new Promise((resolve) => {
    const req = http.get(statusUrl(cfg), (res) => {
      res.resume(); // drain
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function assembleLaunch(cfg) {
  const serverArgs = [
    'server',
    '--address',
    cfg.host,
    '--port',
    String(cfg.port),
    '--base-path',
    cfg.basePath,
  ];
  if (cfg.allowCors) {
    serverArgs.push('--allow-cors');
  }
  if (cfg.plugins?.length) {
    serverArgs.push(`--use-plugins=${cfg.plugins.join(',')}`);
  }
  if (cfg.insecureFeatures?.length) {
    serverArgs.push(`--allow-insecure=${cfg.insecureFeatures.join(',')}`);
  }
  // buildAppiumCommand handles bundled (ELECTRON_RUN_AS_NODE) vs system launch
  // and injects the shared APPIUM_HOME.
  return buildAppiumCommand(serverArgs);
}

function clearPoll() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function startReadinessPolling() {
  const cfg = {...server};
  const startedAt = Date.now();

  const tick = async () => {
    if (!server || server.status !== 'starting' || server.runId !== cfg.runId) {
      return;
    }
    if (await pingStatus(cfg)) {
      server.status = 'running';
      emit();
      return;
    }
    if (Date.now() - startedAt > READINESS_TIMEOUT_MS) {
      emit({error: 'Timed out waiting for Appium to become ready'});
      cancelProcess(server.runId); // onExit will finalize state
      return;
    }
    pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
  };

  pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
}

function onServerExit({code, error}) {
  clearPoll();
  if (!server) {
    return;
  }
  if (server.status === 'stopping') {
    server.status = 'stopped';
    emit();
  } else if (error || (code !== 0 && code !== null)) {
    server.status = 'error';
    emit({error: error || `Appium exited with code ${code}`});
  } else {
    server.status = 'stopped';
    emit();
  }
  server = null;
}

async function start(sender, userCfg = {}) {
  if (server && (server.status === 'starting' || server.status === 'running')) {
    return publicState();
  }

  const cfg = {...DEFAULTS, ...userCfg};
  let launch;
  try {
    launch = await assembleLaunch(cfg);
  } catch (err) {
    return {status: 'error', error: err.message};
  }

  const {runId} = startProcess(
    sender,
    {command: launch.command, args: launch.args, options: launch.options},
    {onExit: onServerExit},
  );

  server = {runId, sender, status: 'starting', source: launch.source, ...cfg};
  emit();
  startReadinessPolling();
  return publicState();
}

function stop() {
  if (!server || (server.status !== 'running' && server.status !== 'starting')) {
    return false;
  }
  server.status = 'stopping';
  emit();
  clearPoll();
  cancelProcess(server.runId); // triggers onServerExit -> 'stopped'
  return true;
}
