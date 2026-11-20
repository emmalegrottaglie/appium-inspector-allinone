import {useCallback, useEffect, useRef, useState} from 'react';

// Renderer-side counterpart to appium-extensions.js. One instance manages one
// extension kind ('driver' or 'plugin'). Mutating ops stream their output over
// the shared 'process:output' channel (filtered to the op's runId) and refresh
// the list on completion. Third-party / unknown installs are confirmed by the
// user in a native dialog shown by the main process; declining returns
// `cancelled`.

const ext = window.electronIPC?.extensions;
const runner = window.electronIPC?.runner;

/**
 * @param {'driver'|'plugin'} type
 */
export function useAppiumExtensions(type) {
  const [items, setItems] = useState({}); // raw `list --json` map, keyed by name
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState(null); // why the list could not be loaded
  const [updateError, setUpdateError] = useState(null); // why the update check failed, over a loaded list
  const listed = useRef(false); // whether a list has loaded, so a failed update check isn't a failed list
  const [op, setOp] = useState(null); // {kind, name, status: 'running'|'done'|'error', runId}
  const [opLog, setOpLog] = useState([]); // [{stream, chunk}]
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
        listed.current = true;
        setListError(null);
        if (withUpdates) {
          setUpdateError(null);
        }
      } catch (err) {
        // Keep whatever list we had and say why it could not be refreshed, rather than
        // presenting a failed call as "nothing installed". When only the update check failed
        // (e.g. offline, npm unreachable), the list itself is fine, so say just that.
        const message = err?.message ?? String(err);
        if (withUpdates && listed.current) {
          setUpdateError(message);
        } else {
          setListError(message);
        }
      } finally {
        setLoading(false);
      }
    },
    [type],
  );

  useEffect(() => {
    // Intentional fetch-on-mount. The update check asks npm about every extension and can take
    // a while, so show the list from the local install first, then add update info.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh({withUpdates: false}).then(() => refresh());
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

  // Interpret a main-process result: a started op, or an install the user declined.
  const handleResult = useCallback((res, meta) => {
    if (res?.status === 'started') {
      opRunId.current = res.runId;
      setOpLog([]);
      setOp({...meta, status: 'running', runId: res.runId});
    } else if (res?.status === 'cancelled') {
      setOpLog([
        {
          stream: 'stdout',
          chunk: `${meta.kind} of ${meta.name} cancelled
`,
        },
      ]);
      setOp({...meta, status: 'cancelled'});
    }
    return res;
  }, []);

  // A request the main process refused (invalid name, op already running, ...) shows in the
  // op output like any other failure, instead of rejecting with nothing on screen
  const runOp = useCallback(
    (call, meta) =>
      call().then(
        (r) => handleResult(r, meta),
        (err) => {
          setOpLog([
            {
              stream: 'stderr',
              chunk: `${err?.message ?? String(err)}
`,
            },
          ]);
          setOp({...meta, status: 'error'});
          return null;
        },
      ),
    [handleResult],
  );
  const install = useCallback(
    (opts) => runOp(() => ext.install({type, ...opts}), {kind: 'install', name: opts.name}),
    [type, runOp],
  );
  const update = useCallback(
    (name, {unsafe = false} = {}) => runOp(() => ext.update({type, name, unsafe}), {kind: 'update', name}),
    [type, runOp],
  );
  const uninstall = useCallback(
    (name) => runOp(() => ext.uninstall({type, name}), {kind: 'uninstall', name}),
    [type, runOp],
  );
  const doctor = useCallback((name) => runOp(() => ext.doctor({type, name}), {kind: 'doctor', name}), [type, runOp]);

  return {
    items,
    loading,
    listError,
    updateError,
    op,
    opLog,
    refresh,
    install,
    update,
    uninstall,
    doctor,
  };
}
