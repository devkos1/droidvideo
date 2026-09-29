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
    $dll=Join-Path $destination 'droidvideo-camera.dll'
    if($Uninstall){
        if(Test-Path -LiteralPath $dll){& "$env:SystemRoot\System32\regsvr32.exe" /s /u $dll;if($LASTEXITCODE){throw 'Unregistration failed.'};Remove-Item -LiteralPath $dll}
    }else{
        New-Item -ItemType Directory -Force $destination | Out-Null
        Copy-Item -LiteralPath "$PSScriptRoot\droidvideo-camera.dll" -Destination $dll -Force
        & "$env:SystemRoot\System32\regsvr32.exe" /s $dll
        if($LASTEXITCODE){throw 'Camera registration failed.'}
    }
}
Write-Host 'Done. Restart camera applications.'
