import {useTranslation} from 'react-i18next';
import {Refractor} from 'react-refractor';

import {CLIENT_FRAMEWORK_MAP} from '../../../lib/client-frameworks/map.js';
import styles from './Recorder.module.css';
import RecorderTabCard from './RecorderTabCard.jsx';

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
  } = props;
  const {t} = useTranslation();

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
    await window.electronIPC.codeExport.saveAs({
      content: fw.getCodeString(true),
      language: Cls.refractorLang,
      defaultName: 'recorded-test',
    });
  };

  return (
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
        <div className={styles.noRecordedActions}>{t('enableRecordingAndPerformActions')}</div>
      )}
      {!!recordedActions.length && (
        <Refractor language={ClientFrameworkClass.refractorLang} value={clientCode} />
      )}
    </RecorderTabCard>
  );
};

export default Recorder;
