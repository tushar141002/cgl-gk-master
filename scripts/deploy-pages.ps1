# Publishes the production build to the gh-pages branch.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/deploy-pages.ps1
param(
  [string]$Remote = "origin",
  [string]$Branch = "gh-pages"
)

$ErrorActionPreference = "Stop"
$project = Split-Path $PSScriptRoot -Parent
Push-Location $project

try {
  $remoteUrl = git remote get-url $Remote
  if (-not $remoteUrl) { throw "Git remote '$Remote' is not configured." }

  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Build failed." }

  # Keep Jekyll from touching the build output.
  New-Item -ItemType File -Path "dist\.nojekyll" -Force | Out-Null

  $temp = Join-Path $env:TEMP ("cglgk-pages-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $temp | Out-Null
  Copy-Item "dist\*" $temp -Recurse -Force

  Push-Location $temp
  try {
    git init -q
    git checkout -q -b $Branch
    git add -A
    git -c user.name="CGL GK Deploy" -c user.email="deploy@localhost" commit -q -m "Deploy $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    git push --force $remoteUrl "HEAD:$Branch"
    if ($LASTEXITCODE -ne 0) { throw "Push failed. Check your GitHub credentials." }
  }
  finally {
    Pop-Location
    Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
  }

  Write-Host "Published to $Branch. Open Settings -> Pages to confirm the source branch."
}
finally {
  Pop-Location
}
