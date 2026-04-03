import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { pdf } from "@react-pdf/renderer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2, AlertCircle, X } from "lucide-react";
import { QuotePdfDocument } from "@/components/pdf/QuotePdfDocument";
import { apiRequest } from "@/lib/queryClient";

interface QuotePreviewModalProps {
  quoteId: number | string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function QuotePreviewModal({ quoteId, isOpen, onClose }: QuotePreviewModalProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: quoteData, isLoading, error: fetchError } = useQuery({
    queryKey: ["/api/quotes", String(quoteId)],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/quotes/${quoteId}`);
      if (!res.ok) throw new Error("Preventivo non trovato");
      return res.json();
    },
    enabled: !!quoteId && isOpen,
    retry: false,
  });

  const { data: articles } = useQuery<any[]>({
    queryKey: ["/api/articles"],
    enabled: !!quoteId && isOpen,
  });

  useEffect(() => {
    if (!isOpen) {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
        setPdfUrl(null);
      }
      setError(null);
      return;
    }

    if (!quoteData?.pdfData) return;

    const generatePdf = async () => {
      setGenerating(true);
      setError(null);
      try {
        const { quote: savedQuote, company, user, billingProfile, clauseSelections, contactReferent } = quoteData.pdfData;

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
  }, [quoteData, articles, isOpen]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const handleDownload = () => {
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-5xl w-full p-0 gap-0 overflow-hidden"
        style={{ height: "90vh" }}
        data-testid="quote-preview-modal"
      >
        <DialogHeader className="flex flex-row items-center justify-between px-4 py-3 border-b shrink-0">
          <DialogTitle className="text-base font-semibold">
            {quoteData?.number ? `Preventivo ${quoteData.number}` : "Anteprima Preventivo"}
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={!pdfUrl || generating}
              data-testid="button-modal-download-pdf"
            >
              <FileDown className="w-4 h-4 mr-1.5" />
              Scarica PDF
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              data-testid="button-modal-close"
            >
              <X className="w-4 h-4 mr-1.5" />
              Chiudi
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden" style={{ height: "calc(90vh - 57px)" }}>
          {(isLoading || generating) && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-muted-foreground text-sm">Generazione PDF in corso...</p>
            </div>
          )}

          {!isLoading && !generating && (fetchError || error) && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <AlertCircle className="w-10 h-10 text-red-400" />
              <p className="text-red-600 text-sm">
                {fetchError ? "Preventivo non trovato o non accessibile." : error}
              </p>
            </div>
          )}

          {!isLoading && !generating && !error && !quoteData?.pdfData && quoteData && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <AlertCircle className="w-10 h-10 text-amber-400" />
              <p className="text-muted-foreground text-sm text-center max-w-xs">
                Anteprima non disponibile per i preventivi creati prima dell'aggiornamento del sistema.
              </p>
            </div>
          )}

          {pdfUrl && !generating && (
            <iframe
              src={pdfUrl}
              className="w-full h-full border-0"
              title="Anteprima Preventivo"
              data-testid="modal-pdf-viewer"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
