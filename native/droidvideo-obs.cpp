// GPL-2.0-or-later. Shared low-latency decoder over loopback-only UDP.
#include <obs-module.h>
#include <string>
#include <mutex>
OBS_DECLARE_MODULE()
OBS_MODULE_USE_DEFAULT_LOCALE("droidvideo-obs","en-US")
MODULE_EXPORT const char *obs_module_description(){return "DroidVideo USB/Wi-Fi camera and microphone over a private loopback transport";}
struct DroidSource {obs_source_t *owner=nullptr,*video=nullptr,*mic=nullptr;std::string audio;};
static void audioCapture(void *opaque,obs_source_t *,const struct audio_data *data,bool muted){
    auto *s=(DroidSource*)opaque;if(muted)return;obs_audio_info info{};if(!obs_get_audio_info(&info))return;
    obs_source_audio out{};for(int i=0;i<MAX_AV_PLANES;i++)out.data[i]=data->data[i];out.frames=data->frames;out.timestamp=data->timestamp;
    out.format=AUDIO_FORMAT_FLOAT_PLANAR;out.speakers=info.speakers;out.samples_per_sec=info.samples_per_sec;obs_source_output_audio(s->owner,&out);
}
static void releaseChild(DroidSource *s,obs_source_t *&child){if(!child)return;obs_source_remove_audio_capture_callback(child,audioCapture,s);obs_source_remove_active_child(s->owner,child);obs_source_release(child);child=nullptr;}
static std::mutex transportMutex;
static obs_weak_source_t *transport=nullptr;
static obs_source_t *acquireVideo(){
    std::lock_guard<std::mutex> guard(transportMutex);
    if(transport){auto *existing=obs_weak_source_get_source(transport);if(existing)return existing;obs_weak_source_release(transport);transport=nullptr;}
    auto *config=obs_data_create();obs_data_set_bool(config,"is_local_file",false);
    // UDP reads honor FFmpeg's interruption callback; a blocked named-pipe
    // ReadFile could otherwise hold OBS's source-destruction thread indefinitely.
    obs_data_set_string(config,"input","udp://127.0.0.1:27187?localaddr=127.0.0.1&fifo_size=4096&overrun_nonfatal=1&buffer_size=1048576&timeout=1000000");
    obs_data_set_string(config,"input_format","mpegts");
    obs_data_set_int(config,"buffering_mb",0);obs_data_set_int(config,"reconnect_delay_sec",1);
    obs_data_set_bool(config,"hw_decode",true);obs_data_set_bool(config,"seekable",false);
    obs_data_set_bool(config,"restart_on_activate",false);obs_data_set_bool(config,"close_when_inactive",true);
    obs_data_set_string(config,"ffmpeg_options","probesize=32768 analyzeduration=100000 max_delay=0");
    auto *video=obs_source_create_private("ffmpeg_source","DroidVideo shared video",config);obs_data_release(config);
    if(video){obs_source_set_audio_mixers(video,0);obs_source_set_async_unbuffered(video,true);transport=obs_source_get_weak_source(video);}
    return video;
}
static void update(void *opaque,obs_data_t *settings){
    auto *s=(DroidSource*)opaque;
    if(s->video&&s->audio=="phone")obs_source_remove_audio_capture_callback(s->video,audioCapture,s);
    releaseChild(s,s->mic);s->audio=obs_data_get_string(settings,"audio_source");
    // Audio changes and multiple scenes reuse one decoder instead of rebuilding
    // and synchronously joining a decoder on OBS's UI thread.
    if(!s->video){s->video=acquireVideo();if(s->video)obs_source_add_active_child(s->owner,s->video);}
    if(s->video&&s->audio=="phone")obs_source_add_audio_capture_callback(s->video,audioCapture,s);
    if(s->audio.rfind("pc:",0)==0){auto *config=obs_data_create();obs_data_set_string(config,"device_id",s->audio.c_str()+3);obs_data_set_bool(config,"use_device_timing",false);s->mic=obs_source_create_private("wasapi_input_capture","DroidVideo PC microphone",config);obs_data_release(config);if(s->mic){obs_source_set_audio_mixers(s->mic,0);obs_source_add_active_child(s->owner,s->mic);obs_source_add_audio_capture_callback(s->mic,audioCapture,s);}}
}
void obs_module_unload(){std::lock_guard<std::mutex> guard(transportMutex);if(transport){obs_weak_source_release(transport);transport=nullptr;}}
static const char *name(void*){return "DroidVideo Camera + Audio";}
static void *create(obs_data_t *settings,obs_source_t *owner){auto *s=new DroidSource();s->owner=owner;update(s,settings);return s;}
static void destroy(void *opaque){auto *s=(DroidSource*)opaque;releaseChild(s,s->mic);releaseChild(s,s->video);delete s;}
static void render(void *opaque,gs_effect_t*){auto *s=(DroidSource*)opaque;if(s->video)obs_source_video_render(s->video);}
static uint32_t width(void *opaque){auto *s=(DroidSource*)opaque;return s->video?obs_source_get_width(s->video):1920;}
static uint32_t height(void *opaque){auto *s=(DroidSource*)opaque;return s->video?obs_source_get_height(s->video):1080;}
static void defaults(obs_data_t *settings){obs_data_set_default_string(settings,"audio_source","phone");}
static obs_properties_t *properties(void*){
    auto *p=obs_properties_create();auto *list=obs_properties_add_list(p,"audio_source",obs_module_text("AudioSource"),OBS_COMBO_TYPE_LIST,OBS_COMBO_FORMAT_STRING);
    obs_property_list_add_string(list,obs_module_text("PhoneAudio"),"phone");obs_property_list_add_string(list,obs_module_text("NoAudio"),"off");
    auto *wasapi=obs_get_source_properties("wasapi_input_capture");if(wasapi){auto *devices=obs_properties_get(wasapi,"device_id");if(devices)for(size_t i=0;i<obs_property_list_item_count(devices);i++){std::string id="pc:";id+=obs_property_list_item_string(devices,i);std::string label="PC · ";label+=obs_property_list_item_name(devices,i);obs_property_list_add_string(list,label.c_str(),id.c_str());}obs_properties_destroy(wasapi);}
    obs_properties_add_text(p,"help",obs_module_text("Help"),OBS_TEXT_INFO);return p;
}
static void children(void *opaque,obs_source_enum_proc_t cb,void *param){auto*s=(DroidSource*)opaque;if(s->video)cb(s->owner,s->video,param);if(s->mic)cb(s->owner,s->mic,param);}
bool obs_module_load(){obs_source_info info{};info.id="droidvideo_source";info.type=OBS_SOURCE_TYPE_INPUT;info.output_flags=OBS_SOURCE_VIDEO|OBS_SOURCE_AUDIO|OBS_SOURCE_CUSTOM_DRAW;info.get_name=name;info.create=create;info.destroy=destroy;info.update=update;info.get_defaults=defaults;info.get_properties=properties;info.video_render=render;info.get_width=width;info.get_height=height;info.enum_active_sources=children;obs_register_source(&info);return true;}
