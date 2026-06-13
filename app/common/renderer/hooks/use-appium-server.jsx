import {useCallback, useEffect, useRef, useState} from 'react';

// Renderer-side counterpart to appium-server.js. Exposes the managed server's
// status + streamed log and the start/stop controls. The log rides the same
// 'process:output' channel as every other process (Step 0); we just filter to
// the server's current runId.

const appium = window.electronIPC?.appium;
const runner = window.electronIPC?.runner;

export function useAppiumServer() {
  const [state, setState] = useState({status: 'stopped'});
  const [log, setLog] = useState(/** @type {{stream: string, chunk: string}[]} */ ([]));
  const runIdRef = useRef(null);

  useEffect(() => {
    if (!appium) {
      return undefined;
    }

    // hydrate: the server may already be running from before this mount
    (async () => {
      const s = await appium.getState();
      setState(s);
      runIdRef.current = s.runId ?? null;
    })();

    const offStatus = appium.onStatus((s) => {
      setState(s);
      runIdRef.current = s.runId ?? runIdRef.current;
    });

    const offLog = runner?.onOutput((data) => {
      if (data.runId && data.runId === runIdRef.current) {
        setLog((prev) => [...prev, {stream: data.stream, chunk: data.chunk}]);
      }
    });

    return () => {
      offStatus?.();
      offLog?.();
    };
  }, []);

  /**
   * Start the server. Clears the log and returns the initial state.
   * @param {{host?: string, port?: number, basePath?: string,
   *          plugins?: string[], allowCors?: boolean}} [cfg]
   */
  const start = useCallback(async (cfg) => {
    if (!appium) {
      throw new Error('Appium IPC unavailable (not running inside Electron?)');
    }
    setLog([]);
    const s = await appium.start(cfg);
    runIdRef.current = s.runId ?? null;
    setState(s);
    return s;
  }, []);

  const stop = useCallback(() => appium?.stop(), []);

  return {state, log, start, stop};
}
