package pe.canchero.backend.service;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.*;
import static org.junit.jupiter.api.Assertions.*;


class CashVenueStateServiceTest {
    static class StubData extends SupabaseDataService {
        int reads = 0;
        int auditReads = 0;
        List<CashBoxDto> boxes = List.of();
        List<CashAuditDto> audits = List.of();
        StubData() { super(null, null); }
        @Override public boolean salePaymentsReady() { return false; }
        @Override public List<CashBoxDto> listCashBoxes(Integer id) { reads++; return boxes; }
        @Override public Optional<CashSessionDto> getOpenCashSession(Integer id) { reads++; return Optional.empty(); }
        @Override public List<CashAuditDto> listCashAudits() { reads++; auditReads++; return audits; }
    }
    private JdbcTemplate jdbc;
    private StubData data;
    private CashVenueStateService service;
    private final AuthUserDto owner = new AuthUserDto("owner-a", "", "", "", "dueno");

    @BeforeEach
    void setup() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("create table sede (id_sede int, id_dueno varchar(40))");
        jdbc.execute("create table caja (id_caja int, id_sede int)");
        jdbc.execute("create table sesion_caja (id_sesion_caja int, id_caja int)");
        jdbc.update("insert into sede values (1, 'owner-a'), (2, 'owner-b')");
        jdbc.update("insert into caja values (1, 1), (2, 2)");
        jdbc.update("insert into sesion_caja values (10, 1), (20, 2)");
        data = new StubData();
        service = new CashVenueStateService(jdbc, data);
    }

    @Test
    void rejectsUnauthenticatedAndOtherOwnerBeforeReadingCashData() {
        assertEquals(401, assertThrows(ResponseStatusException.class, () -> service.read(1, null)).getStatusCode().value());
        assertEquals(403, assertThrows(ResponseStatusException.class, () -> service.read(2, owner)).getStatusCode().value());
        assertEquals(404, assertThrows(ResponseStatusException.class, () -> service.read(99, owner)).getStatusCode().value());
        assertEquals(0, data.reads);
    }

    @Test
    void includesOnlyAuditsOfSessionsInTheOwnedVenue() {
        data.boxes = List.of(new CashBoxDto(1, "Caja", 1));
        
        var own = new CashAuditDto("1", 10, "", "", "", 0, 0, 0, 0, 0, 0, 0, "cuadrada", "");
        var foreign = new CashAuditDto("2", 20, "", "", "", 0, 0, 0, 0, 0, 0, 0, "cuadrada", "");
        data.audits = List.of(own, foreign);
        var result = service.read(1, owner);
        assertEquals(List.of(own), result.arqueos());
        assertNull(result.sesion());
        assertTrue(result.movimientos().isEmpty());
    }

    @Test
    void doesNotReadGlobalAuditHistoryWhenTheVenueHasNoSessions() {
        jdbc.update("delete from sesion_caja where id_caja = 1");
        data.boxes = List.of();
        assertTrue(service.read(1, owner).arqueos().isEmpty());
        assertEquals(0, data.auditReads);
    }
}
