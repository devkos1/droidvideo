package hu.droidvideo;
import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.*;
import org.json.*;
import java.nio.ByteBuffer;

/** Microphone -> 48 kHz AAC-LC/ADTS using the video's monotonic time base. */
final class AudioEngine implements AutoCloseable {
    interface Sink { void send(int flags,long timestamp,byte[] bytes); }
    private final Context context;
    private final Sink sink;
    private volatile boolean running;
    private Thread thread;
    private volatile AudioRecord recorder;
    private volatile String error="",device="off",routed="",phase="off";
    private volatile int channels=1;
    AudioEngine(Context context,Sink sink) { this.context=context;this.sink=sink; }
    JSONArray devices() throws Exception {
        JSONArray result=new JSONArray().put(new JSONObject().put("id","off").put("label","Off"))
            .put(new JSONObject().put("id","default").put("label","System default microphone"));
        for(AudioDeviceInfo info:context.getSystemService(AudioManager.class).getDevices(AudioManager.GET_DEVICES_INPUTS))
            result.put(new JSONObject().put("id",String.valueOf(info.getId())).put("label",info.getProductName()+" · "+deviceType(info.getType())).put("type",info.getType()));
        return result;
    }
    private String deviceType(int type) {
        switch(type) {
            case AudioDeviceInfo.TYPE_BUILTIN_MIC: return UiText.choose(context,"Built-in microphone","Beépített mikrofon");
            case AudioDeviceInfo.TYPE_WIRED_HEADSET: return UiText.choose(context,"Wired headset","Vezetékes headset");
            case AudioDeviceInfo.TYPE_USB_DEVICE: case AudioDeviceInfo.TYPE_USB_HEADSET: case AudioDeviceInfo.TYPE_USB_ACCESSORY: return "USB";
            case AudioDeviceInfo.TYPE_BLUETOOTH_SCO: case AudioDeviceInfo.TYPE_BLE_HEADSET: return "Bluetooth";
            default: return UiText.choose(context,"Input ","Bemenet ")+type;
        }
    }
    synchronized void start(String id,int count) throws Exception {
        close();error="";
        if(thread!=null&&thread.isAlive())throw new IllegalStateException("Microphone is still stopping. Try again.");
        if(id.equals("off"))return;
        if(context.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)throw new IllegalStateException("Microphone permission is required on the phone.");
        if(count!=1&&count!=2)throw new IllegalArgumentException("Select mono or stereo.");
        AudioDeviceInfo selected=null;
        if(!id.equals("default")) {
            for(AudioDeviceInfo info:context.getSystemService(AudioManager.class).getDevices(AudioManager.GET_DEVICES_INPUTS))if(String.valueOf(info.getId()).equals(id))selected=info;
            if(selected==null)throw new IllegalArgumentException("Microphone disconnected. Refresh the input list.");
        }
        channels=count;device=id;phase="starting";running=true;
        final AudioDeviceInfo target=selected;
        thread=new Thread(()->capture(target),"microphone-aac");thread.start();
    }
    private void capture(AudioDeviceInfo target) {
        MediaCodec codec=null;
        try {
            int mask=channels==1?AudioFormat.CHANNEL_IN_MONO:AudioFormat.CHANNEL_IN_STEREO;
            int size=AudioRecord.getMinBufferSize(48000,mask,AudioFormat.ENCODING_PCM_16BIT);
            if(size<=0)throw new IllegalStateException("Selected microphone format is not supported.");
            AudioFormat pcm=new AudioFormat.Builder().setSampleRate(48000).setChannelMask(mask).setEncoding(AudioFormat.ENCODING_PCM_16BIT).build();
            if(context.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)throw new SecurityException("Microphone permission required");
            AudioRecord local=new AudioRecord.Builder().setAudioSource(MediaRecorder.AudioSource.MIC).setAudioFormat(pcm).setBufferSizeInBytes(Math.max(size*2,16384)).build();recorder=local;
            if(target!=null&&!local.setPreferredDevice(target))throw new IllegalStateException("Android refused the selected microphone.");
            codec=MediaCodec.createEncoderByType("audio/mp4a-latm");
            MediaFormat format=MediaFormat.createAudioFormat("audio/mp4a-latm",48000,channels);
            format.setInteger(MediaFormat.KEY_AAC_PROFILE,MediaCodecInfo.CodecProfileLevel.AACObjectLC);
            format.setInteger(MediaFormat.KEY_BIT_RATE,channels==1?96000:160000);format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE,16384);
            codec.configure(format,null,null,MediaCodec.CONFIGURE_FLAG_ENCODE);codec.start();local.startRecording();
            if(local.getRecordingState()!=AudioRecord.RECORDSTATE_RECORDING)throw new IllegalStateException("Microphone is unavailable.");
            MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();byte[] data=new byte[4096];
            long frames=0,base=0;boolean checked=false;
            while(running) {
                int input=codec.dequeueInputBuffer(10000);
                if(input>=0) {
                    ByteBuffer buffer=codec.getInputBuffer(input);
                    int n=local.read(data,0,Math.min(data.length,buffer.remaining()),AudioRecord.READ_BLOCKING);
                    if(n<0)throw new IllegalStateException("Audio capture failed: "+n);
                    if(n>0) {
                        if(!checked) {
                            AudioDeviceInfo actual=local.getRoutedDevice();
                            if(actual!=null) { routed=actual.getProductName().toString();if(target!=null&&actual.getId()!=target.getId())throw new IllegalStateException("Android selected a different microphone. Choose System default or reconnect the input."); }
                            base=android.os.SystemClock.elapsedRealtimeNanos()/1000-n/(channels*2)*1000000L/48000;checked=true;phase="recording";
                        }
                        AudioTimestamp timestamp=new AudioTimestamp();
                        if(local.getTimestamp(timestamp,AudioTimestamp.TIMEBASE_BOOTTIME)==AudioRecord.SUCCESS)base=timestamp.nanoTime/1000-timestamp.framePosition*1000000L/48000;
                        buffer.put(data,0,n);codec.queueInputBuffer(input,0,n,base+frames*1000000L/48000,0);frames+=n/(channels*2);
                    } else codec.queueInputBuffer(input,0,0,System.nanoTime()/1000,0);
                }
                for(int index;(index=codec.dequeueOutputBuffer(info,0))>=0;) {
                    if(info.size>0&&(info.flags&MediaCodec.BUFFER_FLAG_CODEC_CONFIG)==0) {
                        ByteBuffer buffer=codec.getOutputBuffer(index);buffer.position(info.offset);buffer.limit(info.offset+info.size);
                        byte[] packet=new byte[info.size+7];int length=packet.length;
                        packet[0]=(byte)0xff;packet[1]=(byte)0xf1;packet[2]=(byte)((1<<6)|(3<<2)|(channels>>2));
                        packet[3]=(byte)(((channels&3)<<6)|(length>>11));packet[4]=(byte)(length>>3);packet[5]=(byte)(((length&7)<<5)|0x1f);packet[6]=(byte)0xfc;
                        buffer.get(packet,7,info.size);sink.send(3,info.presentationTimeUs,packet);
                    }
                    codec.releaseOutputBuffer(index,false);
                }
            }
        } catch(Exception e) { if(running) {error=e.getMessage();phase="error";} }
        finally {
            AudioRecord local=recorder;recorder=null;if(local!=null){try{local.stop();}catch(Exception ignored){}local.release();}
            if(codec!=null){try{codec.stop();}catch(Exception ignored){}codec.release();}
            running=false;if(!phase.equals("error"))phase="off";
        }
    }
    JSONObject status() throws Exception { return new JSONObject().put("phase",phase).put("device",device).put("channels",channels).put("routed",routed).put("error",error); }
    public synchronized void close() {
        running=false;AudioRecord local=recorder;if(local!=null)try{local.stop();}catch(Exception ignored){}
        if(thread!=null)try{thread.join(3000);}catch(InterruptedException e){Thread.currentThread().interrupt();}
        if(thread!=null&&!thread.isAlive())thread=null;device="off";phase="off";routed="";
    }
}
