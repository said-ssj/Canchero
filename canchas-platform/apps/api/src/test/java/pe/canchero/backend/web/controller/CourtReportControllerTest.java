package pe.canchero.backend.web.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import pe.canchero.backend.service.CourtReportService;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.CourtReportRequest;
import pe.canchero.backend.web.dto.CourtReportResponse;
import pe.canchero.backend.web.dto.UpdateCourtReportStatusRequest;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CourtReportControllerTest {

    private MockMvc mvc;
    private CourtReportService service;
    private final AuthUserDto player = new AuthUserDto("player-uuid", "Jugador", "player@canchero.pe", "999", "cliente");

    @BeforeEach
    void setup() {
        service = mock(CourtReportService.class);
        mvc = MockMvcBuilders.standaloneSetup(new CourtReportController(service)).build();
    }

    @Test
    void rejectsUnauthenticatedCreateReport() throws Exception {
        mvc.perform(post("/api/court-reports")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"canchaId\":1,\"tipoProblema\":\"ILUMINACION\",\"descripcion\":\"Foco fundido\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void createsReportSuccessfullyWhenAuthenticated() throws Exception {
        CourtReportResponse mockResp = new CourtReportResponse(
                1, 101, "Cancha 1", 10, "Sede Central",
                "player-uuid", "Jugador", "ILUMINACION", "Foco fundido",
                "PENDIENTE", "ALTA", null, null, "2026-11-07T21:00:00"
        );
        when(service.createReport(any(CourtReportRequest.class), any(AuthUserDto.class))).thenReturn(mockResp);

        mvc.perform(post("/api/court-reports")
                        .requestAttr("auth.user", player)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"canchaId\":101,\"tipoProblema\":\"ILUMINACION\",\"descripcion\":\"Foco fundido\",\"prioridad\":\"ALTA\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.canchaId").value(101))
                .andExpect(jsonPath("$.nombreCancha").value("Cancha 1"))
                .andExpect(jsonPath("$.sedeId").value(10))
                .andExpect(jsonPath("$.estado").value("PENDIENTE"));
    }

    @Test
    void listsReportsByVenue() throws Exception {
        CourtReportResponse mockResp = new CourtReportResponse(
                1, 101, "Cancha 1", 10, "Sede Central",
                "player-uuid", "Jugador", "ILUMINACION", "Foco fundido",
                "PENDIENTE", "ALTA", null, null, "2026-11-07T21:00:00"
        );
        when(service.listReportsByVenue(eq(10), any(AuthUserDto.class))).thenReturn(List.of(mockResp));

        mvc.perform(get("/api/court-reports/venue/10")
                        .requestAttr("auth.user", player))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(1))
                .andExpect(jsonPath("$[0].sedeId").value(10));
    }

    @Test
    void listsAllReportsForAdmin() throws Exception {
        AuthUserDto admin = new AuthUserDto("admin-uuid", "Admin", "admin@canchero.pe", "999", "admin");
        CourtReportResponse mockResp = new CourtReportResponse(
                1, 101, "Cancha 1", 10, "Sede Central",
                "player-uuid", "Jugador", "ILUMINACION", "Foco fundido",
                "PENDIENTE", "ALTA", null, null, "2026-11-07T21:00:00"
        );
        when(service.listAllReports(any(AuthUserDto.class))).thenReturn(List.of(mockResp));

        mvc.perform(get("/api/court-reports")
                        .requestAttr("auth.user", admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(1));
    }

    @Test
    void updatesReportStatus() throws Exception {
        CourtReportResponse mockResp = new CourtReportResponse(
                1, 101, "Cancha 1", 10, "Sede Central",
                "player-uuid", "Jugador", "ILUMINACION", "Foco fundido",
                "RESUELTO", "ALTA", "Arreglado", "2026-11-07T21:10:00", "2026-11-07T21:00:00"
        );
        when(service.updateStatus(eq(1), any(UpdateCourtReportStatusRequest.class), any(AuthUserDto.class)))
                .thenReturn(mockResp);

        mvc.perform(patch("/api/court-reports/1/status")
                        .requestAttr("auth.user", player)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"estado\":\"RESUELTO\",\"resolucion\":\"Arreglado\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.estado").value("RESUELTO"))
                .andExpect(jsonPath("$.resolucion").value("Arreglado"));
    }
}

