$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
    if (-not (Test-Path -LiteralPath $env:ANDROID_HOME)) { throw 'Set ANDROID_HOME to your Android SDK directory.' }
    & '.\android\gradlew.bat' -p android :app:assembleDebug :app:lintDebug --console plain
    if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }
    & npm.cmd --prefix desktop ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
    & npm.cmd --prefix desktop test
    if ($LASTEXITCODE -ne 0) { throw 'Desktop tests failed.' }
    & "$PSScriptRoot\build-native.ps1"
    & python -X utf8 "$PSScriptRoot\verify-native.py"
    if ($LASTEXITCODE -ne 0) { throw 'Native checks failed.' }
    & npm.cmd --prefix desktop run dist
    if ($LASTEXITCODE -ne 0) { throw 'Windows packaging failed.' }
    Copy-Item -LiteralPath 'android\app\build\outputs\apk\debug\app-debug.apk' -Destination 'dist\DroidVideo-0.2.0-Android.apk'
    & node "$PSScriptRoot\verify-package.cjs"
    if ($LASTEXITCODE -ne 0) { throw 'Packaged files differ from source.' }
    & node "$PSScriptRoot\verify-icons.cjs"
    if ($LASTEXITCODE -ne 0) { throw 'Windows icon verification failed.' }
    & python -X utf8 "$PSScriptRoot\package-source.py"
    if ($LASTEXITCODE -ne 0) { throw 'Source packaging failed.' }
    & "$PSScriptRoot\package-components.ps1"
    & "$PSScriptRoot\hash-release.ps1"
    Write-Output 'Build complete. See dist/.'
} finally { Pop-Location }
