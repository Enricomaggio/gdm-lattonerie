import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { APP_CONFIG } from "@/lib/config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const { register, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

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
        description: "Account creato con successo. Ora puoi accedere.",
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className={`w-full max-w-md transition-opacity duration-700 ${fadeIn ? "opacity-100" : "opacity-0"}`}>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src="/logo-ponteggi.png" alt={APP_CONFIG.appName} className="h-12 object-contain" />
          </div>
          <CardTitle data-testid="text-register-title">Crea account</CardTitle>
          <CardDescription>
            Crea un nuovo account per accedere a <span className="font-medium">{APP_CONFIG.appName}</span>.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="reg-firstName">
                  Nome
                </label>
                <Input
                  id="reg-firstName"
                  type="text"
                  placeholder="Mario"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={isLoading || authLoading}
                  autoComplete="given-name"
                  data-testid="input-firstName"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="reg-lastName">
                  Cognome
                </label>
                <Input
                  id="reg-lastName"
                  type="text"
                  placeholder="Rossi"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={isLoading || authLoading}
                  autoComplete="family-name"
                  data-testid="input-lastName"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="reg-email">
                Email
              </label>
              <Input
                id="reg-email"
                type="email"
                placeholder="nome@azienda.it"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading || authLoading}
                autoComplete="email"
                inputMode="email"
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="reg-password">
                Password
              </label>
              <Input
                id="reg-password"
                type="password"
                placeholder="Minimo 6 caratteri"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading || authLoading}
                autoComplete="new-password"
                data-testid="input-password"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="reg-confirmPassword">
                Conferma password
              </label>
              <Input
                id="reg-confirmPassword"
                type="password"
                placeholder="Ripeti la password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading || authLoading}
                autoComplete="new-password"
                data-testid="input-confirmPassword"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || authLoading}
              data-testid="button-register"
            >
              {isLoading || authLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creazione account...
                </>
              ) : (
                "Crea account"
              )}
            </Button>

            <Button
              type="button"
              variant="link"
              className="w-full"
              onClick={() => setLocation("/login")}
              data-testid="link-login"
            >
              Hai già un account? Accedi
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
