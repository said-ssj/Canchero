package pe.canchero.backend.web.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.service.UserService;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.ErrorResponse;
import pe.canchero.backend.web.dto.UpdateUserRoleRequest;
import pe.canchero.backend.web.dto.UserDto;

import java.util.List;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping
    public ResponseEntity<List<UserDto>> listAllUsers(HttpServletRequest request) {
        AuthUserDto authUser = getAuthenticatedUser(request);
        return ResponseEntity.ok(userService.listAllUsers(authUser));
    }

    @PatchMapping("/{id}/role")
    public ResponseEntity<UserDto> updateUserRole(
            @PathVariable("id") String id,
            @Valid @RequestBody UpdateUserRoleRequest body,
            HttpServletRequest request) {
        AuthUserDto authUser = getAuthenticatedUser(request);
        return ResponseEntity.ok(userService.updateUserRole(id, body, authUser));
    }

    private AuthUserDto getAuthenticatedUser(HttpServletRequest request) {
        Object raw = request.getAttribute("auth.user");
        if (!(raw instanceof AuthUserDto authUser)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida o expirada");
        }
        return authUser;
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatus(ResponseStatusException ex) {
        return ResponseEntity.status(ex.getStatusCode()).body(new ErrorResponse(ex.getReason()));
    }
}
