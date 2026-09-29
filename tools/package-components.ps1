$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$stage=Join-Path $root 'dist\DroidVideo-0.2.0-Windows-Components'
New-Item -ItemType Directory -Force "$stage\data\locale" | Out-Null
foreach($file in @('droidvideo-camera.dll','droidvideo-obs.dll','droidvideo-vcam-writer.exe')){Copy-Item -LiteralPath "$root\native\build\$file" -Destination $stage -Force}
foreach($file in @('Install-Components.ps1','Install-OBS.cmd','Install-Camera.cmd','Uninstall-OBS.cmd','Uninstall-Camera.cmd','COPYING-GPL-2.0.txt','COPYING-LGPL-2.1.txt','THIRD-PARTY.md')){Copy-Item -LiteralPath "$root\native\$file" -Destination $stage -Force}
Copy-Item -Path "$root\native\data\locale\*.ini" -Destination "$stage\data\locale" -Force
Copy-Item -LiteralPath "$root\docs\SETUP.hu.md" -Destination "$stage\OLVASS-EL.md" -Force
Copy-Item -LiteralPath "$root\native\PACKAGE-README.md" -Destination "$stage\README.md" -Force
foreach($file in @('TESTING.md','TESTING.hu.md','BUILD.md')){Copy-Item -LiteralPath "$root\docs\$file" -Destination $stage -Force}
Copy-Item -LiteralPath "$root\dist\DroidVideo-0.2.0-Source.zip" -Destination "$stage\DroidVideo-0.2.0-Source.zip" -Force
Compress-Archive -Path "$stage\*" -DestinationPath "$root\dist\DroidVideo-0.2.0-Windows-Components.zip" -Force
Write-Output "$root\dist\DroidVideo-0.2.0-Windows-Components.zip"
