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
        print('PASS libobs module load, source registration and audio properties (without installing the plug-in)')
    finally:
        obs.obs_shutdown()
