# Verification report — 0.3.3 preview

Windows x64, October 2, 2026. Video and audio fixtures are synthetic. [Magyar változat](TESTING.hu.md).

## Current changes

The OBS source now receives decoded NV12 video and PCM audio through bounded shared-memory queues. H.264/AAC decoding runs in separate Windows helper processes. The source no longer creates an FFmpeg decoder or receives encoded UDP video inside OBS. Active sources request the shared video helper automatically; the virtual-camera button remains independent.

The local OBS log associated with the reported freeze showed stream probing failures, missing H.264 parameters and repeated UDP buffer overruns. This release removes that path. The checks below demonstrate the replacement working with synthetic media; they do not establish that every real-phone freeze is resolved.

## Checks

- Native x64 build and twenty Node tests passed. The server test checks that an OBS heartbeat starts output, disabling the camera button preserves active OBS output, background mode pauses only preview delivery, and disconnect stops output. Existing protocol, USB, Wi-Fi, setup authentication and installer-quoting tests also pass.
- An isolated OBS 32.2.2 libobs process created two DroidVideo sources, activated them, received 1920×1080 and 3840×2160 frames from the native H.264 helper, and received phone PCM through the OBS audio callback. Repeated updates and shutdown completed within the three-second test limit. This does not change the user's OBS configuration or install the plug-in.
- A separate idle-source check verifies creation, activation heartbeat and destruction without incoming video.
- Native AAC tests decoded every packet of generated mono and stereo 48 kHz tones, checked signal amplitude and frequency, switched channel count, and rejected malformed framing. These tests do not use a physical audio endpoint.
- H.264 output crops decoder alignment padding to the requested picture dimensions; 1080p is delivered as 1080 rows rather than the decoder's padded 1088 rows.
- The OBS-closure error was checked in the browser: a modal alert appears in front of the setup wizard, focuses OK, and returns to setup when dismissed. The separate microphone setup/output controls and VB-Audio attribution were also checked.
- Android assembleDebug and lintDebug passed with versionCode 6 / versionName 0.3.3. The existing development signature is retained for updates.

## Distribution

The release consists of one APK and one portable EXE. The EXE includes ADB, the OBS plug-in, DirectShow camera, video/audio helpers, setup script, unmodified standard VB-CABLE package, notices, icons and corresponding DroidVideo source. Packaging checks compare the embedded files with their source inputs.

ADB and VB-CABLE downloads are pinned by SHA-256. The VB-CABLE setup executable's Authenticode signature is checked before installation. VB-CABLE is a separate closed-source donationware product; see [attribution and terms](VB-CABLE.md). No local signing keys, credentials, pairing links or SDK directories belong in the source archive.

## Still requiring device testing

- Actual elevated component installation and VB-CABLE installation, restart, endpoint renaming and audio delivery to another app. No driver was installed during automated verification.
- Packaged window/tray behavior and installation into non-default OBS folders.
- Real-phone sustained 4K30/1080p60 performance, latency, A/V synchronization, thermal behavior, camera and microphone compatibility, and Wi-Fi conditions.
- Long-running OBS scenes and target DirectShow consumers. Reinstall the bundled OBS plug-in after updating; the old DLL does not use the new transport.

Windows N may need the Media Feature Pack. D3D11 decoding still involves CPU-readable frames for sharing, so this is not a zero-copy GPU transport. Slower PCs may need 1080p or paused preview.

DroidVideo Windows binaries remain unsigned; Android uses a development signature. The signed third-party audio driver does not sign the DroidVideo EXE.
