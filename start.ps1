# start.ps1 — launch bgmscape backend + frontend
# Run from anywhere: .\start.ps1  (or double-click in Explorer)

$root = $PSScriptRoot

# ── Backend (reuses start_backend.ps1 which handles the Anaconda PATH fix) ──
Start-Process powershell -ArgumentList @(
    "-NoExit", "-NoLogo",
    "-File", "$root\start_backend.ps1"
) -WorkingDirectory $root

# Brief pause so the backend window appears first
Start-Sleep -Seconds 1

# ── Frontend ─────────────────────────────────────────────────────────────────
Start-Process powershell -ArgumentList @(
    "-NoExit", "-NoLogo",
    "-Command", "cd '$root\frontend'; Write-Host 'bgmscape frontend' -ForegroundColor Green; npm run dev"
) -WorkingDirectory "$root\frontend"

# ── Summary ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "bgmscape starting..." -ForegroundColor Cyan
Write-Host "  Backend  ->  http://localhost:8000" -ForegroundColor Blue
Write-Host "  Frontend ->  http://localhost:5173" -ForegroundColor Green
Write-Host ""
Write-Host "Two windows have opened, one per service." -ForegroundColor Gray
Write-Host "Close them (or Ctrl+C inside each) to stop." -ForegroundColor Gray
Write-Host ""

# ── Optional: Windows Terminal variant (uncomment if wt is installed) ────────
# wt --title "bgmscape" ``
#   new-tab --title "Backend"  powershell -NoExit -File "$root\start_backend.ps1" ``; ``
#   new-tab --title "Frontend" powershell -NoExit -Command "cd '$root\frontend'; npm run dev"
