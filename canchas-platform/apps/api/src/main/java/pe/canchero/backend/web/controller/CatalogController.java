package pe.canchero.backend.web.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.canchero.backend.service.SupabaseDataService;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/catalog")
public class CatalogController {

    private final SupabaseDataService data;

    public CatalogController(SupabaseDataService data) {
        this.data = data;
    }

    @GetMapping("/roles")
    public List<Map<String, Object>> roles() {
        return data.listRoles();
    }

    @GetMapping("/court-types")
    public List<Map<String, Object>> courtTypes() {
        return data.listCourtTypes();
    }

    @GetMapping("/payment-methods")
    public List<Map<String, Object>> paymentMethods() {
        return data.listPaymentMethods();
    }

    @GetMapping("/reservation-statuses")
    public List<Map<String, Object>> reservationStatuses() {
        return data.listReservationStatuses();
    }

    @GetMapping("/districts")
    public List<Map<String, Object>> districts() {
        return data.listDistricts();
    }
}
