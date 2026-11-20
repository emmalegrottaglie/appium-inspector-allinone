import {IconDeviceMobile, IconServer2, IconTestPipe} from '@tabler/icons-react';
import {useCallback, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';

import {useAppiumServer} from '../../hooks/use-appium-server.jsx';
import Extensions from '../SessionBuilder/ExtensionsTab/Extensions.jsx';
import LocalServer from '../SessionBuilder/LocalServerTab/LocalServer.jsx';
import ServerStatusDot, {
  SERVER_STATUS_LABEL,
  serverStatusOf,
} from '../SessionBuilder/LocalServerTab/ServerStatusDot.jsx';
import PythonPanel from '../SessionBuilder/PythonTab/PythonPanel.jsx';
import SessionBuilderPage from '../SessionBuilder/SessionBuilder.jsx';
import {WorkspaceContext} from './WorkspaceContext.js';

import styles from './Workspace.module.css';

// In workflow order: start a server, open a session on it (and record), then run the tests
const AREAS = [
  {key: 'server', label: 'Server', Icon: IconServer2},
  {key: 'session', label: 'Session', Icon: IconDeviceMobile},
  {key: 'tests', label: 'Tests', Icon: IconTestPipe},
];

// Live status of the app-managed server, shown on every area so it's never a guess whether a
// session will have something to connect to
const ServerStatus = ({onOpen}) => {
  const {t} = useTranslation();
  const {state} = useAppiumServer({withLog: false});
  const status = serverStatusOf(state);
  return (
    <button
      type="button"
      className={styles.status}
      onClick={onOpen}
      title={t('Local Appium server: {{status}}', {status: t(SERVER_STATUS_LABEL[status])})}
    >
      <ServerStatusDot status={status} />
      <span>{t(SERVER_STATUS_LABEL[status])}</span>
      {status === 'running' && state.port && <span className={styles.port}>:{state.port}</span>}
    </button>
  );
};

/**
 * Top-level layout of the desktop app's start page. The upstream session builder stays as it
 * is under "Session"; the all-in-one tools get their own areas instead of sharing its tab row,
 * so they don't inherit its server bar and Start Session footer. An area mounts the first time
 * it's opened (so the driver list and toolchain checks only run for people who use them), then
 * stays mounted and is only hidden, so switching areas never resets the builder or a running test.
 */
const Workspace = () => {
  const {t} = useTranslation();
  const [area, setArea] = useState('session');
  const [opened, setOpened] = useState(() => new Set(['session']));
  const openArea = useCallback((key) => {
    setArea(key);
    setOpened((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);
  const navigation = useMemo(() => ({openArea}), [openArea]);

  // Browser and plugin builds have no main process for these tools: show the builder alone
  if (!window.electronIPC) {
    return <SessionBuilderPage />;
  }

  return (
    <WorkspaceContext value={navigation}>
      <div className={styles.workspace}>
        <nav className={styles.rail} aria-label={t('Workspace')}>
          {AREAS.map(({key, label, Icon}) => (
            <button
              key={key}
              type="button"
              className={`${styles.railItem} ${area === key ? styles.active : ''}`}
              aria-current={area === key ? 'page' : undefined}
              onClick={() => openArea(key)}
            >
              <Icon size={20} stroke={1.75} />
              <span>{t(label)}</span>
            </button>
          ))}
          <div className={styles.railSpacer} />
          <ServerStatus onOpen={() => openArea('server')} />
        </nav>
        <main className={styles.areas}>
          <div className={`${styles.area} ${area === 'session' ? '' : styles.hidden}`}>
            <SessionBuilderPage />
          </div>
          <div className={`${styles.area} ${styles.serverArea} ${area === 'server' ? '' : styles.hidden}`}>
            {opened.has('server') && (
              <>
                <section className={styles.serverColumn} aria-label={t('Local server')}>
                  <h2 className={styles.heading}>{t('Local server')}</h2>
                  <LocalServer />
                </section>
                <section className={styles.serverColumn} aria-label={t('Drivers & Plugins')}>
                  <h2 className={styles.heading}>{t('Drivers & Plugins')}</h2>
                  <Extensions />
                </section>
              </>
            )}
          </div>
          <div className={`${styles.area} ${area === 'tests' ? '' : styles.hidden}`}>
            {opened.has('tests') && <PythonPanel />}
          </div>
        </main>
      </div>
    </WorkspaceContext>
  );
};

export default Workspace;
