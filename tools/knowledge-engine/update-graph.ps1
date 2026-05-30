# Knowledge Graph Auto-Update Script for PixelPlayer (Windows Powershell)
# Integrates with git pre-commit/post-merge hooks

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$ScanScript = Join-Path $ScriptDir "scan-project.mjs"

if (Test-Path $ScanScript) {
    node $ScanScript
} else {
    Write-Error "Error: scan-project.mjs not found in $ScriptDir"
    exit 1
}

Write-Host "🎉 Codebase Knowledge Graph updated successfully!" -ForegroundColor Green
