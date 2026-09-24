# Start FinAlly in Docker. Pass -Build to force an image rebuild.
param([switch]$Build)

$Image = "finally"
$Container = "finally"
$Url = "http://localhost:8000"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Test-Path ".env")) {
    Write-Host "No .env found; copying .env.example (add your OPENROUTER_API_KEY)."
    Copy-Item ".env.example" ".env"
}

docker image inspect $Image *> $null
if ($Build -or $LASTEXITCODE -ne 0) {
    docker build -t $Image .
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

docker rm -f $Container *> $null
docker run -d --name $Container `
    -p 8000:8000 `
    -v finally-data:/app/db `
    --env-file .env `
    $Image | Out-Null
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "FinAlly is running at $Url"
Start-Process $Url
