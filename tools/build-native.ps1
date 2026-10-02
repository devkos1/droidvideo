param([string]$ObsRoot = 'C:\Program Files\obs-studio')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$vs -and (Test-Path "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars64.bat")) { $vs = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\BuildTools" }
if (!$vs) { throw 'Install Visual Studio Build Tools with Desktop development with C++.' }
$obs = Join-Path $root '.build-deps\obs-studio'
if (!(Test-Path "$obs\libobs\obs-module.h")) { throw 'Fetch OBS Studio tag 32.1.0 into .build-deps/obs-studio first. See docs/BUILD.md.' }
$out = Join-Path $root 'native\build'
New-Item -ItemType Directory -Force $out | Out-Null
@'
#pragma once
#define OBS_INSTALL_PREFIX ""
#define OBS_DATA_PATH "data"
#define OBS_PLUGIN_DESTINATION "obs-plugins/64bit"
#define OBS_RELEASE_CANDIDATE 0
#define OBS_BETA 0
'@ | Set-Content "$out\obsconfig.h"
$commands = @('@echo off', "call `"$vs\VC\Auxiliary\Build\vcvars64.bat`" >nul", "cd /d `"$out`"", "dumpbin /exports `"$ObsRoot\bin\64bit\obs.dll`" > obs-exports.txt")
$commands | Set-Content "$out\exports.cmd"
& cmd /c "$out\exports.cmd"
if ($LASTEXITCODE) { throw 'Cannot read installed OBS exports.' }
$symbols = Get-Content "$out\obs-exports.txt" | ForEach-Object { if ($_ -match '^\s+\d+\s+[0-9A-F]+\s+[0-9A-F]+\s+(\w+)(?:\s+=.*)?\s*$') { $Matches[1] } }
@('LIBRARY obs.dll','EXPORTS') + $symbols | Set-Content "$out\obs.def"
$vendor = Join-Path $root 'native\vendor'
$inc = "/I`"$vendor`" /I`"$vendor\virtualcam`" /I`"$vendor\libdshowcapture`" /I`"$vendor\libdshowcapture\source`""
$common = '/nologo /O2 /MT /DWIN32 /D_WINDOWS /DUNICODE /D_UNICODE /DNOMINMAX /D_CRT_SECURE_NO_WARNINGS /utf-8'
$commands = @('@echo off', "call `"$vs\VC\Auxiliary\Build\vcvars64.bat`" >nul", "cd /d `"$out`"", 'lib /nologo /def:obs.def /machine:x64 /out:obs.lib', 'if errorlevel 1 exit /b 1')
foreach ($file in @('shared-memory-queue','tiny-nv12-scale','sleepto')) {
    $commands += "cl $common $inc /c `"$vendor\virtualcam\$file.c`" /Fo$file.obj"
    $commands += 'if errorlevel 1 exit /b 1'
}
$commands += "cl $common /EHsc /std:c++17 /LD $inc /I`"$obs\libobs`" /I`"$obs\deps\w32-pthreads`" /I`"$out`" `"$root\native\droidvideo-obs.cpp`" shared-memory-queue.obj tiny-nv12-scale.obj /link obs.lib ws2_32.lib /OUT:droidvideo-obs.dll"
$commands += 'if errorlevel 1 exit /b 1'
$sources = @('virtualcam-filter','virtualcam-module','placeholder') | ForEach-Object { "`"$vendor\virtualcam\$_.cpp`"" }
$sources += @('output-filter','dshow-base','dshow-enum','dshow-formats','dshow-media-type','log') | ForEach-Object { "`"$vendor\libdshowcapture\source\$_.cpp`"" }
$commands += "cl $common /EHsc /std:c++17 /LD /DVIRTUALCAM_AVAILABLE $inc $($sources -join ' ') shared-memory-queue.obj tiny-nv12-scale.obj sleepto.obj /link /DEF:`"$root\native\virtualcam.def`" /OUT:droidvideo-camera.dll strmiids.lib ole32.lib oleaut32.lib uuid.lib winmm.lib shell32.lib advapi32.lib setupapi.lib cfgmgr32.lib"
$commands += 'if errorlevel 1 exit /b 1'
$commands += "cl $common /EHsc /std:c++17 $inc `"$root\native\vcam-writer.cpp`" `"$root\native\h264-input.cpp`" shared-memory-queue.obj tiny-nv12-scale.obj /link /OUT:droidvideo-vcam-writer.exe d3d11.lib mfplat.lib mfuuid.lib wmcodecdspuuid.lib ole32.lib oleaut32.lib"
$commands += 'if errorlevel 1 exit /b 1'
$commands += "cl $common /EHsc /std:c++17 $inc `"$root\tools\verify-native.cpp`" shared-memory-queue.obj tiny-nv12-scale.obj /link /OUT:verify-native.exe strmiids.lib ole32.lib uuid.lib"
$commands += 'if errorlevel 1 exit /b 1'
$commands += "cl $common /EHsc /std:c++17 `"$root\native\audio-bridge.cpp`" /link /OUT:droidvideo-audio-bridge.exe mfplat.lib mfuuid.lib wmcodecdspuuid.lib ole32.lib oleaut32.lib uuid.lib propsys.lib"
$commands += 'if errorlevel 1 exit /b 1'
$commands | Set-Content "$out\compile.cmd"
& cmd /c "$out\compile.cmd"
if ($LASTEXITCODE) { throw 'Native build failed.' }
Write-Host "Native components built in $out"
