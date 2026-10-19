package pe.canchero.backend.service;

import java.util.HashSet;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.*;

@Service
public class CashVenueStateService {
    public record State(List<CashBoxDto> cajas, CashSessionDto sesion,
                        List<CashMovementDto> movimientos, List<CashAuditDto> arqueos,
                        boolean pagosListos, CashBalanceDto balance, String balanceError) {
        public State(List<CashBoxDto> cajas, CashSessionDto sesion, List<CashMovementDto> movimientos, List<CashAuditDto> arqueos) {
            this(cajas, sesion, movimientos, arqueos, false, null, "");
        }
    }

    private final JdbcTemplate jdbc;
    private final SupabaseDataService data;

    public CashVenueStateService(JdbcTemplate jdbc, SupabaseDataService data) {
        this.jdbc = jdbc;
        this.data = data;
    }

    @Transactional(readOnly = true)
    public State read(int sedeId, AuthUserDto user) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        var owners = jdbc.queryForList("select id_dueno from sede where id_sede = ?", String.class, sedeId);
        if (owners.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Sede no encontrada");
        if (!user.id().equals(owners.get(0))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "La sede no pertenece a tu cuenta");
        }
        var cajas = data.listCashBoxes(sedeId);
        CashSessionDto session = null;
        for (var caja : cajas) {
            var open = data.getOpenCashSession(caja.id());
            if (open.isPresent() && open.get().sedeId() == sedeId) {
                session = open.get();
                break;
            }
        }
        var ids = new HashSet<>(jdbc.queryForList("""
                select sc.id_sesion_caja from sesion_caja sc
                join caja c on c.id_caja = sc.id_caja where c.id_sede = ?
                """, Integer.class, sedeId));
        var audits = ids.isEmpty() ? List.<CashAuditDto>of()
                : data.listCashAudits().stream().filter(audit -> ids.contains(audit.sesionId())).toList();
        var movements = session == null ? List.<CashMovementDto>of() : data.listCashMovements(session.id());
        boolean ready = data.salePaymentsReady();
        CashBalanceDto balance = null;
        String error = "";
        if (session != null) {
            if (!ready) error = "El cierre requiere completar la migracion de pagos.";
            else try { balance = data.cashBalance(session.id()); }
            catch (ResponseStatusException ex) { error = ex.getReason(); }
        }
        return new State(cajas, session, movements, audits, ready, balance, error);
    }
}
