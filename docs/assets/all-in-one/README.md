# All-in-One screenshots

PNGs referenced by [`ALL-IN-ONE.md`](../../../ALL-IN-ONE.md) and the repository
README. Each is the app's page at 1280×800 CSS pixels, dark theme, against an
Android emulator.

| File                       | Shows                                               | How to reach it                                                    |
| -------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| `start-page.png`           | Session builder with the **Local server** target    | Rail → **Session** → **Local server** tab, a saved capability set |
| `server.png`               | Local server with its log, Drivers & Plugins catalog | Rail → **Server**, after starting the server there               |
| `inspector.png`            | Live session, Source tab                            | Start a session                                                    |
| `recorder.png`             | Recorder with **Start Recording**                   | Session → **Recorder** tab                                         |
| `raw-command.png`          | Raw Command after sending the default request       | Session → **Raw Command** tab → **Send request**                   |
| `tests.png`                | Tests area after a passing run                      | Rail → **Tests**, open a folder, **Run all tests**                 |
| `tests-during-session.png` | Tests area while a session is open                  | Rail → **Tests** with a session open                               |
| `tests-environment.png`    | Environment table                                   | Rail → **Tests** → **Environment**                                 |

## Regenerating

The images were captured from the page itself through the Chrome DevTools
Protocol, so they don't include the window frame: launch the app with
`--remote-debugging-port=9223`, override the viewport to 1280×800
(`Emulation.setDeviceMetricsOverride`), navigate, wait for tab animations to
finish, then `Page.captureScreenshot`. Keep the override, navigation and capture
on one DevTools connection, since the override ends with the connection.

To capture the whole window instead (with its frame), navigate the app and run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/capture-screenshot.ps1 -Name server
```

Use neutral demo data: a test folder such as `C:\demo-tests`, no personal paths.
