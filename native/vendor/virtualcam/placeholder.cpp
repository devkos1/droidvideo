// DroidVideo modification: a plain black idle frame, without branding/watermark.
#include <cstdint>
#include <vector>
static std::vector<uint8_t> image;
bool initialize_placeholder(){image.assign(1920*1080*3/2,128);for(int i=0;i<1920*1080;i++)image[i]=16;return true;}
const uint8_t *get_placeholder_ptr(){return image.data();}
const bool get_placeholder_size(int *w,int *h){*w=1920;*h=1080;return true;}
