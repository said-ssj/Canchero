# Monitoring & Alerting Configuration
# Sentry, Grafana Cloud, PagerDuty

## Sentry Configuration

### Projects
- `canchero-frontend` (Angular)
- `canchero-api` (Supabase Edge Functions)
- `canchero-legacy-api` (Spring Boot - temporal)

### DSN Setup
```
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_AUTH_TOKEN=xxx
SENTRY_ORG=canchero
SENTRY_PROJECT_FRONTEND=canchero-frontend
SENTRY_PROJECT_API=canchero-api
```

### Source Maps Upload (CI/CD)
```yaml
- name: Upload source maps to Sentry
  run: |
    npx @sentry/cli@latest releases new ${{ github.sha }}
    npx @sentry/cli@latest releases files ${{ github.sha }} upload-sourcemaps ./dist --strip-prefix dist/
    npx @sentry/cli@latest releases finalize ${{ github.sha }}
```

### Alert Rules
- **Error Rate > 1%**: Alert on 5-min window, notify #alerts Slack + PagerDuty
- **Crash-free Sessions < 99%**: Daily alert
- **New Error**: Immediate notification for unhandled errors
- **Performance**: p95 > 2s for any transaction

## Grafana Cloud Configuration

### Data Sources
- **Prometheus**: Supabase metrics (CPU, RAM, connections, queries)
- **Loki**: Logs from Supabase, Edge Functions, Application
- **Tempo**: Traces from application

### Dashboards
1. **Supabase Overview**: CPU, RAM, Disk, Connections, Query latency
2. **Business Metrics**: Reservas/día, Ingresos, Usuarios activos, Conversión
3. **Edge Functions**: Invocations, Duration, Errors, Cold starts
4. **Frontend**: Core Web Vitals, Bundle size, JS Errors
5. **Payments**: Success rate, Culqi latency, Webhook processing

### Key Metrics to Track
```
# Infra
supabase_cpu_usage_percent
supabase_memory_usage_percent
supabase_disk_usage_percent
supabase_active_connections
supabase_query_duration_seconds_bucket

# Business
canchero_reservas_total{dia="hoy"}
canchero_ingresos_brutos_soles{dia="hoy"}
canchero_usuarios_activos_24h
canchero_conversion_visitante_a_reserva

# Edge Functions
supabase_edge_function_invocations_total{function="pagos-culqi"}
supabase_edge_function_duration_seconds{function="pagos-culqi"}
supabase_edge_function_errors_total{function="pagos-culqi"}

# Frontend
web_vitals_lcp
web_vitals_cls
web_vitals_inp
web_vitals_fcp
web_vitals_ttfb
```

### Alert Rules (Grafana)
- **CPU > 80% 5m**: Warning
- **CPU > 90% 2m**: Critical (PagerDuty)
- **Memory > 85%**: Warning
- **DB Connections > 80% max**: Warning
- **Query p95 > 500ms**: Warning
- **Edge Function Errors > 5%**: Critical
- **Reservas/día drop > 50% vs 7d avg**: Warning
- **Payment Success Rate < 95%**: Critical

## PagerDuty Configuration

### Services
1. `canchero-platform` (Critical)
2. `canchero-payments` (Critical - Culqi/SUNAT)
3. `canchero-frontend` (Warning)

### Escalation Policies
- **Critical**: Page on-call immediately -> Escalate to team lead in 5m -> Escalate to manager in 15m
- **Warning**: Notify on-call in 15m -> Escalate in 30m

### Notification Rules
- Business hours (9am-6pm PET): Slack + Email
- After hours: PagerDuty push + SMS + Phone call

## Log Aggregation (Loki)

### Labels
- `app`: canchero-frontend, canchero-api, supabase
- `environment`: production, staging, development
- `function`: pagos-culqi, facturacion-sunat, notificaciones, reservas
- `level`: error, warn, info, debug

### Retention
- Production: 90 days
- Staging: 30 days
- Development: 7 days

## Uptime Monitoring

### BetterUptime / Pingdom
- **Primary**: `https://canchero.pe` (30s interval)
- **API**: `https://api.canchero.pe/health` (60s interval)
- **Supabase**: `https://xxx.supabase.co/rest/v1/` (60s interval)

### Status Page
- Public: `status.canchero.pe`
- Components: Frontend, API, Database, Payments, Notifications
- Incident communication: Auto-post to Slack #status

## Health Check Endpoints

### Frontend (Vercel)
```
/api/health -> 200 OK { status: "healthy", timestamp, version }
```

### Supabase Edge Functions
```
/functions/v1/pagos-culqi/health
/functions/v1/facturacion-sunat/health
/functions/v1/notificaciones/health
/functions/v1/reservas/health
```

### Database
```
SELECT 1; -- Basic connectivity
SELECT count(*) FROM pg_stat_activity; -- Connections
```

## Runbooks

### High Error Rate
1. Check Sentry for error patterns
2. Check Grafana for infrastructure metrics
3. Check Supabase logs for DB issues
4. Check Culqi/SUNAT status pages
5. Rollback if recent deploy

### Payment Failures
1. Check Culqi dashboard for outages
2. Check webhook delivery in Supabase logs
3. Verify SUNAT status for facturación
4. Check payment success rate dashboard
5. Contact Culqi support if needed

### Database Issues
1. Check connections count
2. Check long-running queries
3. Check disk space
4. Consider connection pooling (PgBouncer)
5. Scale Supabase if needed