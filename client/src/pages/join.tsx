import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth, type UserRole } from "@/lib/auth";
import { Loader2, Check, X, Building2, Mail, Shield } from "lucide-react";
import { APP_CONFIG } from "@/lib/config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const joinFormSchema = z.object({
  firstName: z.string().min(1, "Il nome è obbligatorio"),
  lastName: z.string().min(1, "Il cognome è obbligatorio"),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri").regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "La password deve contenere almeno una maiuscola, una minuscola e un numero"),
  confirmPassword: z.string().min(1, "Conferma la password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Le password non corrispondono",
  path: ["confirmPassword"],
});

type JoinFormValues = z.infer<typeof joinFormSchema>;

type InviteInfo = {
  email: string;
  role: string;
  companyName: string;
};

function PasswordRequirements({ password }: { password: string }) {
  const requirements = [
    { label: "Almeno 8 caratteri", met: password.length >= 8 },
    { label: "Una lettera maiuscola", met: /[A-Z]/.test(password) },
    { label: "Una lettera minuscola", met: /[a-z]/.test(password) },
    { label: "Un numero", met: /\d/.test(password) },
  ];

  const metCount = requirements.filter(r => r.met).length;
  const strengthPercent = (metCount / requirements.length) * 100;
  const strengthColor = metCount <= 1 ? "#ff4444" : metCount <= 2 ? "#ff8800" : metCount <= 3 ? "#ffcc00" : "#61CE85";

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${strengthPercent}%`, backgroundColor: strengthColor, boxShadow: `0 0 8px ${strengthColor}40` }}
          />
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: strengthColor }}>
          {metCount <= 1 ? "Debole" : metCount <= 2 ? "Media" : metCount <= 3 ? "Buona" : "Forte"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {requirements.map((req, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {req.met ? (
              <Check className="w-3 h-3 flex-shrink-0" style={{ color: "#61CE85" }} />
            ) : (
              <X className="w-3 h-3 flex-shrink-0" style={{ color: "rgba(255,255,255,0.25)" }} />
            )}
            <span
              className="text-[11px] font-mono transition-colors duration-300"
              style={{ color: req.met ? "#61CE85" : "rgba(255,255,255,0.35)" }}
            >
              {req.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function JoinPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { setAuth } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [fadeIn, setFadeIn] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successName, setSuccessName] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");
    setToken(tokenParam);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setFadeIn(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const form = useForm<JoinFormValues>({
    resolver: zodResolver(joinFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      password: "",
      confirmPassword: "",
    },
  });

  const watchPassword = form.watch("password");

  const { data: inviteInfo, isLoading: isVerifying, error: verifyError } = useQuery<InviteInfo>({
    queryKey: ["/api/auth/verify-invite", token],
    queryFn: async () => {
      if (!token) throw new Error("Token mancante");
      const response = await fetch(`/api/auth/verify-invite/${token}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Invito non valido");
      }
      return response.json();
    },
    enabled: !!token,
    retry: false,
  });

  const completeMutation = useMutation({
    mutationFn: async (data: JoinFormValues) => {
      const response = await fetch("/api/auth/complete-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          firstName: data.firstName,
          lastName: data.lastName,
          password: data.password,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Errore nella registrazione");
      }
      return response.json();
    },
    onSuccess: (data) => {
      setAuth(data.token, {
        id: data.user.id,
        email: data.user.email,
        firstName: data.user.firstName,
        lastName: data.user.lastName,
        role: data.user.role as UserRole,
      });
      setSuccessName(data.user.firstName || "Utente");
      setShowSuccess(true);
      setTimeout(() => navigate("/dashboard"), 2500);
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: JoinFormValues) => {
    completeMutation.mutate(data);
  };

  const renderErrorState = (icon: "missing" | "invalid", title: string, description: string) => (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className={`w-full max-w-md transition-opacity duration-700 ${fadeIn ? "opacity-100" : "opacity-0"}`}>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src="/logo-ponteggi.png" alt={APP_CONFIG.appName} className="h-12 object-contain" />
          </div>
          <CardTitle data-testid="text-error-title">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="w-full" onClick={() => navigate("/login")} data-testid="button-goto-login">
            Vai al login
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  if (!token) {
    return renderErrorState("missing", "Link non valido", "Il link di invito non contiene un token valido. Contatta l'amministratore.");
  }

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (verifyError || !inviteInfo) {
    return renderErrorState(
      "invalid",
      "Invito non valido",
      (verifyError as Error)?.message || "L'invito potrebbe essere scaduto o già utilizzato."
    );
  }

  if (showSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <img src="/logo-ponteggi.png" alt={APP_CONFIG.appName} className="h-12 object-contain" />
            </div>
            <CardTitle data-testid="text-welcome">Registrazione completata</CardTitle>
            <CardDescription>
              Benvenuto, <span className="font-medium">{successName}</span>. Reindirizzamento in corso...
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className={`w-full max-w-md transition-opacity duration-700 ${fadeIn ? "opacity-100" : "opacity-0"}`}>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src="/logo-ponteggi.png" alt={APP_CONFIG.appName} className="h-12 object-contain" />
          </div>
          <CardTitle data-testid="text-morpheus-title">Completa registrazione</CardTitle>
          <CardDescription>
            Imposta i tuoi dati per iniziare a usare <span className="font-medium">{APP_CONFIG.appName}</span>.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">

          <div className="rounded-md border p-4 bg-muted/30">
            <p className="text-center text-sm text-muted-foreground mb-3">
              Sei stato invitato a unirti al team
            </p>
            <div className="flex items-center justify-center gap-2 mb-2">
              <Building2 className="w-5 h-5 text-primary" />
              <span className="text-base font-semibold" data-testid="text-company-name">
                {inviteInfo.companyName}
              </span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground" data-testid="text-invite-email">
                {inviteInfo.email}
              </span>
            </div>
            {inviteInfo.role && (
              <div className="flex items-center justify-center gap-2 mt-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground" data-testid="text-invite-role">
                  Ruolo: {inviteInfo.role === "COMPANY_ADMIN" ? "Amministratore" : inviteInfo.role === "SALES_AGENT" ? "Agente commerciale" : inviteInfo.role === "TECHNICIAN" ? "Tecnico" : inviteInfo.role}
                </span>
              </div>
            )}
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Nome
                  </label>
                  <Input
                    placeholder="Mario"
                    {...form.register("firstName")}
                    data-testid="input-firstname"
                  />
                  {form.formState.errors.firstName && (
                    <p className="text-[11px] text-destructive">
                      {form.formState.errors.firstName.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Cognome
                  </label>
                  <Input
                    placeholder="Rossi"
                    {...form.register("lastName")}
                    data-testid="input-lastname"
                  />
                  {form.formState.errors.lastName && (
                    <p className="text-[11px] text-destructive">
                      {form.formState.errors.lastName.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Crea password
                </label>
                <Input
                  type="password"
                  placeholder="Almeno 8 caratteri, 1 maiuscola, 1 minuscola, 1 numero"
                  {...form.register("password")}
                  data-testid="input-password"
                />
                <PasswordRequirements password={watchPassword || ""} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Conferma password
                </label>
                <Input
                  type="password"
                  placeholder="Ripeti la password"
                  {...form.register("confirmPassword")}
                  data-testid="input-confirm-password"
                />
                {form.formState.errors.confirmPassword && (
                  <p className="text-[11px] text-destructive">
                    {form.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>
            </div>

            <Button
              type="submit"
              className="w-full mt-5"
              disabled={completeMutation.isPending}
              data-testid="button-complete-registration"
            >
              {completeMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Registrazione in corso...
                </>
              ) : (
                "Completa registrazione"
              )}
            </Button>

            <Button
              type="button"
              variant="link"
              className="w-full mt-3"
              onClick={() => navigate("/login")}
              data-testid="button-goto-login"
            >
              Hai già un account? Accedi
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
