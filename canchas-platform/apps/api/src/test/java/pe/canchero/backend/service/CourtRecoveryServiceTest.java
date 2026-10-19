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
import static org.mockito.Mockito.*;

class CourtRecoveryServiceTest {
    private JdbcTemplate jdbc;
    private SupabaseDataService data;
    private CourtRecoveryService service;
    private final AuthUserDto owner = new AuthUserDto("owner-a", "", "", "", "dueno");
    private final CourtRequest request = new CourtRequest("54", "Grass Sintetico", "Futbol 7", "Grass", "foto.jpg", List.of(), true, true, 50, 60.0, "18:00");
    private final CourtDto saved = new CourtDto("701", "Grass Sintetico", "Futbol 7", "Futbol 7", "Grass", "Techada", true, true, 50, 60.0, "18:00", "foto.jpg", 54);

    @BeforeEach
    void setup() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("create table sede (id_sede int primary key, id_dueno varchar(40), estado char(1))");
        jdbc.execute("create table cancha (id_cancha int primary key, id_sede int, nombre_numero varchar(100))");
        jdbc.update("insert into sede values (54, 'owner-a', 'A')");
        data = mock(SupabaseDataService.class);
        service = new CourtRecoveryService(jdbc, data);
    }

    @Test
    void retriesReuseTheSavedCourtWithoutDuplicatingOrOverwritingState() {
        when(data.createCourt(request)).thenAnswer(call -> {
            jdbc.update("insert into cancha values (701, 54, 'Grass Sintetico')");
            return saved;
        });
        when(data.getCourt("701")).thenReturn(Optional.of(saved));
        assertEquals(saved, service.recover(owner, request));
        assertEquals(saved, service.recover(owner, request));
        verify(data, times(1)).createCourt(request);
        verify(data, never()).updateCourt(anyString(), any());
    }

    @Test
    void rejectsAnotherOwnerAndNonOwnerWithoutCreating() {
        var other = new AuthUserDto("owner-b", "", "", "", "dueno");
        assertEquals(403, assertThrows(ResponseStatusException.class, () -> service.recover(other, request)).getStatusCode().value());
        var player = new AuthUserDto("owner-a", "", "", "", "jugador");
        assertEquals(403, assertThrows(ResponseStatusException.class, () -> service.recover(player, request)).getStatusCode().value());
        var admin = new AuthUserDto("owner-b", "", "", "", "admin");
        assertEquals(403, assertThrows(ResponseStatusException.class, () -> service.recover(admin, request)).getStatusCode().value());
        verifyNoInteractions(data);
    }

    @Test
    void rejectsAmbiguousCourtIdentityInsteadOfMerging() {
        jdbc.update("insert into cancha values (701, 54, 'Grass Sintetico'), (702, 54, 'Grass Sintetico')");
        assertEquals(409, assertThrows(ResponseStatusException.class, () -> service.recover(owner, request)).getStatusCode().value());
        verifyNoInteractions(data);
    }
}
