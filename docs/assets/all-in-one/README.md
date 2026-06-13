# All-in-One screenshots

PNGs referenced by [`ALL-IN-ONE.md`](../../../ALL-IN-ONE.md). Expected files:

| File | Panel | How to reach it |
|---|---|---|
| `local-server.png` | Local Server | Start screen → **Local Server** tab |
| `drivers-plugins.png` | Drivers & Plugins | Start screen → **Drivers & Plugins** tab |
| `python-tests.png` | Python Tests | Start screen → **Python Tests** tab |
| `raw-command.png` | Raw Command | Inside a live session → **Raw Command** tab |

Generate each with the capture helper (navigate the app to the tab first):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/capture-screenshot.ps1 -Name local-server
```
