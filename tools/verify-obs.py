"""Load the plug-in into libobs without launching or changing the user's OBS UI."""
from pathlib import Path
import ctypes as c
import os
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
        # Load OBS's real FFmpeg source in this isolated libobs process.
        ffmpeg=c.c_void_p()
        assert obs.obs_open_module(c.byref(ffmpeg),str(obs_root/'obs-plugins/64bit/obs-ffmpeg.dll').encode(),str(obs_root/'data/obs-plugins/obs-ffmpeg').encode())==0
        assert obs.obs_init_module(ffmpeg)
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
        assert len(children)==2 and children[0]==children[1],children
        child=children[0];settings=obs.obs_source_get_settings(child)
        assert obs.obs_data_get_string(settings,b'input').startswith(b'udp://127.0.0.1:')
        assert obs.obs_data_get_int(settings,b'buffering_mb')==0
        assert obs.obs_source_async_unbuffered(child)
        obs.obs_data_release(settings)
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
        print(f'PASS shared decoder, bounded loopback transport, unbuffered video, repeated updates and idle destruction ({elapsed:.3f}s)')
        print('PASS libobs module load, source registration and audio properties (without installing the plug-in)')
    finally:
        if not shut_down:obs.obs_shutdown()
