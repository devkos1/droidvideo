"""Load the plug-in into libobs without launching or changing the user's OBS UI."""
from pathlib import Path
import ctypes as c
import os,sys,time,subprocess,struct,re,threading
root=Path(__file__).resolve().parent.parent
obs_root=Path(os.environ.get('OBS_ROOT',r'C:\Program Files\obs-studio'))
with os.add_dll_directory(str(obs_root/'bin/64bit')):
    obs=c.CDLL(str(obs_root/'bin/64bit/obs.dll'))
    obs.obs_startup.argtypes=[c.c_char_p,c.c_char_p,c.c_void_p];obs.obs_startup.restype=c.c_bool
    obs.obs_open_module.argtypes=[c.POINTER(c.c_void_p),c.c_char_p,c.c_char_p];obs.obs_open_module.restype=c.c_int
    obs.obs_init_module.argtypes=[c.c_void_p];obs.obs_init_module.restype=c.c_bool
    obs.obs_source_get_display_name.argtypes=[c.c_char_p];obs.obs_source_get_display_name.restype=c.c_char_p
    obs.obs_get_source_properties.argtypes=[c.c_char_p];obs.obs_get_source_properties.restype=c.c_void_p
    obs.obs_properties_get.argtypes=[c.c_void_p,c.c_char_p];obs.obs_properties_get.restype=c.c_void_p
    obs.obs_property_list_item_count.argtypes=[c.c_void_p];obs.obs_property_list_item_count.restype=c.c_size_t
    obs.obs_properties_destroy.argtypes=[c.c_void_p]
    assert obs.obs_startup(b'en-US',None,None)
    shut_down=False
    try:
        if len(sys.argv)>1:
            class VideoInfo(c.Structure):
                _fields_=[('graphics_module',c.c_char_p)]+[(n,c.c_uint32) for n in ['fps_num','fps_den','base_width','base_height','output_width','output_height','output_format','adapter']]+[('gpu_conversion',c.c_bool)]+[(n,c.c_int) for n in ['colorspace','range','scale_type']]
            obs.obs_add_data_path.argtypes=[c.c_char_p]
            obs.obs_add_data_path((str(obs_root/'data/libobs')+'/').encode())
            obs.obs_reset_video.argtypes=[c.POINTER(VideoInfo)];obs.obs_reset_video.restype=c.c_int
            info=VideoInfo(str(obs_root/'bin/64bit/libobs-d3d11.dll').encode(),60,1,1280,720,1280,720,2,0,True,2,1,1)
            assert obs.obs_reset_video(c.byref(info))==0
            class AudioInfo(c.Structure):
                _fields_=[('rate',c.c_uint32),('speakers',c.c_int)]
            obs.obs_reset_audio.argtypes=[c.POINTER(AudioInfo)];obs.obs_reset_audio.restype=c.c_bool
            assert obs.obs_reset_audio(c.byref(AudioInfo(48000,2)))
        module=c.c_void_p()
        result=obs.obs_open_module(c.byref(module),str(root/'native/build/droidvideo-obs.dll').encode(),str(root/'native/data').encode())
        assert result==0,result
        assert obs.obs_init_module(module)
        assert obs.obs_source_get_display_name(b'droidvideo_source')==b'DroidVideo Camera + Audio'
        properties=obs.obs_get_source_properties(b'droidvideo_source')
        assert properties
        audio=obs.obs_properties_get(properties,b'audio_source')
        assert obs.obs_property_list_item_count(audio)>=2
        obs.obs_properties_destroy(properties)
        obs.obs_source_create_private.argtypes=[c.c_char_p,c.c_char_p,c.c_void_p];obs.obs_source_create_private.restype=c.c_void_p
        obs.obs_source_release.argtypes=[c.c_void_p]
        obs.obs_source_update.argtypes=[c.c_void_p,c.c_void_p]
        obs.obs_source_get_settings.argtypes=[c.c_void_p];obs.obs_source_get_settings.restype=c.c_void_p
        obs.obs_data_get_string.argtypes=[c.c_void_p,c.c_char_p];obs.obs_data_get_string.restype=c.c_char_p
        obs.obs_data_get_int.argtypes=[c.c_void_p,c.c_char_p];obs.obs_data_get_int.restype=c.c_longlong
        obs.obs_data_release.argtypes=[c.c_void_p]
        callback=c.CFUNCTYPE(None,c.c_void_p,c.c_void_p,c.c_void_p)
        obs.obs_source_enum_active_sources.argtypes=[c.c_void_p,callback,c.c_void_p]
        obs.obs_source_async_unbuffered.argtypes=[c.c_void_p];obs.obs_source_async_unbuffered.restype=c.c_bool
        sources=[obs.obs_source_create_private(b'droidvideo_source',n,None) for n in (b'check one',b'check two')]
        assert all(sources)
        children=[]
        @callback
        def collect(parent,child,param): children.append(child)
        for source in sources:obs.obs_source_enum_active_sources(source,collect,None)
        assert children==[],children  # No in-process decoder or blocking transport.
        for source in sources:assert obs.obs_source_async_unbuffered(source)
        obs.obs_source_inc_showing.argtypes=[c.c_void_p]
        obs.obs_source_dec_showing.argtypes=[c.c_void_p]
        import socket,time
        listener=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
        listener.bind(('127.0.0.1',27190));listener.settimeout(2)
        for source in sources:obs.obs_source_inc_showing(source)
        assert listener.recv(100)==b'DroidVideoDecoded1'
        if len(sys.argv)>1:
            obs.obs_source_get_width.argtypes=[c.c_void_p];obs.obs_source_get_width.restype=c.c_uint32
            obs.obs_source_get_height.argtypes=[c.c_void_p];obs.obs_source_get_height.restype=c.c_uint32
            for height,fps in [(1080,60),(2160,30)]:
                width=1920 if height==1080 else 3840
                data=(Path(sys.argv[1])/f'{height}p{fps}.h264').read_bytes()
                starts=list(re.finditer(b'\x00\x00(?:\x00)?\x01',data));units=[];unit=[]
                for i,m in enumerate(starts):
                    kind=data[m.end()]&31
                    if kind==9 and unit:units.append(unit);unit=[]
                    unit.append((kind,data[m.start():starts[i+1].start() if i+1<len(starts) else len(data)]))
                if unit:units.append(unit)
                child=subprocess.Popen([str(root/'native/build/droidvideo-vcam-writer.exe'),'--h264'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                try:
                    for i,unit in enumerate(units):
                        payload=b''.join(n for _,n in unit);flags=(1 if any(k==5 for k,_ in unit) else 0)|(256 if i==0 else 0)
                        child.stdin.write(struct.pack('<8I',0x43485644,width,height,fps,0,flags,len(payload),0)+payload);child.stdin.flush();time.sleep(1/fps)
                    deadline=time.monotonic()+3
                    while time.monotonic()<deadline and obs.obs_source_get_width(sources[0])!=width:time.sleep(.02)
                    for source in sources:
                        actual=(obs.obs_source_get_width(source),obs.obs_source_get_height(source))
                        assert actual==(width,height),actual
                    print(f'PASS two active OBS sources receive decoded {width}x{height} frames')
                finally:
                    child.stdin.close();child.wait(timeout=5)
                    assert child.returncode==0,child.stderr.read()
                time.sleep(.15)
            class AudioData(c.Structure):
                _fields_=[('data',c.c_void_p*8),('frames',c.c_uint32),('timestamp',c.c_uint64)]
            capture=c.CFUNCTYPE(None,c.c_void_p,c.c_void_p,c.POINTER(AudioData),c.c_bool)
            captured=[]
            @capture
            def audio_received(param,source,data,muted):
                if not muted and data.contents.frames:captured.append(data.contents.frames)
            obs.obs_source_add_audio_capture_callback.argtypes=[c.c_void_p,capture,c.c_void_p]
            obs.obs_source_remove_audio_capture_callback.argtypes=[c.c_void_p,capture,c.c_void_p]
            obs.obs_source_add_audio_capture_callback(sources[0],audio_received,None)
            audio_child=subprocess.Popen([str(root/'native/build/droidvideo-audio-bridge.exe')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            try:
                assert audio_child.stdout.read(1)==b'R'
                data=(Path(sys.argv[1])/'1080p60.aac').read_bytes();at=0;index=0
                while at<len(data):
                    size=((data[at+3]&3)<<11)|(data[at+4]<<3)|(data[at+5]>>5)
                    audio_child.stdin.write(struct.pack('<IIQ',0x41415644,size,index*1024*1000000//48000)+data[at:at+size]);audio_child.stdin.flush();at+=size;index+=1;time.sleep(1024/48000)
                time.sleep(.1);assert sum(captured)>30000,sum(captured)
                print('PASS phone PCM reaches the OBS audio capture callback')
            finally:
                audio_child.stdin.close();audio_child.wait(timeout=5)
                obs.obs_source_remove_audio_capture_callback(sources[0],audio_received,None)
                assert audio_child.returncode==0,audio_child.stderr.read()
        for source in sources:obs.obs_source_dec_showing(source)
        listener.close()
        for _ in range(5):obs.obs_source_update(sources[0],None)
        import time
        started=time.monotonic()
        for source in sources:obs.obs_source_release(source)
        # Headless libobs has no graphics/audio thread, so its normal wait helper
        # returns early. Drain parent destruction, then the released child, before
        # shutdown enumerates live sources. This avoids a test-only teardown race.
        task=c.CFUNCTYPE(None,c.c_void_p)
        @task
        def barrier(param):pass
        obs.obs_queue_task.argtypes=[c.c_int,task,c.c_void_p,c.c_bool]
        for _ in range(2):obs.obs_queue_task(3,barrier,None,True)
        obs.obs_shutdown()
        shut_down=True
        elapsed=time.monotonic()-started
        assert elapsed<3,elapsed
        print(f'PASS isolated decoding, source activation heartbeat, unbuffered video, repeated updates and idle destruction ({elapsed:.3f}s)')
        print('PASS libobs module load, source registration and audio properties (without installing the plug-in)')
    finally:
        if not shut_down:obs.obs_shutdown()
