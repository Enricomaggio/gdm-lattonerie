import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, XCircle, KeyRound } from "lucide-react";

const resetFormSchema = z.object({
  password: z.string().min(8, "La password deve avere almeno 8 caratteri").regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "La password deve contenere almeno una maiuscola, una minuscola e un numero"),
  confirmPassword: z.string().min(1, "Conferma la password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Le password non corrispondono",
  path: ["confirmPassword"],
});

type ResetFormValues = z.infer<typeof resetFormSchema>;

type ResetInfo = {
  email: string;
};

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");
    setToken(tokenParam);
  }, []);

  const form = useForm<ResetFormValues>({
    resolver: zodResolver(resetFormSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const { data: resetInfo, isLoading: isVerifying, error: verifyError } = useQuery<ResetInfo>({
    queryKey: ["/api/auth/verify-reset", token],
    queryFn: async () => {
      if (!token) throw new Error("Token mancante");
      const response = await fetch(`/api/auth/verify-reset/${token}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Link non valido");
      }
      return response.json();
    },
    enabled: !!token,
    retry: false,
  });

  const resetMutation = useMutation({
    mutationFn: async (data: ResetFormValues) => {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: data.password }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Errore nel reset della password");
      }
      return response.json();
    },
    onSuccess: () => {
      setIsComplete(true);
      toast({
        title: "Password aggiornata",
        description: "La tua password è stata cambiata con successo. Ora puoi accedere.",
      });
      setTimeout(() => navigate("/login"), 3000);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Errore",
        description: error.message,
      });
    },
  });

  const onSubmit = (data: ResetFormValues) => {
    resetMutation.mutate(data);
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 pt-6">
            <XCircle className="w-12 h-12 text-destructive" />
            <p className="text-center text-muted-foreground">
              Link di reset non valido. Contatta il tuo amministratore per ottenere un nuovo link.
            </p>
            <Button variant="outline" onClick={() => navigate("/login")} data-testid="button-back-login">
              Torna al Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (verifyError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 pt-6">
            <XCircle className="w-12 h-12 text-destructive" />
            <p className="text-center text-muted-foreground">
              {(verifyError as Error).message}
            </p>
            <Button variant="outline" onClick={() => navigate("/login")} data-testid="button-back-login-error">
              Torna al Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 pt-6">
            <CheckCircle className="w-12 h-12 text-green-500" />
            <p className="text-center font-medium">Password aggiornata con successo!</p>
            <p className="text-center text-muted-foreground text-sm">
              Verrai reindirizzato alla pagina di login...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src="/logo-ponteggi.png" alt="Da.Do Ponteggi" className="h-12 object-contain" />
          </div>
          <CardTitle className="flex items-center justify-center gap-2">
            <KeyRound className="w-5 h-5" />
            Reimposta Password
          </CardTitle>
          <CardDescription>
            Imposta una nuova password per <span className="font-medium">{resetInfo?.email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nuova Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Almeno 8 caratteri, 1 maiuscola, 1 minuscola, 1 numero"
                        data-testid="input-new-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Conferma Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Ripeti la password"
                        data-testid="input-confirm-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={resetMutation.isPending}
                data-testid="button-reset-password"
              >
                {resetMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Aggiornamento...
                  </>
                ) : (
                  "Imposta Nuova Password"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
