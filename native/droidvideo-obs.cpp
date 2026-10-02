// GPL-2.0-or-later. OBS receives already-decoded frames; no FFmpeg decoder lives in OBS.
#include <winsock2.h>
#include <obs-module.h>
#include <atomic>
#include <thread>
#include <string>
#include <vector>
#include <exception>
#include "shared-memory-queue.h"
#include "tiny-nv12-scale.h"
#include "audio-queue.hpp"
OBS_DECLARE_MODULE()
OBS_MODULE_USE_DEFAULT_LOCALE("droidvideo-obs","en-US")
MODULE_EXPORT const char *obs_module_description(){return "DroidVideo camera and audio with isolated decoding";}
struct DroidSource {
 obs_source_t *owner=nullptr,*mic=nullptr;HANDLE stop=nullptr;std::thread worker;std::atomic<bool> phone{true};
};
static void audioCapture(void *opaque,obs_source_t *,const audio_data *data,bool muted){
 auto*s=(DroidSource*)opaque;if(muted)return;obs_audio_info info{};if(!obs_get_audio_info(&info))return;
 obs_source_audio out{};for(int i=0;i<MAX_AV_PLANES;i++)out.data[i]=data->data[i];out.frames=data->frames;out.timestamp=data->timestamp;out.format=AUDIO_FORMAT_FLOAT_PLANAR;out.speakers=info.speakers;out.samples_per_sec=info.samples_per_sec;obs_source_output_audio(s->owner,&out);
}
static void releaseMic(DroidSource*s){if(!s->mic)return;obs_source_remove_audio_capture_callback(s->mic,audioCapture,s);obs_source_remove_active_child(s->owner,s->mic);obs_source_release(s->mic);s->mic=nullptr;}
static void run(DroidSource*s){
 SOCKET socket=::socket(AF_INET,SOCK_DGRAM,IPPROTO_UDP);sockaddr_in address{};address.sin_family=AF_INET;address.sin_port=htons(27190);address.sin_addr.s_addr=htonl(INADDR_LOOPBACK);
 video_queue_t *video=nullptr;AudioQueue audio;uint64_t audioSequence=0,lastHello=0,lastFrame=0;std::vector<uint8_t> pixels;nv12_scale_t scale{};uint32_t w=0,h=0;uint64_t interval=0;
 try {while(WaitForSingleObject(s->stop,5)==WAIT_TIMEOUT){
  uint64_t now=GetTickCount64();bool active=obs_source_active(s->owner)||obs_source_showing(s->owner);
  if(active&&now-lastHello>=500){const char hello[]="DroidVideoDecoded1";sendto(socket,hello,sizeof(hello)-1,0,(sockaddr*)&address,sizeof(address));lastHello=now;}
  if(!active){if(video){video_queue_close(video);video=nullptr;}continue;}
  if(!video)video=video_queue_open();
  if(video){
   auto state=video_queue_state(video);
   if(state==SHARED_QUEUE_STATE_STOPPING||state==SHARED_QUEUE_STATE_INVALID){video_queue_close(video);video=nullptr;}
   else if(state==SHARED_QUEUE_STATE_READY){
    uint32_t nw,nh;uint64_t ni;video_queue_get_info(video,&nw,&nh,&ni);
    if(nw>=2&&nh>=2&&nw<=4096&&nh<=4096&&!(nw&1)&&!(nh&1)){
     if(w!=nw||h!=nh){w=nw;h=nh;pixels.resize(size_t(w)*h*3/2);nv12_scale_init(&scale,TARGET_FORMAT_NV12,w,h,w,h);}
     uint64_t timestamp=0;if(video_queue_read_latest(video,&scale,pixels.data(),&timestamp)){
      obs_source_frame frame{};frame.data[0]=pixels.data();frame.data[1]=pixels.data()+size_t(w)*h;frame.linesize[0]=frame.linesize[1]=w;frame.width=w;frame.height=h;frame.format=VIDEO_FORMAT_NV12;frame.timestamp=timestamp*100;
      video_format_get_parameters(VIDEO_CS_709,VIDEO_RANGE_PARTIAL,frame.color_matrix,frame.color_range_min,frame.color_range_max);obs_source_output_video(s->owner,&frame);lastFrame=now;
     }
    }
   }
  }
  if(lastFrame&&now-lastFrame>1500){obs_source_output_video(s->owner,nullptr);lastFrame=0;if(video){video_queue_close(video);video=nullptr;}}
  for(auto &block:audio.read(audioSequence)){if(!s->phone)continue;LARGE_INTEGER f,q;QueryPerformanceFrequency(&f);QueryPerformanceCounter(&q);auto ns=uint64_t(q.QuadPart*1000000000.0/f.QuadPart);if(block.timestamp>ns||ns-block.timestamp>300000000)continue;
   obs_source_audio out{};out.data[0]=(uint8_t*)block.samples;out.frames=block.frames;out.speakers=block.channels==1?SPEAKERS_MONO:SPEAKERS_STEREO;out.samples_per_sec=48000;out.format=AUDIO_FORMAT_16BIT;out.timestamp=block.timestamp;obs_source_output_audio(s->owner,&out);
  }
 }
 }catch(const std::exception&e){blog(LOG_ERROR,"DroidVideo output stopped: %s",e.what());}
 if(video)video_queue_close(video);if(socket!=INVALID_SOCKET)closesocket(socket);
}
static void update(void *opaque,obs_data_t *settings){auto*s=(DroidSource*)opaque;releaseMic(s);std::string selected=obs_data_get_string(settings,"audio_source");s->phone=selected=="phone";
 if(selected.rfind("pc:",0)==0){auto*c=obs_data_create();obs_data_set_string(c,"device_id",selected.c_str()+3);obs_data_set_bool(c,"use_device_timing",false);s->mic=obs_source_create_private("wasapi_input_capture","DroidVideo PC microphone",c);obs_data_release(c);if(s->mic){obs_source_set_audio_mixers(s->mic,0);obs_source_add_active_child(s->owner,s->mic);obs_source_add_audio_capture_callback(s->mic,audioCapture,s);}}
}
static const char*name(void*){return "DroidVideo Camera + Audio";}
static void*create(obs_data_t*settings,obs_source_t*owner){
 DroidSource*s=nullptr;
 try{s=new DroidSource();s->owner=owner;s->stop=CreateEventW(nullptr,TRUE,FALSE,nullptr);if(!s->stop){delete s;return nullptr;}obs_source_set_async_unbuffered(owner,true);update(s,settings);s->worker=std::thread(run,s);return s;}
 catch(const std::exception&e){blog(LOG_ERROR,"DroidVideo source could not start: %s",e.what());if(s){releaseMic(s);if(s->stop)CloseHandle(s->stop);delete s;}return nullptr;}
}
static void destroy(void*opaque){auto*s=(DroidSource*)opaque;SetEvent(s->stop);s->worker.join();releaseMic(s);CloseHandle(s->stop);delete s;}
static void defaults(obs_data_t*s){obs_data_set_default_string(s,"audio_source","phone");}
static obs_properties_t*properties(void*){auto*p=obs_properties_create();auto*list=obs_properties_add_list(p,"audio_source",obs_module_text("AudioSource"),OBS_COMBO_TYPE_LIST,OBS_COMBO_FORMAT_STRING);obs_property_list_add_string(list,obs_module_text("PhoneAudio"),"phone");obs_property_list_add_string(list,obs_module_text("NoAudio"),"off");
 auto*wasapi=obs_get_source_properties("wasapi_input_capture");if(wasapi){auto*devices=obs_properties_get(wasapi,"device_id");if(devices)for(size_t i=0;i<obs_property_list_item_count(devices);i++){std::string id="pc:";id+=obs_property_list_item_string(devices,i);obs_property_list_add_string(list,obs_property_list_item_name(devices,i),id.c_str());}obs_properties_destroy(wasapi);}obs_properties_add_text(p,"help",obs_module_text("Help"),OBS_TEXT_INFO);return p;}
static void children(void*opaque,obs_source_enum_proc_t cb,void*param){auto*s=(DroidSource*)opaque;if(s->mic)cb(s->owner,s->mic,param);}
void obs_module_unload(){WSACleanup();}
bool obs_module_load(){WSADATA data;if(WSAStartup(MAKEWORD(2,2),&data))return false;obs_source_info info{};info.id="droidvideo_source";info.type=OBS_SOURCE_TYPE_INPUT;info.output_flags=OBS_SOURCE_ASYNC_VIDEO|OBS_SOURCE_AUDIO;info.get_name=name;info.create=create;info.destroy=destroy;info.update=update;info.get_defaults=defaults;info.get_properties=properties;info.enum_active_sources=children;obs_register_source(&info);return true;}
