// GPL-2.0-or-later. Raw-frame verification path; production uses native H.264 input.
#include "frame-output.hpp"
int decodeH264();
int main(int argc,char **argv){
    if(argc==2&&strcmp(argv[1],"--h264")==0)return decodeH264();
    const bool ack=argc==2&&strcmp(argv[1],"--ack")==0;
    FrameOutput output;
    std::vector<uint8_t> input,chroma;
    uint32_t header[8];
    while(readAll(header,sizeof(header))){
        auto w=header[1],h=header[2],fps=header[3],fmt=header[4],sy=header[5],suv=header[6],angle=header[7];
        if(header[0]!=0x43565644||w<2||h<2||w>3840||h>3840||(w&1)||(h&1)||fps<1||fps>60||(fmt!=1&&fmt!=2)||sy!=w||suv!=(fmt==1?w:w/2)||(angle!=0&&angle!=90&&angle!=180&&angle!=270)){fprintf(stderr,"Invalid virtual-camera frame header\n");return 2;}
        const size_t ySize=size_t(w)*h,size=ySize*3/2;
        input.resize(size);if(!readAll(input.data(),size))break;
        auto y=input.data();auto uv=y+ySize;
        if(fmt==2){chroma.resize(ySize/2);interleave(uv,uv+ySize/4,chroma.data(),ySize/4);uv=chroma.data();}
        const bool delivered=output.write(y,uv,w,h,fps,angle);
        // Acknowledge consumption, not merely receipt by the Node pipe buffer.
        if(ack){const char result=delivered?1:0;DWORD written;if(!WriteFile(GetStdHandle(STD_OUTPUT_HANDLE),&result,1,&written,nullptr))break;}
    }
    return 0;
}
