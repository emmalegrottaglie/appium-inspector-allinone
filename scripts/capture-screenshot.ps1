<#
.SYNOPSIS
  Capture the Appium Inspector window to a PNG for the All-in-One docs.

.DESCRIPTION
  Finds the running "Appium Inspector" window, brings it to the foreground,
  and saves a screenshot of just that window into docs/assets/all-in-one/.
  Run it once per panel after navigating the app to that tab.

.PARAMETER Name
  The output file base name (no extension). Use the doc slugs:
  local-server | drivers-plugins | python-tests | raw-command

.EXAMPLE
  # 1. Open the app, click the "Local Server" tab
  # 2. Run:
  powershell -ExecutionPolicy Bypass -File scripts/capture-screenshot.ps1 -Name local-server
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$Name
)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$proc = Get-Process -Name "Appium Inspector" -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1

if (-not $proc) {
  Write-Error "Appium Inspector window not found. Launch the app first."
  exit 1
}

$h = $proc.MainWindowHandle
[Win]::ShowWindow($h, 9) | Out-Null   # SW_RESTORE
[Win]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 600          # let it paint / come forward

$r = New-Object Win+RECT
[Win]::GetWindowRect($h, [ref]$r) | Out-Null
$w = $r.Right - $r.Left
$ht = $r.Bottom - $r.Top

$bmp = New-Object System.Drawing.Bitmap($w, $ht)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)

$outDir = Join-Path $PSScriptRoot "..\docs\assets\all-in-one"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
$out = Join-Path $outDir "$Name.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose(); $bmp.Dispose()
Write-Output "Saved $((Resolve-Path $out).Path)"
