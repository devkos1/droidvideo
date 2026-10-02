// MIT. Decode phone AAC outside OBS; optionally feed the standard VB-CABLE playback endpoint.
#include <windows.h>
#include <mfapi.h>
#include <mfidl.h>
#include <mftransform.h>
#include <mferror.h>
#include <wmcodecdsp.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <functiondiscoverykeys_devpkey.h>
#include <propvarutil.h>
#include <wrl/client.h>
#include <string>
#include <vector>
#include <algorithm>
#include <cstdio>
#include <stdexcept>
#include <fcntl.h>
#include <io.h>
#include "audio-queue.hpp"
using Microsoft::WRL::ComPtr;
static void check(HRESULT hr){if(FAILED(hr)){char s[100];sprintf_s(s,"Windows audio operation failed (0x%08lx).",(unsigned long)hr);throw std::runtime_error(s);}}
static bool readAll(void*p,size_t length){while(length){DWORD got;if(!ReadFile(GetStdHandle(STD_INPUT_HANDLE),p,DWORD(length),&got,nullptr)||!got)return false;p=(BYTE*)p+got;length-=got;}return true;}
static void writeAll(const void*p,size_t n){while(n){DWORD done;if(!WriteFile(GetStdHandle(STD_OUTPUT_HANDLE),p,DWORD(n),&done,nullptr)||!done)throw std::runtime_error("Audio pipe closed.");p=(const BYTE*)p+done;n-=done;}}
static uint64_t clockNs(){LARGE_INTEGER f,q;QueryPerformanceFrequency(&f);QueryPerformanceCounter(&q);return uint64_t(q.QuadPart*1000000000.0/f.QuadPart);}
static std::wstring property(IMMDevice*d,REFPROPERTYKEY key){ComPtr<IPropertyStore>store;check(d->OpenPropertyStore(STGM_READ,&store));PROPVARIANT value;PropVariantInit(&value);check(store->GetValue(key,&value));std::wstring text=value.vt==VT_LPWSTR?value.pwszVal:L"";PropVariantClear(&value);return text;}
static std::string json(const std::wstring&s){int n=WideCharToMultiByte(CP_UTF8,0,s.data(),int(s.size()),nullptr,0,nullptr,nullptr);std::string u(n,'\0');WideCharToMultiByte(CP_UTF8,0,s.data(),int(s.size()),u.data(),n,nullptr,nullptr);std::string r="\"";for(unsigned char ch:u){if(ch=='"'||ch=='\\')r+='\\';if(ch<32)r+=' ';else r+=ch;}return r+'"';}
struct Endpoint {ComPtr<IMMDevice> device;std::wstring id,name;bool capture,cable;};
static std::vector<Endpoint> endpoints(){ComPtr<IMMDeviceEnumerator>e;check(CoCreateInstance(__uuidof(MMDeviceEnumerator),nullptr,CLSCTX_ALL,IID_PPV_ARGS(&e)));std::vector<Endpoint> out;for(auto flow:{eRender,eCapture}){ComPtr<IMMDeviceCollection>list;check(e->EnumAudioEndpoints(flow,DEVICE_STATE_ACTIVE,&list));UINT count;check(list->GetCount(&count));for(UINT i=0;i<count;i++){Endpoint ep;check(list->Item(i,&ep.device));LPWSTR id;check(ep.device->GetId(&id));ep.id=id;CoTaskMemFree(id);ep.name=property(ep.device.Get(),PKEY_Device_FriendlyName);auto adapter=property(ep.device.Get(),PKEY_DeviceInterface_FriendlyName);ep.capture=flow==eCapture;ep.cable=adapter==L"VB-Audio Virtual Cable";out.push_back(ep);}}return out;}
static Endpoint cable(bool capture){std::vector<Endpoint> matches;for(auto&e:endpoints())if(e.cable&&e.capture==capture)matches.push_back(e);if(matches.size()!=1)throw std::runtime_error("Install the standard VB-CABLE driver, restart Windows if requested, then refresh. Exactly one standard VB-CABLE is required.");return matches[0];}
class Decoder {
 ComPtr<IMFTransform> decoder;ComPtr<IMFSample> outputSample;ComPtr<IAudioClient> client;ComPtr<IAudioRenderClient> renderer;AudioQueue queue;UINT capacity=0,channels=0;bool render=false,test=false;uint64_t timestamp=0;std::vector<BYTE> pcm;
 void outputType(){outputSample.Reset();for(DWORD i=0;;i++){ComPtr<IMFMediaType>type;check(decoder->GetOutputAvailableType(0,i,&type));GUID id;check(type->GetGUID(MF_MT_SUBTYPE,&id));if(id!=MFAudioFormat_PCM||MFGetAttributeUINT32(type.Get(),MF_MT_AUDIO_BITS_PER_SAMPLE,0)!=16)continue;check(decoder->SetOutputType(0,type.Get(),0));return;}}
 void setup(UINT ch){if(decoder&&channels==ch)return;if(decoder){check(decoder->ProcessMessage(MFT_MESSAGE_COMMAND_DRAIN,0));drain();}decoder.Reset();outputSample.Reset();if(client)client->Stop();renderer.Reset();client.Reset();channels=ch;
  check(CoCreateInstance(CLSID_CMSAACDecMFT,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&decoder)));ComPtr<IMFMediaType>type;check(MFCreateMediaType(&type));check(type->SetGUID(MF_MT_MAJOR_TYPE,MFMediaType_Audio));check(type->SetGUID(MF_MT_SUBTYPE,MEDIASUBTYPE_RAW_AAC1));BYTE asc[2]={BYTE((2<<3)|(3>>1)),BYTE(((3&1)<<7)|(ch<<3))};check(type->SetBlob(MF_MT_USER_DATA,asc,2));check(type->SetUINT32(MF_MT_AAC_PAYLOAD_TYPE,0));check(type->SetUINT32(MF_MT_AUDIO_SAMPLES_PER_SECOND,48000));check(type->SetUINT32(MF_MT_AUDIO_NUM_CHANNELS,ch));check(type->SetUINT32(MF_MT_AUDIO_BITS_PER_SAMPLE,16));check(decoder->SetInputType(0,type.Get(),0));outputType();check(decoder->ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING,0));check(decoder->ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM,0));
  if(render){auto endpoint=cable(false);check(endpoint.device->Activate(__uuidof(IAudioClient),CLSCTX_ALL,nullptr,(void**)&client));WAVEFORMATEX wave{};wave.wFormatTag=WAVE_FORMAT_PCM;wave.nChannels=WORD(ch);wave.nSamplesPerSec=48000;wave.wBitsPerSample=16;wave.nBlockAlign=WORD(ch*2);wave.nAvgBytesPerSec=48000*wave.nBlockAlign;check(client->Initialize(AUDCLNT_SHAREMODE_SHARED,AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM|AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,1000000,0,&wave,nullptr));check(client->GetBufferSize(&capacity));check(client->GetService(IID_PPV_ARGS(&renderer)));check(client->Start());}
 }
 void drain(){for(;;){MFT_OUTPUT_STREAM_INFO info{};check(decoder->GetOutputStreamInfo(0,&info));if(!outputSample){check(MFCreateSample(&outputSample));ComPtr<IMFMediaBuffer>b;check(MFCreateMemoryBuffer(info.cbSize,&b));check(outputSample->AddBuffer(b.Get()));}ComPtr<IMFMediaBuffer>buffer;check(outputSample->GetBufferByIndex(0,&buffer));check(buffer->SetCurrentLength(0));MFT_OUTPUT_DATA_BUFFER result{};result.pSample=outputSample.Get();DWORD flags;HRESULT hr=decoder->ProcessOutput(0,1,&result,&flags);if(result.pEvents)result.pEvents->Release();if(hr==MF_E_TRANSFORM_NEED_MORE_INPUT)return;if(hr==MF_E_TRANSFORM_STREAM_CHANGE){outputType();continue;}check(hr);BYTE*data;DWORD length;check(buffer->Lock(&data,nullptr,&length));pcm.assign(data,data+length);check(buffer->Unlock());UINT frames=length/(channels*2);
   if(test){writeAll(pcm.data(),pcm.size());continue;}
   for(UINT at=0;at<frames;){UINT part=(std::min)(frames-at,2048U);queue.write((int16_t*)pcm.data()+at*channels,part,channels,timestamp+uint64_t(at)*1000000000/48000);at+=part;}
   if(renderer){UINT padding;check(client->GetCurrentPadding(&padding));if(frames<=capacity-padding){BYTE*target;check(renderer->GetBuffer(frames,&target));memcpy(target,pcm.data(),length);check(renderer->ReleaseBuffer(frames,0));}}
  }}
public:
 Decoder(bool r,bool t):render(r),test(t){if(!test&&!queue.open(true))throw std::runtime_error("Audio sharing is unavailable.");if(render)cable(false);}
 ~Decoder(){if(client)client->Stop();}
 void input(const std::vector<BYTE>&data,uint64_t pts){if(data.size()<7||data[0]!=255||(data[1]&0xf6)!=0xf0||((data[2]>>2)&15)!=3)throw std::runtime_error("Expected 48 kHz ADTS audio.");UINT ch=((data[2]&1)<<2)|(data[3]>>6);if(ch<1||ch>2)throw std::runtime_error("Expected mono or stereo audio.");if((data[2]>>6)!=1)throw std::runtime_error("Expected AAC-LC audio.");size_t skip=(data[1]&1)?7:9;if(data.size()<=skip)throw std::runtime_error("Incomplete ADTS audio.");setup(ch);timestamp=clockNs();ComPtr<IMFSample>sample;ComPtr<IMFMediaBuffer>buffer;check(MFCreateSample(&sample));check(MFCreateMemoryBuffer(DWORD(data.size()-skip),&buffer));BYTE*p;check(buffer->Lock(&p,nullptr,nullptr));memcpy(p,data.data()+skip,data.size()-skip);check(buffer->Unlock());check(buffer->SetCurrentLength(DWORD(data.size()-skip)));check(sample->AddBuffer(buffer.Get()));check(sample->SetSampleTime(pts*10));check(sample->SetSampleDuration(1024LL*10000000/48000));auto hr=decoder->ProcessInput(0,sample.Get(),0);if(hr==MF_E_NOTACCEPTING){drain();hr=decoder->ProcessInput(0,sample.Get(),0);}check(hr);drain();}
 void finish(){if(decoder){check(decoder->ProcessMessage(MFT_MESSAGE_COMMAND_DRAIN,0));drain();}}
};
int wmain(int argc,wchar_t**argv){check(CoInitializeEx(nullptr,COINIT_MULTITHREADED));int code=0;bool media=false;try{
 std::wstring command=argc>1?argv[1]:L"";
 if(command==L"--list"){printf("[");bool first=true;for(auto&e:endpoints()){if(!first)printf(",");first=false;printf("{\"id\":%s,\"name\":%s,\"capture\":%s,\"cable\":%s}",json(e.id).c_str(),json(e.name).c_str(),e.capture?"true":"false",e.cable?"true":"false");}printf("]\n");}
 else if(command==L"--rename"){auto endpoint=cable(true);ComPtr<IPropertyStore>store;check(endpoint.device->OpenPropertyStore(STGM_READWRITE,&store));PROPVARIANT value;check(InitPropVariantFromString(L"DroidVideo Microphone",&value));auto result=store->SetValue(PKEY_Device_FriendlyName,value);PropVariantClear(&value);check(result);check(store->Commit());}
 else{check(MFStartup(MF_VERSION,MFSTARTUP_LITE));media=true;bool test=command==L"--test";Decoder decoder(command==L"--render",test);if(!test)writeAll("R",1);uint32_t header[4];std::vector<BYTE>data;while(readAll(header,sizeof(header))){if(header[0]!=0x41415644||header[1]<7||header[1]>65536)throw std::runtime_error("Invalid audio packet.");data.resize(header[1]);if(!readAll(data.data(),data.size()))break;decoder.input(data,uint64_t(header[2])|(uint64_t(header[3])<<32));if(!test)writeAll("A",1);}decoder.finish();}
 }catch(const std::exception&e){fprintf(stderr,"%s\n",e.what());code=1;}if(media)MFShutdown();CoUninitialize();return code;}

