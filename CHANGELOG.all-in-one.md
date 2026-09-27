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

### Fixed

- **Source tab panels stopped filling the tab and could not be widened.** After
  switching to another inspector tab and back (or resizing while it was hidden),
  the App Source / Selected Element splitter kept panel sizes computed from the
  tab's height instead of its width, leaving blank space beside the Selected
  Element panel and wrong drag limits. The hidden tab no longer switches to the
  stacked layout, and the splitter is recreated when the layout changes, so it
  always measures along the right axis. (Upstream code; worth offering upstream.)
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
  and only the offered data centers are accepted. A Sauce Connect proxy host
  other than this machine (plain HTTP, and settable from a session file) is
  confirmed before the credentials are sent to it.
- **A crafted `?state=` link could send saved cloud credentials to another host**
  (F2, browser/plugin builds). URL state is now limited to capabilities and a
  local/remote server, and auto-start always asks first: even a link that sets
  only capabilities would start a session on the selected server, which may be
  a cloud account.
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
