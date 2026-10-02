"""Check native AAC decoding using generated mono/stereo tones; no audio device changes."""
from pathlib import Path
import subprocess,struct,tempfile,array,math
root=Path(__file__).resolve().parent.parent
def packets(data):
    at=0;result=[]
    while at<len(data):
        n=((data[at+3]&3)<<11)|(data[at+4]<<3)|(data[at+5]>>5)
        assert n>=7 and at+n<=len(data)
        result.append(struct.pack('<IIQ',0x41415644,n,len(result)*1024*1000000//48000)+data[at:at+n]);at+=n
    return result
with tempfile.TemporaryDirectory(prefix='droidvideo-audio-test-') as directory:
    streams=[]
    for channels in [1,2]:
        file=Path(directory)/f'{channels}.aac'
        subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=1000:sample_rate=48000','-t','1','-ac',str(channels),'-c:a','aac','-f','adts',str(file)],check=True,timeout=30)
        frames=packets(file.read_bytes());streams+=frames
        result=subprocess.run([str(root/'native/build/droidvideo-audio-bridge.exe'),'--test'],input=b''.join(frames),capture_output=True,timeout=15)
        assert result.returncode==0,result.stderr
        assert len(result.stdout)==len(frames)*1024*channels*2
        pcm=array.array('h',result.stdout)[4800*channels:40000*channels:channels]
        rms=math.sqrt(sum(x*x for x in pcm)/len(pcm));assert 1500<rms<4000,rms
        crossings=sum(a<=0<b for a,b in zip(pcm,pcm[1:]));hz=crossings*48000/len(pcm);assert 980<hz<1020,hz
        print(f'PASS {channels} channel: all AAC packets decoded; 1 kHz signal verified')
    result=subprocess.run([str(root/'native/build/droidvideo-audio-bridge.exe'),'--test'],input=b''.join(streams),capture_output=True,timeout=15)
    assert result.returncode==0,result.stderr
    assert len(result.stdout)==48*1024*6,len(result.stdout)
    result=subprocess.run([str(root/'native/build/droidvideo-audio-bridge.exe'),'--test'],input=struct.pack('<4I',0,100,0,0),capture_output=True,timeout=5)
    assert result.returncode!=0 and b'Invalid audio packet' in result.stderr
    print('PASS mono/stereo change and malformed input rejection')
