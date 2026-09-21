param(
    [string]$EnvFile = ".env",
    [string]$OutputDirectory = "backups",
    [string]$ComposeProject = "finapp"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $EnvFile)) {
    throw "Environment file not found: $EnvFile"
}

$envValues = @{}
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([^#=\s]+)\s*=\s*(.*)\s*$') {
        $envValues[$matches[1]] = $matches[2].Trim('"')
    }
}
if (-not $envValues.POSTGRES_USER -or -not $envValues.POSTGRES_DB) {
    throw "EnvFile must define POSTGRES_USER and POSTGRES_DB."
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputPath = Join-Path $OutputDirectory "finapp-$timestamp.sql"

docker compose -p $ComposeProject --env-file $EnvFile -f docker-compose.prod.yml exec -T postgres `
    pg_dump --clean --if-exists --no-owner --no-privileges `
    -U $envValues.POSTGRES_USER -d $envValues.POSTGRES_DB > $outputPath

if ((Get-Item $outputPath).Length -eq 0) {
    Remove-Item $outputPath
    throw "Backup was empty."
}

Write-Output "Created PostgreSQL backup: $outputPath"
