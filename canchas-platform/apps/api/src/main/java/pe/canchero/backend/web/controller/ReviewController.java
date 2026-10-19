package pe.canchero.backend.web.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.service.SupabaseDataService;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.ErrorResponse;
import pe.canchero.backend.web.dto.ReviewRequest;
import pe.canchero.backend.web.dto.ReviewResponse;

import java.util.List;

@RestController
@RequestMapping("/api/reviews")
public class ReviewController {

    private final SupabaseDataService data;

    public ReviewController(SupabaseDataService data) {
        this.data = data;
    }

    @GetMapping("/sede/{sedeId}")
    public ResponseEntity<List<ReviewResponse>> bySede(@PathVariable int sedeId) {
        return ResponseEntity.ok(data.listReviewsBySede(sedeId));
    }

    @PostMapping
    public ResponseEntity<?> create(
            @RequestBody ReviewRequest request,
            HttpServletRequest httpRequest) {
        Object rawUser = httpRequest.getAttribute("auth.user");
        if (!(rawUser instanceof AuthUserDto authUser)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Debes iniciar sesión para publicar una reseña");
        }
        return data.createReview(request, authUser)
                .<ResponseEntity<?>>map(r -> ResponseEntity.status(HttpStatus.CREATED).body(r))
                .orElse(ResponseEntity.badRequest().body(new ErrorResponse("Error al crear reseña")));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatus(ResponseStatusException ex) {
        return ResponseEntity.status(ex.getStatusCode()).body(new ErrorResponse(ex.getReason()));
    }
}