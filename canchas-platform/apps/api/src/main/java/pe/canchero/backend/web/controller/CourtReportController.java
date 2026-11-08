package pe.canchero.backend.web.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.RequestParam;
import pe.canchero.backend.service.Roles;
import pe.canchero.backend.service.CourtReportService;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.CourtReportRequest;
import pe.canchero.backend.web.dto.CourtReportResponse;
import pe.canchero.backend.web.dto.ErrorResponse;
import pe.canchero.backend.web.dto.UpdateCourtReportStatusRequest;

import java.util.List;

@RestController
@RequestMapping("/api/court-reports")
public class CourtReportController {

    private final CourtReportService service;

    public CourtReportController(CourtReportService service) {
        this.service = service;
    }

    private AuthUserDto getAuthenticatedUser(HttpServletRequest request) {
        Object rawUser = request.getAttribute("auth.user");
        if (!(rawUser instanceof AuthUserDto authUser)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Debes iniciar sesión para realizar esta operación");
        }
        return authUser;
    }

    @PostMapping
    public ResponseEntity<CourtReportResponse> createReport(
            @RequestBody CourtReportRequest request,
            HttpServletRequest httpRequest) {
        AuthUserDto authUser = getAuthenticatedUser(httpRequest);
        CourtReportResponse response = service.createReport(request, authUser);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping
    public ResponseEntity<List<CourtReportResponse>> listReports(
            @RequestParam(required = false) Integer sedeId,
            @RequestParam(required = false) Integer canchaId,
            HttpServletRequest httpRequest) {
        AuthUserDto authUser = getAuthenticatedUser(httpRequest);
        if (canchaId != null) {
            return ResponseEntity.ok(service.listReportsByCourt(canchaId, authUser));
        }
        if (sedeId != null) {
            return ResponseEntity.ok(service.listReportsByVenue(sedeId, authUser));
        }
        return ResponseEntity.ok(service.listAllReports(authUser));
    }

    @GetMapping("/mine")
    public ResponseEntity<List<CourtReportResponse>> listMyReports(HttpServletRequest httpRequest) {
        AuthUserDto authUser = getAuthenticatedUser(httpRequest);
        return ResponseEntity.ok(service.listMyReports(authUser));
    }

    @GetMapping("/venue/{sedeId}")
    public ResponseEntity<List<CourtReportResponse>> listByVenue(
            @PathVariable int sedeId,
            HttpServletRequest httpRequest) {
        AuthUserDto authUser = getAuthenticatedUser(httpRequest);
        return ResponseEntity.ok(service.listReportsByVenue(sedeId, authUser));
    }

    @GetMapping("/court/{canchaId}")
    public ResponseEntity<List<CourtReportResponse>> listByCourt(
            @PathVariable int canchaId,
            HttpServletRequest httpRequest) {
        AuthUserDto authUser = getAuthenticatedUser(httpRequest);
        return ResponseEntity.ok(service.listReportsByCourt(canchaId, authUser));
    }

    @PatchMapping("/{reportId}/status")
    public ResponseEntity<CourtReportResponse> updateStatus(
            @PathVariable int reportId,
            @RequestBody UpdateCourtReportStatusRequest request,
            HttpServletRequest httpRequest) {
        AuthUserDto authUser = getAuthenticatedUser(httpRequest);
        return ResponseEntity.ok(service.updateStatus(reportId, request, authUser));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatus(ResponseStatusException ex) {
        return ResponseEntity.status(ex.getStatusCode()).body(new ErrorResponse(ex.getReason()));
    }
}

