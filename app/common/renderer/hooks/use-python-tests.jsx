import {useCallback, useEffect, useRef, useState} from 'react';

// Renderer-side counterpart to python-tests.js. Manages a chosen working
// directory, its .py files, and pytest runs. The streamed pytest output rides
// the shared 'process:output' channel; the structured pass/fail summary arrives
// separately on 'python:result' once the JUnit report is parsed.

const py = window.electronIPC?.pythonTests;
const runner = window.electronIPC?.runner;

export function usePythonTests() {
  const [workingDir, setWorkingDir] = useState(null);
  const [files, setFiles] = useState([]);
  const [run, setRun] = useState(null); // {status: 'running'|'done'|'error', code?, reason?}
  const [runLog, setRunLog] = useState([]); // [{stream, chunk}]
  const [result, setResult] = useState(null); // {totals, tests} | null
  const runIdRef = useRef(null);

  const pickDir = useCallback(async () => {
    const r = await py.pickWorkingDir();
    if (r.canceled) {
      return null;
    }
    setWorkingDir(r.path);
    setFiles(await py.listTests(r.path));
    return r.path;
  }, []);

  const refreshFiles = useCallback(async () => {
    if (workingDir) {
      setFiles(await py.listTests(workingDir));
    }
  }, [workingDir]);

  const readFile = useCallback((rel) => py.readFile(workingDir, rel), [workingDir]);
  const saveFile = useCallback((rel, content) => py.saveFile(workingDir, rel, content), [workingDir]);

  // streamed pytest output + coarse run status
  useEffect(() => {
    if (!runner) {
      return undefined;
    }
    const offOut = runner.onOutput((d) => {
      if (d.runId === runIdRef.current) {
        setRunLog((prev) => [...prev, {stream: d.stream, chunk: d.chunk}]);
      }
    });
    const offExit = runner.onExit((d) => {
      if (d.runId === runIdRef.current) {
        setRun((r) => (r ? {...r, status: d.error || d.code !== 0 ? 'error' : 'done', code: d.code} : r));
      }
    });
    return () => {
      offOut?.();
      offExit?.();
    };
  }, []);

  // structured result (parsed JUnit summary)
  useEffect(() => {
    if (!py?.onResult) {
      return undefined;
    }
    const off = py.onResult((d) => {
      if (d.runId === runIdRef.current) {
        setResult(d.summary);
      }
    });
    return () => off?.();
  }, []);

  /**
   * @param {{paths?: string[], keyword?: string|null}} [opts]
   *   paths: cwd-relative test files/dirs (empty = whole working dir)
   *   keyword: pytest -k expression
   */
  const runTests = useCallback(
    async ({paths = [], keyword = null} = {}) => {
      if (!workingDir) {
        throw new Error('Pick a working directory first.');
      }
      setRunLog([]);
      setResult(null);
      const res = await py.run({workingDir, paths, keyword});
      if (res?.status === 'started') {
        runIdRef.current = res.runId;
        setRun({status: 'running'});
      } else if (res?.status === 'env_not_ready') {
        setRun({status: 'error', reason: 'env_not_ready'});
      }
      return res;
    },
    [workingDir],
  );

  return {workingDir, files, run, runLog, result, pickDir, refreshFiles, readFile, saveFile, runTests};
}
