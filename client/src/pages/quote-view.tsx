import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { pdf } from "@react-pdf/renderer";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, FileDown, Eye, Loader2, AlertCircle, Pencil, Mail } from "lucide-react";
import { QuotePdfDocument } from "@/components/pdf/QuotePdfDocument";
import { apiRequest } from "@/lib/queryClient";

export default function QuoteViewPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchParams = new URLSearchParams(window.location.search);
  const autoDownload = searchParams.get("download") === "true";

  const { data: quoteData, isLoading, error: fetchError } = useQuery({
    queryKey: ["/api/quotes", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/quotes/${id}`);
      if (!res.ok) throw new Error("Preventivo non trovato");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: articles } = useQuery<any[]>({
    queryKey: ["/api/articles"],
  });

  useEffect(() => {
    if (!quoteData?.pdfData) return;

    const generatePdf = async () => {
      setGenerating(true);
      setError(null);
      try {
        const { quote: savedQuote, company, user, billingProfile, clauseSelections, contactReferent } = quoteData.pdfData;
        const isPublicProfile = billingProfile?.profileType === "PUBLIC";
        const pdfFilenameSuffix = isPublicProfile ? " (Partners)" : "";

        const quoteForPdf = {
          ...savedQuote,
          number: quoteData.number,
        };

        const doc = (
          <QuotePdfDocument
            quote={quoteForPdf}
            company={company}
            articles={articles || []}
            user={user}
            clauseSelections={clauseSelections}
            billingProfile={billingProfile}
            contactReferent={contactReferent}
          />
        );

        const blob = await pdf(doc).toBlob();

        if (autoDownload) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `Preventivo ${quoteData.number || "draft"}${pdfFilenameSuffix}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          navigate(-1);
          return;
        }

        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
      } catch (err) {
        console.error("Errore generazione PDF:", err);
        setError("Errore nella generazione del PDF. Riprova.");
      } finally {
        setGenerating(false);
      }
    };

    generatePdf();

    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [quoteData, articles, autoDownload]);

  const handleDownload = async () => {
    if (!pdfUrl) return;
    const isPublic = quoteData?.pdfData?.billingProfile?.profileType === "PUBLIC";
    const suffix = isPublic ? " (Partners)" : "";
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = `Preventivo ${quoteData?.number || "draft"}${suffix}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6 max-w-5xl mx-auto">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (fetchError || !quoteData) {
    return (
      <DashboardLayout>
        <div className="p-6 max-w-5xl mx-auto">
          <Button variant="ghost" onClick={() => navigate("/opportunita")} className="mb-4" data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Indietro
          </Button>
          <Card>
            <CardContent className="p-12 text-center">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Preventivo non trovato</h2>
              <p className="text-muted-foreground">Il preventivo richiesto non esiste o non hai i permessi per visualizzarlo.</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (!quoteData.pdfData) {
    return (
      <DashboardLayout>
        <div className="p-6 max-w-5xl mx-auto">
          <Button variant="ghost" onClick={() => navigate("/opportunita")} className="mb-4" data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Indietro
          </Button>
          <Card>
            <CardContent className="p-12 text-center">
              <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Anteprima non disponibile</h2>
              <p className="text-muted-foreground">Questo preventivo è stato creato prima dell'aggiornamento del sistema. L'anteprima PDF non è disponibile per i preventivi precedenti.</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate("/opportunita")} data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Indietro
            </Button>
            <h1 className="text-xl font-semibold">Preventivo {quoteData.number}</h1>
          </div>
          <div className="flex gap-2">
            {quoteData.opportunityId && quoteData.pdfData && (
              <Button
                variant="outline"
                onClick={() => navigate(`/opportunities/${quoteData.opportunityId}/quotes/new?edit=${id}`)}
                data-testid="button-edit-quote"
              >
                <Pencil className="w-4 h-4 mr-2" />
                Modifica
              </Button>
            )}
            <Button onClick={handleDownload} disabled={!pdfUrl || generating} data-testid="button-download-pdf">
              <FileDown className="w-4 h-4 mr-2" />
              Scarica PDF
            </Button>
            {(() => {
              const lead = quoteData.pdfData?.quote?.lead;
              const opportunity = quoteData.pdfData?.quote?.opportunity;
              const leadName = lead?.name || [lead?.firstName, lead?.lastName].filter(Boolean).join(" ") || "";
              const mailSubject = encodeURIComponent(`Cantiere in ${opportunity?.siteAddress || opportunity?.title || '[Indirizzo]'}`);
              const mailBody = encodeURIComponent(`Gentile ${leadName},\n\nLa ringraziamo per aver contattato DA.DO. PONTEGGI. In allegato Le inviamo la nostra migliore offerta per l'allestimento del ponteggio nel cantiere in oggetto.\n\nIn caso di conferma, Le chiediamo gentilmente di restituirci l'offerta e le condizioni contrattuali allegate, debitamente compilate e firmate in ogni loro parte. Per poter organizzare al meglio l'intervento, La preghiamo di inviare la documentazione con congruo anticipo rispetto alla data di inizio lavori desiderata.\n\nLe ricordiamo che l'inizio delle attività è previsto a circa 10 giorni solari dalla firma del contratto. Una volta ricevuta la documentazione, il nostro responsabile, Raffaele Carotenuto (Cel. 328 4525004), provvederà a contattarLa per concordare la data esatta.`);
              return (
                <Button
                  variant="outline"
                  asChild
                  disabled={!lead?.email}
                  data-testid="button-send-email"
                >
                  <a href={`mailto:${lead?.email || ''}?subject=${mailSubject}&body=${mailBody}`}>
                    <Mail className="w-4 h-4 mr-2" />
                    Invia via Mail
                  </a>
                </Button>
              );
            })()}
          </div>
        </div>

        {generating && (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Generazione PDF in corso...</p>
            </CardContent>
          </Card>
        )}

        {error && (
          <Card>
            <CardContent className="p-12 text-center">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <p className="text-red-600">{error}</p>
            </CardContent>
          </Card>
        )}

        {pdfUrl && !generating && (
          <div className="border rounded-lg overflow-hidden bg-gray-100" style={{ height: "calc(100vh - 160px)" }}>
            <iframe
              src={pdfUrl}
              className="w-full h-full"
              title={`Preventivo ${quoteData.number}`}
              data-testid="pdf-viewer"
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
