import {IconPlayerPlay, IconPlayerStop} from '@tabler/icons-react';
import {Alert, Button, Input, Space, Tag, Typography} from 'antd';
import {useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';

import {useAppiumServer} from '../../../hooks/use-appium-server.jsx';
import styles from './LocalServer.module.css';

const {Text} = Typography;

const STATUS_COLOR = {
  stopped: 'default',
  starting: 'processing',
  running: 'success',
  stopping: 'warning',
  error: 'error',
};

const isLoopback = (host) =>
  host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '';

/**
 * Control panel for the app-managed (bundled or system) Appium server.
 * Desktop-only: relies on window.electronIPC via the useAppiumServer hook.
 */
const LocalServer = () => {
  const {t} = useTranslation();
  const {state, log, start, stop} = useAppiumServer();

  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('4723');
  const [basePath, setBasePath] = useState('/');
  const [busy, setBusy] = useState(false);

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
          message={t('Desktop only')}
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
      await start({host, port: Number(port) || 4723, basePath: basePath || '/'});
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
          {status === 'running' && (
            <Text type="secondary">
              {`http://${state.host}:${state.port}${state.basePath === '/' ? '' : state.basePath}`}
            </Text>
          )}
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
            addonBefore={t('Base Path')}
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
            message="Non-loopback host"
            description="The server runs with --allow-cors, which is only safe on a loopback host (127.0.0.1). Binding to a public address exposes a remote-code-execution risk."
          />
        )}

        <Space>
          <Button
            type="primary"
            icon={<IconPlayerPlay size={16} />}
            onClick={onStart}
            loading={busy || status === 'starting'}
            disabled={isUp}
          >
            {t('Start Server')}
          </Button>
          <Button
            danger
            icon={<IconPlayerStop size={16} />}
            onClick={stop}
            disabled={!isUp}
          >
            {t('Stop Server')}
          </Button>
        </Space>

        <div>
          <Text type="secondary" className={styles.label}>
            {t('Server Log')}
          </Text>
          <pre className={styles.log} ref={logRef}>
            {log.length === 0
              ? 'Server output will appear here once started.'
              : log.map((l) => l.chunk).join('')}
          </pre>
        </div>
      </Space>
    </div>
  );
};

export default LocalServer;
