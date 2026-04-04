# Architettura Gestionale

> Documento di riferimento per separare il repository `gestionale-madre` in due repo distinti:
> - `gestionale-crm` — piattaforma generica riusabile per qualsiasi azienda
> - `gestionale-dado` — istanza DaDo Ponteggi con tutti i moduli custom

---

## Moduli CORE

Tutto ciò che funziona uguale per qualsiasi azienda. Va nel repository `gestionale-crm`.

### Backend — Server

| Path | Descrizione |
|---|---|
| `server/index.ts` | Entry point Express, middleware, startup |
| `server/auth.ts` | JWT middleware, `requireAuth`, `resolveUserCompany` |
| `server/db.ts` | Pool PostgreSQL, `bootstrapDatabase()` con tutte le migration idempotenti |
| `server/storage.ts` | Data access layer (query Drizzle) — contiene anche metodi ponteggi, da suddividere |
| `server/creditsafe.ts` | Integrazione API Creditsafe per analisi creditizia aziende |
| `server/static.ts` | Serving file statici in produzione |
| `server/vite.ts` | Dev server Vite integrato |
| `server/routes.ts` | Registrazione router + 2 endpoint dashboard summary |
| `server/routers/auth.router.ts` | Login, logout, register, reset password, sessione |
| `server/routers/leads.router.ts` | CRUD contatti, import CSV, rilevamento duplicati |
| `server/routers/opportunities.router.ts` | Gestione opportunità, pipeline, stage |
| `server/routers/quotes.router.ts` | CRUD preventivi — contiene logica scaffolding, da isolare |
| `server/routers/catalog.router.ts` | Catalogo articoli e servizi |
| `server/routers/users.router.ts` | Gestione utenti, inviti, ruoli |
| `server/routers/company.router.ts` | Impostazioni azienda, profilo, billing |
| `server/routers/admin.router.ts` | Pannello super admin, gestione tenant |
| `server/routers/notifications.router.ts` | Notifiche in-app, check scadenze |
| `server/utils/accessContext.ts` | Risoluzione company/ruolo per multi-tenancy |
| `server/utils/errors.ts` | Classi errore standard (AppError, NotFoundError, ecc.) |

### Backend — Shared

| Path | Descrizione |
|---|---|
| `shared/schema.ts` | Definizione tabelle Drizzle + tipi — contiene anche tabelle ponteggi, da suddividere |
| `shared/models/auth.ts` | Tabelle `users`, `sessions`, enum ruoli |

### Database — Tabelle CORE

| Tabella | Descrizione |
|---|---|
| `companies` | Tenant aziendali (multi-tenancy) |
| `users` | Account utenti, ruoli, stato |
| `sessions` | Sessioni autenticate |
| `leads` | Contatti / prospect |
| `contact_referents` | Referenti associati ai lead |
| `pipeline_stages` | Stadi della pipeline di vendita (configurabili per azienda) |
| `opportunities` | Opportunità commerciali |
| `quotes` | Preventivi generici |
| `quote_items` | Righe del preventivo |
| `articles` | Catalogo articoli e servizi |
| `billing_profiles` | Dati fatturazione cliente |
| `reminders` | Promemoria e task |
| `creditsafe_reports` | Report creditizi aziende |
| `payment_methods` | Metodi di pagamento |
| `lead_sources` | Sorgenti dei lead |
| `notifications` | Notifiche in-app |
| `activity_logs` | Log attività / audit trail |
| `user_companies` | Relazione utenti ↔ aziende |
| `promo_codes` | Codici promozionali (usati in join) |

### Frontend — Pagine CORE

| Path | Descrizione |
|---|---|
| `client/src/pages/login.tsx` | Autenticazione |
| `client/src/pages/register.tsx` | Registrazione azienda |
| `client/src/pages/reset-password.tsx` | Recupero password |
| `client/src/pages/join.tsx` | Accettazione invito team |
| `client/src/pages/landing.tsx` | Landing page pubblica |
| `client/src/pages/dashboard.tsx` | Dashboard principale |
| `client/src/pages/leads.tsx` | Lista contatti (1.349 righe) |
| `client/src/pages/lead-detail.tsx` | Dettaglio contatto (3.001 righe) — ha tab "amministrazione" gated da flag |
| `client/src/pages/lead-duplicates.tsx` | Deduplicazione contatti |
| `client/src/pages/opportunita.tsx` | Pipeline opportunità (3.419 righe) |
| `client/src/pages/quote-new.tsx` | Wizard creazione preventivo (12.211 righe) — contiene logica scaffolding, da isolare |
| `client/src/pages/quote-view.tsx` | Visualizzazione preventivo |
| `client/src/pages/import-leads.tsx` | Import CSV contatti |
| `client/src/pages/catalog.tsx` | Gestione catalogo — colonne ponteggi gated da flag |
| `client/src/pages/mappa.tsx` | Vista mappa dei contatti |
| `client/src/pages/settings.tsx` | Impostazioni utente |
| `client/src/pages/team.tsx` | Gestione membri del team |
| `client/src/pages/admin.tsx` | Pannello super admin |
| `client/src/pages/not-found.tsx` | Pagina 404 |

### Frontend — Componenti CORE

| Path | Descrizione |
|---|---|
| `client/src/components/ui/` | ~50 componenti shadcn/ui (Button, Dialog, Table, ecc.) |
| `client/src/components/layout/dashboard-layout.tsx` | Layout principale con sidebar — sidebar Proxit gated da flag |
| `client/src/components/creditsafe-analysis.tsx` | Visualizzazione report creditizio |
| `client/src/components/quote-preview-modal.tsx` | Anteprima preventivo |
| `client/src/components/reminder-modal.tsx` | Modal creazione promemoria |
| `client/src/components/lead-status-badge.tsx` | Badge stato contatto |

### Frontend — Librerie e Hook CORE

| Path | Descrizione |
|---|---|
| `client/src/lib/auth.tsx` | AuthProvider, `useAuth`, `usePermission` |
| `client/src/lib/auth-utils.ts` | Utility per controllo ruoli |
| `client/src/lib/company-context.tsx` | CompanyProvider, dati azienda corrente |
| `client/src/lib/config.ts` | `APP_CONFIG` — legge le VITE_ env var per feature flags e branding |
| `client/src/lib/queryClient.ts` | Setup TanStack Query |
| `client/src/lib/formatCurrency.ts` | Formattazione valuta |
| `client/src/lib/utils.ts` | Utility generiche (cn, ecc.) |
| `client/src/hooks/` | `use-auth.ts`, `use-mobile.tsx`, `use-toast.ts`, `use-idle-timeout.ts`, `use-confirm-close.tsx` |
| `client/src/data/italian-cities.ts` | Database comuni italiani per autocomplete |

### Frontend — Routing e Entry Point CORE

| Path | Descrizione |
|---|---|
| `client/src/App.tsx` | Router principale (Wouter) con route protette per ruolo |
| `client/src/main.tsx` | Entry point React |
| `client/src/index.css` | Stili globali Tailwind |
| `client/index.html` | Template HTML con `%VITE_APP_NAME%` |

### Migrations CORE (da 0001 a 0005)

| File | Contenuto |
|---|---|
| `migrations/0001_add_team_members_and_member_adjustments.sql` | Team members e adjustments |
| `migrations/0002_add_brochure_sent_to_leads.sql` | Campo brochure inviata |
| `migrations/0003_add_is_automatic_to_reminders.sql` | Promemoria automatici |
| `migrations/0004_add_quotes_unique_constraint.sql` | Constraint unicità preventivi |
| `migrations/0005_add_sort_order_to_daily_assignments.sql` | Ordinamento righe |

### Config e Build

| Path | Descrizione |
|---|---|
| `vite.config.ts` | Configurazione Vite (build, alias `@`, `@shared`, `@assets`) |
| `tsconfig.json` | Configurazione TypeScript |
| `tailwind.config.ts` | Configurazione Tailwind CSS |
| `postcss.config.js` | PostCSS |
| `drizzle.config.ts` | Configurazione drizzle-kit |
| `components.json` | Configurazione shadcn/ui |
| `package.json` | Dipendenze npm |
| `script/build.ts` | Script di build produzione |
| `scripts/seed.ts` | Seed iniziale DB |
| `scripts/reset-passwords.ts` | Utility reset password |
| `scripts/post-merge.sh` | Hook post-merge git |

---

## Moduli CUSTOM — DaDo Ponteggi

Tutto ciò che contiene logica, dati o UI specifici del settore ponteggi / edilizia. Da mantenere solo in `gestionale-dado`.

### Backend — Routers e Utility CUSTOM

| Path | Descrizione |
|---|---|
| `server/routers/projects.router.ts` | CRUD cantieri, stadi progetto, gestione fasi |
| `server/routers/assignments.router.ts` | Assegnazioni giornaliere squadre (MONTAGGIO, SMONTAGGIO, ecc.) |
| `server/utils/quote-calculations.ts` | Motore di calcolo preventivi ponteggi (fasi, trasporto, manodopera, noleggio, montacarichi) |
| `server/utils/proxit-helpers.ts` | Sistema di lock/priorità PROXIT per accesso concorrente |
| `server/utils/vehicles.ts` | Pricing e disponibilità veicoli da trasporto |
| `server/data/masterCatalog.ts` | Catalogo default articoli ponteggi (prezzi base, varianti) |

### Database — Tabelle CUSTOM

| Tabella | Descrizione |
|---|---|
| `projects` | Cantieri / commesse |
| `project_stages` | Fasi del cantiere (Acquisti, Montaggio, Noleggio, ecc.) |
| `project_tasks` | Task all'interno delle fasi |
| `workers` | Operai edili |
| `teams` | Squadre di lavoro |
| `drivers` | Autisti per trasporto ponteggi |
| `vehicles` | Veicoli con pricing per distanza |
| `daily_assignments` | Programmazione giornaliera squadre (attività, materiali, note, orari) |
| `team_members` | Composizione squadre |
| `external_engineers` | Tecnici esterni (collaudi, perizie) |
| `proxit_presence` | Presenza in tempo reale nel modulo PROXIT (heartbeat + lock) |
| `sal_periods` | Periodi SAL (Stato Avanzamento Lavori) |
| `sal_voci` | Voci SAL con importi |
| `warehouse_balances` | Saldi magazzino materiali per data |

### Frontend — Pagine CUSTOM

| Path | Descrizione |
|---|---|
| `client/src/pages/progetti.tsx` | Dashboard gestione cantieri (1.589 righe) |
| `client/src/pages/proxit.tsx` | **Modulo PROXIT** — griglia assegnazioni giornaliere, squadre, presenza, lock (6.362 righe) |
| `client/src/pages/sal.tsx` | **Modulo SAL** — Stato Avanzamento Lavori per cantiere (808 righe) |
| `client/src/pages/gantt.tsx` | Diagramma di Gantt per timeline cantiere |
| `client/src/pages/quotes/QuoteSelector.tsx` | Dispatcher che seleziona il tipo di editor preventivo da `quoteEditorType` |
| `client/src/pages/quotes/ScaffoldingQuoteEditor.tsx` | Re-export semantico di `quote-new.tsx` per il preventivatore ponteggi |

### Frontend — Componenti CUSTOM

| Path | Descrizione |
|---|---|
| `client/src/components/scheda-cantiere-modal.tsx` | Modal scheda dati cantiere |
| `client/src/components/cronistoria-content.tsx` | Timeline eventi / cronistoria cantiere |
| `client/src/components/pdf/QuotePdfButton.tsx` | Pulsante generazione PDF preventivo ponteggi |
| `client/src/components/pdf/QuotePdfDocument.tsx` | Template PDF preventivo con layout DaDo |

### Shared — Tipi e Enum CUSTOM

Questi enum e tipi sono definiti in `shared/schema.ts` ma appartengono al dominio ponteggi:

| Tipo | Valori |
|---|---|
| `activityTypeEnum` | `MONTAGGIO`, `SMONTAGGIO`, `MOVIMENTAZIONE`, `MANUTENZIONE`, `SOPRALLUOGO`, ecc. |
| `quotePhaseEnum` | `DOCUMENTI`, `TRASPORTO_ANDATA`, `MONTAGGIO`, `NOLEGGIO`, `SMONTAGGIO`, `TRASPORTO_RITORNO` |
| `articleCategoryEnum` | `SCAFFOLDING`, `SCAFFOLDING_LABOR`, `HOIST`, `TRASFERTA`, ecc. |
| `pricingLogicEnum` | `RENTAL`, `TRANSPORT`, `HOIST`, `TRASFERTA`, `HANDLING` |
| `siteQualityEnum` | `PHOTO_VIDEO`, `PHOTO_ONLY`, `NOTHING` |
| `salStatusEnum` | `BOZZA`, `VERIFICATO`, `INVIATO` |

Tipi complessi CUSTOM (definiti come `jsonb` nel DB):

- `HoistPricingData` / `HoistInstallationData` — prezzi montacarichi con varianti
- `TrasfertaData` — indennità trasferta con costi configurabili
- `HandlingZone` / `HandlingData` — movimentazione materiale con zone
- `ArticleVariant` — varianti articolo con configurazioni cesta
- `QuoteGlobalParams` — parametri globali preventivo con gestione fasi
- `DailyAssignment` — entry programmazione con materiali, note colori, slot orario

### Branding e Asset CUSTOM

| Path | Descrizione |
|---|---|
| `client/public/logo.png` | Logo principale DaDo Ponteggi |
| `client/public/logo_dash.png` | Logo sidebar dashboard |
| `client/public/logo-ponteggi.png` | Logo copertina preventivo ponteggi |
| `client/public/logo-partners.png` | Logo partner per PDF |
| `client/public/logo-copertina-ponteggi.png` | Copertina PDF preventivo |
| `client/public/logo-copertina-partners.png` | Copertina PDF partners |
| `client/public/logo-cover-verde.png` | Logo variante verde |
| `client/public/uni-en-iso.png` | Marchio certificazione UNI EN ISO |
| `client/public/favicon.png` | Favicon — da sostituire per altri clienti |

### Shared — Configurazione CUSTOM

| Path | Descrizione |
|---|---|
| `shared/optionalServices.ts` | Definizioni servizi aggiuntivi (noleggio WC, ponteggio a giornata, ecc.) |

### Migrations CUSTOM (da 0006 a 0023)

| File | Contenuto |
|---|---|
| `migrations/0006_add_workers_and_worker_assignments.sql` | Operai e assegnazioni |
| `migrations/0007_add_external_engineers.sql` | Tecnici esterni |
| `migrations/0007_add_time_slot_to_daily_assignments.sql` | Slot orario assegnazioni |
| `migrations/0008_add_end_day_time_slot_to_daily_assignments.sql` | Slot orario fine giornata |
| `migrations/0009_add_sal_tables.sql` | Tabelle SAL |
| `migrations/0010_add_internal_external_squads.sql` | Squadre interne/esterne |
| `migrations/0011_add_team_departure_times_and_free_numbers.sql` | Orari partenza squadre |
| `migrations/0012_add_pre_padding_to_daily_assignments.sql` | Pre-padding assegnazioni |
| `migrations/0013_add_stage_entered_at_to_projects.sql` | Data ingresso fase cantiere |
| `migrations/0014_add_city_to_workers.sql` | Città operaio |
| `migrations/0015_add_team_notes_to_daily_assignments.sql` | Note squadra |
| `migrations/0016_add_team_note_colors_to_daily_assignments.sql` | Colori note squadra |
| `migrations/0017_add_working_days_to_daily_assignments.sql` | Giorni lavorativi (array) |
| `migrations/0018_add_grid_note_color_to_daily_assignments.sql` | Colore nota griglia |
| `migrations/0019_add_material_fields_to_daily_assignments.sql` | Tipo e quantità materiale |
| `migrations/0020_add_warehouse_balances.sql` | Saldi magazzino |
| `migrations/0021_add_chi_cosa_to_daily_assignments.sql` | Campi chi/cosa |
| `migrations/0022_add_materials_to_daily_assignments.sql` | Materiali (jsonb) |
| `migrations/0023_add_chi_cosa_color_to_daily_assignments.sql` | Colori chi/cosa |

### Scripts CUSTOM

| Path | Descrizione |
|---|---|
| `scripts/backfill-project-site-fields.ts` | Backfill campi cantiere su progetti esistenti |
| `scripts/fix-opportunity-assignments.ts` | Fix assegnazioni opportunità-cantiere |

---

## File da NON includere nei repository

Questi file non devono mai essere committati in nessun repository.

### Segreti e configurazione ambiente

| Path | Motivo |
|---|---|
| `.env` | Contiene `DATABASE_URL` e `SESSION_SECRET` — credenziali di produzione |
| `.env.local` | Variabili locali di sviluppo |
| `.env.production` | Variabili di produzione |

### Dati e backup

| Path | Motivo |
|---|---|
| `backup_produzione.sql` | Dump completo del database di produzione (3.000+ contatti reali) |
| `production_seed.sql` | Dati seed di produzione |
| `indirizzi.csv` | File CSV con indirizzi clienti |
| `update_prod.js` | Script di aggiornamento produzione con logica specifica |
| `uploads/` | File caricati dagli utenti (allegati, foto cantiere) |

### Generati dal build

| Path | Motivo |
|---|---|
| `dist/` | Output del build Vite — si rigenera con `npm run build` |
| `node_modules/` | Dipendenze npm — si ripristinano con `npm install` |

### Asset allegati

| Path | Motivo |
|---|---|
| `attached_assets/` | Screenshot e immagini allegate durante lo sviluppo |

---

## Variabili d'ambiente necessarie

### CORE — obbligatorie per avviare il server

| Variabile | Tipo | Descrizione |
|---|---|---|
| `DATABASE_URL` | `string` | Stringa di connessione PostgreSQL con `sslmode=require` |
| `SESSION_SECRET` | `string` | Segreto JWT (min. 32 caratteri, generare con `openssl rand -base64 64`) |
| `PORT` | `number` | Porta del server HTTP (default: `5001`) |
| `NODE_ENV` | `string` | `development` o `production` |

### CORE — opzionali

| Variabile | Tipo | Descrizione |
|---|---|---|
| `CREDITSAFE_USERNAME` | `string` | Username API Creditsafe per analisi creditizia aziende |
| `CREDITSAFE_PASSWORD` | `string` | Password API Creditsafe |

### Branding e feature flags (lette dal client via Vite)

Tutte le variabili `VITE_*` sono incorporate nel bundle JavaScript al momento del build.

| Variabile | Default | Descrizione |
|---|---|---|
| `VITE_APP_NAME` | `"CRM"` | Nome dell'applicazione (appare nel titolo del browser e nella UI) |
| `VITE_COMPANY_NAME` | `""` | Ragione sociale del cliente (appare nel footer e nei documenti) |

### Feature flags — moduli attivabili per cliente

| Variabile | Default | Quando impostare a `false` |
|---|---|---|
| `VITE_MODULE_PONTEGGI` | `true` | Nasconde campi ponteggi nel catalogo (categoria, magazzino, checklist) e logica pricing specifici |
| `VITE_MODULE_PROXIT` | `true` | Nasconde la voce "Proxit" dalla sidebar |
| `VITE_MODULE_AMMINISTRAZIONE` | `true` | Nasconde il tab "Amministrazione" nel dettaglio contatto |
| `VITE_QUOTE_EDITOR_TYPE` | `"scaffolding"` | Tipo di editor preventivo da caricare — `"scaffolding"` per DaDo, aggiungere nuovi valori in `QuoteSelector.tsx` |

### Esempio `.env` per un nuovo cliente generico

```env
# Database
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
SESSION_SECRET="genera-con-openssl-rand-base64-64"

# Server
PORT=5001
NODE_ENV=production

# Branding
VITE_APP_NAME="Gestionale"
VITE_COMPANY_NAME="Nome Azienda S.r.l."

# Moduli — disabilita tutto il codice ponteggi
VITE_MODULE_PONTEGGI=false
VITE_MODULE_PROXIT=false
VITE_MODULE_AMMINISTRAZIONE=false
VITE_QUOTE_EDITOR_TYPE=standard
```

### Esempio `.env` per DaDo Ponteggi (configurazione attuale)

```env
DATABASE_URL="postgresql://neondb_owner:***@ep-fancy-flower-***.neon.tech/neondb?sslmode=require"
SESSION_SECRET="***"

VITE_APP_NAME="DaDo Ponteggi"
VITE_COMPANY_NAME="Da.Do Ponteggi S.r.l."
VITE_MODULE_PONTEGGI=true
VITE_MODULE_PROXIT=true
VITE_MODULE_AMMINISTRAZIONE=true
VITE_QUOTE_EDITOR_TYPE=scaffolding
```
