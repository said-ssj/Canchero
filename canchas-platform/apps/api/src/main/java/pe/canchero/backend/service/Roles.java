package pe.canchero.backend.service;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Set;

/**
 * Roles globales (sin distinguir mayúsculas ni tildes).
 * superadmin: control total de la plataforma. dueno: sus sedes.
 * admin, cajero, almacen, ayudante: solo las sedes que el dueño les asigne (asignacion_sede),
 * con los permisos de rol_sede_permiso; ver {@link VenueAccessService}.
 */
public final class Roles {
    private static final Set<String> SUPERADMIN = Set.of("superadmin", "super_admin", "super-admin");
    private static final Set<String> OWNER = Set.of("dueno", "owner", "propietario");
    /** Coinciden con rol_sede.codigo; "administrador" se acepta como alias de admin. */
    private static final Set<String> VENUE_STAFF = Set.of("admin", "administrador", "cajero", "almacen", "ayudante");

    private Roles() {}

    public static boolean isSuperAdmin(String rol) {
        return SUPERADMIN.contains(normalize(rol));
    }

    public static boolean isOwner(String rol) {
        return OWNER.contains(normalize(rol));
    }

    public static boolean isVenueStaff(String rol) {
        return VENUE_STAFF.contains(normalize(rol));
    }

    /** Puede entrar al panel de gestión; qué sedes y acciones se decide sede por sede. */
    public static boolean canEnterPanel(String rol) {
        return isSuperAdmin(rol) || isOwner(rol) || isVenueStaff(rol);
    }

    public static String normalize(String rol) {
        return Normalizer.normalize(rol == null ? "" : rol, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).trim();
    }
}
