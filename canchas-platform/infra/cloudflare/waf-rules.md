# Cloudflare WAF Rules for Canchero
# Configuración de seguridad en Cloudflare

## Rate Limiting Rules

### API Rate Limit
- **Match**: `api.canchero.pe/*`
- **Method**: POST, PUT, PATCH, DELETE
- **Threshold**: 100 requests per minute per IP
- **Action**: Block (429) for 15 minutes
- **Description**: Protección contra abuso de API

### Auth Rate Limit
- **Match**: `api.canchero.pe/auth/*`
- **Method**: POST
- **Threshold**: 10 requests per minute per IP
- **Action**: Block (429) for 30 minutes
- **Description**: Prevenir brute force login/registro

### Payment Rate Limit
- **Match**: `api.canchero.pe/pagos/*`, `api.canchero.pe/webhooks/culqi`
- **Method**: POST
- **Threshold**: 30 requests per minute per IP
- **Action**: Block (429) for 10 minutes
- **Description**: Protección endpoints de pago

### Webhook Rate Limit
- **Match**: `api.canchero.pe/webhooks/*`
- **Method**: POST
- **Threshold**: 200 requests per minute per IP
- **Action**: Log only (allow)
- **Description**: Webhooks de Culqi/SUNAT pueden venir en ráfagas

## WAF Managed Rules
- Enable: OWASP Top 10
- Enable: Cloudflare Managed Ruleset
- Enable: WordPress Rules (si aplica)
- Sensitivity: High

## Custom WAF Rules

### Block SQL Injection in Query Params
```
(http.request.uri.query contains "union select" or 
 http.request.uri.query contains "drop table" or
 http.request.uri.query contains "insert into" or
 http.request.uri.query contains "delete from")
and not cf.client.bot
-> Block
```

### Block Suspicious User Agents
```
(http.user_agent contains "sqlmap" or
 http.user_agent contains "nikto" or
 http.user_agent contains "nessus" or
 http.user_agent contains "openvas")
-> Block
```

### Geo-blocking (opcional)
```
(not ip.geoip.country in {"PE" "US" "ES" "MX" "CO" "CL" "AR"})
and (http.request.uri.path contains "/admin" or http.request.uri.path contains "/api")
-> Challenge (Managed Challenge)
```

## Bot Fight Mode
- Enable: Bot Fight Mode
- Enable: Super Bot Fight Mode (si plan Pro+)

## Cache Rules

### Static Assets (1 año)
- **Match**: `*.js, *.css, *.woff2, *.png, *.jpg, *.svg, *.ico`
- **TTL**: 31536000 (1 año)
- **Cache Everything**: true

### API Responses (no cache)
- **Match**: `api.canchero.pe/*`
- **TTL**: 0
- **Cache Everything**: false
- **Respect Headers**: true

### HTML Pages (corto)
- **Match**: `canchero.pe/*` (HTML)
- **TTL**: 300 (5 min)
- **Cache Everything**: false

## Page Rules (Legacy - migrar a Cache Rules)

1. `canchero.pe/assets/*` -> Cache Level: Everything, Edge TTL: 1 year
2. `api.canchero.pe/*` -> Cache Level: Bypass, Disable Performance
3. `canchero.pe/admin*` -> Cache Level: Bypass, Always Online: Off

## SSL/TLS
- Mode: Full (Strict)
- Minimum TLS Version: 1.2
- Automatic HTTPS Rewrites: On
- HTTP/2: On
- HTTP/3 (QUIC): On
- 0-RTT: Off

## Security Headers (via Workers o Transform Rules)
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://api.canchero.pe wss://*.supabase.co https://fcm.googleapis.com; frame-src https://js.stripe.com; object-src 'none'; base-uri 'self'; form-action 'self';
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(self)
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

## DNS Records
```
Type    Name    Content                          Proxy
A       @       76.76.21.21 (Vercel)            Proxied
CNAME   www     cname.vercel-dns.com            Proxied
CNAME   api     canchero-api.supabase.co        Proxied
TXT     @       v=spf1 include:_spf.google.com ~all
TXT     _dmarc  v=DMARC1; p=quarantine; rua=mailto:dmarc@canchero.pe
CNAME   _domainkey  dkim._domainkey.sendgrid.net  Proxied
CAA     @       0 issue "letsencrypt.org"
CAA     @       0 issue "pki.goog"
```

## Workers (Edge Functions)
- Deploy security headers worker
- Deploy rate limiting at edge
- Deploy geo-routing if needed