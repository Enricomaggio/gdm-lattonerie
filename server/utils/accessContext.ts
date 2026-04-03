import { storage, type AccessContext } from "../storage";
import type { UserRole } from "@shared/schema";
import type { Request } from "express";

export async function resolveUserCompany(uid: string, userRole: UserRole, request: Request): Promise<{ companyId: string } | undefined> {
  if (userRole === "SUPER_ADMIN") {
    const overrideCompanyId = request.headers["x-company-id"] as string | undefined;
    if (overrideCompanyId) {
      return { companyId: overrideCompanyId };
    }
  }
  return storage.getUserCompany(uid);
}

// Helper per costruire il contesto di accesso (NON crea company automaticamente)
export async function buildAccessContext(userId: string, role: UserRole, req?: Request): Promise<AccessContext | null> {
  const userCompany = req ? await resolveUserCompany(userId, role, req) : await storage.getUserCompany(userId);
  if (!userCompany) {
    return null;
  }

  return { userId, role, companyId: userCompany.companyId };
}

// Helper per verificare che un utente appartenga alla stessa azienda
export async function validateUserInSameCompany(targetUserId: string, companyId: string): Promise<boolean> {
  const userCompany = await storage.getUserCompany(targetUserId);
  return userCompany?.companyId === companyId;
}
