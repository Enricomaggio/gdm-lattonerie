import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  Image,
  Font,
} from "@react-pdf/renderer";
import {
  buildDynamicServices,
  calculateDynamicServicePrice,
  migrateLegacyServiceIds,
  type ArticleForPricing,
  type DynamicServiceEntry,
} from "@shared/optionalServices";

interface LagunariItem {
  label: string;
  qty: number;
  unitPrice: number;
  total: number;
  isACorpo: boolean;
}

// --- REGISTRAZIONE FONT ---
try {
  Font.register({
    family: "Montserrat",
    fonts: [
      { src: "/fonts/Montserrat-Regular.ttf" },
      { src: "/fonts/Montserrat-SemiBold.ttf", fontWeight: "bold" },
      { src: "/fonts/Montserrat-Bold.ttf", fontWeight: 800 },
      { src: "/fonts/Montserrat-Italic.ttf", fontStyle: "italic" },
    ],
  });
} catch (e) {
  console.error("Errore font:", e);
}

// --- STILI ---
const styles = StyleSheet.create({
  // Base
  page: {
    paddingTop: 180, // Spazio per pagine di continuazione senza intestazione
    paddingBottom: 80,
    paddingHorizontal: 40,
    fontFamily: "Montserrat",
    fontSize: 9, // Corpo testo standard 9pt
    color: "#000",
  },
  coverPage: {
    padding: 0,
    fontFamily: "Montserrat",
    position: "relative",
  },

  // --- COPERTINA (STILI INTOCCATI) ---
  coverBackground: {
    position: "absolute",
    top: 110,
    left: -80,
    width: 420,
    height: "auto",
    zIndex: -1,
    opacity: 1,
  },

  coverContent: {
    marginTop: 180,
    marginLeft: "45%", // Riferimento allineamento verticale
    marginRight: 40,
  },

  // Tipografia Copertina
  coverLabel: {
    fontSize: 12,
    color: "#444",
    marginBottom: 2,
    textTransform: "none",
  },
  coverClientName: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 15,
    color: "#050b41",
  },
  coverText: {
    fontSize: 12,
    marginBottom: 2,
    lineHeight: 1.3,
    color: "#444",
  },
  coverNumber: {
    fontSize: 12,
    marginTop: 8,
    color: "#050b41",
    fontWeight: "bold",
  },

  separatorGreen: {
    borderBottomWidth: 1,
    borderBottomColor: "#4CAF50",
    width: "90%",
    marginTop: 20,
    marginBottom: 20,
  },

  // Box Referente
  salesBox: {
    borderLeftWidth: 3,
    borderLeftColor: "#050b41",
    paddingLeft: 10,
    marginTop: 5,
  },
  salesName: { fontSize: 12, fontWeight: "bold", color: "#050b41" },
  salesContact: { fontSize: 12, marginTop: 3, color: "#444" },

  // Footer Copertina
  coverFooterTable: {
    position: "absolute",
    bottom: 60,
    left: 0,
    width: "100%",
    height: 250,
  },
  // Logo ISO
  logoIso: {
    position: "absolute",
    left: "15%",
    width: 100,
    height: "auto",
    bottom: 50,
  },
  // Logo DaDo
  logoCoverCompany: {
    position: "absolute",
    left: "45%",
    width: 250,
    height: "auto",
    bottom: 5,
  },

  // --- HEADER & FOOTER PAGINE INTERNE (STILI INTOCCATI) ---

  // Header Container Grande
  headerStatic: {
    position: "absolute",
    top: 30,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  // Linea divisoria sotto l'header
  headerDividerLine: {
    position: "absolute",
    top: 170,
    left: 40,
    right: 40,
    borderBottomWidth: 0.5,
    borderBottomColor: "#050b41",
  },

  // Colonna Sinistra (Dati Azienda)
  headerLeft: {
    width: "50%",
    paddingRight: 10,
  },
  headerLogo: {
    width: 220,
    height: "auto",
    marginBottom: 8,
  },
  headerCompanyTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#050b41",
    marginBottom: 5,
  },
  headerCompanyText: {
    fontSize: 8,
    color: "#050b41",
    lineHeight: 1.5,
  },

  // Colonna Destra (Dati Cliente)
  headerRight: {
    width: "45%",
    paddingTop: 5,
  },
  headerLabelSmall: {
    fontSize: 8,
    color: "#050b41",
    marginBottom: 1,
    textTransform: "uppercase",
  },
  headerClientName: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#050b41",
    marginBottom: 2,
  },
  headerClientInfo: {
    fontSize: 8,
    color: "#050b41",
    lineHeight: 1.5,
  },
  headerDividerSmall: {
    borderTopWidth: 0.5,
    borderTopColor: "#ccc",
    marginBottom: 8,
    marginTop: 8,
    width: "100%",
  },

  // Footer Pagine Interne
  footerStatic: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    height: 30,
    borderTopWidth: 0.5,
    borderTopColor: "#ddd",
    paddingTop: 5,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: { fontSize: 7, color: "#999" },
  pageNumber: { fontSize: 8, color: "#000" },

  // --- TABELLA ---
  tableContainer: { marginTop: -10 },
  sectionHeader: {
    backgroundColor: "#f5f5f5",
    paddingVertical: 4,
    paddingHorizontal: 5,
    marginTop: 10,
    marginBottom: 5,
    borderLeftWidth: 3,
    borderLeftColor: "#050b41",
  },
  sectionTitle: { fontSize: 10, fontWeight: "bold", color: "#050b41" }, // Intestazione 10pt

  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#050b41",
    paddingVertical: 4,
    marginBottom: 2,
  },
  headerCell: {
    color: "#fff",
    fontSize: 8, // Intestazione tabella uniformata a 8pt
    fontWeight: "bold",
    textAlign: "center",
  },

  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
    paddingVertical: 4,
    alignItems: "center",
  },

  // Colonne Tabella
  colLav: { width: "47%", paddingLeft: 5, paddingRight: 20, textAlign: "left" },
  colQty: { width: "6%", textAlign: "right" },
  colUm: { width: "4%", textAlign: "center", paddingLeft: 2 },
  colPrz: { width: "10%", textAlign: "right" },
  colSc: { width: "5%", textAlign: "center" },
  colPrzSc: { width: "9%", textAlign: "right" },
  colImp: { width: "14%", textAlign: "right", paddingRight: 5 },
  colIva: { width: "5%", textAlign: "center" },

  cellText: { fontSize: 9, color: "#000" }, // Testo tabella 9pt
  cellTextSmall: { fontSize: 8, color: "#000" }, // Testo 1pt più piccolo per UM e SC.%

  // Wrapper per validità + totali
  totalsWrapper: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 20,
  },
  // Box validità offerta (a sinistra)
  validityBox: {
    width: "55%",
    paddingRight: 20,
  },
  validityText: {
    fontSize: 9,
    fontWeight: "bold",
  },
  // Totali (a destra)
  totalsBox: {
    width: "40%",
    borderTopWidth: 1,
    borderTopColor: "#000",
    paddingTop: 5,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  totalLabel: { fontSize: 9 }, // Uniformato a 9pt
  totalValue: { fontSize: 9, fontWeight: "bold" }, // Uniformato a 9pt

  // --- SEZIONE INSTALLAZIONE ---
  // Stile per intestazioni a INIZIO PAGINA (dopo page break)
  installazioneTitleBoxFirst: {
    backgroundColor: "#050b41",
    marginTop: -10, // Negativo per avvicinare alla linea divisoria
    marginBottom: 8,
  },
  // Stile per intestazioni TRA SEZIONI nella stessa pagina
  installazioneTitleBox: {
    backgroundColor: "#050b41",
    marginTop: -10, // Spazio dal contenuto precedente
    marginBottom: 8,
  },
  installazioneTitle: {
    color: "#fff",
    fontSize: 8, // Intestazione 8pt
    padding: 5,
    paddingVertical: 4,
    fontWeight: "bold",
    textTransform: "uppercase" as const,
  },
  installazioneContainer: {
    marginBottom: 10,
  },
  installazioneClause: {
    fontSize: 9, // Testo 9pt
    lineHeight: 1.5,
    color: "#000",
    paddingLeft: 5,
    paddingRight: 5,
    marginBottom: 6, // Spazio uniforme tra le voci
  },

  // Stili generici per testo giustificato e firme
  justifyText: { fontSize: 9, textAlign: "justify", lineHeight: 1.4 },
  signatureLabel: { fontSize: 9, fontWeight: "bold", marginBottom: 5 },
  signatureLineStyle: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#333",
    height: 25,
  },
  signatureContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    marginBottom: 25,
  },
  signatureBlockHalf: { width: "45%" },

  // Dati cliente styles
  clientDataLabel: { fontSize: 9, width: 150 }, // Width aumentata per uniformità
  clientDataLabelLong: { fontSize: 9, width: 170 },
  clientDataRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 12,
  },
  clientDataLine: {
    flex: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: "#333",
    marginLeft: 5,
  },
  sectionHeaderBold: { fontSize: 10, fontWeight: "bold", marginBottom: 10 },
});

// Helper formattazione
const formatCurrency = (val: number) => {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0);
};

const mapUnitType = (
  unit: string,
  pricingLogic: string,
  articleName: string = "",
) => {
  if (pricingLogic === "TRANSPORT") return "tr";
  if (pricingLogic === "DOCUMENT") return "ac";
  // Mappatura unità di misura dal catalogo
  switch (unit) {
    case "MC":
      return "mc"; // metri cubi
    case "MQ":
      return "mq"; // metri quadri
    case "ML":
      return "ml"; // metri lineari
    case "MT":
      return "mt"; // metri
    case "CAD":
      return "cad"; // cadauno
    case "PZ":
      return "pz"; // pezzi
    case "NUM":
      return "n."; // numero
    default:
      return "ac"; // fallback a corpo
  }
};

// Interface Props
interface ClauseSelection {
  selected: boolean;
  text: string;
}

interface QuotePdfDocumentProps {
  quote: any;
  company?: any;
  articles?: any[];
  user?: any;
  clauseSelections?: Record<string, ClauseSelection>;
  billingProfile?: any;
  contactReferent?: { firstName?: string; lastName?: string; email?: string; phone?: string } | null;
}

// --- COMPONENTI RIUTILIZZABILI ---

const QuoteHeader = ({
  companyTitle,
  companyAddress,
  companyPhone,
  companyEmail,
  companyVat,
  companyShareCapital,
  leadName,
  leadAddress,
  leadCity,
  leadVatNumber,
  siteAddress,
  siteCity,
  siteProvince,
  headerLogoSrc,
  quoteNumber,
  quoteCreatedAt,
}: any) => (
  <>
    <View style={styles.headerStatic} fixed>
      {/* Colonna Sinistra: Dati Azienda DINAMICI */}
      <View style={styles.headerLeft}>
        <Image src={headerLogoSrc || "/logo-ponteggi.png"} style={styles.headerLogo} />
        {!!companyTitle && <Text style={styles.headerCompanyTitle}>{companyTitle}</Text>}
        {!!companyAddress && <Text style={styles.headerCompanyText}>{companyAddress}</Text>}
        {(!!companyPhone || !!companyEmail) && (
          <Text style={styles.headerCompanyText}>
            {[companyPhone ? `Tel. ${companyPhone}` : "", companyEmail ? `Email: ${companyEmail}` : ""].filter(Boolean).join(" - ")}
          </Text>
        )}
        {(!!companyVat || !!companyShareCapital) && (
          <Text style={styles.headerCompanyText}>
            {[companyVat ? `P.IVA ${companyVat}` : "", companyShareCapital || ""].filter(Boolean).join(" - ")}
          </Text>
        )}
      </View>

      {/* Colonna Destra: Dati Cliente e Cantiere */}
      <View style={styles.headerRight}>
        <Text style={styles.headerLabelSmall}>SPETT.LE</Text>
        <Text style={styles.headerClientName}>{leadName}</Text>
        <Text style={styles.headerClientInfo}>
          {[leadAddress, leadCity].filter(Boolean).join(", ")}
        </Text>
        {!!leadVatNumber && <Text style={styles.headerClientInfo}>P.IVA {leadVatNumber}</Text>}

        <View style={styles.headerDividerSmall} />

        <Text style={styles.headerLabelSmall}>LUOGO CANTIERE:</Text>
        <Text style={styles.headerClientInfo}>
          {siteAddress}{siteCity ? `, ${siteCity}` : ""}{siteProvince ? ` (${siteProvince})` : ""}
        </Text>

        {!!quoteNumber && (
          <>
            <View style={styles.headerDividerSmall} />
            <Text style={styles.headerLabelSmall}>
              PREV. N°: {quoteNumber}{quoteCreatedAt ? ` del ${new Date(quoteCreatedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" })}` : ""}
            </Text>
          </>
        )}
      </View>
    </View>
    {/* Linea divisoria sotto l'header */}
    <View style={styles.headerDividerLine} fixed />
  </>
);

const QuoteFooter = ({ companyAddress, companyVat }: any) => (
  <View style={styles.footerStatic} fixed>
    <Text style={styles.footerText}>
      {companyAddress} - P.IVA {companyVat}
    </Text>
    <Text
      style={styles.pageNumber}
      render={({ pageNumber, totalPages }) => `${pageNumber - 1} / ${totalPages - 1}`}
    />
  </View>
);

const SignatureBlock = () => (
  <View style={styles.signatureContainer}>
    <View style={styles.signatureBlockHalf}>
      <Text style={styles.signatureLabel}>Data e luogo</Text>
      <View style={styles.signatureLineStyle} />
    </View>
    <View style={styles.signatureBlockHalf}>
      <Text style={styles.signatureLabel}>Per il Cliente</Text>
      <View style={styles.signatureLineStyle} />
    </View>
  </View>
);

export function QuotePdfDocument({
  quote,
  company,
  articles,
  user,
  clauseSelections,
  billingProfile,
  contactReferent,
}: QuotePdfDocumentProps) {
  const totals = quote.totals;
  const phases = totals.phases || [];

  // Durata noleggio in mesi (dal globalParams)
  const durationMonths = quote.globalParams?.durationMonths || 1;

  const aCorpoArticleIds = new Set([
    ...(quote.globalParams?.aCorpoItems || []).map((item: any) => item.articleId),
    ...(Array.isArray(quote.fasiConfig) ? quote.fasiConfig.flatMap((fase: any) => (fase.aCorpoItems || []).map((item: any) => item.articleId)) : []),
  ]);

  // Aliquota IVA (default 22 se non specificata)
  const vatRate = quote.vatRateDefault || "22";
  const isReverseCharge = vatRate === "RC";
  const vatPercent = isReverseCharge ? 0 : parseFloat(vatRate);

  // Map per override IVA per singole righe (chiave: "phase:idx")
  const itemVatOverridesMap = new Map<string, string>(
    quote.itemVatOverrides || [],
  );

  // Funzione per ottenere aliquota IVA per singolo item
  const getItemVatRate = (phase: string, idx: number): string => {
    const key = `${phase}:${idx}`;
    return itemVatOverridesMap.get(key) || vatRate;
  };

  // Dati breakdown IVA per aliquote miste
  const vatBreakdown = quote.vatBreakdown || null;
  const hasMixedRates = vatBreakdown?.hasMixedRates || false;

  // --- DATI AZIENDALI DINAMICI (billingProfile override company) ---
  const bp = billingProfile;
  const cName = bp ? (bp.companyName || "") : (company?.name || "");
  const cFullTitle = cName;

  const cAddress = bp
    ? (bp.address ? `${bp.address}${bp.city ? `, ${bp.zip || ""} ${bp.city}` : ""}${bp.province ? ` (${bp.province})` : ""}` : "")
    : (company?.address || "");
  const cVat = bp ? (bp.vatNumber || "") : (company?.vatNumber || "");
  const cIban = bp ? (bp.iban || "") : (company?.iban || "");

  const cPhone = bp ? (bp.phone || "") : (company?.phone || "");
  const cEmail = bp ? (bp.email || "") : (company?.email || "");

  const rawShareCapital = bp ? (bp.shareCapital || "") : (company?.shareCapital || "");
  const cShareCapital = rawShareCapital ? `Capitale sociale: ${rawShareCapital}` : "";

  // Logo paths dal billingProfile (fallback a default)
  const coverLogoPath = bp?.logoCoverPath || "/logo-copertina-ponteggi.png";
  const headerLogoPath = bp?.logoHeaderPath || "/logo-ponteggi.png";

  // Dati Cliente
  const leadName =
    quote.lead?.entityType === "COMPANY"
      ? quote.lead?.name
      : `${quote.lead?.firstName} ${quote.lead?.lastName}`;

  const leadAddress = quote.lead?.address || "";
  const leadCity = quote.lead?.city
    ? `${quote.lead?.zipCode} ${quote.lead?.city} (${quote.lead?.province || ""})`
    : "";

  const siteAddress =
    quote.opportunity?.siteAddress || "Indirizzo non specificato";
  const siteCity = quote.opportunity?.siteCity || "";
  const siteProvince = quote.opportunity?.siteProvince || "";

  // Numero Preventivo
  const quoteRefNumber = quote.number || `01-${new Date().getFullYear()}`;

  // Identifica articoli SALE per separarli dal Noleggio
  const saleArticleIds = new Set(
    (articles || []).filter((a: any) => a.pricingLogic === "SALE").map((a: any) => String(a.id))
  );

  const isPhasesMode = !!(totals as any).phasesMode;
  const isACorpoMode = quote.quoteMode === 'a_corpo';
  const fasiData = (totals as any).fasiData || [];
  const documentiData = (totals as any).documenti || { items: [] };

  const groupedSections = isPhasesMode ? [] : [
    { title: "Documenti e servizi", phases: ["DOCUMENTI"], items: [] as any[] },
    {
      title: "Montaggio",
      phases: ["TRASPORTO_ANDATA", "MONTAGGIO", "MOVIMENTAZIONE_MAGAZZINO"],
      items: [] as any[],
      handlingTotal: totals.handlingMountAfterDiscount || 0,
    },
    {
      title: "Smontaggio",
      phases: ["SMONTAGGIO", "TRASPORTO_RITORNO"],
      items: [] as any[],
      handlingTotal: totals.handlingDismountAfterDiscount || 0,
    },
    { title: "Noleggio", phases: ["NOLEGGIO"], items: [] as any[] },
    { title: "Fornitura", phases: ["FORNITURA" as any], items: [] as any[] },
  ];

  if (!isPhasesMode) {
    phases.forEach((p: any) => {
      const group = groupedSections.find((g) => g.phases.includes(p.phase));
      if (group) {
        const itemsWithMeta = p.items.map((item: any, idx: number) => ({
          ...item,
          _phase: p.phase,
          _originalIndex: idx,
        }));
        group.items.push(...itemsWithMeta);
      }
    });

    const noleggioGroup = groupedSections.find(g => g.title === "Noleggio")!;
    const fornituraGroup = groupedSections.find(g => g.title === "Fornitura")!;
    if (noleggioGroup && fornituraGroup) {
      const saleItems = noleggioGroup.items.filter(item => saleArticleIds.has(String(item.articleId)));
      noleggioGroup.items = noleggioGroup.items.filter(item => !saleArticleIds.has(String(item.articleId)));
      fornituraGroup.items.push(...saleItems);
    }
  }

  const renderItemRow = (item: any, i: number, phaseDurationMonths?: number) => {
    let um = "ac";
    const original = articles?.find((a) => a.id === item.articleId);
    const itemPhase = item._phase || item.phase;
    const isTransportItem = itemPhase?.includes("TRASPORTO");
    if (isACorpoMode && !isTransportItem) {
      um = "ac";
    } else if (isACorpoMode && isTransportItem) {
      um = "tr";
    } else if (aCorpoArticleIds.has(item.articleId)) {
      um = "ac";
    } else if (original) {
      if ((itemPhase === "FORNITURA" || itemPhase === "NOLEGGIO") && original.pricingLogic === "SALE")
        um = (original.pricingData as any)?.unitCoverage ? "rl" : "n.";
      else if ((itemPhase === "FORNITURA" || itemPhase === "NOLEGGIO") && original.unitType === "MQ")
        um = "mq";
      else if (itemPhase.includes("TRASPORTO")) um = "tr";
      else if (itemPhase === "DOCUMENTI") um = "ac";
      else if (itemPhase === "MONTAGGIO" || itemPhase === "SMONTAGGIO") {
        um = mapUnitType(original.unitType, original.pricingLogic, item.articleName);
      } else um = mapUnitType(original.unitType, original.pricingLogic, item.articleName);
    } else {
      if (itemPhase.includes("NOLEGGIO")) um = "mq";
      else if (itemPhase.includes("TRASPORTO")) um = "tr";
      else um = "ac";
    }

    const itemVatRate = getItemVatRate(itemPhase, item._originalIndex ?? i);
    const itemIsRC = itemVatRate === "RC";

    let displayName = item.articleName;
    if (itemPhase === "TRASPORTO_ANDATA" || itemPhase === "TRASPORTO_RITORNO") {
      const vehicles = (original?.pricingData as any)?.vehicles || [];
      const vehicleIndex = item.vehicleIndex ?? 0;
      const vehicle = vehicles[vehicleIndex];
      if (vehicle?.description) {
        displayName = itemPhase === "TRASPORTO_ANDATA"
          ? `Trasporto consegna con ${vehicle.description}`
          : `Trasporto ritiro con ${vehicle.description}`;
      }
      if (item.note) {
        displayName = `${displayName} - ${item.note}`;
      }
    } else if (itemPhase === "DOCUMENTI" && original?.description) {
      displayName = original.description;
    } else if (itemPhase === "MONTAGGIO") {
      const desc = (item as any).variantDescription || original?.description || item.articleName;
      displayName = desc;
    } else if (itemPhase === "SMONTAGGIO") {
      const desc = (item as any).variantDescription || original?.description || item.articleName;
      displayName = desc;
    }

    if (item.note && !isTransportItem) {
      displayName = `${displayName} - ${item.note}`;
    }

    const effectiveDuration = phaseDurationMonths || durationMonths;
    const isItemACorpo = !!(item as any).isACorpo || !!(item.isManualRow);
    const forceACorpo = !isTransportItem && isItemACorpo;
    const isManualRowOnly = !isTransportItem && !!(item.isManualRow);
    const displayQty = isManualRowOnly ? 1 : item.quantity;
    const displayUnitPrice = isManualRowOnly
      ? item.totaleRettificato
      : (item.quantity > 0 && item.totaleRettificato ? item.totaleRettificato / item.quantity : item.unitPrice);

    if ((itemPhase === "FORNITURA" || itemPhase === "NOLEGGIO") && (original?.pricingLogic === "SALE" || item._fromFornitura)) {
      const desc = (item as any).variantDescription || original?.description || item.articleName;
      const saleDisplayName = item.note ? `Fornitura ${desc} - ${item.note}` : `Fornitura ${desc}`;
      return (
        <View key={`item-${i}`} style={styles.tableRow}>
          <Text style={[styles.cellText, styles.colLav]}>{saleDisplayName}</Text>
          <Text style={[styles.cellText, styles.colQty]}>{formatCurrency(displayQty).replace(",00", "")}</Text>
          <Text style={[styles.cellTextSmall, styles.colUm]}>{um}</Text>
          <Text style={[styles.cellText, styles.colPrz]}>{formatCurrency(displayUnitPrice)}</Text>
          <Text style={[styles.cellTextSmall, styles.colSc]}>{item.discountPercent > 0 ? item.discountPercent : ""}</Text>
          <Text style={[styles.cellText, styles.colPrzSc]}>{item.discountPercent > 0 ? formatCurrency(displayUnitPrice * (1 - item.discountPercent / 100)) : ""}</Text>
          <Text style={[styles.cellText, styles.colImp]}>{formatCurrency(item.afterDiscount)}</Text>
          <Text style={[styles.cellText, styles.colIva]}>{itemIsRC ? "RC" : `${itemVatRate}`}</Text>
        </View>
      );
    }

    if (itemPhase === "NOLEGGIO") {
      const desc = (item as any).variantDescription || original?.description || item.articleName;
      const noteLabel = item.note ? ` - ${item.note}` : "";
      const monthsLabel = effectiveDuration === 1 ? "mese" : "mesi";
      const nolUnitPrice = forceACorpo ? item.totaleRettificato : (item.quantity > 0 && item.totaleRettificato ? item.totaleRettificato / item.quantity / effectiveDuration : item.unitPrice);
      const effectiveUnitPrice = forceACorpo ? item.afterDiscount : (item.discountPercent > 0 ? nolUnitPrice * (1 - item.discountPercent / 100) : nolUnitPrice);
      const dailyTotalRate = forceACorpo
        ? Math.ceil(item.afterDiscount / effectiveDuration / 30)
        : Math.ceil((effectiveUnitPrice / 30) * item.quantity);
      const nolLabel = (isACorpoMode || (item as any).isACorpo)
        ? `${item.articleName}${noteLabel} per ${effectiveDuration} ${monthsLabel}`
        : `Noleggio ${desc}${noteLabel} per ${effectiveDuration} ${monthsLabel}`;
      return (
        <View key={`item-${i}`}>
          <View style={styles.tableRow}>
            <Text style={[styles.cellText, styles.colLav]}>{nolLabel}</Text>
            <Text style={[styles.cellText, styles.colQty]}>{formatCurrency(displayQty).replace(",00", "")}</Text>
            <Text style={[styles.cellTextSmall, styles.colUm]}>{um}</Text>
            <Text style={[styles.cellText, styles.colPrz]}>{formatCurrency(nolUnitPrice)}</Text>
            <Text style={[styles.cellTextSmall, styles.colSc]}>{item.discountPercent > 0 ? item.discountPercent : ""}</Text>
            <Text style={[styles.cellText, styles.colPrzSc]}>{item.discountPercent > 0 ? formatCurrency(nolUnitPrice * (1 - item.discountPercent / 100)) : ""}</Text>
            <Text style={[styles.cellText, styles.colImp]}>{formatCurrency(item.afterDiscount)}</Text>
            <Text style={[styles.cellText, styles.colIva]}>{itemIsRC ? "RC" : `${itemVatRate}`}</Text>
          </View>
          {!isTransportItem && (
          <View style={styles.tableRow}>
            <Text style={[styles.cellText, styles.colLav]}>Noleggio {desc}{noteLabel} oltre il {effectiveDuration}° mese: {dailyTotalRate} €/gg</Text>
            <Text style={[styles.cellText, styles.colQty]}></Text>
            <Text style={[styles.cellTextSmall, styles.colUm]}></Text>
            <Text style={[styles.cellText, styles.colPrz]}></Text>
            <Text style={[styles.cellTextSmall, styles.colSc]}></Text>
            <Text style={[styles.cellText, styles.colPrzSc]}></Text>
            <Text style={[styles.cellText, styles.colImp]}></Text>
            <Text style={[styles.cellText, styles.colIva]}></Text>
          </View>
          )}
        </View>
      );
    }

    return (
      <View key={`item-${i}`} style={styles.tableRow}>
        <Text style={[styles.cellText, styles.colLav]}>{displayName}</Text>
        <Text style={[styles.cellText, styles.colQty]}>{formatCurrency(displayQty).replace(",00", "")}</Text>
        <Text style={[styles.cellTextSmall, styles.colUm]}>{um}</Text>
        <Text style={[styles.cellText, styles.colPrz]}>{formatCurrency(displayUnitPrice)}</Text>
        <Text style={[styles.cellTextSmall, styles.colSc]}>{item.discountPercent > 0 ? item.discountPercent : ""}</Text>
        <Text style={[styles.cellText, styles.colPrzSc]}>{item.discountPercent > 0 ? formatCurrency(displayUnitPrice * (1 - item.discountPercent / 100)) : ""}</Text>
        <Text style={[styles.cellText, styles.colImp]}>{formatCurrency(item.afterDiscount)}</Text>
        <Text style={[styles.cellText, styles.colIva]}>{itemIsRC ? "RC" : `${itemVatRate}`}</Text>
      </View>
    );
  };

  // Props comuni per Header e Footer
  const headerProps = {
    companyTitle: cFullTitle,
    companyAddress: cAddress,
    companyPhone: cPhone,
    companyEmail: cEmail,
    companyVat: cVat,
    companyShareCapital: cShareCapital,
    leadName: leadName,
    leadAddress: leadAddress,
    leadCity: leadCity,
    leadVatNumber: quote.lead?.vatNumber || "",
    siteAddress: siteAddress,
    siteCity: siteCity,
    siteProvince: siteProvince,
    headerLogoSrc: headerLogoPath,
    quoteNumber: quoteRefNumber,
    quoteCreatedAt: quote.createdAt,
  };

  const footerProps = {
    companyAddress: cAddress,
    companyVat: cVat,
  };

  return (
    <Document>
      {/* --- PAGINA 1: COPERTINA --- */}
      <Page size="A4" style={styles.coverPage}>
        <Image
          src="/logo-cover-verde.png"
          style={styles.coverBackground}
        />

        <View style={styles.coverContent}>
          {/* Cliente */}
          <Text style={styles.coverLabel}>Spett.le</Text>
          <Text style={styles.coverClientName}>{leadName}</Text>

          {/* Cantiere */}
          <Text style={styles.coverLabel}>Per il Vostro cantiere:</Text>
          <View style={{ marginBottom: 10 }}>
            <Text style={styles.coverText}>{siteAddress}</Text>
            <Text style={styles.coverText}>{siteCity}{siteProvince ? ` (${siteProvince})` : ""}</Text>
          </View>

          {/* Numero Offerta */}
          <Text style={styles.coverNumber}>Off. numero: {quoteRefNumber}</Text>
          {quote.createdAt && (
            <Text style={styles.coverNumber}>
              Del: {(() => {
                const d = new Date(quote.createdAt);
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const yyyy = d.getFullYear();
                return `${dd}-${mm}-${yyyy}`;
              })()}
            </Text>
          )}

          {/* Linea Verde */}
          <View style={styles.separatorGreen} />

          {/* Referente */}
          <Text style={styles.coverLabel}>
            Il Vostro referente tecnico commerciale:
          </Text>
          <View style={styles.salesBox}>
            <Text style={styles.salesName}>
              {user?.displayName ||
                (user?.firstName && user?.lastName
                  ? `${user.firstName} ${user.lastName}`
                  : "")}
            </Text>
            <Text style={styles.salesContact}>{user?.phone || ""}</Text>
            <Text style={styles.salesContact}>
              {user?.contactEmail || user?.email || ""}
            </Text>
          </View>
        </View>

        {/* Footer Copertina (LOGHI POSIZIONATI) */}
        <View style={styles.coverFooterTable}>
          <Image src="/uni-en-iso.png" style={styles.logoIso} />
          <Image src={coverLogoPath} style={styles.logoCoverCompany} />
        </View>
      </Page>

      {/* --- PAGINE CONTENUTO --- */}
      <Page size="A4" style={styles.page}>
        <QuoteHeader {...headerProps} />

        {/* SEZIONE REFERENTE */}
        {contactReferent && (contactReferent.firstName || contactReferent.lastName) && (
          <View style={styles.installazioneContainer}>
            <View style={styles.installazioneTitleBoxFirst}>
              <Text style={styles.installazioneTitle}>Referente</Text>
            </View>
            <Text style={styles.installazioneClause}>
              {[contactReferent.firstName, contactReferent.lastName].filter(Boolean).join(" ")}
              {contactReferent.phone ? `  -  Tel. ${contactReferent.phone}` : ""}
              {contactReferent.email ? `  -  Email: ${contactReferent.email}` : ""}
            </Text>
          </View>
        )}

        {/* SEZIONE INSTALLAZIONE (esclude validita_offerta che va nei totali) */}
        {clauseSelections &&
          Object.entries(clauseSelections).filter(
            ([id, sel]) =>
              !id.startsWith("nb_") && id !== "validita_offerta" && id !== "custom_service_note" && id !== "custom_clause_note" && sel.selected && sel.text.trim(),
          ).length > 0 && (
            <View style={styles.installazioneContainer}>
              <View style={styles.installazioneTitleBoxFirst}>
                <Text style={styles.installazioneTitle}>Installazione</Text>
              </View>
              {Object.entries(clauseSelections)
                .filter(
                  ([id, selection]) =>
                    !id.startsWith("nb_") &&
                    id !== "validita_offerta" &&
                    id !== "custom_service_note" &&
                    id !== "custom_clause_note" &&
                    selection.selected &&
                    selection.text.trim(),
                )
                .map(([clauseId, selection], idx) => (
                  <Text key={clauseId} style={styles.installazioneClause}>
                    {selection.text}
                  </Text>
                ))}
            </View>
          )}

        {/* TABELLA */}
        <View style={styles.tableContainer}>
          <View fixed render={({ pageNumber }) => (
            pageNumber > 1 ? <View style={{ marginBottom: -10 }} /> : <View />
          )} />
          <View style={styles.tableHeader} fixed>
            <Text style={[styles.headerCell, styles.colLav]}>LAVORAZIONE</Text>
            <Text style={[styles.headerCell, styles.colQty]}>Q.TÀ</Text>
            <Text style={[styles.headerCell, styles.colUm]}>UM</Text>
            <Text style={[styles.headerCell, styles.colPrz]}>PREZZO</Text>
            <Text style={[styles.headerCell, styles.colSc]}>SC.%</Text>
            <Text style={[styles.headerCell, styles.colPrzSc]}>P.SCONT.</Text>
            <Text style={[styles.headerCell, styles.colImp]}>IMPONIBILE</Text>
            <Text style={[styles.headerCell, styles.colIva]}>IVA</Text>
          </View>

          {(() => {
            const ROW_H = 26;
            const ROW_H_LONG = 40;
            const NOL_ROW_H = 50;
            const SEC_HDR_H = 38;
            const FASE_HDR_H = 38;
            const TABLE_HDR_H = 20;
            const SAFETY = 40;
            const PAGE_H = 842 - 160 - 80 - SAFETY;

            const hasReferente = !!(contactReferent && (contactReferent.firstName || contactReferent.lastName));
            const installazioneClauses = clauseSelections
              ? Object.entries(clauseSelections).filter(
                  ([id, sel]: [string, any]) =>
                    !id.startsWith("nb_") && id !== "validita_offerta" && id !== "custom_service_note" && id !== "custom_clause_note" && sel.selected && sel.text.trim(),
                ).length
              : 0;
            const FIRST_PAGE_USED = TABLE_HDR_H
              + (hasReferente ? 45 : 0)
              + (installazioneClauses > 0 ? 25 + installazioneClauses * 20 : 0);

            const estimateRowH = (item: any) => {
              const ph = item._phase || item.phase;
              if (ph === "NOLEGGIO") return NOL_ROW_H;
              const name = item.articleName || item.description || "";
              return name.length > 45 ? ROW_H_LONG : ROW_H;
            };

            const estimateBlockH = (items: any[], hasWarehouse: boolean, hasHandling: boolean, hasFaseHeader: boolean, lagunariCount = 0) => {
              let h = SEC_HDR_H;
              if (hasFaseHeader) h += FASE_HDR_H;
              items.forEach((it: any) => { h += estimateRowH(it); });
              if (hasWarehouse) h += ROW_H_LONG;
              if (hasHandling) h += ROW_H;
              h += lagunariCount * ROW_H;
              return h;
            };

            if (isPhasesMode) {
              const allBlocks: { key: string; shouldBreak: boolean; content: any }[] = [];
              let accumulated = FIRST_PAGE_USED;

              if (documentiData.items.length > 0) {
                const docH = estimateBlockH(documentiData.items, false, false, false);
                if (accumulated + docH > PAGE_H) {
                  accumulated = TABLE_HDR_H + docH;
                  allBlocks.push({ key: "doc", shouldBreak: true, content: (
                    <View key="doc" break>
                      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Documenti e servizi</Text></View>
                      {documentiData.items.map((item: any, i: number) => renderItemRow(item, i))}
                    </View>
                  )});
                } else {
                  accumulated += docH;
                  allBlocks.push({ key: "doc", shouldBreak: false, content: (
                    <View key="doc">
                      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Documenti e servizi</Text></View>
                      {documentiData.items.map((item: any, i: number) => renderItemRow(item, i))}
                    </View>
                  )});
                }
              }

              fasiData.forEach((fase: any, faseIdx: number) => {
                const allFaseItems: any[] = [];
                fase.sections.forEach((section: any) => {
                  section.items.forEach((item: any, idx: number) => {
                    allFaseItems.push({ ...item, _phase: item._phase || item.phase || section.type, _originalIndex: item._originalIndex ?? idx });
                  });
                });

                const faseGrouped = [
                  { title: "Montaggio", phases: ["TRASPORTO_ANDATA", "MONTAGGIO", "MOVIMENTAZIONE_MAGAZZINO"], items: [] as any[], handlingTotal: fase.handlingMountAfterDiscount || 0 },
                  { title: "Smontaggio", phases: ["SMONTAGGIO", "TRASPORTO_RITORNO"], items: [] as any[], handlingTotal: fase.handlingDismountAfterDiscount || 0 },
                  { title: "Noleggio", phases: ["NOLEGGIO"], items: [] as any[], handlingTotal: 0 },
                  { title: "Fornitura", phases: ["FORNITURA"], items: [] as any[], handlingTotal: 0 },
                ];

                allFaseItems.forEach((item) => {
                  const itemPhase = item._phase || item.phase;
                  const group = faseGrouped.find((g) => g.phases.includes(itemPhase));
                  if (group) group.items.push(item);
                });

                const nolGroup = faseGrouped.find(g => g.title === "Noleggio")!;
                const fornGroup = faseGrouped.find(g => g.title === "Fornitura")!;
                const saleInNol = nolGroup.items.filter(item => saleArticleIds.has(String(item.articleId)) || item._fromFornitura);
                nolGroup.items = nolGroup.items.filter(item => !saleArticleIds.has(String(item.articleId)) && !item._fromFornitura);
                fornGroup.items.push(...saleInNol);

                const faseLagunariAndata = fase.lagunariAndataItems || [];
                const faseLagunariRitorno = fase.lagunariRitornoItems || [];

                const visibleGroups = faseGrouped.filter((group) => {
                  const regularItems = group.items.filter((item: any) => (item._phase || item.phase) !== "MOVIMENTAZIONE_MAGAZZINO");
                  const warehouseItems = group.items.filter((item: any) => (item._phase || item.phase) === "MOVIMENTAZIONE_MAGAZZINO");
                  const warehouseTotal = warehouseItems.reduce((sum: number, item: any) => sum + (item.afterDiscount || 0), 0);
                  const groupLagunari = group.title === "Montaggio" ? faseLagunariAndata : group.title === "Smontaggio" ? faseLagunariRitorno : [];
                  return regularItems.length > 0 || warehouseTotal > 0 || group.handlingTotal > 0 || groupLagunari.length > 0;
                });

                visibleGroups.forEach((group, gIdx) => {
                  const includeFaseHeader = gIdx === 0;
                  const regularItems = group.items.filter((item: any) => (item._phase || item.phase) !== "MOVIMENTAZIONE_MAGAZZINO");
                  const warehouseItems = group.items.filter((item: any) => (item._phase || item.phase) === "MOVIMENTAZIONE_MAGAZZINO");
                  const warehouseTotal = warehouseItems.reduce((sum: number, item: any) => sum + (item.afterDiscount || 0), 0);
                  const warehouseGross = warehouseItems.reduce((sum: number, item: any) => sum + (item.totaleRettificato || item.totalRow || item.afterDiscount || 0), 0);
                  const warehouseDiscountPct = warehouseGross > 0 && warehouseTotal < warehouseGross ? Math.round((1 - warehouseTotal / warehouseGross) * 100) : 0;
                  const groupLagunari = group.title === "Montaggio" ? faseLagunariAndata : group.title === "Smontaggio" ? faseLagunariRitorno : [];
                  const blockH = estimateBlockH(regularItems, warehouseTotal > 0, group.handlingTotal > 0, includeFaseHeader, groupLagunari.length);
                  const needsBreak = accumulated + blockH > PAGE_H;
                  if (needsBreak) {
                    accumulated = TABLE_HDR_H + blockH;
                  } else {
                    accumulated += blockH;
                  }

                  const blockKey = `fase-${faseIdx}-g-${gIdx}`;
                  allBlocks.push({ key: blockKey, shouldBreak: needsBreak, content: (
                    <View key={blockKey} break={needsBreak || undefined}>
                      {includeFaseHeader && (
                        <View style={{ backgroundColor: "#f5f5f5", paddingVertical: 5, paddingHorizontal: 8, marginTop: 12, marginBottom: 2, borderWidth: 1, borderColor: "#050B41", borderRadius: 3 }}>
                          <Text style={{ fontSize: 9, color: "#050b41" }}>
                            {isACorpoMode ? "A corpo" : fase.faseName} {!isACorpoMode && fase.faseName.startsWith("Fase ") ? `(${fase.faseDuration} ${fase.faseDuration === 1 ? "mese" : "mesi"})` : ""}
                          </Text>
                        </View>
                      )}
                      {(() => {
                        const grpLagunari = group.title === "Montaggio" ? faseLagunariAndata : group.title === "Smontaggio" ? faseLagunariRitorno : [];
                        const grpTransport = regularItems.filter((item: any) => {
                          const p = item._phase || item.phase;
                          return p === "TRASPORTO_ANDATA" || p === "TRASPORTO_RITORNO";
                        });
                        const grpNonTransport = regularItems.filter((item: any) => {
                          const p = item._phase || item.phase;
                          return p !== "TRASPORTO_ANDATA" && p !== "TRASPORTO_RITORNO";
                        });
                        const renderGrpLagunari = () => grpLagunari.map((item: any, lagIdx: number) => {
                          const lagItemVat = item.vatRate || vatRate;
                          const lagIsRC = lagItemVat === "RC";
                          return (
                            <View key={`lag-${lagIdx}`} style={styles.tableRow}>
                              <Text style={[styles.cellText, styles.colLav]}>{item.label}</Text>
                              <Text style={[styles.cellText, styles.colQty]}>1</Text>
                              <Text style={[styles.cellTextSmall, styles.colUm]}>ac</Text>
                              <Text style={[styles.cellText, styles.colPrz]}>{formatCurrency(item.total)}</Text>
                              <Text style={[styles.cellTextSmall, styles.colSc]}></Text>
                              <Text style={[styles.cellText, styles.colPrzSc]}></Text>
                              <Text style={[styles.cellText, styles.colImp]}>{formatCurrency(item.total)}</Text>
                              <Text style={[styles.cellText, styles.colIva]}>{lagIsRC ? "RC" : `${lagItemVat}`}</Text>
                            </View>
                          );
                        });
                        return (
                          <>
                            <View style={styles.sectionHeader}>
                              <Text style={styles.sectionTitle}>{group.title}</Text>
                            </View>
                            {group.title === "Smontaggio" ? (
                              <>
                                {grpNonTransport.map((item: any, i: number) => renderItemRow(item, i, fase.faseDuration))}
                                {renderGrpLagunari()}
                                {grpTransport.map((item: any, i: number) => renderItemRow(item, grpNonTransport.length + i, fase.faseDuration))}
                              </>
                            ) : (
                              <>
                                {grpTransport.map((item: any, i: number) => renderItemRow(item, i, fase.faseDuration))}
                                {renderGrpLagunari()}
                                {grpNonTransport.map((item: any, i: number) => renderItemRow(item, grpTransport.length + i, fase.faseDuration))}
                              </>
                            )}
                          </>
                        );
                      })()}
                      {warehouseTotal > 0 && (
                        <View style={styles.tableRow}>
                          <Text style={[styles.cellText, styles.colLav]}>Preparazione lista del materiale in magazzino</Text>
                          <Text style={[styles.cellText, styles.colQty]}>1</Text>
                          <Text style={[styles.cellTextSmall, styles.colUm]}>ac</Text>
                          <Text style={[styles.cellText, styles.colPrz]}>{formatCurrency(warehouseGross)}</Text>
                          <Text style={[styles.cellTextSmall, styles.colSc]}>{warehouseDiscountPct > 0 ? warehouseDiscountPct : ""}</Text>
                          <Text style={[styles.cellText, styles.colPrzSc]}>{warehouseDiscountPct > 0 ? formatCurrency(warehouseTotal) : ""}</Text>
                          <Text style={[styles.cellText, styles.colImp]}>{formatCurrency(warehouseTotal)}</Text>
                          <Text style={[styles.cellText, styles.colIva]}>{isReverseCharge ? "RC" : `${vatRate}`}</Text>
                        </View>
                      )}
                      {group.handlingTotal > 0 && (
                        <View style={styles.tableRow}>
                          <Text style={[styles.cellText, styles.colLav]}>Movimentazione e Accessori</Text>
                          <Text style={[styles.cellText, styles.colQty]}>1</Text>
                          <Text style={[styles.cellTextSmall, styles.colUm]}>ac</Text>
                          <Text style={[styles.cellText, styles.colPrz]}>{formatCurrency(group.handlingTotal)}</Text>
                          <Text style={[styles.cellTextSmall, styles.colSc]}></Text>
                          <Text style={[styles.cellText, styles.colPrzSc]}></Text>
                          <Text style={[styles.cellText, styles.colImp]}>{formatCurrency(group.handlingTotal)}</Text>
                          <Text style={[styles.cellText, styles.colIva]}>{isReverseCharge ? "RC" : `${vatRate}`}</Text>
                        </View>
                      )}
                    </View>
                  )});
                });
              });

              return <>{allBlocks.map(b => b.content)}</>;
            } else {
              const allBlocks: any[] = [];
              let accumulated = FIRST_PAGE_USED;

              groupedSections.forEach((section, idx) => {
                const regularItems = section.items.filter((item: any) => item.phase !== "MOVIMENTAZIONE_MAGAZZINO");
                const warehouseItems = section.items.filter((item: any) => item.phase === "MOVIMENTAZIONE_MAGAZZINO");
                const warehouseTotal = warehouseItems.reduce((sum: number, item: any) => sum + (item.afterDiscount || 0), 0);
                const warehouseGross = warehouseItems.reduce((sum: number, item: any) => sum + (item.totaleRettificato || item.totalRow || item.afterDiscount || 0), 0);
                const warehouseDiscountPct = warehouseGross > 0 && warehouseTotal < warehouseGross ? Math.round((1 - warehouseTotal / warehouseGross) * 100) : 0;

                const sectionLagunariItems = section.title === "Montaggio" ? (quote.lagunariAndataItems || []) :
                  section.title === "Smontaggio" ? (quote.lagunariRitornoItems || []) : [];
                const sectionLagunariTotal = sectionLagunariItems.reduce((sum: number, item: any) => sum + item.total, 0);

                if (regularItems.length === 0 && warehouseTotal === 0 && !section.handlingTotal && sectionLagunariTotal === 0) return;

                const blockH = estimateBlockH(regularItems, warehouseTotal > 0, section.handlingTotal > 0, false, sectionLagunariItems.length);
                const needsBreak = accumulated + blockH > PAGE_H;
                if (needsBreak) {
                  accumulated = TABLE_HDR_H + blockH;
                } else {
                  accumulated += blockH;
                }

                const transportItems = regularItems.filter((item: any) => {
                  const p = item._phase || item.phase;
                  return p === "TRASPORTO_ANDATA" || p === "TRASPORTO_RITORNO";
                });
                const nonTransportItems = regularItems.filter((item: any) => {
                  const p = item._phase || item.phase;
                  return p !== "TRASPORTO_ANDATA" && p !== "TRASPORTO_RITORNO";
                });

                const renderLagunariRows = () => sectionLagunariItems.map((item: any, lagIdx: number) => {
                  const lagItemVat = item.vatRate || vatRate;
                  const lagIsRC = lagItemVat === "RC";
                  return (
                    <View key={`lag-${lagIdx}`} style={styles.tableRow}>
                      <Text style={[styles.cellText, styles.colLav]}>{item.label}</Text>
                      <Text style={[styles.cellText, styles.colQty]}>1</Text>
                      <Text style={[styles.cellTextSmall, styles.colUm]}>ac</Text>
                      <Text style={[styles.cellText, styles.colPrz]}>{formatCurrency(item.total)}</Text>
                      <Text style={[styles.cellTextSmall, styles.colSc]}></Text>
                      <Text style={[styles.cellText, styles.colPrzSc]}></Text>
                      <Text style={[styles.cellText, styles.colImp]}>{formatCurrency(item.total)}</Text>
                      <Text style={[styles.cellText, styles.colIva]}>{lagIsRC ? "RC" : `${lagItemVat}`}</Text>
                    </View>
                  );
                });

                allBlocks.push(
                  <View key={idx} break={needsBreak || undefined}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>{section.title}</Text>
                    </View>
                    {section.title === "Smontaggio" ? (
                      <>
                        {nonTransportItems.map((item: any, i: number) => renderItemRow(item, i))}
                        {renderLagunariRows()}
                        {transportItems.map((item: any, i: number) => renderItemRow(item, nonTransportItems.length + i))}
                      </>
                    ) : (
                      <>
                        {transportItems.map((item: any, i: number) => renderItemRow(item, i))}
                        {renderLagunariRows()}
                        {nonTransportItems.map((item: any, i: number) => renderItemRow(item, transportItems.length + i))}
                      </>
                    )}
                    {warehouseTotal > 0 && (
                      <View style={styles.tableRow}>
                        <Text style={[styles.cellText, styles.colLav]}>Preparazione lista del materiale in magazzino</Text>
                        <Text style={[styles.cellText, styles.colQty]}>1</Text>
                        <Text style={[styles.cellTextSmall, styles.colUm]}>ac</Text>
                        <Text style={[styles.cellText, styles.colPrz]}>{formatCurrency(warehouseGross)}</Text>
                        <Text style={[styles.cellTextSmall, styles.colSc]}>{warehouseDiscountPct > 0 ? warehouseDiscountPct : ""}</Text>
                        <Text style={[styles.cellText, styles.colPrzSc]}>{warehouseDiscountPct > 0 ? formatCurrency(warehouseTotal) : ""}</Text>
                        <Text style={[styles.cellText, styles.colImp]}>{formatCurrency(warehouseTotal)}</Text>
                        <Text style={[styles.cellText, styles.colIva]}>{isReverseCharge ? "RC" : `${vatRate}`}</Text>
                      </View>
                    )}
                    {section.handlingTotal > 0 && (
                      <View style={styles.tableRow}>
                        <Text style={[styles.cellText, styles.colLav]}>Movimentazione e Accessori</Text>
                        <Text style={[styles.cellText, styles.colQty]}>1</Text>
                        <Text style={[styles.cellTextSmall, styles.colUm]}>ac</Text>
                        <Text style={[styles.cellText, styles.colPrz]}>{formatCurrency(section.handlingTotal)}</Text>
                        <Text style={[styles.cellTextSmall, styles.colSc]}></Text>
                        <Text style={[styles.cellText, styles.colPrzSc]}></Text>
                        <Text style={[styles.cellText, styles.colImp]}>{formatCurrency(section.handlingTotal)}</Text>
                        <Text style={[styles.cellText, styles.colIva]}>{isReverseCharge ? "RC" : `${vatRate}`}</Text>
                      </View>
                    )}
                  </View>
                );
              });

              return <>{allBlocks}</>;
            }
          })()}
        </View>

        {/* Extra Sconto */}
        {(quote.extraDiscountAmount || 0) > 0 && (
          <View style={{ marginTop: 8 }} wrap={false}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Extra Sconto</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={[styles.cellText, styles.colLav]}>
                {quote.extraDiscountNote || "Sconto extra"}
              </Text>
              <Text style={[styles.cellText, styles.colQty]}>1</Text>
              <Text style={[styles.cellTextSmall, styles.colUm]}>ac</Text>
              <Text style={[styles.cellText, styles.colPrz]}>
                -{formatCurrency(quote.extraDiscountAmount)}
              </Text>
              <Text style={[styles.cellTextSmall, styles.colSc]}></Text>
              <Text style={[styles.cellText, styles.colPrzSc]}></Text>
              <Text style={[styles.cellText, styles.colImp]}>
                -{formatCurrency(quote.extraDiscountAmount)}
              </Text>
              <Text style={[styles.cellText, styles.colIva]}>
                {isReverseCharge ? "RC" : `${vatRate}`}
              </Text>
            </View>
          </View>
        )}

        {/* Promozioni Auto-Applicate - shown inline in the discounts area */}
        {(quote.appliedPromos || []).length > 0 && (
          <View style={{ marginTop: 8 }} wrap={false}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Sconti Promozionali</Text>
            </View>
            {(quote.appliedPromos as Array<{ promoId: string; code: string; description: string | null; discountPercent: number; isGlobal: boolean; articleCodes: string[] }>).map((promo) => (
              <View key={promo.promoId} style={styles.tableRow}>
                <Text style={[styles.cellText, styles.colLav]}>
                  {promo.description || "Promozione"}
                  {promo.isGlobal ? "" : ` (${promo.articleCodes.join(", ")})`}
                </Text>
                <Text style={[styles.cellText, styles.colQty]}></Text>
                <Text style={[styles.cellTextSmall, styles.colUm]}></Text>
                <Text style={[styles.cellText, styles.colPrz]}></Text>
                <Text style={[styles.cellTextSmall, styles.colSc]}>{promo.discountPercent}%</Text>
                <Text style={[styles.cellText, styles.colPrzSc]}></Text>
                <Text style={[styles.cellText, styles.colImp]}></Text>
                <Text style={[styles.cellText, styles.colIva]}></Text>
              </View>
            ))}
          </View>
        )}


        {/* Totali (allineati a destra) */}
        <View style={styles.totalsWrapper} wrap={false}>
          <View style={{ width: "55%" }} />
          <View style={styles.totalsBox}>
            {(quote.globalDiscount || 0) > 0 && (() => {
              const globalDiscountPct = quote.globalDiscount || 0;
              const itemsBeforeGlobal = (totals.itemsAfterDiscounts || totals.grandTotal) / (1 - globalDiscountPct / 100);
              const subtotalBeforeGlobal = itemsBeforeGlobal + (totals.handlingTotal || 0);
              const globalDiscountAmount = itemsBeforeGlobal * (globalDiscountPct / 100);
              return (
                <>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>SUBTOTALE</Text>
                    <Text style={styles.totalValue}>{formatCurrency(subtotalBeforeGlobal)} €</Text>
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Sconto Globale {globalDiscountPct}%</Text>
                    <Text style={styles.totalValue}>-{formatCurrency(globalDiscountAmount)} €</Text>
                  </View>
                </>
              );
            })()}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>IMPONIBILE</Text>
              <Text style={styles.totalValue}>
                {formatCurrency(
                  vatBreakdown?.totalImponibile || totals.grandTotal,
                )}{" "}
                €
              </Text>
            </View>

            {hasMixedRates && vatBreakdown?.usedRates ? (
              <>
                {vatBreakdown.usedRates.map(([rate, data]: [string, any]) => (
                  <View key={rate} style={[styles.totalRow, { paddingLeft: 10 }]}>
                    <Text style={[styles.totalLabel, { fontSize: 7 }]}>
                      {rate === "RC" ? "Imp. R.C." : `Imp. ${rate}%`}:{" "}
                      {formatCurrency(data.imponibile)} €
                    </Text>
                    <Text style={[styles.totalValue, { fontSize: 7 }]}>
                      {rate === "RC"
                        ? "Rev. Charge"
                        : `IVA: ${formatCurrency(data.iva)} €`}
                    </Text>
                  </View>
                ))}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>IVA TOTALE</Text>
                  <Text style={styles.totalValue}>
                    {formatCurrency(vatBreakdown.totalIva)} €
                  </Text>
                </View>
              </>
            ) : isReverseCharge ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>REVERSE CHARGE</Text>
                <Text
                  style={[
                    styles.totalValue,
                    { fontSize: 8, fontStyle: "italic" },
                  ]}
                >
                  IVA a carico del cliente
                </Text>
              </View>
            ) : (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>IVA ({vatRate}%)</Text>
                <Text style={styles.totalValue}>
                  {formatCurrency(
                    vatBreakdown?.totalIva ||
                      (totals.grandTotal * vatPercent) / 100,
                  )}{" "}
                  €
                </Text>
              </View>
            )}
            <View style={[styles.totalRow, { marginTop: 5 }]}>
              <Text style={[styles.totalLabel, { fontWeight: "bold" }]}>
                {(vatBreakdown?.totalIva || 0) > 0 ? "TOTALE IVATO" : "TOTALE"}
              </Text>
              <Text style={[styles.totalValue, { fontSize: 11 }]}>
                {formatCurrency(
                  vatBreakdown?.totalIvato ||
                    totals.grandTotal * (1 + vatPercent / 100),
                )}{" "}
                €
              </Text>
            </View>
          </View>
        </View>

        {/* BLOCCO INFORMAZIONI PAGAMENTO */}
        {(quote.paymentMethodName || cIban) && (
          <View style={{ marginTop: 10, paddingHorizontal: 5, marginBottom: 5 }} wrap={false}>
            <View style={{ borderWidth: 1, borderColor: "#050B41", borderRadius: 3, padding: 8 }}>
              <Text style={{ fontWeight: "bold", fontSize: 9, marginBottom: 4, color: "#050B41" }}>
                MODALITÀ DI PAGAMENTO
              </Text>
              {quote.paymentMethodName && (
                <Text style={{ fontSize: 8, marginBottom: 2 }}>
                  Pagamento: {quote.paymentMethodName}
                </Text>
              )}
              {cIban && (
                <Text style={{ fontSize: 8, marginBottom: 2 }}>
                  IBAN: {cIban}
                </Text>
              )}
              {cName && (
                <Text style={{ fontSize: 8 }}>
                  Intestatario: {cName}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* VALIDITÀ OFFERTA (sotto il box pagamento) */}
        {clauseSelections?.validita_offerta?.selected && clauseSelections.validita_offerta.text && (
          <View style={{ paddingHorizontal: 5, marginTop: 8, marginBottom: 5 }}>
            <Text style={styles.validityText}>
              {clauseSelections.validita_offerta.text}
            </Text>
          </View>
        )}

        <QuoteFooter {...footerProps} />
      </Page>

      {/* --- PAGINA: ALTRI SERVIZI OPZIONALI + NOTA BENE --- */}
      {(() => {
        const optionalServicesData = quote.globalParams?.optionalServices;
        const rawGlobalDistanceKm = quote.globalParams?.distanceKm || 0;
        const globalSquadraInZona = quote.squadraInZonaEnabled || quote.globalParams?.squadraInZonaEnabled;
        const globalSquadraInZonaKm = quote.squadraInZonaKm ?? quote.globalParams?.squadraInZonaKm ?? 0;
        const globalDistanceKm = globalSquadraInZona ? globalSquadraInZonaKm : rawGlobalDistanceKm;
        const firstFase = Array.isArray(quote.fasiConfig) && quote.fasiConfig.length > 0 ? quote.fasiConfig[0] : null;
        const phasesDistanceKm = firstFase
          ? (firstFase.squadraInZonaEnabled ? (firstFase.squadraInZonaKm || 0) : (firstFase.distanceKm || 0))
          : 0;
        const distanceKm = (quote.quoteMode === 'phases' || quote.quoteMode === 'a_corpo') && phasesDistanceKm > 0 ? phasesDistanceKm : globalDistanceKm;

        let selectedServiceIds: string[] = [];
        if (Array.isArray(optionalServicesData)) {
          selectedServiceIds = migrateLegacyServiceIds(optionalServicesData);
        } else if (
          optionalServicesData &&
          typeof optionalServicesData === "object"
        ) {
          const rawIds = Object.keys(optionalServicesData).filter(
            (k) => (optionalServicesData as Record<string, boolean>)[k],
          );
          selectedServiceIds = migrateLegacyServiceIds(rawIds);
        }

        const articlesForPricing: ArticleForPricing[] = (articles || []).map((a: any) => ({
          id: String(a.id),
          code: a.code,
          name: a.name,
          basePrice: a.basePrice,
          unitType: a.unitType,
          pricingLogic: a.pricingLogic,
          pricingData: a.pricingData,
          installationData: a.installationData,
          variantsData: a.variantsData,
          isAdditionalService: a.isAdditionalService ?? 0,
          serviceDescriptionMounting: a.serviceDescriptionMounting,
          serviceDescriptionRental: a.serviceDescriptionRental,
          serviceMountingApplyTrasferta: a.serviceMountingApplyTrasferta ?? 0,
          serviceUnitMounting: a.serviceUnitMounting,
          displayOrder: a.displayOrder ?? 0,
        }));

        const nol010ForPdf = articlesForPricing.find(a => a.code === "NOL-010");
        const reteAntipolvereQtyML = (() => {
          if (!nol010ForPdf) return 0;
          const checklistItemsArr: [string, { enabled: boolean; quantity: number }][] = quote.checklistItems || [];
          const entry = checklistItemsArr.find(([id]) => id === nol010ForPdf.id);
          if (!entry || !entry[1].enabled || entry[1].quantity <= 0) return 0;
          return entry[1].quantity;
        })();
        const svcDurationMonths = quote.globalParams?.durationMonths || 1;
        const svcPriceContext = { reteAntipolvereQtyML, durationMonths: svcDurationMonths };
        const allDynamicServices = buildDynamicServices(articlesForPricing);
        const isEconomiaService = (s: DynamicServiceEntry) => {
          const art = articlesForPricing.find(a => a.id === s.articleId);
          return (art?.name || '').toLowerCase().includes('in economia') || s.articleCode === "SRV-003" || s.articleCode === "SRV-007";
        };

        const selectedServices = allDynamicServices.filter((s) =>
          selectedServiceIds.includes(s.id) && !isEconomiaService(s),
        );

        const nbClauses = clauseSelections
          ? Object.entries(clauseSelections).filter(
              ([id, sel]) => id.startsWith("nb_") && sel.selected && sel.text.trim(),
            )
          : [];
        const allEconomiaServices = allDynamicServices.filter(isEconomiaService);
        const economiaServices = allEconomiaServices.filter(s => {
          const isLongDistance = s.articleCode === "SRV-007";
          const useHighRate = distanceKm >= 70;
          return useHighRate ? isLongDistance : !isLongDistance;
        });
        const customTexts = quote.globalParams?.optionalServicesTexts as Record<string, string> | undefined;

        const hasCustomServiceNote = clauseSelections?.custom_service_note?.selected && clauseSelections.custom_service_note.text.trim();
        const hasOptionalServices = selectedServices.length > 0 || !!hasCustomServiceNote;
        const hasCustomClauseNote = clauseSelections?.custom_clause_note?.selected && clauseSelections.custom_clause_note.text.trim();
        const hasNotaBene = nbClauses.length > 0 || economiaServices.length > 0 || !!hasCustomClauseNote;

        if (!hasOptionalServices && !hasNotaBene) return null;

        return (
          <Page size="A4" style={styles.page}>
            <QuoteHeader {...headerProps} />

            {hasOptionalServices && (
              <View style={styles.installazioneContainer}>
                <View style={styles.installazioneTitleBoxFirst}>
                  <Text style={styles.installazioneTitle}>
                    ALTRI SERVIZI OPZIONALI NON COMPRESI NEL PREZZO TOTALE
                  </Text>
                </View>
                {selectedServices.map((service) => {
                  const articleForSvc = articlesForPricing.find(a => a.id === service.articleId);
                  const price = articleForSvc
                    ? calculateDynamicServicePrice(service, articleForSvc, distanceKm, svcPriceContext)
                    : 0;
                  const svcCustomTexts = quote.globalParams
                    ?.optionalServicesTexts as Record<string, string> | undefined;
                  const displayText = svcCustomTexts?.[service.id] || service.label;
                  return (
                    <Text key={service.id} style={styles.installazioneClause}>
                      [ ] {displayText} -{" "}
                      {price > 0 ? `€ ${formatCurrency(price)} ` : ""}
                      {service.unit}
                    </Text>
                  );
                })}
                {clauseSelections?.custom_service_note?.selected && clauseSelections.custom_service_note.text.trim() && (
                  <Text style={styles.installazioneClause}>
                    {clauseSelections.custom_service_note.text}
                  </Text>
                )}
              </View>
            )}

            {hasNotaBene && (
              <View style={styles.installazioneContainer}>
                <View style={styles.installazioneTitleBoxFirst}>
                  <Text style={styles.installazioneTitle}>NOTA BENE</Text>
                </View>
                {economiaServices.map((service) => {
                  const articleForSvc = articlesForPricing.find(a => a.id === service.articleId);
                  const price = articleForSvc
                    ? calculateDynamicServicePrice(service, articleForSvc, distanceKm, svcPriceContext)
                    : 0;
                  const displayText = customTexts?.[service.id] || service.label;
                  return (
                    <Text key={service.id} style={styles.installazioneClause}>
                      - {displayText} -{" "}
                      {price > 0 ? `€ ${formatCurrency(price)} ` : ""}
                      {service.unit}
                    </Text>
                  );
                })}
                {nbClauses.map(([clauseId, selection]) => (
                  <Text key={clauseId} style={styles.installazioneClause}>
                    - {selection.text}
                  </Text>
                ))}
                {clauseSelections?.custom_clause_note?.selected && clauseSelections.custom_clause_note.text.trim() && (
                  <Text style={styles.installazioneClause}>
                    - {clauseSelections.custom_clause_note.text}
                  </Text>
                )}
              </View>
            )}

            <QuoteFooter {...footerProps} />
          </Page>
        );
      })()}

      {/* --- PAGINA 3: T&C e FIRMA --- */}
      <Page size="A4" style={styles.page}>
        <QuoteHeader {...headerProps} />

        <View style={styles.installazioneTitleBoxFirst}>
          <Text style={styles.installazioneTitle}>
            CONDIZIONI GENERALI E ACCETTAZIONE
          </Text>
        </View>

        {/* PRIMO PARAGRAFO */}
        <View style={{ paddingHorizontal: 5 }}>
          <Text style={styles.justifyText}>
            Il presente Ordine è disciplinato è regolato dalle condizioni
            generali di contratto Da.Do. Ponteggi S.r.l. società unipersonale,
            Rev. 01 del 17.03.2025, che il Cliente dichiara di conoscere
            integralmente e nel dettaglio, tali condizioni costituiscono parte
            integrante ed essenziale del presente Ordine e del Contratto
            conseguente. I termini con l'iniziale maiuscola di cui al presente
            Ordine possiedono il medesimo significato agli stessi attribuito
            dalle condizioni generali di contratto.
          </Text>
          <SignatureBlock />
        </View>

        {/* SECONDO PARAGRAFO */}
        <View style={{ paddingHorizontal: 5 }}>
          <Text style={styles.justifyText}>
            Ai sensi e per gli effetti degli artt. 1341 e 1342 c.c. si approvano
            espressamente, reietta sin d'ora ogni eccezione, le clausole delle
            condizioni generali di contratto Da.Do. Ponteggi, Rev. 01 del
            17.03.2025, di cui agli art.: 3) - Disciplina degli ordini; 4) –
            Caratteristiche delle attrezzature - Proprietà; 5) – Modalità di
            utilizzo delle attrezzature; 6) – Trasporto; 7) – Montaggio -
            Smontaggio; 8) – Variazioni ai Servizi; 9) – Manutenzione; 10) –
            Durata del noleggio; 11) – Restituzione; 13) – Pagamenti; 15) –
            Responsabilità e garanzie del Locatore; 16) – Garanzie del cliente -
            Assicurazione; 17) – Cessione del contratto – Subnoleggio; 18) –
            Diritto di recesso; 20) – Solve et repete; 24) – Legge applicabile -
            risoluzione delle controversie e Foro competente.
          </Text>
          <SignatureBlock />
        </View>

        {/* TERZO PARAGRAFO */}
        <View style={{ paddingHorizontal: 5 }}>
          <Text style={styles.justifyText}>
            La società Da.Do. Ponteggi è autorizzata a pubblicare per finalità
            di promozione e marketing aziendale, immagini fotografiche, riprese
            video e disegni tecnici relativi ai cantieri dei propri Clienti.
            Tali contenuti potranno essere diffusi attraverso i propri siti web,
            social network, cataloghi, materiali pubblicitari e qualsiasi altro
            canale di comunicazione, al fine di valorizzare e promuovere le
            competenze, i servizi e le soluzioni offerte dalla società.
          </Text>
          <SignatureBlock />
        </View>

        <QuoteFooter {...footerProps} />
      </Page>

      {/* --- PAGINA DATI CLIENTE E CANTIERE --- */}
      <Page size="A4" style={styles.page}>
        <QuoteHeader {...headerProps} />

        <View style={styles.installazioneTitleBoxFirst}>
          <Text style={styles.installazioneTitle}>
            DATI CLIENTE E CANTIERE
          </Text>
        </View>

        <View style={{ paddingHorizontal: 5, marginBottom: 20 }}>
          <Text style={styles.justifyText}>
            In base alle Normative vigenti si richiede gentilmente di inviare il
            P.S.C. (Piano di sicurezza e coordinamento) del cantiere
            all'accettazione dell'offerta all'indirizzo e-mail:
            tecnico@azienda.it
          </Text>
        </View>

        {/* SEZIONE DATI DITTA APPALTATRICE */}
        <View style={{ paddingHorizontal: 5, marginBottom: 15 }}>
          <Text style={styles.sectionHeaderBold}>DATI DITTA APPALTATRICE:</Text>

          {[
            "Ragione Sociale:",
            "Indirizzo:",
            "Partita IVA:",
            "Codice Fiscale:",
            "Vs. Mail Pec:",
            "Vs. Codice destinatario SDI:",
            "Banca d'appoggio:",
            "Vs. Codice IBAN:",
          ].map((label, i) => (
            <View key={i} style={styles.clientDataRow}>
              <Text style={styles.clientDataLabel}>{label}</Text>
              <View style={styles.clientDataLine} />
            </View>
          ))}
        </View>

        {/* SEZIONE DATI CANTIERE */}
        <View style={{ paddingHorizontal: 5 }}>
          <Text style={styles.sectionHeaderBold}>DATI CANTIERE:</Text>

          {[
            "Data inizio montaggio ponteggio:",
            "Data fine noleggio indicativa:",
            "Committente:",
            "Indirizzo committente:",
            "C.F. Committente:",
            "Lavori di:",
            "Responsabile lavori:",
            "Indirizzo responsabile lavori:",
            "Direzione Lavori:",
            "Indirizzo direzione Lavori:",
            "Responsabile sicurezza:",
            "Indirizzo responsabile sicurezza:",
          ].map((label, i) => (
            <View key={i} style={styles.clientDataRow}>
              <Text style={styles.clientDataLabelLong}>{label}</Text>
              <View style={styles.clientDataLine} />
            </View>
          ))}
        </View>

        <QuoteFooter {...footerProps} />
      </Page>
    </Document>
  );
}
