# Native component provenance

The virtual camera is derived from OBS Studio 32.1.0, commit `5533a277e4400203b50114c993f89878d50a27b9` (https://github.com/obsproject/obs-studio), GPL-2.0-or-later. The shared-memory queue, NV12 scaler, virtual-camera filter and Windows utility headers retain upstream source. DroidVideo changes the device CLSID, friendly name and shared-memory name; permits capturing its independent queue inside OBS; and replaces the idle image with a plain black frame. It does not register, replace, or write to OBS Virtual Camera.

libdshowcapture commit `8878638324393815512f802640b0d5ce940161f1` (https://github.com/obsproject/libdshowcapture) is LGPL-2.1-or-later. Its source and license are included. The native OBS plug-in and virtual-camera writer are GPL-2.0-or-later. See COPYING-GPL-2.0.txt and COPYING-LGPL-2.1.txt. Native sources are distributed with the binaries; recompile with tools/build-native.ps1 to replace the linked library.

The Android and original Electron application sources remain under the root MIT license. Distributing the complete package also requires these native component notices and corresponding source. The Windows application includes them under **Licenses & source**.
