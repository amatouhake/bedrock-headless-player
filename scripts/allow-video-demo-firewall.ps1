#Requires -RunAsAdministrator
param(
    [string]$LanSubnet = "192.168.1.0/24",
    [string]$ListenAddress,
    [switch]$Remove
)

$ErrorActionPreference = "Stop"

$rules = @(
    @{ Name = "OwnerBotBDS-TCP"; Display = "OwnerBot BDS NetherNet TCP"; Protocol = "TCP"; Ports = "19261" },
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
$portProxyArguments = @(
    "v4tov4",
    "listenaddress=$ListenAddress",
    "listenport=19261",
    "protocol=tcp"
)

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

    if (-not (Get-NetFirewallRule -DisplayName $rule.Display -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule `
            -DisplayName $rule.Display `
            -Direction Inbound `
            -Action Allow `
            -Protocol $rule.Protocol `
            -LocalPort $rule.Ports `
            -RemoteAddress $LanSubnet `
            -Profile Any `
            -ErrorAction Stop | Out-Null
    }

    if (-not (Get-NetFirewallHyperVRule -Name $rule.Name -ErrorAction SilentlyContinue)) {
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
}

if ($Remove) {
    & $netsh interface portproxy delete @portProxyArguments | Out-Null
    Write-Host "Removed OwnerBot BDS firewall rules."
} else {
    # In WSL mirrored mode, Windows localhost forwarding works while connecting
    # to the host's own LAN address can time out. Minecraft needs a non-loopback
    # address for the NetherNet signaling request, so proxy only that TCP port
    # back to the working localhost endpoint. WebRTC remains direct over UDP.
    & $netsh interface portproxy delete @portProxyArguments | Out-Null
    & $netsh interface portproxy add @portProxyArguments connectaddress=127.0.0.1 connectport=19261 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create the TCP 19261 portproxy for $ListenAddress."
    }

    foreach ($rule in $rules) {
        if (-not (Get-NetFirewallRule -DisplayName $rule.Display -ErrorAction SilentlyContinue)) {
            throw "Windows firewall rule '$($rule.Display)' is missing after creation."
        }
        if (-not (Get-NetFirewallHyperVRule -Name $rule.Name -ErrorAction SilentlyContinue)) {
            throw "Hyper-V firewall rule '$($rule.Name)' is missing after creation."
        }
    }

    $portProxyListener = Get-NetTCPConnection `
        -State Listen `
        -LocalAddress $ListenAddress `
        -LocalPort 19261 `
        -ErrorAction SilentlyContinue
    if (-not $portProxyListener) {
        throw "TCP portproxy was configured but is not listening on ${ListenAddress}:19261."
    }

    Write-Host "Allowed BDS TCP 19261 and UDP 20000-20100 from $LanSubnet."
    Write-Host "WSL Hyper-V VM creator ID: $wslCreatorId"
    Write-Host "Forwarding ${ListenAddress}:19261 to the WSL localhost signaling endpoint."
}
