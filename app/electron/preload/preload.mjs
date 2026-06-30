import {ipcRenderer} from 'electron';

window.electronIPC = {
  hasSetting: async (key) => await ipcRenderer.invoke('settings:has', key),
  setSetting: async (key, val) => await ipcRenderer.invoke('settings:set', key, val),
  getSetting: async (key) => await ipcRenderer.invoke('settings:get', key),
  openLink: (link) => ipcRenderer.send('electron:openLink', link),
  setTheme: (theme) => ipcRenderer.send('electron:setTheme', theme),
  updateLanguage: (lngCode) => ipcRenderer.send('electron:updateLanguage', lngCode),
  loadSessionFileIfOpened: async () => await ipcRenderer.invoke('sessionfile:loadIfOpened'),

  // Step 0: generic external-process runner
  runner: {
    start: (spec) => ipcRenderer.invoke('process:start', spec),
    cancel: (runId) => ipcRenderer.send('process:cancel', runId),
    onOutput: (cb) => {
      const listener = (_evt, data) => cb(data);
      ipcRenderer.on('process:output', listener);
      return () => ipcRenderer.removeListener('process:output', listener);
    },
    onExit: (cb) => {
      const listener = (_evt, data) => cb(data);
      ipcRenderer.on('process:exit', listener);
      return () => ipcRenderer.removeListener('process:exit', listener);
    },
  },

  // Step 1: Appium server lifecycle
  appium: {
    start: (cfg) => ipcRenderer.invoke('appium:start', cfg),
    stop: () => ipcRenderer.send('appium:stop'),
    getState: () => ipcRenderer.invoke('appium:getState'),
    onStatus: (cb) => {
      const listener = (_evt, data) => cb(data);
      ipcRenderer.on('appium:status', listener);
      return () => ipcRenderer.removeListener('appium:status', listener);
    },
  },

  // Step 2: driver/plugin management
  extensions: {
    list: (type, opts) => ipcRenderer.invoke('extensions:list', type, opts),
    install: (payload) => ipcRenderer.invoke('extensions:install', payload),
    update: (payload) => ipcRenderer.invoke('extensions:update', payload),
    uninstall: (payload) => ipcRenderer.invoke('extensions:uninstall', payload),
    doctor: (payload) => ipcRenderer.invoke('extensions:doctor', payload),
  },

  // Step 3: Python environment
  pythonEnv: {
    status: () => ipcRenderer.invoke('python:status'),
    detect: () => ipcRenderer.invoke('python:detect'),
    createVenv: () => ipcRenderer.invoke('python:createVenv'),
    installDeps: (payload) => ipcRenderer.invoke('python:installDeps', payload),
  },

  // Multi-language test runtimes (Ruby / Node / Oxygen) — detect + install deps
  runtimes: {
    detect: () => ipcRenderer.invoke('runtimes:detect'),
    installRubyGems: () => ipcRenderer.invoke('runtimes:installRubyGems'),
    installJsDeps: (workingDir) => ipcRenderer.invoke('runtimes:installJsDeps', {workingDir}),
  },

  // Recorder: save generated code to a file (native Save dialog)
  codeExport: {
    saveAs: (payload) => ipcRenderer.invoke('code:saveAs', payload),
  },

  // Step 3: Python tests
  pythonTests: {
    pickWorkingDir: () => ipcRenderer.invoke('python:pickWorkingDir'),
    listTests: (dir) => ipcRenderer.invoke('python:listTests', dir),
    readFile: (dir, rel) => ipcRenderer.invoke('python:readFile', dir, rel),
    saveFile: (dir, rel, content) => ipcRenderer.invoke('python:saveFile', dir, rel, content),
    run: (payload) => ipcRenderer.invoke('python:run', payload),
    onResult: (cb) => {
      const listener = (_evt, data) => cb(data);
      ipcRenderer.on('python:result', listener);
      return () => ipcRenderer.removeListener('python:result', listener);
    },
  },
};
