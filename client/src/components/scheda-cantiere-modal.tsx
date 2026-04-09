import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Loader2,
  ExternalLink,
  Euro,
  MapPin,
  HardHat,
  AlertTriangle,
  ClipboardCheck,
  Calendar,
  User,
  Truck,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface SiteReferent {
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
}

interface SiteLead {
  entityType: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

interface SiteOpportunity {
  workType?: string | null;
  siteAddress?: string | null;
  siteCity?: string | null;
  siteZip?: string | null;
  siteProvince?: string | null;
  mapsLink?: string | null;
  sopralluogoFatto?: boolean | null;
  estimatedStartDate?: string | null;
  estimatedEndDate?: string | null;
  description?: string | null;
  ponteggioPerArray?: string[] | null;
  gruCantiere?: string | null;
  luciSegnalazione?: string | null;
  ancoraggi?: string | null;
  maestranze?: string | null;
  orariLavoro?: string | null;
  aCaricoClienteArray?: string[] | null;
  montacarichi?: {
    tipologia?: string | null;
    altezzaMt?: number | null;
    numeroSbarchi?: number | null;
    tipoSbarchi?: string | null;
  } | null;
  transpallet?: string | null;
  posizCamion?: string | null;
  puoScaricare?: string | null;
  luogoScarico?: string[] | null;
  ritiroEsubero?: boolean | null;
  cartelliStradali?: string | null;
  permessiViabilita?: string | null;
  permessoSosta?: string | null;
}

interface SiteQuote {
  id: string;
  number?: string | null;
  totalAmount?: string | number | null;
  globalParams?: {
    durationMonths?: number | null;
    distanceKm?: number | null;
  } | null;
  pdfData?: {
    quote?: { quoteMode?: string } | null;
  } | null;
}

interface SiteQuoteItem {
  id: string;
  phase: string;
  articleName?: string | null;
  articleId?: string | null;
  quantity: string | number;
  pricingLogic?: string | null;
}

interface SiteTransportInfo {
  vehicleName: string;
  vehicleDescription?: string | null;
  trips: number;
}

interface SiteProject {
  clientName?: string | null;
}

interface SiteDetails {
  opportunity?: SiteOpportunity | null;
  lead?: SiteLead | null;
  referent?: SiteReferent | null;
  quote?: SiteQuote | null;
  quoteItems?: SiteQuoteItem[];
  project?: SiteProject | null;
  transportInfo?: SiteTransportInfo[];
}

const workTypeLabels: Record<string, string> = {
  PRIVATE: "Privato",
  PUBLIC: "Pubblico",
  SUBCONTRACT: "Subappalto",
};

const ponteggioPerLabels: Record<string, string> = {
  FACCIATA: "Facciata", TETTO: "Tetto", DEMOLIZIONE: "Demolizione",
  RISTRUTTURAZIONE: "Ristrutt. interna", MANUTENZIONE: "Manutenzione",
  COPERTURA: "Copertura", IMPERMEABILIZZAZIONE: "Impermeabilizzazione",
  CAPPOTTO: "Cappotto termico", PITTURA: "Pittura", NUOVA_COSTR: "Nuova costruzione",
  TERRAZZE: "Terrazze", CANNE_FUMARIE: "Canne fumarie", GRONDAIE: "Grondaie",
  PIANO_CARICO: "Piano di carico", CASTELLO_RISALITA: "Castello di risalita",
  FINESTRE_SCURI: "Finestre/scuri", ALTRO: "Altro",
};
const siNoLabels: Record<string, string> = { NO: "No", SI_NOSTRO: "Sì (nostro)", SI_CLIENTE: "Sì (del cliente)" };
const gruLabels = siNoLabels;
const transpalletLabels = siNoLabels;
const luciSegnalazioneLabels = siNoLabels;
const cartelliStradaliLabels = siNoLabels;
const permessiViabilitaLabels = siNoLabels;
const permessoSostaLabels = siNoLabels;
const posizCamionLabels: Record<string, string> = { FUORI: "Fuori dal cantiere", DENTRO: "Dentro al cantiere" };
const puoScaricarLabels: Record<string, string> = {
  DURANTE_LAVORI: "Durante i lavori", SENZA_SQUADRA: "Senza squadra",
  ORARI_PRECISI: "Orari precisi", NESSUN_LIMITE: "Nessun limite",
};
const luogoScaricoLabels: Record<string, string> = {
  AREA_CANTIERE: "Area cantiere", IN_STRADA: "In strada",
  MARCIAPIEDE: "Marciapiede", CORTILE: "Cortile", PARCHEGGIO: "Parcheggio",
};
const anchoringLabels: Record<string, string> = {
  OCCHIOLI_CORTI: "Occhioli corti", OCCHIOLI_CAPPOTTO_X: "Occhioli cappotto da ?",
  OCCHIOLI_CAPPOTTO_5: "Occhioli cappotto da 5", OCCHIOLI_CAPPOTTO_8: "Occhioli cappotto da 8",
  OCCHIOLI_CAPPOTTO_10: "Occhioli cappotto da 10", OCCHIOLI_CAPPOTTO_12: "Occhioli cappotto da 12",
  OCCHIOLI_CAPPOTTO_15: "Occhioli cappotto da 15", OCCHIOLI_CAPPOTTO_18: "Occhioli cappotto da 18",
  OCCHIOLI_CAPPOTTO_20: "Occhioli cappotto da 20", OCCHIOLI_CAPPOTTO_22: "Occhioli cappotto da 22",
  OCCHIOLI_CAPPOTTO_25: "Occhioli cappotto da 25", SPINTE: "Spinte", A_CRAVATTA: "A cravatta",
  ZAVORRE: "Zavorre", PUNTONI: "Puntoni", NO_ANCORAGGI: "No ancoraggi",
  VARIABILE: "Variabile", ALTRO: "Altro",
};
const maestranzeLabels: Record<string, string> = {
  SOLO_DIPENDENTI: "Solo dipendenti", DIPENDENTI_PERM: "Dipendenti con perm.",
  DIPENDENTI_ARTIGIANI: "Dipendenti e artigiani", DIP_ART_PERM: "Dip. e Art. con perm.",
  PARTNERS: "Partners", DA_VERIFICARE: "Da verificare",
};
const orariLabels: Record<string, string> = {
  STANDARD: "Standard", ORARI_PRESTABILITI: "Orari prestabiliti",
  SOLO_FESTIVI: "Solo festivi", NO_MERCATO: "No quando c'è mercato",
  NO_SABATO: "No sabato", DA_VERIFICARE: "Da verificare",
};
const aCaricoLabels: Record<string, string> = {
  RIMOZ_PENSILINE: "Rimoz. pensiline", RIMOZ_TENDE: "Rimoz. tende",
  PUNTELLAMENTI: "Puntellamenti", ISOLAMENTO_CAVI: "Isolamento cavi",
  PERM_OCCUPAZIONE: "Perm. di occupazione", LEGNAME: "Legname", ASSITO: "Assito",
  PARAPETTI_TETTO: "Parapetti tetto", APERTURA_RETI: "Apertura reti giardini", ALTRO: "Altro",
};

function InfoRow({ label, value, icon: Icon }: { label: string; value: string | null | undefined; icon?: React.ElementType }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-1.5 py-0.5">
      {Icon && <Icon className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />}
      <div className="min-w-0">
        <span className="text-[11px] text-muted-foreground leading-tight">{label}</span>
        <p className="text-xs font-medium leading-tight">{value}</p>
      </div>
    </div>
  );
}

function SectionHeader({ title, icon: Icon }: { title: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-1.5 pb-0.5 mb-1 border-b">
      <Icon className="w-3.5 h-3.5 text-primary" />
      <h3 className="text-xs font-semibold uppercase tracking-wide">{title}</h3>
    </div>
  );
}

type QuoteMode = "rental" | "labor_only" | "phases";

function detectQuoteMode(quoteItems: SiteQuoteItem[], pdfData: SiteQuote["pdfData"]): QuoteMode {
  if (pdfData?.quote?.quoteMode) return pdfData.quote.quoteMode as QuoteMode;
  const hasNoleggio = quoteItems.some((i) => i.phase === "NOLEGGIO");
  const phases = quoteItems.map((i) => i.phase);
  const hasFaseIndex = phases.some((p) => /^\d+:/.test(p));
  if (hasFaseIndex) return "phases";
  if (!hasNoleggio) return "labor_only";
  return "rental";
}

function getUnit(item: SiteQuoteItem): string {
  const logic = item.pricingLogic;
  if (logic === "RENTAL") return "mq";
  if (logic === "SALE") return "mq";
  if (logic === "DOCUMENT" || logic === "SERVICE") return "cad";
  if (logic === "TRANSPORT") return "viaggio";
  return "pz";
}

function formatCurrency(val: string | number | null | undefined): string | null {
  if (!val) return null;
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return null;
  return `€ ${num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

export function SchedaCantiereModal({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {

  const { data, isLoading } = useQuery<SiteDetails>({
    queryKey: ["/api/projects", projectId, "site-details"],
    enabled: open,
  });

  const opp = data?.opportunity;
  const lead = data?.lead;
  const referent = data?.referent;
  const quote = data?.quote;
  const quoteItems = data?.quoteItems ?? [];
  const project = data?.project;
  const globalParams = quote?.globalParams;
  const montacarichi = opp?.montacarichi;
  const transportInfo = data?.transportInfo ?? [];

  const quoteMode = detectQuoteMode(quoteItems, quote?.pdfData);
  const quoteModeLabels: Record<string, string> = {
    rental: "Noleggio + Manodopera",
    labor_only: "Solo Manodopera",
    phases: "A Fasi",
  };

  const phaseOrder: string[] = quoteMode === "labor_only"
    ? ["MONTAGGIO", "SMONTAGGIO", "DOCUMENTI"]
    : ["MONTAGGIO", "SMONTAGGIO", "NOLEGGIO", "DOCUMENTI"];
  const phaseLabels: Record<string, string> = {
    MONTAGGIO: "Montaggio",
    SMONTAGGIO: "Smontaggio",
    NOLEGGIO: "Noleggio / Fornitura",
    DOCUMENTI: "Documenti e Servizi",
  };
  const groupedItems = quoteMode === "phases"
    ? (() => {
        const seen = new Set<string>();
        const order: string[] = [];
        for (const item of quoteItems) {
          if (item.phase && !seen.has(item.phase)) {
            seen.add(item.phase);
            order.push(item.phase);
          }
        }
        return order.map((phase) => ({
          phase,
          label: phase,
          items: quoteItems.filter((i) => i.phase === phase),
        }));
      })()
    : phaseOrder
        .map((phase) => ({
          phase,
          label: phaseLabels[phase] || phase,
          items: quoteItems.filter((i) => i.phase === phase),
        }))
        .filter((g) => g.items.length > 0);

  const clientName = lead
    ? lead.entityType === "COMPANY"
      ? lead.name ?? ""
      : `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim()
    : project?.clientName ?? "";

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="w-4 h-4" />
            Scheda Cantiere
          </DialogTitle>
          <DialogDescription className="text-xs">
            Riepilogo completo delle informazioni dal preventivo
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground text-center py-8">Dati non disponibili</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-muted/50 border space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm" data-testid="scheda-client-name">{clientName}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      {opp?.workType && (
                        <Badge
                          variant="outline"
                          className="text-[10px]"
                          style={{
                            borderColor: opp.workType === "PUBLIC" ? "#61CE85" : "#4563FF",
                            color: opp.workType === "PUBLIC" ? "#61CE85" : "#4563FF",
                          }}
                        >
                          {workTypeLabels[opp.workType] || opp.workType}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {opp?.siteAddress && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span>
                        {[opp.siteAddress, opp.siteCity, opp.siteZip, opp.siteProvince]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </div>
                  )}
                  {opp?.mapsLink && (
                    <a
                      href={opp.mapsLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-primary hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="w-2.5 h-2.5" /> Google Maps
                    </a>
                  )}
                </div>

                <div
                  data-testid="badge-sopralluogo"
                  className={`p-2 rounded-lg border-2 flex items-center gap-2 ${
                    opp?.sopralluogoFatto
                      ? "bg-green-50 border-green-400 text-green-700"
                      : "bg-red-50 border-red-400 text-red-700"
                  }`}
                >
                  {opp?.sopralluogoFatto ? (
                    <ClipboardCheck className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span className="text-xs font-bold uppercase tracking-wide">
                    {opp?.sopralluogoFatto ? "Sopralluogo fatto" : "Sopralluogo da fare"}
                  </span>
                </div>

                {referent && (
                  <div>
                    <SectionHeader title="Referente" icon={User} />
                    <InfoRow
                      label="Nome"
                      value={`${referent.firstName ?? ""} ${referent.lastName ?? ""}`.trim()}
                    />
                    {referent.role && <InfoRow label="Ruolo" value={referent.role} />}
                    <InfoRow label="Telefono" value={referent.phone} />
                    <InfoRow label="Cellulare" value={referent.mobile} />
                    <InfoRow label="Email" value={referent.email} />
                  </div>
                )}

                <div>
                  <SectionHeader title="Date e Durata" icon={Calendar} />
                  <InfoRow
                    label="Inizio previsto"
                    value={
                      opp?.estimatedStartDate
                        ? format(new Date(opp.estimatedStartDate), "dd MMM yyyy", { locale: it })
                        : null
                    }
                  />
                  {globalParams?.durationMonths && (
                    <InfoRow label="Durata noleggio" value={`${globalParams.durationMonths} mesi`} />
                  )}
                  {globalParams?.distanceKm && (
                    <InfoRow label="Distanza cantiere" value={`${globalParams.distanceKm} km`} />
                  )}
                </div>

                {opp?.description && (
                  <div>
                    <SectionHeader title="Note" icon={FileText} />
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{opp.description}</p>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <SectionHeader title="Ponteggio" icon={HardHat} />
                  {opp?.ponteggioPerArray && opp.ponteggioPerArray.length > 0 && (
                    <InfoRow
                      label="Ponteggio per"
                      value={opp.ponteggioPerArray.map((p) => ponteggioPerLabels[p] || p).join(", ")}
                    />
                  )}
                  <InfoRow
                    label="Gru cantiere"
                    value={opp?.gruCantiere ? gruLabels[opp.gruCantiere] || opp.gruCantiere : null}
                  />
                  <InfoRow
                    label="Luci segnalazione"
                    value={
                      opp?.luciSegnalazione
                        ? luciSegnalazioneLabels[opp.luciSegnalazione] || opp.luciSegnalazione
                        : null
                    }
                  />
                  <InfoRow
                    label="Ancoraggi"
                    value={opp?.ancoraggi ? anchoringLabels[opp.ancoraggi] || opp.ancoraggi : null}
                  />
                  <InfoRow
                    label="Maestranze"
                    value={
                      opp?.maestranze ? maestranzeLabels[opp.maestranze] || opp.maestranze : null
                    }
                  />
                  <InfoRow
                    label="Orari lavoro"
                    value={
                      opp?.orariLavoro ? orariLabels[opp.orariLavoro] || opp.orariLavoro : null
                    }
                  />
                  {opp?.aCaricoClienteArray && opp.aCaricoClienteArray.length > 0 && (
                    <InfoRow
                      label="A carico cliente"
                      value={opp.aCaricoClienteArray.map((a) => aCaricoLabels[a] || a).join(", ")}
                    />
                  )}
                  {montacarichi && (montacarichi.tipologia || montacarichi.altezzaMt) && (
                    <div className="mt-1 p-1.5 rounded bg-muted/30 border">
                      <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">
                        Montacarichi
                      </p>
                      <InfoRow label="Tipologia" value={montacarichi.tipologia} />
                      <InfoRow
                        label="Altezza"
                        value={montacarichi.altezzaMt ? `${montacarichi.altezzaMt} m` : null}
                      />
                      <InfoRow
                        label="N. sbarchi"
                        value={montacarichi.numeroSbarchi?.toString()}
                      />
                      <InfoRow label="Tipo sbarchi" value={montacarichi.tipoSbarchi} />
                    </div>
                  )}
                </div>

                <div>
                  <SectionHeader title="Trasporti" icon={Truck} />
                  <InfoRow
                    label="Transpallet"
                    value={
                      opp?.transpallet
                        ? transpalletLabels[opp.transpallet] || opp.transpallet
                        : null
                    }
                  />
                  <InfoRow
                    label="Posiz. camion"
                    value={
                      opp?.posizCamion
                        ? posizCamionLabels[opp.posizCamion] || opp.posizCamion
                        : null
                    }
                  />
                  <InfoRow
                    label="Può scaricare"
                    value={
                      opp?.puoScaricare
                        ? puoScaricarLabels[opp.puoScaricare] || opp.puoScaricare
                        : null
                    }
                  />
                  {opp?.luogoScarico && opp.luogoScarico.length > 0 && (
                    <InfoRow
                      label="Luogo scarico"
                      value={opp.luogoScarico.map((l) => luogoScaricoLabels[l] || l).join(", ")}
                    />
                  )}
                  <InfoRow
                    label="Ritiro esubero"
                    value={
                      opp?.ritiroEsubero != null
                        ? opp.ritiroEsubero
                          ? "Sì"
                          : "No"
                        : null
                    }
                  />
                  <InfoRow
                    label="Cartelli stradali"
                    value={
                      opp?.cartelliStradali
                        ? cartelliStradaliLabels[opp.cartelliStradali] || opp.cartelliStradali
                        : null
                    }
                  />
                  <InfoRow
                    label="Permessi viabilità"
                    value={
                      opp?.permessiViabilita
                        ? permessiViabilitaLabels[opp.permessiViabilita] || opp.permessiViabilita
                        : null
                    }
                  />
                  <InfoRow
                    label="Permesso sosta"
                    value={
                      opp?.permessoSosta
                        ? permessoSostaLabels[opp.permessoSosta] || opp.permessoSosta
                        : null
                    }
                  />
                </div>
              </div>

              <div>
                {quote && (
                  <div>
                    <SectionHeader title="Preventivo" icon={Euro} />
                    <div className="p-2 rounded-md bg-muted/30 border mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium">{quote.number || "Preventivo"}</span>
                      </div>
                      {quote.totalAmount && (
                        <span className="text-sm font-bold text-primary" data-testid="scheda-quote-total">
                          {formatCurrency(quote.totalAmount)}
                        </span>
                      )}
                    </div>
                    <div className="mb-2">
                      <InfoRow label="Tipo preventivo" value={quoteModeLabels[quoteMode]} />
                    </div>

                    {transportInfo.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] font-semibold text-muted-foreground mb-1">
                          Mezzi previsti
                        </p>
                        <div className="space-y-1">
                          {transportInfo.map((t, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between p-1.5 rounded bg-blue-50/50 dark:bg-blue-950/20 border text-[11px]"
                            >
                              <div>
                                <span className="font-medium">{t.vehicleName}</span>
                                {t.vehicleDescription && (
                                  <span className="text-muted-foreground ml-1">
                                    — {t.vehicleDescription}
                                  </span>
                                )}
                              </div>
                              <span className="font-semibold shrink-0 ml-2">
                                {t.trips} {t.trips === 1 ? "viaggio" : "viaggi"} A/R
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {groupedItems.length > 0 && (
                      <div className="border rounded-md overflow-hidden overflow-y-auto">
                        <table className="w-full text-[11px]">
                          <thead className="sticky top-0 bg-muted/80">
                            <tr>
                              <th className="text-left p-1.5 font-medium">Articolo</th>
                              <th className="text-right p-1.5 font-medium w-14">Qtà</th>
                              <th className="text-right p-1.5 font-medium w-12">U.M.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {groupedItems.map((group) => (
                              <>
                                <tr key={`h-${group.phase}`} className="bg-muted/40">
                                  <td
                                    colSpan={3}
                                    className="p-1 px-1.5 font-semibold text-[10px] uppercase tracking-wide text-muted-foreground"
                                  >
                                    {group.label}
                                  </td>
                                </tr>
                                {group.items.map((item) => (
                                  <tr key={item.id} className="border-t">
                                    <td className="p-1.5 max-w-[180px] truncate">
                                      {item.articleName || item.articleId}
                                    </td>
                                    <td className="p-1.5 text-right">
                                      {Math.round(parseFloat(String(item.quantity)))}
                                    </td>
                                    <td className="p-1.5 text-right text-muted-foreground">
                                      {getUnit(item)}
                                    </td>
                                  </tr>
                                ))}
                              </>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

    </>
  );
}
