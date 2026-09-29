"""Check native formats, pixel conversion, tiling and rotation without registration."""
from pathlib import Path
import subprocess, struct
root=Path(__file__).resolve().parent.parent
build=root/'native/build'
subprocess.run([str(build/'verify-native.exe'),str(build/'droidvideo-camera.dll')],check=True)
for w,h in [(4,2),(66,34)]:
 for fmt in (1,2):
  for angle in (0,90,180,270):
    y=bytes((i*7)%256 for i in range(w*h))
    u=bytes((i*11+20)%256 for i in range(w*h//4))
    v=bytes((i*13+30)%256 for i in range(w*h//4))
    uv=bytes(c for pair in zip(u,v) for c in pair)
    data=y+(uv if fmt==1 else u+v)
    packet=struct.pack('<8I',0x43565644,w,h,60,fmt,w,w if fmt==1 else w//2,angle)+data
    writer=subprocess.Popen([str(build/'droidvideo-vcam-writer.exe'),'--ack'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    try:
        writer.stdin.write(packet);writer.stdin.flush()
        assert writer.stdout.read(1)==b'\x01'
        got=list(map(int,subprocess.check_output([str(build/'verify-native.exe')],timeout=8).split()))
        ow,oh=(h,w) if angle%180 else (w,h)
        expected=bytearray(len(data))
        for pw,ph,unit,source,offset in [(w,h,1,y,0),(w//2,h//2,2,uv,w*h)]:
            for yy in range(ph):
                for x in range(pw):
                    dx,dy={0:(x,yy),90:(ph-1-yy,x),180:(pw-1-x,ph-1-yy),270:(yy,pw-1-x)}[angle]
                    dw=ph if angle%180 else pw
                    expected[offset+(dy*dw+dx)*unit:offset+(dy*dw+dx+1)*unit]=source[(yy*pw+x)*unit:(yy*pw+x+1)*unit]
        assert got[:3]==[ow,oh,166666],got[:3]
        assert got[3:]==list(expected),(w,h,fmt,angle)
    finally:
        writer.stdin.close();writer.wait(timeout=5)
        assert writer.returncode==0,writer.stderr.read().decode()
print('PASS 16 pixel-exact NV12/I420 cases, SIMD/tile boundaries, all rotations and native acknowledgement')
