import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, type AccessContext } from "./storage";
import { resolveUserCompany, buildAccessContext, validateUserInSameCompany } from "./utils/accessContext";
import { leadsRouter } from "./routers/leads.router";
import { opportunitiesRouter } from "./routers/opportunities.router";
import { quotesRouter } from "./routers/quotes.router";
import { companyRouter } from "./routers/company.router";
import { projectsRouter } from "./routers/projects.router";
import { adminRouter } from "./routers/admin.router";
import { requireProxitLock } from "./utils/proxit-helpers";
import { isUniqueConstraintError } from "./utils/errors";
import {
  isAuthenticated, 
  requireRole,
  canAccessLeads,
  createUser, 
  getUserByEmail, 
  getUserById,
  verifyPassword, 
  generateToken,
  sanitizeUser,
  hashPassword,
  isAccountLocked,
  recordFailedLogin,
  resetFailedLoginAttempts
} from "./auth";
import { 
  insertLeadSchema, insertOpportunitySchema, registerUserSchema, loginUserSchema, insertArticleSchema, insertPaymentMethodSchema, insertLeadSourceSchema, insertReminderSchema, insertPromoCodeSchema, updatePromoCodeSchema, passwordResetTokens, users,
  unitTypeEnum, pricingLogicEnum, quoteStatusEnum, quotePhaseEnum,
  type UserRole, type PricingData, type RentalPricingData, type LaborPricingData, type TransportPricingData, type TransportVehicle, type DocumentPricingData, type SimplePricingData, type SalePricingData, type QuoteGlobalParams, type QuotePhase, type QuoteDiscounts, type InstallationData, type InstallationOption, type HandlingData, type HandlingParamsData, type HandlingZone, type HoistPricingData, type HoistPricingTier, type HoistInstallationData,
  type InsertOpportunity, type InsertQuote, type InsertQuoteItem, type InsertProject
} from "@shared/schema";
import { z } from "zod";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { STANDARD_ARTICLES } from "./data/masterCatalog";
import { calcPrezzoSmaltimentoRete } from "@shared/optionalServices";
import { db } from "./db";
import { eq, desc, and, gte, lte, sql as drizzleSql, inArray, isNull, isNotNull } from "drizzle-orm";
import { quotes, opportunities, pipelineStages, leads as leadsTable, contactReferents, activityLogs as activityLogsTable, reminders as remindersTable, notifications, dailyAssignments, salPeriods as salPeriodsTable, salVoci as salVociTable, articles as articlesTable, projects as projectsTable, projectStages, proxitPresence, userCompanies } from "@shared/schema";
// Note: opportunities, contactReferents, activityLogs, reminders are also used via the storage layer - direct DB access below
import multer from "multer";
import { parse } from "csv-parse/sync";



async function getOrCreateUserCompany(userId: string): Promise<string> {
  let userCompany = await storage.getUserCompany(userId);

  if (!userCompany) {
    const company = await storage.createCompany({
      name: "La Mia Azienda",
      vatNumber: null,
    });

    userCompany = await storage.createUserCompany({
      userId,
      companyId: company.id,
    });
  }

  return userCompany.companyId;
}


export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ============ MODULAR ROUTERS ============
  app.use('/api', leadsRouter);
  app.use('/api', opportunitiesRouter);
  app.use('/api', quotesRouter);
  app.use('/api', projectsRouter);
  app.use('/api', adminRouter);
  app.use('/api', companyRouter);


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

  app.post("/api/register", async (_req, res) => {
    return res.status(403).json({ message: "La registrazione pubblica è disabilitata. L'accesso è possibile solo tramite invito." });
  });

  app.post("/api/login", async (req, res) => {
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
          message: `Account temporaneamente bloccato per troppi tentativi falliti. Riprova tra ${lockStatus.minutesRemaining} minut${lockStatus.minutesRemaining === 1 ? 'o' : 'i'}.` 
        });
      }

      const isValid = await verifyPassword(validatedData.password, user.password);
      if (!isValid) {
        const result = await recordFailedLogin(user.id, user.failedLoginAttempts);
        if (result.locked) {
          return res.status(429).json({ 
            message: "Account temporaneamente bloccato per troppi tentativi falliti. Riprova tra 15 minuti." 
          });
        }
        return res.status(401).json({ 
          message: `Credenziali non valide. ${result.attemptsRemaining} tentativ${result.attemptsRemaining === 1 ? 'o' : 'i'} rimanent${result.attemptsRemaining === 1 ? 'e' : 'i'}.` 
        });
      }

      // Login riuscito: reset contatore tentativi
      if (user.failedLoginAttempts > 0) {
        await resetFailedLoginAttempts(user.id);
      }

      const token = generateToken({ userId: user.id, email: user.email });

      res.json({
        user: sanitizeUser(user),
        token,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Dati non validi", 
          errors: error.errors 
        });
      }
      console.error("Error logging in:", error);
      res.status(500).json({ message: "Errore nel login" });
    }
  });

  app.get("/api/me", isAuthenticated, async (req: any, res) => {
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


  // GET /api/dashboard/quote-stats - Statistiche preventivi per dashboard commerciale
  app.get("/api/dashboard/quote-stats", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (!canAccessLeads(role)) {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const ctx = await buildAccessContext(userId, role, req);
      if (!ctx) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const allOpportunities = await storage.getOpportunitiesWithAccess(ctx);
      const stages = await storage.getStagesByCompany(ctx.companyId);

      const preventivoInviatoStage = stages.find(s => s.name === "Preventivo Inviato");
      const vintoStage = stages.find(s => s.name === "Vinto");

      const persoStage = stages.find(s => s.name === "Perso");

      const preventivoInviato = preventivoInviatoStage
        ? allOpportunities.filter(o => o.stageId === preventivoInviatoStage.id).length
        : 0;

      const vinteOpportunities = vintoStage
        ? allOpportunities.filter(o => o.stageId === vintoStage.id)
        : [];

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfYear = new Date(now.getFullYear(), 0, 1);

      const currentQuarter = Math.floor(now.getMonth() / 3);
      const startOfLastQuarter = new Date(now.getFullYear(), (currentQuarter - 1) * 3, 1);
      const endOfLastQuarter = new Date(now.getFullYear(), currentQuarter * 3, 0, 23, 59, 59, 999);
      const adjustedStartOfLastQuarter = currentQuarter === 0
        ? new Date(now.getFullYear() - 1, 9, 1)
        : startOfLastQuarter;
      const adjustedEndOfLastQuarter = currentQuarter === 0
        ? new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999)
        : endOfLastQuarter;

      const parseLocalDateQS = (s: string) => {
        const [y, m, d] = s.split("-").map(Number);
        return new Date(y, m - 1, d);
      };
      const customStartDate = req.query.startDate ? parseLocalDateQS(req.query.startDate as string) : null;
      const _endBaseQS = req.query.endDate ? parseLocalDateQS(req.query.endDate as string) : null;
      const customEndDate = _endBaseQS ? new Date(_endBaseQS.getFullYear(), _endBaseQS.getMonth(), _endBaseQS.getDate(), 23, 59, 59, 999) : null;

      const sumValue = (opps: typeof allOpportunities) =>
        opps.reduce((acc, o) => acc + (o.value ? parseFloat(o.value) : 0), 0);

      const filterByCreatedAt = (opps: typeof allOpportunities, start: Date, end: Date) =>
        opps.filter(o => {
          if (!o.createdAt) return false;
          const d = new Date(o.createdAt);
          return d >= start && d <= end;
        });

      const filterByWonAt = (opps: typeof allOpportunities, start: Date, end: Date) =>
        opps.filter(o => {
          if (!o.wonAt) return false;
          const d = new Date(o.wonAt);
          return d >= start && d <= end;
        });

      const filterByLostAt = (opps: typeof allOpportunities, start: Date, end: Date) =>
        opps.filter(o => {
          if (!o.lostAt) return false;
          const d = new Date(o.lostAt);
          return d >= start && d <= end;
        });

      const quoteStageIds = [preventivoInviatoStage?.id, vintoStage?.id, persoStage?.id].filter(Boolean) as string[];
      const quoteOpportunities = allOpportunities.filter(o => quoteStageIds.includes(o.stageId));

      const preventivoInviatoOpportunities = preventivoInviatoStage
        ? allOpportunities.filter(o => o.stageId === preventivoInviatoStage.id)
        : [];

      const monthDuration = now.getTime() - startOfMonth.getTime();
      const prevMonthEnd = new Date(startOfMonth.getTime() - 1);
      const prevMonthStart = new Date(prevMonthEnd.getTime() - monthDuration);

      const quarterDuration = adjustedEndOfLastQuarter.getTime() - adjustedStartOfLastQuarter.getTime();
      const prevQuarterEnd = new Date(adjustedStartOfLastQuarter.getTime() - 1);
      const prevQuarterStart = new Date(prevQuarterEnd.getTime() - quarterDuration);

      const yearDuration = now.getTime() - startOfYear.getTime();
      const prevYearEnd = new Date(startOfYear.getTime() - 1);
      const prevYearStart = new Date(prevYearEnd.getTime() - yearDuration);

      const emessiThisMonthOpps = filterByCreatedAt(quoteOpportunities, startOfMonth, now);
      const emessiLastQuarterOpps = filterByCreatedAt(quoteOpportunities, adjustedStartOfLastQuarter, adjustedEndOfLastQuarter);
      const emessiYearToDateOpps = filterByCreatedAt(quoteOpportunities, startOfYear, now);
      const emessiPrevMonthOpps = filterByCreatedAt(quoteOpportunities, prevMonthStart, prevMonthEnd);
      const emessiPrevQuarterOpps = filterByCreatedAt(quoteOpportunities, prevQuarterStart, prevQuarterEnd);
      const emessiPrevYearOpps = filterByCreatedAt(quoteOpportunities, prevYearStart, prevYearEnd);

      const vintiThisMonthOpps = filterByWonAt(allOpportunities, startOfMonth, now);
      const vintiLastQuarterOpps = filterByWonAt(allOpportunities, adjustedStartOfLastQuarter, adjustedEndOfLastQuarter);
      const vintiYearToDateOpps = filterByWonAt(allOpportunities, startOfYear, now);
      const vintiPrevMonthOpps = filterByWonAt(allOpportunities, prevMonthStart, prevMonthEnd);
      const vintiPrevQuarterOpps = filterByWonAt(allOpportunities, prevQuarterStart, prevQuarterEnd);
      const vintiPrevYearOpps = filterByWonAt(allOpportunities, prevYearStart, prevYearEnd);

      const persiThisMonthOpps = filterByLostAt(allOpportunities, startOfMonth, now);
      const persiLastQuarterOpps = filterByLostAt(allOpportunities, adjustedStartOfLastQuarter, adjustedEndOfLastQuarter);
      const persiYearToDateOpps = filterByLostAt(allOpportunities, startOfYear, now);
      const persiPrevMonthOpps = filterByLostAt(allOpportunities, prevMonthStart, prevMonthEnd);
      const persiPrevQuarterOpps = filterByLostAt(allOpportunities, prevQuarterStart, prevQuarterEnd);
      const persiPrevYearOpps = filterByLostAt(allOpportunities, prevYearStart, prevYearEnd);

      const calcChange = (current: number, previous: number): number | null => {
        if (previous === 0) return null;
        return Math.round(((current - previous) / previous) * 100);
      };

      const customRangeData = customStartDate && customEndDate ? {
        emessiCustom: filterByCreatedAt(quoteOpportunities, customStartDate, customEndDate).length,
        emessiCustomValue: sumValue(filterByCreatedAt(quoteOpportunities, customStartDate, customEndDate)),
        vintiCustom: filterByWonAt(allOpportunities, customStartDate, customEndDate).length,
        vintiCustomValue: sumValue(filterByWonAt(allOpportunities, customStartDate, customEndDate)),
        persiCustom: filterByLostAt(allOpportunities, customStartDate, customEndDate).length,
        persiCustomValue: sumValue(filterByLostAt(allOpportunities, customStartDate, customEndDate)),
        preventivoInviatoCustom: preventivoInviatoStage
          ? allOpportunities.filter(o => o.stageId === preventivoInviatoStage.id && o.createdAt && new Date(o.createdAt) >= customStartDate && new Date(o.createdAt) <= customEndDate).length
          : 0,
        preventivoInviatoCustomValue: preventivoInviatoStage
          ? sumValue(allOpportunities.filter(o => o.stageId === preventivoInviatoStage.id && o.createdAt && new Date(o.createdAt) >= customStartDate && new Date(o.createdAt) <= customEndDate))
          : 0,
      } : null;

      res.json({
        preventivoInviato,
        preventivoInviatoValue: sumValue(preventivoInviatoOpportunities),

        emessiThisMonth: emessiThisMonthOpps.length,
        emessiThisMonthValue: sumValue(emessiThisMonthOpps),
        emessiLastQuarter: emessiLastQuarterOpps.length,
        emessiLastQuarterValue: sumValue(emessiLastQuarterOpps),
        emessiYearToDate: emessiYearToDateOpps.length,
        emessiYearToDateValue: sumValue(emessiYearToDateOpps),
        emessiChangeThisMonth: calcChange(emessiThisMonthOpps.length, emessiPrevMonthOpps.length),
        emessiChangeLastQuarter: calcChange(emessiLastQuarterOpps.length, emessiPrevQuarterOpps.length),
        emessiChangeYearToDate: calcChange(emessiYearToDateOpps.length, emessiPrevYearOpps.length),

        vintiThisMonth: vintiThisMonthOpps.length,
        vintiThisMonthValue: sumValue(vintiThisMonthOpps),
        vintiLastQuarter: vintiLastQuarterOpps.length,
        vintiLastQuarterValue: sumValue(vintiLastQuarterOpps),
        vintiYearToDate: vintiYearToDateOpps.length,
        vintiYearToDateValue: sumValue(vintiYearToDateOpps),
        vintiChangeThisMonth: calcChange(vintiThisMonthOpps.length, vintiPrevMonthOpps.length),
        vintiChangeLastQuarter: calcChange(vintiLastQuarterOpps.length, vintiPrevQuarterOpps.length),
        vintiChangeYearToDate: calcChange(vintiYearToDateOpps.length, vintiPrevYearOpps.length),

        persiThisMonth: persiThisMonthOpps.length,
        persiThisMonthValue: sumValue(persiThisMonthOpps),
        persiLastQuarter: persiLastQuarterOpps.length,
        persiLastQuarterValue: sumValue(persiLastQuarterOpps),
        persiYearToDate: persiYearToDateOpps.length,
        persiYearToDateValue: sumValue(persiYearToDateOpps),
        persiChangeThisMonth: calcChange(persiThisMonthOpps.length, persiPrevMonthOpps.length),
        persiChangeLastQuarter: calcChange(persiLastQuarterOpps.length, persiPrevQuarterOpps.length),
        persiChangeYearToDate: calcChange(persiYearToDateOpps.length, persiPrevYearOpps.length),

        ...(customRangeData ?? {}),
      });
    } catch (error) {
      console.error("Error fetching quote stats:", error);
      res.status(500).json({ message: "Errore nel recupero delle statistiche preventivi" });
    }
  });

  // GET /api/dashboard/won-by-month - Preventivi vinti per mese (3 anni)
  app.get("/api/dashboard/won-by-month", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (!canAccessLeads(role)) {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const ctx = await buildAccessContext(userId, role, req);
      if (!ctx) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const currentYear = parseInt(req.query.year as string) || new Date().getFullYear();
      const sellerIdParam = req.query.sellerId as string | undefined;

      // SALES_AGENT: può vedere solo i propri dati; ignora qualsiasi sellerId nel query param
      let sellerUserId: string | undefined;
      if (role === "SALES_AGENT") {
        sellerUserId = userId;
      } else {
        sellerUserId = sellerIdParam && sellerIdParam !== "all" ? sellerIdParam : undefined;
      }

      const stages = await storage.getStagesByCompany(ctx.companyId);
      const vintoStage = stages.find(s => s.name === "Vinto");

      if (!vintoStage) {
        return res.json({
          currentYear: Array(12).fill(0),
          lastYear: Array(12).fill(0),
          twoYearsAgo: Array(12).fill(0),
          years: { currentYear, lastYear: currentYear - 1, twoYearsAgo: currentYear - 2 },
        });
      }

      const data = await storage.getWonByMonth(ctx.companyId, currentYear, vintoStage.id, sellerUserId);

      res.json({
        ...data,
        years: { currentYear, lastYear: currentYear - 1, twoYearsAgo: currentYear - 2 },
      });
    } catch (error) {
      console.error("Error fetching won-by-month:", error);
      res.status(500).json({ message: "Errore nel recupero dei dati vinti per anno" });
    }
  });

  // ============================================
  // OPPORTUNITIES API Routes
  // ============================================


  // ============ ARTICLES (Listino Preventivatore) ============

  // GET /api/articles - Lista articoli del listino
  app.get("/api/articles", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const checklistOnly = req.query.checklist === "true";
      const articles = await storage.getArticlesByCompany(userCompany.companyId, checklistOnly);
      res.json(articles);
    } catch (error) {
      console.error("Error fetching articles:", error);
      res.status(500).json({ message: "Errore nel recupero degli articoli" });
    }
  });

  // GET /api/articles/:id - Dettaglio singolo articolo
  app.get("/api/articles/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const article = await storage.getArticle(req.params.id, userCompany.companyId);
      if (!article) {
        return res.status(404).json({ message: "Articolo non trovato" });
      }

      res.json(article);
    } catch (error) {
      console.error("Error fetching article:", error);
      res.status(500).json({ message: "Errore nel recupero dell'articolo" });
    }
  });

  // Schema per aggiornamento articolo (esclude companyId e isActive, tutti i campi opzionali)
  const updateArticleSchema = insertArticleSchema.omit({ companyId: true, isActive: true }).partial();

  // POST /api/articles - Crea nuovo articolo (COMPANY_ADMIN+)
  app.post("/api/articles", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli amministratori possono creare articoli" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      // Generate code automatically if not provided
      let code = req.body.code;
      if (!code) {
        const pricingLogic = req.body.pricingLogic || "RENTAL";
        const prefixMap: Record<string, string> = {
          RENTAL: "NOL",
          LABOR: "MAN",
          TRANSPORT: "TRA",
          DOCUMENT: "DOC",
          EXTRA: "EXT",
          SERVICE: "SRV",
        };
        const prefix = prefixMap[pricingLogic] || "ART";
        // Get existing articles to find next number
        const existingArticles = await storage.getArticlesByCompany(userCompany.companyId);
        const samePrefix = existingArticles.filter(a => a.code.startsWith(prefix + "-"));
        const numbers = samePrefix.map(a => {
          const match = a.code.match(new RegExp(`^${prefix}-(\\d+)$`));
          return match ? parseInt(match[1]) : 0;
        });
        const nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
        code = `${prefix}-${String(nextNum).padStart(3, "0")}`;
      }

      // Valida usando lo schema condiviso (forza companyId dall'utente autenticato)
      const validationResult = insertArticleSchema.safeParse({
        ...req.body,
        code,
        companyId: userCompany.companyId,
      });
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Dati non validi", 
          errors: validationResult.error.flatten().fieldErrors 
        });
      }

      const article = await storage.createArticle(validationResult.data);

      res.status(201).json(article);
    } catch (error) {
      console.error("Error creating article:", error);
      res.status(500).json({ message: "Errore nella creazione dell'articolo" });
    }
  });

  // PATCH /api/articles/:id - Aggiorna articolo (COMPANY_ADMIN+)
  app.patch("/api/articles/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli amministratori possono modificare articoli" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      // Valida usando lo schema derivato (omette companyId, isActive, tutti opzionali)
      const validationResult = updateArticleSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Dati non validi", 
          errors: validationResult.error.flatten().fieldErrors 
        });
      }

      // Lo schema omit({ companyId }).partial() garantisce solo campi validi
      const article = await storage.updateArticle(req.params.id, userCompany.companyId, validationResult.data);
      if (!article) {
        return res.status(404).json({ message: "Articolo non trovato" });
      }

      res.json(article);
    } catch (error) {
      console.error("Error updating article:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento dell'articolo" });
    }
  });

  // DELETE /api/articles/:id - Elimina articolo (soft delete, COMPANY_ADMIN+)
  app.delete("/api/articles/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli amministratori possono eliminare articoli" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const deleted = await storage.deleteArticle(req.params.id, userCompany.companyId);
      if (!deleted) {
        return res.status(404).json({ message: "Articolo non trovato" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting article:", error);
      res.status(500).json({ message: "Errore nell'eliminazione dell'articolo" });
    }
  });

  // POST /api/catalog/seed-defaults - Inizializza/Aggiorna listino con articoli standard (UPSERT)
  app.post("/api/catalog/seed-defaults", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli amministratori possono inizializzare il listino" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const existingArticles = await storage.getArticlesByCompany(userCompany.companyId);
      const existingByName = new Map(existingArticles.map(a => [a.name, a]));
      const existingByCode = new Map(existingArticles.filter(a => a.code).map(a => [a.code, a]));

      let created = 0;
      let updated = 0;

      for (const masterArticle of STANDARD_ARTICLES) {
        const existing = existingByName.get(masterArticle.name) || existingByCode.get(masterArticle.code);

        if (existing) {
          await storage.updateArticle(existing.id, userCompany.companyId, {
            code: masterArticle.code,
            description: masterArticle.description,
            category: masterArticle.category,
            unitType: masterArticle.unitType,
            pricingLogic: masterArticle.pricingLogic,
            basePrice: masterArticle.basePrice,
            pricingData: masterArticle.pricingData,
            installationData: masterArticle.installationData,
            trasfertaData: masterArticle.trasfertaData,
            variantsData: masterArticle.variantsData,
            isChecklistItem: masterArticle.isChecklistItem,
            checklistOrder: masterArticle.checklistOrder,
          });
          updated++;
        } else {
          await storage.createArticle({
            ...masterArticle,
            companyId: userCompany.companyId,
            isActive: 1,
          });
          created++;
        }
      }

      res.status(201).json({ 
        message: `Listino aggiornato: ${created} nuovi articoli, ${updated} aggiornati`,
        created,
        updated,
        total: created + updated
      });
    } catch (error) {
      console.error("Error seeding catalog:", error);
      res.status(500).json({ message: "Errore nell'inizializzazione del listino" });
    }
  });

  app.post("/api/catalog/migrate-venice-transport", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli amministratori possono eseguire migrazioni" });
      }
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const existingArticles = await storage.getArticlesByCompany(userCompany.companyId);
      const trfVen = existingArticles.find(a => a.code === "TRF-VEN");
      const trfBar = existingArticles.find(a => a.code === "TRA-BAR" || a.code === "TRF-BAR");
      const tra001 = existingArticles.find(a => a.code === "TRA-001");

      const trfVenVariants = [
        { label: "Santa Croce", description: "Venezia centro", dailyCost: 150 },
        { label: "Dorsoduro", description: "Venezia centro", dailyCost: 200 },
        { label: "San Polo", description: "Venezia centro", dailyCost: 200 },
        { label: "Cannaregio", description: "Venezia centro", dailyCost: 200 },
        { label: "San Marco", description: "Venezia centro", dailyCost: 250 },
        { label: "Castello", description: "Venezia centro", dailyCost: 250 },
        { label: "Giudecca", description: "Isole (barca)", dailyCost: 300 },
        { label: "Murano", description: "Isole (barca)", dailyCost: 300 },
        { label: "Lido", description: "Raggiungibile via Ferry Boat", dailyCost: 0 },
        { label: "Burano", description: "Isole settentrionali (barca)", dailyCost: 350 },
        { label: "Torcello", description: "Isole settentrionali (barca)", dailyCost: 350 },
        { label: "Pellestrina", description: "Raggiungibile via Ferry Boat", dailyCost: 400 },
      ];

      const trfBarVariants = [
        { label: "Barca piccola con gru", description: "Fino a 6 ton", price: 510, isDefault: true },
        { label: "Barca grande con gru", description: "Oltre 6 ton", price: 510 },
      ];

      const results: string[] = [];

      if (trfVen) {
        await storage.updateArticle(trfVen.id, userCompany.companyId, { variantsData: trfVenVariants });
        results.push("TRF-VEN: variantsData aggiornato con 12 zone individuali");
      } else {
        results.push("TRF-VEN: non trovato — eseguire prima Inizializza Listino");
      }

      if (!trfBar) {
        await storage.createArticle({
          code: "TRA-BAR",
          name: "Barca Lagunare",
          description: "Trasporto con barca lagunare per cantieri a Venezia — costo a corpo per direzione",
          category: "TRANSPORT",
          unitType: "AC",
          pricingLogic: "SERVICE",
          basePrice: "510.00",
          pricingData: { price: 510 },
          trasfertaData: { costo1Label: "Prezzo barca", costo1Value: 510, costo1Unit: "€/viaggio", costo2Label: "", costo2Value: 0, costo2Unit: "" },
          variantsData: trfBarVariants,
          companyId: userCompany.companyId,
          isActive: 1,
          isChecklistItem: 0,
          checklistOrder: 0,
        });
        results.push("TRA-BAR: creato con 2 varianti (Piccola/Grande con gru)");
      } else {
        const updates: Record<string, unknown> = { variantsData: trfBarVariants };
        if (trfBar.code === "TRF-BAR") {
          updates.code = "TRA-BAR";
          updates.category = "TRANSPORT";
        }
        await storage.updateArticle(trfBar.id, userCompany.companyId, updates);
        results.push("TRA-BAR: variantsData aggiornato" + (trfBar.code === "TRF-BAR" ? " + codice corretto TRF→TRA" : ""));
      }

      if (tra001) {
        const pricingData = tra001.pricingData as TransportPricingData;
        if (pricingData?.vehicles) {
          const vehicleDefaults: Record<string, { banchinaCost: number; ferryLidoCost: number; ferryPellesCost: number }> = {
            "Furgone DAILY (9)": { banchinaCost: 70, ferryLidoCost: 493, ferryPellesCost: 593 },
            "Camion DAF LF (2)": { banchinaCost: 70, ferryLidoCost: 688, ferryPellesCost: 808 },
            "Camion DAF CF (10)": { banchinaCost: 130, ferryLidoCost: 948, ferryPellesCost: 1113 },
            "Camion DAF CF (10) + RIM": { banchinaCost: 200, ferryLidoCost: 1083, ferryPellesCost: 1248 },
          };
          const updatedVehicles = pricingData.vehicles.map((v: TransportVehicle) => {
            const defaults = vehicleDefaults[v.name];
            if (defaults && !v.banchinaCost && !v.ferryLidoCost && !v.ferryPellesCost) {
              return { ...v, ...defaults };
            }
            return v;
          });
          await storage.updateArticle(tra001.id, userCompany.companyId, { pricingData: { ...pricingData, vehicles: updatedVehicles } });
          results.push("TRA-001: costi Venezia aggiunti ai veicoli");
        }
      } else {
        results.push("TRA-001: non trovato — eseguire prima Inizializza Listino");
      }

      res.json({ message: "Migrazione trasporti Venezia completata", results });
    } catch (error) {
      console.error("Error migrating Venice transport:", error);
      res.status(500).json({ message: "Errore nella migrazione trasporti Venezia" });
    }
  });


  // GET /api/users/assignable - Lista utenti assegnabili (SALES_AGENT e COMPANY_ADMIN)
  app.get("/api/users/assignable", isAuthenticated, async (req, res) => {
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

  app.get("/api/users/technicians", isAuthenticated, async (req, res) => {
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

  // GET /api/activities - Ultime attività dell'azienda
  app.get("/api/activities", isAuthenticated, async (req, res) => {
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

  // GET /api/users - Lista utenti della stessa azienda
  app.get("/api/users", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      // Solo COMPANY_ADMIN e SUPER_ADMIN possono vedere la lista utenti
      if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN") {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      // SUPER_ADMIN senza company non può vedere utenti (deve selezionare un'azienda)
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

  // PATCH /api/users/profile - Aggiorna profilo utente corrente (displayName, contactEmail, phone)
  app.patch("/api/users/profile", isAuthenticated, async (req, res) => {
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
        return res.status(400).json({ 
          message: "Dati non validi", 
          errors: error.errors 
        });
      }
      console.error("Error updating user profile:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento del profilo" });
    }
  });

  // POST /api/users/profile-image - Upload immagine profilo
  app.post("/api/users/profile-image", isAuthenticated, profileImageUpload.single("image"), async (req, res) => {
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

  app.get("/api/users/:id/profile-image", async (req, res) => {
    try {
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

  app.delete("/api/users/profile-image", isAuthenticated, async (req, res) => {
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

  // POST /api/users/change-password - Cambio password utente corrente
  app.post("/api/users/change-password", isAuthenticated, async (req, res) => {
    try {
      const { id: userId } = req.user!;

      const changePasswordSchema = z.object({
        currentPassword: z.string().min(1, "Password corrente richiesta"),
        newPassword: z.string().min(8, "La password deve avere almeno 8 caratteri").regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "La password deve contenere almeno una maiuscola, una minuscola e un numero"),
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

  // POST /api/users/invite - Crea invito con token magic link
  app.post("/api/users/invite", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      // Solo COMPANY_ADMIN e SUPER_ADMIN possono invitare utenti
      if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN") {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      // SUPER_ADMIN senza company non può creare inviti
      if (role === "SUPER_ADMIN" && !userCompany) {
        return res.status(400).json({ message: "Super Admin non associato a nessuna azienda" });
      }

      const inviteSchema = z.object({
        email: z.string().email("Email non valida"),
        role: z.enum(["COMPANY_ADMIN", "SALES_AGENT", "TECHNICIAN"]),
      });

      const validatedData = inviteSchema.parse(req.body);

      // COMPANY_ADMIN non può creare SUPER_ADMIN
      if ((validatedData.role as string) === "SUPER_ADMIN") {
        return res.status(403).json({ message: "Non puoi creare un Super Admin" });
      }

      // Verifica che l'email non esista già come utente
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ message: "Esiste già un utente con questa email" });
      }

      // Verifica che non esista già un invito pendente per questa email+company
      const existingInvite = await storage.getInviteByEmail(validatedData.email, userCompany!.companyId);
      if (existingInvite) {
        // Cancella il vecchio invito e ne crea uno nuovo
        await storage.deleteInvite(existingInvite.id);
      }

      // Genera token casuale
      const token = crypto.randomUUID();

      // Scade tra 7 giorni
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const invite = await storage.createInvite({
        email: validatedData.email.toLowerCase(),
        role: validatedData.role,
        companyId: userCompany!.companyId,
        token,
        expiresAt,
      });

      // Costruisci URL invito
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
        return res.status(400).json({ 
          message: "Dati non validi", 
          errors: error.errors 
        });
      }
      console.error("Error creating invite:", error);
      res.status(500).json({ message: "Errore nella creazione dell'invito" });
    }
  });

  // PUT /api/team/:id - Modifica ruolo utente
  app.put("/api/team/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const targetUserId = req.params.id;

      // Solo COMPANY_ADMIN e SUPER_ADMIN possono modificare utenti
      if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN") {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      // Verifica che l'utente target appartenga alla stessa azienda
      const targetUserCompany = await storage.getUserCompany(targetUserId);
      if (!targetUserCompany || targetUserCompany.companyId !== userCompany?.companyId) {
        return res.status(404).json({ message: "Utente non trovato" });
      }

      const updateSchema = z.object({
        role: z.enum(["COMPANY_ADMIN", "SALES_AGENT", "TECHNICIAN"]),
      });

      const validatedData = updateSchema.parse(req.body);

      // Non permettere di creare SUPER_ADMIN
      if ((validatedData.role as string) === "SUPER_ADMIN") {
        return res.status(403).json({ message: "Non puoi promuovere a Super Admin" });
      }

      // Non permettere di modificare se stessi
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
        return res.status(400).json({ 
          message: "Dati non validi", 
          errors: error.errors 
        });
      }
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Errore nella modifica dell'utente" });
    }
  });

  // DELETE /api/team/:id - Sospendi utente
  app.delete("/api/team/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const targetUserId = req.params.id;

      // Solo COMPANY_ADMIN e SUPER_ADMIN possono sospendere utenti
      if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN") {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      // Verifica che l'utente target appartenga alla stessa azienda
      const targetUserCompany = await storage.getUserCompany(targetUserId);
      if (!targetUserCompany || targetUserCompany.companyId !== userCompany?.companyId) {
        return res.status(404).json({ message: "Utente non trovato" });
      }

      // Non permettere di sospendere se stessi
      if (targetUserId === userId) {
        return res.status(400).json({ message: "Non puoi sospendere te stesso" });
      }

      // Non permettere di sospendere SUPER_ADMIN
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

  // ============ INVITE VERIFICATION (Public) ============

  // GET /api/auth/verify-invite/:token - Verifica token invito
  app.get("/api/auth/verify-invite/:token", async (req, res) => {
    try {
      const { token } = req.params;

      const invite = await storage.getInviteByToken(token);

      if (!invite) {
        return res.status(404).json({ message: "Invito non trovato o non valido" });
      }

      // Verifica scadenza
      if (new Date() > new Date(invite.expiresAt)) {
        return res.status(410).json({ message: "Invito scaduto" });
      }

      // Recupera nome azienda
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

  // POST /api/auth/complete-registration - Completa registrazione da invito
  app.post("/api/auth/complete-registration", async (req, res) => {
    try {
      const completeSchema = z.object({
        token: z.string().min(1, "Token richiesto"),
        firstName: z.string().min(1, "Nome richiesto"),
        lastName: z.string().min(1, "Cognome richiesto"),
        password: z.string().min(8, "La password deve avere almeno 8 caratteri").regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "La password deve contenere almeno una maiuscola, una minuscola e un numero"),
      });

      const validatedData = completeSchema.parse(req.body);

      const invite = await storage.getInviteByToken(validatedData.token);

      if (!invite) {
        return res.status(404).json({ message: "Invito non trovato o non valido" });
      }

      // Verifica scadenza
      if (new Date() > new Date(invite.expiresAt)) {
        return res.status(410).json({ message: "Invito scaduto" });
      }

      // Verifica che l'email non sia già registrata
      const existingUser = await storage.getUserByEmail(invite.email);
      if (existingUser) {
        await storage.deleteInvite(invite.id);
        return res.status(400).json({ message: "Esiste già un utente con questa email" });
      }

      // Crea l'utente
      const user = await storage.createUserWithCompany({
        email: invite.email,
        password: validatedData.password,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        role: invite.role,
      }, invite.companyId);

      // Elimina l'invito
      await storage.deleteInvite(invite.id);

      // Genera JWT per login automatico (usa userId come negli altri endpoint)
      const jwtPayload = {
        userId: user.id,
        email: user.email,
      };

      const jwtToken = jwt.sign(jwtPayload, process.env.SESSION_SECRET!, { expiresIn: "7d" });

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
        return res.status(400).json({ 
          message: "Dati non validi", 
          errors: error.errors 
        });
      }
      console.error("Error completing registration:", error);
      res.status(500).json({ message: "Errore nel completamento della registrazione" });
    }
  });

  // ============ PASSWORD RESET (Admin-initiated) ============

  // POST /api/users/:userId/reset-password - Admin genera link reset password
  app.post("/api/users/:userId/reset-password", isAuthenticated, async (req, res) => {
    try {
      const { id: adminId, role } = req.user!;
      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli admin possono resettare le password" });
      }

      const targetUserId = req.params.userId;
      const userCompany = await storage.getUserCompany(adminId);
      const targetUserCompany = await storage.getUserCompany(targetUserId);

      if (!targetUserCompany || targetUserCompany.companyId !== userCompany?.companyId) {
        return res.status(404).json({ message: "Utente non trovato" });
      }

      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 ore

      await db.insert(passwordResetTokens).values({
        userId: targetUserId,
        token,
        expiresAt,
      });

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const resetLink = `${baseUrl}/reset-password?token=${token}`;

      res.json({ resetLink });
    } catch (error) {
      console.error("Error creating password reset:", error);
      res.status(500).json({ message: "Errore nella creazione del link di reset" });
    }
  });

  // GET /api/auth/verify-reset/:token - Verifica token reset password
  app.get("/api/auth/verify-reset/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const [resetToken] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token));

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

  // POST /api/auth/reset-password - Completa il reset password
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const resetSchema = z.object({
        token: z.string().min(1, "Token richiesto"),
        password: z.string().min(8, "La password deve avere almeno 8 caratteri").regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "La password deve contenere almeno una maiuscola, una minuscola e un numero"),
      });

      const validatedData = resetSchema.parse(req.body);

      const [resetToken] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, validatedData.token));

      if (!resetToken) {
        return res.status(404).json({ message: "Link di reset non valido" });
      }

      if (resetToken.usedAt) {
        return res.status(400).json({ message: "Questo link è già stato utilizzato" });
      }

      if (new Date() > new Date(resetToken.expiresAt)) {
        return res.status(400).json({ message: "Link di reset scaduto" });
      }

      const hashedPassword = await hashPassword(validatedData.password);
      await db.update(users).set({ password: hashedPassword, failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, resetToken.userId));
      await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, resetToken.id));

      res.json({ message: "Password aggiornata con successo" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dati non validi", errors: error.errors });
      }
      console.error("Error resetting password:", error);
      res.status(500).json({ message: "Errore nel reset della password" });
    }
  });

  // POST /api/users/:userId/unlock - Admin sblocca account bloccato
  app.post("/api/users/:userId/unlock", isAuthenticated, async (req, res) => {
    try {
      const { id: adminId, role } = req.user!;
      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli admin possono sbloccare gli account" });
      }

      const targetUserId = req.params.userId;
      const userCompany = await storage.getUserCompany(adminId);
      const targetUserCompany = await storage.getUserCompany(targetUserId);

      if (!targetUserCompany || targetUserCompany.companyId !== userCompany?.companyId) {
        return res.status(404).json({ message: "Utente non trovato" });
      }

      await resetFailedLoginAttempts(targetUserId);
      res.json({ message: "Account sbloccato con successo" });
    } catch (error) {
      console.error("Error unlocking account:", error);
      res.status(500).json({ message: "Errore nello sblocco dell'account" });
    }
  });

  const patchWorkerAssignmentsHandler: import("express").RequestHandler = async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { workerAssignments } = req.body;
      if (!workerAssignments || typeof workerAssignments !== "object") {
        return res.status(400).json({ message: "workerAssignments deve essere un oggetto" });
      }
      const companyId = userCompany.companyId;
      const companyWorkers = await storage.getWorkersByCompany(companyId);
      const validCapoIds = new Set(companyWorkers.filter((w) => w.isCaposquadra).map((w) => w.id));
      const allCompanyWorkerIds = new Set(companyWorkers.map((w) => w.id));
      const waObj = workerAssignments as Record<string, Record<string, string[]>>;
      for (const [dateStr, daySlot] of Object.entries(waObj)) {
        if (!daySlot || typeof daySlot !== "object") continue;
        for (const [capoId, workerIds] of Object.entries(daySlot)) {
          if (!validCapoIds.has(capoId)) {
            return res.status(400).json({ message: `Caposquadra non valido: ${capoId}` });
          }
          if (!Array.isArray(workerIds)) continue;
          for (const wid of workerIds) {
            if (!allCompanyWorkerIds.has(wid)) {
              return res.status(400).json({ message: `Lavoratore non appartiene a questa azienda: ${wid}` });
            }
          }
        }
      }
      const assignment = await storage.updateDailyAssignment(req.params.id, companyId, { workerAssignments });
      if (!assignment) return res.status(404).json({ message: "Attività non trovata" });
      res.json(assignment);
    } catch (error) {
      console.error("Error updating worker assignments:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento delle assegnazioni" });
    }
  };
  app.patch("/api/assignments/:id/worker-assignments", isAuthenticated, requireProxitLock, patchWorkerAssignmentsHandler);
  app.patch("/api/daily-assignments/:id/worker-assignments", isAuthenticated, requireProxitLock, patchWorkerAssignmentsHandler);

  app.patch("/api/assignments/:id/external-counts", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { externalWorkerCounts } = req.body;
      if (!externalWorkerCounts || typeof externalWorkerCounts !== "object") {
        return res.status(400).json({ message: "externalWorkerCounts deve essere un oggetto" });
      }
      const assignment = await storage.updateDailyAssignment(req.params.id, userCompany.companyId, { externalWorkerCounts });
      if (!assignment) return res.status(404).json({ message: "Attività non trovata" });
      res.json(assignment);
    } catch (error) {
      console.error("Error updating external worker counts:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento dei contatori esterni" });
    }
  });

  app.patch("/api/assignments/:id/external-contacted", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { externalTeamContacted } = req.body;
      if (!externalTeamContacted || typeof externalTeamContacted !== "object") {
        return res.status(400).json({ message: "externalTeamContacted deve essere un oggetto" });
      }
      const assignment = await storage.updateDailyAssignment(req.params.id, userCompany.companyId, { externalTeamContacted });
      if (!assignment) return res.status(404).json({ message: "Attività non trovata" });
      res.json(assignment);
    } catch (error) {
      console.error("Error updating external team contacted:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento del flag sentita" });
    }
  });

  app.patch("/api/assignments/:id/team-departure-times", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { teamDepartureTimes } = req.body;
      if (!teamDepartureTimes || typeof teamDepartureTimes !== "object") {
        return res.status(400).json({ message: "teamDepartureTimes deve essere un oggetto" });
      }
      const assignment = await storage.updateDailyAssignment(req.params.id, userCompany.companyId, { teamDepartureTimes });
      if (!assignment) return res.status(404).json({ message: "Attività non trovata" });
      res.json(assignment);
    } catch (error) {
      console.error("Error updating team departure times:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento degli orari di partenza" });
    }
  });

  app.patch("/api/assignments/:id/team-free-numbers", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { teamFreeNumbers } = req.body;
      if (!teamFreeNumbers || typeof teamFreeNumbers !== "object") {
        return res.status(400).json({ message: "teamFreeNumbers deve essere un oggetto" });
      }
      const assignment = await storage.updateDailyAssignment(req.params.id, userCompany.companyId, { teamFreeNumbers });
      if (!assignment) return res.status(404).json({ message: "Attività non trovata" });
      res.json(assignment);
    } catch (error) {
      console.error("Error updating team free numbers:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento dei numeri liberi" });
    }
  });

  app.patch("/api/assignments/:id/team-notes", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { teamNotes } = req.body;
      if (!teamNotes || typeof teamNotes !== "object") {
        return res.status(400).json({ message: "teamNotes deve essere un oggetto" });
      }
      const assignment = await storage.updateDailyAssignment(req.params.id, userCompany.companyId, { teamNotes });
      if (!assignment) return res.status(404).json({ message: "Attività non trovata" });
      res.json(assignment);
    } catch (error) {
      console.error("Error updating team notes:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento delle note squadra" });
    }
  });

  app.patch("/api/assignments/:id/team-note-colors", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { teamNoteColors } = req.body;
      if (!teamNoteColors || typeof teamNoteColors !== "object") {
        return res.status(400).json({ message: "teamNoteColors deve essere un oggetto" });
      }
      const assignment = await storage.updateDailyAssignment(req.params.id, userCompany.companyId, { teamNoteColors });
      if (!assignment) return res.status(404).json({ message: "Attività non trovata" });
      res.json(assignment);
    } catch (error) {
      console.error("Error updating team note colors:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento dei colori note squadra" });
    }
  });

  // ========== PROXIT - Daily Assignments API ==========

  async function updateOpportunityStartDateFromMontaggio(projectId: string, companyId: string): Promise<void> {
    try {
      const project = await db.query.projects.findFirst({
        where: and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, companyId)),
      });
      if (!project?.opportunityId) return;
      const montaggioAssignments = await db
        .select({ date: dailyAssignments.date })
        .from(dailyAssignments)
        .where(and(
          eq(dailyAssignments.projectId, projectId),
          eq(dailyAssignments.activityType, "MONTAGGIO"),
          eq(dailyAssignments.companyId, companyId),
          eq(dailyAssignments.isDraft, false),
        ));
      if (montaggioAssignments.length === 0) return;
      const earliest = montaggioAssignments.reduce((min, a) => a.date < min ? a.date : min, montaggioAssignments[0].date);

      // Recupera l'opportunità per verificare siteQuality e la data precedente
      const [currentOpp] = await db
        .select()
        .from(opportunities)
        .where(and(eq(opportunities.id, project.opportunityId), eq(opportunities.companyId, companyId)));

      const updateFields: Record<string, unknown> = { estimatedStartDate: earliest, updatedAt: new Date() };

      // Se l'opportunità richiede foto o foto+video, aggiorna la data di notifica programmata
      const sq = currentOpp?.siteQuality;
      if (sq === "PHOTO_VIDEO" || sq === "PHOTO_ONLY") {
        const newScheduledAt = new Date(earliest);
        newScheduledAt.setDate(newScheduledAt.getDate() - 10);

        const prevScheduledAt = currentOpp?.photoNotificationScheduledAt;
        const isDateChanged = !prevScheduledAt || Math.abs(newScheduledAt.getTime() - new Date(prevScheduledAt).getTime()) > 0;

        if (isDateChanged) {
          updateFields.photoNotificationScheduledAt = newScheduledAt;
          // Azzera photoNotificationSentAt solo se la notifica non è ancora stata inviata
          // (o se la data è cambiata, per rinviare la notifica)
          updateFields.photoNotificationSentAt = null;
        }
      }

      await db
        .update(opportunities)
        .set(updateFields)
        .where(and(eq(opportunities.id, project.opportunityId), eq(opportunities.companyId, companyId)));
    } catch (err) {
      console.error("Error updating opportunity start date from MONTAGGIO:", err);
    }
  }

  app.get("/api/assignments/material-sigla", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const CONSEGNA_TYPES = ["CONSEGNA", "CONSEGNA_COMBINATO"];
      const rows = await db
        .select({ projectId: dailyAssignments.projectId, materialType: dailyAssignments.materialType })
        .from(dailyAssignments)
        .where(and(
          eq(dailyAssignments.companyId, userCompany.companyId),
          inArray(dailyAssignments.activityType, CONSEGNA_TYPES),
          isNotNull(dailyAssignments.projectId),
          isNotNull(dailyAssignments.materialType)
        ));
      const map: Record<string, string> = {};
      for (const row of rows) {
        if (!row.projectId || !row.materialType) continue;
        const existing = map[row.projectId];
        if (!existing) {
          map[row.projectId] = row.materialType;
        } else {
          const parts = existing.split("/");
          if (!parts.includes(row.materialType)) {
            map[row.projectId] = existing + "/" + row.materialType;
          }
        }
      }
      res.json(map);
    } catch (error) {
      console.error("Error fetching material sigla:", error);
      res.status(500).json({ message: "Errore nel recupero dei materiali" });
    }
  });


  app.get("/api/assignments", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) return res.status(400).json({ message: "startDate e endDate sono obbligatori" });
      const result = await storage.getDailyAssignmentsByDateRange(
        userCompany.companyId,
        new Date(startDate as string),
        new Date(endDate as string)
      );
      res.json(result);
    } catch (error) {
      console.error("Error fetching assignments:", error);
      res.status(500).json({ message: "Errore nel recupero delle assegnazioni" });
    }
  });

  app.post("/api/assignments", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { date, endDate, activityType, clientName, siteCity, siteProvince, siteAddress, scheduledTime, driverId, vehicleId, teamIds, assemblerCount, notes, projectId, gridNote, workerAssignments, timeSlot, endDayTimeSlot, isDraft, workingDays, materialType, materialQuantity, materials, chi, cosa } = req.body;
      if (!date || !activityType) return res.status(400).json({ message: "Data e tipo attività sono obbligatori" });
      if (endDate && new Date(endDate) < new Date(date)) return res.status(400).json({ message: "La data fine non può essere precedente alla data inizio" });
      const workingDaysSchema = z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]);
      const workingDaysParsed = workingDaysSchema.safeParse(workingDays);
      if (!workingDaysParsed.success) return res.status(400).json({ message: "workingDays deve contenere valori interi tra 0 e 6" });
      const workingDaysValidated = workingDaysParsed.data;
      const VALID_MATERIAL_TYPES = ["EP", "PL", "VILLA", "MC", "EL"];
      const materialItemSchema = z.object({ type: z.string(), quantity: z.number().int().positive() });
      const validatedMaterials: Array<{ type: string; quantity: number }> | null = (() => {
        if (!Array.isArray(materials) || materials.length === 0) return null;
        const parsed = materials
          .map((m: unknown) => materialItemSchema.safeParse(m))
          .filter((r): r is z.SafeParseSuccess<{ type: string; quantity: number }> => r.success && VALID_MATERIAL_TYPES.includes(r.data.type))
          .map(r => r.data);
        return parsed.length > 0 ? parsed : null;
      })();
      const firstMaterial = validatedMaterials?.[0] ?? null;
      const validatedMaterialType = firstMaterial ? firstMaterial.type : (materialType && VALID_MATERIAL_TYPES.includes(materialType) ? materialType : null);
      const validatedMaterialQuantity = firstMaterial ? firstMaterial.quantity : (() => { const n = Number(materialQuantity); return (materialQuantity && Number.isInteger(n) && n > 0) ? n : null; })();
      const nextSortOrder = await storage.getNextSortOrderForDay(userCompany.companyId, new Date(date));
      const assignment = await storage.createDailyAssignment({
        companyId: userCompany.companyId,
        projectId: projectId || null,
        date: new Date(date),
        endDate: endDate ? new Date(endDate) : null,
        activityType,
        clientName: clientName || null,
        siteCity: siteCity || null,
        siteProvince: siteProvince || null,
        siteAddress: siteAddress || null,
        scheduledTime: scheduledTime || null,
        driverId: driverId || null,
        vehicleId: vehicleId || null,
        teamIds: teamIds || null,
        assemblerCount: assemblerCount || null,
        notes: notes || null,
        gridNote: gridNote || null,
        workerAssignments: workerAssignments || null,
        timeSlot: timeSlot || "FULL_DAY",
        endDayTimeSlot: endDayTimeSlot || "FULL_DAY",
        status: "PIANIFICATA",
        isDraft: isDraft === true,
        sortOrder: nextSortOrder,
        workingDays: workingDaysValidated,
        materialType: validatedMaterialType,
        materialQuantity: validatedMaterialQuantity,
        materials: validatedMaterials,
        chi: chi || null,
        cosa: cosa || null,
      });
      if (activityType === "MONTAGGIO" && projectId) {
        await updateOpportunityStartDateFromMontaggio(projectId, userCompany.companyId);
      }
      res.status(201).json(assignment);
    } catch (error) {
      console.error("Error creating assignment:", error);
      res.status(500).json({ message: "Errore nella creazione dell'assegnazione" });
    }
  });

  app.patch("/api/assignments/reorder", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { idA, idB, id, toIndex, targetDate, prePadding } = req.body;
      if (id !== undefined && toIndex !== undefined) {
        if (typeof toIndex !== "number") return res.status(400).json({ message: "toIndex deve essere un numero" });
        const pp = typeof prePadding === "number" ? prePadding : undefined;
        if (targetDate) {
          const ok = await storage.moveDailyAssignmentToDay(userCompany.companyId, id, new Date(targetDate), toIndex, pp);
          if (!ok) return res.status(409).json({ message: "Assegnazione non trovata" });
          return res.json({ success: true });
        }
        const ok = await storage.moveDailyAssignmentToIndex(userCompany.companyId, id, toIndex, pp);
        if (!ok) return res.status(409).json({ message: "Assegnazione non trovata" });
        return res.json({ success: true });
      }
      if (!idA || !idB) return res.status(400).json({ message: "idA e idB sono obbligatori" });
      if (idA === idB) return res.status(400).json({ message: "idA e idB devono essere diversi" });
      const ok = await storage.reorderDailyAssignments(userCompany.companyId, idA, idB);
      if (!ok) return res.status(409).json({ message: "Assegnazioni non trovate o non appartengono allo stesso giorno" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering assignments:", error);
      res.status(500).json({ message: "Errore nel riordino delle assegnazioni" });
    }
  });

  app.patch("/api/assignments/:id/pre-padding", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { delta } = req.body;
      if (delta !== 1 && delta !== -1) return res.status(400).json({ message: "delta deve essere 1 o -1" });
      const assignment = await storage.updateDailyAssignmentPrePadding(userCompany.companyId, req.params.id, delta);
      if (!assignment) return res.status(404).json({ message: "Assegnazione non trovata" });
      res.json(assignment);
    } catch (error) {
      console.error("Error updating pre-padding:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento del prePadding" });
    }
  });

  app.patch("/api/assignments/:id", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const prevRows = await db
        .select({ activityType: dailyAssignments.activityType, projectId: dailyAssignments.projectId })
        .from(dailyAssignments)
        .where(and(eq(dailyAssignments.id, req.params.id), eq(dailyAssignments.companyId, userCompany.companyId)))
        .limit(1);
      const prev = prevRows[0] ?? null;
      const updateData: any = { ...req.body };
      if (updateData.date) updateData.date = new Date(updateData.date);
      if (updateData.endDate && updateData.endDate !== "") {
        updateData.endDate = new Date(updateData.endDate);
      } else if (updateData.endDate === null || updateData.endDate === "") {
        updateData.endDate = null;
      }
      if (updateData.date && updateData.endDate && updateData.endDate < updateData.date) {
        return res.status(400).json({ message: "La data fine non può essere precedente alla data inizio" });
      }
      if (updateData.workingDays !== undefined) {
        const workingDaysUpdateSchema = z.array(z.number().int().min(0).max(6));
        const wdParsed = workingDaysUpdateSchema.safeParse(updateData.workingDays);
        if (!wdParsed.success) return res.status(400).json({ message: "workingDays deve contenere valori interi tra 0 e 6" });
        updateData.workingDays = wdParsed.data;
      }
      const VALID_MATERIAL_TYPES_PATCH = ["EP", "PL", "VILLA", "MC", "EL"];
      const materialItemSchemaPatch = z.object({ type: z.string(), quantity: z.number().int().positive() });
      if ("materials" in updateData) {
        const rawMats = updateData.materials;
        const validatedMats: Array<{ type: string; quantity: number }> | null = (() => {
          if (!Array.isArray(rawMats) || rawMats.length === 0) return null;
          const parsed = rawMats
            .map((m: unknown) => materialItemSchemaPatch.safeParse(m))
            .filter((r): r is z.SafeParseSuccess<{ type: string; quantity: number }> => r.success && VALID_MATERIAL_TYPES_PATCH.includes(r.data.type))
            .map(r => r.data);
          return parsed.length > 0 ? parsed : null;
        })();
        updateData.materials = validatedMats;
        updateData.materialType = validatedMats ? validatedMats[0].type : null;
        updateData.materialQuantity = validatedMats ? validatedMats[0].quantity : null;
      } else {
        if ("materialType" in updateData) {
          updateData.materialType = (updateData.materialType && VALID_MATERIAL_TYPES_PATCH.includes(updateData.materialType)) ? updateData.materialType : null;
        }
        if ("materialQuantity" in updateData) {
          const mqNum = Number(updateData.materialQuantity);
          updateData.materialQuantity = (updateData.materialQuantity && Number.isInteger(mqNum) && mqNum > 0) ? mqNum : null;
        }
      }
      const assignment = await storage.updateDailyAssignment(req.params.id, userCompany.companyId, updateData);
      if (!assignment) return res.status(404).json({ message: "Assegnazione non trovata" });
      const projectsToRecalc = new Set<string>();
      if (assignment.activityType === "MONTAGGIO" && assignment.projectId) {
        projectsToRecalc.add(assignment.projectId);
      }
      if (prev && prev.activityType === "MONTAGGIO" && prev.projectId) {
        const typeChanged = assignment.activityType !== "MONTAGGIO";
        const projectChanged = prev.projectId !== assignment.projectId;
        if (typeChanged || projectChanged) {
          projectsToRecalc.add(prev.projectId);
        }
      }
      for (const pid of projectsToRecalc) {
        await updateOpportunityStartDateFromMontaggio(pid, userCompany.companyId);
      }
      res.json(assignment);
    } catch (error) {
      console.error("Error updating assignment:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento dell'assegnazione" });
    }
  });

  app.delete("/api/assignments/:id", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const existingAssignment = await db
        .select({ activityType: dailyAssignments.activityType, projectId: dailyAssignments.projectId })
        .from(dailyAssignments)
        .where(and(eq(dailyAssignments.id, req.params.id), eq(dailyAssignments.companyId, userCompany.companyId)))
        .limit(1);
      const deleted = await storage.deleteDailyAssignment(req.params.id, userCompany.companyId);
      if (!deleted) return res.status(404).json({ message: "Assegnazione non trovata" });
      if (existingAssignment.length > 0 && existingAssignment[0].activityType === "MONTAGGIO" && existingAssignment[0].projectId) {
        await updateOpportunityStartDateFromMontaggio(existingAssignment[0].projectId, userCompany.companyId);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting assignment:", error);
      res.status(500).json({ message: "Errore nell'eliminazione dell'assegnazione" });
    }
  });

  // ============ REMINDERS (Promemoria) ============

  // GET /api/reminders - Lista promemoria utente con filtri opzionali
  app.get("/api/reminders", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });

      const filters: { dueBefore?: Date; dueAfter?: Date; completed?: boolean } = {};
      if (req.query.dueBefore) filters.dueBefore = new Date(req.query.dueBefore as string);
      if (req.query.dueAfter) filters.dueAfter = new Date(req.query.dueAfter as string);
      if (req.query.completed !== undefined) filters.completed = req.query.completed === "true";

      const items = await storage.getRemindersByUser(userId, userCompany.companyId, filters);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/reminders/lead/:leadId - Promemoria per un lead specifico
  app.get("/api/reminders/lead/:leadId", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });
      const items = await storage.getRemindersByLead(req.params.leadId, userCompany.companyId);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/reminders/opportunities-with-active-manual - Opportunità con promemoria manuali attivi
  app.get("/api/reminders/opportunities-with-active-manual", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });

      const opportunityIds = await storage.getOpportunitiesWithActiveManualReminders(userCompany.companyId);
      res.json(opportunityIds);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/reminders/opportunity/:opportunityId - Promemoria per un'opportunità
  app.get("/api/reminders/opportunity/:opportunityId", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });
      const items = await storage.getRemindersByOpportunity(req.params.opportunityId, userCompany.companyId);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/reminders - Crea nuovo promemoria
  app.post("/api/reminders", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });

      const body = { ...req.body };
      if (typeof body.dueDate === "string") {
        const d = new Date(body.dueDate);
        if (isNaN(d.getTime()) || d.getFullYear() < 2000 || d.getFullYear() > 2100) {
          return res.status(400).json({ message: "Data non valida" });
        }
        body.dueDate = d;
      }
      const parsed = insertReminderSchema.omit({ companyId: true, userId: true }).safeParse(body);
      if (!parsed.success) return res.status(400).json({ message: "Dati non validi", errors: parsed.error.flatten() });

      const reminder = await storage.createReminder({
        ...parsed.data,
        userId,
        companyId: userCompany.companyId,
      });
      res.status(201).json(reminder);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // PATCH /api/reminders/:id - Aggiorna promemoria (es. completamento)
  app.patch("/api/reminders/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });

      const existing = await storage.getReminder(req.params.id, userCompany.companyId);
      if (!existing) return res.status(404).json({ message: "Promemoria non trovato" });

      const updateData: any = {};
      if (req.body.title !== undefined) updateData.title = req.body.title;
      if (req.body.description !== undefined) updateData.description = req.body.description;
      if (req.body.dueDate !== undefined) updateData.dueDate = new Date(req.body.dueDate);
      if (req.body.completed !== undefined) {
        updateData.completed = req.body.completed;
        updateData.completedAt = req.body.completed ? new Date() : null;
      }

      const reminder = await storage.updateReminder(req.params.id, userCompany.companyId, updateData);
      res.json(reminder);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // DELETE /api/reminders/:id - Elimina promemoria
  app.delete("/api/reminders/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });
      const deleted = await storage.deleteReminder(req.params.id, userCompany.companyId);
      if (!deleted) return res.status(404).json({ message: "Promemoria non trovato" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== GEOCODING & MAP ====================

  // POST /api/geocode - Geocodifica indirizzo usando Nominatim (OpenStreetMap)
  app.post("/api/geocode", isAuthenticated, async (req, res) => {
    try {
      const { address } = req.body;
      if (!address || typeof address !== "string") {
        return res.status(400).json({ message: "Indirizzo mancante" });
      }
      const encoded = encodeURIComponent(address);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&countrycodes=it`,
        { headers: { "User-Agent": "DaDoPonteggiCRM/1.0" } }
      );
      const results = await response.json();
      if (!results || results.length === 0) {
        return res.json({ found: false });
      }
      res.json({
        found: true,
        latitude: parseFloat(results[0].lat),
        longitude: parseFloat(results[0].lon),
        displayName: results[0].display_name,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/map/geocode-all - Geocodifica tutte le opportunità senza coordinate
  app.post("/api/map/geocode-all", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(400).json({ message: "Company ID mancante" });
      if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN") {
        return res.status(403).json({ message: "Non autorizzato" });
      }

      const ctx: AccessContext = { userId, role: role as UserRole, companyId: userCompany.companyId };
      const allOpps = await storage.getOpportunitiesWithAccess(ctx);
      const toGeocode = allOpps.filter((o: any) => !o.siteLatitude && (o.siteAddress || o.siteCity));

      let geocoded = 0;
      for (const opp of toGeocode) {
        const addr = `${opp.siteAddress || ""} ${opp.siteZip || ""} ${opp.siteCity || ""} Italia`;
        try {
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1&countrycodes=it`,
            { headers: { "User-Agent": "DaDoPonteggiCRM/1.0" } }
          );
          const geoData = await geoRes.json();
          if (geoData && geoData.length > 0) {
            await storage.updateOpportunity(opp.id, userCompany.companyId, {
              siteLatitude: geoData[0].lat,
              siteLongitude: geoData[0].lon,
            } as any);
            geocoded++;
          }
          await new Promise(resolve => setTimeout(resolve, 1100));
        } catch (err) {
          console.error(`Geocoding failed for ${opp.id}:`, err);
        }
      }

      res.json({ total: toGeocode.length, geocoded });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/map/opportunities - Tutte le opportunità con coordinate per la mappa
  app.get("/api/map/opportunities", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(400).json({ message: "Company ID mancante" });

      const ctx: AccessContext = {
        userId,
        role: role as UserRole,
        companyId: userCompany.companyId,
      };
      const allOpps = await storage.getOpportunitiesWithAccess(ctx);
      const withCoords = allOpps
        .filter((o: any) => o.siteLatitude && o.siteLongitude)
        .map((o: any) => ({
          id: o.id,
          title: o.title,
          siteAddress: o.siteAddress,
          siteCity: o.siteCity,
          siteZip: o.siteZip,
          siteLatitude: parseFloat(o.siteLatitude),
          siteLongitude: parseFloat(o.siteLongitude),
          stageId: o.stageId,
          leadId: o.leadId,
          assignedToUserId: o.assignedToUserId,
          workType: o.workType,
          value: o.value,
          ritiroEsubero: o.ritiroEsubero,
          sopralluogoFatto: o.sopralluogoFatto,
          mapsLink: o.mapsLink,
          estimatedStartDate: o.estimatedStartDate,
          estimatedEndDate: o.estimatedEndDate,
        }));
      res.json(withCoords);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Notifications
  app.get("/api/notifications", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const notifs = await storage.getNotifications(user.id);
      res.json(notifs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/notifications/unread-count", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const count = await storage.getUnreadNotificationCount(user.id);
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      await storage.markNotificationRead(req.params.id, user.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/notifications/read-all", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      await storage.markAllNotificationsRead(user.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/notification-preferences", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const prefs = await storage.getNotificationPreferences(user.id);
      res.json(prefs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/notification-preferences/:type", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { type } = req.params;
      const { enabled } = req.body;
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ message: "enabled deve essere un booleano" });
      }
      await storage.setNotificationPreference(user.id, type, enabled);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/notifications/check-expiring-quotes - Crea notifiche per preventivi inviati da 60+ giorni
  app.post("/api/notifications/check-expiring-quotes", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const companyId = userCompany.companyId;
      const stages = await storage.getStagesByCompany(companyId);
      const preventivoInviatoStage = stages.find(s => s.name === "Preventivo Inviato");
      if (!preventivoInviatoStage) {
        return res.json({ created: 0 });
      }

      const now = new Date();
      const cutoff = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 giorni fa

      // Carica tutte le opportunità in "Preventivo Inviato" con quoteSentAt ≥ 60 giorni fa
      const expiring = await db
        .select()
        .from(opportunities)
        .where(
          and(
            eq(opportunities.companyId, companyId),
            eq(opportunities.stageId, preventivoInviatoStage.id),
            lte(opportunities.quoteSentAt, cutoff)
          )
        );

      // Filtra solo quelle il cui snooze è scaduto (o non impostato)
      const toNotify = expiring.filter(opp => {
        if (!opp.quoteReminderSnoozedUntil) return true;
        return new Date(opp.quoteReminderSnoozedUntil) < now;
      });

      let created = 0;
      for (const opp of toNotify) {
        const targetUserId = opp.assignedToUserId || userId;

        // Controlla se esiste già una notifica non letta per questa opportunità
        const existingNotifs = await db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, targetUserId),
              eq(notifications.type, "QUOTE_EXPIRING"),
              eq(notifications.isRead, false),
              eq(notifications.link, `/opportunita?open=${opp.id}`)
            )
          );

        if (existingNotifs.length > 0) continue;

        const daysAgo = Math.floor((now.getTime() - new Date(opp.quoteSentAt!).getTime()) / (24 * 60 * 60 * 1000));

        // Recupera il nome del cliente per il messaggio
        let clientName = opp.title;
        try {
          const lead = await storage.getLead(opp.leadId, companyId);
          if (lead) {
            clientName = lead.entityType === "COMPANY" ? (lead.name || opp.title) : `${lead.firstName} ${lead.lastName}`.trim() || opp.title;
          }
        } catch {}

        await storage.createNotification({
          userId: targetUserId,
          companyId,
          type: "QUOTE_EXPIRING",
          title: "Preventivo in attesa da 60 giorni",
          message: `${clientName} — preventivo in attesa da ${daysAgo} giorni`,
          link: `/opportunita?open=${opp.id}`,
          isRead: false,
        });
        created++;
      }

      res.json({ created });
    } catch (error: any) {
      console.error("Error checking expiring quotes:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/notifications/check-rdc-pending - Crea notifiche per progetti in fase RDC da 3+ giorni
  app.post("/api/notifications/check-rdc-pending", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const companyId = userCompany.companyId;
      const now = new Date();
      const cutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 giorni fa

      // Trova le fasi con "RDC" nel nome
      const rdcStages = await db
        .select()
        .from(projectStages)
        .where(
          and(
            eq(projectStages.companyId, companyId),
            drizzleSql`lower(${projectStages.name}) like '%rdc%'`
          )
        );

      if (rdcStages.length === 0) {
        return res.json({ created: 0 });
      }

      const rdcStageIds = rdcStages.map(s => s.id);

      // Trova progetti in fase RDC con stageEnteredAt <= 3 giorni fa (non nullo)
      const rdcProjects = await db
        .select()
        .from(projectsTable)
        .where(
          and(
            eq(projectsTable.companyId, companyId),
            drizzleSql`${projectsTable.stageId} = ANY(${rdcStageIds})`,
            drizzleSql`${projectsTable.stageEnteredAt} IS NOT NULL`,
            drizzleSql`${projectsTable.stageEnteredAt} <= ${cutoff}`
          )
        );

      // Recupera admin/super_admin dell'azienda
      const allUsers = await storage.getUsersByCompanyId(companyId);
      const adminUsers = allUsers.filter(u =>
        u.role === "COMPANY_ADMIN" || u.role === "SUPER_ADMIN"
      );

      let created = 0;
      for (const project of rdcProjects) {
        const daysAgo = project.stageEnteredAt
          ? Math.floor((now.getTime() - new Date(project.stageEnteredAt).getTime()) / (24 * 60 * 60 * 1000))
          : 3;

        // Destinatari: tecnico assegnato al progetto + admin/super_admin
        const recipientIds = new Set<string>();
        if (project.assignedTechnicianId) {
          recipientIds.add(project.assignedTechnicianId);
        }
        for (const admin of adminUsers) {
          recipientIds.add(admin.id);
        }

        // Link stabile con ID progetto per deduplicazione
        const notifLink = `/progetti?rdc=${project.id}`;

        for (const recipientId of recipientIds) {
          // Controlla se esiste già una notifica non letta per questo progetto e utente
          const existingNotifs = await db
            .select()
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, recipientId),
                eq(notifications.type, "RDC_PENDING"),
                eq(notifications.isRead, false),
                eq(notifications.link, notifLink)
              )
            );

          if (existingNotifs.length > 0) continue;

          await storage.createNotification({
            userId: recipientId,
            companyId,
            type: "RDC_PENDING",
            title: "Sollecita l'ingegnere",
            message: `${project.clientName} è in attesa di RDC da ${daysAgo} giorni`,
            link: notifLink,
            isRead: false,
          });
          created++;
        }
      }

      res.json({ created });
    } catch (error: any) {
      console.error("Error checking RDC pending:", error);
      res.status(500).json({ message: error.message });
    }
  });





  // ========== NOTIFICA PROGRAMMATA FOTO/VIDEO CANTIERE ==========

  // Funzione interna che esegue il check e l'invio delle notifiche foto/video scadute
  async function runSitePhotoNotificationCheck(): Promise<{ sent: number; errors: number }> {
    let sent = 0;
    let errors = 0;
    try {
      const now = new Date();

      // Claim atomicamente le righe: aggiorna photo_notification_sent_at solo dove IS NULL
      // (pattern "claim before send" per idempotenza in caso di run concorrenti)
      const claimedOpps = await db
        .update(opportunities)
        .set({ photoNotificationSentAt: now, updatedAt: new Date() })
        .where(
          and(
            isNull(opportunities.photoNotificationSentAt),
            lte(opportunities.photoNotificationScheduledAt, now),
            inArray(opportunities.siteQuality, ["PHOTO_VIDEO", "PHOTO_ONLY"])
          )
        )
        .returning();

      for (const opp of claimedOpps) {
        try {
          const sq = opp.siteQuality;
          const notifType = sq === "PHOTO_VIDEO" ? "SITE_PHOTO_VIDEO" : "SITE_PHOTO";
          const notifTitle = sq === "PHOTO_VIDEO" ? "Cantiere da foto + video" : "Cantiere da foto";

          // Recupera info cliente per il messaggio
          const [lead] = await db
            .select({ name: leadsTable.name, firstName: leadsTable.firstName, lastName: leadsTable.lastName, entityType: leadsTable.entityType })
            .from(leadsTable)
            .where(eq(leadsTable.id, opp.leadId));
          const clientName = lead
            ? (lead.entityType === "COMPANY" && lead.name ? lead.name : `${lead.firstName || ""} ${lead.lastName || ""}`.trim())
            : opp.title;
          const siteInfo = opp.siteAddress ? ` - ${opp.siteAddress}` : "";

          await storage.createNotificationsForCompanyRoles(
            opp.companyId,
            ["COMPANY_ADMIN", "SUPER_ADMIN"],
            {
              type: notifType,
              title: notifTitle,
              message: `${clientName}${siteInfo}`,
              link: `/opportunita?open=${opp.id}`,
              isRead: false,
            }
          );

          sent++;
        } catch (oppErr) {
          console.error(`[photo-notification] Errore per opportunità ${opp.id}:`, oppErr);
          errors++;
        }
      }
    } catch (err) {
      console.error("[photo-notification] Errore nel check notifiche foto/video:", err);
      errors++;
    }
    return { sent, errors };
  }

  // GET /api/notifications/check-site-photo - Esegue il check manuale (solo SUPER_ADMIN)
  // Operazione globale su tutti i tenant: non esposta ai COMPANY_ADMIN per evitare effetti cross-tenant
  app.get("/api/notifications/check-site-photo", isAuthenticated, requireRole("SUPER_ADMIN"), async (_req, res) => {
    try {
      const result = await runSitePhotoNotificationCheck();
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("[photo-notification] Errore endpoint check:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Scheduler automatico: esegue il check ogni 24 ore
  const PHOTO_NOTIFICATION_INTERVAL_MS = 24 * 60 * 60 * 1000;
  setInterval(async () => {
    console.log("[photo-notification] Esecuzione check notifiche foto/video programmato...");
    const result = await runSitePhotoNotificationCheck();
    console.log(`[photo-notification] Check completato: ${result.sent} inviate, ${result.errors} errori`);
  }, PHOTO_NOTIFICATION_INTERVAL_MS);
  // Esegui anche subito all'avvio (con ritardo di 30s per lasciar avviare il DB)
  setTimeout(async () => {
    console.log("[photo-notification] Check iniziale notifiche foto/video...");
    const result = await runSitePhotoNotificationCheck();
    console.log(`[photo-notification] Check iniziale completato: ${result.sent} inviate, ${result.errors} errori`);
  }, 30_000);

  return httpServer;
}
