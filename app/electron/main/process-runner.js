import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';

import {ipcMain} from 'electron';

// The keystone of the "all-in-one" features: one generic way to spawn an
// external command and stream its output back to the renderer that asked for
// it. The Appium server, `appium driver ...`, `pip`, and `pytest` are all just
// callers of this. Build it once, well; everything else gets cheaper.

// Local copy to avoid a circular import with helpers.js.
const isDev = process.env.NODE_ENV === 'development';

// runId -> ChildProcess
const running = new Map();

/**
 * Spawn a command and stream its output back to the requesting renderer.
 * Returns immediately with a runId; output and exit also arrive as events on
 * the 'process:output' and 'process:exit' channels.
 *
 * Exported so other MAIN-process modules (e.g. appium-server.js,
 * appium-extensions.js) can drive it directly without round-tripping IPC.
 *
 * @param {Electron.WebContents|null} sender - renderer to stream events to (null = no streaming)
 * @param {object}   spec
 * @param {string}   spec.command        - executable to run
 * @param {string[]} [spec.args]         - arguments
 * @param {object}   [spec.options]      - extra child_process.spawn options (cwd, env)
 * @param {object}   [hooks]             - optional main-side callbacks
 * @param {(d: object) => void} [hooks.onOutput] - {stream, chunk}
 * @param {(d: object) => void} [hooks.onExit]   - {code, signal, error}
 * @returns {{runId: string, pid: number|undefined}}
 */
export function startProcess(sender, {command, args = [], options = {}, shell = false}, hooks = {}) {
  const runId = randomUUID();

  const send = (channel, payload) => {
    if (sender && !sender.isDestroyed()) {
      sender.send(channel, {runId, ...payload});
    }
  };

  let child;
  try {
    child = spawn(command, args, {
      ...options,
      env: {...process.env, ...(options.env || {})},
      // shell:false by default -> no shell injection. A few managed Windows
      // tools are .cmd shims that Node refuses to spawn without a shell
      // (throws EINVAL); those callers opt in via shell:true with fixed,
      // non-user command templates.
      shell,
    });
  } catch (err) {
    // Synchronous spawn failure (bad path, or a .cmd without a shell). Report it
    // as a failed exit rather than throwing, so callers (and a Promise.all over
    // several probes) stay intact.
    queueMicrotask(() => {
      hooks.onExit?.({code: null, signal: null, error: err.message});
      send('process:exit', {code: null, signal: null, error: err.message});
    });
    return {runId, pid: undefined};
  }

  running.set(runId, child);

  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');

  child.stdout?.on('data', (chunk) => {
    hooks.onOutput?.({stream: 'stdout', chunk});
    send('process:output', {stream: 'stdout', chunk});
  });
  child.stderr?.on('data', (chunk) => {
    hooks.onOutput?.({stream: 'stderr', chunk});
    send('process:output', {stream: 'stderr', chunk});
  });

  child.on('error', (err) => {
    running.delete(runId);
    hooks.onExit?.({code: null, signal: null, error: err.message});
    send('process:exit', {code: null, signal: null, error: err.message});
  });

  child.on('close', (code, signal) => {
    running.delete(runId);
    hooks.onExit?.({code, signal, error: null});
    send('process:exit', {code, signal, error: null});
  });

  return {runId, pid: child.pid};
}

/**
 * Run a command to completion and resolve with its captured output. For
 * one-shot commands whose result we need to parse (e.g. `... list --json`).
 * @param {object} spec - same shape as startProcess's spec
 * @returns {Promise<{code: number|null, signal: string|null, error: string|null, stdout: string, stderr: string}>}
 */
export function collectProcess(spec) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    startProcess(null, spec, {
      onOutput: ({stream, chunk}) => {
        if (stream === 'stdout') {
          stdout += chunk;
        } else {
          stderr += chunk;
        }
      },
      onExit: ({code, signal, error}) => resolve({code, signal, error, stdout, stderr}),
    });
  });
}

/**
 * Terminate a running process (and, on Windows, its child tree).
 * @returns {boolean} whether a matching process was found
 */
export function cancelProcess(runId) {
  const child = running.get(runId);
  if (!child) {
    return false;
  }
  if (process.platform === 'win32' && child.pid) {
    // SIGTERM doesn't reliably kill the tree on Windows; taskkill does.
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f']);
  } else {
    child.kill('SIGTERM');
  }
  return true;
}

/** Register the runner's IPC channels. Call from setupIPCListeners(). */
export function setupProcessIPC() {
  // SECURITY: the open 'process:start' lets the renderer spawn ANY command --
  // a powerful primitive. Expose it ONLY in development. In production the
  // renderer reaches Appium solely through the constrained, validated
  // endpoints (appium:*, extensions:*, and later python:*).
  if (isDev) {
    ipcMain.handle('process:start', (evt, spec) => startProcess(evt.sender, spec));
  }
  // 'cancel' is capability-scoped: it needs the random runId, so it can only
  // affect a process the caller already started. Safe to keep available.
  ipcMain.on('process:cancel', (_evt, runId) => cancelProcess(runId));
}

/** Kill everything still running. Call on app 'before-quit' to avoid orphans. */
export function killAllProcesses() {
  for (const runId of running.keys()) {
    cancelProcess(runId);
  }
}
