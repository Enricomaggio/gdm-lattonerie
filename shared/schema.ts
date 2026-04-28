import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, index, uniqueIndex, unique, integer, numeric, jsonb, boolean, AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Esporta le tabelle sessions e users dal modello auth
export * from "./models/auth";
import { users, userRoleEnum, type UserRole, type UserStatus } from "./models/auth";

// Tabella Companies - Aziende/Tenant
export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  vatNumber: text("vat_number"),
  fiscalCode: text("fiscal_code"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  shareCapital: text("share_capital"),
  iban: text("iban"),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Tabella PipelineStages - Fasi della pipeline per ogni azienda
export const pipelineStages = pgTable("pipeline_stages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  order: integer("order").notNull().default(0),
  color: text("color").notNull().default("#4563FF"),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("pipeline_stages_company_id_idx").on(table.companyId),
  index("pipeline_stages_order_idx").on(table.order),
]);

// Enum per tipo entità contatto (AZIENDA vs PRIVATO)
export const entityTypeEnum = ["COMPANY", "PRIVATE"] as const;
export type EntityType = typeof entityTypeEnum[number];

// Vecchio enum mantenuto per retrocompatibilità
export const contactTypeEnum = ["lead", "cliente", "non_in_target"] as const;
export type ContactType = typeof contactTypeEnum[number];

// Enum per provenienza contatto
export const sourceEnum = [
  "Facebook", "Instagram", "Google", "LinkedIn", "Passaparola", 
  "Newsletter", "CAF", "Cartellonistica", "Mondo Appalti", 
  "Facebook Ads", "Instagram Ads", "Google Ads"
] as const;
export type ContactSource = typeof sourceEnum[number];

// Enum per tipo appalto (PRIVATO vs PUBBLICO)
export const workTypeEnum = ["PRIVATE", "PUBLIC"] as const;
export type WorkType = typeof workTypeEnum[number];

// Enum per motivazione opportunità persa
export const lostReasonEnum = ["PRICE_HIGH", "TIMING", "LOST_TO_COMPETITOR", "NOT_IN_TARGET", "NO_RESPONSE", "OTHER"] as const;
export type LostReason = typeof lostReasonEnum[number];

// Enum per qualità cantiere (quando opportunità vinta)
export const siteQualityEnum = ["PHOTO_VIDEO", "PHOTO_ONLY", "NOTHING"] as const;
export type SiteQuality = typeof siteQualityEnum[number];

// Enum per unità di misura articoli (Preventivatore)
export const unitTypeEnum = ["MQ", "ML", "CAD", "NUM", "MC", "PZ", "MT"] as const;
export type UnitType = typeof unitTypeEnum[number];

// Enum per logica di pricing articoli (LABOR e EXTRA rimossi - usare SERVICE)
export const pricingLogicEnum = ["RENTAL", "DOCUMENT", "TRANSPORT", "SERVICE", "HOIST", "SALE"] as const;
export type PricingLogic = typeof pricingLogicEnum[number];
// Legacy types mantenuti per backward compatibility con dati esistenti
export type PricingLogicLegacy = PricingLogic | "LABOR" | "EXTRA";

// Enum per categoria articoli (distinzione materiale proprio vs cliente)
export const articleCategoryEnum = ["SCAFFOLDING", "SCAFFOLDING_LABOR", "TRANSPORT", "DOCUMENT", "SERVICE", "HANDLING", "TRASFERTA", "HOIST"] as const;
export type ArticleCategory = typeof articleCategoryEnum[number];

// Enum per aliquote IVA
export const vatRateEnum = ["22", "10", "4", "RC"] as const;
export type VatRate = typeof vatRateEnum[number];

// Tipo per dati pricing montacarichi (HOIST)
// Struttura per gestire prezzi basamento, elevazione, sbarco/sbalzo con variazione per durata
export interface HoistPricingTier {
  months_1_2: number;
  months_3_5: number;
  months_6_8: number;
  months_9_plus: number;
}

export interface HoistPricingData {
  // Costo noleggio basamento (€/cad/mese)
  basamento: HoistPricingTier;
  // Costo noleggio per metro di elevazione (€/mt/mese)
  elevazione: HoistPricingTier;
  // Costo noleggio cancello sbarco (€/cad/mese) - per PM-M10
  sbarco?: HoistPricingTier;
  // Costo noleggio sbalzo verso parete (€/mq/mese) - per P26
  sbalzo?: HoistPricingTier;
}

// Tipo per dati manodopera montacarichi
export interface HoistInstallationData {
  // Costo base montaggio basamento (€/cad)
  basamentoMount: number;
  // Costo base smontaggio basamento (€/cad)
  basamentoDismount: number;
  // Costo aggiuntivo per metro di altezza - montaggio (€/mt)
  elevazioneMountPerMeter: number;
  // Costo aggiuntivo per metro di altezza - smontaggio (€/mt)
  elevazioneDismountPerMeter: number;
  // Costo cancello sbarco (€/cad) - per PM-M10
  sbarcoMount?: number;
  sbarcoDismount?: number;
  // Costo sbalzo (€/mq) - per P26
  sbalzoMount?: number;
  sbalzoDismount?: number;
}

// Tipo per dati trasferta (costo1 e costo2 con label configurabili)
export interface TrasfertaData {
  costo1Label: string;      // es. "Costo auto" o "Costo Hotel"
  costo1Value: number;      // €/km o €/Persona
  costo1Unit: string;       // es. "€/Km" o "€/Persona"
  costo2Label: string;      // es. "Costo a persona" o "Costo extra personale"
  costo2Value: number;      // €/km o €/Persona
  costo2Unit: string;       // es. "€/Km" o "€/Persona"
}

// Enum per stato preventivo
export const quoteStatusEnum = ["DRAFT", "SENT", "ACCEPTED", "REJECTED"] as const;
export type QuoteStatus = typeof quoteStatusEnum[number];

// Enum per fase riga preventivo (6 fasi Excel-style)
export const quotePhaseEnum = [
  "DOCUMENTI",                // POS, Relazione Calcolo
  "TRASPORTO_ANDATA",         // Trasporto all'andata
  "MOVIMENTAZIONE_MAGAZZINO", // Movimentazione logistica magazzino (auto-inserita se RENTAL presente)
  "MONTAGGIO",                // Manodopera montaggio
  "NOLEGGIO",                 // Canone noleggio mensile
  "SMONTAGGIO",               // Manodopera smontaggio
  "TRASPORTO_RITORNO"         // Trasporto al ritorno
] as const;
export type QuotePhase = typeof quotePhaseEnum[number];

// Tipo per parametri globali preventivo
export interface QuoteGlobalParams {
  durationMonths: number;
  distanceKm: number;
  logisticsDifficulty: "LOW" | "MEDIUM" | "HIGH";
  // Aliquota IVA di default per il preventivo (22%, 10%, 4%, RC)
  vatRateDefault?: VatRate;
  // Voci "A corpo" - articoli con totale editabile manualmente
  aCorpoItems?: Array<{
    articleId: string;
    variantIndex?: number;
    notes?: string;
    quantity: number;
    totalPrice: number;
  }>;
  // Override prezzo POS/Pimus manuale
  posManualPrice?: number;
  posManualEnabled?: boolean;
  // ML rete antipolvere (NOL-010) per calcolo prezzo a scaglioni SRV-004
  reteAntipolvereQtyML?: number;
  // Servizi opzionali selezionati (array di ID servizio)
  optionalServices?: string[];
  // Testi personalizzati per servizi opzionali { id: testo }
  optionalServicesTexts?: Record<string, string>;
  // Trasporti Lagunari Venezia
  lagunariVehicleIndex?: number;
  lagunariNumeroCamion?: number;
  lagunariBarcaVariantIndex?: number;
  lagunariNumeroBarca?: number;
}

// Tipo per sconti per singola voce (item-level)
export interface QuoteItemDiscount {
  phase: QuotePhase;
  itemIndex: number;  // Indice dell'item nella fase
  discountPercent: number;  // Sconto percentuale (0-100)
}

// Tipo legacy per sconti per fase (mantenuto per compatibilità)
export interface QuotePhaseDiscount {
  phase: QuotePhase;
  discountPercent?: number;  // Sconto percentuale (0-100)
  discountAmount?: number;   // Sconto importo fisso in €
}

export interface QuoteDiscounts {
  itemDiscounts?: QuoteItemDiscount[];  // Sconti per singola voce
  phaseDiscounts?: QuotePhaseDiscount[];  // Sconti per fase (legacy)
  globalDiscountPercent?: number;  // Sconto globale finale
}

// Tipo per zona movimentazione (logistica cantiere)
export interface HandlingZone {
  label: string;           // Es. "Zona A", "Ingresso secondario"
  quantity: number;        // Quantità mq/mc da movimentare
  distHoriz: number;       // Distanza orizzontale in metri
  distVert: number;        // Distanza verticale in metri
  type: "GROUND" | "HEIGHT";  // A terra o in quota
}

// Tipo per dati movimentazione nel preventivo
export interface HandlingData {
  enabled: boolean;
  zones: HandlingZone[];
  saltareti: {
    included: boolean;
    quantity: number;
  };
  extraPrice: number;      // Costo una tantum manuale
}

// Tipo per parametri movimentazione (coefficienti di calcolo)
export interface HandlingParamsData {
  k_terra_orizz: number;   // Costo per mq/mc per metro orizzontale a terra
  k_terra_vert: number;    // Costo per mq/mc per metro verticale a terra
  k_quota_orizz: number;   // Costo per mq/mc per metro orizzontale in quota
  k_quota_vert: number;    // Costo per mq/mc per metro verticale in quota
  free_meters_limit: number; // Primi N metri orizzontali gratis
}

// Tipi per pricingData strutturati per categoria
export interface RentalPricingData {
  months_1_2: number;      // Prezzo per 1-2 mesi
  months_3_5: number;      // Prezzo per 3-5 mesi
  months_6_8: number;      // Prezzo per 6-8 mesi
  months_9_plus: number;   // Prezzo per 9+ mesi
}

export interface LaborPricingData {
  mount: number;           // Prezzo montaggio
  dismount: number;        // Prezzo smontaggio
}

export interface InstallationOption {
  label: string;           // Es. "Da terra", "Sopra tetti", "Sospeso"
  mount: number;           // Prezzo montaggio per unità
  dismount: number;        // Prezzo smontaggio per unità
  isDefault?: boolean;     // Opzione predefinita
}

export type InstallationData = InstallationOption[];

// Variante/Modello di un articolo (es. diversi modelli di montacarichi)
export interface ArticleVariant {
  label: string;             // Nome variante (es. "200kg - 24m")
  description: string;       // Descrizione dettagliata con specifiche tecniche
  rental?: {                 // Prezzi noleggio per le 4 fasce (opzionale)
    months_1_2: number;
    months_3_5: number;
    months_6_8: number;
    months_9_plus: number;
  };
  installation?: {           // Costi manodopera (opzionale)
    mount: number;
    dismount: number;
  };
  supportsCesta?: boolean;   // Se true, permette opzione "con cesta"
  cestaPrice?: number;       // Legacy: prezzo unico cesta (backward compatibility)
  cestaMountPrice?: number;  // Prezzo aggiuntivo cesta per montaggio (€/unità)
  cestaDismountPrice?: number; // Prezzo aggiuntivo cesta per smontaggio (€/unità)
  isDefault?: boolean;       // Variante predefinita
  
  // ===== HOIST (Ponteggi Elettrici) specific fields =====
  hoistType?: "PM-M10" | "P26";  // Tipo per logica sbarco/sbalzo
  hoistRental?: HoistPricingData;       // Prezzi noleggio componenti HOIST
  hoistInstallation?: HoistInstallationData;  // Costi manodopera HOIST
  
  // ===== Campi "Servizio Aggiuntivo" per preventivo =====
  isAdditionalService?: boolean;           // Se true, questa variante appare nella sezione "Altri Servizi" del preventivo
  serviceDescriptionMounting?: string;     // Testo per la riga montaggio/smontaggio in "Altri Servizi"
  serviceDescriptionRental?: string;       // Testo per la riga noleggio in "Altri Servizi"
  serviceMountingApplyTrasferta?: boolean; // Se true, il prezzo montaggio viene moltiplicato per il coefficiente trasferta
  quoteDescription?: string;              // Testo che appare nella tabella "Lavorazione" del preventivo
  price?: number;  // Prezzo fisso per varianti a prezzo autonomo (es. barca lagunare)
}

export type ArticleVariantsData = ArticleVariant[];

export interface TransportVehicle {
  name: string;            // Nome veicolo (es. "Furgone DAILY")
  fix: number;             // Prezzo fisso viaggio
  perKm: number;           // Prezzo per km
  description?: string;    // Descrizione veicolo per PDF
  banchinaCost?: number;     // €/camion/direzione (scarico banchina — andata O ritorno)
  ferryLidoCost?: number;    // €/camion/direzione (ferry all-inclusive — Lido)
  ferryPellesCost?: number;  // €/camion/direzione (ferry all-inclusive — Pellestrina)
}

export interface TransportPricingData {
  vehicles: TransportVehicle[];  // Lista veicoli disponibili
}

export interface DocumentOption {
  name: string;            // Nome opzione (es. "Fino a 1000 mq")
  price: number;           // Prezzo opzione
}

export interface DocumentPricingData {
  options: DocumentOption[];  // Lista opzioni documento
}

export interface SimplePricingData {
  price: number;           // Prezzo singolo per EXTRA/SERVICE
}

export interface SalePricingData {
  price: number;           // Prezzo per unità di vendita (es. €90 per rotolo)
  unitCoverage?: number;   // Copertura per unità in mq (es. 200 mq per rotolo). Se definito, quantità vendita = ceil(mq / unitCoverage)
}

// Tipo per dati montacarichi (dettagli tecnici ponteggio)
export interface MontacarichiData {
  tipologia: string;       // Tipologia montacarichi
  altezzaMt: number;       // Altezza in metri
  numeroSbarchi: number;   // Numero sbarchi (max 150)
  tipoSbarchi: string;     // 'SCORREVOLE_DX' | 'SCORREVOLE_SX' | 'SCORREVOLE_INDIFF' | 'ANTA' | 'SOFFIETTO' | 'INDIFFERENTE'
}

export type PricingData = RentalPricingData | LaborPricingData | TransportPricingData | DocumentPricingData | SimplePricingData | SalePricingData | HandlingParamsData;

// Tabella Leads (Contatti) - Contatti/Clienti con isolamento multi-tenant
export const leads = pgTable("leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Tipo entità: AZIENDA o PRIVATO
  entityType: text("entity_type").$type<EntityType>().notNull().default("COMPANY"),
  // Classificazione commerciale (lead potenziale vs cliente acquisito)
  type: text("type").$type<ContactType>().notNull().default("lead"),
  
  // Dati anagrafici (nome per aziende = Ragione Sociale, firstName/lastName per privati)
  name: text("name"), // Ragione Sociale per COMPANY
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  
  // Indirizzo
  address: text("address"),
  city: text("city"),
  zipCode: text("zip_code"),
  province: text("province"),
  country: text("country").default("Italia"),
  
  // Dati fiscali
  vatNumber: text("vat_number"), // P.IVA
  fiscalCode: text("fiscal_code"), // Codice Fiscale
  companyNature: text("company_nature").$type<"PRIVATE" | "PUBLIC">().default("PRIVATE"), // Azienda Privata o Pubblica
  sdiCode: text("sdi_code"), // Codice SDI (per aziende private)
  ipaCode: text("ipa_code"), // Codice IPA (per aziende pubbliche)
  pecEmail: text("pec_email"), // PEC
  
  // Provenienza
  source: text("source").$type<ContactSource>(),
  
  // Modalità di pagamento
  paymentMethodId: varchar("payment_method_id"),
  
  // Affidabilità commerciale
  reliability: text("reliability").$type<"AFFIDABILE" | "POCO_AFFIDABILE" | "NON_AFFIDABILE">().default("AFFIDABILE"),
  
  // Brochure inviata
  brochureSent: boolean("brochure_sent").default(false),
  
  // Note e metadati
  notes: text("notes"),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  assignedToUserId: varchar("assigned_to_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("leads_company_id_idx").on(table.companyId),
  index("leads_assigned_to_user_id_idx").on(table.assignedToUserId),
  index("leads_type_idx").on(table.type),
  index("leads_entity_type_idx").on(table.entityType),
]);

// Tipo per il riepilogo opportunità collegato a un lead (campo calcolato, non stored)
export interface OpportunitySummary {
  total: number;
  wonCount: number;
  lostCount: number;
  activeCount: number;
}

// Lead arricchito con dati calcolati dall'endpoint GET /api/leads
export type LeadWithSummary = typeof leads.$inferSelect & {
  firstReferentName: string | null;
  opportunitySummary: OpportunitySummary;
};

// Tabella ContactReferents - Referenti aziendali (per contatti COMPANY)
export const contactReferents = pgTable("contact_referents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  role: text("role"),
  contactId: varchar("contact_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("contact_referents_contact_id_idx").on(table.contactId),
]);

// Tabella Opportunities - Cantieri/Preventivi collegati ai Lead
export const opportunities = pgTable("opportunities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  value: numeric("value", { precision: 12, scale: 2 }),
  stageId: varchar("stage_id").references(() => pipelineStages.id),
  leadId: varchar("lead_id").notNull().references(() => leads.id),
  referentId: varchar("referent_id").references(() => contactReferents.id),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  assignedToUserId: varchar("assigned_to_user_id").references(() => users.id),
  
  // Tipo appalto
  workType: text("work_type").$type<WorkType>().default("PRIVATE"),
  
  // Indirizzo cantiere
  siteAddress: text("site_address"),
  siteCity: text("site_city"),
  siteZip: text("site_zip"),
  siteProvince: text("site_province"),
  mapsLink: text("maps_link"),
  
  // Distanza cantiere (km) e squadra in zona
  siteDistanceKm: integer("site_distance_km"),
  siteSquadraInZonaKm: integer("site_squadra_in_zona_km"),
  veniceZone: text("venice_zone"),
  
  // Coordinate GPS per mappa cantieri
  siteLatitude: numeric("site_latitude", { precision: 10, scale: 7 }),
  siteLongitude: numeric("site_longitude", { precision: 10, scale: 7 }),
  
  // Motivazione persa
  lostReason: text("lost_reason").$type<LostReason>(),
  
  // Qualità cantiere (quando vinto)
  siteQuality: text("site_quality").$type<SiteQuality>(),
  
  // Dettagli tecnici - Trasporti (solo per Noleggio + Manodopera)
  transpallet: text("transpallet"), // 'NO' | 'SI_NOSTRO' | 'SI_CLIENTE'
  posizCamion: text("posiz_camion"), // 'FUORI' | 'DENTRO'
  puoScaricare: text("puo_scaricare"), // 'DURANTE_LAVORI' | 'SENZA_SQUADRA' | 'SENZA_SQUADRA_PLUS' | 'DA_VERIFICARE' | 'ORARI_PRECISI'
  luogoScarico: text("luogo_scarico").array(), // multi-select array
  ritiroEsubero: boolean("ritiro_esubero"),
  cartelliStradali: text("cartelli_stradali"), // 'NO' | 'SI_NOSTRO' | 'SI_CLIENTE'
  permessiViabilita: text("permessi_viabilita"), // 'NO' | 'SI_NOSTRO' | 'SI_CLIENTE'
  permessoSosta: text("permesso_sosta"), // 'NO' | 'SI_NOSTRO' | 'SI_CLIENTE'
  
  // Dettagli tecnici - Optional Ponteggio
  ponteggioPerArray: text("ponteggio_per").array(), // multi-select: TETTO, FACCIATA, NUOVA_COSTR, TERRAZZE, CANNE_FUMARIE, GRONDAIE, PIANO_CARICO, CASTELLO_RISALITA, RISTRUTTURAZIONE, FINESTRE_SCURI, DEMOLIZIONE, ALTRO
  gruCantiere: text("gru_cantiere"), // 'NO' | 'SI_NOSTRO' | 'SI_CLIENTE'
  luciSegnalazione: text("luci_segnalazione"), // 'NO' | 'SI_NOSTRO' | 'SI_CLIENTE'
  aCaricoClienteArray: text("a_carico_cliente").array(), // multi-select: RIMOZ_PENSILINE, RIMOZ_TENDE, PUNTELLAMENTI, ISOLAMENTO_CAVI, PERM_OCCUPAZIONE, LEGNAME, ASSITO, PARAPETTI_TETTO, APERTURA_RETI, ALTRO
  orariLavoro: text("orari_lavoro"), // 'STANDARD' | 'ORARI_PRESTABILITI' | 'SOLO_FESTIVI' | 'NO_MERCATO' | 'NO_SABATO' | 'DA_VERIFICARE'
  ancoraggi: text("ancoraggi"), // 'OCCHIOLI_CORTI' | 'OCCHIOLI_CAPPOTTO_X' (con valore numerico) | 'SPINTE' | 'A_CRAVATTA' | 'ZAVORRE' | 'PUNTONI' | 'NO_ANCORAGGI' | 'VARIABILE' | 'ALTRO'
  ponteggioPerAltroNote: text("ponteggio_per_altro_note"),
  aCaricoClienteAltroNote: text("a_carico_cliente_altro_note"),
  ancoraggiAltroNote: text("ancoraggi_altro_note"),
  maestranze: text("maestranze"), // 'SOLO_DIPENDENTI' | 'DIPENDENTI_PERM' | 'DIPENDENTI_ARTIGIANI' | 'DIP_ART_PERM' | 'PARTNERS' | 'DA_VERIFICARE'
  montacarichi: jsonb("montacarichi").$type<MontacarichiData>(), // { tipologia, altezzaMt, numeroSbarchi, tipoSbarchi }
  
  // Date indicative lavori (compilate dal venditore prima di chiudere come vinta)
  estimatedStartDate: timestamp("estimated_start_date"),
  estimatedEndDate: timestamp("estimated_end_date"),
  
  // Sopralluogo fatto (da step 3 preventivatore)
  sopralluogoFatto: boolean("sopralluogo_fatto"),
  
  expectedCloseDate: timestamp("expected_close_date"),
  probability: integer("probability").default(50),

  // Timestamp precisi per vinto/perso (immutabili dopo essere stati impostati)
  wonAt: timestamp("won_at"),
  lostAt: timestamp("lost_at"),

  // Campi per gestione notifica "Preventivo Inviato da 60 giorni"
  quoteSentAt: timestamp("quote_sent_at"),
  quoteReminderSnoozedUntil: timestamp("quote_reminder_snoozed_until"),

  // Campi per gestione notifica programmata foto/video cantiere (-10 giorni da inizio)
  photoNotificationScheduledAt: timestamp("photo_notification_scheduled_at"),
  photoNotificationSentAt: timestamp("photo_notification_sent_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("opportunities_company_id_idx").on(table.companyId),
  index("opportunities_lead_id_idx").on(table.leadId),
  index("opportunities_stage_id_idx").on(table.stageId),
  index("opportunities_assigned_to_user_id_idx").on(table.assignedToUserId),
  index("opportunities_referent_id_idx").on(table.referentId),
]);

// Tabella ActivityLogs - Log delle attività per audit trail
export const activityLogs = pgTable("activity_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  userId: varchar("user_id").references(() => users.id),
  entityType: text("entity_type").notNull(), // 'lead' | 'opportunity'
  entityId: varchar("entity_id").notNull(),
  action: text("action").notNull(), // 'created' | 'updated' | 'deleted' | 'moved'
  details: jsonb("details"), // { field: 'email', oldValue: 'x', newValue: 'y' } o { fromStage: 'X', toStage: 'Y' }
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("activity_logs_company_id_idx").on(table.companyId),
  index("activity_logs_entity_type_entity_id_idx").on(table.entityType, table.entityId),
  index("activity_logs_user_id_idx").on(table.userId),
  index("activity_logs_created_at_idx").on(table.createdAt),
]);

// Tabella per associare utenti a companies (multi-tenant)
// Constraint UNIQUE su userId per garantire un solo tenant per utente
export const userCompanies = pgTable("user_companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  proxitPriority: integer("proxit_priority"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("user_companies_company_id_idx").on(table.companyId),
]);

// Tabella presenza Proxit - traccia chi è attivo sulla pagina
export const proxitPresence = pgTable("proxit_presence", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  sessionId: varchar("session_id").notNull(),
  lastHeartbeat: timestamp("last_heartbeat").notNull().defaultNow(),
}, (table) => [
  index("proxit_presence_company_id_idx").on(table.companyId),
  index("proxit_presence_user_id_idx").on(table.userId),
  uniqueIndex("proxit_presence_session_uniq").on(table.userId, table.companyId, table.sessionId),
]);

// Tabella Invites - Inviti utenti con token magic link
export const invites = pgTable("invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull(),
  role: varchar("role").$type<UserRole>().notNull(),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  token: varchar("token").unique().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("invites_token_idx").on(table.token),
  index("invites_company_id_idx").on(table.companyId),
  index("invites_expires_at_idx").on(table.expiresAt),
]);

// Tabella Password Reset Tokens - Token per reset password dall'admin
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  token: varchar("token").unique().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("password_reset_tokens_token_idx").on(table.token),
  index("password_reset_tokens_user_id_idx").on(table.userId),
]);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

// Tabella Articles - Listino articoli per Preventivatore
export const articles = pgTable("articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  code: text("code").notNull(), // Codice articolo (es. ART-001)
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").$type<ArticleCategory>().notNull().default("SCAFFOLDING"), // Categoria articolo
  unitType: text("unit_type").$type<UnitType>().notNull().default("MQ"),
  pricingLogic: text("pricing_logic").$type<PricingLogicLegacy>().notNull().default("RENTAL"),
  basePrice: numeric("base_price", { precision: 12, scale: 2 }).notNull().default("0"),
  pricingData: jsonb("pricing_data").$type<PricingData>(), // Dati strutturati per pricing complesso
  installationData: jsonb("installation_data").$type<InstallationData>(), // Opzioni installazione per RENTAL
  warehouseCostPerUnit: numeric("warehouse_cost_per_unit", { precision: 12, scale: 4 }), // Costo magazzino per unità (€/mq, €/ml, €/cad)
  variantsData: jsonb("variants_data").$type<ArticleVariantsData>(), // Varianti/modelli articolo (es. diversi montacarichi)
  trasfertaData: jsonb("trasferta_data").$type<TrasfertaData>(), // Dati trasferta per categoria TRASFERTA
  hoistInstallationData: jsonb("hoist_installation_data").$type<HoistInstallationData>(), // Dati manodopera per montacarichi (HOIST)
  isChecklistItem: integer("is_checklist_item").notNull().default(0), // 0 = false, 1 = true
  checklistOrder: integer("checklist_order").default(0),
  isActive: integer("is_active").notNull().default(1), // 0 = false, 1 = true
  // Campi "Servizio Aggiuntivo" per preventivo (articoli senza varianti)
  quoteDescription: text("quote_description"), // Testo per tabella "Lavorazione" nel preventivo
  isAdditionalService: integer("is_additional_service").notNull().default(0), // 0 = false, 1 = true
  serviceDescriptionMounting: text("service_description_mounting"), // Testo montaggio/smontaggio per "Altri Servizi"
  serviceDescriptionRental: text("service_description_rental"), // Testo noleggio per "Altri Servizi"
  serviceMountingApplyTrasferta: integer("service_mounting_apply_trasferta").notNull().default(0), // 0 = false, 1 = true
  serviceUnitMounting: text("service_unit_mounting"), // Unità di misura override per voce mounting in "Altri Servizi" (es. "MQ" per posa rete)
  displayOrder: integer("display_order").notNull().default(0), // Ordine di visualizzazione nel preventivo
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("articles_company_id_idx").on(table.companyId),
  index("articles_is_checklist_item_idx").on(table.isChecklistItem),
  index("articles_checklist_order_idx").on(table.checklistOrder),
  index("articles_code_idx").on(table.code),
  index("articles_display_order_idx").on(table.displayOrder),
]);

// Tabella Quotes - Preventivi
export const quotes = pgTable("quotes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  opportunityId: varchar("opportunity_id").notNull().references(() => opportunities.id),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  number: text("number").notNull(), // Es. "PREV-2024-001"
  status: text("status").$type<QuoteStatus>().notNull().default("DRAFT"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  globalParams: jsonb("global_params").$type<QuoteGlobalParams>().notNull(),
  discounts: jsonb("discounts").$type<QuoteDiscounts>(), // Sconti per fase e globale
  handlingData: jsonb("handling_data").$type<HandlingData>(), // Dati movimentazione cantiere
  pdfData: jsonb("pdf_data"), // Dati completi per rendering PDF (totals, clausole, ecc.)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("quotes_opportunity_id_idx").on(table.opportunityId),
  index("quotes_company_id_idx").on(table.companyId),
  index("quotes_status_idx").on(table.status),
  unique("quotes_company_id_number_unique").on(table.companyId, table.number),
]);

// Tabella QuoteItems - Righe preventivo
export const quoteItems = pgTable("quote_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteId: varchar("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
  articleId: varchar("article_id").notNull().references(() => articles.id),
  quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull().default("0"),
  phase: text("phase").$type<QuotePhase>(),
  priceSnapshot: jsonb("price_snapshot").$type<PricingData>(), // Copia esatta del pricingData al momento del salvataggio
  unitPriceApplied: numeric("unit_price_applied", { precision: 12, scale: 2 }).notNull().default("0"),
  totalRow: numeric("total_row", { precision: 12, scale: 2 }).notNull().default("0"),
  vatRate: text("vat_rate").$type<VatRate>(), // Override aliquota IVA per singola voce (null = usa default preventivo)
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("quote_items_quote_id_idx").on(table.quoteId),
  index("quote_items_article_id_idx").on(table.articleId),
  index("quote_items_phase_idx").on(table.phase),
]);

// Relazioni
export const companiesRelations = relations(companies, ({ many }) => ({
  leads: many(leads),
  opportunities: many(opportunities),
  userCompanies: many(userCompanies),
  pipelineStages: many(pipelineStages),
  articles: many(articles),
  quotes: many(quotes),
  projectStages: many(projectStages),
  projects: many(projects),
}));

export const articlesRelations = relations(articles, ({ one, many }) => ({
  company: one(companies, {
    fields: [articles.companyId],
    references: [companies.id],
  }),
  quoteItems: many(quoteItems),
}));

export const quotesRelations = relations(quotes, ({ one, many }) => ({
  opportunity: one(opportunities, {
    fields: [quotes.opportunityId],
    references: [opportunities.id],
  }),
  company: one(companies, {
    fields: [quotes.companyId],
    references: [companies.id],
  }),
  items: many(quoteItems),
}));

export const quoteItemsRelations = relations(quoteItems, ({ one }) => ({
  quote: one(quotes, {
    fields: [quoteItems.quoteId],
    references: [quotes.id],
  }),
  article: one(articles, {
    fields: [quoteItems.articleId],
    references: [articles.id],
  }),
}));

export const pipelineStagesRelations = relations(pipelineStages, ({ one, many }) => ({
  company: one(companies, {
    fields: [pipelineStages.companyId],
    references: [companies.id],
  }),
  opportunities: many(opportunities),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  company: one(companies, {
    fields: [leads.companyId],
    references: [companies.id],
  }),
  assignedToUser: one(users, {
    fields: [leads.assignedToUserId],
    references: [users.id],
  }),
  opportunities: many(opportunities),
  referents: many(contactReferents),
}));

export const contactReferentsRelations = relations(contactReferents, ({ one }) => ({
  contact: one(leads, {
    fields: [contactReferents.contactId],
    references: [leads.id],
  }),
}));

export const opportunitiesRelations = relations(opportunities, ({ one, many }) => ({
  lead: one(leads, {
    fields: [opportunities.leadId],
    references: [leads.id],
  }),
  referent: one(contactReferents, {
    fields: [opportunities.referentId],
    references: [contactReferents.id],
  }),
  company: one(companies, {
    fields: [opportunities.companyId],
    references: [companies.id],
  }),
  stage: one(pipelineStages, {
    fields: [opportunities.stageId],
    references: [pipelineStages.id],
  }),
  quotes: many(quotes),
  assignedToUser: one(users, {
    fields: [opportunities.assignedToUserId],
    references: [users.id],
  }),
}));

export const userCompaniesRelations = relations(userCompanies, ({ one }) => ({
  company: one(companies, {
    fields: [userCompanies.companyId],
    references: [companies.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  company: one(companies, {
    fields: [activityLogs.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

// Tabella ProjectStages - Fasi del workflow progetti per ogni azienda
export const projectStages = pgTable("project_stages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  order: integer("order").notNull().default(0),
  color: text("color").notNull().default("#4563FF"),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("project_stages_company_id_idx").on(table.companyId),
  index("project_stages_order_idx").on(table.order),
]);

// Tabella ExternalEngineers - Ingegneri esterni per RDC
export const externalEngineers = pgTable("external_engineers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("external_engineers_company_id_idx").on(table.companyId),
]);

export const insertExternalEngineerSchema = createInsertSchema(externalEngineers).omit({ id: true, createdAt: true });
export type ExternalEngineer = typeof externalEngineers.$inferSelect;
export type InsertExternalEngineer = z.infer<typeof insertExternalEngineerSchema>;

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  opportunityId: varchar("opportunity_id").notNull().references(() => opportunities.id),
  quoteId: varchar("quote_id").references(() => quotes.id),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  stageId: varchar("stage_id").references(() => projectStages.id),
  
  clientName: text("client_name").notNull(),
  siteAddress: text("site_address"),
  siteCity: text("site_city"),
  siteProvince: text("site_province"),
  siteZip: text("site_zip"),
  workType: text("work_type").$type<WorkType>().default("PRIVATE"),
  estimatedStartDate: timestamp("estimated_start_date"),
  estimatedEndDate: timestamp("estimated_end_date"),
  sopralluogoFatto: boolean("sopralluogo_fatto").default(false),
  
  assignedTechnicianId: varchar("assigned_technician_id").references(() => users.id),
  externalEngineerId: varchar("external_engineer_id").references(() => externalEngineers.id, { onDelete: "set null" }),
  priority: text("priority").default("MEDIA"),
  
  notes: text("notes"),
  checklist: jsonb("checklist").$type<{ id: string; label: string; checked: boolean }[]>(),
  cantiereStatusOverride: text("cantiere_status_override"),
  stageEnteredAt: timestamp("stage_entered_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("projects_company_id_idx").on(table.companyId),
  index("projects_opportunity_id_idx").on(table.opportunityId),
  index("projects_stage_id_idx").on(table.stageId),
  index("projects_assigned_technician_id_idx").on(table.assignedTechnicianId),
  index("projects_external_engineer_id_idx").on(table.externalEngineerId),
]);

// Tabella Project Tasks - Attività/task per il Gantt
export const projectTasks = pgTable("project_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  name: text("name").notNull(),
  description: text("description"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  progress: integer("progress").notNull().default(0),
  parentTaskId: varchar("parent_task_id"),
  dependencyTaskIds: text("dependency_task_ids").array(),
  assignedUserId: varchar("assigned_user_id").references(() => users.id),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("project_tasks_project_id_idx").on(table.projectId),
  index("project_tasks_company_id_idx").on(table.companyId),
  index("project_tasks_parent_task_id_idx").on(table.parentTaskId),
]);

// Relazioni ProjectTasks
export const projectTasksRelations = relations(projectTasks, ({ one }) => ({
  project: one(projects, {
    fields: [projectTasks.projectId],
    references: [projects.id],
  }),
  company: one(companies, {
    fields: [projectTasks.companyId],
    references: [companies.id],
  }),
  assignedUser: one(users, {
    fields: [projectTasks.assignedUserId],
    references: [users.id],
  }),
}));

// Relazioni ProjectStages
export const projectStagesRelations = relations(projectStages, ({ one, many }) => ({
  company: one(companies, {
    fields: [projectStages.companyId],
    references: [companies.id],
  }),
  projects: many(projects),
}));

// Relazioni Projects
export const projectsRelations = relations(projects, ({ one, many }) => ({
  opportunity: one(opportunities, {
    fields: [projects.opportunityId],
    references: [opportunities.id],
  }),
  quote: one(quotes, {
    fields: [projects.quoteId],
    references: [quotes.id],
  }),
  company: one(companies, {
    fields: [projects.companyId],
    references: [companies.id],
  }),
  stage: one(projectStages, {
    fields: [projects.stageId],
    references: [projectStages.id],
  }),
  assignedTechnician: one(users, {
    fields: [projects.assignedTechnicianId],
    references: [users.id],
  }),
  externalEngineer: one(externalEngineers, {
    fields: [projects.externalEngineerId],
    references: [externalEngineers.id],
  }),
  tasks: many(projectTasks),
}));

// ========== PROXIT - Pianificazione Operativa ==========

// Tabella Workers - Persone (capisquadra e componenti)
export const workers = pgTable("workers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  isCaposquadra: boolean("is_caposquadra").notNull().default(false),
  isInternal: boolean("is_internal").notNull().default(true),
  city: text("city"),
  defaultCapoId: varchar("default_capo_id").references((): AnyPgColumn => workers.id, { onDelete: "set null" }),
  color: text("color").notNull().default("#4563FF"),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("workers_company_id_idx").on(table.companyId),
]);

// Tabella Teams - Squadre di artigiani
export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  paese: text("paese"),
  color: text("color").notNull().default("#4563FF"),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("teams_company_id_idx").on(table.companyId),
]);

// Tabella Drivers - Autisti
export const drivers = pgTable("drivers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phone: text("phone"),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("drivers_company_id_idx").on(table.companyId),
]);

// Tabella Vehicles - Mezzi
export const vehicles = pgTable("vehicles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  plate: text("plate"),
  type: text("type"),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("vehicles_company_id_idx").on(table.companyId),
]);

// Tipo attività per le assegnazioni giornaliere
export type ActivityType = "MONTAGGIO" | "SMONTAGGIO" | "MONTAGGIO_SMONTAGGIO" | "ECONOMIA" | "CONSEGNA" | "RITIRO" | "CONSEGNA_COMBINATO" | "RITIRO_COMBINATO" | "ESUBERO" | "ESUBERO_COMBINATO" | "MANUTENZIONE" | "INTEGRAZIONE" | "INTEGRAZIONE_COMBINATO" | "FERIE_PIOGGIA_VARIE";

// Tabella TeamMembers - Componenti delle squadre
export const teamMembers = pgTable("team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("team_members_team_id_idx").on(table.teamId),
  index("team_members_company_id_idx").on(table.companyId),
]);

// Tabella DailyAssignments - Assegnazioni giornaliere (righe della griglia Proxit)
export const dailyAssignments = pgTable("daily_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  projectId: varchar("project_id").references(() => projects.id),
  date: timestamp("date").notNull(),
  endDate: timestamp("end_date"),
  activityType: text("activity_type").$type<ActivityType>().notNull().default("MONTAGGIO"),
  clientName: text("client_name"),
  siteCity: text("site_city"),
  siteProvince: text("site_province"),
  siteAddress: text("site_address"),
  scheduledTime: text("scheduled_time"),
  driverId: varchar("driver_id").references(() => drivers.id),
  vehicleId: varchar("vehicle_id").references(() => vehicles.id),
  teamIds: text("team_ids").array(),
  assemblerCount: integer("assembler_count"),
  notes: text("notes"),
  gridNote: text("grid_note"),
  gridNoteColor: text("grid_note_color"),
  deliveryType: text("delivery_type"),
  memberAdjustments: jsonb("member_adjustments").$type<Array<{ memberId: string; action: "remove" | "move" | "add"; toTeamId?: string; date?: string }>>(),
  workerAssignments: jsonb("worker_assignments").$type<Record<string, Record<string, string[]>>>(),
  timeSlot: text("time_slot").notNull().default("FULL_DAY"),
  endDayTimeSlot: text("end_day_time_slot").notNull().default("FULL_DAY"),
  status: text("status").notNull().default("PIANIFICATA"),
  isDraft: boolean("is_draft").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  prePadding: integer("pre_padding").notNull().default(0),
  externalWorkerCounts: jsonb("external_worker_counts").$type<Record<string, Record<string, number>>>(),
  externalTeamContacted: jsonb("external_team_contacted").$type<Record<string, Record<string, boolean>>>(),
  teamDepartureTimes: jsonb("team_departure_times").$type<Record<string, Record<string, string>>>(),
  teamFreeNumbers: jsonb("team_free_numbers").$type<Record<string, Record<string, number>>>(),
  teamNotes: jsonb("team_notes").$type<Record<string, Record<string, string>>>(),
  teamNoteColors: jsonb("team_note_colors").$type<Record<string, Record<string, string>>>(),
  workingDays: integer("working_days").array().notNull().default([1, 2, 3, 4, 5]),
  materialType: text("material_type"),
  materialQuantity: integer("material_quantity"),
  materials: jsonb("materials").$type<Array<{ type: string; quantity: number }>>(),
  chi: text("chi"),
  chiColor: text("chi_color"),
  cosa: text("cosa"),
  cosaColor: text("cosa_color"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("daily_assignments_company_id_idx").on(table.companyId),
  index("daily_assignments_project_id_idx").on(table.projectId),
  index("daily_assignments_date_idx").on(table.date),
  index("daily_assignments_driver_id_idx").on(table.driverId),
]);

// Tabella WarehouseBalances - Saldi magazzino (VILLA, PL, EP) per azienda
export const warehouseBalances = pgTable("warehouse_balances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  warehouseType: text("warehouse_type").$type<"VILLA" | "PL" | "EP">().notNull(),
  date: timestamp("date"),
  value: numeric("value", { precision: 12, scale: 2 }).notNull().default("0"),
}, (table) => [
  index("warehouse_balances_company_id_idx").on(table.companyId),
]);

export const insertWarehouseBalanceSchema = createInsertSchema(warehouseBalances).omit({
  id: true,
});
export type InsertWarehouseBalance = z.infer<typeof insertWarehouseBalanceSchema>;
export type WarehouseBalance = typeof warehouseBalances.$inferSelect;

// Relazioni Proxit
export const workersRelations = relations(workers, ({ one }) => ({
  company: one(companies, { fields: [workers.companyId], references: [companies.id] }),
}));

export const teamsRelations = relations(teams, ({ one }) => ({
  company: one(companies, { fields: [teams.companyId], references: [companies.id] }),
}));

export const driversRelations = relations(drivers, ({ one }) => ({
  company: one(companies, { fields: [drivers.companyId], references: [companies.id] }),
}));

export const vehiclesRelations = relations(vehicles, ({ one }) => ({
  company: one(companies, { fields: [vehicles.companyId], references: [companies.id] }),
}));

export const dailyAssignmentsRelations = relations(dailyAssignments, ({ one }) => ({
  company: one(companies, { fields: [dailyAssignments.companyId], references: [companies.id] }),
  project: one(projects, { fields: [dailyAssignments.projectId], references: [projects.id] }),
  driver: one(drivers, { fields: [dailyAssignments.driverId], references: [drivers.id] }),
  vehicle: one(vehicles, { fields: [dailyAssignments.vehicleId], references: [vehicles.id] }),
}));

// Schema di validazione per inserimento
export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
});

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserCompanySchema = createInsertSchema(userCompanies).omit({
  id: true,
  createdAt: true,
});

export const insertPipelineStageSchema = createInsertSchema(pipelineStages).omit({
  id: true,
  createdAt: true,
});

export const insertOpportunitySchema = createInsertSchema(opportunities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  photoNotificationScheduledAt: true,
  photoNotificationSentAt: true,
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({
  id: true,
  createdAt: true,
});

export const insertInviteSchema = createInsertSchema(invites).omit({
  id: true,
  createdAt: true,
});

export const insertContactReferentSchema = createInsertSchema(contactReferents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertArticleSchema = createInsertSchema(articles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertQuoteSchema = createInsertSchema(quotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertQuoteItemSchema = createInsertSchema(quoteItems).omit({
  id: true,
  createdAt: true,
});

export const insertProjectStageSchema = createInsertSchema(projectStages).omit({
  id: true,
  createdAt: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProjectTaskSchema = createInsertSchema(projectTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Tipi TypeScript
export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;

export type Lead = typeof leads.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;

export type UserCompany = typeof userCompanies.$inferSelect;
export type InsertUserCompany = z.infer<typeof insertUserCompanySchema>;

export type PipelineStage = typeof pipelineStages.$inferSelect;
export type InsertPipelineStage = z.infer<typeof insertPipelineStageSchema>;

export type Opportunity = typeof opportunities.$inferSelect;
export type InsertOpportunity = z.infer<typeof insertOpportunitySchema>;

export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

export type Invite = typeof invites.$inferSelect;
export type InsertInvite = z.infer<typeof insertInviteSchema>;

export type ContactReferent = typeof contactReferents.$inferSelect;
export type InsertContactReferent = z.infer<typeof insertContactReferentSchema>;

export type Article = typeof articles.$inferSelect;
export type InsertArticle = z.infer<typeof insertArticleSchema>;

export type Quote = typeof quotes.$inferSelect;
export type InsertQuote = z.infer<typeof insertQuoteSchema>;

export type QuoteItem = typeof quoteItems.$inferSelect;
export type InsertQuoteItem = z.infer<typeof insertQuoteItemSchema>;

export type ProjectStage = typeof projectStages.$inferSelect;
export type InsertProjectStage = z.infer<typeof insertProjectStageSchema>;

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export type ProjectTask = typeof projectTasks.$inferSelect;
export type InsertProjectTask = z.infer<typeof insertProjectTaskSchema>;

export const insertWorkerSchema = createInsertSchema(workers).omit({ id: true, createdAt: true });
export const insertTeamSchema = createInsertSchema(teams).omit({ id: true, createdAt: true });
export const insertDriverSchema = createInsertSchema(drivers).omit({ id: true, createdAt: true });
export const insertVehicleSchema = createInsertSchema(vehicles).omit({ id: true, createdAt: true });
export const insertDailyAssignmentSchema = createInsertSchema(dailyAssignments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({ id: true, createdAt: true });

export type Worker = typeof workers.$inferSelect;
export type InsertWorker = z.infer<typeof insertWorkerSchema>;
export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Driver = typeof drivers.$inferSelect;
export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type DailyAssignment = typeof dailyAssignments.$inferSelect;
export type InsertDailyAssignment = z.infer<typeof insertDailyAssignmentSchema>;
export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;

export const creditsafeReports = pgTable("creditsafe_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  connectId: text("connect_id"),
  creditScore: integer("credit_score"),
  creditRating: text("credit_rating"),
  internationalScore: text("international_score"),
  contractLimit: integer("contract_limit"),
  contractLimitCurrency: text("contract_limit_currency").default("EUR"),
  incorporationDate: text("incorporation_date"),
  companyStatus: text("company_status"),
  revenue: jsonb("revenue").$type<{ year: number; value: number }[]>(),
  cashFlow: jsonb("cash_flow").$type<{ year: number; value: number }[]>(),
  profit: jsonb("profit").$type<{ year: number; value: number }[]>(),
  avgPaymentDays: jsonb("avg_payment_days").$type<{ year: number; value: number }[]>(),
  rawReport: jsonb("raw_report"),
  fetchedAt: timestamp("fetched_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("creditsafe_reports_lead_id_idx").on(table.leadId),
  index("creditsafe_reports_company_id_idx").on(table.companyId),
]);

export const insertCreditsafeReportSchema = createInsertSchema(creditsafeReports).omit({ id: true, createdAt: true, updatedAt: true });
export type CreditsafeReport = typeof creditsafeReports.$inferSelect;
export type InsertCreditsafeReport = z.infer<typeof insertCreditsafeReportSchema>;

// Tabella PaymentMethods - Modalità di pagamento per ogni azienda
export const paymentMethods = pgTable("payment_methods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("payment_methods_company_id_idx").on(table.companyId),
]);

export const insertPaymentMethodSchema = createInsertSchema(paymentMethods).omit({ id: true, createdAt: true });
export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type InsertPaymentMethod = z.infer<typeof insertPaymentMethodSchema>;

// Tabella LeadSources - Provenienze configurabili per ogni azienda
export const leadSources = pgTable("lead_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("lead_sources_company_id_idx").on(table.companyId),
]);

export const insertLeadSourceSchema = createInsertSchema(leadSources).omit({ id: true, createdAt: true });
export type LeadSource = typeof leadSources.$inferSelect;
export type InsertLeadSource = z.infer<typeof insertLeadSourceSchema>;

// Tabella Reminders - Promemoria per commerciali e team
export const reminders = pgTable("reminders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date").notNull(),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  leadId: varchar("lead_id").references(() => leads.id),
  opportunityId: varchar("opportunity_id").references(() => opportunities.id),
  userId: varchar("user_id").notNull(),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  isAutomatic: boolean("is_automatic").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("reminders_company_id_idx").on(table.companyId),
  index("reminders_user_id_idx").on(table.userId),
  index("reminders_due_date_idx").on(table.dueDate),
  index("reminders_lead_id_idx").on(table.leadId),
  index("reminders_opportunity_id_idx").on(table.opportunityId),
]);

export const insertReminderSchema = createInsertSchema(reminders).omit({ id: true, createdAt: true, completedAt: true });
export type Reminder = typeof reminders.$inferSelect;
export type InsertReminder = z.infer<typeof insertReminderSchema>;

// Tabella Billing Profiles - Profili di fatturazione per tipo appalto (Privato/Pubblico)
export const billingProfiles = pgTable("billing_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  profileType: text("profile_type").$type<"PRIVATE" | "PUBLIC">().notNull(),
  companyName: text("company_name").notNull(),
  vatNumber: text("vat_number"),
  fiscalCode: text("fiscal_code"),
  address: text("address"),
  city: text("city"),
  zip: text("zip"),
  province: text("province"),
  phone: text("phone"),
  email: text("email"),
  pec: text("pec"),
  sdiCode: text("sdi_code"),
  iban: text("iban"),
  shareCapital: text("share_capital"),
  logoHeaderPath: text("logo_header_path"),
  logoCoverPath: text("logo_cover_path"),
  logoCoverSmallPath: text("logo_cover_small_path"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("billing_profiles_company_id_idx").on(table.companyId),
]);

export const insertBillingProfileSchema = createInsertSchema(billingProfiles).omit({ id: true, createdAt: true, updatedAt: true });
export type BillingProfile = typeof billingProfiles.$inferSelect;
export type InsertBillingProfile = z.infer<typeof insertBillingProfileSchema>;

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  link: text("link"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("notifications_user_id_idx").on(table.userId),
  index("notifications_company_id_idx").on(table.companyId),
  index("notifications_is_read_idx").on(table.isRead),
]);

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type AppNotification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export const notificationTypes = [
  { type: "NEW_PROJECT", label: "Nuovi cantieri", description: "Quando un'opportunità viene vinta e si crea un nuovo progetto", roles: ["TECHNICIAN"] },
  { type: "PROJECT_CANCELLED", label: "Cantiere annullato", description: "Quando un'opportunità vinta viene riportata a persa e il progetto collegato viene eliminato", roles: ["TECHNICIAN"] },
  { type: "SITE_PHOTO", label: "Cantieri da foto", description: "Quando un cantiere è segnalato come bello da fotografare", roles: ["COMPANY_ADMIN", "SUPER_ADMIN"] },
  { type: "SITE_PHOTO_VIDEO", label: "Cantieri da foto + video", description: "Quando un cantiere è segnalato per foto e videointervista", roles: ["COMPANY_ADMIN", "SUPER_ADMIN"] },
  { type: "QUOTE_EXPIRING", label: "Preventivo in scadenza", description: "Quando un'opportunità è in 'Preventivo Inviato' da almeno 60 giorni senza aggiornamenti", roles: ["SALES_AGENT", "COMPANY_ADMIN"] },
  { type: "RDC_PENDING", label: "RDC in attesa", description: "Quando un progetto rimane nella fase con 'RDC' da almeno 3 giorni", roles: ["TECHNICIAN", "COMPANY_ADMIN", "SUPER_ADMIN"] },
  { type: "LEAD_CALL_REQUEST", label: "Contatto da chiamare", description: "Quando la segreteria segnala un nuovo contatto da richiamare", roles: ["SALES_AGENT", "COMPANY_ADMIN"] },
] as const;

export const notificationPreferences = pgTable("notification_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  notificationType: text("notification_type").notNull(),
  enabled: boolean("enabled").notNull().default(true),
}, (table) => [
  index("notification_preferences_user_id_idx").on(table.userId),
]);

export const insertNotificationPreferenceSchema = createInsertSchema(notificationPreferences).omit({ id: true });
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreference = z.infer<typeof insertNotificationPreferenceSchema>;

// Tabella ClauseOverrides - Testi personalizzati per le clausole dello Step 4
export const clauseOverrides = pgTable("clause_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  clauseId: text("clause_id").notNull(), // ID della clausola (es. "pont_facciata_copertura")
  text: text("text").notNull(),           // Testo personalizzato
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("clause_overrides_company_clause_unique").on(table.companyId, table.clauseId),
  index("clause_overrides_company_id_idx").on(table.companyId),
]);

export const insertClauseOverrideSchema = createInsertSchema(clauseOverrides).omit({ id: true, updatedAt: true });
export type ClauseOverride = typeof clauseOverrides.$inferSelect;
export type InsertClauseOverride = z.infer<typeof insertClauseOverrideSchema>;

// Tabella SalesTargets - Obiettivi mensili per venditore
export const salesTargets = pgTable("sales_targets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  month: integer("month").notNull(), // 1-12
  year: integer("year").notNull(),
  quoteTarget: numeric("quote_target", { precision: 12, scale: 2 }).notNull().default("0"),
  wonTarget: numeric("won_target", { precision: 12, scale: 2 }).notNull().default("0"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("sales_targets_unique").on(table.companyId, table.userId, table.month, table.year),
  index("sales_targets_company_id_idx").on(table.companyId),
  index("sales_targets_user_id_idx").on(table.userId),
]);

export const insertSalesTargetSchema = createInsertSchema(salesTargets).omit({ id: true, updatedAt: true });
export type SalesTarget = typeof salesTargets.$inferSelect;
export type InsertSalesTarget = z.infer<typeof insertSalesTargetSchema>;

// ========== SAL - Stato Avanzamento Lavori ==========

// Enum per stato SAL
export const salStatusEnum = ["BOZZA", "VERIFICATO", "INVIATO"] as const;
export type SalStatus = typeof salStatusEnum[number];

// Tabella sal_periods - Un record per cantiere per mese
export const salPeriods = pgTable("sal_periods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  period: text("period").notNull(), // "YYYY-MM"
  status: text("status").$type<SalStatus>().notNull().default("BOZZA"),
  notes: text("notes"),
  isFinalInvoice: boolean("is_final_invoice").notNull().default(false),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("sal_periods_company_id_idx").on(table.companyId),
  index("sal_periods_project_id_idx").on(table.projectId),
  index("sal_periods_period_idx").on(table.period),
  unique("sal_periods_project_period_unique").on(table.projectId, table.period),
]);

// Tabella sal_voci - Righe di fatturazione per ogni SAL
export const salVoci = pgTable("sal_voci", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  salPeriodId: varchar("sal_period_id").notNull().references(() => salPeriods.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull().default("1"),
  um: text("um").notNull().default("cad"),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  vatRate: text("vat_rate").$type<VatRate>().notNull().default("22"),
  phase: text("phase").notNull().default("NOLEGGIO"),
  sourceQuoteItemId: varchar("source_quote_item_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("sal_voci_sal_period_id_idx").on(table.salPeriodId),
  index("sal_voci_company_id_idx").on(table.companyId),
]);

export const insertSalPeriodSchema = createInsertSchema(salPeriods).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSalVoceSchema = createInsertSchema(salVoci).omit({ id: true, createdAt: true });

export type SalPeriod = typeof salPeriods.$inferSelect;
export type InsertSalPeriod = z.infer<typeof insertSalPeriodSchema>;
export type SalVoce = typeof salVoci.$inferSelect;
export type InsertSalVoce = z.infer<typeof insertSalVoceSchema>;

// ============ CATALOGO: MATERIE PRIME E PRODOTTI FINITI ============
// Tabelle globali condivise tra tutte le aziende (no companyId)

export const rawMaterials = pgTable("raw_materials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  uomPurchase: text("uom_purchase").notNull(),
  unitCost: numeric("unit_cost", { precision: 12, scale: 4 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  rawMaterialId: varchar("raw_material_id").notNull().references(() => rawMaterials.id, { onDelete: "restrict" }),
  conversionRate: numeric("conversion_rate", { precision: 12, scale: 4 }).notNull().default("1"),
  uomSale: text("uom_sale").notNull(),
  marginPercent: numeric("margin_percent", { precision: 6, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("products_raw_material_id_idx").on(table.rawMaterialId),
]);

export const rawMaterialsRelations = relations(rawMaterials, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one }) => ({
  rawMaterial: one(rawMaterials, {
    fields: [products.rawMaterialId],
    references: [rawMaterials.id],
  }),
}));

const numericString = z.union([z.string(), z.number()])
  .transform(v => String(v))
  .refine(v => !isNaN(parseFloat(v)), { message: "Valore numerico non valido" });

export const insertRawMaterialSchema = createInsertSchema(rawMaterials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Il nome è obbligatorio"),
  uomPurchase: z.string().min(1, "L'unità di acquisto è obbligatoria"),
  unitCost: numericString.refine(v => parseFloat(v) >= 0, { message: "Il costo unitario deve essere >= 0" }),
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Il nome è obbligatorio"),
  rawMaterialId: z.string().min(1, "Seleziona una materia prima"),
  conversionRate: numericString.refine(v => parseFloat(v) > 0, { message: "La resa deve essere maggiore di 0" }),
  uomSale: z.string().min(1, "L'unità di vendita è obbligatoria"),
  marginPercent: numericString.refine(v => parseFloat(v) >= 0, { message: "Il margine deve essere >= 0" }),
});

export type RawMaterial = typeof rawMaterials.$inferSelect;
export type InsertRawMaterial = z.infer<typeof insertRawMaterialSchema>;

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type ProductWithRawMaterial = Product & { rawMaterial: RawMaterial };
