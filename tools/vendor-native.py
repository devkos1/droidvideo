from pathlib import Path
import shutil
root=Path.cwd();src=root/'.build-deps/obs-studio';dst=root/'native/vendor'
(dst/'virtualcam').mkdir(parents=True,exist_ok=True)
for name in ['virtualcam-filter.cpp','virtualcam-filter.hpp','virtualcam-module.cpp','sleepto.c','sleepto.h']:
    data=(src/'plugins/win-dshow/virtualcam-module'/name).read_text()
    data=data.replace('OBS Virtual Camera','DroidVideo Camera').replace('obs-virtualcam.txt','droidvideo-virtualcam.txt')
    data=data.replace('in_obs = !!wcsstr(file, obs_process);','in_obs = false; // Separate DroidVideo queue: safe to capture in OBS.')
    if name=='virtualcam-filter.cpp':
        data=data.replace('format = VideoFormat::NV12;', '''format = VideoFormat::NV12;
    AddVideoFormat(VideoFormat::NV12, 1920, 1080, 166666);
    AddVideoFormat(VideoFormat::NV12, 3840, 2160, 333333);
    AddVideoFormat(VideoFormat::NV12, 1920, 1080, 333333);
    SetVideoFormat(VideoFormat::NV12, 1920, 1080, 333333);
    obs_cx = 1920; obs_cy = 1080; obs_interval = 333333;''',1)
    (dst/'virtualcam'/name).write_text(data)
for folder in ['obs-shared-memory-queue','obs-tiny-nv12-scale']:
    for p in (src/'shared'/folder).glob('*'):
        if p.suffix in ['.c','.h']:
            data=p.read_text().replace('OBSVirtualCamVideo','DroidVideoVirtualCamVideo')
            (dst/'virtualcam'/p.name).write_text(data)
shutil.copytree(src/'deps/libdshowcapture/src/source',dst/'libdshowcapture/source',dirs_exist_ok=True)
shutil.copy(src/'deps/libdshowcapture/src/dshowcapture.hpp',dst/'libdshowcapture/dshowcapture.hpp')
for name in ['util/windows/WinHandle.hpp','util/threading-windows.h']:
    p=dst/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy(src/'libobs'/name,p)
shutil.copy(src/'COPYING',root/'native/COPYING-GPL-2.0.txt')
shutil.copy(src/'deps/libdshowcapture/src/COPYING',root/'native/COPYING-LGPL-2.1.txt')
