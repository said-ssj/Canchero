package pe.canchero.backend.service;
import java.util.Map;
import org.junit.jupiter.api.*;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import pe.canchero.backend.config.ApiAuthorizationInterceptor;
import pe.canchero.backend.web.controller.MercadoPagoController;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
class MercadoPagoHttpTest {
 MercadoPagoService payments;MercadoPagoWebhooks webhooks;AuthService auth;MockMvc mvc;
 @BeforeEach void setup(){payments=mock(MercadoPagoService.class);webhooks=mock(MercadoPagoWebhooks.class);auth=mock(AuthService.class);
  mvc=MockMvcBuilders.standaloneSetup(new MercadoPagoController(payments,webhooks)).addInterceptors(new ApiAuthorizationInterceptor(mock(AuthTokenService.class),auth)).build();}
 @Test void capabilitiesIsPublicAndContainsNoSecrets() throws Exception {
  when(payments.available()).thenReturn(true);mvc.perform(get("/api/payments/mercadopago/capabilities")).andExpect(status().isOk()).andExpect(jsonPath("$.available").value(true)).andExpect(jsonPath("$.testMode").value(true)).andExpect(jsonPath("$.accessToken").doesNotExist());verifyNoInteractions(auth);}
 @Test void webhookReachesSignatureValidatorWithoutCancheroSession() throws Exception {
  mvc.perform(post("/api/payments/mercadopago/webhook").param("data.id","123").header("x-signature","signed-notification").header("x-request-id","request-1").contentType(MediaType.APPLICATION_JSON).content("{\"type\":\"payment\",\"data\":{\"id\":\"123\"}}"))
   .andExpect(status().isOk());verify(webhooks).accept("signed-notification","request-1","123");verifyNoInteractions(auth);}
 @Test void invalidNotificationCannotReachPersistence() throws Exception {
  mvc.perform(post("/api/payments/mercadopago/webhook").param("data.id","123").contentType(MediaType.APPLICATION_JSON).content("{\"type\":\"payment\",\"data\":{\"id\":\"999\"}}"))
   .andExpect(status().isBadRequest());verifyNoInteractions(webhooks);}
 @Test void checkoutAndRefreshStillRequireAuthenticatedPlayer() throws Exception {
  mvc.perform(post("/api/payments/mercadopago/checkout").contentType(MediaType.APPLICATION_JSON).content("{}" )).andExpect(status().isUnauthorized());
  mvc.perform(post("/api/payments/mercadopago/checkouts/11111111-1111-1111-1111-111111111111/refresh").contentType(MediaType.APPLICATION_JSON).content("{}" )).andExpect(status().isUnauthorized());verifyNoInteractions(payments);}
 @Test void returnsActionableConflictReasonInsteadOfOnlyHttpTitle() throws Exception {
  doThrow(new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,"La reserva temporal ya finalizó"))
    .when(webhooks).accept(any(),any(),any());
  mvc.perform(post("/api/payments/mercadopago/webhook").param("data.id","123").contentType(MediaType.APPLICATION_JSON).content("{\"type\":\"payment\",\"data\":{\"id\":\"123\"}}"))
   .andExpect(status().isConflict()).andExpect(jsonPath("$.message").value("La reserva temporal ya finalizó"));
 }

}
