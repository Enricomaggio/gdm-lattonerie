import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Package,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatCurrency";
import {
  insertMaterialSchema,
  insertMaterialThicknessSchema,
  insertCatalogArticleSchema,
  insertLaborRateSchema,
  type Material,
  type MaterialThickness,
  type MaterialWithThicknesses,
  type CatalogArticle,
  type LaborRate,
  type InsertMaterial,
  type InsertMaterialThickness,
  type InsertCatalogArticle,
  type InsertLaborRate,
} from "@shared/schema";

function num(value: string | number | null | undefined, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

// ============ MATERIALI + SPESSORI ============

function MaterialForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
}: {
  defaultValues: InsertMaterial;
  onSubmit: (values: InsertMaterial) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const form = useForm<InsertMaterial>({
    resolver: zodResolver(insertMaterialSchema),
    defaultValues,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome materiale</FormLabel>
              <FormControl>
                <Input
                  placeholder="Es. Rame, Alluminio, Zinco"
                  {...field}
                  data-testid="input-materiale-nome"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="density"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Peso specifico (kg/m³)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  inputMode="decimal"
                  placeholder="Es. 8960 per il rame"
                  {...field}
                  value={field.value ?? ""}
                  data-testid="input-materiale-densita"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button
            type="submit"
            disabled={isPending}
            data-testid="button-conferma-materiale"
          >
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function ThicknessForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
}: {
  defaultValues: InsertMaterialThickness;
  onSubmit: (values: InsertMaterialThickness) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const form = useForm<InsertMaterialThickness>({
    resolver: zodResolver(insertMaterialThicknessSchema),
    defaultValues,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="thicknessMm"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Spessore (mm)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  inputMode="decimal"
                  placeholder="Es. 0.6"
                  {...field}
                  value={field.value ?? ""}
                  data-testid="input-spessore-mm"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="costPerKg"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Costo al kg (€)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  inputMode="decimal"
                  placeholder="0.00"
                  {...field}
                  value={field.value ?? ""}
                  data-testid="input-spessore-costo-kg"
                />
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
              <FormLabel>Margine % di default</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder="0"
                  {...field}
                  value={field.value ?? ""}
                  data-testid="input-spessore-margine"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button
            type="submit"
            disabled={isPending}
            data-testid="button-conferma-spessore"
          >
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function MaterialiTab() {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [createMaterialOpen, setCreateMaterialOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [deletingMaterial, setDeletingMaterial] = useState<Material | null>(null);

  const [createThicknessFor, setCreateThicknessFor] = useState<Material | null>(null);
  const [editingThickness, setEditingThickness] = useState<MaterialThickness | null>(null);
  const [deletingThickness, setDeletingThickness] = useState<MaterialThickness | null>(null);

  const { data: materials = [], isLoading } = useQuery<MaterialWithThicknesses[]>({
    queryKey: ["/api/materials"],
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["/api/materials"] });
  }

  const onMutationError = (err: Error) => {
    toast({ title: "Errore", description: err.message, variant: "destructive" });
  };

  const createMaterialMut = useMutation({
    mutationFn: async (data: InsertMaterial) => {
      const res = await apiRequest("POST", "/api/materials", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Materiale creato" });
      setCreateMaterialOpen(false);
      invalidate();
    },
    onError: onMutationError,
  });

  const updateMaterialMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertMaterial }) => {
      const res = await apiRequest("PUT", `/api/materials/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Materiale aggiornato" });
      setEditingMaterial(null);
      invalidate();
    },
    onError: onMutationError,
  });

  const deleteMaterialMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/materials/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Materiale eliminato" });
      setDeletingMaterial(null);
      invalidate();
    },
    onError: (err: Error) => {
      onMutationError(err);
      setDeletingMaterial(null);
    },
  });

  const createThicknessMut = useMutation({
    mutationFn: async (data: InsertMaterialThickness) => {
      const res = await apiRequest("POST", "/api/material-thicknesses", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Spessore aggiunto" });
      setCreateThicknessFor(null);
      invalidate();
    },
    onError: onMutationError,
  });

  const updateThicknessMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertMaterialThickness> }) => {
      const res = await apiRequest("PUT", `/api/material-thicknesses/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Spessore aggiornato" });
      setEditingThickness(null);
      invalidate();
    },
    onError: onMutationError,
  });

  const deleteThicknessMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/material-thicknesses/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Spessore eliminato" });
      setDeletingThickness(null);
      invalidate();
    },
    onError: (err: Error) => {
      onMutationError(err);
      setDeletingThickness(null);
    },
  });

  function toggleExpanded(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Materiali</h2>
          <p className="text-sm text-muted-foreground">
            Materiali di lattoneria con peso specifico (kg/m³). Ogni materiale ha più spessori, ognuno con il proprio costo al kg e margine.
          </p>
        </div>
        <Button
          onClick={() => setCreateMaterialOpen(true)}
          data-testid="button-nuovo-materiale"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuovo Materiale
        </Button>
      </div>

      <div className="border rounded-lg">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : materials.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground"
            data-testid="empty-materiali"
          >
            <Package className="w-10 h-10 mb-2" />
            <p>Nessun materiale inserito.</p>
          </div>
        ) : (
          <div className="divide-y">
            {materials.map((mat) => {
              const isOpen = !!expanded[mat.id];
              return (
                <div key={mat.id} data-testid={`row-materiale-${mat.id}`}>
                  <div className="flex items-center gap-2 p-3 hover-elevate">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => toggleExpanded(mat.id)}
                      data-testid={`button-toggle-materiale-${mat.id}`}
                    >
                      {isOpen ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </Button>
                    <div className="flex-1 min-w-0">
                      <div
                        className="font-medium truncate"
                        data-testid={`text-materiale-nome-${mat.id}`}
                      >
                        {mat.name}
                      </div>
                      <div
                        className="text-xs text-muted-foreground"
                        data-testid={`text-materiale-densita-${mat.id}`}
                      >
                        {formatCurrency(num(mat.density))} kg/m³ ·{" "}
                        {mat.thicknesses.length} spessori
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCreateThicknessFor(mat)}
                      data-testid={`button-aggiungi-spessore-${mat.id}`}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Spessore
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditingMaterial(mat)}
                      data-testid={`button-modifica-materiale-${mat.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeletingMaterial(mat)}
                      data-testid={`button-elimina-materiale-${mat.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {isOpen && (
                    <div className="bg-muted/30 px-4 pb-4">
                      {mat.thicknesses.length === 0 ? (
                        <div
                          className="text-sm text-muted-foreground py-3"
                          data-testid={`empty-spessori-${mat.id}`}
                        >
                          Nessuno spessore inserito per questo materiale.
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Spessore (mm)</TableHead>
                              <TableHead className="text-right">
                                Costo €/kg
                              </TableHead>
                              <TableHead className="text-right">
                                Margine %
                              </TableHead>
                              <TableHead className="w-[110px] text-right">
                                Azioni
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {mat.thicknesses.map((th) => (
                              <TableRow
                                key={th.id}
                                data-testid={`row-spessore-${th.id}`}
                              >
                                <TableCell
                                  className="font-medium"
                                  data-testid={`text-spessore-mm-${th.id}`}
                                >
                                  {num(th.thicknessMm)} mm
                                </TableCell>
                                <TableCell
                                  className="text-right"
                                  data-testid={`text-spessore-costo-${th.id}`}
                                >
                                  € {formatCurrency(num(th.costPerKg))}
                                </TableCell>
                                <TableCell
                                  className="text-right"
                                  data-testid={`text-spessore-margine-${th.id}`}
                                >
                                  {num(th.marginPercent)}%
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => setEditingThickness(th)}
                                      data-testid={`button-modifica-spessore-${th.id}`}
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => setDeletingThickness(th)}
                                      data-testid={`button-elimina-spessore-${th.id}`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Crea materiale */}
      <Dialog open={createMaterialOpen} onOpenChange={setCreateMaterialOpen}>
        <DialogContent data-testid="dialog-nuovo-materiale">
          <DialogHeader>
            <DialogTitle>Nuovo Materiale</DialogTitle>
            <DialogDescription>
              Inserisci nome e peso specifico (kg/m³).
            </DialogDescription>
          </DialogHeader>
          <MaterialForm
            defaultValues={{ name: "", density: "0" }}
            onSubmit={(values) => createMaterialMut.mutate(values)}
            isPending={createMaterialMut.isPending}
            submitLabel="Crea"
          />
        </DialogContent>
      </Dialog>

      {/* Modifica materiale */}
      <Dialog
        open={!!editingMaterial}
        onOpenChange={(open) => !open && setEditingMaterial(null)}
      >
        <DialogContent data-testid="dialog-modifica-materiale">
          <DialogHeader>
            <DialogTitle>Modifica Materiale</DialogTitle>
            <DialogDescription>Aggiorna i dati del materiale.</DialogDescription>
          </DialogHeader>
          {editingMaterial && (
            <MaterialForm
              defaultValues={{
                name: editingMaterial.name,
                density: String(editingMaterial.density),
              }}
              onSubmit={(values) =>
                updateMaterialMut.mutate({ id: editingMaterial.id, data: values })
              }
              isPending={updateMaterialMut.isPending}
              submitLabel="Salva"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Elimina materiale */}
      <AlertDialog
        open={!!deletingMaterial}
        onOpenChange={(open) => !open && setDeletingMaterial(null)}
      >
        <AlertDialogContent data-testid="dialog-elimina-materiale">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il materiale?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingMaterial
                ? `Stai per eliminare "${deletingMaterial.name}" e tutti i suoi spessori. L'operazione non è reversibile.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-annulla-elimina-materiale">
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deletingMaterial && deleteMaterialMut.mutate(deletingMaterial.id)
              }
              data-testid="button-conferma-elimina-materiale"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Crea spessore per materiale */}
      <Dialog
        open={!!createThicknessFor}
        onOpenChange={(open) => !open && setCreateThicknessFor(null)}
      >
        <DialogContent data-testid="dialog-nuovo-spessore">
          <DialogHeader>
            <DialogTitle>
              Nuovo Spessore{createThicknessFor ? ` — ${createThicknessFor.name}` : ""}
            </DialogTitle>
            <DialogDescription>
              Inserisci spessore in mm, costo al kg e margine % di default.
            </DialogDescription>
          </DialogHeader>
          {createThicknessFor && (
            <ThicknessForm
              defaultValues={{
                materialId: createThicknessFor.id,
                thicknessMm: "0",
                costPerKg: "0",
                marginPercent: "0",
              }}
              onSubmit={(values) => createThicknessMut.mutate(values)}
              isPending={createThicknessMut.isPending}
              submitLabel="Crea"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modifica spessore */}
      <Dialog
        open={!!editingThickness}
        onOpenChange={(open) => !open && setEditingThickness(null)}
      >
        <DialogContent data-testid="dialog-modifica-spessore">
          <DialogHeader>
            <DialogTitle>Modifica Spessore</DialogTitle>
            <DialogDescription>Aggiorna i dati dello spessore.</DialogDescription>
          </DialogHeader>
          {editingThickness && (
            <ThicknessForm
              defaultValues={{
                materialId: editingThickness.materialId,
                thicknessMm: String(editingThickness.thicknessMm),
                costPerKg: String(editingThickness.costPerKg),
                marginPercent: String(editingThickness.marginPercent),
              }}
              onSubmit={(values) =>
                updateThicknessMut.mutate({ id: editingThickness.id, data: values })
              }
              isPending={updateThicknessMut.isPending}
              submitLabel="Salva"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Elimina spessore */}
      <AlertDialog
        open={!!deletingThickness}
        onOpenChange={(open) => !open && setDeletingThickness(null)}
      >
        <AlertDialogContent data-testid="dialog-elimina-spessore">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare lo spessore?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingThickness
                ? `Stai per eliminare lo spessore di ${num(deletingThickness.thicknessMm)} mm. L'operazione non è reversibile.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-annulla-elimina-spessore">
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deletingThickness && deleteThicknessMut.mutate(deletingThickness.id)
              }
              data-testid="button-conferma-elimina-spessore"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============ ARTICOLI ============

function ArticleForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
}: {
  defaultValues: InsertCatalogArticle;
  onSubmit: (values: InsertCatalogArticle) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const form = useForm<InsertCatalogArticle>({
    resolver: zodResolver(insertCatalogArticleSchema),
    defaultValues,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome articolo</FormLabel>
              <FormControl>
                <Input
                  placeholder="Es. Staffa, Raccordo, Gocciolatoio"
                  {...field}
                  data-testid="input-articolo-nome"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="unitCost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Costo unitario (€)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    inputMode="decimal"
                    placeholder="0.00"
                    {...field}
                    value={field.value ?? ""}
                    data-testid="input-articolo-costo"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="unitOfMeasure"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unità di misura</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Es. pz, m, kg"
                    {...field}
                    data-testid="input-articolo-uom"
                  />
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
              <FormLabel>Margine % di default</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder="0"
                  {...field}
                  value={field.value ?? ""}
                  data-testid="input-articolo-margine"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button
            type="submit"
            disabled={isPending}
            data-testid="button-conferma-articolo"
          >
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function ArticoliTab() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogArticle | null>(null);
  const [deleting, setDeleting] = useState<CatalogArticle | null>(null);

  const { data: articles = [], isLoading } = useQuery<CatalogArticle[]>({
    queryKey: ["/api/catalog-articles"],
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["/api/catalog-articles"] });
  }

  const onMutationError = (err: Error) => {
    toast({ title: "Errore", description: err.message, variant: "destructive" });
  };

  const createMut = useMutation({
    mutationFn: async (data: InsertCatalogArticle) => {
      const res = await apiRequest("POST", "/api/catalog-articles", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Articolo creato" });
      setCreateOpen(false);
      invalidate();
    },
    onError: onMutationError,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertCatalogArticle }) => {
      const res = await apiRequest("PUT", `/api/catalog-articles/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Articolo aggiornato" });
      setEditing(null);
      invalidate();
    },
    onError: onMutationError,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/catalog-articles/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Articolo eliminato" });
      setDeleting(null);
      invalidate();
    },
    onError: (err: Error) => {
      onMutationError(err);
      setDeleting(null);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Articoli</h2>
          <p className="text-sm text-muted-foreground">
            Articoli pre-acquistati e rivenduti (staffe, raccordi, gocciolatoi, ecc.).
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-nuovo-articolo">
          <Plus className="w-4 h-4 mr-2" />
          Nuovo Articolo
        </Button>
      </div>

      <div className="border rounded-lg">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : articles.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground"
            data-testid="empty-articoli"
          >
            <Package className="w-10 h-10 mb-2" />
            <p>Nessun articolo inserito.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Unità</TableHead>
                <TableHead className="text-right">Costo unitario</TableHead>
                <TableHead className="text-right">Margine %</TableHead>
                <TableHead className="w-[110px] text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {articles.map((a) => (
                <TableRow key={a.id} data-testid={`row-articolo-${a.id}`}>
                  <TableCell
                    className="font-medium"
                    data-testid={`text-articolo-nome-${a.id}`}
                  >
                    {a.name}
                  </TableCell>
                  <TableCell data-testid={`text-articolo-uom-${a.id}`}>
                    {a.unitOfMeasure}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    data-testid={`text-articolo-costo-${a.id}`}
                  >
                    € {formatCurrency(num(a.unitCost))}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    data-testid={`text-articolo-margine-${a.id}`}
                  >
                    {num(a.marginPercent)}%
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditing(a)}
                        data-testid={`button-modifica-articolo-${a.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleting(a)}
                        data-testid={`button-elimina-articolo-${a.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent data-testid="dialog-nuovo-articolo">
          <DialogHeader>
            <DialogTitle>Nuovo Articolo</DialogTitle>
            <DialogDescription>
              Definisci nome, costo unitario, margine % e unità di misura.
            </DialogDescription>
          </DialogHeader>
          <ArticleForm
            defaultValues={{
              name: "",
              unitCost: "0",
              marginPercent: "0",
              unitOfMeasure: "pz",
            }}
            onSubmit={(values) => createMut.mutate(values)}
            isPending={createMut.isPending}
            submitLabel="Crea"
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent data-testid="dialog-modifica-articolo">
          <DialogHeader>
            <DialogTitle>Modifica Articolo</DialogTitle>
            <DialogDescription>Aggiorna i dati dell'articolo.</DialogDescription>
          </DialogHeader>
          {editing && (
            <ArticleForm
              defaultValues={{
                name: editing.name,
                unitCost: String(editing.unitCost),
                marginPercent: String(editing.marginPercent),
                unitOfMeasure: editing.unitOfMeasure,
              }}
              onSubmit={(values) => updateMut.mutate({ id: editing.id, data: values })}
              isPending={updateMut.isPending}
              submitLabel="Salva"
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent data-testid="dialog-elimina-articolo">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare l'articolo?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `Stai per eliminare "${deleting.name}". L'operazione non è reversibile.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-annulla-elimina-articolo">
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
              data-testid="button-conferma-elimina-articolo"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============ MANODOPERA / GIORNATE ============

function LaborForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
}: {
  defaultValues: InsertLaborRate;
  onSubmit: (values: InsertLaborRate) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const form = useForm<InsertLaborRate>({
    resolver: zodResolver(insertLaborRateSchema),
    defaultValues,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome voce</FormLabel>
              <FormControl>
                <Input
                  placeholder="Es. Installatore, Aiuto installatore"
                  {...field}
                  data-testid="input-manodopera-nome"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="costPerDay"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Costo al giorno (€)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    placeholder="0.00"
                    {...field}
                    value={field.value ?? ""}
                    data-testid="input-manodopera-costo-giorno"
                  />
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
                <FormLabel>Margine % di default</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    placeholder="0"
                    {...field}
                    value={field.value ?? ""}
                    data-testid="input-manodopera-margine"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <DialogFooter>
          <Button
            type="submit"
            disabled={isPending}
            data-testid="button-conferma-manodopera"
          >
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function ManodoperaTab() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<LaborRate | null>(null);
  const [deleting, setDeleting] = useState<LaborRate | null>(null);

  const { data: rates = [], isLoading } = useQuery<LaborRate[]>({
    queryKey: ["/api/labor-rates"],
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["/api/labor-rates"] });
  }

  const onMutationError = (err: Error) => {
    toast({ title: "Errore", description: err.message, variant: "destructive" });
  };

  const createMut = useMutation({
    mutationFn: async (data: InsertLaborRate) => {
      const res = await apiRequest("POST", "/api/labor-rates", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Voce manodopera creata" });
      setCreateOpen(false);
      invalidate();
    },
    onError: onMutationError,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertLaborRate }) => {
      const res = await apiRequest("PUT", `/api/labor-rates/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Voce manodopera aggiornata" });
      setEditing(null);
      invalidate();
    },
    onError: onMutationError,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/labor-rates/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Voce manodopera eliminata" });
      setDeleting(null);
      invalidate();
    },
    onError: (err: Error) => {
      onMutationError(err);
      setDeleting(null);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Manodopera / Giornate</h2>
          <p className="text-sm text-muted-foreground">
            Voci di manodopera giornaliera utilizzate nel preventivatore.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-nuova-manodopera">
          <Plus className="w-4 h-4 mr-2" />
          Nuova Voce
        </Button>
      </div>

      <div className="border rounded-lg">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : rates.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground"
            data-testid="empty-manodopera"
          >
            <Package className="w-10 h-10 mb-2" />
            <p>Nessuna voce di manodopera inserita.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="text-right">Costo / giorno</TableHead>
                <TableHead className="text-right">Margine %</TableHead>
                <TableHead className="w-[110px] text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((r) => (
                <TableRow key={r.id} data-testid={`row-manodopera-${r.id}`}>
                  <TableCell
                    className="font-medium"
                    data-testid={`text-manodopera-nome-${r.id}`}
                  >
                    {r.name}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    data-testid={`text-manodopera-costo-${r.id}`}
                  >
                    € {formatCurrency(num(r.costPerDay))}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    data-testid={`text-manodopera-margine-${r.id}`}
                  >
                    {num(r.marginPercent)}%
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditing(r)}
                        data-testid={`button-modifica-manodopera-${r.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleting(r)}
                        data-testid={`button-elimina-manodopera-${r.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent data-testid="dialog-nuova-manodopera">
          <DialogHeader>
            <DialogTitle>Nuova Voce di Manodopera</DialogTitle>
            <DialogDescription>
              Definisci nome, costo al giorno e margine %.
            </DialogDescription>
          </DialogHeader>
          <LaborForm
            defaultValues={{ name: "", costPerDay: "0", marginPercent: "0" }}
            onSubmit={(values) => createMut.mutate(values)}
            isPending={createMut.isPending}
            submitLabel="Crea"
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent data-testid="dialog-modifica-manodopera">
          <DialogHeader>
            <DialogTitle>Modifica Voce di Manodopera</DialogTitle>
            <DialogDescription>Aggiorna i dati della voce.</DialogDescription>
          </DialogHeader>
          {editing && (
            <LaborForm
              defaultValues={{
                name: editing.name,
                costPerDay: String(editing.costPerDay),
                marginPercent: String(editing.marginPercent),
              }}
              onSubmit={(values) => updateMut.mutate({ id: editing.id, data: values })}
              isPending={updateMut.isPending}
              submitLabel="Salva"
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent data-testid="dialog-elimina-manodopera">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la voce?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `Stai per eliminare "${deleting.name}". L'operazione non è reversibile.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-annulla-elimina-manodopera">
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
              data-testid="button-conferma-elimina-manodopera"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============ PAGINA CATALOGO LATTONERIA ============

export default function CatalogPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("materiali");

  return (
    <DashboardLayout user={user ?? undefined} fullWidth>
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Catalogo Lattoneria</h1>
          <p className="text-sm text-muted-foreground">
            Gestione di materiali, articoli e voci di manodopera per il preventivatore.
          </p>
        </div>
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList data-testid="tabs-catalogo">
            <TabsTrigger value="materiali" data-testid="tab-materiali">
              Materiali
            </TabsTrigger>
            <TabsTrigger value="articoli" data-testid="tab-articoli">
              Articoli
            </TabsTrigger>
            <TabsTrigger value="manodopera" data-testid="tab-manodopera">
              Manodopera
            </TabsTrigger>
          </TabsList>
          <TabsContent value="materiali" className="mt-6">
            <MaterialiTab />
          </TabsContent>
          <TabsContent value="articoli" className="mt-6">
            <ArticoliTab />
          </TabsContent>
          <TabsContent value="manodopera" className="mt-6">
            <ManodoperaTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
