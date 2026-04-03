import { pdf } from "@react-pdf/renderer";
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { QuotePdfDocument } from "./QuotePdfDocument";

interface ClauseSelection {
  selected: boolean;
  text: string;
}

interface QuotePdfButtonProps {
  quote: any;
  company?: any;
  articles?: any[];
  filename?: string;
  user?: any;
  clauseSelections?: Record<string, ClauseSelection>;
  billingProfile?: any;
  contactReferent?: { firstName?: string; lastName?: string; email?: string; phone?: string } | null;
  onBeforeDownload?: () => boolean;
  onAfterDownload?: () => void;
}

export function QuotePdfButton({ quote, company, articles, filename, user, clauseSelections, billingProfile, contactReferent, onBeforeDownload, onAfterDownload }: QuotePdfButtonProps) {
  const [loading, setLoading] = useState(false);
  const pdfFilename = filename || `Preventivo ${quote?.number || "draft"}.pdf`;

  const handleDownload = useCallback(async () => {
    if (onBeforeDownload && !onBeforeDownload()) return;
    setLoading(true);
    try {
      const doc = <QuotePdfDocument quote={quote} company={company} articles={articles} user={user} clauseSelections={clauseSelections} billingProfile={billingProfile} contactReferent={contactReferent} />;
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = pdfFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      if (onAfterDownload) onAfterDownload();
    } catch (err) {
      console.error("Errore generazione PDF:", err);
    } finally {
      setLoading(false);
    }
  }, [quote, company, articles, pdfFilename, user, clauseSelections, billingProfile, onBeforeDownload, onAfterDownload]);

  return (
    <Button
      variant="outline"
      disabled={loading}
      onClick={handleDownload}
      data-testid="button-download-pdf"
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Generazione...
        </>
      ) : (
        <>
          <FileDown className="w-4 h-4 mr-2" />
          Scarica Preventivo PDF
        </>
      )}
    </Button>
  );
}
