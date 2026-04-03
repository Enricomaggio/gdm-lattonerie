import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Shield,
  TrendingUp,
  CreditCard,
  Calendar,
  CheckCircle,
  AlertTriangle,
  Building2,
  Users,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Briefcase,
  BarChart3,
  FileText,
  Network,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { CreditsafeReport } from "@shared/schema";
import { formatCurrency as formatCurrencyNumber } from "@/lib/formatCurrency";

interface CreditSafeAnalysisProps {
  report: CreditsafeReport;
  onRefresh: () => void;
  isRefreshing: boolean;
  canRefresh: boolean;
}

const formatCurrency = (value: number | null | undefined) => {
  if (value == null) return "N/D";
  return `€ ${formatCurrencyNumber(value)}`;
};

const formatNumber = (value: number | null | undefined, decimals = 2) => {
  if (value == null) return "N/D";
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

const formatPercent = (value: number | null | undefined) => {
  if (value == null) return "N/D";
  return `${formatNumber(value)}%`;
};

const getCreditScoreColor = (score: number | null) => {
  if (score === null || score === undefined)
    return "bg-muted text-muted-foreground";
  if (score <= 30)
    return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300";
  if (score <= 60)
    return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300";
  return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300";
};

function SectionHeader({
  icon: Icon,
  title,
  isOpen,
}: {
  icon: typeof Shield;
  title: string;
  isOpen: boolean;
}) {
  return (
    <CollapsibleTrigger asChild>
      <div className="flex items-center gap-2 cursor-pointer select-none py-3 px-1">
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="font-semibold text-foreground">{title}</span>
      </div>
    </CollapsibleTrigger>
  );
}

function getFinancialStatements(r: any): any[] {
  const localIT = (r?.localFinancialStatements || []).filter(
    (fs: any) => fs?.type === "LocalFinancialsCSIT" && fs?.yearEndDate
  );
  const globalGGS = (r?.financialStatements || []).filter(
    (fs: any) => fs?.type === "GlobalFinancialsGGS" && fs?.yearEndDate
  );
  const allLocal = (r?.localFinancialStatements || []).filter(
    (fs: any) => fs?.yearEndDate
  );
  const allGlobal = (r?.financialStatements || []).filter(
    (fs: any) => fs?.yearEndDate
  );

  const statements =
    localIT.length > 0
      ? localIT
      : globalGGS.length > 0
        ? globalGGS
        : allLocal.length > 0
          ? allLocal
          : allGlobal;

  return [...statements].sort(
    (a: any, b: any) =>
      new Date(a.yearEndDate).getTime() - new Date(b.yearEndDate).getTime()
  );
}

function getYears(statements: any[]): number[] {
  return statements.map((fs) => new Date(fs.yearEndDate).getFullYear());
}

export default function CreditSafeAnalysis({
  report,
  onRefresh,
  isRefreshing,
  canRefresh,
}: CreditSafeAnalysisProps) {
  const [panoramicaOpen, setPanoramicaOpen] = useState(true);
  const [riskOpen, setRiskOpen] = useState(true);
  const [kpiOpen, setKpiOpen] = useState(true);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [plOpen, setPlOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);

  const r = (report.rawReport as any)?.report || report.rawReport || {};
  const altSummary = r?.alternateSummary || {};
  const companySummaryExtra = r?.companySummaryExtra || {};
  const extendedGroup = r?.extendedGroupStructure || [];
  const statements = getFinancialStatements(r);
  const years = getYears(statements);

  const chartConfigs = [
    {
      title: "Ricavi Operativi",
      data: report.revenue as { year: number; value: number }[] | null,
      color: "bg-blue-500 dark:bg-blue-400",
      isCurrency: true,
    },
    {
      title: "Flusso di Cassa",
      data: report.cashFlow as { year: number; value: number }[] | null,
      color: "bg-teal-500 dark:bg-teal-400",
      isCurrency: true,
    },
    {
      title: "Utile Netto",
      data: report.profit as { year: number; value: number }[] | null,
      color: "bg-green-500 dark:bg-green-400",
      isCurrency: true,
      canBeNegative: true,
    },
    {
      title: "Tempo Medio Pagamento",
      data: report.avgPaymentDays as { year: number; value: number }[] | null,
      color: "bg-orange-500 dark:bg-orange-400",
      isCurrency: false,
    },
  ];

  const commentaries: any[] = altSummary?.commentaries || [];

  const riskIndicators = [
    { key: "hasProtesti", label: "Protesti" },
    { key: "hasSevereProtesti", label: "Protesti Gravi" },
    { key: "hasPrejudicials", label: "Pregiudizievoli" },
    { key: "hasSeverePrejudicials", label: "Pregiudizievoli Gravi" },
    { key: "hasInsolvency", label: "Insolvenze" },
    { key: "hasCompaniesInsolvency", label: "Insolvenze Societarie" },
    { key: "hasCigsEvents", label: "Eventi CIGS" },
  ];

  const ratioRows = [
    { key: "acidTest", label: "Acid Test", format: "number" },
    { key: "currentRatio", label: "Current Ratio", format: "number" },
    { key: "ebitdaMargin", label: "EBITDA Margin", format: "percent" },
    { key: "ebitMargin", label: "EBIT Margin", format: "percent" },
    {
      key: "returnOnEquityPercentage",
      label: "ROE",
      format: "percent",
      altKey: "returnOnEquity",
    },
    {
      key: "returnOnInvestmentPercentage",
      label: "ROI",
      format: "percent",
      altKey: "returnOnCapitalEmployed",
    },
    {
      key: "returnOnSalesPercentage",
      label: "ROS",
      format: "percent",
      altKey: "returnOnNetAssetsEmployed",
    },
    { key: "gearing", label: "Gearing", format: "number" },
    { key: "totalDebtRatio", label: "Debt Ratio", format: "number" },
    { key: "debtorDays", label: "Giorni Debitori", format: "number" },
    { key: "creditorDays", label: "Giorni Creditori", format: "number" },
    {
      key: "changeInTotalAssetsPercentage",
      label: "Var. Totale Attivo",
      format: "percent",
    },
    {
      key: "changeInShareholdersEquityPercentage",
      label: "Var. Patrimonio Netto",
      format: "percent",
    },
    {
      key: "changeInTotalValueOfProductionPercentage",
      label: "Var. Valore Produzione",
      format: "percent",
    },
  ];

  const balanceSheetRows = [
    { key: "totalAssets", label: "Totale Attivo" },
    { key: "totalFixedAssets", label: "Attivo Fisso" },
    { key: "tangibleFixedAssets", label: "  Immobilizzazioni Materiali" },
    { key: "intangibleFixedAssets", label: "  Immobilizzazioni Immateriali" },
    { key: "totalCurrentAssets", label: "Attivo Corrente" },
    { key: "liquidAssets", label: "  Liquidita" },
    { key: "totalReceivables", label: "  Crediti" },
    { key: "totalInventories", label: "  Rimanenze" },
    { key: "shareholdersEquity", label: "Patrimonio Netto" },
    { key: "shareCapital", label: "  Capitale Sociale" },
    { key: "totalLiabilities", label: "Debiti Totali" },
    { key: "totalPayables", label: "  Debiti Commerciali" },
  ];

  const plRows = [
    { key: "totalValueOfProduction", label: "Valore della Produzione" },
    { key: "totalCostOfProduction", label: "Costi della Produzione" },
    { key: "costOfServices", label: "  Costi per Servizi" },
    { key: "otherOperatingExpenses", label: "  Altre Spese Operative" },
    { key: "ebitda", label: "EBITDA" },
    { key: "ebit", label: "EBIT" },
    { key: "preTaxResult", label: "Risultato ante Imposte" },
    { key: "profitOrLossForTheYear", label: "Utile/Perdita" },
    { key: "cashFlowPL", label: "Cash Flow" },
  ];

  const getRatioValue = (
    ratios: any,
    key: string,
    altKey?: string
  ): number | null => {
    if (!ratios) return null;
    const val = ratios[key] ?? (altKey ? ratios[altKey] : undefined);
    return val != null ? Number(val) : null;
  };

  return (
    <div className="space-y-6" data-testid="creditsafe-analysis">
      {/* Section 1: Top Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-credit-score">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground mb-2 flex items-center gap-1.5">
              <Shield className="w-4 h-4" />
              Punteggio di Rischio
            </div>
            <div className="flex items-center gap-3">
              <div
                className={`text-3xl font-bold px-3 py-1 rounded-md ${getCreditScoreColor(report.creditScore)}`}
                data-testid="text-credit-score"
              >
                {report.creditScore ?? "N/D"}
              </div>
              {report.creditRating && (
                <Badge variant="outline" data-testid="badge-credit-rating">
                  {report.creditRating}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-international-score">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground mb-2 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4" />
              Score Internazionale
            </div>
            <div
              className="text-lg font-semibold text-foreground"
              data-testid="text-international-score"
            >
              {report.internationalScore || "N/D"}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-contract-limit">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground mb-2 flex items-center gap-1.5">
              <CreditCard className="w-4 h-4" />
              Limite di Credito
            </div>
            <div
              className="text-2xl font-bold text-foreground"
              data-testid="text-contract-limit"
            >
              {report.contractLimit != null
                ? formatCurrency(report.contractLimit)
                : "N/D"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info Row */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap gap-6">
            <div
              className="flex items-center gap-2"
              data-testid="text-incorporation-date"
            >
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Data Costituzione:
              </span>
              <span className="text-sm font-medium text-foreground">
                {report.incorporationDate ? new Date(report.incorporationDate).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-') : "N/D"}
              </span>
            </div>
            <div
              className="flex items-center gap-2"
              data-testid="text-company-status"
            >
              <CheckCircle className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Stato Azienda:
              </span>
              {report.companyStatus ? (
                <Badge
                  variant="outline"
                  className={
                    report.companyStatus.toLowerCase().includes("active") ||
                    report.companyStatus.toLowerCase().includes("attiv")
                      ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
                      : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                  }
                  data-testid="badge-company-status"
                >
                  {report.companyStatus}
                </Badge>
              ) : (
                <span className="text-sm font-medium text-foreground">
                  N/D
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bar Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {chartConfigs.map((chart) => {
          const chartData = chart.data || [];
          const maxVal = Math.max(
            ...chartData.map((d) => Math.abs(d.value)),
            1
          );
          return (
            <Card
              key={chart.title}
              data-testid={`chart-${chart.title.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <CardContent className="p-5">
                <div className="text-sm font-medium text-foreground mb-4">
                  {chart.title}
                </div>
                {chartData.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    Dati non disponibili
                  </div>
                ) : (
                  <div className="flex items-end gap-3 h-32">
                    {chartData.map((d) => {
                      const barHeight = Math.max(
                        (Math.abs(d.value) / maxVal) * 100,
                        4
                      );
                      const isNegative = chart.canBeNegative && d.value < 0;
                      const barColor = isNegative
                        ? "bg-red-500 dark:bg-red-400"
                        : chart.color;
                      return (
                        <div
                          key={d.year}
                          className="flex-1 flex flex-col items-center gap-1"
                        >
                          <div
                            className="w-full flex items-end justify-center"
                            style={{ height: "100px" }}
                          >
                            <div
                              className={`w-full max-w-12 rounded-t-md ${barColor}`}
                              style={{ height: `${barHeight}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {d.year}
                          </span>
                          <span className="text-xs font-medium text-foreground text-center">
                            {chart.isCurrency
                              ? formatCurrency(d.value)
                              : `${d.value} giorni`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Section 2: Panoramica Aziendale */}
      <Collapsible open={panoramicaOpen} onOpenChange={setPanoramicaOpen}>
        <Card>
          <CardContent className="p-5">
            <SectionHeader
              icon={Building2}
              title="Panoramica Aziendale"
              isOpen={panoramicaOpen}
            />
            <CollapsibleContent>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div data-testid="panoramica-forma-giuridica">
                    <div className="text-xs text-muted-foreground">
                      Forma Giuridica
                    </div>
                    <div className="text-sm font-medium text-foreground">
                      {altSummary?.legalForm || "N/D"}
                    </div>
                  </div>
                  <div data-testid="panoramica-capitale-sociale">
                    <div className="text-xs text-muted-foreground">
                      Capitale Sociale
                    </div>
                    <div className="text-sm font-medium text-foreground">
                      {altSummary?.shareCapital
                        ? formatCurrency(Number(altSummary.shareCapital))
                        : "N/D"}
                    </div>
                  </div>
                  <div data-testid="panoramica-dipendenti">
                    <div className="text-xs text-muted-foreground">
                      Numero Dipendenti
                    </div>
                    <div className="text-sm font-medium text-foreground">
                      {altSummary?.numberOfEmployees ??
                        r?.otherInformation?.employeesInformation?.[0]
                          ?.numberOfEmployees ??
                        "N/D"}
                    </div>
                  </div>
                  <div data-testid="panoramica-pmi">
                    <div className="text-xs text-muted-foreground">
                      Classificazione PMI
                    </div>
                    <div className="text-sm font-medium text-foreground">
                      {altSummary?.classificationPMI
                        ? `${altSummary.classificationPMI}${altSummary.classificationPMIDescription ? ` - ${altSummary.classificationPMIDescription}` : ""}`
                        : "N/D"}
                    </div>
                  </div>
                  <div
                    className="col-span-2"
                    data-testid="panoramica-ateco"
                  >
                    <div className="text-xs text-muted-foreground">
                      Codice ATECO / Attivita
                    </div>
                    <div className="text-sm font-medium text-foreground">
                      {altSummary?.mainActivity?.code ||
                      altSummary?.activityClassifications?.[0]?.code
                        ? `${altSummary?.mainActivity?.code || altSummary?.activityClassifications?.[0]?.code} - ${altSummary?.mainActivity?.description || altSummary?.principalActivity?.description || altSummary?.activityClassifications?.[0]?.description || ""}`
                        : "N/D"}
                    </div>
                  </div>
                </div>

                {commentaries.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                      Commenti
                    </div>
                    {commentaries.map((c: any, idx: number) => {
                      const sentiment = c?.positiveOrNegative || "Neutral";
                      let iconColor =
                        "text-muted-foreground dark:text-muted-foreground";
                      let IconComp = FileText;
                      if (sentiment === "Positive") {
                        iconColor =
                          "text-green-600 dark:text-green-400";
                        IconComp = CheckCircle;
                      } else if (sentiment === "Negative") {
                        iconColor =
                          "text-red-600 dark:text-red-400";
                        IconComp = AlertTriangle;
                      }
                      return (
                        <div
                          key={idx}
                          className="flex items-start gap-2"
                          data-testid={`commentary-${idx}`}
                        >
                          <IconComp
                            className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`}
                          />
                          <span className="text-sm text-foreground">
                            {c?.commentaryText || ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </CardContent>
        </Card>
      </Collapsible>

      {/* Section 3: Indicatori di Rischio */}
      <Collapsible open={riskOpen} onOpenChange={setRiskOpen}>
        <Card>
          <CardContent className="p-5">
            <SectionHeader
              icon={AlertTriangle}
              title="Indicatori di Rischio"
              isOpen={riskOpen}
            />
            <CollapsibleContent>
              {Object.keys(companySummaryExtra).length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">
                  Dati non disponibili
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-2">
                  {riskIndicators.map((ind) => {
                    const val = companySummaryExtra[ind.key];
                    if (val === undefined) return null;
                    const hasIssue = val === true;
                    return (
                      <div
                        key={ind.key}
                        className="flex items-center gap-2 p-2 rounded-md border"
                        data-testid={`risk-${ind.key}`}
                      >
                        {hasIssue ? (
                          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                        ) : (
                          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                        )}
                        <span
                          className={`text-sm ${hasIssue ? "text-red-700 dark:text-red-300 font-medium" : "text-foreground"}`}
                        >
                          {ind.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CollapsibleContent>
          </CardContent>
        </Card>
      </Collapsible>

      {/* Section 4: Indici Finanziari (KPI) */}
      <Collapsible open={kpiOpen} onOpenChange={setKpiOpen}>
        <Card>
          <CardContent className="p-5">
            <SectionHeader
              icon={BarChart3}
              title="Indici Finanziari (KPI)"
              isOpen={kpiOpen}
            />
            <CollapsibleContent>
              {statements.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">
                  Dati non disponibili
                </div>
              ) : (
                <div className="pt-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[200px]">Indicatore</TableHead>
                        {years.map((y) => (
                          <TableHead key={y} className="text-right">
                            {y}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ratioRows.map((row) => {
                        const values = statements.map((fs) =>
                          getRatioValue(fs?.ratios, row.key, (row as any).altKey)
                        );
                        if (values.every((v) => v === null)) return null;
                        return (
                          <TableRow
                            key={row.key}
                            data-testid={`kpi-row-${row.key}`}
                          >
                            <TableCell className="font-medium text-foreground">
                              {row.label}
                            </TableCell>
                            {values.map((v, i) => (
                              <TableCell
                                key={years[i]}
                                className="text-right text-foreground"
                              >
                                {row.format === "percent"
                                  ? formatPercent(v)
                                  : formatNumber(v)}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CollapsibleContent>
          </CardContent>
        </Card>
      </Collapsible>

      {/* Section 5: Stato Patrimoniale */}
      <Collapsible open={balanceOpen} onOpenChange={setBalanceOpen}>
        <Card>
          <CardContent className="p-5">
            <SectionHeader
              icon={FileText}
              title="Stato Patrimoniale"
              isOpen={balanceOpen}
            />
            <CollapsibleContent>
              {statements.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">
                  Dati non disponibili
                </div>
              ) : (
                <div className="pt-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[240px]">Voce</TableHead>
                        {years.map((y) => (
                          <TableHead key={y} className="text-right">
                            {y}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {balanceSheetRows.map((row) => {
                        const values = statements.map((fs) => {
                          const val = fs?.balanceSheet?.[row.key];
                          return val != null ? Number(val) : null;
                        });
                        if (values.every((v) => v === null)) return null;
                        const isIndented = row.label.startsWith("  ");
                        return (
                          <TableRow
                            key={row.key}
                            data-testid={`balance-row-${row.key}`}
                          >
                            <TableCell
                              className={`${isIndented ? "pl-8 text-muted-foreground" : "font-medium text-foreground"}`}
                            >
                              {row.label.trim()}
                            </TableCell>
                            {values.map((v, i) => (
                              <TableCell
                                key={years[i]}
                                className="text-right text-foreground"
                              >
                                {formatCurrency(v)}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CollapsibleContent>
          </CardContent>
        </Card>
      </Collapsible>

      {/* Section 6: Conto Economico */}
      <Collapsible open={plOpen} onOpenChange={setPlOpen}>
        <Card>
          <CardContent className="p-5">
            <SectionHeader
              icon={Briefcase}
              title="Conto Economico"
              isOpen={plOpen}
            />
            <CollapsibleContent>
              {statements.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">
                  Dati non disponibili
                </div>
              ) : (
                <div className="pt-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[240px]">Voce</TableHead>
                        {years.map((y) => (
                          <TableHead key={y} className="text-right">
                            {y}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {plRows.map((row) => {
                        const values = statements.map((fs) => {
                          const val = fs?.profitAndLoss?.[row.key];
                          return val != null ? Number(val) : null;
                        });
                        if (values.every((v) => v === null)) return null;
                        const isIndented = row.label.startsWith("  ");
                        return (
                          <TableRow
                            key={row.key}
                            data-testid={`pl-row-${row.key}`}
                          >
                            <TableCell
                              className={`${isIndented ? "pl-8 text-muted-foreground" : "font-medium text-foreground"}`}
                            >
                              {row.label.trim()}
                            </TableCell>
                            {values.map((v, i) => (
                              <TableCell
                                key={years[i]}
                                className="text-right text-foreground"
                              >
                                {formatCurrency(v)}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CollapsibleContent>
          </CardContent>
        </Card>
      </Collapsible>

      {/* Section 7: Struttura del Gruppo */}
      {extendedGroup.length > 0 && (
        <Collapsible open={groupOpen} onOpenChange={setGroupOpen}>
          <Card>
            <CardContent className="p-5">
              <SectionHeader
                icon={Network}
                title="Struttura del Gruppo"
                isOpen={groupOpen}
              />
              <CollapsibleContent>
                <div className="space-y-2 pt-2">
                  {extendedGroup.map((entity: any, idx: number) => {
                    const level = entity?.level || 0;
                    const isActive =
                      entity?.status?.toLowerCase?.()?.includes("active") ||
                      entity?.status?.toLowerCase?.()?.includes("attiv");
                    return (
                      <div
                        key={entity?.id || idx}
                        className="flex items-center gap-2 py-1.5"
                        style={{ paddingLeft: `${level * 20 + 8}px` }}
                        data-testid={`group-entity-${idx}`}
                      >
                        <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground">
                          {entity?.companyName || "N/D"}
                        </span>
                        {entity?.registeredNumber && (
                          <span className="text-xs text-muted-foreground">
                            ({entity.registeredNumber})
                          </span>
                        )}
                        {entity?.country && (
                          <span className="text-xs text-muted-foreground">
                            {entity.country}
                          </span>
                        )}
                        {entity?.status && (
                          <Badge
                            variant="outline"
                            className={
                              isActive
                                ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
                                : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                            }
                          >
                            {entity.status}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </CardContent>
          </Card>
        </Collapsible>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span data-testid="text-fetched-at">
          Ultimo aggiornamento:{" "}
          {report.fetchedAt
            ? format(
                new Date(report.fetchedAt),
                "d MMMM yyyy 'alle' HH:mm",
                { locale: it }
              )
            : "N/D"}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={!canRefresh || isRefreshing}
          data-testid="button-aggiorna-report"
        >
          {isRefreshing ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Aggiorna Report
        </Button>
      </div>
    </div>
  );
}
