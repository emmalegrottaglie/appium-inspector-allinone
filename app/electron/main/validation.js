// Pure validators for renderer-supplied IPC input. No `electron` import, so they can be unit
// tested directly. Each one guards a main-process operation the renderer may only request,
// never define (see AGENTS.md §7).

import net from 'node:net';

// Settings keys the renderer may use. electron-settings reads a key as a lodash key path, so
// only plain names are accepted: anything with '.', '[' or ':' could reach another setting,
// including the main-only `env:` settings that choose the executables the main process spawns
// (see binary-resolver.js), and an empty key would read the whole store.
const RENDERER_SETTING_KEY = /^[A-Za-z0-9_]+$/;

export function assertRendererSettingKey(key) {
  if (typeof key !== 'string' || !RENDERER_SETTING_KEY.test(key)) {
    throw new Error(`Setting not available to the renderer: ${String(key)}`);
  }
}

/** Only https links are handed to the OS; anything else could launch a local handler. */
export function isOpenableLink(link) {
  try {
    return new URL(link).protocol === 'https:';
  } catch {
    return false;
  }
}

export const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1'];

const HOSTNAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
const BASE_PATH = /^\/[A-Za-z0-9._~/-]*$/;

/**
 * Validate the local server settings the renderer may choose and return only those fields.
 * Everything else about the launch (plugins, CORS, insecure features) stays main-owned.
 *
 * @returns {{host: string, port: number, basePath: string}}
 */
export function validateServerConfig({host, port, basePath} = {}) {
  if (typeof host !== 'string' || !(HOSTNAME.test(host) || net.isIP(host) === 6)) {
    throw new Error(`Invalid server host: ${String(host)}`);
  }
  const portNumber = Number(port);
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    throw new Error(`Invalid server port: ${String(port)}`);
  }
  if (typeof basePath !== 'string' || !BASE_PATH.test(basePath)) {
    throw new Error(`Invalid server base path: ${String(basePath)}`);
  }
  return {host, port: portNumber, basePath};
}
