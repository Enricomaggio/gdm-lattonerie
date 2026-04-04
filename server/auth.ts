import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "./db";
import { users, registerUserSchema, User, UserRole, userRoleEnum } from "@shared/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

// Tipi per request autenticata con ruolo
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

// Estensione dell'oggetto Request per includere l'utente autenticato
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

function getJwtSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("CRITICAL: SESSION_SECRET non configurato nel file .env. Il server non può partire in modalità insicura.");
  }
  return secret;
}

const JWT_EXPIRATION = "7d";

export interface JWTPayload {
  userId: string;
  email: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRATION });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JWTPayload;
  } catch {
    return null;
  }
}

export async function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Accesso non autorizzato" });
  }
  
  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  
  if (!payload) {
    return res.status(401).json({ message: "Token non valido o scaduto" });
  }
  
  // Recupera il ruolo dall'utente nel database
  const user = await getUserById(payload.userId);
  if (!user) {
    return res.status(401).json({ message: "Utente non trovato" });
  }
  
  req.user = {
    id: payload.userId,
    email: payload.email,
    role: user.role as UserRole,
  };
  
  next();
}

// Middleware per verificare ruoli specifici
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Accesso non autorizzato" });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Accesso negato: permessi insufficienti" });
    }
    
    next();
  };
}

// Utility per verificare se l'utente ha un ruolo specifico
export function hasRole(userRole: UserRole, ...allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(userRole);
}

// Utility per verificare se l'utente è un admin (SUPER_ADMIN o COMPANY_ADMIN)
export function isAdmin(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "COMPANY_ADMIN";
}

// Utility per verificare se l'utente può accedere ai lead
export function canAccessLeads(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "COMPANY_ADMIN" || role === "SALES_AGENT";
}

export async function getUserById(userId: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return user || null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  return user || null;
}

export async function createUser(data: z.infer<typeof registerUserSchema>, role?: UserRole): Promise<User> {
  const hashedPassword = await hashPassword(data.password);
  
  const [user] = await db.insert(users).values({
    email: data.email.toLowerCase(),
    password: hashedPassword,
    firstName: data.firstName,
    lastName: data.lastName,
    role: role || "COMPANY_ADMIN", // Default COMPANY_ADMIN per nuovi utenti registrati
  }).returning();
  
  return user;
}

export function sanitizeUser(user: User): Omit<User, "password" | "profileImageData"> {
  const { password, profileImageData, ...sanitized } = user;
  return sanitized;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minuti

export function isAccountLocked(user: User): { locked: boolean; minutesRemaining: number } {
  if (!user.lockedUntil) return { locked: false, minutesRemaining: 0 };
  const now = new Date();
  const lockedUntil = new Date(user.lockedUntil);
  if (now < lockedUntil) {
    const minutesRemaining = Math.ceil((lockedUntil.getTime() - now.getTime()) / 60000);
    return { locked: true, minutesRemaining };
  }
  return { locked: false, minutesRemaining: 0 };
}

export async function recordFailedLogin(userId: string, currentAttempts: number): Promise<{ locked: boolean; attemptsRemaining: number }> {
  const newAttempts = currentAttempts + 1;
  if (newAttempts >= MAX_FAILED_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
    await db.update(users).set({ failedLoginAttempts: newAttempts, lockedUntil }).where(eq(users.id, userId));
    return { locked: true, attemptsRemaining: 0 };
  }
  await db.update(users).set({ failedLoginAttempts: newAttempts }).where(eq(users.id, userId));
  return { locked: false, attemptsRemaining: MAX_FAILED_ATTEMPTS - newAttempts };
}

export async function resetFailedLoginAttempts(userId: string): Promise<void> {
  await db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, userId));
}
