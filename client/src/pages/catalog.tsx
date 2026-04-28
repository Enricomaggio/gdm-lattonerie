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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Loader2, Plus, Pencil, Trash2, Package } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatCurrency";
import {
  insertRawMaterialSchema,
  insertProductSchema,
  type RawMaterial,
  type ProductWithRawMaterial,
  type InsertRawMaterial,
  type InsertProduct,
} from "@shared/schema";

function num(value: string | number | null | undefined, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function computeFinalPrice(product: ProductWithRawMaterial): number {
  const unitCost = num(product.rawMaterial?.unitCost);
  const conversion = num(product.conversionRate);
  const margin = num(product.marginPercent);
  return unitCost * conversion * (1 + margin / 100);
}

// ============ MATERIE PRIME ============

function RawMaterialForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
}: {
  defaultValues: InsertRawMaterial;
  onSubmit: (values: InsertRawMaterial) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const form = useForm<InsertRawMaterial>({
    resolver: zodResolver(insertRawMaterialSchema),
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
              <FormLabel>Nome</FormLabel>
              <FormControl>
                <Input
                  placeholder="Es. Farina 00"
                  {...field}
                  data-testid="input-raw-material-name"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="uomPurchase"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Unità di acquisto</FormLabel>
              <FormControl>
                <Input
                  placeholder="Es. kg, L, pz"
                  {...field}
                  data-testid="input-raw-material-uom"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
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
                  data-testid="input-raw-material-cost"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="submit" disabled={isPending} data-testid="button-submit-raw-material">
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function RawMaterialsTab() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<RawMaterial | null>(null);
  const [deleting, setDeleting] = useState<RawMaterial | null>(null);

  const { data: materials = [], isLoading } = useQuery<RawMaterial[]>({
    queryKey: ["/api/raw-materials"],
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["/api/raw-materials"] });
    queryClient.invalidateQueries({ queryKey: ["/api/products"] });
  }

  const createMut = useMutation({
    mutationFn: async (data: InsertRawMaterial) => {
      const res = await apiRequest("POST", "/api/raw-materials", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Materia prima creata" });
      setCreateOpen(false);
      invalidate();
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertRawMaterial }) => {
      const res = await apiRequest("PUT", `/api/raw-materials/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Materia prima aggiornata" });
      setEditing(null);
      invalidate();
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/raw-materials/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Materia prima eliminata" });
      setDeleting(null);
      invalidate();
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
      setDeleting(null);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Materie Prime</h2>
          <p className="text-sm text-muted-foreground">
            Input di costo. Definisci nome, unità di acquisto e costo unitario.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-new-raw-material">
          <Plus className="w-4 h-4 mr-2" />
          Aggiungi Materia Prima
        </Button>
      </div>

      <div className="border rounded-lg">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : materials.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground" data-testid="empty-raw-materials">
            <Package className="w-10 h-10 mb-2" />
            <p>Nessuna materia prima inserita.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Unità (Acquisto)</TableHead>
                <TableHead className="text-right">Costo Unitario</TableHead>
                <TableHead className="w-[120px] text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {materials.map((rm) => (
                <TableRow key={rm.id} data-testid={`row-raw-material-${rm.id}`}>
                  <TableCell className="font-medium" data-testid={`text-raw-material-name-${rm.id}`}>
                    {rm.name}
                  </TableCell>
                  <TableCell data-testid={`text-raw-material-uom-${rm.id}`}>{rm.uomPurchase}</TableCell>
                  <TableCell className="text-right" data-testid={`text-raw-material-cost-${rm.id}`}>
                    € {formatCurrency(num(rm.unitCost))}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditing(rm)}
                        data-testid={`button-edit-raw-material-${rm.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleting(rm)}
                        data-testid={`button-delete-raw-material-${rm.id}`}
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
        <DialogContent data-testid="dialog-new-raw-material">
          <DialogHeader>
            <DialogTitle>Nuova Materia Prima</DialogTitle>
            <DialogDescription>Inserisci i dati della nuova materia prima.</DialogDescription>
          </DialogHeader>
          <RawMaterialForm
            defaultValues={{ name: "", uomPurchase: "", unitCost: "0" }}
            onSubmit={(values) => createMut.mutate(values)}
            isPending={createMut.isPending}
            submitLabel="Crea"
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent data-testid="dialog-edit-raw-material">
          <DialogHeader>
            <DialogTitle>Modifica Materia Prima</DialogTitle>
            <DialogDescription>Aggiorna i dati della materia prima.</DialogDescription>
          </DialogHeader>
          {editing && (
            <RawMaterialForm
              defaultValues={{
                name: editing.name,
                uomPurchase: editing.uomPurchase,
                unitCost: String(editing.unitCost),
              }}
              onSubmit={(values) => updateMut.mutate({ id: editing.id, data: values })}
              isPending={updateMut.isPending}
              submitLabel="Salva"
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent data-testid="dialog-delete-raw-material">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la materia prima?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `Stai per eliminare "${deleting.name}". L'operazione non è reversibile.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-raw-material">Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
              data-testid="button-confirm-delete-raw-material"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============ PRODOTTI FINITI ============

function ProductForm({
  defaultValues,
  rawMaterials,
  onSubmit,
  isPending,
  submitLabel,
}: {
  defaultValues: InsertProduct;
  rawMaterials: RawMaterial[];
  onSubmit: (values: InsertProduct) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const form = useForm<InsertProduct>({
    resolver: zodResolver(insertProductSchema),
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
              <FormLabel>Nome prodotto</FormLabel>
              <FormControl>
                <Input
                  placeholder="Es. Pane integrale 500g"
                  {...field}
                  data-testid="input-product-name"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="rawMaterialId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Materia prima base</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ""}>
                <FormControl>
                  <SelectTrigger data-testid="select-product-raw-material">
                    <SelectValue placeholder="Seleziona una materia prima" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {rawMaterials.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      Nessuna materia prima disponibile
                    </div>
                  ) : (
                    rawMaterials.map((rm) => (
                      <SelectItem
                        key={rm.id}
                        value={rm.id}
                        data-testid={`select-option-raw-material-${rm.id}`}
                      >
                        {rm.name} ({rm.uomPurchase})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="conversionRate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Resa</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    inputMode="decimal"
                    placeholder="1"
                    {...field}
                    value={field.value ?? ""}
                    data-testid="input-product-conversion"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="uomSale"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unità di vendita</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Es. pz, kg"
                    {...field}
                    data-testid="input-product-uom-sale"
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
              <FormLabel>Margine (%)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder="0"
                  {...field}
                  value={field.value ?? ""}
                  data-testid="input-product-margin"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="submit" disabled={isPending} data-testid="button-submit-product">
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function ProductsTab() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ProductWithRawMaterial | null>(null);
  const [deleting, setDeleting] = useState<ProductWithRawMaterial | null>(null);

  const { data: products = [], isLoading } = useQuery<ProductWithRawMaterial[]>({
    queryKey: ["/api/products"],
  });

  const { data: rawMaterials = [] } = useQuery<RawMaterial[]>({
    queryKey: ["/api/raw-materials"],
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["/api/products"] });
  }

  const createMut = useMutation({
    mutationFn: async (data: InsertProduct) => {
      const res = await apiRequest("POST", "/api/products", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Prodotto creato" });
      setCreateOpen(false);
      invalidate();
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertProduct }) => {
      const res = await apiRequest("PUT", `/api/products/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Prodotto aggiornato" });
      setEditing(null);
      invalidate();
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/products/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Prodotto eliminato" });
      setDeleting(null);
      invalidate();
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
      setDeleting(null);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Prodotti Finiti</h2>
          <p className="text-sm text-muted-foreground">
            Output venduti al cliente. Il prezzo finale è calcolato in automatico.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          disabled={rawMaterials.length === 0}
          data-testid="button-new-product"
        >
          <Plus className="w-4 h-4 mr-2" />
          Aggiungi Prodotto Finito
        </Button>
      </div>

      {rawMaterials.length === 0 && (
        <div className="border rounded-lg p-4 text-sm text-muted-foreground" data-testid="hint-no-raw-materials">
          Aggiungi prima almeno una materia prima per poter creare prodotti finiti.
        </div>
      )}

      <div className="border rounded-lg">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground" data-testid="empty-products">
            <Package className="w-10 h-10 mb-2" />
            <p>Nessun prodotto finito inserito.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome Prodotto</TableHead>
                <TableHead>Materia Prima Base</TableHead>
                <TableHead className="text-right">Resa</TableHead>
                <TableHead>Unità (Vendita)</TableHead>
                <TableHead className="text-right">Margine %</TableHead>
                <TableHead className="text-right">Prezzo Cliente Finale</TableHead>
                <TableHead className="w-[120px] text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => {
                const finalPrice = computeFinalPrice(p);
                return (
                  <TableRow key={p.id} data-testid={`row-product-${p.id}`}>
                    <TableCell className="font-medium" data-testid={`text-product-name-${p.id}`}>
                      {p.name}
                    </TableCell>
                    <TableCell data-testid={`text-product-raw-material-${p.id}`}>
                      {p.rawMaterial?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-right" data-testid={`text-product-conversion-${p.id}`}>
                      {num(p.conversionRate)}
                    </TableCell>
                    <TableCell data-testid={`text-product-uom-sale-${p.id}`}>{p.uomSale}</TableCell>
                    <TableCell className="text-right" data-testid={`text-product-margin-${p.id}`}>
                      {num(p.marginPercent)}%
                    </TableCell>
                    <TableCell
                      className="text-right font-semibold"
                      data-testid={`text-product-final-price-${p.id}`}
                    >
                      € {formatCurrency(finalPrice)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditing(p)}
                          data-testid={`button-edit-product-${p.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleting(p)}
                          data-testid={`button-delete-product-${p.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent data-testid="dialog-new-product">
          <DialogHeader>
            <DialogTitle>Nuovo Prodotto Finito</DialogTitle>
            <DialogDescription>
              Configura il prodotto: il prezzo cliente è calcolato in automatico.
            </DialogDescription>
          </DialogHeader>
          <ProductForm
            defaultValues={{
              name: "",
              rawMaterialId: "",
              conversionRate: "1",
              uomSale: "",
              marginPercent: "0",
            }}
            rawMaterials={rawMaterials}
            onSubmit={(values) => createMut.mutate(values)}
            isPending={createMut.isPending}
            submitLabel="Crea"
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent data-testid="dialog-edit-product">
          <DialogHeader>
            <DialogTitle>Modifica Prodotto Finito</DialogTitle>
            <DialogDescription>Aggiorna i dati del prodotto finito.</DialogDescription>
          </DialogHeader>
          {editing && (
            <ProductForm
              defaultValues={{
                name: editing.name,
                rawMaterialId: editing.rawMaterialId,
                conversionRate: String(editing.conversionRate),
                uomSale: editing.uomSale,
                marginPercent: String(editing.marginPercent),
              }}
              rawMaterials={rawMaterials}
              onSubmit={(values) => updateMut.mutate({ id: editing.id, data: values })}
              isPending={updateMut.isPending}
              submitLabel="Salva"
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent data-testid="dialog-delete-product">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il prodotto?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `Stai per eliminare "${deleting.name}". L'operazione non è reversibile.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-product">Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
              data-testid="button-confirm-delete-product"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============ PAGINA CATALOGO ============

export default function CatalogPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("raw-materials");

  return (
    <DashboardLayout user={user ?? undefined} fullWidth>
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Catalogo</h1>
          <p className="text-sm text-muted-foreground">
            Gestione materie prime e prodotti finiti.
          </p>
        </div>
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList data-testid="tabs-catalog">
            <TabsTrigger value="raw-materials" data-testid="tab-raw-materials">
              Materie Prime
            </TabsTrigger>
            <TabsTrigger value="products" data-testid="tab-products">
              Prodotti Finiti
            </TabsTrigger>
          </TabsList>
          <TabsContent value="raw-materials" className="mt-6">
            <RawMaterialsTab />
          </TabsContent>
          <TabsContent value="products" className="mt-6">
            <ProductsTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
