import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LeadStatus } from "@shared/schema";

interface LeadStatusBadgeProps {
  status: LeadStatus;
  className?: string;
}

const statusConfig: Record<LeadStatus, { label: string; className: string }> = {
  nuovo: {
    label: "Nuovo",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  },
  contattato: {
    label: "Contattato",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  },
  opportunita: {
    label: "Opportunità",
    className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800",
  },
  chiuso: {
    label: "Chiuso",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800",
  },
};

export function LeadStatusBadge({ status, className }: LeadStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge 
      variant="outline" 
      className={cn("font-medium border", config.className, className)}
      data-testid={`badge-status-${status}`}
    >
      <span className="flex items-center gap-1.5">
        <span className={cn(
          "w-1.5 h-1.5 rounded-full",
          status === "nuovo" && "bg-blue-500",
          status === "contattato" && "bg-amber-500",
          status === "opportunita" && "bg-purple-500",
          status === "chiuso" && "bg-green-500"
        )} />
        {config.label}
      </span>
    </Badge>
  );
}
