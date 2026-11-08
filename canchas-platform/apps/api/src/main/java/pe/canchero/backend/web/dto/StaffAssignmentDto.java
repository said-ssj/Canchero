package pe.canchero.backend.web.dto;

import java.util.List;

/** Asignación de una persona a una sede con un rol operativo (admin, cajero, almacen, ayudante). */
public record StaffAssignmentDto(
        long id,
        int sedeId,
        String sedeNombre,
        String usuarioId,
        String nombre,
        String email,
        String rol,
        List<String> permisos
) {}
