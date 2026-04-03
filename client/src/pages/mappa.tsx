import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Filter, Truck, Eye, RotateCcw, Loader2, Navigation2 } from "lucide-react";
import { useAuth, usePermission } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatCurrency";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useSearch } from "wouter";

interface MapOpportunity {
  id: string;
  title: string;
  siteAddress: string | null;
  siteCity: string | null;
  siteZip: string | null;
  siteLatitude: number;
  siteLongitude: number;
  stageId: string | null;
  leadId: string;
  assignedToUserId: string | null;
  workType: string | null;
  value: string | null;
  ritiroEsubero: boolean | null;
  sopralluogoFatto: boolean | null;
  mapsLink: string | null;
  estimatedStartDate: string | null;
  estimatedEndDate: string | null;
}

interface PipelineStage {
  id: string;
  name: string;
  order: number;
  color: string;
}

const DEFAULT_COLOR = "#6B7280";

function createColoredIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "custom-map-marker",
    html: `<div style="
      background-color: ${color};
      width: 28px;
      height: 28px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 3px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.35);
      position: relative;
    "><div style="
      width: 8px;
      height: 8px;
      background: white;
      border-radius: 50%;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    "></div></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
}

function createHighlightedIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "custom-map-marker highlighted-marker",
    html: `<div style="
      background-color: ${color};
      width: 40px;
      height: 40px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 4px solid #facc15;
      box-shadow: 0 0 0 4px rgba(250,204,21,0.4), 0 4px 12px rgba(0,0,0,0.4);
      position: relative;
      animation: markerPulse 1.5s ease-in-out infinite;
    "><div style="
      width: 10px;
      height: 10px;
      background: white;
      border-radius: 50%;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    "></div></div>
    <style>
      @keyframes markerPulse {
        0%, 100% { box-shadow: 0 0 0 4px rgba(250,204,21,0.4), 0 4px 12px rgba(0,0,0,0.4); }
        50% { box-shadow: 0 0 0 8px rgba(250,204,21,0.2), 0 4px 16px rgba(0,0,0,0.5); }
      }
    </style>`,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
  });
}

function HighlightCenterComponent({ highlightId, opportunities, markerRefs }: { highlightId: string | null; opportunities: MapOpportunity[]; markerRefs: React.MutableRefObject<Map<string, L.Marker>> }) {
  const map = useMap();
  const lastHighlightedId = useRef<string | null>(null);

  useEffect(() => {
    if (!highlightId || highlightId === lastHighlightedId.current) return;
    const target = opportunities.find((o) => o.id === highlightId);
    if (!target) return;

    lastHighlightedId.current = highlightId;
    map.setView([target.siteLatitude, target.siteLongitude], 16, { animate: true });

    setTimeout(() => {
      const marker = markerRefs.current.get(highlightId);
      if (marker) {
        marker.openPopup();
      }
    }, 500);
  }, [highlightId, opportunities, map, markerRefs]);

  return null;
}

function FitBoundsComponent({ markers }: { markers: MapOpportunity[] }) {
  const map = useMap();
  useEffect(() => {
    if (markers.length > 0) {
      const bounds = L.latLngBounds(
        markers.map((m) => [m.siteLatitude, m.siteLongitude])
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    }
  }, [markers, map]);
  return null;
}

export default function MappaPage() {
  const { user } = useAuth();
  const { isAdmin } = usePermission();
  const { toast } = useToast();
  const searchString = useSearch();
  const highlightId = useMemo(() => new URLSearchParams(searchString).get("highlight"), [searchString]);
  const [selectedStage, setSelectedStage] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [showRitiroOnly, setShowRitiroOnly] = useState(false);
  const [showSopralluogoOnly, setShowSopralluogoOnly] = useState(false);
  const [showWorkType, setShowWorkType] = useState<string>("all");
  const mapRef = useRef<L.Map | null>(null);
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());

  const geocodeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/map/geocode-all");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/map/opportunities"] });
      toast({
        title: "Geocodifica completata",
        description: `${data.geocoded} cantieri su ${data.total} geocodificati con successo.`,
      });
    },
    onError: () => {
      toast({ title: "Errore", description: "Errore durante la geocodifica.", variant: "destructive" });
    },
  });

  const { data: opportunities = [], isLoading } = useQuery<MapOpportunity[]>({
    queryKey: ["/api/map/opportunities"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/map/opportunities");
      return res.json();
    },
  });

  const { data: stages = [] } = useQuery<PipelineStage[]>({
    queryKey: ["/api/pipeline-stages"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/pipeline-stages");
      return res.json();
    },
  });

  const { data: assignableUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/users/assignable"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users/assignable");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const stageMap = useMemo(() => {
    const map = new Map<string, PipelineStage>();
    stages.forEach((s) => map.set(s.id, s));
    return map;
  }, [stages]);

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    assignableUsers.forEach((u: any) => {
      map.set(u.id, `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email);
    });
    return map;
  }, [assignableUsers]);

  const filteredOpportunities = useMemo(() => {
    return opportunities.filter((opp) => {
      if (selectedStage !== "all" && opp.stageId !== selectedStage) return false;
      if (selectedUser !== "all" && opp.assignedToUserId !== selectedUser) return false;
      if (showRitiroOnly && !opp.ritiroEsubero) return false;
      if (showSopralluogoOnly && opp.sopralluogoFatto === true) return false;
      if (showWorkType !== "all" && opp.workType !== showWorkType) return false;
      return true;
    });
  }, [opportunities, selectedStage, selectedUser, showRitiroOnly, showSopralluogoOnly, showWorkType]);

  const stageColorMap = useMemo(() => {
    const m: Record<string, string> = {};
    stages.forEach(s => { m[s.id] = s.color || DEFAULT_COLOR; });
    return m;
  }, [stages]);

  const getStageColor = (stageId: string | null): string => {
    if (!stageId) return DEFAULT_COLOR;
    return stageColorMap[stageId] || DEFAULT_COLOR;
  };

  const resetFilters = () => {
    setSelectedStage("all");
    setSelectedUser("all");
    setShowRitiroOnly(false);
    setShowSopralluogoOnly(false);
    setShowWorkType("all");
  };

  const hasActiveFilters = selectedStage !== "all" || selectedUser !== "all" || showRitiroOnly || showSopralluogoOnly || showWorkType !== "all";

  const formatCurrencyValue = (val: string | null) => {
    if (!val) return "-";
    return `€ ${formatCurrency(parseFloat(val))}`;
  };

  if (!user) return null;

  return (
    <DashboardLayout user={user} fullWidth>
      <div className="flex flex-col h-[calc(100vh-64px)]" data-testid="mappa-page">
        {/* BARRA FILTRI */}
        <div className="flex flex-wrap items-center gap-2 p-3 bg-background border-b" data-testid="map-filters-bar">
          <div className="flex items-center gap-1.5 mr-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Filtri:</span>
          </div>

          <Select value={selectedStage} onValueChange={setSelectedStage}>
            <SelectTrigger className="w-[180px] h-8 text-xs" data-testid="filter-stage">
              <SelectValue placeholder="Fase pipeline" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le fasi</SelectItem>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getStageColor(s.id) }} />
                    {s.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger className="w-[180px] h-8 text-xs" data-testid="filter-user">
              <SelectValue placeholder="Commerciale" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti</SelectItem>
              {assignableUsers.map((u: any) => (
                <SelectItem key={u.id} value={u.id}>
                  {`${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={showWorkType} onValueChange={setShowWorkType}>
            <SelectTrigger className="w-[150px] h-8 text-xs" data-testid="filter-worktype">
              <SelectValue placeholder="Tipo appalto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i tipi</SelectItem>
              <SelectItem value="PRIVATE">Privato</SelectItem>
              <SelectItem value="PUBLIC">Pubblico</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant={showRitiroOnly ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => setShowRitiroOnly(!showRitiroOnly)}
            data-testid="filter-ritiro"
          >
            <Truck className="w-3.5 h-3.5" />
            Materiale da ritirare
          </Button>

          <Button
            variant={showSopralluogoOnly ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => setShowSopralluogoOnly(!showSopralluogoOnly)}
            data-testid="filter-sopralluogo"
          >
            <Eye className="w-3.5 h-3.5" />
            Sopralluogo da fare
          </Button>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1 text-muted-foreground"
              onClick={resetFilters}
              data-testid="filter-reset"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </Button>
          )}

          <div className="ml-auto flex items-center gap-2">
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={() => geocodeMutation.mutate()}
                disabled={geocodeMutation.isPending}
                data-testid="button-geocode-all"
              >
                {geocodeMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Navigation2 className="w-3.5 h-3.5" />
                )}
                {geocodeMutation.isPending ? "Geocodifica..." : "Geocodifica cantieri"}
              </Button>
            )}
            <Badge variant="secondary" className="text-xs" data-testid="map-count">
              <MapPin className="w-3 h-3 mr-1" />
              {filteredOpportunities.length} cantier{filteredOpportunities.length === 1 ? "e" : "i"}
            </Badge>
          </div>
        </div>

        {/* LEGENDA */}
        <div className="flex flex-wrap items-center gap-3 px-3 py-1.5 bg-muted/30 border-b text-xs" data-testid="map-legend">
          <span className="text-muted-foreground font-medium">Legenda:</span>
          {stages.map((s) => (
            <div key={s.id} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getStageColor(s.id) }} />
              <span className="text-muted-foreground">{s.name}</span>
            </div>
          ))}
        </div>

        {/* MAPPA */}
        <div className="flex-1 relative">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3">
                <Skeleton className="h-8 w-48 mx-auto" />
                <Skeleton className="h-4 w-64 mx-auto" />
              </div>
            </div>
          ) : opportunities.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3">
                <MapPin className="w-12 h-12 mx-auto text-muted-foreground/40" />
                <p className="text-muted-foreground">Nessun cantiere con coordinate sulla mappa</p>
                <p className="text-xs text-muted-foreground/60">
                  Le coordinate vengono calcolate automaticamente quando inserisci l'indirizzo di un cantiere nelle opportunità
                </p>
              </div>
            </div>
          ) : (
            <MapContainer
              center={[42.5, 12.5]}
              zoom={6}
              style={{ height: "100%", width: "100%" }}
              ref={mapRef}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {(!highlightId || !filteredOpportunities.some((o) => o.id === highlightId)) && <FitBoundsComponent markers={filteredOpportunities} />}
              <HighlightCenterComponent highlightId={highlightId} opportunities={filteredOpportunities} markerRefs={markerRefs} />
              {filteredOpportunities.map((opp) => {
                const stage = opp.stageId ? stageMap.get(opp.stageId) : undefined;
                const stageName = stage?.name || "Non assegnata";
                const color = getStageColor(opp.stageId);
                const isHighlighted = highlightId === opp.id;
                const icon = isHighlighted ? createHighlightedIcon(color) : createColoredIcon(color);
                const assignedUser = opp.assignedToUserId ? userMap.get(opp.assignedToUserId) : null;

                return (
                  <Marker
                    key={opp.id}
                    position={[opp.siteLatitude, opp.siteLongitude]}
                    icon={icon}
                    zIndexOffset={isHighlighted ? 1000 : 0}
                    ref={(ref) => {
                      if (ref) {
                        markerRefs.current.set(opp.id, ref);
                      } else {
                        markerRefs.current.delete(opp.id);
                      }
                    }}
                  >
                    <Popup maxWidth={320} minWidth={260}>
                      <div className="space-y-2 p-1" style={{ fontFamily: "Inter, sans-serif" }}>
                        <div className="flex items-start justify-between gap-2">
                          <h3 style={{ fontWeight: 600, fontSize: "14px", margin: 0, color: "#050B41" }}>
                            {opp.title}
                          </h3>
                          <span
                            style={{
                              backgroundColor: color,
                              color: "white",
                              padding: "1px 8px",
                              borderRadius: "12px",
                              fontSize: "10px",
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {stageName}
                          </span>
                        </div>

                        {(opp.siteAddress || opp.siteCity) && (
                          <p style={{ fontSize: "12px", color: "#666", margin: "4px 0" }}>
                            {opp.siteAddress}{opp.siteAddress && opp.siteCity ? ", " : ""}{opp.siteZip} {opp.siteCity}
                          </p>
                        )}

                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
                          {opp.workType && (
                            <span style={{
                              fontSize: "10px",
                              padding: "1px 6px",
                              borderRadius: "4px",
                              backgroundColor: opp.workType === "PUBLIC" ? "#DCFCE7" : "#DBEAFE",
                              color: opp.workType === "PUBLIC" ? "#166534" : "#1E40AF",
                            }}>
                              {opp.workType === "PUBLIC" ? "Pubblico" : "Privato"}
                            </span>
                          )}
                          {opp.ritiroEsubero && (
                            <span style={{
                              fontSize: "10px",
                              padding: "1px 6px",
                              borderRadius: "4px",
                              backgroundColor: "#FEF3C7",
                              color: "#92400E",
                            }}>
                              Ritiro materiale
                            </span>
                          )}
                          {opp.sopralluogoFatto === false && (
                            <span style={{
                              fontSize: "10px",
                              padding: "1px 6px",
                              borderRadius: "4px",
                              backgroundColor: "#FEE2E2",
                              color: "#991B1B",
                            }}>
                              Sopralluogo da fare
                            </span>
                          )}
                        </div>

                        {assignedUser && (
                          <p style={{ fontSize: "11px", color: "#888", margin: "4px 0" }}>
                            Commerciale: {assignedUser}
                          </p>
                        )}

                        {opp.value && (
                          <p style={{ fontSize: "12px", fontWeight: 600, color: "#050B41", margin: "4px 0" }}>
                            Valore: {formatCurrencyValue(opp.value)}
                          </p>
                        )}

                        <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                          {opp.mapsLink && (
                            <a
                              href={opp.mapsLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontSize: "11px",
                                color: "#4563FF",
                                textDecoration: "none",
                                display: "flex",
                                alignItems: "center",
                                gap: "3px",
                              }}
                            >
                              <span>Google Maps</span>
                              <span style={{ fontSize: "9px" }}>↗</span>
                            </a>
                          )}
                          <a
                            href={`/opportunita`}
                            style={{
                              fontSize: "11px",
                              color: "#4563FF",
                              textDecoration: "none",
                              display: "flex",
                              alignItems: "center",
                              gap: "3px",
                            }}
                          >
                            <span>Apri opportunità</span>
                            <span style={{ fontSize: "9px" }}>↗</span>
                          </a>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
