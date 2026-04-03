import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { useAuth } from "@/lib/auth";
import { useConfirmClose } from "@/hooks/use-confirm-close";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Building2, Users, Calendar, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface CompanyWithUserCount {
  id: string;
  name: string;
  vatNumber: string | null;
  address: string | null;
  createdAt: string;
  userCount: number;
}

const createCompanySchema = z.object({
  companyName: z.string().min(1, "Nome azienda obbligatorio"),
  vatNumber: z.string().optional(),
  address: z.string().optional(),
  adminFirstName: z.string().min(1, "Nome admin obbligatorio"),
  adminLastName: z.string().min(1, "Cognome admin obbligatorio"),
  adminEmail: z.string().email("Email non valida"),
  adminPassword: z.string().min(6, "Minimo 6 caratteri"),
});

const editCompanySchema = z.object({
  name: z.string().min(1, "Nome azienda obbligatorio"),
  vatNumber: z.string().optional(),
  address: z.string().optional(),
});

type CreateCompanyForm = z.infer<typeof createCompanySchema>;
type EditCompanyForm = z.infer<typeof editCompanySchema>;

export default function AdminPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyWithUserCount | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { setDirty: setCreateDirty, handleOpenChange: handleCreateConfirmClose, ConfirmCloseDialog: CreateConfirmCloseDialog } = useConfirmClose();
  const { setDirty: setEditDirty, handleOpenChange: handleEditConfirmClose, ConfirmCloseDialog: EditConfirmCloseDialog } = useConfirmClose();

  const { data: companies, isLoading } = useQuery<CompanyWithUserCount[]>({
    queryKey: ["/api/admin/companies"],
  });

  const form = useForm<CreateCompanyForm>({
    resolver: zodResolver(createCompanySchema),
    defaultValues: {
      companyName: "",
      vatNumber: "",
      address: "",
      adminFirstName: "",
      adminLastName: "",
      adminEmail: "",
      adminPassword: "",
    },
  });

  const editForm = useForm<EditCompanyForm>({
    resolver: zodResolver(editCompanySchema),
    defaultValues: {
      name: "",
      vatNumber: "",
      address: "",
    },
  });

  useEffect(() => {
    setCreateDirty(form.formState.isDirty);
  }, [form.formState.isDirty, setCreateDirty]);

  useEffect(() => {
    setEditDirty(editForm.formState.isDirty);
  }, [editForm.formState.isDirty, setEditDirty]);

  const createCompanyMutation = useMutation({
    mutationFn: async (data: CreateCompanyForm) => {
      const res = await apiRequest("POST", "/api/admin/companies", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] });
      setCreateDirty(false);
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: "Azienda creata",
        description: "L'azienda e l'amministratore sono stati creati con successo.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateCompanyMutation = useMutation({
    mutationFn: async (data: EditCompanyForm & { id: string }) => {
      const { id, ...updateData } = data;
      const res = await apiRequest("PATCH", `/api/admin/companies/${id}`, updateData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] });
      setEditDirty(false);
      setIsEditDialogOpen(false);
      setSelectedCompany(null);
      editForm.reset();
      toast({
        title: "Azienda aggiornata",
        description: "I dati dell'azienda sono stati aggiornati con successo.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteCompanyMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/companies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] });
      setIsDeleteDialogOpen(false);
      setSelectedCompany(null);
      toast({
        title: "Azienda eliminata",
        description: "L'azienda e tutti i dati associati sono stati eliminati.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateCompanyForm) => {
    createCompanyMutation.mutate(data);
  };

  const onEditSubmit = (data: EditCompanyForm) => {
    if (selectedCompany) {
      updateCompanyMutation.mutate({ ...data, id: selectedCompany.id });
    }
  };

  const handleEdit = (company: CompanyWithUserCount) => {
    setSelectedCompany(company);
    editForm.reset({
      name: company.name,
      vatNumber: company.vatNumber || "",
      address: company.address || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleDelete = (company: CompanyWithUserCount) => {
    setSelectedCompany(company);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedCompany) {
      deleteCompanyMutation.mutate(selectedCompany.id);
    }
  };

  return (
    <DashboardLayout user={user!} fullWidth>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Gestione Aziende</h1>
            <p className="text-muted-foreground">
              Visualizza e gestisci tutte le aziende registrate nel sistema
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            if (!open) {
              handleCreateConfirmClose(false, () => {
                setIsDialogOpen(false);
                form.reset();
                setCreateDirty(false);
              });
              return;
            }
            setIsDialogOpen(open);
          }}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-company">
                <Plus className="mr-2 h-4 w-4" />
                Aggiungi Azienda
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Nuova Azienda</DialogTitle>
                <DialogDescription>
                  Crea una nuova azienda e il suo primo amministratore
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium text-muted-foreground">Dati Azienda</h4>
                    <FormField
                      control={form.control}
                      name="companyName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome Azienda *</FormLabel>
                          <FormControl>
                            <Input data-testid="input-company-name" placeholder="Es. Ponteggi Rossi S.r.l." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="vatNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Partita IVA</FormLabel>
                            <FormControl>
                              <Input data-testid="input-vat-number" placeholder="IT12345678901" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Indirizzo</FormLabel>
                            <FormControl>
                              <Input data-testid="input-address" placeholder="Via Roma 1, Milano" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t">
                    <h4 className="text-sm font-medium text-muted-foreground">Primo Amministratore</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="adminFirstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nome *</FormLabel>
                            <FormControl>
                              <Input data-testid="input-admin-first-name" placeholder="Mario" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="adminLastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cognome *</FormLabel>
                            <FormControl>
                              <Input data-testid="input-admin-last-name" placeholder="Rossi" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="adminEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email *</FormLabel>
                          <FormControl>
                            <Input data-testid="input-admin-email" type="email" placeholder="admin@azienda.it" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="adminPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password Provvisoria *</FormLabel>
                          <FormControl>
                            <Input data-testid="input-admin-password" type="password" placeholder="Minimo 6 caratteri" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                      data-testid="button-cancel"
                    >
                      Annulla
                    </Button>
                    <Button
                      type="submit"
                      disabled={createCompanyMutation.isPending}
                      data-testid="button-create-company"
                    >
                      {createCompanyMutation.isPending ? "Creazione..." : "Crea Azienda"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Aziende Totali</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-companies">
                {isLoading ? <Skeleton className="h-8 w-12" /> : companies?.length || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Utenti Totali</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-users">
                {isLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  companies?.reduce((sum, c) => sum + c.userCount, 0) || 0
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Nuove Oggi</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-new-today">
                {isLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  companies?.filter((c) => {
                    const today = new Date();
                    const createdDate = new Date(c.createdAt);
                    return createdDate.toDateString() === today.toDateString();
                  }).length || 0
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Elenco Aziende</CardTitle>
            <CardDescription>
              Tutte le aziende registrate nel sistema Da.Do Ponteggi
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : companies && companies.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome Azienda</TableHead>
                    <TableHead>Partita IVA</TableHead>
                    <TableHead>Indirizzo</TableHead>
                    <TableHead className="text-center">Utenti</TableHead>
                    <TableHead>Data Creazione</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map((company) => (
                    <TableRow key={company.id} data-testid={`row-company-${company.id}`}>
                      <TableCell className="font-medium">{company.name}</TableCell>
                      <TableCell>{company.vatNumber || "-"}</TableCell>
                      <TableCell>{company.address || "-"}</TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-medium text-primary">
                          {company.userCount}
                        </span>
                      </TableCell>
                      <TableCell>
                        {format(new Date(company.createdAt), "dd MMM yyyy", { locale: it })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(company)}
                            data-testid={`button-edit-company-${company.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(company)}
                            data-testid={`button-delete-company-${company.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Building2 className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>Nessuna azienda registrata</p>
                <p className="text-sm">Clicca "Aggiungi Azienda" per crearne una</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
          if (!open) {
            handleEditConfirmClose(false, () => {
              setIsEditDialogOpen(false);
              setSelectedCompany(null);
              editForm.reset();
              setEditDirty(false);
            });
            return;
          }
          setIsEditDialogOpen(open);
        }}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Modifica Azienda</DialogTitle>
              <DialogDescription>
                Modifica i dati dell'azienda selezionata
              </DialogDescription>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
                <FormField
                  control={editForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Azienda *</FormLabel>
                      <FormControl>
                        <Input data-testid="input-edit-company-name" placeholder="Es. Ponteggi Rossi S.r.l." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="vatNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Partita IVA</FormLabel>
                      <FormControl>
                        <Input data-testid="input-edit-vat-number" placeholder="IT12345678901" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Indirizzo</FormLabel>
                      <FormControl>
                        <Input data-testid="input-edit-address" placeholder="Via Roma 1, Milano" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditDialogOpen(false)}
                    data-testid="button-cancel-edit"
                  >
                    Annulla
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateCompanyMutation.isPending}
                    data-testid="button-save-company"
                  >
                    {updateCompanyMutation.isPending ? "Salvataggio..." : "Salva"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminare l'azienda?</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>
                  Stai per eliminare <strong>{selectedCompany?.name}</strong>.
                </p>
                <p className="text-destructive font-medium">
                  Questa operazione eliminerà definitivamente anche tutti gli utenti ({selectedCompany?.userCount}) e i lead associati.
                </p>
                <p>L'azione non può essere annullata.</p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Annulla</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteCompanyMutation.isPending}
                data-testid="button-confirm-delete"
              >
                {deleteCompanyMutation.isPending ? "Eliminazione..." : "Elimina"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {CreateConfirmCloseDialog}
        {EditConfirmCloseDialog}
      </div>
    </DashboardLayout>
  );
}
