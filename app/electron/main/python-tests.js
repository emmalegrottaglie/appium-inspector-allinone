import {randomUUID} from 'node:crypto';
import {mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {isAbsolute, join, relative, resolve} from 'node:path';

import {dialog, ipcMain} from 'electron';
import {XMLParser} from 'fast-xml-parser';

import {startProcess} from './process-runner.js';
import {venvExists, venvPython} from './python-env.js';

// Test authoring + execution. Runs the user's OWN pytest code -- so arbitrary
// code execution is the intended feature here, not a vuln. The guards exist to
// stop INJECTED content (a crafted page source, a malicious .appiumsession)
// from steering execution:
//   - the working directory comes from a native OS dialog, and is re-validated
//   - file paths are confined to the working dir (path-traversal guard)
//   - positional/keyword args can never start with '-' (pytest-flag injection)
//   - a run is only ever started by an explicit user action, never by streamed
//     content
//
// NOTE on the two execution models: a pytest run opens its OWN Appium session
// (the URL + caps live in the user's test code). This module just launches
// pytest; it does not share the GUI's live inspector session.

const xml = new XMLParser({ignoreAttributes: false, attributeNamePrefix: '@_'});

function assertDir(dir) {
  if (typeof dir !== 'string' || !dir) {
    throw new Error('A working directory is required.');
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

// Resolve a user-supplied relative path and guarantee it stays inside `dir`.
function safeJoin(dir, relPath) {
  if (typeof relPath !== 'string' || relPath.startsWith('-') || isAbsolute(relPath)) {
    throw new Error(`Invalid path: ${String(relPath)}`);
  }
  const full = resolve(dir, relPath);
  const rel = relative(dir, full);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path escapes the working directory: ${relPath}`);
  }
  return full;
}

async function pickWorkingDir() {
  const res = await dialog.showOpenDialog({properties: ['openDirectory']});
  if (res.canceled || !res.filePaths.length) {
    return {canceled: true};
  }
  return {canceled: false, path: res.filePaths[0]};
}

const SKIP_DIRS = new Set(['__pycache__', 'node_modules', 'venv', '.venv', '.git']);

const isWin = process.platform === 'win32';

// Runnable test file types and how each is executed.
//   .py            -> pytest (venv)            structured JUnit summary
//   .robot         -> robot  (venv)            structured xUnit summary
//   .rb            -> ruby   (system)          exit-code only
//   .js / .mjs     -> node | oxygen (system)   exit-code only
const TEST_EXTS = ['.py', '.robot', '.rb', '.js', '.mjs'];

// On Windows, npm/gem/oxygen are .cmd shims that won't resolve under
// shell:false; node/ruby are real .exe and resolve by bare name.
const winCmd = (name) => (isWin ? `${name}.cmd` : name);

/** Register the Python test IPC channels. Call from setupIPCListeners(). */
export function setupPythonTestsIPC() {
  ipcMain.handle('python:pickWorkingDir', () => pickWorkingDir());
  ipcMain.handle('python:listTests', (_evt, dir) => listTests(dir));
  ipcMain.handle('python:readFile', (_evt, dir, relPath) => readTestFile(dir, relPath));
  ipcMain.handle('python:saveFile', (_evt, dir, relPath, content) =>
    saveTestFile(dir, relPath, content),
  );
  ipcMain.handle('python:run', (evt, payload) => runTests(evt.sender, payload));
}

function langOf(relPath) {
  if (!relPath) {
    return 'python'; // "Run all" with no file -> pytest over the dir
  }
  if (relPath.endsWith('.robot')) {
    return 'robot';
  }
  if (relPath.endsWith('.rb')) {
    return 'ruby';
  }
  if (relPath.endsWith('.js') || relPath.endsWith('.mjs')) {
    return 'js';
  }
  return 'python';
}

function listTests(dir) {
  assertDir(dir);
  const out = [];
  const walk = (d, depth) => {
    if (depth > 4) {
      return;
    }
    for (const ent of readdirSync(d, {withFileTypes: true})) {
      if (ent.name.startsWith('.') || SKIP_DIRS.has(ent.name)) {
        continue;
      }
      const full = join(d, ent.name);
      if (ent.isDirectory()) {
        walk(full, depth + 1);
      } else if (ent.isFile() && TEST_EXTS.some((e) => ent.name.endsWith(e))) {
        out.push(relative(dir, full));
      }
    }
  };
  walk(dir, 0);
  return out.sort();
}

function readTestFile(dir, relPath) {
  assertDir(dir);
  return readFileSync(safeJoin(dir, relPath), 'utf8');
}

function saveTestFile(dir, relPath, content) {
  assertDir(dir);
  if (typeof relPath !== 'string' || !TEST_EXTS.some((e) => relPath.endsWith(e))) {
    throw new Error(`Only test files (${TEST_EXTS.join(', ')}) can be saved.`);
  }
  if (typeof content !== 'string') {
    throw new Error('File content must be a string.');
  }
  writeFileSync(safeJoin(dir, relPath), content, 'utf8');
  return {saved: true, path: relPath};
}

function messageOf(node) {
  if (node == null) {
    return null;
  }
  if (typeof node === 'string') {
    return node;
  }
  return node['@_message'] || node['#text'] || null;
}

// Turn pytest's JUnit XML into a compact, UI-friendly summary. Returns null on
// any parse trouble so callers can fall back to exit-code-only reporting.
function summarizeJUnit(xmlText) {
  let doc;
  try {
    doc = xml.parse(xmlText);
  } catch {
    return null;
  }
  const suitesNode = doc?.testsuites?.testsuite ?? doc?.testsuite;
  const suites = Array.isArray(suitesNode) ? suitesNode : suitesNode ? [suitesNode] : [];
  if (!suites.length) {
    return null;
  }
  const totals = {tests: 0, failures: 0, errors: 0, skipped: 0, time: 0};
  const tests = [];
  for (const s of suites) {
    totals.tests += Number(s['@_tests'] || 0);
    totals.failures += Number(s['@_failures'] || 0);
    totals.errors += Number(s['@_errors'] || 0);
    totals.skipped += Number(s['@_skipped'] || 0);
    totals.time += Number(s['@_time'] || 0);
    const casesNode = s.testcase;
    const cases = Array.isArray(casesNode) ? casesNode : casesNode ? [casesNode] : [];
    for (const c of cases) {
      let outcome = 'passed';
      let message = null;
      if (c.failure) {
        outcome = 'failed';
        message = messageOf(c.failure);
      } else if (c.error) {
        outcome = 'error';
        message = messageOf(c.error);
      } else if (c.skipped !== undefined) {
        outcome = 'skipped';
        message = messageOf(c.skipped);
      }
      tests.push({
        name: c['@_name'],
        classname: c['@_classname'],
        time: Number(c['@_time'] || 0),
        outcome,
        message,
      });
    }
  }
  totals.passed = totals.tests - totals.failures - totals.errors - totals.skipped;
  return {totals, tests};
}

// Send the structured result (parsed from an XML report when one exists) and
// clean up the temp report dir.
function emitResult(sender, runId, {code, signal, error}, reportPath, reportDir) {
  let summary = null;
  if (reportPath) {
    try {
      summary = summarizeJUnit(readFileSync(reportPath, 'utf8'));
    } catch {
      // no/garbled report -> exit-code only
    }
  }
  if (sender && !sender.isDestroyed()) {
    sender.send('python:result', {runId, code, signal, error, summary});
  }
  if (reportDir) {
    try {
      rmSync(reportDir, {recursive: true, force: true});
    } catch {
      /* best effort */
    }
  }
}

async function runTests(sender, {workingDir, paths = [], keyword = null} = {}) {
  assertDir(workingDir);

  const fileArgs = [];
  for (const p of paths) {
    safeJoin(workingDir, p); // validate confinement; pass as cwd-relative
    fileArgs.push(p);
  }
  if (keyword != null && (typeof keyword !== 'string' || keyword.startsWith('-'))) {
    throw new Error('Invalid -k expression.');
  }

  const lang = langOf(fileArgs[0]);

  // Python & Robot run on the managed venv; the others use a system runtime.
  if ((lang === 'python' || lang === 'robot') && !venvExists()) {
    return {status: 'env_not_ready'};
  }

  let command;
  let args;
  let reportDir = null;
  let reportPath = null;

  if (lang === 'python') {
    reportDir = mkdtempSync(join(tmpdir(), 'appium-gui-junit-'));
    reportPath = join(reportDir, `${randomUUID()}.xml`);
    command = venvPython();
    args = [
      '-m',
      'pytest',
      ...fileArgs,
      ...(keyword != null ? ['-k', keyword] : []),
      '-o',
      'junit_family=xunit2',
      `--junit-xml=${reportPath}`,
    ];
  } else if (lang === 'robot') {
    reportDir = mkdtempSync(join(tmpdir(), 'appium-gui-robot-'));
    reportPath = join(reportDir, 'xunit.xml');
    command = venvPython();
    // robot writes log/report/output into --outputdir; --xunit is JUnit-compatible.
    args = ['-m', 'robot', '--outputdir', reportDir, '--xunit', reportPath, ...fileArgs];
  } else if (lang === 'ruby') {
    command = 'ruby'; // ruby.exe resolves by bare name on Windows
    args = [...fileArgs];
  } else {
    // js: WebdriverIO scripts run with node; Oxygen scripts need the oxygen CLI.
    const first = fileArgs[0];
    const content = first ? readFileSync(safeJoin(workingDir, first), 'utf8') : '';
    const isOxygen = /\b(mob|win)\.init\s*\(|oxygen/i.test(content) && !/webdriverio/.test(content);
    command = isOxygen ? winCmd('oxygen') : 'node';
    args = [...fileArgs];
  }

  const {runId} = startProcess(
    sender,
    {command, args, options: {cwd: workingDir}, shell: command.endsWith('.cmd')},
    {onExit: (res) => emitResult(sender, runId, res, reportPath, reportDir)},
  );
  return {status: 'started', runId, lang};
}
