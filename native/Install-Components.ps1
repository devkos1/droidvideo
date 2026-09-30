# Called by the Windows app after an explicit setup click and Windows elevation.
param([ValidateSet('OBS','Camera')][string]$Component='OBS',[switch]$Uninstall,[string]$ObsRoot="$env:ProgramFiles\obs-studio")
$ErrorActionPreference='Stop'
$admin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if(!$admin){throw 'Accept the Windows permission prompt to install this component.'}
if(![Environment]::Is64BitProcess){throw 'Use 64-bit PowerShell.'}
if($Component -eq 'OBS'){
    if(Get-Process obs64 -ErrorAction SilentlyContinue){throw 'Close OBS Studio first.'}
    $ObsRoot=[IO.Path]::GetFullPath($ObsRoot)
    if(!(Test-Path -LiteralPath "$ObsRoot\bin\64bit\obs64.exe")){throw 'OBS Studio was not found. Use -ObsRoot with the installed OBS folder.'}
    $dll=Join-Path $ObsRoot 'obs-plugins\64bit\droidvideo-obs.dll'
    $data=Join-Path $ObsRoot 'data\obs-plugins\droidvideo-obs'
    if($Uninstall){
        if(Test-Path -LiteralPath $dll){Remove-Item -LiteralPath $dll}
        # Remove only the files installed by DroidVideo; preserve other content.
        foreach($file in @('en-US.ini','hu-HU.ini')){ $target=Join-Path $data "locale\$file";if(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target} }
    }else{
        New-Item -ItemType Directory -Force "$data\locale" | Out-Null
        Copy-Item -LiteralPath "$PSScriptRoot\droidvideo-obs.dll" -Destination $dll -Force
        Copy-Item -Path "$PSScriptRoot\data\locale\*.ini" -Destination "$data\locale" -Force
    }
}else{
    $destination=Join-Path $env:ProgramFiles 'DroidVideo\Camera'
    $registered=(Get-ItemProperty -LiteralPath 'Registry::HKEY_CLASSES_ROOT\CLSID\{7B9F2D13-E481-4EA5-A853-4D706FE1A299}\InprocServer32' -ErrorAction SilentlyContinue).'(default)'
    $dll=Join-Path $destination 'droidvideo-camera.dll'
    if($registered){
        $resolved=[IO.Path]::GetFullPath($registered)
        if($resolved.StartsWith($destination+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($resolved) -eq 'droidvideo-camera.dll'){$dll=$resolved}
    }
    if($Uninstall){
        if(Test-Path -LiteralPath $dll){& "$env:SystemRoot\System32\regsvr32.exe" /s /u $dll;if($LASTEXITCODE){throw 'Unregistration failed.'};try{Remove-Item -LiteralPath $dll}catch{throw 'Close OBS and other camera apps, then try removing the camera again.'}}
    }else{
        # Versioned paths never overwrite a DLL already loaded by OBS or a call.
        $hash=(Get-FileHash -LiteralPath "$PSScriptRoot\droidvideo-camera.dll" -Algorithm SHA256).Hash.ToLowerInvariant()
        $versionDirectory=Join-Path $destination $hash
        New-Item -ItemType Directory -Force $versionDirectory | Out-Null
        $dll=Join-Path $versionDirectory 'droidvideo-camera.dll'
        if(!(Test-Path -LiteralPath $dll) -or (Get-FileHash -LiteralPath $dll -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash){
            try{Copy-Item -LiteralPath "$PSScriptRoot\droidvideo-camera.dll" -Destination $dll -Force}catch{throw 'Close OBS and other camera apps, then enable the camera again.'}
        }
        & "$env:SystemRoot\System32\regsvr32.exe" /s $dll
        if($LASTEXITCODE){throw 'Camera registration failed.'}
    }
}
Write-Host 'Done. Restart camera applications.'
