import { ElementType } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Truck,
  HardHat,
  Package,
  RotateCcw,
  Wrench,
  ArrowRightLeft,
  FolderKanban,
  Plus,
  FileText,
  User,
  AlertCircle,
  CheckSquare,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

type ActivityType =
  | "MONTAGGIO"
  | "SMONTAGGIO"
  | "MONTAGGIO_SMONTAGGIO"
  | "CONSEGNA"
  | "RITIRO"
  | "CONSEGNA_COMBINATO"
  | "RITIRO_COMBINATO"
  | "ESUBERO"
  | "ESUBERO_COMBINATO"
  | "MANUTENZIONE";

type TeamInfo = {
  id: string;
  name: string;
  color: string;
  members: string[];
};

type DriverInfo = {
  id: string;
  name: string;
};

type VehicleInfo = {
  id: string;
  name: string;
  plate?: string | null;
};

type ActivityLogDetails = {
  note?: string;
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
  fromStage?: string | null;
  toStage?: string | null;
};

type AssignmentData = {
  activityType: ActivityType;
  scheduledTime?: string | null;
  driver?: DriverInfo | null;
  vehicle?: VehicleInfo | null;
  teams?: TeamInfo[];
  notes?: string | null;
  status?: string;
  endDate?: string | null;
};

type PhaseChangeData = {
  action?: string;
  fromStage?: string | null;
  toStage?: string | null;
  details?: ActivityLogDetails;
};

type ProjectCreatedData = {
  action?: string;
  clientName?: string;
};

type ActivityLogData = {
  action?: string;
  details?: ActivityLogDetails;
};

type ActivityTaskData = {
  name: string;
  startDate: string;
  endDate: string;
  progress: number;
  description?: string | null;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
};

export type CronistoriaEvent =
  | { id: string; type: "assignment"; date: string; data: AssignmentData }
  | { id: string; type: "phase_change"; date: string; data: PhaseChangeData }
  | { id: string; type: "project_created"; date: string; data: ProjectCreatedData }
  | { id: string; type: "activity_log"; date: string; data: ActivityLogData }
  | { id: string; type: "activity_task"; date: string; data: ActivityTaskData };

type ActivityTypeConfig = {
  label: string;
  color: string;
  bgColor: string;
  icon: ElementType;
};

const activityTypeConfig: Record<ActivityType, ActivityTypeConfig> = {
  MONTAGGIO: { label: "Montaggio", color: "text-green-700 dark:text-green-300", bgColor: "bg-green-100 dark:bg-green-900/40 border-green-200 dark:border-green-800", icon: HardHat },
  SMONTAGGIO: { label: "Smontaggio", color: "text-orange-700 dark:text-orange-300", bgColor: "bg-orange-100 dark:bg-orange-900/40 border-orange-200 dark:border-orange-800", icon: RotateCcw },
  MONTAGGIO_SMONTAGGIO: { label: "Montaggio e Smontaggio", color: "text-violet-700 dark:text-violet-300", bgColor: "bg-violet-100 dark:bg-violet-900/40 border-violet-200 dark:border-violet-800", icon: HardHat },
  CONSEGNA: { label: "Consegna", color: "text-blue-700 dark:text-blue-300", bgColor: "bg-blue-100 dark:bg-blue-900/40 border-blue-200 dark:border-blue-800", icon: Truck },
  RITIRO: { label: "Ritiro", color: "text-indigo-700 dark:text-indigo-300", bgColor: "bg-indigo-100 dark:bg-indigo-900/40 border-indigo-200 dark:border-indigo-800", icon: Package },
  CONSEGNA_COMBINATO: { label: "Consegna combinata", color: "text-blue-700 dark:text-blue-300", bgColor: "bg-blue-100 dark:bg-blue-900/40 border-blue-200 dark:border-blue-800", icon: Truck },
  RITIRO_COMBINATO: { label: "Ritiro combinato", color: "text-indigo-700 dark:text-indigo-300", bgColor: "bg-indigo-100 dark:bg-indigo-900/40 border-indigo-200 dark:border-indigo-800", icon: Package },
  ESUBERO: { label: "Esubero", color: "text-yellow-700 dark:text-yellow-300", bgColor: "bg-yellow-100 dark:bg-yellow-900/40 border-yellow-200 dark:border-yellow-800", icon: ArrowRightLeft },
  ESUBERO_COMBINATO: { label: "Esubero combinato", color: "text-yellow-700 dark:text-yellow-300", bgColor: "bg-yellow-100 dark:bg-yellow-900/40 border-yellow-200 dark:border-yellow-800", icon: ArrowRightLeft },
  MANUTENZIONE: { label: "Manutenzione", color: "text-purple-700 dark:text-purple-300", bgColor: "bg-purple-100 dark:bg-purple-900/40 border-purple-200 dark:border-purple-800", icon: Wrench },
};

const defaultActivityConfig: ActivityTypeConfig = activityTypeConfig.MONTAGGIO;

function formatDateIT(dateStr: string): string {
  try {
    return format(new Date(dateStr), "d MMMM yyyy", { locale: it });
  } catch {
    return dateStr;
  }
}

function toCalendarDay(dateStr: string): string {
  try {
    return format(new Date(dateStr), "yyyy-MM-dd");
  } catch {
    return dateStr;
  }
}

function buildAssignmentSummary(label: string, startDate: string, endDate?: string | null): string {
  const start = formatDateIT(startDate);
  if (!endDate || toCalendarDay(endDate) === toCalendarDay(startDate)) {
    return `${label} il ${start}`;
  }
  const end = formatDateIT(endDate);
  return `${label} dal ${start} al ${end}`;
}

function AssignmentCard({ event }: { event: Extract<CronistoriaEvent, { type: "assignment" }> }) {
  const config = activityTypeConfig[event.data.activityType] ?? defaultActivityConfig;
  const Icon = config.icon;
  const summary = buildAssignmentSummary(config.label, event.date, event.data.endDate);
  const allMembers = (event.data.teams ?? []).flatMap(t => t.members);
  const uniqueMembers = [...new Set(allMembers)];

  return (
    <div className={`rounded-lg border p-4 ${config.bgColor}`} data-testid={`event-assignment-${event.id}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex-shrink-0 ${config.color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`font-semibold text-sm ${config.color}`} data-testid={`assignment-summary-${event.id}`}>{summary}</span>
            {event.data.scheduledTime && (
              <span className="text-xs text-muted-foreground">ore {event.data.scheduledTime}</span>
            )}
            {event.data.status && event.data.status !== "PIANIFICATA" && (
              <Badge variant="secondary" className="text-[10px] px-1.5 h-4">
                {event.data.status}
              </Badge>
            )}
          </div>
          {uniqueMembers.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5" data-testid={`assignment-members-${event.id}`}>
              <Users className="w-3 h-3 flex-shrink-0" />
              <span className="font-medium text-foreground">{uniqueMembers.join(", ")}</span>
            </div>
          )}
          <div className="space-y-1.5 text-xs">
            {event.data.driver && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <User className="w-3 h-3 flex-shrink-0" />
                <span>Autista: <span className="font-medium text-foreground">{event.data.driver.name}</span></span>
              </div>
            )}
            {event.data.vehicle && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Truck className="w-3 h-3 flex-shrink-0" />
                <span>
                  Mezzo: <span className="font-medium text-foreground">{event.data.vehicle.name}</span>
                  {event.data.vehicle.plate && <span className="ml-1 text-muted-foreground">({event.data.vehicle.plate})</span>}
                </span>
              </div>
            )}
            {event.data.teams && event.data.teams.length > 0 && (
              <div className="space-y-1 mt-1">
                {event.data.teams.map(team => (
                  <div key={team.id} className="flex items-start gap-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: team.color }} />
                    <div>
                      <span className="font-medium text-foreground">{team.name}</span>
                      {team.members.length > 0 && (
                        <span className="text-muted-foreground ml-1">({team.members.join(", ")})</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {event.data.notes && (
              <div className="flex items-start gap-1.5 text-muted-foreground mt-1">
                <FileText className="w-3 h-3 flex-shrink-0 mt-0.5" />
                <span className="italic">{event.data.notes}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PhaseChangeCard({ event }: { event: Extract<CronistoriaEvent, { type: "phase_change" }> }) {
  return (
    <div className="rounded-lg border p-4 bg-gray-50 dark:bg-gray-900/40 border-gray-200 dark:border-gray-700" data-testid={`event-phase-${event.id}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 text-gray-600 dark:text-gray-400">
          <FolderKanban className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-sm text-gray-700 dark:text-gray-300">Cambio di fase</span>
          {(event.data.fromStage || event.data.toStage) && (
            <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
              {event.data.fromStage && (
                <span className="font-medium text-foreground">{event.data.fromStage}</span>
              )}
              {event.data.fromStage && event.data.toStage && (
                <ArrowRightLeft className="w-3 h-3" />
              )}
              {event.data.toStage && (
                <span className="font-medium text-foreground">{event.data.toStage}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectCreatedCard({ event }: { event: Extract<CronistoriaEvent, { type: "project_created" }> }) {
  return (
    <div className="rounded-lg border p-4 bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800" data-testid={`event-created-${event.id}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 text-purple-700 dark:text-purple-300">
          <Plus className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-sm text-purple-700 dark:text-purple-300">Progetto creato</span>
          {event.data.clientName && (
            <p className="text-xs text-muted-foreground mt-0.5">Cliente: <span className="font-medium text-foreground">{event.data.clientName}</span></p>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityLogCard({ event }: { event: Extract<CronistoriaEvent, { type: "activity_log" }> }) {
  const actionLabels: Record<string, string> = {
    created: "Creato",
    updated: "Aggiornato",
    deleted: "Eliminato",
    moved: "Spostato",
    note: "Nota aggiunta",
  };
  const label = event.data.action ? (actionLabels[event.data.action] ?? event.data.action) : "Aggiornamento";
  const details = event.data.details;

  return (
    <div className="rounded-lg border p-4 bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700" data-testid={`event-log-${event.id}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 text-slate-600 dark:text-slate-400">
          <FileText className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-sm text-slate-700 dark:text-slate-300">{label}</span>
          {details?.note && (
            <p className="text-xs text-muted-foreground mt-0.5 italic">{details.note}</p>
          )}
          {details?.field && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Campo: <span className="font-medium text-foreground">{details.field}</span>
              {details.oldValue !== undefined && details.newValue !== undefined && (
                <span className="ml-1">({String(details.oldValue)} &rarr; {String(details.newValue)})</span>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityTaskCard({ event }: { event: Extract<CronistoriaEvent, { type: "activity_task" }> }) {
  const startStr = (() => {
    try { return format(new Date(event.data.startDate), "d MMM yyyy", { locale: it }); } catch { return event.data.startDate; }
  })();
  const endStr = (() => {
    try { return format(new Date(event.data.endDate), "d MMM yyyy", { locale: it }); } catch { return event.data.endDate; }
  })();

  return (
    <div className="rounded-lg border p-4 bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800" data-testid={`event-task-${event.id}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 text-teal-700 dark:text-teal-300">
          <CheckSquare className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-sm text-teal-700 dark:text-teal-300">{event.data.name}</span>
          <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
            <span>{startStr} &rarr; {endStr}</span>
            {event.data.progress > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 h-4">{event.data.progress}%</Badge>
            )}
          </div>
          {event.data.assignedUserName && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
              <User className="w-3 h-3 flex-shrink-0" />
              <span>Assegnatario: <span className="font-medium text-foreground">{event.data.assignedUserName}</span></span>
            </div>
          )}
          {event.data.description && (
            <p className="text-xs text-muted-foreground mt-1 italic">{event.data.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function EventCard({ event }: { event: CronistoriaEvent }) {
  switch (event.type) {
    case "assignment":
      return <AssignmentCard event={event} />;
    case "phase_change":
      return <PhaseChangeCard event={event} />;
    case "project_created":
      return <ProjectCreatedCard event={event} />;
    case "activity_log":
      return <ActivityLogCard event={event} />;
    case "activity_task":
      return <ActivityTaskCard event={event} />;
  }
}

function formatEventDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), "d MMMM yyyy", { locale: it });
  } catch {
    return dateStr;
  }
}

export function CronistoriaContent({ projectId }: { projectId: string }) {
  const { data: events = [], isLoading } = useQuery<CronistoriaEvent[]>({
    queryKey: ["/api/projects", projectId, "cronistoria"],
    enabled: !!projectId,
  });

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Clock className="w-12 h-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">Nessun evento registrato</h3>
        <p className="text-sm text-muted-foreground">
          La cronistoria di questo progetto è vuota
        </p>
      </div>
    );
  }

  return (
    <div className="relative p-4">
      <div className="absolute left-[27px] top-4 bottom-4 w-0.5 bg-border" aria-hidden="true" />
      <div className="space-y-0">
        {events.map((event, index) => {
          const prevEvent = events[index - 1];
          const currDate = formatEventDate(event.date);
          const prevDate = prevEvent ? formatEventDate(prevEvent.date) : null;
          const showDateLabel = currDate !== prevDate;

          return (
            <div key={event.id}>
              {showDateLabel && (
                <div className="flex items-center gap-3 mb-3 mt-4 first:mt-0" data-testid={`date-label-${currDate}`}>
                  <div className="w-6 h-6 rounded-full bg-muted border-2 border-background flex items-center justify-center flex-shrink-0 z-10 relative">
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {currDate}
                  </span>
                </div>
              )}
              <div className="flex gap-3 pb-3">
                <div className="flex-shrink-0 w-6" />
                <div className="flex-1 min-w-0">
                  <EventCard event={event} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CronistoriaLoadingPlaceholder() {
  return (
    <div className="p-6 space-y-4 max-w-2xl mx-auto">
      <Skeleton className="h-8 w-64" />
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}

