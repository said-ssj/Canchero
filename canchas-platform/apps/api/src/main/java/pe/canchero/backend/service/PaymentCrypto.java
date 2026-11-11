package pe.canchero.backend.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public final class PaymentCrypto {
    private PaymentCrypto() {}
    public static String hash(String raw) {
        try {return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8)));}
        catch(Exception ex){throw new IllegalStateException(ex);}
    }
    public static byte[] hmac(String secret,String message) {
        try {Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));return mac.doFinal(message.getBytes(StandardCharsets.UTF_8));}
        catch(Exception ex){throw new IllegalStateException(ex);}
    }
    public static String pass(String secret,UUID id) { return "CAN1_"+Base64.getUrlEncoder().withoutPadding().encodeToString(hmac(secret,"acceso:"+id)); }

    public static void verifyWebhook(String secret,String signature,String requestId,String dataId,Instant now) {
        try {
            if(secret.length()<16 || signature==null || requestId==null || !requestId.matches("[A-Za-z0-9-]{1,150}") || dataId==null || !dataId.matches("[0-9]{1,30}"))throw new IllegalArgumentException();
            String ts=null,v1=null;
            for(String part:signature.split(",")){String[] pair=part.trim().split("=",2);if(pair.length!=2)throw new IllegalArgumentException();if(pair[0].equals("ts")){if(ts!=null)throw new IllegalArgumentException();ts=pair[1];}if(pair[0].equals("v1")){if(v1!=null)throw new IllegalArgumentException();v1=pair[1];}}
            if(ts==null || v1==null || !ts.matches("[0-9]{10,13}") || !v1.matches("[0-9a-fA-F]{64}"))throw new IllegalArgumentException();
            long timestamp=Long.parseLong(ts);if(ts.length()>10)timestamp/=1000;
            if(Math.abs(now.getEpochSecond()-timestamp)>600)throw new IllegalArgumentException();
            String manifest="id:"+dataId+";request-id:"+requestId+";ts:"+ts+";";
            if(!MessageDigest.isEqual(hmac(secret,manifest),HexFormat.of().parseHex(v1)))throw new IllegalArgumentException();
        } catch(RuntimeException ex){throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Firma de notificacion invalida");}
    }
}
