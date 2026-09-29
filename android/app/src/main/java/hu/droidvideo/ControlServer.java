package hu.droidvideo;

import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;

/** Small HTTP/1.1 control endpoint, reachable only through adb forwarding. */
final class ControlServer implements AutoCloseable {
    interface Handler { JSONObject handle(String path, JSONObject body) throws Exception; }
    private final ServerSocket server;
    private final ExecutorService workers = new ThreadPoolExecutor(2, 2, 0, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(8), r -> { Thread t = new Thread(r, "control-client"); t.setDaemon(true); return t; });
    private volatile boolean closed;
    private final String token;
    ControlServer(Handler handler) throws IOException {
        this(handler,new ServerSocket(27184,4,InetAddress.getByName("127.0.0.1")),null);
    }
    ControlServer(Handler handler, ServerSocket socketServer, String token) {
        this.server = socketServer; this.token = token;
        Thread thread = new Thread(() -> {
            while (!closed) try {
                Socket socket = server.accept();
                try { workers.execute(() -> serve(socket, handler)); }
                catch (RejectedExecutionException e) { socket.close(); }
            } catch (IOException e) { if (!closed) break; }
        }, "control-accept");
        thread.setDaemon(true); thread.start();
    }
    private static String line(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (int i = 0; i < 4096; i++) {
            int b = in.read(); if (b < 0) throw new EOFException();
            if (b == '\n') return out.toString(StandardCharsets.US_ASCII.name()).trim();
            out.write(b);
        }
        throw new IOException("Header too long");
    }
    private void serve(Socket socket, Handler handler) {
        try (socket) {
            socket.setSoTimeout(5000);
            InputStream in = socket.getInputStream();
            String[] request = line(in).split(" ");
            int length = 0; String authorization = "";
            for (int n = 0; ; n++) {
                String header = line(in); if (header.isEmpty()) break;
                if (n > 32) throw new IOException("Too many headers");
                if (header.toLowerCase(java.util.Locale.ROOT).startsWith("content-length:")) length = Integer.parseInt(header.substring(15).trim());
                if (header.toLowerCase(java.util.Locale.ROOT).startsWith("authorization:")) authorization = header.substring(14).trim();
            }
            if (token != null && !java.security.MessageDigest.isEqual(("Bearer "+token).getBytes(StandardCharsets.US_ASCII),authorization.getBytes(StandardCharsets.US_ASCII))) {
                socket.getOutputStream().write("HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.US_ASCII)); return;
            }
            if (length < 0 || length > 8192 || request.length != 3) throw new IOException("Invalid request");
            byte[] body = new byte[length]; new DataInputStream(in).readFully(body);
            if (token != null && request[0].equals("POST") && request[1].equals("/probe")) {
                JSONObject params = new JSONObject(new String(body,StandardCharsets.UTF_8));
                int count = Math.max(65536,Math.min(2097152,params.optInt("bytes",2097152)));
                byte[] block = new byte[16384]; new java.security.SecureRandom().nextBytes(block);
                OutputStream out = socket.getOutputStream();
                out.write(("HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: "+count+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                for(int sent=0;sent<count;sent+=block.length) out.write(block,0,Math.min(block.length,count-sent));
                return;
            }
            JSONObject response; int status = 200;
            try {
                if (!request[0].equals("POST")) throw new IllegalArgumentException("POST required");
                response = handler.handle(request[1], length == 0 ? new JSONObject() : new JSONObject(new String(body, StandardCharsets.UTF_8)));
            } catch (Exception e) {
                status = 400; response = new JSONObject(); response.put("error", e.getMessage() == null ? e.toString() : e.getMessage());
            }
            byte[] data = response.toString().getBytes(StandardCharsets.UTF_8);
            OutputStream out = socket.getOutputStream();
            out.write(("HTTP/1.1 " + status + (status == 200 ? " OK" : " Bad Request") + "\r\nContent-Type: application/json\r\nContent-Length: " + data.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
            out.write(data);
        } catch (Exception ignored) { /* Disconnected/invalid clients cannot affect the camera. */ }
    }
    public void close() {
        closed = true; try { server.close(); } catch (IOException ignored) {} workers.shutdownNow();
    }
}
