# Run this from PowerShell while inside the backend folder.
# It reads DATABASE_URL from .env automatically - nothing to copy/paste.

$envFile = ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "ERROR: Could not find .env in this folder. Make sure you are inside the backend folder first (cd C:\Users\LEO\Downloads\renovo-crm-system\backend)." -ForegroundColor Red
    exit
}

$line = Get-Content $envFile | Where-Object { $_ -match "^DATABASE_URL=" }
if (-not $line) {
    Write-Host "ERROR: Could not find a DATABASE_URL line in .env" -ForegroundColor Red
    exit
}

$dbUrl = $line -replace "^DATABASE_URL=", ""
$dbUrl = $dbUrl.Trim('"').Trim("'")

Write-Host "Found DATABASE_URL, starting migrations..." -ForegroundColor Cyan

$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
if (-not (Test-Path $psql)) {
    Write-Host "psql.exe not found at that path, trying PATH instead..." -ForegroundColor Yellow
    $psql = "psql"
}

$migrations = @(
    "prisma\migrations\022_add_pdf_email_system.sql",
    "prisma\migrations\023_stabilization_fixes.sql",
    "prisma\migrations\024_add_operational_settings.sql",
    "prisma\migrations\025_add_estimate_action_center.sql"
)

foreach ($m in $migrations) {
    Write-Host ""
    Write-Host "=== Running $m ===" -ForegroundColor Cyan
    & $psql $dbUrl -f $m
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARNING: $m may have failed. Check the output above before continuing." -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "All 4 migrations attempted. Scroll up to check each one finished with COMMIT and no red errors." -ForegroundColor Green
