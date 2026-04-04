import { APP_CONFIG } from "@/lib/config";
import ScaffoldingQuoteEditor from "./ScaffoldingQuoteEditor";

/**
 * QuoteSelector — punto di ingresso per il preventivatore.
 *
 * Legge APP_CONFIG.quoteEditorType e monta l'editor corretto.
 * Per aggiungere un nuovo tipo di preventivatore:
 *   1. Crea un nuovo file in client/src/pages/quotes/
 *   2. Aggiungi un case qui sotto
 *   3. Imposta VITE_QUOTE_EDITOR_TYPE nel .env del tenant
 */
export default function QuoteSelector() {
  switch (APP_CONFIG.quoteEditorType) {
    case "scaffolding":
      return <ScaffoldingQuoteEditor />;
    // case "standard":
    //   return <StandardQuoteEditor />;
    default:
      return <ScaffoldingQuoteEditor />;
  }
}
