# Building DroidVideo

Windows x64 is required. Install JDK 17 or 21, Android SDK platform 36, Node.js 22+ with npm, Python 3, Git, Visual Studio 2019/2022 C++ Build Tools with a Windows SDK, and OBS Studio 32.x x64. Set `JAVA_HOME` and `ANDROID_HOME`. FFmpeg/ffprobe are needed only for the media verification tool.

## Native headers

Vendored camera sources are already included. Fetch the pinned OBS headers:

```powershell
git clone --depth 1 --branch 32.1.0 --filter=blob:none --sparse https://github.com/obsproject/obs-studio.git .build-deps/obs-studio
git -C .build-deps/obs-studio sparse-checkout set libobs deps/w32-pthreads
```

Expected commit: `5533a277e4400203b50114c993f89878d50a27b9`. `build-native.ps1` creates an import library from the installed OBS DLL. Pass `-ObsRoot` for a non-default OBS folder; set `OBS_ROOT` for `verify-obs.py`.

## Build the two downloads

```powershell
.\tools\build.ps1
```

The script builds/lints Android, runs desktop tests, builds and checks native components, creates corresponding source, prepares bundled ADB/components/notices, then packages and checks Windows. Outputs: `dist/DroidVideo-0.3.3-Android.apk` and `dist/windows/DroidVideo-0.3.3-Windows.exe`.

`prepare-bundle.ps1` downloads the pinned official ADB archive and verifies SHA-256 before extraction. Only ADB, its two USB libraries and notices are included. The unmodified standard VB-CABLE package is also downloaded from VB-Audio, verified by SHA-256 and bundled with attribution and its donation/license link. See [VB-CABLE details](VB-CABLE.md). The EXE also contains the OBS plug-in, DirectShow camera, frame writer, installer script and source archive. No separate component ZIP is needed. Internet is needed at build time; app setup does not download these components.

For a fresh Android output directory, pass `-PoutputRoot=C:/YourProject/android/app/build/fresh` to Gradle, then copy its APK to `android/app/build/outputs/apk/debug/app-debug.apk` before packaging Windows.

## Signing

The default preview is unsigned. `author: devkos1` sets application metadata; only a trusted signing identity can establish the verified publisher. Never add signing credentials to the repository.

When a valid code-signing certificate is available, use electron-builder's `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables and set `DROIDVIDEO_SIGN=1`. The build enables signing for the application and portable launcher. Sign native binaries and the installer script with the same trusted identity before preparing the bundle. A new signed file can still receive SmartScreen reputation warnings. See Microsoft's [code-signing guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options).

The Android APK currently uses the existing development key for update compatibility. Use a persistent private release key for production distribution and retain it securely for future updates.

## Development and verification

```powershell
npm.cmd --prefix desktop start
npm.cmd --prefix desktop test
python -X utf8 tools/verify-native.py
python -X utf8 tools/verify-obs.py
node tools/verify-media.cjs
python -X utf8 tools/benchmark-vcam.py
```

Native checks do not install/register a camera or change OBS settings. The benchmark measures raw-pipe conversion/rotation/shared-memory throughput, not phone or OBS performance. Do not run shared-memory tests while a production DroidVideo output is running. The development preview fixture uses HTTP 28486 and heartbeat 28490; production uses 27186 and 27190.

The OBS source receives decoded NV12 and PCM from bounded shared-memory queues. H.264 and AAC decoding run in separate helper processes outside OBS. The video helper is shared with the DirectShow camera; active OBS sources request it automatically through a small localhost heartbeat. No encoded video is sent over UDP and no FFmpeg video decoder runs inside the plug-in. The old named pipe is retained only for older plug-ins.

To regenerate icons, install Pillow and run `python -X utf8 tools/build-icons.py`. Keep licenses, modified native source and corresponding build scripts with binary redistributions. **Licenses & source** in the app opens the bundled copy.

Run `node tools/verify-media.cjs` to generate fixtures, then `python tools/verify-obs.py <fixture-directory>` to check two active sources with 1080p/4K video and phone PCM in an isolated libobs process. Without a fixture argument it checks source creation, heartbeat, updates and idle shutdown. `python tools/verify-audio.py` checks mono/stereo decoding, format changes and malformed packets without installing or selecting an audio device. Legacy `verify-obs-transport.cjs` only tests the retired encoded UDP path.

`python tools/verify-h264.py <fixture-directory>` compares D3D11 and forced software decode with the fixtures from `verify-media.cjs`. Hardware assertions require a supported GPU. Set `DROIDVIDEO_SOFTWARE_DECODE=1` for decoder troubleshooting; normal startup tries D3D11 and falls back during format negotiation.
