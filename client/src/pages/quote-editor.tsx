import { useState, useMemo, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  FileText,
  Save,
  Loader2,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type {
  Material,
  MaterialThickness,
  MaterialWithThicknesses,
  CatalogArticle,
  LaborRate,
  QuoteItemType,
  Opportunity,
} from "@shared/schema";

interface QuoteItemDraft {
  uid: string; // local id (for list ops)
  type: QuoteItemType;
  description: string;
  // LATTONERIA
  materialId?: string;
  materialThicknessId?: string;
  developmentMm?: string;
  // ARTICOLO
  catalogArticleId?: string;
  // GIORNATE
  laborRateId?: string;
  quantity: string;
  marginPercent?: string; // optional override
  // For display only — frozen on saved items
  unitOfMeasure?: string | null;
  totalRow?: string | null;
}

type QuoteItemPayload =
  | {
      type: "LATTONERIA";
      description: string | null;
      quantity: string;
      marginPercent?: string;
      materialId: string;
      materialThicknessId: string;
      developmentMm: string;
    }
  | {
      type: "ARTICOLO";
      description: string | null;
      quantity: string;
      marginPercent?: string;
      catalogArticleId: string;
    }
  | {
      type: "GIORNATE";
      description: string | null;
      quantity: string;
      marginPercent?: string;
      laborRateId: string;
    };

interface QuoteSavePayload {
  subject: string | null;
  notes: string | null;
  number?: string;
  items: QuoteItemPayload[];
}

interface QuoteResponse {
  id: string;
  number: string;
  opportunityId: string;
  status: string;
  totalAmount: string;
  subject: string | null;
  notes: string | null;
  createdAt: string;
  items: Array<{
    id: string;
    type: QuoteItemType | null;
    materialId: string | null;
    materialThicknessId: string | null;
    catalogArticleId: string | null;
    laborRateId: string | null;
    description: string | null;
    unitOfMeasure: string | null;
    developmentMm: string | null;
    quantity: string;
    marginPercent: string | null;
    unitPriceApplied: string;
    totalRow: string;
    displayOrder: number;
  }>;
}

function formatEur(n: number): string {
  return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function genUid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ==================== Type-specific add forms ====================

const lattoneriaFormSchema = z.object({
  materialId: z.string().min(1, "Seleziona un materiale"),
  materialThicknessId: z.string().min(1, "Seleziona uno spessore"),
  developmentMm: z.string().refine((v) => parseFloat(v) > 0, { message: "Sviluppo > 0" }),
  quantity: z.string().refine((v) => parseFloat(v) > 0, { message: "Metri > 0" }),
  description: z.string().optional(),
  marginPercent: z.string().optional(),
});

const articoloFormSchema = z.object({
  catalogArticleId: z.string().min(1, "Seleziona un articolo"),
  quantity: z.string().refine((v) => parseFloat(v) > 0, { message: "Quantità > 0" }),
  description: z.string().optional(),
  marginPercent: z.string().optional(),
});

const giornateFormSchema = z.object({
  laborRateId: z.string().min(1, "Seleziona una manodopera"),
  quantity: z.string().refine((v) => parseFloat(v) > 0, { message: "Giorni > 0" }),
  description: z.string().optional(),
  marginPercent: z.string().optional(),
});

interface AddRowDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (draft: QuoteItemDraft) => void;
  materials: MaterialWithThicknesses[];
  catalogArticles: CatalogArticle[];
  laborRates: LaborRate[];
}

function AddRowDialog({ open, onClose, onAdd, materials, catalogArticles, laborRates }: AddRowDialogProps) {
  const [type, setType] = useState<QuoteItemType>("LATTONERIA");

  useEffect(() => {
    if (open) setType("LATTONERIA");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="dialog-add-row">
        <DialogHeader>
          <DialogTitle>Aggiungi riga al preventivo</DialogTitle>
          <DialogDescription>Scegli il tipo di voce da inserire</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Tipo riga</Label>
          <Select value={type} onValueChange={(v) => setType(v as QuoteItemType)}>
            <SelectTrigger data-testid="select-row-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LATTONERIA" data-testid="option-lattoneria">Lattoneria (sviluppo × metri)</SelectItem>
              <SelectItem value="ARTICOLO" data-testid="option-articolo">Articolo (catalogo)</SelectItem>
              <SelectItem value="GIORNATE" data-testid="option-giornate">Manodopera (giornate)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {type === "LATTONERIA" && (
          <LattoneriaForm materials={materials} onSubmit={(d) => { onAdd(d); onClose(); }} />
        )}
        {type === "ARTICOLO" && (
          <ArticoloForm articles={catalogArticles} onSubmit={(d) => { onAdd(d); onClose(); }} />
        )}
        {type === "GIORNATE" && (
          <GiornateForm laborRates={laborRates} onSubmit={(d) => { onAdd(d); onClose(); }} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LattoneriaForm({
  materials,
  onSubmit,
}: {
  materials: MaterialWithThicknesses[];
  onSubmit: (d: QuoteItemDraft) => void;
}) {
  const form = useForm<z.infer<typeof lattoneriaFormSchema>>({
    resolver: zodResolver(lattoneriaFormSchema),
    defaultValues: {
      materialId: "",
      materialThicknessId: "",
      developmentMm: "",
      quantity: "",
      description: "",
      marginPercent: "",
    },
  });

  const selectedMaterialId = form.watch("materialId");
  const selectedThicknessId = form.watch("materialThicknessId");
  const developmentMm = form.watch("developmentMm");
  const quantity = form.watch("quantity");
  const marginOverride = form.watch("marginPercent");

  const selectedMaterial = useMemo(
    () => materials.find((m) => m.id === selectedMaterialId),
    [materials, selectedMaterialId],
  );
  const selectedThickness = useMemo(
    () => selectedMaterial?.thicknesses?.find((t) => t.id === selectedThicknessId),
    [selectedMaterial, selectedThicknessId],
  );

  // Reset thickness when material changes
  useEffect(() => {
    if (selectedThicknessId && selectedMaterial &&
        !selectedMaterial.thicknesses?.some((t) => t.id === selectedThicknessId)) {
      form.setValue("materialThicknessId", "");
    }
  }, [selectedMaterialId, selectedMaterial, selectedThicknessId, form]);

  const preview = useMemo(() => {
    if (!selectedMaterial || !selectedThickness) return null;
    const dev = parseFloat(developmentMm || "0");
    const meters = parseFloat(quantity || "0");
    const thickMm = parseFloat(selectedThickness.thicknessMm);
    const density = parseFloat(selectedMaterial.density);
    const costKg = parseFloat(selectedThickness.costPerKg);
    const margin = marginOverride !== "" && marginOverride !== undefined
      ? parseFloat(marginOverride)
      : parseFloat(selectedThickness.marginPercent);
    if (!isFinite(dev) || !isFinite(meters) || meters <= 0 || dev <= 0) return null;
    const weightKg = (dev / 1000) * meters * (thickMm / 1000) * density;
    const cost = weightKg * costKg;
    const total = cost * (1 + (isFinite(margin) ? margin : 0) / 100);
    return { weightKg, cost, total, margin: isFinite(margin) ? margin : 0 };
  }, [selectedMaterial, selectedThickness, developmentMm, quantity, marginOverride]);

  const submit = form.handleSubmit((vals) => {
    onSubmit({
      uid: genUid(),
      type: "LATTONERIA",
      description: vals.description || "",
      materialId: vals.materialId,
      materialThicknessId: vals.materialThicknessId,
      developmentMm: vals.developmentMm,
      quantity: vals.quantity,
      marginPercent: vals.marginPercent || undefined,
      unitOfMeasure: "ml",
      totalRow: preview ? preview.total.toFixed(2) : null,
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-3">
        <FormField
          control={form.control}
          name="materialId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Materiale</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger data-testid="select-material">
                    <SelectValue placeholder="Seleziona materiale" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {materials.map((m) => (
                    <SelectItem key={m.id} value={m.id} data-testid={`option-material-${m.id}`}>
                      {m.name} ({parseFloat(m.density)} kg/m³)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="materialThicknessId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Spessore</FormLabel>
              <Select value={field.value} onValueChange={field.onChange} disabled={!selectedMaterial}>
                <FormControl>
                  <SelectTrigger data-testid="select-thickness">
                    <SelectValue placeholder="Seleziona spessore" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(selectedMaterial?.thicknesses || []).map((t) => (
                    <SelectItem key={t.id} value={t.id} data-testid={`option-thickness-${t.id}`}>
                      {parseFloat(t.thicknessMm)} mm — {parseFloat(t.costPerKg).toFixed(2)} €/kg
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="developmentMm"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sviluppo (mm)</FormLabel>
                <FormControl>
                  <Input type="number" step="any" {...field} data-testid="input-development-mm" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="quantity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Metri lineari</FormLabel>
                <FormControl>
                  <Input type="number" step="any" {...field} data-testid="input-quantity-meters" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="marginPercent"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Margine % (opzionale, default da catalogo)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="any"
                  placeholder={selectedThickness ? parseFloat(selectedThickness.marginPercent).toString() : ""}
                  {...field}
                  data-testid="input-margin-override"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrizione (opzionale)</FormLabel>
              <FormControl>
                <Input {...field} data-testid="input-description" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {preview && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1" data-testid="preview-lattoneria">
            <div>Peso stimato: <span className="font-medium">{preview.weightKg.toFixed(2)} kg</span></div>
            <div>Costo: <span className="font-medium">€ {formatEur(preview.cost)}</span></div>
            <div>Margine applicato: <span className="font-medium">{preview.margin.toFixed(2)}%</span></div>
            <div className="pt-1 border-t">
              Prezzo totale riga: <span className="font-semibold">€ {formatEur(preview.total)}</span>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="submit" data-testid="button-add-lattoneria-row">
            <Plus className="w-4 h-4 mr-2" />
            Aggiungi
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function ArticoloForm({
  articles,
  onSubmit,
}: {
  articles: CatalogArticle[];
  onSubmit: (d: QuoteItemDraft) => void;
}) {
  const form = useForm<z.infer<typeof articoloFormSchema>>({
    resolver: zodResolver(articoloFormSchema),
    defaultValues: {
      catalogArticleId: "",
      quantity: "",
      description: "",
      marginPercent: "",
    },
  });

  const selectedId = form.watch("catalogArticleId");
  const quantity = form.watch("quantity");
  const marginOverride = form.watch("marginPercent");
  const selected = articles.find((a) => a.id === selectedId);

  const preview = useMemo(() => {
    if (!selected) return null;
    const qty = parseFloat(quantity || "0");
    if (!isFinite(qty) || qty <= 0) return null;
    const unit = parseFloat(selected.unitCost);
    const margin = marginOverride !== "" && marginOverride !== undefined
      ? parseFloat(marginOverride)
      : parseFloat(selected.marginPercent);
    const cost = unit * qty;
    const total = cost * (1 + (isFinite(margin) ? margin : 0) / 100);
    return { cost, total, margin: isFinite(margin) ? margin : 0 };
  }, [selected, quantity, marginOverride]);

  const submit = form.handleSubmit((vals) => {
    onSubmit({
      uid: genUid(),
      type: "ARTICOLO",
      description: vals.description || "",
      catalogArticleId: vals.catalogArticleId,
      quantity: vals.quantity,
      marginPercent: vals.marginPercent || undefined,
      unitOfMeasure: selected?.unitOfMeasure ?? "pz",
      totalRow: preview ? preview.total.toFixed(2) : null,
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-3">
        <FormField
          control={form.control}
          name="catalogArticleId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Articolo</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger data-testid="select-catalog-article">
                    <SelectValue placeholder="Seleziona articolo" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {articles.map((a) => (
                    <SelectItem key={a.id} value={a.id} data-testid={`option-article-${a.id}`}>
                      {a.name} — {parseFloat(a.unitCost).toFixed(2)} €/{a.unitOfMeasure}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="quantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Quantità ({selected?.unitOfMeasure || "pz"})</FormLabel>
              <FormControl>
                <Input type="number" step="any" {...field} data-testid="input-quantity-articolo" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="marginPercent"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Margine % (opzionale, default da catalogo)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="any"
                  placeholder={selected ? parseFloat(selected.marginPercent).toString() : ""}
                  {...field}
                  data-testid="input-margin-override-articolo"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrizione (opzionale)</FormLabel>
              <FormControl>
                <Input {...field} data-testid="input-description-articolo" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {preview && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1" data-testid="preview-articolo">
            <div>Costo: <span className="font-medium">€ {formatEur(preview.cost)}</span></div>
            <div>Margine: <span className="font-medium">{preview.margin.toFixed(2)}%</span></div>
            <div className="pt-1 border-t">
              Prezzo totale riga: <span className="font-semibold">€ {formatEur(preview.total)}</span>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="submit" data-testid="button-add-articolo-row">
            <Plus className="w-4 h-4 mr-2" />
            Aggiungi
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function GiornateForm({
  laborRates,
  onSubmit,
}: {
  laborRates: LaborRate[];
  onSubmit: (d: QuoteItemDraft) => void;
}) {
  const form = useForm<z.infer<typeof giornateFormSchema>>({
    resolver: zodResolver(giornateFormSchema),
    defaultValues: {
      laborRateId: "",
      quantity: "",
      description: "",
      marginPercent: "",
    },
  });

  const selectedId = form.watch("laborRateId");
  const quantity = form.watch("quantity");
  const marginOverride = form.watch("marginPercent");
  const selected = laborRates.find((l) => l.id === selectedId);

  const preview = useMemo(() => {
    if (!selected) return null;
    const days = parseFloat(quantity || "0");
    if (!isFinite(days) || days <= 0) return null;
    const unit = parseFloat(selected.costPerDay);
    const margin = marginOverride !== "" && marginOverride !== undefined
      ? parseFloat(marginOverride)
      : parseFloat(selected.marginPercent);
    const cost = unit * days;
    const total = cost * (1 + (isFinite(margin) ? margin : 0) / 100);
    return { cost, total, margin: isFinite(margin) ? margin : 0 };
  }, [selected, quantity, marginOverride]);

  const submit = form.handleSubmit((vals) => {
    onSubmit({
      uid: genUid(),
      type: "GIORNATE",
      description: vals.description || "",
      laborRateId: vals.laborRateId,
      quantity: vals.quantity,
      marginPercent: vals.marginPercent || undefined,
      unitOfMeasure: "gg",
      totalRow: preview ? preview.total.toFixed(2) : null,
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-3">
        <FormField
          control={form.control}
          name="laborRateId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Manodopera</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger data-testid="select-labor-rate">
                    <SelectValue placeholder="Seleziona voce manodopera" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {laborRates.map((l) => (
                    <SelectItem key={l.id} value={l.id} data-testid={`option-labor-${l.id}`}>
                      {l.name} — {parseFloat(l.costPerDay).toFixed(2)} €/gg
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="quantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Giornate</FormLabel>
              <FormControl>
                <Input type="number" step="any" {...field} data-testid="input-quantity-giornate" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="marginPercent"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Margine % (opzionale, default da catalogo)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="any"
                  placeholder={selected ? parseFloat(selected.marginPercent).toString() : ""}
                  {...field}
                  data-testid="input-margin-override-giornate"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrizione (opzionale)</FormLabel>
              <FormControl>
                <Input {...field} data-testid="input-description-giornate" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {preview && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1" data-testid="preview-giornate">
            <div>Costo: <span className="font-medium">€ {formatEur(preview.cost)}</span></div>
            <div>Margine: <span className="font-medium">{preview.margin.toFixed(2)}%</span></div>
            <div className="pt-1 border-t">
              Prezzo totale riga: <span className="font-semibold">€ {formatEur(preview.total)}</span>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="submit" data-testid="button-add-giornate-row">
            <Plus className="w-4 h-4 mr-2" />
            Aggiungi
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

// ==================== Main editor ====================

export default function QuoteEditorPage() {
  const params = useParams<{ id: string }>();
  const [location, navigate] = useLocation();
  const { toast } = useToast();

  // Determine mode: if route is /opportunities/:id/quotes/new => create with opportunityId = params.id
  // If /quotes/:id => edit existing quote with quoteId = params.id
  const isNew = location.startsWith("/opportunities/");
  const opportunityIdFromRoute = isNew ? params.id : null;
  const quoteId = isNew ? null : params.id;

  const [items, setItems] = useState<QuoteItemDraft[]>([]);
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [number, setNumber] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const materialsQuery = useQuery<MaterialWithThicknesses[]>({ queryKey: ["/api/materials"] });
  const articlesQuery = useQuery<CatalogArticle[]>({ queryKey: ["/api/catalog-articles"] });
  const laborRatesQuery = useQuery<LaborRate[]>({ queryKey: ["/api/labor-rates"] });

  // Existing quote (edit mode)
  const quoteQuery = useQuery<QuoteResponse>({
    queryKey: ["/api/quotes", quoteId],
    enabled: !!quoteId,
  });

  // Next number (create mode)
  const nextNumberQuery = useQuery<{ number: string }>({
    queryKey: ["/api/quotes/next-number"],
    enabled: isNew,
  });

  // Opportunity for header (loaded once we know the opportunityId)
  const opportunityId = isNew ? opportunityIdFromRoute : quoteQuery.data?.opportunityId;
  const opportunityQuery = useQuery<Opportunity>({
    queryKey: ["/api/opportunities", opportunityId],
    enabled: !!opportunityId,
  });

  // Hydrate state from loaded quote
  useEffect(() => {
    if (!quoteQuery.data) return;
    const q = quoteQuery.data;
    setSubject(q.subject || "");
    setNotes(q.notes || "");
    setNumber(q.number);
    setItems(
      (q.items || [])
        .slice()
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        .map((i) => ({
          uid: i.id,
          type: (i.type ?? "ARTICOLO") as QuoteItemType,
          description: i.description || "",
          materialId: i.materialId || undefined,
          materialThicknessId: i.materialThicknessId || undefined,
          developmentMm: i.developmentMm || undefined,
          catalogArticleId: i.catalogArticleId || undefined,
          laborRateId: i.laborRateId || undefined,
          quantity: i.quantity,
          marginPercent: i.marginPercent || undefined,
          unitOfMeasure: i.unitOfMeasure,
          totalRow: i.totalRow,
        })),
    );
  }, [quoteQuery.data]);

  // Hydrate next number for new quotes
  useEffect(() => {
    if (isNew && nextNumberQuery.data?.number && !number) {
      setNumber(nextNumberQuery.data.number);
    }
  }, [isNew, nextNumberQuery.data, number]);

  const totalEstimated = useMemo(() => {
    return items.reduce((sum, it) => sum + parseFloat(it.totalRow || "0"), 0);
  }, [items]);

  function buildPayload(): QuoteSavePayload {
    return {
      subject: subject || null,
      notes: notes || null,
      number: isNew ? (number || undefined) : undefined,
      items: items.map((it): QuoteItemPayload => {
        const margin =
          it.marginPercent !== undefined && it.marginPercent !== ""
            ? it.marginPercent
            : undefined;
        if (it.type === "LATTONERIA") {
          return {
            type: "LATTONERIA",
            description: it.description || null,
            quantity: it.quantity,
            marginPercent: margin,
            materialId: it.materialId ?? "",
            materialThicknessId: it.materialThicknessId ?? "",
            developmentMm: it.developmentMm ?? "",
          };
        }
        if (it.type === "ARTICOLO") {
          return {
            type: "ARTICOLO",
            description: it.description || null,
            quantity: it.quantity,
            marginPercent: margin,
            catalogArticleId: it.catalogArticleId ?? "",
          };
        }
        return {
          type: "GIORNATE",
          description: it.description || null,
          quantity: it.quantity,
          marginPercent: margin,
          laborRateId: it.laborRateId ?? "",
        };
      }),
    };
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      if (isNew) {
        const res = await apiRequest(
          "POST",
          `/api/opportunities/${opportunityIdFromRoute}/quotes`,
          payload,
        );
        return (await res.json()) as QuoteResponse;
      } else {
        const res = await apiRequest("PUT", `/api/quotes/${quoteId}`, payload);
        return (await res.json()) as QuoteResponse;
      }
    },
    onSuccess: (data) => {
      toast({ title: "Preventivo salvato", description: `Numero ${data.number}` });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", data.id] });
      if (opportunityId) {
        queryClient.invalidateQueries({ queryKey: ["/api/opportunities", opportunityId, "quotes"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/quotes/next-number"] });
      if (isNew) {
        navigate(`/quotes/${data.id}`);
      }
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Impossibile salvare il preventivo";
      toast({
        title: "Errore",
        description: message,
        variant: "destructive",
      });
    },
  });

  function moveItem(uid: string, dir: -1 | 1) {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.uid === uid);
      if (idx < 0) return prev;
      const ni = idx + dir;
      if (ni < 0 || ni >= prev.length) return prev;
      const next = prev.slice();
      const [it] = next.splice(idx, 1);
      next.splice(ni, 0, it);
      return next;
    });
  }

  function deleteItem(uid: string) {
    setItems((prev) => prev.filter((i) => i.uid !== uid));
  }

  const isLoading =
    materialsQuery.isLoading ||
    articlesQuery.isLoading ||
    laborRatesQuery.isLoading ||
    (!isNew && quoteQuery.isLoading) ||
    (isNew && nextNumberQuery.isLoading);

  const loadError = quoteQuery.error;

  function rowTypeBadge(type: QuoteItemType) {
    const map: Record<QuoteItemType, { label: string; cls: string }> = {
      LATTONERIA: { label: "Lattoneria", cls: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" },
      ARTICOLO: { label: "Articolo", cls: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100" },
      GIORNATE: { label: "Manodopera", cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100" },
    };
    const v = map[type];
    return <Badge className={v.cls} variant="secondary" data-testid={`badge-row-type-${type}`}>{v.label}</Badge>;
  }

  function rowDetails(it: QuoteItemDraft): string {
    if (it.type === "LATTONERIA") {
      const m = materialsQuery.data?.find((x) => x.id === it.materialId);
      const t = m?.thicknesses?.find((x) => x.id === it.materialThicknessId);
      const desc = it.description ||
        (m && t ? `${m.name} ${parseFloat(t.thicknessMm)}mm` : "Lattoneria");
      return `${desc} — sviluppo ${it.developmentMm || "?"}mm × ${it.quantity} ml`;
    }
    if (it.type === "ARTICOLO") {
      const a = articlesQuery.data?.find((x) => x.id === it.catalogArticleId);
      const desc = it.description || a?.name || "Articolo";
      return `${desc} — ${it.quantity} ${it.unitOfMeasure || a?.unitOfMeasure || "pz"}`;
    }
    const l = laborRatesQuery.data?.find((x) => x.id === it.laborRateId);
    const desc = it.description || l?.name || "Manodopera";
    return `${desc} — ${it.quantity} gg`;
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl space-y-4" data-testid="page-quote-editor">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/opportunities")} data-testid="button-back">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {isNew ? "Nuovo preventivo" : `Preventivo ${number}`}
          </h1>
          {opportunityQuery.data && (
            <div className="text-sm text-muted-foreground">
              Opportunità:{" "}
              <Link href={`/opportunities?selected=${opportunityQuery.data.id}`} className="underline">
                {opportunityQuery.data.title}
              </Link>
            </div>
          )}
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || isLoading}
          data-testid="button-save-quote"
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Salva preventivo
        </Button>
      </div>

      {loadError && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Errore nel caricamento del preventivo: {loadError instanceof Error ? loadError.message : "errore sconosciuto"}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Intestazione</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="quote-number">Numero preventivo</Label>
                <Input
                  id="quote-number"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  disabled={!isNew}
                  data-testid="input-quote-number"
                />
              </div>
              <div className="space-y-1">
                <Label>Data</Label>
                <Input
                  value={
                    quoteQuery.data?.createdAt
                      ? format(new Date(quoteQuery.data.createdAt), "dd MMMM yyyy", { locale: it })
                      : format(new Date(), "dd MMMM yyyy", { locale: it })
                  }
                  disabled
                  data-testid="input-quote-date"
                />
              </div>
              <div className="md:col-span-2 space-y-1">
                <Label htmlFor="quote-subject">Oggetto</Label>
                <Input
                  id="quote-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Es. Fornitura e posa lattoneria copertura..."
                  data-testid="input-quote-subject"
                />
              </div>
              <div className="md:col-span-2 space-y-1">
                <Label htmlFor="quote-notes">Note</Label>
                <Textarea
                  id="quote-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Note libere per il preventivo"
                  data-testid="input-quote-notes"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Righe</CardTitle>
              <Button onClick={() => setAddOpen(true)} size="sm" data-testid="button-open-add-row">
                <Plus className="w-4 h-4 mr-2" />
                Aggiungi riga
              </Button>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center" data-testid="empty-rows">
                  Nessuna riga. Aggiungi la prima voce con "Aggiungi riga".
                </div>
              ) : (
                <Table data-testid="table-quote-items">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Tipo</TableHead>
                      <TableHead>Descrizione</TableHead>
                      <TableHead className="text-right">Totale</TableHead>
                      <TableHead className="w-[140px] text-right">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it, idx) => (
                      <TableRow key={it.uid} data-testid={`row-quote-item-${it.uid}`}>
                        <TableCell>{rowTypeBadge(it.type)}</TableCell>
                        <TableCell className="text-sm">{rowDetails(it)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {it.totalRow ? `€ ${formatEur(parseFloat(it.totalRow))}` : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              disabled={idx === 0}
                              onClick={() => moveItem(it.uid, -1)}
                              data-testid={`button-move-up-${it.uid}`}
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              disabled={idx === items.length - 1}
                              onClick={() => moveItem(it.uid, 1)}
                              data-testid={`button-move-down-${it.uid}`}
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive"
                              onClick={() => deleteItem(it.uid)}
                              data-testid={`button-delete-${it.uid}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="flex justify-end mt-4 pt-3 border-t">
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Totale stimato</div>
                  <div className="text-2xl font-semibold" data-testid="text-total">
                    € {formatEur(totalEstimated)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    I prezzi vengono ricalcolati e congelati al salvataggio
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <AddRowDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(d) => setItems((prev) => [...prev, d])}
        materials={materialsQuery.data || []}
        catalogArticles={articlesQuery.data || []}
        laborRates={laborRatesQuery.data || []}
      />
    </div>
  );
}
