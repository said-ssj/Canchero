param([switch]$ValidateOnly)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root '.env.local'
if (-not (Test-Path -LiteralPath $envFile)) { throw 'Falta .env.local para conectar la API.' }

Get-Content -LiteralPath $envFile | ForEach-Object {
    if ($_ -match '^\s*(SPRING_DATASOURCE_URL|SPRING_DATASOURCE_USERNAME|SPRING_DATASOURCE_PASSWORD|SUPABASE_JWT_SECRET)\s*=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2].Trim().Trim('"').Trim("'"), 'Process')
    }
}

$url = $env:SPRING_DATASOURCE_URL
if ($url -match '^postgres(?:ql)?://') {
    # JDBC recibe la URL sin credenciales; usuario y clave viajan por separado.
    try { $uri = [Uri]($url -replace '^postgres://', 'postgresql://') }
    catch { throw 'La direccion PostgreSQL configurada no tiene un formato valido.' }
    if ($uri.UserInfo) {
        $credentials = $uri.UserInfo -split ':', 2
        $env:SPRING_DATASOURCE_USERNAME = [Uri]::UnescapeDataString($credentials[0])
        if ($credentials.Length -eq 2) {
            $env:SPRING_DATASOURCE_PASSWORD = [Uri]::UnescapeDataString($credentials[1])
        }
    }
    $port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
    $env:SPRING_DATASOURCE_URL = 'jdbc:postgresql://{0}:{1}{2}{3}' -f $uri.DnsSafeHost, $port, $uri.AbsolutePath, $uri.Query
}
if ($env:SPRING_DATASOURCE_URL -notmatch '^jdbc:postgresql://' -or $env:SPRING_DATASOURCE_URL -match '@') {
    throw 'Configura una URL PostgreSQL/JDBC valida; sin credenciales incrustadas en JDBC.'
}
if (-not $env:SPRING_DATASOURCE_USERNAME -or -not $env:SPRING_DATASOURCE_PASSWORD -or -not $env:SUPABASE_JWT_SECRET) {
    throw 'Faltan credenciales PostgreSQL o secreto de autenticacion en la configuracion privada.'
}
if ($env:SPRING_PROFILES_ACTIVE -match '(^|,)dev(,|$)') {
    throw 'El perfil dev usa H2; no corresponde al arranque contra Supabase.'
}
$env:SPRING_JPA_HIBERNATE_DDL_AUTO = 'none'
if ($ValidateOnly) { Write-Output 'Configuracion API validada sin mostrar secretos ni conectar a la base.'; return }

Push-Location (Join-Path $root 'apps/api')
try {
    & .\mvnw.cmd spring-boot:run
    if ($LASTEXITCODE -ne 0) { throw 'El servidor API no pudo iniciarse.' }
} finally { Pop-Location }
