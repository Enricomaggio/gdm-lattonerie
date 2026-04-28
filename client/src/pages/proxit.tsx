import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, keepPreviousData } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Pencil,
  Trash2,
  User,
  Truck,
  Users,
  CalendarDays,
  X,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  AlertTriangle,
  History,
  GripHorizontal,
  Undo2,
  Calendar,
} from "lucide-react";
import { SchedaCantiereModal } from "@/components/scheda-cantiere-modal";
import { CronistoriaContent } from "@/components/cronistoria-content";
import type {
  Worker,
  Team,
  Driver,
  Vehicle,
  Project,
  DailyAssignment,
  ActivityType,
  TeamMember,
} from "@shared/schema";

const ACTIVITY_TYPES: ActivityType[] = [
  "MONTAGGIO",
  "SMONTAGGIO",
  "MONTAGGIO_SMONTAGGIO",
  "ECONOMIA",
  "CONSEGNA",
  "CONSEGNA_COMBINATO",
  "RITIRO",
  "RITIRO_COMBINATO",
  "ESUBERO",
  "ESUBERO_COMBINATO",
  "INTEGRAZIONE",
  "INTEGRAZIONE_COMBINATO",
  "MANUTENZIONE",
  "FERIE_PIOGGIA_VARIE",
];

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  MONTAGGIO: "#0065b8",
  SMONTAGGIO: "#07833b",
  MONTAGGIO_SMONTAGGIO: "#8e8e8e",
  ECONOMIA: "#C4B5FD",
  CONSEGNA: "#0065b8",
  RITIRO: "#07833b",
  CONSEGNA_COMBINATO: "#0065b8",
  RITIRO_COMBINATO: "#07833b",
  ESUBERO: "#75fb4c",
  ESUBERO_COMBINATO: "#75fb4c",
  INTEGRAZIONE: "#75fbfd",
  INTEGRAZIONE_COMBINATO: "#75fbfd",
  MANUTENZIONE: "#C0392B",
  FERIE_PIOGGIA_VARIE: "#FDE68A",
};

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  MONTAGGIO: "Montaggio",
  SMONTAGGIO: "Smontaggio",
  MONTAGGIO_SMONTAGGIO: "Montaggio e Smontaggio",
  ECONOMIA: "Economia",
  CONSEGNA: "Consegna",
  RITIRO: "Ritiro",
  CONSEGNA_COMBINATO: "Consegna combinato",
  RITIRO_COMBINATO: "Ritiro combinato",
  ESUBERO: "Esubero",
  ESUBERO_COMBINATO: "Esubero combinato",
  INTEGRAZIONE: "Integrazione",
  INTEGRAZIONE_COMBINATO: "Integrazione combinato",
  MANUTENZIONE: "Manutenzione",
  FERIE_PIOGGIA_VARIE: "Ferie/Pioggia/Varie",
};

const DAY_NAMES_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}


function formatDateRange(startDate: Date, numDays: number): string {
  const endDate = addDays(startDate, numDays - 1);
  const startStr = startDate.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  const endStr = endDate.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
  return `${startStr} - ${endStr}`;
}

function formatDateForApi(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateStr(dateStr: string | Date): string {
  if (typeof dateStr === "string") {
    return dateStr.substring(0, 10);
  }
  return formatDateForApi(dateStr);
}

function formatDateForInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function daysBetween(d1: Date, d2: Date): number {
  const a = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const b = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

function isItalianHoliday(date: Date): boolean {
  const m = date.getMonth();
  const d = date.getDate();
  const fixedHolidays = [
    [0, 1], [0, 6], [3, 25], [4, 1], [5, 2],
    [7, 15], [10, 1], [11, 8], [11, 25], [11, 26],
  ];
  for (const [hm, hd] of fixedHolidays) {
    if (m === hm && d === hd) return true;
  }
  const easter = getEasterDate(date.getFullYear());
  const easterMonday = new Date(easter);
  easterMonday.setDate(easterMonday.getDate() + 1);
  if (isSameDay(date, easter) || isSameDay(date, easterMonday)) return true;
  return false;
}

function getItalianHolidayName(date: Date): string | null {
  const m = date.getMonth();
  const d = date.getDate();
  const fixedHolidays: [number, number, string][] = [
    [0, 1, "Capodanno"],
    [0, 6, "Epifania"],
    [3, 25, "Festa della Liberazione"],
    [4, 1, "Festa dei Lavoratori"],
    [5, 2, "Festa della Repubblica"],
    [7, 15, "Ferragosto"],
    [10, 1, "Ognissanti"],
    [11, 8, "Immacolata Concezione"],
    [11, 25, "Natale"],
    [11, 26, "Santo Stefano"],
  ];
  for (const [hm, hd, name] of fixedHolidays) {
    if (m === hm && d === hd) return name;
  }
  const easter = getEasterDate(date.getFullYear());
  const easterMonday = new Date(easter);
  easterMonday.setDate(easterMonday.getDate() + 1);
  if (isSameDay(date, easter)) return "Pasqua";
  if (isSameDay(date, easterMonday)) return "Lunedì dell'Angelo";
  return null;
}

function getHolidaysInRange(startDate: Date, endDate: Date): string[] {
  const holidays: string[] = [];
  const seen = new Set<string>();
  const current = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  while (current <= end) {
    const name = getItalianHolidayName(current);
    if (name && !seen.has(name)) {
      seen.add(name);
      const dateStr = current.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
      holidays.push(`${dateStr} — ${name}`);
    }
    current.setDate(current.getDate() + 1);
  }
  return holidays;
}

function isWeekendOrHoliday(date: Date): "weekend" | "holiday" | false {
  if (isItalianHoliday(date)) return "holiday";
  const day = date.getDay();
  if (day === 0 || day === 6) return "weekend";
  return false;
}

const MONT_SMONT_TYPES: string[] = ["MONTAGGIO", "SMONTAGGIO", "MONTAGGIO_SMONTAGGIO", "ECONOMIA"];

const MATERIAL_TYPES = [
  { value: "EP", label: "EP (Edilponte)" },
  { value: "PL", label: "PL (Multidirezionale)" },
  { value: "VILLA", label: "VILLA (Villalta)" },
  { value: "MC", label: "MC (Materiale del Cliente)" },
  { value: "EL", label: "EL (Elettroelsa)" },
];

const CONSEGNA_TYPES = ["CONSEGNA", "CONSEGNA_COMBINATO", "RITIRO", "RITIRO_COMBINATO", "ESUBERO", "ESUBERO_COMBINATO", "INTEGRAZIONE", "INTEGRAZIONE_COMBINATO", "MONTAGGIO", "SMONTAGGIO", "MONTAGGIO_SMONTAGGIO"];
const SMONTAGGIO_RITIRO_TYPES = ["SMONTAGGIO", "RITIRO", "RITIRO_COMBINATO"];

const assignmentFormSchema = z.object({
  date: z.string().min(1, "Data inizio obbligatoria"),
  endDate: z.string().optional(),
  activityType: z.string().min(1, "Tipo attività obbligatorio"),
  clientName: z.string().optional(),
  siteCity: z.string().optional(),
  siteProvince: z.string().optional(),
  siteAddress: z.string().optional(),
  scheduledTime: z.string().optional(),
  driverId: z.string().optional(),
  vehicleId: z.string().optional(),
  teamIds: z.array(z.string()).optional(),
  assemblerCount: z.number().optional(),
  notes: z.string().optional(),
  projectId: z.string().optional(),
  timeSlot: z.enum(["FULL_DAY", "MATTINO", "POMERIGGIO"]).default("FULL_DAY"),
  endDayTimeSlot: z.enum(["FULL_DAY", "MATTINO", "POMERIGGIO"]).default("FULL_DAY"),
  workingDays: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
  materialType: z.string().optional(),
  materialQuantity: z.number().int().positive().optional(),
  materials: z.array(z.object({ type: z.string(), quantity: z.number().int().min(0) })).optional(),
});

const assignmentFormSchemaWithTeam = assignmentFormSchema.superRefine((data, ctx) => {
  if (MONT_SMONT_TYPES.includes(data.activityType) && (!data.teamIds || data.teamIds.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Caposquadra obbligatorio per questo tipo di attività",
      path: ["teamIds"],
    });
  }
  if (data.activityType === "FERIE_PIOGGIA_VARIE" && (!data.teamIds || data.teamIds.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Caposquadra obbligatorio per Ferie/Pioggia/Varie",
      path: ["teamIds"],
    });
  }
});

type AssignmentFormData = z.infer<typeof assignmentFormSchema>;

const teamFormSchema = z.object({
  name: z.string().min(1, "Nome obbligatorio"),
  paese: z.string().optional(),
  color: z.string().min(1, "Colore obbligatorio"),
});

const driverFormSchema = z.object({
  name: z.string().min(1, "Nome obbligatorio"),
  phone: z.string().optional(),
});

const vehicleFormSchema = z.object({
  name: z.string().min(1, "Nome obbligatorio"),
  plate: z.string().optional(),
  type: z.string().optional(),
});


type EnrichedProject = Project & {
  quoteNumber?: string | null;
  quoteId?: string | null;
  quoteStatus?: string | null;
  mapsLink?: string | null;
  assignedTechnician?: { id: string; firstName: string; lastName: string; email: string } | null;
};

type ConflictInfo = {
  resourceType: "caposquadra" | "lavoratore";
  resourceName: string;
  conflictingAssignmentId: string;
  conflictingAssignmentLabel: string;
};

function timeSlotsOverlap(
  slotA: string,
  slotB: string,
): boolean {
  if (slotA === "FULL_DAY" || slotB === "FULL_DAY") return true;
  if (slotA === slotB) return true;
  return false;
}

const CONFLICT_ACTIVITY_TYPES = ["MONTAGGIO", "SMONTAGGIO", "MONTAGGIO_SMONTAGGIO", "ECONOMIA"];

function getConflicts(
  newAssignment: {
    id?: string;
    activityType?: string;
    date: string;
    endDate?: string | null;
    timeSlot?: string;
    endDayTimeSlot?: string;
    teamIds?: string[] | null;
    workerAssignments?: Record<string, Record<string, string[]>> | null;
  },
  allAssignments: DailyAssignment[],
  workers: Worker[],
): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];
  if (!newAssignment.date) return conflicts;
  if (!newAssignment.activityType || !CONFLICT_ACTIVITY_TYPES.includes(newAssignment.activityType)) return conflicts;

  const newStart = newAssignment.date.substring(0, 10);
  const newEnd = newAssignment.endDate ? newAssignment.endDate.substring(0, 10) : newStart;
  const newStartSlot = newAssignment.timeSlot || "FULL_DAY";
  const newEndSlot = newAssignment.endDayTimeSlot || "FULL_DAY";
  const newIsMultiDay = newStart !== newEnd;

  const workersMap = new Map<string, Worker>();
  workers.forEach((w) => workersMap.set(w.id, w));

  function getAssignmentLabel(a: DailyAssignment): string {
    return a.clientName || a.activityType || a.id.substring(0, 8);
  }

  function assignmentsOverlap(other: DailyAssignment): boolean {
    const otherStart = parseDateStr(other.date);
    const otherEnd = other.endDate ? parseDateStr(other.endDate) : otherStart;
    const otherIsMultiDay = otherStart !== otherEnd;
    const otherStartSlot = other.timeSlot || "FULL_DAY";
    const otherEndSlot = other.endDayTimeSlot || "FULL_DAY";

    if (newEnd < otherStart || newStart > otherEnd) return false;

    const daysToCheck: string[] = [];
    const cur = new Date(newStart + "T00:00:00");
    const endD = new Date(newEnd + "T00:00:00");
    while (cur <= endD) {
      daysToCheck.push(formatDateForApi(cur));
      cur.setDate(cur.getDate() + 1);
    }

    for (const day of daysToCheck) {
      if (day < otherStart || day > otherEnd) continue;

      let newDaySlot: string;
      if (!newIsMultiDay) {
        newDaySlot = newStartSlot;
      } else if (day === newStart) {
        newDaySlot = newStartSlot;
      } else if (day === newEnd) {
        newDaySlot = newEndSlot;
      } else {
        newDaySlot = "FULL_DAY";
      }

      let otherDaySlot: string;
      if (!otherIsMultiDay) {
        otherDaySlot = otherStartSlot;
      } else if (day === otherStart) {
        otherDaySlot = otherStartSlot;
      } else if (day === otherEnd) {
        otherDaySlot = otherEndSlot;
      } else {
        otherDaySlot = "FULL_DAY";
      }

      if (timeSlotsOverlap(newDaySlot, otherDaySlot)) return true;
    }

    return false;
  }

  const newTeamIds = (newAssignment.teamIds || []).filter(Boolean);

  const alreadyReported = new Set<string>();

  for (const other of allAssignments) {
    if (newAssignment.id && other.id === newAssignment.id) continue;

    const overlaps = assignmentsOverlap(other);
    if (!overlaps) continue;

    const label = getAssignmentLabel(other);

    for (const teamId of newTeamIds) {
      const key = `caposquadra:${teamId}:${other.id}`;
      if (!alreadyReported.has(key) && (other.teamIds || []).includes(teamId)) {
        const worker = workersMap.get(teamId);
        conflicts.push({
          resourceType: "caposquadra",
          resourceName: worker?.name || teamId,
          conflictingAssignmentId: other.id,
          conflictingAssignmentLabel: label,
        });
        alreadyReported.add(key);
      }
    }

    const newWA = newAssignment.workerAssignments;
    const otherWA = (other.workerAssignments as Record<string, Record<string, string[]>> | null | undefined);
    if (newWA && otherWA) {
      const otherStart = parseDateStr(other.date);
      const otherEnd = other.endDate ? parseDateStr(other.endDate) : otherStart;
      const otherIsMultiDay = otherStart !== otherEnd;
      const otherStartSlot = other.timeSlot || "FULL_DAY";
      const otherEndSlot = other.endDayTimeSlot || "FULL_DAY";

      for (const [day, capoMap] of Object.entries(newWA)) {
        if (day < otherStart || day > otherEnd) continue;

        let newDaySlot: string;
        if (!newIsMultiDay) {
          newDaySlot = newStartSlot;
        } else if (day === newStart) {
          newDaySlot = newStartSlot;
        } else if (day === newEnd) {
          newDaySlot = newEndSlot;
        } else {
          newDaySlot = "FULL_DAY";
        }

        let otherDaySlot: string;
        if (!otherIsMultiDay) {
          otherDaySlot = otherStartSlot;
        } else if (day === otherStart) {
          otherDaySlot = otherStartSlot;
        } else if (day === otherEnd) {
          otherDaySlot = otherEndSlot;
        } else {
          otherDaySlot = "FULL_DAY";
        }

        if (!timeSlotsOverlap(newDaySlot, otherDaySlot)) continue;

        const newWorkerIdsOnDay = new Set<string>();
        for (const ids of Object.values(capoMap)) {
          ids.forEach((id) => newWorkerIdsOnDay.add(id));
        }

        const otherDayMap = otherWA[day] || {};
        for (const ids of Object.values(otherDayMap)) {
          for (const wId of ids) {
            if (!newWorkerIdsOnDay.has(wId)) continue;
            const w = workersMap.get(wId);
            if (w?.isCaposquadra) continue;
            const key = `lavoratore:${wId}:${other.id}`;
            if (!alreadyReported.has(key)) {
              conflicts.push({
                resourceType: "lavoratore",
                resourceName: w?.name || wId,
                conflictingAssignmentId: other.id,
                conflictingAssignmentLabel: label,
              });
              alreadyReported.add(key);
            }
          }
        }
      }
    }
  }

  return conflicts;
}

export default function ProxitPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const sessionIdRef = useRef<string>(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [activeTab, setActiveTab] = useState("pianificazione");
  const INITIAL_PAST_DAYS = 7;
  const INITIAL_FUTURE_DAYS = 14;
  const LOAD_MORE_DAYS = 14;
  const [rangeStart, setRangeStart] = useState(() => addDays(getMonday(new Date()), -INITIAL_PAST_DAYS));
  const [rangeEnd, setRangeEnd] = useState(() => addDays(getMonday(new Date()), INITIAL_FUTURE_DAYS));
  const [centerTodayRequest, setCenterTodayRequest] = useState(0);
  const [showAssignmentDialog, setShowAssignmentDialog] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<DailyAssignment | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [resourceTab, setResourceTab] = useState("persone");
  const [showTeamDialog, setShowTeamDialog] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [showDriverDialog, setShowDriverDialog] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [showVehicleDialog, setShowVehicleDialog] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [preselectedDate, setPreselectedDate] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<ActivityType>>(new Set(ACTIVITY_TYPES));
  const [activeCantiereFilters, setActiveCantiereFilters] = useState<Set<string>>(new Set());
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [showCronistoriaModal, setShowCronistoriaModal] = useState(false);

  type UndoEntry =
    | { type: "delete"; description: string; assignmentId: string }
    | { type: "create"; description: string; data: Record<string, unknown> }
    | { type: "update"; description: string; assignmentId: string; previousData: Record<string, unknown> }
    | { type: "warehouseBalance"; description: string; warehouseType: "VILLA" | "PL" | "EP"; date: string | null; previousValue: number | null };

  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);

  function pushUndo(entry: UndoEntry) {
    setUndoStack((prev) => {
      const next = [entry, ...prev];
      if (next.length > 20) return next.slice(0, 20);
      return next;
    });
  }

  const startDateStr = formatDateForApi(rangeStart);
  const endDateStr = formatDateForApi(rangeEnd);

  const { data: assignments = [], isLoading: assignmentsLoading, isFetching: assignmentsFetching } = useQuery<DailyAssignment[]>({
    queryKey: ["/api/assignments", `?startDate=${startDateStr}&endDate=${endDateStr}`],
    placeholderData: keepPreviousData,
  });

  const { data: teamsData = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: driversData = [] } = useQuery<Driver[]>({
    queryKey: ["/api/drivers"],
  });

  const { data: vehiclesData = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });

  const { data: projectsData = [] } = useQuery<EnrichedProject[]>({
    queryKey: ["/api/projects"],
  });

  const { data: teamMembersData = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
  });

  const { data: workersData = [] } = useQuery<Worker[]>({
    queryKey: ["/api/workers"],
  });

  // ---- WAREHOUSE BALANCES ----
  type WarehouseBalanceData = {
    id: string;
    companyId: string;
    warehouseType: "VILLA" | "PL" | "EP";
    date: string | null;
    value: string;
  };

  const { data: warehouseBalancesData = [], refetch: refetchWarehouseBalances } = useQuery<WarehouseBalanceData[]>({
    queryKey: ["/api/proxit/warehouse-balances"],
  });

  const upsertWarehouseBalanceMutation = useMutation({
    mutationFn: (data: { warehouseType: "VILLA" | "PL" | "EP"; date: string | null; value: number; previousValue?: number | null }) =>
      apiRequest("POST", "/api/proxit/warehouse-balances", { warehouseType: data.warehouseType, date: data.date, value: data.value }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/proxit/warehouse-balances"] });
      if (vars.previousValue !== undefined) {
        pushUndo({
          type: "warehouseBalance",
          description: `Annulla modifica saldo ${vars.warehouseType}`,
          warehouseType: vars.warehouseType,
          date: vars.date,
          previousValue: vars.previousValue ?? null,
        });
      }
    },
    onError: (err) => {
      console.error("[WH-MUTATION] error saving warehouse balance:", err);
    },
  });

  // ---- PROXIT LOCK: heartbeat e polling ----
  type LockHolder = { userId: string; firstName: string; lastName: string } | null;
  const { data: lockData, refetch: refetchLock } = useQuery<{ lockHolder: LockHolder }>({
    queryKey: ["/api/proxit/lock"],
    refetchInterval: 5000,
  });
  const lockHolder = lockData?.lockHolder ?? null;
  const hasLock = lockHolder?.userId === user?.id;

  useEffect(() => {
    const sessionId = sessionIdRef.current;
    let firstHeartbeatDone = false;
    const sendHeartbeat = () => {
      apiRequest("POST", "/api/proxit/heartbeat", { sessionId })
        .then(() => {
          if (!firstHeartbeatDone) {
            firstHeartbeatDone = true;
            refetchLock();
          }
        })
        .catch(() => {});
    };
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 15000);

    const handleBeforeUnload = () => {
      fetch("/api/proxit/heartbeat", { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("platform_one_token") || ""}` }, body: JSON.stringify({ sessionId }), keepalive: true }).catch(() => {});
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      apiRequest("DELETE", "/api/proxit/heartbeat", { sessionId }).catch(() => {});
    };
  }, []);

  const numDays = daysBetween(rangeStart, rangeEnd) + 1;
  const weekDays = useMemo(() => {
    return Array.from({ length: numDays }, (_, i) => addDays(rangeStart, i));
  }, [rangeStart, numDays]);

  const teamsMap = useMemo(() => {
    const m = new Map<string, Team>();
    teamsData.forEach((t) => m.set(t.id, t));
    return m;
  }, [teamsData]);

  const driversMap = useMemo(() => {
    const m = new Map<string, Driver>();
    driversData.forEach((d) => m.set(d.id, d));
    return m;
  }, [driversData]);

  const vehiclesMap = useMemo(() => {
    const m = new Map<string, Vehicle>();
    vehiclesData.forEach((v) => m.set(v.id, v));
    return m;
  }, [vehiclesData]);

  const projectsMap = useMemo(() => {
    const m = new Map<string, EnrichedProject>();
    projectsData.forEach((p) => m.set(p.id, p));
    return m;
  }, [projectsData]);

  const allCantieri = useMemo(() => {
    const names = new Set<string>();
    assignments.forEach((a) => {
      names.add(a.clientName || "Senza cliente");
    });
    return Array.from(names).sort();
  }, [assignments]);

  const filteredAssignments = useMemo(() => {
    return assignments.filter((a) => {
      if (!activeFilters.has(a.activityType as ActivityType)) return false;
      if (activeCantiereFilters.size > 0) {
        const key = a.clientName || "Senza cliente";
        if (!activeCantiereFilters.has(key)) return false;
      }
      return true;
    });
  }, [assignments, activeFilters, activeCantiereFilters]);

  function toggleFilter(type: ActivityType) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  function toggleCantiereFilter(name: string) {
    setActiveCantiereFilters((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  function buildAssignmentBody(data: AssignmentFormData, isDraft: boolean): Record<string, unknown> {
    const teamIds = data.teamIds?.length ? data.teamIds : null;
    const isMontSmontaggio = data.activityType === "MONTAGGIO" || data.activityType === "SMONTAGGIO" || data.activityType === "MONTAGGIO_SMONTAGGIO" || data.activityType === "ECONOMIA";
    const primaryCapoId = teamIds?.[0];
    let workerAssignments: Record<string, Record<string, string[]>> | null = null;
    if (isMontSmontaggio && primaryCapoId && data.date && !isDraft) {
      const start = new Date(data.date + "T00:00:00");
      const end = data.endDate ? new Date(data.endDate + "T00:00:00") : start;
      workerAssignments = {};
      const current = new Date(start);
      while (current <= end) {
        const dateKey = formatDateForApi(current);
        workerAssignments[dateKey] = { [primaryCapoId]: [primaryCapoId] };
        current.setDate(current.getDate() + 1);
      }
    }
    const validMaterials = (data.materials ?? []).filter(m => m.type && m.type !== "_none_mat" && m.quantity > 0);
    const body: Record<string, unknown> = {
      ...data,
      endDate: data.endDate || null,
      assemblerCount: data.assemblerCount || null,
      driverId: data.driverId === "_none" ? null : data.driverId || null,
      vehicleId: data.vehicleId === "_none" ? null : data.vehicleId || null,
      projectId: data.projectId === "_none" ? null : data.projectId || null,
      teamIds,
      isDraft,
      workingDays: data.workingDays ?? [1, 2, 3, 4, 5],
      materials: validMaterials.length > 0 ? validMaterials : null,
      materialType: validMaterials.length > 0 ? validMaterials[0].type : null,
      materialQuantity: validMaterials.length > 0 ? validMaterials[0].quantity : null,
    };
    if (workerAssignments) {
      body.workerAssignments = workerAssignments;
    }
    return body;
  }

  const createAssignmentMutation = useMutation({
    mutationFn: async ({ data, isDraft }: { data: AssignmentFormData; isDraft: boolean }) => {
      const res = await apiRequest("POST", "/api/assignments", buildAssignmentBody(data, isDraft));
      return res.json() as Promise<DailyAssignment>;
    },
    onSuccess: (result: DailyAssignment, { isDraft, data }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments/material-sigla"] });
      setShowAssignmentDialog(false);
      setPreselectedDate(null);
      toast({ title: isDraft ? "Bozza salvata" : "Attività creata" });
      if (result?.id) {
        const label = data.activityType || "attività";
        pushUndo({
          type: "delete",
          description: `Annulla creazione ${label}`,
          assignmentId: result.id,
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const updateAssignmentMutation = useMutation({
    mutationFn: async ({ id, data, isDraft, previousData: _prev }: { id: string; data: Partial<AssignmentFormData>; isDraft?: boolean; previousData?: Record<string, unknown> }) => {
      const body: Record<string, unknown> = { ...data };
      if ("endDate" in body) {
        if (!body.endDate) body.endDate = null;
      }
      if (body.driverId === "_none") body.driverId = null;
      if (body.vehicleId === "_none") body.vehicleId = null;
      if (body.projectId === "_none") body.projectId = null;
      if (body.teamIds && !(body.teamIds as string[]).length) body.teamIds = null;
      if (body.assemblerCount === undefined) delete body.assemblerCount;
      if ("materials" in body) {
        const mats = body.materials as Array<{ type: string; quantity: number }> | null | undefined;
        const validMats = Array.isArray(mats) ? mats.filter(m => m.type && m.type !== "_none_mat" && m.quantity > 0) : [];
        body.materials = validMats.length > 0 ? validMats : null;
        body.materialType = validMats.length > 0 ? validMats[0].type : null;
        body.materialQuantity = validMats.length > 0 ? validMats[0].quantity : null;
      }
      if (isDraft !== undefined) body.isDraft = isDraft;
      return apiRequest("PATCH", `/api/assignments/${id}`, body);
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments/material-sigla"] });
      setShowAssignmentDialog(false);
      setEditingAssignment(null);
      toast({ title: vars.isDraft === true ? "Bozza aggiornata" : "Attività aggiornata" });
      if (vars.previousData) {
        const label = (vars.previousData.activityType as string) || "attività";
        pushUndo({
          type: "update",
          description: `Annulla modifica ${label}`,
          assignmentId: vars.id,
          previousData: vars.previousData,
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async ({ id }: { id: string; previousData?: Record<string, unknown> }) => apiRequest("DELETE", `/api/assignments/${id}`),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      setShowDeleteConfirm(null);
      setShowAssignmentDialog(false);
      setEditingAssignment(null);
      toast({ title: "Attività eliminata" });
      if (vars.previousData) {
        const label = (vars.previousData.activityType as string) || "attività";
        pushUndo({
          type: "create",
          description: `Annulla eliminazione ${label}`,
          data: vars.previousData,
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  async function handleUndo() {
    if (undoStack.length === 0) return;
    const [entry, ...rest] = undoStack;
    setUndoStack(rest);
    try {
      if (entry.type === "delete") {
        await apiRequest("DELETE", `/api/assignments/${entry.assignmentId}`);
        queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
        queryClient.invalidateQueries({ queryKey: ["/api/assignments/material-sigla"] });
        toast({ title: "Annullato" });
      } else if (entry.type === "create") {
        await apiRequest("POST", "/api/assignments", entry.data);
        queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
        queryClient.invalidateQueries({ queryKey: ["/api/assignments/material-sigla"] });
        toast({ title: "Annullato" });
      } else if (entry.type === "update") {
        await apiRequest("PATCH", `/api/assignments/${entry.assignmentId}`, entry.previousData);
        queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
        queryClient.invalidateQueries({ queryKey: ["/api/assignments/material-sigla"] });
        toast({ title: "Annullato" });
      } else if (entry.type === "warehouseBalance") {
        if (entry.previousValue !== null) {
          await apiRequest("POST", "/api/proxit/warehouse-balances", {
            warehouseType: entry.warehouseType,
            date: entry.date,
            value: entry.previousValue,
          });
        } else {
          await apiRequest("DELETE", "/api/proxit/warehouse-balances", {
            warehouseType: entry.warehouseType,
            date: entry.date,
          });
        }
        queryClient.invalidateQueries({ queryKey: ["/api/proxit/warehouse-balances"] });
        toast({ title: "Annullato" });
      }
    } catch (err) {
      toast({ title: "Errore durante l'annullamento", variant: "destructive" });
      setUndoStack((prev) => [entry, ...prev]);
    }
  }

  const createTeamMutation = useMutation({
    mutationFn: async (data: { name: string; paese?: string; color: string }) => apiRequest("POST", "/api/teams", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      setShowTeamDialog(false);
      toast({ title: "Squadra creata" });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const updateTeamMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name: string; paese?: string; color: string } }) =>
      apiRequest("PATCH", `/api/teams/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      setShowTeamDialog(false);
      setEditingTeam(null);
      toast({ title: "Squadra aggiornata" });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/teams/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "Squadra eliminata" });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const createDriverMutation = useMutation({
    mutationFn: async (data: { name: string; phone?: string }) => apiRequest("POST", "/api/drivers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drivers"] });
      setShowDriverDialog(false);
      toast({ title: "Autista creato" });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const updateDriverMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name: string; phone?: string } }) =>
      apiRequest("PATCH", `/api/drivers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drivers"] });
      setShowDriverDialog(false);
      setEditingDriver(null);
      toast({ title: "Autista aggiornato" });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const deleteDriverMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/drivers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drivers"] });
      toast({ title: "Autista eliminato" });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const createVehicleMutation = useMutation({
    mutationFn: async (data: { name: string; plate?: string; type?: string }) =>
      apiRequest("POST", "/api/vehicles", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      setShowVehicleDialog(false);
      toast({ title: "Mezzo creato" });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const updateVehicleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name: string; plate?: string; type?: string } }) =>
      apiRequest("PATCH", `/api/vehicles/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      setShowVehicleDialog(false);
      setEditingVehicle(null);
      toast({ title: "Mezzo aggiornato" });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const deleteVehicleMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/vehicles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      toast({ title: "Mezzo eliminato" });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const createTeamMemberMutation = useMutation({
    mutationFn: async (data: { teamId: string; name: string }) => apiRequest("POST", "/api/team-members", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const updateTeamMemberMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; isActive?: boolean } }) =>
      apiRequest("PATCH", `/api/team-members/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const deleteTeamMemberMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/team-members/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const createWorkerMutation = useMutation({
    mutationFn: async (data: { name: string; isCaposquadra: boolean; color?: string; sortOrder?: number }) =>
      apiRequest("POST", "/api/workers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workers"] });
      toast({ title: "Persona aggiunta" });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const updateWorkerMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; isCaposquadra?: boolean; isActive?: boolean; color?: string; sortOrder?: number; isInternal?: boolean; defaultCapoId?: string | null; city?: string | null } }) =>
      apiRequest("PATCH", `/api/workers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workers"] });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const reorderWorkersMutation = useMutation({
    mutationFn: async ({ idA, idB }: { idA: string; idB: string }) =>
      apiRequest("POST", "/api/workers/reorder", { idA, idB }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workers"] });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const deleteWorkerMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/workers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workers"] });
      toast({ title: "Persona eliminata" });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const updateWorkerAssignmentsMutation = useMutation({
    mutationFn: async ({ id, workerAssignments }: { id: string; workerAssignments: Record<string, Record<string, string[]>> }) =>
      apiRequest("PATCH", `/api/daily-assignments/${id}/worker-assignments`, { workerAssignments }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const updateExternalCountsMutation = useMutation({
    mutationFn: async ({ id, externalWorkerCounts }: { id: string; externalWorkerCounts: Record<string, Record<string, number>> }) =>
      apiRequest("PATCH", `/api/assignments/${id}/external-counts`, { externalWorkerCounts }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const updateExternalContactedMutation = useMutation({
    mutationFn: async ({ id, externalTeamContacted }: { id: string; externalTeamContacted: Record<string, Record<string, boolean>> }) =>
      apiRequest("PATCH", `/api/assignments/${id}/external-contacted`, { externalTeamContacted }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const updateTeamDepartureTimesMutation = useMutation({
    mutationFn: async ({ id, teamDepartureTimes }: { id: string; teamDepartureTimes: Record<string, Record<string, string>> }) =>
      apiRequest("PATCH", `/api/assignments/${id}/team-departure-times`, { teamDepartureTimes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const updateTeamFreeNumbersMutation = useMutation({
    mutationFn: async ({ id, teamFreeNumbers }: { id: string; teamFreeNumbers: Record<string, Record<string, number>> }) =>
      apiRequest("PATCH", `/api/assignments/${id}/team-free-numbers`, { teamFreeNumbers }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const updateTeamNotesMutation = useMutation({
    mutationFn: async ({ id, teamNotes }: { id: string; teamNotes: Record<string, Record<string, string>> }) =>
      apiRequest("PATCH", `/api/assignments/${id}/team-notes`, { teamNotes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const updateTeamNoteColorsMutation = useMutation({
    mutationFn: async ({ id, teamNoteColors }: { id: string; teamNoteColors: Record<string, Record<string, string>> }) =>
      apiRequest("PATCH", `/api/assignments/${id}/team-note-colors`, { teamNoteColors }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const updateAssignmentMemberAdjustmentsMutation = useMutation({
    mutationFn: async ({ id, memberAdjustments }: { id: string; memberAdjustments: Array<{ memberId: string; action: "remove" | "move"; toTeamId?: string }> }) =>
      apiRequest("PATCH", `/api/assignments/${id}`, { memberAdjustments }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const reorderAssignmentMutation = useMutation({
    mutationFn: async ({ idA, idB }: { idA: string; idB: string }) =>
      apiRequest("PATCH", "/api/assignments/reorder", { idA, idB }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const moveAssignmentMutation = useMutation({
    mutationFn: async ({ id, toIndex, targetDate, prePadding }: { id: string; toIndex: number; targetDate?: string; prePadding?: number }) =>
      apiRequest("PATCH", "/api/assignments/reorder", { id, toIndex, targetDate, prePadding }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const updatePrePaddingMutation = useMutation({
    mutationFn: async ({ id, delta }: { id: string; delta: number }) =>
      apiRequest("PATCH", `/api/assignments/${id}/pre-padding`, { delta }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  function openNewAssignment(dateStr?: string) {
    setEditingAssignment(null);
    setPreselectedDate(dateStr || null);
    setShowAssignmentDialog(true);
  }

  function openEditAssignment(assignment: DailyAssignment) {
    setEditingAssignment(assignment);
    setPreselectedDate(null);
    setShowAssignmentDialog(true);
  }

  const loadMorePast = useCallback(() => {
    setRangeStart((prev) => addDays(prev, -LOAD_MORE_DAYS));
  }, []);

  const loadMoreFuture = useCallback(() => {
    setRangeEnd((prev) => addDays(prev, LOAD_MORE_DAYS));
  }, []);

  function goToday() {
    setRangeStart(addDays(getMonday(new Date()), -INITIAL_PAST_DAYS));
    setRangeEnd(addDays(getMonday(new Date()), INITIAL_FUTURE_DAYS));
    setCenterTodayRequest((n) => n + 1);
  }

  return (
    <DashboardLayout user={user || undefined} fullWidth>
      {lockHolder && (
        <div
          data-testid="banner-proxit-lock"
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium ${
            hasLock
              ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200"
              : "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200"
          }`}
        >
          {hasLock ? (
            <span data-testid="text-lock-editing">Stai modificando</span>
          ) : (
            <span data-testid="text-lock-readonly">
              Sola lettura — sta modificando {lockHolder.firstName} {lockHolder.lastName}
            </span>
          )}
        </div>
      )}
      {!lockHolder && (
        <div
          data-testid="banner-proxit-no-controller"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400"
        >
          <span data-testid="text-lock-no-controller">Nessun controller attivo — sola lettura</span>
        </div>
      )}
      <div className="space-y-0">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 shrink-0">
              <CalendarDays className="w-5 h-5 text-primary" />
              <h1 className="text-xl font-bold" data-testid="text-proxit-title">Proxit</h1>
            </div>
            {activeTab === "pianificazione" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToday}
                  data-testid="button-today"
                >
                  <CalendarDays className="w-4 h-4 mr-1" />
                  Oggi
                </Button>
                <span className="text-sm font-medium text-muted-foreground" data-testid="text-week-range">
                  {formatDateRange(rangeStart, numDays)}
                </span>
                {assignmentsFetching && !assignmentsLoading && (
                  <span className="w-4 h-4 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin inline-block" data-testid="spinner-assignments-loading" />
                )}
              </>
            )}
            <div className="flex-1" />
            {activeTab === "pianificazione" && (
              <>
                <div className="w-64">
                  <ProjectCombobox
                    projects={projectsData}
                    value={selectedProjectId || "_none"}
                    onChange={(id) => setSelectedProjectId(id === "_none" ? "" : id)}
                  />
                </div>
                {selectedProjectId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCronistoriaModal(true)}
                    data-testid="button-cronistoria-modal"
                    className="gap-2"
                  >
                    <History className="w-4 h-4" />
                    Cronistoria
                  </Button>
                )}
              </>
            )}
            <TabsList data-testid="tabs-proxit-main">
              <TabsTrigger value="pianificazione" data-testid="tab-pianificazione">Pianificazione</TabsTrigger>
              <TabsTrigger value="risorse" data-testid="tab-risorse">Risorse</TabsTrigger>
            </TabsList>
            {activeTab === "pianificazione" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUndo}
                  disabled={undoStack.length === 0 || !hasLock}
                  title={undoStack.length > 0 ? undoStack[0].description : "Nessuna azione da annullare"}
                  data-testid="button-undo"
                  className="gap-2"
                >
                  <Undo2 className="w-4 h-4" />
                  Indietro
                </Button>
                <Button onClick={() => openNewAssignment()} data-testid="button-nuova-attivita" disabled={!hasLock}>
                  <Plus className="w-4 h-4 mr-2" />
                  Nuova Attività
                </Button>
              </>
            )}
          </div>

          <TabsContent value="pianificazione" className="mt-1 space-y-3">
            {assignmentsLoading ? (
              <Card className="p-6">
                <Skeleton className="h-64 w-full" />
              </Card>
            ) : null}
            <div style={{ display: assignmentsLoading ? "none" : undefined }}>
              <SpreadsheetGrid
                assignments={filteredAssignments}
                allAssignments={assignments}
                weekDays={weekDays}
                driversMap={driversMap}
                vehiclesMap={vehiclesMap}
                projectsMap={projectsMap}
                workers={workersData}
                drivers={driversData}
                vehicles={vehiclesData}
                warehouseBalances={warehouseBalancesData}
                onUpsertWarehouseBalance={(warehouseType, date, value) => {
                  const existing = warehouseBalancesData.find(
                    (b) => b.warehouseType === warehouseType && (b.date === date || (!b.date && !date))
                  );
                  const previousValue = existing ? parseFloat(existing.value) : null;
                  upsertWarehouseBalanceMutation.mutate({ warehouseType, date, value, previousValue });
                }}
                onEditAssignment={openEditAssignment}
                onAddAssignment={(dateStr) => openNewAssignment(dateStr)}
                onLoadMorePast={loadMorePast}
                onLoadMoreFuture={loadMoreFuture}
                onPatchAssignment={(assignmentId, data) => {
                  const prevAssignment = assignments.find((a) => a.id === assignmentId);
                  updateAssignmentMutation.mutate({
                    id: assignmentId,
                    data,
                    previousData: prevAssignment ? { ...prevAssignment } : undefined,
                  });
                }}
                onReorderAssignment={(idA, idB) => {
                  reorderAssignmentMutation.mutate({ idA, idB });
                }}
                onMoveAssignment={(id, toIndex, targetDate, prePadding) => {
                  moveAssignmentMutation.mutate({ id, toIndex, targetDate, prePadding });
                }}
                onUpdateExternalCounts={(assignmentId, externalWorkerCounts) => {
                  updateExternalCountsMutation.mutate({ id: assignmentId, externalWorkerCounts });
                }}
                onUpdateExternalContacted={(assignmentId, externalTeamContacted) => {
                  updateExternalContactedMutation.mutate({ id: assignmentId, externalTeamContacted });
                }}
                onUpdateTeamDepartureTimes={(assignmentId, teamDepartureTimes) => {
                  updateTeamDepartureTimesMutation.mutate({ id: assignmentId, teamDepartureTimes });
                }}
                onUpdateTeamFreeNumbers={(assignmentId, teamFreeNumbers) => {
                  updateTeamFreeNumbersMutation.mutate({ id: assignmentId, teamFreeNumbers });
                }}
                onUpdateTeamNotes={(assignmentId, teamNotes) => {
                  updateTeamNotesMutation.mutate({ id: assignmentId, teamNotes });
                }}
                onUpdateTeamNoteColors={(assignmentId, teamNoteColors) => {
                  updateTeamNoteColorsMutation.mutate({ id: assignmentId, teamNoteColors });
                }}
                onUpdateWorkerAssignments={(assignmentId, workerAssignments) => {
                  updateWorkerAssignmentsMutation.mutate({ id: assignmentId, workerAssignments });
                }}
                onUpdatePrePadding={(assignmentId, delta) => {
                  updatePrePaddingMutation.mutate({ id: assignmentId, delta });
                }}
                readOnly={!hasLock}
                centerTodayRequest={centerTodayRequest}
              />
            </div>
          </TabsContent>

          <TabsContent value="risorse" className="mt-4">
            <Tabs value={resourceTab} onValueChange={setResourceTab}>
              <TabsList data-testid="tabs-risorse">
                <TabsTrigger value="persone" data-testid="tab-persone">
                  <Users className="w-4 h-4 mr-1" />
                  Persone
                </TabsTrigger>
                <TabsTrigger value="autisti" data-testid="tab-autisti">
                  <User className="w-4 h-4 mr-1" />
                  Autisti
                </TabsTrigger>
                <TabsTrigger value="mezzi" data-testid="tab-mezzi">
                  <Truck className="w-4 h-4 mr-1" />
                  Mezzi
                </TabsTrigger>
              </TabsList>

              <TabsContent value="persone" className="mt-4">
                <PersoneTab
                  workers={workersData}
                  readOnly={!hasLock}
                  onAdd={(name, isCaposquadra) => {
                    const palette = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#14B8A6","#F97316","#6366F1","#84CC16"];
                    const usedColors = new Set(workersData.map(w => w.color).filter(Boolean));
                    const autoColor = palette.find(c => !usedColors.has(c)) ?? palette[workersData.length % palette.length];
                    const nextSortOrder = workersData.length > 0 ? Math.max(...workersData.map(w => w.sortOrder ?? 0)) + 1 : 0;
                    createWorkerMutation.mutate({ name, isCaposquadra, color: autoColor, sortOrder: nextSortOrder });
                  }}
                  onToggleCaposquadra={(id, val) => updateWorkerMutation.mutate({ id, data: { isCaposquadra: val } })}
                  onToggleInternal={(id, val) => updateWorkerMutation.mutate({ id, data: { isInternal: val } })}
                  onSetDefaultCapo={(id, capoId) => updateWorkerMutation.mutate({ id, data: { defaultCapoId: capoId } })}
                  onToggleActive={(id, val) => updateWorkerMutation.mutate({ id, data: { isActive: val } })}
                  onDelete={(id) => deleteWorkerMutation.mutate(id)}
                  onRename={(id, name) => updateWorkerMutation.mutate({ id, data: { name } })}
                  onColorChange={(id, color) => updateWorkerMutation.mutate({ id, data: { color } })}
                  onMoveUp={(id) => {
                    const capos = workersData.filter(w => w.isCaposquadra);
                    const idx = capos.findIndex(w => w.id === id);
                    if (idx <= 0) return;
                    reorderWorkersMutation.mutate({ idA: id, idB: capos[idx - 1].id });
                  }}
                  onMoveDown={(id) => {
                    const capos = workersData.filter(w => w.isCaposquadra);
                    const idx = capos.findIndex(w => w.id === id);
                    if (idx < 0 || idx >= capos.length - 1) return;
                    reorderWorkersMutation.mutate({ idA: id, idB: capos[idx + 1].id });
                  }}
                  onUpdateCity={(id, city) => updateWorkerMutation.mutate({ id, data: { city } })}
                />
              </TabsContent>

              <TabsContent value="autisti" className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <h2 className="text-lg font-semibold">Autisti</h2>
                  <Button
                    onClick={() => { setEditingDriver(null); setShowDriverDialog(true); }}
                    data-testid="button-add-driver"
                    disabled={!hasLock}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Nuovo Autista
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {driversData.map((driver) => (
                    <Card key={driver.id} className="p-4" data-testid={`card-driver-${driver.id}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium truncate" data-testid={`text-driver-name-${driver.id}`}>
                            {driver.name}
                          </p>
                          {driver.phone && (
                            <p className="text-xs text-muted-foreground" data-testid={`text-driver-phone-${driver.id}`}>
                              {driver.phone}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { setEditingDriver(driver); setShowDriverDialog(true); }}
                            data-testid={`button-edit-driver-${driver.id}`}
                            disabled={!hasLock}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteDriverMutation.mutate(driver.id)}
                            data-testid={`button-delete-driver-${driver.id}`}
                            disabled={!hasLock || deleteDriverMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                  {driversData.length === 0 && (
                    <p className="text-sm text-muted-foreground col-span-full" data-testid="text-no-drivers">
                      Nessun autista. Aggiungi il primo autista per iniziare.
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="mezzi" className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <h2 className="text-lg font-semibold">Mezzi</h2>
                  <Button
                    onClick={() => { setEditingVehicle(null); setShowVehicleDialog(true); }}
                    data-testid="button-add-vehicle"
                    disabled={!hasLock}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Nuovo Mezzo
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {vehiclesData.map((vehicle) => (
                    <Card key={vehicle.id} className="p-4" data-testid={`card-vehicle-${vehicle.id}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium truncate" data-testid={`text-vehicle-name-${vehicle.id}`}>
                            {vehicle.name}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {vehicle.plate && <span data-testid={`text-vehicle-plate-${vehicle.id}`}>{vehicle.plate}</span>}
                            {vehicle.type && <span data-testid={`text-vehicle-type-${vehicle.id}`}>{vehicle.type}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { setEditingVehicle(vehicle); setShowVehicleDialog(true); }}
                            data-testid={`button-edit-vehicle-${vehicle.id}`}
                            disabled={!hasLock}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteVehicleMutation.mutate(vehicle.id)}
                            data-testid={`button-delete-vehicle-${vehicle.id}`}
                            disabled={!hasLock || deleteVehicleMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                  {vehiclesData.length === 0 && (
                    <p className="text-sm text-muted-foreground col-span-full" data-testid="text-no-vehicles">
                      Nessun mezzo. Aggiungi il primo mezzo per iniziare.
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>

      <AssignmentDialog
        open={showAssignmentDialog}
        onOpenChange={(open) => {
          setShowAssignmentDialog(open);
          if (!open) {
            setEditingAssignment(null);
            setPreselectedDate(null);
          }
        }}
        assignment={editingAssignment}
        preselectedDate={preselectedDate}
        workers={workersData}
        drivers={driversData}
        vehicles={vehiclesData}
        projects={projectsData}
        allAssignments={assignments.filter((a) => !a.isDraft)}
        onSave={(data) => {
          if (editingAssignment) {
            updateAssignmentMutation.mutate({ id: editingAssignment.id, data, isDraft: false, previousData: { ...editingAssignment } });
          } else {
            createAssignmentMutation.mutate({ data, isDraft: false });
          }
        }}
        onSaveDraft={(data) => {
          if (editingAssignment) {
            updateAssignmentMutation.mutate({ id: editingAssignment.id, data, isDraft: true, previousData: { ...editingAssignment } });
          } else {
            createAssignmentMutation.mutate({ data, isDraft: true });
          }
        }}
        onDelete={(id) => setShowDeleteConfirm(id)}
        isPending={createAssignmentMutation.isPending || updateAssignmentMutation.isPending}
        readOnly={!hasLock}
      />

      <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <DialogContent data-testid="dialog-delete-confirm">
          <DialogHeader>
            <DialogTitle>Elimina Attività</DialogTitle>
            <DialogDescription>
              Sei sicuro di voler eliminare questa attività? L'azione non può essere annullata.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)} data-testid="button-cancel-delete">
              Annulla
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (showDeleteConfirm) {
                  const prevAssignment = assignments.find((a) => a.id === showDeleteConfirm);
                  deleteAssignmentMutation.mutate({
                    id: showDeleteConfirm,
                    previousData: prevAssignment ? { ...prevAssignment } : undefined,
                  });
                }
              }}
              disabled={deleteAssignmentMutation.isPending}
              data-testid="button-confirm-delete"
            >
              Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TeamDialog
        open={showTeamDialog}
        onOpenChange={(open) => { setShowTeamDialog(open); if (!open) setEditingTeam(null); }}
        team={editingTeam}
        onSave={(data) => {
          if (editingTeam) {
            updateTeamMutation.mutate({ id: editingTeam.id, data });
          } else {
            createTeamMutation.mutate(data);
          }
        }}
        isPending={createTeamMutation.isPending || updateTeamMutation.isPending}
      />

      <DriverDialog
        open={showDriverDialog}
        onOpenChange={(open) => { setShowDriverDialog(open); if (!open) setEditingDriver(null); }}
        driver={editingDriver}
        onSave={(data) => {
          if (editingDriver) {
            updateDriverMutation.mutate({ id: editingDriver.id, data });
          } else {
            createDriverMutation.mutate(data);
          }
        }}
        isPending={createDriverMutation.isPending || updateDriverMutation.isPending}
      />

      <VehicleDialog
        open={showVehicleDialog}
        onOpenChange={(open) => { setShowVehicleDialog(open); if (!open) setEditingVehicle(null); }}
        vehicle={editingVehicle}
        onSave={(data) => {
          if (editingVehicle) {
            updateVehicleMutation.mutate({ id: editingVehicle.id, data });
          } else {
            createVehicleMutation.mutate(data);
          }
        }}
        isPending={createVehicleMutation.isPending || updateVehicleMutation.isPending}
      />

      {selectedProjectId && (
        <Dialog open={showCronistoriaModal} onOpenChange={setShowCronistoriaModal}>
          <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0" data-testid="dialog-cronistoria">
            <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <History className="w-5 h-5 text-secondary" />
                Cronistoria — {projectsMap.get(selectedProjectId)?.clientName ?? "Progetto"}
              </DialogTitle>
              {projectsMap.get(selectedProjectId)?.siteAddress && (
                <DialogDescription>
                  {projectsMap.get(selectedProjectId)?.siteAddress}
                </DialogDescription>
              )}
            </DialogHeader>
            <div className="overflow-y-auto flex-1">
              <CronistoriaContent projectId={selectedProjectId} />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </DashboardLayout>
  );
}

const TEAM_NOTE_PALETTE = [
  { label: "Giallo", value: "#FEF08A" },
  { label: "Arancio", value: "#FED7AA" },
  { label: "Rosso", value: "#FECACA" },
  { label: "Verde", value: "#BBF7D0" },
  { label: "Azzurro", value: "#BAE6FD" },
  { label: "Grigio", value: "#E5E7EB" },
  { label: "Nessuno", value: "" },
];

function TeamNoteField({
  noteKey,
  initialNote,
  initialColor,
  onSave,
  onSaveColor,
  capoId,
  dateStr,
}: {
  noteKey: string;
  initialNote: string;
  initialColor: string;
  onSave: (val: string) => void;
  onSaveColor: (color: string) => void;
  capoId: string;
  dateStr: string;
}) {
  const [open, setOpen] = useState(!!initialNote);
  const [value, setValue] = useState(initialNote);
  const [color, setColor] = useState(initialColor);
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setValue(initialNote);
    setOpen(!!initialNote);
    setColor(initialColor);
  }, [noteKey, initialNote, initialColor]);

  useEffect(() => {
    if (open && textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  }, [open]);

  useEffect(() => {
    if (!editing) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setEditing(false);
        const trimmed = value.trim();
        onSave(trimmed);
        if (!trimmed) setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [editing, value]);

  function handleToggle() {
    if (open && !editing) {
      setEditing(true);
      setTimeout(() => {
        if (textareaRef.current) textareaRef.current.focus();
      }, 0);
    } else if (open && editing) {
      setEditing(false);
      onSave(value.trim());
      if (!value.trim()) setOpen(false);
    } else {
      setOpen(true);
      setEditing(true);
      setTimeout(() => {
        if (textareaRef.current) textareaRef.current.focus();
      }, 0);
    }
  }

  function handleBlur(e: React.FocusEvent) {
    if (containerRef.current && containerRef.current.contains(e.relatedTarget as Node)) {
      return;
    }
    const trimmed = value.trim();
    onSave(trimmed);
    setEditing(false);
    if (!trimmed) setOpen(false);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = e.target.scrollHeight + "px";
  }

  function handleColorSelect(colorValue: string) {
    setColor(colorValue);
    onSaveColor(colorValue);
  }

  return (
    <div
      ref={containerRef}
      className="w-full flex flex-col items-center mb-0.5 rounded"
      style={{ backgroundColor: color || undefined }}
    >
      <button
        type="button"
        onClick={handleToggle}
        className="text-[10px] text-muted-foreground hover:text-foreground leading-none px-1 py-0.5 rounded hover:bg-muted transition-colors"
        data-testid={`team-note-toggle-${capoId}-${dateStr}`}
        title={editing ? "Chiudi modifica" : open ? "Modifica nota" : "Aggiungi nota"}
      >
        {open ? "−" : "+"}
      </button>
      {open && editing && (
        <>
          <div className="flex gap-0.5 mb-0.5 flex-wrap justify-center" data-testid={`team-note-palette-${capoId}-${dateStr}`}>
            {TEAM_NOTE_PALETTE.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.label}
                onClick={() => handleColorSelect(c.value)}
                data-testid={`team-note-color-${capoId}-${dateStr}-${c.label}`}
                className="w-3 h-3 rounded-full border border-gray-300 flex-shrink-0 transition-transform hover:scale-110"
                style={{
                  backgroundColor: c.value || "#ffffff",
                  outline: color === c.value ? "2px solid #6366f1" : undefined,
                  outlineOffset: "1px",
                }}
              />
            ))}
          </div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onBlur={handleBlur}
            rows={1}
            className="w-full text-[10px] bg-transparent border-none outline-none resize-none overflow-hidden leading-snug text-center p-0 m-0 font-bold"
            style={{ minHeight: "16px" }}
            data-testid={`team-note-textarea-${capoId}-${dateStr}`}
          />
        </>
      )}
      {open && !editing && value && (
        <span
          className="text-[10px] font-bold leading-snug text-center w-full px-0.5 break-words cursor-pointer"
          onClick={() => {
            setEditing(true);
            setTimeout(() => {
              if (textareaRef.current) textareaRef.current.focus();
            }, 0);
          }}
          data-testid={`team-note-display-${capoId}-${dateStr}`}
        >
          {value}
        </span>
      )}
    </div>
  );
}

function GridNoteField({
  assignmentId,
  fieldKey,
  initialNote,
  initialColor,
  onSave,
  onSaveColor,
}: {
  assignmentId: string;
  fieldKey?: string;
  initialNote: string;
  initialColor: string;
  onSave: (val: string) => void;
  onSaveColor: (color: string) => void;
}) {
  const [value, setValue] = useState(initialNote);
  const [color, setColor] = useState(initialColor);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  const savedRef = useRef(false);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    setValue(initialNote);
    setColor(initialColor);
  }, [assignmentId, initialNote, initialColor]);

  useEffect(() => {
    if (!focused) return;
    savedRef.current = false;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
        if (!savedRef.current) {
          savedRef.current = true;
          onSave(valueRef.current.trim());
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [focused]);

  function handleBlur(e: React.FocusEvent) {
    if (containerRef.current && containerRef.current.contains(e.relatedTarget as Node)) {
      return;
    }
    setFocused(false);
    if (!savedRef.current) {
      savedRef.current = true;
      onSave(value.trim());
    }
  }

  function handleColorSelect(colorValue: string) {
    if (colorValue === color) {
      inputRef.current?.focus();
      return;
    }
    setColor(colorValue);
    onSaveColor(colorValue);
    inputRef.current?.focus();
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 min-w-0 flex flex-col"
      style={{ backgroundColor: color || undefined }}
    >
      {focused && (
        <div className="flex gap-0.5 pt-0.5 px-0.5 flex-wrap" data-testid={`grid-note-palette-${fieldKey ?? assignmentId}`}>
          {TEAM_NOTE_PALETTE.map((c) => (
            <button
              key={c.value}
              type="button"
              title={c.label}
              onClick={() => handleColorSelect(c.value)}
              data-testid={`grid-note-color-${fieldKey ?? assignmentId}-${c.label}`}
              className="w-3 h-3 rounded-full border border-gray-300 flex-shrink-0 transition-transform hover:scale-110"
              style={{
                backgroundColor: c.value || "#ffffff",
                outline: color === c.value ? "2px solid #6366f1" : undefined,
                outlineOffset: "1px",
              }}
            />
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        type="text"
        className="w-full bg-transparent border-0 outline-none text-xs placeholder:text-muted-foreground/40 px-0.5 font-bold"
        placeholder="..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        data-testid={`input-gridnote-${fieldKey ?? assignmentId}`}
      />
    </div>
  );
}


type WarehouseBalanceItem = {
  id: string;
  companyId: string;
  warehouseType: "VILLA" | "PL" | "EP";
  date: string | null;
  value: string;
};

function SpreadsheetGrid({
  assignments,
  allAssignments,
  weekDays,
  driversMap,
  vehiclesMap,
  projectsMap,
  workers,
  drivers,
  vehicles,
  warehouseBalances,
  onUpsertWarehouseBalance,
  onEditAssignment,
  onAddAssignment,
  onLoadMorePast,
  onLoadMoreFuture,
  onPatchAssignment,
  onReorderAssignment,
  onMoveAssignment,
  onUpdateWorkerAssignments,
  onUpdateExternalCounts,
  onUpdateExternalContacted,
  onUpdateTeamDepartureTimes,
  onUpdateTeamFreeNumbers,
  onUpdateTeamNotes,
  onUpdateTeamNoteColors,
  onUpdatePrePadding,
  readOnly,
  centerTodayRequest,
}: {
  assignments: DailyAssignment[];
  allAssignments: DailyAssignment[];
  weekDays: Date[];
  driversMap: Map<string, Driver>;
  vehiclesMap: Map<string, Vehicle>;
  projectsMap: Map<string, EnrichedProject>;
  workers: Worker[];
  drivers: Driver[];
  vehicles: Vehicle[];
  warehouseBalances: WarehouseBalanceItem[];
  onUpsertWarehouseBalance: (warehouseType: "VILLA" | "PL" | "EP", date: string | null, value: number) => void;
  onEditAssignment: (a: DailyAssignment) => void;
  onAddAssignment: (dateStr: string) => void;
  onLoadMorePast: () => void;
  onLoadMoreFuture: () => void;
  onPatchAssignment: (assignmentId: string, data: Record<string, unknown>) => void;
  onReorderAssignment: (idA: string, idB: string) => void;
  onMoveAssignment: (id: string, toIndex: number, targetDate?: string, prePadding?: number) => void;
  onUpdateWorkerAssignments: (assignmentId: string, workerAssignments: Record<string, Record<string, string[]>>) => void;
  onUpdateExternalCounts: (assignmentId: string, externalWorkerCounts: Record<string, Record<string, number>>) => void;
  onUpdateExternalContacted: (assignmentId: string, externalTeamContacted: Record<string, Record<string, boolean>>) => void;
  onUpdateTeamDepartureTimes: (assignmentId: string, teamDepartureTimes: Record<string, Record<string, string>>) => void;
  onUpdateTeamFreeNumbers: (assignmentId: string, teamFreeNumbers: Record<string, Record<string, number>>) => void;
  onUpdateTeamNotes: (assignmentId: string, teamNotes: Record<string, Record<string, string>>) => void;
  onUpdateTeamNoteColors: (assignmentId: string, teamNoteColors: Record<string, Record<string, string>>) => void;
  onUpdatePrePadding: (assignmentId: string, delta: number) => void;
  readOnly?: boolean;
  centerTodayRequest?: number;
}) {
  const DRAFT_COL_W = 30;
  const today = new Date();
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLTableRowElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const barOverlaysRef = useRef<HTMLDivElement>(null);
  const hasScrolledToToday = useRef(false);
  const isLoadingMore = useRef(false);
  const prevScrollHeightRef = useRef<number | null>(null);
  const weekDaysCountRef = useRef(weekDays.length);

  const [moveToDayModal, setMoveToDayModal] = useState<{ assignmentId: string; currentDateStr: string } | null>(null);

  useEffect(() => {
    if (!hasScrolledToToday.current && todayRef.current) {
      todayRef.current.scrollIntoView({ block: "start", behavior: "auto" });
      hasScrolledToToday.current = true;
    }
  }, [weekDays]);

  useEffect(() => {
    if (!centerTodayRequest) return;
    const container = scrollContainerRef.current;
    const todayRow = todayRef.current;
    if (container && todayRow) {
      const containerRect = container.getBoundingClientRect();
      const rowRect = todayRow.getBoundingClientRect();
      const offset = rowRect.top - containerRect.top - containerRect.height / 2 + rowRect.height / 2;
      container.scrollTop += offset;
    }
  }, [centerTodayRequest]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const newCount = weekDays.length;
    const countChanged = newCount !== weekDaysCountRef.current;
    weekDaysCountRef.current = newCount;

    if (container && prevScrollHeightRef.current !== null) {
      const diff = container.scrollHeight - prevScrollHeightRef.current;
      if (diff > 0) {
        container.scrollTop += diff;
      }
      prevScrollHeightRef.current = null;
      isLoadingMore.current = false;
    } else if (countChanged && isLoadingMore.current) {
      isLoadingMore.current = false;
    }
  }, [weekDays.length]);

  useEffect(() => {
    const topEl = topSentinelRef.current;
    const bottomEl = bottomSentinelRef.current;
    if (!topEl || !bottomEl) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isLoadingMore.current) {
            if (entry.target === topEl) {
              const container = scrollContainerRef.current;
              if (container) {
                prevScrollHeightRef.current = container.scrollHeight;
              }
              isLoadingMore.current = true;
              onLoadMorePast();
            } else if (entry.target === bottomEl) {
              isLoadingMore.current = true;
              onLoadMoreFuture();
            }
          }
        });
      },
      { threshold: 0.1 }
    );
    observer.observe(topEl);
    observer.observe(bottomEl);
    return () => observer.disconnect();
  }, [onLoadMorePast, onLoadMoreFuture]);

  const DAY_NAMES_SHORT = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
  const MONTH_NAMES_SHORT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
  const ROW_H = 28;
  const HOLIDAY_ROW_H = ROW_H / 2;
  const TEAM_BAR_W = 30;
  const TEAM_WORKERS_W = 70;
  const TEAM_COL_W = TEAM_BAR_W + TEAM_WORKERS_W;
  const WAREHOUSE_COL_W = 50;

  const capisquadra = useMemo(() => workers.filter((w) => w.isCaposquadra && w.isActive), [workers]);

  // ---- Warehouse inline edit state ----
  const [editingWarehouseCell, setEditingWarehouseCell] = useState<{ dateStr: string; wType: "VILLA" | "PL" | "EP"; rowKey: string } | null>(null);
  const [editingWarehouseValue, setEditingWarehouseValue] = useState<string>("");
  const [warehouseColsCollapsed, setWarehouseColsCollapsed] = useState(false);

  // ---- Compute warehouse delta and running totals for every date in flatRows ----
  // Delta: +qty for ritiro/smontaggio of matching materialType, -qty for consegna of matching materialType
  // Running total: starts from last sunday/holiday override before the visible range, else 0
  const CONSEGNA_ACTIVITY_TYPES = new Set(["CONSEGNA", "CONSEGNA_COMBINATO", "MONTAGGIO", "INTEGRAZIONE", "INTEGRAZIONE_COMBINATO"]);
  const RITIRO_SMONTAGGIO_ACTIVITY_TYPES = new Set(["RITIRO", "RITIRO_COMBINATO", "SMONTAGGIO", "ESUBERO", "ESUBERO_COMBINATO"]);

  // Get sunday/holiday override for a given date and warehouse type
  const getSundayOverride = useCallback((wt: "VILLA" | "PL" | "EP", dateStr: string) => {
    const b = warehouseBalances.find(b => b.warehouseType === wt && b.date !== null && b.date.substring(0, 10) === dateStr);
    return b ? parseFloat(b.value) : null;
  }, [warehouseBalances]);

  const { data: materialSiglaData = {} } = useQuery<Record<string, string>>({
    queryKey: ["/api/assignments/material-sigla"],
  });

  const projectMaterialMap = useMemo(() => {
    return new Map<string, string>(Object.entries(materialSiglaData));
  }, [materialSiglaData]);
  const workersMap = useMemo(() => {
    const m = new Map<string, Worker>();
    workers.forEach((w) => m.set(w.id, w));
    return m;
  }, [workers]);

  const draftAssignments = useMemo(() => {
    return assignments.filter((a) => a.isDraft === true && MONT_SMONT_TYPES.includes(a.activityType));
  }, [assignments]);

  const draftColumns = useMemo(() => {
    const sorted = [...draftAssignments].sort((a, b) => {
      const aStart = parseDateStr(a.date);
      const bStart = parseDateStr(b.date);
      return aStart < bStart ? -1 : aStart > bStart ? 1 : 0;
    });
    const columns: (typeof draftAssignments)[] = [];
    for (const draft of sorted) {
      const draftStart = parseDateStr(draft.date);
      const draftEnd = draft.endDate ? parseDateStr(draft.endDate) : draftStart;
      let placed = false;
      for (const col of columns) {
        const lastInCol = col[col.length - 1];
        const lastEnd = lastInCol.endDate ? parseDateStr(lastInCol.endDate) : parseDateStr(lastInCol.date);
        if (draftStart > lastEnd) {
          col.push(draft);
          placed = true;
          break;
        }
        const hasOverlap = col.some((existing) => {
          const eStart = parseDateStr(existing.date);
          const eEnd = existing.endDate ? parseDateStr(existing.endDate) : eStart;
          return draftStart <= eEnd && draftEnd >= eStart;
        });
        if (!hasOverlap) {
          col.push(draft);
          placed = true;
          break;
        }
      }
      if (!placed) {
        columns.push([draft]);
      }
    }
    return columns;
  }, [draftAssignments]);

  const nonDraftAssignments = useMemo(() => allAssignments.filter((a) => !a.isDraft), [allAssignments]);

  const assignmentConflictsMap = useMemo(() => {
    const map = new Map<string, ConflictInfo[]>();
    for (const a of nonDraftAssignments) {
      const c = getConflicts(
        {
          id: a.id,
          activityType: a.activityType,
          date: parseDateStr(a.date),
          endDate: a.endDate ? parseDateStr(a.endDate) : null,
          timeSlot: a.timeSlot || "FULL_DAY",
          endDayTimeSlot: a.endDayTimeSlot || "FULL_DAY",
          teamIds: a.teamIds,
          workerAssignments: a.workerAssignments as Record<string, Record<string, string[]>> | null | undefined,
        },
        nonDraftAssignments,
        workers,
      );
      if (c.length > 0) map.set(a.id, c);
    }
    return map;
  }, [nonDraftAssignments, workers]);

  type FlatRow = {
    date: Date;
    dateStr: string;
    assignment: DailyAssignment | null;
    isFirstDayOfAssignment: boolean;
    isLastDayOfAssignment: boolean;
    totalDays: number;
    isGanttOnly: boolean;
    prePaddingOwner: DailyAssignment | null;
    prePaddingIndex: number;
    isTailPadding: boolean;
  };

  const GANTT_TYPES = new Set(["MONTAGGIO", "SMONTAGGIO", "MONTAGGIO_SMONTAGGIO", "ECONOMIA", "FERIE_PIOGGIA_VARIE"]);

  const flatRows = useMemo(() => {
    const rows: FlatRow[] = [];
    weekDays.forEach((day) => {
      const dateStr = formatDateForApi(day);
      const dayAssignments = assignments.filter((a) => {
        const aDate = parseDateStr(a.date);
        const aEndDate = a.endDate ? parseDateStr(a.endDate) : aDate;
        return dateStr >= aDate && dateStr <= aEndDate;
      });

      const listAssignments = dayAssignments.filter((a) => !GANTT_TYPES.has(a.activityType));

      const isWeekday = !isWeekendOrHoliday(day);
      const minRows = isWeekday ? 8 : 1;

      const emptyRow = (prePaddingOwner: DailyAssignment | null = null, prePaddingIndex: number = 0, isTailPadding: boolean = false): FlatRow => ({
        date: day, dateStr, assignment: null,
        isFirstDayOfAssignment: false, isLastDayOfAssignment: false,
        totalDays: 0, isGanttOnly: false,
        prePaddingOwner, prePaddingIndex, isTailPadding,
      });

      if (listAssignments.length === 0) {
        rows.push(emptyRow());
        for (let i = 1; i < minRows; i++) {
          rows.push(emptyRow(null, 0, true));
        }
      } else {
        let assignmentRowCount = 0;
        listAssignments.forEach((a) => {
          const aDate = parseDateStr(a.date);
          const aEndDate = a.endDate ? parseDateStr(a.endDate) : aDate;
          const prePad = Math.max(0, a.prePadding ?? 0);
          for (let p = 0; p < prePad; p++) {
            rows.push(emptyRow(a, p, false));
            assignmentRowCount++;
          }
          rows.push({
            date: day,
            dateStr,
            assignment: a,
            isFirstDayOfAssignment: dateStr === aDate,
            isLastDayOfAssignment: dateStr === aEndDate,
            totalDays: 1,
            isGanttOnly: false,
            prePaddingOwner: null,
            prePaddingIndex: 0,
            isTailPadding: false,
          });
          assignmentRowCount++;
        });
        const emptyRowsNeeded = minRows - assignmentRowCount;
        for (let i = 0; i < emptyRowsNeeded; i++) {
          rows.push(emptyRow(null, 0, true));
        }
      }
    });
    return rows;
  }, [weekDays, assignments]);

  type GanttSlots = { full?: DailyAssignment; mattino?: DailyAssignment; pomeriggio?: DailyAssignment };

  const ganttByDateAndCapo = useMemo(() => {
    const map: Record<string, Record<string, GanttSlots>> = {};
    const sortedGanttAssignments = [...assignments]
      .filter((a) => GANTT_TYPES.has(a.activityType) && a.teamIds?.[0])
      .sort((a, b) => parseDateStr(a.date).localeCompare(parseDateStr(b.date)));
    sortedGanttAssignments.forEach((a) => {
      const primaryCapoId = a.teamIds![0];
      const aDate = parseDateStr(a.date);
      const aEndDate = a.endDate ? parseDateStr(a.endDate) : aDate;
      const startSlot = (a.timeSlot || "FULL_DAY") as string;
      const endSlot = (a.endDayTimeSlot || "FULL_DAY") as string;
      const isMultiDay = aDate !== aEndDate;
      const workingDays: number[] = a.workingDays ?? [1, 2, 3, 4, 5];
      weekDays.forEach((day) => {
        const dateStr = formatDateForApi(day);
        if (dateStr >= aDate && dateStr <= aEndDate) {
          if (isMultiDay) {
            const dayOfWeek = day.getDay();
            if (!workingDays.includes(dayOfWeek)) return;
            if (isItalianHoliday(day)) return;
          }
          if (!map[dateStr]) map[dateStr] = {};
          if (!map[dateStr][primaryCapoId]) map[dateStr][primaryCapoId] = {};
          const slots = map[dateStr][primaryCapoId];
          let daySlot: string;
          if (!isMultiDay) {
            daySlot = startSlot;
          } else if (dateStr === aDate) {
            daySlot = startSlot;
          } else if (dateStr === aEndDate) {
            daySlot = endSlot;
          } else {
            daySlot = "FULL_DAY";
          }
          if (daySlot === "MATTINO" && !slots.mattino) {
            slots.mattino = a;
          } else if (daySlot === "POMERIGGIO" && !slots.pomeriggio) {
            slots.pomeriggio = a;
          } else if (daySlot === "FULL_DAY" && !slots.full) {
            slots.full = a;
          }
        }
      });
    });
    return map;
  }, [assignments, weekDays]);

  const dayGroups = useMemo(() => {
    const groups: { dateStr: string; date: Date; rows: FlatRow[]; rowStartIdx: number }[] = [];
    let currentGroup: typeof groups[0] | null = null;
    let idx = 0;
    flatRows.forEach((row) => {
      if (!currentGroup || currentGroup.dateStr !== row.dateStr) {
        currentGroup = { dateStr: row.dateStr, date: row.date, rows: [], rowStartIdx: idx };
        groups.push(currentGroup);
      }
      currentGroup.rows.push(row);
      idx++;
    });
    return groups;
  }, [flatRows]);

  // Warehouse: compute per-row delta and running totals across all flat rows
  // Returns Map<rowKey, { delta: Record<wt, number|null>, total: Record<wt, number> }>
  // rowKey = `${dateStr}-${assignmentId || "noassignment"}-${localIdx}`
  type WarehouseRowData = { delta: Record<string, number | null>; total: Record<string, number>; isForceable: boolean };
  const warehouseByRow = useMemo(() => {
    const WAREHOUSE_TYPES: ("VILLA" | "PL" | "EP")[] = ["VILLA", "PL", "EP"];
    const result = new Map<string, WarehouseRowData>();

    if (dayGroups.length === 0) return result;

    // Seed running totals from latest prior sunday/holiday override (before first rendered date)
    // Fallback to initial balance (date === null) if no prior override exists
    const firstDateStr = dayGroups[0].dateStr;
    const running: Record<string, number> = { VILLA: 0, PL: 0, EP: 0 };
    WAREHOUSE_TYPES.forEach(wt => {
      const priorOverrides = warehouseBalances
        .filter(b => b.warehouseType === wt && b.date !== null && b.date.substring(0, 10) < firstDateStr)
        .sort((a, b) => b.date!.localeCompare(a.date!));
      if (priorOverrides.length > 0) {
        running[wt] = parseFloat(String(priorOverrides[0].value));
      } else {
        running[wt] = 0;
      }
    });

    // Build a map of all non-draft assignments grouped by date
    // Separate GANTT_TYPES (MONTAGGIO/SMONTAGGIO) from list assignments
    const GANTT_ACTIVITY_TYPES = new Set(["MONTAGGIO", "SMONTAGGIO", "MONTAGGIO_SMONTAGGIO", "ECONOMIA", "FERIE_PIOGGIA_VARIE"]);
    const ganttByDate = new Map<string, DailyAssignment[]>();
    for (const a of allAssignments) {
      if (a.isDraft || !GANTT_ACTIVITY_TYPES.has(a.activityType)) continue;
      const aDate = parseDateStr(a.date);
      const aEnd = a.endDate ? parseDateStr(a.endDate) : aDate;
      for (const group of dayGroups) {
        if (group.dateStr >= aDate && group.dateStr <= aEnd) {
          if (!ganttByDate.has(group.dateStr)) ganttByDate.set(group.dateStr, []);
          ganttByDate.get(group.dateStr)!.push(a);
        }
      }
    }

    // Track seen assignment IDs per day to avoid double-counting
    const seenThisDay = new Set<string>();

    for (const group of dayGroups) {
      const dayType = isWeekendOrHoliday(group.date);
      const isForceable = dayType === "weekend" || dayType === "holiday";
      seenThisDay.clear();

      // Pre-check for day override
      const dayOverride: Record<string, number | null> = { VILLA: null, PL: null, EP: null };
      if (isForceable) {
        WAREHOUSE_TYPES.forEach(wt => {
          dayOverride[wt] = getSundayOverride(wt, group.dateStr);
        });
      }

      // First: apply deltas from GANTT_TYPES (MONTAGGIO/SMONTAGGIO) that aren't in table rows
      const ganttAssignments = ganttByDate.get(group.dateStr) || [];
      for (const a of ganttAssignments) {
        if (seenThisDay.has(a.id)) continue;
        seenThisDay.add(a.id);
        const mats: Array<{ type: string; quantity: number }> =
          Array.isArray(a.materials) && a.materials.length > 0
            ? a.materials
            : (a.materialType && a.materialQuantity ? [{ type: a.materialType, quantity: a.materialQuantity }] : []);
        for (const mat of mats) {
          const wt = mat.type as "VILLA" | "PL" | "EP";
          if (!WAREHOUSE_TYPES.includes(wt)) continue;
          if (CONSEGNA_ACTIVITY_TYPES.has(a.activityType)) {
            running[wt] += -mat.quantity;
          } else if (RITIRO_SMONTAGGIO_ACTIVITY_TYPES.has(a.activityType)) {
            running[wt] += mat.quantity;
          }
        }
      }

      // Then: process table rows progressively (list assignments accumulate row by row)
      group.rows.forEach((row, localIdx) => {
        const rowKey = `${row.dateStr}-${row.assignment?.id || "noassignment"}-${localIdx}`;
        const a = row.assignment;

        let delta: Record<string, number | null> = { VILLA: null, PL: null, EP: null };
        if (a && !a.isDraft && !seenThisDay.has(a.id)) {
          seenThisDay.add(a.id);
          const mats: Array<{ type: string; quantity: number }> =
            Array.isArray(a.materials) && a.materials.length > 0
              ? a.materials
              : (a.materialType && a.materialQuantity ? [{ type: a.materialType, quantity: a.materialQuantity }] : []);
          for (const mat of mats) {
            const wt = mat.type as "VILLA" | "PL" | "EP";
            if (WAREHOUSE_TYPES.includes(wt)) {
              if (CONSEGNA_ACTIVITY_TYPES.has(a.activityType)) {
                delta[wt] = (delta[wt] ?? 0) - mat.quantity;
                running[wt] += -mat.quantity;
              } else if (RITIRO_SMONTAGGIO_ACTIVITY_TYPES.has(a.activityType)) {
                delta[wt] = (delta[wt] ?? 0) + mat.quantity;
                running[wt] += mat.quantity;
              }
            }
          }
        }

        result.set(rowKey, {
          delta,
          total: { VILLA: running.VILLA, PL: running.PL, EP: running.EP },
          isForceable,
        });
      });

      // After all rows, apply override if set (retroactively update all rows of this day)
      if (isForceable) {
        WAREHOUSE_TYPES.forEach(wt => {
          const ov = dayOverride[wt];
          if (ov !== null) {
            group.rows.forEach((row, localIdx) => {
              const rowKey = `${row.dateStr}-${row.assignment?.id || "noassignment"}-${localIdx}`;
              const existing = result.get(rowKey);
              if (existing) {
                result.set(rowKey, { ...existing, total: { ...existing.total, [wt]: ov } });
              }
            });
            running[wt] = ov;
          }
        });
      }
    }
    return result;
  }, [dayGroups, allAssignments, warehouseBalances, getSundayOverride]);

  useEffect(() => {
    const table = tableRef.current;
    const overlayContainer = barOverlaysRef.current;
    if (!table || !overlayContainer) return;

    const updateOverlays = () => {
      overlayContainer.innerHTML = "";
      const startCells = table.querySelectorAll<HTMLElement>('td[data-bar-start="1"][data-bar-assignment]');
      const containerRect = overlayContainer.getBoundingClientRect();

      startCells.forEach((startCell) => {
        const aId = startCell.getAttribute("data-bar-assignment");
        const cId = startCell.getAttribute("data-bar-capo");
        if (!aId || !cId) return;

        const allCells = Array.from(table.querySelectorAll<HTMLElement>(`td[data-bar-capo="${cId}"][data-bar-assignment="${aId}"]`));
        if (allCells.length === 0) return;

        const startIdx = allCells.indexOf(startCell);
        if (startIdx === -1) return;
        const segmentCells: HTMLElement[] = [startCell];
        for (let i = startIdx + 1; i < allCells.length; i++) {
          if (allCells[i].getAttribute("data-bar-start") === "1") break;
          segmentCells.push(allCells[i]);
        }

        const firstCell = segmentCells[0];
        const lastCell = segmentCells[segmentCells.length - 1];
        const firstRect = firstCell.getBoundingClientRect();
        const lastRect = lastCell.getBoundingClientRect();
        const firstSlot = firstCell.getAttribute("data-bar-slot");
        const lastSlot = lastCell.getAttribute("data-bar-slot");

        const topOffset = firstSlot === "pomeriggio" ? firstRect.height / 2 : 0;
        const bottomOffset = lastSlot === "mattino" ? lastRect.height / 2 : 0;

        const top = firstRect.top - containerRect.top + topOffset;
        const totalH = lastRect.bottom - firstRect.top - topOffset - bottomOffset;
        const left = firstRect.left - containerRect.left;
        const width = firstRect.width;

        const labelText = startCell.getAttribute("data-bar-label") || "";
        if (!labelText) return;

        const overlay = document.createElement("div");
        overlay.style.cssText = `position:absolute;top:${top}px;left:${left}px;width:${width}px;height:${totalH}px;display:flex;align-items:center;justify-content:center;z-index:2;pointer-events:none;overflow:hidden;`;
        const span = document.createElement("span");
        const labelColor = startCell.getAttribute("data-bar-label-color") || "white";
        const hasBorder = startCell.getAttribute("data-bar-has-border") === "1";
        span.style.cssText = `writing-mode:vertical-rl;transform:rotate(180deg);color:${labelColor};font-size:12px;font-weight:400;line-height:1;user-select:none;white-space:nowrap;${hasBorder ? "margin-left:5px;" : ""}`;
        span.textContent = labelText;
        overlay.appendChild(span);
        overlayContainer.appendChild(overlay);
      });
    };

    requestAnimationFrame(updateOverlays);

    const resizeObserver = new ResizeObserver(() => requestAnimationFrame(updateOverlays));
    resizeObserver.observe(table);

    return () => {
      resizeObserver.disconnect();
      overlayContainer.innerHTML = "";
    };
  }, [dayGroups, ganttByDateAndCapo, projectsMap]);

  return (
    <Card className="overflow-hidden border" data-testid="spreadsheet-grid-container">
      <div className="h-[calc(100vh-165px)] overflow-y-auto overflow-x-auto" ref={scrollContainerRef}>
        <div style={{ minWidth: `${818 + (warehouseColsCollapsed ? 20 : 6 * WAREHOUSE_COL_W) + capisquadra.length * TEAM_COL_W + draftColumns.length * DRAFT_COL_W}px`, position: "relative" }}>
          <div ref={barOverlaysRef} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none", zIndex: 3 }} />
          <div ref={topSentinelRef} className="h-1" data-testid="sentinel-top" />

          <table className="w-full border-separate border-spacing-0 text-xs" data-testid="proxit-table" ref={tableRef}>
            <thead className="sticky top-0 z-20">
              <tr className="bg-card">
                {/* Warehouse columns - before drag handle */}
                {warehouseColsCollapsed ? (
                  <th
                    className="text-center py-1 border-b-2 border-b-border border-r-2 border-r-black dark:border-r-white cursor-pointer hover:bg-muted/40"
                    style={{ width: 20, minWidth: 20 }}
                    onClick={() => setWarehouseColsCollapsed(false)}
                    title="Espandi colonne magazzino"
                    data-testid="th-warehouse-expand"
                  >
                    <ChevronRight className="w-3 h-3 mx-auto text-muted-foreground" />
                  </th>
                ) : (
                  <>
                    <th className="text-center py-1 font-bold text-foreground border-r border-b-2 border-b-border" style={{ width: WAREHOUSE_COL_W, minWidth: WAREHOUSE_COL_W, fontSize: 9 }}>
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => setWarehouseColsCollapsed(true)} title="Comprimi colonne magazzino" data-testid="btn-warehouse-collapse" className="p-0 leading-none text-muted-foreground/60 hover:text-muted-foreground">
                          <ChevronLeft className="w-2.5 h-2.5" />
                        </button>
                        <span>VILLA</span>
                      </div>
                    </th>
                    <th className="text-center py-1 font-bold text-foreground border-r border-b-2 border-b-border" style={{ width: WAREHOUSE_COL_W, minWidth: WAREHOUSE_COL_W, fontSize: 9, color: "#0065b8" }}>C/R V</th>
                    <th className="text-center py-1 font-bold text-foreground border-r border-b-2 border-b-border" style={{ width: WAREHOUSE_COL_W, minWidth: WAREHOUSE_COL_W, fontSize: 9 }}>PL</th>
                    <th className="text-center py-1 font-bold text-foreground border-r border-b-2 border-b-border" style={{ width: WAREHOUSE_COL_W, minWidth: WAREHOUSE_COL_W, fontSize: 9, color: "#0065b8" }}>C/R PL</th>
                    <th className="text-center py-1 font-bold text-foreground border-r border-b-2 border-b-border" style={{ width: WAREHOUSE_COL_W, minWidth: WAREHOUSE_COL_W, fontSize: 9 }}>EP</th>
                    <th className="text-center py-1 font-bold text-foreground border-b-2 border-b-border border-r-2 border-r-black dark:border-r-white" style={{ width: WAREHOUSE_COL_W, minWidth: WAREHOUSE_COL_W, fontSize: 9, color: "#0065b8" }}>C/R EP</th>
                  </>
                )}
                <th className="w-[28px] border-r border-b-2 border-b-border" />
                <th className="text-left px-2 py-2 font-bold text-foreground w-[250px] min-w-[250px] border-r border-b-2 border-b-border">Note</th>
                <th className="text-center px-2 py-2 font-bold text-foreground w-[70px] border-r border-b-2 border-b-border">Off. n°</th>
                <th className="text-center px-2 py-2 font-bold text-foreground w-[60px] min-w-[60px] border-r border-b-2 border-b-border">C/R</th>
                <th className="text-left px-2 py-2 font-bold text-foreground w-[300px] border-r border-b-2 border-b-border">Cliente</th>
                <th className="text-left px-2 py-2 font-bold text-foreground w-[300px] border-r border-b-2 border-b-border hidden lg:table-cell">Indirizzo</th>
                <th className="text-center px-2 py-2 font-bold text-foreground w-[45px] border-r border-b-2 border-b-border">Ora</th>
                <th className="text-center px-2 py-2 font-bold text-foreground w-[80px] border-r border-b-2 border-b-border hidden md:table-cell">Autista</th>
                <th className="text-center px-2 py-2 font-bold text-foreground w-[70px] border-r border-b-2 border-b-border hidden md:table-cell">Mezzo</th>
                <th className="text-center px-2 py-2 font-bold text-foreground w-[70px] border-l-2 border-l-black dark:border-l-white border-r border-b-2 border-b-border hidden md:table-cell">Chi</th>
                <th className="text-center px-2 py-2 font-bold text-foreground w-[70px] border-r border-b-2 border-b-border hidden md:table-cell">Cosa</th>
                <th className="text-left px-2 py-2 font-bold text-foreground min-w-[60px] border-l-2 border-l-black dark:border-l-white border-r-2 border-r-black dark:border-r-white border-b-2 border-b-border">Data</th>
                {capisquadra.map((capo, capoIdx) => {
                  const firstExtIdx = capisquadra.findIndex(c => c.isInternal === false);
                  const isFirstExt = firstExtIdx >= 0 && capoIdx === firstExtIdx;
                  const isLastInt = firstExtIdx > 0 && capoIdx === firstExtIdx - 1;
                  return (
                  <th
                    key={capo.id}
                    colSpan={2}
                    className={`text-center px-0 py-1 font-semibold border-b-2 border-b-border${isLastInt ? "" : " border-r"}${isFirstExt ? " border-l-2 border-l-black dark:border-l-white" : ""}`}
                    style={{ width: TEAM_COL_W, minWidth: TEAM_COL_W, backgroundColor: capo.color ? capo.color + "33" : undefined }}
                    data-testid={`th-capo-${capo.id}`}
                  >
                    <div className="flex flex-col items-center gap-0">
                      <span className="text-xs font-bold text-foreground truncate max-w-[100px] leading-tight">{capo.name}</span>
                      {capo.isInternal === false && (
                        <span className="text-[8px] font-bold text-amber-600 dark:text-amber-400 leading-none">EST</span>
                      )}
                    </div>
                  </th>
                  );
                })}
                {draftColumns.map((colDrafts, colIdx) => (
                  <th
                    key={`draft-col-${colIdx}`}
                    className="text-center px-0 py-1 font-semibold border-r border-b-2 border-b-border"
                    style={{ width: DRAFT_COL_W, minWidth: DRAFT_COL_W, borderLeft: colIdx === 0 ? "3px solid #111" : undefined }}
                    data-testid={`th-draft-col-${colIdx}`}
                  >
                    <div className="flex flex-col items-center gap-0">
                      <span className="text-[8px] text-amber-600 dark:text-amber-400 font-bold leading-none">BZ</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dayGroups.map((group) => {
                const isToday2 = isSameDay(group.date, today);
                const dayType = isWeekendOrHoliday(group.date);
                const dayLabel = `${group.date.getDate()} ${MONTH_NAMES_SHORT[group.date.getMonth()]}`;
                const dayNameLabel = DAY_NAMES_SHORT[group.date.getDay()];
                const rowCount = group.rows.length;

                const prevGroup = dayGroups[dayGroups.indexOf(group) - 1];
                const nextGroup = dayGroups[dayGroups.indexOf(group) + 1];

                const hasRealAssignments = group.rows.some(r => r.assignment !== null);
                const isCompactDay = dayType === "holiday" || dayType === "weekend";
                const assignmentRows = group.rows.filter(r => r.assignment !== null);

                return group.rows.map((row, localIdx) => {
                  const isFirstRow = localIdx === 0;
                  const isLastRow = localIdx === group.rows.length - 1;
                  const assignment = row.assignment;
                  const activityType = assignment?.activityType as ActivityType | undefined;
                  const driver = assignment?.driverId ? driversMap.get(assignment.driverId) : null;
                  const vehicle = assignment?.vehicleId ? vehiclesMap.get(assignment.vehicleId) : null;
                  const isMultiDay = assignment && assignment.endDate && parseDateStr(assignment.endDate) !== parseDateStr(assignment.date);
                  const showInfoCols = !row.isGanttOnly && (!isMultiDay || row.isFirstDayOfAssignment);

                  const showInlineAdd = isLastRow && hasRealAssignments;
                  const isCompactRow = isCompactDay;
                  const cellPy = isCompactRow ? "" : "py-0.5";
                  const tdBorderClass = `${!isLastRow ? "border-b" : ""}${isFirstRow ? " border-t-2 border-t-black dark:border-t-white" : ""}`;

                  const rowBgClass = isToday2
                    ? "bg-primary/[0.06]"
                    : dayType === "holiday"
                      ? "bg-red-200 dark:bg-red-900/40"
                      : dayType === "weekend"
                        ? "bg-red-100 dark:bg-red-950/30"
                        : "";

                  const rowKey = `${row.dateStr}-${assignment?.id || "empty"}-${localIdx}`;

                  const nativeAssignmentsSorted = assignmentRows
                    .map(r => r.assignment!)
                    .filter((a, i, arr) => arr.findIndex(x => x.id === a.id) === i)
                    .filter(a => a.date.substring(0, 10) === row.dateStr)
                    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
                  const nativeIdx = assignment ? nativeAssignmentsSorted.findIndex(a => a.id === assignment.id) : -1;
                  const canMoveUp = assignment && nativeIdx > 0 && !isCompactRow;
                  const canMoveDown = assignment && nativeIdx >= 0 && nativeIdx < nativeAssignmentsSorted.length - 1 && !isCompactRow;

                  return (
                    <tr
                      key={rowKey}
                      ref={(node: HTMLTableRowElement | null) => {
                        if (isToday2 && isFirstRow && todayRef) (todayRef as React.MutableRefObject<HTMLTableRowElement | null>).current = node;
                      }}
                      className={`${showInlineAdd ? "group/lastrow" : ""} ${assignment ? "group/assignrow" : ""} transition-colors ${rowBgClass} ${assignment ? "cursor-pointer hover:bg-muted/30" : ""}`}
                      style={{ height: isCompactRow ? HOLIDAY_ROW_H : ROW_H }}
                      onClick={() => assignment && onEditAssignment(assignment)}
                      data-testid={assignment ? `row-assignment-${assignment.id}-${row.dateStr}` : `row-empty-${row.dateStr}`}
                    >
                      {!assignment ? (
                        <>
                          {/* Warehouse cells for empty/pre-padding rows */}
                          {(() => {
                            const rowKey = `${row.dateStr}-noassignment-${localIdx}`;
                            const wData = warehouseByRow.get(rowKey);
                            const wTotal = wData?.total || { VILLA: 0, PL: 0, EP: 0 };
                            const isForceable = wData?.isForceable ?? false;
                            if (warehouseColsCollapsed) {
                              return <td key="wh-collapsed" className={`${tdBorderClass} border-r-2 border-r-black dark:border-r-white`} style={{ width: 20, minWidth: 20 }} />;
                            }
                            return (["VILLA", "PL", "EP"] as const).map((wt, wtIdx) => {
                              const isLastWt = wtIdx === 2;
                              const totalVal = wTotal[wt];
                              const cellId = `${rowKey}-${wt}`;
                              const isEditing = editingWarehouseCell?.rowKey === rowKey && editingWarehouseCell?.wType === wt;
                              return [
                                <td
                                  key={`whTotal-${wt}-${rowKey}`}
                                  className={`text-center border-r ${tdBorderClass} ${isForceable ? "cursor-pointer" : ""}`}
                                  style={{ width: WAREHOUSE_COL_W, minWidth: WAREHOUSE_COL_W, fontSize: 10, fontWeight: 600, verticalAlign: "middle", background: isForceable ? "rgba(239,68,68,0.08)" : undefined }}
                                  onClick={() => {
                                    if (isForceable && !readOnly) {
                                      setEditingWarehouseCell({ dateStr: row.dateStr, wType: wt, rowKey });
                                      const override = getSundayOverride(wt, row.dateStr);
                                      setEditingWarehouseValue(override !== null ? String(override) : String(totalVal));
                                    }
                                  }}
                                  data-testid={`wh-total-${wt}-${row.dateStr}-${localIdx}`}
                                >
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      autoFocus
                                      className="w-[44px] text-center text-xs border border-primary rounded outline-none bg-background"
                                      value={editingWarehouseValue}
                                      onChange={(e) => setEditingWarehouseValue(e.target.value)}
                                      onBlur={() => {
                                        const v = parseFloat(editingWarehouseValue);
                                        if (!isNaN(v)) onUpsertWarehouseBalance(wt, row.dateStr, v);
                                        setEditingWarehouseCell(null);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          const v = parseFloat(editingWarehouseValue);
                                          if (!isNaN(v)) onUpsertWarehouseBalance(wt, row.dateStr, v);
                                          setEditingWarehouseCell(null);
                                        }
                                        if (e.key === "Escape") setEditingWarehouseCell(null);
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      data-testid={`wh-input-${cellId}`}
                                    />
                                  ) : (
                                    <span style={{ color: totalVal < 0 ? "#ef4444" : undefined }}>
                                      {totalVal !== 0 || isForceable ? totalVal : ""}
                                    </span>
                                  )}
                                </td>,
                                <td
                                  key={`whDelta-${wt}-${rowKey}`}
                                  className={`text-center ${tdBorderClass} ${isLastWt ? "border-r-2 border-r-black dark:border-r-white" : "border-r"}`}
                                  style={{ width: WAREHOUSE_COL_W, minWidth: WAREHOUSE_COL_W, fontSize: 10, verticalAlign: "middle" }}
                                />,
                              ];
                            });
                          })()}
                          <td className={`border-r w-[28px] align-middle ${tdBorderClass}`} onClick={(e) => e.stopPropagation()}>
                            {row.prePaddingOwner && !row.isTailPadding && !isCompactRow && (
                              <div className={`flex flex-col items-center justify-center h-full ${cellPy}`}>
                                <button
                                  className="h-3 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
                                  onClick={() => { if (!readOnly) onUpdatePrePadding(row.prePaddingOwner!.id, -1); }}
                                  data-testid={`button-pre-padding-up-${row.prePaddingOwner.id}-${row.prePaddingIndex}`}
                                >
                                  <ChevronUp className="w-3 h-3" />
                                </button>
                                <button
                                  className="h-3 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
                                  onClick={() => { if (!readOnly) onUpdatePrePadding(row.prePaddingOwner!.id, 1); }}
                                  data-testid={`button-pre-padding-down-${row.prePaddingOwner.id}-${row.prePaddingIndex}`}
                                >
                                  <ChevronDown className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </td>
                          <td className={`px-1 border-r ${tdBorderClass}`}>
                            {!row.prePaddingOwner && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`${isCompactRow ? "h-3 w-3" : "h-5 w-5"} text-muted-foreground`}
                              onClick={(e) => { e.stopPropagation(); if (!readOnly) onAddAssignment(row.dateStr); }}
                              data-testid={`button-add-day-${row.dateStr}`}
                            >
                              <Plus className={isCompactRow ? "w-2 h-2" : "w-3 h-3"} />
                            </Button>
                            )}
                          </td>
                          <td className={`border-r ${tdBorderClass}`} />
                          <td className={`border-r ${tdBorderClass}`} />
                          <td className={`border-r ${tdBorderClass}`} />
                          <td className={`border-r hidden lg:table-cell ${tdBorderClass}`} />
                          <td className={`border-r ${tdBorderClass}`} />
                          <td className={`border-r hidden md:table-cell ${tdBorderClass}`} />
                          <td className={`border-r hidden md:table-cell ${tdBorderClass}`} />
                          <td className={`px-0 border-l-2 border-l-black dark:border-l-white border-r hidden md:table-cell ${tdBorderClass}`} onClick={(e) => e.stopPropagation()}>
                            <input type="text" className="w-[70px] bg-transparent text-xs px-1 py-0 border-0 outline-none focus:ring-1 focus:ring-primary/40 rounded text-center" disabled={readOnly} />
                          </td>
                          <td className={`px-0 border-r hidden md:table-cell ${tdBorderClass}`} onClick={(e) => e.stopPropagation()}>
                            <input type="text" className="w-[70px] bg-transparent text-xs px-1 py-0 border-0 outline-none focus:ring-1 focus:ring-primary/40 rounded text-center" disabled={readOnly} />
                          </td>
                          {isFirstRow && (
                            <td
                              className={`px-2 border-l-2 border-l-black dark:border-l-white border-r-2 border-r-black dark:border-r-white border-t-2 border-t-black dark:border-t-white font-semibold max-w-[100px] ${!isCompactRow ? "align-middle relative" : "align-middle"} ${isToday2 ? "text-white bg-[hsl(229,55%,28%)] dark:bg-[hsl(229,55%,28%)]" : dayType === "holiday" ? "text-muted-foreground bg-red-200 dark:bg-red-900/40" : dayType === "weekend" ? "text-muted-foreground bg-red-100 dark:bg-red-950/30" : "text-white bg-[hsl(229,55%,28%)] dark:bg-[hsl(229,55%,28%)]"}`}
                              rowSpan={rowCount}
                            >
                              {isCompactRow ? (
                                <span className="text-[10px] leading-none font-bold">{dayLabel}</span>
                              ) : (
                                <>
                                  <span className="absolute top-1 left-0 right-0 text-center text-[10px] font-bold">{dayLabel}</span>
                                  <div className="flex justify-center w-full">
                                    <span className="text-xl font-bold" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>{dayNameLabel}</span>
                                  </div>
                                </>
                              )}
                            </td>
                          )}
                        </>
                      ) : (
                        <>
                          {/* Warehouse cells for assignment rows */}
                          {(() => {
                            const rowKey = `${row.dateStr}-${assignment.id}-${localIdx}`;
                            const wData = warehouseByRow.get(rowKey);
                            const wDelta = wData?.delta || { VILLA: null, PL: null, EP: null };
                            const wTotal = wData?.total || { VILLA: 0, PL: 0, EP: 0 };
                            const isForceable = wData?.isForceable ?? false;
                            if (warehouseColsCollapsed) {
                              return <td key="wh-collapsed" className={`${tdBorderClass} border-r-2 border-r-black dark:border-r-white`} style={{ width: 20, minWidth: 20 }} />;
                            }
                            return (["VILLA", "PL", "EP"] as const).map((wt, wtIdx) => {
                              const isLastWt = wtIdx === 2;
                              const d = wDelta[wt];
                              const totalVal = wTotal[wt];
                              const cellId = `${rowKey}-${wt}`;
                              const isEditing = editingWarehouseCell?.rowKey === rowKey && editingWarehouseCell?.wType === wt;
                              return [
                                <td
                                  key={`whTotal-${wt}-${rowKey}`}
                                  className={`text-center border-r ${tdBorderClass} ${isForceable ? "cursor-pointer" : ""}`}
                                  style={{ width: WAREHOUSE_COL_W, minWidth: WAREHOUSE_COL_W, fontSize: 10, fontWeight: 600, verticalAlign: "middle", background: isForceable ? "rgba(239,68,68,0.08)" : undefined }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isForceable && !readOnly) {
                                      setEditingWarehouseCell({ dateStr: row.dateStr, wType: wt, rowKey });
                                      const override = getSundayOverride(wt, row.dateStr);
                                      setEditingWarehouseValue(override !== null ? String(override) : String(totalVal));
                                    }
                                  }}
                                  data-testid={`wh-total-${wt}-${row.dateStr}-${assignment.id}`}
                                >
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      autoFocus
                                      className="w-[44px] text-center text-xs border border-primary rounded outline-none bg-background"
                                      value={editingWarehouseValue}
                                      onChange={(e) => setEditingWarehouseValue(e.target.value)}
                                      onBlur={() => {
                                        const v = parseFloat(editingWarehouseValue);
                                        if (!isNaN(v)) onUpsertWarehouseBalance(wt, row.dateStr, v);
                                        setEditingWarehouseCell(null);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          const v = parseFloat(editingWarehouseValue);
                                          if (!isNaN(v)) onUpsertWarehouseBalance(wt, row.dateStr, v);
                                          setEditingWarehouseCell(null);
                                        }
                                        if (e.key === "Escape") setEditingWarehouseCell(null);
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      data-testid={`wh-input-${cellId}`}
                                    />
                                  ) : (
                                    <span style={{ color: totalVal < 0 ? "#ef4444" : undefined }}>
                                      {totalVal}
                                    </span>
                                  )}
                                </td>,
                                <td
                                  key={`whDelta-${wt}-${rowKey}`}
                                  className={`text-center ${tdBorderClass} ${isLastWt ? "border-r-2 border-r-black dark:border-r-white" : "border-r"}`}
                                  style={{ width: WAREHOUSE_COL_W, minWidth: WAREHOUSE_COL_W, fontSize: 10, verticalAlign: "middle" }}
                                  data-testid={`wh-delta-${wt}-${assignment.id}`}
                                >
                                  {d !== null && (
                                    <span style={{ color: d > 0 ? "#16a34a" : d < 0 ? "#ef4444" : undefined, fontWeight: 600 }}>
                                      {d > 0 ? `+${d}` : d}
                                    </span>
                                  )}
                                </td>,
                              ];
                            });
                          })()}
                          <td
                            className={`border-r w-[28px] align-middle ${tdBorderClass}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {!isCompactRow && (
                              <div className={`flex flex-col items-center justify-center h-full gap-0 ${cellPy}`}>
                                {!readOnly && (
                                  <>
                                    <button
                                      className="h-3 w-4 flex items-center justify-center opacity-0 pointer-events-none group-hover/assignrow:opacity-100 group-hover/assignrow:pointer-events-auto transition-opacity text-muted-foreground hover:text-foreground"
                                      onClick={(e) => { e.stopPropagation(); onUpdatePrePadding(assignment.id, 1); }}
                                      data-testid={`button-add-pre-padding-${assignment.id}`}
                                    >
                                      <Plus className="w-3 h-3" />
                                    </button>
                                    <button
                                      className={`h-3 w-4 flex items-center justify-center opacity-0 group-hover/assignrow:opacity-100 transition-opacity ${canMoveUp ? "text-muted-foreground hover:text-foreground cursor-pointer" : "text-muted-foreground/30 cursor-not-allowed"}`}
                                      onClick={(e) => { e.stopPropagation(); if (canMoveUp) onReorderAssignment(assignment.id, nativeAssignmentsSorted[nativeIdx - 1].id); }}
                                      disabled={!canMoveUp}
                                      data-testid={`button-move-up-${assignment.id}`}
                                      title="Sposta su"
                                    >
                                      <ChevronUp className="w-3 h-3" />
                                    </button>
                                    <button
                                      className={`h-3 w-4 flex items-center justify-center opacity-0 group-hover/assignrow:opacity-100 transition-opacity ${canMoveDown ? "text-muted-foreground hover:text-foreground cursor-pointer" : "text-muted-foreground/30 cursor-not-allowed"}`}
                                      onClick={(e) => { e.stopPropagation(); if (canMoveDown) onReorderAssignment(assignment.id, nativeAssignmentsSorted[nativeIdx + 1].id); }}
                                      disabled={!canMoveDown}
                                      data-testid={`button-move-down-${assignment.id}`}
                                      title="Sposta giù"
                                    >
                                      <ChevronDown className="w-3 h-3" />
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </td>
                          <td
                            className={`px-1 ${cellPy} border-r ${tdBorderClass}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center gap-0.5">
                              <GridNoteField
                                assignmentId={assignment.id}
                                initialNote={assignment.gridNote || ""}
                                initialColor={assignment.gridNoteColor || ""}
                                onSave={(val) => {
                                  if (!readOnly && val !== (assignment.gridNote || "")) {
                                    onPatchAssignment(assignment.id, { gridNote: val || null });
                                  }
                                }}
                                onSaveColor={(color) => {
                                  if (!readOnly) onPatchAssignment(assignment.id, { gridNoteColor: color || null });
                                }}
                              />
                              {(() => {
                                const aConflicts = assignmentConflictsMap.get(assignment.id);
                                if (!aConflicts || aConflicts.length === 0) return null;
                                const tooltipText = aConflicts.map((c) => {
                                  const rLabel = c.resourceType === "caposquadra" ? `Caposquadra "${c.resourceName}"` : `Lavoratore "${c.resourceName}"`;
                                  return `${rLabel} → ${c.conflictingAssignmentLabel}`;
                                }).join("\n");
                                return (
                                  <span
                                    title={tooltipText}
                                    className="flex-shrink-0 text-amber-500"
                                    data-testid={`conflict-icon-${assignment.id}`}
                                  >
                                    <AlertTriangle className="w-3 h-3" />
                                  </span>
                                );
                              })()}
                              {showInlineAdd && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-4 w-4 shrink-0 opacity-0 group-hover/lastrow:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                  onClick={(e) => { e.stopPropagation(); if (!readOnly) onAddAssignment(group.dateStr); }}
                                  data-testid={`button-add-inline-${group.dateStr}`}
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                          <td className={`px-2 ${cellPy} border-r text-center ${tdBorderClass}`}>
                            {showInfoCols && (() => {
                              const project = assignment.projectId ? projectsMap.get(assignment.projectId) : null;
                              const qn = project?.quoteNumber;
                              return (
                                <span className="text-xs truncate block" data-testid={`text-quotenumber-${assignment.id}`}>
                                  {qn || "—"}
                                </span>
                              );
                            })()}
                          </td>
                          {(() => {
                              const crMap: Record<string, { label: string; color: string }> = {
                                CONSEGNA: { label: "C", color: "#0065b8" },
                                RITIRO: { label: "R", color: "#07833b" },
                                CONSEGNA_COMBINATO: { label: "C", color: "#0065b8" },
                                RITIRO_COMBINATO: { label: "R", color: "#07833b" },
                                ESUBERO: { label: "E", color: "#75fb4c" },
                                ESUBERO_COMBINATO: { label: "E", color: "#75fb4c" },
                                INTEGRAZIONE: { label: "I", color: "#75fbfd" },
                                INTEGRAZIONE_COMBINATO: { label: "I", color: "#75fbfd" },
                                MANUTENZIONE: { label: "M", color: "#c0392b" },
                              };
                              const cr = showInfoCols ? crMap[assignment.activityType] : undefined;
                              const tdStyle = cr ? { position: "relative" as const, backgroundColor: cr.color } : { position: "relative" as const };
                              const at = assignment.activityType;
                              const isCombinato = at === "CONSEGNA_COMBINATO" || at === "RITIRO_COMBINATO" || at === "ESUBERO_COMBINATO" || at === "INTEGRAZIONE_COMBINATO";
                              const hasArrowDice = at === "CONSEGNA" || at === "RITIRO" || at === "ESUBERO" || at === "INTEGRAZIONE";
                              const hasNextRow = localIdx < group.rows.length - 1 && group.rows[localIdx + 1]?.assignment !== null;
                              return (
                                <td className={`px-1 ${cellPy} border-r text-center min-w-[60px] ${tdBorderClass}`} style={tdStyle}>
                                  {showInfoCols && (
                                    cr ? (
                                      <>
                                        <span className="text-xs font-semibold" style={{ color: "white" }} data-testid={`text-delivery-${assignment.id}`}>
                                          {cr.label}
                                          {hasArrowDice && (
                                            <span className="ml-0.5 opacity-70" style={{ fontSize: "0.85rem" }}>→ 🎲</span>
                                          )}
                                        </span>
                                        {isCombinato && hasNextRow && (
                                          <>
                                            <span className="ml-0.5 opacity-70" style={{ fontSize: "0.85rem", color: "white" }}>→</span>
                                            <span style={{ fontSize: "0.85rem", color: "white", fontWeight: "bold" }}>↓</span>
                                          </>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    )
                                  )}
                                </td>
                              );
                            })()}
                          <td className={`px-2 ${cellPy} border-r ${tdBorderClass}`}>
                            {showInfoCols && (
                              <span className="font-medium truncate block max-w-[290px]" data-testid={`text-client-${assignment.id}`}>
                                {assignment.clientName || "—"}
                              </span>
                            )}
                          </td>
                          <td className={`px-2 ${cellPy} border-r hidden lg:table-cell ${tdBorderClass}`}>
                            {showInfoCols && (
                              <span className="text-muted-foreground truncate block max-w-[290px]">
                                {assignment.siteCity || assignment.siteProvince || assignment.siteAddress
                                  ? [
                                      assignment.siteCity && assignment.siteProvince
                                        ? `${assignment.siteCity} (${assignment.siteProvince})`
                                        : assignment.siteCity || (assignment.siteProvince ? `(${assignment.siteProvince})` : ""),
                                      assignment.siteAddress
                                    ].filter(Boolean).join(" - ")
                                  : "—"}
                              </span>
                            )}
                          </td>
                          <td className={`px-2 ${cellPy} border-r text-center ${tdBorderClass}`}>
                            {showInfoCols && (
                              <span>{assignment.scheduledTime || "—"}</span>
                            )}
                          </td>
                          <td className={`px-2 ${cellPy} border-r hidden md:table-cell text-center ${tdBorderClass}`}>
                            {showInfoCols && (
                              <span className="truncate block max-w-[70px]">{driver?.name || "—"}</span>
                            )}
                          </td>
                          <td className={`px-2 ${cellPy} border-r hidden md:table-cell text-center ${tdBorderClass}`}>
                            {showInfoCols && (
                              <span className="truncate block max-w-[60px]">{vehicle?.name || "—"}</span>
                            )}
                          </td>
                          <td className={`px-0 ${cellPy} border-l-2 border-l-black dark:border-l-white border-r hidden md:table-cell ${tdBorderClass}`} onClick={(e) => e.stopPropagation()}>
                            {showInfoCols && (
                              <GridNoteField
                                assignmentId={assignment.id}
                                fieldKey={`chi-${assignment.id}`}
                                initialNote={assignment.chi || ""}
                                initialColor={assignment.chiColor || ""}
                                onSave={(val) => {
                                  if (!readOnly && val !== (assignment.chi || "")) {
                                    onPatchAssignment(assignment.id, { chi: val || null });
                                  }
                                }}
                                onSaveColor={(color) => {
                                  if (!readOnly) onPatchAssignment(assignment.id, { chiColor: color || null });
                                }}
                              />
                            )}
                          </td>
                          <td className={`px-0 ${cellPy} border-r hidden md:table-cell ${tdBorderClass}`} onClick={(e) => e.stopPropagation()}>
                            {showInfoCols && (
                              <GridNoteField
                                assignmentId={assignment.id}
                                fieldKey={`cosa-${assignment.id}`}
                                initialNote={assignment.cosa || ""}
                                initialColor={assignment.cosaColor || ""}
                                onSave={(val) => {
                                  if (!readOnly && val !== (assignment.cosa || "")) {
                                    onPatchAssignment(assignment.id, { cosa: val || null });
                                  }
                                }}
                                onSaveColor={(color) => {
                                  if (!readOnly) onPatchAssignment(assignment.id, { cosaColor: color || null });
                                }}
                              />
                            )}
                          </td>
                          {isFirstRow && (
                            <td
                              className={`px-2 border-l-2 border-l-black dark:border-l-white border-r-2 border-r-black dark:border-r-white border-t-2 border-t-black dark:border-t-white font-semibold max-w-[100px] ${!isCompactRow ? "align-middle relative" : "align-middle"} ${isToday2 ? "text-white bg-[hsl(229,55%,28%)] dark:bg-[hsl(229,55%,28%)]" : dayType === "holiday" ? "text-muted-foreground bg-red-200 dark:bg-red-900/40" : dayType === "weekend" ? "text-muted-foreground bg-red-100 dark:bg-red-950/30" : "text-white bg-[hsl(229,55%,28%)] dark:bg-[hsl(229,55%,28%)]"}`}
                              rowSpan={rowCount}
                            >
                              {isCompactRow ? (
                                <span className="text-[10px] leading-none font-bold">{dayLabel}</span>
                              ) : (
                                <>
                                  <span className="absolute top-1 left-0 right-0 text-center text-[10px] font-bold">{dayLabel}</span>
                                  <div className="flex justify-center w-full">
                                    <span className="text-xl font-bold" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>{dayNameLabel}</span>
                                  </div>
                                </>
                              )}
                            </td>
                          )}
                        </>
                      )}

                      {isFirstRow && capisquadra.map((capo, capoIdx) => {
                        const ganttSlots = ganttByDateAndCapo[group.dateStr]?.[capo.id] ?? {};
                        const ganttAssignment = ganttSlots.full ?? null;
                        const mattinoAssignment = ganttSlots.mattino ?? null;
                        const pomeriggioAssignment = ganttSlots.pomeriggio ?? null;

                        // A true split is when there are two *different* assignments in the same cell (one mattino, one pomeriggio).
                        // A partial single-assignment cell is when only mattino or only pomeriggio belongs to the same multi-day assignment
                        // (the other half-slot is empty). In that case we treat it as part of the continuous bar, not as a split.
                        const hasSameHalfAssignment = !ganttAssignment && mattinoAssignment && pomeriggioAssignment && mattinoAssignment.id === pomeriggioAssignment.id;
                        const hasOnlyMattino = mattinoAssignment && !pomeriggioAssignment && !ganttAssignment;
                        const hasOnlyPomeriggio = pomeriggioAssignment && !mattinoAssignment && !ganttAssignment;
                        const hasTrueHalfSplit = !ganttAssignment && mattinoAssignment && pomeriggioAssignment && mattinoAssignment.id !== pomeriggioAssignment.id;
                        const isSplit = hasTrueHalfSplit;

                        // The assignment that drives the overlay bar for partial cells
                        // hasSameHalfAssignment: same assignment in both half-slots → treat as full-day bar
                        const partialBarAssignment = hasSameHalfAssignment ? mattinoAssignment : hasOnlyMattino ? mattinoAssignment : hasOnlyPomeriggio ? pomeriggioAssignment : null;
                        const partialBarSlot = hasSameHalfAssignment ? null : hasOnlyMattino ? "mattino" : hasOnlyPomeriggio ? "pomeriggio" : null;

                        const primaryAssignment = ganttAssignment ?? mattinoAssignment ?? pomeriggioAssignment ?? null;

                        const ganttBarColor = ganttAssignment ? (ACTIVITY_COLORS[ganttAssignment.activityType as ActivityType] || "#6B7280") : null;
                        const ganttBorderColor = "#F97316";

                        const prevSlots = prevGroup ? (ganttByDateAndCapo[prevGroup.dateStr]?.[capo.id] ?? {}) : {};
                        const nextSlots = nextGroup ? (ganttByDateAndCapo[nextGroup.dateStr]?.[capo.id] ?? {}) : {};

                        // When isSplit, check if the mattino half is a continuation of a multi-day bar from prev day.
                        // If so, we expose the mattino assignment as the bar assignment so the overlay can extend through it.
                        const prevHasMattinoInSplit = isSplit && mattinoAssignment
                          ? [prevSlots.full, prevSlots.mattino, prevSlots.pomeriggio].some(a => a?.id === mattinoAssignment.id)
                          : false;

                        // Determine the overlay assignment for this cell (full-day or partial).
                        // When isSplit and the mattino is a continuation of a multi-day bar, expose mattino assignment
                        // so the overlay system can extend the bar through the mattino half of this split cell.
                        const barAssignment = ganttAssignment ?? (prevHasMattinoInSplit ? mattinoAssignment : partialBarAssignment);
                        // In a split-continuation cell the bar slot is "mattino" (ends at half-cell)
                        const effectiveBarSlot = prevHasMattinoInSplit ? "mattino" : partialBarSlot;

                        // Check continuity by looking for barAssignment.id in any slot of prev/next day
                        const prevHasSameAssignment = barAssignment
                          ? [prevSlots.full, prevSlots.mattino, prevSlots.pomeriggio].some(a => a?.id === barAssignment.id)
                          : false;
                        const nextHasSameAssignment = barAssignment
                          ? [nextSlots.full, nextSlots.mattino, nextSlots.pomeriggio].some(a => a?.id === barAssignment.id)
                          : false;

                        const isBarStart = !barAssignment || !prevHasSameAssignment;
                        const isBarEnd = !barAssignment || !nextHasSameAssignment;

                        const isExternalCapo = capo.isInternal === false;
                        const firstExtIdx = capisquadra.findIndex(c => c.isInternal === false);
                        const isFirstExt = firstExtIdx >= 0 && capoIdx === firstExtIdx;
                        const isLastInt = firstExtIdx > 0 && capoIdx === firstExtIdx - 1;
                        const ganttWA = primaryAssignment ? ((primaryAssignment.workerAssignments as unknown as Record<string, Record<string, string[]>>) || {}) : {};
                        const ganttDaySlot = ganttWA[group.dateStr] || {};
                        const assignedWorkerIds: string[] = ganttDaySlot[capo.id] || [];
                        const assignedWorkers = assignedWorkerIds.map(id => workersMap.get(id)).filter(Boolean) as Worker[];
                        const workersInDefaultGroup = workers.filter(w => w.isActive && !w.isCaposquadra && w.defaultCapoId === capo.id && !assignedWorkerIds.includes(w.id));
                        const workersWithoutGroup = workers.filter(w => w.isActive && !w.isCaposquadra && !w.defaultCapoId && !assignedWorkerIds.includes(w.id));
                        const availableWorkers = [...workersInDefaultGroup, ...workersWithoutGroup];
                        const externalCounts = primaryAssignment?.externalWorkerCounts ?? null;
                        const externalCount = externalCounts?.[capo.id]?.[group.dateStr] ?? 0;
                        const externalContactedMap = (primaryAssignment?.externalTeamContacted as Record<string, Record<string, boolean>> | null | undefined) ?? null;
                        const isContacted = externalContactedMap?.[capo.id]?.[group.dateStr] ?? false;
                        const departureTimes = (primaryAssignment?.teamDepartureTimes as Record<string, Record<string, string>> | null | undefined) ?? null;
                        const departureTime = departureTimes?.[capo.id]?.[group.dateStr] ?? "";
                        const freeNumbers = (primaryAssignment?.teamFreeNumbers as Record<string, Record<string, number>> | null | undefined) ?? null;
                        const freeNumber = freeNumbers?.[capo.id]?.[group.dateStr] ?? "";
                        const teamNotesMap = (primaryAssignment?.teamNotes as Record<string, Record<string, string>> | null | undefined) ?? null;
                        const teamNote = teamNotesMap?.[capo.id]?.[group.dateStr] ?? "";
                        const teamNoteColorsMap = (primaryAssignment?.teamNoteColors as Record<string, Record<string, string>> | null | undefined) ?? null;
                        const teamNoteColor = teamNoteColorsMap?.[capo.id]?.[group.dateStr] ?? "";
                        const noteKey = `${primaryAssignment?.id}-${capo.id}-${group.dateStr}`;

                        const teamNoteField = primaryAssignment ? (
                          <div className="flex-1 flex flex-col items-center justify-center px-1">
                            <TeamNoteField
                              noteKey={noteKey}
                              initialNote={teamNote}
                              initialColor={teamNoteColor}
                              onSave={(val) => {
                                if (readOnly) return;
                                const current = teamNotesMap || {};
                                const capoMap = { ...(current[capo.id] || {}) };
                                if (val) capoMap[group.dateStr] = val;
                                else delete capoMap[group.dateStr];
                                onUpdateTeamNotes(primaryAssignment.id, { ...current, [capo.id]: capoMap });
                              }}
                              onSaveColor={(color) => {
                                if (readOnly) return;
                                const current = teamNoteColorsMap || {};
                                const capoMap = { ...(current[capo.id] || {}) };
                                if (color) capoMap[group.dateStr] = color;
                                else delete capoMap[group.dateStr];
                                onUpdateTeamNoteColors(primaryAssignment.id, { ...current, [capo.id]: capoMap });
                              }}
                              capoId={capo.id}
                              dateStr={group.dateStr}
                            />
                          </div>
                        ) : null;

                        const workerBottomFields = primaryAssignment && !isExternalCapo ? (
                          <div className="flex flex-col items-center gap-0 px-1 pb-0.5">
                            <input
                              type="time"
                              className="w-[56px] bg-transparent border-none text-xs font-bold outline-none px-0.5 py-0 text-center appearance-none [&::-webkit-calendar-picker-indicator]:hidden"
                              defaultValue={departureTime}
                              readOnly={readOnly}
                              onBlur={(e) => {
                                if (readOnly) return;
                                const val = e.target.value;
                                const current = departureTimes || {};
                                const capoMap = { ...(current[capo.id] || {}) };
                                if (val) capoMap[group.dateStr] = val;
                                else delete capoMap[group.dateStr];
                                onUpdateTeamDepartureTimes(primaryAssignment.id, { ...current, [capo.id]: capoMap });
                              }}
                              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              data-testid={`departure-time-${capo.id}-${group.dateStr}`}
                            />
                            <input
                              type="number"
                              min={0}
                              className="w-10 bg-gray-700 text-white border border-gray-600 rounded text-xs font-bold outline-none focus:border-primary px-0.5 py-0 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              defaultValue={freeNumber !== "" ? freeNumber : ""}
                              placeholder="#"
                              readOnly={readOnly}
                              onBlur={(e) => {
                                if (readOnly) return;
                                const val = parseInt(e.target.value, 10);
                                const current = freeNumbers || {};
                                const capoMap = { ...(current[capo.id] || {}) };
                                if (!isNaN(val)) capoMap[group.dateStr] = val;
                                else delete capoMap[group.dateStr];
                                onUpdateTeamFreeNumbers(primaryAssignment.id, { ...current, [capo.id]: capoMap });
                              }}
                              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              data-testid={`free-number-${capo.id}-${group.dateStr}`}
                            />
                          </div>
                        ) : null;

                        return [
                          <td
                            key={`${capo.id}-workers`}
                            rowSpan={rowCount}
                            className={`p-0 border-t-2 border-t-black dark:border-t-white${isFirstExt ? " border-l-2 border-l-black dark:border-l-white" : ""}`}
                            style={{ width: TEAM_WORKERS_W, minWidth: TEAM_WORKERS_W, verticalAlign: "top", height: "1px" }}
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`capo-workers-${group.dateStr}-${capo.id}`}
                          >
                            <div className="flex flex-col justify-between h-full" style={{ padding: "5px" }}>
                              {primaryAssignment && (
                                isExternalCapo ? (
                                  <div className="flex items-center justify-end py-0.5 pr-1">
                                    <input
                                      type="number"
                                      min={0}
                                      className="w-10 text-right bg-transparent text-xs outline-none"
                                      defaultValue={externalCount || ""}
                                      placeholder="N"
                                      readOnly={readOnly}
                                      onBlur={(e) => {
                                        if (readOnly) return;
                                        const val = parseInt(e.target.value, 10);
                                        const newCount = isNaN(val) ? 0 : val;
                                        const currentCounts = externalCounts || {};
                                        const capoMap = { ...(currentCounts[capo.id] || {}) };
                                        capoMap[group.dateStr] = newCount;
                                        onUpdateExternalCounts(primaryAssignment.id, { ...currentCounts, [capo.id]: capoMap });
                                      }}
                                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                      data-testid={`external-count-${capo.id}-${group.dateStr}`}
                                    />
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-0 pl-0 pr-1 py-0 items-end">
                                    {assignedWorkers.map((w) => (
                                      <div key={w.id} className="relative flex items-center justify-end gap-0 group/chip">
                                        <span className="text-xs leading-tight truncate flex-1 text-right">{w.name}</span>
                                        <button
                                          className="opacity-0 group-hover/chip:opacity-100 transition-opacity w-3 h-3 flex items-center justify-center text-muted-foreground hover:text-destructive flex-shrink-0 absolute right-full"
                                          onClick={() => {
                                            if (readOnly) return;
                                            onUpdateWorkerAssignments(primaryAssignment.id, { ...ganttWA, [group.dateStr]: { ...ganttDaySlot, [capo.id]: assignedWorkerIds.filter(id => id !== w.id) } });
                                          }}
                                          data-testid={`worker-remove-${w.id}-${capo.id}-${group.dateStr}`}
                                          disabled={readOnly}
                                        >
                                          <X className="w-2.5 h-2.5" />
                                        </button>
                                      </div>
                                    ))}
                                    {availableWorkers.length > 0 && !readOnly && (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <button
                                            className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground mt-0.5 ml-auto"
                                            data-testid={`worker-add-btn-${capo.id}-${group.dateStr}`}
                                          >
                                            <Plus className="w-3 h-3" />
                                          </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start" className="z-50">
                                          {workersInDefaultGroup.length > 0 && workersWithoutGroup.length > 0 && (
                                            <div className="px-2 py-1 text-[10px] text-muted-foreground font-semibold">Squadra predefinita</div>
                                          )}
                                          {workersInDefaultGroup.map((w) => (
                                            <DropdownMenuItem
                                              key={w.id}
                                              onClick={() => {
                                                onUpdateWorkerAssignments(primaryAssignment.id, { ...ganttWA, [group.dateStr]: { ...ganttDaySlot, [capo.id]: [...assignedWorkerIds, w.id] } });
                                              }}
                                              data-testid={`worker-add-${w.id}-${capo.id}-${group.dateStr}`}
                                            >
                                              {w.name}
                                            </DropdownMenuItem>
                                          ))}
                                          {workersInDefaultGroup.length > 0 && workersWithoutGroup.length > 0 && (
                                            <div className="px-2 py-1 text-[10px] text-muted-foreground font-semibold border-t mt-1">Senza gruppo</div>
                                          )}
                                          {workersWithoutGroup.map((w) => (
                                            <DropdownMenuItem
                                              key={w.id}
                                              onClick={() => {
                                                onUpdateWorkerAssignments(primaryAssignment.id, { ...ganttWA, [group.dateStr]: { ...ganttDaySlot, [capo.id]: [...assignedWorkerIds, w.id] } });
                                              }}
                                              data-testid={`worker-add-${w.id}-${capo.id}-${group.dateStr}`}
                                            >
                                              {w.name}
                                            </DropdownMenuItem>
                                          ))}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    )}
                                  </div>
                                )
                              )}
                              {teamNoteField}
                              {workerBottomFields}
                              {!readOnly && isExternalCapo && primaryAssignment && (
                                <div className="flex items-center justify-end pr-1 pb-0.5">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const newVal = !isContacted;
                                      const currentContacted = externalContactedMap || {};
                                      const capoMap = { ...(currentContacted[capo.id] || {}) };
                                      capoMap[group.dateStr] = newVal;
                                      onUpdateExternalContacted(primaryAssignment.id, { ...currentContacted, [capo.id]: capoMap });
                                    }}
                                    className="w-3.5 h-3.5 border border-current flex-shrink-0 focus:outline-none"
                                    style={{ background: isContacted ? "currentColor" : "white" }}
                                    data-testid={`external-contacted-${capo.id}-${group.dateStr}`}
                                    title="Sentita"
                                  />
                                </div>
                              )}
                            </div>
                          </td>,
                          <td
                            key={`${capo.id}-bar`}
                            rowSpan={rowCount}
                            className={`p-0 relative align-top border-t-2 border-t-black dark:border-t-white${isLastInt ? "" : " border-r"}${primaryAssignment ? " cursor-pointer" : ""}`}
                            style={{ width: TEAM_BAR_W, minWidth: TEAM_BAR_W }}
                            onClick={isSplit ? (e) => e.stopPropagation() : (barAssignment ? (e) => {
                              e.stopPropagation();
                              onEditAssignment(barAssignment);
                            } : (e) => e.stopPropagation())}
                            data-testid={`capo-bar-${group.dateStr}-${capo.id}`}
                            data-bar-capo={capo.id}
                            data-bar-assignment={barAssignment?.id || ""}
                            data-bar-start={isBarStart ? "1" : ""}
                            data-bar-slot={effectiveBarSlot || ""}
                            data-bar-label={isBarStart && barAssignment ? (() => {
                              if (barAssignment.activityType === "FERIE_PIOGGIA_VARIE") {
                                return barAssignment.clientName || "Ferie/Pioggia/Varie";
                              }
                              const p = barAssignment.projectId ? projectsMap.get(barAssignment.projectId) : null;
                              const matSigla = barAssignment.projectId ? projectMaterialMap.get(barAssignment.projectId) : null;
                              return [barAssignment.clientName, p?.quoteNumber, matSigla, p?.assignedTechnician?.firstName].filter(Boolean).join(" - ") || (barAssignment.activityType === "MONTAGGIO" ? "M" : barAssignment.activityType === "SMONTAGGIO" ? "S" : barAssignment.activityType === "MANUTENZIONE" ? "M" : "M/S");
                            })() : ""}
                            data-bar-label-color={isBarStart && barAssignment && barAssignment.activityType === "FERIE_PIOGGIA_VARIE" ? "#000" : ""}
                            data-bar-has-border={isBarStart && barAssignment && barAssignment.activityType !== "FERIE_PIOGGIA_VARIE" ? "1" : ""}
                          >
                            {!isSplit && barAssignment && (() => {
                              const barColor = ACTIVITY_COLORS[barAssignment.activityType as ActivityType] || "#6B7280";
                              const barBorderColor = "#F97316";
                              const isFerieType = barAssignment.activityType === "FERIE_PIOGGIA_VARIE";
                              // For partial cells, render only the appropriate half of the cell
                              const topVal = partialBarSlot === "pomeriggio" ? "50%" : (isBarStart ? 0 : -1);
                              const bottomVal = partialBarSlot === "mattino" ? "50%" : (isBarEnd ? 0 : -1);
                              // For ferie bars, use -1 on intermediate cells (same as other bars) to cover cell borders
                              const ferieTopVal = partialBarSlot === "pomeriggio" ? "50%" : (isBarStart ? 0 : -1);
                              const ferieBottomVal = partialBarSlot === "mattino" ? "50%" : (isBarEnd ? 0 : -1);
                              return (
                                <>
                                  <div
                                    className={`overflow-hidden ${isBarStart ? "rounded-t" : ""} ${isBarEnd ? "rounded-b" : ""}`}
                                    style={{
                                      backgroundColor: barColor,
                                      position: "absolute",
                                      top: isFerieType ? ferieTopVal : topVal,
                                      bottom: isFerieType ? ferieBottomVal : bottomVal,
                                      left: 2,
                                      right: 0,
                                      zIndex: 1,
                                    }}
                                  >
                                    {!isFerieType && (
                                      <div
                                        style={{
                                          backgroundColor: barBorderColor,
                                          position: "absolute",
                                          top: 0,
                                          bottom: 0,
                                          left: 0,
                                          width: 5,
                                          zIndex: 2,
                                        }}
                                      />
                                    )}
                                  </div>
                                </>
                              );
                            })()}
                            {isSplit && (
                              <>
                                {mattinoAssignment && (() => {
                                  const color = ACTIVITY_COLORS[mattinoAssignment.activityType as ActivityType] || "#6B7280";
                                  const project = mattinoAssignment.projectId ? projectsMap.get(mattinoAssignment.projectId) : null;
                                  const borderColor = "#F97316";
                                  const mattinoMatSigla = mattinoAssignment.projectId ? projectMaterialMap.get(mattinoAssignment.projectId) : null;
                                  const label = mattinoAssignment.activityType === "FERIE_PIOGGIA_VARIE"
                                    ? (mattinoAssignment.clientName || "Ferie/Pioggia/Varie")
                                    : ([mattinoAssignment.clientName, project?.quoteNumber, mattinoMatSigla].filter(Boolean).join(" - ") || (mattinoAssignment.activityType === "MONTAGGIO" ? "M" : mattinoAssignment.activityType === "SMONTAGGIO" ? "S" : mattinoAssignment.activityType === "MANUTENZIONE" ? "M" : "M/S"));
                                  const textColor = mattinoAssignment.activityType === "FERIE_PIOGGIA_VARIE" ? "#000" : "white";
                                  const prevHasMattinoAssignment = [prevSlots.full, prevSlots.mattino, prevSlots.pomeriggio].some(a => a?.id === mattinoAssignment.id);
                                  const mattinoRoundedTop = !prevHasMattinoAssignment;
                                  const isMattinoFerie = mattinoAssignment.activityType === "FERIE_PIOGGIA_VARIE";
                                  return (
                                    <div
                                      className={`cursor-pointer overflow-hidden ${isBarStart ? "rounded-t" : ""} ${isBarEnd ? "rounded-b" : ""}`}
                                      style={{ backgroundColor: color, position: "absolute", top: mattinoRoundedTop ? 0 : -1, bottom: "calc(50% + 1px)", left: 2, right: 0, zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
                                      onClick={(e) => { e.stopPropagation(); onEditAssignment(mattinoAssignment); }}
                                    >
                                      {!isMattinoFerie && <div style={{ backgroundColor: borderColor, position: "absolute", top: 0, bottom: 0, left: 0, width: 5, zIndex: 2 }} />}
                                      {mattinoRoundedTop && <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", color: textColor, fontSize: 12, fontWeight: 400, lineHeight: 1, userSelect: "none", whiteSpace: "nowrap", zIndex: 3, position: "relative", ...(isMattinoFerie ? {} : { marginLeft: 5 }) }}>{label}</span>}
                                    </div>
                                  );
                                })()}
                                {pomeriggioAssignment && (() => {
                                  const color = ACTIVITY_COLORS[pomeriggioAssignment.activityType as ActivityType] || "#6B7280";
                                  const project = pomeriggioAssignment.projectId ? projectsMap.get(pomeriggioAssignment.projectId) : null;
                                  const borderColor = "#F97316";
                                  const pomeriggioMatSigla = pomeriggioAssignment.projectId ? projectMaterialMap.get(pomeriggioAssignment.projectId) : null;
                                  const label = pomeriggioAssignment.activityType === "FERIE_PIOGGIA_VARIE"
                                    ? (pomeriggioAssignment.clientName || "Ferie/Pioggia/Varie")
                                    : ([pomeriggioAssignment.clientName, project?.quoteNumber, pomeriggioMatSigla].filter(Boolean).join(" - ") || (pomeriggioAssignment.activityType === "MONTAGGIO" ? "M" : pomeriggioAssignment.activityType === "SMONTAGGIO" ? "S" : pomeriggioAssignment.activityType === "MANUTENZIONE" ? "M" : "M/S"));
                                  const textColor = pomeriggioAssignment.activityType === "FERIE_PIOGGIA_VARIE" ? "#000" : "white";
                                  const nextHasPomeriggioAssignment = [nextSlots.full, nextSlots.mattino, nextSlots.pomeriggio].some(a => a?.id === pomeriggioAssignment.id);
                                  const pomeriggioRoundedBottom = !nextHasPomeriggioAssignment;
                                  const isPomeriggioFerie = pomeriggioAssignment.activityType === "FERIE_PIOGGIA_VARIE";
                                  return (
                                    <div
                                      className={`cursor-pointer overflow-hidden ${isBarStart ? "rounded-t" : ""} ${isBarEnd ? "rounded-b" : ""}`}
                                      style={{ backgroundColor: color, position: "absolute", top: "calc(50% + 1px)", bottom: pomeriggioRoundedBottom ? 0 : -1, left: 2, right: 0, zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
                                      onClick={(e) => { e.stopPropagation(); onEditAssignment(pomeriggioAssignment); }}
                                    >
                                      {!isPomeriggioFerie && <div style={{ backgroundColor: borderColor, position: "absolute", top: 0, bottom: 0, left: 0, width: 5, zIndex: 2 }} />}
                                      <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", color: textColor, fontSize: 12, fontWeight: 400, lineHeight: 1, userSelect: "none", whiteSpace: "nowrap", zIndex: 3, position: "relative", ...(isPomeriggioFerie ? {} : { marginLeft: 5 }) }}>{label}</span>
                                    </div>
                                  );
                                })()}
                              </>
                            )}
                          </td>,
                        ];
                      })}
                      {isFirstRow && draftColumns.map((colDrafts, colIdx) => {
                        const dateStr = group.dateStr;
                        const draft = colDrafts.find((d) => {
                          const dStart = parseDateStr(d.date);
                          const dEnd = d.endDate ? parseDateStr(d.endDate) : dStart;
                          return dateStr >= dStart && dateStr <= dEnd;
                        }) || null;
                        const draftStart = draft ? parseDateStr(draft.date) : null;
                        const draftEnd = draft ? (draft.endDate ? parseDateStr(draft.endDate) : draftStart) : null;
                        const isInRange = draft !== null;
                        const prevDateStr = formatDateForApi(addDays(group.date, -1));
                        const prevInRange = draft ? prevDateStr >= draftStart! && prevDateStr <= draftEnd! && weekDays.some(d => formatDateForApi(d) === prevDateStr) : false;
                        const isBarStart = isInRange && !prevInRange;
                        const isBarEnd = isInRange && dateStr === draftEnd;
                        const draftLabel = draft ? (draft.clientName || "Bozza") : "";
                        const draftColor = draft ? (ACTIVITY_COLORS[draft.activityType as ActivityType] || "#78716C") : "#78716C";
                        const draftBorderColor = "#F97316";

                        return (
                          <td
                            key={`draft-col-${colIdx}`}
                            rowSpan={rowCount}
                            className="p-0 relative align-top border-r border-t-2 border-t-black dark:border-t-white cursor-pointer"
                            style={{ width: DRAFT_COL_W, minWidth: DRAFT_COL_W, borderLeft: colIdx === 0 ? "3px solid #111" : undefined }}
                            onClick={(e) => { e.stopPropagation(); if (draft) onEditAssignment(draft); }}
                            data-testid={`draft-bar-${group.dateStr}-col-${colIdx}`}
                          >
                            {isInRange && (
                              <div
                                className={`overflow-hidden ${isBarStart ? "rounded-t" : ""} ${isBarEnd ? "rounded-b" : ""}`}
                                style={{
                                  backgroundColor: draftColor,
                                  position: "absolute",
                                  top: isBarStart ? 0 : -1,
                                  bottom: isBarEnd ? 0 : -1,
                                  left: 2,
                                  right: 0,
                                  zIndex: 1,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <div
                                  style={{
                                    backgroundColor: draftBorderColor,
                                    position: "absolute",
                                    top: 0,
                                    bottom: 0,
                                    left: 0,
                                    width: 5,
                                    zIndex: 2,
                                  }}
                                />
                                {isBarStart && (
                                  <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", color: "white", fontSize: 12, fontWeight: 400, lineHeight: 1, userSelect: "none", whiteSpace: "nowrap", zIndex: 3, position: "relative", overflow: "hidden", maxHeight: "100%", marginLeft: 5 }}>
                                    {draftLabel}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                });
              })}

              {flatRows.length === 0 && (
                <tr>
                  <td colSpan={15 + capisquadra.length * 2 + draftAssignments.length} className="text-center py-12 text-muted-foreground">
                    <div className="space-y-2">
                      <CalendarDays className="w-10 h-10 mx-auto opacity-30" />
                      <p className="text-sm">Nessuna attività in questo periodo</p>
                      <p className="text-xs">Clicca "Nuova Attività" per iniziare</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div ref={bottomSentinelRef} className="h-1" data-testid="sentinel-bottom" />
        </div>
      </div>

      {moveToDayModal && (() => {
        const otherGroups = dayGroups.filter(g => g.dateStr !== moveToDayModal.currentDateStr);
        const DAY_NAMES_FULL = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
        const MONTH_NAMES_FULL = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setMoveToDayModal(null)}
            data-testid="modal-move-to-day-overlay"
          >
            <div
              className="bg-card border rounded-lg shadow-xl w-72 max-h-[70vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
              data-testid="modal-move-to-day"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <span className="font-semibold text-sm">Sposta al giorno</span>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setMoveToDayModal(null)}
                  data-testid="btn-move-to-day-close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 py-1">
                {otherGroups.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Nessun altro giorno disponibile</p>
                ) : (
                  otherGroups.map((g) => {
                    const targetAssignmentCount = g.rows.filter(r => r.assignment && parseDateStr(r.assignment.date) === g.dateStr).length;
                    const labelDay = `${DAY_NAMES_FULL[g.date.getDay()]} ${g.date.getDate()} ${MONTH_NAMES_FULL[g.date.getMonth()]}`;
                    return (
                      <button
                        key={g.dateStr}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-muted/60 transition-colors"
                        onClick={() => {
                          if (!readOnly) {
                            onMoveAssignment(moveToDayModal.assignmentId, targetAssignmentCount, g.dateStr);
                          }
                          setMoveToDayModal(null);
                        }}
                        data-testid={`btn-move-to-day-option-${g.dateStr}`}
                      >
                        {labelDay}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </Card>
  );
}

function PersoneTab({
  workers,
  onAdd,
  onToggleCaposquadra,
  onToggleInternal,
  onSetDefaultCapo,
  onToggleActive,
  onDelete,
  onRename,
  onColorChange,
  onMoveUp,
  onMoveDown,
  onUpdateCity,
  readOnly,
}: {
  workers: Worker[];
  onAdd: (name: string, isCaposquadra: boolean) => void;
  onToggleCaposquadra: (id: string, val: boolean) => void;
  onToggleInternal: (id: string, val: boolean) => void;
  onSetDefaultCapo: (id: string, capoId: string | null) => void;
  onToggleActive: (id: string, val: boolean) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onColorChange: (id: string, color: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onUpdateCity: (id: string, city: string) => void;
  readOnly?: boolean;
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingCityId, setEditingCityId] = useState<string | null>(null);
  const [editingCity, setEditingCity] = useState("");
  const citySavedRef = useRef(false);

  function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onAdd(trimmed, false);
    setNewName("");
  }

  const capisquadraList = workers.filter((w) => w.isCaposquadra);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-semibold">Persone</h2>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Nome persona..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            className="h-8 w-48"
            data-testid="input-new-worker"
          />
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={!newName.trim() || readOnly}
            data-testid="button-add-worker"
          >
            <Plus className="w-4 h-4 mr-1" />
            Aggiungi
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        {workers.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="text-no-workers">
            Nessuna persona. Aggiungi la prima persona per iniziare.
          </p>
        )}
        {workers.map((worker) => {
          const isCapo = worker.isCaposquadra;
          const capoIdx = capisquadraList.findIndex((w) => w.id === worker.id);
          const isFirstCapo = isCapo && capoIdx === 0;
          const isLastCapo = isCapo && capoIdx === capisquadraList.length - 1;

          return (
            <div
              key={worker.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-md border ${!worker.isActive ? "opacity-50" : ""}`}
              data-testid={`row-worker-${worker.id}`}
            >
              <div className="relative flex-shrink-0 group">
                <div
                  className="w-3 h-3 rounded-full cursor-pointer ring-1 ring-transparent group-hover:ring-border transition-all"
                  style={{ backgroundColor: worker.color }}
                  title="Clicca per cambiare colore"
                  onClick={() => {
                    const input = document.getElementById(`color-picker-${worker.id}`) as HTMLInputElement | null;
                    input?.click();
                  }}
                  data-testid={`dot-color-${worker.id}`}
                />
                <input
                  id={`color-picker-${worker.id}`}
                  type="color"
                  className="absolute opacity-0 w-0 h-0 pointer-events-none"
                  value={worker.color || "#4563FF"}
                  onChange={(e) => onColorChange(worker.id, e.target.value)}
                  data-testid={`input-color-${worker.id}`}
                />
              </div>

              {editingId === worker.id ? (
                <input
                  className="flex-1 bg-transparent border-b border-border outline-none text-sm"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const trimmed = editingName.trim();
                      if (trimmed) onRename(worker.id, trimmed);
                      setEditingId(null);
                    }
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onBlur={() => {
                    const trimmed = editingName.trim();
                    if (trimmed && trimmed !== worker.name) onRename(worker.id, trimmed);
                    setEditingId(null);
                  }}
                  data-testid={`input-rename-worker-${worker.id}`}
                />
              ) : (
                <span
                  className="flex-1 text-sm font-medium cursor-pointer hover:underline"
                  onDoubleClick={() => { setEditingId(worker.id); setEditingName(worker.name); }}
                  data-testid={`text-worker-name-${worker.id}`}
                >
                  {worker.name}
                </span>
              )}

              <button
                className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border transition-colors ${
                  worker.isCaposquadra
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-transparent text-muted-foreground border-border hover:border-primary hover:text-primary"
                } ${readOnly ? "opacity-50 cursor-not-allowed" : ""}`}
                onClick={() => !readOnly && onToggleCaposquadra(worker.id, !worker.isCaposquadra)}
                title={worker.isCaposquadra ? "Rimuovi tag Caposquadra" : "Assegna tag Caposquadra"}
                data-testid={`toggle-caposquadra-${worker.id}`}
              >
                Caposquadra
              </button>

              {isCapo && (
                <>
                  <button
                    className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border transition-colors ${
                      worker.isInternal !== false
                        ? "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700"
                        : "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700"
                    }`}
                    onClick={() => onToggleInternal(worker.id, worker.isInternal === false)}
                    title={worker.isInternal !== false ? "Segna come Esterno (P.IVA)" : "Segna come Interno (dipendente)"}
                    data-testid={`toggle-internal-${worker.id}`}
                  >
                    {worker.isInternal !== false ? "INT" : "EST"}
                  </button>
                  <div className="flex flex-col gap-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-5 h-4 p-0"
                      disabled={isFirstCapo || readOnly}
                      onClick={() => onMoveUp(worker.id)}
                      title="Sposta su"
                      data-testid={`button-move-up-${worker.id}`}
                    >
                      <ChevronUp className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-5 h-4 p-0"
                      disabled={isLastCapo || readOnly}
                      onClick={() => onMoveDown(worker.id)}
                      title="Sposta giù"
                      data-testid={`button-move-down-${worker.id}`}
                    >
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </div>
                </>
              )}

              {!isCapo && (
                <select
                  className="text-xs border border-border rounded px-1 py-0.5 bg-background text-foreground max-w-[120px]"
                  value={worker.defaultCapoId || ""}
                  onChange={(e) => onSetDefaultCapo(worker.id, e.target.value || null)}
                  title="Squadra predefinita"
                  data-testid={`select-default-capo-${worker.id}`}
                >
                  <option value="">Nessuna squadra</option>
                  {capisquadraList.filter(c => c.isInternal !== false).map((capo) => (
                    <option key={capo.id} value={capo.id}>{capo.name}</option>
                  ))}
                </select>
              )}

              {worker.isInternal === false && (
                editingCityId === worker.id ? (
                  <input
                    className="text-xs border border-border rounded px-1 py-0.5 bg-background text-foreground w-28 outline-none"
                    value={editingCity}
                    placeholder="Città..."
                    autoFocus
                    onChange={(e) => setEditingCity(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        citySavedRef.current = true;
                        onUpdateCity(worker.id, editingCity.trim());
                        setEditingCityId(null);
                      }
                      if (e.key === "Escape") {
                        citySavedRef.current = true;
                        setEditingCityId(null);
                      }
                    }}
                    onBlur={() => {
                      if (!citySavedRef.current) {
                        onUpdateCity(worker.id, editingCity.trim());
                      }
                      citySavedRef.current = false;
                      setEditingCityId(null);
                    }}
                    data-testid={`input-city-${worker.id}`}
                  />
                ) : (
                  <button
                    className="text-xs border border-border rounded px-1 py-0.5 bg-background text-foreground w-28 text-left truncate hover:border-primary"
                    onClick={() => { setEditingCityId(worker.id); setEditingCity(worker.city || ""); }}
                    title="Clicca per modificare la città"
                    data-testid={`button-city-${worker.id}`}
                  >
                    {worker.city ? worker.city : <span className="text-muted-foreground italic">Città...</span>}
                  </button>
                )
              )}

              <button
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-transparent hover:border-border"
                onClick={() => onToggleActive(worker.id, !worker.isActive)}
                title={worker.isActive ? "Disattiva" : "Riattiva"}
                data-testid={`toggle-active-${worker.id}`}
              >
                {worker.isActive ? "Attivo" : "Inattivo"}
              </button>

              <Button
                variant="ghost"
                size="icon"
                className="w-7 h-7"
                onClick={() => { setEditingId(worker.id); setEditingName(worker.name); }}
                data-testid={`button-rename-worker-${worker.id}`}
                disabled={readOnly}
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="w-7 h-7"
                onClick={() => onDelete(worker.id)}
                data-testid={`button-delete-worker-${worker.id}`}
                disabled={readOnly}
              >
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamCard({
  team,
  members,
  onEdit,
  onDelete,
  onAddMember,
  onUpdateMember,
  onDeleteMember,
}: {
  team: Team;
  members: TeamMember[];
  onEdit: () => void;
  onDelete: () => void;
  onAddMember: (name: string) => void;
  onUpdateMember: (id: string, name: string) => void;
  onDeleteMember: (id: string) => void;
}) {
  const [newMemberName, setNewMemberName] = useState("");
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingMemberName, setEditingMemberName] = useState("");

  function handleAddMember() {
    const trimmed = newMemberName.trim();
    if (!trimmed) return;
    onAddMember(trimmed);
    setNewMemberName("");
  }

  function handleStartEdit(member: TeamMember) {
    setEditingMemberId(member.id);
    setEditingMemberName(member.name);
  }

  function handleSaveEdit(id: string) {
    const trimmed = editingMemberName.trim();
    if (trimmed) onUpdateMember(id, trimmed);
    setEditingMemberId(null);
  }

  return (
    <Card className="p-4" data-testid={`card-team-${team.id}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
          <div className="min-w-0">
            <span className="font-medium truncate block" data-testid={`text-team-name-${team.id}`}>{team.name}</span>
            {team.paese && (
              <span className="text-xs text-muted-foreground truncate block" data-testid={`text-team-paese-${team.id}`}>{team.paese}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit} data-testid={`button-edit-team-${team.id}`}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} data-testid={`button-delete-team-${team.id}`}>
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="space-y-1 mb-2">
        {members.map((member) => (
          <div key={member.id} className="flex items-center gap-1" data-testid={`member-row-${member.id}`}>
            {editingMemberId === member.id ? (
              <>
                <Input
                  value={editingMemberName}
                  onChange={(e) => setEditingMemberName(e.target.value)}
                  className="h-6 text-xs flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEdit(member.id);
                    if (e.key === "Escape") setEditingMemberId(null);
                  }}
                  data-testid={`input-edit-member-${member.id}`}
                />
                <Button variant="ghost" size="icon" className="w-5 h-5" onClick={() => handleSaveEdit(member.id)}>
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="icon" className="w-5 h-5" onClick={() => setEditingMemberId(null)}>
                  <X className="w-3 h-3" />
                </Button>
              </>
            ) : (
              <>
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                <span className="text-xs flex-1 truncate" data-testid={`text-member-name-${member.id}`}>{member.name}</span>
                <Button variant="ghost" size="icon" className="w-5 h-5" onClick={() => handleStartEdit(member)} data-testid={`button-edit-member-${member.id}`}>
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="icon" className="w-5 h-5" onClick={() => onDeleteMember(member.id)} data-testid={`button-delete-member-${member.id}`}>
                  <Trash2 className="w-3 h-3 text-destructive" />
                </Button>
              </>
            )}
          </div>
        ))}
        {members.length === 0 && (
          <p className="text-xs text-muted-foreground italic" data-testid={`text-no-members-${team.id}`}>
            Nessun componente
          </p>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Input
          placeholder="Nome componente..."
          value={newMemberName}
          onChange={(e) => setNewMemberName(e.target.value)}
          className="h-6 text-xs flex-1"
          onKeyDown={(e) => { if (e.key === "Enter") handleAddMember(); }}
          data-testid={`input-new-member-${team.id}`}
        />
        <Button
          variant="ghost"
          size="icon"
          className="w-6 h-6"
          onClick={handleAddMember}
          disabled={!newMemberName.trim()}
          data-testid={`button-add-member-${team.id}`}
        >
          <Plus className="w-3 h-3" />
        </Button>
      </div>
    </Card>
  );
}

function ProjectCombobox({
  projects,
  value,
  onChange,
  disabled,
}: {
  projects: EnrichedProject[];
  value: string;
  onChange: (projectId: string, project: EnrichedProject | null) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter(
      (p) =>
        (p.quoteNumber || "").toLowerCase().includes(q) ||
        (p.clientName || "").toLowerCase().includes(q) ||
        (p.siteCity || "").toLowerCase().includes(q) ||
        (p.siteProvince || "").toLowerCase().includes(q)
    );
  }, [projects, search]);

  const selectedProject = projects.find((p) => p.id === value) || null;
  const displayValue = selectedProject
    ? `${selectedProject.quoteNumber ? `${selectedProject.quoteNumber} – ` : ""}${selectedProject.clientName}`
    : "";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Input
        placeholder="Cerca per numero, cliente, città..."
        value={open ? search : displayValue}
        onChange={(e) => {
          if (disabled) return;
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (disabled) return;
          setSearch("");
          setOpen(true);
        }}
        disabled={disabled}
        data-testid="input-project-search"
        className="w-full"
      />
      {open && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-56 overflow-y-auto">
          <div
            className="px-3 py-2 text-sm cursor-pointer hover:bg-muted"
            onMouseDown={(e) => {
              e.preventDefault();
              onChange("_none", null);
              setSearch("");
              setOpen(false);
            }}
            data-testid="project-option-none"
          >
            <span className="text-muted-foreground">Nessuno</span>
          </div>
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Nessun risultato
            </div>
          )}
          {filtered.map((p) => (
            <div
              key={p.id}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-muted flex items-center gap-2"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(p.id, p);
                setSearch("");
                setOpen(false);
              }}
              data-testid={`project-option-${p.id}`}
            >
              {p.quoteNumber && (
                <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-foreground">
                  {p.quoteNumber}
                </span>
              )}
              <span className="truncate">{p.clientName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface QuoteInfoItem {
  id: string;
  phase: string;
  articleId: string;
  articleName?: string | null;
  quantity: string | number;
  totalRow: string | number;
  pricingLogic?: string | null;
}

interface QuoteInfoTransport {
  vehicleName: string;
  vehicleDescription?: string | null;
  trips: number;
}

type PdfData = { quote?: { quoteMode?: string } | null } | null | undefined;

interface QuoteInfoData {
  quote?: {
    pdfData?: PdfData;
  } | null;
  quoteItems?: QuoteInfoItem[];
  transportInfo?: QuoteInfoTransport[];
  referent?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    role: string | null;
    email: string | null;
    phone: string | null;
    mobile: string | null;
  } | null;
}

function getQuoteUnit(pricingLogic: string | null | undefined): string {
  if (pricingLogic === "RENTAL" || pricingLogic === "SALE") return "mq";
  if (pricingLogic === "DOCUMENT" || pricingLogic === "SERVICE") return "cad";
  if (pricingLogic === "TRANSPORT") return "viaggio";
  return "pz";
}

function detectQuoteModeFromData(quoteItems: QuoteInfoItem[], pdfData: PdfData): string {
  if (pdfData?.quote?.quoteMode) return pdfData.quote.quoteMode;
  const hasNoleggio = quoteItems.some((i) => i.phase === "NOLEGGIO");
  const phases = quoteItems.map((i) => i.phase);
  const hasFaseIndex = phases.some((p) => /^\d+:/.test(p));
  if (hasFaseIndex) return "phases";
  if (!hasNoleggio) return "labor_only";
  return "rental";
}

const QUOTE_MODE_LABELS: Record<string, string> = {
  rental: "Noleggio + Manodopera",
  labor_only: "Solo Manodopera",
  phases: "A Fasi",
  lump_sum: "A Corpo",
};

function calcDays(quoteItems: QuoteInfoItem[], phase: "MONTAGGIO" | "SMONTAGGIO"): number | null {
  const phaseItems = quoteItems.filter((i) => i.phase === phase);
  if (phaseItems.length === 0) return null;
  const total = phaseItems.reduce((sum, i) => {
    const row = parseFloat(String(i.totalRow || 0));
    return sum + (isNaN(row) ? 0 : row);
  }, 0);
  const movItems = quoteItems.filter((i) => i.phase === "MOVIMENTAZIONE_MAGAZZINO");
  const movTotal = movItems.reduce((sum, i) => {
    const row = parseFloat(String(i.totalRow || 0));
    return sum + (isNaN(row) ? 0 : row);
  }, 0);
  const days = (total + movTotal) / 1200;
  return Math.round(days * 10) / 10;
}

function QuoteInfoPanel({ data, isLoading }: { data: QuoteInfoData | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="rounded-lg bg-muted/40 border p-3 text-xs text-muted-foreground animate-pulse">
        Caricamento dati preventivo...
      </div>
    );
  }
  if (!data?.quote) return null;

  const quoteItems: QuoteInfoItem[] = data.quoteItems ?? [];
  const transportInfo: QuoteInfoTransport[] = data.transportInfo ?? [];
  const pdfData = data.quote?.pdfData;
  const quoteMode = detectQuoteModeFromData(quoteItems, pdfData);

  const phaseOrder = quoteMode === "labor_only"
    ? ["MONTAGGIO", "SMONTAGGIO", "DOCUMENTI"]
    : ["MONTAGGIO", "SMONTAGGIO", "NOLEGGIO", "DOCUMENTI"];
  const phaseLabels: Record<string, string> = {
    MONTAGGIO: "Montaggio",
    SMONTAGGIO: "Smontaggio",
    NOLEGGIO: "Noleggio / Fornitura",
    DOCUMENTI: "Documenti",
  };
  const groupedItems = phaseOrder
    .map((phase) => ({
      phase,
      label: phaseLabels[phase] || phase,
      items: quoteItems.filter((i: any) => i.phase === phase),
    }))
    .filter((g) => g.items.length > 0);

  const montaggioDays = calcDays(quoteItems, "MONTAGGIO");
  const smontaggioDays = calcDays(quoteItems, "SMONTAGGIO");

  return (
    <div className="rounded-lg bg-muted/40 border p-3 space-y-2" data-testid="quote-info-panel">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          {transportInfo.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Mezzi previsti</p>
              <div className="space-y-1">
                {transportInfo.map((t: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <span className="font-medium truncate">{t.vehicleName}</span>
                    <span className="text-muted-foreground ml-2 shrink-0">{t.trips} {t.trips === 1 ? "viaggio" : "viaggi"} A/R</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(montaggioDays !== null || smontaggioDays !== null) && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Giorni previsti</p>
              <div className="space-y-0.5">
                {montaggioDays !== null && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span>Montaggio</span>
                    <span className="font-medium">{montaggioDays} gg</span>
                  </div>
                )}
                {smontaggioDays !== null && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span>Smontaggio</span>
                    <span className="font-medium">{smontaggioDays} gg</span>
                  </div>
                )}
              </div>
            </div>
          )}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Tipo preventivo</p>
            <p className="text-[11px] font-medium">{QUOTE_MODE_LABELS[quoteMode] || quoteMode}</p>
          </div>
        </div>

        {groupedItems.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Articoli per fase</p>
            <div className="border rounded overflow-hidden">
              <table className="w-full text-[10px]">
                <tbody>
                  {groupedItems.map((group) => (
                    <>
                      <tr key={`h-${group.phase}`} className="bg-muted/60">
                        <td colSpan={3} className="px-1.5 py-0.5 font-semibold uppercase tracking-wide text-muted-foreground">
                          {group.label}
                        </td>
                      </tr>
                      {group.items.map((item: any) => (
                        <tr key={item.id} className="border-t">
                          <td className="px-1.5 py-0.5 truncate max-w-[100px]">{item.articleName || item.articleId}</td>
                          <td className="px-1 py-0.5 text-right">{Math.round(parseFloat(String(item.quantity)))}</td>
                          <td className="px-1 py-0.5 text-right text-muted-foreground">{getQuoteUnit(item.pricingLogic)}</td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AssignmentDialog({
  open,
  onOpenChange,
  assignment,
  preselectedDate,
  workers,
  drivers,
  vehicles,
  projects,
  allAssignments,
  onSave,
  onSaveDraft,
  onDelete,
  isPending,
  readOnly,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: DailyAssignment | null;
  preselectedDate: string | null;
  workers: Worker[];
  drivers: Driver[];
  vehicles: Vehicle[];
  projects: EnrichedProject[];
  allAssignments: DailyAssignment[];
  onSave: (data: AssignmentFormData) => void;
  onSaveDraft: (data: AssignmentFormData) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
  readOnly?: boolean;
}) {
  const defaultDate = assignment
    ? formatDateForInput(new Date(assignment.date))
    : preselectedDate || formatDateForInput(new Date());

  const defaultEndDate = assignment?.endDate
    ? formatDateForInput(new Date(assignment.endDate))
    : "";

  function parseLocalDateStr(dateStr: string): Date {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function calcDuration(startDateStr: string, endDateStr: string): number {
    if (!startDateStr || !endDateStr) return 1;
    const start = parseLocalDateStr(startDateStr);
    const end = parseLocalDateStr(endDateStr);
    const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(1, diff + 1);
  }

  const [duration, setDuration] = useState<number>(calcDuration(defaultDate, defaultEndDate));
  const [durationInput, setDurationInput] = useState<string>(String(calcDuration(defaultDate, defaultEndDate)));

  const form = useForm<AssignmentFormData>({
    resolver: zodResolver(assignmentFormSchemaWithTeam),
    defaultValues: {
      date: defaultDate,
      endDate: defaultEndDate,
      activityType: assignment?.activityType || "",
      clientName: assignment?.clientName || "",
      siteCity: assignment?.siteCity || "",
      siteProvince: assignment?.siteProvince || "",
      siteAddress: assignment?.siteAddress || "",
      scheduledTime: assignment?.scheduledTime || "",
      driverId: assignment?.driverId || "_none",
      vehicleId: assignment?.vehicleId || "_none",
      teamIds: assignment?.teamIds || [],
      assemblerCount: assignment?.assemblerCount || undefined,
      notes: assignment?.notes || "",
      projectId: assignment?.projectId || "_none",
      timeSlot: (assignment?.timeSlot as "FULL_DAY" | "MATTINO" | "POMERIGGIO") || "FULL_DAY",
      endDayTimeSlot: (assignment?.endDayTimeSlot as "FULL_DAY" | "MATTINO" | "POMERIGGIO") || "FULL_DAY",
      workingDays: assignment?.workingDays ?? [1, 2, 3, 4, 5],
      materialType: assignment?.materialType || "",
      materialQuantity: assignment?.materialQuantity ?? undefined,
      materials: assignment?.materials && (assignment.materials as Array<{ type: string; quantity: number }>).length > 0
        ? (assignment.materials as Array<{ type: string; quantity: number }>)
        : (assignment?.materialType ? [{ type: assignment.materialType, quantity: assignment.materialQuantity ?? 1 }] : [{ type: "", quantity: 0 }]),
    },
  });

  const { fields: materialFields, append: appendMaterial, remove: removeMaterial } = useFieldArray({
    control: form.control,
    name: "materials",
  });

  useEffect(() => {
    const newDate = assignment
      ? formatDateForInput(new Date(assignment.date))
      : preselectedDate || formatDateForInput(new Date());
    const newEndDate = assignment?.endDate
      ? formatDateForInput(new Date(assignment.endDate))
      : "";
    const newDuration = calcDuration(newDate, newEndDate);
    setDuration(newDuration);
    setDurationInput(String(newDuration));
    form.reset({
      date: newDate,
      endDate: newEndDate,
      activityType: assignment?.activityType || "",
      clientName: assignment?.clientName || "",
      siteCity: assignment?.siteCity || "",
      siteProvince: assignment?.siteProvince || "",
      siteAddress: assignment?.siteAddress || "",
      scheduledTime: assignment?.scheduledTime || "",
      driverId: assignment?.driverId || "_none",
      vehicleId: assignment?.vehicleId || "_none",
      teamIds: assignment?.teamIds || [],
      assemblerCount: assignment?.assemblerCount || undefined,
      notes: assignment?.notes || "",
      projectId: assignment?.projectId || "_none",
      timeSlot: (assignment?.timeSlot as "FULL_DAY" | "MATTINO" | "POMERIGGIO") || "FULL_DAY",
      endDayTimeSlot: (assignment?.endDayTimeSlot as "FULL_DAY" | "MATTINO" | "POMERIGGIO") || "FULL_DAY",
      workingDays: assignment?.workingDays ?? [1, 2, 3, 4, 5],
      materialType: assignment?.materialType || "",
      materialQuantity: assignment?.materialQuantity ?? undefined,
      materials: assignment?.materials && (assignment.materials as Array<{ type: string; quantity: number }>).length > 0
        ? (assignment.materials as Array<{ type: string; quantity: number }>)
        : (assignment?.materialType ? [{ type: assignment.materialType, quantity: assignment.materialQuantity ?? 1 }] : [{ type: "", quantity: 0 }]),
    });
    if (assignment?.projectId && assignment.projectId !== "_none") {
      const p = projects.find((pr) => pr.id === assignment.projectId);
      setMapsLink(p?.mapsLink || null);
    } else {
      setMapsLink(null);
    }
    setMapsCopied(false);
    if (open) {
      setPanelPos({ x: Math.max(0, window.innerWidth - 540), y: 80 });
    }
  }, [assignment?.id, open]);

  useEffect(() => {
    if (!open) return;
    const pid = form.getValues("projectId");
    if (pid && pid !== "_none") {
      const p = projects.find((pr) => pr.id === pid);
      if (p) setMapsLink(p.mapsLink || null);
    }
  }, [projects]);

  function addWorkingDays(startDateStr: string, days: number, workingDays: number[]): Date {
    const effectiveWorkingDays = workingDays.length > 0 ? workingDays : [1, 2, 3, 4, 5];
    const safedays = Math.max(1, days);
    const current = parseLocalDateStr(startDateStr);
    let counted = 0;
    let iterations = 0;
    const maxIterations = safedays * 14 + 30;
    while (counted < safedays && iterations < maxIterations) {
      const dow = current.getDay();
      if (effectiveWorkingDays.includes(dow) && !isItalianHoliday(current)) {
        counted++;
        if (counted >= safedays) break;
      }
      current.setDate(current.getDate() + 1);
      iterations++;
    }
    return current;
  }

  const durationStartDate = form.watch("date");
  const durationWorkingDays = form.watch("workingDays");
  useEffect(() => {
    if (!durationStartDate) return;
    const wdays = durationWorkingDays ?? [1, 2, 3, 4, 5];
    const end = addWorkingDays(durationStartDate, duration, wdays);
    form.setValue("endDate", formatDateForInput(end));
  }, [durationStartDate, duration, durationWorkingDays]);

  const [isSchedaOpen, setIsSchedaOpen] = useState(false);
  const [mapsLink, setMapsLink] = useState<string | null>(() => {
    if (assignment?.projectId && assignment.projectId !== "_none") {
      const p = projects.find((pr) => pr.id === assignment.projectId);
      return p?.mapsLink || null;
    }
    return null;
  });
  const [mapsCopied, setMapsCopied] = useState(false);
  const [showHolidayWarning, setShowHolidayWarning] = useState(false);
  const [holidayWarningNames, setHolidayWarningNames] = useState<string[]>([]);
  const [pendingSubmitData, setPendingSubmitData] = useState<AssignmentFormData | null>(null);
  const [pendingDraftData, setPendingDraftData] = useState<AssignmentFormData | null>(null);

  const activityType = form.watch("activityType") as ActivityType;

  useEffect(() => {
    if (activityType === "MANUTENZIONE") {
      setDuration(1);
      setDurationInput("1");
    }
  }, [activityType]);

  const isMontSmontaggio = activityType === "MONTAGGIO" || activityType === "SMONTAGGIO" || activityType === "MONTAGGIO_SMONTAGGIO" || activityType === "ECONOMIA";
  const isConsegnaRitiro = activityType === "CONSEGNA" || activityType === "RITIRO" || activityType === "CONSEGNA_COMBINATO" || activityType === "RITIRO_COMBINATO" || activityType === "ESUBERO" || activityType === "ESUBERO_COMBINATO" || activityType === "INTEGRAZIONE" || activityType === "INTEGRAZIONE_COMBINATO";
  const isOther = activityType === "MANUTENZIONE";
  const isFeriePioggia = activityType === "FERIE_PIOGGIA_VARIE";
  const isConsegnaType = CONSEGNA_TYPES.includes(activityType as string);
  const isSmontaggioRitiroType = SMONTAGGIO_RITIRO_TYPES.includes(activityType as string);

  const currentProjectId = form.watch("projectId");

  const hasSiteDetailsPanel = (isMontSmontaggio || isConsegnaRitiro) && currentProjectId && currentProjectId !== "_none";
  const { data: siteDetailsData, isLoading: isSiteDetailsLoading } = useQuery<QuoteInfoData>({
    queryKey: ["/api/projects", currentProjectId, "site-details"],
    enabled: !!hasSiteDetailsPanel,
  });

  const hasDeliveriesPanel = isSmontaggioRitiroType && !!currentProjectId && currentProjectId !== "_none";
  const { data: projectDeliveries = [], isLoading: isDeliveriesLoading } = useQuery<DailyAssignment[]>({
    queryKey: ["/api/projects", currentProjectId, "deliveries"],
    enabled: hasDeliveriesPanel,
  });

  const draftSentProjects = useMemo(() => {
    const filtered = projects.filter((p) => {
      const isNotRejected = p.quoteStatus === "ACCEPTED";
      return isNotRejected;
    });
    if (
      currentProjectId &&
      currentProjectId !== "_none" &&
      !filtered.some((p) => p.id === currentProjectId)
    ) {
      const current = projects.find((p) => p.id === currentProjectId);
      if (current) return [current, ...filtered];
    }
    return filtered;
  }, [projects, currentProjectId]);

  function handleProjectSelect(projectId: string, project: EnrichedProject | null) {
    form.setValue("projectId", projectId);
    if (project) {
      form.setValue("clientName", project.clientName || "");
      form.setValue("siteCity", project.siteCity || "");
      form.setValue("siteProvince", project.siteProvince || "");
      form.setValue("siteAddress", project.siteAddress || "");
      setMapsLink(project.mapsLink || null);
    } else {
      form.setValue("clientName", "");
      form.setValue("siteCity", "");
      form.setValue("siteProvince", "");
      form.setValue("siteAddress", "");
      setMapsLink(null);
    }
    setMapsCopied(false);
  }

  function parseLocalDate(dateStr: string): Date {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function checkHolidays(data: AssignmentFormData): string[] {
    const startDate = parseLocalDate(data.date);
    const endDate = data.endDate ? parseLocalDate(data.endDate) : startDate;
    return getHolidaysInRange(startDate, endDate);
  }

  function handleSubmit(data: AssignmentFormData) {
    const holidays = checkHolidays(data);
    if (holidays.length > 0) {
      setHolidayWarningNames(holidays);
      setPendingSubmitData(data);
      setPendingDraftData(null);
      setShowHolidayWarning(true);
      return;
    }
    onSave(data);
  }

  async function handleSaveDraft() {
    const result = await assignmentFormSchema.safeParseAsync(form.getValues());
    if (!result.success) {
      result.error.errors.forEach(e => {
        form.setError(e.path[0] as any, { message: e.message });
      });
      return;
    }
    const holidays = checkHolidays(result.data);
    if (holidays.length > 0) {
      setHolidayWarningNames(holidays);
      setPendingDraftData(result.data);
      setPendingSubmitData(null);
      setShowHolidayWarning(true);
      return;
    }
    onSaveDraft(result.data);
  }

  function handleHolidayConfirm() {
    setShowHolidayWarning(false);
    if (pendingSubmitData) {
      onSave(pendingSubmitData);
      setPendingSubmitData(null);
    } else if (pendingDraftData) {
      onSaveDraft(pendingDraftData);
      setPendingDraftData(null);
    }
  }

  function handleHolidayCancel() {
    setShowHolidayWarning(false);
    setPendingSubmitData(null);
    setPendingDraftData(null);
  }

  const capisquadra = workers.filter((w) => w.isCaposquadra && w.isActive);
  const currentTeamIds = form.watch("teamIds") || [];
  const singleTeamId = currentTeamIds.length > 0 ? currentTeamIds[0] : "_none";

  const watchedDate = form.watch("date");
  const watchedEndDate = form.watch("endDate");
  const watchedTimeSlot = form.watch("timeSlot");
  const watchedEndDayTimeSlot = form.watch("endDayTimeSlot");
  const conflicts = useMemo(() => {
    if (!watchedDate) return [];
    return getConflicts(
      {
        id: assignment?.id,
        activityType: activityType,
        date: watchedDate,
        endDate: watchedEndDate || null,
        timeSlot: watchedTimeSlot,
        endDayTimeSlot: watchedEndDayTimeSlot,
        teamIds: currentTeamIds,
        workerAssignments: assignment?.workerAssignments as Record<string, Record<string, string[]>> | null | undefined,
      },
      allAssignments,
      workers,
    );
  }, [watchedDate, watchedEndDate, watchedTimeSlot, watchedEndDayTimeSlot, currentTeamIds, activityType, allAssignments, assignment?.id, assignment?.workerAssignments, workers]);

  const [panelPos, setPanelPos] = useState({ x: Math.max(0, window.innerWidth - 540), y: 80 });
  const [isDraggingState, setIsDraggingState] = useState(false);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const cleanupDragRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (cleanupDragRef.current) {
        cleanupDragRef.current();
        cleanupDragRef.current = null;
      }
    };
  }, []);

  function handleDragStart(e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) {
    isDragging.current = true;
    setIsDraggingState(true);
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragOffset.current = { x: clientX - panelPos.x, y: clientY - panelPos.y };

    function onMove(ev: MouseEvent | TouchEvent) {
      if (!isDragging.current) return;
      const cx = "touches" in ev ? (ev as TouchEvent).touches[0].clientX : (ev as MouseEvent).clientX;
      const cy = "touches" in ev ? (ev as TouchEvent).touches[0].clientY : (ev as MouseEvent).clientY;
      const panelWidth = panelRef.current ? panelRef.current.offsetWidth : 520;
      const panelHeight = panelRef.current ? panelRef.current.offsetHeight : 60;
      const newX = Math.max(0, Math.min(cx - dragOffset.current.x, window.innerWidth - panelWidth));
      const newY = Math.max(0, Math.min(cy - dragOffset.current.y, window.innerHeight - panelHeight));
      setPanelPos({ x: newX, y: newY });
    }

    function onUp() {
      isDragging.current = false;
      setIsDraggingState(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
      cleanupDragRef.current = null;
    }

    function cleanup() {
      isDragging.current = false;
      setIsDraggingState(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    }

    cleanupDragRef.current = cleanup;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
  }

  if (!open) return null;

  return (
    <>
      <div
        ref={panelRef}
        data-testid="dialog-assignment"
        className="fixed z-50 bg-background border border-border rounded-xl shadow-2xl flex flex-col"
        style={{
          top: panelPos.y,
          left: panelPos.x,
          width: "min(520px, calc(100vw - 16px))",
          maxHeight: "calc(100vh - 100px)",
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-border rounded-t-xl select-none bg-muted/50"
          style={{ cursor: isDraggingState ? "grabbing" : "grab" }}
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          data-testid="drag-handle"
        >
          <div className="flex items-center gap-2">
            <GripHorizontal className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="font-semibold text-sm">{assignment ? "Modifica Attività" : "Nuova Attività"}</span>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-sm opacity-70 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring"
            data-testid="button-close-panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-4 py-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">

            <FormField
              control={form.control}
              name="activityType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo Attività</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={readOnly}>
                    <FormControl>
                      <SelectTrigger data-testid="select-activity-type">
                        <SelectValue placeholder="Seleziona tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ACTIVITY_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: ACTIVITY_COLORS[type] }}
                            />
                            {ACTIVITY_LABELS[type]}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {(isMontSmontaggio || isConsegnaRitiro) && (
              <>
                <FormField
                  control={form.control}
                  name="projectId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Offerta Numero</FormLabel>
                      <ProjectCombobox
                        projects={draftSentProjects}
                        value={field.value || "_none"}
                        onChange={handleProjectSelect}
                        disabled={readOnly}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {hasSiteDetailsPanel && (
                  <>
                    <QuoteInfoPanel
                      data={siteDetailsData}
                      isLoading={isSiteDetailsLoading}
                    />
                    {siteDetailsData?.referent && (
                      <div className="rounded-lg bg-muted/40 border p-3 space-y-1" data-testid="referent-info-panel">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Referente cantiere</p>
                        <div className="space-y-0.5">
                          {(siteDetailsData.referent.firstName || siteDetailsData.referent.lastName) && (
                            <p className="text-[11px] font-medium" data-testid="referent-name">
                              {[siteDetailsData.referent.firstName, siteDetailsData.referent.lastName].filter(Boolean).join(" ")}
                            </p>
                          )}
                          {(siteDetailsData.referent.phone || siteDetailsData.referent.mobile) && (
                            <p className="text-[11px] text-muted-foreground" data-testid="referent-phone">
                              {siteDetailsData.referent.phone || siteDetailsData.referent.mobile}
                            </p>
                          )}
                          {siteDetailsData.referent.email && (
                            <p className="text-[11px] text-muted-foreground" data-testid="referent-email">
                              {siteDetailsData.referent.email}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {isMontSmontaggio && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data Inizio</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} disabled={readOnly} data-testid="input-assignment-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormItem>
                    <FormLabel>Durata (giorni)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={durationInput}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setDurationInput(raw);
                          const parsed = parseInt(raw);
                          if (!isNaN(parsed) && parsed >= 1) {
                            setDuration(parsed);
                          }
                        }}
                        onBlur={(e) => {
                          const parsed = parseInt(e.target.value);
                          const valid = isNaN(parsed) || parsed < 1 ? 1 : parsed;
                          setDuration(valid);
                          setDurationInput(String(valid));
                        }}
                        disabled={readOnly}
                        data-testid="input-assignment-duration"
                      />
                    </FormControl>
                  </FormItem>
                </div>

                {(() => {
                  const watchedEndDate = form.watch("endDate");
                  const watchedDate = form.watch("date");
                  const isMultiDay = watchedEndDate && watchedEndDate !== "" && watchedEndDate !== watchedDate;
                  if (isMultiDay) {
                    return (
                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={form.control}
                          name="timeSlot"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Fascia primo giorno</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value} disabled={readOnly}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-time-slot">
                                    <SelectValue placeholder="Seleziona fascia" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="FULL_DAY">Intera giornata</SelectItem>
                                  <SelectItem value="MATTINO">Mattino</SelectItem>
                                  <SelectItem value="POMERIGGIO">Pomeriggio</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="endDayTimeSlot"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Fascia ultimo giorno</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value} disabled={readOnly}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-end-day-time-slot">
                                    <SelectValue placeholder="Seleziona fascia" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="FULL_DAY">Intera giornata</SelectItem>
                                  <SelectItem value="MATTINO">Mattino</SelectItem>
                                  <SelectItem value="POMERIGGIO">Pomeriggio</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    );
                  }
                  return (
                    <FormField
                      control={form.control}
                      name="timeSlot"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fascia oraria</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} disabled={readOnly}>
                            <FormControl>
                              <SelectTrigger data-testid="select-time-slot">
                                <SelectValue placeholder="Seleziona fascia" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="FULL_DAY">Intera giornata</SelectItem>
                              <SelectItem value="MATTINO">Mattino</SelectItem>
                              <SelectItem value="POMERIGGIO">Pomeriggio</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  );
                })()}

                {(() => {
                  const watchedEndDate2 = form.watch("endDate");
                  const isMultiDayForm = !!watchedEndDate2;
                  if (!isMultiDayForm) return null;
                  const currentWorkingDays = form.watch("workingDays") ?? [1, 2, 3, 4, 5];
                  const hasSaturday = currentWorkingDays.includes(6);
                  const hasSunday = currentWorkingDays.includes(0);
                  return (
                    <div className="flex gap-4">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="toggle-saturday"
                          checked={hasSaturday}
                          disabled={readOnly}
                          onCheckedChange={(checked) => {
                            const current = form.getValues("workingDays") ?? [1, 2, 3, 4, 5];
                            if (checked) {
                              form.setValue("workingDays", [...current.filter(d => d !== 6), 6]);
                            } else {
                              form.setValue("workingDays", current.filter(d => d !== 6));
                            }
                          }}
                          data-testid="toggle-working-saturday"
                        />
                        <label htmlFor="toggle-saturday" className="text-sm font-medium cursor-pointer">Lavora il Sabato</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="toggle-sunday"
                          checked={hasSunday}
                          disabled={readOnly}
                          onCheckedChange={(checked) => {
                            const current = form.getValues("workingDays") ?? [1, 2, 3, 4, 5];
                            if (checked) {
                              form.setValue("workingDays", [...current.filter(d => d !== 0), 0]);
                            } else {
                              form.setValue("workingDays", current.filter(d => d !== 0));
                            }
                          }}
                          data-testid="toggle-working-sunday"
                        />
                        <label htmlFor="toggle-sunday" className="text-sm font-medium cursor-pointer">Lavora la Domenica</label>
                      </div>
                    </div>
                  );
                })()}

                <FormField
                  control={form.control}
                  name="clientName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cliente</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome cliente" {...field} disabled={readOnly} data-testid="input-client-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div>
                  <FormLabel className="text-sm font-medium">Indirizzo Cantiere</FormLabel>
                  <div className="flex gap-2 mt-1.5">
                    <FormField
                      control={form.control}
                      name="siteCity"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input placeholder="Città" {...field} disabled={readOnly} data-testid="input-site-city" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="siteProvince"
                      render={({ field }) => (
                        <FormItem className="w-16">
                          <FormControl>
                            <Input placeholder="Prov" maxLength={2} {...field} disabled={readOnly} data-testid="input-site-province" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="siteAddress"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input placeholder="Via/Indirizzo" {...field} disabled={readOnly} data-testid="input-site-address" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {mapsLink && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <a
                        href={mapsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 dark:text-blue-400 underline truncate flex-1"
                        data-testid="link-maps"
                      >
                        {mapsLink}
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(mapsLink).then(() => {
                            setMapsCopied(true);
                            setTimeout(() => setMapsCopied(false), 2000);
                          }).catch(() => {});
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                        data-testid="button-copy-maps"
                      >
                        {mapsCopied ? "Copiato!" : "Copia"}
                      </button>
                    </div>
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="teamIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Caposquadra</FormLabel>
                      <Select
                        value={singleTeamId}
                        disabled={readOnly}
                        onValueChange={(val) => {
                          field.onChange(val === "_none" ? [] : [val]);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-team">
                            <SelectValue placeholder="Seleziona caposquadra" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">Nessuno</SelectItem>
                          {capisquadra.map((w) => (
                            <SelectItem key={w.id} value={w.id}>
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: w.color }}
                                />
                                {w.name}
                              </div>
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
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Note</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Note aggiuntive..." {...field} disabled={readOnly} data-testid="input-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {hasDeliveriesPanel && (
                  <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-3 space-y-2">
                    <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">Materiale consegnato</p>
                    {isDeliveriesLoading ? (
                      <p className="text-xs text-muted-foreground">Caricamento...</p>
                    ) : projectDeliveries.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nessuna consegna registrata per questo cantiere.</p>
                    ) : (
                      <>
                        <div className="space-y-1">
                          {projectDeliveries.map((d) => {
                            const matType = d.materialType;
                            const matQty = d.materialQuantity;
                            const dateStr = new Date(d.date).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
                            return (
                              <div key={d.id} className="text-xs flex flex-wrap gap-x-2 gap-y-0.5 text-blue-900 dark:text-blue-100">
                                <span className="font-medium">{dateStr}</span>
                                {matType && <span className="font-semibold">{matType}</span>}
                                {matQty && <span>{matQty} m</span>}
                                {d.driverId && drivers.find(dr => dr.id === d.driverId) && (
                                  <span className="text-blue-700 dark:text-blue-300">{drivers.find(dr => dr.id === d.driverId)?.name}</span>
                                )}
                                {d.vehicleId && vehicles.find(v => v.id === d.vehicleId) && (
                                  <span className="text-blue-700 dark:text-blue-300">({vehicles.find(v => v.id === d.vehicleId)?.name})</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {(() => {
                          const totals: Record<string, { qty: number; trips: number }> = {};
                          for (const d of projectDeliveries) {
                            const mt = d.materialType;
                            const mq = d.materialQuantity;
                            if (!mt) continue;
                            if (!totals[mt]) totals[mt] = { qty: 0, trips: 0 };
                            totals[mt].qty += mq || 0;
                            totals[mt].trips += 1;
                          }
                          const entries = Object.entries(totals);
                          if (entries.length === 0) return null;
                          return (
                            <div className="pt-1 border-t border-blue-200 dark:border-blue-700 flex flex-wrap gap-x-3 gap-y-0.5">
                              {entries.map(([mt, { qty, trips }]) => (
                                <span key={mt} className="text-xs font-semibold text-blue-800 dark:text-blue-200">
                                  {mt}: {qty} m ({trips} {trips === 1 ? "camion" : "camion"})
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {isConsegnaRitiro && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} disabled={readOnly} data-testid="input-assignment-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="scheduledTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Orario</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} disabled={readOnly} data-testid="input-assignment-time" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="driverId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Autista</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={readOnly}>
                          <FormControl>
                            <SelectTrigger data-testid="select-driver">
                              <SelectValue placeholder="Seleziona autista" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="_none">Nessuno</SelectItem>
                            {drivers.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.name}
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
                    name="vehicleId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mezzo</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={readOnly}>
                          <FormControl>
                            <SelectTrigger data-testid="select-vehicle">
                              <SelectValue placeholder="Seleziona mezzo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="_none">Nessuno</SelectItem>
                            {vehicles.map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.name} {v.plate ? `(${v.plate})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {isConsegnaType && (
                  <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
                    <p className="text-sm font-semibold">Materiale</p>
                    <div className="space-y-2">
                      {materialFields.map((field, index) => (
                        <div key={field.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                          <FormField
                            control={form.control}
                            name={`materials.${index}.type`}
                            render={({ field: f }) => (
                              <FormItem>
                                {index === 0 && <FormLabel>Tipo</FormLabel>}
                                <Select onValueChange={f.onChange} value={f.value || ""} disabled={readOnly}>
                                  <FormControl>
                                    <SelectTrigger data-testid={`select-material-type-${index}`}>
                                      <SelectValue placeholder="Seleziona tipo" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="_none_mat">Nessuno</SelectItem>
                                    {MATERIAL_TYPES.map((m) => (
                                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`materials.${index}.quantity`}
                            render={({ field: f }) => (
                              <FormItem>
                                {index === 0 && <FormLabel>Quantità (m)</FormLabel>}
                                <FormControl>
                                  <Input
                                    type="number"
                                    min={1}
                                    step={1}
                                    placeholder="es. 150"
                                    value={f.value > 0 ? f.value : ""}
                                    onChange={(e) => f.onChange(e.target.value ? parseInt(e.target.value) : 0)}
                                    disabled={readOnly}
                                    data-testid={`input-material-quantity-${index}`}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={index === 0 ? "mt-6" : ""}
                            onClick={() => removeMaterial(index)}
                            disabled={materialFields.length === 1 || readOnly}
                            data-testid={`button-remove-material-${index}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => appendMaterial({ type: "", quantity: 0 })}
                      disabled={readOnly}
                      data-testid="button-add-material"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Aggiungi materiale
                    </Button>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="clientName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cliente</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome cliente" {...field} disabled={readOnly} data-testid="input-client-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div>
                  <FormLabel className="text-sm font-medium">Indirizzo Cantiere</FormLabel>
                  <div className="flex gap-2 mt-1.5">
                    <FormField
                      control={form.control}
                      name="siteCity"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input placeholder="Città" {...field} disabled={readOnly} data-testid="input-site-city" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="siteProvince"
                      render={({ field }) => (
                        <FormItem className="w-16">
                          <FormControl>
                            <Input placeholder="Prov" maxLength={2} {...field} disabled={readOnly} data-testid="input-site-province" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="siteAddress"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input placeholder="Via/Indirizzo" {...field} disabled={readOnly} data-testid="input-site-address" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {mapsLink && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <a
                        href={mapsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 dark:text-blue-400 underline truncate flex-1"
                        data-testid="link-maps"
                      >
                        {mapsLink}
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(mapsLink).then(() => {
                            setMapsCopied(true);
                            setTimeout(() => setMapsCopied(false), 2000);
                          }).catch(() => {});
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                        data-testid="button-copy-maps"
                      >
                        {mapsCopied ? "Copiato!" : "Copia"}
                      </button>
                    </div>
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Note</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Note aggiuntive..." {...field} disabled={readOnly} data-testid="input-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {hasDeliveriesPanel && (
                  <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-3 space-y-2">
                    <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">Materiale consegnato</p>
                    {isDeliveriesLoading ? (
                      <p className="text-xs text-muted-foreground">Caricamento...</p>
                    ) : projectDeliveries.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nessuna consegna registrata per questo cantiere.</p>
                    ) : (
                      <>
                        <div className="space-y-1">
                          {projectDeliveries.map((d) => {
                            const matType = d.materialType;
                            const matQty = d.materialQuantity;
                            const dateStr = new Date(d.date).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
                            return (
                              <div key={d.id} className="text-xs flex flex-wrap gap-x-2 gap-y-0.5 text-blue-900 dark:text-blue-100">
                                <span className="font-medium">{dateStr}</span>
                                {matType && <span className="font-semibold">{matType}</span>}
                                {matQty && <span>{matQty} m</span>}
                                {d.driverId && drivers.find(dr => dr.id === d.driverId) && (
                                  <span className="text-blue-700 dark:text-blue-300">{drivers.find(dr => dr.id === d.driverId)?.name}</span>
                                )}
                                {d.vehicleId && vehicles.find(v => v.id === d.vehicleId) && (
                                  <span className="text-blue-700 dark:text-blue-300">({vehicles.find(v => v.id === d.vehicleId)?.name})</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {(() => {
                          const totals: Record<string, { qty: number; trips: number }> = {};
                          for (const d of projectDeliveries) {
                            const mt = d.materialType;
                            const mq = d.materialQuantity;
                            if (!mt) continue;
                            if (!totals[mt]) totals[mt] = { qty: 0, trips: 0 };
                            totals[mt].qty += mq || 0;
                            totals[mt].trips += 1;
                          }
                          const entries = Object.entries(totals);
                          if (entries.length === 0) return null;
                          return (
                            <div className="pt-1 border-t border-blue-200 dark:border-blue-700 flex flex-wrap gap-x-3 gap-y-0.5">
                              {entries.map(([mt, { qty, trips }]) => (
                                <span key={mt} className="text-xs font-semibold text-blue-800 dark:text-blue-200">
                                  {mt}: {qty} m ({trips} {trips === 1 ? "camion" : "camion"})
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {isOther && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data Inizio</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} disabled={readOnly} data-testid="input-assignment-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="scheduledTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Orario</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} disabled={readOnly} data-testid="input-assignment-time" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="driverId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Autista</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={readOnly}>
                          <FormControl>
                            <SelectTrigger data-testid="select-driver">
                              <SelectValue placeholder="Seleziona autista" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="_none">Nessuno</SelectItem>
                            {drivers.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.name}
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
                    name="vehicleId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mezzo</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={readOnly}>
                          <FormControl>
                            <SelectTrigger data-testid="select-vehicle">
                              <SelectValue placeholder="Seleziona mezzo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="_none">Nessuno</SelectItem>
                            {vehicles.map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.name} {v.plate ? `(${v.plate})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="clientName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Testo</FormLabel>
                      <FormControl>
                        <Input placeholder="Testo libero…" {...field} disabled={readOnly} data-testid="input-client-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Note</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Note aggiuntive..." {...field} disabled={readOnly} data-testid="input-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {isFeriePioggia && (
              <>
                <FormField
                  control={form.control}
                  name="clientName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descrizione</FormLabel>
                      <FormControl>
                        <Input placeholder="Es. Ferie, Pioggia, Malattia..." {...field} disabled={readOnly} data-testid="input-client-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data Inizio</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} disabled={readOnly} data-testid="input-assignment-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormItem>
                    <FormLabel>Durata (giorni)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={durationInput}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setDurationInput(raw);
                          const parsed = parseInt(raw);
                          if (!isNaN(parsed) && parsed >= 1) {
                            setDuration(parsed);
                          }
                        }}
                        onBlur={(e) => {
                          const parsed = parseInt(e.target.value);
                          const valid = isNaN(parsed) || parsed < 1 ? 1 : parsed;
                          setDuration(valid);
                          setDurationInput(String(valid));
                        }}
                        disabled={readOnly}
                        data-testid="input-assignment-duration"
                      />
                    </FormControl>
                  </FormItem>
                </div>

                {(() => {
                  const watchedEndDateFP = form.watch("endDate");
                  const watchedDateFP = form.watch("date");
                  const isMultiDayFP = watchedEndDateFP && watchedEndDateFP !== "" && watchedEndDateFP !== watchedDateFP;
                  if (isMultiDayFP) {
                    return (
                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={form.control}
                          name="timeSlot"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Fascia primo giorno</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value} disabled={readOnly}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-ferie-time-slot">
                                    <SelectValue placeholder="Seleziona fascia" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="FULL_DAY">Intera giornata</SelectItem>
                                  <SelectItem value="MATTINO">Mattino</SelectItem>
                                  <SelectItem value="POMERIGGIO">Pomeriggio</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="endDayTimeSlot"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Fascia ultimo giorno</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value} disabled={readOnly}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-ferie-end-day-time-slot">
                                    <SelectValue placeholder="Seleziona fascia" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="FULL_DAY">Intera giornata</SelectItem>
                                  <SelectItem value="MATTINO">Mattino</SelectItem>
                                  <SelectItem value="POMERIGGIO">Pomeriggio</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    );
                  }
                  return (
                    <FormField
                      control={form.control}
                      name="timeSlot"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fascia oraria</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} disabled={readOnly}>
                            <FormControl>
                              <SelectTrigger data-testid="select-ferie-time-slot">
                                <SelectValue placeholder="Seleziona fascia" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="FULL_DAY">Intera giornata</SelectItem>
                              <SelectItem value="MATTINO">Mattino</SelectItem>
                              <SelectItem value="POMERIGGIO">Pomeriggio</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  );
                })()}

                {(() => {
                  const watchedEndDateFP2 = form.watch("endDate");
                  const isMultiDayFormFP = !!watchedEndDateFP2;
                  if (!isMultiDayFormFP) return null;
                  const currentWorkingDaysFP = form.watch("workingDays") ?? [1, 2, 3, 4, 5];
                  const hasSaturdayFP = currentWorkingDaysFP.includes(6);
                  const hasSundayFP = currentWorkingDaysFP.includes(0);
                  return (
                    <div className="flex gap-4">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="toggle-saturday-ferie"
                          checked={hasSaturdayFP}
                          disabled={readOnly}
                          onCheckedChange={(checked) => {
                            const current = form.getValues("workingDays") ?? [1, 2, 3, 4, 5];
                            if (checked) {
                              form.setValue("workingDays", [...current.filter(d => d !== 6), 6]);
                            } else {
                              form.setValue("workingDays", current.filter(d => d !== 6));
                            }
                          }}
                          data-testid="toggle-ferie-working-saturday"
                        />
                        <label htmlFor="toggle-saturday-ferie" className="text-sm font-medium cursor-pointer">Lavora il Sabato</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="toggle-sunday-ferie"
                          checked={hasSundayFP}
                          disabled={readOnly}
                          onCheckedChange={(checked) => {
                            const current = form.getValues("workingDays") ?? [1, 2, 3, 4, 5];
                            if (checked) {
                              form.setValue("workingDays", [...current.filter(d => d !== 0), 0]);
                            } else {
                              form.setValue("workingDays", current.filter(d => d !== 0));
                            }
                          }}
                          data-testid="toggle-ferie-working-sunday"
                        />
                        <label htmlFor="toggle-sunday-ferie" className="text-sm font-medium cursor-pointer">Lavora la Domenica</label>
                      </div>
                    </div>
                  );
                })()}

                <FormField
                  control={form.control}
                  name="teamIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Caposquadra</FormLabel>
                      <Select
                        value={singleTeamId}
                        disabled={readOnly}
                        onValueChange={(val) => {
                          field.onChange(val === "_none" ? [] : [val]);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-team">
                            <SelectValue placeholder="Seleziona caposquadra" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">Nessuno</SelectItem>
                          {capisquadra.map((w) => (
                            <SelectItem key={w.id} value={w.id}>
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: w.color }}
                                />
                                {w.name}
                              </div>
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
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Note</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Note aggiuntive..." {...field} disabled={readOnly} data-testid="input-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {conflicts.length > 0 && (
              <div
                className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-600 p-3 space-y-1"
                data-testid="conflict-warning-banner"
              >
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  Attenzione: risorse già occupate in questo periodo
                </div>
                <ul className="space-y-0.5 pl-6">
                  {conflicts.map((c, i) => (
                    <li key={i} className="text-xs text-amber-700 dark:text-amber-400" data-testid={`conflict-item-${i}`}>
                      {c.resourceType === "caposquadra" ? `Caposquadra "${c.resourceName}"` : `Lavoratore "${c.resourceName}"`}
                      {" "}— già assegnato a: <strong>{c.conflictingAssignmentLabel}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-2 flex-wrap pt-2 border-t border-border mt-2">
              {currentProjectId && currentProjectId !== "_none" && (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 border-[#4563FF] text-[#4563FF] hover:bg-[#4563FF]/10"
                  onClick={() => setIsSchedaOpen(true)}
                  data-testid="button-scheda-cantiere"
                >
                  <FileText className="w-4 h-4" />
                  Scheda Cantiere
                </Button>
              )}
              {assignment && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => onDelete(assignment.id)}
                  data-testid="button-delete-assignment"
                  disabled={readOnly}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Elimina
                </Button>
              )}
              {isMontSmontaggio && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending || readOnly}
                  onClick={handleSaveDraft}
                  className="border-amber-500 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                  data-testid="button-save-draft"
                >
                  {isPending ? "Salvataggio..." : "Salva come bozza"}
                </Button>
              )}
              <Button type="submit" disabled={isPending || readOnly} data-testid="button-save-assignment">
                {isPending ? "Salvataggio..." : assignment ? "Aggiorna" : "Crea"}
              </Button>
            </div>
          </form>
        </Form>
        </div>
      </div>
      {currentProjectId && currentProjectId !== "_none" && (
        <SchedaCantiereModal
          projectId={currentProjectId}
          open={isSchedaOpen}
          onOpenChange={setIsSchedaOpen}
        />
      )}
      <AlertDialog open={showHolidayWarning} onOpenChange={(open) => { if (!open) handleHolidayCancel(); }}>
        <AlertDialogContent data-testid="dialog-holiday-warning">
          <AlertDialogHeader>
            <AlertDialogTitle>Attenzione: giorno festivo</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-2">La lavorazione cade su {holidayWarningNames.length === 1 ? "una festività" : "delle festività"} italiana{holidayWarningNames.length === 1 ? "" : "e"}:</p>
                <ul className="list-disc list-inside space-y-1">
                  {holidayWarningNames.map((name, i) => (
                    <li key={i} className="font-medium" data-testid={`text-holiday-name-${i}`}>{name}</li>
                  ))}
                </ul>
                <p className="mt-2">Vuoi procedere comunque?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleHolidayCancel} data-testid="button-holiday-cancel">Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleHolidayConfirm} data-testid="button-holiday-confirm">Procedi comunque</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TeamDialog({
  open,
  onOpenChange,
  team,
  onSave,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: Team | null;
  onSave: (data: { name: string; paese?: string; color: string }) => void;
  isPending: boolean;
}) {
  const form = useForm({
    resolver: zodResolver(teamFormSchema),
    defaultValues: {
      name: team?.name || "",
      paese: team?.paese || "",
      color: team?.color || "#61CE85",
    },
  });

  useMemo(() => {
    form.reset({
      name: team?.name || "",
      paese: team?.paese || "",
      color: team?.color || "#61CE85",
    });
  }, [team?.id, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-team">
        <DialogHeader>
          <DialogTitle>{team ? "Modifica Squadra" : "Nuova Squadra"}</DialogTitle>
          <DialogDescription>
            {team ? "Modifica il nome e il colore della squadra." : "Inserisci nome e colore per la nuova squadra."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-team-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="paese"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paese</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="es. Italia" data-testid="input-team-paese" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Colore</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-2">
                      <Input type="color" {...field} className="w-12 p-1" data-testid="input-team-color" />
                      <Input value={field.value} onChange={field.onChange} className="flex-1" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isPending} data-testid="button-save-team">
                {isPending ? "Salvataggio..." : team ? "Aggiorna" : "Crea"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function DriverDialog({
  open,
  onOpenChange,
  driver,
  onSave,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: Driver | null;
  onSave: (data: { name: string; phone?: string }) => void;
  isPending: boolean;
}) {
  const form = useForm({
    resolver: zodResolver(driverFormSchema),
    defaultValues: {
      name: driver?.name || "",
      phone: driver?.phone || "",
    },
  });

  useMemo(() => {
    form.reset({
      name: driver?.name || "",
      phone: driver?.phone || "",
    });
  }, [driver?.id, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-driver">
        <DialogHeader>
          <DialogTitle>{driver ? "Modifica Autista" : "Nuovo Autista"}</DialogTitle>
          <DialogDescription>
            {driver ? "Modifica i dati dell'autista." : "Inserisci nome e telefono del nuovo autista."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-driver-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefono</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-driver-phone" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isPending} data-testid="button-save-driver">
                {isPending ? "Salvataggio..." : driver ? "Aggiorna" : "Crea"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function VehicleDialog({
  open,
  onOpenChange,
  vehicle,
  onSave,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle | null;
  onSave: (data: { name: string; plate?: string; type?: string }) => void;
  isPending: boolean;
}) {
  const form = useForm({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: {
      name: vehicle?.name || "",
      plate: vehicle?.plate || "",
      type: vehicle?.type || "",
    },
  });

  useMemo(() => {
    form.reset({
      name: vehicle?.name || "",
      plate: vehicle?.plate || "",
      type: vehicle?.type || "",
    });
  }, [vehicle?.id, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-vehicle">
        <DialogHeader>
          <DialogTitle>{vehicle ? "Modifica Mezzo" : "Nuovo Mezzo"}</DialogTitle>
          <DialogDescription>
            {vehicle ? "Modifica i dati del mezzo." : "Inserisci i dati del nuovo mezzo."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-vehicle-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="plate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Targa</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-vehicle-plate" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <FormControl>
                    <Input placeholder="es. Camion, Furgone..." {...field} data-testid="input-vehicle-type" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isPending} data-testid="button-save-vehicle">
                {isPending ? "Salvataggio..." : vehicle ? "Aggiorna" : "Crea"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
