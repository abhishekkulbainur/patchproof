# Starts the PatchProof UI on http://localhost:5173 (proxies /api to :8000)
Set-Location (Join-Path $PSScriptRoot "frontend")
npm run dev
