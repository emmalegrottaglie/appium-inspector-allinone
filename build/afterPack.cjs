// electron-builder afterPack hook.
//
// The bundled Appium server lives at resources/appium (vendored at build time:
// `npm install --prefix resources/appium appium@3.5.0`). It must ship UNPACKED
// into the app's resources dir so binary-resolver.js can find
// `<resourcesPath>/appium/node_modules/appium/index.js` and launch it.
//
// electron-builder's `extraResources` copier hard-excludes any directory named
// `node_modules`, so it cannot carry the vendored server's dependency tree.
// We copy it here with plain fs (no such filtering), after the app is packed
// but before the installer/zip is assembled, so both targets include it.
const {cpSync, existsSync} = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack(context) {
  const src = path.join(context.packager.projectDir, 'resources', 'appium');
  if (!existsSync(src)) {
    // Plain dev / no bundled route — fall back to a system `appium` on PATH.
    return;
  }
  // Resolves to the platform-correct resources dir
  // (win/linux: <appOutDir>/resources; mac: <app>.app/Contents/Resources).
  const resourcesDir = context.packager.getResourcesDir(context.appOutDir);
  const dest = path.join(resourcesDir, 'appium');
  cpSync(src, dest, {recursive: true});
};
