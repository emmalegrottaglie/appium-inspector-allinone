import {writeFileSync} from 'node:fs';

import {dialog, ipcMain} from 'electron';

// Save generated test/recorder code to a user-chosen file. The renderer supplies
// the already-formatted code string and a language hint; MAIN maps the language
// to a file extension and writes wherever the native Save dialog points. Safe by
// construction: the destination is chosen by the user through the OS dialog (no
// renderer-supplied paths), and only a string is ever written.

const EXT_BY_LANG = {
  python: 'py',
  java: 'java',
  csharp: 'cs',
  js: 'js',
  ruby: 'rb',
  robot: 'robot',
};

/** Register the code-export IPC channel. Call from setupIPCListeners(). */
export function setupCodeExportIPC() {
  ipcMain.handle('code:saveAs', async (_evt, {content, language, defaultName} = {}) => {
    if (typeof content !== 'string') {
      throw new Error('Code content must be a string.');
    }
    const ext = EXT_BY_LANG[language] || 'txt';
    const base = (defaultName || 'recorded-test').replace(/[^\w.-]/g, '_');
    const res = await dialog.showSaveDialog({
      title: 'Save recorded test',
      defaultPath: `${base}.${ext}`,
      filters: [
        {name: `${language || 'Code'} (*.${ext})`, extensions: [ext]},
        {name: 'All files', extensions: ['*']},
      ],
    });
    if (res.canceled || !res.filePath) {
      return {canceled: true};
    }
    writeFileSync(res.filePath, content, 'utf8');
    return {canceled: false, path: res.filePath};
  });
}
