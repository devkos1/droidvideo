package hu.droidvideo;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.net.*;
import java.security.*;
import java.security.cert.X509Certificate;
import java.util.*;
import javax.net.ssl.*;
import javax.security.auth.x500.X500Principal;

/** Private Android-keystore TLS key. Pairing pins its SHA-256 certificate. */
final class WifiSecurity {
    final SSLContext context;
    final String fingerprint;
    final String token;
    WifiSecurity() throws Exception {
        String alias = "droidvideo-wifi-v1";
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(alias)) {
            KeyPairGenerator generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_RSA,"AndroidKeyStore");
            generator.initialize(new KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(2048).setDigests(KeyProperties.DIGEST_SHA256,KeyProperties.DIGEST_SHA512)
                .setSignaturePaddings(KeyProperties.SIGNATURE_PADDING_RSA_PKCS1)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_RSA_PKCS1,KeyProperties.ENCRYPTION_PADDING_RSA_OAEP)
                .setCertificateSubject(new X500Principal("CN=DroidVideo"))
                .setCertificateNotBefore(new Date(0)).setCertificateNotAfter(new Date(4102444800000L)).build());
            generator.generateKeyPair();
        }
        PrivateKey key = (PrivateKey)store.getKey(alias,null);
        X509Certificate certificate = (X509Certificate)store.getCertificate(alias);
        fingerprint = hex(MessageDigest.getInstance("SHA-256").digest(certificate.getEncoded()));
        byte[] secret = new byte[16]; new SecureRandom().nextBytes(secret); token = hex(secret);
        X509ExtendedKeyManager manager = new X509ExtendedKeyManager() {
            public String[] getClientAliases(String t,Principal[] p) { return null; }
            public String chooseClientAlias(String[] t,Principal[] p,Socket s) { return null; }
            public String[] getServerAliases(String t,Principal[] p) { return t.equals("RSA") ? new String[]{alias} : null; }
            public String chooseServerAlias(String t,Principal[] p,Socket s) { return t.equals("RSA") ? alias : null; }
            public X509Certificate[] getCertificateChain(String a) { return new X509Certificate[]{certificate}; }
            public PrivateKey getPrivateKey(String a) { return key; }
        };
        context = SSLContext.getInstance("TLS"); context.init(new KeyManager[]{manager},null,new SecureRandom());
    }
    ServerSocket listen(int port) throws Exception {
        SSLServerSocket server = (SSLServerSocket)context.getServerSocketFactory().createServerSocket(port,4,InetAddress.getByName("0.0.0.0"));
        // TLS 1.2 works with Android-keystore RSA keys on all supported releases.
        server.setEnabledProtocols(new String[]{"TLSv1.2"}); return server;
    }
    String link(String ip) { return "droidvideo://"+ip+"?key="+token+"&fp="+fingerprint; }
    static String hex(byte[] bytes) { StringBuilder s = new StringBuilder(); for(byte b:bytes)s.append(String.format(Locale.ROOT,"%02x",b&255));return s.toString(); }
}
