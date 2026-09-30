# DroidVideo — Free Android Webcam for Windows and OBS

<img src="assets/branding/icon.svg" width="96" height="96" alt="DroidVideo camera icon">

**Use your Android phone as a Windows camera. Free. Open source. No watermark.**

Stream your Android camera and microphone over USB or Wi-Fi to OBS Studio or a Windows virtual camera. Choose 4K30 or 1080p60 on supported devices.

[Project website](https://devkos1.github.io/droidvideo/) · Made by **devkos1**. English by default; [magyar útmutató](docs/SETUP.hu.md).

## Download just two files

[**Download DroidVideo 0.3.2**](https://github.com/devkos1/droidvideo/releases/tag/v0.3.2)

- **Android APK** → put this on your phone.
- **Windows EXE** → open this on your PC. ADB, the OBS plug-in and the virtual camera are already inside. No extra ZIP or command line needed.

You need Android 9+ and Windows 10/11 (64-bit). For OBS streaming, install OBS Studio 32.x (64-bit) if you do not already have it.

## Guided setup and background mode

When the Windows app opens, choose **OBS Studio** or **Other camera app** in the setup window. Follow the PC installation and phone connection steps. You can reopen the guide from the sidebar.

Once video is running, click **Run in background**. DroidVideo stays in the Windows system tray and stops decoding its own preview; OBS and virtual camera output continue. Double-click the tray icon to return, or right-click it to quit. **Pause preview** does the same preview saving while keeping the controls visible.

If Android installation reports insufficient storage, free internal space in **Android Settings → Storage**, then retry. DroidVideo never removes your files to make room. If the phone app is missing, install it before connecting.

## Get your picture on the PC

1. Install the APK on your phone. Open DroidVideo and allow camera and microphone access. Android may ask you to allow installation from your browser or file manager.
2. Open the Windows EXE.
3. Connect your phone using a USB data cable. Turn on **USB debugging** and accept the permission prompt on your phone.
4. In the Windows app, choose your phone, click **Connect**, then **Start video**.

**Where is USB debugging?** Open the phone's Settings → About phone and tap **Build number** seven times. Go back, find **Developer options**, then turn on **USB debugging**. Names vary by phone. Some phones need their manufacturer's USB driver; if Windows cannot see yours, use Wi-Fi instead.

**Prefer Wi-Fi?** Connect both devices to the same Wi-Fi. In the phone app, turn on Wi-Fi sharing and copy its pairing link. In the Windows app, choose Wi-Fi, paste the link and click Connect. DroidVideo measures the connection and recommends a quality setting.

## Updating from an older version

Download the new APK and EXE. Close OBS completely, open the new EXE, then click **Setup → Install OBS plug-in** before reopening OBS. This installs the latency and freeze fixes. You can keep the existing compatible virtual camera installed; enabling it no longer overwrites its DLL.

## Use it in OBS

1. Close OBS. In DroidVideo, click **Setup** in the OBS section, then **Install OBS plug-in**. Accept the Windows permission prompt.
2. Reopen OBS. Under **Sources**, click **+ → DroidVideo Camera + Audio**.
3. Start video in DroidVideo. Your picture appears automatically.

For sound, select a phone microphone in DroidVideo. In the OBS source settings, choose phone sound or a PC microphone. The DroidVideo preview itself is silent.

**For 4K, use this OBS source and leave Windows virtual camera off.** This avoids extra picture copying. You can rotate the image in OBS by right-clicking the source → Transform.

## Use it in another camera app

Start video, then click **Enable** under **Windows virtual camera**. The first click installs the camera too; accept the Windows permission prompt. Open or restart your video app and choose **DroidVideo Camera**.

The virtual camera carries picture only. Use your PC microphone for sound in other apps. It supports 64-bit DirectShow camera apps; not every Windows app supports this camera type. Keep DroidVideo running while using it.

## A few useful tips

- Choose 1080p60 for smooth motion, or 4K30 for more detail when your phone supports it. If the picture stutters, try 1080p, USB, or the direct OBS source.
- Change lenses, zoom, focus and microphone in either DroidVideo app. Tap the preview to focus.
- To darken the phone, tap **Dim screen**. Hold the dark screen to bring the controls back. You can also press the phone's power button; test this on your phone before a long stream.
- Keep pairing links private. Your video and sound stay on your devices and local network.

## Preview status

This is an early release. Device compatibility and smooth 4K depend on your phone, cable, Wi-Fi and PC. [Test results and known limits](docs/TESTING.md).

The Windows build is currently **unsigned**. Windows may show an unknown-publisher or SmartScreen warning. The author name does not replace a trusted digital signature. The Android APK uses a development signature. Download only from this repository; do not turn off system security protections.

## For contributors

[Build instructions](docs/BUILD.md) · [Bundled software](docs/THIRD-PARTY.md) · [Native licenses](native/THIRD-PARTY.md)

Original DroidVideo code is MIT licensed. Native components include GPL-2.0-or-later and LGPL-2.1-or-later code. Their notices and matching source are inside the Windows EXE: click **Licenses & source** in the app. Preserve the corresponding source and notices when redistributing.
