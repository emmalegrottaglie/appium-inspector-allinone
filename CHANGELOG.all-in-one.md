# Changelog — All-in-One fork

Changes in this fork relative to upstream `appium/appium-inspector`. Full detail
in [ALL-IN-ONE.md](ALL-IN-ONE.md).

## [Unreleased] — All-in-One

### Added

- **Bundled Appium server control** (start screen → *Local Server* tab). Start /
  stop an app-managed server with a status lifecycle (`stopped → starting →
  running → stopping → error`), HTTP `/status` readiness polling, a streamed
  log, and a non-loopback CORS warning. Reports whether the server is `bundled`
  (vendored in the app) or found on the `system` PATH.
- **Driver & plugin management** (start screen → *Drivers & Plugins* tab).
  List / install / update / uninstall / doctor Appium drivers and plugins into
  an app-isolated `APPIUM_HOME`, with a security gate: official names install
  directly; unknown names and explicit sources require confirmation; only npm +
  https GitHub sources are accepted; git/local are refused; major updates require
  an explicit opt-in.
- **Python test runner** (start screen → *Python Tests* tab). Detect a system
  Python (≥ 3.9), create an app-scoped virtualenv, install `Appium-Python-Client`
  + `pytest`, pick a working directory, list `.py` files, run pytest with an
  optional `-k` filter, and view a parsed pass/fail summary plus per-test
  results. Streamed output throughout.
- **Recorder "Save As…"** (Recorder tab). A split-button that saves the recorded
  test to a file via a native Save dialog, in the currently-selected language —
  or any of the 8 supported frameworks (Python, Java JUnit4/5, .NET NUnit, JS
  WebdriverIO/Oxygen, Ruby, Robot) via its dropdown — with the correct file
  extension. Lets you go from a recording straight to a saved test (e.g. into the
  Python Tests working folder) instead of copy-pasting steps.
- **In-app test editor** (in the *Tests* tab). Open/edit/create test files in the
  working directory, with one-click **Save** and **Save & run** (runs just that
  file). For Python, a **Format** split-button wraps recorded steps into a
  complete runnable test — it detects which imports the steps actually use
  (`AppiumBy`, `ActionChains`/`ActionBuilder`/`PointerInput`/`interaction`,
  `WebDriverWait`), adds a `def test_*` + `try/finally` setup/teardown, and offers
  an optional implicit-wait variant.
- **Multi-language test runners** (the *Tests* tab, renamed from *Python Tests*).
  Beyond Python/pytest, the runner now executes **Robot Framework** (`.robot`, on
  the same managed venv via `robotframework-appiumlibrary`, parsed xUnit results),
  **Ruby** (`.rb` via a system Ruby + `appium_lib_core`), and **JavaScript**
  (`.js` via system Node + WebdriverIO, or the Oxygen CLI). A *Languages &
  runtimes* card detects Ruby/Node/Oxygen on PATH and installs each language's
  client deps. Python & Robot give per-test results; Ruby & JS report by exit
  code. (`system-runtimes.js`, `use-runtimes.jsx`.)
- **"Scroll to & tap" recorder action** (Inspector → Source tab, Android). One
  click on a selected element scrolls a scrollable container until it's visible
  and taps it, recording a robust `UiScrollable(...).scrollIntoView(...)` locator
  (anchored on a stable content-desc / resource-id) instead of brittle
  coordinate swipes + `.instance(N)`.
- **Raw WebDriver command panel** (session inspector → *Raw Command* tab). A
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
