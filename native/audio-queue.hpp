#pragma once
// MIT. Bounded PCM transport; readers never wait for the audio producer.
#include <windows.h>
#include <cstdint>
#include <cstring>
#include <vector>
struct AudioBlock {uint64_t sequence,timestamp;uint32_t frames,channels;int16_t samples[4096];};
struct AudioMemory {uint32_t version;uint64_t sequence;AudioBlock blocks[32];};
class AudioQueue {
    HANDLE mapping=nullptr,mutex=nullptr;AudioMemory *memory=nullptr;
public:
    ~AudioQueue(){if(memory)UnmapViewOfFile(memory);if(mapping)CloseHandle(mapping);if(mutex)CloseHandle(mutex);}
    bool open(bool writer){
        if(memory)return true;
        mutex=CreateMutexW(nullptr,FALSE,L"Local\\DroidVideoAudioLock1");
        mapping=writer?CreateFileMappingW(INVALID_HANDLE_VALUE,nullptr,PAGE_READWRITE,0,sizeof(AudioMemory),L"Local\\DroidVideoAudio1"):OpenFileMappingW(FILE_MAP_READ,FALSE,L"Local\\DroidVideoAudio1");
        if(!mapping){if(mutex)CloseHandle(mutex);mutex=nullptr;return false;}
        memory=(AudioMemory*)MapViewOfFile(mapping,writer?FILE_MAP_ALL_ACCESS:FILE_MAP_READ,0,0,sizeof(AudioMemory));
        if(!memory){CloseHandle(mapping);mapping=nullptr;CloseHandle(mutex);mutex=nullptr;return false;}
        if(writer){auto wait=WaitForSingleObject(mutex,100);if(wait==WAIT_OBJECT_0||wait==WAIT_ABANDONED){memory->version=1;ReleaseMutex(mutex);}}
        return true;
    }
    void write(const int16_t *data,uint32_t frames,uint32_t channels,uint64_t timestamp){
        if(!memory||!channels||channels>2||frames*channels>4096)return;
        auto wait=WaitForSingleObject(mutex,0);if(wait!=WAIT_OBJECT_0&&wait!=WAIT_ABANDONED)return;
        auto sequence=memory->sequence+1;auto &block=memory->blocks[sequence%32];
        block.sequence=sequence;block.timestamp=timestamp;block.frames=frames;block.channels=channels;
        memcpy(block.samples,data,size_t(frames)*channels*2);memory->sequence=sequence;ReleaseMutex(mutex);
    }
    std::vector<AudioBlock> read(uint64_t &last){
        std::vector<AudioBlock> result;if(!open(false))return result;
        auto wait=WaitForSingleObject(mutex,0);if(wait!=WAIT_OBJECT_0&&wait!=WAIT_ABANDONED)return result;
        auto latest=memory->sequence;
        if(memory->version==1&&latest>last){uint64_t first=last+1;if(latest-first>7)first=latest-7;for(auto n=first;n<=latest;n++){auto &b=memory->blocks[n%32];if(b.sequence==n&&b.channels>=1&&b.channels<=2&&b.frames*b.channels<=4096)result.push_back(b);}last=latest;}
        ReleaseMutex(mutex);return result;
    }
};
