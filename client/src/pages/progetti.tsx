import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useConfirmClose } from "@/hooks/use-confirm-close";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  pointerWithin,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  FolderKanban,
  GripVertical,
  MapPin,
  Building2,
  Calendar,
  User,
  CheckCircle2,
  Search,
  Filter,
  Settings,
  ArrowUp,
  ArrowDown,
  X,
  Plus,
  FileText,
  Phone,
  Mail,
  Truck,
  HardHat,
  AlertTriangle,
  ClipboardCheck,
  ExternalLink,
  Euro,
  Clock,
  Loader2,
  Pencil,
  Trash2,
  CheckSquare,
  Eye,
  StickyNote,
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
} from "lucide-react";
import { useLocation } from "wouter";
import type { Project, ProjectStage, WorkType } from "@shared/schema";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { SchedaCantiereModal } from "@/components/scheda-cantiere-modal";
import { QuotePreviewModal } from "@/components/quote-preview-modal";
import { SearchableSelect } from "@/components/ui/searchable-select";

type CantiereStatus =
  | "NON_AVVIATO"
  | "MONTAGGIO_PIANIFICATO"
  | "MONTAGGIO_IN_CORSO"
  | "IN_CORSO"
  | "SMONTAGGIO_IN_CORSO"
  | "COMPLETATO";

type ProjectWithRelations = Project & {
  assignedTechnician?: { id: string; firstName: string; lastName: string; email: string } | null;
  quoteNumber?: string | null;
  quoteId?: string | null;
  oppEstimatedStartDate?: string | null;
  cantiereStatus?: CantiereStatus;
  externalEngineerName?: string | null;
};

const cantiereStatusConfig: Record<CantiereStatus, { label: string; className: string }> = {
  NON_AVVIATO: { label: "Non avviato", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  MONTAGGIO_PIANIFICATO: { label: "Mont. pianificato", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  MONTAGGIO_IN_CORSO: { label: "Montaggio in corso", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" },
  IN_CORSO: { label: "In corso", className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  SMONTAGGIO_IN_CORSO: { label: "Smontaggio in corso", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  COMPLETATO: { label: "Completato", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
};

function DroppableColumn({
  stage,
  count,
  children,
}: {
  stage: ProjectStage;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
  });

  return (
    <div
      className="flex-shrink-0 flex-1 min-w-[280px] max-w-[400px]"
      data-testid={`project-column-${stage.id}`}
    >
      <div
        ref={setNodeRef}
        className={`bg-muted/50 rounded-lg p-3 min-h-[500px] transition-colors ${isOver ? 'bg-accent/20 ring-2 ring-accent' : ''}`}
      >
        <div className="flex items-center gap-2 mb-3 pb-2 border-b">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: stage.color }}
          />
          <h3 className="font-medium text-sm truncate">{stage.name}</h3>
          <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {count}
          </span>
        </div>
        <div className="space-y-2">
          {children}
        </div>
      </div>
    </div>
  );
}

function DraggableProjectCard({
  project,
  onClick,
}: {
  project: ProjectWithRelations;
  onClick: () => void;
}) {
  const [, navigate] = useLocation();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: project.id,
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  const handleClick = () => {
    if (!isDragging) {
      onClick();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded-md p-3 shadow-sm cursor-grab active:cursor-grabbing relative ${
        isDragging ? "shadow-lg" : "hover-elevate"
      } ${!project.sopralluogoFatto ? "bg-red-50 border-red-300" : "bg-card"}`}
      onClick={handleClick}
      data-testid={`project-card-${project.id}`}
      {...attributes}
      {...listeners}
    >
      <div
        className="absolute left-0 top-[4px] bottom-[4px] w-[3px] rounded-full"
        style={{ backgroundColor: project.workType === "PUBLIC" ? "#FACC15" : "#F97316" }}
      />
      <div className="relative">
        <GripVertical className="w-4 h-4 text-muted-foreground absolute top-0 right-0 flex-shrink-0" data-testid={`project-drag-handle-${project.id}`} />
        <div className="pr-6 space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold truncate flex-1" data-testid={`project-client-${project.id}`}>
              {project.clientName}
            </p>
            {project.workType === "PUBLIC" && (
              <span className="text-[10px] bg-yellow-400/30 text-yellow-700 dark:bg-yellow-400/20 dark:text-yellow-300 px-1.5 py-0.5 rounded-sm flex-shrink-0">
                Pubblico
              </span>
            )}
          </div>

          {project.siteAddress && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{project.siteAddress}</span>
            </div>
          )}

          {project.assignedTechnician && (
            <p className="text-xs text-muted-foreground truncate">
              {project.assignedTechnician.firstName} {project.assignedTechnician.lastName}
            </p>
          )}

          {project.quoteNumber && (
            <p className="text-xs text-muted-foreground" data-testid={`project-quote-${project.id}`}>
              Preventivo: <span className="font-semibold text-foreground">{project.quoteNumber}</span>
            </p>
          )}

          {project.oppEstimatedStartDate && (
            <p className="text-xs text-muted-foreground" data-testid={`project-start-date-${project.id}`}>
              Data inizio: <span className="font-semibold text-foreground">{format(new Date(project.oppEstimatedStartDate), "d MMM yyyy", { locale: it })}</span>
            </p>
          )}

          {(() => {
            const p = (project as any).priority as string | null;
            const opt = PRIORITY_OPTIONS.find(o => o.value === p);
            if (!opt) return null;
            return (
              <p className="text-xs text-muted-foreground" data-testid={`badge-priority-${project.id}`}>
                Priorità: <span className={`font-medium ${opt.color.replace(/border-\S+/g, '').replace(/bg-\S+/g, '').trim()}`}>{opt.label}</span>
              </p>
            );
          })()}

          {(() => {
            const cl = (project as any).checklist as { id: string; label: string; checked: boolean }[] | null;
            if (!cl || cl.length === 0) return null;
            const done = cl.filter(i => i.checked).length;
            const pct = Math.round((done / cl.length) * 100);
            return (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                  <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[10px] whitespace-nowrap">{done}/{cl.length}</span>
              </div>
            );
          })()}

          {project.cantiereStatus && (
            <div className="pt-0.5">
              <span
                className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-sm ${cantiereStatusConfig[project.cantiereStatus].className}`}
                data-testid={`badge-cantiere-status-${project.id}`}
              >
                {cantiereStatusConfig[project.cantiereStatus].label}
              </span>
            </div>
          )}

          {project.externalEngineerName && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground" data-testid={`project-engineer-${project.id}`}>
              <HardHat className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{project.externalEngineerName}</span>
            </div>
          )}

          <div className="flex items-center gap-1 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 gap-1"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/progetti/${project.id}/gantt`);
              }}
              data-testid={`button-cronistoria-${project.id}`}
            >
              <Clock className="w-3 h-3" />
              Cronistoria
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectCardOverlay({ project }: { project: ProjectWithRelations }) {
  return (
    <div className="bg-card border rounded-md p-3 shadow-lg opacity-90 w-[280px] relative">
      <div
        className="absolute left-0 top-[4px] bottom-[4px] w-[3px] rounded-full"
        style={{ backgroundColor: project.workType === "PUBLIC" ? "#FACC15" : "#F97316" }}
      />
      <div className="relative">
        <GripVertical className="w-4 h-4 text-muted-foreground absolute top-0 right-0" />
        <div className="pr-6 space-y-1.5">
          <p className="text-sm font-semibold truncate">{project.clientName}</p>
          {project.siteAddress && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3" />
              <span className="truncate">{project.siteAddress}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const projectEditSchema = z.object({
  notes: z.string().optional().or(z.literal("")),
  assignedTechnicianId: z.string().optional().or(z.literal("")),
  externalEngineerId: z.string().optional().or(z.literal("")),
  priority: z.string().optional().or(z.literal("")),
});

const PRIORITY_OPTIONS = [
  { value: "BASSA", label: "Bassa", color: "bg-green-100 text-green-700 border-green-300" },
  { value: "MEDIA", label: "Media", color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  { value: "ALTA", label: "Alta", color: "bg-red-100 text-red-700 border-red-300" },
] as const;

const DEFAULT_CHECKLIST = [
  { id: "1", label: "Chiamare cliente", checked: false },
  { id: "2", label: "Progetto fatto", checked: false },
  { id: "3", label: "Progetto impaginato", checked: false },
  { id: "4", label: "Progetto inviato", checked: false },
  { id: "5", label: "Chiamare cliente per conferma", checked: false },
  { id: "6", label: "Lista del materiale", checked: false },
  { id: "7", label: "Controllo mq progetto con offerta", checked: false },
];

type ProjectEditValues = z.infer<typeof projectEditSchema>;

const PRESET_COLORS = [
  "#61CE85", "#4563FF", "#F59E0B", "#EC4899", "#8B5CF6",
  "#059669", "#EF4444", "#06B6D4", "#F97316", "#84CC16",
  "#6366F1", "#14B8A6", "#E11D48", "#A855F7", "#0EA5E9",
];

function ProjectPipelineManageDialog({ stages, projects }: { stages: ProjectStage[]; projects: ProjectWithRelations[] }) {
  const [open, setOpen] = useState(false);
  const [localStages, setLocalStages] = useState<Array<{ id: string; name: string; color: string; isNew?: boolean }>>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const { toast } = useToast();
  const { setDirty: setPipelineDirty, handleOpenChange: handlePipelineConfirmClose, ConfirmCloseDialog: PipelineConfirmCloseDialog } = useConfirmClose();
  const originalStagesRef = useRef<string>("");

  useEffect(() => {
    if (open) {
      const initial = stages.map(s => ({ id: s.id, name: s.name, color: s.color }));
      setLocalStages(initial);
      setDeletedIds([]);
      originalStagesRef.current = JSON.stringify(initial);
      setPipelineDirty(false);
    }
  }, [open, stages, setPipelineDirty]);

  useEffect(() => {
    if (open && originalStagesRef.current) {
      const currentState = JSON.stringify({ localStages, deletedIds });
      const originalState = JSON.stringify({ localStages: JSON.parse(originalStagesRef.current), deletedIds: [] });
      setPipelineDirty(currentState !== originalState);
    }
  }, [localStages, deletedIds, open, setPipelineDirty]);

  const projectCountByStage = useMemo(() => {
    const map = new Map<string, number>();
    projects.forEach(p => map.set(p.stageId, (map.get(p.stageId) || 0) + 1));
    return map;
  }, [projects]);

  const moveUp = (index: number) => {
    if (index === 0) return;
    setLocalStages(prev => {
      const arr = [...prev];
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      return arr;
    });
  };

  const moveDown = (index: number) => {
    setLocalStages(prev => {
      if (index >= prev.length - 1) return prev;
      const arr = [...prev];
      [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
      return arr;
    });
  };

  const addStage = () => {
    setLocalStages(prev => [...prev, {
      id: `new-${Date.now()}`,
      name: "Nuova Colonna",
      color: PRESET_COLORS[prev.length % PRESET_COLORS.length],
      isNew: true,
    }]);
  };

  const removeStage = (index: number) => {
    const stage = localStages[index];
    if (!stage.isNew && (projectCountByStage.get(stage.id) || 0) > 0) {
      toast({ title: "Impossibile eliminare", description: "Ci sono progetti in questa colonna. Spostali prima.", variant: "destructive" });
      return;
    }
    if (!stage.isNew) setDeletedIds(prev => [...prev, stage.id]);
    setLocalStages(prev => prev.filter((_, i) => i !== index));
  };

  const updateName = (index: number, name: string) => {
    setLocalStages(prev => prev.map((s, i) => i === index ? { ...s, name } : s));
  };

  const updateColor = (index: number, color: string) => {
    setLocalStages(prev => prev.map((s, i) => i === index ? { ...s, color } : s));
  };

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const id of deletedIds) {
        await apiRequest("DELETE", `/api/project-stages/${id}`);
      }

      for (const stage of localStages) {
        if (stage.isNew) {
          await apiRequest("POST", "/api/project-stages", { name: stage.name, color: stage.color, order: 0 });
        } else {
          const original = stages.find(s => s.id === stage.id);
          if (original && (original.name !== stage.name || original.color !== stage.color)) {
            await apiRequest("PUT", `/api/project-stages/${stage.id}`, { name: stage.name, color: stage.color });
          }
        }
      }

      const currentStages = await (await apiRequest("GET", "/api/project-stages")).json();
      const stageMap = new Map(currentStages.map((s: any) => [s.name, s.id]));
      const orderedIds = localStages
        .filter(s => !deletedIds.includes(s.id))
        .map(s => s.isNew ? stageMap.get(s.name) : s.id)
        .filter(Boolean);

      if (orderedIds.length > 0) {
        await apiRequest("PUT", "/api/project-stages/reorder", { stageIds: orderedIds });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/project-stages"] });
      toast({ title: "Pipeline progetti aggiornata" });
      setPipelineDirty(false);
      setOpen(false);
    } catch (error: any) {
      const msg = error?.message || "Errore nel salvataggio";
      toast({ title: "Errore", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) {
        handlePipelineConfirmClose(false, () => {
          setOpen(false);
          setPipelineDirty(false);
        });
        return;
      }
      setOpen(v);
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-[#4563FF] text-[#4563FF] hover:bg-[#4563FF]/5" data-testid="button-manage-project-pipeline">
          <Settings className="w-4 h-4 mr-2" />
          Gestisci Pipeline
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gestisci Pipeline Progetti</DialogTitle>
          <DialogDescription>Aggiungi, rinomina, riordina o elimina le colonne della pipeline progetti.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-4">
          {localStages.map((stage, idx) => {
            const count = projectCountByStage.get(stage.id) || 0;
            return (
              <div key={stage.id} className="flex items-center gap-2 p-2 border rounded-lg bg-card" data-testid={`project-pipeline-stage-row-${idx}`}>
                <div className="flex flex-col gap-0.5">
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => moveUp(idx)} disabled={idx === 0} data-testid={`button-project-stage-up-${idx}`}>
                    <ArrowUp className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => moveDown(idx)} disabled={idx === localStages.length - 1} data-testid={`button-project-stage-down-${idx}`}>
                    <ArrowDown className="w-3 h-3" />
                  </Button>
                </div>
                <div className="relative">
                  <input
                    type="color"
                    value={stage.color}
                    onChange={(e) => updateColor(idx, e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                    title="Cambia colore"
                    data-testid={`input-project-stage-color-${idx}`}
                  />
                </div>
                <Input
                  value={stage.name}
                  onChange={(e) => updateName(idx, e.target.value)}
                  className="flex-1 h-8 text-sm"
                  data-testid={`input-project-stage-name-${idx}`}
                />
                {count > 0 && (
                  <Badge variant="secondary" className="text-xs whitespace-nowrap">{count} prog.</Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => removeStage(idx)}
                  disabled={count > 0}
                  title={count > 0 ? "Sposta prima i progetti" : "Elimina colonna"}
                  data-testid={`button-project-stage-delete-${idx}`}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
        </div>
        <Button variant="outline" onClick={addStage} className="w-full" data-testid="button-add-project-stage">
          <Plus className="w-4 h-4 mr-2" />
          Aggiungi Colonna
        </Button>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => {
            handlePipelineConfirmClose(false, () => {
              setOpen(false);
              setPipelineDirty(false);
            });
          }}>Annulla</Button>
          <Button onClick={handleSave} disabled={saving} data-testid="button-save-project-pipeline">
            {saving ? "Salvataggio..." : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
      {PipelineConfirmCloseDialog}
    </Dialog>
  );
}

export default function ProgettiPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedProject, setSelectedProject] = useState<ProjectWithRelations | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [quotePreviewId, setQuotePreviewId] = useState<number | null>(null);
  const [quotePreviewOpen, setQuotePreviewOpen] = useState(false);
  const { setDirty: setProjectDirty, handleOpenChange: handleProjectConfirmClose, ConfirmCloseDialog: ProjectConfirmCloseDialog } = useConfirmClose();
  const [isSchedaOpen, setIsSchedaOpen] = useState(false);
  const [activeProject, setActiveProject] = useState<ProjectWithRelations | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterWorkType, setFilterWorkType] = useState<string>("ALL");
  const [filterCantiereStatuses, setFilterCantiereStatuses] = useState<string[]>(() => {
    const validStatuses = new Set(["NON_AVVIATO", "MONTAGGIO_PIANIFICATO", "MONTAGGIO_IN_CORSO", "IN_CORSO", "SMONTAGGIO_IN_CORSO", "COMPLETATO"]);
    try {
      const saved = localStorage.getItem("progetti_filterCantiereStatuses");
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.every((v) => validStatuses.has(v))) {
          return parsed;
        }
      }
    } catch {}
    return [];
  });
  const [isCantiereStatusOpen, setIsCantiereStatusOpen] = useState(false);

  const ALL_CANTIERE_STATUSES: { value: string; label: string }[] = [
    { value: "NON_AVVIATO", label: "Non avviato" },
    { value: "MONTAGGIO_PIANIFICATO", label: "Mont. pianificato" },
    { value: "MONTAGGIO_IN_CORSO", label: "Montaggio in corso" },
    { value: "IN_CORSO", label: "In corso" },
    { value: "SMONTAGGIO_IN_CORSO", label: "Smontaggio in corso" },
    { value: "COMPLETATO", label: "Completato" },
  ];
  const isPartialCantiereSelection = filterCantiereStatuses.length > 0 && filterCantiereStatuses.length < ALL_CANTIERE_STATUSES.length;

  const pipelineScrollRef = useRef<HTMLDivElement>(null);
  const pipelineScrollCleanupRef = useRef<(() => void) | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollArrows = useCallback(() => {
    const el = pipelineScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  const pipelineRefCallback = useCallback((node: HTMLDivElement | null) => {
    if (pipelineScrollCleanupRef.current) {
      pipelineScrollCleanupRef.current();
      pipelineScrollCleanupRef.current = null;
    }
    pipelineScrollRef.current = node;
    if (node) {
      const handler = () => {
        setCanScrollLeft(node.scrollLeft > 0);
        setCanScrollRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 1);
      };
      handler();
      node.addEventListener("scroll", handler);
      const ro = new ResizeObserver(handler);
      ro.observe(node);
      pipelineScrollCleanupRef.current = () => {
        node.removeEventListener("scroll", handler);
        ro.disconnect();
      };
    }
  }, []);

  const scrollPipeline = useCallback((direction: "left" | "right") => {
    const el = pipelineScrollRef.current;
    if (!el) return;
    const columnWidth = 300;
    el.scrollBy({ left: direction === "left" ? -columnWidth : columnWidth, behavior: "smooth" });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    })
  );

  const { data: stages = [], isLoading: isLoadingStages } = useQuery<ProjectStage[]>({
    queryKey: ["/api/project-stages"],
  });

  useEffect(() => {
    requestAnimationFrame(updateScrollArrows);
  }, [stages, updateScrollArrows]);

  useEffect(() => {
    localStorage.setItem("progetti_filterCantiereStatuses", JSON.stringify(filterCantiereStatuses));
  }, [filterCantiereStatuses]);

  const { data: projects = [], isLoading: isLoadingProjects } = useQuery<ProjectWithRelations[]>({
    queryKey: ["/api/projects"],
  });

  const { data: teamMembers = [] } = useQuery<{ id: string; firstName: string; lastName: string; email: string; role: string }[]>({
    queryKey: ["/api/users/technicians"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users/technicians");
      return res.json();
    },
  });

  const { data: externalEngineers = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/external-engineers"],
  });

  const [checklistItems, setChecklistItems] = useState<{ id: string; label: string; checked: boolean }[]>([]);
  const [newChecklistLabel, setNewChecklistLabel] = useState("");
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [editingChecklistLabel, setEditingChecklistLabel] = useState("");
  const [dateStartValue, setDateStartValue] = useState("");

  const { data: projectDetail } = useQuery<any>({
    queryKey: ['/api/projects', selectedProject?.id],
    enabled: !!selectedProject && isDetailOpen,
  });

  useEffect(() => {
    if (projectDetail) {
      const startDate = projectDetail.estimatedStartDate
        ? new Date(projectDetail.estimatedStartDate).toISOString().split("T")[0]
        : "";
      setDateStartValue(startDate);
    }
  }, [projectDetail]);

  const updateOppDatesMutation = useMutation({
    mutationFn: async ({ opportunityId, startDate }: { opportunityId: string; startDate: string }) => {
      const payload: Record<string, unknown> = {};
      if (startDate) payload.estimatedStartDate = startDate;
      else payload.estimatedStartDate = null;
      const response = await apiRequest("PATCH", `/api/opportunities/${opportunityId}`, payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      if (selectedProject) {
        queryClient.invalidateQueries({ queryKey: ['/api/projects', selectedProject.id] });
      }
      toast({
        title: "Date aggiornate",
        description: "Le date del cantiere sono state aggiornate.",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile aggiornare le date.",
        variant: "destructive",
      });
    },
  });

  const editForm = useForm<ProjectEditValues>({
    resolver: zodResolver(projectEditSchema),
    defaultValues: {
      notes: "",
      assignedTechnicianId: "",
      externalEngineerId: "",
      priority: "MEDIA",
    },
  });

  useEffect(() => {
    setProjectDirty(editForm.formState.isDirty);
  }, [editForm.formState.isDirty, setProjectDirty]);

  useEffect(() => {
    if (!isCantiereStatusOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-cantiere-dropdown]")) {
        setIsCantiereStatusOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isCantiereStatusOpen]);

  const moveProjectMutation = useMutation({
    mutationFn: async ({ projectId, stageId }: { projectId: string; stageId: string }) => {
      const response = await apiRequest("PUT", `/api/projects/${projectId}/move`, { stageId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile spostare il progetto.",
        variant: "destructive",
      });
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async ({ projectId, data, checklist }: { projectId: string; data: Partial<ProjectEditValues>; checklist?: { id: string; label: string; checked: boolean }[] }) => {
      const payload: Record<string, unknown> = {};
      if (data.notes !== undefined) payload.notes = data.notes || null;
      if (data.assignedTechnicianId !== undefined) payload.assignedTechnicianId = (data.assignedTechnicianId && data.assignedTechnicianId !== "none") ? data.assignedTechnicianId : null;
      if (data.externalEngineerId !== undefined) payload.externalEngineerId = (data.externalEngineerId && data.externalEngineerId !== "none") ? data.externalEngineerId : null;
      if (data.priority !== undefined) payload.priority = data.priority || "MEDIA";
      if (checklist) payload.checklist = checklist;
      const response = await apiRequest("PATCH", `/api/projects/${projectId}`, payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setProjectDirty(false);
      setIsDetailOpen(false);
      setSelectedProject(null);
      toast({
        title: "Progetto aggiornato",
        description: "Le modifiche sono state salvate.",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile aggiornare il progetto.",
        variant: "destructive",
      });
    },
  });

  const toggleProjectCompletionMutation = useMutation({
    mutationFn: async ({ projectId, isCompleted }: { projectId: string; isCompleted: boolean }) => {
      const payload = { cantiereStatusOverride: isCompleted ? null : "COMPLETATO" };
      const response = await apiRequest("PATCH", `/api/projects/${projectId}`, payload);
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      const nowClosed = !variables.isCompleted;
      if (selectedProject) {
        setSelectedProject({
          ...selectedProject,
          cantiereStatus: nowClosed ? ("COMPLETATO" as CantiereStatus) : undefined,
          cantiereStatusOverride: nowClosed ? "COMPLETATO" : null,
        } as any);
      }
      toast({
        title: nowClosed ? "Progetto chiuso" : "Progetto riaperto",
        description: nowClosed ? "Il progetto è stato contrassegnato come completato." : "Il progetto è stato riaperto.",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile aggiornare lo stato del progetto.",
        variant: "destructive",
      });
    },
  });

  const normalizeSearch = useCallback((text: string | null | undefined): string => {
    if (!text) return "";
    return text.toLowerCase().replace(/[.\-'"/\\,;:()_]/g, "").replace(/\s+/g, " ").trim();
  }, []);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (searchQuery) {
        const q = normalizeSearch(searchQuery);
        const fields = [
          p.clientName,
          p.siteAddress,
          p.assignedTechnician ? `${p.assignedTechnician.firstName} ${p.assignedTechnician.lastName}` : null,
          p.quoteNumber,
        ];
        const matches = fields.some(f => normalizeSearch(f).includes(q));
        if (!matches) return false;
      }
      if (filterWorkType !== "ALL" && p.workType !== filterWorkType) return false;
      if (isPartialCantiereSelection && !filterCantiereStatuses.includes(p.cantiereStatus ?? "")) return false;
      return true;
    });
  }, [projects, searchQuery, filterWorkType, filterCantiereStatuses, isPartialCantiereSelection, normalizeSearch]);

  const projectsByStage = useMemo(() => {
    const priorityOrder: Record<string, number> = { ALTA: 0, MEDIA: 1, BASSA: 2 };
    const map: Record<string, ProjectWithRelations[]> = {};
    for (const stage of stages) {
      map[stage.id] = filteredProjects
        .filter((p) => p.stageId === stage.id)
        .sort((a, b) => {
          const pa = priorityOrder[a.priority ?? "MEDIA"] ?? 1;
          const pb = priorityOrder[b.priority ?? "MEDIA"] ?? 1;
          if (pa !== pb) return pa - pb;
          const wa = a.wonAt ? new Date(a.wonAt).getTime() : null;
          const wb = b.wonAt ? new Date(b.wonAt).getTime() : null;
          if (wa === null && wb === null) return 0;
          if (wa === null) return 1;
          if (wb === null) return -1;
          return wb - wa;
        });
    }
    return map;
  }, [filteredProjects, stages]);

  const handleProjectClick = (project: ProjectWithRelations) => {
    setSelectedProject(project);
    editForm.reset({
      notes: project.notes || "",
      assignedTechnicianId: project.assignedTechnicianId || "",
      externalEngineerId: project.externalEngineerId || "",
      priority: (project as any).priority || "MEDIA",
    });
    setChecklistItems((project as any).checklist || DEFAULT_CHECKLIST.map(item => ({ ...item })));
    setNewChecklistLabel("");
    setEditingChecklistId(null);
    setIsDetailOpen(true);
  };

  const handleEditSubmit = (data: ProjectEditValues) => {
    if (selectedProject) {
      updateProjectMutation.mutate({ projectId: selectedProject.id, data, checklist: checklistItems });
    }
  };

  const toggleChecklistItem = useCallback((id: string) => {
    setChecklistItems(prev => prev.map(item => item.id === id ? { ...item, checked: !item.checked } : item));
  }, []);

  const removeChecklistItem = useCallback((id: string) => {
    setChecklistItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const addChecklistItem = useCallback(() => {
    if (!newChecklistLabel.trim()) return;
    setChecklistItems(prev => [...prev, { id: Date.now().toString(), label: newChecklistLabel.trim(), checked: false }]);
    setNewChecklistLabel("");
  }, [newChecklistLabel]);

  const startEditingChecklist = useCallback((id: string, label: string) => {
    setEditingChecklistId(id);
    setEditingChecklistLabel(label);
  }, []);

  const confirmEditChecklist = useCallback(() => {
    if (editingChecklistId && editingChecklistLabel.trim()) {
      setChecklistItems(prev => prev.map(item => item.id === editingChecklistId ? { ...item, label: editingChecklistLabel.trim() } : item));
    }
    setEditingChecklistId(null);
    setEditingChecklistLabel("");
  }, [editingChecklistId, editingChecklistLabel]);

  const checklistProgress = useMemo(() => {
    if (checklistItems.length === 0) return 0;
    return Math.round((checklistItems.filter(i => i.checked).length / checklistItems.length) * 100);
  }, [checklistItems]);

  const handleDragStart = (event: DragStartEvent) => {
    const project = projects.find((p) => p.id === event.active.id);
    if (project) {
      setActiveProject(project);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveProject(null);
    const { active, over } = event;
    if (!over) return;

    const projectId = active.id as string;
    const targetStageId = over.id as string;
    const project = projects.find((p) => p.id === projectId);
    if (!project || project.stageId === targetStageId) return;

    moveProjectMutation.mutate({ projectId, stageId: targetStageId });
  };

  const currentStage = selectedProject
    ? stages.find((s) => s.id === selectedProject.stageId)
    : null;

  if (isLoadingStages || isLoadingProjects) {
    return (
      <DashboardLayout user={user || undefined} fullWidth>
        <div className="p-6 space-y-4">
          <Skeleton className="h-10 w-64" />
          <div className="flex gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-[400px] w-[300px]" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout user={user || undefined} fullWidth>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground" data-testid="text-progetti-title">Progetti</h1>
            <p className="text-muted-foreground mt-1">
              Gestisci le commesse e la produzione
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(user?.role === "COMPANY_ADMIN" || user?.role === "SUPER_ADMIN") && (
              <ProjectPipelineManageDialog stages={stages} projects={projects} />
            )}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Cerca cliente, indirizzo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-56"
                data-testid="input-search-projects"
              />
            </div>
            <Select value={filterWorkType} onValueChange={setFilterWorkType}>
              <SelectTrigger className="w-40" data-testid="select-filter-work-type">
                <Filter className="w-4 h-4 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tutti i tipi</SelectItem>
                <SelectItem value="PRIVATE">Privato</SelectItem>
                <SelectItem value="PUBLIC">Pubblico</SelectItem>
                <SelectItem value="SUBCONTRACT">Subappalto</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative" data-cantiere-dropdown>
              <button
                type="button"
                onClick={() => setIsCantiereStatusOpen(prev => !prev)}
                className="flex items-center gap-1.5 h-9 px-3 w-48 rounded-md border border-input bg-background text-sm text-left hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="button-filter-cantiere-status"
              >
                <HardHat className="w-4 h-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-muted-foreground">
                  {isPartialCantiereSelection
                    ? `${filterCantiereStatuses.length} stati`
                    : "Tutti gli stati"}
                </span>
                {isPartialCantiereSelection && (
                  <span className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                    {filterCantiereStatuses.length}
                  </span>
                )}
              </button>
              {isCantiereStatusOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border bg-popover shadow-md">
                  <div className="p-1">
                    {ALL_CANTIERE_STATUSES.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setFilterCantiereStatuses(prev =>
                            prev.includes(value)
                              ? prev.filter(s => s !== value)
                              : [...prev, value]
                          );
                        }}
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                        data-testid={`checkbox-cantiere-status-${value}`}
                      >
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${filterCantiereStatuses.includes(value) ? "bg-primary border-primary text-primary-foreground" : "border-input"}`}>
                          {filterCantiereStatuses.includes(value) && (
                            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="relative" data-testid="pipeline-scroll-wrapper">
              {canScrollLeft && (
                <button
                  type="button"
                  onClick={() => scrollPipeline("left")}
                  className="fixed left-2 lg:left-[calc(16rem+0.5rem)] top-1/2 -translate-y-1/2 z-40 bg-background/80 backdrop-blur-sm border shadow-md rounded-full p-2 hover:bg-accent transition-colors"
                  data-testid="pipeline-scroll-left"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              {canScrollRight && (
                <button
                  type="button"
                  onClick={() => scrollPipeline("right")}
                  className="fixed right-4 top-1/2 -translate-y-1/2 z-40 bg-background/80 backdrop-blur-sm border shadow-md rounded-full p-2 hover:bg-accent transition-colors"
                  data-testid="pipeline-scroll-right"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
              <div ref={pipelineRefCallback} className="flex gap-4 overflow-x-auto pb-4">
                {stages.map((stage) => {
                  const stageProjects = projectsByStage[stage.id] || [];
                  return (
                    <DroppableColumn key={stage.id} stage={stage} count={stageProjects.length}>
                      {stageProjects.map((project) => (
                        <DraggableProjectCard
                          key={project.id}
                          project={project}
                          onClick={() => handleProjectClick(project)}
                        />
                      ))}
                    </DroppableColumn>
                  );
                })}
              </div>
            </div>

            <DragOverlay>
              {activeProject ? <ProjectCardOverlay project={activeProject} /> : null}
            </DragOverlay>
          </DndContext>
      </div>

      <Dialog open={isDetailOpen} onOpenChange={(open) => {
        if (!open) {
          handleProjectConfirmClose(false, () => {
            setIsDetailOpen(false);
            setSelectedProject(null);
            editForm.reset();
            setProjectDirty(false);
          });
          return;
        }
        setIsDetailOpen(open);
      }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderKanban className="w-5 h-5" />
              Dettaglio Progetto
            </DialogTitle>
            <DialogDescription>
              Modifica i dettagli del progetto e assegna il tecnico.
            </DialogDescription>
          </DialogHeader>

          {selectedProject && (
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="space-y-2 p-3 rounded-md bg-muted/50 border">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-semibold" data-testid="text-detail-client">
                          {selectedProject.clientName}
                        </span>
                        {selectedProject.workType === "PUBLIC" && (
                          <span className="text-[10px] bg-yellow-400/30 text-yellow-700 dark:bg-yellow-400/20 dark:text-yellow-300 px-1.5 py-0.5 rounded-sm flex-shrink-0">
                            Pubblico
                          </span>
                        )}
                      </div>
                      {selectedProject.siteAddress && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                          {selectedProject.opportunityId ? (
                            <button
                              type="button"
                              className="text-sm text-primary hover:underline cursor-pointer text-left"
                              data-testid="link-detail-address"
                              onClick={() => {
                                setIsDetailOpen(false);
                                navigate(`/mappa?highlight=${encodeURIComponent(selectedProject.opportunityId)}`);
                              }}
                            >
                              {selectedProject.siteAddress}
                            </button>
                          ) : (
                            <span className="text-sm text-muted-foreground" data-testid="text-detail-address">
                              {selectedProject.siteAddress}
                            </span>
                          )}
                        </div>
                      )}
                      {currentStage && (
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: currentStage.color }}
                          />
                          <span className="text-sm">{currentStage.name}</span>
                        </div>
                      )}
                      {(projectDetail?.quoteNumber || selectedProject.quoteNumber) && (
                        <p className="text-sm text-muted-foreground" data-testid="text-detail-quote-number">
                          Preventivo: <span className="font-semibold text-foreground">{projectDetail?.quoteNumber || selectedProject.quoteNumber}</span>
                          {(projectDetail?.quoteId || selectedProject.quoteId) && (
                            <button
                              type="button"
                              onClick={() => {
                                const id = projectDetail?.quoteId || selectedProject.quoteId;
                                if (id) {
                                  setQuotePreviewId(id);
                                  setQuotePreviewOpen(true);
                                }
                              }}
                              className="text-primary hover:text-primary/80 transition-colors ml-2 inline-flex items-center"
                              title="Visualizza preventivo"
                              data-testid="button-detail-view-quote"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                        </p>
                      )}
                    </div>

                    <div className="space-y-3 p-3 rounded-md border bg-muted/30">
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        Date Cantiere
                      </p>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-muted-foreground">Data inizio</label>
                          <Input
                            type="date"
                            value={dateStartValue}
                            onChange={(e) => setDateStartValue(e.target.value)}
                            data-testid="input-project-start-date"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full"
                          disabled={updateOppDatesMutation.isPending}
                          onClick={() => {
                            if (selectedProject?.opportunityId) {
                              updateOppDatesMutation.mutate({
                                opportunityId: selectedProject.opportunityId,
                                startDate: dateStartValue,
                              });
                            }
                          }}
                          data-testid="button-save-dates"
                        >
                          {updateOppDatesMutation.isPending ? "Salvataggio..." : "Aggiorna Date"}
                        </Button>
                      </div>
                    </div>

                    <FormField
                      control={editForm.control}
                      name="assignedTechnicianId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tecnico Assegnato</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger data-testid="select-technician">
                                <SelectValue placeholder="Seleziona tecnico" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">Nessun tecnico</SelectItem>
                              {teamMembers.map((member) => (
                                <SelectItem key={member.id} value={member.id}>
                                  {member.firstName} {member.lastName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editForm.control}
                      name="priority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Priorità</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || "MEDIA"}>
                            <FormControl>
                              <SelectTrigger data-testid="select-priority">
                                <SelectValue placeholder="Seleziona priorità" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {PRIORITY_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2 border-[#4563FF] text-[#4563FF] hover:bg-[#4563FF]/10"
                      onClick={() => setIsSchedaOpen(true)}
                      data-testid="button-scheda-cantiere"
                    >
                      <FileText className="w-4 h-4" />
                      Scheda Cantiere
                    </Button>

                    {projectDetail?.referent && (
                      <div className="space-y-2 p-3 rounded-md bg-muted/50 border">
                        <p className="text-sm font-semibold flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          Referente
                        </p>
                        <p className="text-sm" data-testid="text-detail-referent-name">
                          {`${projectDetail.referent.firstName || ""} ${projectDetail.referent.lastName || ""}`.trim()}
                          {projectDetail.referent.role && (
                            <span className="text-muted-foreground ml-1">({projectDetail.referent.role})</span>
                          )}
                        </p>
                        {(projectDetail.referent.phone || projectDetail.referent.mobile) && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                            {projectDetail.referent.phone && (
                              <a href={`tel:${projectDetail.referent.phone}`} className="text-primary hover:underline" data-testid="link-referent-phone">
                                {projectDetail.referent.phone}
                              </a>
                            )}
                            {projectDetail.referent.mobile && projectDetail.referent.phone && (
                              <span className="text-muted-foreground">|</span>
                            )}
                            {projectDetail.referent.mobile && (
                              <a href={`tel:${projectDetail.referent.mobile}`} className="text-primary hover:underline" data-testid="link-referent-mobile">
                                {projectDetail.referent.mobile}
                              </a>
                            )}
                          </div>
                        )}
                        {projectDetail.referent.email && (
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                            <a href={`mailto:${projectDetail.referent.email}`} className="text-primary hover:underline" data-testid="link-referent-email">
                              {projectDetail.referent.email}
                            </a>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-3" data-testid="section-checklist">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium flex items-center gap-1.5">
                          <CheckSquare className="w-4 h-4" />
                          Checklist
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {checklistItems.filter(i => i.checked).length}/{checklistItems.length} completati
                        </span>
                      </div>
                      <Progress value={checklistProgress} className="h-2" data-testid="progress-checklist" />

                      <div className="space-y-1">
                        {checklistItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 group rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
                            data-testid={`checklist-item-${item.id}`}
                          >
                            <Checkbox
                              checked={item.checked}
                              onCheckedChange={() => toggleChecklistItem(item.id)}
                              data-testid={`checkbox-checklist-${item.id}`}
                            />
                            {editingChecklistId === item.id ? (
                              <Input
                                value={editingChecklistLabel}
                                onChange={(e) => setEditingChecklistLabel(e.target.value)}
                                onBlur={confirmEditChecklist}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmEditChecklist(); } }}
                                className="h-7 text-sm flex-1"
                                autoFocus
                                data-testid={`input-edit-checklist-${item.id}`}
                              />
                            ) : (
                              <span
                                className={`flex-1 text-sm cursor-pointer ${item.checked ? "line-through text-muted-foreground" : ""}`}
                                onDoubleClick={() => startEditingChecklist(item.id, item.label)}
                                data-testid={`label-checklist-${item.id}`}
                              >
                                {item.label}
                              </span>
                            )}
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => startEditingChecklist(item.id, item.label)}
                                className="p-0.5 rounded hover:bg-muted"
                                data-testid={`button-edit-checklist-${item.id}`}
                              >
                                <Pencil className="w-3 h-3 text-muted-foreground" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeChecklistItem(item.id)}
                                className="p-0.5 rounded hover:bg-destructive/10"
                                data-testid={`button-remove-checklist-${item.id}`}
                              >
                                <Trash2 className="w-3 h-3 text-destructive" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <Input
                          value={newChecklistLabel}
                          onChange={(e) => setNewChecklistLabel(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChecklistItem(); } }}
                          placeholder="Nuovo elemento..."
                          className="h-8 text-sm flex-1"
                          data-testid="input-new-checklist"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addChecklistItem}
                          disabled={!newChecklistLabel.trim()}
                          data-testid="button-add-checklist"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    <FormField
                      control={editForm.control}
                      name="externalEngineerId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ingegnere RDC</FormLabel>
                          <FormControl>
                            <SearchableSelect
                              options={[
                                { value: "none", label: "Nessun ingegnere" },
                                ...externalEngineers.map((eng) => ({ value: eng.id, label: eng.name })),
                              ]}
                              value={field.value || "none"}
                              onChange={field.onChange}
                              placeholder="Seleziona ingegnere..."
                              emptyText="Nessun ingegnere trovato."
                              data-testid="select-external-engineer"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormField
                  control={editForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Note</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Note sul progetto..."
                          className="resize-none"
                          rows={3}
                          {...field}
                          data-testid="textarea-project-notes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {(projectDetail?.opportunityNotes || projectDetail?.leadNotes) && (
                  <div className="space-y-2 p-3 rounded-md bg-muted/50 border" data-testid="section-related-notes">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <StickyNote className="w-4 h-4 text-muted-foreground" />
                      Note Correlate
                    </p>
                    {projectDetail?.opportunityNotes && (
                      <div className="space-y-0.5" data-testid="related-note-opportunity">
                        <p className="text-xs font-medium text-muted-foreground">
                          Opportunità: {projectDetail.opportunityTitle || "—"}
                        </p>
                        <p className="text-xs whitespace-pre-wrap">{projectDetail.opportunityNotes}</p>
                      </div>
                    )}
                    {projectDetail?.leadNotes && (
                      <div className="space-y-0.5" data-testid="related-note-lead">
                        <p className="text-xs font-medium text-muted-foreground">
                          Contatto: {projectDetail.leadName || "—"}
                        </p>
                        <p className="text-xs whitespace-pre-wrap">{projectDetail.leadNotes}</p>
                      </div>
                    )}
                  </div>
                )}

                {selectedProject && (() => {
                  const isCompleted = selectedProject.cantiereStatus === "COMPLETATO" ||
                    (selectedProject as any).cantiereStatusOverride === "COMPLETATO";
                  return (
                    <div className={`flex items-center justify-between p-3 rounded-md border ${isCompleted ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800" : "bg-muted/30 border-dashed"}`} data-testid="section-project-completion">
                      <div className="flex items-center gap-2">
                        {isCompleted ? (
                          <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Unlock className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className="text-sm font-medium">
                          {isCompleted ? "Progetto completato" : "Stato cantiere"}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant={isCompleted ? "outline" : "default"}
                        size="sm"
                        className={isCompleted ? "" : "bg-emerald-600 hover:bg-emerald-700 text-white"}
                        disabled={toggleProjectCompletionMutation.isPending}
                        onClick={() => {
                          toggleProjectCompletionMutation.mutate({
                            projectId: selectedProject.id,
                            isCompleted,
                          });
                        }}
                        data-testid="button-toggle-project-completion"
                      >
                        {toggleProjectCompletionMutation.isPending
                          ? "Aggiornamento..."
                          : isCompleted
                            ? "Riapri Progetto"
                            : "Chiudi Progetto"}
                      </Button>
                    </div>
                  );
                })()}

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDetailOpen(false)}
                    data-testid="button-cancel-project"
                  >
                    Annulla
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateProjectMutation.isPending}
                    data-testid="button-save-project"
                  >
                    {updateProjectMutation.isPending ? "Salvataggio..." : "Salva Modifiche"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>

      {selectedProject && (
        <SchedaCantiereModal
          projectId={selectedProject.id}
          open={isSchedaOpen}
          onOpenChange={setIsSchedaOpen}
        />
      )}
      {ProjectConfirmCloseDialog}

      <QuotePreviewModal
        quoteId={quotePreviewId}
        isOpen={quotePreviewOpen}
        onClose={() => { setQuotePreviewOpen(false); setQuotePreviewId(null); }}
      />
    </DashboardLayout>
  );
}
