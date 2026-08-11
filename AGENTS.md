# AGENTS.md — Orientation for AI agents working on this repo

Read this first. It explains **what this project is, how the app is architected,
what we added on top of upstream, how to build/verify, and the non-obvious
gotchas** so you can be productive without re-deriving everything. If you change
behavior, keep this file and [ALL-IN-ONE.md](ALL-IN-ONE.md) / [CHANGELOG.all-in-one.md](CHANGELOG.all-in-one.md) in sync.

---

## 1. What this repo is

This is **`emmalegrottaglie/appium-inspector-allinone`** — a fork of
[`appium/appium-inspector`](https://github.com/appium/appium-inspector) extended
into a **self-contained "all-in-one" desktop app**. On top of the normal
Inspector (capability builder, live session inspector, source tree, gestures,
recorder), we added the ability to, from the GUI:

1. Run a **bundled Appium server** (Appium ships *inside* the app).
2. **Manage drivers & plugins** (install/update/uninstall/doctor).
3. **Author & run tests** — Python/pytest (full in-app editor), plus Robot
   Framework, Ruby, and JavaScript/WebdriverIO via detected system toolchains.
4. Fire **raw WebDriver commands** (Postman-style).
5. Record a robust **"Scroll to & tap"** step (emits `scrollIntoView`).

**Repo root:** `C:\AppiumInspectorProject` (the repo *is* this folder; run all
git/npm/build commands here). Sibling folders like `testssss/` are local test
scratch and are ignored via `.git/info/exclude` (not committed).

**Git remotes:** `origin` = the fork (push here); `upstream` =
`appium/appium-inspector` (pull updates from here — see §8).

---

## 2. Golden rules / conventions (match these)

- **Language is JavaScript, not TypeScript.** No type annotations/interfaces.
- **Stack:** Electron + `electron-vite` + React 19 (react-compiler) + Redux
  (`react-redux` + hand-written action/reducer modules) + antd 6.x. Icons from
  `@tabler/icons-react`. Component styles are CSS modules (`*.module.css`).
- **i18n:** `react-i18next`; wrap user-facing strings in `t('...')`. Missing keys
  fall back to the literal string, so English-string-as-key is fine.
- **lodash was removed upstream.** Do **not** reintroduce it. Use the helpers in
  `app/common/renderer/utils/common.js` (`debounce`, `isEmpty`, `omit`, etc.).
- **Security model is load-bearing — never weaken it** (see §7). Renderer sends
  *intent*; the main process builds commands from fixed templates; `shell:false`
  on spawns (except the vetted `.cmd` case in §9); values never start with `-`.
- **Do NOT edit `.github/workflows/*`** to fix fork CI. Those are upstream's;
  editing them causes merge conflicts on every upstream pull. Fork CI noise
  (e.g. Crowdin needing secrets) is handled by disabling Actions in the fork's
  GitHub Settings, not in code.
- **No shortcuts, no faking it — make it actually work.** Do not hardcode values
  to dodge a bug, stub/mock away real behavior, swallow errors to make a red
  state look green, disable validation or a lint/type check to get past it, leave
  a placeholder claiming success, or commit without building. If something
  doesn't work, find the real cause and fix it (or say plainly that it doesn't
  work and why). A build that "passes" because a check was removed is worse than
  an honest failure. When you hit a wall, prefer the correct fix even if it's
  more work — this codebase was debugged the hard way (see §9); keep it honest.
- **Use the installed tooling/skills — don't reinvent or eyeball it.** This repo
  is set up with agent skills; use them as the workflow rather than doing things
  by hand or by guess:
  - **`/code-review`** — the review skill. It is **user-invoked only** (an agent
    cannot call it via the Skill tool; it's reserved for the human typing
    `/code-review`). So: after a change, *ask the user to run `/code-review`* and
    then address what it finds. Do a careful manual self-review of your own diff
    regardless.
  - **`verify` / `run`** — launch the real app and confirm the change behaves,
    instead of assuming it works from the code alone.
  - **`simplify`** — for reuse/cleanup passes after a feature lands.
  Prefer these over ad-hoc greps/manual reasoning when a skill covers the task.
- **Verify before you commit** (the standard loop): `npm run build:electron`
  passes → `npx eslint <changed files>` is error-free (warnings OK) →
  self-review the diff (and ask the user to run `/code-review`) → **`verify`/`run`**
  the app → then commit.
- **Only commit/push when asked.** Commit messages end with the
  `Co-Authored-By: Claude ...` trailer.

---

## 3. Directory layout that matters

```
app/electron/main/          # Node main process (full system access)
  main.js                   # app lifecycle; before-quit -> killAllProcesses()
  helpers.js                # setupIPCListeners(): registers ALL ipcMain handlers
  windows.js  menus.js  debug.js  updater.js  i18next.js
  # --- all-in-one main modules (added by this fork): ---
  process-runner.js         # generic child-process spawn + stream over IPC (the keystone)
  binary-resolver.js        # locate appium/python: configured | bundled | system
  appium-launch.js          # buildAppiumCommand(); isolated APPIUM_HOME (<userData>/appium-home)
  appium-server.js          # bundled server lifecycle (start/stop/status/readiness)
  appium-extensions.js      # hardened driver/plugin management
  python-env.js             # interpreter detect, venv, pip installs (+ Robot pkgs)
  python-tests.js           # working-dir IO + multi-language test RUN + JUnit/xUnit parse
  system-runtimes.js        # detect Ruby/Node/Oxygen; install their client deps
  code-export.js            # save recorder code to a file via native Save dialog
app/electron/preload/
  preload.mjs               # window.electronIPC = { ... }  (one flat object; direct assignment)
app/common/renderer/        # React UI
  actions/SessionInspector.js   # redux thunks (applyClientMethod, findAndAssign, scrollToElement, ...)
  hooks/                    # use-*.jsx — one hook per all-in-one feature (see §5)
  components/
    SessionBuilder/         # the start screen (server config + our Local Server/Drivers/Tests tabs)
    SessionInspector/       # the live session UI (tabs incl. our Raw Command; scroll button)
  lib/client-frameworks/    # per-language code generators (python.js, ruby.js, js-wdio.js, robot.js, ...)
  lib/appium/inspector-driver.js  # wraps the WebDriver session; fetch/click/cache elements
  constants/                # session-builder.js, session-inspector.js (tab keys live here)
build/afterPack.cjs         # electron-builder hook: copies vendored appium into the package (§6)
resources/appium/           # vendored Appium server (build-time; gitignored)
```

---

## 4. Core architecture (how the all-in-one plumbing works)

Five principles, applied throughout:

1. **One process runner.** `process-runner.js` is the single way to spawn an
   external command and stream its output to the renderer. The Appium server,
   the extension CLI, pip, pytest, ruby, node, robot are *all just callers of
   it*. Key exports: `startProcess(sender, spec, hooks)` (streams
   `process:output`/`process:exit`), `collectProcess(spec)` (run-to-completion,
   captured output — for parsing `... --json`), `cancelProcess(runId)`,
   `killAllProcesses()`, `setupProcessIPC()`.
2. **Resolution is isolated.** `binary-resolver.js` is the only place that knows
   where a tool lives (user-configured path → bundled under `resourcesPath` →
   system PATH). Bundled-vs-system is a one-place change.
3. **Constrained IPC (security).** The renderer sends *intent* (e.g.
   `{type, name}`), never an executable or free-form args. The main process
   validates and builds every command from fixed templates. The one
   general-purpose "spawn anything" channel (`process:start`) is **dev-only**.
4. **Isolation.** Drivers/plugins install into an app-scoped `APPIUM_HOME`
   (`<userData>/appium-home`); Python deps into an app-scoped venv
   (`<userData>/python-env/venv`). Both under Electron `userData`.
5. **Two execution models kept separate.** The inspector session + the Raw
   Command panel share **one** live WebDriver session over HTTP. The test runner
   spawns pytest/robot/ruby/node which open their **own** session. Server/driver
   management touches the server *process*, not a session.

**Data flow (every feature follows this shape):**

```
React hook (renderer)
  └─ window.electronIPC.<namespace>.<method>()      ← preload.mjs (the bridge)
       └─ ipcMain.handle('<domain>:<action>', ...)  ← registered in helpers.js
            └─ feature module (main)                 ← validates intent, builds command
                 └─ process-runner.startProcess()    ← shell:false spawn
                      └─ 'process:output' / 'process:exit' stream back (filtered by runId)
```

**IPC registration:** every `setup*IPC()` is called inside
`setupIPCListeners()` in `helpers.js`. **Preload** exposes a single flat object
`window.electronIPC = { runner, appium, extensions, pythonEnv, pythonTests,
runtimes, codeExport, ... }`; each `onX(cb)` returns an unsubscribe function.
(Direct `window` assignment implies `contextIsolation` is off; if you ever enable
it, switch preload to `contextBridge.exposeInMainWorld`.)

---

## 5. Feature map (where each all-in-one feature lives)

| Feature | UI | Hook | Main module | IPC channels |
|---|---|---|---|---|
| **Local Server** | `SessionBuilder/LocalServerTab/LocalServer.jsx` | `use-appium-server.jsx` | `appium-server.js`, `appium-launch.js` | `appium:start/stop/getState`, `appium:status` |
| **Drivers & Plugins** | `SessionBuilder/ExtensionsTab/Extensions.jsx` | `use-appium-extensions.jsx` | `appium-extensions.js` | `extensions:list/install/update/uninstall/doctor` |
| **Tests (Py/Robot/Ruby/JS)** | `SessionBuilder/PythonTab/PythonPanel.jsx` | `use-python-env.jsx`, `use-python-tests.jsx`, `use-runtimes.jsx` | `python-env.js`, `python-tests.js`, `system-runtimes.js` | `python:*`, `runtimes:*`, result on `python:result` |
| **Raw Command** | `SessionInspector/RawCommandTab/RawCommand.jsx` | — (renderer-only `fetch`) | — | none |
| **Recorder "Save As"** | `SessionInspector/RecorderTab/RecorderTabCard.jsx` (button) + `Recorder.jsx` (`saveAs`) | — | `code-export.js` | `code:saveAs` |
| **"Scroll to & tap"** | `SessionInspector/SourceTab/SelectedElement/SelectedElementActions.jsx` | — (thunk) | — | reuses `applyClientMethod` |

Notes that bite if you forget them:
- **Inspector tabs live in `SessionInspectorTabs.jsx`** (upstream extracted them
  out of `SessionInspector.jsx`). Add inspector tabs there. Tab keys are in
  `constants/session-inspector.js` (`INSPECTOR_TABS`).
- **Recorder was split** into `Recorder.jsx` (builds code) + `RecorderTabCard.jsx`
  (header buttons/UI). The Save-As split-button is in `RecorderTabCard`'s
  `RecorderTabHeaderButtons`; `saveAs(fwId)` is defined in `Recorder.jsx` and
  threaded down.
- **Multi-language runner:** `python-tests.js` `runTests()` dispatches by file
  extension (`langOf()`): `.py`→pytest, `.robot`→`python -m robot --xunit`,
  `.rb`→`ruby`, `.js`→`node` (WebdriverIO) or `oxygen`. Python & Robot produce a
  parsed pass/fail summary (JUnit/xUnit → `fast-xml-parser`); Ruby/JS are
  exit-code only. Ruby/Node/Oxygen are **not bundled** — detected on PATH.
- **"Scroll to & tap"** (`scrollToElement` thunk in `actions/SessionInspector.js`)
  builds a `UiScrollable(...).scrollIntoView(<stable UiSelector>)`, finds it live
  (scrolls the device), then taps it through the normal `applyClientMethod`
  path so it records `findAndAssign(scrollIntoView) + click`. Android only.

---

## 6. Build / run / package

Run from repo root (`C:\AppiumInspectorProject`), PowerShell or Git Bash:

```bash
npm install                                          # deps (see §9 re: allowScripts)
npm install --prefix resources/appium appium@3.5.0   # vendor the bundled server (build-time)
npm run build:electron                               # build main+preload+renderer -> dist/
npx electron-builder build --dir --publish never     # portable app -> release/win-unpacked/
npm run pack:electron                                # installer (.exe) + zip (unsigned)
```

- **Bundled server:** `binary-resolver.js` expects
  `resources/appium/node_modules/appium/index.js`. It's launched with Electron's
  own Node via `ELECTRON_RUN_AS_NODE=1` + `process.execPath`.
- **`afterPack` hook is required for packaging.** electron-builder *strips*
  `node_modules` from `extraResources`, so the vendored server is copied into the
  packaged app by `build/afterPack.cjs` (plain `fs.cpSync`) instead. Don't switch
  back to `extraResources` for the server.
- **Python is never bundled** (Electron can't ship an interpreter). The app
  detects the user's Python and manages a venv.
- Builds/packages are **unsigned** → Windows SmartScreen warns on first run.
- To run the app manually with tools visible, launch with `ANDROID_HOME` and a
  PATH that includes Ruby/Node (see §9).

---

## 7. Security model (must be preserved)

- Renderer sends **intent**; MAIN builds every command from fixed templates.
  `shell:false` on spawns (the vetted `.cmd` exception uses fixed, non-user args).
- Strict validation: extension names/PyPI specs/paths matched against tight
  regexes and **may never start with `-`** (argument-injection guard). Test file
  paths are confined to the chosen working dir (path-traversal guard).
- The open `process:start` "spawn anything" IPC is **dev-only**.
- Extensions: official names install with no `--source`; unknown names / explicit
  sources require `allowThirdParty` (UI confirmation); only npm + https GitHub
  accepted; git/local refused; major updates require `unsafe:true`.
- Python: managed set (`Appium-Python-Client`, `pytest`, `robotframework*`)
  installs without prompt; anything else needs third-party confirmation. Working
  dir comes from a native dialog and is re-validated.
- Server binds `127.0.0.1`. `--allow-cors` (needed by Raw Command) and
  `--allow-insecure=*:session_discovery` (needed by Attach to Session) are safe
  **only on loopback**; the UI warns on a non-loopback host.

---

## 8. Fork-maintenance workflow (keeping up with upstream)

The owner wants to **stay current with upstream**. To pull updates:

```bash
git fetch upstream main
git rev-list --left-right --count upstream/main...HEAD   # behind | ahead
git merge --no-commit --no-ff upstream/main              # dry-run to see conflicts
git diff --name-only --diff-filter=U                     # list conflicts
```

- If conflicts touch files **we didn't change**, they auto-merge. Our overlap is
  small and predictable: `package.json`, `package-lock.json`, and whichever of
  our feature files upstream refactored.
- **Recurring conflict pattern:** upstream periodically **splits components into
  smaller files** (they've split Inspector, Recorder, Header, Commands, Gestures,
  Screenshot, Session Info). When that hits a file our feature lives in:
  `git checkout --theirs -- <file>` to take their refactored version, then
  **re-apply our small feature** into the new structure (e.g. re-add the Raw
  Command tab to the new `SessionInspectorTabs.jsx`, the Save-As button to the
  new `RecorderTabCard.jsx`).
- **`package.json` conflict:** keep our `fast-xml-parser` + `allowScripts`
  (`electron`/`esbuild`/`sharp`, unversioned) + take upstream's version bump and
  dep updates. **`package-lock.json`:** `git checkout --theirs` then run
  `npm install` to regenerate it against the merged `package.json`.
- After resolving: `npm install`, approve pending install scripts if needed (§9),
  `npm run build:electron` to **verify our features still compile against the
  bumped deps**, lint, then commit the merge and push. If the build can't be made
  to pass quickly, `git merge --abort` — never leave a broken tree.
- **Never resolve by discarding our features.** Confirm they survived:
  grep for `scrollToElement`, `afterPack`, `Local Server`, `Save test as a file`,
  `RAW_COMMAND` after any merge.

---

## 9. Known gotchas (each cost real debugging — don't relearn them)

- **`isDev` circular import.** `binary-resolver.js` computes `isDev` locally
  (`process.env.NODE_ENV === 'development'`) — it must NOT import it from
  `helpers.js`, which imports the appium modules (that import binary-resolver)
  before its own `isDev` is initialized → temporal-dead-zone crash at startup.
- **npm 11 blocks install scripts.** After any `npm install`, esbuild/sharp/
  electron install scripts may be "pending". `electron` needs its script (it
  downloads the binary). Approve with `npm approve-scripts electron` (etc.), or
  rely on the `allowScripts` block in `package.json`. Symptom if missed: the
  build can't find the electron binary.
- **Windows `.cmd` spawn (`EINVAL`).** Node 20+ throws *synchronously* when
  spawning a `.cmd` shim (`npm.cmd`/`gem.cmd`/`oxygen.cmd`) with `shell:false`.
  `startProcess` catches sync spawn failures, and those callers pass `shell:true`
  (fixed templates). `node`/`ruby`/`python` are real `.exe` → `shell:false`.
- **`ANDROID_HOME` must be a real OS env var** for Android sessions — Android
  Studio's internal "Path Variables" do **not** count. The bundled server (a
  child of the app) inherits the app's env, so the app must be launched with
  `ANDROID_HOME` set.
- **PATH is inherited at launch.** A running app can't see tools installed
  *after* it launched (Ruby/Node show "not found"). Relaunch the app; runtime
  detection re-runs on mount.
- **`session_discovery` scope.** Appium 3 requires
  `--allow-insecure=*:session_discovery` (the `*:` scope) — a bare feature name
  is rejected and the server exits 1.
- **Recorded locators are brittle.** Coordinate swipes + `.instance(N)` don't
  survive a new session. Prefer text/id locators and the **Scroll to & tap**
  action (emits `scrollIntoView`). This is test-authoring, not a tool bug.
- **Port 4723 collisions.** Don't leave stray Appium servers (or diagnostic
  servers you started) bound to 4723 — the managed server will fail to bind and
  exit 1 with an empty log.

---

## 10. Verification checklist (before declaring done)

- [ ] `npm run build:electron` passes.
- [ ] `npx eslint <changed files>` has **0 errors** (warnings OK).
- [ ] Feature strings present in the built bundle (`dist/renderer/assets/*.js`):
      `Raw Command`, `Save test as a file`, `scrollIntoView`, `Languages & runtimes`.
- [ ] After an upstream merge: `git rev-list --left-right --count upstream/main...HEAD`
      shows `0` behind; our features grep-confirmed present.
- [ ] (If packaging) `release/win-unpacked/resources/appium/node_modules/appium/index.js`
      exists — proves the `afterPack` hook copied the vendored server.

---

## 11. More detail

- [ALL-IN-ONE.md](ALL-IN-ONE.md) — full per-feature reference, architecture,
  build, security, screenshots, troubleshooting.
- [CHANGELOG.all-in-one.md](CHANGELOG.all-in-one.md) — chronological list of what
  this fork added/changed/fixed relative to upstream.
