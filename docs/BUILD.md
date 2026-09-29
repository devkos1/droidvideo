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

The script builds/lints Android, runs desktop tests, builds and checks native components, creates corresponding source, prepares bundled ADB/components/notices, then packages and checks Windows. Outputs: `dist/DroidVideo-0.3.0-Android.apk` and `dist/windows/DroidVideo-0.3.0-Windows.exe`.

`prepare-bundle.ps1` downloads the pinned official ADB archive and verifies SHA-256 before extraction. Only ADB, its two USB libraries and notices are included. The EXE also contains the OBS plug-in, DirectShow camera, frame writer, installer script and source archive. No separate component ZIP is needed. Internet is needed at build time; app setup does not download these components.

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

Native checks do not install/register a camera or modify OBS. The benchmark measures raw-pipe conversion/rotation/shared-memory throughput, not phone or OBS performance. `preview-fixture.cjs` serves explicitly labelled synthetic video on port 28186; it is excluded from the packaged app. Production uses port 27186. Do not run fixture and production together: both use the OBS pipe.

To regenerate icons, install Pillow and run `python -X utf8 tools/build-icons.py`. Keep licenses, modified native source and corresponding build scripts with binary redistributions. **Licenses & source** in the app opens the bundled copy.
