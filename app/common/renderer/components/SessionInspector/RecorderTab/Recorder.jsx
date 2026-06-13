import {
  IconChevronDown,
  IconDeviceFloppy,
  IconEraser,
  IconEyeCode,
  IconFiles,
  IconVideo,
} from '@tabler/icons-react';
import {Button, Card, Dropdown, Flex, Select, Space, Tooltip} from 'antd';
import _ from 'lodash';
import {useTranslation} from 'react-i18next';
import {Refractor} from 'react-refractor';

import {BUTTON} from '../../../constants/antd-types.js';
import {CLIENT_FRAMEWORK_MAP} from '../../../lib/client-frameworks/map.js';
import {copyToClipboard} from '../../../utils/other.js';
import inspectorStyles from '../SessionInspector.module.css';
import styles from './Recorder.module.css';

const Recorder = (props) => {
  const {showBoilerplate, recordedActions, clientFramework} = props;
  const {t} = useTranslation();

  const ClientFrameworkClass = CLIENT_FRAMEWORK_MAP[clientFramework];

  // Build code in any framework (defaults to the selected one), with its
  // refractor language so the main process can pick a file extension.
  const buildCodeFor = (fwId = clientFramework, withBoilerplate = showBoilerplate) => {
    const {serverDetails, sessionCaps} = props;
    const {serverUrl, serverUrlParts} = serverDetails;
    const Cls = CLIENT_FRAMEWORK_MAP[fwId];
    const framework = new Cls(serverUrl, serverUrlParts, sessionCaps);
    framework.actions = recordedActions;
    return {code: framework.getCodeString(withBoilerplate), language: Cls.refractorLang};
  };

  const getCode = () => buildCodeFor().code;

  const saveAs = async (fwId) => {
    // Always save WITH boilerplate so the file is self-contained and runnable
    // (imports + driver setup + teardown), regardless of the preview toggle.
    const {code, language} = buildCodeFor(fwId, true);
    await window.electronIPC.codeExport.saveAs({content: code, language, defaultName: 'recorded-test'});
  };

  const actionBar = () => {
    const {setClientFramework, toggleShowBoilerplate, clearRecording} = props;

    return (
      <Space size="middle">
        {!!recordedActions.length && (
          <Space.Compact>
            <Tooltip title={t('Show/Hide Boilerplate Code')}>
              <Button
                onClick={toggleShowBoilerplate}
                icon={<IconEyeCode size={18} />}
                type={showBoilerplate ? BUTTON.PRIMARY : BUTTON.DEFAULT}
              />
            </Tooltip>
            <Tooltip title={t('Copy code to clipboard')}>
              <Button icon={<IconFiles size={18} />} onClick={() => copyToClipboard(getCode())} />
            </Tooltip>
            {window.electronIPC?.codeExport && (
              <Tooltip title={t('Save test as a file')}>
                <Dropdown.Button
                  icon={<IconChevronDown size={16} />}
                  onClick={() => saveAs(clientFramework)}
                  menu={{
                    items: _.map(CLIENT_FRAMEWORK_MAP, (fwClass, fwId) => ({
                      key: fwId,
                      label: t('Save as {{name}}', {name: fwClass.readableName}),
                    })),
                    onClick: ({key}) => saveAs(key),
                  }}
                >
                  <IconDeviceFloppy size={18} />
                </Dropdown.Button>
              </Tooltip>
            )}
            <Tooltip title={t('Clear Actions')}>
              <Button icon={<IconEraser size={18} />} onClick={clearRecording} />
            </Tooltip>
          </Space.Compact>
        )}
        <Select
          defaultValue={clientFramework}
          value={clientFramework}
          onChange={setClientFramework}
          className={inspectorStyles.frameworkDropdown}
          options={_.map(CLIENT_FRAMEWORK_MAP, (fwClass, fwId) => ({
            value: fwId,
            label: fwClass.readableName,
          }))}
        />
      </Space>
    );
  };

  return (
    <Card
      title={
        <Flex gap={4} align="center">
          <IconVideo size={18} />
          {t('Recorder')}
        </Flex>
      }
      className={inspectorStyles.interactionTabCard}
      extra={actionBar()}
    >
      {!recordedActions.length && (
        <div className={styles.noRecordedActions}>{t('enableRecordingAndPerformActions')}</div>
      )}
      {!!recordedActions.length && (
        <Refractor language={ClientFrameworkClass.refractorLang} value={getCode()} />
      )}
    </Card>
  );
};

export default Recorder;
