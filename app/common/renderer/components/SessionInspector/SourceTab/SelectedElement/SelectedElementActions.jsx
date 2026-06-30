import {
  IconArrowsVertical,
  IconEraser,
  IconFocus2,
  IconSend2,
  IconStopwatch,
} from '@tabler/icons-react';
import {Button, Input, Row, Space, Tooltip} from 'antd';
import {useRef} from 'react';
import {useTranslation} from 'react-i18next';

import {ROW} from '../../../../constants/antd-types.js';
import styles from './SelectedElement.module.css';

/**
 * Action buttons for the selected element, including tap, send keys, clear, and get timing.
 */
const SelectedElementActions = (props) => {
  const {
    elementActionsDisabled,
    elementInteractionsNotAvailable,
    selectedElementSearchInProgress,
    applyClientMethod,
    selectedElementId,
    getFindElementsTimes,
    elementLocatorsData,
    scrollToElement,
  } = props;
  const {t} = useTranslation();
  const sendKeysRef = useRef(null);

  const tapButtonLoadingState =
    !(elementInteractionsNotAvailable || selectedElementId) || selectedElementSearchInProgress;

  // "Scroll to & tap" is Android-only and needs a stable sub-locator to anchor
  // the scrollIntoView. The '-android uiautomator' strategy is present only for
  // uiautomator2 sessions, so its presence is our Android gate.
  const locatorKeys = new Set((elementLocatorsData || []).map((d) => d.key));
  const isAndroid = locatorKeys.has('-android uiautomator');
  const canScrollTo =
    isAndroid &&
    (locatorKeys.has('accessibility id') ||
      locatorKeys.has('id') ||
      locatorKeys.has('-android uiautomator'));

  return (
    <Row justify="center" type={ROW.FLEX} align="middle" className={styles.selectedElemActions}>
      <Tooltip title={t('Tap')}>
        <Button
          disabled={elementActionsDisabled}
          icon={<IconFocus2 size={18} />}
          loading={tapButtonLoadingState}
          id="btnTapElement"
          onClick={() =>
            applyClientMethod({methodName: 'elementClick', elementId: selectedElementId})
          }
        />
      </Tooltip>
      {isAndroid && (
        <Tooltip
          title={t('Scroll to & tap — records a robust scrollIntoView instead of swipes')}
        >
          <Button
            disabled={elementActionsDisabled || !canScrollTo}
            icon={<IconArrowsVertical size={18} />}
            id="btnScrollToElement"
            onClick={() => scrollToElement(elementLocatorsData)}
          />
        </Tooltip>
      )}
      <Space.Compact className={styles.elementKeyInputActions}>
        <Input
          className={styles.elementKeyInput}
          disabled={elementActionsDisabled}
          placeholder={t('Enter Keys to Send')}
          allowClear={true}
          onChange={(e) => (sendKeysRef.current = e.target.value)}
        />
        <Tooltip title={t('Send Keys')}>
          <Button
            disabled={elementActionsDisabled}
            id="btnSendKeysToElement"
            icon={<IconSend2 size={18} />}
            onClick={() =>
              applyClientMethod({
                methodName: 'elementSendKeys',
                elementId: selectedElementId,
                args: [sendKeysRef.current || ''],
              })
            }
          />
        </Tooltip>
        <Tooltip title={t('Clear')}>
          <Button
            disabled={elementActionsDisabled}
            id="btnClearElement"
            icon={<IconEraser size={18} />}
            onClick={() =>
              applyClientMethod({methodName: 'elementClear', elementId: selectedElementId})
            }
          />
        </Tooltip>
      </Space.Compact>
      <Tooltip title={t('Get Timing')}>
        <Button
          disabled={elementActionsDisabled}
          id="btnGetTiming"
          icon={<IconStopwatch size={18} />}
          onClick={() => getFindElementsTimes(elementLocatorsData)}
        />
      </Tooltip>
    </Row>
  );
};

export default SelectedElementActions;
