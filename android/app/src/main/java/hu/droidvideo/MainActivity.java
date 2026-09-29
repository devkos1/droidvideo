package hu.droidvideo;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.os.*;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.util.concurrent.*;

public final class MainActivity extends Activity {
    private static final int BG=0xff10171b,PANEL=0xff1b252a,MINT=0xffa9edc9,MUTED=0xff94a8b0;
    private final Handler ui=new Handler(Looper.getMainLooper());
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private CameraService service;
    private boolean bound,visible,busy,syncing,draggingZoom,draggingExposure,loaded,pollPending;
    private TextureView preview;
    private FrameLayout root;
    private TextView state,zoomValue,exposureValue,previewNote,audioState;
    private Spinner cameras,modes,microphones,channels;
    private SeekBar zoom,exposure;
    private Switch torch;
    private Button start,autofocus,wifi;
    private JSONArray catalog=new JSONArray(),inputs=new JSONArray();
    private JSONObject status=new JSONObject();
    private String displayedCamera="",displayedMode="";
    private final ServiceConnection connection=new ServiceConnection() {
        public void onServiceConnected(ComponentName name,IBinder binder) {
            service=((CameraService.LocalBinder)binder).service();
            service.promoteMicrophone();
            if(service.engine==null){toast(service.startupError);return;}
            if(preview.isAvailable()&&visible)service.engine.attachPreview(preview);
            refresh();ui.removeCallbacks(poll);ui.post(poll);
        }
        public void onServiceDisconnected(ComponentName name) {service=null;loaded=false;state.setText(t("Service stopped. Reopen the app.","A szolgáltatás leállt. Nyisd újra az appot."));}
    };
    private final Runnable poll=new Runnable(){public void run(){
        if(!visible)return;
        if(service!=null&&!busy&&!pollPending){pollPending=true;worker.execute(()->{try{JSONObject next=service.call("/status",new JSONObject());ui.post(()->{pollPending=false;applyStatus(next);});}catch(Exception e){ui.post(()->{pollPending=false;state.setText(e.getMessage());});}});}
        ui.postDelayed(this,400);
    }};
    private String t(String en,String hu){return UiText.choose(this,en,hu);}
    private int dp(float n){return (int)(n*getResources().getDisplayMetrics().density+.5f);}
    private GradientDrawable shape(int color){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(12));return d;}
    private TextView text(String value,int size,int color){TextView v=new TextView(this);v.setText(value);v.setTextColor(color);v.setTextSize(size);return v;}
    private Button button(String label,boolean primary){Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setTextSize(12);b.setTextColor(primary?BG:MINT);b.setBackground(shape(primary?MINT:0xff293b33));b.setMinHeight(dp(38));b.setMinimumHeight(dp(38));return b;}
    private void gap(LinearLayout panel,int n){panel.addView(new Space(this),new LinearLayout.LayoutParams(1,dp(n)));}
    private void label(LinearLayout panel,String en,String hu){panel.addView(text(t(en,hu),11,MUTED));gap(panel,4);}
    private void items(Spinner view,String[] labels){ArrayAdapter<String>a=new ArrayAdapter<>(this,android.R.layout.simple_spinner_item,labels);a.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);view.setAdapter(a);view.setBackground(shape(0xff10191f));}
    private void selectListener(Spinner s,Runnable action){s.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onNothingSelected(AdapterView<?>p){}public void onItemSelected(AdapterView<?>p,View v,int i,long id){if(!syncing&&!busy&&loaded)action.run();}});}
    public void onCreate(Bundle saved){
        super.onCreate(saved);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        root=new FrameLayout(this);root.setBackgroundColor(BG);
        LinearLayout shell=new LinearLayout(this);shell.setOrientation(LinearLayout.VERTICAL);shell.setPadding(dp(14),dp(8),dp(14),dp(10));root.addView(shell);
        LinearLayout top=new LinearLayout(this);top.setGravity(Gravity.CENTER_VERTICAL);shell.addView(top,new LinearLayout.LayoutParams(-1,dp(48)));
        TextView title=text("DroidVideo",23,Color.WHITE);title.setTypeface(null,Typeface.BOLD);top.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        Button lang=button(UiText.english(this)?"EN / HU":"HU / EN",false);top.addView(lang,new LinearLayout.LayoutParams(dp(80),dp(36)));
        lang.setOnClickListener(v->{getSharedPreferences("ui",0).edit().putString("language",UiText.english(this)?"hu":"en").apply();recreate();});
        wifi=button("Wi-Fi",false);LinearLayout.LayoutParams wp=new LinearLayout.LayoutParams(dp(74),dp(36));wp.setMargins(dp(8),0,0,0);top.addView(wifi,wp);wifi.setOnClickListener(v->wifiDialog());
        Button sleep=button(t("Dim screen","Sötétítés"),false);LinearLayout.LayoutParams sp=new LinearLayout.LayoutParams(dp(105),dp(36));sp.setMargins(dp(8),0,0,0);top.addView(sleep,sp);sleep.setOnClickListener(v->darken());
        LinearLayout body=new LinearLayout(this);shell.addView(body,new LinearLayout.LayoutParams(-1,0,1));
        FrameLayout frame=new FrameLayout(this);frame.setBackground(shape(Color.BLACK));frame.setClipToOutline(true);LinearLayout.LayoutParams pp=new LinearLayout.LayoutParams(0,-1,1);pp.setMargins(0,dp(7),dp(12),0);body.addView(frame,pp);
        preview=new TextureView(this){public boolean performClick(){super.performClick();return true;}};frame.addView(preview,new FrameLayout.LayoutParams(-1,-1));
        preview.setContentDescription(t("Live camera. Tap to focus.","Élőkép. Érintsd meg a fókuszáláshoz."));
        previewNote=text("",15,MUTED);previewNote.setGravity(Gravity.CENTER);frame.addView(previewNote,new FrameLayout.LayoutParams(-1,-1));
        state=text(t("Starting camera service…","Kameraszolgáltatás indítása…"),11,MINT);state.setPadding(dp(12),dp(9),dp(12),dp(9));state.setBackground(shape(0xcc17251e));FrameLayout.LayoutParams st=new FrameLayout.LayoutParams(-2,-2,Gravity.BOTTOM|Gravity.START);st.setMargins(dp(12),0,dp(12),dp(12));frame.addView(state,st);
        ScrollView scroll=new ScrollView(this);LinearLayout.LayoutParams side=new LinearLayout.LayoutParams(dp(258),-1);side.topMargin=dp(7);body.addView(scroll,side);
        LinearLayout panel=new LinearLayout(this);panel.setOrientation(LinearLayout.VERTICAL);panel.setPadding(dp(14),dp(14),dp(14),dp(14));panel.setBackground(shape(PANEL));scroll.addView(panel);
        panel.addView(text(t("CAMERA CONTROLS","KAMERAVEZÉRLÉS"),10,MINT));gap(panel,12);
        label(panel,"Lens","Objektív");cameras=new Spinner(this);panel.addView(cameras,new LinearLayout.LayoutParams(-1,dp(42)));gap(panel,10);
        label(panel,"Quality","Minőség");modes=new Spinner(this);panel.addView(modes,new LinearLayout.LayoutParams(-1,dp(42)));gap(panel,12);
        zoomValue=text("Zoom · 1.0×",12,Color.WHITE);panel.addView(zoomValue);zoom=new SeekBar(this);zoom.setMax(1000);zoom.setProgressTintList(android.content.res.ColorStateList.valueOf(MINT));panel.addView(zoom);
        zoom.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onStartTrackingTouch(SeekBar b){draggingZoom=true;}public void onProgressChanged(SeekBar b,int p,boolean user){if(user)zoomValue.setText(String.format(java.util.Locale.ROOT,"Zoom · %.2f×",zoomRatio(p)));}public void onStopTrackingTouch(SeekBar b){draggingZoom=false;command("/control",obj("zoom",zoomRatio(b.getProgress())));}});
        exposureValue=text(t("Exposure · 0","Expozíció · 0"),12,Color.WHITE);panel.addView(exposureValue);exposure=new SeekBar(this);exposure.setProgressTintList(android.content.res.ColorStateList.valueOf(MINT));panel.addView(exposure);
        exposure.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onStartTrackingTouch(SeekBar b){draggingExposure=true;}public void onProgressChanged(SeekBar b,int p,boolean user){if(user)exposureValue.setText(t("Exposure · ","Expozíció · ")+(p+cameraInfo().optInt("exposureMin")));}public void onStopTrackingTouch(SeekBar b){draggingExposure=false;command("/control",obj("exposure",b.getProgress()+cameraInfo().optInt("exposureMin")));}});
        autofocus=button(t("Continuous autofocus","Folyamatos autofókusz"),false);panel.addView(autofocus,new LinearLayout.LayoutParams(-1,dp(38)));autofocus.setOnClickListener(v->command("/control",obj("autofocus",true)));gap(panel,8);
        torch=new Switch(this);torch.setText(t("Continuous light","Folyamatos fény"));torch.setTextColor(Color.WHITE);torch.setTextSize(12);panel.addView(torch);torch.setOnCheckedChangeListener((v,on)->{if(!syncing)command("/control",obj("torch",on));});gap(panel,12);
        label(panel,"Phone microphone","Telefon mikrofonja");microphones=new Spinner(this);panel.addView(microphones,new LinearLayout.LayoutParams(-1,dp(40)));channels=new Spinner(this);items(channels,new String[]{t("Mono · 48 kHz","Monó · 48 kHz"),t("Stereo · 48 kHz","Sztereó · 48 kHz")});panel.addView(channels,new LinearLayout.LayoutParams(-1,dp(36)));
        audioState=text("",10,MUTED);panel.addView(audioState);gap(panel,12);
        start=button(t("Start video","Élőkép indítása"),true);panel.addView(start,new LinearLayout.LayoutParams(-1,dp(44)));start.setOnClickListener(v->{if(status.optString("phase").equals("streaming"))command("/stop",new JSONObject());else startSelected();});gap(panel,8);
        Button refresh=button(t("Refresh inputs","Bemenetek frissítése"),false);panel.addView(refresh,new LinearLayout.LayoutParams(-1,dp(36)));refresh.setOnClickListener(v->refresh());
        selectListener(cameras,()->{String id=cameraInfo().optString("id");if(id.equals(displayedCamera))return;updateModes("");if(status.optString("phase").equals("streaming"))startSelected();});
        selectListener(modes,()->{if(!modeId().equals(displayedMode)&&status.optString("phase").equals("streaming"))startSelected();});
        selectListener(microphones,this::changeAudio);selectListener(channels,this::changeAudio);
        preview.setSurfaceTextureListener(new TextureView.SurfaceTextureListener(){
            public void onSurfaceTextureAvailable(SurfaceTexture t,int w,int h){if(service!=null&&visible)service.engine.attachPreview(preview);}
            public void onSurfaceTextureSizeChanged(SurfaceTexture t,int w,int h){if(service!=null&&visible)service.engine.attachPreview(preview);}
            public void onSurfaceTextureUpdated(SurfaceTexture t){}
            public boolean onSurfaceTextureDestroyed(SurfaceTexture t){if(service!=null){service.engine.detachPreview(t);return false;}return true;}
        });
        preview.setOnTouchListener((v,e)->{if(e.getAction()==MotionEvent.ACTION_UP){v.performClick();Matrix inv=new Matrix();float[] p={e.getX(),e.getY()};if(preview.getTransform(null).invert(inv))inv.mapPoints(p);if(p[0]>=0&&p[1]>=0&&p[0]<=v.getWidth()&&p[1]<=v.getHeight())command("/control",obj("focusX",p[0]/v.getWidth(),"focusY",p[1]/v.getHeight()));}return true;});
        root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});setContentView(root);
        if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.CAMERA,Manifest.permission.RECORD_AUDIO},1);
        else if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},2);
    }
    private JSONObject obj(Object...pairs){JSONObject o=new JSONObject();try{for(int i=0;i<pairs.length;i+=2)o.put((String)pairs[i],pairs[i+1]);}catch(Exception ignored){}return o;}
    private JSONObject cameraInfo(){JSONObject c=catalog.optJSONObject(cameras.getSelectedItemPosition());return c==null?new JSONObject():c;}
    private String modeId(){JSONArray list=cameraInfo().optJSONArray("modes");JSONObject m=list==null?null:list.optJSONObject(modes.getSelectedItemPosition());return m==null?"":m.optString("id");}
    private double zoomRatio(int p){JSONObject c=cameraInfo();return c.optDouble("minZoom",1)+(c.optDouble("maxZoom",1)-c.optDouble("minZoom",1))*p/1000;}
    private void updateModes(String wanted){JSONArray list=cameraInfo().optJSONArray("modes");if(list==null)list=new JSONArray();String[] labels=new String[list.length()];int selected=0;for(int i=0;i<labels.length;i++){labels[i]=list.optJSONObject(i).optString("label");if(list.optJSONObject(i).optString("id").equals(wanted))selected=i;}boolean was=syncing;syncing=true;items(modes,labels);modes.setSelection(selected);syncing=was;}
    private void startSelected(){if(modeId().isEmpty()){toast(t("No supported mode.","Nincs támogatott mód."));return;}command("/start",obj("cameraId",cameraInfo().optString("id"),"mode",modeId()));}
    private void changeAudio(){JSONObject d=inputs.optJSONObject(microphones.getSelectedItemPosition());if(d==null)return;String id=d.optString("id");int count=channels.getSelectedItemPosition()+1;if(id.equals(status.optString("audioDevice","off"))&&count==status.optInt("audioChannels",1))return;command("/audio",obj("device",id,"channels",count));}
    private void command(String path,JSONObject body){if(service==null||busy)return;busy=true;worker.execute(()->{try{service.call(path,body);JSONObject next=service.call("/status",new JSONObject());ui.post(()->{busy=false;applyStatus(next);});}catch(Exception e){ui.post(()->{busy=false;toast(e.getMessage());});}});}
    private void refresh(){if(service==null||busy)return;busy=true;worker.execute(()->{try{
        JSONArray c=service.call("/cameras",new JSONObject()).getJSONArray("cameras"),a=service.call("/audio-inputs",new JSONObject()).getJSONArray("devices");JSONObject s=service.call("/status",new JSONObject());
        ui.post(()->{syncing=true;catalog=c;inputs=a;String[] labels=new String[c.length()];for(int i=0;i<labels.length;i++)labels[i]=c.optJSONObject(i).optString("label");items(cameras,labels);labels=new String[a.length()];for(int i=0;i<labels.length;i++)labels[i]=a.optJSONObject(i).optString("label").replace("Off",t("Off","Kikapcsolva")).replace("System default microphone",t("System default microphone","Alapértelmezett mikrofon"));items(microphones,labels);updateModes(s.optString("mode"));syncing=false;loaded=true;busy=false;displayedCamera="";displayedMode="";applyStatus(s);});
    }catch(Exception e){ui.post(()->{busy=false;toast(e.getMessage());});}});}
    private void applyStatus(JSONObject s){
        if(!visible||busy)return;status=s;syncing=true;boolean live=s.optString("phase").equals("streaming"),starting=s.optString("phase").equals("starting");String id=s.optString("cameraId"),mode=s.optString("mode");
        if((live||starting)&&(!id.equals(displayedCamera)||!mode.equals(displayedMode))){for(int i=0;i<catalog.length();i++)if(catalog.optJSONObject(i).optString("id").equals(id))cameras.setSelection(i);updateModes(mode);displayedCamera=id;displayedMode=mode;}
        JSONObject c=cameraInfo();double min=c.optDouble("minZoom",1),max=c.optDouble("maxZoom",1),ratio=s.optDouble("zoom",1);
        if(!draggingZoom){zoom.setProgress(max>min?(int)((ratio-min)/(max-min)*1000):0);zoomValue.setText(String.format(java.util.Locale.ROOT,"Zoom · %.2f×",ratio));}
        int emin=c.optInt("exposureMin"),emax=c.optInt("exposureMax");exposure.setMax(emax-emin);if(!draggingExposure){exposure.setProgress(s.optInt("exposure")-emin);exposureValue.setText(t("Exposure · ","Expozíció · ")+s.optInt("exposure"));}
        torch.setChecked(s.optBoolean("torch"));torch.setEnabled(live&&c.optBoolean("torch"));zoom.setEnabled(live&&max>min);exposure.setEnabled(live&&emax>emin);autofocus.setEnabled(live&&c.optBoolean("focus"));autofocus.setText(s.optBoolean("autofocus",true)?t("Autofocus · Auto","Autofókusz · Auto"):t("Focus locked · return to Auto","Fókusz rögzítve · Auto"));
        String aid=s.optString("audioDevice","off");for(int i=0;i<inputs.length();i++)if(inputs.optJSONObject(i).optString("id").equals(aid))microphones.setSelection(i);channels.setSelection(s.optInt("audioChannels",1)-1);JSONObject audio=s.optJSONObject("audio");audioState.setText(audio==null?"":audio.optString("error").isEmpty()?audio.optString("routed"):audio.optString("error"));
        start.setEnabled(loaded&&!starting);start.setText(starting?t("Starting…","Indítás…"):live?t("Stop video","Adás leállítása"):t("Start video","Élőkép indítása"));cameras.setEnabled(!starting);modes.setEnabled(!starting);
        previewNote.setVisibility(live&&s.optBoolean("phonePreview")?View.GONE:View.VISIBLE);previewNote.setText(live?t("Streaming without phone preview\nThis mode needs all camera resources.","Adás telefonos előnézet nélkül\nEhhez a módhoz minden kamera-erőforrás szükséges."):t("Your next stream starts here.\nChoose a camera, then start the video.","Itt kezdődik a következő adásod.\nVálassz kamerát, majd indítsd el a videót."));
        state.setText(!s.optString("error").isEmpty()?s.optString("error"):live?String.format(java.util.Locale.ROOT,"● LIVE · %s · %.1f fps",mode,s.optDouble("measuredFps")):t("USB / Wi-Fi ready","USB / Wi-Fi kapcsolatra kész"));wifi.setText(s.optBoolean("wifiEnabled")?"Wi-Fi ●":"Wi-Fi");syncing=false;
    }
    private void wifiDialog(){if(service==null)return;LinearLayout p=new LinearLayout(this);p.setOrientation(LinearLayout.VERTICAL);p.setPadding(dp(22),dp(12),dp(22),dp(16));Switch toggle=new Switch(this);toggle.setText(t("Enable encrypted Wi-Fi sharing","Titkosított Wi-Fi-megosztás"));p.addView(toggle);p.addView(text(t("Use the same Wi-Fi on the phone and PC.","A telefon és a PC ugyanahhoz a Wi-Fi-hez csatlakozzon."),12,MUTED));TextView link=text("",11,Color.WHITE);link.setTextIsSelectable(true);p.addView(link);Button copy=button(t("Copy pairing link","Párosítási link másolása"),true);p.addView(copy);copy.setOnClickListener(v->{getSystemService(android.content.ClipboardManager.class).setPrimaryClip(ClipData.newPlainText("DroidVideo",link.getText()));toast(t("Link copied. Paste it in the Windows app.","Link másolva. Illeszd be a Windows appba."));});
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle(t("Wi-Fi pairing","Wi-Fi párosítás")).setView(p).setPositiveButton(t("Done","Kész"),null).create();dialog.show();
        worker.execute(()->{try{JSONObject n=service.networkInfo();ui.post(()->{toggle.setChecked(n.optBoolean("enabled"));link.setText(n.optString("pairingUrl"));copy.setEnabled(n.optBoolean("enabled"));toggle.setOnCheckedChangeListener((v,on)->{toggle.setEnabled(false);worker.execute(()->{try{JSONObject result=service.setWifi(on);ui.post(()->{link.setText(result.optString("pairingUrl"));copy.setEnabled(on);toggle.setEnabled(true);});}catch(Exception e){ui.post(()->{toast(e.getMessage());dialog.dismiss();});}});});});}catch(Exception e){ui.post(()->toast(e.getMessage()));}});
    }
    private void darken(){if(!status.optString("phase").equals("streaming")){toast(t("Start the video first.","Először indítsd el a videót."));return;}TextView cover=text(t("Hold to wake\nPower button: turn the display off.","Tartsd nyomva a visszatéréshez\nBekapcsológomb: kijelző kikapcsolása."),12,0xff444444);cover.setGravity(Gravity.CENTER);cover.setBackgroundColor(Color.BLACK);root.addView(cover,new FrameLayout.LayoutParams(-1,-1));WindowManager.LayoutParams params=getWindow().getAttributes();params.screenBrightness=0;getWindow().setAttributes(params);getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);cover.setOnLongClickListener(v->{root.removeView(cover);WindowManager.LayoutParams restore=getWindow().getAttributes();restore.screenBrightness=-1;getWindow().setAttributes(restore);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);return true;});}
    private void toast(String message){Toast.makeText(this,message,Toast.LENGTH_LONG).show();}
    private void ensureService(){if(bound||checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)return;Intent i=new Intent(this,CameraService.class);startForegroundService(i);bound=bindService(i,connection,Context.BIND_AUTO_CREATE);}
    public void onRequestPermissionsResult(int request,String[] permissions,int[] grants){super.onRequestPermissionsResult(request,permissions,grants);if(visible){ensureService();if(service!=null)service.promoteMicrophone();}}
    protected void onStart(){super.onStart();visible=true;ensureService();if(service!=null&&preview.isAvailable())service.engine.attachPreview(preview);ui.removeCallbacks(poll);ui.post(poll);}
    protected void onStop(){visible=false;ui.removeCallbacks(poll);if(service!=null)service.engine.detachPreview(null);super.onStop();}
    protected void onDestroy(){if(bound)unbindService(connection);worker.shutdownNow();super.onDestroy();}
}
