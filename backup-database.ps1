$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
$backupFolder = "$env:USERPROFILE\Dropbox\renovo-crm-backups"
$backupFile = "$backupFolder\backup_$timestamp.dump"

New-Item -ItemType Directory -Force -Path $backupFolder | Out-Null

& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" "postgresql://postgres:UAmEGBImvXzITFsJBttrvObAuQTNXDEH@tokaido.proxy.rlwy.net:13936/railway" --format=custom --file="$backupFile"

Write-Output "Backup completed: $backupFile"
