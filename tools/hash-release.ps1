$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$files=@('DroidVideo-0.3.1-Android.apk','windows/DroidVideo-0.3.1-Windows.exe')
$lines=foreach($file in $files){$hash=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path "$root\dist" $file)).Hash.ToLowerInvariant(); "$hash  $file"}
$lines | Set-Content -Encoding ascii "$root\dist\SHA256SUMS-0.3.1.txt"
$lines
