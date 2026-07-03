# Push ai-server code to your Hugging Face Space
# Usage: .\deploy\scripts\push-hf-space.ps1 -Token "hf_xxxx"
#
# Get a token: https://huggingface.co/settings/tokens (Write access)

param(
    [Parameter(Mandatory = $true)]
    [string]$Token,

    [string]$Space = "tejaPydahSoft/teja-smas-ai"
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path "$PSScriptRoot\..\.."
$WorkDir = Join-Path $Root "_hf-space-temp"
$AiServer = Join-Path $Root "ai-server"
$CloneUrl = "https://tejaPydahSoft:$Token@huggingface.co/spaces/$Space"

Write-Host "==> Preparing Hugging Face Space: $Space" -ForegroundColor Cyan

if (Test-Path $WorkDir) {
    Remove-Item -Recurse -Force $WorkDir
}

Write-Host "==> Cloning Space repo..."
git clone $CloneUrl $WorkDir

$Dest = $WorkDir
Copy-Item (Join-Path $AiServer "Dockerfile") $Dest -Force
Copy-Item (Join-Path $AiServer "requirements.txt") $Dest -Force
Copy-Item (Join-Path $AiServer "app") (Join-Path $Dest "app") -Recurse -Force
Copy-Item (Join-Path $Root "deploy\huggingface-space\README.md") (Join-Path $Dest "README.md") -Force

# HF ephemeral disk — use /tmp for face index
$dockerfile = Get-Content (Join-Path $Dest "Dockerfile") -Raw
$dockerfile = $dockerfile -replace 'INDEX_DIR=/data', 'INDEX_DIR=/tmp/data'
Set-Content (Join-Path $Dest "Dockerfile") $dockerfile -NoNewline

Push-Location $Dest
git add .
git status
git commit -m "Deploy SMAS ai-server from monorepo" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Nothing new to commit (files may already match)." -ForegroundColor Yellow
} else {
    git push
    Write-Host ""
    Write-Host "==> Pushed! Space will rebuild automatically." -ForegroundColor Green
    Write-Host "    URL: https://$($Space.Split('/')[1]).hf.space/health" -ForegroundColor Green
}
Pop-Location

Write-Host ""
Write-Host "Next: Hugging Face Space -> Settings -> Variables, add:" -ForegroundColor Cyan
Write-Host "  HOST=0.0.0.0  PORT=8000  INDEX_DIR=/tmp/data"
Write-Host "  INSIGHTFACE_MODEL=buffalo_s  DET_SIZE=320,320  CPU_THREADS=2"
