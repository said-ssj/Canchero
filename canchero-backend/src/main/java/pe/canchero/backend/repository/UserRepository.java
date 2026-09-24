package pe.canchero.backend.repository;

import org.springframework.data.repository.CrudRepository;
import pe.canchero.backend.domain.entity.User;

import java.util.Optional;

public interface UserRepository extends CrudRepository<User, String> {

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);
}