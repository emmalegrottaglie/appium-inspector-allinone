import {useCallback, useEffect, useRef, useState} from 'react';

// Renderer-side counterpart to process-runner.js. Drives a single external
// process and surfaces its streamed output + lifecycle to a component.
// Generalize to multiple concurrent runs later if a feature needs it; one run
// at a time is plenty to prove the Step 0 pipeline end to end.

const runner = window.electronIPC?.runner;

/**
 * @typedef {'idle'|'running'|'done'|'error'} RunStatus
 */

export function useProcessRunner() {
  const [status, setStatus] = useState(/** @type {RunStatus} */ ('idle'));
  const [output, setOutput] = useState(/** @type {{stream: string, chunk: string}[]} */ ([]));
  const [exit, setExit] = useState(/** @type {{code: number|null, signal: string|null, error: string|null}|null} */ (null));
  const activeRunId = useRef(null);

  // Subscribe once; filter events by the run we currently care about.
  useEffect(() => {
    if (!runner) {
      return undefined;
    }
    const offOutput = runner.onOutput((data) => {
      if (data.runId !== activeRunId.current) {
        return;
      }
      setOutput((prev) => [...prev, {stream: data.stream, chunk: data.chunk}]);
    });
    const offExit = runner.onExit((data) => {
      if (data.runId !== activeRunId.current) {
        return;
      }
      setExit({code: data.code, signal: data.signal, error: data.error});
      setStatus(data.error || data.code !== 0 ? 'error' : 'done');
    });
    return () => {
      offOutput?.();
      offExit?.();
    };
  }, []);

  /**
   * Start a process. Resets output/exit and flips status to 'running'.
   * @param {{command: string, args?: string[], options?: object}} spec
   * @returns {Promise<string>} the runId
   */
  const run = useCallback(async (spec) => {
    if (!runner) {
      throw new Error('Process runner IPC unavailable (not running inside Electron?)');
    }
    setOutput([]);
    setExit(null);
    setStatus('running');
    const {runId} = await runner.start(spec);
    activeRunId.current = runId;
    return runId;
  }, []);

  const cancel = useCallback(() => {
    if (runner && activeRunId.current) {
      runner.cancel(activeRunId.current);
    }
  }, []);

  return {status, output, exit, run, cancel};
}
