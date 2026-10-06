package pe.canchero.backend.web.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pe.canchero.backend.domain.entity.Booking;
import pe.canchero.backend.domain.entity.Court;
import pe.canchero.backend.domain.enums.BookingStatus;
import pe.canchero.backend.repository.BookingRepository;
import pe.canchero.backend.repository.CourtRepository;
import pe.canchero.backend.repository.UserRepository;
import pe.canchero.backend.web.dto.BookingRequest;
import pe.canchero.backend.web.dto.BookingResponse;
import pe.canchero.backend.web.dto.ErrorResponse;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.ThreadLocalRandom;

@RestController
@RequestMapping("/api/bookings")
public class BookingController {

    private final BookingRepository bookings;
    private final CourtRepository courts;
    private final UserRepository users;

    public BookingController(BookingRepository bookings, CourtRepository courts, UserRepository users) {
        this.bookings = bookings;
        this.courts = courts;
        this.users = users;
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody BookingRequest request) {
        Booking booking = new Booking();
        booking.setId("b_" + System.currentTimeMillis());
        booking.setCodigoPase("#CAN-" + ThreadLocalRandom.current().nextInt(1000, 9999));
        booking.setFecha(request.fecha());
        booking.setHorario(request.horario());
        booking.setMontoTotal(request.total());
        booking.setMetodoPago(request.metodoPago() == null || request.metodoPago().isBlank() ? "YAPE" : request.metodoPago());
        booking.setEstado(BookingStatus.CONFIRMED);
        booking.setJugadores(request.jugadores() == null ? List.of() : request.jugadores());

        Court court = resolveCourt(request);
        if (court != null) {
            booking.setCourt(court);
            booking.setVenue(court.getVenue());
            booking.setCourtName(request.courtName() == null || request.courtName().isBlank()
                    ? court.getNombre() : request.courtName());
            booking.setVenueName(court.getVenue().getNombre());
            booking.setVenueId(court.getVenue().getId());
        } else {
            booking.setCourtName(request.courtName());
            booking.setVenueName(request.venueName());
            booking.setVenueId(request.venueId());
        }

        if (request.playerId() != null && !request.playerId().isBlank()) {
            users.findById(request.playerId()).ifPresent(booking::setPlayer);
        }
        Booking saved = bookings.save(booking);
        return ResponseEntity.status(HttpStatus.CREATED).body(BookingResponse.from(saved));
    }

    private Court resolveCourt(BookingRequest request) {
        if (request.courtId() != null && !request.courtId().isBlank()) {
            return courts.findById(request.courtId()).orElse(null);
        }
        if (request.venueId() == null || request.venueId().isBlank()) {
            return null;
        }
        List<Court> byVenue = courts.findByVenueId(request.venueId());
        if (byVenue.isEmpty()) {
            return null;
        }
        if (request.courtName() != null && !request.courtName().isBlank()) {
            String name = request.courtName().toLowerCase();
            return byVenue.stream()
                    .filter(c -> c.getNombre() != null && name.contains(c.getNombre().toLowerCase()))
                    .findFirst()
                    .orElse(byVenue.get(0));
        }
        return byVenue.get(0);
    }

    @GetMapping("/pase/{codigo}")
    public ResponseEntity<?> byPase(@PathVariable String codigo) {
        Optional<Booking> found = bookings.findByCodigoPase(codigo);
        if (found.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Pase no encontrado"));
        }
        return ResponseEntity.ok(BookingResponse.from(found.get()));
    }

    @GetMapping("/jugador/{playerId}")
    public ResponseEntity<List<BookingResponse>> byPlayer(@PathVariable String playerId) {
        List<Booking> result = bookings.findByPlayerIdOrderByFechaDesc(playerId);
        return ResponseEntity.ok(result.stream().map(BookingResponse::from).toList());
    }

    @GetMapping
    public ResponseEntity<List<BookingResponse>> list(@RequestParam(required = false) String venueId) {
        List<Booking> result = venueId != null && !venueId.isBlank()
                ? bookings.findByVenueIdOrderByFechaDesc(venueId)
                : bookings.findAll();
        return ResponseEntity.ok(result.stream().map(BookingResponse::from).toList());
    }
}