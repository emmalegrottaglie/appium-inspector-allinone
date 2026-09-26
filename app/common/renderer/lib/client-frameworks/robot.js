import refractorRobot from 'refractor/robotframework';

import CommonClientFramework from './common.js';

// Other control characters, and the separators Python's splitlines() (which Robot uses to
// read a file) treats as line breaks, are written as \uXXXX escapes.
function escapeUnsafeChar(ch) {
  const code = ch.charCodeAt(0);
  const unsafe = code < 0x20 || code === 0x7f || code === 0x85 || code === 0x2028 || code === 0x2029;
  return unsafe ? `\\u${code.toString(16).padStart(4, '0')}` : ch;
}

export default class RobotFramework extends CommonClientFramework {
  static readableName = 'Robot Framework';
  static refractorLang = 'robot';
  static refractorLib = refractorRobot;

  // Escape a value so Robot Framework reads it as exactly one literal argument. Values such as
  // locators come from the app's page source, so they must not be able to inject variables,
  // inline Python evaluation (${{...}}), named arguments, extra cells or extra lines.
  robotArg(value) {
    const str = String(value);
    if (!str) {
      return '${EMPTY}';
    }
    let escaped = Array.from(
      str
        .replace(/\\/g, '\\\\')
        .replace(/([$@&%])\{/g, '\\$1{')
        .replace(/=/g, '\\=')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t'),
      escapeUnsafeChar,
    )
      .join('')
      // Robot splits cells on runs of two or more whitespace characters (Unicode spaces such as
      // NBSP included), so every whitespace character after the first in a run is escaped
      .replace(/\s{2,}/g, (run) => Array.from(run, (ch, i) => (i ? `\\${ch}` : ch)).join(''))
      .replace(/^#/, '\\#');
    // Robot strips whitespace at either end of a cell; an empty variable there keeps it
    if (/^\s/.test(escaped)) {
      escaped = `\${EMPTY}${escaped}`;
    }
    if (/\s$/.test(escaped)) {
      escaped = `${escaped}\${EMPTY}`;
    }
    return escaped;
  }

  getRobotVal(jsonVal) {
    if (jsonVal === null) {
      return '${None}';
    } else if (typeof jsonVal === 'boolean') {
      return jsonVal ? '${True}' : '${False}';
    } else if (typeof jsonVal === 'number') {
      return `$\{${jsonVal}}`;
    }
    return this.robotArg(jsonVal);
  }

  wrapWithBoilerplate(code) {
    const capsParams = Object.entries(this.caps).map(([k, v]) => `${this.robotArg(k)}=${this.getRobotVal(v)}`);
    return `# This sample code supports Appium Robot client >=2
# pip install robotframework-appiumlibrary
# Then you can paste this into a file and simply run with Robot
#
# Find keywords at: http://serhatbolsu.github.io/robotframework-appiumlibrary/AppiumLibrary.html
#
# If your tests fails saying 'did not match any elements' consider using 'wait activity' or
# 'wait until page contains element' before a click command

*** Settings ***
Library           AppiumLibrary
Test Teardown     Close Application

*** Test Cases ***
Test Case Name
    Open Application    ${this.robotArg(this.serverUrl)}    ${capsParams.join('    ')}
${this.indent(code, 4)}
`;
  }

  addComment(comment) {
    return `# ${comment}`;
  }

  codeFor_findAndAssign(strategy, locator, localVar /*, isArray*/) {
    let suffixMap = {
      xpath: 'xpath',
      'accessibility id': 'accessibility_id',
      id: 'id',
      'class name': 'class',
      name: 'name',
      '-android uiautomator': 'android',
      // '-android datamatcher': 'unsupported',
      // '-android viewtag': 'unsupported',
      '-ios predicate string': 'nsp',
      '-ios class chain': 'chain',
    };
    if (!suffixMap[strategy]) {
      return this.handleUnsupportedLocatorStrategy(strategy, locator);
    }

    return `$\{${localVar}} =    Set Variable     ${suffixMap[strategy]}=${this.robotArg(locator)}`;
  }

  codeFor_elementClick(varName, varIndex) {
    return `Click Element    $\{${this.getVarName(varName, varIndex)}}`;
  }

  codeFor_elementClear(varName, varIndex) {
    return `Clear Text    $\{${this.getVarName(varName, varIndex)}}`;
  }

  codeFor_elementSendKeys(varName, varIndex, text) {
    return `Input Text    $\{${this.getVarName(varName, varIndex)}}    ${this.robotArg(text)}`;
  }

  codeFor_tap(varNameIgnore, varIndexIgnore, pointerActions) {
    const {x, y} = this.getTapCoordinatesFromPointerActions(pointerActions);
    return `@{finger} =    Create List    $\{${x}}    $\{${y}}
@{positions} =    Create List    $\{finger}
Tap With Positions    $\{100}    $\{positions}`;
  }

  codeFor_swipe(varNameIgnore, varIndexIgnore, pointerActions) {
    const {x1, y1, x2, y2} = this.getSwipeCoordinatesFromPointerActions(pointerActions);
    return `Swipe    $\{${x1}}    $\{${y1}}    $\{${x2}}    $\{${y2}}`;
  }

  // Top-Level Commands

  codeFor_executeScriptNoArgs(scriptCmd) {
    return `Execute Script    ${this.robotArg(scriptCmd)}`;
  }

  codeFor_executeScriptWithArgs(scriptCmd, jsonArg, varAssignment = '') {
    // change the JSON object into a format accepted by Create Dictionary: a sequence of key=value
    const argsValuesStrings = Object.entries(jsonArg[0])
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${this.robotArg(k)}=${this.getRobotVal(v)}`);
    return `&{scriptArgument} =    Create Dictionary    ${argsValuesStrings.join('    ')}
${varAssignment}Execute Script    ${this.robotArg(scriptCmd)}    $\{scriptArgument}`;
  }

  codeFor_updateSettings() {
    return '# Not supported: updateSettings';
  }

  codeFor_getSettings() {
    return '# Not supported: getSettings';
  }

  // Session

  codeFor_status() {
    return '# Not supported: status';
  }

  codeFor_getSession() {
    return '# Not supported: getSession';
  }

  codeFor_getAppiumCommands() {
    return `# Not supported: getAppiumCommands`;
  }

  codeFor_getAppiumExtensions() {
    return `# Not supported: getAppiumExtensions`;
  }

  codeFor_getAppiumSessionCapabilities() {
    return `# Not supported: getAppiumSessionCapabilities`;
  }

  codeFor_getTimeouts() {
    return '# Not supported: getTimeouts';
  }

  codeFor_setTimeouts() {
    // There is 'Set Appium Timeout' which may be different
    return '# Not supported: setTimeouts';
  }

  codeFor_getLogTypes() {
    return '# Not supported: getLogTypes';
  }

  codeFor_getLogs() {
    return '# Not supported: getLogs';
  }

  // Context

  codeFor_getAppiumContext() {
    return '${context} =    Get Current Context';
  }

  codeFor_getAppiumContexts() {
    return '${contexts} =    Get Contexts';
  }

  codeFor_switchAppiumContext(varNameIgnore, varIndexIgnore, name) {
    return `Switch To Context    ${this.robotArg(name)}`;
  }

  // Device Interaction

  codeFor_getWindowRect() {
    return `# Not supported: getWindowRect`;
  }

  codeFor_takeScreenshot() {
    return `Capture Page Screenshot`;
  }

  codeFor_isKeyboardShown() {
    return `$\{is_keyboard_shown} =    ${this.codeFor_executeScriptNoArgs('mobile: isKeyboardShown')}`;
  }

  codeFor_getOrientation() {
    return '# Not supported: getOrientation';
  }

  codeFor_setOrientation(varNameIgnore, varIndexIgnore, orientation) {
    if (orientation === 'LANDSCAPE') {
      return 'Landscape';
    } else if (orientation === 'PORTRAIT') {
      return 'Portrait';
    }
  }

  codeFor_getGeoLocation() {
    return '# Not supported: getGeoLocation';
  }

  codeFor_setGeoLocation(varNameIgnore, varIndexIgnore, latitude, longitude, altitude) {
    return `Set Location    $\{${latitude}}    $\{${longitude}}    $\{${altitude}}`;
  }

  codeFor_rotateDevice() {
    return '# Not supported: rotateDevice';
  }

  // App Management

  codeFor_installApp(varNameIgnore, varIndexIgnore, app) {
    return `Install App    ${this.robotArg(app)}`;
  }

  codeFor_isAppInstalled() {
    return '# Not supported: isAppInstalled';
  }

  codeFor_activateApp(varNameIgnore, varIndexIgnore, app) {
    return `Activate Application    ${this.robotArg(app)}`;
  }

  codeFor_terminateApp(varNameIgnore, varIndexIgnore, app) {
    return `Terminate Application    ${this.robotArg(app)}`;
  }

  codeFor_removeApp(varNameIgnore, varIndexIgnore, app) {
    return `Remove Application    ${this.robotArg(app)}`;
  }

  codeFor_queryAppState() {
    return `# Not supported: queryAppState`;
  }

  // File Transfer

  codeFor_pushFile(varNameIgnore, varIndexIgnore, pathToInstallTo, fileContentString) {
    return `Push File    ${this.robotArg(pathToInstallTo)}    ${this.robotArg(fileContentString)}`;
  }

  codeFor_pullFile(varNameIgnore, varIndexIgnore, pathToPullFrom) {
    return `$\{file_base64} =    Pull File    ${this.robotArg(pathToPullFrom)}`;
  }

  codeFor_pullFolder(varNameIgnore, varIndexIgnore, folderToPullFrom) {
    return `$\{folder_base64} =    Pull Folder    ${this.robotArg(folderToPullFrom)}`;
  }

  // Web

  codeFor_navigateTo(varNameIgnore, varIndexIgnore, url) {
    return `Go To Url    ${this.robotArg(url)}`;
  }

  codeFor_getUrl() {
    return '${current_url} =    Get Window Url';
  }

  codeFor_back() {
    return `Go Back`;
  }

  codeFor_forward() {
    return '# Not supported: forward';
  }

  codeFor_refresh() {
    return '# Not supported: refresh';
  }

  codeFor_getTitle() {
    return '${title} =    Get Window Title';
  }

  codeFor_getWindowHandle() {
    return '# Not supported: getWindowHandle';
  }

  codeFor_closeWindow() {
    return `# Not supported: closeWindow`;
  }

  codeFor_switchToWindow(varNameIgnore, varIndexIgnore, handle) {
    return `Switch To Window    ${this.robotArg(handle)}`;
  }

  codeFor_getWindowHandles() {
    return '${window_handles} =    Get Windows';
  }

  codeFor_createWindow() {
    return '# Not supported: createWindow';
  }
}
