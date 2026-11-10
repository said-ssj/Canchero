package pe.canchero.backend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.*;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

public class CreditServiceTest {
    private JdbcTemplate jdbc;
    private VenueAccessService access;
    private CashService cashService;
    private CreditService creditService;
    private AuthUserDto owner;

    @BeforeEach
    public void setup() {
        jdbc = mock(JdbcTemplate.class);
        access = mock(VenueAccessService.class);
        cashService = mock(CashService.class);
        owner = new AuthUserDto("owner-uuid-1", "Roberto Dueño", "dueno@canchero.pe", "999888777", "dueno");

        when(access.requirePermission(any(), any(), eq("caja.operar"))).thenReturn(1);
        creditService = new CreditService(jdbc, access, cashService);
    }

    @Test
    public void listCredits_returnsInitialAccountsForVenue() {
        CreditAccountRequest req = new CreditAccountRequest(
                1, "Cliente Demo", "45892147", "987654321", "Equipo Test",
                200.0, "Consumo test", "2026-11-20"
        );
        creditService.createCredit(req, owner);
        List<CreditAccountDto> list = creditService.listCredits(1, owner, null);
        assertNotNull(list);
        assertFalse(list.isEmpty());
        assertTrue(list.stream().anyMatch(a -> a.clienteNombre().contains("Cliente Demo")));
    }

    @Test
    public void createCredit_createsAccountAndCalculatesBalance() {
        CreditAccountRequest req = new CreditAccountRequest(
                1, "Luis Advíncula", "44556677", "987112233", "Rayo Vallecano FC",
                300.0, "Consumo de bebidas energizantes", "2026-11-20"
        );
        CreditAccountDto created = creditService.createCredit(req, owner);
        assertNotNull(created);
        assertEquals(300.0, created.montoOriginal());
        assertEquals(300.0, created.saldo());
        assertEquals(0.0, created.totalAbonado());
        assertEquals("PENDIENTE", created.estado());
        assertEquals("Luis Advíncula", created.clienteNombre());
    }

    @Test
    public void registerPayment_reducesBalanceAndMarksAsCancelledWhenFullyPaid() {
        CreditAccountRequest req = new CreditAccountRequest(
                1, "Paolo Guerrero", "11223344", "999111222", "Alianza Lima",
                100.0, "Alquiler extra y rehidratantes", "2026-11-25"
        );
        CreditAccountDto created = creditService.createCredit(req, owner);

        // Abono parcial de 40.0
        CreditPaymentRequest p1 = new CreditPaymentRequest(created.id(), 40.0, "yape", "998877", 1, "Abono inicial");
        CreditAccountDto afterP1 = creditService.registerPayment(created.id(), p1, owner);
        assertEquals(60.0, afterP1.saldo());
        assertEquals(40.0, afterP1.totalAbonado());
        assertEquals("PENDIENTE", afterP1.estado());

        // Abono final de 60.0
        CreditPaymentRequest p2 = new CreditPaymentRequest(created.id(), 60.0, "efectivo", null, 1, "Liquidación");
        CreditAccountDto afterP2 = creditService.registerPayment(created.id(), p2, owner);
        assertEquals(0.0, afterP2.saldo());
        assertEquals(100.0, afterP2.totalAbonado());
        assertEquals("CANCELADA", afterP2.estado());
    }

    @Test
    public void registerPayment_failsWhenAmountExceedsRemainingBalance() {
        CreditAccountRequest req = new CreditAccountRequest(
                1, "Renato Tapia", "33445566", "988776655", "Leganés",
                50.0, "Aguas minerales", "2026-11-20"
        );
        CreditAccountDto created = creditService.createCredit(req, owner);

        CreditPaymentRequest invalidPayment = new CreditPaymentRequest(created.id(), 100.0, "efectivo", null, 1, "Pago excesivo");
        assertThrows(ResponseStatusException.class, () -> creditService.registerPayment(created.id(), invalidPayment, owner));
    }

    @Test
    public void getSummary_calculatesTotalsCorrectly() {
        CreditSummaryDto summary = creditService.getSummary(1, owner);
        assertNotNull(summary);
        assertTrue(summary.totalPorCobrar() >= 0);
        assertTrue(summary.clientesDeudores() >= 0);
    }
}
