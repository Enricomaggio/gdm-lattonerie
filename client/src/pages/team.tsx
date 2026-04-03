import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { useConfirmClose } from "@/hooks/use-confirm-close";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Users, Copy, Check, Pencil, UserX, KeyRound, RefreshCw, FolderPlus, ChevronUp, ChevronDown, Shield } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

type TeamUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "SUPER_ADMIN" | "COMPANY_ADMIN" | "SALES_AGENT" | "TECHNICIAN";
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string | null;
};

type ProxitPriorityItem = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  proxitPriority: number | null;
};

const inviteFormSchema = z.object({
  email: z.string().email("Email non valida"),
  role: z.enum(["COMPANY_ADMIN", "SALES_AGENT", "TECHNICIAN"]),
});

type InviteFormValues = z.infer<typeof inviteFormSchema>;

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  COMPANY_ADMIN: "Admin Azienda",
  SALES_AGENT: "Agente Commerciale",
  TECHNICIAN: "Tecnico",
};

const roleColors: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  COMPANY_ADMIN: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  SALES_AGENT: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  TECHNICIAN: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
        <Users className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2">
        Nessun membro del team
      </h3>
      <p className="text-muted-foreground max-w-sm">
        Inizia invitando il primo membro del tuo team.
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-md" />
      ))}
    </div>
  );
}

function InviteLinkDialog({
  open,
  onOpenChange,
  inviteLink,
  email,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inviteLink: string;
  email: string;
}) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invito creato</DialogTitle>
          <DialogDescription>
            Condividi questo link con {email} per completare la registrazione.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex gap-2">
            <Input 
              value={inviteLink} 
              readOnly 
              className="font-mono text-sm"
              data-testid="input-invite-link"
            />
            <Button variant="outline" onClick={copyToClipboard} data-testid="button-copy-link">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Il link scade tra 7 giorni.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} data-testid="button-close-invite">
            Chiudi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditRoleDialog({
  open,
  onOpenChange,
  user,
  onSave,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: TeamUser | null;
  onSave: (role: string) => void;
  isPending: boolean;
}) {
  const [selectedRole, setSelectedRole] = useState(user?.role || "SALES_AGENT");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifica Ruolo</DialogTitle>
          <DialogDescription>
            Cambia il ruolo di {user?.firstName} {user?.lastName}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger data-testid="select-edit-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="COMPANY_ADMIN">Admin Azienda</SelectItem>
              <SelectItem value="SALES_AGENT">Agente Commerciale</SelectItem>
              <SelectItem value="TECHNICIAN">Tecnico</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button 
            onClick={() => onSave(selectedRole)} 
            disabled={isPending}
            data-testid="button-save-role"
          >
            {isPending ? "Salvataggio..." : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TeamPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [inviteLinkDialogOpen, setInviteLinkDialogOpen] = useState(false);
  const [inviteData, setInviteData] = useState({ link: "", email: "" });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<TeamUser | null>(null);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [userToSuspend, setUserToSuspend] = useState<TeamUser | null>(null);
  const [resetLinkDialogOpen, setResetLinkDialogOpen] = useState(false);
  const [resetData, setResetData] = useState({ link: "", email: "" });
  const { setDirty: setInviteDirty, handleOpenChange: handleInviteConfirmClose, ConfirmCloseDialog: InviteConfirmCloseDialog } = useConfirmClose();

  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: {
      email: "",
      role: "SALES_AGENT",
    },
  });

  useEffect(() => {
    setInviteDirty(form.formState.isDirty);
  }, [form.formState.isDirty, setInviteDirty]);

  const { data: users = [], isLoading } = useQuery<TeamUser[]>({
    queryKey: ["/api/users"],
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: InviteFormValues) => {
      const response = await apiRequest("POST", "/api/users/invite", data);
      return response.json();
    },
    onSuccess: (data) => {
      setInviteDirty(false);
      setIsDialogOpen(false);
      form.reset();
      setInviteData({ link: data.inviteLink, email: data.invite.email });
      setInviteLinkDialogOpen(true);
      toast({
        title: "Invito creato",
        description: "Il link di invito è pronto per essere condiviso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile creare l'invito.",
        variant: "destructive",
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const response = await apiRequest("PUT", `/api/team/${userId}`, { role });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditDialogOpen(false);
      setSelectedUser(null);
      toast({
        title: "Ruolo aggiornato",
        description: "Il ruolo dell'utente è stato modificato.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile modificare il ruolo.",
        variant: "destructive",
      });
    },
  });

  const suspendMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `/api/team/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setSuspendDialogOpen(false);
      setUserToSuspend(null);
      toast({
        title: "Utente sospeso",
        description: "L'accesso dell'utente è stato disabilitato.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile sospendere l'utente.",
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("POST", `/api/users/${userId}/reset-password`);
      return response.json();
    },
    onSuccess: (data, userId) => {
      const targetUser = users.find(u => u.id === userId);
      setResetData({ link: data.resetLink, email: targetUser?.email || "" });
      setResetLinkDialogOpen(true);
      toast({
        title: "Link di reset creato",
        description: "Condividi il link con l'utente per reimpostare la password.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile generare il link di reset.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InviteFormValues) => {
    inviteMutation.mutate(data);
  };

  const handleEditRole = (teamUser: TeamUser) => {
    setSelectedUser(teamUser);
    setEditDialogOpen(true);
  };

  const handleSuspend = (teamUser: TeamUser) => {
    setUserToSuspend(teamUser);
    setSuspendDialogOpen(true);
  };

  const [syncResult, setSyncResult] = useState<{ createdCount: number; skippedCount: number; totalVinto: number } | null>(null);

  const syncProjectsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/sync-missing-projects"),
    onSuccess: async (res) => {
      const data = await res.json();
      setSyncResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Sync completato", description: data.message });
    },
    onError: () => {
      toast({ title: "Errore", description: "Errore durante la sincronizzazione", variant: "destructive" });
    },
  });

  const { data: proxitList = [], isLoading: proxitListLoading } = useQuery<ProxitPriorityItem[]>({
    queryKey: ["/api/proxit/priority-list"],
  });

  const updateProxitPriorityMutation = useMutation({
    mutationFn: async ({ userId, proxitPriority }: { userId: string; proxitPriority: number | null }) => {
      await apiRequest("PATCH", `/api/users/${userId}/proxit-priority`, { proxitPriority });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proxit/priority-list"] });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile aggiornare la priorità Proxit.", variant: "destructive" });
    },
  });

  const swapProxitPriorityMutation = useMutation({
    mutationFn: async ({ userIdA, userIdB }: { userIdA: string; userIdB: string }) => {
      await apiRequest("POST", "/api/proxit/swap-priority", { userIdA, userIdB });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proxit/priority-list"] });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile scambiare le priorità Proxit.", variant: "destructive" });
    },
  });

  const canManageTeam = user?.role === "COMPANY_ADMIN" || user?.role === "SUPER_ADMIN";

  if (!canManageTeam) {
    return (
      <DashboardLayout user={user!} fullWidth>
        <div className="flex items-center justify-center h-full">
          <Card className="max-w-md">
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                Non hai i permessi per accedere a questa sezione.
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout user={user!} fullWidth>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Gestione Team</h1>
            <p className="text-muted-foreground mt-1">
              Gestisci i membri del tuo team
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            if (!open) {
              handleInviteConfirmClose(false, () => {
                setIsDialogOpen(false);
                form.reset();
                setInviteDirty(false);
              });
              return;
            }
            setIsDialogOpen(open);
          }}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-member">
                <Plus className="w-4 h-4 mr-2" />
                Invita Membro
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invita Membro</DialogTitle>
                <DialogDescription>
                  Inserisci email e ruolo del nuovo membro. Riceverai un link da condividere.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="mario.rossi@azienda.it" {...field} data-testid="input-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ruolo</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-role">
                              <SelectValue placeholder="Seleziona ruolo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="COMPANY_ADMIN">Admin Azienda</SelectItem>
                            <SelectItem value="SALES_AGENT">Agente Commerciale</SelectItem>
                            <SelectItem value="TECHNICIAN">Tecnico</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Annulla
                    </Button>
                    <Button type="submit" disabled={inviteMutation.isPending} data-testid="button-submit-invite">
                      {inviteMutation.isPending ? "Creazione..." : "Crea Invito"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Membri del Team ({users.filter(u => u.status === "ACTIVE").length} attivi)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <LoadingSkeleton />
            ) : users.length === 0 ? (
              <EmptyState />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Ruolo</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Data Creazione</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((teamUser) => (
                    <TableRow 
                      key={teamUser.id} 
                      data-testid={`row-user-${teamUser.id}`}
                      className={teamUser.status === "SUSPENDED" ? "opacity-50" : ""}
                    >
                      <TableCell className="font-medium">
                        {teamUser.firstName} {teamUser.lastName}
                      </TableCell>
                      <TableCell>{teamUser.email}</TableCell>
                      <TableCell>
                        <Badge className={roleColors[teamUser.role]}>
                          {roleLabels[teamUser.role]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {teamUser.status === "SUSPENDED" ? (
                          <Badge variant="destructive">Sospeso</Badge>
                        ) : (
                          <Badge variant="outline" className="text-green-600 border-green-600">Attivo</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {teamUser.createdAt
                          ? format(new Date(teamUser.createdAt), "d MMM yyyy", { locale: it })
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {teamUser.id !== user?.id && teamUser.status === "ACTIVE" && (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => resetPasswordMutation.mutate(teamUser.id)}
                              disabled={resetPasswordMutation.isPending}
                              data-testid={`button-reset-password-${teamUser.id}`}
                              title="Reset Password"
                            >
                              <KeyRound className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditRole(teamUser)}
                              data-testid={`button-edit-${teamUser.id}`}
                              title="Modifica Ruolo"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleSuspend(teamUser)}
                              data-testid={`button-suspend-${teamUser.id}`}
                              title="Sospendi"
                            >
                              <UserX className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <InviteLinkDialog
          open={inviteLinkDialogOpen}
          onOpenChange={setInviteLinkDialogOpen}
          inviteLink={inviteData.link}
          email={inviteData.email}
        />

        <EditRoleDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          user={selectedUser}
          onSave={(role) => {
            if (selectedUser) {
              updateRoleMutation.mutate({ userId: selectedUser.id, role });
            }
          }}
          isPending={updateRoleMutation.isPending}
        />

        <InviteLinkDialog
          open={resetLinkDialogOpen}
          onOpenChange={setResetLinkDialogOpen}
          inviteLink={resetData.link}
          email={resetData.email}
        />

        <AlertDialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sospendere l'utente?</AlertDialogTitle>
              <AlertDialogDescription>
                Sei sicuro di voler sospendere l'accesso a {userToSuspend?.firstName} {userToSuspend?.lastName}? 
                L'utente non potrà più accedere al sistema.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => userToSuspend && suspendMutation.mutate(userToSuspend.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-suspend"
              >
                {suspendMutation.isPending ? "Sospensione..." : "Sospendi"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {InviteConfirmCloseDialog}

        {/* Sezione Priorità Proxit */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Priorità Proxit
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Chi ha la priorità più alta (numero più basso) ottiene il controllo esclusivo della pagina Proxit. Gli utenti senza priorità assegnata non possono modificare.
            </p>
          </CardHeader>
          <CardContent>
            {proxitListLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
              </div>
            ) : (
              <div className="space-y-1" data-testid="list-proxit-priority">
                {proxitList.map((item, idx) => {
                  const withPriority = proxitList.filter(p => p.proxitPriority !== null);
                  const isFirst = idx === 0;
                  const isLastWithPriority = item.proxitPriority !== null && idx === withPriority.length - 1;
                  const hasAccess = item.proxitPriority !== null;

                  return (
                    <div
                      key={item.userId}
                      className="flex items-center gap-3 px-3 py-2 rounded-md border"
                      data-testid={`row-proxit-priority-${item.userId}`}
                    >
                      {hasAccess ? (
                        <span className="text-sm font-bold text-primary w-6 text-center" data-testid={`text-priority-number-${item.userId}`}>
                          {item.proxitPriority}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground w-6 text-center">—</span>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" data-testid={`text-proxit-name-${item.userId}`}>
                          {item.firstName} {item.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{item.email}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded border ${hasAccess ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700" : "bg-muted text-muted-foreground border-border"}`} data-testid={`text-proxit-access-${item.userId}`}>
                        {hasAccess ? `Priorità ${item.proxitPriority}` : "Nessun accesso"}
                      </span>
                      <div className="flex flex-col gap-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-5 h-4 p-0"
                          disabled={!hasAccess || isFirst || swapProxitPriorityMutation.isPending}
                          onClick={() => {
                            const prevWithPriority = proxitList.filter(p => p.proxitPriority !== null);
                            const myIdx = prevWithPriority.findIndex(p => p.userId === item.userId);
                            if (myIdx <= 0) return;
                            const prev = prevWithPriority[myIdx - 1];
                            swapProxitPriorityMutation.mutate({ userIdA: item.userId, userIdB: prev.userId });
                          }}
                          title="Aumenta priorità"
                          data-testid={`button-priority-up-${item.userId}`}
                        >
                          <ChevronUp className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-5 h-4 p-0"
                          disabled={!hasAccess || isLastWithPriority || swapProxitPriorityMutation.isPending}
                          onClick={() => {
                            const prevWithPriority = proxitList.filter(p => p.proxitPriority !== null);
                            const myIdx = prevWithPriority.findIndex(p => p.userId === item.userId);
                            if (myIdx < 0 || myIdx >= prevWithPriority.length - 1) return;
                            const next = prevWithPriority[myIdx + 1];
                            swapProxitPriorityMutation.mutate({ userIdA: item.userId, userIdB: next.userId });
                          }}
                          title="Abbassa priorità"
                          data-testid={`button-priority-down-${item.userId}`}
                        >
                          <ChevronDown className="w-3 h-3" />
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        disabled={updateProxitPriorityMutation.isPending}
                        onClick={() => {
                          if (hasAccess) {
                            updateProxitPriorityMutation.mutate({ userId: item.userId, proxitPriority: null });
                          } else {
                            const maxPriority = proxitList.filter(p => p.proxitPriority !== null).reduce((max, p) => Math.max(max, p.proxitPriority!), 0);
                            updateProxitPriorityMutation.mutate({ userId: item.userId, proxitPriority: maxPriority + 1 });
                          }
                        }}
                        data-testid={`button-toggle-proxit-access-${item.userId}`}
                      >
                        {hasAccess ? "Rimuovi accesso" : "Aggiungi"}
                      </Button>
                    </div>
                  );
                })}
                {proxitList.length === 0 && (
                  <p className="text-sm text-muted-foreground" data-testid="text-no-proxit-users">
                    Nessun utente nel team.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sezione strumenti amministrativi */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Strumenti Amministrativi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium text-sm">Sincronizza Progetti Mancanti</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Crea i progetti per tutte le opportunità "Vinto" che non ne hanno uno. Non crea duplicati.
                </p>
                {syncResult && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-2 font-medium">
                    ✓ {syncResult.createdCount} creati · {syncResult.skippedCount} già esistenti · {syncResult.totalVinto} totali Vinto
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncProjectsMutation.mutate()}
                disabled={syncProjectsMutation.isPending}
                data-testid="button-sync-missing-projects"
              >
                {syncProjectsMutation.isPending ? (
                  <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Sincronizzazione...</>
                ) : (
                  <><FolderPlus className="w-4 h-4 mr-2" />Avvia Sync</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
