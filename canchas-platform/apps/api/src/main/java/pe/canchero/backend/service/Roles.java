package pe.canchero.backend.service;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Set;

/** Única definición de los roles con permisos de gestión (sin distinguir mayúsculas ni tildes). */
public final class Roles {
    private static final Set<String> ADMIN = Set.of("admin", "administrador");
    private static final Set<String> OWNER = Set.of("dueno", "owner", "propietario");

    private Roles() {}

    public static boolean isAdmin(String rol) {
        return ADMIN.contains(normalize(rol));
    }

    public static boolean isOwner(String rol) {
        return OWNER.contains(normalize(rol));
    }

    public static boolean isOwnerOrAdmin(String rol) {
        return isAdmin(rol) || isOwner(rol);
    }

    private static String normalize(String rol) {
        return Normalizer.normalize(rol == null ? "" : rol, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).trim();
    }
}
