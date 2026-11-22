# Changelog — All-in-One fork

Changes in this fork relative to upstream `appium/appium-inspector`. Full detail
in [ALL-IN-ONE.md](ALL-IN-ONE.md).

## [Unreleased] — All-in-One

### Added

- **Tests tab redesigned for readability.** The tab now has **Environment** and
  **Tests** sub-tabs (setup lives in its own place), and the Tests view is a
  **two-column layout** — file list + editor on the left, run controls + result +
  a large output pane on the right — so you no longer scroll up/down to run a test
  and read its output.
- **PASS / FAIL result badge for Ruby & JavaScript.** These languages produce no
  JUnit report, so runs now show a clear exit-code-based **PASSED** / **FAILED
  (exit N)** badge (alongside the existing per-test summary for Python/Robot).

- **Bundled Appium server control** (start screen → _Local Server_ tab). Start /
  stop an app-managed server with a status lifecycle (`stopped → starting →
running → stopping → error`), HTTP `/status` readiness polling, a streamed
  log, and a non-loopback CORS warning. Reports whether the server is `bundled`
  (vendored in the app) or found on the `system` PATH.
- **Driver & plugin management** (start screen → _Drivers & Plugins_ tab).
  List / install / update / uninstall / doctor Appium drivers and plugins into
  an app-isolated `APPIUM_HOME`, with a security gate: official names install
  directly; unknown names and explicit sources require confirmation; only npm +
  https GitHub sources are accepted; git/local are refused; major updates require
  an explicit opt-in.
- **Python test runner** (start screen → _Python Tests_ tab). Detect a system
  Python (≥ 3.9), create an app-scoped virtualenv, install `Appium-Python-Client`
  - `pytest`, pick a working directory, list `.py` files, run pytest with an
    optional `-k` filter, and view a parsed pass/fail summary plus per-test
    results. Streamed output throughout.
- **Recorder "Save As…"** (Recorder tab). A split-button that saves the recorded
  test to a file via a native Save dialog, in the currently-selected language —
  or any of the 8 supported frameworks (Python, Java JUnit4/5, .NET NUnit, JS
  WebdriverIO/Oxygen, Ruby, Robot) via its dropdown — with the correct file
  extension. Lets you go from a recording straight to a saved test (e.g. into the
  Python Tests working folder) instead of copy-pasting steps.
- **In-app test editor** (in the _Tests_ tab). Open/edit/create test files in the
  working directory, with one-click **Save** and **Save & run** (runs just that
  file). For Python, a **Format** split-button wraps recorded steps into a
  complete runnable test — it detects which imports the steps actually use
  (`AppiumBy`, `ActionChains`/`ActionBuilder`/`PointerInput`/`interaction`,
  `WebDriverWait`), adds a `def test_*` + `try/finally` setup/teardown, and offers
  an optional implicit-wait variant.
- **Multi-language test runners** (the _Tests_ tab, renamed from _Python Tests_).
  Beyond Python/pytest, the runner now executes **Robot Framework** (`.robot`, on
  the same managed venv via `robotframework-appiumlibrary`, parsed xUnit results),
  **Ruby** (`.rb` via a system Ruby + `appium_lib_core`), and **JavaScript**
  (`.js` via system Node + WebdriverIO, or the Oxygen CLI). A _Languages &
  runtimes_ card detects Ruby/Node/Oxygen on PATH and installs each language's
  client deps. Python & Robot give per-test results; Ruby & JS report by exit
  code. (`system-runtimes.js`, `use-runtimes.jsx`.)
- **"Scroll to & tap" recorder action** (Inspector → Source tab, Android). One
  click on a selected element scrolls a scrollable container until it's visible
  and taps it, recording a robust `UiScrollable(...).scrollIntoView(...)` locator
  (anchored on a stable content-desc / resource-id) instead of brittle
  coordinate swipes + `.instance(N)`.
- **Raw WebDriver command panel** (session inspector → _Raw Command_ tab). A
  Postman-style panel that sends GET/POST/DELETE requests straight to the
  server's WebDriver endpoints, riding the live session (`{sessionId}` expands).
- **Process-runner foundation** — a single main-process module that spawns child
  processes with `shell: false` and streams their output to the renderer over
  IPC. The server, extension CLI, pip, and pytest are all callers of it.
- **Binary resolver** — one place that locates `appium` / `python`
  (configured → bundled → system PATH).
- **`afterPack` packaging hook** ([`build/afterPack.cjs`](build/afterPack.cjs)) —
  copies the vendored Appium server into the packaged app's resources
  (works around electron-builder stripping `node_modules` from `extraResources`).
- New dependency: `fast-xml-parser` (parses pytest's JUnit report).
- Documentation: [ALL-IN-ONE.md](ALL-IN-ONE.md) + screenshot capture helper
  ([`scripts/capture-screenshot.ps1`](scripts/capture-screenshot.ps1)).

### Changed

- **New start page layout.** The all-in-one tools no longer share the session
  builder's tab row, where they inherited its server bar and Start Session footer.
  A left rail now switches, in workflow order, between **Server** (Local Server
  and Drivers & Plugins side by side, the log and driver list filling the window),
  **Session** (upstream's builder, unchanged) and **Tests**. A chip at the bottom of the rail shows
  the managed server's status and port on every page.
- **Server and Tests stay reachable during a session.** The rail stays on
  screen in the inspector, so a recorded test can be saved and run without
  quitting the session (the Tests area notes that a test's own session usually
  ends the inspector's on the same device). Save As in the Recorder offers
  **Open Tests**, and the Tests file list refreshes when the area is opened. The
  server log and a running test also survive opening and closing a session.
- **New documentation screenshots** for the README and ALL-IN-ONE.md, covering
  every area at 1280×800.
- **"Local server" session target.** The session builder's server tabs start
  with **Local server**, the app's own server. Start Session starts it when it
  isn't running and connects to the address it listens on, so recording no longer
  needs a trip to the Server area first. Its address is set once, in the Server
  area, and saved across launches; the tab shows it read-only with a link to
  change it. New desktop users start on this tab.
- **One Start/Stop server button** replaces the separate Start and Stop buttons.
- **Drivers & Plugins is a catalog:** Installed and Available lists, each entry
  with a one-line summary, one-click Install, "Update to x" (major updates
  marked), and Uninstall behind a confirmation. Installing from npm or GitHub moved
  behind "Install another driver from npm or GitHub…". Refused requests (an
  invalid name, an operation already running) now show in the output pane instead
  of failing silently.
- **Environment is a table:** one row per toolchain (Python, test environment,
  Robot Framework, Ruby, Node) with version, status and the one action that
  applies. Only a needed action is primary, so "Reinstall" no longer competes for
  attention, and the tab is marked only when setup is needed.
- **Tests:** with no folder open, the page shows one "Open test folder" action
  instead of empty run controls. The pytest `-k` field is labelled "Filter by
  name", and a disabled Run button says why.
- **Recorder:** the empty Recorder tab has its own **Start recording** button.
- **Raw Command** starts from a read-only `GET /session/{sessionId}/window/rect`
  instead of a `POST` that navigated the device.
- The managed server logs without ANSI colour codes (`--log-no-colors`).

- `helpers.js` now registers five constrained IPC groups (`process`, `appium`,
  `extensions`, `python` env + tests) inside `setupIPCListeners()`.
- `preload.mjs` exposes new `runner`, `appium`, `extensions`, `pythonEnv`, and
  `pythonTests` namespaces on `window.electronIPC`.
- `main.js` reaps all spawned child processes (incl. the server) on
  `before-quit`.
- `SessionBuilder` gained three desktop-only tabs; `SessionInspector` gained the
  Raw Command tab.
- `electron-builder.json` uses an `afterPack` hook instead of `extraResources`
  for the vendored server.
- Caught up with upstream (101 commits, to `0464e09c`). The Raw Command tab, the
  Recorder's Save As button (now with an `aria-label`, like upstream's new
  Recorder buttons) and its `saveAs` prop were re-applied to upstream's
  refactored `SessionInspectorTabs.jsx`, `RecorderTabCard.jsx` and `Recorder.jsx`.

### Fixed

- **Drivers & Plugins and the Local Server failed outside a packaged build.**
  `npm run preview:electron` and `electron .` looked for the bundled server in
  Electron's own resources folder, found none, and the system fallback failed with
  `spawn EINVAL`. The resources root is now keyed on `app.isPackaged`. The driver
  list also showed that error as "No extensions found"; it now shows the error
  with a Retry button, and lists installed drivers before checking for updates.

- **The bundled server failed on a cold start.** Readiness had a fixed 30 s
  limit, but the first start after a reboot (empty file cache, antivirus
  scanning every module) took 37 s with three drivers installed, against 2 s
  warm. The app killed a server that was still loading, and it ended up
  "stopped" with no clear error. The limit now applies only to silence: a
  start fails if the server prints nothing for 90 s without becoming ready, and
  then the status shows that reason as an error.
- **Source tab panels stopped filling the tab and could not be widened.** After
  switching to another inspector tab and back (or resizing while it was hidden),
  the App Source / Selected Element splitter kept panel sizes computed from the
  tab's height instead of its width, leaving blank space beside the Selected
  Element panel and wrong drag limits. The hidden tab no longer switches to the
  stacked layout, and the splitter is recreated when the layout changes, so it
  always measures along the right axis. Superseded by upstream's rewrite of the
  Source tab (appium/appium-inspector#3127, #3180), which measures the
  always-visible tabs container instead; the fork now uses upstream's
  `SourceTab.jsx`.
- **Generated JS/TS tests failed at the first `mobile:` command.** The
  WebdriverIO generator emitted `driver.executeScript("mobile: ...")` with a
  single argument, but WebdriverIO requires both parameters and rejects that call
  with `Wrong parameters applied for executeScript`. Argument-less scripts now
  emit an explicit empty args array. (Same fix applied to the Oxygen generator,
  which wraps WebdriverIO.) This only surfaced once the fork could actually *run*
  exported code — upstream never executes it.
- **A failing JS/TS test reported PASSED.** The generated boilerplate ended in
  `main().catch(console.log)`, which swallowed the error and let the process exit
  `0`, so the exit-code-based badge showed a green **PASSED** next to a stack
  trace. The wrapper now logs to stderr and sets a non-zero exit code, so the
  badge reads **FAILED**. The test body is also wrapped in `try/finally` around
  `driver.deleteSession()`, so a mid-test failure no longer strands the session
  and leaves the device parked on whatever screen it reached.
- **`.cmd` spawn crash (Node 20+ / Windows).** Spawning a `.cmd` shim
  (`npm`/`gem`/`oxygen`) with `shell:false` throws `EINVAL` synchronously, which
  was rejecting the whole runtime-detection `Promise.all` (so Ruby/Node showed as
  "not found" even when installed). `startProcess` now catches synchronous spawn
  failures, and `.cmd` invocations opt into `shell:true` (fixed command
  templates, so still injection-safe).
- Managed server starts with `--allow-insecure=*:session_discovery` (the `*:`
  scope is required by Appium 3 — a bare feature name is rejected) so the Attach
  to Session tab works and the server log no longer floods with
  `Potentially insecure feature 'session_discovery' has not been enabled`. Safe
  because the server is loopback-only.

- **Startup crash** `ReferenceError: Cannot access 'isDev' before
initialization`. `binary-resolver.js` imported `isDev` from `helpers.js`, but
  `helpers.js` imports the appium modules (which pull in `binary-resolver`)
  before its own `isDev` is initialized — a temporal-dead-zone error in the
  bundled main process. `binary-resolver.js` now computes `isDev` locally.

### Security

Fixes from a whole-repository security review (finding ids refer to that report):

- **Generated tests could run code taken from the app under test** (F1, F3,
  F6–F11). Recorded locators, typed text and server context names were pasted
  into generated code unescaped, or with `JSON.stringify`, which is not a Ruby
  or Robot escaper. Text shown by the app could become code that ran when the
  test was executed from the Tests panel. Every value is now escaped for its
  target language: single-quoted Ruby literals, escaped Robot cells, and
  line-terminator-safe string literals for Python/JS/Java/C#.
  Unsupported-locator comments quote the locator, so a newline cannot end the
  comment.
- **Sauce Labs credentials were sent over plain HTTP** (F4), to a host built from
  an unvalidated data-center string (F5). The ondemand endpoints now use HTTPS,
  and session files with a data center the Sauce tab doesn't offer are refused
  at import. The Sauce Connect proxy stays on plain HTTP unless its new SSL
  checkbox is ticked.
- **A crafted `?state=` link could send saved cloud credentials to another host**
  (F2, browser/plugin builds). URL state is now limited to capabilities and a
  local/remote server with its advanced options, and it replaces the saved
  server state instead of merging into it, so a link never inherits saved cloud
  credentials. Auto-start only runs when the link carries a state.
- **These three fixes now come from upstream.** They were reported to the
  maintainers and merged there; the upstream catch-up takes upstream's reviewed
  versions in place of this fork's earlier ones, which drops the fork's
  confirmation prompts for link auto-start and for remote Sauce Connect proxies.
- **IPC hardening** (defense in depth: the renderer still has Node integration,
  so these become a hard boundary once renderer isolation is enabled):
  - consent for third-party installs, major-version updates and non-loopback
    server binds now comes from native dialogs in the main process;
  - working directories must have been picked in the folder dialog;
  - `env:` settings (which pick spawned executables) are main-only, and only
    plain setting names are accepted, since keys are read as key paths;
  - `appium:start` accepts only a validated host/port/base path (IPv6 checked
    with `net.isIP`), and concurrent starts no longer spawn a second server;
  - `openLink` opens `https:` links only.
- Constrained IPC: the renderer sends intent only; the main process builds every
  command from fixed templates. `shell: false` on every spawn; values may never
  start with `-` (argument-injection guard).
- The general-purpose `process:start` "spawn anything" channel is **dev-only**.
- Drivers/plugins, Python packages, and the test working directory are all gated
  / validated as described in [ALL-IN-ONE.md §7](ALL-IN-ONE.md).
- The managed server stays on `127.0.0.1`; `--allow-cors` is safe only on
  loopback, and the UI warns otherwise.

### Notes

- Python is **not** bundled (Electron can't ship an interpreter cleanly); the app
  detects yours and manages a venv under `userData`.
- The unpacked build (`release/win-unpacked/`) is portable and needs no signing.
  The NSIS installer is unsigned (placeholder), so SmartScreen warns on first
  run — real distribution needs a code-signing certificate.
