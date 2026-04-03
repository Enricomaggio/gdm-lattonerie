import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MATRIX_CHARS = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFMORPHEUS";

const MORPHEUS_QUOTES = [
  "Questa è la tua ultima occasione. Dopo non potrai più tornare indietro.",
  "Io ti offro solo la verità. Niente di più.",
  "C'è differenza tra conoscere il sentiero e percorrere il sentiero.",
  "La Matrice è ovunque. È il mondo che ti è stato messo davanti agli occhi.",
  "Devi liberare la mente.",
];

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

type Phase = "intro" | "blue-pill" | "login" | "welcome";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { login, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [phase, setPhase] = useState<Phase>("intro");
  const [quote] = useState(() => MORPHEUS_QUOTES[Math.floor(Math.random() * MORPHEUS_QUOTES.length)]);
  const [typedQuote, setTypedQuote] = useState("");
  const [showPills, setShowPills] = useState(false);
  const [bluePillMsg, setBluePillMsg] = useState("");
  const [fadeIn, setFadeIn] = useState(false);
  const [welcomeName, setWelcomeName] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loginFadeIn, setLoginFadeIn] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFadeIn(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (phase !== "intro") return;
    let i = 0;
    const interval = setInterval(() => {
      if (i < quote.length) {
        setTypedQuote(quote.substring(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
        setTimeout(() => setShowPills(true), 400);
      }
    }, 35);
    return () => clearInterval(interval);
  }, [phase, quote]);

  const handleBluePill = useCallback(() => {
    setShowPills(false);
    const messages = [
      "Hai scelto l'ignoranza...",
      "La Matrice ti riavrà.",
      "Ma tornerai. Tornano tutti.",
    ];
    setBluePillMsg(messages[0]);
    setTimeout(() => setBluePillMsg(messages[1]), 1500);
    setTimeout(() => setBluePillMsg(messages[2]), 3000);
    setPhase("blue-pill");
    setTimeout(() => {
      setPhase("intro");
      setTypedQuote("");
      setShowPills(false);
      setBluePillMsg("");
    }, 5000);
  }, []);

  const handleRedPill = useCallback(() => {
    setShowPills(false);
    setTimeout(() => {
      setPhase("login");
      setTimeout(() => setLoginFadeIn(true), 100);
    }, 300);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast({
        title: "Errore",
        description: "Inserisci email e password",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const userData = await login(email, password);
      setPhase("welcome");
      const firstName = userData?.firstName || "Neo";
      setWelcomeName(firstName);
      setTimeout(() => setLocation("/dashboard"), 2500);
    } catch (error: any) {
      toast({
        title: "Accesso negato",
        description: error.message || "Credenziali non valide. L'Agente Smith ti tiene d'occhio.",
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
        {phase === "intro" && (
          <div className={`flex flex-col items-center max-w-xl text-center transition-opacity duration-1000 ${fadeIn ? "opacity-100" : "opacity-0"}`}>
            <h1
              className="text-5xl sm:text-6xl font-bold tracking-widest mb-2"
              style={{
                color: "#61CE85",
                fontFamily: "'Courier New', monospace",
                textShadow: "0 0 20px rgba(97, 206, 133, 0.5), 0 0 40px rgba(97, 206, 133, 0.3)",
              }}
              data-testid="text-morpheus-title"
            >
              MORPHEUS
            </h1>
            <p className="text-xs tracking-[0.5em] mb-12 uppercase" style={{ color: "#4563FF" }}>
              Business Management System
            </p>

            <div className="min-h-[80px] mb-12">
              <p
                className="text-lg sm:text-xl italic leading-relaxed"
                style={{
                  color: "rgba(255, 255, 255, 0.85)",
                  fontFamily: "'Courier New', monospace",
                }}
                data-testid="text-morpheus-quote"
              >
                "{typedQuote}"
                <span
                  className="inline-block w-2 h-5 ml-1 align-middle"
                  style={{
                    backgroundColor: "#61CE85",
                    animation: "blink 1s step-end infinite",
                  }}
                />
              </p>
            </div>

            <div
              className={`flex flex-col sm:flex-row items-center gap-8 transition-all duration-700 ${
                showPills ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              <button
                onClick={handleBluePill}
                className="group relative flex flex-col items-center gap-3 transition-opacity duration-300 hover:opacity-80"
                data-testid="button-blue-pill"
                disabled={!showPills}
              >
                <div
                  className="w-20 h-10 rounded-full shadow-lg transition-shadow duration-300"
                  style={{
                    background: "linear-gradient(135deg, #4563FF 0%, #2840cc 100%)",
                    boxShadow: "0 0 20px rgba(69, 99, 255, 0.4), inset 0 2px 4px rgba(255,255,255,0.3)",
                  }}
                />
                <span className="text-sm font-medium" style={{ color: "#4563FF" }}>
                  Torna alla tua vita triste
                </span>
              </button>

              <div className="text-2xl font-bold" style={{ color: "rgba(255,255,255,0.3)" }}>o</div>

              <button
                onClick={handleRedPill}
                className="group relative flex flex-col items-center gap-3 transition-opacity duration-300 hover:opacity-80"
                data-testid="button-red-pill"
                disabled={!showPills}
              >
                <div
                  className="w-20 h-10 rounded-full shadow-lg transition-shadow duration-300"
                  style={{
                    background: "linear-gradient(135deg, #ff4444 0%, #cc2020 100%)",
                    boxShadow: "0 0 20px rgba(255, 68, 68, 0.4), inset 0 2px 4px rgba(255,255,255,0.3)",
                  }}
                />
                <span className="text-sm font-medium" style={{ color: "#ff4444" }}>
                  Accedi a Morpheus
                </span>
              </button>
            </div>
          </div>
        )}

        {phase === "blue-pill" && (
          <div className="flex flex-col items-center text-center animate-pulse">
            <p
              className="text-2xl sm:text-3xl font-medium"
              style={{
                color: "#4563FF",
                fontFamily: "'Courier New', monospace",
                textShadow: "0 0 15px rgba(69, 99, 255, 0.5)",
              }}
              data-testid="text-blue-pill-message"
            >
              {bluePillMsg}
            </p>
          </div>
        )}

        {phase === "login" && (
          <div
            className={`w-full max-w-sm transition-all duration-700 ${
              loginFadeIn ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
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
              >
                MORPHEUS
              </h2>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)", fontFamily: "'Courier New', monospace" }}>
                Inserisci le tue credenziali per entrare nel sistema
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
                <div className="space-y-2">
                  <label
                    className="text-xs font-mono uppercase tracking-wider"
                    style={{ color: "#61CE85" }}
                    htmlFor="login-email"
                  >
                    Email
                  </label>
                  <Input
                    id="login-email"
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
                    htmlFor="login-password"
                  >
                    Password
                  </label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
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
              </div>

              <button
                type="submit"
                disabled={isLoading || authLoading}
                className="w-full py-3 rounded-md font-mono text-sm font-bold uppercase tracking-wider transition-opacity duration-300 hover:opacity-90 disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #ff4444 0%, #cc2020 100%)",
                  color: "#ffffff",
                  boxShadow: "0 0 20px rgba(255, 68, 68, 0.3)",
                }}
                data-testid="button-login"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connessione in corso...
                  </span>
                ) : (
                  "Entra nella tana del bianconiglio"
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setLoginFadeIn(false);
                  setTimeout(() => {
                    setPhase("intro");
                    setTypedQuote("");
                    setShowPills(false);
                  }, 300);
                }}
                className="w-full text-center text-xs font-mono transition-colors duration-200"
                style={{ color: "rgba(255,255,255,0.3)" }}
                data-testid="button-back"
              >
                Torna indietro
              </button>
            </form>
          </div>
        )}

        {phase === "welcome" && (
          <div className="flex flex-col items-center text-center">
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
              Benvenuto nel mondo reale, {welcomeName}.
            </h2>
            <p
              className="text-lg"
              style={{
                color: "rgba(255,255,255,0.5)",
                fontFamily: "'Courier New', monospace",
              }}
            >
              Caricamento sistema...
            </p>
            <div className="mt-6">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#61CE85" }} />
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes blink {
          50% { opacity: 0; }
        }
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
