import {join} from 'node:path';

import {app} from 'electron';

import {resolveBinary} from './binary-resolver.js';

// App-managed, isolated Appium home. Installed drivers/plugins live here, and
// the bundled server reads from here, so the GUI manages ONE coherent set
// instead of mutating the user's global ~/.appium. This is also a mild
// security/isolation measure: a known, app-scoped install location.
export const APPIUM_HOME = join(app.getPath('userData'), 'appium-home');

/**
 * Build a spawn spec for `appium <args>`, honoring bundled/system resolution.
 *
 * SECURITY: the renderer never supplies command/args directly. Callers in the
 * MAIN process assemble `args` from validated, templated inputs and pass them
 * here; this function only decides HOW to launch (bundled Node entry vs a
 * directly-executable binary).
 *
 * @param {string[]} args
 * @param {object} [extraEnv]
 * @returns {Promise<{command: string, args: string[], options: object, source: string}>}
 */
export async function buildAppiumCommand(args, extraEnv = {}) {
  const {path, source, isNodeScript} = await resolveBinary('appium');
  const env = {APPIUM_HOME, ...extraEnv};
  if (isNodeScript) {
    // Bundled route: run Appium's index.js with Electron's own Node runtime.
    return {
      command: process.execPath,
      args: [path, ...args],
      options: {env: {...env, ELECTRON_RUN_AS_NODE: '1'}},
      source,
    };
  }
  // Configured / system route: the resolved path is directly executable.
  return {command: path, args, options: {env}, source};
}
