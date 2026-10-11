# One-time setup for Windows (PowerShell). Run from the repository root: .\setup.ps1
$ErrorActionPreference = "Stop"
Push-Location backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
Pop-Location
Push-Location frontend
npm install
Pop-Location
Write-Host "Setup complete. Start the API with .\start-backend.ps1 and the UI with .\start-frontend.ps1"
