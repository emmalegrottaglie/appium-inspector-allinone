import {
  IconChevronDown,
  IconDeviceFloppy,
  IconEraser,
  IconEyeCode,
  IconFiles,
  IconVideo,
} from '@tabler/icons-react';
import {Button, Card, Dropdown, Flex, Select, Space, Tooltip} from 'antd';
import {useTranslation} from 'react-i18next';

import {BUTTON} from '../../../constants/antd-types.js';
import {CLIENT_FRAMEWORK_MAP} from '../../../lib/client-frameworks/map.js';
import {copyToClipboard} from '../../../utils/other.js';
import inspectorStyles from '../SessionInspector.module.css';

/**
 * Title of the recorder tab card.
 */
const RecorderTabTitle = () => {
  const {t} = useTranslation();

  return (
    <Flex gap={4} align="center">
      <IconVideo size={18} />
      {t('Recorder')}
    </Flex>
  );
};

/**
 * Header action options for the recorded code.
 */
const RecorderTabHeaderButtons = ({
  clientFramework,
  clientCode,
  recordedActions,
  setClientFramework,
  showBoilerplate,
  toggleShowBoilerplate,
  clearRecording,
  saveAs,
}) => {
  const {t} = useTranslation();

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
            <Button icon={<IconFiles size={18} />} onClick={() => copyToClipboard(clientCode)} />
          </Tooltip>
          {window.electronIPC?.codeExport && saveAs && (
            <Tooltip title={t('Save test as a file')}>
              <Dropdown.Button
                icon={<IconChevronDown size={16} />}
                onClick={() => saveAs(clientFramework)}
                menu={{
                  items: Object.entries(CLIENT_FRAMEWORK_MAP).map(([fwId, fwClass]) => ({
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
        options={Object.entries(CLIENT_FRAMEWORK_MAP).map(([fwId, fwClass]) => ({
          value: fwId,
          label: fwClass.readableName,
        }))}
      />
    </Space>
  );
};

/**
 * Wrapper card for the recorder tab.
 */
const RecorderTabCard = ({
  children,
  clientFramework,
  clientCode,
  recordedActions,
  setClientFramework,
  showBoilerplate,
  toggleShowBoilerplate,
  clearRecording,
  saveAs,
}) => (
  <Card
    title={<RecorderTabTitle />}
    className={inspectorStyles.interactionTabCard}
    extra={
      <RecorderTabHeaderButtons
        clientFramework={clientFramework}
        clientCode={clientCode}
        recordedActions={recordedActions}
        setClientFramework={setClientFramework}
        showBoilerplate={showBoilerplate}
        toggleShowBoilerplate={toggleShowBoilerplate}
        clearRecording={clearRecording}
        saveAs={saveAs}
      />
    }
  >
    {children}
  </Card>
);

export default RecorderTabCard;
