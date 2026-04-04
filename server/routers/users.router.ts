import { Router } from "express";
import { storage } from "../storage";
import { resolveUserCompany } from "../utils/accessContext";
import {
  isAuthenticated,
  getUserById,
  verifyPassword,
  hashPassword,
  resetFailedLoginAttempts,
} from "../auth";
import { passwordResetTokens, users } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import { db } from "../db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export const usersRouter = Router();

const profileImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Formato immagine non supportato. Usa JPG, PNG, WebP o GIF."));
    }
  },
});

// ============ USERS — Queries per assegnazione e ruoli ============

// GET /api/users/assignable — utenti assegnabili (SALES_AGENT e COMPANY_ADMIN)
usersRouter.get("/users/assignable", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }
    const allUsers = await storage.getUsersByCompanyId(userCompany.companyId);
    const assignableUsers = allUsers
      .filter(u => u.role === "SALES_AGENT" || u.role === "COMPANY_ADMIN")
      .map(({ profileImageData, ...u }) => u);
    res.json(assignableUsers);
  } catch (error) {
    console.error("Error fetching assignable users:", error);
    res.status(500).json({ message: "Errore nel recupero degli utenti" });
  }
});

// GET /api/users/technicians — solo tecnici
usersRouter.get("/users/technicians", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }
    const allUsers = await storage.getUsersByCompanyId(userCompany.companyId);
    const technicians = allUsers
      .filter(u => u.role === "TECHNICIAN")
      .map(({ profileImageData, ...u }) => u);
    res.json(technicians);
  } catch (error) {
    console.error("Error fetching technicians:", error);
    res.status(500).json({ message: "Errore nel recupero dei tecnici" });
  }
});

// GET /api/activities — ultime attività dell'azienda
usersRouter.get("/activities", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (role === "SUPER_ADMIN") {
      return res.status(403).json({ message: "Super Admin non ha accesso alle attività aziendali" });
    }
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }
    const limit = parseInt(req.query.limit as string) || 50;
    const activities = await storage.getActivitiesByCompany(userCompany.companyId, Math.min(limit, 100));
    res.json(activities);
  } catch (error) {
    console.error("Error fetching activities:", error);
    res.status(500).json({ message: "Errore nel recupero delle attività" });
  }
});

// ============ TEAM MANAGEMENT (COMPANY_ADMIN+) ============

// GET /api/users — lista utenti della stessa azienda
usersRouter.get("/users", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN") {
      return res.status(403).json({ message: "Accesso negato" });
    }
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany && role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }
    if (role === "SUPER_ADMIN" && !userCompany) {
      return res.json([]);
    }
    const companyUsers = await storage.getUsersByCompanyId(userCompany!.companyId);
    const safeUsers = companyUsers.map(({ password, profileImageData, ...user }) => user);
    res.json(safeUsers);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Errore nel recupero degli utenti" });
  }
});

// PATCH /api/users/profile — aggiorna profilo corrente
usersRouter.patch("/users/profile", isAuthenticated, async (req, res) => {
  try {
    const { id: userId } = req.user!;
    const profileSchema = z.object({
      displayName: z.string().optional(),
      contactEmail: z.string().email("Email non valida").optional().or(z.literal("")),
      phone: z.string().optional(),
    });
    const validatedData = profileSchema.parse(req.body);
    const updatedUser = await storage.updateUserProfile(userId, {
      displayName: validatedData.displayName || undefined,
      contactEmail: validatedData.contactEmail || undefined,
      phone: validatedData.phone || undefined,
    });
    if (!updatedUser) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    const { password, profileImageData, ...safeUser } = updatedUser;
    res.json(safeUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    console.error("Error updating user profile:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento del profilo" });
  }
});

// POST /api/users/profile-image — upload immagine profilo
usersRouter.post("/users/profile-image", isAuthenticated, profileImageUpload.single("image"), async (req, res) => {
  try {
    const { id: userId } = req.user!;
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: "Nessuna immagine caricata" });
    }
    const base64 = file.buffer.toString("base64");
    const dataUri = `data:${file.mimetype};base64,${base64}`;
    const imageUrl = `/api/users/${userId}/profile-image?t=${Date.now()}`;
    const updatedUser = await storage.updateUserProfile(userId, {
      profileImageUrl: imageUrl,
      profileImageData: dataUri,
    });
    if (!updatedUser) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    const { password, profileImageData, ...safeUser } = updatedUser;
    res.json(safeUser);
  } catch (error: any) {
    console.error("Error uploading profile image:", error);
    res.status(500).json({ message: error.message || "Errore nel caricamento dell'immagine" });
  }
});

// GET /api/users/:id/profile-image — serve immagine profilo (richiede autenticazione)
// Nota: richiede isAuthenticated per prevenire information disclosure cross-tenant.
// Il frontend deve passare il token JWT nell'header Authorization per le richieste immagine.
usersRouter.get("/users/:id/profile-image", isAuthenticated, async (req, res) => {
  try {
    const { id: requestingUserId, role } = req.user!;
    // Verifica che il richiedente appartenga alla stessa azienda del proprietario
    // dell'immagine, oppure sia SUPER_ADMIN.
    if (role !== "SUPER_ADMIN") {
      const requestingCompany = await resolveUserCompany(requestingUserId, role, req);
      const targetCompany = await storage.getUserCompany(req.params.id);
      if (!requestingCompany || !targetCompany || requestingCompany.companyId !== targetCompany.companyId) {
        return res.status(404).json({ message: "Immagine non trovata" });
      }
    }
    const user = await getUserById(req.params.id);
    if (!user || !user.profileImageData) {
      return res.status(404).json({ message: "Immagine non trovata" });
    }
    const match = user.profileImageData.match(/^data:(.+);base64,(.+)$/);
    if (!match) {
      return res.status(500).json({ message: "Formato immagine non valido" });
    }
    const mimeType = match[1];
    const buffer = Buffer.from(match[2], "base64");
    res.set({
      "Content-Type": mimeType,
      "Content-Length": String(buffer.length),
      "Cache-Control": "public, max-age=86400",
    });
    res.send(buffer);
  } catch (error: any) {
    console.error("Error serving profile image:", error);
    res.status(500).json({ message: "Errore nel recupero dell'immagine" });
  }
});

// DELETE /api/users/profile-image — rimuove immagine profilo
usersRouter.delete("/users/profile-image", isAuthenticated, async (req, res) => {
  try {
    const { id: userId } = req.user!;
    const updatedUser = await storage.updateUserProfile(userId, {
      profileImageUrl: "",
      profileImageData: null,
    });
    if (!updatedUser) return res.status(404).json({ message: "Utente non trovato" });
    const { password, profileImageData, ...safeUser } = updatedUser;
    res.json(safeUser);
  } catch (error: any) {
    console.error("Error removing profile image:", error);
    res.status(500).json({ message: error.message || "Errore nella rimozione dell'immagine" });
  }
});

// POST /api/users/change-password — cambio password utente corrente
usersRouter.post("/users/change-password", isAuthenticated, async (req, res) => {
  try {
    const { id: userId } = req.user!;
    const changePasswordSchema = z.object({
      currentPassword: z.string().min(1, "Password corrente richiesta"),
      newPassword: z
        .string()
        .min(8, "La password deve avere almeno 8 caratteri")
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "La password deve contenere almeno una maiuscola, una minuscola e un numero"),
    });
    const validatedData = changePasswordSchema.parse(req.body);
    const currentUser = await getUserById(userId);
    if (!currentUser) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    const isCurrentValid = await verifyPassword(validatedData.currentPassword, currentUser.password);
    if (!isCurrentValid) {
      return res.status(401).json({ message: "La password corrente non è corretta" });
    }
    const hashedPassword = await hashPassword(validatedData.newPassword);
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, userId));
    res.json({ message: "Password aggiornata con successo" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    console.error("Error changing password:", error);
    res.status(500).json({ message: "Errore nel cambio password" });
  }
});

// POST /api/users/invite — crea invito con magic link
usersRouter.post("/users/invite", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN") {
      return res.status(403).json({ message: "Accesso negato" });
    }
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany && role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }
    if (role === "SUPER_ADMIN" && !userCompany) {
      return res.status(400).json({ message: "Super Admin non associato a nessuna azienda" });
    }
    const inviteSchema = z.object({
      email: z.string().email("Email non valida"),
      role: z.enum(["COMPANY_ADMIN", "SALES_AGENT", "TECHNICIAN"]),
    });
    const validatedData = inviteSchema.parse(req.body);
    if ((validatedData.role as string) === "SUPER_ADMIN") {
      return res.status(403).json({ message: "Non puoi creare un Super Admin" });
    }
    const existingUser = await storage.getUserByEmail(validatedData.email);
    if (existingUser) {
      return res.status(400).json({ message: "Esiste già un utente con questa email" });
    }
    const existingInvite = await storage.getInviteByEmail(validatedData.email, userCompany!.companyId);
    if (existingInvite) {
      await storage.deleteInvite(existingInvite.id);
    }
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const invite = await storage.createInvite({
      email: validatedData.email.toLowerCase(),
      role: validatedData.role,
      companyId: userCompany!.companyId,
      token,
      expiresAt,
    });
    const baseUrl = req.headers.origin || `${req.protocol}://${req.headers.host}`;
    const inviteLink = `${baseUrl}/join?token=${token}`;
    res.status(201).json({
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
      },
      inviteLink,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    console.error("Error creating invite:", error);
    res.status(500).json({ message: "Errore nella creazione dell'invito" });
  }
});

// PUT /api/team/:id — modifica ruolo utente
usersRouter.put("/team/:id", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const targetUserId = req.params.id;
    if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN") {
      return res.status(403).json({ message: "Accesso negato" });
    }
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany && role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }
    const targetUserCompany = await storage.getUserCompany(targetUserId);
    if (!targetUserCompany || targetUserCompany.companyId !== userCompany?.companyId) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    const updateSchema = z.object({
      role: z.enum(["COMPANY_ADMIN", "SALES_AGENT", "TECHNICIAN"]),
    });
    const validatedData = updateSchema.parse(req.body);
    if ((validatedData.role as string) === "SUPER_ADMIN") {
      return res.status(403).json({ message: "Non puoi promuovere a Super Admin" });
    }
    if (targetUserId === userId) {
      return res.status(400).json({ message: "Non puoi modificare il tuo ruolo" });
    }
    const updatedUser = await storage.updateUserRole(targetUserId, validatedData.role);
    if (!updatedUser) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    const { password, profileImageData, ...safeUser } = updatedUser;
    res.json(safeUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Errore nella modifica dell'utente" });
  }
});

// DELETE /api/team/:id — sospendi utente
usersRouter.delete("/team/:id", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const targetUserId = req.params.id;
    if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN") {
      return res.status(403).json({ message: "Accesso negato" });
    }
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany && role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }
    const targetUserCompany = await storage.getUserCompany(targetUserId);
    if (!targetUserCompany || targetUserCompany.companyId !== userCompany?.companyId) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    if (targetUserId === userId) {
      return res.status(400).json({ message: "Non puoi sospendere te stesso" });
    }
    const targetUser = await storage.getUserById(targetUserId);
    if (targetUser?.role === "SUPER_ADMIN") {
      return res.status(403).json({ message: "Non puoi sospendere un Super Admin" });
    }
    const updatedUser = await storage.updateUserStatus(targetUserId, "SUSPENDED");
    if (!updatedUser) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    res.status(204).send();
  } catch (error) {
    console.error("Error suspending user:", error);
    res.status(500).json({ message: "Errore nella sospensione dell'utente" });
  }
});

// POST /api/users/:userId/reset-password — admin genera link reset password
usersRouter.post("/users/:userId/reset-password", isAuthenticated, async (req, res) => {
  try {
    const { id: adminId, role } = req.user!;
    if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Solo gli admin possono resettare le password" });
    }
    const targetUserId = req.params.userId;
    // Usa resolveUserCompany (non storage.getUserCompany diretto) per onorare
    // x-company-id header per SUPER_ADMIN e per garantire coerenza con il resto del sistema.
    const userCompany = await resolveUserCompany(adminId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }
    const targetUserCompany = await storage.getUserCompany(targetUserId);
    if (!targetUserCompany || targetUserCompany.companyId !== userCompany.companyId) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 ore
    await db.insert(passwordResetTokens).values({ userId: targetUserId, token, expiresAt });
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const resetLink = `${baseUrl}/reset-password?token=${token}`;
    res.json({ resetLink });
  } catch (error) {
    console.error("Error creating password reset:", error);
    res.status(500).json({ message: "Errore nella creazione del link di reset" });
  }
});

// POST /api/users/:userId/unlock — admin sblocca account bloccato
usersRouter.post("/users/:userId/unlock", isAuthenticated, async (req, res) => {
  try {
    const { id: adminId, role } = req.user!;
    if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Solo gli admin possono sbloccare gli account" });
    }
    const targetUserId = req.params.userId;
    // Usa resolveUserCompany per coerenza con il sistema e supporto x-company-id per SUPER_ADMIN.
    const userCompany = await resolveUserCompany(adminId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }
    const targetUserCompany = await storage.getUserCompany(targetUserId);
    if (!targetUserCompany || targetUserCompany.companyId !== userCompany.companyId) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    await resetFailedLoginAttempts(targetUserId);
    res.json({ message: "Account sbloccato con successo" });
  } catch (error) {
    console.error("Error unlocking account:", error);
    res.status(500).json({ message: "Errore nello sblocco dell'account" });
  }
});
