package pe.canchero.backend.web.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.service.SupabaseDataService;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.BookingRequest;
import pe.canchero.backend.web.dto.BookingResponse;
import pe.canchero.backend.web.dto.ErrorResponse;

import java.util.List;

@RestController
@RequestMapping("/api/bookings")
public class BookingController {

    private final SupabaseDataService data;

    public BookingController(SupabaseDataService data) {
        this.data = data;
    }

    @PostMapping
    public ResponseEntity<BookingResponse> create(
            @RequestBody BookingRequest request,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            HttpServletRequest httpRequest) {
        Object rawUser = httpRequest.getAttribute("auth.user");
        if (!(rawUser instanceof AuthUserDto authUser)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Debes iniciar sesión para registrar una reserva.");
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(data.createBooking(request, authUser, idempotencyKey));
    }

    @GetMapping("/my")
    public ResponseEntity<List<BookingResponse>> myBookings(HttpServletRequest httpRequest) {
        Object rawUser = httpRequest.getAttribute("auth.user");
        if (!(rawUser instanceof AuthUserDto authUser)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Debes iniciar sesión para consultar tu itinerario.");
        }
        return ResponseEntity.ok(data.listMyBookings(authUser));
    }

    @GetMapping("/pase/{codigo}")
    public ResponseEntity<?> byPase(@PathVariable String codigo) {
        return data.getBookingByPass(codigo)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Pase no encontrado")));
    }

    @GetMapping("/jugador/{playerId}")
    public ResponseEntity<List<BookingResponse>> byPlayer(
            @PathVariable String playerId,
            HttpServletRequest httpRequest) {
        Object rawUser = httpRequest.getAttribute("auth.user");
        if (!(rawUser instanceof AuthUserDto authUser)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Debes iniciar sesión para consultar reservas.");
        }
        return ResponseEntity.ok(data.listBookingsByPlayer(playerId, authUser));
    }

    @GetMapping
    public ResponseEntity<List<BookingResponse>> list(
            @RequestParam(required = false) String venueId,
            HttpServletRequest httpRequest) {
        Object rawUser = httpRequest.getAttribute("auth.user");
        if (!(rawUser instanceof AuthUserDto authUser)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Debes iniciar sesión para consultar reservas.");
        }
        return ResponseEntity.ok(data.listBookings(venueId, authUser));
    }

    @PatchMapping("/{id}/confirm")
    public ResponseEntity<?> confirm(
            @PathVariable int id,
            HttpServletRequest httpRequest) {
        Object rawUser = httpRequest.getAttribute("auth.user");
        if (!(rawUser instanceof AuthUserDto authUser)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Debes iniciar sesión para confirmar una reserva.");
        }
        return data.confirmBooking(id, authUser)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Reserva no encontrada")));
    }

    @PatchMapping("/{id}/cancel")
    public ResponseEntity<?> cancel(
            @PathVariable int id,
            HttpServletRequest httpRequest) {
        Object rawUser = httpRequest.getAttribute("auth.user");
        if (!(rawUser instanceof AuthUserDto authUser)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Debes iniciar sesión para cancelar una reserva.");
        }
        return data.cancelBooking(id, authUser)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Reserva no encontrada")));
    }

    @PatchMapping("/{id}/complete")
    public ResponseEntity<?> complete(
            @PathVariable int id,
            HttpServletRequest httpRequest) {
        Object rawUser = httpRequest.getAttribute("auth.user");
        if (!(rawUser instanceof AuthUserDto authUser)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Debes iniciar sesión para completar una reserva.");
        }
        return data.completeBooking(id, authUser)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Reserva no encontrada")));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatus(ResponseStatusException ex) {
        return ResponseEntity.status(ex.getStatusCode())
                .body(new ErrorResponse(ex.getReason()));
    }
}

