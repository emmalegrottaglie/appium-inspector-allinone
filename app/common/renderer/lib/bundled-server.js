import {getSetting, setSetting} from '../polyfills.js';
import {isPlainObject} from '../utils/common.js';

// The desktop app's own Appium server (see app/electron/main/appium-server.js). The session
// builder's "local" server type targets it: starting a session starts it when needed, and the
// session connects to wherever it actually listens, so its address is only ever set in one place.

const BUNDLED_SERVER_ADDRESS = 'BUNDLED_SERVER_ADDRESS';
export const DEFAULT_BUNDLED_SERVER_ADDRESS = {host: '127.0.0.1', port: 4723, basePath: '/'};

// Addresses a server listens on that aren't addresses a client can connect to
const UNSPECIFIED_HOSTS = ['0.0.0.0', '::', ''];

/**
 * Where a client reaches a server listening on this address. An IPv6 host is bracketed, since
 * the session's server URL is built as `<protocol>://<hostname>:<port>`.
 * @returns {{hostname: string, port: number, path: string}}
 */
function clientAddress({host, port, basePath}) {
  let hostname = UNSPECIFIED_HOSTS.includes(host ?? '') ? '127.0.0.1' : host;
  if (hostname.includes(':') && !hostname.startsWith('[')) {
    hostname = `[${hostname}]`;
  }
  return {hostname, port, path: basePath || '/'};
}

/** The server's URL, for display */
export function bundledServerUrl(address) {
  const {hostname, port, path} = clientAddress(address);
  return `http://${hostname}:${port}${path === '/' ? '' : path}`;
}

const appiumIPC = () => window.electronIPC?.appium;

/** Whether this build manages its own server (only the desktop app does) */
export const hasBundledServer = () => !!appiumIPC();

/** @returns {Promise<{host: string, port: number, basePath: string}>} the address the bundled server starts on */
export async function getBundledServerAddress() {
  const saved = await getSetting(BUNDLED_SERVER_ADDRESS);
  return {...DEFAULT_BUNDLED_SERVER_ADDRESS, ...(isPlainObject(saved) ? saved : {})};
}

/** @param {{host: string, port: number, basePath: string}} address */
export async function saveBundledServerAddress(address) {
  await setSetting(BUNDLED_SERVER_ADDRESS, address);
}

const SETTLED = ['running', 'error', 'stopped'];

/**
 * Run a server call and, if the state it returns is still changing (starting or stopping),
 * wait for the status it settles on. The listener is attached first so no change is missed.
 */
async function settle(ipc, call) {
  let off;
  const next = new Promise((resolve) => {
    off = ipc.onStatus((state) => SETTLED.includes(state.status) && resolve(state));
  });
  try {
    const state = await call();
    return SETTLED.includes(state.status) ? state : await next;
  } finally {
    off?.();
  }
}

/**
 * Make sure the bundled server is running, starting it on its saved address if it isn't.
 * The main process still asks the user before binding to a non-loopback address.
 *
 * @returns {Promise<{hostname: string, port: number, path: string}>} where a client reaches it
 * @throws {Error} if the server can't be started
 */
export async function ensureBundledServer() {
  const ipc = appiumIPC();
  if (!ipc) {
    throw new Error('The local Appium server is only available in the desktop app.');
  }
  let state = await settle(ipc, () => ipc.getState());
  if (state.status !== 'running') {
    const address = await getBundledServerAddress();
    state = await settle(ipc, () => ipc.start(address));
  }
  if (state.status !== 'running') {
    throw new Error(
      state.error
        ? `The local Appium server could not start: ${state.error}`
        : 'The local Appium server was not started.',
    );
  }
  return clientAddress(state);
}

/** Whether the bundled server is up right now */
export async function isBundledServerRunning() {
  return (await appiumIPC()?.getState())?.status === 'running';
}

/**
 * Where the bundled server is (when running) or will be (when started), without starting it.
 * For calls that only make sense against a running server, like listing its sessions.
 * @returns {Promise<{hostname: string, port: number, path: string}>}
 */
export async function bundledServerConnection() {
  const state = await appiumIPC()?.getState();
  return clientAddress(state?.status === 'running' ? state : await getBundledServerAddress());
}
