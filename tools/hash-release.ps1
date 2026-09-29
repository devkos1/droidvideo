$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$files=@('DroidVideo-0.2.0-Android.apk','windows/DroidVideo-0.2.0-Windows.exe','DroidVideo-0.2.0-Windows-Components.zip','DroidVideo-0.2.0-Source.zip')
$lines=foreach($file in $files){$hash=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path "$root\dist" $file)).Hash.ToLowerInvariant(); "$hash  $file"}
$lines | Set-Content -Encoding ascii "$root\dist\SHA256SUMS-0.2.0.txt"
$lines
