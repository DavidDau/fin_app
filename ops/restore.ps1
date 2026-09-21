param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,
    [string]$EnvFile = ".env",
    [string]$ComposeProject = "finapp",
    [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $EnvFile)) {
    throw "Environment file not found: $EnvFile"
}
if (-not (Test-Path $BackupFile)) {
    throw "Backup file not found: $BackupFile"
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

Write-Warning "This replaces database objects contained in the selected backup."
if (-not $ConfirmRestore) {
    $confirmation = Read-Host "Type RESTORE to continue"
    if ($confirmation -cne "RESTORE") {
        throw "Restore cancelled."
    }
}

Get-Content -Raw $BackupFile | docker compose -p $ComposeProject --env-file $EnvFile -f docker-compose.prod.yml `
    exec -T postgres psql -v ON_ERROR_STOP=1 -U $envValues.POSTGRES_USER -d $envValues.POSTGRES_DB

Write-Output "Restore completed from: $BackupFile"
