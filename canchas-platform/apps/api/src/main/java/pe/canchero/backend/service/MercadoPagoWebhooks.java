package pe.canchero.backend.service;

import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** Inbox durable: responder 200 solo despues de persistir, no hacer HTTP en el receptor. */
@Service
public class MercadoPagoWebhooks {
    private final JdbcTemplate jdbc;
    private final MercadoPagoService payments;
    private final MercadoPagoSettings settings;
    public MercadoPagoWebhooks(JdbcTemplate jdbc,MercadoPagoService payments,MercadoPagoSettings settings){this.jdbc=jdbc;this.payments=payments;this.settings=settings;}
    public void accept(String signature,String requestId,String paymentId){
        PaymentCrypto.verifyWebhook(settings.webhookSecret(),signature,requestId,paymentId,Instant.now());
        if(!payments.available())throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"Notificaciones aun no configuradas");
        jdbc.update("""
            insert into mp_webhook(payment_id) values(?) on conflict(payment_id) do update
            set revision=mp_webhook.revision+1,pendiente=true,intentos=0,proximo_intento=now(),actualizado_en=now()
            """,paymentId);
    }
    @Scheduled(fixedDelay=5000,initialDelay=15000)
    public void process(){
        if(!settings.enabled() || !payments.available())return;
        for(var x:jdbc.queryForList("select payment_id,revision,intentos from mp_webhook where pendiente and proximo_intento<=now() and intentos<12 order by proximo_intento limit 10")){
            try{
                payments.notify(x.get("payment_id").toString());
                jdbc.update("update mp_webhook set pendiente=false,actualizado_en=now() where payment_id=? and revision=?",x.get("payment_id"),x.get("revision"));
            }catch(RuntimeException ex){
                jdbc.update("update mp_webhook set intentos=intentos+1,proximo_intento=now()+interval '30 seconds' * power(2,least(intentos,6)),actualizado_en=now() where payment_id=? and revision=?",x.get("payment_id"),x.get("revision"));
                // No registrar cuerpos, tokens, URL de credenciales ni datos personales.
                org.slf4j.LoggerFactory.getLogger(getClass()).warn("Notificacion Mercado Pago pendiente de reintento ({})",ex.getClass().getSimpleName());
            }
        }
    }
}
