# Called by the Windows app after an explicit setup click and Windows elevation.
param([ValidateSet('OBS','Camera','Microphone')][string]$Component='OBS',[switch]$Uninstall,[string]$ObsRoot="$env:ProgramFiles\obs-studio")
$ErrorActionPreference='Stop'
$admin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if(!$admin){throw 'Accept the Windows permission prompt to install this component.'}
if(![Environment]::Is64BitProcess){throw 'Use 64-bit PowerShell.'}
if($Component -eq 'Microphone'){
    if($Uninstall){throw 'To remove VB-CABLE, use its original installer. This also removes the microphone from other apps.'}
    $helper=Join-Path $PSScriptRoot 'droidvideo-audio-bridge.exe'
    $devices=(& $helper --list | ConvertFrom-Json)
    if($LASTEXITCODE){throw 'Cannot check Windows audio devices.'}
    if(!($devices | Where-Object { $_.capture -and $_.cable })){
        $installer=Join-Path $PSScriptRoot 'vbcable\VBCABLE_Setup_x64.exe'
        if((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ne '734C35DFA6D98F48782A451633CEB471166EC70D60482FD89A1123D0EE3C4F41'){throw 'VB-CABLE installer checksum mismatch.'}
        if((Get-AuthenticodeSignature -LiteralPath $installer).Status -ne 'Valid'){throw 'Windows could not verify the VB-CABLE publisher. Check the PC date and internet connection, then try again.'}
        # The original vendor installer is an interactive step the user must see.
        Start-Process -FilePath $installer -WorkingDirectory (Split-Path $installer) -WindowStyle Normal -Wait
        $devices=(& $helper --list | ConvertFrom-Json)
        if(!($devices | Where-Object { $_.capture -and $_.cable })){throw 'Finish the VB-CABLE installation and restart Windows, then click Set up microphone again.'}
    }
    & $helper --rename
    if($LASTEXITCODE){throw 'Could not name the microphone. Restart Windows and click Set up microphone again.'}
}elseif($Component -eq 'OBS'){
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
