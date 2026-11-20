import {Button, Typography} from 'antd';
import {useContext, useState} from 'react';
import {useTranslation} from 'react-i18next';

import {useAppiumServer, useBundledServerAddress} from '../../../hooks/use-appium-server.jsx';
import {bundledServerUrl, ensureBundledServer} from '../../../lib/bundled-server.js';
import {WorkspaceContext} from '../../Workspace/WorkspaceContext.js';
import ServerStatusDot, {SERVER_STATUS_LABEL, serverStatusOf} from '../LocalServerTab/ServerStatusDot.jsx';
import ServerToggle from '../LocalServerTab/ServerToggle.jsx';

import styles from './BundledServerTab.module.css';

const {Text} = Typography;

/**
 * Session builder target for the app's own server. It has no address fields: the address is
 * set once, in the Server area, and Start Session starts the server when it isn't running.
 */
const BundledServerTab = () => {
  const {t} = useTranslation();
  const {state, stop} = useAppiumServer({withLog: false});
  const [address] = useBundledServerAddress();
  const workspace = useContext(WorkspaceContext);
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState(null);

  const status = serverStatusOf(state);
  const live = status === 'running' || status === 'starting';
  const error = state.error || startError;

  const onStart = async () => {
    setBusy(true);
    setStartError(null);
    try {
      await ensureBundledServer();
    } catch (err) {
      setStartError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.row}>
      <span className={styles.status}>
        <ServerStatusDot status={status} />
        {t(SERVER_STATUS_LABEL[status])}
      </span>
      <Text code className={styles.url}>
        {bundledServerUrl(live ? state : address)}
      </Text>
      <ServerToggle status={status} onStart={onStart} onStop={stop} busy={busy} size="small" />
      {workspace && (
        <Button size="small" type="link" onClick={() => workspace.openArea('server')}>
          {t('Change address')}
        </Button>
      )}
      {error && status !== 'running' ? (
        <Text type="danger" className={styles.hint}>
          {error}
        </Text>
      ) : (
        status !== 'running' && (
          <Text type="secondary" className={styles.hint}>
            {t('Start Session starts this server if it isn’t running.')}
          </Text>
        )
      )}
    </div>
  );
};

export default BundledServerTab;
