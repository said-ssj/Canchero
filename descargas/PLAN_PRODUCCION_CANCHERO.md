# Plan de Acción Detallado: Canchero MVP → Producción

> **Basado en:** Auditoría completa del código actual + DDL Supabase (44 tablas) + Benchmark vs apps reales (CanchaYa, FutPlay, Playtomic, PadelNuestro, Reservamos, CourtSpot)

---

## 1. ANÁLISIS DE APLICACIONES REALES DE REFERENCIA

| App | Fortalezas Clave | Gaps en Canchero Actual |
|-----|------------------|-------------------------|
| **Playtomic** (pádel/tennis) | Pago integrado Stripe/Adyen, lista espera automática, ranking ELO, app nativa iOS/Android | Canchero: sin pagos reales, sin lista espera, sin ranking |
| **CanchaYa** (Perú) | Yape/Plin nativo, facturación SUNAT automática, geolocalización real | Canchero: solo mock, sin integración SUNAT, sin GPS real |
| **FutPlay** (LatAm) | Marketplace dueños↔jugadores, chat en app, notificaciones push, fidelidad | Canchero: sin chat, sin push, sin programa fidelidad |
| **PadelNuestro** | Gestión torneos/ligas, streaming partidos, tienda integrada | Canchero: solo reservas básicas |
| **Reservamos** (buses/eventos) | Checkout 1-click, wallets, reembolsos automáticos, multi-idioma | Canchero: checkout mock, sin wallet, solo español |
| **CourtSpot** (USA) | Disponibilidad tiempo real WebSocket, precios dinámicos, reviews verificados | Canchero: polling localStorage, precios fijos, reviews mock |

**Conclusión:** Canchero hoy es un **prototipo visual** (localStorage only). Para producción necesita: **pagos reales, backend real, compliance legal, infraestructura cloud.**

---

## 2. CUMPLIMIENTO LEGAL OBLIGATORIO (PERÚ)

| Requisito | Ley/Norma | Implementación Requerida | Estado Actual |
|-----------|-----------|--------------------------|---------------|
| **Protección Datos Personales** | Ley 29733 + DS 003-2013-JUS | Consentimiento explícito, derechos ARCO, DPO, registro DNPDP | ❌ Falta todo |
| **Facturación Electrónica** | SUNAT (RUC, CPE, QR) | Emisión boleta/factura XML, firma digital, envío SUNAT | ❌ Solo mock |
| **Medios de Pago** | SBS Circular 002-2022-BS | PCI-DSS SAQ-A, tokenización Yape/Plin, no guardar PAN | ❌ Texto plano |
| **Consumidor** | Código Protección Consumidor | Términos claros, derecho retracto 7d, reclamos libro | ⚠️ Parcial |
| **Accesibilidad Web** | Ley 29973 (Discapacidad) | WCAG 2.1 AA, lectores pantalla, contraste, navegación teclado | ❌ Violaciones múltiples |
| **Lavado Activos** | DL 1106 + SBS | KYC dueños, reporte operaciones >10k USD, PEP screening | ❌ Falta |
| **Menores de Edad** | Código Niños/Adolescentes | Verificación edad 18+, consentimiento tutor <18 | ❌ Falta |
| **Seguridad Informática** | DS 003-2013-JUS Art 28 | Cifrado en tránsito/reposo, logs auditoría, plan continuidad | ❌ Parcial |

---

## 3. PLAN DE EJECUCIÓN POR FASES

### FASE 0: FUNDACIÓN (Semanas 1-2) — *Bloqueante para todo lo demás*

| # | Tarea | Archivos/Componentes | Criterio Aceptación |
|---|-------|---------------------|---------------------|
| 0.1 | **Migrar a Supabase/PostgreSQL real** — Ejecutar DDL 44 tablas, configurar RLS policies por rol | `supabase/migrations/`, `supabase/config.toml` | `SELECT * FROM sede` devuelve datos reales |
| 0.2 | **Configurar Supabase Auth** — Email/password + OAuth Google/Apple, triggers `handle_new_user()` | `supabase/functions/`, `auth.service.ts` reescrito | Login real crea `usuario` + `cliente` automático |
| 0.3 | **Eliminar DatabaseService localStorage** — Reemplazar todos los services por `HttpClient` + Supabase client | `database.service.ts` → **borrar**, `venue.service.ts`, `booking.service.ts`, `review.service.ts`, `auth.service.ts` | Zero referencias a `localStorage` en services |
| 0.4 | **Variables de entorno seguras** — `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE`, `JWT_SECRET`, `ENCRYPTION_KEY` | `.env.production`, `environment.prod.ts` | No secretos en código, build CI pasa |
| 0.5 | **HTTPS obligatorio + HSTS** — Configurar TLS 1.3, headers seguridad (`Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`) | `nginx.conf`, `angular.json` | `securityheaders.com` = A+ |

---

### FASE 1: PAGOS REALES + FACTURACIÓN SUNAT (Semanas 3-5)

| # | Tarea | Detalle Técnico | Criterio Aceptación |
|---|-------|-----------------|---------------------|
| 1.1 | **Integración Culqi (Perú)** — Tokenización tarjetas, Yape/Plin via Culqi, webhook `payment.succeeded` | `payment.service.ts`, `webhook/culqi.ts`, `pago_reserva` trigger 5% comisión | Pago S/ 100 → S/ 95 neto dueño, S/ 5 comisión, comprobante URL |
| 1.2 | **Facturación Electrónica SUNAT** — Greenter/PHP o servicio propio, XML UBL 2.1, QR código, envío automático | `facturacion.service.ts`, `cron/sunat-sync.ts`, tabla `venta` + `venta_detalle` | Boleta PDF/QR descargable, estado "Aceptado" en SUNAT |
| 1.3 | **Wallet dueño + Liquidación semanal** — Saldo neto acumulado, transferencia bancaria automática (BCP/Interbank API o manual), reporte IRS | `liquidacion.service.ts`, `cron/weekly-payout.ts`, `sesion_pago_resumen` | Dueño ve "S/ 2,450 por liquidar", botón "Solicitar retiro" |
| 1.4 | **Comprobantes jugador** — Boleta/factura automática al completar pago, envío email/WhatsApp | `comprobante.service.ts`, template HTML/PDF, `nodemailer`/`twilio` | Jugador recibe boleta en <30 seg post-pago |
| 1.5 | **PCI-DSS SAQ-A Compliance** — No tocar PAN, solo token Culqi, logs sin datos sensibles, escaneo trimestral | `security/audit.ts`, `nginx` rate limiting, `helmet.js` | `pcidss.com` self-assessment aprobado |

---

### FASE 2: MÓDULOS FALTANTES DEL DDL (Semanas 6-9)

| Módulo | Tablas DDL | Funcionalidad Mínima Viable | Endpoints API |
|--------|------------|----------------------------|---------------|
| **2.1 Suscripciones** | `plan_suscripcion`, `suscripcion`, `pago_suscripcion` | Planes: Básico/Pro/Elite, descuento % reservas, renovación auto | `POST /subscriptions`, `GET /my-subscription`, `POST /webhook/culqi-subscription` |
| **2.2 Caja Completa** | `caja`, `sesion_caja`, `tipo_movimiento_caja`, `movimiento_caja`, `arqueo_caja`, `denominacion`, `arqueo_detalle` | Apertura/cierre caja, arqueo denominaciones, movimientos entrada/salida, diferencia | `POST /caja/open`, `POST /caja/close`, `POST /caja/movement`, `POST /caja/arqueo` |
| **2.3 Implementos/Alquiler** | `tipo_implemento`, `implemento`, `alquiler_implemento` | Catálogo balones/chalecos/porterías, stock, garantía, devolución | `GET /venue/:id/implements`, `POST /implement/rent`, `POST /implement/return` |
| **2.4 Inventario/Kardex** | `categoria_producto`, `producto`, `tipo_movimiento_inv`, `kardex` | Productos bar (agua, gaseosa, snacks), stock mínimo alertas, kardex valorado | `GET /venue/:id/products`, `POST /product/move`, `GET /kardex/:productId` |
| **2.5 Equipos/Torneos** | `equipo`, `miembro_equipo`, `equipo_partido` | Crear equipo, invitar miembros, partido con resultado, tabla posiciones | `POST /teams`, `POST /teams/:id/members`, `POST /matches`, `GET /league/:venueId/standings` |
| **2.6 Bloqueos Mantenimiento** | `bloqueo_mantenimiento` | Calendario bloqueos, recurrencia semanal, notificación jugadores afectados | `POST /court/:id/block`, `GET /court/:id/blocks`, `DELETE /block/:id` |

---

### FASE 3: UX PROFESIONAL + TIEMPO REAL (Semanas 10-12)

| # | Mejora | Referencia App Real | Implementación |
|---|--------|---------------------|----------------|
| 3.1 | **Disponibilidad tiempo real (WebSocket)** | Playtomic, CourtSpot | Supabase Realtime `cancha` + `reserva` + `bloqueo_mantenimiento` → `useRealtimeAvailability()` hook |
| 3.2 | **Lista de espera automática** | Playtomic, CanchaYa | Cola por cancha/horario, notificación push/email cuando libera, 10 min para confirmar |
| 3.3 | **Precios dinámicos por demanda** | CourtSpot, Uber Surge | Regla: >80% ocupación → +15%, <30% → -10%, configurable por dueño |
| 3.4 | **Notificaciones Push (FCM/APNs)** | FutPlay, CanchaYa | `capacitor-push-notifications`, topics: `venue:{id}`, `user:{id}`, plantillas: reserva, pago, recordatorio, cancelación |
| 3.5 | **Chat Jugador↔Dueño en app** | FutPlay | Supabase Realtime `chat_message` table, adjuntos foto, bloqueo post-partido |
| 3.6 | **Reviews verificados (solo post-juego)** | Playtomic, CourtSpot | Trigger: `reserva.estado='completada'` → habilita review 48h, muestra badge "Jugó aquí" |
| 3.7 | **Geolocalización real + mapa interactivo** | CanchaYa, Playtomic | `leaflet`/`mapbox-gl`, GPS navegador, filtros radio 5/10/20km, clustering markers |
| 3.8 | **PWA Completa** | Playtomic (web app) | `angular/service-worker`, manifest, offline-first (cache sedes/canchas), install prompt, shortcuts |

---

### FASE 4: ADMIN DUEÑO PROFESIONAL (Semanas 13-15)

| Vista Actual | Brechas vs Apps Reales | Nuevas Funcionalidades |
|--------------|------------------------|------------------------|
| **Mi Sede** | Solo datos básicos | Horarios excepción feriados, fotos 360°, video tour, SEO local (schema.org SportsFacility) |
| **Mis Canchas** | Tarifa fija día/noche | **Tarifas por franja horaria** (tarifa_cancha), precios dinámicos, bloqueos recurrentes, mantenimiento programado |
| **Reservas** | Lista básica | **Calendario visual semanal/mensual**, drag-drop mover reservas, check-in QR, lista espera, no-show tracking |
| **Finanzas** | Mock CSV | **Dashboard tiempo real**: ingreso día/semana/mes, comparativo YoY, proyección, liquidación pendiente, exportar Excel/PDF SUNAT |
| **Personalización** | Colores/QR | **White-label**: dominio propio (CNAME), logo, colores, emails transaccionales branded, app PWA instalable |
| **NUEVO: Staff/Operadores** | ❌ No existe | Roles: Admin, Operador (check-in, caja, canchas), Caja (solo pagos), permisos granulares (rol_modulo_privilegio) |
| **NUEVO: Reportes Avanzados** | ❌ No existe | Ocupación por hora/día/cancha, LTV cliente, churn, NPS, revenue per court, heatmap horario |

---

### FASE 5: COMPLIANCE + ACCESIBILIDAD + QA (Semanas 16-18)

| Área | Checklist Obligatorio | Herramienta/Validación |
|------|----------------------|------------------------|
| **Accesibilidad WCAG 2.1 AA** | Contraste 4.5:1, focus visible, labels formularios, alt imágenes, heading order, landmarks, skip links, ARIA live regions | `axe-core` CI, `lighthouse` CI, test manual NVDA/JAWS |
| **Protección Datos (Ley 29733)** | Registro DNPDP, Aviso privacidad, Consentimiento granular, Derechos ARCO (acceso, rectificación, cancelación, oposición), DPO designado, Brecha notificación 72h | `privacy-policy.md`, `data-export.service.ts`, `data-delete.service.ts`, `breach-notification.ts` |
| **Términos y Condiciones** | Cláusulas: servicio, cancelación, reembolso, responsabilidad, fuerza mayor, jurisdicción, modificaciones, contacto | `terms.md` versionado, aceptación obligatoria registro, historial versiones |
| **Seguridad** | Rate limiting (100 req/min), WAF (Cloudflare), CSP estricto, Subresource Integrity, Dependency scanning (Snyk/Dependabot), Pen test anual | `nginx rate-limit`, `helmet`, `npm audit`, `snyk test`, `owasp-zap` |
| **Testing** | Unit ≥80% (Jest/Vitest), E2E critical paths (Cypress/Playwright): registro→pago→reserva→review, load test 1000 users concurrentes | `vitest`, `playwright`, `k6` load test |
| **Observabilidad** | Logs estructurados (pino), Métricas (Prometheus/Grafana), Tracing (Jaeger), Alertas (PagerDuty/Slack), Uptime 99.9% | `supabase logs`, `datadog`/`grafana cloud`, `sentry` errors |

---

### FASE 6: LANZAMIENTO + CRECIMIENTO (Semanas 19-22)

| Hito | Actividades | Métrica Éxito |
|------|-------------|---------------|
| **6.1 Beta Cerrada (5 sedes amigas)** | Onboarding asistido, feedback semanal, bug bash, métricas adopción | ≥80% dueños completan setup, ≥50 reservas/semana |
| **6.2 Beta Abierta (Lima Metropolitana)** | Landing page SEO, Google Ads/Pinterest, referral program (S/ 20 c/u), onboarding autoguiado | 100 sedes registradas, 500 reservas/semana |
| **6.3 Launch Nacional** | Prensa, influencers fútbol/pádel, alianzas ligas municipales, API pública partners | 500 sedes, 5000 reservas/semana, break-even mes 6 |
| **6.4 Post-Launch** | Soporte 12/7, SLA <4h crítico, roadmap público, community Discord, webinars dueños | NPS ≥50, churn <5% mensual, LTV/CAC >3 |

---

## 4. ARQUITECTURA OBJETIVO (PRODUCCIÓN)

```
┌─────────────────────────────────────────────────────────────────┐
│                        USUARIOS                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Jugador    │  │  Dueño      │  │  Staff      │             │
│  │  (PWA/iOS/  │  │  (Admin     │  │  (Operador  │             │
│  │   Android)  │  │   Panel)    │  │   Caja)     │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
└─────────┼────────────────┼────────────────┼────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CDN / EDGE (Cloudflare)                     │
│  WAF + Rate Limit + DDoS + Cache Estático + Brotli/Gzip        │
└────────────────────────────┬────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  FRONTEND       │ │  BACKEND        │ │  REALTIME       │
│  (Angular 22+   │ │  (Supabase      │ │  (Supabase      │
│   SSR/SSG)      │ │   Edge Functions│ │   Realtime)     │
│  Vercel/Netlify │ │   + PostgreSQL) │ │  WebSockets     │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│  SUPABASE     │  │  SERVICIOS    │  │  MONITOREO    │
│  Auth + DB    │  │  EXTERNOS     │  │  (Sentry +    │
│  + Storage    │  │  Culqi + SUNAT│  │  Grafana +    │
│  + Realtime   │  │  + FCM +      │  │  PagerDuty)   │
│  + Edge Fn    │  │  Twilio +     │  │               │
│               │  │  SendGrid     │  │               │
└───────────────┘  └───────────────┘  └───────────────┘
```

---

## 5. PRESUPUESTO ESTIMADO (USD/mes, producción)

| Concepto | Costo Mensual | Notas |
|----------|---------------|-------|
| **Supabase Pro** | $599 | 8GB RAM, 500GB SSD, 2M MAU, Realtime, Edge Functions |
| **Vercel Pro** | $20 | SSR/SSG, Edge Network, Analytics |
| **Culqi** | 2.9% + S/ 0.50 txn | Sin fee mensual, solo por transacción |
| **SUNAT Facturación** | $50-100 | Servicio tercero (Facturama, Nubefact) o servidor propio |
| **Twilio (WhatsApp/SMS)** | $50-200 | Según volumen notificaciones |
| **SendGrid (Email)** | $15-90 | 100k-300k emails/mes |
| **Cloudflare Pro** | $20 | WAF, Rate Limit, Cache, Analytics |
| **Sentry + Grafana Cloud** | $50-200 | Errors, tracing, métricas, logs |
| **CI/CD (GitHub Actions)** | $0-50 | Minutos build incluidos en plan |
| **Total Estimado** | **$1,000-1,500/mes** | Escala con uso real |

---

## 6. EQUIPO MÍNIMO REQUERIDO

| Rol | Dedicación | Responsabilidades Clave |
|-----|------------|------------------------|
| **Tech Lead / Fullstack Senior** | 100% | Arquitectura, Supabase, Angular, CI/CD, code review |
| **Backend/Database Engineer** | 100% | RLS policies, triggers, migraciones, performance, SUNAT |
| **Frontend Angular Senior** | 100% | PWA, Realtime, componentes accesibles, testing |
| **DevOps/Cloud Engineer** | 50% | Infra, monitoring, security, backups, disaster recovery |
| **QA Automation** | 50% | E2E, accessibility, load testing, regression |
| **Product Owner** | 100% | Priorización, stakeholders, métricas, roadmap |
| **Legal/Compliance (externo)** | 20% | Ley 29733, SUNAT, PCI-DSS, términos, contratos |

---

## 7. RIESGOS CRÍTICOS Y MITIGACIÓN

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| **Migración localStorage → Supabase rompe UX** | Alta | Crítico | Feature flags, migración gradual, rollback plan, tests E2E exhaustivos |
| **Culqi/SUNAT downtime afecta pagos** | Media | Alto | Fallback manual (Yape/Plin código), cola reintentos, alertas inmediatas |
| **Ley 29733 multa por incumplimiento** | Media | Crítico | Auditoría legal previa launch, DPO externo, documentación continua |
| **Escalabilidad Realtime (Supabase limits)** | Media | Alto | Sharding por sede, connection pooling, cache Redis (Upstash) |
| **Fraude pagos / chargebacks** | Media | Alto | 3D Secure obligatorio, verificación teléfono, límites monto, ML fraud detection |
| **Dependencia única proveedor (Supabase)** | Baja | Alto | Multi-cloud strategy, export/import automatizado, backup diario S3 |

---

## 8. CHECKLIST DEFINITION OF DONE (PRODUCCIÓN)

```markdown
### Infraestructura
- [ ] Supabase project production creado, RLS habilitado en TODAS las tablas
- [ ] Dominio canchero.pe + www + api.canchero.pe con TLS 1.3, HSTS, CAA
- [ ] DNS: A/AAAA + CNAME Vercel + TXT SPF/DKIM/DMARC + CAA
- [ ] CDN Cloudflare: WAF managed rules, rate limit /api/*, bot fight mode
- [ ] Backups: Supabase PITR + dump diario S3 (30 días retención) + restore test mensual

### Backend / Base de Datos
- [ ] 44 tablas DDL aplicadas + índices performance (EXPLAIN ANALYZE < 50ms queries críticas)
- [ ] Triggers: auditoría, comisión 5%, código pase, sync auth→usuario/cliente
- [ ] RLS Policies: usuario ve solo su data, dueño ve su sede, admin ve todo, anon solo público
- [ ] Edge Functions: webhook Culqi, webhook SUNAT, cron liquidación, cron limpieza tokens
- [ ] Storage buckets: venue-images (public), comprobantes (private), avatars (public)

### Frontend
- [ ] Angular 22+ SSR/SSG en Vercel, Core Web Vitals: LCP <2.5s, CLS <0.1, INP <200ms
- [ ] PWA: installable, offline-first (cache sedes/canchas), push notifications, shortcuts
- [ ] Accesibilidad: axe-core 0 violations CI, Lighthouse Accessibility 100, test NVDA/JAWS
- [ ] i18n: es-PE (primario), en (secundario), RTL ready
- [ ] Bundle size: <500KB initial JS gzipped, code splitting por ruta

### Pagos / Facturación
- [ ] Culqi integrado: tokenización, Yape/Plin, tarjetas, webhooks idempotentes, reembolsos
- [ ] SUNAT: boleta/factura automática, XML UBL 2.1, QR, PDF, envío email/WhatsApp
- [ ] Comisión 5%: trigger DB + verificación frontend/backend, reporte mensual dueño
- [ ] Liquidación: semanal automática, reporte detalle, transferencia bancaria trazable

### Legal / Compliance
- [ ] Ley 29733: registro DNPDP, aviso privacidad, consentimiento granular, ARCO, DPO
- [ ] Términos y Condiciones versionados, aceptación obligatoria, historial
- [ ] PCI-DSS SAQ-A completado, escaneo ASV trimestral, no logs PAN
- [ ] Libro Reclamaciones virtual SUNAT integrado
- [ ] Verificación edad 18+, consentimiento tutor <18 años

### Observabilidad
- [ ] Sentry: error tracking, release tracking, performance monitoring
- [ ] Grafana Cloud: métricas Supabase (CPU, RAM, conexiones, queries), custom business metrics
- [ ] Logs estructurados: pino + Loki, correlation IDs, retención 90 días
- [ ] Alertas: PagerDuty/Slack (error rate >1%, latency p95 >2s, DB connections >80%, pagos fallidos >5%)
- [ ] Uptime monitor: Pingdom/BetterUptime 99.9% SLA, status page pública

### Testing / Calidad
- [ ] Unit tests: ≥80% coverage (vitest), mutation testing >60%
- [ ] E2E tests: Playwright, 10 critical paths (registro→pago→reserva→review→liquidación)
- [ ] Load test: k6, 1000 VU concurrentes, p95 <500ms, error rate <0.1%
- [ ] Accessibility audit: axe-core CI, manual NVDA/JAWS, WCAG 2.1 AA checklist
- [ ] Security: npm audit 0 high/critical, Snyk scan, dependabot PRs auto-merge patch
```

---

## 9. PRÓXIMOS PASOS INMEDIATOS (ESTA SEMANA)

1. **Crear proyecto Supabase Production** → Ejecutar DDL completo → Verificar 44 tablas + 7 auditorías + triggers
2. **Configurar Supabase Auth** → Email/password + Google OAuth → Probar trigger `handle_new_user()`
3. **Reescribir `auth.service.ts`** → Usar `supabase.auth` + `supabase.from('usuario')` → Eliminar localStorage
4. **Reescribir `venue.service.ts`** → `supabase.from('sede').select().eq('estado','A')` + joins canchas/tarifas
5. **Setup CI/CD GitHub Actions** → Lint + Typecheck + Unit + Build + Deploy Preview → Vercel + Supabase
6. **Configurar entorno staging** → Variables secretas → Smoke tests automatizados

---

## 10. RECURSOS Y REFERENCIAS

- **DDL Supabase:** Este documento (44 tablas, triggers, RLS)
- **Supabase Docs:** https://supabase.com/docs (Auth, Database, Realtime, Storage, Edge Functions)
- **Culqi API:** https://culqi.com/documentacion/api/ (Pagos Perú)
- **SUNAT Facturación:** https://www.sunat.gob.pe/ (Esquemas XML, guía desarrollador)
- **Ley 29733:** https://www.gob.pe/institucion/jus/normas-legales/29733
- **WCAG 2.1 AA:** https://www.w3.org/WAI/WCAG21/quickref/
- **Playtomic API (referencia):** https://developers.playtomic.io/
- **Angular 22 SSR:** https://angular.dev/guide/ssr

---

> **Nota:** Este plan es vivo. Revisar y ajustar cada sprint (2 semanas). Prioridad absoluta: **Fase 0-1** (backend real + pagos). Sin eso, no hay producto viable.