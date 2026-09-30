"""Decode verify-media.cjs fixtures through GPU and forced software camera paths."""
from pathlib import Path
import os, re, struct, subprocess, sys, time, queue, threading
root=Path(__file__).resolve().parent.parent
for height,fps in [(1080,60),(2160,30)]:
    width=1920 if height==1080 else 3840
    data=(Path(sys.argv[1])/f'{height}p{fps}.h264').read_bytes()
    starts=list(re.finditer(b'\x00\x00(?:\x00)?\x01',data))
    units=[];unit=[]
    for i,m in enumerate(starts):
        nal=data[m.start():starts[i+1].start() if i+1<len(starts) else len(data)]
        kind=data[m.end()]&31
        if kind==9 and unit:units.append(unit);unit=[]
        unit.append((kind,nal))
    if unit:units.append(unit)
    payload=b'';packets=[]
    for i,unit in enumerate(units):
        frame=b''.join(n for _,n in unit)
        flags=(1 if any(k==5 for k,_ in unit) else 0)|(256 if i==0 else 0)
        packet=struct.pack('<8I',0x43485644,width,height,fps,0,flags,len(frame),0)+frame
        payload+=packet;packets.append(packet)
    for software in [False,True]:
        env=os.environ.copy()
        if software:env['DROIDVIDEO_SOFTWARE_DECODE']='1'
        else:env.pop('DROIDVIDEO_SOFTWARE_DECODE',None)
        started=time.monotonic()
        result=subprocess.run([str(root/'native/build/droidvideo-vcam-writer.exe'),'--h264'],input=payload,capture_output=True,env=env,timeout=20)
        assert result.returncode==0,result.stderr.decode(errors='replace')
        assert result.stdout.count(b'\x01')==fps,(result.stdout,len(units))
        assert (b'S' if software else b'H') in result.stdout,result.stdout
        print(f'PASS {height}p{fps} {"software" if software else "D3D11"}: {fps} frames, {time.monotonic()-started:.3f}s including startup')
        # Production allows four inputs in flight. A decoder must acknowledge
        # output before a fifth packet or EOF, otherwise it would stall live.
        child=subprocess.Popen([str(root/'native/build/droidvideo-vcam-writer.exe'),'--h264'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env)
        events=queue.Queue()
        def read():
            while True:
                byte=child.stdout.read(1)
                if not byte:break
                events.put(byte)
        reader=threading.Thread(target=read,daemon=True);reader.start()
        try:
            child.stdin.write(b''.join(packets[:4]));child.stdin.flush()
            deadline=time.monotonic()+3
            while events.get(timeout=max(.01,deadline-time.monotonic()))!=b'\x01':pass
            print('PASS live output before fifth input or EOF')
        finally:
            child.stdin.close()
            try:child.wait(timeout=3)
            except subprocess.TimeoutExpired:child.kill();child.wait()
            reader.join(timeout=1)
