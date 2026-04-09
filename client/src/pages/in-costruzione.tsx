import { useLocation } from "wouter";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Construction } from "lucide-react";

export default function InCostruzionePage() {
  const [, navigate] = useLocation();

  return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 p-8">
        <Construction className="w-20 h-20 text-muted-foreground" />
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground" data-testid="text-in-costruzione-title">
            In Costruzione
          </h1>
          <p className="text-muted-foreground max-w-md" data-testid="text-in-costruzione-desc">
            Questa funzionalità è attualmente in sviluppo. Tornerà disponibile a breve.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate("/opportunita")}
          data-testid="button-back-to-opportunita"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Torna alle Opportunità
        </Button>
      </div>
    </DashboardLayout>
  );
}
