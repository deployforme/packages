# Zero Downtime Demo - Test Script
# Bu script endpoint'leri sürekli test eder

Write-Host "`n🎯 Hivelet Zero Downtime Test`n" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════`n" -ForegroundColor Gray

$choice = Read-Host "Hangi endpoint'i test etmek istersin? (1: Users, 2: Products, 3: Her ikisi)"

function Test-Endpoint {
    param($url, $name, $color)
    
    $counter = 0
    while ($true) {
        $counter++
        try {
            $response = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 2
            $timestamp = Get-Date -Format "HH:mm:ss"
            
            if ($response.version) {
                Write-Host "[$timestamp] $name #$counter - Version: $($response.version) ✅" -ForegroundColor $color
            } else {
                Write-Host "[$timestamp] $name #$counter - OK ✅" -ForegroundColor $color
            }
        }
        catch {
            Write-Host "[$timestamp] $name #$counter - ERROR ❌" -ForegroundColor Red
        }
        Start-Sleep -Seconds 1
    }
}

switch ($choice) {
    "1" {
        Write-Host "`n🧑 Testing Users endpoint...`n" -ForegroundColor Yellow
        Test-Endpoint -url "http://localhost:3001/users" -name "USERS" -color "Green"
    }
    "2" {
        Write-Host "`n📦 Testing Products endpoint...`n" -ForegroundColor Yellow
        Test-Endpoint -url "http://localhost:3001/products" -name "PRODUCTS" -color "Blue"
    }
    "3" {
        Write-Host "`n🔄 Testing both endpoints...`n" -ForegroundColor Yellow
        
        $job1 = Start-Job -ScriptBlock {
            $counter = 0
            while ($true) {
                $counter++
                try {
                    $response = Invoke-RestMethod -Uri "http://localhost:3001/users" -Method Get -TimeoutSec 2
                    $timestamp = Get-Date -Format "HH:mm:ss"
                    Write-Output "[$timestamp] USERS #$counter - Version: $($response.version) ✅"
                }
                catch {
                    $timestamp = Get-Date -Format "HH:mm:ss"
                    Write-Output "[$timestamp] USERS #$counter - ERROR ❌"
                }
                Start-Sleep -Seconds 1
            }
        }
        
        $job2 = Start-Job -ScriptBlock {
            $counter = 0
            while ($true) {
                $counter++
                try {
                    $response = Invoke-RestMethod -Uri "http://localhost:3001/products" -Method Get -TimeoutSec 2
                    $timestamp = Get-Date -Format "HH:mm:ss"
                    Write-Output "[$timestamp] PRODUCTS #$counter - OK ✅"
                }
                catch {
                    $timestamp = Get-Date -Format "HH:mm:ss"
                    Write-Output "[$timestamp] PRODUCTS #$counter - ERROR ❌"
                }
                Start-Sleep -Seconds 1
            }
        }
        
        while ($true) {
            Receive-Job -Job $job1
            Receive-Job -Job $job2
            Start-Sleep -Milliseconds 100
        }
    }
    default {
        Write-Host "Geçersiz seçim!" -ForegroundColor Red
    }
}
