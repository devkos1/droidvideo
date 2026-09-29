# DroidVideo 0.2.0 — preview

<img src="assets/branding/icon.svg" width="96" height="96" alt="DroidVideo camera icon">

[Download the preview](https://github.com/devkos1/droidvideo/releases/tag/v0.2.0)

Free, open-source Android camera streaming for Windows, without a watermark. USB and encrypted local Wi-Fi, camera controls, phone audio, a native OBS source, and a separate Windows virtual camera.

[Build instructions](docs/BUILD.md) · [Test report](docs/TESTING.md)

English is the default language. Hungarian is optional: [Magyar útmutató](docs/SETUP.hu.md).

## Features

- Camera2 + hardware H.264: 4K/30, 1080p/60, 1080p/30, 720p/60 and 720p/30 **when the phone exposes support**.
- Lens switching, zoom, continuous autofocus, tap/click focus, exposure compensation and torch. Phone and desktop controls synchronize while streaming.
- Landscape phone preview and controls; English by default, with optional Hungarian through the EN/HU switch. Explicit language choices are remembered.
- Screen dimming plus a camera/microphone foreground service. Press the phone power button for true display-off; manufacturer battery restrictions need device testing.
- USB through ADB; Wi-Fi with an explicit pairing link, certificate pinning and TLS 1.2. No account, watermark or cloud service.
- Wi-Fi benchmark and per-camera resolution recommendations based on measured throughput, variability and bandwidth headroom.
- Phone microphone selection, including built-in, wired and USB inputs exposed by Android; mono/stereo 48 kHz AAC. Unsupported routes report errors. Bluetooth is device-dependent; system playback audio is not captured.
- Native **DroidVideo Camera + Audio** OBS source: phone audio, PC microphone or off. Uses a local Windows named pipe, without TCP Media Source setup.
- Independent **DroidVideo Camera** x64 DirectShow camera, including 1080p60/4K30 formats and orientation correction. Video only; phone audio is delivered through the OBS plug-in.

## Setup

Use the matching 0.2.0 files in `dist/` or GitHub Releases:

1. Install `DroidVideo-0.2.0-Android.apk` on Android 9+. Open it and allow camera/microphone access. This preview uses a development signature.
2. Run `DroidVideo-0.2.0-Windows.exe` on Windows 10/11 x64. Keep it running while streaming.
3. Extract `DroidVideo-0.2.0-Windows-Components.zip` for the OBS and camera installers. Source and native licenses are included.

USB needs [Android Platform-Tools](https://developer.android.com/tools/releases/platform-tools). Enable Developer options → USB debugging, connect a data cable, and accept the phone's debugging prompt. Open the phone app, select the device in Windows and connect. Install over USB is also available in the desktop setup section.

For Wi-Fi, connect both devices to the same private LAN. Enable sharing in the phone's Wi-Fi menu and paste its pairing link into the Windows Wi-Fi field. A benchmark runs after an idle Wi-Fi connection and selects a recommended mode. Measure again while stopped. Alternatively, enable Wi-Fi on the phone, choose **Get Wi-Fi link over USB**, disconnect, switch to Wi-Fi and connect. Links contain private session credentials; do not publish them. Private IPv4 is required. Guest-network isolation and firewalls may block the connection.

Select a camera/mode and start video. Choose a phone microphone explicitly to enable audio. The desktop preview is muted. Use **Dim screen** on the phone, then its power button for true display-off. Long-press the dim overlay to restore controls.

## OBS plug-in

Close OBS. Right-click `Install-OBS.cmd` in the extracted components package → **Run as administrator**. Default OBS folder: `C:\Program Files\obs-studio`. For another location, run `Install-Components.ps1 -Component OBS -ObsRoot 'D:\OBS Studio'` in elevated 64-bit PowerShell.

Restart OBS 32.x x64. Start video in DroidVideo, then add **Sources → + → DroidVideo Camera + Audio**. Select phone audio, a PC microphone or off in source properties. Choose the phone's physical microphone in DroidVideo itself. Use OBS Transform for picture rotation and Advanced Audio Properties for device-specific lip-sync correction. The plug-in uses OBS's included FFmpeg and WASAPI modules.

To remove it, close OBS and run `Uninstall-OBS.cmd` as administrator.

## Windows virtual camera

Run `Install-Camera.cmd` as administrator once. It copies the DLL into `C:\Program Files\DroidVideo\Camera` and registers a separate device; OBS Virtual Camera is independent.

Start video, enable **Windows virtual camera** in DroidVideo, and select **DroidVideo Camera** in a 64-bit DirectShow camera application. Restart camera applications after installation. Select the desired resolution/fps in the consuming application too. This preview does not support 32-bit or Media-Foundation-only consumers. The desktop app may be minimized but must remain running.

The virtual camera transmits video only; no virtual microphone driver is installed. Use the OBS source for phone audio, or a PC microphone in other applications. The PC decodes and copies frames, so its CPU/GPU affects achieved fps. `Uninstall-Camera.cmd` unregisters only DroidVideo's camera.

## Limits and verification

This is a development preview. Android build/lint, Node protocol tests, synthetic 1080p60/4K30 with AAC, native frame rotation/transfer, browser preview, and libobs module loading were checked. Physical-phone USB/Wi-Fi, microphone routing, long-running screen-off operation and end-to-end live OBS audio still need hardware validation. [Detailed results](docs/TESTING.md).

Some manufacturers hide auxiliary lenses/high-frame-rate modes. Constrained-high-speed-only sessions, HDR/10-bit, manual shutter and ISO are not implemented. Low light and overheating can reduce fps. The reported camera fps is an average since stream start. A mode may require dropping the phone preview to keep encoder capture supported. Wi-Fi recommendations are estimates; quality does not change automatically mid-stream.

## Source and licenses

- `android/`: Camera2/MediaCodec application and local control/AV services.
- `desktop/`: Electron/Node UI, pinned Wi-Fi, MPEG-TS mux and preview.
- `native/`: OBS source, DirectShow camera, frame writer, installers and vendored source.
- `tools/`: builds, synthetic/native verification and packaging.
- `docs/`: setup, build and test guides.

Original Android/Electron sources are MIT licensed. Native OBS-derived components and the OBS plug-in are GPL-2.0-or-later; libdshowcapture is LGPL-2.1-or-later. Preserve the [native notices](native/THIRD-PARTY.md), [GPL](native/COPYING-GPL-2.0.txt), [LGPL](native/COPYING-LGPL-2.1.txt) and corresponding source when redistributing native binaries. Electron includes its third-party licenses. Platform-Tools is installed separately.

The AV protocol has a 13-byte big-endian header: flags (0 delta, 1 keyframe, 2 SPS/PPS, 3 AAC/ADTS), 64-bit microsecond timestamp, 32-bit payload length. USB endpoints bind phone loopback ports 27184/27185; opt-in TLS Wi-Fi uses 27188/27189. Windows UI binds loopback 27186. OBS consumes MPEG-TS from a local named pipe. The virtual camera consumes decoded frames through a bounded local authenticated channel and a separate shared-memory queue.
