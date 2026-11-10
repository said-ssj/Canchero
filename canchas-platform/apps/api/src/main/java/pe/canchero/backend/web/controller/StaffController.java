package pe.canchero.backend.web.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pe.canchero.backend.service.StaffService;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.StaffAssignmentDto;
import pe.canchero.backend.web.dto.StaffAssignmentRequest;

import java.util.List;

@RestController
@RequestMapping("/api/staff")
public class StaffController {
    private final StaffService staff;

    public StaffController(StaffService staff) {
        this.staff = staff;
    }

    @GetMapping("/me")
    public List<StaffAssignmentDto> mine(@RequestAttribute("auth.user") AuthUserDto user) {
        return staff.mine(user);
    }

    @GetMapping
    public List<StaffAssignmentDto> list(@RequestParam Integer sedeId, @RequestAttribute("auth.user") AuthUserDto user) {
        return staff.listForVenue(sedeId, user);
    }

    @PostMapping
    public ResponseEntity<StaffAssignmentDto> assign(@RequestBody StaffAssignmentRequest request,
            @RequestAttribute("auth.user") AuthUserDto user) {
        return ResponseEntity.status(HttpStatus.CREATED).body(staff.assign(request, user));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> remove(@PathVariable long id, @RequestAttribute("auth.user") AuthUserDto user) {
        staff.remove(id, user);
        return ResponseEntity.noContent().build();
    }
}
