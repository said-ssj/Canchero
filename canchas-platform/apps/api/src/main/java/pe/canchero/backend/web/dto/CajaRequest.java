package pe.canchero.backend.web.dto;

import java.math.BigDecimal;

public record CajaRequest(
        String nombre,
        String descripcion,
        BigDecimal saldoInicial,
        Integer sedeId) {

    public CajaRequest(String nombre, String descripcion, BigDecimal saldoInicial) {
        this(nombre, descripcion, saldoInicial, null);
    }
}