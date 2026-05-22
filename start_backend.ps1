# bgmscape backend startup script
# Adds anaconda DLL directory to PATH so sqlite3 loads correctly, then starts uvicorn.

$env:PATH = "C:\Users\kevin\anaconda3\Library\bin;" + $env:PATH
$env:PYTHONPATH = $PSScriptRoot

Set-Location $PSScriptRoot

Write-Host "Starting bgmscape backend at http://localhost:8000" -ForegroundColor Green
Write-Host "API docs: http://localhost:8000/docs" -ForegroundColor Cyan

& "$PSScriptRoot\.venv\Scripts\uvicorn.exe" backend.main:app --reload --host 0.0.0.0 --port 8000
