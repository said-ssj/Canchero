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
        jdbc.execute(Files.readString(root.resolve("supabase/migrations/20261112100000_checkout_multibloque.sql")));
        jdbc.update("insert into tipo_horario(id_sede,dia_semana,apertura,cierre,estado) values(10,6,'08:00','00:00','A')");
        jdbc.update("insert into tarifa_cancha(id_cancha,dia_semana,hora_inicio,hora_fin,precio,estado) values(101,6,'08:00','18:00',90,'A')");
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
        assertTrue(state.canResume());assertNull(state.paymentStatus());assertEquals("101",state.courtId());assertEquals(List.of(10),state.hours());
        assertEquals("Mercado Pago",new BookingService(jdbc,new VenueService(jdbc),clock).listMyBookings(PLAYER_1).getFirst().paymentMethod());
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
        assertFalse(state.canResume());assertEquals("approved",state.paymentStatus());
        assertThrows(ResponseStatusException.class,()->new BookingService(jdbc,new VenueService(jdbc),clock).confirmBooking(state.reservaId(),OWNER_A));
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
        assertFalse(service.state(id,PLAYER_1).canResume());assertEquals("pending",service.state(id,PLAYER_1).paymentStatus());
        p.put("status","rejected");service.reconcile("10001",p);
        assertTrue(service.state(id,PLAYER_1).canResume());assertEquals("rejected",service.state(id,PLAYER_1).paymentStatus());
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
    @Test void sharedCopiesKeepOneTokenAndOneGlobalLimitAndExpireAtMatchEnd(){
        UUID id=start();approve(id);
        var initial=service.state(id,PLAYER_1);
        assertEquals("activo",initial.estadoPase());
        assertEquals(initial.passToken(),service.forBooking(initial.reservaId(),PLAYER_1).passToken());
        assertEquals("https://web.example.com/accesos#"+initial.passToken(),initial.publicPassUrl());
        assertEquals("10:00 - 11:00",initial.horario());
        clock.set(Instant.parse("2026-10-23T15:00:00Z"));
        var scanner=new ReservationAccessService(jdbc,manager,clock);
        scanner.scan(new ReservationAccessService.Scan(initial.passToken(),UUID.randomUUID()),OWNER_A);
        assertEquals(initial.passToken(),service.state(id,PLAYER_1).passToken());
        scanner.scan(new ReservationAccessService.Scan(initial.passToken(),UUID.randomUUID()),OWNER_A);
        var exhausted=service.state(id,PLAYER_1);
        assertEquals("agotado",exhausted.estadoPase());assertEquals(2,exhausted.ingresosUtilizados());
        assertNull(exhausted.passToken());assertNull(exhausted.publicPassUrl());
        assertThrows(ResponseStatusException.class,()->scanner.scan(new ReservationAccessService.Scan(initial.passToken(),UUID.randomUUID()),OWNER_A));
        clock.set(Instant.parse("2026-10-23T16:00:00Z"));
        assertEquals("vencido",service.state(id,PLAYER_1).estadoPase());
    }
    @Test void eachPaidReservationGetsItsOwnPassWithoutDuplicatingOnWebhookRetries(){
        UUID first=start();approve(first);String firstToken=service.state(first,PLAYER_1).passToken();
        UUID second=service.start(new MercadoPagoService.StartRequest("101",BOOKING_DATE,List.of(11),2,"another-match-1"),PLAYER_1).id();
        service.reconcile("10002",payment(second,"10002"));service.reconcile("10002",payment(second,"10002"));
        assertNotEquals(firstToken,service.state(second,PLAYER_1).passToken());
        assertEquals(2,jdbc.queryForObject("select count(*) from reserva_acceso",Integer.class));
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
    @Test void returningFromProviderWithNewKeyResumesOnlySameUsersActiveSelection(){
        UUID existing=start();
        assertEquals(existing,service.start(request("new-tab-after-return",2),PLAYER_1).id());
        assertEquals(1,jdbc.queryForObject("select count(*) from reserva",Integer.class));
        verify(client,times(1)).preference(anyMap());
        assertThrows(ResponseStatusException.class,()->service.start(request("other-user-attempt",2),PLAYER_2));
        assertThrows(ResponseStatusException.class,()->service.start(request("different-capacity",3),PLAYER_1));
    }
    @Test void expiredHoldIsNeverResumedWhenReturningWithANewKey(){
        UUID expired=start();clock.advance(Duration.ofMinutes(11));service.expire();
        UUID fresh=service.start(request("new-selection-after-expiry",2),PLAYER_1).id();
        assertNotEquals(expired,fresh);assertEquals("expirado",service.state(expired,PLAYER_1).estado());
        assertEquals(2,jdbc.queryForObject("select count(*) from reserva",Integer.class));
    }

    @Test void alreadyConfirmedBookingIsNotResumedAsPendingPayment(){
        UUID existing=start();
        jdbc.update("update reserva set id_estado_reserva=2 where id_reserva=(select id_reserva from mp_checkout where id=?)",existing);
        assertThrows(ResponseStatusException.class,()->service.start(request("new-key-confirmed",2),PLAYER_1));
        verify(client,times(1)).preference(anyMap());
    }

    MercadoPagoService.StartRequest multi(String key){
        return new MercadoPagoService.StartRequest("101",null,null,2,key,List.of(
            new MercadoPagoService.Selection(LocalDate.parse(BOOKING_DATE).plusDays(1).toString(),List.of(12)),
            new MercadoPagoService.Selection(BOOKING_DATE,List.of(11,10))));
    }
    ObjectNode multiPayment(UUID id){var p=payment(id,"20001");p.put("transaction_amount",270);return p;}
    @Test void multipleDaysOnePreferenceAndIndependentPasses(){
        UUID id=service.start(multi("multi-operation"),PLAYER_1).id();
        var held=service.state(id,PLAYER_1);
        assertEquals(2,held.bloques().size());assertEquals(270,held.totalOperacion().intValue());assertEquals(180,held.monto().intValue());
        var captor=org.mockito.ArgumentCaptor.forClass(Map.class);verify(client,times(1)).preference(captor.capture());
        assertEquals(2,((List<?>)captor.getValue().get("items")).size());
        assertNull(held.passToken());assertEquals(0,jdbc.queryForObject("select count(*) from pago_reserva",Integer.class));
        service.reconcile("20001",multiPayment(id));service.reconcile("20001",multiPayment(id));
        assertEquals(2,jdbc.queryForObject("select count(*) from pago_reserva",Integer.class));
        assertEquals(270,jdbc.queryForObject("select sum(monto) from pago_reserva",Integer.class));
        var approved=service.state(id,PLAYER_1);
        var second=service.state(approved.bloques().getLast().id(),PLAYER_1);
        assertEquals(90,second.monto().intValue());assertEquals("approved",second.paymentStatus());
        assertEquals(id,second.checkoutRaiz());assertNotNull(second.passToken());assertNotEquals(approved.passToken(),second.passToken());
        assertThrows(ResponseStatusException.class,()->service.state(second.id(),PLAYER_2));
        assertEquals(2,jdbc.queryForObject("select count(*) from reserva_acceso where max_ingresos=2",Integer.class));
    }
    @Test void multiDayIdempotenceCanonicalizesDaysAndHours(){
        UUID id=service.start(multi("multi-order-original"),PLAYER_1).id();
        var reversed=new MercadoPagoService.StartRequest("101",null,null,2,"multi-order-retry",List.of(
            new MercadoPagoService.Selection(BOOKING_DATE,List.of(10,11)),
            new MercadoPagoService.Selection(LocalDate.parse(BOOKING_DATE).plusDays(1).toString(),List.of(12))));
        assertEquals(id,service.start(reversed,PLAYER_1).id());verify(client,times(1)).preference(anyMap());
        assertEquals(2,jdbc.queryForObject("select count(*) from reserva",Integer.class));
    }
    @Test void conflictInSecondBlockRollsBackEntireNewBatch(){
        var occupied=new MercadoPagoService.StartRequest("101",LocalDate.parse(BOOKING_DATE).plusDays(1).toString(),List.of(12),1,"occupied-operation");
        service.start(occupied,PLAYER_2);
        assertThrows(ResponseStatusException.class,()->service.start(multi("multi-conflict"),PLAYER_1));
        assertEquals(1,jdbc.queryForObject("select count(*) from reserva",Integer.class));
        assertEquals(1,jdbc.queryForObject("select count(*) from mp_checkout",Integer.class));verify(client,times(1)).preference(anyMap());
    }
    @Test void expiredBatchFreesEveryBlockAndLatePaymentNeverCreatesPass(){
        UUID id=service.start(multi("multi-expiration"),PLAYER_1).id();clock.advance(Duration.ofMinutes(11));service.expire();
        assertEquals(2,jdbc.queryForObject("select count(*) from reserva where estado='I'",Integer.class));
        service.reconcile("20001",multiPayment(id));
        assertEquals(2,jdbc.queryForObject("select count(*) from mp_checkout where estado='revision'",Integer.class));
        assertEquals(0,jdbc.queryForObject("select count(*) from reserva_acceso",Integer.class));
    }
    @Test void cancelledChildPreventsAnyPartialApproval(){
        UUID id=service.start(multi("multi-cancelled-child"),PLAYER_1).id();
        jdbc.update("update reserva set estado='I' where id_reserva=(select id_reserva from mp_checkout where id_checkout_padre=?)",id);
        service.reconcile("20001",multiPayment(id));
        assertEquals("revision",service.state(id,PLAYER_1).estado());
        assertEquals(0,jdbc.queryForObject("select count(*) from pago_reserva",Integer.class));
        assertEquals(0,jdbc.queryForObject("select count(*) from reserva_acceso",Integer.class));
    }
    @Test void refundRevokesEveryPassAndNeverResurrectsOnApprovalReplay(){
        UUID id=service.start(multi("multi-refund"),PLAYER_1).id();var p=multiPayment(id);service.reconcile("20001",p);
        p.put("status","refunded");service.reconcile("20001",p);
        assertEquals(2,jdbc.queryForObject("select count(*) from reserva_acceso where estado='revocado'",Integer.class));
        p.put("status","approved");service.reconcile("20001",p);
        assertEquals("reembolsado",service.state(id,PLAYER_1).estado());
        assertEquals(2,jdbc.queryForObject("select count(*) from pago_reserva",Integer.class));
    }
    @Test void totalMustMatchWholeBatchNotFirstBlock(){
        UUID id=service.start(multi("multi-wrong-total"),PLAYER_1).id();
        assertThrows(ResponseStatusException.class,()->service.reconcile("10001",payment(id,"10001")));
        assertEquals(0,jdbc.queryForObject("select count(*) from mp_pago",Integer.class));
    }
    @Test void invalidOrDuplicateHoursDoNotLeaveAnyHold(){
        var bad=new MercadoPagoService.StartRequest("101",null,null,2,"multi-duplicate",List.of(new MercadoPagoService.Selection(BOOKING_DATE,List.of(10,10))));
        assertThrows(ResponseStatusException.class,()->service.start(bad,PLAYER_1));
        assertEquals(0,jdbc.queryForObject("select count(*) from reserva",Integer.class));
    }

    @Test void childPassConsumesOnlyItsOwnLimitAndUsesOriginalPaymentReference(){
        UUID id=service.start(multi("multi-access-limits"),PLAYER_1).id();var p=multiPayment(id);
        service.reconcile("20001",p);var group=service.state(id,PLAYER_1);
        UUID child=group.bloques().getLast().id();
        when(client.payment("20001")).thenReturn(p);
        assertEquals(child,service.refresh(child,"20001",PLAYER_1).id());
        var childState=service.state(child,PLAYER_1);String token=childState.passToken();
        clock.set(LocalDate.parse(childState.fecha()).atTime(12,0).atZone(ZoneId.of("America/Lima")).toInstant());
        var scanner=new ReservationAccessService(jdbc,manager,clock);
        scanner.scan(new ReservationAccessService.Scan(token,UUID.randomUUID()),OWNER_A);
        scanner.scan(new ReservationAccessService.Scan(token,UUID.randomUUID()),OWNER_A);
        assertThrows(ResponseStatusException.class,()->scanner.scan(new ReservationAccessService.Scan(token,UUID.randomUUID()),OWNER_A));
        assertEquals(0,jdbc.queryForObject("select ingresos_utilizados from reserva_acceso where id=?",Integer.class,id));
        assertEquals("agotado",service.state(child,PLAYER_1).estadoPase());
    }
    @Test void simultaneousDifferentUsersCannotBuyOverlappingBatches()throws Exception{
        ExecutorService pool=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);
        try {
            var first=pool.submit(()->{start.await();try{service.start(multi("multi-race-first"),PLAYER_1);return true;}catch(ResponseStatusException e){return false;}});
            var second=pool.submit(()->{start.await();try{service.start(multi("multi-race-second"),PLAYER_2);return true;}catch(ResponseStatusException e){return false;}});
            start.countDown();assertNotEquals(first.get(20,TimeUnit.SECONDS),second.get(20,TimeUnit.SECONDS));
            assertEquals(2,jdbc.queryForObject("select count(*) from reserva",Integer.class));
            assertEquals(1,jdbc.queryForObject("select count(*) from mp_checkout where id_checkout_padre is null",Integer.class));
            verify(client,times(1)).preference(anyMap());
        }finally{pool.shutdownNow();}
    }

    @Test void changedReservationAmountCannotConfirmAnUnderpaidBatch(){
        UUID id=service.start(multi("multi-changed-price"),PLAYER_1).id();
        jdbc.update("update reserva set monto_total=monto_total+10 where id_reserva=(select id_reserva from mp_checkout where id_checkout_padre=?)",id);
        service.reconcile("20001",multiPayment(id));
        assertEquals("revision",service.state(id,PLAYER_1).estado());
        assertEquals(0,jdbc.queryForObject("select count(*) from pago_reserva",Integer.class));
        assertEquals(0,jdbc.queryForObject("select count(*) from reserva_acceso",Integer.class));
    }

}
