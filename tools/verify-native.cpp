// Test harness: no registry writes and no installed camera required.
#include <windows.h>
#include <dshow.h>
#include <cstdio>
#include <vector>
#include "shared-memory-queue.h"
#include "tiny-nv12-scale.h"
int wmain(int argc,wchar_t **argv){
    if(argc==2){
        CoInitialize(nullptr);auto dll=LoadLibraryW(argv[1]);if(!dll)return 10;
        auto factory=(HRESULT(WINAPI*)(REFCLSID,REFIID,void**))GetProcAddress(dll,"DllGetClassObject");if(!factory)return 11;
        const CLSID cls={0x7b9f2d13,0xe481,0x4ea5,{0xa8,0x53,0x4d,0x70,0x6f,0xe1,0xa2,0x99}};
        IClassFactory *f=nullptr;if(FAILED(factory(cls,IID_IClassFactory,(void**)&f)))return 12;
        IBaseFilter *filter=nullptr;if(FAILED(f->CreateInstance(nullptr,IID_IBaseFilter,(void**)&filter)))return 13;f->Release();
        IEnumPins *pins=nullptr;filter->EnumPins(&pins);IPin *pin=nullptr;if(pins->Next(1,&pin,nullptr)!=S_OK)return 14;
        IAMStreamConfig *config=nullptr;if(FAILED(pin->QueryInterface(IID_IAMStreamConfig,(void**)&config)))return 15;
        AM_MEDIA_TYPE *initial=nullptr;if(FAILED(config->GetFormat(&initial)))return 17;
        auto *initialVideo=(VIDEOINFOHEADER*)initial->pbFormat;
        if(initialVideo->bmiHeader.biWidth<=0||initialVideo->bmiHeader.biHeight<=0||initialVideo->AvgTimePerFrame<=0)return 18;
        if(initial->cbFormat)CoTaskMemFree(initial->pbFormat);if(initial->pUnk)initial->pUnk->Release();CoTaskMemFree(initial);
        int count=0,size=0;config->GetNumberOfCapabilities(&count,&size);bool full=false,uhd=false;std::vector<BYTE> caps(size);
        for(int i=0;i<count;i++){AM_MEDIA_TYPE *mt=nullptr;if(SUCCEEDED(config->GetStreamCaps(i,&mt,caps.data()))){auto *v=(VIDEOINFOHEADER*)mt->pbFormat;full|=v->bmiHeader.biWidth==1920&&v->bmiHeader.biHeight==1080&&v->AvgTimePerFrame<=166667;uhd|=v->bmiHeader.biWidth==3840&&v->bmiHeader.biHeight==2160&&v->AvgTimePerFrame<=333334;if(mt->cbFormat)CoTaskMemFree(mt->pbFormat);if(mt->pUnk)mt->pUnk->Release();CoTaskMemFree(mt);}}
        config->Release();pin->Release();pins->Release();filter->Release();CoUninitialize();
        if(!full||!uhd)return 16;puts("PASS DirectShow class factory and 1080p60 / 4K30 capabilities (without registration)");return 0;
    }
    video_queue_t *q=nullptr;
    for(int i=0;i<500;i++){if(!q)q=video_queue_open();if(q&&video_queue_state(q)==SHARED_QUEUE_STATE_READY)break;Sleep(10);}
    if(!q||video_queue_state(q)!=SHARED_QUEUE_STATE_READY)return 20;
    uint32_t w,h;uint64_t interval,ts;video_queue_get_info(q,&w,&h,&interval);
    std::vector<uint8_t> pixels(size_t(w)*h*3/2);nv12_scale_t scale{};nv12_scale_init(&scale,TARGET_FORMAT_NV12,w,h,w,h);
    if(!video_queue_read(q,&scale,pixels.data(),&ts))return 21;
    printf("%u %u %llu",w,h,interval);for(size_t i=0;i<pixels.size()&&(pixels.size()<=65536||i<24);i++)printf(" %u",pixels[i]);puts("");video_queue_close(q);return 0;
}
