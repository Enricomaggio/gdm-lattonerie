import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
  GitMerge,
  SkipForward,
  Users,
  Building2,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Hash,
  Briefcase,
  CheckCircle2,
  Tag,
} from "lucide-react";
import type { Lead, ContactType } from "@shared/schema";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const typeLabels: Record<ContactType, string> = {
  lead: "Lead",
  cliente: "Cliente",
  non_in_target: "Non in target",
};

interface EnrichedLead extends Lead {
  opportunitiesCount: number;
  assignedToUserName: string | null;
  normalizedName: string;
}

interface DuplicatePair {
  lead1: EnrichedLead;
  lead2: EnrichedLead;
  reason: string;
}

const reasonLabels: Record<string, string> = {
  same_vat: "Stessa P.IVA",
  same_email: "Stessa email",
  same_phone: "Stesso telefono",
  same_name: "Nome simile",
};

function LeadField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <div>
        <span className="text-muted-foreground text-xs">{label}: </span>
        <span className="text-foreground">{value}</span>
      </div>
    </div>
  );
}

function LeadCard({
  lead,
  isPrimary,
  onSelect,
}: {
  lead: EnrichedLead;
  isPrimary: boolean;
  onSelect: () => void;
}) {
  const displayName =
    lead.entityType === "COMPANY"
      ? lead.name || "Senza nome"
      : `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Senza nome";

  return (
    <div
      className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
        isPrimary
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50"
      }`}
      onClick={onSelect}
      data-testid={`card-lead-${lead.id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          {lead.entityType === "COMPANY" ? (
            <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <User className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <span className="font-semibold text-foreground">{displayName}</span>
        </div>
        {isPrimary && (
          <Badge variant="default" className="shrink-0" data-testid={`badge-primary-${lead.id}`}>
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Primario
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        <LeadField
          icon={<Tag className="w-3.5 h-3.5" />}
          label="Tipo"
          value={typeLabels[lead.type as ContactType] || lead.type}
        />
        <LeadField
          icon={<Mail className="w-3.5 h-3.5" />}
          label="Email"
          value={lead.email}
        />
        <LeadField
          icon={<Phone className="w-3.5 h-3.5" />}
          label="Telefono"
          value={lead.phone}
        />
        <LeadField
          icon={<Hash className="w-3.5 h-3.5" />}
          label="P.IVA"
          value={lead.vatNumber}
        />
        <LeadField
          icon={<MapPin className="w-3.5 h-3.5" />}
          label="Città"
          value={lead.city}
        />
        <LeadField
          icon={<Users className="w-3.5 h-3.5" />}
          label="Assegnato a"
          value={lead.assignedToUserName}
        />
        <LeadField
          icon={<Briefcase className="w-3.5 h-3.5" />}
          label="Opportunità"
          value={String(lead.opportunitiesCount)}
        />
        <LeadField
          icon={<Calendar className="w-3.5 h-3.5" />}
          label="Creato il"
          value={
            lead.createdAt
              ? format(new Date(lead.createdAt), "d MMM yyyy", { locale: it })
              : null
          }
        />
      </div>
    </div>
  );
}

function DuplicatePairCard({
  pair,
  onMerge,
  onIgnore,
  isMergePending,
}: {
  pair: DuplicatePair;
  onMerge: (primaryId: string, duplicateId: string) => void;
  onIgnore: () => void;
  isMergePending?: boolean;
}) {
  const [primaryId, setPrimaryId] = useState<string>(pair.lead1.id);
  const duplicateId = primaryId === pair.lead1.id ? pair.lead2.id : pair.lead1.id;

  return (
    <Card data-testid={`card-duplicate-pair-${pair.lead1.id}-${pair.lead2.id}`}>
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {reasonLabels[pair.reason] || pair.reason}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Clicca su un record per selezionarlo come primario
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <LeadCard
            lead={pair.lead1}
            isPrimary={primaryId === pair.lead1.id}
            onSelect={() => setPrimaryId(pair.lead1.id)}
          />
          <LeadCard
            lead={pair.lead2}
            isPrimary={primaryId === pair.lead2.id}
            onSelect={() => setPrimaryId(pair.lead2.id)}
          />
        </div>
        <div className="flex items-center gap-2 justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onIgnore}
            data-testid={`button-ignore-${pair.lead1.id}-${pair.lead2.id}`}
          >
            <SkipForward className="w-3.5 h-3.5 mr-1" />
            Ignora
          </Button>
          <Button
            size="sm"
            onClick={() => onMerge(primaryId, duplicateId)}
            data-testid={`button-merge-${pair.lead1.id}-${pair.lead2.id}`}
            disabled={isMergePending}
          >
            <GitMerge className="w-3.5 h-3.5 mr-1" />
            {isMergePending ? "Unione in corso..." : "Unisci"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LeadDuplicatesPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [ignoredPairs, setIgnoredPairs] = useState<Set<string>>(new Set());

  const { data: pairs = [], isLoading, refetch } = useQuery<DuplicatePair[]>({
    queryKey: ["/api/leads/duplicates"],
  });

  const mergeMutation = useMutation({
    mutationFn: async ({ primaryId, duplicateId }: { primaryId: string; duplicateId: string }) => {
      return apiRequest("POST", "/api/leads/merge", { primaryId, duplicateId });
    },
    onSuccess: (_data, variables) => {
      toast({
        title: "Unione completata",
        description: "I due contatti sono stati uniti con successo.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/duplicates"] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Errore durante la fusione";
      toast({
        title: "Errore",
        description: message,
        variant: "destructive",
      });
    },
  });

  const pairKey = (pair: DuplicatePair) =>
    [pair.lead1.id, pair.lead2.id].sort().join(":");

  const visiblePairs = pairs.filter((p) => !ignoredPairs.has(pairKey(p)));

  const handleIgnore = (pair: DuplicatePair) => {
    setIgnoredPairs((prev) => new Set([...prev, pairKey(pair)]));
  };

  const handleMerge = (primaryId: string, duplicateId: string) => {
    mergeMutation.mutate({ primaryId, duplicateId });
  };

  return (
    <DashboardLayout user={user!}>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/leads")}
            data-testid="button-back-to-leads"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Torna ai Contatti
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Duplicati</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Revisione manuale delle coppie di contatti potenzialmente duplicati
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Skeleton className="h-40 w-full" />
                    <Skeleton className="h-40 w-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : visiblePairs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <CheckCircle2 className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              Nessun duplicato trovato
            </h3>
            <p className="text-muted-foreground max-w-sm text-sm">
              Non ci sono coppie di contatti duplicati da esaminare.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => { setIgnoredPairs(new Set()); refetch(); }}
              data-testid="button-refresh-duplicates"
            >
              Aggiorna lista
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground" data-testid="text-duplicates-count">
              {visiblePairs.length} {visiblePairs.length === 1 ? "coppia trovata" : "coppie trovate"}
            </p>
            {visiblePairs.map((pair) => (
              <DuplicatePairCard
                key={pairKey(pair)}
                pair={pair}
                onMerge={handleMerge}
                onIgnore={() => handleIgnore(pair)}
                isMergePending={mergeMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
