// GPL-2.0-or-later. Windows' built-in decoder feeds the camera without browser pixel copies.
#include "frame-output.hpp"
#include <mfapi.h>
#include <mfidl.h>
#include <mftransform.h>
#include <mferror.h>
#include <wmcodecdsp.h>
#include <codecapi.h>
#include <d3d11.h>
#include <wrl/client.h>
#include <stdexcept>
using Microsoft::WRL::ComPtr;
static void checked(HRESULT hr){if(FAILED(hr)){char text[96];sprintf_s(text,"Windows H.264 decoder failed (0x%08lx).",static_cast<unsigned long>(hr));throw std::runtime_error(text);}}
static void signalFrame(char value){DWORD written;WriteFile(GetStdHandle(STD_OUTPUT_HANDLE),&value,1,&written,nullptr);}
class Decoder {
    ComPtr<IMFTransform> transform;
    ComPtr<ID3D11Device> device;
    ComPtr<ID3D11DeviceContext> context;
    ComPtr<IMFDXGIDeviceManager> manager;
    ComPtr<ID3D11Texture2D> staging;
    ComPtr<IMFSample> reusableSample;
    void enableHardware(IMFAttributes *attributes){
        if(GetEnvironmentVariableW(L"DROIDVIDEO_SOFTWARE_DECODE",nullptr,0))return;
        if(!MFGetAttributeUINT32(attributes,MF_SA_D3D11_AWARE,FALSE))return;
        if(FAILED(D3D11CreateDevice(nullptr,D3D_DRIVER_TYPE_HARDWARE,nullptr,D3D11_CREATE_DEVICE_VIDEO_SUPPORT,nullptr,0,D3D11_SDK_VERSION,&device,nullptr,&context)))return;
        ComPtr<ID3D10Multithread> threading;
        if(SUCCEEDED(device.As(&threading)))threading->SetMultithreadProtected(TRUE);
        UINT token=0;
        if(FAILED(MFCreateDXGIDeviceManager(&token,&manager))||FAILED(manager->ResetDevice(device.Get(),token))||FAILED(transform->ProcessMessage(MFT_MESSAGE_SET_D3D_MANAGER,reinterpret_cast<ULONG_PTR>(manager.Get()))))manager.Reset();
    }
    FrameOutput output;
    UINT32 width=0,height=0,fps=30,angle=0,decodedWidth=0,decodedHeight=0;
    LONGLONG time=0;
    std::vector<uint8_t> contiguous;
    void outputType(){
        reusableSample.Reset();staging.Reset();
        for(DWORD i=0;;++i){
            ComPtr<IMFMediaType> type;checked(transform->GetOutputAvailableType(0,i,&type));
            GUID subtype;checked(type->GetGUID(MF_MT_SUBTYPE,&subtype));
            if(subtype!=MFVideoFormat_NV12)continue;
            checked(transform->SetOutputType(0,type.Get(),0));
            checked(MFGetAttributeSize(type.Get(),MF_MT_FRAME_SIZE,&decodedWidth,&decodedHeight));
            if(decodedWidth<2||decodedHeight<2||decodedWidth>4096||decodedHeight>4096||(decodedWidth&1)||(decodedHeight&1))throw std::runtime_error("Unsupported decoded frame dimensions.");
            return;
        }
    }
    void deliver(IMFSample *sample){
        ComPtr<IMFMediaBuffer> first;checked(sample->GetBufferByIndex(0,&first));
        ComPtr<IMFDXGIBuffer> gpu;
        if(SUCCEEDED(first.As(&gpu))){
            ComPtr<ID3D11Texture2D> texture;checked(gpu->GetResource(IID_PPV_ARGS(&texture)));
            UINT subresource=0;checked(gpu->GetSubresourceIndex(&subresource));
            D3D11_TEXTURE2D_DESC desc{};texture->GetDesc(&desc);
            if(desc.Format!=DXGI_FORMAT_NV12)throw std::runtime_error("Unsupported hardware decoder pixel format.");
            if(!staging){desc.ArraySize=1;desc.MipLevels=1;desc.BindFlags=0;desc.MiscFlags=0;desc.Usage=D3D11_USAGE_STAGING;desc.CPUAccessFlags=D3D11_CPU_ACCESS_READ;checked(device->CreateTexture2D(&desc,nullptr,&staging));}
            context->CopySubresourceRegion(staging.Get(),0,0,0,0,texture.Get(),subresource,nullptr);
            D3D11_MAPPED_SUBRESOURCE mapped{};checked(context->Map(staging.Get(),0,D3D11_MAP_READ,0,&mapped));
            const size_t size=size_t(decodedWidth)*decodedHeight;
            contiguous.resize(size*3/2);
            for(UINT32 row=0;row<decodedHeight;row++)memcpy(contiguous.data()+size_t(row)*decodedWidth,static_cast<BYTE*>(mapped.pData)+size_t(row)*mapped.RowPitch,decodedWidth);
            for(UINT32 row=0;row<decodedHeight/2;row++)memcpy(contiguous.data()+size+size_t(row)*decodedWidth,static_cast<BYTE*>(mapped.pData)+size_t(desc.Height+row)*mapped.RowPitch,decodedWidth);
            context->Unmap(staging.Get(),0);
            if(output.write(contiguous.data(),contiguous.data()+size,decodedWidth,decodedHeight,fps,angle))signalFrame(1);
            return;
        }
        ComPtr<IMFMediaBuffer> buffer;checked(sample->ConvertToContiguousBuffer(&buffer));
        const size_t size=size_t(decodedWidth)*decodedHeight*3/2;
        contiguous.resize(size);
        ComPtr<IMF2DBuffer> twoDimensional;
        if(SUCCEEDED(buffer.As(&twoDimensional))){checked(twoDimensional->ContiguousCopyTo(contiguous.data(),DWORD(size)));}
        else{
            BYTE *data=nullptr;DWORD length=0;checked(buffer->Lock(&data,nullptr,&length));
            if(length<size){buffer->Unlock();throw std::runtime_error("Incomplete decoded camera frame.");}
            bool written=false;
            try{written=output.write(data,data+size_t(decodedWidth)*decodedHeight,decodedWidth,decodedHeight,fps,angle);}
            catch(...){buffer->Unlock();throw;}
            checked(buffer->Unlock());if(written)signalFrame(1);return;
        }
        if(output.write(contiguous.data(),contiguous.data()+size_t(decodedWidth)*decodedHeight,decodedWidth,decodedHeight,fps,angle))signalFrame(1);
    }
public:
    void configure(UINT32 w,UINT32 h,UINT32 rate,UINT32 rotation,bool reset){
        angle=rotation;
        if(transform&&width==w&&height==h&&fps==rate){
            if(reset){checked(transform->ProcessMessage(MFT_MESSAGE_COMMAND_FLUSH,0));checked(transform->ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM,0));}
            return;
        }
        transform.Reset();reusableSample.Reset();staging.Reset();manager.Reset();context.Reset();device.Reset();width=w;height=h;fps=rate;time=0;
        checked(CoCreateInstance(CLSID_CMSH264DecoderMFT,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&transform)));
        ComPtr<IMFAttributes> attributes;
        if(SUCCEEDED(transform->GetAttributes(&attributes))){attributes->SetUINT32(CODECAPI_AVLowLatencyMode,TRUE);enableHardware(attributes.Get());}
        ComPtr<IMFMediaType> input;checked(MFCreateMediaType(&input));
        checked(input->SetGUID(MF_MT_MAJOR_TYPE,MFMediaType_Video));checked(input->SetGUID(MF_MT_SUBTYPE,MFVideoFormat_H264));
        checked(MFSetAttributeSize(input.Get(),MF_MT_FRAME_SIZE,w,h));checked(MFSetAttributeRatio(input.Get(),MF_MT_FRAME_RATE,rate,1));
        checked(input->SetUINT32(MF_MT_INTERLACE_MODE,MFVideoInterlace_Progressive));
        try{checked(transform->SetInputType(0,input.Get(),0));outputType();}
        catch(...){if(!manager)throw;checked(transform->ProcessMessage(MFT_MESSAGE_SET_D3D_MANAGER,0));manager.Reset();checked(transform->SetInputType(0,input.Get(),0));outputType();}
        signalFrame(manager?'H':'S');
        checked(transform->ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING,0));checked(transform->ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM,0));
    }
    void drain(){
        for(;;){
            MFT_OUTPUT_STREAM_INFO info{};checked(transform->GetOutputStreamInfo(0,&info));
            ComPtr<IMFSample> supplied;
            if(!(info.dwFlags&MFT_OUTPUT_STREAM_PROVIDES_SAMPLES)){
                if(!reusableSample){checked(MFCreateSample(&reusableSample));ComPtr<IMFMediaBuffer> buffer;
                checked(MFCreateAlignedMemoryBuffer(info.cbSize,info.cbAlignment?info.cbAlignment-1:0,&buffer));checked(reusableSample->AddBuffer(buffer.Get()));}
                supplied=reusableSample;
                ComPtr<IMFMediaBuffer> buffer;checked(supplied->GetBufferByIndex(0,&buffer));checked(buffer->SetCurrentLength(0));
            }
            MFT_OUTPUT_DATA_BUFFER result{};result.pSample=supplied.Get();DWORD status=0;
            const HRESULT hr=transform->ProcessOutput(0,1,&result,&status);
            ComPtr<IMFSample> provided;if(result.pSample&&result.pSample!=supplied.Get())provided.Attach(result.pSample);
            if(result.pEvents)result.pEvents->Release();
            if(hr==MF_E_TRANSFORM_NEED_MORE_INPUT)return;
            if(hr==MF_E_TRANSFORM_STREAM_CHANGE){outputType();continue;}
            checked(hr);if(result.pSample)deliver(result.pSample);
        }
    }
    void input(const std::vector<uint8_t> &bytes,bool key){
        ComPtr<IMFSample> sample;ComPtr<IMFMediaBuffer> buffer;checked(MFCreateSample(&sample));checked(MFCreateMemoryBuffer(DWORD(bytes.size()),&buffer));
        BYTE *data;checked(buffer->Lock(&data,nullptr,nullptr));memcpy(data,bytes.data(),bytes.size());checked(buffer->Unlock());checked(buffer->SetCurrentLength(DWORD(bytes.size())));
        checked(sample->AddBuffer(buffer.Get()));checked(sample->SetSampleTime(time));checked(sample->SetSampleDuration(10000000LL/fps));time+=10000000LL/fps;
        if(key)sample->SetUINT32(MFSampleExtension_CleanPoint,TRUE);
        HRESULT hr=transform->ProcessInput(0,sample.Get(),0);
        if(hr==MF_E_NOTACCEPTING){drain();hr=transform->ProcessInput(0,sample.Get(),0);}
        checked(hr);drain();
    }
    void finish(){if(transform){checked(transform->ProcessMessage(MFT_MESSAGE_NOTIFY_END_OF_STREAM,0));checked(transform->ProcessMessage(MFT_MESSAGE_COMMAND_DRAIN,0));drain();}}
};
int decodeH264(){
    HRESULT init=CoInitializeEx(nullptr,COINIT_MULTITHREADED);if(FAILED(init))return 3;
    HRESULT startup=MFStartup(MF_VERSION,MFSTARTUP_LITE);
    if(FAILED(startup)){fprintf(stderr,"Windows media components are missing. Install the Media Feature Pack on Windows N, or use the OBS source.\n");CoUninitialize();return 3;}
    int result=0;
    try{
        Decoder decoder;signalFrame('R');uint32_t header[8];std::vector<uint8_t> bytes;
        while(readAll(header,sizeof(header))){
            const auto w=header[1],h=header[2],rate=header[3],rotation=header[4],flags=header[5],size=header[6];
            if(header[0]!=0x43485644||w<48||h<48||w>3840||h>3840||(w&1)||(h&1)||rate<1||rate>60||rotation>270||rotation%90||size==0||size>16*1024*1024||(flags&~257U))throw std::runtime_error("Invalid encoded camera frame.");
            bytes.resize(size);if(!readAll(bytes.data(),size))throw std::runtime_error("Incomplete encoded camera frame.");
            decoder.configure(w,h,rate,rotation,!!(flags&256));decoder.input(bytes,!!(flags&1));
        }
        decoder.finish();
    }catch(const std::exception &error){fprintf(stderr,"%s\n",error.what());result=3;}
    MFShutdown();CoUninitialize();return result;
}
