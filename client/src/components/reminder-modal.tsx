import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useConfirmClose } from "@/hooks/use-confirm-close";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, BellRing, Plus, Check, Trash2, Clock, AlertTriangle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Reminder } from "@shared/schema";

interface ReminderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId?: string;
  opportunityId?: string;
  contextName?: string;
}

export function ReminderModal({ open, onOpenChange, leadId, opportunityId, contextName }: ReminderModalProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [showForm, setShowForm] = useState(false);
  const { setDirty, handleOpenChange: handleConfirmClose, ConfirmCloseDialog } = useConfirmClose();

  const defaultDate = new Date().toISOString().split("T")[0];
  useEffect(() => {
    if (!showForm) {
      setDirty(false);
      return;
    }
    const hasContent = title.trim() !== "" || description.trim() !== "" || dueDate !== defaultDate;
    setDirty(hasContent);
  }, [showForm, title, description, dueDate, defaultDate, setDirty]);

  const queryKeyBase = leadId
    ? [`/api/reminders/lead/${leadId}`]
    : opportunityId
    ? [`/api/reminders/opportunity/${opportunityId}`]
    : ["/api/reminders"];

  const { data: reminders = [], isLoading } = useQuery<Reminder[]>({
    queryKey: queryKeyBase,
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        title: title.trim(),
        description: description.trim() || null,
        dueDate: new Date(dueDate).toISOString(),
      };
      if (leadId) body.leadId = leadId;
      if (opportunityId) body.opportunityId = opportunityId;
      const response = await apiRequest("POST", "/api/reminders", body);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeyBase });
      queryClient.invalidateQueries({ queryKey: ["/api/reminders/opportunities-with-active-manual"] });
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/reminders");
      }});
      setDirty(false);
      setTitle("");
      setDescription("");
      setDueDate(new Date().toISOString().split("T")[0]);
      setShowForm(false);
      toast({ title: "Promemoria creato", description: "Il promemoria è stato aggiunto con successo." });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const response = await apiRequest("PATCH", `/api/reminders/${id}`, { completed });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeyBase });
      queryClient.invalidateQueries({ queryKey: ["/api/reminders/opportunities-with-active-manual"] });
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/reminders");
      }});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/reminders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeyBase });
      queryClient.invalidateQueries({ queryKey: ["/api/reminders/opportunities-with-active-manual"] });
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/reminders");
      }});
      toast({ title: "Promemoria eliminato" });
    },
  });

  const handleCreate = () => {
    if (!title.trim() || !dueDate) return;
    createMutation.mutate();
  };

  const now = new Date();

  const activeReminders = reminders.filter(r => !r.completed);
  const completedReminders = reminders.filter(r => r.completed);

  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) {
        handleConfirmClose(false, () => {
          setDirty(false);
          setTitle("");
          setDescription("");
          setShowForm(false);
          onOpenChange(false);
        });
        return;
      }
      onOpenChange(v);
    }}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="w-5 h-5" />
            Promemoria {contextName ? `- ${contextName}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!showForm ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowForm(true)}
              data-testid="button-show-reminder-form"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuovo Promemoria
            </Button>
          ) : (
            <div className="space-y-3 border rounded-md p-3">
              <div>
                <Label htmlFor="reminder-title">Titolo *</Label>
                <Input
                  id="reminder-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Es. Richiamare cliente"
                  data-testid="input-reminder-title"
                />
              </div>
              <div>
                <Label htmlFor="reminder-date">Data scadenza *</Label>
                <Input
                  id="reminder-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  data-testid="input-reminder-date"
                />
              </div>
              <div>
                <Label htmlFor="reminder-description">Note</Label>
                <Textarea
                  id="reminder-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Dettagli aggiuntivi..."
                  rows={2}
                  data-testid="input-reminder-description"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleCreate}
                  disabled={!title.trim() || !dueDate || createMutation.isPending}
                  data-testid="button-create-reminder"
                >
                  {createMutation.isPending ? "Salvataggio..." : "Crea Promemoria"}
                </Button>
                <Button variant="outline" onClick={() => { setShowForm(false); setTitle(""); setDescription(""); setDueDate(new Date().toISOString().split("T")[0]); }}>
                  Annulla
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : activeReminders.length === 0 && completedReminders.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nessun promemoria</p>
            </div>
          ) : (
            <>
              {activeReminders.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                    Attivi ({activeReminders.length})
                  </h4>
                  {activeReminders.map(r => {
                    const dueD = new Date(r.dueDate);
                    const isOverdue = dueD < now && !r.completed;
                    return (
                      <div
                        key={r.id}
                        className={`flex items-start gap-2 p-2 rounded-md border ${isOverdue ? "bg-destructive/5 border-destructive/20" : ""}`}
                        data-testid={`reminder-modal-item-${r.id}`}
                      >
                        <Button
                          size="icon"
                          variant="outline"
                          className="shrink-0 mt-0.5"
                          onClick={() => completeMutation.mutate({ id: r.id, completed: true })}
                          disabled={completeMutation.isPending}
                          data-testid={`button-complete-modal-reminder-${r.id}`}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{r.title}</p>
                          {r.description && <p className="text-xs text-muted-foreground truncate">{r.description}</p>}
                          <Badge variant={isOverdue ? "destructive" : "secondary"} className="mt-1 text-xs">
                            {isOverdue && <AlertTriangle className="w-3 h-3 mr-1" />}
                            <Clock className="w-3 h-3 mr-1" />
                            {formatDate(r.dueDate)}
                          </Badge>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="shrink-0 text-muted-foreground"
                          onClick={() => deleteMutation.mutate(r.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-reminder-${r.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              {completedReminders.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                    Completati ({completedReminders.length})
                  </h4>
                  {completedReminders.slice(0, 5).map(r => (
                    <div
                      key={r.id}
                      className="flex items-start gap-2 p-2 rounded-md border opacity-60"
                      data-testid={`reminder-modal-completed-${r.id}`}
                    >
                      <Button
                        size="icon"
                        variant="default"
                        className="shrink-0 mt-0.5"
                        onClick={() => completeMutation.mutate({ id: r.id, completed: false })}
                        disabled={completeMutation.isPending}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-through text-muted-foreground">{r.title}</p>
                        <Badge variant="secondary" className="mt-1 text-xs">
                          {formatDate(r.dueDate)}
                        </Badge>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0 text-muted-foreground"
                        onClick={() => deleteMutation.mutate(r.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
      {ConfirmCloseDialog}
    </Dialog>
  );
}
