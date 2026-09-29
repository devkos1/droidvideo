# Verification report — 0.2.0 preview

Windows x64 development environment, September 28–29, 2026. Video fixtures are synthetic, not footage from an attached phone. [Magyar változat](TESTING.hu.md).

## Completed checks

- Android `assembleDebug` and `lintDebug` succeeded with no lint errors. Non-blocking warnings remain for orientation, backup configuration, wakelock timeout, localized string composition and build-tool updates. APK: versionCode 2 / versionName 0.2.0.
- Eleven Node tests passed: fragmented/coalesced packets, invalid headers, USB filtering, MPEG-TS CRC/PTS, authenticated controls, cross-origin rejection, WebSocket and OBS named-pipe output, connection cleanup, Wi-Fi pairing/certificate pins, recommendations and native frame boundaries.
- FFmpeg/ffprobe verified 60 frames at 1080p60 and 30 frames at 4K30, each with 47 AAC packets through the project's MPEG-TS mux. Stereo 48 kHz audio, shared-clock timestamps and error-free decoding were checked.
- Native x64 compilation succeeded for the OBS module, DirectShow camera and frame writer.
- The DirectShow DLL's COM class factory works without registration. Its default format and 1080p60/4K30 capabilities were checked.
- I420-to-NV12 conversion, shared-memory transfer and 0/90/180/270-degree rotation were verified against expected pixels.
- The OBS module loaded into the installed OBS 32.2.2 libobs runtime, registered **DroidVideo Camera + Audio**, and exposed audio properties. This did not launch the OBS UI or modify user OBS settings.
- Browser checks covered both languages, connection, 1080p60-to-4K30 switching and decoded test video. A frame was read back through the complete WebSocket → WebCodecs → native writer → shared-memory path at 3840×2160 with a 333333 × 100 ns frame interval. This does not guarantee real-time performance: the synthetic sender's observed average fps also fell below its 30 fps target.
- `npm audit` reported zero known vulnerabilities in the locked dependencies at the time of verification.
- Fifteen packaged application files matched the workspace byte-for-byte. Runtime metadata, embedded APK and native writer also matched. The legacy OBS Media Source UI is absent. Release hashes are in `SHA256SUMS-0.2.0.txt`.
- The custom camera icon is embedded in both the Windows application and portable EXE at seven sizes (16–256 px), verified directly from PE resources. Android's packaged launcher points to the adaptive icon; themed and monochrome notification resources are included. APK signature verification passed.

## Physical-device checks still required

No physical Android phone was connected. Verify these on the intended hardware:

1. Installation, camera/microphone permissions, USB authorization and cold startup.
2. All exposed lenses, zoom range, autofocus, tap focus and phone/PC control synchronization.
3. At least ten minutes at 1080p60 and 4K30: achieved fps, latency, temperature and phone preview.
4. Dimming, power-button screen lock, background/foreground transitions and manufacturer battery restrictions.
5. Real Wi-Fi pairing, throughput measurement, recommended mode, weak signal and reconnection.
6. Built-in/wired/USB microphone selection, mono/stereo support, hot-plugging and actual A/V synchronization.
7. A live OBS scene with the installed plug-in, phone audio and PC microphone, source activation, mode changes and reconnection.
8. Registered camera compatibility with the user's target application. Installers and registration were not run; registry-free component and frame-transfer checks passed.

The virtual camera carries video only. Phone audio uses the OBS plug-in; there is no virtual microphone. The camera supports x64 DirectShow, not every Windows camera API.

## Verification limits

Portable-app startup has not been verified. The Node backend, browser UI, native writer and libobs module ran successfully as separate checks.

Synthetic checks validate formats, timing and component data transfer; they do not replace physical Android/USB/Wi-Fi/OBS live testing.
