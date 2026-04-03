import { createContext, useContext, useState, useCallback, ReactNode } from "react";

const COMPANY_KEY = "selected_company_id";

interface CompanyContextType {
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
}

const CompanyContext = createContext<CompanyContextType | null>(null);

export function getSelectedCompanyId(): string | null {
  return localStorage.getItem(COMPANY_KEY);
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [selectedCompanyId, setSelectedCompanyIdState] = useState<string | null>(
    () => localStorage.getItem(COMPANY_KEY)
  );

  const setSelectedCompanyId = useCallback((id: string | null) => {
    setSelectedCompanyIdState(id);
    if (id) {
      localStorage.setItem(COMPANY_KEY, id);
    } else {
      localStorage.removeItem(COMPANY_KEY);
    }
  }, []);

  return (
    <CompanyContext.Provider value={{ selectedCompanyId, setSelectedCompanyId }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompanyContext() {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error("useCompanyContext must be used within a CompanyProvider");
  }
  return context;
}
