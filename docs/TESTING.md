# Verification report — 0.3.1 preview

Windows x64, September 30, 2026. Video fixtures are synthetic. [Magyar változat](TESTING.hu.md).

## Changes verified

- The OBS plug-in uses bounded loopback UDP with hardware decoding enabled and asynchronous buffering disabled. Two sources share one decoder; repeated settings updates preserve it. An isolated libobs test closes the sources and shuts down without incoming video within a three-second limit. This is a regression check, not proof of real-device latency or stability.
- Compatible registered camera DLLs are reused even when their build hashes differ. Explicit installation uses versioned paths, avoiding replacement of loaded DLLs. Detection is tested with mocks; elevated installation still needs device testing.

- Android `assembleDebug` and `lintDebug` passed. APK versionCode 4 / versionName 0.3.1; the existing development signature is retained for updates.
- Seventeen Node tests passed, including protocol framing, MPEG-TS, USB/Wi-Fi controls, pairing, bounded native decode input, stale-frame rejection, setup endpoint authentication, bundled ADB selection, installer argument quoting and cancelled elevation. Installer tests use mocks; they do not register components.
- Native x64 build passed. DirectShow COM creation and 1080p60/4K30 formats work without camera registration.
- Sixteen pixel-exact raw-frame cases cover NV12/I420, all four rotations, SIMD and tile boundaries, shared-memory output and native consumption acknowledgements.
- The Windows H.264 decoder produced all 60 frames in the 1080p60 fixture and all 30 frames in the 4K30 fixture. Processing including helper startup took approximately 0.88 s and 0.81 s respectively on the test machine. These short synthetic samples do not establish sustained real-world fps.
- The production virtual camera now decodes compressed video natively. It does not depend on the browser preview sending full-resolution pixels back to Node. Outstanding encoded input is bounded and recovers at a keyframe after congestion.
- The browser-to-camera integration test read a real 3840×2160 shared-memory frame with a 333333 × 100 ns frame interval. The camera continued delivering frames after the preview tab was closed. The synthetic source itself averaged around 22 fps; this run does not prove a sustained 30 fps phone-to-OBS connection.
- English and optional Hungarian UI, 4K preview, output controls and the simpler OBS setup dialog were checked in the browser.
- The OBS module loaded into OBS 32.2.2 libobs and registered the source and audio properties. This is not a live OBS scene test.

The loopback transport also decoded synthetic 1080p60 and 4K30 video with AAC using the production low-buffer settings, without receive-buffer overruns or decoding errors. These five-second runs validate packet delivery, not sustained phone-to-OBS performance.

## Raw-frame processing comparison (0.3.0 baseline)

The same local 30-frame 3840×2160 I420 test, including pipe input, conversion, rotation and shared-memory output:

| Rotation | Previous writer | Optimized writer |
| --- | ---: | ---: |
| 0° | 51.9 fps | 167.7 fps |
| 90° | 26.1 fps | 95.4 fps |
| 180° | 29.4 fps | 139.0 fps |
| 270° | 25.0 fps | 98.8 fps |

This isolates the raw processing stage. The production path also removes browser pixel copying and adds native H.264 decoding, whose cost is not included in this table. Reproduce the raw check with `tools/benchmark-vcam.py`.

## Distribution checks

The Windows package is checked against the workspace for application code, author metadata, APK, ADB and its USB libraries, OBS plug-in, virtual camera, native helper, installer script, notices and corresponding source. Custom Windows/Android icons are included. The release has one APK and one Windows EXE; no component ZIP is required.

The bundled ADB archive is pinned to version 36.0.2 and verified by SHA-256. No pairing links, local signing keys, SDK directories or developer credentials are included in the source archive.

## Still requiring device testing

- Packaged Windows app startup and actual elevated installation/registration, including cancellation, non-default OBS folders and updates while components are in use.
- Real phones, manufacturer-specific USB drivers, Wi-Fi conditions, all lenses and microphone routes.
- Sustained 4K30/1080p60, latency, temperature, audio synchronization, background and locked-screen behavior.
- A live OBS scene and compatibility with target 64-bit DirectShow consumers.

The camera is video-only. Phone audio is available through the OBS plug-in. Windows N may need the Media Feature Pack for native decoding. The native decoder uses Windows Media Foundation; its CPU cost and the separate preview can still limit performance on slower PCs. The direct OBS source remains the recommended OBS route.

Windows binaries are unsigned and Android uses a development signature. The author metadata is not a trusted code-signing identity.
