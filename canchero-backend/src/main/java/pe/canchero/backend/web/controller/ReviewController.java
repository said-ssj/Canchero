package pe.canchero.backend.web.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.canchero.backend.domain.entity.Booking;
import pe.canchero.backend.domain.entity.Review;
import pe.canchero.backend.domain.entity.User;
import pe.canchero.backend.domain.entity.Venue;
import pe.canchero.backend.domain.enums.BookingStatus;
import pe.canchero.backend.repository.BookingRepository;
import pe.canchero.backend.repository.ReviewRepository;
import pe.canchero.backend.repository.UserRepository;
import pe.canchero.backend.repository.VenueRepository;
import pe.canchero.backend.web.dto.ErrorResponse;
import pe.canchero.backend.web.dto.ReviewRequest;
import pe.canchero.backend.web.dto.ReviewResponse;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/reviews")
public class ReviewController {

    private final ReviewRepository reviews;
    private final VenueRepository venues;
    private final UserRepository users;
    private final BookingRepository bookings;

    public ReviewController(
            ReviewRepository reviews,
            VenueRepository venues,
            UserRepository users,
            BookingRepository bookings) {
        this.reviews = reviews;
        this.venues = venues;
        this.users = users;
        this.bookings = bookings;
    }

    @GetMapping("/sede/{venueId}")
    public ResponseEntity<List<ReviewResponse>> byVenue(@PathVariable String venueId) {
        List<Review> result = reviews.findByVenueIdOrderByPuntuacionDesc(venueId);
        return ResponseEntity.ok(result.stream().map(ReviewResponse::from).toList());
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody ReviewRequest request) {
        Optional<Venue> venue = venues.findById(request.venueId() == null ? "" : request.venueId());
        if (venue.isEmpty()) {
            return ResponseEntity.badRequest().body(new ErrorResponse("Sede no existe"));
        }
        Optional<Booking> booking = bookings.findById(request.bookingId());
        if (booking.isEmpty() || booking.get().getEstado() != BookingStatus.COMPLETED) {
            return ResponseEntity.badRequest().body(new ErrorResponse("Solo reservas finalizadas pueden calificarse"));
        }
        if (reviews.existsByBookingId(request.bookingId())) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse("Ya calificaste esta reserva"));
        }
        if (request.puntuacion() < 1 || request.puntuacion() > 5) {
            return ResponseEntity.badRequest().body(new ErrorResponse("Puntuación válida de 1 a 5"));
        }
        Optional<User> player = users.findById(request.playerId());
        if (player.isEmpty()) {
            return ResponseEntity.badRequest().body(new ErrorResponse("Jugador no existe"));
        }
        Review review = new Review();
        review.setId("review_" + System.currentTimeMillis());
        review.setPuntuacion(request.puntuacion());
        review.setComentario(request.comentario());
        review.setPlayer(player.get());
        review.setVenue(venue.get());
        review.setBooking(booking.get());
        Review saved = reviews.save(review);
        return ResponseEntity.status(HttpStatus.CREATED).body(ReviewResponse.from(saved));
    }
}