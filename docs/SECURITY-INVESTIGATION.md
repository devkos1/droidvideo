# Windows 0.3.3 security investigation

Status: withdrawn; detection remains unclassified. Binary packaging is paused.

The reported Bitdefender event is **Advanced Threat Defense**, detection ID
`SuspiciousBehavior.2F8632572ABFA976`. The screenshots show “Malicious behavior
blocked” and “62 applications have been blocked”. The same executable appears
repeatedly. This is a list of applications/processes associated with the event,
not evidence that 62 distinct files contain malware.

Reported processes include the portable launcher, its extracted `DroidVideo.exe`,
bundled `adb.exe`, `droidvideo-audio-bridge.exe`, and Windows `powershell.exe`,
`reg.exe` and `conhost.exe`. The screenshots do not show the attack timeline or
the exact operation that first triggered the detection.

[Bitdefender describes Advanced Threat Defense](https://www.bitdefender.com/consumer/support/answer/2024/)
as behavior monitoring that combines multiple observations. A legitimate
purpose for a process does not establish that this event is a false positive.

## Source review

The withdrawn release uses Electron's portable launcher, which extracts the
application and resources into a temporary directory. The app invokes bundled
ADB for Android connectivity and a separate native helper for AAC decoding.
Component setup uses elevated PowerShell; the camera setup copies a DirectShow
DLL into Program Files and registers it using Windows `regsvr32.exe`. Status
checks use `reg.exe`. These paths explain the roles of several reported process
names, but do not identify Bitdefender's exact trigger.

A confirmed reliability defect allowed the audio helper to be restarted after
unexpected termination as more audio packets arrived. Current source stops
audio after the first unexpected exit or launch error. A fresh stream requested
by the user explicitly resets the failure. No updated binary has been released;
this fix is not an antivirus verdict.

External microphone driver installation has been removed from current source.
The screenshots do not establish that the external driver caused the detection.

## Evidence and release gate

`node tools/audit-withdrawn-bundle.cjs` reads remaining local build files without
launching them. It records SHA-256 hashes, compares bundled helpers against local
build/reference copies, and compares packaged JavaScript and the installer
script against release commit `b32d85e05eb88faef000ad157465c031376c23f3`.
The local report stays in ignored `.build-deps/investigation/`.
Matching hashes establish file identity, not safety or independent provenance.

The event's attack timeline and a vendor assessment are still needed to classify
the report. No antivirus exclusions, protection changes, quarantine restoration
or repackaging to bypass detection are part of this investigation. Older releases
have not been established as safe alternatives. Distribution remains paused.
