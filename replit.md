# Da.Do Ponteggi CRM Platform

## Overview
The Da.Do Ponteggi CRM Platform is a B2B SaaS multi-tenant system designed for Da.Do Ponteggi and its affiliates. It focuses on managing scaffolding (ponteggi) operations, ensuring data isolation between tenants. The platform aims to streamline CRM, sales pipelines, and quoting processes within the scaffolding industry, enhancing operational efficiency and customer management.

## User Preferences
- **Lingua**: Comunicare sempre in italiano.
- I want to be communicated with using clear, concise language. When making changes, please prioritize iterative development, showing progress frequently. I prefer detailed explanations for complex logic or architectural decisions. Before implementing major changes or new features, please ask for my approval. Ensure that any generated code adheres to modern TypeScript and React best practices, favoring functional components and hooks for the frontend.

## System Architecture
The platform utilizes a modern web stack: **React 18 + TypeScript + Vite** for the Frontend, **Express.js + TypeScript** for the Backend, and **PostgreSQL with Drizzle ORM** for the Database. Authentication is handled via Email/Password with JWT. Styling is managed with Tailwind CSS, shadcn/ui, and Lucide React.

### Core Principles
- **Multi-tenant Architecture**: Achieved by including a `company_id` in all primary tables to ensure complete data isolation.
- **Contact Management**: Distinguishes between `leads` (full anagraphic data) and `contact_referents` (persons associated with `COMPANY` leads). `Opportunities` represent construction sites/quotes linked to a `Lead`.
- **Role-Based Access Control (RBAC)**: Implements `SUPER_ADMIN`, `COMPANY_ADMIN`, `SALES_AGENT`, and `TECHNICIAN` roles with specific access rights.

### UI/UX
The UI aligns with Da.Do Ponteggi's brand identity, using a specific logo, a defined color palette (Primary: #050B41, Secondary: #4563FF, Accent: #61CE85, Background: #FDFDFD), and the Inter font. Key pages include:
- `/leads`: Contact management with filtering and detail navigation.
- `/leads/:id`: Detailed contact page with tabs for "Anagrafica," "Opportunità," "Timeline," and "Amministrazione."
- `/opportunita`: Kanban board for opportunity management with drag-and-drop.
- `/team`: User and role management.
- `/progetti`: Kanban board for project management.
- `/progetti/:projectId/gantt`: Cronistoria (timeline cronologica) del progetto.
- `/proxit`: Operational planning center for daily/weekly assignments.

### Key Features
- **Pipeline Kanban**: Dynamic stages stored per company, with drag-and-drop functionality for opportunities.
- **Activity Log**: Tracks CRUD operations on `lead` and `opportunity` entities for audit trails.
- **Quote Builder**: Manages quote generation with "Noleggio + Manodopera", "Solo Manodopera", "Fasi" (modular phases), and "A corpo" (lump sum) modes, integrating an `articles` catalog. Supports price overrides and extra discounts. Site distance (`siteDistanceKm`) and "squadra in zona" (`siteSquadraInZonaKm`) are stored on the opportunity and auto-loaded as defaults in the quote builder (overridable per-quote).
  - **Modular Phases**: Each phase starts empty; user adds only needed modules (Trasporto, Montaggio, Smontaggio, Noleggio, Fornitura). Each module has independent article selection. Server processes each module array separately via `targetPhases` filter in `calculateQuoteItemsWithPhases`.
  - **A corpo Mode**: Uses the same internal data structure as phases (single fase) but hides multi-fase navigation. All units of measure in PDF are forced to "ac" (a corpo). `quoteMode` = `'a_corpo'`. Uses `isPhaseLikeMode` helper (`quoteMode === 'phases' || quoteMode === 'a_corpo'`) to share logic with phases mode.
- **Catalog as Single Source of Truth**: The `articles` table is the authoritative source for all quote content and optional services.
- **Venice Lagoon Transport (Trasporti Lagunari)**: Single catalog article `TRF-VEN` with 6 zone variants (Santa Croce, Dorsoduro/San Polo/Cannaregio, San Marco/Castello, Giudecca/Sacca Fisola/Murano/Lido, Burano/Torcello, Pellestrina), each with a daily cost. When `siteCity` contains "Venezia", a zone selector appears on the opportunity form. The `veniceZone` field on `opportunities` drives automatic cost calculation in the quote builder: `costoGiornaliero × (valore/1200)`, split 50/50 between montaggio and smontaggio, distributed proportionally like trasferta.
- **HOIST Pricing System**: Complex multi-tier pricing for material hoists based on components and installation costs.
- **Billing Profiles (Dual Branding)**: Allows for distinct billing profiles (e.g., PUBLIC/PRIVATE) that dynamically alter PDF output for quotes, including company data and logos.
- **Progetti Kanban & Cronistoria**: Projects are auto-created from "Vinto" opportunities, managed via a Kanban board. Each project card has a "Cronistoria" button linking to a vertical timeline page that shows daily assignments (with driver, vehicle, teams, members), phase changes, and project creation events in reverse chronological order. Project detail modal includes a `checklist` (jsonb field) with default items and progress tracking, inline editing, and add/remove functionality. Technician assignment filters by `TECHNICIAN` role only via `/api/users/technicians`.
- **Proxit - Pianificazione Operativa**: A hybrid Gantt/list view for daily/weekly operational planning, allowing assignments of teams, drivers, and vehicles to tasks. Includes resource management for `teams`, `drivers`, and `vehicles`. Supports morning/afternoon time slot splitting (`timeSlot` + `endDayTimeSlot` on `daily_assignments`): for multi-day assignments, the first day and last day can independently be set to Intera giornata, Mattino, or Pomeriggio (middle days are always full day). The Gantt grid renders split bars (top half = mattino, bottom half = pomeriggio) when two different assignments share the same day for the same caposquadra.
- **In-App Notification System**: Notifies users based on triggers (e.g., new project creation for TECHNICIANs) with a dedicated `notifications` table, unread counts, and read/unread functionality.
- **CreditSafe Integration**: Integrates with CreditSafe Connect API for company reliability verification, enabling fetching, saving, and displaying financial reports within lead details.
- **Related Notes (Note Correlate)**: Cross-entity read-only note visibility. From any entity (lead, opportunity, project), users can see notes from all related entities without navigating away. Implemented via enriched API responses (`GET /api/projects/:id`, `GET /api/opportunities/:id`, `GET /api/leads/:id/related-notes`) and UI panels in the detail modals/pages.
- **SAL (Stato Avanzamento Lavori)**: Monthly billing progress tracking page at `/sal`. Shows cantieri with activity (daily assignments) or active cantiere status for the selected month. Summary bar shows total/Bozze/Verificati/Inviati. Alert banner highlights active cantieri without SAL records. Clicking a cantiere opens a detail modal to review/edit billing voci (auto-populated from the accepted quote), manage notes, mark fattura finale, and advance status Bozza → Verificato → Inviato. Two new DB tables: `sal_periods` and `sal_voci`.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Drizzle ORM**: Database interaction.
- **bcryptjs**: Password hashing.
- **jsonwebtoken**: JWT authentication.
- **Tailwind CSS**: Styling framework.
- **shadcn/ui**: Component library.
- **Lucide React**: Icon library.
- **@dnd-kit**: Drag and drop functionality for Kanban.
