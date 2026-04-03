import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Clock,
  AlertCircle,
} from "lucide-react";
import type { Project } from "@shared/schema";
import { CronistoriaContent } from "@/components/cronistoria-content";

export default function CronistoriaPage() {
  const [, params] = useRoute("/progetti/:projectId/gantt");
  const [, navigate] = useLocation();
  const projectId = params?.projectId ?? "";

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  if (projectLoading) {
    return (
      <DashboardLayout>
        <div className="p-6 space-y-4 max-w-2xl mx-auto">
          <Skeleton className="h-8 w-64" />
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!project) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Progetto non trovato</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/progetti")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Torna ai Progetti
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 p-4 border-b sticky top-0 bg-background z-10">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/progetti")}
            data-testid="button-back-to-projects"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2" data-testid="text-project-name">
              <Clock className="w-5 h-5 text-secondary" />
              Cronistoria - {project.clientName}
            </h1>
            {project.siteAddress && (
              <p className="text-sm text-muted-foreground">{project.siteAddress}</p>
            )}
          </div>
        </div>

        <CronistoriaContent projectId={projectId} />
      </div>
    </DashboardLayout>
  );
}
