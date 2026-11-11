package pe.canchero.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.it.*;
import static pe.canchero.backend.it.PostgresTestSupport.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Pruebas PostgreSQL real desechable. No llama al proveedor ni escribe datos de prueba remotos. */
class MercadoPagoPostgresTest {
    JdbcTemplate jdbc;
    MercadoPagoService service;
    MercadoPagoClient client;
    MercadoPagoSettings settings;
    DataSourceTransactionManager manager;
    MutableClock clock;
    ObjectMapper json=new ObjectMapper();
    @BeforeEach
    void setup() throws Exception {
        PostgresTestServer.requireAvailable();PostgresTestServer.resetSchema();jdbc=PostgresTestSupport.jdbc();seedTwoVenues(jdbc);
        jdbc.execute("DO $$ BEGIN IF NOT EXISTS(select 1 from pg_roles where rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(select 1 from pg_roles where rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$");
        Path root=Path.of(System.getProperty("user.dir")).toAbsolutePath();while(root!=null&&!Files.exists(root.resolve("supabase/migrations/20261111034030_mercadopago_checkout_accesos.sql")))root=root.getParent();assertNotNull(root);
        jdbc.execute(Files.readString(root.resolve("supabase/migrations/20261111034030_mercadopago_checkout_accesos.sql")));
        clock=new MutableClock(CLOCK.instant());
        settings=new MercadoPagoSettings(true,"unit-test-token","unit-test-webhook-secret","123456","unit-test-pass-secret-with-at-least-32-chars","https://web.example.com","https://api.example.com/api/payments/mercadopago/webhook");
        client=mock(MercadoPagoClient.class);
        when(client.preference(anyMap())).thenAnswer(call->{ObjectNode p=json.createObjectNode();p.put("id",UUID.randomUUID().toString());p.put("collector_id",123456);p.put("init_point","https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=test");return p;});
        manager=new DataSourceTransactionManager(jdbc.getDataSource());
        service=new MercadoPagoService(jdbc,new BookingService(jdbc,new VenueService(jdbc),clock),client,settings,manager,clock);
    }
    MercadoPagoService.StartRequest request(String key,int cupos){return new MercadoPagoService.StartRequest("101",BOOKING_DATE,List.of(10),cupos,key);}
    UUID start(){return service.start(request("test-operation-1",2),PLAYER_1).id();}
    ObjectNode payment(UUID id,String paymentId){var p=json.createObjectNode();p.put("id",paymentId);p.put("external_reference",id.toString());p.put("collector_id",123456);p.put("live_mode",false);p.put("currency_id","PEN");p.put("transaction_amount",90);p.put("status","approved");return p;}
    void approve(UUID id){service.reconcile("10001",payment(id,"10001"));}

    @Test void createsPendingWithoutPaymentAndDoesNotCollectCardData(){
        UUID id=start();var state=service.state(id,PLAYER_1);
        assertEquals("pendiente",state.estado());assertNull(state.passToken());assertEquals(90,state.monto().intValue());
        assertEquals(0,jdbc.queryForObject("select count(*) from pago_reserva",Integer.class));
        assertEquals(1,jdbc.queryForObject("select id_estado_reserva from reserva",Integer.class));
        assertNull(jdbc.queryForObject("select codigo_pase from reserva",String.class));
        assertThrows(ResponseStatusException.class,()->service.start(request("different-operation",2),PLAYER_2));
    }
    @Test void retryUsesOneBookingAndOnePreference(){
        UUID id=start();assertEquals(id,service.start(request("test-operation-1",2),PLAYER_1).id());
        assertEquals(1,jdbc.queryForObject("select count(*) from reserva",Integer.class));verify(client,times(1)).preference(anyMap());
        assertThrows(ResponseStatusException.class,()->service.start(request("test-operation-1",3),PLAYER_1));
    }
    @Test void validatesCapacityAndDoesNotReserveAnUnknownCourt(){
        assertEquals(14,jdbc.queryForObject("select capacidad_acceso from cancha where id_cancha=101",Integer.class));
        assertThrows(ResponseStatusException.class,()->service.start(request("too-many-participants",15),PLAYER_1));
        jdbc.update("update cancha set capacidad_acceso=null where id_cancha=101");
        assertThrows(ResponseStatusException.class,()->service.start(request("missing-capacity",1),PLAYER_1));
        assertEquals(0,jdbc.queryForObject("select count(*) from reserva",Integer.class));
    }
    @Test void verifiedApprovalIsAtomicIdempotentAndPrivate(){
        UUID id=start();approve(id);approve(id);
        var state=service.state(id,PLAYER_1);assertEquals("aprobado",state.estado());assertTrue(state.passToken().startsWith("CAN1_"));
        assertEquals(1,jdbc.queryForObject("select count(*) from pago_reserva",Integer.class));
        assertEquals(90,jdbc.queryForObject("select adelanto from reserva",Integer.class));
        assertThrows(ResponseStatusException.class,()->service.state(id,PLAYER_2));
        assertNotEquals(state.passToken(),jdbc.queryForObject("select token_hash from reserva_acceso",String.class));
        assertTrue(new BookingService(jdbc,new VenueService(jdbc),clock).getBookingByPass("MP-"+state.reservaId()).isEmpty());
    }
    @Test void wrongAmountCurrencyReceiverOrRealPaymentNeverConfirm(){
        UUID id=start();
        for(String field:List.of("transaction_amount","currency_id","collector_id","live_mode","id")){
            var p=payment(id,"10001");
            switch(field){case "transaction_amount"->p.put(field,1);case "currency_id"->p.put(field,"USD");case "collector_id"->p.put(field,999);case "live_mode"->p.put(field,true);default->p.put(field,"99999");}
            assertThrows(ResponseStatusException.class,()->service.reconcile("10001",p),field);
        }
        assertEquals(0,jdbc.queryForObject("select count(*) from pago_reserva",Integer.class));
    }
    @Test void pendingRejectedOrRedirectAloneDoNotGrantAccess(){
        UUID id=start();var p=payment(id,"10001");p.put("status","pending");service.reconcile("10001",p);
        p.put("status","rejected");service.reconcile("10001",p);
        assertEquals("pendiente",service.state(id,PLAYER_1).estado());assertNull(service.state(id,PLAYER_1).passToken());
        assertThrows(ResponseStatusException.class,()->new BookingService(jdbc,new VenueService(jdbc),clock).confirmBooking(service.state(id,PLAYER_1).reservaId(),OWNER_A));
    }
    @Test void expiryFreesTheSlotAndLateApprovalRequiresReview(){
        UUID id=start();clock.advance(Duration.ofMinutes(11));service.expire();
        assertEquals("expirado",service.state(id,PLAYER_1).estado());
        var second=service.start(request("second-operation",2),PLAYER_2);
        approve(id);assertEquals("revision",service.state(id,PLAYER_1).estado());assertNull(service.state(id,PLAYER_1).passToken());
        assertEquals("pendiente",service.state(second.id(),PLAYER_2).estado());
        assertEquals(0,jdbc.queryForObject("select count(*) from pago_reserva",Integer.class));
    }
    @Test void refundRevokesThePassAndCannotBeResurrectedByOldApproval(){
        UUID id=start();approve(id);var p=payment(id,"10001");p.put("status","refunded");service.reconcile("10001",p);
        approve(id);assertEquals("reembolsado",service.state(id,PLAYER_1).estado());assertNull(service.state(id,PLAYER_1).passToken());
        assertEquals("revocado",jdbc.queryForObject("select estado from reserva_acceso",String.class));
    }
    @Test void scanConsumesExactlyOnePerRequestAndCannotCrossVenues(){
        UUID id=start();approve(id);clock.set(Instant.parse("2026-10-23T15:00:00Z"));
        var scanner=new ReservationAccessService(jdbc,manager,clock);String token=service.state(id,PLAYER_1).passToken();UUID request=UUID.randomUUID();
        assertThrows(ResponseStatusException.class,()->scanner.scan(new ReservationAccessService.Scan(token,request),OWNER_B));
        var first=scanner.scan(new ReservationAccessService.Scan(token,request),OWNER_A);assertEquals(1,first.usados());
        assertTrue(scanner.scan(new ReservationAccessService.Scan(token,request),OWNER_A).repetido());
        assertEquals(2,scanner.scan(new ReservationAccessService.Scan(token,UUID.randomUUID()),OWNER_A).usados());
        assertThrows(ResponseStatusException.class,()->scanner.scan(new ReservationAccessService.Scan(token,UUID.randomUUID()),OWNER_A));
        scanner.reverse(first.movimientoId(),"Lectura doble accidental",OWNER_A);scanner.reverse(first.movimientoId(),"Lectura doble accidental",OWNER_A);
        assertEquals(1,jdbc.queryForObject("select ingresos_utilizados from reserva_acceso",Integer.class));
    }
    @Test void concurrentScansDoNotExceedCapacity() throws Exception {
        UUID id=service.start(request("one-person-only",1),PLAYER_1).id();approve(id);clock.set(Instant.parse("2026-10-23T15:00:00Z"));
        String token=service.state(id,PLAYER_1).passToken();var scanner=new ReservationAccessService(jdbc,manager,clock);
        try(var executor=Executors.newFixedThreadPool(2)){
            var barrier=new CyclicBarrier(2);
            Callable<Boolean> scan=()->{barrier.await();try{scanner.scan(new ReservationAccessService.Scan(token,UUID.randomUUID()),OWNER_A);return true;}catch(ResponseStatusException ex){assertEquals(409,ex.getStatusCode().value());return false;}};
            var a=executor.submit(scan);var b=executor.submit(scan);assertNotEquals(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS));
        }
        assertEquals(1,jdbc.queryForObject("select ingresos_utilizados from reserva_acceso",Integer.class));
    }
    @Test void scanChecksTimeCancellationAndInvalidTokens(){
        UUID id=start();approve(id);var scanner=new ReservationAccessService(jdbc,manager,clock);String token=service.state(id,PLAYER_1).passToken();
        assertThrows(ResponseStatusException.class,()->scanner.scan(new ReservationAccessService.Scan(token,UUID.randomUUID()),OWNER_A));
        clock.set(Instant.parse("2026-10-23T15:00:00Z"));jdbc.update("update reserva set id_estado_reserva=4");
        assertThrows(ResponseStatusException.class,()->scanner.scan(new ReservationAccessService.Scan(token,UUID.randomUUID()),OWNER_A));
        assertThrows(ResponseStatusException.class,()->scanner.scan(new ReservationAccessService.Scan("CAN1_"+"A".repeat(43),UUID.randomUUID()),OWNER_A));
        assertEquals(0,jdbc.queryForObject("select count(*) from registro_ingreso",Integer.class));
    }
    @Test void refreshVerifiesOwnershipBeforeCallingProvider(){
        UUID id=start();assertThrows(ResponseStatusException.class,()->service.refresh(id,"10001",PLAYER_2));verify(client,never()).payment(anyString());
        when(client.payment("10001")).thenReturn(payment(UUID.randomUUID(),"10001"));assertThrows(ResponseStatusException.class,()->service.refresh(id,"10001",PLAYER_1));
    }
    @Test void webhookSignatureHasFreshnessAndConstantTimeMacAndDurableInbox(){
        String id="10001",request="request-one",ts=Long.toString(Instant.now().getEpochSecond());
        String mac=HexFormat.of().formatHex(PaymentCrypto.hmac(settings.webhookSecret(),"id:"+id+";request-id:"+request+";ts:"+ts+";"));
        var hooks=new MercadoPagoWebhooks(jdbc,service,settings);
        hooks.accept("ts="+ts+",v1="+mac,request,id);hooks.accept("ts="+ts+",v1="+mac,request,id);
        assertEquals(1,jdbc.queryForObject("select count(*) from mp_webhook",Integer.class));
        assertThrows(ResponseStatusException.class,()->hooks.accept("ts="+ts+",v1="+"0".repeat(64),request,id));
        assertThrows(ResponseStatusException.class,()->PaymentCrypto.verifyWebhook(settings.webhookSecret(),"ts="+ts+",v1="+mac,request,id,Instant.now().plusSeconds(1000)));
    }
    static class MutableClock extends Clock {
        volatile Instant now;MutableClock(Instant now){this.now=now;}
        void advance(Duration duration){now=now.plus(duration);}void set(Instant instant){now=instant;}
        public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return this;}public Instant instant(){return now;}
    }
}
