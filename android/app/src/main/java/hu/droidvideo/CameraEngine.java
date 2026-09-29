package hu.droidvideo;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Rect;
import android.hardware.camera2.*;
import android.hardware.camera2.params.MeteringRectangle;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.*;
import android.os.*;
import android.util.Range;
import android.util.Size;
import android.view.Surface;
import android.view.TextureView;
import org.json.*;
import java.nio.ByteBuffer;
import java.util.*;
import java.util.concurrent.*;

final class CameraEngine implements AutoCloseable {
    final HandlerThread thread = new HandlerThread("camera-engine");
    final Handler handler;
    private final Context activity;
    private volatile TextureView preview;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Map<CameraCaptureSession,android.graphics.SurfaceTexture> retiredTextures = new HashMap<>();
    private final List<android.graphics.SurfaceTexture> pendingTextures = new ArrayList<>();
    private int sessionRevision;
    private volatile VideoServer wifiVideo;
    private volatile byte[] codecConfig;
    private final CameraManager manager;
    private final VideoServer video;
    private CameraDevice camera;
    private CameraCaptureSession session;
    private CaptureRequest.Builder request;
    private MediaCodec encoder;
    private Surface encoderSurface, previewSurface;
    private CameraCharacteristics characteristics;
    private String cameraId = "", mode = "", error = "", phase = "idle";
    private float zoom = 1;
    private int generation, rotation;
    private long frames, bytes, startNs;
    private int width, height, fps, bitrate;
    private int previewWidth, previewHeight;
    private JSONArray cachedCatalog;
    private boolean catalogEnglish;

    CameraEngine(Context activity, TextureView preview) throws Exception {
        this.activity = activity; this.preview = preview;
        manager = activity.getSystemService(CameraManager.class);
        thread.start(); handler = new Handler(thread.getLooper());
        video = new VideoServer(() -> handler.post(this::keyFrame));
    }

    void setWifiVideo(VideoServer server) { handler.post(() -> { wifiVideo = server; if(server!=null&&codecConfig!=null)server.publish(2,0,codecConfig);keyFrame(); }); }
    void requestKey() { handler.post(this::keyFrame); }
    void attachPreview(TextureView view) {
        handler.post(() -> {
            preview = view;
            if(camera != null) try { createSession(generation,true); } catch(Exception e) { fail(e.getMessage()); }
        });
    }
    void detachPreview(android.graphics.SurfaceTexture texture) {
        handler.post(() -> {
            preview = null;
            if(texture != null) {
                if(session != null) retiredTextures.put(session,texture);
                else if(camera != null) pendingTextures.add(texture);
                else texture.release();
            }
            if(camera != null) try { createSession(generation,false); } catch(Exception e) { fail(e.getMessage()); }
        });
    }
    void publish(int flags,long timestamp,byte[] bytes) {
        if(flags==2)codecConfig=bytes;
        video.publish(flags,timestamp,bytes);
        VideoServer current=wifiVideo;if(current != null)current.publish(flags,timestamp,bytes);
    }
    private int displayRotation() { return activity.getSystemService(android.view.WindowManager.class).getDefaultDisplay().getRotation()*90; }

    JSONObject call(String path, JSONObject body) throws Exception {
        FutureTask<JSONObject> task = new FutureTask<>(() -> {
            switch (path) {
                case "/status": return status();
                case "/cameras": return new JSONObject().put("cameras", catalog());
                case "/start": start(body.getString("cameraId"), body.getString("mode")); break;
                case "/stop": stop(); break;
                case "/control": control(body); break;
                case "/keyframe": keyFrame(); break;
                default: throw new IllegalArgumentException(UiText.choose(activity,"Unknown command","Ismeretlen parancs"));
            }
            return status();
        });
        handler.post(task);
        try { return task.get(8, TimeUnit.SECONDS); }
        catch (ExecutionException e) { throw new Exception(e.getCause().getMessage(), e.getCause()); }
        catch (TimeoutException e) { task.cancel(false); throw new Exception(UiText.choose(activity,"Camera request timed out.","A kamera nem válaszolt időben.")); }
    }

    private boolean encoderSupports(int w, int h, int f) {
        for (MediaCodecInfo info : new MediaCodecList(MediaCodecList.REGULAR_CODECS).getCodecInfos()) {
            if (!info.isEncoder()) continue;
            if (Build.VERSION.SDK_INT >= 29 && !info.isHardwareAccelerated()) continue;
            if (Build.VERSION.SDK_INT < 29 && (info.getName().startsWith("OMX.google.") || info.getName().startsWith("c2.android."))) continue;
            try { if (info.getCapabilitiesForType("video/avc").getVideoCapabilities().areSizeAndRateSupported(w, h, f)) return true; }
            catch (IllegalArgumentException ignored) {}
        }
        return false;
    }

    private String encoderName(int w, int h, int f) {
        for (MediaCodecInfo info : new MediaCodecList(MediaCodecList.REGULAR_CODECS).getCodecInfos()) {
            if (!info.isEncoder()) continue;
            if (Build.VERSION.SDK_INT >= 29 && !info.isHardwareAccelerated()) continue;
            if (Build.VERSION.SDK_INT < 29 && (info.getName().startsWith("OMX.google.") || info.getName().startsWith("c2.android."))) continue;
            try { if (info.getCapabilitiesForType("video/avc").getVideoCapabilities().areSizeAndRateSupported(w, h, f)) return info.getName(); }
            catch (IllegalArgumentException ignored) {}
        }
        throw new IllegalArgumentException(UiText.choose(activity,"No compatible hardware H.264 encoder.","Nincs megfelelő hardveres H.264-kódoló."));
    }

    private Range<Integer> fpsRange(CameraCharacteristics c, int target) {
        Range<Integer> best = null;
        Range<Integer>[] ranges = c.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES);
        if (ranges != null) for (Range<Integer> r : ranges)
            if (r.getUpper() == target && (best == null || r.getLower() > best.getLower())) best = r;
        return best;
    }

    JSONArray catalog() throws Exception {
        if (activity.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
            throw new IllegalStateException(UiText.choose(activity,"Allow camera access on the phone.","Engedélyezd a kamerát a telefonon."));
        if (cachedCatalog != null && catalogEnglish==UiText.english(activity)) return cachedCatalog;
        catalogEnglish=UiText.english(activity);
        JSONArray result = new JSONArray();
        for (String id : manager.getCameraIdList()) {
            CameraCharacteristics c = manager.getCameraCharacteristics(id);
            StreamConfigurationMap map = c.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
            if (map == null || map.getOutputSizes(MediaCodec.class) == null) continue;
            List<Size> sizes = Arrays.asList(map.getOutputSizes(MediaCodec.class));
            JSONArray modes = new JSONArray();
            for (int[] m : new int[][]{{3840,2160,30},{1920,1080,60},{1920,1080,30},{1280,720,60},{1280,720,30}}) {
                Size size = new Size(m[0], m[1]);
                if (!sizes.contains(size) || fpsRange(c, m[2]) == null || !encoderSupports(m[0],m[1],m[2])) continue;
                long duration = map.getOutputMinFrameDuration(MediaCodec.class, size);
                // Unknown frame duration is not evidence that a high-rate mode works.
                if (duration == 0 && m[2] > 30) continue;
                if (duration > 0 && 1e9 / duration + 0.5 < m[2]) continue;
                modes.put(new JSONObject().put("id", m[0]+"x"+m[1]+"@"+m[2])
                    .put("label", (m[0] == 3840 ? "4K" : m[1]+"p")+" / "+m[2]+" fps")
                    .put("width",m[0]).put("height",m[1]).put("fps",m[2]));
            }
            Integer facing = c.get(CameraCharacteristics.LENS_FACING);
            String label = Objects.equals(facing, CameraCharacteristics.LENS_FACING_FRONT) ? UiText.choose(activity,"Front","Előlapi") : UiText.choose(activity,"Rear","Hátlapi");
            float[] focal = c.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS);
            if (focal != null && focal.length > 0) label += String.format(Locale.ROOT," · %.1f mm",focal[0]);
            float maxZoom = Optional.ofNullable(c.get(CameraCharacteristics.SCALER_AVAILABLE_MAX_DIGITAL_ZOOM)).orElse(1f);
            float minZoom = 1;
            if (Build.VERSION.SDK_INT >= 30) {
                Range<Float> range = c.get(CameraCharacteristics.CONTROL_ZOOM_RATIO_RANGE);
                if (range != null) { minZoom = range.getLower(); maxZoom = range.getUpper(); }
            }
            Range<Integer> exposure = c.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_RANGE);
            int[] af = c.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES);
            boolean focus = af != null && Arrays.stream(af).anyMatch(v -> v == CaptureRequest.CONTROL_AF_MODE_AUTO);
            result.put(new JSONObject().put("id", id).put("label",label+" ["+id+"]").put("modes",modes)
                .put("minZoom",minZoom).put("maxZoom",maxZoom).put("focus",focus)
                .put("torch",Boolean.TRUE.equals(c.get(CameraCharacteristics.FLASH_INFO_AVAILABLE)))
                .put("exposureMin",exposure == null ? 0 : exposure.getLower())
                .put("exposureMax",exposure == null ? 0 : exposure.getUpper()));
        }
        cachedCatalog = result;
        return result;
    }

    private void start(String id, String selectedMode) throws Exception {
        JSONObject chosen = null;
        JSONArray cameras = catalog();
        for (int i=0;i<cameras.length();i++) {
            JSONObject c = cameras.getJSONObject(i);
            if (!c.getString("id").equals(id)) continue;
            JSONArray modes = c.getJSONArray("modes");
            for (int j=0;j<modes.length();j++) if (modes.getJSONObject(j).getString("id").equals(selectedMode)) chosen = modes.getJSONObject(j);
        }
        if (chosen == null) throw new IllegalArgumentException(UiText.choose(activity,"This camera does not support the selected mode.","Ez a kamera nem támogatja a kiválasztott módot."));
        stop();
        final int epoch = generation;
        cameraId = id; mode = selectedMode; error = ""; phase = "starting"; zoom = 1;
        width = chosen.getInt("width"); height = chosen.getInt("height"); fps = chosen.getInt("fps");
        bitrate = width >= 3840 ? 32000000 : width >= 1920 ? (fps >= 60 ? 20000000 : 12000000) : (fps >= 60 ? 8000000 : 6000000);
        characteristics = manager.getCameraCharacteristics(id);
        int display = displayRotation();
        int sensor = Optional.ofNullable(characteristics.get(CameraCharacteristics.SENSOR_ORIENTATION)).orElse(0);
        boolean front = Objects.equals(characteristics.get(CameraCharacteristics.LENS_FACING), CameraCharacteristics.LENS_FACING_FRONT);
        rotation = (sensor + (front ? display : -display) + 360) % 360;
        try {
            encoder = MediaCodec.createByCodecName(encoderName(width,height,fps));
            MediaFormat format = MediaFormat.createVideoFormat("video/avc",width,height);
            format.setInteger(MediaFormat.KEY_COLOR_FORMAT,MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
            MediaCodecInfo.VideoCapabilities caps = encoder.getCodecInfo().getCapabilitiesForType("video/avc").getVideoCapabilities();
            bitrate = caps.getBitrateRange().clamp(bitrate);
            format.setInteger(MediaFormat.KEY_BIT_RATE,bitrate);
            format.setInteger(MediaFormat.KEY_FRAME_RATE,fps);
            format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL,1);
            if (Build.VERSION.SDK_INT >= 29) format.setInteger(MediaFormat.KEY_MAX_B_FRAMES,0);
            encoder.setCallback(new MediaCodec.Callback() {
                public void onInputBufferAvailable(MediaCodec codec,int index) {}
                public void onOutputBufferAvailable(MediaCodec codec,int index,MediaCodec.BufferInfo info) {
                    if (epoch != generation) return;
                    try {
                        if (info.size > 0) {
                            ByteBuffer buffer = codec.getOutputBuffer(index);
                            if (buffer != null) {
                                buffer.position(info.offset); buffer.limit(info.offset+info.size);
                                byte[] data = new byte[info.size]; buffer.get(data);
                                if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0) {
                                    publish((info.flags & MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0 ? 1 : 0,info.presentationTimeUs,data);
                                    frames++; bytes += data.length;
                                }
                            }
                        }
                    } catch (Exception e) { fail(UiText.choose(activity,"Encoding error: ","Kódolási hiba: ")+e.getMessage()); }
                    finally { try { codec.releaseOutputBuffer(index,false); } catch (IllegalStateException ignored) {} }
                }
                public void onOutputFormatChanged(MediaCodec codec,MediaFormat f) {
                    if (epoch != generation) return;
                    ByteBuffer sps = f.getByteBuffer("csd-0"), pps = f.getByteBuffer("csd-1");
                    if (sps == null) { fail(UiText.choose(activity,"Missing H.264 configuration.","Hiányzó H.264 konfiguráció.")); return; }
                    byte[] data = new byte[sps.remaining()+(pps == null ? 0 : pps.remaining())];
                    int n = sps.remaining(); sps.get(data,0,n); if (pps != null) pps.get(data,n,pps.remaining());
                    publish(2,0,data);
                }
                public void onError(MediaCodec codec,MediaCodec.CodecException e) { if (epoch == generation) fail(UiText.choose(activity,"Encoder: ","Kódoló: ")+e.getDiagnosticInfo()); }
            },handler);
            encoder.configure(format,null,null,MediaCodec.CONFIGURE_FLAG_ENCODE);
            encoderSurface = encoder.createInputSurface(); encoder.start();
            if (activity.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) throw new SecurityException(UiText.choose(activity,"Camera permission required","Nincs kameraengedély"));
            manager.openCamera(id,new CameraDevice.StateCallback() {
                public void onOpened(CameraDevice device) {
                    if (epoch != generation) { device.close(); return; }
                    camera = device;
                    try { createSession(epoch,true); } catch (Exception e) { fail(e.getMessage()); }
                }
                public void onDisconnected(CameraDevice device) { device.close(); if (epoch == generation) fail(UiText.choose(activity,"Camera disconnected.","A kamera leválasztva.")); }
                public void onError(CameraDevice device,int code) { device.close(); if (epoch == generation) fail(UiText.choose(activity,"Camera error (","Kamerahiba (")+code+UiText.choose(activity,"). Is another app using the camera?","). Más alkalmazás használja?")); }
            },handler);
            handler.postDelayed(() -> { if (epoch == generation && phase.equals("starting")) fail(UiText.choose(activity,"Camera startup timed out.","A kamera indítása időtúllépés miatt leállt.")); },10000);
        } catch (Exception e) { fail(e.getMessage()); throw e; }
    }

    private void createSession(int epoch, boolean withPreview) throws Exception {
        final int revision = ++sessionRevision;
        CaptureRequest previous = request == null ? null : request.build();
        if(session != null) { session.close(); session = null; }
        if(previewSurface != null) { previewSurface.release(); previewSurface = null; }
        request = camera.createCaptureRequest(CameraDevice.TEMPLATE_RECORD);
        request.addTarget(encoderSurface);
        List<Surface> surfaces = new ArrayList<>(); surfaces.add(encoderSurface);
        // A second preview stream is optional; prefer a size that can sustain the selected FPS.
        StreamConfigurationMap map = characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
        if (withPreview && preview != null && preview.isAvailable() && map != null) {
            Size[] sizes = map.getOutputSizes(android.graphics.SurfaceTexture.class);
            Size best = null;
            if (sizes != null) for (Size s : sizes) {
                long duration = map.getOutputMinFrameDuration(android.graphics.SurfaceTexture.class,s);
                if (s.getWidth() <= 1280 && s.getHeight() <= 720 && Math.abs(s.getWidth()/(double)s.getHeight()-16.0/9) < .03
                    && (duration > 0 ? 1e9/duration+.5 >= fps : fps <= 30)
                    && (best == null || s.getWidth() > best.getWidth())) best = s;
            }
            if (best != null && preview.getSurfaceTexture() != null) {
                preview.getSurfaceTexture().setDefaultBufferSize(best.getWidth(),best.getHeight());
                previewWidth = best.getWidth(); previewHeight = best.getHeight();
                updatePreviewTransform();
                previewSurface = new Surface(preview.getSurfaceTexture());
                surfaces.add(previewSurface); request.addTarget(previewSurface);
            }
        }
        request.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE,fpsRange(characteristics,fps));
        setContinuousFocus();
        if(previous != null) {
            copySetting(previous,CaptureRequest.SCALER_CROP_REGION);
            if(Build.VERSION.SDK_INT >= 30) copySetting(previous,CaptureRequest.CONTROL_ZOOM_RATIO);
            copySetting(previous,CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION);
            copySetting(previous,CaptureRequest.FLASH_MODE);
            copySetting(previous,CaptureRequest.CONTROL_AF_MODE);
            copySetting(previous,CaptureRequest.CONTROL_AF_REGIONS);
        }
        android.hardware.camera2.params.SessionConfiguration config = new android.hardware.camera2.params.SessionConfiguration(
            android.hardware.camera2.params.SessionConfiguration.SESSION_REGULAR,
            surfaces.stream().map(android.hardware.camera2.params.OutputConfiguration::new).collect(java.util.stream.Collectors.toList()),
            handler::post,new CameraCaptureSession.StateCallback() {
                public void onConfigured(CameraCaptureSession s) {
                    if (epoch != generation || revision != sessionRevision) { s.close(); return; }
                    session = s;
                    try { repeat(); phase = "streaming"; if(startNs == 0) { startNs = System.nanoTime(); frames=0; bytes=0; } keyFrame(); }
                    catch (Exception e) { fail(e.getMessage()); }
                }
                public void onConfigureFailed(CameraCaptureSession s) {
                    s.close(); if (epoch != generation || revision != sessionRevision) return;
                    if (previewSurface != null) {
                        previewSurface.release(); previewSurface = null;
                        try { createSession(epoch,false); } catch (Exception e) { fail(e.getMessage()); }
                    } else fail(UiText.choose(activity,"Phone rejected this video mode. Try lower resolution or frame rate.","A telefon elutasította ezt a videómódot. Próbálj alacsonyabb felbontást vagy fps-t."));
                }
                public void onClosed(CameraCaptureSession s) {
                    android.graphics.SurfaceTexture texture = retiredTextures.remove(s);
                    if(texture != null) texture.release();
                    if(revision != sessionRevision) { for(android.graphics.SurfaceTexture t:pendingTextures)t.release();pendingTextures.clear(); }
                }
            });
        config.setSessionParameters(request.build());
        camera.createCaptureSession(config);
    }
    private <T> void copySetting(CaptureRequest previous,CaptureRequest.Key<T> key) { T value=previous.get(key);if(value!=null)request.set(key,value); }

    private void setContinuousFocus() {
        int[] modes = characteristics.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES);
        if (modes == null) return;
        int selected = CaptureRequest.CONTROL_AF_MODE_OFF;
        for (int m : modes) if (m == CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE) selected = m;
        for (int m : modes) if (m == CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO) selected = m;
        request.set(CaptureRequest.CONTROL_AF_MODE,selected);
        request.set(CaptureRequest.CONTROL_AF_TRIGGER,CaptureRequest.CONTROL_AF_TRIGGER_IDLE);
    }

    private void repeat() throws CameraAccessException { session.setRepeatingRequest(request.build(),null,handler); }
    private void control(JSONObject body) throws Exception {
        if (!phase.equals("streaming") || request == null || session == null) throw new IllegalStateException(UiText.choose(activity,"Start video first.","Először indítsd el az élőképet."));
        if (body.has("zoom")) {
            float value = (float)body.getDouble("zoom");
            if (!Float.isFinite(value)) throw new IllegalArgumentException(UiText.choose(activity,"Invalid zoom","Érvénytelen zoom"));
            Range<Float> range = Build.VERSION.SDK_INT >= 30 ? characteristics.get(CameraCharacteristics.CONTROL_ZOOM_RATIO_RANGE) : null;
            if (Build.VERSION.SDK_INT >= 30 && range != null) { zoom = range.clamp(value); request.set(CaptureRequest.CONTROL_ZOOM_RATIO,zoom); }
            else {
                zoom = Math.max(1,Math.min(Optional.ofNullable(characteristics.get(CameraCharacteristics.SCALER_AVAILABLE_MAX_DIGITAL_ZOOM)).orElse(1f),value));
                Rect sensor = characteristics.get(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE);
                int w = Math.round(sensor.width()/zoom), h = Math.round(sensor.height()/zoom);
                request.set(CaptureRequest.SCALER_CROP_REGION,new Rect(sensor.centerX()-w/2,sensor.centerY()-h/2,sensor.centerX()+w/2,sensor.centerY()+h/2));
            }
        }
        if (body.has("exposure")) {
            Range<Integer> range = characteristics.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_RANGE);
            if (range != null) request.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION,range.clamp(body.getInt("exposure")));
        }
        if (body.has("torch")) {
            if (!Boolean.TRUE.equals(characteristics.get(CameraCharacteristics.FLASH_INFO_AVAILABLE))) throw new IllegalArgumentException(UiText.choose(activity,"This camera has no torch.","Ennek a kamerának nincs vakuja."));
            request.set(CaptureRequest.FLASH_MODE,body.getBoolean("torch") ? CaptureRequest.FLASH_MODE_TORCH : CaptureRequest.FLASH_MODE_OFF);
        }
        if (body.optBoolean("autofocus",false)) { setContinuousFocus(); request.set(CaptureRequest.CONTROL_AF_REGIONS,null); }
        repeat();
        if (body.has("focusX")) {
            int[] af = characteristics.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES);
            if (af == null || Arrays.stream(af).noneMatch(v -> v == CaptureRequest.CONTROL_AF_MODE_AUTO)) throw new IllegalArgumentException(UiText.choose(activity,"This lens has fixed focus.","Ez az objektív fix fókuszú."));
            Rect crop = request.get(CaptureRequest.SCALER_CROP_REGION);
            if (crop == null || (Build.VERSION.SDK_INT >= 30 && request.get(CaptureRequest.CONTROL_ZOOM_RATIO) != null)) crop = characteristics.get(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE);
            // Metering uses post-zoom coordinates when CONTROL_ZOOM_RATIO is active.
            // Account for the 16:9 encoder's center crop inside the sensor array.
            int cw = crop.width(), ch = Math.round(cw * height/(float)width);
            if (ch > crop.height()) { ch = crop.height(); cw = Math.round(ch*width/(float)height); }
            Rect visible = new Rect(crop.centerX()-cw/2,crop.centerY()-ch/2,crop.centerX()+cw/2,crop.centerY()+ch/2);
            int side = Math.max(16,Math.min(cw,ch)/12);
            double fx = body.getDouble("focusX"), fy = body.getDouble("focusY");
            if (!Double.isFinite(fx) || !Double.isFinite(fy)) throw new IllegalArgumentException(UiText.choose(activity,"Invalid focus point","Érvénytelen fókuszpont"));
            int x = visible.left+(int)(Math.max(0,Math.min(1,fx))*cw), y = visible.top+(int)(Math.max(0,Math.min(1,fy))*ch);
            x = Math.max(visible.left,Math.min(x-side/2,visible.right-side)); y = Math.max(visible.top,Math.min(y-side/2,visible.bottom-side));
            request.set(CaptureRequest.CONTROL_AF_MODE,CaptureRequest.CONTROL_AF_MODE_AUTO);
            if (Optional.ofNullable(characteristics.get(CameraCharacteristics.CONTROL_MAX_REGIONS_AF)).orElse(0) > 0)
                request.set(CaptureRequest.CONTROL_AF_REGIONS,new MeteringRectangle[]{new MeteringRectangle(x,y,side,side,1000)});
            request.set(CaptureRequest.CONTROL_AF_TRIGGER,CaptureRequest.CONTROL_AF_TRIGGER_START);
            session.capture(request.build(),null,handler);
            request.set(CaptureRequest.CONTROL_AF_TRIGGER,CaptureRequest.CONTROL_AF_TRIGGER_IDLE);
            repeat();
        }
    }

    private void keyFrame() {
        if (encoder == null) return;
        try { Bundle params = new Bundle(); params.putInt(MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME,0); encoder.setParameters(params); }
        catch (IllegalStateException ignored) {}
    }
    private void updatePreviewTransform() {
        final int angle = rotation, pw = previewWidth, ph = previewHeight;
        TextureView target = preview;
        if(target == null) return;
        main.post(() -> {
            if(target != preview) return;
            int vw = target.getWidth(), vh = target.getHeight();
            if (vw == 0 || vh == 0 || pw == 0 || ph == 0) return;
            boolean turn = angle % 180 != 0;
            float fit = Math.min(vw/(float)(turn ? ph : pw),vh/(float)(turn ? pw : ph));
            android.graphics.Matrix matrix = new android.graphics.Matrix();
            matrix.setScale(pw/(float)vw,ph/(float)vh);
            matrix.postTranslate(-pw/2f,-ph/2f); matrix.postRotate(angle);
            matrix.postScale(fit,fit); matrix.postTranslate(vw/2f,vh/2f);
            target.setTransform(matrix);
        });
    }
    private JSONObject status() throws JSONException {
        if (characteristics != null) {
            int display = displayRotation();
            int sensor = Optional.ofNullable(characteristics.get(CameraCharacteristics.SENSOR_ORIENTATION)).orElse(0);
            boolean front = Objects.equals(characteristics.get(CameraCharacteristics.LENS_FACING), CameraCharacteristics.LENS_FACING_FRONT);
            int next = (sensor + (front ? display : -display) + 360) % 360;
            if (rotation != next) { rotation = next; updatePreviewTransform(); }
        }
        double elapsed = startNs == 0 ? 0 : (System.nanoTime()-startNs)/1e9;
        return new JSONObject().put("phase",phase).put("error",error).put("cameraId",cameraId).put("mode",mode)
            .put("width",width).put("height",height).put("targetFps",fps).put("rotation",rotation).put("zoom",zoom).put("phonePreview",previewSurface != null)
            .put("exposure",request == null ? 0 : Optional.ofNullable(request.get(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION)).orElse(0))
            .put("torch",request != null && Objects.equals(request.get(CaptureRequest.FLASH_MODE),CaptureRequest.FLASH_MODE_TORCH))
            .put("autofocus",request == null || !Objects.equals(request.get(CaptureRequest.CONTROL_AF_MODE),CaptureRequest.CONTROL_AF_MODE_AUTO))
            .put("frames",frames).put("measuredFps",phase.equals("streaming") && elapsed > 0 ? frames/elapsed : 0)
            .put("mbps",phase.equals("streaming") && elapsed > 0 ? bytes*8/elapsed/1e6 : 0).put("bitrate",bitrate);
    }
    private void fail(String message) { stop(); error = message == null ? UiText.choose(activity,"Unknown camera error","Ismeretlen kamerahiba") : message; phase = "error"; }
    private void stop() {
        generation++; sessionRevision++;
        if (session != null) { session.close(); session=null; }
        if (camera != null) { camera.close(); camera=null; }
        if (encoder != null) { try { encoder.stop(); } catch (Exception ignored) {} encoder.release(); encoder=null; }
        if (encoderSurface != null) { encoderSurface.release(); encoderSurface=null; }
        if (previewSurface != null) { previewSurface.release(); previewSurface=null; }
        request=null; phase="idle"; frames=0; bytes=0; startNs=0; codecConfig=null; video.reset();
        if(wifiVideo != null) wifiVideo.reset();
    }
    public void close() {
        handler.post(() -> { stop(); video.close(); thread.quitSafely(); });
    }
}
