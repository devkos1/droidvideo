# Building DroidVideo 0.2.0

Windows x64 is required for the native components. Prerequisites: JDK 17 or 21, Android SDK platform 36 and build tools, Node.js 22+ with npm, Python 3, Git, Visual Studio 2019/2022 C++ Build Tools with a Windows SDK, and OBS Studio 32.x x64. FFmpeg/ffprobe are needed only for the optional media check.

Set `JAVA_HOME` to the JDK and `ANDROID_HOME` to the Android SDK. The repository includes Gradle Wrapper.

Platform icons are checked into the repository. To regenerate the SVG/PNG/Windows ICO and Android adaptive/themed variants, run `python -X utf8 tools/build-icons.py` with Pillow installed. Windows resource editing remains enabled to embed the icon; code signing is disabled for this preview.

## Native SDK headers

The modified virtual-camera and libdshowcapture sources are already included in `native/vendor`; no regeneration is needed. The OBS plug-in also needs pinned libobs headers:

```powershell
git clone --depth 1 --branch 32.1.0 --filter=blob:none --sparse https://github.com/obsproject/obs-studio.git .build-deps/obs-studio
git -C .build-deps/obs-studio sparse-checkout set libobs deps/w32-pthreads
git -C .build-deps/obs-studio rev-parse HEAD
```

Expected commit: `5533a277e4400203b50114c993f89878d50a27b9`. The native build generates the OBS import library from the installed `obs.dll`. It compiles against OBS 32.1 headers; runtime module loading was checked against OBS 32.2.2.

## Build and package

```powershell
.\android\gradlew.bat -p android assembleDebug lintDebug
npm.cmd --prefix desktop ci
npm.cmd --prefix desktop test
.\tools\build-native.ps1
python -X utf8 tools/verify-native.py
python -X utf8 tools/verify-obs.py
npm.cmd --prefix desktop run dist
python -X utf8 tools/package-source.py
.\tools\package-components.ps1
```

Or use `tools/build.ps1` after prerequisites and SDK headers are ready. For a non-default OBS folder, pass `-ObsRoot` to `build-native.ps1` and set `OBS_ROOT` for `verify-obs.py`.

`build-native.ps1` uses the installed Visual Studio C++ toolchain, static C runtime, and Windows SDK libraries. It builds the OBS module, distinct DirectShow DLL, frame writer and registry-free verification executable. It does not install or register anything.

If Android incremental packaging is locked, an optional fresh output directory avoids touching the old build:

```powershell
.\android\gradlew.bat -p android -PoutputRoot=C:/YourProject/android/app/build/fresh assembleDebug lintDebug
```

Before desktop packaging, copy that build's `outputs/apk/debug/app-debug.apk` to the normal `android/app/build/outputs/apk/debug/app-debug.apk` location. The Windows app bundles that exact APK. Copy it to `dist/DroidVideo-0.2.0-Android.apk` too.

## Development and optional checks

```powershell
npm.cmd --prefix desktop start
node tools/verify-media.cjs
```

`verify-media.cjs` generates one-second 1080p60 and 4K30 H.264/AAC samples, passes them through the project's MPEG-TS mux, checks A/V timestamps, and decodes with FFmpeg. It prints a temporary sample directory. `node tools/preview-fixture.cjs <that-directory>` serves an explicitly labeled synthetic camera at `http://127.0.0.1:28186`. This fixture is excluded from the packaged app. The synthetic generator itself is not a real-time performance benchmark.

Production UI uses port 27186 and the OBS named pipe `DroidVideo.OBS`. Do not run the fixture alongside a production server: both use the same pipe. No native camera registration is needed for `verify-native.py`; it tests the COM class factory, supported formats, I420/NV12 conversion and all four rotations through shared memory. `verify-obs.py` loads the module in libobs without launching OBS or changing its settings; it does not verify a live scene.

The APK uses a debug signature and Windows binaries are unsigned. Release signing and credentials are deliberately outside the repository. Keep native corresponding source, build scripts and license files with binary distributions.
