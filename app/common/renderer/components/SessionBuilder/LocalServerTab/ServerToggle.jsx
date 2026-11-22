import {IconPlayerPlay, IconPlayerStop} from '@tabler/icons-react';
import {Button} from 'antd';
import {useTranslation} from 'react-i18next';

/**
 * One button for the bundled server: Start while it's down, Stop while it's starting or
 * running (stopping a start cancels it).
 */
const ServerToggle = ({status, onStart, onStop, busy = false, size}) => {
  const {t} = useTranslation();
  if (status === 'stopping') {
    return (
      <Button size={size} loading disabled>
        {t('Stopping…')}
      </Button>
    );
  }
  if (status === 'running' || status === 'starting') {
    return (
      <Button size={size} danger icon={<IconPlayerStop size={16} />} onClick={onStop}>
        {t('Stop server')}
      </Button>
    );
  }
  return (
    <Button size={size} type="primary" icon={<IconPlayerPlay size={16} />} onClick={onStart} loading={busy}>
      {t('Start server')}
    </Button>
  );
};

export default ServerToggle;
