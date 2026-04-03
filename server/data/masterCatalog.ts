import type { PricingLogicLegacy, UnitType, ArticleCategory, RentalPricingData, TransportPricingData, DocumentPricingData, SimplePricingData, SalePricingData, InstallationData, HandlingParamsData, TrasfertaData } from "@shared/schema";

export interface MasterArticle {
  code: string;
  name: string;
  description: string | null;
  category: ArticleCategory;
  unitType: UnitType;
  pricingLogic: PricingLogicLegacy;
  basePrice: string;
  pricingData: RentalPricingData | TransportPricingData | DocumentPricingData | SimplePricingData | SalePricingData | HandlingParamsData;
  installationData?: InstallationData;
  trasfertaData?: TrasfertaData;
  variantsData?: Record<string, unknown>[];
  isChecklistItem: number;
  checklistOrder: number;
}

export const STANDARD_ARTICLES: MasterArticle[] = [
  // GRUPPO A: DOCUMENTI & SERVIZI
  {
    code: "DOC-001",
    name: "POS e Pimus",
    description: "Piano Operativo Sicurezza e Piano Montaggio Uso Smontaggio",
    category: "DOCUMENT",
    unitType: "CAD",
    pricingLogic: "DOCUMENT",
    basePrice: "0.00",
    pricingData: {
      options: [
        { name: "Fino a 1000 mq", price: 300 },
        { name: "Oltre 1000 mq", price: 500 }
      ]
    } as DocumentPricingData,
    isChecklistItem: 0,
    checklistOrder: 0
  },
  {
    code: "SRV-001",
    name: "Extra per portineria/industriale",
    description: "Supplemento per cantieri con portineria o industriali",
    category: "SERVICE",
    unitType: "CAD",
    pricingLogic: "SERVICE",
    basePrice: "200.00",
    pricingData: { price: 200 } as SimplePricingData,
    isChecklistItem: 0,
    checklistOrder: 0
  },
  {
    code: "SRV-002",
    name: "Relazione di calcolo",
    description: "Relazione tecnica di calcolo strutturale",
    category: "SERVICE",
    unitType: "CAD",
    pricingLogic: "SERVICE",
    basePrice: "0.00",
    pricingData: { price: 0 } as SimplePricingData,
    isChecklistItem: 0,
    checklistOrder: 0
  },
  {
    code: "SRV-003",
    name: "Ore in Economia",
    description: "Costo orario per lavori in economia",
    category: "SERVICE",
    unitType: "CAD",
    pricingLogic: "SERVICE",
    basePrice: "39.00",
    pricingData: { price: 39 } as SimplePricingData,
    isChecklistItem: 0,
    checklistOrder: 0
  },
  {
    code: "SRV-004",
    name: "Ritiro e smaltimento rete antipolvere",
    description: "Ritiro e smaltimento rete anti polvere a fine lavori",
    category: "SERVICE",
    unitType: "CAD",
    pricingLogic: "SERVICE",
    basePrice: "100.00",
    pricingData: { price: 100 } as SimplePricingData,
    isChecklistItem: 0,
    checklistOrder: 0
  },
  {
    code: "SRV-005",
    name: "Trasporto esubero bancali",
    description: "Trasporto per ritiro materiale in esubero/riconsegna bancali vuoti",
    category: "SERVICE",
    unitType: "CAD",
    pricingLogic: "SERVICE",
    basePrice: "110.00",
    pricingData: { price: 110 } as SimplePricingData,
    isChecklistItem: 0,
    checklistOrder: 0
  },
  {
    code: "SRV-006",
    name: "Controllo semestrale chiave dinamometrica",
    description: "Controllo semestrale con chiave dinamometrica",
    category: "SERVICE",
    unitType: "CAD",
    pricingLogic: "SERVICE",
    basePrice: "300.00",
    pricingData: { price: 300 } as SimplePricingData,
    isChecklistItem: 0,
    checklistOrder: 0
  },
  {
    code: "MAG001",
    name: "Movimentazione di Magazzino",
    description: "Gestione logistica e movimentazione merce",
    category: "HANDLING",
    unitType: "MQ",
    pricingLogic: "SERVICE",
    basePrice: "0.60",
    pricingData: { price: 0.60 } as SimplePricingData,
    isChecklistItem: 0,
    checklistOrder: 0
  },

  // GRUPPO B: TRASPORTI (Articolo contenitore con lista veicoli)
  {
    code: "TRA-001",
    name: "Trasporto",
    description: "Servizio trasporto con mezzi aziendali",
    category: "TRANSPORT",
    unitType: "CAD",
    pricingLogic: "TRANSPORT",
    basePrice: "0.00",
    pricingData: {
      vehicles: [
        { name: "Furgone DAILY (9)", fix: 60.00, perKm: 1.53, banchinaCost: 70, ferryLidoCost: 493, ferryPellesCost: 593 },
        { name: "Camion DAF LF (2)", fix: 113.00, perKm: 1.86, banchinaCost: 70, ferryLidoCost: 688, ferryPellesCost: 808 },
        { name: "Camion DAF CF (10)", fix: 228.00, perKm: 1.91, banchinaCost: 130, ferryLidoCost: 948, ferryPellesCost: 1113 },
        { name: "Camion DAF CF (10) + RIM", fix: 370.00, perKm: 1.95, banchinaCost: 200, ferryLidoCost: 1083, ferryPellesCost: 1248 }
      ]
    } as TransportPricingData,
    isChecklistItem: 0,
    checklistOrder: 0
  },

  // GRUPPO C: NOLEGGI (Con installationData integrata)
  {
    code: "NOL-001",
    name: "Ponteggio a telai 105",
    description: "Noleggio ponteggio a telai prefabbricati larghezza 105cm",
    category: "SCAFFOLDING",
    unitType: "MQ",
    pricingLogic: "RENTAL",
    basePrice: "2.10",
    pricingData: { months_1_2: 2.10, months_3_5: 1.89, months_6_8: 1.68, months_9_plus: 1.47 } as RentalPricingData,
    installationData: [
      { label: "Da terra", mount: 5.90, dismount: 3.54, isDefault: true },
      { label: "Partenza stretta", mount: 6.90, dismount: 4.14 },
      { label: "Sopra tetti", mount: 8.50, dismount: 5.10 },
      { label: "Sospeso", mount: 18.00, dismount: 10.80 }
    ],
    isChecklistItem: 1,
    checklistOrder: 1
  },
  {
    code: "NOL-002",
    name: "Ponteggio Multidir. 75",
    description: "Noleggio ponteggio multidirezionale larghezza 75cm",
    category: "SCAFFOLDING",
    unitType: "MQ",
    pricingLogic: "RENTAL",
    basePrice: "2.30",
    pricingData: { months_1_2: 2.30, months_3_5: 2.07, months_6_8: 1.84, months_9_plus: 1.61 } as RentalPricingData,
    installationData: [
      { label: "Da terra", mount: 6.90, dismount: 4.14, isDefault: true },
      { label: "Partenza stretta", mount: 7.90, dismount: 4.74 },
      { label: "Sopra tetti", mount: 9.50, dismount: 5.70 },
      { label: "Sospeso", mount: 22.00, dismount: 13.20 }
    ],
    isChecklistItem: 1,
    checklistOrder: 2
  },
  {
    code: "NOL-003",
    name: "Mantovana / Parasassi",
    description: "Noleggio mantovana o parasassi",
    category: "SCAFFOLDING",
    unitType: "ML",
    pricingLogic: "RENTAL",
    basePrice: "10.00",
    pricingData: { months_1_2: 10.00, months_3_5: 9.00, months_6_8: 8.00, months_9_plus: 7.00 } as RentalPricingData,
    installationData: [
      { label: "Standard", mount: 9.00, dismount: 5.40, isDefault: true }
    ],
    isChecklistItem: 1,
    checklistOrder: 3
  },
  {
    code: "NOL-004",
    name: "Piani di Carico",
    description: "Noleggio piani di carico",
    category: "SCAFFOLDING",
    unitType: "CAD",
    pricingLogic: "RENTAL",
    basePrice: "3.00",
    pricingData: { months_1_2: 3.00, months_3_5: 2.70, months_6_8: 2.40, months_9_plus: 2.10 } as RentalPricingData,
    installationData: [
      { label: "Con partenza da terra", mount: 80.00, dismount: 48.00, isDefault: true }
    ],
    isChecklistItem: 1,
    checklistOrder: 4
  },
  {
    code: "NOL-005",
    name: "Cielo (Travi con pannelli)",
    description: "Noleggio copertura cielo con travi e pannelli",
    category: "SCAFFOLDING",
    unitType: "MQ",
    pricingLogic: "RENTAL",
    basePrice: "8.00",
    pricingData: { months_1_2: 8.00, months_3_5: 7.20, months_6_8: 6.40, months_9_plus: 5.60 } as RentalPricingData,
    installationData: [
      { label: "Fino a 6m", mount: 6.00, dismount: 3.60, isDefault: true },
      { label: "Oltre 6m", mount: 8.00, dismount: 4.80 }
    ],
    isChecklistItem: 1,
    checklistOrder: 5
  },
  {
    code: "NOL-006",
    name: "Parapetti (a morsa)",
    description: "Noleggio parapetti a morsa",
    category: "SCAFFOLDING",
    unitType: "ML",
    pricingLogic: "RENTAL",
    basePrice: "5.00",
    pricingData: { months_1_2: 5.00, months_3_5: 4.50, months_6_8: 4.00, months_9_plus: 3.50 } as RentalPricingData,
    installationData: [
      { label: "Tubo e giunto", mount: 4.50, dismount: 2.70, isDefault: true }
    ],
    isChecklistItem: 1,
    checklistOrder: 6
  },
  {
    code: "NOL-007",
    name: "Copertura (Tettoia)",
    description: "Noleggio copertura o tettoia",
    category: "SCAFFOLDING",
    unitType: "MQ",
    pricingLogic: "RENTAL",
    basePrice: "12.00",
    pricingData: { months_1_2: 12.00, months_3_5: 10.80, months_6_8: 9.60, months_9_plus: 8.40 } as RentalPricingData,
    installationData: [
      { label: "Standard", mount: 12.00, dismount: 7.20, isDefault: true }
    ],
    isChecklistItem: 1,
    checklistOrder: 7
  },
  {
    code: "NOL-008",
    name: "Scale a servire",
    description: "Noleggio scale a servire il ponteggio",
    category: "SCAFFOLDING",
    unitType: "CAD",
    pricingLogic: "RENTAL",
    basePrice: "15.00",
    pricingData: { months_1_2: 15.00, months_3_5: 13.50, months_6_8: 12.00, months_9_plus: 10.50 } as RentalPricingData,
    installationData: [
      { label: "Standard", mount: 60.00, dismount: 36.00, isDefault: true }
    ],
    isChecklistItem: 1,
    checklistOrder: 8
  },
  {
    code: "NOL-009",
    name: "Montacarichi",
    description: "Noleggio montacarichi per ponteggio",
    category: "SCAFFOLDING",
    unitType: "CAD",
    pricingLogic: "RENTAL",
    basePrice: "50.00",
    pricingData: { months_1_2: 50.00, months_3_5: 45.00, months_6_8: 40.00, months_9_plus: 35.00 } as RentalPricingData,
    installationData: [
      { label: "Installazione", mount: 350.00, dismount: 200.00, isDefault: true }
    ],
    isChecklistItem: 1,
    checklistOrder: 9
  },
  {
    code: "NOL-010",
    name: "Rete Antipolvere",
    description: "Vendita rete antipolvere per ponteggio (materiale a perdere)",
    category: "SCAFFOLDING",
    unitType: "ML",
    pricingLogic: "SALE",
    basePrice: "90.00",
    pricingData: { price: 90, unitCoverage: 200 } as SalePricingData,
    installationData: [
      { label: "Posa", mount: 1.80, dismount: 0, isDefault: true }
    ],
    isChecklistItem: 1,
    checklistOrder: 10
  },
  {
    code: "NOL-017",
    name: "Mensola",
    description: "Noleggio mensola per ponteggio",
    category: "SCAFFOLDING",
    unitType: "ML",
    pricingLogic: "RENTAL",
    basePrice: "6.00",
    pricingData: { months_1_2: 6.00, months_3_5: 5.40, months_6_8: 4.80, months_9_plus: 4.20 } as RentalPricingData,
    installationData: [
      { label: "105/73", mount: 14.00, dismount: 8.40, isDefault: true },
      { label: "50/35", mount: 6.00, dismount: 3.60 },
      { label: "Tubo con tavola", mount: 6.00, dismount: 3.60 }
    ],
    isChecklistItem: 1,
    checklistOrder: 12
  },

  // GRUPPO D: MOVIMENTAZIONE (Parametri e articoli logistica cantiere)
  {
    code: "MOV-PARAMS",
    name: "Parametri Movimentazione",
    description: "Coefficienti di calcolo per costi movimentazione logistica cantiere",
    category: "HANDLING",
    unitType: "CAD",
    pricingLogic: "SERVICE",
    basePrice: "0.00",
    pricingData: {
      k_terra_orizz: 0.05,     // Costo per mq/mc per metro orizzontale a terra
      k_terra_vert: 0.10,      // Costo per mq/mc per metro verticale a terra
      k_quota_orizz: 0.08,     // Costo per mq/mc per metro orizzontale in quota
      k_quota_vert: 0.13,      // Costo per mq/mc per metro verticale in quota
      free_meters_limit: 10    // Primi 10m orizzontali gratis
    } as HandlingParamsData,
    isChecklistItem: 0,
    checklistOrder: 0
  },
  {
    code: "EXT-SALT",
    name: "Saltareti",
    description: "Attrezzatura per superamento ostacoli in cantiere",
    category: "SERVICE",
    unitType: "MQ",
    pricingLogic: "EXTRA",
    basePrice: "2.50",
    pricingData: { price: 2.50 } as SimplePricingData,
    isChecklistItem: 0,
    checklistOrder: 0
  },
  {
    code: "TRF-001",
    name: "Trasferta <100km",
    description: "Cantieri con distanza dalla sede tra i 70 km e i 100 km",
    category: "TRASFERTA",
    unitType: "NUM",
    pricingLogic: "SERVICE",
    basePrice: "0.00",
    pricingData: { price: 0 } as SimplePricingData,
    trasfertaData: {
      costo1Label: "Costo auto",
      costo1Value: 0.75,
      costo1Unit: "€/Km",
      costo2Label: "Costo a persona",
      costo2Value: 1.99,
      costo2Unit: "€/Km"
    },
    isChecklistItem: 0,
    checklistOrder: 0
  },
  {
    code: "TRF-002",
    name: "Trasferta >100km",
    description: "Cantieri in trasferta con distanza dalla sede di minimo 100 km",
    category: "TRASFERTA",
    unitType: "NUM",
    pricingLogic: "SERVICE",
    basePrice: "0.00",
    pricingData: { price: 0 } as SimplePricingData,
    trasfertaData: {
      costo1Label: "Costo Hotel",
      costo1Value: 247.50,
      costo1Unit: "€/Squadra",
      costo2Label: "Costo extra personale",
      costo2Value: 72.00,
      costo2Unit: "€/Squadra"
    },
    isChecklistItem: 0,
    checklistOrder: 0
  },
  {
    code: "TRF-VEN",
    name: "Trasporti Lagunari",
    description: "Costo giornaliero trasporto lagunare per cantieri a Venezia, variabile per zona",
    category: "TRASFERTA",
    unitType: "NUM",
    pricingLogic: "SERVICE",
    basePrice: "0.00",
    pricingData: { price: 0 } as SimplePricingData,
    trasfertaData: {
      costo1Label: "Costo giornaliero zona",
      costo1Value: 0,
      costo1Unit: "€/giorno",
      costo2Label: "",
      costo2Value: 0,
      costo2Unit: ""
    },
    variantsData: [
      { label: "Santa Croce", description: "Venezia centro", dailyCost: 150 },
      { label: "Dorsoduro", description: "Venezia centro", dailyCost: 200 },
      { label: "San Polo", description: "Venezia centro", dailyCost: 200 },
      { label: "Cannaregio", description: "Venezia centro", dailyCost: 200 },
      { label: "San Marco", description: "Venezia centro", dailyCost: 250 },
      { label: "Castello", description: "Venezia centro", dailyCost: 250 },
      { label: "Giudecca", description: "Isole (barca)", dailyCost: 300 },
      { label: "Murano", description: "Isole (barca)", dailyCost: 300 },
      { label: "Lido", description: "Raggiungibile via Ferry Boat", dailyCost: 0 },
      { label: "Burano", description: "Isole settentrionali (barca)", dailyCost: 350 },
      { label: "Torcello", description: "Isole settentrionali (barca)", dailyCost: 350 },
      { label: "Pellestrina", description: "Raggiungibile via Ferry Boat", dailyCost: 400 },
    ],
    isChecklistItem: 0,
    checklistOrder: 0
  },
  {
    code: "TRA-BAR",
    name: "Barca Lagunare",
    description: "Trasporto con barca lagunare per cantieri a Venezia — costo a corpo per direzione",
    category: "TRANSPORT",
    unitType: "AC",
    pricingLogic: "SERVICE",
    basePrice: "510.00",
    pricingData: { price: 510 } as SimplePricingData,
    trasfertaData: {
      costo1Label: "Prezzo barca",
      costo1Value: 510,
      costo1Unit: "€/viaggio",
      costo2Label: "",
      costo2Value: 0,
      costo2Unit: ""
    },
    variantsData: [
      { label: "Barca piccola con gru", description: "Fino a 6 ton", price: 510, isDefault: true },
      { label: "Barca grande con gru", description: "Oltre 6 ton", price: 510 },
    ],
    isChecklistItem: 0,
    checklistOrder: 0
  }
];
