import {statSync} from 'node:fs';

import {BrowserWindow, dialog} from 'electron';

// Decisions that must come from the user, not from the renderer. A renderer can ask for a
// working directory or a risky install, but only a native dialog shown by the main process
// can approve one, so a compromised or confused renderer cannot grant itself access.

const approvedDirs = new Set();

/** Let the user choose a working directory; only directories chosen here are usable later. */
export async function pickWorkingDir() {
  const res = await dialog.showOpenDialog({properties: ['openDirectory']});
  if (res.canceled || !res.filePaths.length) {
    return {canceled: true};
  }
  const [path] = res.filePaths;
  approvedDirs.add(path);
  return {canceled: false, path};
}

/** Throw unless `dir` is an existing directory the user picked in this session. */
export function assertApprovedDir(dir) {
  if (typeof dir !== 'string' || !dir) {
    throw new Error('A working directory is required.');
  }
  if (!approvedDirs.has(dir)) {
    throw new Error(`Choose the working directory with the folder picker first: ${dir}`);
  }
  let st;
  try {
    st = statSync(dir);
  } catch {
    throw new Error(`Not found: ${dir}`);
  }
  if (!st.isDirectory()) {
    throw new Error(`Not a directory: ${dir}`);
  }
}

/**
 * Ask the user to confirm a risky action in a native dialog attached to the requesting window.
 *
 * @param {Electron.WebContents} sender the web contents that requested the action
 * @param {{message: string, detail: string, confirmLabel: string}} prompt
 * @returns {Promise<boolean>} true only if the user chose the confirm button
 */
export async function confirmWithUser(sender, {message, detail, confirmLabel}) {
  const options = {
    type: 'warning',
    buttons: ['Cancel', confirmLabel],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    message,
    detail,
  };
  const win = sender && BrowserWindow.fromWebContents(sender);
  const {response} = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
  return response === 1;
}
