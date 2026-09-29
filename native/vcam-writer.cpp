// GPL-2.0-or-later: links OBS's modified shared-memory queue.
#include <windows.h>
#include <io.h>
#include <fcntl.h>
#include <cstdio>
#include <vector>
#include <algorithm>
#include "shared-memory-queue.h"
static bool readAll(void *data,size_t n){auto p=(uint8_t*)data;while(n){size_t got=fread(p,1,n,stdin);if(!got)return false;p+=got;n-=got;}return true;}
static void rotatePlane(const uint8_t *src,uint8_t *dst,int w,int h,int stride,int unit,int angle){
    int outW=(angle==90||angle==270)?h:w;
    for(int y=0;y<h;y++)for(int x=0;x<w;x++){
        int dx=x,dy=y;if(angle==90){dx=h-1-y;dy=x;}else if(angle==180){dx=w-1-x;dy=h-1-y;}else if(angle==270){dx=y;dy=w-1-x;}
        for(int b=0;b<unit;b++)dst[(dy*outW+dx)*unit+b]=src[y*stride+x*unit+b];
    }
}
int main(){
    _setmode(_fileno(stdin),_O_BINARY);video_queue_t *queue=nullptr;uint32_t ow=0,oh=0,rate=0;
    uint32_t h[8];
    while(readAll(h,sizeof(h))){
        uint32_t w=h[1],height=h[2],fps=h[3],fmt=h[4],sy=h[5],suv=h[6],angle=h[7];
        if(h[0]!=0x43565644||w<2||height<2||w>3840||height>3840||(w&1)||(height&1)||fps<1||fps>60||(fmt!=1&&fmt!=2)||sy!=w||suv!=(fmt==1?w:w/2)||(angle!=0&&angle!=90&&angle!=180&&angle!=270)){fprintf(stderr,"Invalid virtual-camera frame header\n");return 2;}
        size_t size=size_t(w)*height*3/2;std::vector<uint8_t> input(size);if(!readAll(input.data(),size))break;
        std::vector<uint8_t> nv12(size);const uint8_t *pixels=input.data();
        if(fmt==2){std::copy(input.begin(),input.begin()+w*height,nv12.begin());for(size_t i=0;i<w*height/4;i++){nv12[w*height+i*2]=input[w*height+i];nv12[w*height+i*2+1]=input[w*height*5/4+i];}pixels=nv12.data();}
        uint32_t outW=(angle%180)?height:w,outH=(angle%180)?w:height;std::vector<uint8_t> rotated;
        if(angle){rotated.resize(size);rotatePlane(pixels,rotated.data(),w,height,w,1,angle);rotatePlane(pixels+w*height,rotated.data()+w*height,w/2,height/2,w,2,angle);pixels=rotated.data();}
        if(queue&&(ow!=outW||oh!=outH||rate!=fps)){video_queue_close(queue);queue=nullptr;}
        if(!queue){queue=video_queue_create(outW,outH,10000000ULL/fps);ow=outW;oh=outH;rate=fps;if(!queue)continue;}
        uint8_t *planes[2]={(uint8_t*)pixels,(uint8_t*)pixels+outW*outH};uint32_t strides[2]={outW,outW};
        LARGE_INTEGER now,freq;QueryPerformanceCounter(&now);QueryPerformanceFrequency(&freq);
        video_queue_write(queue,planes,strides,(uint64_t)(now.QuadPart*10000000.0/freq.QuadPart));
    }
    if(queue)video_queue_close(queue);return 0;
}
