import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth, getAuthToken } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { User, Mail, Calendar, LogOut, Building2, Phone, MapPin, CreditCard, Save, Loader2, FileText, KeyRound, Receipt, Plus, Pencil, Trash2, Check, X, Bell, FileEdit, RotateCcw, ChevronDown, HardHat } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useState, useEffect, useRef } from "react";
import type { Company, User as UserType, BillingProfile, Article } from "@shared/schema";

const emptyProfileForm = {
  companyName: "",
  vatNumber: "",
  fiscalCode: "",
  address: "",
  city: "",
  zip: "",
  province: "",
  phone: "",
  email: "",
  pec: "",
  sdiCode: "",
  iban: "",
  shareCapital: "",
  logoHeaderPath: "",
  logoCoverPath: "",
  logoCoverSmallPath: "",
};

function BillingProfilesSection() {
  const { toast } = useToast();
  const [editingProfile, setEditingProfile] = useState<string | null>(null);
  const [creatingType, setCreatingType] = useState<"PRIVATE" | "PUBLIC" | null>(null);
  const [formData, setFormData] = useState(emptyProfileForm);

  const { data: profiles = [], isLoading } = useQuery<BillingProfile[]>({
    queryKey: ["/api/billing-profiles"],
  });

  const invalidateBillingCaches = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/billing-profiles"] });
    queryClient.invalidateQueries({ queryKey: ["/api/billing-profiles/by-type"] });
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/billing-profiles", data);
      return res.json();
    },
    onSuccess: () => {
      invalidateBillingCaches();
      setCreatingType(null);
      setFormData(emptyProfileForm);
      toast({ title: "Profilo creato" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/billing-profiles/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidateBillingCaches();
      setEditingProfile(null);
      toast({ title: "Profilo aggiornato" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/billing-profiles/${id}`);
    },
    onSuccess: () => {
      invalidateBillingCaches();
      toast({ title: "Profilo eliminato" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const hasPrivate = profiles.some((p) => p.profileType === "PRIVATE");
  const hasPublic = profiles.some((p) => p.profileType === "PUBLIC");

  const startEdit = (profile: BillingProfile) => {
    setEditingProfile(profile.id);
    setFormData({
      companyName: profile.companyName || "",
      vatNumber: profile.vatNumber || "",
      fiscalCode: profile.fiscalCode || "",
      address: profile.address || "",
      city: profile.city || "",
      zip: profile.zip || "",
      province: profile.province || "",
      phone: profile.phone || "",
      email: profile.email || "",
      pec: profile.pec || "",
      sdiCode: profile.sdiCode || "",
      iban: profile.iban || "",
      shareCapital: profile.shareCapital || "",
      logoHeaderPath: profile.logoHeaderPath || "",
      logoCoverPath: profile.logoCoverPath || "",
      logoCoverSmallPath: profile.logoCoverSmallPath || "",
    });
  };

  const startCreate = (type: "PRIVATE" | "PUBLIC") => {
    setCreatingType(type);
    setFormData(emptyProfileForm);
    setEditingProfile(null);
  };

  const handleSave = () => {
    if (creatingType) {
      createMutation.mutate({ ...formData, profileType: creatingType });
    } else if (editingProfile) {
      updateMutation.mutate({ id: editingProfile, data: formData });
    }
  };

  const handleCancel = () => {
    setEditingProfile(null);
    setCreatingType(null);
    setFormData(emptyProfileForm);
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const profileTypeLabel = (type: string) => type === "PUBLIC" ? "Pubblico" : "Privato";
  const profileTypeColor = (type: string) => type === "PUBLIC" ? "#61CE85" : "#4563FF";

  const renderProfileForm = () => (
    <div className="space-y-4 mt-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Ragione Sociale *</Label>
          <Input
            data-testid="input-billing-company-name"
            value={formData.companyName}
            onChange={(e) => handleChange("companyName", e.target.value)}
            placeholder="Es. Da.Do Partners s.r.l."
          />
        </div>
        <div className="space-y-2">
          <Label>P.IVA</Label>
          <Input
            data-testid="input-billing-vat"
            value={formData.vatNumber}
            onChange={(e) => handleChange("vatNumber", e.target.value)}
            placeholder="IT05545130261"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Codice Fiscale</Label>
          <Input
            data-testid="input-billing-fiscal"
            value={formData.fiscalCode}
            onChange={(e) => handleChange("fiscalCode", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Capitale Sociale</Label>
          <Input
            data-testid="input-billing-capital"
            value={formData.shareCapital}
            onChange={(e) => handleChange("shareCapital", e.target.value)}
            placeholder="Euro 10.000,00 i.v."
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Indirizzo</Label>
          <Input
            data-testid="input-billing-address"
            value={formData.address}
            onChange={(e) => handleChange("address", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Città</Label>
          <Input
            data-testid="input-billing-city"
            value={formData.city}
            onChange={(e) => handleChange("city", e.target.value)}
          />
        </div>
        <div className="grid gap-4 grid-cols-2">
          <div className="space-y-2">
            <Label>CAP</Label>
            <Input
              data-testid="input-billing-zip"
              value={formData.zip}
              onChange={(e) => handleChange("zip", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Prov.</Label>
            <Input
              data-testid="input-billing-province"
              value={formData.province}
              onChange={(e) => handleChange("province", e.target.value)}
            />
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Telefono</Label>
          <Input
            data-testid="input-billing-phone"
            value={formData.phone}
            onChange={(e) => handleChange("phone", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input
            data-testid="input-billing-email"
            value={formData.email}
            onChange={(e) => handleChange("email", e.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>PEC</Label>
          <Input
            data-testid="input-billing-pec"
            value={formData.pec}
            onChange={(e) => handleChange("pec", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Codice SDI</Label>
          <Input
            data-testid="input-billing-sdi"
            value={formData.sdiCode}
            onChange={(e) => handleChange("sdiCode", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>IBAN</Label>
          <Input
            data-testid="input-billing-iban"
            value={formData.iban}
            onChange={(e) => handleChange("iban", e.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Logo Header (URL)</Label>
          <Input
            data-testid="input-billing-logo-header"
            value={formData.logoHeaderPath}
            onChange={(e) => handleChange("logoHeaderPath", e.target.value)}
            placeholder="/loghi/logo-header.png"
          />
        </div>
        <div className="space-y-2">
          <Label>Logo Copertina (URL)</Label>
          <Input
            data-testid="input-billing-logo-cover"
            value={formData.logoCoverPath}
            onChange={(e) => handleChange("logoCoverPath", e.target.value)}
            placeholder="/loghi/logo-copertina.png"
          />
        </div>
        <div className="space-y-2">
          <Label>Logo Copertina Small (URL)</Label>
          <Input
            data-testid="input-billing-logo-cover-small"
            value={formData.logoCoverSmallPath}
            onChange={(e) => handleChange("logoCoverSmallPath", e.target.value)}
            placeholder="/loghi/logo-small.png"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={handleCancel} data-testid="button-billing-cancel">
          <X className="w-4 h-4 mr-1" />
          Annulla
        </Button>
        <Button
          onClick={handleSave}
          disabled={!formData.companyName || createMutation.isPending || updateMutation.isPending}
          data-testid="button-billing-save"
        >
          {(createMutation.isPending || updateMutation.isPending) ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Check className="w-4 h-4 mr-2" />
          )}
          Salva Profilo
        </Button>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Receipt className="w-5 h-5" />
          Profili di Fatturazione
        </CardTitle>
        <CardDescription>
          Configura i dati aziendali per i preventivi in base al tipo di appalto (Privato / Pubblico)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {profiles.map((profile) => (
              <div key={profile.id} className="border rounded-md p-4 relative" data-testid={`billing-profile-${profile.profileType}`}>
                <div
                  className="absolute left-0 top-[8px] bottom-[8px] w-[3px] rounded-full"
                  style={{ backgroundColor: profileTypeColor(profile.profileType) }}
                />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" style={{ borderColor: profileTypeColor(profile.profileType), color: profileTypeColor(profile.profileType) }}>
                      {profileTypeLabel(profile.profileType)}
                    </Badge>
                    <span className="font-medium">{profile.companyName}</span>
                    {profile.vatNumber && (
                      <span className="text-sm text-muted-foreground">P.IVA {profile.vatNumber}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => startEdit(profile)} data-testid={`button-edit-billing-${profile.profileType}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Eliminare questo profilo di fatturazione?")) {
                          deleteMutation.mutate(profile.id);
                        }
                      }}
                      data-testid={`button-delete-billing-${profile.profileType}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {profile.address && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {profile.address}{profile.city ? `, ${profile.city}` : ""}{profile.province ? ` (${profile.province})` : ""}
                  </p>
                )}
                {editingProfile === profile.id && renderProfileForm()}
              </div>
            ))}

            {creatingType && (
              <div className="border rounded-md p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" style={{ borderColor: profileTypeColor(creatingType), color: profileTypeColor(creatingType) }}>
                    {profileTypeLabel(creatingType)}
                  </Badge>
                  <span className="text-sm text-muted-foreground">Nuovo profilo</span>
                </div>
                {renderProfileForm()}
              </div>
            )}

            {!creatingType && !editingProfile && (
              <div className="flex items-center gap-2 flex-wrap">
                {!hasPrivate && (
                  <Button variant="outline" onClick={() => startCreate("PRIVATE")} data-testid="button-add-billing-private">
                    <Plus className="w-4 h-4 mr-1" />
                    Profilo Privato
                  </Button>
                )}
                {!hasPublic && (
                  <Button variant="outline" onClick={() => startCreate("PUBLIC")} data-testid="button-add-billing-public">
                    <Plus className="w-4 h-4 mr-1" />
                    Profilo Pubblico
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NotificationPreferencesSection({ userRole }: { userRole: string }) {
  const { toast } = useToast();
  const { data: prefs = [], isLoading } = useQuery<{ id: string; userId: string; notificationType: string; enabled: boolean }[]>({
    queryKey: ["/api/notification-preferences"],
  });

  const updatePref = useMutation({
    mutationFn: async ({ type, enabled }: { type: string; enabled: boolean }) => {
      await apiRequest("PUT", `/api/notification-preferences/${type}`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notification-preferences"] });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile aggiornare la preferenza", variant: "destructive" });
    },
  });

  type SimpleToggle = { key: string; label: string; description: string; roles: string[]; types: string[] };
  const toggles: SimpleToggle[] = [
    { key: "NEW_PROJECT", label: "Nuovi cantieri", description: "Notifica quando un'opportunità viene vinta e si crea un nuovo progetto", roles: ["TECHNICIAN"], types: ["NEW_PROJECT"] },
    { key: "SITE_PHOTO_VIDEO", label: "Cantieri da foto e/o video", description: "Notifica quando un cantiere vinto richiede foto e/o video", roles: ["COMPANY_ADMIN", "SUPER_ADMIN"], types: ["SITE_PHOTO", "SITE_PHOTO_VIDEO"] },
    { key: "STALE_OPPORTUNITY", label: "Opportunità in attesa", description: "Mostra le opportunità ferme nella prima colonna da più di 4 ore nella dashboard", roles: ["COMPANY_ADMIN", "SUPER_ADMIN", "SALES_AGENT"], types: ["STALE_OPPORTUNITY"] },
    { key: "RDC_PENDING", label: "RDC in attesa", description: "Notifica quando un progetto rimane nella fase con 'RDC' da almeno 3 giorni", roles: ["TECHNICIAN", "COMPANY_ADMIN", "SUPER_ADMIN"], types: ["RDC_PENDING"] },
    { key: "LEAD_CALL_REQUEST", label: "Contatto da chiamare", description: "Notifica quando la segreteria segnala un nuovo contatto da richiamare", roles: ["SALES_AGENT", "COMPANY_ADMIN"], types: ["LEAD_CALL_REQUEST"] },
  ];

  const visibleToggles = toggles.filter(t => t.roles.includes(userRole));
  if (visibleToggles.length === 0) return null;

  const isEnabled = (types: string[]) => {
    const relevantPrefs = prefs.filter(p => types.includes(p.notificationType));
    if (relevantPrefs.length === 0) return true;
    return relevantPrefs.some(p => p.enabled);
  };

  const handleToggle = (toggle: SimpleToggle, checked: boolean) => {
    toggle.types.forEach(type => {
      updatePref.mutate({ type, enabled: checked });
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Preferenze Notifiche
        </CardTitle>
        <CardDescription>
          Scegli quali notifiche ricevere
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {visibleToggles.map(t => (
              <div key={t.key} className="flex items-center justify-between gap-4 py-2" data-testid={`notif-pref-${t.key}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                </div>
                <Switch
                  checked={isEnabled(t.types)}
                  onCheckedChange={(checked) => handleToggle(t, checked)}
                  data-testid={`switch-notif-${t.key}`}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============ CLAUSOLE SECTION ============

interface ClauseDefinition {
  id: string;
  label: string;
  description: string;
  defaultText: string;
}

const INSTALLAZIONE_CLAUSES: ClauseDefinition[] = [
  { id: "validita_offerta", label: "Validità Offerta", description: "Sempre visibile — mostra la durata di validità dell'offerta (es. 20 gg.)", defaultText: "VALIDITA' OFFERTA E PROMOZIONE: 20 gg." },
  { id: "pont_facciata_copertura", label: "Ponteggio Facciata + Copertura", description: "Visibile se il ponteggio copre sia facciata che tetto (o nuova costruzione)", defaultText: "Ponteggio per Vostre lavorazioni di facciata e in copertura, posizionando l'ultimo piano di lavoro a circa 50 cm dalla linea di gronda con parapetti H. 2 mt e rete anti caduta. Lo stesso seguirà l'andamento geometrico delle facciate e sarà dotato di piani di lavoro con interasse 2 mt" },
  { id: "pont_solo_facciata", label: "Ponteggio Solo Facciata", description: "Visibile se il ponteggio copre solo la facciata (senza tetto)", defaultText: "Ponteggio per Vostre lavorazioni di facciata, posizionando l'ultimo piano di lavoro a circa 1.80 mt dalla linea di gronda, seguirà per quanto possibile l'andamento geometrico delle facciate e sarà dotato di piani di lavoro con interasse 2 mt" },
  { id: "pont_solo_tetto", label: "Ponteggio Solo Tetto", description: "Visibile se il ponteggio copre solo il tetto (senza facciata)", defaultText: "Ponteggio per Vostre lavorazioni in copertura, posizionando l'ultimo piano di lavoro a circa 50 cm dalla linea di gronda con parapetti H. 2 mt e rete anti caduta con relativo sottoponte di sicurezza e con una rampa scale di risalita sino all'ultimo livello" },
  { id: "struttura_telaio_105", label: "Struttura a Telaio 105", description: "Visibile se è selezionata la struttura a telaio 105 nel catalogo", defaultText: "Struttura in materiale a telai avente passo 1,80 e larghezza 1,05 corredato da parapetti a protezione e salvaguardia del personale, piani di lavoro e relativo sottoponte di sicurezza, fermapiedi, botole e scale d'accesso come da normativa vigente in materia" },
  { id: "struttura_multidirezionale", label: "Struttura Multidirezionale", description: "Visibile se è selezionata la struttura multidirezionale nel catalogo", defaultText: "Struttura in materiale a montanti e traversi prefabbricati (multidirezionale con larghezza 75) corredato da parapetti a protezione e salvaguardia del personale, piani di lavoro e relativo sottoponte di sicurezza, fermapiedi, botole e scale d'accesso come da normativa vigente in materia" },
  { id: "montacarichi_desc", label: "Descrizione Montacarichi", description: "Visibile se è presente un montacarichi nel preventivo", defaultText: "Ascensore montacarichi Electroelsa modello PM-M10 monofase con portata di 800 kg alto 15 mt e con 3 sbarchi in quota dotato di ogni dispositivo di sicurezza necessario, come da normativa vigente in materia.\nVerrà previsto inoltre un castelletto di servizio in ponteggio tradizionale per agevolare lo sbarco ai piani" },
  { id: "mensole_sbalzo", label: "Mensole a Sbalzo (ove necessarie)", description: "Visibile se sono presenti mensole nel preventivo", defaultText: "Mensole a sbalzo ove necessarie" },
  { id: "mensole_parete", label: "Mensole Verso Parete", description: "Visibile se sono presenti mensole nel preventivo", defaultText: "Mensole a sbalzo Verso parete" },
  { id: "mensole_copertura", label: "Mensole per Copertura", description: "Visibile se sono presenti mensole nel preventivo", defaultText: "Mensole a sbalzo Per camminamento in copertura" },
  { id: "mensole_tubo_tavolone", label: "Tubo con Tavolone", description: "Visibile se sono presenti mensole nel preventivo", defaultText: "Tubo con tavolone in legno verso parete ad ogni solaio (legname a Vostro carico)" },
  { id: "parap_parete_parte", label: "Parapetti Parete (parte perimetro)", description: "Visibile se sono presenti parapetti a parete nel preventivo", defaultText: "Parapetti provvisori a parete su parte del perimetro del tetto oggetto del vostro intervento, non coperta dal ponteggio" },
  { id: "parap_parete_perimetro", label: "Parapetti Parete (perimetro completo)", description: "Visibile se sono presenti parapetti a parete nel preventivo", defaultText: "Parapetti provvisori a parete lungo il perimetro del tetto oggetto del vostro intervento" },
  { id: "parap_salvafacciate_parte", label: "Parapetti Salvafacciate (parte)", description: "Visibile se sono presenti parapetti a parete nel preventivo", defaultText: "Parapetti provvisori salvafacciate su parte del perimetro del tetto oggetto del vostro intervento, non coperta dal ponteggio" },
  { id: "parap_salvafacciate_perimetro", label: "Parapetti Salvafacciate (perimetro)", description: "Visibile se sono presenti parapetti a parete nel preventivo", defaultText: "Parapetti provvisori salvafacciate lungo il perimetro del tetto oggetto del vostro intervento" },
  { id: "parap_sottoveletta_parte", label: "Parapetti Sottoveletta (parte)", description: "Visibile se sono presenti parapetti a parete nel preventivo", defaultText: "Parapetti provvisori sottoveletta su parte del perimetro del tetto oggetto del vostro intervento, non coperta dal ponteggio" },
  { id: "parap_sottoveletta_perimetro", label: "Parapetti Sottoveletta (perimetro)", description: "Visibile se sono presenti parapetti a parete nel preventivo", defaultText: "Parapetti provvisori sottoveletta lungo il perimetro del tetto oggetto del vostro intervento" },
  { id: "parap_morsa_vert_parte", label: "Parapetti Morsa Verticale (parte)", description: "Visibile se sono presenti parapetti a morsa nel preventivo", defaultText: "Parapetti provvisori a morsa verticale su parte del perimetro del tetto oggetto del vostro intervento, non coperta dal ponteggio" },
  { id: "parap_morsa_vert_perimetro", label: "Parapetti Morsa Verticale (perimetro)", description: "Visibile se sono presenti parapetti a morsa nel preventivo", defaultText: "Parapetti provvisori a morsa verticale lungo il perimetro del tetto oggetto del vostro intervento" },
  { id: "parap_morsa_oriz_parte", label: "Parapetti Morsa Orizzontale (parte)", description: "Visibile se sono presenti parapetti a morsa nel preventivo", defaultText: "Parapetti provvisori a morsa orizzontale su parte del perimetro del tetto oggetto del vostro intervento, non coperta dal ponteggio" },
  { id: "parap_morsa_oriz_perimetro", label: "Parapetti Morsa Orizzontale (perimetro)", description: "Visibile se sono presenti parapetti a morsa nel preventivo", defaultText: "Parapetti provvisori a morsa orizzontale lungo il perimetro del tetto oggetto del vostro intervento" },
  { id: "parap_tubogiunto_parte", label: "Parapetto Tubo e Giunto (parte)", description: "Visibile se sono presenti parapetti tubo-giunto nel preventivo", defaultText: "Parapetto in tubo e giunto su parte del perimetro del tetto oggetto del vostro intervento, non coperta dal ponteggio" },
  { id: "parap_tubogiunto_area", label: "Parapetto Tubo e Giunto (area lavoro)", description: "Visibile se sono presenti parapetti tubo-giunto nel preventivo", defaultText: "Parapetto in tubo e giunto per delimitazione area di lavoro in copertura" },
  { id: "rampa_scale_parapetti", label: "Rampa Scale (con parapetti)", description: "Visibile se sono presenti parapetti di qualsiasi tipo nel preventivo", defaultText: "Verrà prevista inoltre una rampa scale in materiale a telai avente lunghezza 3,60 e larghezza 1,05 corredata da parapetti a protezione e salvaguardia del personale, piani di lavoro, fermapiedi e quant'altro necessario, come da normativa vigente in materia" },
  { id: "scala_esterna", label: "Scala Esterna", description: "Visibile se è presente una scala esterna nel preventivo", defaultText: "Scala esterna in materiale multidirezionale con altezza di 8 mt\nStruttura in materiale a montanti e traversi prefabbricati corredato da parapetti a protezione e salvaguardia del personale e fermapiedi come da normativa vigente in materia" },
  { id: "cielo_piano_lavoro", label: "Cielo / Piano di Lavoro in Quota", description: "Visibile se è presente un cielo/piano in quota nel preventivo", defaultText: "Piano di lavoro in quota composto da travi reticolari e compreso di rete anti caduta come sottoponte" },
  { id: "copertura_provvisoria", label: "Copertura Scorrevole Provvisoria", description: "Visibile se è presente una copertura provvisoria nel preventivo", defaultText: "Copertura scorrevole provvisoria con struttura formata da travi prefabbricate in alluminio e teli in PVC montata su rotaie al disopra del ponteggio completa di tiranti, diagonali e quant'altro onere necessario per garantire la massima sicurezza e stabilità" },
  { id: "stima_mq_indicazioni", label: "Stima MQ (da indicazioni)", description: "Visibile se è presente un ponteggio e la stima è basata su indicazioni del cliente", defaultText: "Si stima indicativamente una superficie di ponteggio pari a: 0 mq calcolato in base alle Vostre indicazioni" },
  { id: "stima_mq_computo", label: "Stima MQ (da computo)", description: "Visibile se è presente un ponteggio e la stima è da computo", defaultText: "Si stima indicativamente una superficie di ponteggio pari a: 0 mq come indicato da Vostro computo" },
  { id: "stima_mq_generico", label: "Stima MQ (generico)", description: "Visibile se è presente un ponteggio (alternativa generica)", defaultText: "Si stima indicativamente una superficie di ponteggio pari a: 0 mq" },
  { id: "materiale_proprieta_cliente", label: "Materiale di Proprietà Cliente", description: "Visibile nei preventivi Solo Manodopera (materiale del cliente)", defaultText: "Si precisa che il materiale è di Vs. proprietà, per quanto riguarda la fase di montaggio, sarà nostra cura inviarvi una distinta con le quantità necessarie, che dovranno essere presenti a piè d'opera in cantiere prima dell'inizio dei lavori. Lo stesso dovrà, come previsto dalla normativa vigente, per ogni tipologia – tubo & giunto, montanti e traversi, telai - appartenere tutto ad una stessa autorizzazione ministeriale, deve inoltre essere integro in ogni sua parte ed adeguatamente verniciato" },
];

const NOTA_BENE_CLAUSES: ClauseDefinition[] = [
  { id: "nb_fattura_quantita_effettive", label: "Fatturazione Quantità Effettive", description: "Visibile solo nei cantieri 'a MQ' (non a corpo)", defaultText: "In fattura verranno contabilizzate le quantità effettivamente installate in base alle rilevazioni eseguite a fine montaggio" },
  { id: "nb_prezzi_previo_sopralluogo", label: "Prezzi Previo Sopralluogo", description: "Visibile solo se il sopralluogo non è ancora stato effettuato", defaultText: "I prezzi indicati verranno confermati solo previo sopralluogo in cantiere di un nostro tecnico" },
  { id: "nb_gru_cantiere", label: "Gru di Cantiere", description: "Visibile solo se è prevista una gru di cantiere del cliente", defaultText: "La movimentazione dei materiali con gru di cantiere, durante le fasi di montaggio, smontaggio, carico e scarico del camion sarà a Vostro carico; in caso contrario i prezzi indicati potrebbero essere soggetti a variazioni" },
  { id: "nb_danni_calpestio", label: "Danni da Calpestio", description: "Sempre attiva", defaultText: "Durante le fasi di montaggio e smontaggio sopra tetti le riparazioni degli eventuali danni causati dal calpestio di nostre maestranze saranno a vostro carico" },
  { id: "nb_escluso_non_menzionato", label: "Escluso Non Menzionato", description: "Sempre attiva", defaultText: "Quanto non espressamente menzionato nell'offerta è da ritenersi escluso" },
  { id: "nb_assito_cantiere", label: "Assito di Cantiere", description: "Sempre attiva", defaultText: "Assito di cantiere a Vostro carico." },
];

interface ClauseItemRowProps {
  def: ClauseDefinition;
  overrideText: string | undefined;
  onSave: (clauseId: string, text: string) => void;
  isSaving: boolean;
}

function ClauseItemRow({ def, overrideText, onSave, isSaving }: ClauseItemRowProps) {
  const hasOverride = overrideText !== undefined && overrideText !== "";
  const [localText, setLocalText] = useState(hasOverride ? overrideText : def.defaultText);
  const [isDirty, setIsDirty] = useState(false);

  const currentText = hasOverride ? overrideText : def.defaultText;

  const handleChange = (v: string) => {
    setLocalText(v);
    setIsDirty(v !== currentText);
  };

  const handleSave = () => {
    onSave(def.id, localText);
    setIsDirty(false);
  };

  const handleReset = () => {
    setLocalText(def.defaultText);
    setIsDirty(localText !== def.defaultText);
    onSave(def.id, "");
  };

  return (
    <div className="border rounded-lg p-4 space-y-3" data-testid={`clause-row-${def.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{def.label}</span>
            {hasOverride ? (
              <Badge variant="default" className="text-xs" data-testid={`badge-status-${def.id}`}>Personalizzato</Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground" data-testid={`badge-status-${def.id}`}>Default</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>
        </div>
        <div className="flex gap-1 shrink-0">
          {hasOverride && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={isSaving}
              title="Ripristina testo predefinito"
              data-testid={`button-reset-${def.id}`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          )}
          {isDirty && (
            <Button
              variant="default"
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              data-testid={`button-save-${def.id}`}
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span className="ml-1">Salva</span>
            </Button>
          )}
        </div>
      </div>
      <Textarea
        value={localText}
        onChange={(e) => handleChange(e.target.value)}
        className="text-sm min-h-[80px] resize-y"
        data-testid={`textarea-clause-${def.id}`}
      />
    </div>
  );
}

interface AdditionalServiceRowProps {
  article: Article;
  onSave: (articleId: string, field: "serviceDescriptionMounting" | "serviceDescriptionRental", value: string) => void;
  isSaving: boolean;
}

function AdditionalServiceRow({ article, onSave, isSaving }: AdditionalServiceRowProps) {
  const [mountingText, setMountingText] = useState(article.serviceDescriptionMounting || "");
  const [rentalText, setRentalText] = useState(article.serviceDescriptionRental || "");
  const [mountingDirty, setMountingDirty] = useState(false);
  const [rentalDirty, setRentalDirty] = useState(false);

  return (
    <div className="border rounded-lg p-4 space-y-3" data-testid={`service-row-${article.id}`}>
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">{article.name}</span>
        <Badge variant="outline" className="text-xs text-muted-foreground">{article.code}</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Testo Montaggio/Smontaggio</Label>
          <Textarea
            value={mountingText}
            onChange={(e) => { setMountingText(e.target.value); setMountingDirty(true); }}
            className="text-sm min-h-[70px] resize-y"
            placeholder="Descrizione per la riga montaggio/smontaggio..."
            data-testid={`textarea-mounting-${article.id}`}
          />
          {mountingDirty && (
            <Button
              size="sm"
              variant="default"
              onClick={() => { onSave(article.id, "serviceDescriptionMounting", mountingText); setMountingDirty(false); }}
              disabled={isSaving}
              data-testid={`button-save-mounting-${article.id}`}
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
              Salva
            </Button>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Testo Noleggio</Label>
          <Textarea
            value={rentalText}
            onChange={(e) => { setRentalText(e.target.value); setRentalDirty(true); }}
            className="text-sm min-h-[70px] resize-y"
            placeholder="Descrizione per la riga noleggio..."
            data-testid={`textarea-rental-${article.id}`}
          />
          {rentalDirty && (
            <Button
              size="sm"
              variant="default"
              onClick={() => { onSave(article.id, "serviceDescriptionRental", rentalText); setRentalDirty(false); }}
              disabled={isSaving}
              data-testid={`button-save-rental-${article.id}`}
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
              Salva
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsCollapsibleSection({ title, description, children, defaultOpen = true }: { title: string; description?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-lg overflow-hidden" data-testid="collapsible-section">
      <button
        type="button"
        className="flex items-center gap-3 w-full text-left px-4 py-3 bg-muted/50 hover:bg-muted transition-colors"
        onClick={() => setIsOpen(prev => !prev)}
        data-testid="collapsible-toggle"
      >
        <ChevronDown className={`w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} />
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold">{title}</h3>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </button>
      {isOpen && (
        <div className="px-4 py-4 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

function ClausoleSection() {
  const { toast } = useToast();

  const { data: overrides = [], isLoading: isLoadingOverrides } = useQuery<{ id: string; clauseId: string; text: string; companyId: string; updatedAt: string }[]>({
    queryKey: ["/api/settings/clauses"],
  });

  const { data: articles = [], isLoading: isLoadingArticles } = useQuery<Article[]>({
    queryKey: ["/api/articles"],
  });

  const additionalServiceArticles = articles.filter(a => a.isAdditionalService === 1);

  const overrideMap: Record<string, string> = {};
  for (const o of overrides) {
    overrideMap[o.clauseId] = o.text;
  }

  const saveClauseMutation = useMutation({
    mutationFn: async ({ clauseId, text }: { clauseId: string; text: string }) => {
      const res = await apiRequest("PUT", `/api/settings/clauses/${clauseId}`, { text });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/clauses"] });
      toast({ title: "Testo salvato" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const saveArticleMutation = useMutation({
    mutationFn: async ({ articleId, field, value }: { articleId: string; field: string; value: string }) => {
      const res = await apiRequest("PATCH", `/api/articles/${articleId}`, { [field]: value });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      toast({ title: "Testo servizio salvato" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const handleSaveClause = (clauseId: string, text: string) => {
    saveClauseMutation.mutate({ clauseId, text });
  };

  const handleSaveArticle = (articleId: string, field: "serviceDescriptionMounting" | "serviceDescriptionRental", value: string) => {
    saveArticleMutation.mutate({ articleId, field, value });
  };

  const isLoading = isLoadingOverrides || isLoadingArticles;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileEdit className="w-5 h-5" />
          Testi Clausole
        </CardTitle>
        <CardDescription>
          Personalizza i testi predefiniti delle clausole dello Step 4 del preventivatore. Il preventivatore usa il testo personalizzato se presente, altrimenti usa il testo predefinito.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <SettingsCollapsibleSection
              title="Descrizione Installazione"
              description="Clausole che descrivono la tipologia di ponteggio e gli elementi installati"
              defaultOpen={false}
            >
              <div className="space-y-3">
                {INSTALLAZIONE_CLAUSES.map(def => (
                  <ClauseItemRow
                    key={def.id}
                    def={def}
                    overrideText={overrideMap[def.id]}
                    onSave={handleSaveClause}
                    isSaving={saveClauseMutation.isPending}
                  />
                ))}
              </div>
            </SettingsCollapsibleSection>

            <SettingsCollapsibleSection
              title="Altri Servizi Opzionali"
              description={'Testi delle voci "montaggio/smontaggio" e "noleggio" per i servizi aggiuntivi del catalogo'}
              defaultOpen={false}
            >
              {additionalServiceArticles.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Nessun servizio aggiuntivo trovato nel catalogo. Attiva la flag "Servizio Aggiuntivo" su un articolo del catalogo per farlo comparire qui.</p>
              ) : (
                <div className="space-y-3">
                  {additionalServiceArticles.map(article => (
                    <AdditionalServiceRow
                      key={article.id}
                      article={article}
                      onSave={handleSaveArticle}
                      isSaving={saveArticleMutation.isPending}
                    />
                  ))}
                </div>
              )}
            </SettingsCollapsibleSection>

            <SettingsCollapsibleSection
              title="Clausole Legali / Note Bene"
              description="Note bene e clausole legali che appaiono nella sezione finale del preventivo"
              defaultOpen={false}
            >
              <div className="space-y-3">
                {NOTA_BENE_CLAUSES.map(def => (
                  <ClauseItemRow
                    key={def.id}
                    def={def}
                    overrideText={overrideMap[def.id]}
                    onSave={handleSaveClause}
                    isSaving={saveClauseMutation.isPending}
                  />
                ))}
              </div>
            </SettingsCollapsibleSection>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExternalEngineersSection() {
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const { data: engineers = [], isLoading } = useQuery<{ id: string; name: string; companyId: string; createdAt: string }[]>({
    queryKey: ["/api/external-engineers"],
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/external-engineers", { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/external-engineers"] });
      setNewName("");
      toast({ title: "Ingegnere aggiunto" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiRequest("PUT", `/api/external-engineers/${id}`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/external-engineers"] });
      setEditingId(null);
      toast({ title: "Ingegnere aggiornato" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/external-engineers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/external-engineers"] });
      toast({ title: "Ingegnere eliminato" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message || "Impossibile eliminare l'ingegnere", variant: "destructive" });
    },
  });

  const handleAdd = () => {
    if (!newName.trim()) return;
    createMutation.mutate(newName.trim());
  };

  const startEdit = (engineer: { id: string; name: string }) => {
    setEditingId(engineer.id);
    setEditingName(engineer.name);
  };

  const confirmEdit = () => {
    if (editingId && editingName.trim()) {
      updateMutation.mutate({ id: editingId, name: editingName.trim() });
    } else {
      setEditingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <HardHat className="w-5 h-5" />
          Ingegneri Esterni
        </CardTitle>
        <CardDescription>
          Gestisci gli ingegneri esterni da associare ai progetti per la fase RDC
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {engineers.length === 0 && (
              <p className="text-sm text-muted-foreground italic" data-testid="text-no-engineers">
                Nessun ingegnere esterno registrato.
              </p>
            )}
            {engineers.map((eng) => (
              <div key={eng.id} className="flex items-center gap-2 p-2 border rounded-md bg-card" data-testid={`engineer-row-${eng.id}`}>
                {editingId === eng.id ? (
                  <>
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmEdit(); } if (e.key === "Escape") setEditingId(null); }}
                      className="flex-1 h-8 text-sm"
                      autoFocus
                      data-testid={`input-edit-engineer-${eng.id}`}
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={confirmEdit} disabled={updateMutation.isPending} data-testid={`button-confirm-edit-engineer-${eng.id}`}>
                      {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-green-600" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)} data-testid={`button-cancel-edit-engineer-${eng.id}`}>
                      <X className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm" data-testid={`text-engineer-name-${eng.id}`}>{eng.name}</span>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(eng)} data-testid={`button-edit-engineer-${eng.id}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Eliminare l'ingegnere "${eng.name}"?`)) {
                          deleteMutation.mutate(eng.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-engineer-${eng.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
                placeholder="Nome ingegnere..."
                className="flex-1"
                data-testid="input-new-engineer"
              />
              <Button onClick={handleAdd} disabled={!newName.trim() || createMutation.isPending} data-testid="button-add-engineer">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                Aggiungi
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { user, logout, updateUser } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "COMPANY_ADMIN" || user?.role === "SUPER_ADMIN";

  const userInitials = user?.firstName && user?.lastName 
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : user?.email?.[0]?.toUpperCase() || "U";

  const userName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.email || "Utente";

  const roleLabel = {
    SUPER_ADMIN: "Super Admin",
    COMPANY_ADMIN: "Amministratore",
    SALES_AGENT: "Agente",
    TECHNICIAN: "Tecnico",
  }[user?.role || "SALES_AGENT"];

  function handleLogout() {
    logout();
    window.location.href = "/login";
  }

  const { data: company, isLoading: companyLoading } = useQuery<Company>({
    queryKey: ["/api/company"],
  });

  const [companyForm, setCompanyForm] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
    vatNumber: "",
    fiscalCode: "",
    shareCapital: "",
    iban: "",
  });

  useEffect(() => {
    if (company) {
      setCompanyForm({
        name: company.name || "",
        address: company.address || "",
        phone: company.phone || "",
        email: company.email || "",
        vatNumber: company.vatNumber || "",
        fiscalCode: company.fiscalCode || "",
        shareCapital: company.shareCapital || "",
        iban: company.iban || "",
      });
    }
  }, [company]);

  const updateCompanyMutation = useMutation({
    mutationFn: async (data: typeof companyForm) => {
      const response = await apiRequest("PATCH", "/api/company", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company"] });
      toast({
        title: "Salvato",
        description: "I dati aziendali sono stati aggiornati con successo.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile salvare i dati aziendali.",
        variant: "destructive",
      });
    },
  });

  function handleCompanySubmit(e: React.FormEvent) {
    e.preventDefault();
    updateCompanyMutation.mutate(companyForm);
  }

  function handleCompanyChange(field: keyof typeof companyForm, value: string) {
    setCompanyForm((prev) => ({ ...prev, [field]: value }));
  }

  // Profile image upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      setUploadingImage(true);
      const formData = new FormData();
      formData.append("image", file);
      const token = getAuthToken();
      const response = await fetch("/api/users/profile-image", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Errore nel caricamento");
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      updateUser({ profileImageUrl: data.profileImageUrl });
      toast({ title: "Immagine profilo aggiornata" });
      setUploadingImage(false);
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
      setUploadingImage(false);
    },
  });

  const removeImageMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/users/profile-image");
      return response.json();
    },
    onSuccess: () => {
      updateUser({ profileImageUrl: null });
      toast({ title: "Immagine profilo rimossa" });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "Errore", description: "L'immagine non deve superare i 5MB", variant: "destructive" });
        return;
      }
      uploadImageMutation.mutate(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Profilo utente form
  const [profileForm, setProfileForm] = useState({
    displayName: "",
    contactEmail: "",
    phone: "",
  });

  useEffect(() => {
    if (user) {
      setProfileForm({
        displayName: (user as any).displayName || "",
        contactEmail: (user as any).contactEmail || "",
        phone: (user as any).phone || "",
      });
    }
  }, [user]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: typeof profileForm) => {
      const response = await apiRequest("PATCH", "/api/users/profile", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Salvato",
        description: "I dati del profilo sono stati aggiornati con successo.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile salvare i dati del profilo.",
        variant: "destructive",
      });
    },
  });

  function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateProfileMutation.mutate(profileForm);
  }

  function handleProfileChange(field: keyof typeof profileForm, value: string) {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
  }

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: "",
  });
  const [passwordError, setPasswordError] = useState("");

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const response = await apiRequest("POST", "/api/users/change-password", data);
      return response.json();
    },
    onSuccess: () => {
      setPasswordForm({ currentPassword: "", newPassword: "", confirmNewPassword: "" });
      setPasswordError("");
      toast({
        title: "Password aggiornata",
        description: "La tua password è stata cambiata con successo.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile cambiare la password.",
        variant: "destructive",
      });
    },
  });

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    
    if (passwordForm.newPassword.length < 8) {
      setPasswordError("La password deve avere almeno 8 caratteri");
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(passwordForm.newPassword)) {
      setPasswordError("La password deve contenere almeno una maiuscola, una minuscola e un numero");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmNewPassword) {
      setPasswordError("Le password non corrispondono");
      return;
    }
    changePasswordMutation.mutate({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
  }

  return (
    <DashboardLayout user={user!} fullWidth>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Impostazioni</h1>
          <p className="text-muted-foreground mt-1">
            Gestisci il tuo profilo e le preferenze
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="w-5 h-5" />
              Profilo Utente
            </CardTitle>
            <CardDescription>
              Le informazioni del tuo account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="relative group">
                <Avatar className="w-16 h-16 cursor-pointer" onClick={() => fileInputRef.current?.click()} data-testid="button-avatar-upload">
                  <AvatarImage src={user?.profileImageUrl || undefined} alt={userName} />
                  <AvatarFallback className="text-lg">{userInitials}</AvatarFallback>
                </Avatar>
                <div
                  className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ visibility: uploadingImage ? "visible" : undefined }}
                >
                  {uploadingImage ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : (
                    <Pencil className="w-5 h-5 text-white" />
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleImageSelect}
                  data-testid="input-profile-image"
                />
              </div>
              <div>
                <h3 className="text-lg font-medium" data-testid="text-user-name">{userName}</h3>
                <Badge variant="secondary" className="mt-1">{roleLabel}</Badge>
                <div className="flex items-center gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    data-testid="button-change-photo"
                  >
                    {uploadingImage ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Pencil className="w-3 h-3 mr-1" />}
                    {user?.profileImageUrl ? "Cambia foto" : "Carica foto"}
                  </Button>
                  {user?.profileImageUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeImageMutation.mutate()}
                      disabled={removeImageMutation.isPending}
                      data-testid="button-remove-photo"
                    >
                      {removeImageMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1" />}
                      Rimuovi
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="w-4 h-4" />
                  Email (Login)
                </div>
                <p className="text-sm font-medium" data-testid="text-user-email">
                  {user?.email || "Non disponibile"}
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  Membro dal
                </div>
                <p className="text-sm font-medium">
                  {user?.createdAt
                    ? format(new Date(user.createdAt), "d MMMM yyyy", { locale: it })
                    : "Non disponibile"}
                </p>
              </div>
            </div>

            <form onSubmit={handleProfileSubmit} className="space-y-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Questi dati appariranno nei documenti e preventivi che crei
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-display-name">
                    <FileText className="w-4 h-4 inline mr-1" />
                    Nome nei Documenti
                  </Label>
                  <Input
                    id="profile-display-name"
                    data-testid="input-profile-display-name"
                    value={profileForm.displayName}
                    onChange={(e) => handleProfileChange("displayName", e.target.value)}
                    placeholder={userName}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-contact-email">
                    <Mail className="w-4 h-4 inline mr-1" />
                    Email di Contatto
                  </Label>
                  <Input
                    id="profile-contact-email"
                    data-testid="input-profile-contact-email"
                    type="email"
                    value={profileForm.contactEmail}
                    onChange={(e) => handleProfileChange("contactEmail", e.target.value)}
                    placeholder={user?.email || "email@esempio.it"}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-phone">
                    <Phone className="w-4 h-4 inline mr-1" />
                    Telefono
                  </Label>
                  <Input
                    id="profile-phone"
                    data-testid="input-profile-phone"
                    type="tel"
                    value={profileForm.phone}
                    onChange={(e) => handleProfileChange("phone", e.target.value)}
                    placeholder="+39 000 0000000"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button 
                  type="submit" 
                  disabled={updateProfileMutation.isPending}
                  data-testid="button-save-profile"
                >
                  {updateProfileMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Salva Profilo
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Dati Aziendali
              </CardTitle>
              <CardDescription>
                Configura le informazioni aziendali che appariranno nei preventivi PDF
              </CardDescription>
            </CardHeader>
            <CardContent>
              {companyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <form onSubmit={handleCompanySubmit} className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="company-name">Nome Azienda</Label>
                    <Input
                      id="company-name"
                      data-testid="input-company-name"
                      value={companyForm.name}
                      onChange={(e) => handleCompanyChange("name", e.target.value)}
                      placeholder="DA.DO. PONTEGGI S.R.L."
                      
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-address">
                      <MapPin className="w-4 h-4 inline mr-1" />
                      Indirizzo
                    </Label>
                    <Input
                      id="company-address"
                      data-testid="input-company-address"
                      value={companyForm.address}
                      onChange={(e) => handleCompanyChange("address", e.target.value)}
                      placeholder="Via Montello, 56 - 31036 Istrana (TV)"
                      
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="company-phone">
                      <Phone className="w-4 h-4 inline mr-1" />
                      Telefono
                    </Label>
                    <Input
                      id="company-phone"
                      data-testid="input-company-phone"
                      value={companyForm.phone}
                      onChange={(e) => handleCompanyChange("phone", e.target.value)}
                      placeholder="0422307911"
                      
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-email">
                      <Mail className="w-4 h-4 inline mr-1" />
                      Email
                    </Label>
                    <Input
                      id="company-email"
                      data-testid="input-company-email"
                      type="email"
                      value={companyForm.email}
                      onChange={(e) => handleCompanyChange("email", e.target.value)}
                      placeholder="info@dadoponteggi.it"
                      
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="company-vat">Partita IVA</Label>
                    <Input
                      id="company-vat"
                      data-testid="input-company-vat"
                      value={companyForm.vatNumber}
                      onChange={(e) => handleCompanyChange("vatNumber", e.target.value)}
                      placeholder="IT05315560267"
                      
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-fiscal">Codice Fiscale</Label>
                    <Input
                      id="company-fiscal"
                      data-testid="input-company-fiscal"
                      value={companyForm.fiscalCode}
                      onChange={(e) => handleCompanyChange("fiscalCode", e.target.value)}
                      placeholder="05315560267"
                      
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="company-capital">Capitale Sociale</Label>
                    <Input
                      id="company-capital"
                      data-testid="input-company-capital"
                      value={companyForm.shareCapital}
                      onChange={(e) => handleCompanyChange("shareCapital", e.target.value)}
                      placeholder="Euro 10.000,00 i.v."
                      
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-iban">
                      <CreditCard className="w-4 h-4 inline mr-1" />
                      IBAN
                    </Label>
                    <Input
                      id="company-iban"
                      data-testid="input-company-iban"
                      value={companyForm.iban}
                      onChange={(e) => handleCompanyChange("iban", e.target.value)}
                      placeholder="IT74S0200861900000107287061"
                      
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                    <Button 
                      type="submit" 
                      disabled={updateCompanyMutation.isPending}
                      data-testid="button-save-company"
                    >
                      {updateCompanyMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Salva Dati Aziendali
                    </Button>
                  </div>
              </form>
            )}
          </CardContent>
          </Card>
        )}

        {isAdmin && <BillingProfilesSection />}

        {isAdmin && <ExternalEngineersSection />}

        {isAdmin && <ClausoleSection />}

        <NotificationPreferencesSection userRole={user?.role || ""} />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              Cambio Password
            </CardTitle>
            <CardDescription>
              Modifica la password del tuo account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Password Corrente</Label>
                <Input
                  id="current-password"
                  type="password"
                  data-testid="input-current-password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                  placeholder="Inserisci la password corrente"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="new-password">Nuova Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    data-testid="input-new-password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                    placeholder="Min. 8 caratteri, 1 maiusc., 1 num."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-new-password">Conferma Nuova Password</Label>
                  <Input
                    id="confirm-new-password"
                    type="password"
                    data-testid="input-confirm-new-password"
                    value={passwordForm.confirmNewPassword}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmNewPassword: e.target.value }))}
                    placeholder="Ripeti la nuova password"
                  />
                </div>
              </div>
              {passwordError && (
                <p className="text-sm text-destructive" data-testid="text-password-error">{passwordError}</p>
              )}
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={changePasswordMutation.isPending || !passwordForm.currentPassword || !passwordForm.newPassword}
                  data-testid="button-change-password"
                >
                  {changePasswordMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <KeyRound className="w-4 h-4 mr-2" />
                  )}
                  Cambia Password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Account</CardTitle>
            <CardDescription>
              Gestisci la tua sessione
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              variant="destructive" 
              onClick={handleLogout}
              data-testid="button-logout-settings"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Esci dall'account
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
