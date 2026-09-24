package pe.canchero.backend.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import pe.canchero.backend.domain.entity.Booking;

import java.util.List;
import java.util.Optional;

public interface BookingRepository extends JpaRepository<Booking, String> {

    Optional<Booking> findByCodigoPase(String codigoPase);

    List<Booking> findByPlayerIdOrderByFechaDesc(String playerId);

    List<Booking> findByVenueIdOrderByFechaDesc(String venueId);
}