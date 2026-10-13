import {EventEmitter} from 'node:events';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

// The server module is driven through its IPC handlers, with the process runner and the
// readiness request replaced, so the timing of a slow or silent start can be simulated.
const handlers = {};
const runner = {hooks: null, cancelled: []};
const http = {ready: false};

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel, fn) => (handlers[channel] = fn),
    on: (channel, fn) => (handlers[channel] = fn),
  },
}));
vi.mock('node:http', () => ({
  default: {
    get: (_url, onResponse) => {
      const req = new EventEmitter();
      req.setTimeout = () => {};
      req.destroy = () => {};
      queueMicrotask(() => {
        if (http.ready) {
          onResponse({statusCode: 200, resume: () => {}});
        } else {
          req.emit('error', new Error('ECONNREFUSED'));
        }
      });
      return req;
    },
  },
}));
vi.mock('../../app/electron/main/appium-launch.js', () => ({
  buildAppiumCommand: async (args) => ({command: 'appium', args, options: {}, source: 'bundled'}),
}));
vi.mock('../../app/electron/main/user-approval.js', () => ({confirmWithUser: async () => true}));
vi.mock('../../app/electron/main/process-runner.js', () => ({
  startProcess: (_sender, _spec, hooks) => {
    runner.hooks = hooks;
    return {runId: 'run-1'};
  },
  cancelProcess: (runId) => {
    runner.cancelled.push(runId);
    queueMicrotask(() => runner.hooks.onExit({code: null, signal: 'SIGTERM', error: null}));
  },
}));

const {setupAppiumIPC} = await import('../../app/electron/main/appium-server.js');
setupAppiumIPC();

const sender = {sent: [], isDestroyed: () => false, send: (_channel, payload) => sender.sent.push(payload)};
const lastStatus = () => sender.sent.at(-1);
const print = (line) => runner.hooks.onOutput({stream: 'stdout', chunk: `${line}\n`});

describe('electron/main/appium-server.js readiness', function () {
  beforeEach(function () {
    vi.useFakeTimers();
    http.ready = false;
    runner.cancelled = [];
    sender.sent = [];
  });

  afterEach(async function () {
    // leave no server behind for the next test
    handlers['appium:stop']();
    runner.hooks?.onExit({code: null, signal: 'SIGTERM', error: null});
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
  });

  it('should keep waiting for a slow start that keeps printing', async function () {
    await handlers['appium:start']({sender}, {});
    for (let elapsed = 0; elapsed < 120_000; elapsed += 15_000) {
      print('[Appium] Requiring driver ...');
      await vi.advanceTimersByTimeAsync(15_000);
    }
    expect(runner.cancelled).toEqual([]);
    expect(lastStatus().status).toEqual('starting');

    http.ready = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(lastStatus().status).toEqual('running');
  });

  it('should give up on a start that stops printing, and report why', async function () {
    await handlers['appium:start']({sender}, {});
    print('[Appium] Welcome to Appium');
    await vi.advanceTimersByTimeAsync(85_000);
    expect(runner.cancelled).toEqual([]);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(runner.cancelled).toEqual(['run-1']);
    expect(lastStatus()).toMatchObject({
      status: 'error',
      error: 'Appium did not become ready and printed nothing for 90 s',
    });
  });

  it('should report a stopped server after a user stop during the start', async function () {
    await handlers['appium:start']({sender}, {});
    handlers['appium:stop']();
    runner.hooks.onExit({code: null, signal: 'SIGTERM', error: null});
    expect(lastStatus().status).toEqual('stopped');
  });
});
