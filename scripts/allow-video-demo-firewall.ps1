#Requires -RunAsAdministrator
param(
    [string]$LanSubnet = "192.168.1.0/24",
    [string]$ListenAddress,
    [switch]$Remove
)

$ErrorActionPreference = "Stop"

$bdsPort = 19261
$proxyPort = 19263

$rules = @(
    @{ Name = "OwnerBotBDS-TCP"; Display = "OwnerBot BDS NetherNet TCP"; Protocol = "TCP"; Ports = "$proxyPort" },
    @{ Name = "OwnerBotBDS-UDP"; Display = "OwnerBot BDS NetherNet UDP"; Protocol = "UDP"; Ports = "20000-20100" }
)

if (-not $ListenAddress) {
    $lanAddresses = @(
        Get-NetIPConfiguration |
            Where-Object { $_.NetAdapter.Status -eq "Up" -and $_.IPv4DefaultGateway } |
            ForEach-Object { $_.IPv4Address.IPAddress } |
            Where-Object { $_ -and $_ -notlike "169.254.*" } |
            Select-Object -Unique
    )

    if ($lanAddresses.Count -ne 1) {
        throw "Expected exactly one active LAN IPv4 address, found $($lanAddresses.Count). Pass -ListenAddress explicitly."
    }

    $ListenAddress = $lanAddresses[0]
}

$netsh = Join-Path $env:SystemRoot "System32\netsh.exe"

if (-not $Remove) {
    $wslCreatorIds = @(
        Get-NetFirewallHyperVRule -PolicyStore ActiveStore |
            Where-Object { $_.DisplayName -like "WslCore Inbound*" } |
            Select-Object -ExpandProperty VMCreatorId -Unique
    )

    if ($wslCreatorIds.Count -ne 1) {
        throw "Expected exactly one WSL Hyper-V VM creator ID, found $($wslCreatorIds.Count)."
    }

    $wslCreatorId = $wslCreatorIds[0]
}

foreach ($rule in $rules) {
    if ($Remove) {
        Get-NetFirewallRule -DisplayName $rule.Display -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction Stop
        Get-NetFirewallHyperVRule -Name $rule.Name -ErrorAction SilentlyContinue | Remove-NetFirewallHyperVRule -ErrorAction Stop
        continue
    }

    # Recreate our narrowly named rules so rerunning the helper also reconciles
    # port or subnet changes from an earlier version.
    Get-NetFirewallRule -DisplayName $rule.Display -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction Stop
    New-NetFirewallRule `
        -DisplayName $rule.Display `
        -Direction Inbound `
        -Action Allow `
        -Protocol $rule.Protocol `
        -LocalPort $rule.Ports `
        -RemoteAddress $LanSubnet `
        -Profile Any `
        -ErrorAction Stop | Out-Null

    Get-NetFirewallHyperVRule -Name $rule.Name -ErrorAction SilentlyContinue | Remove-NetFirewallHyperVRule -ErrorAction Stop
    New-NetFirewallHyperVRule `
        -Name $rule.Name `
        -DisplayName $rule.Display `
        -Direction Inbound `
        -Action Allow `
        -Protocol $rule.Protocol `
        -LocalPorts $rule.Ports `
        -RemoteAddresses $LanSubnet `
        -VMCreatorId $wslCreatorId `
        -ErrorAction Stop | Out-Null
}

if ($Remove) {
    foreach ($listenPort in @($bdsPort, $proxyPort)) {
        & $netsh interface portproxy delete v4tov4 listenaddress=$ListenAddress listenport=$listenPort protocol=tcp | Out-Null
    }
    Write-Host "Removed OwnerBot BDS firewall rules."
} else {
    # In WSL mirrored mode, Windows localhost forwarding works while connecting
    # to the host's own LAN address can time out. The WSL listener also reserves
    # its port in the shared namespace, so use a distinct Windows-side port and
    # proxy it to the working localhost endpoint. WebRTC remains direct over UDP.
    foreach ($listenPort in @($bdsPort, $proxyPort)) {
        & $netsh interface portproxy delete v4tov4 listenaddress=$ListenAddress listenport=$listenPort protocol=tcp | Out-Null
    }
    & $netsh interface portproxy add v4tov4 listenaddress=$ListenAddress listenport=$proxyPort protocol=tcp connectaddress=127.0.0.1 connectport=$bdsPort | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create the TCP $proxyPort portproxy for $ListenAddress."
    }

    foreach ($rule in $rules) {
        if (-not (Get-NetFirewallRule -DisplayName $rule.Display -ErrorAction SilentlyContinue)) {
            throw "Windows firewall rule '$($rule.Display)' is missing after creation."
        }
        if (-not (Get-NetFirewallHyperVRule -Name $rule.Name -ErrorAction SilentlyContinue)) {
            throw "Hyper-V firewall rule '$($rule.Name)' is missing after creation."
        }
    }

    $portProxyListener = $null
    for ($attempt = 0; $attempt -lt 20 -and -not $portProxyListener; $attempt++) {
        $portProxyListener = Get-NetTCPConnection `
            -State Listen `
            -LocalAddress $ListenAddress `
            -LocalPort $proxyPort `
            -ErrorAction SilentlyContinue
        if (-not $portProxyListener) {
            Start-Sleep -Milliseconds 100
        }
    }
    if (-not $portProxyListener) {
        throw "TCP portproxy was configured but is not listening on ${ListenAddress}:$proxyPort."
    }

    Write-Host "Allowed BDS signaling TCP $proxyPort and WebRTC UDP 20000-20100 from $LanSubnet."
    Write-Host "WSL Hyper-V VM creator ID: $wslCreatorId"
    Write-Host "Forwarding ${ListenAddress}:$proxyPort to 127.0.0.1:$bdsPort."
}
