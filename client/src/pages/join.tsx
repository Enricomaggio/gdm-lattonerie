import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth, type UserRole } from "@/lib/auth";
import { Loader2, Check, X, Building2, Mail, Shield } from "lucide-react";

const MATRIX_CHARS = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFMORPHEUS";

function MatrixRain({ canvasRef }: { canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const fontSize = 14;
    const columns = Math.floor(canvas.width / fontSize);
    const drops: number[] = new Array(columns).fill(1).map(() => Math.random() * -100);

    const draw = () => {
      ctx.fillStyle = "rgba(5, 11, 65, 0.05)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < drops.length; i++) {
        const char = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        const brightness = Math.random();
        if (brightness > 0.7) {
          ctx.fillStyle = "rgba(97, 206, 133, 0.9)";
          ctx.shadowColor = "#61CE85";
          ctx.shadowBlur = 8;
        } else if (brightness > 0.3) {
          ctx.fillStyle = "rgba(69, 99, 255, 0.6)";
          ctx.shadowColor = "#4563FF";
          ctx.shadowBlur = 4;
        } else {
          ctx.fillStyle = "rgba(69, 99, 255, 0.25)";
          ctx.shadowBlur = 0;
        }

        ctx.font = `${fontSize}px monospace`;
        ctx.fillText(char, x, y);
        ctx.shadowBlur = 0;

        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    };

    const interval = setInterval(draw, 50);

    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [canvasRef]);

  return null;
}

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
      setSuccessName(data.user.firstName || "Neo");
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
    <div className="relative min-h-screen overflow-hidden" style={{ backgroundColor: "#050B41" }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }} />
      <MatrixRain canvasRef={canvasRef} />
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
        <div className={`flex flex-col items-center text-center max-w-sm transition-opacity duration-1000 ${fadeIn ? "opacity-100" : "opacity-0"}`}>
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
            style={{ border: "2px solid rgba(255, 68, 68, 0.5)", boxShadow: "0 0 20px rgba(255, 68, 68, 0.2)" }}
          >
            <X className="w-8 h-8" style={{ color: "#ff4444" }} />
          </div>
          <h2
            className="text-2xl font-bold tracking-wider mb-3"
            style={{ color: "#ff4444", fontFamily: "'Courier New', monospace", textShadow: "0 0 15px rgba(255, 68, 68, 0.4)" }}
            data-testid="text-error-title"
          >
            {title}
          </h2>
          <p className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.5)", fontFamily: "'Courier New', monospace" }}>
            {description}
          </p>
          <button
            onClick={() => navigate("/login")}
            className="px-8 py-3 rounded-md font-mono text-sm font-bold uppercase tracking-wider transition-opacity duration-300 hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, #4563FF 0%, #2840cc 100%)",
              color: "#ffffff",
              boxShadow: "0 0 20px rgba(69, 99, 255, 0.3)",
            }}
            data-testid="button-goto-login"
          >
            Vai al Login
          </button>
        </div>
      </div>
    </div>
  );

  if (!token) {
    return renderErrorState("missing", "Link non valido", "Il link di invito non contiene un token valido. Contatta l'amministratore.");
  }

  if (isVerifying) {
    return (
      <div className="relative min-h-screen overflow-hidden" style={{ backgroundColor: "#050B41" }}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }} />
        <MatrixRain canvasRef={canvasRef} />
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
          <Loader2 className="w-12 h-12 animate-spin mb-4" style={{ color: "#61CE85" }} />
          <p className="font-mono text-sm" style={{ color: "rgba(255,255,255,0.5)" }} data-testid="text-verifying">
            Verifica invito in corso...
          </p>
        </div>
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
      <div className="relative min-h-screen overflow-hidden" style={{ backgroundColor: "#050B41" }}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }} />
        <MatrixRain canvasRef={canvasRef} />
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
          <h2
            className="text-3xl sm:text-4xl font-bold mb-4"
            style={{
              color: "#61CE85",
              fontFamily: "'Courier New', monospace",
              textShadow: "0 0 30px rgba(97, 206, 133, 0.6)",
              animation: "fadeInUp 0.8s ease-out",
            }}
            data-testid="text-welcome"
          >
            Benvenuto nel mondo reale, {successName}.
          </h2>
          <p
            className="text-lg"
            style={{ color: "rgba(255,255,255,0.5)", fontFamily: "'Courier New', monospace" }}
          >
            Caricamento sistema...
          </p>
          <div className="mt-6">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#61CE85" }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ backgroundColor: "#050B41" }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }} />
      <MatrixRain canvasRef={canvasRef} />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
        <div className={`w-full max-w-md transition-all duration-1000 ${fadeIn ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <div className="text-center mb-6">
            <h1
              className="text-4xl sm:text-5xl font-bold tracking-widest mb-1"
              style={{
                color: "#61CE85",
                fontFamily: "'Courier New', monospace",
                textShadow: "0 0 20px rgba(97, 206, 133, 0.5), 0 0 40px rgba(97, 206, 133, 0.3)",
              }}
              data-testid="text-morpheus-title"
            >
              MORPHEUS
            </h1>
            <p className="text-xs tracking-[0.5em] uppercase" style={{ color: "#4563FF" }}>
              Completa la registrazione
            </p>
          </div>

          <div
            className="rounded-md p-5 mb-5"
            style={{
              backgroundColor: "rgba(69, 99, 255, 0.08)",
              border: "1px solid rgba(69, 99, 255, 0.25)",
            }}
          >
            <p className="text-center text-sm font-mono mb-3" style={{ color: "rgba(255,255,255,0.6)" }}>
              Sei stato invitato a unirti al team
            </p>
            <div className="flex items-center justify-center gap-2 mb-2">
              <Building2 className="w-5 h-5" style={{ color: "#61CE85" }} />
              <span
                className="text-lg font-bold font-mono"
                style={{ color: "#ffffff", textShadow: "0 0 10px rgba(97, 206, 133, 0.3)" }}
                data-testid="text-company-name"
              >
                {inviteInfo.companyName}
              </span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Mail className="w-3.5 h-3.5" style={{ color: "#4563FF" }} />
              <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.5)" }} data-testid="text-invite-email">
                {inviteInfo.email}
              </span>
            </div>
            {inviteInfo.role && (
              <div className="flex items-center justify-center gap-2 mt-2">
                <Shield className="w-3.5 h-3.5" style={{ color: "#4563FF" }} />
                <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.4)" }} data-testid="text-invite-role">
                  Ruolo: {inviteInfo.role === "COMPANY_ADMIN" ? "Amministratore" : inviteInfo.role === "SALES_AGENT" ? "Agente commerciale" : inviteInfo.role === "TECHNICIAN" ? "Tecnico" : inviteInfo.role}
                </span>
              </div>
            )}
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div
              className="rounded-md p-5 space-y-4"
              style={{
                backgroundColor: "rgba(5, 11, 65, 0.85)",
                border: "1px solid rgba(69, 99, 255, 0.3)",
                boxShadow: "0 0 30px rgba(69, 99, 255, 0.1)",
              }}
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase tracking-wider" style={{ color: "#61CE85" }}>
                    Nome
                  </label>
                  <Input
                    placeholder="Mario"
                    {...form.register("firstName")}
                    className="border-0 rounded-md font-mono text-sm placeholder:opacity-30"
                    style={{
                      backgroundColor: "rgba(0, 0, 0, 0.4)",
                      color: "#ffffff",
                      borderBottom: "1px solid rgba(97, 206, 133, 0.3)",
                    }}
                    data-testid="input-firstname"
                  />
                  {form.formState.errors.firstName && (
                    <p className="text-[11px] font-mono" style={{ color: "#ff4444" }}>
                      {form.formState.errors.firstName.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase tracking-wider" style={{ color: "#61CE85" }}>
                    Cognome
                  </label>
                  <Input
                    placeholder="Rossi"
                    {...form.register("lastName")}
                    className="border-0 rounded-md font-mono text-sm placeholder:opacity-30"
                    style={{
                      backgroundColor: "rgba(0, 0, 0, 0.4)",
                      color: "#ffffff",
                      borderBottom: "1px solid rgba(97, 206, 133, 0.3)",
                    }}
                    data-testid="input-lastname"
                  />
                  {form.formState.errors.lastName && (
                    <p className="text-[11px] font-mono" style={{ color: "#ff4444" }}>
                      {form.formState.errors.lastName.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-mono uppercase tracking-wider" style={{ color: "#61CE85" }}>
                  Crea Password
                </label>
                <Input
                  type="password"
                  placeholder="Crea una password sicura"
                  {...form.register("password")}
                  className="border-0 rounded-md font-mono text-sm placeholder:opacity-30"
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.4)",
                    color: "#ffffff",
                    borderBottom: "1px solid rgba(97, 206, 133, 0.3)",
                  }}
                  data-testid="input-password"
                />
                <PasswordRequirements password={watchPassword || ""} />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-mono uppercase tracking-wider" style={{ color: "#61CE85" }}>
                  Conferma Password
                </label>
                <Input
                  type="password"
                  placeholder="Ripeti la password"
                  {...form.register("confirmPassword")}
                  className="border-0 rounded-md font-mono text-sm placeholder:opacity-30"
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.4)",
                    color: "#ffffff",
                    borderBottom: "1px solid rgba(97, 206, 133, 0.3)",
                  }}
                  data-testid="input-confirm-password"
                />
                {form.formState.errors.confirmPassword && (
                  <p className="text-[11px] font-mono" style={{ color: "#ff4444" }}>
                    {form.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={completeMutation.isPending}
              className="w-full mt-5 py-3 rounded-md font-mono text-sm font-bold uppercase tracking-wider transition-opacity duration-300 hover:opacity-90 disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #61CE85 0%, #3da85e 100%)",
                color: "#ffffff",
                boxShadow: "0 0 20px rgba(97, 206, 133, 0.3)",
              }}
              data-testid="button-complete-registration"
            >
              {completeMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Registrazione in corso...
                </span>
              ) : (
                "Completa Registrazione"
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate("/login")}
              className="w-full mt-3 text-center text-xs font-mono transition-colors duration-200"
              style={{ color: "rgba(255,255,255,0.3)" }}
              data-testid="button-goto-login"
            >
              Hai già un account? Accedi
            </button>
          </form>
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
