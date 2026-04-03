import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, XCircle, ArrowLeft, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";

interface PreviewRecord {
  rowIndex: number;
  name: string;
  address: string | null;
  zipCode: string | null;
  city: string | null;
  province: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  vatNumber: string | null;
  fiscalCode: string | null;
  type: string;
  paymentMethodId: string | null;
  paymentMethodName: string | null;
  pecEmail: string | null;
  sdiCode: string | null;
  ipaCode: string | null;
  iban: string | null;
  isDuplicate: boolean;
  entityType: string;
}

interface PreviewResponse {
  totalRows: number;
  duplicates: number;
  newRecords: number;
  paymentMethods: { id: string; name: string }[];
  records: PreviewRecord[];
}

interface ImportResult {
  imported: number;
  errors: number;
  errorDetails: string[];
  message: string;
}

export default function ImportLeadsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      toast({ title: "Formato non valido", description: "Seleziona un file CSV.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    setPreview(null);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/import/leads/preview", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Errore nel caricamento");
      }

      const data: PreviewResponse = await response.json();
      setPreview(data);

      const initialSelected = new Set<number>();
      data.records.forEach((r, i) => {
        if (!r.isDuplicate) initialSelected.add(i);
      });
      setSelectedRows(initialSelected);

      toast({
        title: "File caricato",
        description: `${data.totalRows} righe trovate, ${data.newRecords} nuove, ${data.duplicates} già presenti.`,
      });
    } catch (error: any) {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleImport = async () => {
    if (!preview) return;

    const recordsToImport = preview.records.filter((_, i) => selectedRows.has(i));
    if (recordsToImport.length === 0) {
      toast({ title: "Nessun record selezionato", description: "Seleziona almeno un record da importare.", variant: "destructive" });
      return;
    }

    setIsImporting(true);
    try {
      const response = await apiRequest("POST", "/api/import/leads/confirm", { records: recordsToImport });
      const result: ImportResult = await response.json();
      setImportResult(result);
      setPreview(null);

      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });

      toast({
        title: "Importazione completata",
        description: result.message,
      });
    } catch (error: any) {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  const toggleRow = (index: number) => {
    const next = new Set(selectedRows);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelectedRows(next);
  };

  const toggleAll = () => {
    if (selectedRows.size === preview?.records.length) {
      setSelectedRows(new Set());
    } else {
      const all = new Set<number>();
      preview?.records.forEach((_, i) => all.add(i));
      setSelectedRows(all);
    }
  };

  const toggleNonDuplicates = () => {
    const next = new Set<number>();
    preview?.records.forEach((r, i) => {
      if (!r.isDuplicate) next.add(i);
    });
    setSelectedRows(next);
  };

  return (
    <DashboardLayout user={user!}>
      <div className="space-y-6">
        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => navigate("/leads")} data-testid="button-back-leads">
            <ArrowLeft />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">Importa Contatti</h1>
            <p className="text-sm text-muted-foreground">Carica un file CSV per importare contatti in blocco</p>
          </div>
        </div>

        {!preview && !importResult && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Carica File CSV
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div
                  className="border-2 border-dashed rounded-md p-8 text-center cursor-pointer hover-elevate transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="dropzone-csv"
                >
                  {isUploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
                      <p className="text-sm text-muted-foreground">Analisi del file in corso...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-10 w-10 text-muted-foreground" />
                      <p className="text-sm font-medium">Clicca per selezionare un file CSV</p>
                      <p className="text-xs text-muted-foreground">Formato supportato: .csv (separatore virgola o punto e virgola)</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileSelect}
                  data-testid="input-file-csv"
                />

                <div className="bg-muted/50 rounded-md p-4">
                  <h4 className="text-sm font-medium mb-2">Colonne riconosciute:</h4>
                  <div className="flex flex-wrap gap-1">
                    {["RAGIONE SOCIALE", "INDIRIZZO", "CAP", "LOCALITÀ", "Provincia", "Nazione", "Telefono", "email", "Partita Iva", "COD. FISCALE", "Cliente", "Pagamento", "PEC", "SDI", "Codice IPA"].map(col => (
                      <Badge key={col} variant="secondary">{col}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {preview && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <Card className="flex-1 min-w-[140px]">
                <CardContent className="p-4 flex items-center gap-3">
                  <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold" data-testid="text-total-rows">{preview.totalRows}</p>
                    <p className="text-xs text-muted-foreground">Righe totali</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="flex-1 min-w-[140px]">
                <CardContent className="p-4 flex items-center gap-3">
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold" data-testid="text-new-records">{preview.newRecords}</p>
                    <p className="text-xs text-muted-foreground">Nuovi contatti</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="flex-1 min-w-[140px]">
                <CardContent className="p-4 flex items-center gap-3">
                  <AlertTriangle className="h-8 w-8 text-orange-500" />
                  <div>
                    <p className="text-2xl font-bold" data-testid="text-duplicates">{preview.duplicates}</p>
                    <p className="text-xs text-muted-foreground">Già presenti</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="flex-1 min-w-[140px]">
                <CardContent className="p-4 flex items-center gap-3">
                  <CheckCircle2 className="h-8 w-8 text-blue-500" />
                  <div>
                    <p className="text-2xl font-bold" data-testid="text-selected">{selectedRows.size}</p>
                    <p className="text-xs text-muted-foreground">Selezionati</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle>Anteprima Dati</CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={toggleAll} data-testid="button-toggle-all">
                    {selectedRows.size === preview.records.length ? "Deseleziona tutti" : "Seleziona tutti"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={toggleNonDuplicates} data-testid="button-select-new">
                    Solo nuovi
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Stato</TableHead>
                        <TableHead>Ragione Sociale</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>P.IVA</TableHead>
                        <TableHead>Città</TableHead>
                        <TableHead>Prov.</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Telefono</TableHead>
                        <TableHead>Pagamento</TableHead>
                        <TableHead>SDI</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.records.map((record, index) => (
                        <TableRow
                          key={index}
                          className={record.isDuplicate ? "opacity-60" : ""}
                          data-testid={`row-import-${index}`}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedRows.has(index)}
                              onCheckedChange={() => toggleRow(index)}
                              data-testid={`checkbox-row-${index}`}
                            />
                          </TableCell>
                          <TableCell>
                            {record.isDuplicate ? (
                              <Badge variant="secondary" className="text-orange-600">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Duplicato
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-green-600">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Nuovo
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-medium max-w-[200px] truncate">{record.name}</TableCell>
                          <TableCell>
                            <Badge variant={record.type === "cliente" ? "default" : "secondary"}>
                              {record.type === "cliente" ? "Cliente" : "Lead"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{record.vatNumber || "-"}</TableCell>
                          <TableCell>{record.city || "-"}</TableCell>
                          <TableCell>{record.province || "-"}</TableCell>
                          <TableCell className="text-xs max-w-[150px] truncate">{record.email || "-"}</TableCell>
                          <TableCell className="text-xs">{record.phone || "-"}</TableCell>
                          <TableCell className="text-xs max-w-[150px] truncate">
                            {record.paymentMethodId ? (
                              <Badge variant="secondary">{record.paymentMethodName}</Badge>
                            ) : record.paymentMethodName ? (
                              <span className="text-orange-500" title="Modalità non trovata nel sistema">{record.paymentMethodName}</span>
                            ) : "-"}
                          </TableCell>
                          <TableCell className="text-xs">{record.sdiCode || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {preview.records.some(r => r.paymentMethodName && !r.paymentMethodId) && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Modalità di pagamento non riconosciute</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Alcune righe hanno modalità di pagamento che non corrispondono a quelle configurate nel sistema. 
                        Verranno importate senza modalità di pagamento. Potrai assegnarla manualmente dalla scheda del contatto.
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {Array.from(new Set(preview.records.filter(r => r.paymentMethodName && !r.paymentMethodId).map(r => r.paymentMethodName))).map(name => (
                          <Badge key={name} variant="secondary" className="text-orange-600">{name}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex items-center justify-between gap-4 flex-wrap">
              <Button
                variant="outline"
                onClick={() => { setPreview(null); setSelectedRows(new Set()); }}
                data-testid="button-cancel-import"
              >
                Annulla
              </Button>
              <Button
                onClick={handleImport}
                disabled={isImporting || selectedRows.size === 0}
                data-testid="button-confirm-import"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importazione in corso...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Importa {selectedRows.size} contatti
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {importResult && (
          <Card>
            <CardContent className="p-8 text-center space-y-4">
              {importResult.errors === 0 ? (
                <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
              ) : (
                <AlertTriangle className="h-16 w-16 text-orange-500 mx-auto" />
              )}
              <h2 className="text-xl font-bold" data-testid="text-import-result">{importResult.message}</h2>
              <div className="flex justify-center gap-6">
                <div>
                  <p className="text-3xl font-bold text-green-600" data-testid="text-imported-count">{importResult.imported}</p>
                  <p className="text-sm text-muted-foreground">Importati</p>
                </div>
                {importResult.errors > 0 && (
                  <div>
                    <p className="text-3xl font-bold text-red-600" data-testid="text-error-count">{importResult.errors}</p>
                    <p className="text-sm text-muted-foreground">Errori</p>
                  </div>
                )}
              </div>
              {importResult.errorDetails.length > 0 && (
                <div className="bg-muted/50 rounded-md p-4 text-left max-h-[200px] overflow-y-auto">
                  <p className="text-sm font-medium mb-2">Dettagli errori:</p>
                  {importResult.errorDetails.map((err, i) => (
                    <p key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                      <XCircle className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
                      {err}
                    </p>
                  ))}
                </div>
              )}
              <div className="flex justify-center gap-3 pt-4">
                <Button variant="outline" onClick={() => { setImportResult(null); }} data-testid="button-import-another">
                  Importa altro file
                </Button>
                <Button onClick={() => navigate("/leads")} data-testid="button-go-to-leads">
                  Vai ai Contatti
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
