create table if not exists public.login_intento_ip (
    huella char(64) primary key,
    fallos integer not null check (fallos >= 0),
    inicio_ventana timestamptz not null
);

alter table public.login_intento_ip enable row level security;
revoke all on public.login_intento_ip from anon, authenticated;

comment on table public.login_intento_ip is
    'Contadores compartidos entre instancias de API para intentos de login; huella SHA-256 de IP y correo normalizados.';
