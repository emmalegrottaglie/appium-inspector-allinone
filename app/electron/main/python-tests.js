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
      } else if (ent.isFile() && ent.name.endsWith('.py')) {
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
  if (typeof relPath !== 'string' || !relPath.endsWith('.py')) {
    throw new Error('Only .py files can be saved.');
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

async function runTests(sender, {workingDir, paths = [], keyword = null} = {}) {
  assertDir(workingDir);
  if (!venvExists()) {
    return {status: 'env_not_ready'};
  }

  const fileArgs = [];
  for (const p of paths) {
    safeJoin(workingDir, p); // validate confinement; pass as cwd-relative
    fileArgs.push(p);
  }
  if (keyword != null && (typeof keyword !== 'string' || keyword.startsWith('-'))) {
    throw new Error('Invalid -k expression.');
  }

  const reportDir = mkdtempSync(join(tmpdir(), 'appium-gui-junit-'));
  const reportPath = join(reportDir, `${randomUUID()}.xml`);

  const args = [
    '-m',
    'pytest',
    ...fileArgs,
    ...(keyword != null ? ['-k', keyword] : []),
    '-o',
    'junit_family=xunit2',
    `--junit-xml=${reportPath}`,
  ];

  const {runId} = startProcess(
    sender,
    {command: venvPython(), args, options: {cwd: workingDir}},
    {
      onExit: ({code, signal, error}) => {
        let summary = null;
        try {
          summary = summarizeJUnit(readFileSync(reportPath, 'utf8'));
        } catch {
          // no report (e.g. collection error / interpreter crash) -> exit-code only
        }
        if (sender && !sender.isDestroyed()) {
          sender.send('python:result', {runId, code, signal, error, summary});
        }
        try {
          rmSync(reportDir, {recursive: true, force: true});
        } catch {
          /* best effort */
        }
      },
    },
  );
  return {status: 'started', runId};
}
