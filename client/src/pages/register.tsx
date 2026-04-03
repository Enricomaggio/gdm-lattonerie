import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const { register, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFadeIn(true), 100);
    return () => clearTimeout(timer);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!firstName || !lastName || !email || !password) {
      toast({
        title: "Errore",
        description: "Compila tutti i campi obbligatori",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Errore",
        description: "Le password non coincidono",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Errore",
        description: "La password deve avere almeno 6 caratteri",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await register(email, password, firstName, lastName);
      toast({
        title: "Registrazione completata",
        description: "Benvenuto in Morpheus!",
      });
      setLocation("/dashboard");
    } catch (error: any) {
      toast({
        title: "Errore di registrazione",
        description: error.message || "Si è verificato un errore",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ backgroundColor: "#050B41" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ zIndex: 0 }}
      />
      <MatrixRain canvasRef={canvasRef} />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
        <div
          className={`w-full max-w-sm transition-all duration-700 ${
            fadeIn ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="text-center mb-8">
            <h2
              className="text-3xl font-bold tracking-widest mb-1"
              style={{
                color: "#61CE85",
                fontFamily: "'Courier New', monospace",
                textShadow: "0 0 15px rgba(97, 206, 133, 0.4)",
              }}
              data-testid="text-register-title"
            >
              MORPHEUS
            </h2>
            <p
              className="text-xs"
              style={{ color: "rgba(255,255,255,0.4)", fontFamily: "'Courier New', monospace" }}
            >
              Crea il tuo account per entrare nel sistema
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div
              className="rounded-md p-6 space-y-4"
              style={{
                backgroundColor: "rgba(5, 11, 65, 0.85)",
                border: "1px solid rgba(69, 99, 255, 0.3)",
                boxShadow: "0 0 30px rgba(69, 99, 255, 0.1)",
              }}
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label
                    className="text-xs font-mono uppercase tracking-wider"
                    style={{ color: "#61CE85" }}
                    htmlFor="reg-firstName"
                  >
                    Nome
                  </label>
                  <Input
                    id="reg-firstName"
                    type="text"
                    placeholder="Mario"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={isLoading}
                    className="border-0 rounded-md font-mono text-sm placeholder:opacity-30"
                    style={{
                      backgroundColor: "rgba(0, 0, 0, 0.4)",
                      color: "#ffffff",
                      borderBottom: "1px solid rgba(97, 206, 133, 0.3)",
                    }}
                    data-testid="input-firstName"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    className="text-xs font-mono uppercase tracking-wider"
                    style={{ color: "#61CE85" }}
                    htmlFor="reg-lastName"
                  >
                    Cognome
                  </label>
                  <Input
                    id="reg-lastName"
                    type="text"
                    placeholder="Rossi"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={isLoading}
                    className="border-0 rounded-md font-mono text-sm placeholder:opacity-30"
                    style={{
                      backgroundColor: "rgba(0, 0, 0, 0.4)",
                      color: "#ffffff",
                      borderBottom: "1px solid rgba(97, 206, 133, 0.3)",
                    }}
                    data-testid="input-lastName"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label
                  className="text-xs font-mono uppercase tracking-wider"
                  style={{ color: "#61CE85" }}
                  htmlFor="reg-email"
                >
                  Email
                </label>
                <Input
                  id="reg-email"
                  type="email"
                  placeholder="neo@morpheus.it"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="border-0 rounded-md font-mono text-sm placeholder:opacity-30"
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.4)",
                    color: "#ffffff",
                    borderBottom: "1px solid rgba(97, 206, 133, 0.3)",
                  }}
                  data-testid="input-email"
                />
              </div>

              <div className="space-y-2">
                <label
                  className="text-xs font-mono uppercase tracking-wider"
                  style={{ color: "#61CE85" }}
                  htmlFor="reg-password"
                >
                  Password
                </label>
                <Input
                  id="reg-password"
                  type="password"
                  placeholder="Minimo 6 caratteri"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="border-0 rounded-md font-mono text-sm placeholder:opacity-30"
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.4)",
                    color: "#ffffff",
                    borderBottom: "1px solid rgba(97, 206, 133, 0.3)",
                  }}
                  data-testid="input-password"
                />
              </div>

              <div className="space-y-2">
                <label
                  className="text-xs font-mono uppercase tracking-wider"
                  style={{ color: "#61CE85" }}
                  htmlFor="reg-confirmPassword"
                >
                  Conferma Password
                </label>
                <Input
                  id="reg-confirmPassword"
                  type="password"
                  placeholder="Ripeti la password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading}
                  className="border-0 rounded-md font-mono text-sm placeholder:opacity-30"
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.4)",
                    color: "#ffffff",
                    borderBottom: "1px solid rgba(97, 206, 133, 0.3)",
                  }}
                  data-testid="input-confirmPassword"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || authLoading}
              className="w-full py-3 rounded-md font-mono text-sm font-bold uppercase tracking-wider transition-opacity duration-300 hover:opacity-90 disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #61CE85 0%, #3da85e 100%)",
                color: "#050B41",
                boxShadow: "0 0 20px rgba(97, 206, 133, 0.3)",
              }}
              data-testid="button-register"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Registrazione in corso...
                </span>
              ) : (
                "Crea Account"
              )}
            </button>

            <button
              type="button"
              onClick={() => setLocation("/login")}
              className="w-full text-center text-xs font-mono transition-colors duration-200"
              style={{ color: "rgba(255,255,255,0.4)" }}
              data-testid="link-login"
            >
              Hai già un account? <span style={{ color: "#4563FF" }}>Accedi</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
