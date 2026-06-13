import {existsSync} from 'node:fs';
import {join} from 'node:path';

import {app} from 'electron';
import settings from 'electron-settings';

// Local copy to avoid a circular import with helpers.js (which imports the
// appium modules that pull this in, before its own `isDev` is initialized).
const isDev = process.env.NODE_ENV === 'development';

// The ONLY place that knows where an external tool lives, and how it must be
// launched. Resolution order for any tool:
//
//   1. configured  - explicit path the user set (settings override)
//   2. bundled      - shipped inside the app under resourcesPath  ("bundled route")
//   3. system       - found on the PATH                            (fallback / dev)
//
// In a packaged build, electron-builder copies whatever you list under
// `extraResources` in electron-builder.json into `process.resourcesPath`,
// UNPACKED (outside the asar archive) so it can actually be executed.

export const RESOURCES_ROOT = isDev ? join(app.getAppPath(), 'resources') : process.resourcesPath;

const isWin = process.platform === 'win32';

/**
 * Layout of bundleable tools. Extend as you vendor more.
 * - `bundledRelPath`     : path under RESOURCES_ROOT; null means "never bundled"
 * - `bundledIsNodeScript`: true when the bundled target is a .js entry that must
 *                          be run with a Node runtime rather than executed directly
 */
const TOOLS = {
  // Appium is plain Node. Its bin entry (v3.5.0) is the package-root index.js.
  // The bundled route vendors `appium` into resources/appium at build time, then
  // runs index.js with Electron's own Node via ELECTRON_RUN_AS_NODE (see
  // appium-server.js). No system Node required -> the truest "all-in-one".
  appium: {
    settingKey: 'env:appiumPath',
    bundledRelPath: join('appium', 'node_modules', 'appium', 'index.js'),
    bundledIsNodeScript: true,
    systemName: isWin ? 'appium.cmd' : 'appium',
  },
  // Python is NOT bundled: Electron has no clean way to ship an interpreter.
  // We only locate a user/system Python, then create + manage a venv (Step 3).
  python: {
    settingKey: 'env:pythonPath',
    bundledRelPath: null,
    bundledIsNodeScript: false,
    systemName: isWin ? 'python.exe' : 'python3',
  },
};

/**
 * @param {keyof TOOLS} tool
 * @returns {Promise<{path: string, source: 'configured'|'bundled'|'system', isNodeScript: boolean}>}
 */
export async function resolveBinary(tool) {
  const spec = TOOLS[tool];
  if (!spec) {
    throw new Error(`Unknown tool: ${tool}`);
  }

  // 1. explicit user override (assumed directly executable)
  const configured = await settings.get(spec.settingKey);
  if (configured && existsSync(configured)) {
    return {path: configured, source: 'configured', isNodeScript: false};
  }

  // 2. bundled
  if (spec.bundledRelPath) {
    const bundled = join(RESOURCES_ROOT, spec.bundledRelPath);
    if (existsSync(bundled)) {
      return {path: bundled, source: 'bundled', isNodeScript: !!spec.bundledIsNodeScript};
    }
  }

  // 3. system PATH — return the bare name and let spawn resolve it
  return {path: spec.systemName, source: 'system', isNodeScript: false};
}
