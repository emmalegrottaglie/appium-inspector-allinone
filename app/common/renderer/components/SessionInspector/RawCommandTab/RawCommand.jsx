import {IconSend} from '@tabler/icons-react';
import {Alert, Button, Input, Select, Space, Tag, Typography} from 'antd';
import {useMemo, useState} from 'react';

import styles from './RawCommand.module.css';

const {TextArea} = Input;
const {Text} = Typography;

const DEFAULT_BASE = 'http://127.0.0.1:4723';
const METHODS = ['GET', 'POST', 'DELETE'];

// Derive a base URL from the live session's serverDetails, defensively across
// the few field names webdriverio-style configs use. Falls back to the local
// managed server. The user can always edit the field regardless.
function deriveBaseUrl(serverDetails) {
  if (serverDetails && typeof serverDetails === 'object') {
    if (typeof serverDetails.url === 'string' && serverDetails.url) {
      return serverDetails.url.replace(/\/+$/, '');
    }
    const protocol = serverDetails.protocol || 'http';
    const host = serverDetails.hostname || serverDetails.host || '127.0.0.1';
    const port = serverDetails.port || 4723;
    let path = serverDetails.path || '';
    if (path && !path.startsWith('/')) {
      path = `/${path}`;
    }
    return `${protocol}://${host}:${port}${path.replace(/\/+$/, '')}`;
  }
  return DEFAULT_BASE;
}

function buildUrl(base, path, sessionId) {
  let p = (path || '').replace('{sessionId}', sessionId || '');
  if (p && !p.startsWith('/')) {
    p = `/${p}`;
  }
  return `${base.replace(/\/+$/, '')}${p}`;
}

function statusColor(res) {
  if (!res || res.error) {
    return 'error';
  }
  if (res.ok) {
    return 'success';
  }
  if (res.status >= 500) {
    return 'error';
  }
  return 'warning';
}

function prettify(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/**
 * Raw WebDriver request panel. Sends user-composed HTTP requests straight to
 * the Appium server's WebDriver endpoints (works locally because the managed
 * server runs with --allow-cors). Rides the active session: `{sessionId}` in
 * the path expands to the live session id.
 *
 * Receives the inspector props (state.inspector) spread by SessionInspector,
 * so `driver` and `serverDetails` are available for prefilling.
 */
const RawCommand = (props) => {
  const sessionId = props?.driver?.sessionId || '';
  const initialBase = useMemo(() => deriveBaseUrl(props?.serverDetails), [props?.serverDetails]);

  const [method, setMethod] = useState('POST');
  const [baseUrl, setBaseUrl] = useState(initialBase);
  const [path, setPath] = useState('/session/{sessionId}/url');
  const [body, setBody] = useState('{\n  "url": "https://appium.io"\n}');
  const [bodyError, setBodyError] = useState(null);
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState(null);

  const wantsBody = method === 'POST';

  const send = async () => {
    setBodyError(null);
    let payload;
    if (wantsBody && body.trim()) {
      try {
        payload = JSON.stringify(JSON.parse(body));
      } catch {
        setBodyError('Request body must be valid JSON. Fix it and send again.');
        return;
      }
    }

    const url = buildUrl(baseUrl, path, sessionId);
    setSending(true);
    setResponse(null);
    const started = performance.now();
    try {
      const res = await fetch(url, {
        method,
        headers: wantsBody ? {'Content-Type': 'application/json'} : undefined,
        body: wantsBody ? payload : undefined,
      });
      const text = await res.text();
      setResponse({
        status: res.status,
        statusText: res.statusText,
        ok: res.ok,
        timeMs: Math.round(performance.now() - started),
        text,
      });
    } catch (e) {
      // Most common cause locally: server not running, or started without --allow-cors.
      setResponse({error: e.message, timeMs: Math.round(performance.now() - started)});
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.panel}>
      <Space direction="vertical" size="middle" className={styles.fill}>
        <Space.Compact className={styles.requestRow}>
          <Select
            value={method}
            onChange={setMethod}
            options={METHODS.map((m) => ({value: m, label: m}))}
            className={styles.method}
          />
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/session/{sessionId}/url"
            spellCheck={false}
          />
          <Button
            type="primary"
            icon={<IconSend size={16} />}
            loading={sending}
            onClick={send}
          >
            Send request
          </Button>
        </Space.Compact>

        <div>
          <Text type="secondary" className={styles.label}>
            Server URL
          </Text>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            spellCheck={false}
          />
          <Text type="secondary" className={styles.hint}>
            {sessionId
              ? `Active session ${sessionId} — "{sessionId}" in the path expands to it.`
              : 'No active session. Start one in the inspector, or type a session id into the path.'}
          </Text>
        </div>

        {wantsBody && (
          <div>
            <Text type="secondary" className={styles.label}>
              Request body (JSON)
            </Text>
            <TextArea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              autoSize={{minRows: 4, maxRows: 12}}
              spellCheck={false}
              className={styles.mono}
            />
            {bodyError && <Alert type="error" message={bodyError} showIcon className={styles.bodyError} />}
          </div>
        )}

        <div className={styles.responseArea}>
          {!response && (
            <Text type="secondary">Compose a request and send it to see the response here.</Text>
          )}
          {response && (
            <Space direction="vertical" size="small" className={styles.fill}>
              <Space size="small">
                <Tag color={statusColor(response)}>
                  {response.error ? 'No response' : `${response.status} ${response.statusText}`}
                </Tag>
                <Text type="secondary">{response.timeMs} ms</Text>
              </Space>
              {response.error ? (
                <Alert
                  type="error"
                  showIcon
                  message="Request failed"
                  description={`${response.error}. Check that the server URL is correct and the Appium server is running.`}
                />
              ) : (
                <pre className={styles.response}>{prettify(response.text)}</pre>
              )}
            </Space>
          )}
        </div>
      </Space>
    </div>
  );
};

export default RawCommand;
