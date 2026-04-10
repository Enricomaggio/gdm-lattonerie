import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import gdmLogoPath from "@assets/GDM-lattonerie-logo_1775834741168.png";

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
    <div className="min-h-screen flex items-center justify-center p-4 bg-[hsl(0_0%_10%)]">
      <Card className="w-full max-w-md border-0 bg-[hsl(0_0%_16%)]">
        <CardHeader className="text-center pb-4 pt-8">
          <div className="flex justify-center mb-6">
            <img
              src={gdmLogoPath}
              alt="GDM Lattonerie"
              className="h-28 w-28 object-contain"
              data-testid="img-gdm-logo"
            />
          </div>
          <CardDescription className="text-sm text-[hsl(0_0%_65%)] tracking-wider">
            Inserisci le tue credenziali per accedere alla piattaforma.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                className="text-sm font-medium tracking-wide text-[hsl(0_0%_80%)]"
                htmlFor="login-email"
              >
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
                className="border-0 bg-[hsl(0_0%_22%)] text-[hsl(0_0%_92%)] placeholder:text-white/30 focus-visible:ring-[hsl(0_0%_45%)]"
              />
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium tracking-wide text-[hsl(0_0%_80%)]"
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
                disabled={isLoading || authLoading}
                autoComplete="current-password"
                data-testid="input-password"
                className="border-0 bg-[hsl(0_0%_22%)] text-[hsl(0_0%_92%)] placeholder:text-white/30 focus-visible:ring-[hsl(0_0%_45%)]"
              />
            </div>

            <div className="flex items-center justify-end">
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-sm text-[hsl(0_0%_55%)] hover:text-[hsl(0_0%_75%)]"
                onClick={() => setLocation("/reset-password")}
                data-testid="link-reset-password"
              >
                Password dimenticata?
              </Button>
            </div>

            <Button
              type="submit"
              className="w-full tracking-widest font-semibold bg-[hsl(0_0%_88%)] text-[hsl(0_0%_10%)] hover:bg-[hsl(0_0%_96%)]"
              disabled={isLoading || authLoading}
              data-testid="button-login"
            >
              {isLoading || authLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Accesso in corso...
                </>
              ) : (
                "ACCEDI"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
