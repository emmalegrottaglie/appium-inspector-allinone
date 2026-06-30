import {
  IconChevronDown,
  IconDeviceFloppy,
  IconFilePlus,
  IconFolderOpen,
  IconPlayerPlay,
  IconRefresh,
  IconWand,
} from '@tabler/icons-react';
import {Alert, Button, Dropdown, Input, List, Space, Tag, Typography} from 'antd';
import {useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';

import {usePythonEnv} from '../../../hooks/use-python-env.jsx';
import {usePythonTests} from '../../../hooks/use-python-tests.jsx';
import {useRuntimes} from '../../../hooks/use-runtimes.jsx';
import styles from './PythonPanel.module.css';

// Mirror of langOf() in python-tests.js — pick the runner from the file type.
const langOf = (name) => {
  if (!name) {
    return 'python';
  }
  if (name.endsWith('.robot')) {
    return 'robot';
  }
  if (name.endsWith('.rb')) {
    return 'ruby';
  }
  if (name.endsWith('.js') || name.endsWith('.mjs')) {
    return 'js';
  }
  return 'python';
};

const {Text} = Typography;
const {TextArea} = Input;

const OUTCOME_COLOR = {passed: 'success', failed: 'error', error: 'error', skipped: 'warning'};

// Imports the scaffold always emits (webdriver + the options class it uses).
const BASE_IMPORTS = [
  'from appium import webdriver',
  'from appium.options.android import UiAutomator2Options',
];

// Imports added only when the corresponding symbol appears in the steps. This
// covers the common recorder output: element finds (AppiumBy) and W3C gestures
// (ActionChains / ActionBuilder / PointerInput / interaction), plus explicit
// waits — the usual causes of a NameError when running raw recorded code.
const CONDITIONAL_IMPORTS = [
  ['AppiumBy', 'from appium.webdriver.common.appiumby import AppiumBy'],
  ['ActionChains', 'from selenium.webdriver.common.action_chains import ActionChains'],
  ['ActionBuilder', 'from selenium.webdriver.common.actions.action_builder import ActionBuilder'],
  ['PointerInput', 'from selenium.webdriver.common.actions.pointer_input import PointerInput'],
  ['interaction', 'from selenium.webdriver.common.actions import interaction'],
  ['WebDriverWait', 'from selenium.webdriver.support.ui import WebDriverWait'],
];

// For a fresh "New test" we don't know what will be pasted, so include the
// most common imports up front.
const REQUIRED_IMPORTS = [
  ...BASE_IMPORTS,
  'from appium.webdriver.common.appiumby import AppiumBy',
];

// Pick the imports a given test body actually needs (word-boundary match).
function importsForBody(body) {
  const text = body.join('\n');
  const conditional = CONDITIONAL_IMPORTS.filter(([sym]) =>
    new RegExp(`\\b${sym}\\b`).test(text),
  ).map(([, imp]) => imp);
  return [...BASE_IMPORTS, ...conditional];
}

const NEW_FILE_TEMPLATE = `${REQUIRED_IMPORTS.join('\n')}


def test_example():
    options = UiAutomator2Options()
    options.platform_name = "Android"
    options.device_name = "Android"
    driver = webdriver.Remote("http://127.0.0.1:4723", options=options)
    try:
        # Paste recorded steps here, then click Format.
        pass
    finally:
        driver.quit()
`;

// Wrap raw recorded steps (or a half-formed script) into a complete, runnable
// pytest test: guaranteed imports + a `def test_*` + driver setup + try/finally
// teardown, with the action lines indented inside the try block.
function scaffoldTest(raw, {funcName = 'test_recorded', implicitWait = false} = {}) {
  const lines = (raw || '').split('\n');
  const isImport = (l) => /^\s*(from|import)\s+/.test(l);
  // Lines that belong to the boilerplate we regenerate (so re-formatting an
  // already-formatted test is idempotent rather than nesting it). The
  // implicitly_wait line is included so toggling the option on/off is clean.
  const isBoilerplate = (l) =>
    /^\s*(options\s*=|options\.|driver\s*=\s*webdriver|driver\.implicitly_wait|def\s+test|try\s*:|finally\s*:|driver\.quit\(\))/.test(
      l,
    );
  const steps = lines
    .filter((l) => !isImport(l) && !isBoilerplate(l) && l.trim() !== '' && l.trim() !== 'pass')
    .map((l) => l.trim());
  const body = steps.length ? steps : ['pass  # add your recorded steps here'];
  return [
    ...importsForBody(body),
    '',
    '',
    `def ${funcName}():`,
    '    options = UiAutomator2Options()',
    '    options.platform_name = "Android"',
    '    options.device_name = "Android"',
    '    driver = webdriver.Remote("http://127.0.0.1:4723", options=options)',
    ...(implicitWait ? ['    driver.implicitly_wait(10)'] : []),
    '    try:',
    ...body.map((l) => `        ${l}`),
    '    finally:',
    '        driver.quit()',
    '',
  ].join('\n');
}

const EnvStatus = ({status}) => {
  const {t} = useTranslation();
  if (!status) {
    return <Text type="secondary">{t('Checking environment…')}</Text>;
  }
  const {python, venv, required, ready} = status;
  return (
    <Space direction="vertical" size={4} className={styles.fill}>
      <Space wrap>
        <Tag color={ready ? 'success' : 'default'}>{ready ? 'READY' : 'NOT READY'}</Tag>
        {python?.found ? (
          <Text type="secondary">
            Python <b>{python.version}</b> ({python.source})
            {!python.meetsMinimum && <Text type="danger"> &lt; {python.minimum} required</Text>}
          </Text>
        ) : (
          <Text type="danger">No Python interpreter found on PATH</Text>
        )}
        <Tag color={venv ? 'success' : 'default'}>{venv ? 'venv ✓' : 'no venv'}</Tag>
      </Space>
      <Space wrap size={4}>
        {(required || []).map((r) => (
          <Tag key={r.name} color={r.installed ? 'success' : 'default'}>
            {r.name}
            {r.installed && r.version ? ` ${r.version}` : ''}
          </Tag>
        ))}
      </Space>
    </Space>
  );
};

/** Python environment setup + pytest runner. Desktop-only. */
const PythonPanel = () => {
  const {t} = useTranslation();
  const {status, phase, log, confirm, clearConfirm, refresh, setup, installPackage, installRobot} =
    usePythonEnv();
  const {workingDir, files, run, runLog, result, pickDir, refreshFiles, readFile, saveFile, runTests} =
    usePythonTests();
  const {runtimes, op: rtOp, log: rtLog, installRubyGems, installJsDeps} = useRuntimes();
  const [keyword, setKeyword] = useState('');

  // In-app editor state
  const [openFile, setOpenFile] = useState(null); // relative path currently open
  const [editorText, setEditorText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const openInEditor = async (rel) => {
    const content = await readFile(rel);
    setOpenFile(rel);
    setEditorText(typeof content === 'string' ? content : '');
    setDirty(false);
  };

  const TEST_EXTS = ['.py', '.robot', '.rb', '.js', '.mjs'];

  const startNewFile = () => {
    let name = newName.trim() || 'test_recorded.py';
    if (!TEST_EXTS.some((e) => name.endsWith(e))) {
      name += '.py';
    }
    setOpenFile(name);
    // Only Python gets a scaffold; other languages come fully-formed from the
    // Recorder's Save As, so start them blank.
    setEditorText(name.endsWith('.py') ? NEW_FILE_TEMPLATE : '');
    setDirty(true);
    setNewName('');
  };

  const formatEditor = (opts) => {
    setEditorText((prev) => scaffoldTest(prev, opts));
    setDirty(true);
  };

  const saveEditor = async () => {
    if (!openFile) {
      return null;
    }
    const rel = TEST_EXTS.some((e) => openFile.endsWith(e)) ? openFile : `${openFile}.py`;
    setSaving(true);
    try {
      await saveFile(rel, editorText);
      setOpenFile(rel);
      setDirty(false);
      await refreshFiles();
    } finally {
      setSaving(false);
    }
    return rel;
  };

  const runOpenFile = async () => {
    const rel = await saveEditor();
    if (rel) {
      runTests({paths: [rel], keyword: keyword.trim() || null});
    }
  };

  const envLogRef = useRef(null);
  const runLogRef = useRef(null);
  const rtLogRef = useRef(null);
  useEffect(() => {
    if (envLogRef.current) {
      envLogRef.current.scrollTop = envLogRef.current.scrollHeight;
    }
  }, [log]);
  useEffect(() => {
    if (runLogRef.current) {
      runLogRef.current.scrollTop = runLogRef.current.scrollHeight;
    }
  }, [runLog]);
  useEffect(() => {
    if (rtLogRef.current) {
      rtLogRef.current.scrollTop = rtLogRef.current.scrollHeight;
    }
  }, [rtLog]);

  if (!window.electronIPC?.pythonEnv) {
    return (
      <div className={styles.panel}>
        <Alert
          type="info"
          showIcon
          message={t('Desktop only')}
          description="The Python test runner is only available in the desktop app."
        />
      </div>
    );
  }

  const settingUp = phase === 'venv' || phase === 'install';
  const ready = status?.ready;
  const running = run?.status === 'running';
  const rtBusy = rtOp?.status === 'running';

  // Can the open file be run, given its language's toolchain?
  const openLang = langOf(openFile);
  const canRunOpen =
    !!openFile &&
    {
      python: !!ready,
      robot: !!status?.robotReady,
      ruby: !!runtimes?.ruby?.found,
      js: !!runtimes?.node?.found || !!runtimes?.oxygen?.found,
    }[openLang];
  const isPyFile = openLang === 'python';

  return (
    <div className={styles.panel}>
      <Space direction="vertical" size="middle" className={styles.fill}>
        <section className={styles.card}>
          <Space className={styles.cardHeader}>
            <Text strong>{t('Environment')}</Text>
            <Button size="small" icon={<IconRefresh size={14} />} onClick={refresh} disabled={settingUp} />
          </Space>
          <EnvStatus status={status} />
          <Space className={styles.actions}>
            <Button
              type="primary"
              onClick={setup}
              loading={settingUp}
              disabled={status != null && status.python && !status.python.found}
            >
              {ready ? t('Reinstall dependencies') : t('Set up environment')}
            </Button>
            {phase === 'done' && <Text type="success">{t('Setup complete')}</Text>}
            {phase === 'error' && <Text type="danger">{t('Setup failed — see log')}</Text>}
          </Space>
          {confirm && (
            <Alert
              type="warning"
              showIcon
              className={styles.confirm}
              message={`Install third-party package "${confirm.package}"?`}
              action={
                <Space>
                  <Button size="small" danger onClick={() => {
                    const pkg = confirm.package;
                    clearConfirm();
                    installPackage(pkg);
                  }}>
                    {t('Install')}
                  </Button>
                  <Button size="small" onClick={clearConfirm}>
                    {t('Cancel')}
                  </Button>
                </Space>
              }
            />
          )}
          {(settingUp || log.length > 0) && (
            <pre className={styles.log} ref={envLogRef}>
              {log.map((l) => l.chunk).join('')}
            </pre>
          )}
        </section>

        <section className={styles.card}>
          <Space className={styles.cardHeader}>
            <Text strong>{t('Languages & runtimes')}</Text>
          </Space>
          <Text type="secondary" className={styles.hint}>
            {t('Python and Robot run in the managed venv. Ruby and JavaScript use your system toolchains (must be installed).')}
          </Text>

          <Space wrap>
            <Tag color={status?.robotReady ? 'success' : 'default'}>Robot Framework</Tag>
            {status?.robotReady ? (
              <Text type="success">{t('ready')} (.robot)</Text>
            ) : (
              <Button size="small" onClick={installRobot} loading={settingUp} disabled={!status?.venv}>
                {t('Add Robot Framework')}
              </Button>
            )}
            {!status?.venv && <Text type="secondary">{t('set up the venv first')}</Text>}
          </Space>

          <Space wrap>
            <Tag color={runtimes?.ruby?.found ? 'success' : 'default'}>Ruby</Tag>
            <Text type="secondary">
              {runtimes?.ruby?.found ? runtimes.ruby.version : t('not found on PATH')}
            </Text>
            <Button
              size="small"
              onClick={installRubyGems}
              loading={rtBusy && rtOp?.kind === 'ruby'}
              disabled={!runtimes?.ruby?.found}
            >
              {t('Install appium_lib_core')}
            </Button>
          </Space>

          <Space wrap>
            <Tag color={runtimes?.node?.found ? 'success' : 'default'}>Node / WebdriverIO</Tag>
            <Text type="secondary">
              {runtimes?.node?.found ? runtimes.node.version : t('Node not found on PATH')}
            </Text>
            <Button
              size="small"
              onClick={() => installJsDeps(workingDir)}
              loading={rtBusy && rtOp?.kind === 'js'}
              disabled={!runtimes?.node?.found || !workingDir}
            >
              {t('Install WebdriverIO')}
            </Button>
            {runtimes?.oxygen?.found && <Tag color="success">oxygen CLI</Tag>}
            {!workingDir && <Text type="secondary">{t('choose a working dir first')}</Text>}
          </Space>

          {(rtBusy || rtLog.length > 0) && (
            <pre className={styles.log} ref={rtLogRef}>
              {rtLog.map((l) => l.chunk).join('')}
            </pre>
          )}
        </section>

        <section className={styles.card}>
          <Space className={styles.cardHeader}>
            <Text strong>{t('Tests')}</Text>
          </Space>
          <Space wrap>
            <Button icon={<IconFolderOpen size={16} />} onClick={pickDir}>
              {t('Choose working directory')}
            </Button>
            {workingDir && (
              <Button size="small" icon={<IconRefresh size={14} />} onClick={refreshFiles} />
            )}
          </Space>
          {workingDir && (
            <Text type="secondary" className={styles.dir}>
              {workingDir}
            </Text>
          )}
          {workingDir && (
            <>
              <List
                size="small"
                header={
                  <Space className={styles.cardHeader}>
                    <Text type="secondary">
                      {files.length} {t('test file(s)')}
                    </Text>
                  </Space>
                }
                className={styles.files}
                dataSource={files}
                locale={{emptyText: t('No test files found (.py, .robot, .rb, .js)')}}
                renderItem={(f) => (
                  <List.Item
                    className={`${styles.fileItem} ${openFile === f ? styles.fileActive : ''}`}
                    onClick={() => openInEditor(f)}
                  >
                    {f}
                  </List.Item>
                )}
              />
              <Space.Compact className={styles.row}>
                <Input
                  placeholder={t('new-test-name.py')}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onPressEnter={startNewFile}
                  spellCheck={false}
                />
                <Button icon={<IconFilePlus size={16} />} onClick={startNewFile}>
                  {t('New test')}
                </Button>
              </Space.Compact>
            </>
          )}

          {openFile && (
            <div className={styles.editor}>
              <Space className={styles.cardHeader}>
                <Text strong className={styles.fileItem}>
                  {openFile}
                  {dirty ? ' •' : ''}
                </Text>
                <Space>
                  <Tag>{openLang}</Tag>
                  {isPyFile && (
                    <Dropdown.Button
                      size="small"
                      icon={<IconChevronDown size={14} />}
                      onClick={() => formatEditor()}
                      menu={{
                        items: [
                          {
                            key: 'wait',
                            label: t('Format + implicit wait (10s)'),
                          },
                        ],
                        onClick: ({key}) => {
                          if (key === 'wait') {
                            formatEditor({implicitWait: true});
                          }
                        },
                      }}
                    >
                      <IconWand size={14} /> {t('Format')}
                    </Dropdown.Button>
                  )}
                  <Button
                    size="small"
                    icon={<IconDeviceFloppy size={14} />}
                    onClick={saveEditor}
                    loading={saving}
                    disabled={!dirty}
                  >
                    {t('Save')}
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    icon={<IconPlayerPlay size={14} />}
                    onClick={runOpenFile}
                    loading={running}
                    disabled={!canRunOpen}
                  >
                    {t('Save & run')}
                  </Button>
                </Space>
              </Space>
              <TextArea
                value={editorText}
                onChange={(e) => {
                  setEditorText(e.target.value);
                  setDirty(true);
                }}
                autoSize={{minRows: 10, maxRows: 24}}
                spellCheck={false}
                className={styles.code}
              />
              <Text type="secondary" className={styles.hint}>
                {isPyFile
                  ? t('Format wraps recorded steps with imports, a test function, and setup/teardown.')
                  : t('Runs with the {{lang}} toolchain. Generate this file from the Recorder’s Save As.', {lang: openLang})}
              </Text>
            </div>
          )}

          <Space.Compact className={styles.row}>
            <Input
              addonBefore={t('Keyword (-k)')}
              placeholder={t('optional pytest -k filter')}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              disabled={!workingDir || running}
              spellCheck={false}
            />
            <Button
              type="primary"
              icon={<IconPlayerPlay size={16} />}
              onClick={() => runTests({keyword: keyword.trim() || null})}
              loading={running}
              disabled={!ready || !workingDir}
            >
              {t('Run all tests')}
            </Button>
          </Space.Compact>
          {!ready && workingDir && (
            <Text type="warning">{t('Set up the environment before running tests.')}</Text>
          )}
          {run?.reason === 'env_not_ready' && (
            <Text type="danger">{t('Environment is not ready.')}</Text>
          )}

          {result?.totals && (
            <Space wrap className={styles.totals}>
              <Tag color="success">{result.totals.passed} passed</Tag>
              {result.totals.failures > 0 && <Tag color="error">{result.totals.failures} failed</Tag>}
              {result.totals.errors > 0 && <Tag color="error">{result.totals.errors} errors</Tag>}
              {result.totals.skipped > 0 && <Tag color="warning">{result.totals.skipped} skipped</Tag>}
              <Text type="secondary">{result.totals.time?.toFixed?.(2)}s</Text>
            </Space>
          )}
          {result?.tests?.length > 0 && (
            <List
              size="small"
              className={styles.files}
              dataSource={result.tests}
              renderItem={(tc) => (
                <List.Item>
                  <Space>
                    <Tag color={OUTCOME_COLOR[tc.outcome] || 'default'}>{tc.outcome}</Tag>
                    <Text>{tc.name}</Text>
                  </Space>
                </List.Item>
              )}
            />
          )}
          {(running || runLog.length > 0) && (
            <pre className={styles.log} ref={runLogRef}>
              {runLog.map((l) => l.chunk).join('')}
            </pre>
          )}
        </section>
      </Space>
    </div>
  );
};

export default PythonPanel;
