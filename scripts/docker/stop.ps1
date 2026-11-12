[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Resolve-Path "$PSScriptRoot\..\..")
Write-Host 'Останавливаю FilmPrep…' -ForegroundColor Cyan
docker compose down
Write-Host 'Готово. База и видео сохранены — при следующем запуске всё на месте.' -ForegroundColor Green
