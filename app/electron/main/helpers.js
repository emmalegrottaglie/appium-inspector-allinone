import {readFile} from 'node:fs/promises';

import {ipcMain, nativeTheme, shell} from 'electron';
import settings from 'electron-settings';

import {setupExtensionsIPC} from './appium-extensions.js';
import {setupAppiumIPC} from './appium-server.js';
import {setupCodeExportIPC} from './code-export.js';
import i18n from './i18next.js';
import {setupProcessIPC} from './process-runner.js';
import {setupPythonEnvIPC} from './python-env.js';
import {setupPythonTestsIPC} from './python-tests.js';
import {setupRuntimesIPC} from './system-runtimes.js';

export const isDev = process.env.NODE_ENV === 'development';

export function setupIPCListeners(getOpenFilePath) {
  ipcMain.handle('settings:has', async (_evt, key) => await settings.has(key));
  ipcMain.handle('settings:set', async (_evt, key, value) => await settings.set(key, value));
  ipcMain.handle('settings:get', async (_evt, key) => await settings.get(key));
  ipcMain.on('electron:openLink', (_evt, link) => shell.openExternal(link));
  ipcMain.on('electron:setTheme', (_evt, theme) => (nativeTheme.themeSource = theme));
  ipcMain.handle('sessionfile:loadIfOpened', async () => {
    const openFilePath = getOpenFilePath();
    if (!openFilePath) {
      return null;
    }
    return await readFile(openFilePath, 'utf8');
  });

  // All-in-one: constrained IPC endpoints for the bundled server, extension
  // management, the Python environment, and the pytest runner.
  setupProcessIPC();
  setupAppiumIPC();
  setupExtensionsIPC();
  setupPythonEnvIPC();
  setupPythonTestsIPC();
  setupRuntimesIPC();
  setupCodeExportIPC();
}

export const t = (string, params = null) => i18n.t(string, params);
