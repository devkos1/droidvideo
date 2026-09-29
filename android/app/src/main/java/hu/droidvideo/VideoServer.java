package hu.droidvideo;

import java.io.*;
import java.net.*;
import java.util.concurrent.ArrayBlockingQueue;

/** Loopback-only, bounded video delivery. Never block the camera/codec thread. */
final class VideoServer implements AutoCloseable {
    private final ServerSocket server;
    private volatile Client client;
    private volatile boolean closed;
    private volatile byte[] config;
    private final Runnable requestKey;
    private final java.util.concurrent.ExecutorService handshakes = new java.util.concurrent.ThreadPoolExecutor(2,2,0,java.util.concurrent.TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(4),r -> { Thread t=new Thread(r,"video-auth");t.setDaemon(true);return t; });

    VideoServer(Runnable requestKey) throws IOException {
        this(requestKey,new ServerSocket(27185,1,InetAddress.getByName("127.0.0.1")),null);
    }
    VideoServer(Runnable requestKey, ServerSocket listener, String token) {
        this.requestKey = requestKey;
        server = listener;
        Thread accept = new Thread(() -> {
            while (!closed) try {
                Socket socket = server.accept();
                try { handshakes.execute(() -> authenticate(socket,token)); }
                catch(java.util.concurrent.RejectedExecutionException e) { socket.close(); }
            } catch (IOException e) { if (!closed) break; }
        }, "video-accept");
        accept.setDaemon(true);
        accept.start();
    }
    private void authenticate(Socket socket,String token) {
        try {
                socket.setSoTimeout(3000);
                if(token != null) {
                    ByteArrayOutputStream line = new ByteArrayOutputStream();
                    InputStream in = socket.getInputStream();
                    for(int i=0;i<65;i++) { int b=in.read(); if(b<0)throw new EOFException(); if(b=='\n')break;line.write(b); }
                    if(!java.security.MessageDigest.isEqual(token.getBytes(java.nio.charset.StandardCharsets.US_ASCII),line.toByteArray())) { socket.close(); return; }
                }
                socket.setTcpNoDelay(true);
                Client next = new Client(socket);
                synchronized (this) {
                    if(closed) { socket.close(); return; }
                    if (client != null) client.close();
                    client = next;
                    if (config != null) next.offer(packet(2, 0, config));
                }
                next.start();
                requestKey.run();
        } catch(IOException e) { try { socket.close(); } catch(IOException ignored) {} }
    }

    static byte[] packet(int flags, long timestamp, byte[] bytes) {
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream(bytes.length + 13);
            DataOutputStream data = new DataOutputStream(out);
            data.writeByte(flags); data.writeLong(timestamp); data.writeInt(bytes.length); data.write(bytes);
            return out.toByteArray();
        } catch (IOException impossible) { throw new AssertionError(impossible); }
    }

    synchronized void publish(int flags, long timestamp, byte[] bytes) {
        if (flags == 2) config = bytes;
        Client current = client;
        if (current == null) return;
        if (flags != 2 && current.waitingKey) {
            if (flags != 1) return;
            current.waitingKey = false;
        }
        if (!current.offer(packet(flags, timestamp, bytes))) {
            // Drop an entire dependency chain instead of accumulating latency.
            current.queue.clear(); current.waitingKey = true;
            if (config != null) current.offer(packet(2, 0, config));
            requestKey.run();
        }
    }

    synchronized void reset() {
        config = null;
        if (client != null) { client.queue.clear(); client.waitingKey = true; }
    }

    public synchronized void close() {
        closed = true;
        try { server.close(); } catch (IOException ignored) {}
        if (client != null) client.close();
        handshakes.shutdownNow();
    }

    private final class Client extends Thread {
        final Socket socket;
        final ArrayBlockingQueue<byte[]> queue = new ArrayBlockingQueue<>(8);
        volatile boolean waitingKey = true;
        Client(Socket socket) { super("video-writer"); this.socket = socket; setDaemon(true); }
        boolean offer(byte[] bytes) { return queue.offer(bytes); }
        void close() { try { socket.close(); } catch (IOException ignored) {} interrupt(); }
        public void run() {
            try (OutputStream out = socket.getOutputStream()) {
                while (!isInterrupted()) out.write(queue.take());
            } catch (IOException | InterruptedException ignored) {
            } finally { close(); synchronized (VideoServer.this) { if (client == this) client = null; } }
        }
    }
}
