import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef, useMemo } from "react";

// Tipi per i ruoli utente
export type UserRole = "SUPER_ADMIN" | "COMPANY_ADMIN" | "SALES_AGENT" | "TECHNICIAN";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  profileImageUrl?: string | null;
  role: UserRole;
  createdAt?: string;
  updatedAt?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<any>;
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  setAuth: (token: string, user: User) => void;
  updateUser: (updates: Partial<User>) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "platform_one_token";

let tokenRef: string | null = localStorage.getItem(TOKEN_KEY);

export function getAuthToken(): string | null {
  return tokenRef;
}

function setStoredToken(newToken: string | null) {
  tokenRef = newToken;
  if (newToken) {
    localStorage.setItem(TOKEN_KEY, newToken);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async (authToken: string) => {
    try {
      const response = await fetch("/api/me", {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        setStoredToken(null);
        setToken(null);
        setUser(null);
      }
    } catch (error) {
      console.error("Error fetching user:", error);
      setStoredToken(null);
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      tokenRef = storedToken;
      fetchUser(storedToken);
    } else {
      setIsLoading(false);
    }
  }, [fetchUser]);

  async function login(email: string, password: string) {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || "Errore nel login");
    }
    
    setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  async function register(email: string, password: string, firstName: string, lastName: string) {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, firstName, lastName }),
    });
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || "Errore nella registrazione");
    }
    
    setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
  }

  function logout() {
    setStoredToken(null);
    setToken(null);
    setUser(null);
  }

  function setAuth(newToken: string, newUser: User) {
    setStoredToken(newToken);
    setToken(newToken);
    setUser(newUser);
  }

  function updateUser(updates: Partial<User>) {
    setUser(prev => prev ? { ...prev, ...updates } : prev);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        setAuth,
        updateUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Hook per verificare i permessi basati sul ruolo
export function usePermission() {
  const { user } = useAuth();
  
  const role = user?.role || null;
  
  const permissions = useMemo(() => {
    if (!role) {
      return {
        isSuperAdmin: false,
        isCompanyAdmin: false,
        isSalesAgent: false,
        isTechnician: false,
        isAdmin: false,
        canAccessLeads: false,
        canAccessSettings: false,
        canManageUsers: false,
        canViewAllCompanies: false,
      };
    }
    
    const isSuperAdmin = role === "SUPER_ADMIN";
    const isCompanyAdmin = role === "COMPANY_ADMIN";
    const isSalesAgent = role === "SALES_AGENT";
    const isTechnician = role === "TECHNICIAN";
    
    return {
      // Ruoli base
      isSuperAdmin,
      isCompanyAdmin,
      isSalesAgent,
      isTechnician,
      
      // Permessi aggregati
      isAdmin: isSuperAdmin || isCompanyAdmin,
      canAccessLeads: isSuperAdmin || isCompanyAdmin || isSalesAgent,
      canAccessSettings: isSuperAdmin || isCompanyAdmin,
      canManageUsers: isSuperAdmin || isCompanyAdmin,
      canViewAllCompanies: isSuperAdmin,
    };
  }, [role]);
  
  // Funzione per verificare se l'utente ha uno specifico ruolo
  function hasRole(...allowedRoles: UserRole[]): boolean {
    return role ? allowedRoles.includes(role) : false;
  }
  
  return {
    role,
    ...permissions,
    hasRole,
  };
}
