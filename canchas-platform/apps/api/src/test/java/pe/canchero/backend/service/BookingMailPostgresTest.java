package pe.canchero.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import pe.canchero.backend.it.*;
import pe.canchero.backend.web.controller.NotificationPreferencesController;
import static pe.canchero.backend.it.PostgresTestSupport.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BookingMailPostgresTest {
    PostgresTestSupport.App app;
    JdbcTemplate jdbc;
    MailService mail;
    BookingMailService service;
    ObjectMapper json=new ObjectMapper();
    @BeforeEach void setup() throws Exception {
        PostgresTestServer.requireAvailable(); PostgresTestServer.resetSchema();
        jdbc=PostgresTestSupport.jdbc(); seedTwoVenues(jdbc);
        jdbc.execute(Files.readString(Path.of("../../docs/sql/notificaciones_reservas.sql")));
        app=newApp();
        mail=mock(MailService.class); when(mail.resendConfigured()).thenReturn(true); when(mail.itineraryUrl()).thenReturn("https://example.test/itinerario");
        service=new BookingMailService(jdbc,mail,json,true);
    }
    @AfterEach void close() { if (app!=null) app.close(); }
    int booking() { return Integer.parseInt(app.data().createBooking(PostgresTestSupport.booking(""+COURT_A,VENUE_A,PLAYER_1,"email-test"),PLAYER_1,"email-test").id()); }
    @Test void committedReservationQueuesOnceAndFailedTransactionNeverSends() {
        var tx=new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));
        tx.executeWithoutResult(status -> { booking(); status.setRollbackOnly(); });
        assertEquals(0,jdbc.queryForObject("select count(*) from reserva_correo_outbox",Integer.class));
        int id=booking();
        assertEquals(1,jdbc.queryForObject("select count(*) from reserva_correo_outbox where id_reserva=?",Integer.class,id));
        app.data().createBooking(PostgresTestSupport.booking(""+COURT_A,VENUE_A,PLAYER_1,"email-test"),PLAYER_1,"email-test");
        assertEquals(1,jdbc.queryForObject("select count(*) from reserva_correo_outbox",Integer.class));
        service.process(); service.process();
        verify(mail,times(1)).sendResend(eq(PLAYER_1.email()),contains("confirmada"),anyString(),startsWith("booking-"));
        assertEquals("enviado",jdbc.queryForObject("select estado from reserva_correo_outbox",String.class));
    }
    @Test void cancellationSuppressesOutdatedConfirmationAndPreferencesArePerUser() {
        int id=booking();
        app.data().cancelBooking(id,PLAYER_1);
        service.process();
        verify(mail,times(1)).sendResend(eq(PLAYER_1.email()),contains("cancelada"),anyString(),anyString());
        assertEquals(1,jdbc.queryForObject("select count(*) from reserva_correo_outbox where estado='omitido'",Integer.class));
        var preferences=new NotificationPreferencesController(jdbc,service);
        preferences.save(PLAYER_1,new NotificationPreferencesController.Preferences(false,false,false));
        assertFalse(preferences.get(PLAYER_1).bookingEmails());
        assertTrue(preferences.get(PLAYER_2).bookingEmails());
    }
    @Test void optOutAndProviderFailureDoNotChangeReservationAndCanRetry() {
        int id=booking();
        doThrow(new IllegalStateException("provider unavailable")).when(mail).sendResend(anyString(),anyString(),anyString(),anyString());
        service.process();
        assertEquals("pendiente",jdbc.queryForObject("select estado from reserva_correo_outbox",String.class));
        assertEquals(1,jdbc.queryForObject("select count(*) from reserva where id_reserva=?",Integer.class,id));
        jdbc.update("insert into preferencias_notificacion(id_usuario,correo_reservas) values(?,false)",java.util.UUID.fromString(PLAYER_1.id()));
        jdbc.update("update reserva_correo_outbox set proximo_intento=now()");
        service.process();
        verify(mail,times(1)).sendResend(anyString(),anyString(),anyString(),anyString());
        assertEquals("omitido",jdbc.queryForObject("select estado from reserva_correo_outbox",String.class));
    }
    @Test void rescheduleAndReminderUseUpdatedTimeAndReminderIsNotRepeated() {
        int id=booking();
        jdbc.update("""
            update reserva set fecha_reserva=(timezone('America/Lima',now())+interval '90 minutes')::date,
                hora_inicio=(timezone('America/Lima',now())+interval '90 minutes')::time,
                hora_fin=case
                    when (timezone('America/Lima',now())+interval '150 minutes')::date
                        > (timezone('America/Lima',now())+interval '90 minutes')::date
                    then time '00:00:00'
                    else (timezone('America/Lima',now())+interval '150 minutes')::time
                end,fecmod=now()
                where id_reserva=?
            """,id);
        service.process(); service.process();
        verify(mail,times(1)).sendResend(eq(PLAYER_1.email()),contains("cambió de horario"),anyString(),anyString());
        verify(mail,times(1)).sendResend(eq(PLAYER_1.email()),contains("se acerca"),anyString(),anyString());
        assertEquals(1,jdbc.queryForObject("select count(*) from reserva_correo_outbox where evento='recordatorio' and estado='enviado'",Integer.class));
    }
}
