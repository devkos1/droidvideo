#pragma once
// GPL-2.0-or-later: links OBS's modified shared-memory queue.
#include <windows.h>
#include <cstdio>
#include <cstring>
#include <vector>
#include <algorithm>
#include <emmintrin.h>
#include "shared-memory-queue.h"
static bool readAll(void *data,size_t n){auto p=(uint8_t*)data;while(n){DWORD got=0;if(!ReadFile(GetStdHandle(STD_INPUT_HANDLE),p,DWORD(n),&got,nullptr)||!got)return false;p+=got;n-=got;}return true;}
// Tiling keeps both sides of a 4K transpose in cache.
template<typename Pixel,int Angle>
static void rotate(const uint8_t *input,uint8_t *output,int w,int h){
    auto src=reinterpret_cast<const Pixel*>(input);auto dst=reinterpret_cast<Pixel*>(output);
    if constexpr(Angle==180){std::reverse_copy(src,src+size_t(w)*h,dst);}
    else for(int by=0;by<h;by+=32)for(int bx=0;bx<w;bx+=32)
        for(int y=by;y<std::min(by+32,h);++y)for(int x=bx;x<std::min(bx+32,w);++x){
            if constexpr(Angle==90)dst[size_t(x)*h+h-1-y]=src[size_t(y)*w+x];
            else dst[size_t(w-1-x)*h+y]=src[size_t(y)*w+x];
        }
}
template<typename Pixel>
static void rotatePlane(const uint8_t *src,uint8_t *dst,int w,int h,int angle){
    if(angle==90)rotate<Pixel,90>(src,dst,w,h);
    else if(angle==180)rotate<Pixel,180>(src,dst,w,h);
    else rotate<Pixel,270>(src,dst,w,h);
}
static void interleave(const uint8_t *u,const uint8_t *v,uint8_t *uv,size_t count){
    size_t i=0;for(;i+16<=count;i+=16){
        auto a=_mm_loadu_si128(reinterpret_cast<const __m128i*>(u+i));
        auto b=_mm_loadu_si128(reinterpret_cast<const __m128i*>(v+i));
        _mm_storeu_si128(reinterpret_cast<__m128i*>(uv+i*2),_mm_unpacklo_epi8(a,b));
        _mm_storeu_si128(reinterpret_cast<__m128i*>(uv+i*2+16),_mm_unpackhi_epi8(a,b));
    }
    for(;i<count;++i){uv[i*2]=u[i];uv[i*2+1]=v[i];}
}

class FrameOutput {
    video_queue_t *queue=nullptr;
    uint32_t ow=0,oh=0,rate=0;
    std::vector<uint8_t> rotated;
    LARGE_INTEGER frequency;
public:
    FrameOutput(){QueryPerformanceFrequency(&frequency);}
    ~FrameOutput(){if(queue)video_queue_close(queue);}
    bool write(uint8_t *y,uint8_t *uv,uint32_t w,uint32_t h,uint32_t fps,uint32_t angle){
        const size_t ySize=size_t(w)*h;
        const uint32_t outW=angle%180?h:w,outH=angle%180?w:h;
        if(angle){rotated.resize(ySize*3/2);rotatePlane<uint8_t>(y,rotated.data(),w,h,angle);rotatePlane<uint16_t>(uv,rotated.data()+ySize,w/2,h/2,angle);y=rotated.data();uv=y+ySize;}
        if(queue&&(ow!=outW||oh!=outH||rate!=fps)){video_queue_close(queue);queue=nullptr;}
        if(!queue){queue=video_queue_create(outW,outH,10000000ULL/fps);ow=outW;oh=outH;rate=fps;}
        if(!queue)return false;
        uint8_t *planes[2]={y,uv};uint32_t strides[2]={outW,outW};
        LARGE_INTEGER now;QueryPerformanceCounter(&now);
        video_queue_write(queue,planes,strides,uint64_t(now.QuadPart*10000000.0/frequency.QuadPart));
        return true;
    }
};
