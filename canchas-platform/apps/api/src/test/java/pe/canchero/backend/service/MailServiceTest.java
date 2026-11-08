package pe.canchero.backend.service;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import static org.junit.jupiter.api.Assertions.*;
class MailServiceTest {
    @Test void resendUsesServerAuthorizationAndStableIdempotencyKey() {
        var builder=RestClient.builder().baseUrl("https://api.resend.com");
        var server=MockRestServiceServer.bindTo(builder).build();
        var mail=new MailService("","reservas@example.test","https://canchero.example.test/","test-only-key");
        ReflectionTestUtils.setField(mail,"client",builder.build());
        server.expect(requestTo("https://api.resend.com/emails"))
            .andExpect(header("Authorization","Bearer test-only-key"))
            .andExpect(header("Idempotency-Key","booking-test"))
            .andExpect(content().json("""
                {"from":"Canchero <reservas@example.test>","to":["player@example.test"],"subject":"Reserva","text":"Horario confirmado"}
                """)).andRespond(withSuccess("{}",org.springframework.http.MediaType.APPLICATION_JSON));
        mail.sendResend("player@example.test","Reserva","Horario confirmado","booking-test");
        assertEquals("https://canchero.example.test/itinerario",mail.itineraryUrl());
        server.verify(); mail.close();
    }
    @Test void withoutCredentialsItDoesNotPretendToSend() {
        var mail=new MailService("","reservas@example.test","https://example.test","");
        assertFalse(mail.resendConfigured());
        assertThrows(IllegalStateException.class,()->mail.sendResend("x@example.test","Test","text","id"));
        mail.close();
    }
}
