"""Exercise the compiled native camera without installing/registering it."""
from pathlib import Path
import subprocess, struct
root=Path(__file__).resolve().parent.parent
build=root/'native/build'
subprocess.run([str(build/'verify-native.exe'),str(build/'droidvideo-camera.dll')],check=True)
for angle in (0,90,180,270):
    w,h=4,2
    # Planar Y: 0..7, U: 20,21, V: 30,31. Check both Y rotation and UV interleave.
    data=bytes(range(8))+bytes([20,21,30,31])
    packet=struct.pack('<8I',0x43565644,w,h,60,2,w,w//2,angle)+data
    writer=subprocess.Popen([str(build/'droidvideo-vcam-writer.exe')],stdin=subprocess.PIPE,stderr=subprocess.PIPE)
    try:
        writer.stdin.write(packet);writer.stdin.flush()
        got=list(map(int,subprocess.check_output([str(build/'verify-native.exe')],timeout=8).split()))
        ow,oh=(h,w) if angle%180 else (w,h)
        expected=bytearray(12)
        for pw,ph,unit,source,offset in [(w,h,1,bytes(range(8)),0),(w//2,h//2,2,bytes([20,30,21,31]),8)]:
            for y in range(ph):
                for x in range(pw):
                    dx,dy={0:(x,y),90:(ph-1-y,x),180:(pw-1-x,ph-1-y),270:(y,pw-1-x)}[angle]
                    dw=ph if angle%180 else pw
                    expected[offset+(dy*dw+dx)*unit:offset+(dy*dw+dx+1)*unit]=source[(y*pw+x)*unit:(y*pw+x+1)*unit]
        assert got[:3]==[ow,oh,166666],got
        assert got[3:]==list(expected),(angle,got,expected)
        print(f'PASS I420 → NV12, rotation {angle}, shared-memory pixels and 60 fps interval')
    finally:
        writer.stdin.close();writer.wait(timeout=5)
        assert writer.returncode==0,writer.stderr.read().decode()
