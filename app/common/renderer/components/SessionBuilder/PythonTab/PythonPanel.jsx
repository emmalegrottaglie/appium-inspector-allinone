import {
  IconChevronDown,
  IconDeviceFloppy,
  IconFilePlus,
  IconFolderOpen,
  IconPlayerPlay,
  IconRefresh,
  IconWand,
} from '@tabler/icons-react';
import {Alert, Badge, Button, Dropdown, Empty, Input, List, Space, Table, Tabs, Tag, Typography} from 'antd';
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
const BASE_IMPORTS = ['from appium import webdriver', 'from appium.options.android import UiAutomator2Options'];

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
const REQUIRED_IMPORTS = [...BASE_IMPORTS, 'from appium.webdriver.common.appiumby import AppiumBy'];

// Pick the imports a given test body actually needs (word-boundary match).
function importsForBody(body) {
  const text = body.join('\n');
  const conditional = CONDITIONAL_IMPORTS.filter(([sym]) => new RegExp(`\\b${sym}\\b`).test(text)).map(
    ([, imp]) => imp,
  );
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

/** Python environment setup + pytest runner. Desktop-only. */
const PythonPanel = () => {
  const {t} = useTranslation();
  const {status, phase, log, refresh, setup, installRobot} = usePythonEnv();
  const {workingDir, files, run, runLog, result, pickDir, refreshFiles, readFile, saveFile, runTests} =
    usePythonTests();
  const {runtimes, op: rtOp, log: rtLog, installRubyGems, installJsDeps} = useRuntimes();
  const [keyword, setKeyword] = useState('');
  const [panelTab, setPanelTab] = useState('tests'); // 'environment' | 'tests'

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
          title={t('Desktop only')}
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

  // Overall run result — structured (pytest/robot JUnit summary) OR exit-code
  // (ruby/js). This gives Ruby & JS a clear PASS/FAIL state.
  const finished = !!run && run.status !== 'running';
  const structured = result?.totals;
  const structuredTotal = structured ? result.totals.tests || 0 : 0;
  const structuredFailed = structured ? (result.totals.failures || 0) + (result.totals.errors || 0) : 0;
  let resultBanner = null;
  if (running) {
    resultBanner = <Tag color="processing">{t('RUNNING…')}</Tag>;
  } else if (run?.reason === 'env_not_ready') {
    resultBanner = <Tag color="error">{t('ENV NOT READY')}</Tag>;
  } else if (run?.reason === 'launch_failed') {
    resultBanner = <Tag color="error">{t('COULD NOT RUN')}</Tag>;
  } else if (finished) {
    if (structured && structuredTotal === 0) {
      // A report with no test cases (e.g. a -k filter that matched nothing) is
      // not a pass — pytest exits 5 here, so don't render it green.
      resultBanner = <Tag color="warning">{t('NO TESTS')}</Tag>;
    } else {
      // Structured (pytest/robot): pass only if the report is clean AND the
      // process exited OK — a non-zero exit with 0 reported failures (e.g. a
      // fixture/teardown crash) is still a failure. Exit-code langs (ruby/js):
      // pass iff the process exited 0.
      const passed = structured ? structuredFailed === 0 && run.status !== 'error' : run.status === 'done';
      resultBanner = passed ? (
        <Tag color="success">{t('PASSED')}</Tag>
      ) : (
        <Tag color="error">
          {t('FAILED')}
          {!structured && (run.code != null ? ` (exit ${run.code})` : ` (${t('could not run')})`)}
        </Tag>
      );
    }
  }

  // One row per toolchain: what it is, what's installed, whether it's usable, and the one action
  // that fixes it. Only an action that's needed is primary, so a ready environment stays quiet.
  const python = status?.python;
  const statusCell = (kind, label) => <Badge status={kind} text={label} />;
  const envRows = [
    {
      key: 'python',
      name: 'Python',
      detail: t('Your system interpreter, used to create the test environment'),
      version: python?.found ? `${python.version} (${python.source})` : '—',
      status: !status
        ? statusCell('processing', t('Checking…'))
        : !python?.found
          ? statusCell('warning', t('Not found on PATH'))
          : !python.meetsMinimum
            ? statusCell('error', t('Needs {{version}} or later', {version: python.minimum}))
            : statusCell('success', t('Ready')),
      action: null,
    },
    {
      key: 'venv',
      name: t('Test environment'),
      detail: t('pytest and the Appium Python client, in a virtual environment the app manages'),
      version:
        (status?.required || [])
          .filter((r) => r.installed && r.version)
          .map((r) => `${r.name} ${r.version}`)
          .join(' · ') || '—',
      status: ready
        ? statusCell('success', t('Ready'))
        : status?.venv
          ? statusCell('warning', t('Missing packages'))
          : statusCell('default', t('Not set up')),
      action: (
        <Button
          size="small"
          type={ready ? 'default' : 'primary'}
          onClick={setup}
          loading={settingUp}
          disabled={!python?.found}
        >
          {ready ? t('Reinstall') : t('Set up')}
        </Button>
      ),
    },
    {
      key: 'robot',
      name: 'Robot Framework',
      detail: t('Runs .robot files in the test environment'),
      version: '—',
      status: status?.robotReady ? statusCell('success', t('Ready')) : statusCell('default', t('Not installed')),
      action: !status?.robotReady && (
        <Button
          size="small"
          onClick={installRobot}
          loading={settingUp}
          disabled={!status?.venv}
          title={status?.venv ? undefined : t('Set up the test environment first')}
        >
          {t('Install')}
        </Button>
      ),
    },
    {
      key: 'ruby',
      name: 'Ruby',
      detail: t('Runs .rb files with your system Ruby'),
      version: runtimes?.ruby?.found ? runtimes.ruby.version : '—',
      status: runtimes?.ruby?.found ? statusCell('success', t('Found')) : statusCell('default', t('Not found on PATH')),
      action: runtimes?.ruby?.found && (
        <Button size="small" onClick={installRubyGems} loading={rtBusy && rtOp?.kind === 'ruby'}>
          {t('Install appium_lib_core')}
        </Button>
      ),
    },
    {
      key: 'js',
      name: 'Node / WebdriverIO',
      detail: runtimes?.oxygen?.found
        ? t('Runs .js files with your system Node (oxygen CLI found)')
        : t('Runs .js files with your system Node'),
      version: runtimes?.node?.found ? runtimes.node.version : '—',
      status: runtimes?.node?.found ? statusCell('success', t('Found')) : statusCell('default', t('Not found on PATH')),
      action: runtimes?.node?.found && (
        <Button
          size="small"
          onClick={() => installJsDeps(workingDir)}
          loading={rtBusy && rtOp?.kind === 'js'}
          disabled={!workingDir}
          title={workingDir ? undefined : t('Open a test folder first')}
        >
          {t('Install WebdriverIO')}
        </Button>
      ),
    },
  ];

  const environmentPane = (
    <Space direction="vertical" size="middle" className={styles.fill}>
      <Space className={styles.cardHeader}>
        <Text type="secondary">
          {t(
            'Python and Robot run in the app’s test environment. Ruby and JavaScript use the toolchains on your PATH.',
          )}
        </Text>
        <Button
          size="small"
          icon={<IconRefresh size={14} />}
          onClick={refresh}
          disabled={settingUp}
          title={t('Check again')}
          aria-label={t('Check again')}
        />
      </Space>
      <Table
        size="small"
        pagination={false}
        dataSource={envRows}
        className={styles.envTable}
        columns={[
          {
            title: t('Toolchain'),
            key: 'name',
            render: (_, row) => (
              <Space direction="vertical" size={0}>
                <Text strong>{row.name}</Text>
                <Text type="secondary" className={styles.hint}>
                  {row.detail}
                </Text>
              </Space>
            ),
          },
          {title: t('Version'), dataIndex: 'version', key: 'version'},
          {title: t('Status'), dataIndex: 'status', key: 'status', width: 170},
          {title: '', dataIndex: 'action', key: 'action', align: 'right', width: 190},
        ]}
      />
      {phase === 'done' && <Text type="success">{t('Setup complete')}</Text>}
      {phase === 'error' && <Text type="danger">{t('Setup failed — see the output below')}</Text>}
      {(settingUp || log.length > 0) && (
        <pre className={styles.log} ref={envLogRef}>
          {log.map((l) => l.chunk).join('')}
        </pre>
      )}
      {(rtBusy || rtLog.length > 0) && (
        <pre className={styles.log} ref={rtLogRef}>
          {rtLog.map((l) => l.chunk).join('')}
        </pre>
      )}
    </Space>
  );

  // Until a folder is open there is nothing to list, edit or run, so show only the way in
  const testsPane = !workingDir ? (
    <Empty
      className={styles.noFolder}
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={
        <Space direction="vertical" size={2}>
          <Text strong>{t('No test folder open')}</Text>
          <Text type="secondary">
            {t('Open the folder that holds your tests, or an empty one to start writing them.')}
          </Text>
        </Space>
      }
    >
      <Button type="primary" icon={<IconFolderOpen size={16} />} onClick={pickDir}>
        {t('Open test folder')}
      </Button>
    </Empty>
  ) : (
    <div className={styles.testsLayout}>
      {/* LEFT column: working dir + file list + editor */}
      <div className={styles.testsCol}>
        <Space wrap>
          <Button icon={<IconFolderOpen size={16} />} onClick={pickDir}>
            {t('Change folder')}
          </Button>
          <Button
            size="small"
            icon={<IconRefresh size={14} />}
            onClick={refreshFiles}
            title={t('Refresh file list')}
            aria-label={t('Refresh file list')}
          />
        </Space>
        <Text type="secondary" className={styles.dir}>
          {workingDir}
        </Text>
        <List
          size="small"
          header={
            <Text type="secondary">
              {files.length} {t('test file(s)')}
            </Text>
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
                      items: [{key: 'wait', label: t('Format + implicit wait (10s)')}],
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
              autoSize={{minRows: 12, maxRows: 30}}
              spellCheck={false}
              className={styles.code}
            />
            <Text type="secondary" className={styles.hint}>
              {isPyFile
                ? t('Format wraps recorded steps with imports, a test function, and setup/teardown.')
                : t('Runs with the {{lang}} toolchain. Generate this file from the Recorder’s Save As.', {
                    lang: openLang,
                  })}
            </Text>
          </div>
        )}
      </div>

      {/* RIGHT column: run controls + result + output */}
      <div className={styles.testsCol}>
        <Space.Compact className={styles.row}>
          <Input
            addonBefore={t('Filter by name')}
            placeholder={t('pytest -k expression, e.g. login and not slow')}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            disabled={running}
            spellCheck={false}
          />
          <Button
            type="primary"
            icon={<IconPlayerPlay size={16} />}
            onClick={() => runTests({keyword: keyword.trim() || null})}
            loading={running}
            disabled={!ready}
            title={ready ? undefined : t('Set up the environment before running tests.')}
          >
            {t('Run all tests')}
          </Button>
        </Space.Compact>
        {!ready && <Text type="warning">{t('Set up the environment before running tests.')}</Text>}

        <Space wrap align="center" className={styles.resultRow}>
          <Text strong>{t('Result')}</Text>
          {resultBanner || <Text type="secondary">{t('run a test to see output')}</Text>}
          {structured && structuredTotal > 0 && (
            <>
              <Tag color="success">{result.totals.passed} passed</Tag>
              {result.totals.failures > 0 && <Tag color="error">{result.totals.failures} failed</Tag>}
              {result.totals.errors > 0 && <Tag color="error">{result.totals.errors} errors</Tag>}
              {result.totals.skipped > 0 && <Tag color="warning">{result.totals.skipped} skipped</Tag>}
              <Text type="secondary">{result.totals.time?.toFixed?.(2)}s</Text>
            </>
          )}
        </Space>
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
        <pre className={styles.outputLog} ref={runLogRef}>
          {runLog.length ? runLog.map((l) => l.chunk).join('') : t('Test output will appear here.')}
        </pre>
      </div>
    </div>
  );

  return (
    <div className={styles.panel}>
      <Tabs
        activeKey={panelTab}
        onChange={setPanelTab}
        size="small"
        className={styles.fill}
        items={[
          {key: 'tests', label: t('Tests'), children: testsPane},
          {
            key: 'environment',
            label: (
              <span>
                {t('Environment')}
                {status && !ready && (
                  <Tag color="warning" className={styles.tabTag}>
                    {t('needs setup')}
                  </Tag>
                )}
              </span>
            ),
            children: environmentPane,
          },
        ]}
      />
    </div>
  );
};

export default PythonPanel;
