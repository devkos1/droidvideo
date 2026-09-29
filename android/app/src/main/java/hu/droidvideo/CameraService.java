package hu.droidvideo;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.net.*;
import android.net.wifi.WifiManager;
import android.os.*;
import org.json.*;
import java.net.*;
import java.util.concurrent.*;

/** Started while the Activity is visible; owns camera independently of its screen. */
public final class CameraService extends Service {
    final class LocalBinder extends Binder { CameraService service() { return CameraService.this; } }
    private final LocalBinder binder = new LocalBinder();
    CameraEngine engine;
    private AudioEngine audio;
    private String audioDevice="off";
    private int audioChannels=1;
    private ControlServer usbControl, wifiControl;
    private VideoServer wifiVideo;
    private WifiSecurity wifi;
    private PowerManager.WakeLock cpuLock;
    private WifiManager.WifiLock wifiLock;
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private volatile boolean destroyed;
    private String lastPhase = "";
    volatile String startupError = "";

    public void onCreate() {
        super.onCreate();
        getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel("camera","DroidVideo camera",NotificationManager.IMPORTANCE_LOW));
        Notification notification = notification(false);
        if(Build.VERSION.SDK_INT >= 30) startForeground(10,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA | (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)==android.content.pm.PackageManager.PERMISSION_GRANTED?ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE:0));
        else if(Build.VERSION.SDK_INT >= 29) startForeground(10,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA);
        else startForeground(10,notification);
        try {
            cpuLock = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"DroidVideo:stream");cpuLock.setReferenceCounted(false);
            wifiLock = getApplicationContext().getSystemService(WifiManager.class).createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF,"DroidVideo:stream");wifiLock.setReferenceCounted(false);
            engine = new CameraEngine(this,null);
            audio = new AudioEngine(this,engine::publish);
            usbControl = new ControlServer(this::call);
            worker.scheduleWithFixedDelay(() -> {
                try {
                    JSONObject s = engine.call("/status",new JSONObject());
                    String phase=s.optString("phase");boolean active=phase.equals("streaming")||phase.equals("starting");
                    if(!active&&!audio.status().optString("phase").equals("off"))audio.close();
                    synchronized(this) { if(destroyed)return;updateLocks(active); }
                    if(!phase.equals(lastPhase)) { lastPhase=phase;getSystemService(NotificationManager.class).notify(10,notification(active)); }
                } catch(Exception ignored) {}
            },0,1,TimeUnit.SECONDS);
        } catch(Exception e) { startupError=e.getMessage(); }
    }
    void promoteMicrophone() {
        if(Build.VERSION.SDK_INT>=30 && checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)==android.content.pm.PackageManager.PERMISSION_GRANTED)
            startForeground(10,notification(lastPhase.equals("streaming")),ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA|ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
    }
    public IBinder onBind(Intent intent) { return binder; }
    public int onStartCommand(Intent intent,int flags,int id) {
        if(intent != null && "STOP".equals(intent.getAction())) worker.execute(()->{try{call("/stop",new JSONObject());synchronized(this){closeWifi();}}catch(Exception ignored){}});
        return START_NOT_STICKY;
    }
    synchronized JSONObject call(String path,JSONObject body) throws Exception {
        if(engine == null)throw new IllegalStateException(startupError);
        if(path.equals("/network"))return networkInfo();
        if(path.equals("/audio-inputs"))return new JSONObject().put("devices",audio.devices());
        if(path.equals("/audio")) {
            String next=body.getString("device");int count=body.optInt("channels",1);
            if(count!=1&&count!=2)throw new IllegalArgumentException("Invalid channel count");
            if(engine.call("/status",new JSONObject()).optString("phase").equals("streaming"))audio.start(next,count);
            audioDevice=next;audioChannels=count;
            return new JSONObject().put("device",audioDevice).put("channels",audioChannels);
        }
        if(path.equals("/start"))audio.close();
        JSONObject result=engine.call(path,body);
        if(path.equals("/start")) { try { audio.start(audioDevice,audioChannels); } catch(Exception e) { engine.call("/stop",new JSONObject());throw e; } }
        if(path.equals("/stop"))audio.close();
        result.put("audio",audio.status()).put("audioDevice",audioDevice).put("audioChannels",audioChannels);
        if(path.equals("/status")) result.put("wifiEnabled",wifi != null);
        if(path.equals("/start")||path.equals("/stop")) synchronized(this) { if(!destroyed)updateLocks(result.optString("phase").equals("starting")||result.optString("phase").equals("streaming")); }
        return result;
    }
    synchronized JSONObject setWifi(boolean enable) throws Exception {
        closeWifi();
        if(enable) {
            String ip=wifiAddress(); if(ip.isEmpty())throw new IllegalStateException(UiText.choose(this,"Connect the phone to Wi-Fi first.","Előbb csatlakoztasd a telefont Wi-Fi-re."));
            WifiSecurity next=new WifiSecurity();
            try {
                wifiControl=new ControlServer(this::call,next.listen(27188),next.token);
                wifiVideo=new VideoServer(engine::requestKey,next.listen(27189),next.token);
                wifi=next;engine.setWifiVideo(wifiVideo);
            } catch(Exception e) { closeWifi();throw e; }
        }
        return networkInfo();
    }
    synchronized JSONObject networkInfo() throws Exception {
        String ip=wifiAddress();
        return new JSONObject().put("enabled",wifi!=null).put("address",ip)
            .put("pairingUrl",wifi!=null&&!ip.isEmpty()?wifi.link(ip):"");
    }
    private String wifiAddress() {
        ConnectivityManager manager=getSystemService(ConnectivityManager.class);
        for(Network network:manager.getAllNetworks()) {
            NetworkCapabilities caps=manager.getNetworkCapabilities(network);
            if(caps==null||!caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI))continue;
            LinkProperties props=manager.getLinkProperties(network);if(props==null)continue;
            for(LinkAddress a:props.getLinkAddresses())if(a.getAddress() instanceof Inet4Address&&!a.getAddress().isLoopbackAddress())return a.getAddress().getHostAddress();
        }
        return "";
    }
    private void updateLocks(boolean active) {
        if(cpuLock!=null) { if(active&&!cpuLock.isHeld())cpuLock.acquire();else if(!active&&cpuLock.isHeld())cpuLock.release(); }
        if(wifiLock!=null) { if(active&&wifi!=null&&!wifiLock.isHeld())wifiLock.acquire();else if((!active||wifi==null)&&wifiLock.isHeld())wifiLock.release(); }
    }
    private void closeWifi() {
        if(engine!=null)engine.setWifiVideo(null);
        if(wifiControl!=null)wifiControl.close();if(wifiVideo!=null)wifiVideo.close();
        wifiControl=null;wifiVideo=null;wifi=null;
        if(wifiLock!=null&&wifiLock.isHeld())wifiLock.release();
    }
    private Notification notification(boolean streaming) {
        PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stop=PendingIntent.getService(this,1,new Intent(this,CameraService.class).setAction("STOP"),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this,"camera").setSmallIcon(R.drawable.ic_notification).setContentTitle("DroidVideo")
            .setContentText(streaming?UiText.choose(this,"Camera is live · screen may be locked","Kameraadás aktív · a kijelző lezárható"):UiText.choose(this,"Ready for USB / Wi-Fi","USB / Wi-Fi kapcsolatra kész"))
            .setOngoing(true).setContentIntent(open).addAction(new Notification.Action.Builder(null,UiText.choose(this,"Stop stream","Adás leállítása"),stop).build()).build();
    }
    public void onDestroy() {
        synchronized(this) { destroyed=true;closeWifi();updateLocks(false); }
        worker.shutdownNow();if(usbControl!=null)usbControl.close();if(audio!=null)audio.close();if(engine!=null)engine.close();
        super.onDestroy();
    }
}
