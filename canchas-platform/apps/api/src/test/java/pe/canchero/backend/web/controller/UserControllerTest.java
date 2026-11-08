package pe.canchero.backend.web.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import pe.canchero.backend.service.UserService;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.UpdateUserRoleRequest;
import pe.canchero.backend.web.dto.UserDto;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class UserControllerTest {

    private UserService userService;
    private MockMvc mvc;

    private final UUID superAdminId = UUID.randomUUID();
    private final AuthUserDto superAdmin = new AuthUserDto(superAdminId.toString(), "Super Admin", "super@canchero.pe", "999111222", "superadmin");

    @BeforeEach
    void setUp() {
        userService = mock(UserService.class);
        mvc = MockMvcBuilders.standaloneSetup(new UserController(userService)).build();
    }

    @Test
    void listAllUsersReturnsUserList() throws Exception {
        UserDto u1 = new UserDto(UUID.randomUUID().toString(), "Admin", "admin@canchero.pe", "999111222", "admin", "A");
        when(userService.listAllUsers(any(AuthUserDto.class))).thenReturn(List.of(u1));

        mvc.perform(get("/api/users")
                        .requestAttr("auth.user", superAdmin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].nombre").value("Admin"))
                .andExpect(jsonPath("$[0].rol").value("admin"));
    }

    @Test
    void updateUserRoleReturnsUpdatedUser() throws Exception {
        String targetId = UUID.randomUUID().toString();
        UserDto updated = new UserDto(targetId, "User Promoted", "user@canchero.pe", "999222333", "admin", "A");
        when(userService.updateUserRole(eq(targetId), any(UpdateUserRoleRequest.class), any(AuthUserDto.class)))
                .thenReturn(updated);

        mvc.perform(patch("/api/users/" + targetId + "/role")
                        .requestAttr("auth.user", superAdmin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rol\":\"admin\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(targetId))
                .andExpect(jsonPath("$.rol").value("admin"));
    }
}
