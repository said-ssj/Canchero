package pe.canchero.backend.web.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import pe.canchero.backend.web.dto.ErrorResponse;

/** Un id que no es número (p. ej. /api/bookings/abc) es un error del cliente (400), no del servidor (500). */
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(NumberFormatException.class)
    public ResponseEntity<ErrorResponse> invalidNumber() {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ErrorResponse("Identificador o número inválido"));
    }
}
