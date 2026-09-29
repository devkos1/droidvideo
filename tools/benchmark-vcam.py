"""Synthetic pipe/conversion/rotation/shared-memory throughput; not an OBS fps test."""
from pathlib import Path
import subprocess, struct, time, json
root=Path(__file__).resolve().parent.parent
pixels=bytes([100])*(3840*2160*3//2)
results={}
for angle in (0,90,180,270):
    process=subprocess.Popen([str(root/'native/build/droidvideo-vcam-writer.exe')],stdin=subprocess.PIPE,stderr=subprocess.PIPE)
    packet=struct.pack('<8I',0x43565644,3840,2160,30,2,3840,1920,angle)+pixels
    start=time.perf_counter()
    try:
        for _ in range(30): process.stdin.write(packet)
        process.stdin.close()
        process.wait(timeout=30)
        assert process.returncode==0,process.stderr.read().decode()
        results[str(angle)]=round(30/(time.perf_counter()-start),2)
    finally:
        if process.poll() is None: process.kill();process.wait()
print(json.dumps({'width':3840,'height':2160,'input':'I420','framesPerSecondByRotation':results},indent=2))
