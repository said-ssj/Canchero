package pe.canchero.backend.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import pe.canchero.backend.domain.entity.Booking;
import pe.canchero.backend.domain.entity.Court;
import pe.canchero.backend.domain.entity.Review;
import pe.canchero.backend.domain.entity.User;
import pe.canchero.backend.domain.entity.Venue;
import pe.canchero.backend.domain.enums.BookingStatus;
import pe.canchero.backend.domain.enums.UserRole;
import pe.canchero.backend.repository.BookingRepository;
import pe.canchero.backend.repository.CourtRepository;
import pe.canchero.backend.repository.ReviewRepository;
import pe.canchero.backend.repository.UserRepository;
import pe.canchero.backend.repository.VenueRepository;

import java.util.List;

@Configuration
public class SeedDataConfig {

    private static final Logger log = LoggerFactory.getLogger(SeedDataConfig.class);

    @Bean
    CommandLineRunner seedData(
            UserRepository users,
            VenueRepository venues,
            CourtRepository courts,
            BookingRepository bookings,
            ReviewRepository reviews) {
        return args -> {
            if (users.count() > 0) {
                return;
            }

            User jugador = new User();
            jugador.setId("u_player");
            jugador.setNombre("Carlos Jugador");
            jugador.setEmail("jugador@canchero.pe");
            jugador.setTelefono("987 654 321");
            jugador.setRol(UserRole.PLAYER);
            jugador.setPassword(passwordOf("123456"));
            users.save(jugador);

            User dueno = new User();
            dueno.setId("u_owner");
            dueno.setNombre("Roberto Mendoza");
            dueno.setEmail("dueno@canchero.pe");
            dueno.setTelefono("987 654 322");
            dueno.setRol(UserRole.OWNER);
            dueno.setPassword(passwordOf("123456"));
            users.save(dueno);

            Venue magdalena = venue(venues, dueno, "magdalena", "Cancha Magdalena",
                    "Av. Costanera 123, Magdalena del Mar, Lima", "magdalena", "lima",
                    50, placeholderFoto(), List.of("Fútbol 5", "Fútbol 7", "Sintético FIFA", "Estacionamiento"));
            court(courts, magdalena, "mag-c1", "Grass 5 A", "Grass 5", false, true, 50);
            court(courts, magdalena, "mag-c2", "Grass 5 B", "Grass 5", false, true, 48);
            court(courts, magdalena, "mag-c3", "Grass 7 Principal", "Grass 7", false, true, 60);
            court(courts, magdalena, "mag-c4", "Grass 7 Sur", "Grass 7", false, false, 65);

            Venue surco = venue(venues, dueno, "surco", "Cancha Surco",
                    "Av. Primavera 456, Surco, Lima", "surco", "lima",
                    55, placeholderFoto(), List.of("Fútbol 7", "Césped Natural", "Estacionamiento", "Cafetería"));
            court(courts, surco, "sur-c1", "Natural 7 Norte", "Grass 7", false, true, 65);
            court(courts, surco, "sur-c2", "Natural 7 Sur", "Grass 7", false, true, 70);

            Venue losOlivos = venue(venues, dueno, "los-olivos", "Cancha Los Olivos",
                    "Av. Carlos Izaguirre 789, Los Olivos, Lima", "los olivos", "lima",
                    50, placeholderFoto(), List.of("Fútbol 5", "100% Techado", "Vestuarios Pro", "Estacionamiento"));
            court(courts, losOlivos, "lo-c1", "Techada 5 A", "techada", true, true, 55);
            court(courts, losOlivos, "lo-c2", "Techada 5 B", "techada", true, true, 55);
            court(courts, losOlivos, "lo-c3", "Techada 5 C", "techada", true, false, 52);

            Venue ica = venue(venues, dueno, "ica-centro", "Grass Monumental Ica Centro",
                    "Calle Bolívar 340, Ica Centro, Ica", "ica centro", "ica",
                    40, placeholderFoto(), List.of("Fútbol 7", "Fútbol 11", "Sintético FIFA", "Estacionamiento"));
            court(courts, ica, "ica-c1", "Grass 7 A", "Grass 7", false, true, 45);
            court(courts, ica, "ica-c2", "Grass 7 B", "Grass 7", false, true, 42);
            court(courts, ica, "ica-c3", "Grass 5 A", "Grass 5", false, true, 38);

            Booking reserva = new Booking();
            reserva.setId("b_2");
            reserva.setCodigoPase("#CAN-8881");
            reserva.setCourtName("Grass 7 Principal");
            reserva.setVenueName("Cancha Magdalena");
            reserva.setVenueId("magdalena");
            reserva.setFecha("2026-09-25");
            reserva.setHorario("20:00 - 22:00");
            reserva.setMontoTotal(160);
            reserva.setMetodoPago("YAPE");
            reserva.setEstado(BookingStatus.COMPLETED);
            reserva.setJugadores(List.of("Carlos Jugador", "Luis Torres", "Mario Paredes"));
            reserva.setPlayer(jugador);
            reserva.setVenue(magdalena);
            bookings.save(reserva);

            Review review = new Review();
            review.setId("review_1");
            review.setPuntuacion(5);
            review.setComentario("Excelente estado del grass sintético, agua fría y vestuarios impecables.");
            review.setPlayer(jugador);
            review.setVenue(magdalena);
            review.setBooking(reserva);
            reviews.save(review);

            log.info("Canchero backend seed data cargado: {} usuarios, {} sedes, {} canchas, {} reservas, {} reseñas",
                    users.count(), venues.count(), courts.count(), bookings.count(), reviews.count());
        };
    }

    private static String passwordOf(String raw) {
        return PasswordUtil.hash(raw);
    }

    private static Venue venue(
            VenueRepository venues,
            User owner,
            String id,
            String nombre,
            String direccion,
            String distrito,
            String ciudad,
            double tarifaBase,
            String portadaUrl,
            List<String> amenidades) {
        Venue v = new Venue();
        v.setId(id);
        v.setNombre(nombre);
        v.setDireccion(direccion);
        v.setDistrito(distrito);
        v.setCiudad(ciudad);
        v.setDescripcion(nombre + " - Reserva de canchas en " + distrito);
        v.setTarifaBase(tarifaBase);
        v.setPortadaUrl(portadaUrl);
        v.setFotos(List.of(portadaUrl));
        v.setAmenidades(amenidades);
        v.setOwner(owner);
        return venues.save(v);
    }

    private static void court(
            CourtRepository courts,
            Venue venue,
            String id,
            String nombre,
            String tipo,
            boolean techada,
            boolean disponible,
            double precioHora) {
        Court c = new Court();
        c.setId(id);
        c.setNombre(nombre);
        c.setTipo(tipo);
        c.setTechada(techada);
        c.setDisponible(disponible);
        c.setPrecioHora(precioHora);
        c.setVenue(venue);
        courts.save(c);
    }

    private static String placeholderFoto() {
        return "https://images.unsplash.com/photo-1529900240051-06c326ae5842?q=80&w=800&auto=format&fit=crop";
    }
}