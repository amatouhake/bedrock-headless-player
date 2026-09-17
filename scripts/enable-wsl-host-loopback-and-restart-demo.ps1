#Requires -RunAsAdministrator
param(
    [string]$Distribution = "Ubuntu",
    [string]$RepoPath = "/home/kenke/bedrock-fake-player-lab/bedrock-headless-player"
)

$ErrorActionPreference = "Stop"

$wsl = Join-Path $env:SystemRoot "System32\wsl.exe"
$configPath = Join-Path $env:USERPROFILE ".wslconfig"
$backupPath = "$configPath.ownerbot-backup"

if (Test-Path $configPath) {
    $content = [IO.File]::ReadAllText($configPath)
    if (-not (Test-Path $backupPath)) {
        Copy-Item -LiteralPath $configPath -Destination $backupPath
    }
} else {
    $content = "[wsl2]`r`nnetworkingMode=mirrored`r`n"
}

$content = $content -replace '(?im)^[ \t]*hostAddressLoopback[ \t]*=[^\r\n]*\r?\n?', ''
if ($content -match '(?im)^[ \t]*\[experimental\][ \t]*\r?$') {
    $content = $content -replace '(?im)^([ \t]*\[experimental\][ \t]*)\r?$', "`$1`r`nhostAddressLoopback=true"
} else {
    $content = $content.TrimEnd() + "`r`n`r`n[experimental]`r`nhostAddressLoopback=true`r`n"
}

[IO.File]::WriteAllText(
    $configPath,
    $content,
    [Text.UTF8Encoding]::new($false)
)

Write-Host "Enabled hostAddressLoopback in $configPath."
Write-Host "Stopping the demo cleanly before restarting WSL..."
& $wsl -d $Distribution --cd $RepoPath ./scripts/stop-video-demo.sh
if ($LASTEXITCODE -ne 0) {
    throw "The demo stop command failed with exit code $LASTEXITCODE."
}

& $wsl --shutdown
if ($LASTEXITCODE -ne 0) {
    throw "wsl --shutdown failed with exit code $LASTEXITCODE."
}

Start-Sleep -Seconds 4

Write-Host "Starting BDS and ten bots with host-address loopback enabled..."
& $wsl -d $Distribution --cd $RepoPath ./scripts/start-video-demo.sh
if ($LASTEXITCODE -ne 0) {
    throw "The demo start command failed with exit code $LASTEXITCODE."
}

& (Join-Path $PSScriptRoot "allow-video-demo-firewall.ps1")

$status = Invoke-RestMethod `
    -Uri "http://192.168.1.5:19261/v1/join" `
    -Method Get `
    -TimeoutSec 10

Write-Host "Direct host-address signaling works: protocol $($status.protocol), players $($status.players)."
Write-Host "Connect Minecraft to 192.168.1.5 port 19261."
