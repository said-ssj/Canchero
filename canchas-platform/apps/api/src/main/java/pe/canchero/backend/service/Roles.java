package pe.canchero.backend.service;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Set;

/** Única definición de los roles con permisos de gestión (sin distinguir mayúsculas ni tildes). */
public final class Roles {
    private static final Set<String> SUPERADMIN = Set.of("superadmin", "super_admin", "super-admin");
    private static final Set<String> ADMIN = Set.of("admin", "administrador");
    private static final Set<String> OWNER = Set.of("dueno", "owner", "propietario");

    private Roles() {}

    public static boolean isSuperAdmin(String rol) {
        return SUPERADMIN.contains(normalize(rol));
    }

    public static boolean isAdmin(String rol) {
        String normalized = normalize(rol);
        return ADMIN.contains(normalized) || SUPERADMIN.contains(normalized);
    }

    public static boolean isOwner(String rol) {
        return OWNER.contains(normalize(rol));
    }

    public static boolean isOwnerOrAdmin(String rol) {
        return isAdmin(rol) || isOwner(rol);
    }

    public static String normalize(String rol) {
        return Normalizer.normalize(rol == null ? "" : rol, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).trim();
    }
}
