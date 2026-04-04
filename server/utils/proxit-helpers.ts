import { db } from "../db";
import { eq, and, gte, inArray } from "drizzle-orm";
import { proxitPresence, userCompanies, users } from "@shared/schema";
import { resolveUserCompany } from "./accessContext";
import type { Request, Response, NextFunction } from "express";

export const HEARTBEAT_TIMEOUT_MS = 30 * 1000; // 30 secondi

// Helper: restituisce l'utente che ha il lock (priorità più bassa tra i presenti attivi)
export async function getProxitLockHolder(companyId: string): Promise<{ userId: string; firstName: string; lastName: string } | null> {
  const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);
  // Prendi le presenze attive
  const activePresences = await db
    .select({ userId: proxitPresence.userId })
    .from(proxitPresence)
    .where(and(
      eq(proxitPresence.companyId, companyId),
      gte(proxitPresence.lastHeartbeat, cutoff)
    ));
  if (activePresences.length === 0) return null;
  const activeUserIds = activePresences.map((p) => p.userId);
  // Trova chi tra i presenti ha la priorità più bassa (numero più basso = priorità più alta)
  const userRows = await db
    .select({
      userId: userCompanies.userId,
      proxitPriority: userCompanies.proxitPriority,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(userCompanies)
    .innerJoin(users, eq(users.id, userCompanies.userId))
    .where(and(
      eq(userCompanies.companyId, companyId),
      inArray(userCompanies.userId, activeUserIds)
    ));
  // Filtra solo chi ha proxitPriority non null
  const withPriority = userRows.filter((r) => r.proxitPriority !== null && r.proxitPriority !== undefined);
  if (withPriority.length === 0) return null;
  // Ordina per priorità ascending (numero più basso = priorità più alta)
  withPriority.sort((a, b) => (a.proxitPriority! - b.proxitPriority!));
  const winner = withPriority[0];
  return { userId: winner.userId, firstName: winner.firstName, lastName: winner.lastName };
}

// Middleware: verifica che l'utente abbia il lock Proxit per le operazioni di scrittura
export async function requireProxitLock(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    if (!userId || !role) return res.status(401).json({ message: "Accesso non autorizzato" });
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    const lockHolder = await getProxitLockHolder(userCompany.companyId);
    if (!lockHolder || lockHolder.userId !== userId) {
      return res.status(403).json({ message: "Non hai il controllo di Proxit. Solo chi ha il lock può modificare." });
    }
    next();
  } catch (error) {
    console.error("Error checking proxit lock:", error);
    res.status(500).json({ message: "Errore nella verifica del lock" });
  }
}
