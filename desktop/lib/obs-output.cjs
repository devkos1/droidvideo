'use strict';
const dgram=require('node:dgram');
const {MpegTsMuxer}=require('./mpegts.cjs');
class ObsOutput {
  constructor(port=27187){this.port=port;this.socket=dgram.createSocket('udp4');this.socket.on('error',()=>this.reset());this.socket.bind(0,'127.0.0.1');this.reset();}
  reset(){this.muxer=new MpegTsMuxer();this.waitingKey=true;this.config=null;}
  packet(flags,data,timestamp){
    if(flags===2){if(!this.config?.equals(data)){this.config=Buffer.from(data);this.muxer=new MpegTsMuxer();this.waitingKey=true;}return;}
    if(!this.config||this.waitingKey&&flags!==1)return;
    if(this.socket.getSendQueueSize()>262144){this.waitingKey=true;return;}
    this.waitingKey=false;
    const bytes=flags===3?this.muxer.audio(data,timestamp):this.muxer.frame(data,timestamp,flags===1,this.config);
    // Seven TS packets fit in a normal Ethernet datagram; no IP fragmentation.
    for(let at=0;at<bytes.length;at+=1316)this.socket.send(bytes.subarray(at,at+1316),this.port,'127.0.0.1',()=>{});
  }
  close(){this.socket.close();}
}
module.exports={ObsOutput};
