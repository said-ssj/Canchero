package pe.canchero.backend.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import pe.canchero.backend.domain.entity.Review;

import java.util.List;

public interface ReviewRepository extends JpaRepository<Review, String> {

    List<Review> findByVenueIdOrderByPuntuacionDesc(String venueId);

    boolean existsByBookingId(String bookingId);
}