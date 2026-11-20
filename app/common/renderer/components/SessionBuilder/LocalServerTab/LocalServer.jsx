import {Alert, Input, Space, Tag, Typography} from 'antd';
import {useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';

import {useAppiumServer, useBundledServerAddress} from '../../../hooks/use-appium-server.jsx';
import {bundledServerUrl} from '../../../lib/bundled-server.js';
import ServerToggle from './ServerToggle.jsx';

import styles from './LocalServer.module.css';

const {Text} = Typography;

const STATUS_COLOR = {
  stopped: 'default',
  starting: 'processing',
  running: 'success',
  stopping: 'warning',
  error: 'error',
};

const isLoopback = (host) => host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '';

/**
 * Control panel for the app-managed (bundled or system) Appium server.
 * Desktop-only: relies on window.electronIPC via the useAppiumServer hook.
 */
const LocalServer = () => {
  const {t} = useTranslation();
  const {state, log, start, stop} = useAppiumServer();
  const [address, setAddress] = useBundledServerAddress();

  const [host, setHost] = useState(address.host);
  const [port, setPort] = useState(String(address.port));
  const [basePath, setBasePath] = useState(address.basePath);
  const [busy, setBusy] = useState(false);

  // Show the saved address once it loads, and whenever it's saved
  useEffect(() => {
    setHost(address.host);
    setPort(String(address.port));
    setBasePath(address.basePath);
  }, [address]);

  const logRef = useRef(null);
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  if (!window.electronIPC?.appium) {
    return (
      <div className={styles.panel}>
        <Alert
          type="info"
          showIcon
          title={t('Desktop only')}
          description="The managed Appium server is only available in the desktop app."
        />
      </div>
    );
  }

  const status = state?.status ?? 'stopped';
  const isUp = status === 'running' || status === 'starting' || status === 'stopping';

  const onStart = async () => {
    setBusy(true);
    try {
      const next = {host, port: Number(port) || 4723, basePath: basePath || '/'};
      const started = await start(next);
      // Kept only once the server accepted it (valid, and approved if non-loopback), so the
      // session builder's "Local server" tab and auto-start never reuse a refused address
      if (started?.status === 'starting' || started?.status === 'running') {
        await setAddress(next);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.panel}>
      <Space direction="vertical" size="middle" className={styles.fill}>
        <Space size="small" wrap>
          <Tag color={STATUS_COLOR[status] || 'default'} className={styles.statusTag}>
            {status.toUpperCase()}
          </Tag>
          {state?.source && isUp && (
            <Text type="secondary">
              source: <b>{state.source}</b>
            </Text>
          )}
          {status === 'running' && <Text type="secondary">{bundledServerUrl(state)}</Text>}
          {state?.error && <Text type="danger">{state.error}</Text>}
        </Space>

        <Space.Compact className={styles.row}>
          <Input
            addonBefore={t('Host')}
            value={host}
            onChange={(e) => setHost(e.target.value)}
            disabled={isUp}
            spellCheck={false}
          />
          <Input
            addonBefore={t('Port')}
            value={port}
            onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
            disabled={isUp}
            className={styles.port}
          />
          <Input
            addonBefore={t('Base path')}
            value={basePath}
            onChange={(e) => setBasePath(e.target.value)}
            disabled={isUp}
            spellCheck={false}
          />
        </Space.Compact>

        {!isLoopback(host) && (
          <Alert
            type="warning"
            showIcon
            title="Non-loopback host"
            description="The server runs with --allow-cors, which is only safe on a loopback host (127.0.0.1). Binding to a public address exposes a remote-code-execution risk."
          />
        )}

        <div>
          <ServerToggle status={status} onStart={onStart} onStop={stop} busy={busy} />
        </div>

        <div>
          <Text type="secondary" className={styles.label}>
            {t('Server log')}
          </Text>
          <pre className={styles.log} ref={logRef}>
            {log.length > 0
              ? log.map((l) => l.chunk).join('')
              : // The log is kept per view: after a session, this view reopens on a server that's
                // already running, and only output from then on is shown
                isUp
                ? t('The server is running. New output will appear here.')
                : t('Server output will appear here once started.')}
          </pre>
        </div>
      </Space>
    </div>
  );
};

export default LocalServer;
