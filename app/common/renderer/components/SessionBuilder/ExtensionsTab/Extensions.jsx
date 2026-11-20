import {IconDownload, IconRefresh, IconStethoscope, IconTrash} from '@tabler/icons-react';
import {Alert, Button, Empty, Input, List, Popconfirm, Segmented, Space, Spin, Typography} from 'antd';
import {useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';

import {useAppiumExtensions} from '../../../hooks/use-appium-extensions.jsx';

import styles from './Extensions.module.css';

const {Text} = Typography;

const isInstalled = (entry) => entry?.installed === true || (entry && 'version' in entry);

// What the official extensions are for. `appium <type> list` only describes installed ones, so
// the catalog would otherwise show bare names for everything that can still be installed.
const OFFICIAL_SUMMARY = {
  driver: {
    uiautomator2: 'Android apps',
    espresso: 'Android apps, with in-process Espresso',
    xcuitest: 'iOS and tvOS apps (needs a Mac)',
    mac2: 'macOS apps (needs a Mac)',
    safari: 'Safari on iOS and macOS (needs a Mac)',
    windows: 'Windows apps (needs Windows)',
    gecko: 'Firefox',
    chromium: 'Chrome and Edge',
  },
  plugin: {
    images: 'Find elements by image and compare screenshots',
    'execute-driver': 'Run a batch of WebdriverIO commands in one request',
    'relaxed-caps': 'Accept capabilities without the appium: prefix',
    'universal-xml': 'The same XML page source on iOS and Android',
    storage: 'Upload files to the server for sessions to use',
    inspector: 'Serve Appium Inspector from the server',
  },
};

const summaryOf = (type, name, entry) =>
  OFFICIAL_SUMMARY[type][name] ?? (entry?.platformNames?.length ? entry.platformNames.join(', ') : null);

const GITHUB_REPO = /^https:\/\/github\.com\//;

/**
 * Catalog of one extension kind ('driver' | 'plugin') in the app's isolated APPIUM_HOME:
 * installed ones first, then the official ones that can be installed with one click. Anything
 * else is installed from a package name or GitHub URL, which the main process validates and
 * asks the user to confirm.
 */
const ExtensionManager = ({type, switcher}) => {
  const {t} = useTranslation();
  const {items, loading, listError, updateError, op, opLog, refresh, install, update, uninstall, doctor} =
    useAppiumExtensions(type);
  const [showSource, setShowSource] = useState(false);
  const [spec, setSpec] = useState('');
  const [packageName, setPackageName] = useState('');
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [opLog]);

  const busy = op?.status === 'running';
  const isGithub = GITHUB_REPO.test(spec);
  const canInstallSource = !!spec && (!isGithub || !!packageName);

  const installFromSource = async () => {
    if (!canInstallSource) {
      return;
    }
    const res = await install(isGithub ? {name: spec, source: 'github', packageName} : {name: spec});
    // Keep what was typed when the install was refused or declined, so it can be corrected
    if (res?.status === 'started') {
      setSpec('');
      setPackageName('');
    }
  };

  const byName = (a, b) => a[0].localeCompare(b[0]);
  const all = Object.entries(items || {});
  const installed = all.filter(([, entry]) => isInstalled(entry)).sort(byName);
  const available = all.filter(([, entry]) => !isInstalled(entry)).sort(byName);
  const noun = type === 'driver' ? t('driver') : t('plugin');

  const itemActions = (name, entry) => {
    if (!isInstalled(entry)) {
      return [
        <Button
          key="install"
          size="small"
          icon={<IconDownload size={15} />}
          onClick={() => install({name})}
          disabled={busy}
        >
          {t('Install')}
        </Button>,
      ];
    }
    const safeUpdate = entry.updateVersion;
    const majorUpdate = !safeUpdate && entry.unsafeUpdateVersion;
    return [
      safeUpdate && (
        <Button key="update" size="small" type="link" onClick={() => update(name)} disabled={busy}>
          {t('Update to {{version}}', {version: safeUpdate})}
        </Button>
      ),
      majorUpdate && (
        <Button key="update" size="small" type="link" onClick={() => update(name, {unsafe: true})} disabled={busy}>
          {t('Update to {{version}} (major)', {version: majorUpdate})}
        </Button>
      ),
      <Button
        key="doctor"
        size="small"
        type="text"
        icon={<IconStethoscope size={15} />}
        onClick={() => doctor(name)}
        disabled={busy}
        title={t('Check its requirements (appium doctor)')}
        aria-label={t('Check the requirements of {{name}}', {name})}
      />,
      <Popconfirm
        key="uninstall"
        title={t('Uninstall the {{name}} {{noun}}?', {name, noun})}
        description={t('Sessions that need it will fail until it is installed again.')}
        okText={t('Uninstall')}
        okButtonProps={{danger: true}}
        onConfirm={() => uninstall(name)}
      >
        <Button
          size="small"
          type="text"
          danger
          icon={<IconTrash size={15} />}
          disabled={busy}
          title={t('Uninstall')}
          aria-label={t('Uninstall {{name}}', {name})}
        />
      </Popconfirm>,
    ].filter(Boolean);
  };

  const renderItem = ([name, entry]) => {
    const summary = summaryOf(type, name, entry);
    return (
      <List.Item actions={itemActions(name, entry)}>
        <List.Item.Meta
          title={
            <Space size={8}>
              <Text strong>{name}</Text>
              {entry.version && <Text type="secondary">{entry.version}</Text>}
            </Space>
          }
          description={summary}
        />
      </List.Item>
    );
  };

  const section = (title, entries) =>
    entries.length > 0 && (
      <List
        size="small"
        className={styles.list}
        header={
          <Text type="secondary" className={styles.sectionTitle}>
            {title} · {entries.length}
          </Text>
        }
        dataSource={entries}
        rowKey={([name]) => name}
        renderItem={renderItem}
      />
    );

  return (
    <Space direction="vertical" size="middle" className={styles.fill}>
      <div className={styles.toolbar}>
        {switcher}
        <Button
          size="small"
          type="text"
          icon={<IconRefresh size={16} />}
          onClick={() => refresh()}
          disabled={busy || loading}
          title={t('Check for updates')}
          aria-label={t('Check for updates')}
        />
      </div>
      {updateError && !listError && (
        <Text type="secondary" className={styles.hint}>
          {t('Could not check for updates: {{error}}', {error: updateError})}
        </Text>
      )}
      {listError && (
        <Alert
          type="error"
          showIcon
          title={t(type === 'driver' ? 'Could not load drivers' : 'Could not load plugins')}
          description={listError}
          action={
            <Button size="small" onClick={() => refresh()} disabled={busy}>
              {t('Retry')}
            </Button>
          }
        />
      )}
      <Spin spinning={loading && all.length === 0}>
        {all.length === 0 ? (
          !listError && !loading && <Empty description={t('No extensions found')} />
        ) : (
          <Space direction="vertical" size="middle" className={styles.fill}>
            {section(t('Installed'), installed)}
            {section(t('Available'), available)}
          </Space>
        )}
      </Spin>

      {showSource ? (
        <Space direction="vertical" size="small" className={styles.fill}>
          <Space.Compact className={styles.row}>
            <Input
              placeholder={t('npm package name, or https://github.com/… URL')}
              value={spec}
              onChange={(e) => setSpec(e.target.value.trim())}
              onPressEnter={installFromSource}
              disabled={busy}
              spellCheck={false}
              aria-label={t('Package to install')}
            />
            {isGithub && (
              <Input
                placeholder={t('npm package name in that repo')}
                value={packageName}
                onChange={(e) => setPackageName(e.target.value.trim())}
                onPressEnter={installFromSource}
                disabled={busy}
                spellCheck={false}
                aria-label={t('Package name')}
              />
            )}
            <Button
              icon={<IconDownload size={16} />}
              onClick={installFromSource}
              loading={busy}
              disabled={!canInstallSource}
            >
              {t('Install')}
            </Button>
          </Space.Compact>
          <Text type="secondary" className={styles.hint}>
            {t('Third-party extensions run with full access to this computer. You’ll be asked to confirm.')}
          </Text>
        </Space>
      ) : (
        <Button type="link" className={styles.sourceLink} onClick={() => setShowSource(true)}>
          {t('Install another {{noun}} from npm or GitHub…', {noun})}
        </Button>
      )}

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

/** Drivers & plugins catalog with a kind toggle. Desktop-only. */
const Extensions = () => {
  const {t} = useTranslation();
  const [kind, setKind] = useState('driver');

  if (!window.electronIPC?.extensions) {
    return (
      <div className={styles.panel}>
        <Alert
          type="info"
          showIcon
          title={t('Desktop only')}
          description="Driver and plugin management is only available in the desktop app."
        />
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      {/* Remount per kind so each gets its own hook instance and state */}
      <ExtensionManager
        type={kind}
        key={kind}
        switcher={
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              {label: t('Drivers'), value: 'driver'},
              {label: t('Plugins'), value: 'plugin'},
            ]}
          />
        }
      />
    </div>
  );
};

export default Extensions;
