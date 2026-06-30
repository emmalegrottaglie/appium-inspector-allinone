import {useCallback, useEffect, useRef, useState} from 'react';

// Renderer-side counterpart to python-env.js. Exposes environment status and a
// one-call `setup()` that chains venv creation -> dependency install, streaming
// both phases into one log. Each phase is still a distinct runId under the
// hood; refs track the chain across the async exit events.

const env = window.electronIPC?.pythonEnv;
const runner = window.electronIPC?.runner;

export function usePythonEnv() {
  const [status, setStatus] = useState(null); // result of python:status
  const [phase, setPhase] = useState('idle'); // idle | venv | install | done | error
  const [log, setLog] = useState([]); // [{stream, chunk}]
  const [confirm, setConfirm] = useState(null); // {package} when a 3rd-party pip install needs consent
  const runIdRef = useRef(null);
  const stepRef = useRef(null); // 'venv' | 'install' | null

  const refresh = useCallback(async () => {
    if (env) {
      setStatus(await env.status());
    }
  }, []);

  useEffect(() => {
    // Intentional fetch-on-mount: hydrate the initial Python env status once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const startInstall = useCallback(
    async (opts = {}) => {
      const res = await env.installDeps(opts);
      if (res?.status === 'started') {
        runIdRef.current = res.runId;
        stepRef.current = 'install';
        setPhase('install');
      } else if (res?.status === 'needs_confirmation') {
        setConfirm({package: res.package});
        setPhase('idle');
      } else if (res?.status === 'venv_missing') {
        setPhase('error');
      }
      return res;
    },
    [],
  );

  // stream the active phase's output; advance/finish on exit
  useEffect(() => {
    if (!runner) {
      return undefined;
    }
    const offOut = runner.onOutput((d) => {
      if (d.runId === runIdRef.current) {
        setLog((prev) => [...prev, {stream: d.stream, chunk: d.chunk}]);
      }
    });
    const offExit = runner.onExit((d) => {
      if (d.runId !== runIdRef.current) {
        return;
      }
      const failed = d.error || d.code !== 0;
      if (failed) {
        setPhase('error');
        stepRef.current = null;
        refresh();
      } else if (stepRef.current === 'venv') {
        startInstall({}); // venv done -> install required deps
      } else {
        stepRef.current = null;
        setPhase('done');
        refresh();
      }
    });
    return () => {
      offOut?.();
      offExit?.();
    };
  }, [refresh, startInstall]);

  // Full setup: detect -> (create venv if needed) -> install required deps.
  const setup = useCallback(async () => {
    setLog([]);
    setConfirm(null);
    const st = await env.status();
    setStatus(st);
    if (!st.python.found || !st.python.meetsMinimum) {
      setPhase('error');
      return st;
    }
    if (st.venv) {
      return startInstall({});
    }
    const res = await env.createVenv();
    if (res?.status === 'started') {
      runIdRef.current = res.runId;
      stepRef.current = 'venv';
      setPhase('venv');
    }
    return res;
  }, [startInstall]);

  // Install an extra (third-party) package after explicit confirmation.
  const installPackage = useCallback(
    (pkg) => {
      setLog([]);
      return startInstall({packages: [pkg], allowThirdParty: true});
    },
    [startInstall],
  );

  // Add Robot Framework support to the venv (managed packages — no confirmation).
  const installRobot = useCallback(() => {
    setLog([]);
    return startInstall({packages: ['robotframework', 'robotframework-appiumlibrary']});
  }, [startInstall]);

  return {
    status,
    phase,
    log,
    confirm,
    clearConfirm: () => setConfirm(null),
    refresh,
    setup,
    installPackage,
    installRobot,
  };
}
