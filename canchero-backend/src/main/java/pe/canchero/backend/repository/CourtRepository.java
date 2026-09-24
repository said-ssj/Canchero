package pe.canchero.backend.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import pe.canchero.backend.domain.entity.Court;

import java.util.List;

public interface CourtRepository extends JpaRepository<Court, String> {

    List<Court> findByVenueId(String venueId);
}