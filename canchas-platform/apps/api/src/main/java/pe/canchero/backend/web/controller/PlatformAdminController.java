package pe.canchero.backend.web.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.service.PlatformAdminService;
import pe.canchero.backend.web.dto.AuthUserDto;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/superadmin")
public class PlatformAdminController {
    private final PlatformAdminService service;
    public PlatformAdminController(PlatformAdminService service) { this.service = service; }

    @GetMapping("/finance/revenue")
    public PlatformAdminService.RevenueSummary revenue(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            HttpServletRequest request) {
        return service.revenue(from, to, actor(request));
    }

    @GetMapping("/audit")
    public List<PlatformAdminService.AuditEvent> audit(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "") String query,
            @RequestParam(defaultValue = "200") int limit,
            HttpServletRequest request) {
        return service.audit(from, to, query, limit, actor(request));
    }

    private AuthUserDto actor(HttpServletRequest request) {
        Object value = request.getAttribute("auth.user");
        if (!(value instanceof AuthUserDto user)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida o expirada");
        }
        return user;
    }
}
