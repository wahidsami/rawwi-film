# RawwiFilm - Start full stack (Supabase, Edge Functions, Web, Worker)
# Run from repo root: .\start-all.ps1
# Optional: .\start-all.ps1 -Reset   (wipes local Supabase state: Auth users, DB data)

param(
    [switch]$Reset  # Use when you want to wipe local state (stop --no-backup + container cleanup)
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
if (-not $ProjectRoot) { $ProjectRoot = Get-Location.Path }

Set-Location $ProjectRoot

if ($Reset) {
    Write-Host "=== RawwiFilm - RESET mode (will wipe local Supabase state) ===" -ForegroundColor Magenta
} else {
    Write-Host "=== RawwiFilm - Starting all services (state preserved) ===" -ForegroundColor Cyan
}
Write-Host "Project root: $ProjectRoot`n" -ForegroundColor Gray

# --- Supabase: start only when needed, or full reset when -Reset ---
if ($Reset) {
    Write-Host "[1/5] Resetting Supabase (stop + cleanup + start)..." -ForegroundColor Yellow
    supabase stop --no-backup 2>$null
    $supabaseContainers = docker ps -a --filter "name=supabase_" --format "{{.Names}}" 2>$null
    if ($supabaseContainers) {
        Write-Host "    Removing leftover containers..." -ForegroundColor Gray
        $supabaseContainers | ForEach-Object { docker rm -f $_ 2>$null }
    }
    supabase start -x vector
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    Supabase start failed. Fix errors and run again." -ForegroundColor Red
        exit 1
    }
    Write-Host "    Supabase reset and started (fresh state). Vector excluded (not used by this project)." -ForegroundColor Green
} else {
    Write-Host "[1/5] Checking Supabase..." -ForegroundColor Yellow
    $statusOutput = supabase status 2>&1
    $statusExit = $LASTEXITCODE
    # If already running, status typically succeeds and shows API URL
    if ($statusExit -eq 0 -and ($statusOutput -match "API URL|localhost|127\.0\.0\.1")) {
        Write-Host "    Supabase already running (DB/Auth state preserved)." -ForegroundColor Green
    } else {
        Write-Host "    Starting Supabase local (vector excluded)..." -ForegroundColor Gray
        supabase start -x vector
        if ($LASTEXITCODE -ne 0) {
            Write-Host "    Supabase start failed. If you see 'name already in use', run: .\start-all.ps1 -Reset" -ForegroundColor Red
            exit 1
        }
        Write-Host "    Supabase is up." -ForegroundColor Green
    }
}

# 2) Start Edge Functions in a new window (--no-verify-jwt so OPTIONS preflight reaches our code and CORS works from browser)
Write-Host "`n[2/5] Starting Edge Functions (new window)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$ProjectRoot'; Write-Host 'Edge Functions' -ForegroundColor Cyan; supabase functions serve --no-verify-jwt"
)
Write-Host "    Edge Functions window opened." -ForegroundColor Green

# 3) Start Web app in a new window
Write-Host "`n[3/5] Starting Web app (new window)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$ProjectRoot'; Write-Host 'Web (Vite)' -ForegroundColor Cyan; pnpm dev:web"
)
Write-Host "    Web app window opened." -ForegroundColor Green

# 4) Start Worker in a new window
Write-Host "`n[4/5] Starting Worker (new window)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$ProjectRoot'; Write-Host 'Raawi Worker' -ForegroundColor Cyan; pnpm worker:dev"
)
Write-Host "    Worker window opened." -ForegroundColor Green

# 5) Done
Write-Host "`n[5/5] Done." -ForegroundColor Green
Write-Host "`n=== All services started ===" -ForegroundColor Cyan
Write-Host "  - Supabase:       running (Auth/DB state preserved unless you used -Reset)" -ForegroundColor Gray
Write-Host "  - Edge Functions: http://127.0.0.1:54321/functions/v1 (separate window)" -ForegroundColor Gray
Write-Host "  - Web:            check Vite output for local URL (e.g. http://localhost:5173)" -ForegroundColor Gray
Write-Host "  - Worker:        polling for jobs (separate window)" -ForegroundColor Gray
Write-Host "`nTo fully reset local state (wipe users/data): .\start-all.ps1 -Reset`n" -ForegroundColor Gray
