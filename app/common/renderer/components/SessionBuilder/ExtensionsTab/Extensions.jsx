import {
  IconDownload,
  IconRefresh,
  IconStethoscope,
  IconTrash,
} from '@tabler/icons-react';
import {Alert, Button, Empty, Input, List, Segmented, Space, Spin, Tag, Typography} from 'antd';
import {useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';

import {useAppiumExtensions} from '../../../hooks/use-appium-extensions.jsx';
import styles from './Extensions.module.css';

const {Text} = Typography;

const isInstalled = (entry) => entry?.installed === true || (entry && 'version' in entry);
const hasUpdate = (entry) =>
  isInstalled(entry) && (entry.updateVersion != null || entry.upToDate === false);

/**
 * Manage one extension kind ('driver' | 'plugin') against the app's isolated
 * APPIUM_HOME. Official short-names install directly; unknown names or explicit
 * sources require a confirmation step (the security gate from the main process).
 */
const ExtensionManager = ({type}) => {
  const {t} = useTranslation();
  const {items, loading, op, opLog, confirm, clearConfirm, refresh, install, update, uninstall, doctor} =
    useAppiumExtensions(type);
  const [name, setName] = useState('');
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [opLog]);

  const busy = op?.status === 'running';

  const entries = Object.entries(items || {}).sort((a, b) => {
    const ai = isInstalled(a[1]) ? 0 : 1;
    const bi = isInstalled(b[1]) ? 0 : 1;
    return ai - bi || a[0].localeCompare(b[0]);
  });

  const confirmInstall = () => {
    const c = confirm;
    clearConfirm();
    install({name: c.name, source: c.source || 'npm', allowThirdParty: true});
  };

  return (
    <Space direction="vertical" size="middle" className={styles.fill}>
      <Space.Compact className={styles.row}>
        <Input
          placeholder={t(type === 'driver' ? 'e.g. uiautomator2, xcuitest' : 'e.g. images, relaxed-caps')}
          value={name}
          onChange={(e) => setName(e.target.value.trim())}
          onPressEnter={() => name && install({name})}
          disabled={busy}
          spellCheck={false}
        />
        <Button
          type="primary"
          icon={<IconDownload size={16} />}
          onClick={() => name && install({name})}
          loading={busy}
          disabled={!name}
        >
          {t('Install')}
        </Button>
        <Button icon={<IconRefresh size={16} />} onClick={() => refresh()} disabled={busy} />
      </Space.Compact>

      {confirm && (
        <Alert
          type="warning"
          showIcon
          message={
            confirm.kind === 'third_party'
              ? `Install "${confirm.name}" from ${confirm.source}?`
              : `"${confirm.name}" is not an official ${type}.`
          }
          description={
            confirm.kind === 'third_party'
              ? 'Third-party extensions are installed at your own risk.'
              : `Install it from npm anyway? Only do this if you trust the package.`
          }
          action={
            <Space direction="vertical">
              <Button size="small" danger onClick={confirmInstall}>
                {t('Install anyway')}
              </Button>
              <Button size="small" onClick={clearConfirm}>
                {t('Cancel')}
              </Button>
            </Space>
          }
        />
      )}

      <Spin spinning={loading && entries.length === 0}>
        {entries.length === 0 ? (
          <Empty description={t('No extensions found')} />
        ) : (
          <List
            size="small"
            className={styles.list}
            dataSource={entries}
            renderItem={([extName, entry]) => {
              const installed = isInstalled(entry);
              return (
                <List.Item
                  actions={
                    installed
                      ? [
                          hasUpdate(entry) && (
                            <Button
                              key="update"
                              size="small"
                              type="link"
                              onClick={() => update(extName)}
                              disabled={busy}
                            >
                              {t('Update')}
                            </Button>
                          ),
                          <Button
                            key="doctor"
                            size="small"
                            type="text"
                            icon={<IconStethoscope size={15} />}
                            onClick={() => doctor(extName)}
                            disabled={busy}
                          />,
                          <Button
                            key="uninstall"
                            size="small"
                            type="text"
                            danger
                            icon={<IconTrash size={15} />}
                            onClick={() => uninstall(extName)}
                            disabled={busy}
                          />,
                        ].filter(Boolean)
                      : [
                          <Button
                            key="install"
                            size="small"
                            type="link"
                            icon={<IconDownload size={15} />}
                            onClick={() => install({name: extName})}
                            disabled={busy}
                          >
                            {t('Install')}
                          </Button>,
                        ]
                  }
                >
                  <Space>
                    <Text strong>{extName}</Text>
                    {installed ? (
                      <Tag color="success">{entry.version ? `v${entry.version}` : 'installed'}</Tag>
                    ) : (
                      <Tag>available</Tag>
                    )}
                    {hasUpdate(entry) && <Tag color="processing">update</Tag>}
                  </Space>
                </List.Item>
              );
            }}
          />
        )}
      </Spin>

      {(busy || opLog.length > 0) && (
        <div>
          <Text type="secondary" className={styles.label}>
            {op ? `${op.kind} ${op.name} — ${op.status}` : t('Output')}
          </Text>
          <pre className={styles.log} ref={logRef}>
            {opLog.map((l) => l.chunk).join('')}
          </pre>
        </div>
      )}
    </Space>
  );
};

/** Drivers & plugins manager with a kind toggle. Desktop-only. */
const Extensions = () => {
  const {t} = useTranslation();
  const [kind, setKind] = useState('driver');

  if (!window.electronIPC?.extensions) {
    return (
      <div className={styles.panel}>
        <Alert
          type="info"
          showIcon
          message={t('Desktop only')}
          description="Driver and plugin management is only available in the desktop app."
        />
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <Space direction="vertical" size="middle" className={styles.fill}>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            {label: t('Drivers'), value: 'driver'},
            {label: t('Plugins'), value: 'plugin'},
          ]}
        />
        {/* Remount per kind so each gets its own hook instance/state. */}
        {kind === 'driver' ? <ExtensionManager type="driver" key="driver" /> : <ExtensionManager type="plugin" key="plugin" />}
      </Space>
    </div>
  );
};

export default Extensions;
