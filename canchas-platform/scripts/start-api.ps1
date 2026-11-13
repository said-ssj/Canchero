param([switch]$ValidateOnly)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root '.env.local'
if (-not (Test-Path -LiteralPath $envFile)) { throw 'Falta .env.local para conectar la API.' }

Get-Content -LiteralPath $envFile | ForEach-Object {
    if ($_ -match '^\s*(MERCADOPAGO_ENABLED|MERCADOPAGO_ACCESS_TOKEN|MERCADOPAGO_WEBHOOK_SECRET|MERCADOPAGO_COLLECTOR_ID|MERCADOPAGO_PASS_SECRET|MERCADOPAGO_WEBHOOK_URL|MERCADOPAGO_PUBLIC_URL|SERVER_PORT|SPRING_DATASOURCE_URL|SPRING_DATASOURCE_USERNAME|SPRING_DATASOURCE_PASSWORD|DB_POOL_MAX_SIZE|DB_POOL_MIN_IDLE|APP_AUTH_TOKEN_SECRET|SUPABASE_REALTIME_AUTH_ENABLED|SUPABASE_REALTIME_JWT_SECRET|SUPABASE_JWT_SECRET|GOOGLE_AUTH_ENABLED|SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|BREVO_API_KEY|MAIL_FROM_EMAIL|APP_PUBLIC_URL|BOOKING_EMAILS_ENABLED|SENTRY_ENABLED|SENTRY_FRONTEND_DSN|SENTRY_BACKEND_DSN|APP_ENVIRONMENT|APP_RELEASE|WEATHER_ENABLED|OPEN_METEO_API_KEY)\s*=(.*)$') {
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
if (-not $env:SPRING_DATASOURCE_USERNAME -or -not $env:SPRING_DATASOURCE_PASSWORD -or (-not $env:APP_AUTH_TOKEN_SECRET -and -not $env:SUPABASE_JWT_SECRET)) {
    throw 'Faltan credenciales PostgreSQL o secreto de autenticacion en la configuracion privada.'
}
if ($env:SPRING_PROFILES_ACTIVE -match '(^|,)dev(,|$)') {
    throw 'El perfil dev usa H2; no corresponde al arranque contra Supabase.'
}
$env:SPRING_JPA_HIBERNATE_DDL_AUTO = 'none'
if ($ValidateOnly) { Write-Output 'Configuracion API validada sin mostrar secretos ni conectar a la base.'; return }

$apiPort = if ($env:SERVER_PORT) { [int]$env:SERVER_PORT } else { 8090 }
$existingConns = Get-NetTCPConnection -LocalPort $apiPort -State Listen -ErrorAction SilentlyContinue
if ($existingConns) {
    $pids = $existingConns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $pids) {
        if ($procId -gt 0) {
            Write-Host "Liberando puerto $apiPort (deteniendo proceso anterior PID $procId)..."
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Milliseconds 800
}

Push-Location (Join-Path $root 'apps/api')
try {
    & .\mvnw.cmd spring-boot:run
    if ($LASTEXITCODE -ne 0) { throw 'El servidor API no pudo iniciarse.' }
} finally { Pop-Location }
