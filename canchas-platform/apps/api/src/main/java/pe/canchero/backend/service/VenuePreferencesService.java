package pe.canchero.backend.service;

import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;

@Service
public class VenuePreferencesService {
    public record Preferences(Integer minimumDepositPercent, String walletHolder, String walletPhone) {}
    private final JdbcTemplate jdbc;
    public VenuePreferencesService(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public Preferences get(int id, AuthUserDto user) {
        new TenantPermissions(jdbc).require(user,id,"sede.ver");
        return jdbc.queryForObject("select porcentaje_adelanto_minimo,billetera_titular,billetera_celular from sede where id_sede=?",(r,n)->new Preferences(r.getInt(1),r.getString(2),r.getString(3)),id);
    }
    @Transactional
    public Preferences save(int id, Preferences value, AuthUserDto user) {
        new TenantPermissions(jdbc).require(user,id,"sede.editar");
        if(value==null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Datos requeridos");
        if(value.minimumDepositPercent()!=null && (value.minimumDepositPercent()<10 || value.minimumDepositPercent()>90))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"El adelanto debe estar entre 10 y 90 por ciento");
        String holder=value.walletHolder()==null?null:value.walletHolder().trim();
        String phone=value.walletPhone()==null?null:value.walletPhone().replaceAll("[\\s()-]","");
        if(holder!=null && holder.length()>150)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"El titular admite hasta 150 caracteres");
        if(phone!=null && !phone.isEmpty() && !phone.matches("(?:\\+?51)?9[0-9]{8}"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Ingresa un celular peruano de 9 digitos");
        jdbc.update("update sede set porcentaje_adelanto_minimo=coalesce(?,porcentaje_adelanto_minimo),billetera_titular=coalesce(?,billetera_titular),billetera_celular=coalesce(?,billetera_celular),usmod=?,pcmod='API',fecmod=now() where id_sede=?",value.minimumDepositPercent(),holder,phone,user.id(),id);
        return get(id,user);
    }
}
