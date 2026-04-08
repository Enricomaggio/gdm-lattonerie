import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_CONFIG } from "@/lib/config";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { login, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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
      await login(email, password);
      setLocation("/dashboard");
    } catch (error: any) {
      toast({
        title: "Accesso negato",
        description: error.message || "Credenziali non valide.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle data-testid="text-login-title">Accedi</CardTitle>
          <CardDescription>
            Inserisci le tue credenziali per accedere a <span className="font-medium">{APP_CONFIG.appName}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="login-email">
                Email
              </label>
              <Input
                id="login-email"
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
              <label className="text-sm font-medium" htmlFor="login-password">
                Password
              </label>
              <Input
                id="login-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading || authLoading}
                autoComplete="current-password"
                data-testid="input-password"
              />
            </div>

            <div className="flex items-center justify-end">
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-sm"
                onClick={() => setLocation("/reset-password")}
                data-testid="link-reset-password"
              >
                Password dimenticata?
              </Button>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || authLoading}
              data-testid="button-login"
            >
              {isLoading || authLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Accesso in corso...
                </>
              ) : (
                "Accedi"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
