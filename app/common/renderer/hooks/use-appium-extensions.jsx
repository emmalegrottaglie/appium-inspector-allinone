import {useCallback, useEffect, useRef, useState} from 'react';

// Renderer-side counterpart to appium-extensions.js. One instance manages one
// extension kind ('driver' or 'plugin'). Mutating ops stream their output over
// the shared 'process:output' channel (filtered to the op's runId) and refresh
// the list on completion. Third-party / unknown installs come back as
// `needs_confirmation` so the UI can require explicit consent before retrying.

const ext = window.electronIPC?.extensions;
const runner = window.electronIPC?.runner;

/**
 * @param {'driver'|'plugin'} type
 */
export function useAppiumExtensions(type) {
  const [items, setItems] = useState({}); // raw `list --json` map, keyed by name
  const [loading, setLoading] = useState(false);
  const [op, setOp] = useState(null); // {kind, name, status: 'running'|'done'|'error', runId}
  const [opLog, setOpLog] = useState([]); // [{stream, chunk}]
  const [confirm, setConfirm] = useState(null); // {kind, name, source?, type} | null
  const opRunId = useRef(null);

  const refresh = useCallback(
    async ({withUpdates = true} = {}) => {
      if (!ext) {
        return;
      }
      setLoading(true);
      try {
        const res = await ext.list(type, {installedOnly: false, withUpdates});
        setItems(res?.data ?? {});
      } finally {
        setLoading(false);
      }
    },
    [type],
  );

  useEffect(() => {
    // Intentional fetch-on-mount: load the driver/plugin list once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // stream the active op's output and finalize on exit
  useEffect(() => {
    if (!runner) {
      return undefined;
    }
    const offOut = runner.onOutput((d) => {
      if (d.runId && d.runId === opRunId.current) {
        setOpLog((prev) => [...prev, {stream: d.stream, chunk: d.chunk}]);
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

  // Interpret a main-process result: either a started op or a consent request.
  const handleResult = useCallback((res, meta) => {
    if (res?.status === 'started') {
      opRunId.current = res.runId;
      setOpLog([]);
      setOp({...meta, status: 'running', runId: res.runId});
      setConfirm(null);
    } else if (res?.status === 'needs_confirmation') {
      // kind: 'not_official' (unknown short-name) | 'third_party' (explicit source)
      setConfirm({kind: res.kind, name: res.name, source: res.source ?? 'npm', type});
    }
    return res;
  }, [type]);

  const install = useCallback(
    (opts) => ext.install({type, ...opts}).then((r) => handleResult(r, {kind: 'install', name: opts.name})),
    [type, handleResult],
  );
  const update = useCallback(
    (name, {unsafe = false} = {}) =>
      ext.update({type, name, unsafe}).then((r) => handleResult(r, {kind: 'update', name})),
    [type, handleResult],
  );
  const uninstall = useCallback(
    (name) => ext.uninstall({type, name}).then((r) => handleResult(r, {kind: 'uninstall', name})),
    [type, handleResult],
  );
  const doctor = useCallback(
    (name) => ext.doctor({type, name}).then((r) => handleResult(r, {kind: 'doctor', name})),
    [type, handleResult],
  );

  return {
    items,
    loading,
    op,
    opLog,
    confirm,
    clearConfirm: () => setConfirm(null),
    refresh,
    install,
    update,
    uninstall,
    doctor,
  };
}
