package pe.canchero.backend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.UpdateUserRoleRequest;
import pe.canchero.backend.web.dto.UserDto;

import javax.sql.DataSource;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class UserServiceTest {

    private JdbcTemplate jdbc;
    private UserService service;

    private final UUID superAdminId = UUID.randomUUID();
    private final UUID normalAdminId = UUID.randomUUID();
    private final UUID playerUserId = UUID.randomUUID();

    private final AuthUserDto superAdmin = new AuthUserDto(superAdminId.toString(), "Super Admin", "super@canchero.pe", "999111222", "superadmin");
    private final AuthUserDto normalAdmin = new AuthUserDto(normalAdminId.toString(), "Admin Normal", "admin@canchero.pe", "999333444", "admin");
    private final AuthUserDto player = new AuthUserDto(playerUserId.toString(), "Jugador", "player@canchero.pe", "999555666", "cliente");

    @BeforeEach
    void setUp() {
        DataSource ds = new EmbeddedDatabaseBuilder()
                .setType(EmbeddedDatabaseType.H2)
                .setName("test_user_service_" + System.nanoTime())
                .build();
        jdbc = new JdbcTemplate(ds);

        jdbc.execute("create table rol (id_rol int primary key, nombre varchar(50), descripcion varchar(150), estado char(1))");
        jdbc.execute("""
                create table usuario (
                    id_usuario uuid primary key,
                    id_rol int not null,
                    nombre varchar(100),
                    correo varchar(150),
                    telefono varchar(20),
                    password_hash varchar(100),
                    estado char(1) default 'A',
                    usucre varchar(50),
                    pccre varchar(50),
                    usmod varchar(50),
                    pcmod varchar(50),
                    fecmod timestamp
                )
                """);

        jdbc.update("insert into rol values (1, 'cliente', 'Jugador', 'A'), (2, 'dueno', 'Dueño', 'A'), (3, 'admin', 'Admin', 'A'), (4, 'superadmin', 'Superadmin', 'A')");

        jdbc.update("insert into usuario (id_usuario, id_rol, nombre, correo, telefono, password_hash) values (?, 4, 'Super User', 'super@canchero.pe', '999111222', 'hash')", superAdminId);
        jdbc.update("insert into usuario (id_usuario, id_rol, nombre, correo, telefono, password_hash) values (?, 3, 'Admin User', 'admin@canchero.pe', '999333444', 'hash')", normalAdminId);
        jdbc.update("insert into usuario (id_usuario, id_rol, nombre, correo, telefono, password_hash) values (?, 1, 'Player User', 'player@canchero.pe', '999555666', 'hash')", playerUserId);

        service = new UserService(jdbc);
    }

    @Test
    void superAdminCanListAllUsers() {
        List<UserDto> users = service.listAllUsers(superAdmin);
        assertEquals(3, users.size());
    }

    @Test
    void nonSuperAdminCannotListAllUsers() {
        assertThrows(ResponseStatusException.class, () -> service.listAllUsers(normalAdmin));
        assertThrows(ResponseStatusException.class, () -> service.listAllUsers(player));
        assertThrows(ResponseStatusException.class, () -> service.listAllUsers(null));
    }

    @Test
    void superAdminCanPromotePlayerToAdmin() {
        UserDto updated = service.updateUserRole(playerUserId.toString(), new UpdateUserRoleRequest("admin"), superAdmin);
        assertEquals("admin", updated.rol());

        String rolDb = jdbc.queryForObject(
                "select r.nombre from usuario u join rol r on r.id_rol = u.id_rol where u.id_usuario = ?",
                String.class, playerUserId);
        assertEquals("admin", rolDb);
    }

    @Test
    void superAdminCanDemoteAdminToPlayer() {
        UserDto updated = service.updateUserRole(normalAdminId.toString(), new UpdateUserRoleRequest("cliente"), superAdmin);
        assertEquals("cliente", updated.rol());
    }

    @Test
    void superAdminCannotModifyOwnRole() {
        assertThrows(ResponseStatusException.class, () ->
                service.updateUserRole(superAdminId.toString(), new UpdateUserRoleRequest("admin"), superAdmin));
    }

    @Test
    void rejectsInvalidRoleAssignment() {
        assertThrows(ResponseStatusException.class, () ->
                service.updateUserRole(playerUserId.toString(), new UpdateUserRoleRequest("super_hacker"), superAdmin));
    }
}
