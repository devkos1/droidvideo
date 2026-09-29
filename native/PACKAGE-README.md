# DroidVideo 0.2.0 Windows components

Extract this ZIP before installing. Use Windows 10/11 x64 and OBS 32.x x64.

- Close OBS, then right-click `Install-OBS.cmd` → Run as administrator. Restart OBS, start video in the DroidVideo desktop app, then add **DroidVideo Camera + Audio** from Sources. Source properties select phone audio, a PC microphone or no audio.
- To install the separate **DroidVideo Camera** device, right-click `Install-Camera.cmd` → Run as administrator. Restart camera applications. Enable virtual camera in the DroidVideo app and select it in a 64-bit DirectShow consumer. It carries video only.
- Keep the DroidVideo desktop app running. The virtual camera does not replace OBS Virtual Camera. The OBS source uses a local named pipe; no TCP URL is needed.
- For non-default OBS installations, see the parameters in `Install-Components.ps1`.
- The matching Uninstall scripts remove only the corresponding DroidVideo component.

[Test results](TESTING.md) · [Native licenses/provenance](THIRD-PARTY.md)

English is the default. Optional Hungarian guide: [Telepítés](OLVASS-EL.md).

`DroidVideo-0.2.0-Source.zip` contains the matching source, build scripts, documentation, and vendored camera sources. Preserve it with this distribution. Native code uses GPL-2.0-or-later and LGPL-2.1-or-later as described in THIRD-PARTY.md; license texts are included here.

This preview passed component and synthetic-media checks. Real phone/Wi-Fi/audio, actual installation and live OBS scene tests are still required. Installers and binaries are unsigned. No virtual microphone is installed.
