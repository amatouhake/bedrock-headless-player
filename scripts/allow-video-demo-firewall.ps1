#Requires -RunAsAdministrator
param(
    [string]$LanSubnet = "192.168.1.0/24",
    [switch]$Remove
)

$rules = @(
    @{ Name = "OwnerBotBDS-TCP"; Display = "OwnerBot BDS NetherNet TCP"; Protocol = "TCP"; Ports = "19261" },
    @{ Name = "OwnerBotBDS-UDP"; Display = "OwnerBot BDS NetherNet UDP"; Protocol = "UDP"; Ports = "20000-20100" }
)

foreach ($rule in $rules) {
    if ($Remove) {
        Get-NetFirewallRule -DisplayName $rule.Display -ErrorAction SilentlyContinue | Remove-NetFirewallRule
        Get-NetFirewallHyperVRule -Name $rule.Name -ErrorAction SilentlyContinue | Remove-NetFirewallHyperVRule
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
            -Profile Any | Out-Null
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
            -VMCreatorId Any | Out-Null
    }
}

if ($Remove) {
    Write-Host "Removed OwnerBot BDS firewall rules."
} else {
    Write-Host "Allowed BDS TCP 19261 and UDP 20000-20100 from $LanSubnet."
}
