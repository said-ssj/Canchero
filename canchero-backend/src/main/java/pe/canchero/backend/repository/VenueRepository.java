package pe.canchero.backend.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import pe.canchero.backend.domain.entity.Venue;

import java.util.List;

public interface VenueRepository extends JpaRepository<Venue, String> {

    List<Venue> findByCiudadIgnoreCase(String ciudad);

    List<Venue> findByCiudadIgnoreCaseAndDistritoIgnoreCase(String ciudad, String distrito);
}