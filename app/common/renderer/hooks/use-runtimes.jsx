import {useCallback, useEffect, useRef, useState} from 'react';

// Renderer-side counterpart to system-runtimes.js. Detects the system toolchains
// used to run non-Python recorded tests (Ruby, Node/WebdriverIO, Oxygen) and
// installs their client deps, streaming output over the shared process channel.

const rt = window.electronIPC?.runtimes;
const runner = window.electronIPC?.runner;

export function useRuntimes() {
  const [runtimes, setRuntimes] = useState(null); // {ruby, node, npm, oxygen} | null
  const [op, setOp] = useState(null); // {kind, status} | null
  const [log, setLog] = useState([]);
  const opRunId = useRef(null);

  const refresh = useCallback(async () => {
    if (rt) {
      setRuntimes(await rt.detect());
    }
  }, []);

  useEffect(() => {
    // Intentional detect-on-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!runner) {
      return undefined;
    }
    const offOut = runner.onOutput((d) => {
      if (d.runId && d.runId === opRunId.current) {
        setLog((prev) => [...prev, {stream: d.stream, chunk: d.chunk}]);
      }
    });
    const offExit = runner.onExit((d) => {
      if (d.runId && d.runId === opRunId.current) {
        setOp((o) => (o ? {...o, status: d.error || d.code !== 0 ? 'error' : 'done'} : o));
        refresh();
      }
    });
    return () => {
      offOut?.();
      offExit?.();
    };
  }, [refresh]);

  const start = useCallback(async (kind, invoke) => {
    if (!rt) {
      return null;
    }
    setLog([]);
    const res = await invoke();
    if (res?.status === 'started') {
      opRunId.current = res.runId;
      setOp({kind, status: 'running'});
    }
    return res;
  }, []);

  const installRubyGems = useCallback(() => start('ruby', () => rt.installRubyGems()), [start]);
  const installJsDeps = useCallback(
    (workingDir) => start('js', () => rt.installJsDeps(workingDir)),
    [start],
  );

  return {runtimes, op, log, refresh, installRubyGems, installJsDeps};
}
