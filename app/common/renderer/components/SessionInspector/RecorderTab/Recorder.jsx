import {IconVideo} from '@tabler/icons-react';
import {Button} from 'antd';
import {useContext} from 'react';
import {useTranslation} from 'react-i18next';
import {Refractor} from 'react-refractor';

import {CLIENT_FRAMEWORK_MAP} from '../../../lib/client-frameworks/map.js';
import {notification} from '../../../utils/notification.js';
import {WorkspaceContext} from '../../Workspace/WorkspaceContext.js';
import RecorderTabCard from './RecorderTabCard.jsx';

import inspectorStyles from '../SessionInspector.module.css';
import styles from './Recorder.module.css';

/**
 * Contents of the recorder tab.
 */
const Recorder = (props) => {
  const {
    showBoilerplate,
    recordedActions,
    clientFramework,
    serverDetails,
    sessionCaps,
    setClientFramework,
    toggleShowBoilerplate,
    clearRecording,
    isRecording,
    startRecording,
  } = props;
  const {t} = useTranslation();
  const workspace = useContext(WorkspaceContext);

  const {serverUrl, serverUrlParts} = serverDetails;
  const ClientFrameworkClass = CLIENT_FRAMEWORK_MAP[clientFramework];

  const framework = new ClientFrameworkClass(serverUrl, serverUrlParts, sessionCaps);
  framework.actions = recordedActions;
  const clientCode = framework.getCodeString(showBoilerplate);

  // Save the recorded test to a file in any framework, via a native Save
  // dialog. Always emits WITH boilerplate so the saved file is self-contained
  // and runnable, regardless of the on-screen "Show Boilerplate" toggle.
  const saveAs = async (fwId) => {
    const Cls = CLIENT_FRAMEWORK_MAP[fwId];
    const fw = new Cls(serverUrl, serverUrlParts, sessionCaps);
    fw.actions = recordedActions;
    const res = await window.electronIPC.codeExport.saveAs({
      content: fw.getCodeString(true),
      language: Cls.refractorLang,
      defaultName: 'recorded-test',
    });
    // Point at the next step, running it, without leaving the session
    if (res && !res.canceled) {
      notification.success({
        title: t('Test saved'),
        description: res.path,
        actions: workspace && (
          <Button size="small" type="primary" onClick={() => workspace.openArea('tests')}>
            {t('Open Tests')}
          </Button>
        ),
      });
    }
  };

  return (
    <div style={{height: '100%', overflowX: 'scroll'}}>
      <RecorderTabCard
        clientFramework={clientFramework}
        clientCode={clientCode}
        recordedActions={recordedActions}
        setClientFramework={setClientFramework}
        showBoilerplate={showBoilerplate}
        toggleShowBoilerplate={toggleShowBoilerplate}
        clearRecording={clearRecording}
        saveAs={saveAs}
      >
        {!recordedActions.length && (
          // Starting a recording is this tab's main job, so offer it here instead of only
          // through the icon in the inspector header
          <div className={styles.noRecordedActions}>
            {isRecording ? (
              <span>{t('Recording. Tap, type and swipe in the app to add steps.')}</span>
            ) : (
              <>
                <span>{t('Record your actions on the device to generate test code.')}</span>
                <Button type="primary" icon={<IconVideo size={16} />} onClick={startRecording}>
                  {t('Start Recording')}
                </Button>
              </>
            )}
          </div>
        )}
        {!!recordedActions.length && (
          <Refractor
            className={`refractor ${inspectorStyles.clientCode}`}
            language={ClientFrameworkClass.refractorLang}
            value={clientCode}
          />
        )}
      </RecorderTabCard>
    </div>
  );
};

export default Recorder;
