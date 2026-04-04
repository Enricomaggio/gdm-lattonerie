import { Router } from "express";
import { storage } from "../storage";
import {
  isAuthenticated,
  getUserByEmail,
  getUserById,
  verifyPassword,
  generateToken,
  sanitizeUser,
  isAccountLocked,
  recordFailedLogin,
  resetFailedLoginAttempts,
  hashPassword,
} from "../auth";
import {
  loginUserSchema,
  passwordResetTokens,
  users,
} from "@shared/schema";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { db } from "../db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export const authRouter = Router();

// POST /api/register — registrazione pubblica disabilitata, solo inviti
authRouter.post("/register", async (_req, res) => {
  return res.status(403).json({ message: "La registrazione pubblica è disabilitata. L'accesso è possibile solo tramite invito." });
});

// POST /api/login
authRouter.post("/login", async (req, res) => {
  try {
    const validatedData = loginUserSchema.parse(req.body);

    const user = await getUserByEmail(validatedData.email);
    if (!user) {
      return res.status(401).json({ message: "Credenziali non valide" });
    }

    // Blocca login per utenti sospesi
    if (user.status === "SUSPENDED") {
      return res.status(403).json({ message: "Account sospeso. Contatta l'amministratore." });
    }

    // Verifica blocco per tentativi falliti
    const lockStatus = isAccountLocked(user);
    if (lockStatus.locked) {
      return res.status(429).json({
        message: `Account temporaneamente bloccato per troppi tentativi falliti. Riprova tra ${lockStatus.minutesRemaining} minut${lockStatus.minutesRemaining === 1 ? "o" : "i"}.`,
      });
    }

    const isValid = await verifyPassword(validatedData.password, user.password);
    if (!isValid) {
      const result = await recordFailedLogin(user.id, user.failedLoginAttempts);
      if (result.locked) {
        return res.status(429).json({
          message: "Account temporaneamente bloccato per troppi tentativi falliti. Riprova tra 15 minuti.",
        });
      }
      return res.status(401).json({
        message: `Credenziali non valide. ${result.attemptsRemaining} tentativ${result.attemptsRemaining === 1 ? "o" : "i"} rimanent${result.attemptsRemaining === 1 ? "e" : "i"}.`,
      });
    }

    // Login riuscito: reset contatore tentativi
    if (user.failedLoginAttempts > 0) {
      await resetFailedLoginAttempts(user.id);
    }

    const token = generateToken({ userId: user.id, email: user.email });

    res.json({ user: sanitizeUser(user), token });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    console.error("Error logging in:", error);
    res.status(500).json({ message: "Errore nel login" });
  }
});

// GET /api/me — utente corrente
authRouter.get("/me", isAuthenticated, async (req: any, res) => {
  try {
    const user = await getUserById(req.user!.id);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    res.json(sanitizeUser(user));
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Errore nel recupero dell'utente" });
  }
});

// ============ INVITE FLOW ============

// GET /api/auth/verify-invite/:token — verifica token invito (public)
authRouter.get("/auth/verify-invite/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const invite = await storage.getInviteByToken(token);

    if (!invite) {
      return res.status(404).json({ message: "Invito non trovato o non valido" });
    }

    if (new Date() > new Date(invite.expiresAt)) {
      return res.status(410).json({ message: "Invito scaduto" });
    }

    const company = await storage.getCompany(invite.companyId);

    res.json({
      email: invite.email,
      role: invite.role,
      companyName: company?.name || "Azienda",
    });
  } catch (error) {
    console.error("Error verifying invite:", error);
    res.status(500).json({ message: "Errore nella verifica dell'invito" });
  }
});

// POST /api/auth/complete-registration — completa registrazione da invito (public)
authRouter.post("/auth/complete-registration", async (req, res) => {
  try {
    const completeSchema = z.object({
      token: z.string().min(1, "Token richiesto"),
      firstName: z.string().min(1, "Nome richiesto"),
      lastName: z.string().min(1, "Cognome richiesto"),
      password: z
        .string()
        .min(8, "La password deve avere almeno 8 caratteri")
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "La password deve contenere almeno una maiuscola, una minuscola e un numero"),
    });

    const validatedData = completeSchema.parse(req.body);
    const invite = await storage.getInviteByToken(validatedData.token);

    if (!invite) {
      return res.status(404).json({ message: "Invito non trovato o non valido" });
    }

    if (new Date() > new Date(invite.expiresAt)) {
      return res.status(410).json({ message: "Invito scaduto" });
    }

    const existingUser = await storage.getUserByEmail(invite.email);
    if (existingUser) {
      await storage.deleteInvite(invite.id);
      return res.status(400).json({ message: "Esiste già un utente con questa email" });
    }

    const user = await storage.createUserWithCompany(
      {
        email: invite.email,
        password: validatedData.password,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        role: invite.role,
      },
      invite.companyId
    );

    await storage.deleteInvite(invite.id);

    const jwtToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.SESSION_SECRET!,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      token: jwtToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    console.error("Error completing registration:", error);
    res.status(500).json({ message: "Errore nel completamento della registrazione" });
  }
});

// ============ PASSWORD RESET FLOW ============

// GET /api/auth/verify-reset/:token — verifica token reset (public)
authRouter.get("/auth/verify-reset/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));

    if (!resetToken) {
      return res.status(404).json({ message: "Link di reset non valido" });
    }
    if (resetToken.usedAt) {
      return res.status(400).json({ message: "Questo link è già stato utilizzato" });
    }
    if (new Date() > new Date(resetToken.expiresAt)) {
      return res.status(400).json({ message: "Link di reset scaduto. Chiedi all'amministratore di generarne uno nuovo." });
    }

    const user = await getUserById(resetToken.userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    res.json({ email: user.email });
  } catch (error) {
    console.error("Error verifying reset token:", error);
    res.status(500).json({ message: "Errore nella verifica del token" });
  }
});

// POST /api/auth/reset-password — completa il reset password (public)
authRouter.post("/auth/reset-password", async (req, res) => {
  try {
    const resetSchema = z.object({
      token: z.string().min(1, "Token richiesto"),
      password: z
        .string()
        .min(8, "La password deve avere almeno 8 caratteri")
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "La password deve contenere almeno una maiuscola, una minuscola e un numero"),
    });

    const validatedData = resetSchema.parse(req.body);

    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, validatedData.token));

    if (!resetToken) return res.status(404).json({ message: "Link di reset non valido" });
    if (resetToken.usedAt) return res.status(400).json({ message: "Questo link è già stato utilizzato" });
    if (new Date() > new Date(resetToken.expiresAt)) return res.status(400).json({ message: "Link di reset scaduto" });

    const hashedPassword = await hashPassword(validatedData.password);
    await db
      .update(users)
      .set({ password: hashedPassword, failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(users.id, resetToken.userId));
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, resetToken.id));

    res.json({ message: "Password aggiornata con successo" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    console.error("Error resetting password:", error);
    res.status(500).json({ message: "Errore nel reset della password" });
  }
});
