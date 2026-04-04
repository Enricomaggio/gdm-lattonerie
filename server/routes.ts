import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { buildAccessContext } from "./utils/accessContext";
import { leadsRouter } from "./routers/leads.router";
import { opportunitiesRouter } from "./routers/opportunities.router";
import { quotesRouter } from "./routers/quotes.router";
import { companyRouter } from "./routers/company.router";
import { authRouter } from "./routers/auth.router";
import { usersRouter } from "./routers/users.router";
import { projectsRouter } from "./routers/projects.router";
import { adminRouter } from "./routers/admin.router";
import { catalogRouter } from "./routers/catalog.router";
import { assignmentsRouter } from "./routers/assignments.router";
import { notificationsRouter } from "./routers/notifications.router";
import {
  isAuthenticated,
  canAccessLeads,
} from "./auth";




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
  app.use('/api', authRouter);
  app.use('/api', usersRouter);
  app.use('/api', catalogRouter);
  app.use('/api', assignmentsRouter);
  app.use('/api', notificationsRouter);



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
  return httpServer;
}
