#Requires -RunAsAdministrator
param(
    [string]$LanSubnet = "192.168.1.0/24",
    [switch]$Remove
)

$ErrorActionPreference = "Stop"

$rules = @(
    @{ Name = "OwnerBotBDS-TCP"; Display = "OwnerBot BDS NetherNet TCP"; Protocol = "TCP"; Ports = "19261" },
    @{ Name = "OwnerBotBDS-UDP"; Display = "OwnerBot BDS NetherNet UDP"; Protocol = "UDP"; Ports = "20000-20100" }
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
    Write-Host "Removed OwnerBot BDS firewall rules."
} else {
    foreach ($rule in $rules) {
        if (-not (Get-NetFirewallRule -DisplayName $rule.Display -ErrorAction SilentlyContinue)) {
            throw "Windows firewall rule '$($rule.Display)' is missing after creation."
        }
        if (-not (Get-NetFirewallHyperVRule -Name $rule.Name -ErrorAction SilentlyContinue)) {
            throw "Hyper-V firewall rule '$($rule.Name)' is missing after creation."
        }
    }

    Write-Host "Allowed BDS TCP 19261 and UDP 20000-20100 from $LanSubnet."
    Write-Host "WSL Hyper-V VM creator ID: $wslCreatorId"
}
