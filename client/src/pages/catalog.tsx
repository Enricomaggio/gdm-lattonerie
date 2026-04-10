import { useState, useEffect, useRef } from "react";
import { APP_CONFIG } from "@/lib/config";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useConfirmClose } from "@/hooks/use-confirm-close";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { useAuth, usePermission } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Package, Pencil, Loader2, Download, Plus, Trash2, Tag, CalendarRange, Check, Search, X } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatCurrency";
import type { PricingLogic, PricingLogicLegacy, UnitType, PricingData, RentalPricingData, LaborPricingData, TransportPricingData, TransportVehicle, DocumentPricingData, DocumentOption, SimplePricingData, SalePricingData, InstallationOption, InstallationData, ArticleVariant, ArticleVariantsData, TrasfertaData, ArticleCategory, HoistPricingData, HoistPricingTier, HoistInstallationData } from "@shared/schema";

interface Article {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: ArticleCategory;
  unitType: UnitType;
  pricingLogic: PricingLogicLegacy;
  basePrice: string;
  pricingData: PricingData | HoistPricingData | null;
  installationData: InstallationData | null;
  warehouseCostPerUnit: string | null;
  variantsData: ArticleVariantsData | null;
  trasfertaData: TrasfertaData | null;
  hoistInstallationData: HoistInstallationData | null;
  isChecklistItem: number;
  checklistOrder: number;
  isActive: number;
  quoteDescription: string | null;
  isAdditionalService: number;
  serviceDescriptionMounting: string | null;
  serviceDescriptionRental: string | null;
  serviceMountingApplyTrasferta: number;
  serviceUnitMounting: string | null;
  displayOrder: number;
}

interface PromoCode {
  id: string;
  companyId: string;
  code: string;
  description: string | null;
  discountPercent: string;
  validFrom: string;
  validTo: string;
  articleCodes: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

const emptyPromoForm = {
  description: "",
  discountPercent: "",
  validFrom: "",
  validTo: "",
  articleCodes: [] as string[],
};

const pricingLogicColors: Record<PricingLogicLegacy, string> = {
  RENTAL: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  DOCUMENT: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  TRANSPORT: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  SERVICE: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  HOIST: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  SALE: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
  EXTRA: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  LABOR: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
};

const pricingLogicLabels: Record<PricingLogicLegacy, string> = {
  RENTAL: "Noleggio",
  DOCUMENT: "Documento",
  TRANSPORT: "Trasporto",
  SERVICE: "Servizio",
  HOIST: "Ponteggi Elettrici",
  SALE: "Vendita",
  EXTRA: "Servizio",
  LABOR: "Servizio",
};

const unitTypeLabels: Record<UnitType, string> = {
  MQ: "mq",
  ML: "ml",
  CAD: "cad",
  NUM: "n.",
  MC: "mc",
  PZ: "pz",
  MT: "mt",
};

function formatPrice(article: Article): string {
  const data = article.pricingData;
  
  if (!data) {
    return `€ ${formatCurrency(parseFloat(article.basePrice))}`;
  }
  
  switch (article.pricingLogic) {
    case "RENTAL": {
      const rental = data as RentalPricingData & { firstMonthPrice?: number };
      if (rental.months_1_2 !== undefined) {
        return `€ ${formatCurrency(rental.months_1_2)} - ${formatCurrency(rental.months_9_plus)}`;
      }
      if (rental.firstMonthPrice !== undefined) {
        return `€ ${formatCurrency(rental.firstMonthPrice)}/mese`;
      }
      return `€ ${formatCurrency(parseFloat(article.basePrice))}`;
    }
    case "LABOR": {
      const labor = data as LaborPricingData & { mountPrice?: number; dismountPrice?: number };
      if (labor.mount !== undefined) {
        return `M: €${formatCurrency(labor.mount)} / S: €${formatCurrency(labor.dismount)}`;
      }
      if (labor.mountPrice !== undefined) {
        return `M: €${formatCurrency(labor.mountPrice)} / S: €${labor.dismountPrice != null ? formatCurrency(labor.dismountPrice) : 'N/D'}`;
      }
      return `€ ${formatCurrency(parseFloat(article.basePrice))}`;
    }
    case "TRANSPORT": {
      const transport = data as TransportPricingData & { fix?: number; perKm?: number; fixedPrice?: number; pricePerKm?: number };
      if (transport.vehicles && transport.vehicles.length > 0) {
        return `${transport.vehicles.length} veicol${transport.vehicles.length === 1 ? 'o' : 'i'}`;
      }
      if (transport.fix !== undefined) {
        return `€ ${formatCurrency(transport.fix)} + €${transport.perKm != null ? formatCurrency(transport.perKm) : 'N/D'}/km`;
      }
      if (transport.fixedPrice !== undefined) {
        return `€ ${formatCurrency(transport.fixedPrice)} + €${transport.pricePerKm != null ? formatCurrency(transport.pricePerKm) : 'N/D'}/km`;
      }
      return `€ ${formatCurrency(parseFloat(article.basePrice))}`;
    }
    case "DOCUMENT": {
      const doc = data as DocumentPricingData & { price?: number };
      if (doc.options && doc.options.length > 0) {
        return `${doc.options.length} opzion${doc.options.length === 1 ? 'e' : 'i'}`;
      }
      if (doc.price !== undefined) {
        return `€ ${formatCurrency(doc.price)}`;
      }
      return `€ ${formatCurrency(parseFloat(article.basePrice))}`;
    }
    case "SALE": {
      const sale = data as SalePricingData;
      if (sale?.price !== undefined) {
        const coverageInfo = sale.unitCoverage ? ` (${sale.unitCoverage} mq/unità)` : "";
        return `€ ${formatCurrency(sale.price)}${coverageInfo} (vendita)`;
      }
      return `€ ${formatCurrency(parseFloat(article.basePrice))} (vendita)`;
    }
    case "EXTRA":
    case "SERVICE": {
      const simple = data as SimplePricingData;
      if (simple?.price !== undefined) {
        return `€ ${formatCurrency(simple.price)}`;
      }
      return `€ ${formatCurrency(parseFloat(article.basePrice))}`;
    }
    default:
      return `€ ${formatCurrency(parseFloat(article.basePrice))}`;
  }
}

export default function CatalogPage() {
  const { user } = useAuth();
  const { isAdmin } = usePermission();
  const { toast } = useToast();
  const [showChecklistOnly, setShowChecklistOnly] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [articleToDelete, setArticleToDelete] = useState<Article | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const { setDirty: setEditArticleDirty, handleOpenChange: handleEditConfirmClose, ConfirmCloseDialog: EditConfirmCloseDialog } = useConfirmClose();
  const { setDirty: setNewArticleDirty, handleOpenChange: handleNewConfirmClose, ConfirmCloseDialog: NewConfirmCloseDialog } = useConfirmClose();
  const editArticleOriginalRef = useRef<string>("");
  const [newArticle, setNewArticle] = useState({
    code: "",
    name: "",
    description: "",
    category: "SCAFFOLDING" as ArticleCategory,
    unitType: "CAD" as UnitType,
    pricingLogic: "RENTAL" as PricingLogic,
    basePrice: "0",
    checklistOrder: 0,
  });

  // Promo Codes state
  const [isPromoDialogOpen, setIsPromoDialogOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<PromoCode | null>(null);
  const [promoToDelete, setPromoToDelete] = useState<PromoCode | null>(null);
  const [isPromoDeleteDialogOpen, setIsPromoDeleteDialogOpen] = useState(false);
  const [promoForm, setPromoForm] = useState({ ...emptyPromoForm });
  const [promoArticleCodeInput, setPromoArticleCodeInput] = useState("");

  const { data: articles = [], isLoading } = useQuery<Article[]>({
    queryKey: ["/api/articles", showChecklistOnly ? "checklist" : "all"],
    queryFn: async () => {
      const url = showChecklistOnly ? "/api/articles?checklist=true" : "/api/articles";
      const res = await apiRequest("GET", url);
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Errore nel caricamento articoli" }));
        throw new Error(error.message || "Errore nel caricamento articoli");
      }
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<Article> }) => {
      return apiRequest("PATCH", `/api/articles/${data.id}`, data.updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      setEditArticleDirty(false);
      setIsEditDialogOpen(false);
      setEditingArticle(null);
      toast({
        title: "Articolo aggiornato",
        description: "Le modifiche sono state salvate con successo.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile aggiornare l'articolo",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/articles/${id}`);
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Impossibile eliminare l'articolo" }));
        throw new Error(error.message || "Impossibile eliminare l'articolo");
      }
      // Handle 204 No Content or empty response
      const text = await res.text();
      return text ? JSON.parse(text) : { success: true };
    },
    onSuccess: () => {
      // Invalidate all article query variants (checklist=true, all, etc.)
      queryClient.invalidateQueries({ queryKey: ["/api/articles"], exact: false });
      setIsDeleteDialogOpen(false);
      setArticleToDelete(null);
      toast({
        title: "Articolo eliminato",
        description: "L'articolo è stato rimosso dal listino.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile eliminare l'articolo",
        variant: "destructive",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newArticle) => {
      const res = await apiRequest("POST", "/api/articles", data);
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Impossibile creare l'articolo" }));
        throw new Error(error.message || "Impossibile creare l'articolo");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      setNewArticleDirty(false);
      setIsNewDialogOpen(false);
      setNewArticle({
        code: "",
        name: "",
        description: "",
        category: "SCAFFOLDING",
        unitType: "CAD",
        pricingLogic: "RENTAL",
        basePrice: "0",
        checklistOrder: 0,
      });
      toast({
        title: "Articolo creato",
        description: "Il nuovo articolo è stato aggiunto al listino.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile creare l'articolo",
        variant: "destructive",
      });
    },
  });

  const seedMutation = useMutation({
    mutationFn: async (force: boolean = false) => {
      const res = await apiRequest("POST", "/api/catalog/seed-defaults", { force });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Impossibile inizializzare il listino" }));
        throw new Error(error.message || "Impossibile inizializzare il listino");
      }
      return res.json();
    },
    onSuccess: (data: { message: string; count: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      toast({
        title: "Listino inizializzato",
        description: data.message || "Il listino standard è stato caricato con successo.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile inizializzare il listino",
        variant: "destructive",
      });
    },
  });

  const { data: promoCodes = [], isLoading: isPromoLoading } = useQuery<PromoCode[]>({
    queryKey: ["/api/promo-codes"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/promo-codes");
      if (!res.ok) throw new Error("Errore nel caricamento promozioni");
      return res.json();
    },
    enabled: isAdmin,
  });

  const createPromoMutation = useMutation({
    mutationFn: async (data: typeof emptyPromoForm) => {
      const res = await apiRequest("POST", "/api/promo-codes", data);
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Impossibile creare la promozione" }));
        throw new Error(error.message || "Impossibile creare la promozione");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/promo-codes"] });
      setIsPromoDialogOpen(false);
      setPromoForm({ ...emptyPromoForm });
      toast({ title: "Promozione creata", description: "La nuova promozione è stata aggiunta." });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const updatePromoMutation = useMutation({
    mutationFn: async (data: { id: string; updates: typeof emptyPromoForm }) => {
      const res = await apiRequest("PATCH", `/api/promo-codes/${data.id}`, data.updates);
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Impossibile aggiornare la promozione" }));
        throw new Error(error.message || "Impossibile aggiornare la promozione");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/promo-codes"] });
      setIsPromoDialogOpen(false);
      setEditingPromo(null);
      setPromoForm({ ...emptyPromoForm });
      toast({ title: "Promozione aggiornata", description: "Le modifiche sono state salvate." });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const deletePromoMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/promo-codes/${id}`);
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Impossibile eliminare la promozione" }));
        throw new Error(error.message || "Impossibile eliminare la promozione");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/promo-codes"] });
      setIsPromoDeleteDialogOpen(false);
      setPromoToDelete(null);
      toast({ title: "Promozione eliminata", description: "La promozione è stata rimossa." });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  function openNewPromoDialog() {
    setEditingPromo(null);
    setPromoForm({ ...emptyPromoForm });
    setIsPromoDialogOpen(true);
  }

  function openEditPromoDialog(promo: PromoCode) {
    setEditingPromo(promo);
    setPromoForm({
      description: promo.description || "",
      discountPercent: promo.discountPercent,
      validFrom: promo.validFrom.slice(0, 10),
      validTo: promo.validTo.slice(0, 10),
      articleCodes: promo.articleCodes || [],
    });
    setIsPromoDialogOpen(true);
  }

  function handlePromoSave() {
    if (!promoForm.description || !promoForm.discountPercent || !promoForm.validFrom || !promoForm.validTo) {
      toast({ title: "Dati mancanti", description: "Compila tutti i campi obbligatori.", variant: "destructive" });
      return;
    }
    if (editingPromo) {
      updatePromoMutation.mutate({ id: editingPromo.id, updates: promoForm });
    } else {
      createPromoMutation.mutate(promoForm);
    }
  }

  function isPromoActive(promo: PromoCode): boolean {
    const now = new Date();
    return new Date(promo.validFrom) <= now && new Date(promo.validTo) >= now;
  }

  useEffect(() => {
    if (editingArticle && editArticleOriginalRef.current) {
      setEditArticleDirty(JSON.stringify(editingArticle) !== editArticleOriginalRef.current);
    }
  }, [editingArticle, setEditArticleDirty]);

  const newArticleDefaults = JSON.stringify({
    code: "", name: "", description: "",
    category: "SCAFFOLDING", unitType: "CAD",
    pricingLogic: "RENTAL", basePrice: "0", checklistOrder: 0,
  });
  useEffect(() => {
    setNewArticleDirty(JSON.stringify(newArticle) !== newArticleDefaults);
  }, [newArticle, newArticleDefaults, setNewArticleDirty]);

  function handleEdit(article: Article) {
    const copy = { ...article };
    setEditingArticle(copy);
    editArticleOriginalRef.current = JSON.stringify(copy);
    setEditArticleDirty(false);
    setIsEditDialogOpen(true);
  }

  function handleDelete(article: Article) {
    setArticleToDelete(article);
    setIsDeleteDialogOpen(true);
  }

  function confirmDelete() {
    if (articleToDelete) {
      deleteMutation.mutate(articleToDelete.id);
    }
  }

  function handleSave() {
    if (!editingArticle) return;
    
    const updates: Partial<Article> = {
      name: editingArticle.name,
      description: editingArticle.description,
      unitType: editingArticle.unitType,
      basePrice: editingArticle.basePrice,
      pricingData: editingArticle.pricingData,
      installationData: editingArticle.installationData,
      warehouseCostPerUnit: editingArticle.warehouseCostPerUnit,
      variantsData: editingArticle.variantsData,
      trasfertaData: editingArticle.trasfertaData,
      checklistOrder: editingArticle.checklistOrder,
      isChecklistItem: editingArticle.checklistOrder > 0 ? 1 : 0,
      quoteDescription: editingArticle.quoteDescription,
      isAdditionalService: editingArticle.isAdditionalService,
      serviceDescriptionMounting: editingArticle.serviceDescriptionMounting,
      serviceDescriptionRental: editingArticle.serviceDescriptionRental,
      serviceMountingApplyTrasferta: editingArticle.serviceMountingApplyTrasferta,
      serviceUnitMounting: editingArticle.serviceUnitMounting,
      displayOrder: editingArticle.displayOrder,
    };
    
    updateMutation.mutate({ id: editingArticle.id, updates });
  }

  if (!user) return null;

  return (
    <DashboardLayout user={user} fullWidth>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Package className="w-6 h-6" />
              Catalogo Articoli
            </h1>
            <p className="text-muted-foreground">
              Gestisci il listino prezzi per il preventivatore
            </p>
          </div>
          
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Listino Prezzi</CardTitle>
              <CardDescription>
                {showChecklistOnly 
                  ? `${articles.length} voci del preventivatore`
                  : `${articles.length} articoli totali`
                }
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button 
                  onClick={() => setIsNewDialogOpen(true)}
                  data-testid="button-new-article"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Nuovo Articolo
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : articles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <Package className="w-8 h-8 text-muted-foreground" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="font-semibold text-lg">Nessun articolo nel listino</h3>
                  <p className="text-muted-foreground max-w-sm">
                    Il tuo listino articoli è vuoto. Inizializza il catalogo con le voci standard per ponteggi.
                  </p>
                </div>
                <Button 
                  size="lg"
                  onClick={() => seedMutation.mutate(false)}
                  disabled={seedMutation.isPending}
                  data-testid="button-seed-catalog"
                >
                  {seedMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Inizializzazione...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Inizializza Listino Standard
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Codice</TableHead>
                    <TableHead>Nome Articolo</TableHead>
                    {APP_CONFIG.modulePonteggi && <TableHead className="w-28">Categoria</TableHead>}
                    <TableHead className="w-16">Unità</TableHead>
                    <TableHead className="w-40">Prezzo</TableHead>
                    {APP_CONFIG.modulePonteggi && <TableHead className="w-24">Mag.</TableHead>}
                    {APP_CONFIG.modulePonteggi && <TableHead className="w-24">Checklist</TableHead>}
                    {isAdmin && <TableHead className="w-20">Azioni</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {articles.map((article) => (
                    <TableRow 
                      key={article.id} 
                      data-testid={`row-article-${article.id}`}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleEdit(article)}
                    >
                      <TableCell className="font-mono text-sm">
                        {article.code}
                      </TableCell>
                      <TableCell className="font-medium">
                        {article.name}
                      </TableCell>
                      {APP_CONFIG.modulePonteggi && (
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={pricingLogicColors[article.pricingLogic]}
                          >
                            {pricingLogicLabels[article.pricingLogic]}
                          </Badge>
                        </TableCell>
                      )}
                      <TableCell className="text-muted-foreground">
                        {unitTypeLabels[article.unitType]}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatPrice(article)}
                      </TableCell>
                      {APP_CONFIG.modulePonteggi && (
                        <TableCell className="text-sm">
                          {article.warehouseCostPerUnit ? (
                            <span className="font-mono">
                              €{formatCurrency(parseFloat(article.warehouseCostPerUnit))}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      )}
                      {APP_CONFIG.modulePonteggi && (
                        <TableCell>
                          {article.isChecklistItem === 1 ? (
                            <Badge variant="outline" className="bg-accent/50">
                              Sì ({article.checklistOrder})
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">No</span>
                          )}
                        </TableCell>
                      )}
                      {isAdmin && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => { e.stopPropagation(); handleEdit(article); }}
                              data-testid={`button-edit-${article.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => { e.stopPropagation(); handleDelete(article); }}
                              data-testid={`button-delete-${article.id}`}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

      </div>

      {/* Dialog Promo - Crea / Modifica */}
      <Dialog open={isPromoDialogOpen} onOpenChange={(open) => { setIsPromoDialogOpen(open); if (!open) setEditingPromo(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPromo ? "Modifica Promozione" : "Nuova Promozione"}</DialogTitle>
            <DialogDescription>
              Configura uno sconto applicato automaticamente nel preventivatore
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="promo-description">Descrizione *</Label>
                <Input
                  id="promo-description"
                  value={promoForm.description}
                  onChange={(e) => setPromoForm({ ...promoForm, description: e.target.value })}
                  placeholder="Es. Promozione estate 2024"
                  data-testid="input-promo-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="promo-discount">Sconto (%) *</Label>
                <Input
                  id="promo-discount"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={promoForm.discountPercent}
                  onChange={(e) => setPromoForm({ ...promoForm, discountPercent: e.target.value })}
                  placeholder="Es. 10"
                  data-testid="input-promo-discount"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="promo-valid-from">
                  <CalendarRange className="w-3.5 h-3.5 inline mr-1" />
                  Valida dal *
                </Label>
                <Input
                  id="promo-valid-from"
                  type="date"
                  value={promoForm.validFrom}
                  onChange={(e) => setPromoForm({ ...promoForm, validFrom: e.target.value })}
                  data-testid="input-promo-valid-from"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="promo-valid-to">Valida al *</Label>
                <Input
                  id="promo-valid-to"
                  type="date"
                  value={promoForm.validTo}
                  onChange={(e) => setPromoForm({ ...promoForm, validTo: e.target.value })}
                  data-testid="input-promo-valid-to"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Articoli limitati (opzionale)</Label>
              <p className="text-xs text-muted-foreground">
                Seleziona gli articoli a cui limitare la promo. Se nessuno è selezionato, la promo vale su tutti gli articoli.
              </p>
              {promoForm.articleCodes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {promoForm.articleCodes.map((code) => {
                    const art = articles.find(a => a.code === code);
                    return (
                      <Badge
                        key={code}
                        variant="secondary"
                        className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground gap-1"
                        onClick={() => setPromoForm({ ...promoForm, articleCodes: promoForm.articleCodes.filter(c => c !== code) })}
                        data-testid={`badge-article-code-${code}`}
                      >
                        {code}{art ? ` - ${art.name}` : ""} <X className="w-3 h-3" />
                      </Badge>
                    );
                  })}
                </div>
              )}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cerca articolo per codice o nome..."
                  value={promoArticleCodeInput}
                  onChange={(e) => setPromoArticleCodeInput(e.target.value)}
                  className="pl-9"
                  data-testid="input-promo-article-search"
                />
              </div>
              <div className="border rounded-md max-h-40 overflow-y-auto">
                {articles
                  .filter(a => a.isActive)
                  .filter(a => {
                    if (!promoArticleCodeInput) return true;
                    const q = promoArticleCodeInput.toLowerCase();
                    return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
                  })
                  .map(article => {
                    const isSelected = promoForm.articleCodes.includes(article.code);
                    return (
                      <div
                        key={article.id}
                        className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent text-sm border-b last:border-b-0 ${isSelected ? "bg-accent/50" : ""}`}
                        onClick={() => {
                          if (isSelected) {
                            setPromoForm({ ...promoForm, articleCodes: promoForm.articleCodes.filter(c => c !== article.code) });
                          } else {
                            setPromoForm({ ...promoForm, articleCodes: [...promoForm.articleCodes, article.code] });
                          }
                        }}
                        data-testid={`option-article-${article.code}`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? "bg-primary border-primary text-primary-foreground" : "border-input"}`}>
                          {isSelected && <Check className="w-3 h-3" />}
                        </div>
                        <span className="font-mono text-xs text-muted-foreground flex-shrink-0">{article.code}</span>
                        <span className="truncate">{article.name}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPromoDialogOpen(false)}>Annulla</Button>
            <Button
              onClick={handlePromoSave}
              disabled={createPromoMutation.isPending || updatePromoMutation.isPending}
              data-testid="button-save-promo"
            >
              {(createPromoMutation.isPending || updatePromoMutation.isPending) ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvataggio...</>
              ) : (
                editingPromo ? "Salva Modifiche" : "Crea Promozione"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Elimina Promo */}
      <Dialog open={isPromoDeleteDialogOpen} onOpenChange={setIsPromoDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Elimina Promozione</DialogTitle>
            <DialogDescription>
              Sei sicuro di voler eliminare la promozione <strong>{promoToDelete?.description || "selezionata"}</strong>? I preventivi già salvati non cambiano.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPromoDeleteDialogOpen(false)}>Annulla</Button>
            <Button
              variant="destructive"
              onClick={() => promoToDelete && deletePromoMutation.mutate(promoToDelete.id)}
              disabled={deletePromoMutation.isPending}
              data-testid="button-confirm-delete-promo"
            >
              {deletePromoMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Elimina"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
        if (!open) {
          handleEditConfirmClose(false, () => {
            setIsEditDialogOpen(false);
            setEditingArticle(null);
            setEditArticleDirty(false);
          });
          return;
        }
        setIsEditDialogOpen(open);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isAdmin ? "Modifica Articolo" : "Dettaglio Articolo"}</DialogTitle>
            <DialogDescription>
              {editingArticle?.code} - {editingArticle?.name}
            </DialogDescription>
          </DialogHeader>
          
          {editingArticle && (
            <div className="space-y-4">
              <div className={`space-y-4 ${!isAdmin ? "pointer-events-none opacity-80" : ""}`}>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Nome Articolo</Label>
                  <Input
                    id="edit-name"
                    value={editingArticle.name}
                    readOnly={!isAdmin}
                    onChange={(e) => setEditingArticle({ ...editingArticle, name: e.target.value })}
                    data-testid="input-edit-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-unit">Unità di Misura</Label>
                  <Select
                    value={editingArticle.unitType}
                    onValueChange={(v) => setEditingArticle({ ...editingArticle, unitType: v as UnitType })}
                  >
                    <SelectTrigger id="edit-unit" data-testid="select-edit-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MQ">Metri Quadri (mq)</SelectItem>
                      <SelectItem value="ML">Metri Lineari (ml)</SelectItem>
                      <SelectItem value="MC">Metri Cubi (mc)</SelectItem>
                      <SelectItem value="MT">Metri (mt)</SelectItem>
                      <SelectItem value="CAD">Cadauno (cad)</SelectItem>
                      <SelectItem value="PZ">Pezzi (pz)</SelectItem>
                      <SelectItem value="NUM">Numero (n.)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">Descrizione</Label>
                <Textarea
                  id="edit-description"
                  value={editingArticle.description || ""}
                  onChange={(e) => setEditingArticle({ ...editingArticle, description: e.target.value })}
                  rows={2}
                  data-testid="input-edit-description"
                />
              </div>

              {APP_CONFIG.modulePonteggi && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Badge className={pricingLogicColors[editingArticle.pricingLogic]}>
                      {pricingLogicLabels[editingArticle.pricingLogic]}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-order">Ordine Checklist</Label>
                    <Input
                      id="edit-order"
                      type="number"
                      min={0}
                      value={editingArticle.checklistOrder || ""}
                      onChange={(e) => {
                        const newOrder = parseInt(e.target.value) || 0;
                        setEditingArticle({
                          ...editingArticle,
                          checklistOrder: newOrder,
                          isChecklistItem: newOrder > 0 ? 1 : 0
                        });
                      }}
                      placeholder="0 = non in checklist"
                      data-testid="input-edit-order"
                    />
                  </div>
                </div>
              )}

              {APP_CONFIG.modulePonteggi && (
                <div className="space-y-2">
                  <Label htmlFor="edit-warehouse-cost">
                    Costo Magazzino (€/{unitTypeLabels[editingArticle.unitType]})
                  </Label>
                  <Input
                    id="edit-warehouse-cost"
                    type="number"
                    step="0.01"
                    min={0}
                    value={editingArticle.warehouseCostPerUnit || ""}
                    onChange={(e) => setEditingArticle({
                      ...editingArticle,
                      warehouseCostPerUnit: e.target.value || null
                    })}
                    placeholder="Es. 0.60"
                    data-testid="input-edit-warehouse-cost"
                  />
                  <p className="text-xs text-muted-foreground">
                    Costo unitario per la movimentazione di magazzino
                  </p>
                </div>
              )}

              {/* Sezione Servizio Aggiuntivo per Preventivo */}
              {APP_CONFIG.modulePonteggi && <div className="border-t pt-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={editingArticle.isAdditionalService === 1}
                    onCheckedChange={(checked) => setEditingArticle({ 
                      ...editingArticle, 
                      isAdditionalService: checked ? 1 : 0,
                      serviceDescriptionMounting: checked ? editingArticle.serviceDescriptionMounting : null,
                      serviceDescriptionRental: checked ? editingArticle.serviceDescriptionRental : null,
                    })}
                    data-testid="switch-additional-service"
                  />
                  <div>
                    <Label className="text-sm font-medium">Servizio Aggiuntivo nel Preventivo</Label>
                    <p className="text-xs text-muted-foreground">
                      Se attivo, questo articolo apparirà nella sezione "Altri Servizi" del preventivo
                    </p>
                  </div>
                </div>
                
                {editingArticle.isAdditionalService === 1 && (
                  <div className="space-y-3 pl-2 border-l-2 border-teal-300 dark:border-teal-700">
                    <p className="text-xs text-muted-foreground">
                      Questi campi definiscono come l'articolo appare nella sezione "Altri Servizi Opzionali" del preventivo.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="edit-service-mounting">Testo M/S per Altri Servizi</Label>
                      <Textarea
                        id="edit-service-mounting"
                        value={editingArticle.serviceDescriptionMounting || ""}
                        onChange={(e) => setEditingArticle({ ...editingArticle, serviceDescriptionMounting: e.target.value || null })}
                        rows={2}
                        placeholder="Es. Montaggio e Smontaggio mantovana di protezione"
                        data-testid="input-service-mounting"
                      />
                      {editingArticle.serviceDescriptionMounting && editingArticle.unitType !== 'MQ' && editingArticle.unitType !== 'ML' && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Unità di misura M/S (override)</Label>
                          <select
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={editingArticle.serviceUnitMounting || ""}
                            onChange={(e) => setEditingArticle({ ...editingArticle, serviceUnitMounting: e.target.value || null })}
                            data-testid="select-service-unit-mounting"
                          >
                            <option value="">Usa unità articolo ({editingArticle.unitType})</option>
                            <option value="MQ">mq. (metri quadri)</option>
                            <option value="ML">mt. (metri lineari)</option>
                            <option value="CAD">cad. (cadauno)</option>
                            <option value="NUM">n. (numero)</option>
                          </select>
                          <p className="text-xs text-muted-foreground">Se la posa ha un'unità diversa dall'articolo (es. posa al mq per un articolo venduto a cadauno)</p>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={editingArticle.serviceMountingApplyTrasferta === 1}
                          onCheckedChange={(checked) => setEditingArticle({ ...editingArticle, serviceMountingApplyTrasferta: checked ? 1 : 0 })}
                          data-testid="switch-trasferta"
                        />
                        <Label className="text-xs text-muted-foreground">Applica coefficiente trasferta al prezzo M/S</Label>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-service-rental">Testo Noleggio per Altri Servizi</Label>
                      <Textarea
                        id="edit-service-rental"
                        value={editingArticle.serviceDescriptionRental || ""}
                        onChange={(e) => setEditingArticle({ ...editingArticle, serviceDescriptionRental: e.target.value || null })}
                        rows={2}
                        placeholder="Es. Noleggio mantovana di protezione"
                        data-testid="input-service-rental"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-display-order">Ordine in Altri Servizi</Label>
                      <Input
                        id="edit-display-order"
                        type="number"
                        min={0}
                        value={editingArticle.displayOrder || ""}
                        onChange={(e) => setEditingArticle({ ...editingArticle, displayOrder: parseInt(e.target.value) || 0 })}
                        placeholder="0 = ordine predefinito"
                        data-testid="input-display-order"
                      />
                    </div>
                  </div>
                )}
              </div>}

              </div>

              {APP_CONFIG.modulePonteggi && (editingArticle.code === "TRA-BAR" ? (
                <div className={`border-t pt-4 space-y-4 ${!isAdmin ? "pointer-events-none opacity-80" : ""}`}>
                  <BarcaVariantsEditor
                    article={editingArticle}
                    onChange={setEditingArticle}
                  />
                </div>
              ) : editingArticle.category === "TRASFERTA" ? (
                <div className={`border-t pt-4 space-y-4 ${!isAdmin ? "pointer-events-none opacity-80" : ""}`}>
                  <h4 className="font-medium mb-3">Costi Trasferta</h4>
                  <TrasfertaDataEditor
                    article={editingArticle}
                    onChange={setEditingArticle}
                  />
                  <div className="border-t pt-4">
                    <VeniceZoneEditor
                      article={editingArticle}
                      onChange={setEditingArticle}
                    />
                  </div>
                </div>
              ) : editingArticle.pricingLogic === "HOIST" ? (
                <div className={`border-t pt-4 ${!isAdmin ? "pointer-events-none opacity-80" : ""}`}>
                  <h4 className="font-medium mb-3">Varianti Ponteggi Elettrici</h4>
                  <HoistVariantsEditor
                    article={editingArticle}
                    onChange={setEditingArticle}
                  />
                </div>
              ) : editingArticle.pricingLogic === "RENTAL" || editingArticle.pricingLogic === "SALE" ? (
                <Tabs defaultValue="pricing" className="border-t pt-4">
                  <TabsList className={`grid w-full ${editingArticle.pricingLogic === "SALE" ? "grid-cols-2" : "grid-cols-3"}`}>
                    <TabsTrigger value="pricing" data-testid="tab-pricing">{editingArticle.pricingLogic === "SALE" ? "Prezzo Vendita" : "Prezzi Noleggio"}</TabsTrigger>
                    <TabsTrigger value="installation" data-testid="tab-installation">Manodopera</TabsTrigger>
                    {editingArticle.pricingLogic !== "SALE" && (
                      <TabsTrigger value="variants" data-testid="tab-variants">Varianti</TabsTrigger>
                    )}
                  </TabsList>
                  <div className={!isAdmin ? "pointer-events-none opacity-80" : ""}>
                  <TabsContent value="pricing" className="mt-4">
                    <PricingDataEditor
                      article={editingArticle}
                      onChange={setEditingArticle}
                    />
                  </TabsContent>
                  <TabsContent value="installation" className="mt-4">
                    <InstallationDataEditor
                      article={editingArticle}
                      onChange={setEditingArticle}
                    />
                  </TabsContent>
                  {editingArticle.pricingLogic !== "SALE" && (
                    <TabsContent value="variants" className="mt-4">
                      <VariantsDataEditor
                        article={editingArticle}
                        onChange={setEditingArticle}
                      />
                    </TabsContent>
                  )}
                  </div>
                </Tabs>
              ) : (
                <div className={`border-t pt-4 ${!isAdmin ? "pointer-events-none opacity-80" : ""}`}>
                  <h4 className="font-medium mb-3">Dati Prezzo</h4>
                  <PricingDataEditor
                    article={editingArticle}
                    onChange={setEditingArticle}
                  />
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              {isAdmin ? "Annulla" : "Chiudi"}
            </Button>
            {isAdmin && (
            <Button 
              onClick={handleSave} 
              disabled={updateMutation.isPending}
              data-testid="button-save-article"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvataggio...
                </>
              ) : (
                "Salva Modifiche"
              )}
            </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => {
        setIsDeleteDialogOpen(open);
        if (!open) setArticleToDelete(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conferma Eliminazione</DialogTitle>
            <DialogDescription>
              Sei sicuro di voler eliminare l'articolo <strong>{articleToDelete?.name}</strong> ({articleToDelete?.code})?
              <br />
              Questa azione non può essere annullata.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              data-testid="button-cancel-delete"
            >
              Annulla
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminazione...
                </>
              ) : (
                "Elimina"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isNewDialogOpen} onOpenChange={(open) => {
        if (!open) {
          handleNewConfirmClose(false, () => {
            setIsNewDialogOpen(false);
            setNewArticle({
              code: "", name: "", description: "",
              category: "SCAFFOLDING", unitType: "CAD",
              pricingLogic: "RENTAL", basePrice: "0", checklistOrder: 0,
            });
            setNewArticleDirty(false);
          });
          return;
        }
        setIsNewDialogOpen(open);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuovo Articolo</DialogTitle>
            <DialogDescription>
              Crea un nuovo articolo nel listino
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-code">Codice Articolo</Label>
                <Input
                  id="new-code"
                  value={newArticle.code}
                  onChange={(e) => setNewArticle({ ...newArticle, code: e.target.value.toUpperCase() })}
                  placeholder="Auto-generato"
                  data-testid="input-new-code"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-name">Nome Articolo *</Label>
                <Input
                  id="new-name"
                  value={newArticle.name}
                  onChange={(e) => setNewArticle({ ...newArticle, name: e.target.value })}
                  placeholder="Es: Scale a servire"
                  data-testid="input-new-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-unit">Unità di Misura</Label>
                <Select
                  value={newArticle.unitType}
                  onValueChange={(v) => setNewArticle({ ...newArticle, unitType: v as UnitType })}
                >
                  <SelectTrigger id="new-unit" data-testid="select-new-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MQ">Metri Quadri (mq)</SelectItem>
                    <SelectItem value="ML">Metri Lineari (ml)</SelectItem>
                    <SelectItem value="MC">Metri Cubi (mc)</SelectItem>
                    <SelectItem value="MT">Metri (mt)</SelectItem>
                    <SelectItem value="CAD">Cadauno (cad)</SelectItem>
                    <SelectItem value="PZ">Pezzi (pz)</SelectItem>
                    <SelectItem value="NUM">Numero (n.)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-description">Descrizione</Label>
              <Textarea
                id="new-description"
                value={newArticle.description}
                onChange={(e) => setNewArticle({ ...newArticle, description: e.target.value })}
                placeholder="Descrizione dell'articolo..."
                data-testid="input-new-description"
              />
            </div>

            {APP_CONFIG.modulePonteggi && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new-article-category">Categoria</Label>
                  <Select
                    value={newArticle.category}
                    onValueChange={(v) => setNewArticle({ ...newArticle, category: v as ArticleCategory })}
                  >
                    <SelectTrigger id="new-article-category" data-testid="select-new-article-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SCAFFOLDING">Ponteggio</SelectItem>
                      <SelectItem value="SCAFFOLDING_LABOR">Manodopera</SelectItem>
                      <SelectItem value="TRANSPORT">Trasporto</SelectItem>
                      <SelectItem value="TRASFERTA">Trasferta</SelectItem>
                      <SelectItem value="SERVICE">Servizio</SelectItem>
                      <SelectItem value="HANDLING">Movimentazione</SelectItem>
                      <SelectItem value="HOIST">Montacarichi</SelectItem>
                      <SelectItem value="DOCUMENT">Documento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-pricing-logic">Logica Prezzo</Label>
                  <Select
                    value={newArticle.pricingLogic}
                    onValueChange={(v) => setNewArticle({ ...newArticle, pricingLogic: v as PricingLogic })}
                  >
                    <SelectTrigger id="new-pricing-logic" data-testid="select-new-pricing-logic">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RENTAL">Noleggio</SelectItem>
                      <SelectItem value="SALE">Vendita</SelectItem>
                      <SelectItem value="HOIST">Ponteggi Elettrici</SelectItem>
                      <SelectItem value="TRANSPORT">Trasporto</SelectItem>
                      <SelectItem value="DOCUMENT">Documento</SelectItem>
                      <SelectItem value="SERVICE">Servizio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {APP_CONFIG.modulePonteggi && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new-checklist">Ordine Checklist</Label>
                  <Input
                    id="new-checklist"
                    type="number"
                    value={newArticle.checklistOrder || ""}
                    onChange={(e) => setNewArticle({ ...newArticle, checklistOrder: parseInt(e.target.value) || 0 })}
                    placeholder="0 = non in checklist"
                    data-testid="input-new-checklist"
                  />
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Dopo la creazione potrai configurare prezzi, varianti e manodopera dalla modifica articolo.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsNewDialogOpen(false)}
              data-testid="button-cancel-new"
            >
              Annulla
            </Button>
            <Button
              onClick={() => createMutation.mutate(newArticle)}
              disabled={createMutation.isPending || !newArticle.name.trim()}
              data-testid="button-save-new"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creazione...
                </>
              ) : (
                "Crea Articolo"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {EditConfirmCloseDialog}
      {NewConfirmCloseDialog}
    </DashboardLayout>
  );
}

interface PricingDataEditorProps {
  article: Article;
  onChange: (article: Article) => void;
}

function PricingDataEditor({ article, onChange }: PricingDataEditorProps) {
  const data = article.pricingData;

  function updatePricingData(updates: Partial<PricingData>) {
    onChange({
      ...article,
      pricingData: { ...(data || {}), ...updates } as PricingData,
    });
  }

  switch (article.pricingLogic) {
    case "RENTAL": {
      const rawData = data as RentalPricingData & { firstMonthPrice?: number };
      const rental = rawData?.months_1_2 !== undefined 
        ? rawData 
        : { months_1_2: rawData?.firstMonthPrice || 0, months_3_5: 0, months_6_8: 0, months_9_plus: 0 };
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Prezzi per fasce temporali (€/{unitTypeLabels[article.unitType] || article.unitType.toLowerCase()}/mese)</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rental-1-2">1-2 Mesi</Label>
              <Input
                id="rental-1-2"
                type="number"
                step="0.01"
                value={rental.months_1_2 || ""}
                onChange={(e) => updatePricingData({ months_1_2: parseFloat(e.target.value) || 0, months_3_5: rental.months_3_5, months_6_8: rental.months_6_8, months_9_plus: rental.months_9_plus })}
                data-testid="input-rental-1-2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rental-3-5">3-5 Mesi</Label>
              <Input
                id="rental-3-5"
                type="number"
                step="0.01"
                value={rental.months_3_5 || ""}
                onChange={(e) => updatePricingData({ months_1_2: rental.months_1_2, months_3_5: parseFloat(e.target.value) || 0, months_6_8: rental.months_6_8, months_9_plus: rental.months_9_plus })}
                data-testid="input-rental-3-5"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rental-6-8">6-8 Mesi</Label>
              <Input
                id="rental-6-8"
                type="number"
                step="0.01"
                value={rental.months_6_8 || ""}
                onChange={(e) => updatePricingData({ months_1_2: rental.months_1_2, months_3_5: rental.months_3_5, months_6_8: parseFloat(e.target.value) || 0, months_9_plus: rental.months_9_plus })}
                data-testid="input-rental-6-8"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rental-9-plus">9+ Mesi</Label>
              <Input
                id="rental-9-plus"
                type="number"
                step="0.01"
                value={rental.months_9_plus || ""}
                onChange={(e) => updatePricingData({ months_1_2: rental.months_1_2, months_3_5: rental.months_3_5, months_6_8: rental.months_6_8, months_9_plus: parseFloat(e.target.value) || 0 })}
                data-testid="input-rental-9-plus"
              />
            </div>
          </div>
        </div>
      );
    }

    case "LABOR": {
      const rawLabor = data as LaborPricingData & { mountPrice?: number; dismountPrice?: number };
      const labor = rawLabor?.mount !== undefined
        ? rawLabor
        : { mount: rawLabor?.mountPrice || 0, dismount: rawLabor?.dismountPrice || 0 };
      return (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="labor-mount">Montaggio (€/{unitTypeLabels[article.unitType] || article.unitType.toLowerCase()})</Label>
            <Input
              id="labor-mount"
              type="number"
              step="0.01"
              value={labor.mount || ""}
              onChange={(e) => updatePricingData({ mount: parseFloat(e.target.value) || 0, dismount: labor.dismount })}
              data-testid="input-labor-mount"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="labor-dismount">Smontaggio (€/{unitTypeLabels[article.unitType] || article.unitType.toLowerCase()})</Label>
            <Input
              id="labor-dismount"
              type="number"
              step="0.01"
              value={labor.dismount || ""}
              onChange={(e) => updatePricingData({ mount: labor.mount, dismount: parseFloat(e.target.value) || 0 })}
              data-testid="input-labor-dismount"
            />
          </div>
        </div>
      );
    }

    case "TRANSPORT": {
      const rawTransport = data as TransportPricingData & { fix?: number; perKm?: number; fixedPrice?: number; pricePerKm?: number };
      const vehicles: TransportVehicle[] = rawTransport?.vehicles || 
        (rawTransport?.fix !== undefined ? [{ name: "Veicolo", fix: rawTransport.fix, perKm: rawTransport.perKm || 0 }] : 
        rawTransport?.fixedPrice !== undefined ? [{ name: "Veicolo", fix: rawTransport.fixedPrice, perKm: rawTransport.pricePerKm || 0 }] : []);
      
      const updateVehicle = (index: number, field: keyof TransportVehicle, value: string | number) => {
        const newVehicles = [...vehicles];
        const isStringField = field === 'name' || field === 'description';
        newVehicles[index] = { ...newVehicles[index], [field]: typeof value === 'string' && !isStringField ? parseFloat(value) || 0 : value };
        updatePricingData({ vehicles: newVehicles });
      };

      const addVehicle = () => {
        updatePricingData({ vehicles: [...vehicles, { name: "Nuovo veicolo", fix: 0, perKm: 0, description: "" }] });
      };

      const removeVehicle = (index: number) => {
        updatePricingData({ vehicles: vehicles.filter((_, i) => i !== index) });
      };

      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Lista veicoli disponibili</p>
            <Button type="button" variant="outline" size="sm" onClick={addVehicle} data-testid="button-add-vehicle">
              <Plus className="w-4 h-4 mr-1" /> Aggiungi
            </Button>
          </div>
          {vehicles.length === 0 && (
            <p className="text-sm text-muted-foreground italic">Nessun veicolo configurato</p>
          )}
          {vehicles.map((vehicle, index) => (
            <div key={index} className="p-3 border rounded-md bg-muted/30 space-y-2">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`vehicle-name-${index}`}>Nome</Label>
                  <Input
                    id={`vehicle-name-${index}`}
                    value={vehicle.name}
                    onChange={(e) => updateVehicle(index, 'name', e.target.value)}
                    data-testid={`input-vehicle-name-${index}`}
                  />
                </div>
                <div className="w-24 space-y-1">
                  <Label htmlFor={`vehicle-fix-${index}`}>Fisso (€)</Label>
                  <Input
                    id={`vehicle-fix-${index}`}
                    type="number"
                    step="0.01"
                    value={vehicle.fix || ""}
                    onChange={(e) => updateVehicle(index, 'fix', e.target.value)}
                    data-testid={`input-vehicle-fix-${index}`}
                  />
                </div>
                <div className="w-24 space-y-1">
                  <Label htmlFor={`vehicle-perkm-${index}`}>€/Km</Label>
                  <Input
                    id={`vehicle-perkm-${index}`}
                    type="number"
                    step="0.01"
                    value={vehicle.perKm || ""}
                    onChange={(e) => updateVehicle(index, 'perKm', e.target.value)}
                    data-testid={`input-vehicle-perkm-${index}`}
                  />
                </div>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => removeVehicle(index)}
                  className="text-destructive hover:text-destructive"
                  data-testid={`button-remove-vehicle-${index}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`vehicle-desc-${index}`}>Descrizione</Label>
                <Input
                  id={`vehicle-desc-${index}`}
                  value={vehicle.description || ""}
                  onChange={(e) => updateVehicle(index, 'description', e.target.value)}
                  placeholder="Es. Furgone leggero per cantieri urbani"
                  data-testid={`input-vehicle-desc-${index}`}
                />
              </div>
              <div className="mt-2 pt-2 border-t border-dashed border-muted/60">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Trasporti Lagunari
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Banchina (€/camion)</label>
                    <Input
                      type="number" placeholder="es. 70" min={0}
                      value={vehicle.banchinaCost ?? ""}
                      onChange={e => updateVehicle(index, "banchinaCost", parseFloat(e.target.value) || 0)}
                      data-testid={`input-banchina-cost-${index}`}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Ferry Lido (€/camion)</label>
                    <Input
                      type="number" placeholder="es. 688" min={0}
                      value={vehicle.ferryLidoCost ?? ""}
                      onChange={e => updateVehicle(index, "ferryLidoCost", parseFloat(e.target.value) || 0)}
                      data-testid={`input-ferry-lido-cost-${index}`}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Ferry Pellestrina (€/camion)</label>
                    <Input
                      type="number" placeholder="es. 808" min={0}
                      value={vehicle.ferryPellesCost ?? ""}
                      onChange={e => updateVehicle(index, "ferryPellesCost", parseFloat(e.target.value) || 0)}
                      data-testid={`input-ferry-pellestrina-cost-${index}`}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    case "DOCUMENT": {
      const rawDoc = data as DocumentPricingData & { price?: number };
      const options: DocumentOption[] = rawDoc?.options || 
        (rawDoc?.price !== undefined ? [{ name: "Standard", price: rawDoc.price }] : []);
      
      const updateOption = (index: number, field: keyof DocumentOption, value: string | number) => {
        const newOptions = [...options];
        newOptions[index] = { ...newOptions[index], [field]: field === 'price' ? (parseFloat(value as string) || 0) : value };
        updatePricingData({ options: newOptions });
      };

      const addOption = () => {
        updatePricingData({ options: [...options, { name: "Nuova opzione", price: 0 }] });
      };

      const removeOption = (index: number) => {
        updatePricingData({ options: options.filter((_, i) => i !== index) });
      };

      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Lista opzioni documento</p>
            <Button type="button" variant="outline" size="sm" onClick={addOption} data-testid="button-add-doc-option">
              <Plus className="w-4 h-4 mr-1" /> Aggiungi
            </Button>
          </div>
          {options.length === 0 && (
            <p className="text-sm text-muted-foreground italic">Nessuna opzione configurata</p>
          )}
          {options.map((option, index) => (
            <div key={index} className="flex items-end gap-2 p-3 border rounded-md bg-muted/30">
              <div className="flex-1 space-y-1">
                <Label htmlFor={`option-name-${index}`}>Descrizione</Label>
                <Input
                  id={`option-name-${index}`}
                  value={option.name}
                  onChange={(e) => updateOption(index, 'name', e.target.value)}
                  data-testid={`input-doc-option-name-${index}`}
                />
              </div>
              <div className="w-28 space-y-1">
                <Label htmlFor={`option-price-${index}`}>Prezzo (€)</Label>
                <Input
                  id={`option-price-${index}`}
                  type="number"
                  step="0.01"
                  value={option.price || ""}
                  onChange={(e) => updateOption(index, 'price', e.target.value)}
                  data-testid={`input-doc-option-price-${index}`}
                />
              </div>
              <Button 
                type="button" 
                variant="ghost" 
                size="icon" 
                onClick={() => removeOption(index)}
                className="text-destructive hover:text-destructive"
                data-testid={`button-remove-doc-option-${index}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      );
    }

    case "SALE": {
      const sale = (data as SalePricingData) || { price: 0 };
      return (
        <div className="max-w-xs space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sale-price">Prezzo vendita (€/unità)</Label>
            <Input
              id="sale-price"
              type="number"
              step="0.01"
              value={sale.price || ""}
              onChange={(e) => updatePricingData({ ...sale, price: parseFloat(e.target.value) || 0 })}
              data-testid="input-sale-price"
            />
            <p className="text-xs text-muted-foreground">Materiale a perdere - prezzo fisso (non a noleggio)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sale-unit-coverage">Copertura per unità (mq/unità)</Label>
            <Input
              id="sale-unit-coverage"
              type="number"
              step="1"
              min="0"
              placeholder="Es. 200 (mq per rotolo)"
              value={sale.unitCoverage || ""}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                updatePricingData({ ...sale, unitCoverage: val > 0 ? val : undefined } as any);
              }}
              data-testid="input-sale-unit-coverage"
            />
            <p className="text-xs text-muted-foreground">Se valorizzato, la quantità venduta sarà arrotondata per eccesso a unità intere (es. 200 mq → 1 rotolo, 201 mq → 2 rotoli)</p>
          </div>
        </div>
      );
    }

    case "EXTRA":
    case "SERVICE": {
      const simple = (data as SimplePricingData) || { price: 0 };
      return (
        <div className="max-w-xs space-y-2">
          <Label htmlFor="simple-price">Prezzo (€)</Label>
          <Input
            id="simple-price"
            type="number"
            step="0.01"
            value={simple.price || ""}
            onChange={(e) => updatePricingData({ price: parseFloat(e.target.value) || 0 })}
            data-testid="input-simple-price"
          />
        </div>
      );
    }

    default:
      return null;
  }
}

interface InstallationDataEditorProps {
  article: Article;
  onChange: (article: Article) => void;
}

function InstallationDataEditor({ article, onChange }: InstallationDataEditorProps) {
  const options: InstallationOption[] = article.installationData || [];

  function updateInstallationData(newOptions: InstallationOption[]) {
    onChange({
      ...article,
      installationData: newOptions.length > 0 ? newOptions : null,
    });
  }

  function addOption() {
    updateInstallationData([...options, { label: "", mount: 0, dismount: 0, isDefault: false }]);
  }

  function removeOption(index: number) {
    updateInstallationData(options.filter((_, i) => i !== index));
  }

  function updateOption(index: number, field: keyof InstallationOption, value: string | number | boolean) {
    const newOptions = [...options];
    if (field === "label") {
      newOptions[index] = { ...newOptions[index], label: value as string };
    } else if (field === "mount") {
      newOptions[index] = { ...newOptions[index], mount: parseFloat(value as string) || 0 };
    } else if (field === "dismount") {
      newOptions[index] = { ...newOptions[index], dismount: parseFloat(value as string) || 0 };
    } else if (field === "isDefault") {
      newOptions.forEach((opt, i) => {
        opt.isDefault = i === index ? (value as boolean) : false;
      });
    }
    updateInstallationData(newOptions);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Opzioni di installazione per montaggio/smontaggio (€/{unitTypeLabels[article.unitType] || article.unitType.toLowerCase()})
        </p>
        <Button 
          type="button" 
          variant="outline" 
          size="sm" 
          onClick={addOption}
          data-testid="button-add-installation-option"
        >
          <Plus className="w-4 h-4 mr-1" /> Aggiungi
        </Button>
      </div>
      
      {options.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          Nessuna opzione di installazione configurata. Aggiungi opzioni come "Da terra", "Sopra tetti", ecc.
        </p>
      )}
      
      {options.map((option, index) => (
        <div key={index} className="flex items-end gap-2 p-3 border rounded-md bg-muted/30">
          <div className="flex-1 space-y-1">
            <Label htmlFor={`installation-label-${index}`}>Etichetta</Label>
            <Input
              id={`installation-label-${index}`}
              placeholder="Es. Da terra, Sopra tetti..."
              value={option.label}
              onChange={(e) => updateOption(index, "label", e.target.value)}
              data-testid={`input-installation-label-${index}`}
            />
          </div>
          <div className="w-24 space-y-1">
            <Label htmlFor={`installation-mount-${index}`}>Montaggio</Label>
            <Input
              id={`installation-mount-${index}`}
              type="number"
              step="0.01"
              value={option.mount || ""}
              onChange={(e) => updateOption(index, "mount", e.target.value)}
              data-testid={`input-installation-mount-${index}`}
            />
          </div>
          <div className="w-24 space-y-1">
            <Label htmlFor={`installation-dismount-${index}`}>Smontaggio</Label>
            <Input
              id={`installation-dismount-${index}`}
              type="number"
              step="0.01"
              value={option.dismount || ""}
              onChange={(e) => updateOption(index, "dismount", e.target.value)}
              data-testid={`input-installation-dismount-${index}`}
            />
          </div>
          <div className="flex items-center gap-2 pb-0.5">
            <Switch
              id={`installation-default-${index}`}
              checked={option.isDefault || false}
              onCheckedChange={(checked) => updateOption(index, "isDefault", checked)}
              data-testid={`switch-installation-default-${index}`}
            />
            <Label htmlFor={`installation-default-${index}`} className="text-xs whitespace-nowrap">
              Default
            </Label>
          </div>
          <Button 
            type="button" 
            variant="ghost" 
            size="icon" 
            onClick={() => removeOption(index)}
            className="text-destructive hover:text-destructive"
            data-testid={`button-remove-installation-option-${index}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

// ============ VARIANTS DATA EDITOR ============
interface VariantsDataEditorProps {
  article: Article;
  onChange: (article: Article) => void;
}

function VariantsDataEditor({ article, onChange }: VariantsDataEditorProps) {
  const variants: ArticleVariant[] = article.variantsData || [];

  function updateVariantsData(newVariants: ArticleVariant[]) {
    onChange({
      ...article,
      variantsData: newVariants.length > 0 ? newVariants : null,
    });
  }

  function addVariant() {
    updateVariantsData([
      ...variants,
      {
        label: "",
        description: "",
        rental: { months_1_2: 0, months_3_5: 0, months_6_8: 0, months_9_plus: 0 },
        installation: { mount: 0, dismount: 0 },
        isDefault: variants.length === 0,
      },
    ]);
  }

  function removeVariant(index: number) {
    const newVariants = variants.filter((_, i) => i !== index);
    if (newVariants.length > 0 && !newVariants.some(v => v.isDefault)) {
      newVariants[0].isDefault = true;
    }
    updateVariantsData(newVariants);
  }

  function updateVariant(index: number, updates: Partial<ArticleVariant>) {
    const newVariants = [...variants];
    newVariants[index] = { ...newVariants[index], ...updates };
    
    if (updates.isDefault === true) {
      newVariants.forEach((v, i) => {
        if (i !== index) v.isDefault = false;
      });
    }
    
    updateVariantsData(newVariants);
  }

  function updateVariantRental(index: number, field: string, value: number) {
    const newVariants = [...variants];
    const current = newVariants[index].rental || { months_1_2: 0, months_3_5: 0, months_6_8: 0, months_9_plus: 0 };
    newVariants[index] = {
      ...newVariants[index],
      rental: { ...current, [field]: value },
    };
    updateVariantsData(newVariants);
  }

  function updateVariantInstallation(index: number, field: "mount" | "dismount", value: number) {
    const newVariants = [...variants];
    const current = newVariants[index].installation || { mount: 0, dismount: 0 };
    newVariants[index] = {
      ...newVariants[index],
      installation: { ...current, [field]: value },
    };
    updateVariantsData(newVariants);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Varianti/Modelli con prezzi e descrizioni specifici
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addVariant}
          data-testid="button-add-variant"
        >
          <Plus className="w-4 h-4 mr-1" /> Aggiungi Variante
        </Button>
      </div>

      {variants.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          Nessuna variante configurata. Aggiungi varianti per articoli con diversi modelli.
        </p>
      )}

      {variants.map((variant, index) => (
        <div key={index} className="p-4 border rounded-lg bg-muted/30 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor={`variant-label-${index}`}>Nome Variante</Label>
                  <Input
                    id={`variant-label-${index}`}
                    placeholder="Es. 200kg - 24m"
                    value={variant.label}
                    onChange={(e) => updateVariant(index, { label: e.target.value })}
                    data-testid={`input-variant-label-${index}`}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={variant.isDefault || false}
                      onCheckedChange={(checked) => updateVariant(index, { isDefault: checked })}
                      data-testid={`switch-variant-default-${index}`}
                    />
                    <Label className="text-sm">Default</Label>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor={`variant-description-${index}`}>Descrizione</Label>
                <Textarea
                  id={`variant-description-${index}`}
                  placeholder="Es. Portata 200kg, altezza max 24m, piattaforma 1x1m"
                  value={variant.description}
                  onChange={(e) => updateVariant(index, { description: e.target.value })}
                  rows={2}
                  data-testid={`input-variant-description-${index}`}
                />
              </div>

              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">Prezzi Noleggio (€/{unitTypeLabels[article.unitType] || "unità"}/mese)</p>
                <div className="grid grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">1-2 Mesi</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={variant.rental?.months_1_2 || ""}
                      onChange={(e) => updateVariantRental(index, "months_1_2", parseFloat(e.target.value) || 0)}
                      data-testid={`input-variant-rental-1-2-${index}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">3-5 Mesi</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={variant.rental?.months_3_5 || ""}
                      onChange={(e) => updateVariantRental(index, "months_3_5", parseFloat(e.target.value) || 0)}
                      data-testid={`input-variant-rental-3-5-${index}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">6-8 Mesi</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={variant.rental?.months_6_8 || ""}
                      onChange={(e) => updateVariantRental(index, "months_6_8", parseFloat(e.target.value) || 0)}
                      data-testid={`input-variant-rental-6-8-${index}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">9+ Mesi</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={variant.rental?.months_9_plus || ""}
                      onChange={(e) => updateVariantRental(index, "months_9_plus", parseFloat(e.target.value) || 0)}
                      data-testid={`input-variant-rental-9-plus-${index}`}
                    />
                  </div>
                </div>

              </div>

              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">Costi Manodopera (€/{unitTypeLabels[article.unitType] || "unità"})</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Montaggio</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={variant.installation?.mount || ""}
                      onChange={(e) => updateVariantInstallation(index, "mount", parseFloat(e.target.value) || 0)}
                      data-testid={`input-variant-mount-${index}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Smontaggio</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={variant.installation?.dismount || ""}
                      onChange={(e) => updateVariantInstallation(index, "dismount", parseFloat(e.target.value) || 0)}
                      data-testid={`input-variant-dismount-${index}`}
                    />
                  </div>
                </div>

                {/* Opzione Cesta - Solo per Parapetti */}
                {article.name?.toLowerCase().includes('parapett') && (
                  <div className="mt-3 p-3 bg-orange-50/50 dark:bg-orange-950/20 rounded-lg">
                    <div className="flex items-center flex-wrap gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={variant.supportsCesta || false}
                          onCheckedChange={(checked) => updateVariant(index, { 
                            supportsCesta: checked,
                            cestaMountPrice: checked ? (variant.cestaMountPrice || variant.cestaPrice || 5) : undefined,
                            cestaDismountPrice: checked ? (variant.cestaDismountPrice || variant.cestaPrice || 5) : undefined,
                          })}
                          data-testid={`switch-variant-cesta-${index}`}
                        />
                        <Label className="text-sm font-medium">Supporta Cesta</Label>
                        <span className="text-xs text-muted-foreground">(costo aggiuntivo su montaggio/smontaggio)</span>
                      </div>
                      {variant.supportsCesta && (
                        <div className="flex items-center flex-wrap gap-4">
                          <div className="flex items-center gap-2">
                            <Label className="text-xs whitespace-nowrap">Montaggio (€/{unitTypeLabels[article.unitType] || "unità"})</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={variant.cestaMountPrice ?? variant.cestaPrice ?? 5}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                updateVariant(index, { cestaMountPrice: isNaN(val) ? 0 : val });
                              }}
                              className="w-20"
                              data-testid={`input-variant-cesta-mount-price-${index}`}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs whitespace-nowrap">Smontaggio (€/{unitTypeLabels[article.unitType] || "unità"})</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={variant.cestaDismountPrice ?? variant.cestaPrice ?? 5}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                updateVariant(index, { cestaDismountPrice: isNaN(val) ? 0 : val });
                              }}
                              className="w-20"
                              data-testid={`input-variant-cesta-dismount-price-${index}`}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Sezione Servizio Aggiuntivo per Variante */}
                <div className="border-t pt-3 mt-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Switch
                      checked={variant.isAdditionalService || false}
                      onCheckedChange={(checked) => updateVariant(index, { 
                        isAdditionalService: checked,
                        serviceDescriptionMounting: checked ? (variant.serviceDescriptionMounting || '') : undefined,
                        serviceDescriptionRental: checked ? (variant.serviceDescriptionRental || '') : undefined,
                      })}
                      data-testid={`switch-variant-additional-service-${index}`}
                    />
                    <Label className="text-sm font-medium">Servizio Aggiuntivo nel Preventivo</Label>
                  </div>
                  {variant.isAdditionalService && (
                    <div className="space-y-2 pl-2 border-l-2 border-teal-300 dark:border-teal-700">
                      <div className="space-y-1">
                        <Label className="text-xs">Testo M/S per Altri Servizi</Label>
                        <Input
                          value={variant.serviceDescriptionMounting || ""}
                          onChange={(e) => updateVariant(index, { serviceDescriptionMounting: e.target.value || undefined })}
                          placeholder="Es. Montaggio e Smontaggio mensole a sbalzo 105/73"
                          data-testid={`input-variant-service-mounting-${index}`}
                        />
                        <div className="flex items-center gap-2 mt-1">
                          <Switch
                            checked={variant.serviceMountingApplyTrasferta || false}
                            onCheckedChange={(checked) => updateVariant(index, { serviceMountingApplyTrasferta: checked })}
                            data-testid={`switch-variant-trasferta-${index}`}
                          />
                          <Label className="text-xs text-muted-foreground">Applica trasferta</Label>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Testo Noleggio per Altri Servizi</Label>
                        <Input
                          value={variant.serviceDescriptionRental || ""}
                          onChange={(e) => updateVariant(index, { serviceDescriptionRental: e.target.value || undefined })}
                          placeholder="Es. Noleggio mensole a sbalzo"
                          data-testid={`input-variant-service-rental-${index}`}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeVariant(index)}
              className="text-destructive hover:text-destructive"
              data-testid={`button-remove-variant-${index}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============ TRASFERTA DATA EDITOR ============
interface TrasfertaDataEditorProps {
  article: Article;
  onChange: (article: Article) => void;
}

function TrasfertaDataEditor({ article, onChange }: TrasfertaDataEditorProps) {
  const trasfertaData: TrasfertaData = article.trasfertaData || {
    costo1Label: "Costo 1",
    costo1Value: 0,
    costo1Unit: "€/Km",
    costo2Label: "Costo 2",
    costo2Value: 0,
    costo2Unit: "€/Km",
  };

  function updateTrasfertaData(updates: Partial<TrasfertaData>) {
    onChange({
      ...article,
      trasfertaData: { ...trasfertaData, ...updates },
    });
  }

  return (
    <div className="space-y-6">
      {/* Costo 1 */}
      <div className="p-4 border rounded-lg bg-muted/30">
        <h5 className="font-medium mb-3">Primo Costo</h5>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Etichetta</Label>
            <Input
              value={trasfertaData.costo1Label}
              onChange={(e) => updateTrasfertaData({ costo1Label: e.target.value })}
              placeholder="Es. Costo auto"
              data-testid="input-trasferta-costo1-label"
            />
          </div>
          <div className="space-y-2">
            <Label>Valore (€)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={trasfertaData.costo1Value || ""}
              onChange={(e) => updateTrasfertaData({ costo1Value: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
              data-testid="input-trasferta-costo1-value"
            />
          </div>
          <div className="space-y-2">
            <Label>Unità</Label>
            <Select
              value={trasfertaData.costo1Unit}
              onValueChange={(v) => updateTrasfertaData({ costo1Unit: v })}
            >
              <SelectTrigger data-testid="select-trasferta-costo1-unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="€/Km">€/Km</SelectItem>
                <SelectItem value="€/Persona">€/Persona</SelectItem>
                <SelectItem value="€/Squadra">€/Squadra</SelectItem>
                <SelectItem value="€/Giorno">€/Giorno</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Costo 2 */}
      <div className="p-4 border rounded-lg bg-muted/30">
        <h5 className="font-medium mb-3">Secondo Costo</h5>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Etichetta</Label>
            <Input
              value={trasfertaData.costo2Label}
              onChange={(e) => updateTrasfertaData({ costo2Label: e.target.value })}
              placeholder="Es. Costo a persona"
              data-testid="input-trasferta-costo2-label"
            />
          </div>
          <div className="space-y-2">
            <Label>Valore (€)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={trasfertaData.costo2Value || ""}
              onChange={(e) => updateTrasfertaData({ costo2Value: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
              data-testid="input-trasferta-costo2-value"
            />
          </div>
          <div className="space-y-2">
            <Label>Unità</Label>
            <Select
              value={trasfertaData.costo2Unit}
              onValueChange={(v) => updateTrasfertaData({ costo2Unit: v })}
            >
              <SelectTrigger data-testid="select-trasferta-costo2-unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="€/Km">€/Km</SelectItem>
                <SelectItem value="€/Persona">€/Persona</SelectItem>
                <SelectItem value="€/Squadra">€/Squadra</SelectItem>
                <SelectItem value="€/Giorno">€/Giorno</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ BARCA VARIANTS EDITOR ============
const VENICE_BARCA_ZONES = [
  "Santa Croce",
  "Dorsoduro",
  "San Polo",
  "Cannaregio",
  "San Marco",
  "Castello",
  "Giudecca",
  "Murano",
  "Burano",
  "Torcello",
];

interface BarcaVariant {
  label: string;
  description: string;
  price: number;
  zonePrices?: Record<string, number>;
  isDefault?: boolean;
}

interface BarcaVariantsEditorProps {
  article: Article;
  onChange: (article: Article) => void;
}

function BarcaVariantsEditor({ article, onChange }: BarcaVariantsEditorProps) {
  const variants: BarcaVariant[] = Array.isArray(article.variantsData)
    ? (article.variantsData as BarcaVariant[])
    : [];

  const updateVariant = (index: number, updates: Partial<BarcaVariant>) => {
    const newVariants = variants.map((v, i) => i === index ? { ...v, ...updates } : v);
    onChange({ ...article, variantsData: newVariants });
  };

  const updateZonePrice = (variantIndex: number, zone: string, price: number) => {
    const variant = variants[variantIndex];
    const zonePrices = { ...(variant.zonePrices || {}), [zone]: price };
    updateVariant(variantIndex, { zonePrices });
  };

  const addVariant = () => {
    const newVariants = [...variants, { label: "", description: "", price: 0, zonePrices: {} }];
    onChange({ ...article, variantsData: newVariants });
  };

  const removeVariant = (index: number) => {
    const newVariants = variants.filter((_, i) => i !== index);
    onChange({ ...article, variantsData: newVariants });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">Varianti Barca Lagunare</h4>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addVariant}
          data-testid="button-add-barca-variant"
        >
          <Plus className="w-4 h-4 mr-1" />
          Aggiungi Variante
        </Button>
      </div>
      {variants.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">Nessuna variante configurata.</p>
      )}
      {variants.map((variant, index) => (
        <div key={index} className="border rounded-lg p-4 bg-emerald-50/30 dark:bg-emerald-950/10 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Variante {index + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeVariant(index)}
              className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
              data-testid={`button-remove-barca-variant-${index}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input
                value={variant.label || ""}
                onChange={(e) => updateVariant(index, { label: e.target.value })}
                placeholder="Es. Barca piccola"
                data-testid={`input-barca-label-${index}`}
              />
            </div>
            <div>
              <Label className="text-xs">Descrizione</Label>
              <Input
                value={variant.description || ""}
                onChange={(e) => updateVariant(index, { description: e.target.value })}
                placeholder="Es. Fino a 6 ton"
                data-testid={`input-barca-description-${index}`}
              />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prezzo per zona (€/viaggio)</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              {VENICE_BARCA_ZONES.map((zone) => (
                <div key={zone} className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground w-32 shrink-0">{zone}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="h-7 text-xs w-24"
                    value={variant.zonePrices?.[zone] || ""}
                    onChange={(e) => updateZonePrice(index, zone, parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    data-testid={`input-barca-zone-price-${index}-${zone.replace(/\s/g, '-').toLowerCase()}`}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-emerald-200">
            <Label className="text-xs text-muted-foreground w-32 shrink-0">Prezzo base (fallback)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              className="h-7 text-xs w-24"
              value={variant.price || ""}
              onChange={(e) => updateVariant(index, { price: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
              data-testid={`input-barca-price-${index}`}
            />
            <span className="text-xs text-muted-foreground">usato se la zona non ha un prezzo specifico</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============ VENICE ZONE EDITOR ============
const VENICE_ZONES_FIXED = [
  "Santa Croce",
  "Dorsoduro",
  "San Polo",
  "Cannaregio",
  "San Marco",
  "Castello",
  "Giudecca",
  "Murano",
  "Lido",
  "Burano",
  "Torcello",
  "Pellestrina",
] as const;

interface VeniceZoneEditorProps {
  article: Article;
  onChange: (article: Article) => void;
}

function VeniceZoneEditor({ article, onChange }: VeniceZoneEditorProps) {
  const existingZones: any[] = Array.isArray(article.variantsData) ? article.variantsData : [];

  const zonesMap = new Map<string, any>();
  for (const z of existingZones) {
    if (z.label) zonesMap.set(z.label, z);
  }

  const updateZoneCost = (label: string, dailyCost: number) => {
    const newZones = VENICE_ZONES_FIXED.map((zoneName) => {
      const existing = zonesMap.get(zoneName);
      if (zoneName === label) {
        return { label: zoneName, dailyCost, description: existing?.description || "" };
      }
      return { label: zoneName, dailyCost: existing?.dailyCost || 0, description: existing?.description || "" };
    });
    onChange({ ...article, variantsData: newZones });
  };

  return (
    <div className="space-y-4">
      <h4 className="font-medium">Zone Trasporto Lagunare</h4>
      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] gap-0 bg-muted/50 px-3 py-2 border-b">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Zona</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground w-32 text-right">Costo Giornaliero (€)</span>
        </div>
        {VENICE_ZONES_FIXED.map((zoneName) => {
          const existing = zonesMap.get(zoneName);
          const cost = existing?.dailyCost ?? 0;
          return (
            <div key={zoneName} className="grid grid-cols-[1fr_auto] gap-3 items-center px-3 py-2 border-b last:border-b-0 hover:bg-blue-50/30 dark:hover:bg-blue-950/10">
              <span className="text-sm font-medium" data-testid={`text-zone-label-${zoneName.replace(/\s/g, '-').toLowerCase()}`}>{zoneName}</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                className="h-8 text-sm w-32 text-right"
                value={cost || ""}
                onChange={(e) => updateZoneCost(zoneName, parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                data-testid={`input-zone-cost-${zoneName.replace(/\s/g, '-').toLowerCase()}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============ HOIST PRICING DATA EDITOR ============
interface HoistPricingDataEditorProps {
  article: Article;
  onChange: (article: Article) => void;
}

function HoistPricingDataEditor({ article, onChange }: HoistPricingDataEditorProps) {
  const defaultTier: HoistPricingTier = { months_1_2: 0, months_3_5: 0, months_6_8: 0, months_9_plus: 0 };
  
  const hoistPricing: HoistPricingData = (article.pricingData as HoistPricingData) || {
    basamento: { ...defaultTier },
    elevazione: { ...defaultTier },
    sbarco: { ...defaultTier },
    sbalzo: { ...defaultTier },
  };

  const hoistInstallation: HoistInstallationData = article.hoistInstallationData || {
    basamentoMount: 0,
    basamentoDismount: 0,
    elevazioneMountPerMeter: 0,
    elevazioneDismountPerMeter: 0,
    sbarcoMount: 0,
    sbarcoDismount: 0,
    sbalzoMount: 0,
    sbalzoDismount: 0,
  };

  function updatePricingTier(field: keyof HoistPricingData, tier: keyof HoistPricingTier, value: number) {
    const currentTier = hoistPricing[field] || { ...defaultTier };
    onChange({
      ...article,
      pricingData: {
        ...hoistPricing,
        [field]: { ...currentTier, [tier]: value },
      },
    });
  }

  function updateInstallation(field: keyof HoistInstallationData, value: number) {
    onChange({
      ...article,
      hoistInstallationData: {
        ...hoistInstallation,
        [field]: value,
      },
    });
  }

  // Helper per determinare se questo montacarichi ha sbarco (PM-M10) o sbalzo (P26)
  const hasSbarco = article.name?.toUpperCase().includes("PM-M10") || article.name?.toUpperCase().includes("PM M10");
  const hasSbalzo = article.name?.toUpperCase().includes("P26");

  const renderTierInputs = (
    field: keyof HoistPricingData, 
    label: string, 
    unitLabel: string,
    show: boolean = true
  ) => {
    if (!show) return null;
    const tier = hoistPricing[field] || defaultTier;
    return (
      <div className="p-4 border rounded-lg bg-muted/30">
        <h5 className="font-medium mb-3">{label} ({unitLabel}/mese)</h5>
        <div className="grid grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">1-2 Mesi</Label>
            <Input
              type="number"
              step="0.01"
              value={tier.months_1_2 || ""}
              onChange={(e) => updatePricingTier(field, "months_1_2", parseFloat(e.target.value) || 0)}
              data-testid={`input-hoist-${field}-1-2`}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">3-5 Mesi</Label>
            <Input
              type="number"
              step="0.01"
              value={tier.months_3_5 || ""}
              onChange={(e) => updatePricingTier(field, "months_3_5", parseFloat(e.target.value) || 0)}
              data-testid={`input-hoist-${field}-3-5`}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">6-8 Mesi</Label>
            <Input
              type="number"
              step="0.01"
              value={tier.months_6_8 || ""}
              onChange={(e) => updatePricingTier(field, "months_6_8", parseFloat(e.target.value) || 0)}
              data-testid={`input-hoist-${field}-6-8`}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">9+ Mesi</Label>
            <Input
              type="number"
              step="0.01"
              value={tier.months_9_plus || ""}
              onChange={(e) => updatePricingTier(field, "months_9_plus", parseFloat(e.target.value) || 0)}
              data-testid={`input-hoist-${field}-9-plus`}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Sezione Noleggio */}
      <div>
        <h4 className="font-medium mb-4 text-lg">Prezzi Noleggio Ponteggi Elettrici</h4>
        <div className="space-y-4">
          {renderTierInputs("basamento", "Basamento", "€/cad")}
          {renderTierInputs("elevazione", "Elevazione (per metro)", "€/mt")}
          {renderTierInputs("sbarco", "Cancello Sbarco", "€/cad", hasSbarco || !hasSbalzo)}
          {renderTierInputs("sbalzo", "Sbalzo verso parete", "€/mq", hasSbalzo || !hasSbarco)}
        </div>
      </div>

      {/* Sezione Manodopera */}
      <div className="border-t pt-6">
        <h4 className="font-medium mb-4 text-lg">Costi Manodopera</h4>
        
        <div className="space-y-4">
          {/* Basamento */}
          <div className="p-4 border rounded-lg bg-muted/30">
            <h5 className="font-medium mb-3">Basamento (€/cad)</h5>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Montaggio</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={hoistInstallation.basamentoMount || ""}
                  onChange={(e) => updateInstallation("basamentoMount", parseFloat(e.target.value) || 0)}
                  data-testid="input-hoist-inst-basamento-mount"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Smontaggio</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={hoistInstallation.basamentoDismount || ""}
                  onChange={(e) => updateInstallation("basamentoDismount", parseFloat(e.target.value) || 0)}
                  data-testid="input-hoist-inst-basamento-dismount"
                />
              </div>
            </div>
          </div>

          {/* Elevazione */}
          <div className="p-4 border rounded-lg bg-muted/30">
            <h5 className="font-medium mb-3">Elevazione per metro (€/mt)</h5>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Montaggio</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={hoistInstallation.elevazioneMountPerMeter || ""}
                  onChange={(e) => updateInstallation("elevazioneMountPerMeter", parseFloat(e.target.value) || 0)}
                  data-testid="input-hoist-inst-elevazione-mount"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Smontaggio</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={hoistInstallation.elevazioneDismountPerMeter || ""}
                  onChange={(e) => updateInstallation("elevazioneDismountPerMeter", parseFloat(e.target.value) || 0)}
                  data-testid="input-hoist-inst-elevazione-dismount"
                />
              </div>
            </div>
          </div>

          {/* Sbarco - solo per PM-M10 */}
          {(hasSbarco || !hasSbalzo) && (
            <div className="p-4 border rounded-lg bg-muted/30">
              <h5 className="font-medium mb-3">Cancello Sbarco (€/cad)</h5>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Montaggio</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={hoistInstallation.sbarcoMount || ""}
                    onChange={(e) => updateInstallation("sbarcoMount", parseFloat(e.target.value) || 0)}
                    data-testid="input-hoist-inst-sbarco-mount"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Smontaggio</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={hoistInstallation.sbarcoDismount || ""}
                    onChange={(e) => updateInstallation("sbarcoDismount", parseFloat(e.target.value) || 0)}
                    data-testid="input-hoist-inst-sbarco-dismount"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Sbalzo - solo per P26 */}
          {(hasSbalzo || !hasSbarco) && (
            <div className="p-4 border rounded-lg bg-muted/30">
              <h5 className="font-medium mb-3">Sbalzo verso parete (€/mq)</h5>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Montaggio</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={hoistInstallation.sbalzoMount || ""}
                    onChange={(e) => updateInstallation("sbalzoMount", parseFloat(e.target.value) || 0)}
                    data-testid="input-hoist-inst-sbalzo-mount"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Smontaggio</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={hoistInstallation.sbalzoDismount || ""}
                    onChange={(e) => updateInstallation("sbalzoDismount", parseFloat(e.target.value) || 0)}
                    data-testid="input-hoist-inst-sbalzo-dismount"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ HOIST VARIANTS EDITOR ============
interface HoistVariantsEditorProps {
  article: Article;
  onChange: (article: Article) => void;
}

function HoistVariantsEditor({ article, onChange }: HoistVariantsEditorProps) {
  const variants: ArticleVariant[] = article.variantsData || [];

  const defaultHoistTier: HoistPricingTier = { months_1_2: 0, months_3_5: 0, months_6_8: 0, months_9_plus: 0 };
  const defaultHoistRental: HoistPricingData = {
    basamento: { ...defaultHoistTier },
    elevazione: { ...defaultHoistTier },
    sbarco: { ...defaultHoistTier },
    sbalzo: { ...defaultHoistTier },
  };
  const defaultHoistInstallation: HoistInstallationData = {
    basamentoMount: 0, basamentoDismount: 0,
    elevazioneMountPerMeter: 0, elevazioneDismountPerMeter: 0,
    sbarcoMount: 0, sbarcoDismount: 0,
    sbalzoMount: 0, sbalzoDismount: 0,
  };

  function updateVariantsData(newVariants: ArticleVariant[]) {
    onChange({
      ...article,
      variantsData: newVariants.length > 0 ? newVariants : null,
    });
  }

  function addVariant(hoistType: "PM-M10" | "P26") {
    const label = hoistType === "PM-M10" 
      ? (variants.some(v => v.label?.includes("PM-M10 Big")) ? "PM-M10 Medium" : "PM-M10 Big")
      : "P26";
    
    updateVariantsData([
      ...variants,
      {
        label,
        description: "",
        hoistType,
        hoistRental: { ...defaultHoistRental },
        hoistInstallation: { ...defaultHoistInstallation },
        isDefault: variants.length === 0,
      },
    ]);
  }

  function removeVariant(index: number) {
    const newVariants = variants.filter((_, i) => i !== index);
    if (newVariants.length > 0 && !newVariants.some(v => v.isDefault)) {
      newVariants[0].isDefault = true;
    }
    updateVariantsData(newVariants);
  }

  function updateVariant(index: number, updates: Partial<ArticleVariant>) {
    const newVariants = [...variants];
    newVariants[index] = { ...newVariants[index], ...updates };
    if (updates.isDefault === true) {
      newVariants.forEach((v, i) => { if (i !== index) v.isDefault = false; });
    }
    updateVariantsData(newVariants);
  }

  function updateHoistRentalTier(index: number, component: keyof HoistPricingData, tier: keyof HoistPricingTier, value: number) {
    const newVariants = [...variants];
    const currentRental = newVariants[index].hoistRental || { ...defaultHoistRental };
    const currentTier = currentRental[component] || { ...defaultHoistTier };
    newVariants[index] = {
      ...newVariants[index],
      hoistRental: {
        ...currentRental,
        [component]: { ...currentTier, [tier]: value },
      },
    };
    updateVariantsData(newVariants);
  }

  function updateHoistInstallation(index: number, field: keyof HoistInstallationData, value: number) {
    const newVariants = [...variants];
    const currentInstall = newVariants[index].hoistInstallation || { ...defaultHoistInstallation };
    newVariants[index] = {
      ...newVariants[index],
      hoistInstallation: { ...currentInstall, [field]: value },
    };
    updateVariantsData(newVariants);
  }

  const renderRentalTier = (index: number, component: keyof HoistPricingData, label: string, unit: string) => {
    const rental = variants[index].hoistRental || defaultHoistRental;
    const tier = rental[component] || defaultHoistTier;
    return (
      <div className="p-3 border rounded-lg bg-background">
        <h6 className="text-sm font-medium mb-2">{label} ({unit}/mese)</h6>
        <div className="grid grid-cols-4 gap-2">
          {(["months_1_2", "months_3_5", "months_6_8", "months_9_plus"] as const).map((t, i) => (
            <div key={t} className="space-y-1">
              <Label className="text-xs">{["1-2", "3-5", "6-8", "9+"][i]} Mesi</Label>
              <Input
                type="number"
                step="0.01"
                value={tier[t] || ""}
                onChange={(e) => updateHoistRentalTier(index, component, t, parseFloat(e.target.value) || 0)}
                data-testid={`input-hoist-var-${index}-${component}-${t}`}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderInstallationField = (index: number, mountField: keyof HoistInstallationData, dismountField: keyof HoistInstallationData, label: string, unit: string) => {
    const install = variants[index].hoistInstallation || defaultHoistInstallation;
    return (
      <div className="p-3 border rounded-lg bg-background">
        <h6 className="text-sm font-medium mb-2">{label} ({unit})</h6>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Montaggio</Label>
            <Input
              type="number"
              step="0.01"
              value={install[mountField] || ""}
              onChange={(e) => updateHoistInstallation(index, mountField, parseFloat(e.target.value) || 0)}
              data-testid={`input-hoist-var-${index}-${mountField}`}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Smontaggio</Label>
            <Input
              type="number"
              step="0.01"
              value={install[dismountField] || ""}
              onChange={(e) => updateHoistInstallation(index, dismountField, parseFloat(e.target.value) || 0)}
              data-testid={`input-hoist-var-${index}-${dismountField}`}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          Configura le varianti del ponteggio elettrico con prezzi specifici per ogni modello
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => addVariant("PM-M10")} data-testid="button-add-pm-m10">
            <Plus className="w-4 h-4 mr-1" /> PM-M10
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => addVariant("P26")} data-testid="button-add-p26">
            <Plus className="w-4 h-4 mr-1" /> P26
          </Button>
        </div>
      </div>

      {variants.length === 0 && (
        <div className="p-4 border rounded-lg bg-muted/30 text-center">
          <p className="text-sm text-muted-foreground">
            Nessuna variante configurata. Aggiungi varianti per i diversi modelli.
          </p>
        </div>
      )}

      {variants.map((variant, index) => (
        <div key={index} className="p-4 border rounded-lg bg-muted/30 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 space-y-4">
              {/* Header con nome */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Nome Variante</Label>
                  <Input
                    value={variant.label}
                    onChange={(e) => updateVariant(index, { label: e.target.value })}
                    placeholder="Es. PM-M10 Big"
                    data-testid={`input-hoist-var-label-${index}`}
                  />
                </div>
                <div className="flex items-end gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={variant.isDefault || false}
                      onCheckedChange={(checked) => updateVariant(index, { isDefault: checked })}
                      data-testid={`switch-hoist-default-${index}`}
                    />
                    <Label className="text-sm">Default</Label>
                  </div>
                </div>
              </div>

              {/* Descrizione */}
              <div className="space-y-1">
                <Label>Descrizione</Label>
                <Textarea
                  value={variant.description}
                  onChange={(e) => updateVariant(index, { description: e.target.value })}
                  placeholder="Es. Portata 200kg, altezza max 24m"
                  rows={2}
                  data-testid={`input-hoist-var-desc-${index}`}
                />
              </div>

              {/* Prezzi Noleggio */}
              <div className="border-t pt-3">
                <h5 className="font-medium mb-3">Prezzi Noleggio</h5>
                <div className="grid grid-cols-2 gap-3">
                  {renderRentalTier(index, "basamento", "Basamento", "€/cad")}
                  {renderRentalTier(index, "elevazione", "Elevazione", "€/mt")}
                  {renderRentalTier(index, "sbarco", "Cancello Sbarco", "€/cad")}
                  {renderRentalTier(index, "sbalzo", "Sbalzo", "€/mq")}
                </div>
              </div>

              {/* Costi Manodopera */}
              <div className="border-t pt-3">
                <h5 className="font-medium mb-3">Costi Manodopera</h5>
                <div className="grid grid-cols-2 gap-3">
                  {renderInstallationField(index, "basamentoMount", "basamentoDismount", "Basamento", "€/cad")}
                  {renderInstallationField(index, "elevazioneMountPerMeter", "elevazioneDismountPerMeter", "Elevazione", "€/mt")}
                  {renderInstallationField(index, "sbarcoMount", "sbarcoDismount", "Cancello Sbarco", "€/cad")}
                  {renderInstallationField(index, "sbalzoMount", "sbalzoDismount", "Sbalzo", "€/mq")}
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeVariant(index)}
              className="text-destructive hover:text-destructive"
              data-testid={`button-remove-hoist-var-${index}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
