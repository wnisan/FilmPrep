$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Resolve-Path "$PSScriptRoot\..\..")

$port = if ($env:FILMPREP_PORT) { $env:FILMPREP_PORT } else { '8080' }
$url = "http://localhost:$port"

function Test-Docker {
    docker info *> $null
    return $LASTEXITCODE -eq 0
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host 'Docker не найден. Установите Docker Desktop: https://www.docker.com/products/docker-desktop/' -ForegroundColor Red
    exit 1
}

if (-not (Test-Docker)) {
    Write-Host 'Запускаю Docker Desktop…' -ForegroundColor Yellow
    $desktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (Test-Path $desktop) { Start-Process $desktop }
    $deadline = (Get-Date).AddMinutes(3)
    while (-not (Test-Docker)) {
        if ((Get-Date) -gt $deadline) {
            Write-Host 'Docker не запустился за 3 минуты. Откройте Docker Desktop вручную и повторите.' -ForegroundColor Red
            exit 1
        }
        Start-Sleep -Seconds 3
    }
}

Write-Host 'Собираю и запускаю FilmPrep (первый раз — несколько минут)…' -ForegroundColor Cyan
docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
    Write-Host 'docker compose завершился с ошибкой — смотрите вывод выше.' -ForegroundColor Red
    exit 1
}

Write-Host 'Жду, пока сайт ответит…'
$deadline = (Get-Date).AddMinutes(3)
$ready = $false
while ((Get-Date) -lt $deadline) {
    try {
        $r = Invoke-WebRequest "$url/api/v1/health" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 2
}

if ($ready) {
    Write-Host ''
    Write-Host "FilmPrep работает: $url" -ForegroundColor Green
    Write-Host 'Админ: admin@filmprep.local / admin12345'
    Write-Host 'Остановить: stop.bat   Логи: docker compose logs -f api'
    Start-Process $url
} else {
    Write-Host 'Сайт пока не отвечает. Логи API: docker compose logs -f api' -ForegroundColor Yellow
}
