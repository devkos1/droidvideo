$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$cache=Join-Path $root '.build-deps\adb-download'
$bundle=Join-Path $root '.build-deps\bundle'
New-Item -ItemType Directory -Force $cache,"$bundle\platform-tools","$bundle\native\data\locale","$bundle\licenses" | Out-Null
$archive=Join-Path $cache 'platform-tools.zip'
$checksum='b024d4f319d6ad3004de1ba7b96a5c7c5f3512e8b14126308d598b4ab93dcead'
if(!(Test-Path -LiteralPath $archive)){Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/platform-tools_r36.0.2-win.zip' -OutFile $archive}
if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $checksum){throw 'ADB download checksum mismatch.'}
Expand-Archive -LiteralPath $archive -DestinationPath $cache -Force
# Only the ADB client/server and its USB libraries are distributed, not the SDK.
foreach($file in @('adb.exe','AdbWinApi.dll','AdbWinUsbApi.dll','NOTICE.txt','source.properties')){Copy-Item -LiteralPath "$cache\platform-tools\$file" -Destination "$bundle\platform-tools" -Force}
foreach($file in @('droidvideo-camera.dll','droidvideo-obs.dll','droidvideo-vcam-writer.exe','droidvideo-audio-bridge.exe')){Copy-Item -LiteralPath "$root\native\build\$file" -Destination "$bundle\native" -Force}
foreach($file in @('Install-Components.ps1','COPYING-GPL-2.0.txt','COPYING-LGPL-2.1.txt','THIRD-PARTY.md')){Copy-Item -LiteralPath "$root\native\$file" -Destination "$bundle\native" -Force}
Copy-Item -Path "$root\native\data\locale\*.ini" -Destination "$bundle\native\data\locale" -Force
Copy-Item -LiteralPath "$root\LICENSE" -Destination "$bundle\licenses\LICENSE-DroidVideo.txt" -Force
foreach($file in @('COPYING-GPL-2.0.txt','COPYING-LGPL-2.1.txt','THIRD-PARTY.md')){Copy-Item -LiteralPath "$root\native\$file" -Destination "$bundle\licenses" -Force}
Copy-Item -LiteralPath "$cache\platform-tools\NOTICE.txt" -Destination "$bundle\licenses\ADB-NOTICE.txt" -Force
Copy-Item -LiteralPath "$root\docs\THIRD-PARTY.md" -Destination "$bundle\licenses\BUNDLED-SOFTWARE.md" -Force
$version=(Get-Content "$root\desktop\package.json" -Raw | ConvertFrom-Json).version
Copy-Item -LiteralPath "$root\dist\DroidVideo-$version-Source.zip" -Destination "$bundle\licenses\DroidVideo-Source.zip" -Force
Write-Host 'Bundled ADB, native components, notices and matching source are ready.'
# Standard VB-CABLE only, redistributed unmodified with donationware attribution.
$cableCache=Join-Path $root '.build-deps\vbcable'
New-Item -ItemType Directory -Force $cableCache,"$bundle\native\vbcable" | Out-Null
$cableZip=Join-Path $cableCache 'package.zip'
if(!(Test-Path -LiteralPath $cableZip)){Invoke-WebRequest -Uri 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip' -OutFile $cableZip}
if((Get-FileHash -LiteralPath $cableZip -Algorithm SHA256).Hash -ne 'B950E39F01AF1D04EA623C8F6D8EB9B6EA5C477C637295FABF20631C85116BFB'){throw 'VB-CABLE download checksum mismatch.'}
Expand-Archive -LiteralPath $cableZip -DestinationPath "$bundle\native\vbcable" -Force
Copy-Item -LiteralPath "$root\docs\VB-CABLE.md" -Destination "$bundle\licenses\VB-CABLE.md" -Force
