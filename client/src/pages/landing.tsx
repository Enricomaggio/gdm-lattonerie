import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Users, 
  BarChart3, 
  Shield, 
  ArrowRight,
  CheckCircle2
} from "lucide-react";

const features = [
  {
    icon: Users,
    title: "Gestione Lead",
    description: "Organizza e traccia tutti i tuoi lead in un unico posto con stati personalizzabili e vista tabella.",
  },
  {
    icon: BarChart3,
    title: "Dashboard Intuitiva",
    description: "Visualizza le metriche chiave e monitora le performance del tuo team commerciale.",
  },
  {
    icon: Shield,
    title: "Sicuro e Affidabile",
    description: "Autenticazione sicura e backup automatici per proteggere i tuoi dati aziendali.",
  },
];

const benefits = [
  "Piattaforma dedicata Da.Do Ponteggi",
  "Setup in meno di 5 minuti",
  "Supporto dedicato incluso",
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src="/logo-ponteggi.png" alt="Da.Do Ponteggi" className="h-10 w-auto" />
            </div>
            <Button asChild data-testid="button-login-header">
              <a href="/login">
                Accedi
                <ArrowRight className="w-4 h-4 ml-2" />
              </a>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 sm:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-3xl mx-auto text-center">
            <img src="/logo-ponteggi.png" alt="Da.Do Ponteggi" className="h-20 mx-auto mb-6" />
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground">
              Il CRM per
              <span className="block text-primary mt-2">Da.Do Ponteggi</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
              La piattaforma dedicata per Da.Do Ponteggi e i suoi affiliati. 
              Gestisci i tuoi lead in modo semplice ed efficace.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" asChild className="w-full sm:w-auto" data-testid="button-cta-hero">
                <a href="/login">
                  Accedi
                  <ArrowRight className="w-4 h-4 ml-2" />
                </a>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4 sm:gap-6">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 sm:py-28 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              Tutto ciò che ti serve per crescere
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              Strumenti potenti e semplici da usare per gestire il tuo processo di vendita.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className="border bg-card hover-elevate transition-all duration-200"
                data-testid={`card-feature-${index}`}
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary mb-4">
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="bg-primary text-primary-foreground border-0 overflow-hidden">
            <CardContent className="p-8 sm:p-12 text-center">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                Pronto a trasformare il tuo processo di vendita?
              </h2>
              <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto">
                Entra nella piattaforma Da.Do Ponteggi e inizia a gestire i tuoi lead.
              </p>
              <Button 
                size="lg" 
                variant="secondary" 
                asChild
                data-testid="button-cta-footer"
              >
                <a href="/login">
                  Accedi
                  <ArrowRight className="w-4 h-4 ml-2" />
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src="/logo-ponteggi.png" alt="Da.Do Ponteggi" className="h-8 w-auto" />
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Da.Do Ponteggi. Tutti i diritti riservati.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
