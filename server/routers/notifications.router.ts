import { Router } from "express";
import { storage, type AccessContext } from "../storage";
import { resolveUserCompany } from "../utils/accessContext";
import { isAuthenticated, requireRole } from "../auth";
import { insertReminderSchema } from "@shared/schema";
import type { UserRole } from "@shared/schema";
import { db } from "../db";
import { eq, and, lte, inArray, isNull } from "drizzle-orm";
import {
  opportunities,
  notifications,
  leads as leadsTable,
} from "@shared/schema";
import { z } from "zod";

export const notificationsRouter = Router();

// ============ REMINDERS (Promemoria) ============

notificationsRouter.get("/reminders", isAuthenticated, async (req, res) => {
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

notificationsRouter.get("/reminders/lead/:leadId", isAuthenticated, async (req, res) => {
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

notificationsRouter.get("/reminders/opportunities-with-active-manual", isAuthenticated, async (req, res) => {
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

notificationsRouter.get("/reminders/opportunity/:opportunityId", isAuthenticated, async (req, res) => {
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

notificationsRouter.post("/reminders", isAuthenticated, async (req, res) => {
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

notificationsRouter.patch("/reminders/:id", isAuthenticated, async (req, res) => {
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

notificationsRouter.delete("/reminders/:id", isAuthenticated, async (req, res) => {
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

// ============ GEOCODING & MAP ============

notificationsRouter.post("/geocode", isAuthenticated, async (req, res) => {
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

notificationsRouter.post("/map/geocode-all", isAuthenticated, async (req, res) => {
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

notificationsRouter.get("/map/opportunities", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(400).json({ message: "Company ID mancante" });

    const ctx: AccessContext = { userId, role: role as UserRole, companyId: userCompany.companyId };
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

// ============ NOTIFICATIONS ============

notificationsRouter.get("/notifications", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const notifs = await storage.getNotifications(user.id);
    res.json(notifs);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

notificationsRouter.get("/notifications/unread-count", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const count = await storage.getUnreadNotificationCount(user.id);
    res.json({ count });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

notificationsRouter.put("/notifications/:id/read", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    await storage.markNotificationRead(req.params.id, user.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

notificationsRouter.put("/notifications/read-all", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    await storage.markAllNotificationsRead(user.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

notificationsRouter.get("/notification-preferences", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const prefs = await storage.getNotificationPreferences(user.id);
    res.json(prefs);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

notificationsRouter.put("/notification-preferences/:type", isAuthenticated, async (req, res) => {
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

// POST /api/notifications/check-expiring-quotes
notificationsRouter.post("/notifications/check-expiring-quotes", isAuthenticated, async (req, res) => {
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
    const cutoff = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

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

    const toNotify = expiring.filter(opp => {
      if (!opp.quoteReminderSnoozedUntil) return true;
      return new Date(opp.quoteReminderSnoozedUntil) < now;
    });

    // Bulk fetch: leads + existing notifications in 2 query parallele invece di N×2
    const leadIds = toNotify.map(o => o.leadId).filter(Boolean) as string[];
    const oppLinks = toNotify.map(o => `/opportunita?open=${o.id}`);

    const [leadsData, existingNotifs] = await Promise.all([
      leadIds.length > 0
        ? db.select({ id: leadsTable.id, name: leadsTable.name, firstName: leadsTable.firstName, lastName: leadsTable.lastName, entityType: leadsTable.entityType })
            .from(leadsTable)
            .where(inArray(leadsTable.id, leadIds))
        : Promise.resolve([]),
      oppLinks.length > 0
        ? db.select({ userId: notifications.userId, link: notifications.link })
            .from(notifications)
            .where(and(
              eq(notifications.type, "QUOTE_EXPIRING"),
              eq(notifications.isRead, false),
              inArray(notifications.link, oppLinks)
            ))
        : Promise.resolve([]),
    ]);

    const leadMap = new Map(leadsData.map(l => [l.id, l]));
    const alreadyNotified = new Set(existingNotifs.map(n => `${n.userId}:${n.link}`));

    const notificationsToCreate: Array<typeof notifications.$inferInsert> = [];

    for (const opp of toNotify) {
      const targetUserId = opp.assignedToUserId || userId;
      const link = `/opportunita?open=${opp.id}`;

      if (alreadyNotified.has(`${targetUserId}:${link}`)) continue;

      const daysAgo = Math.floor((now.getTime() - new Date(opp.quoteSentAt!).getTime()) / (24 * 60 * 60 * 1000));
      const lead = leadMap.get(opp.leadId);
      const clientName = lead
        ? (lead.entityType === "COMPANY" ? (lead.name || opp.title) : `${lead.firstName} ${lead.lastName}`.trim() || opp.title)
        : opp.title;

      notificationsToCreate.push({
        userId: targetUserId,
        companyId,
        type: "QUOTE_EXPIRING",
        title: "Preventivo in attesa da 60 giorni",
        message: `${clientName} — preventivo in attesa da ${daysAgo} giorni`,
        link,
        isRead: false,
      });
    }

    if (notificationsToCreate.length > 0) {
      await db.insert(notifications).values(notificationsToCreate);
    }

    res.json({ created: notificationsToCreate.length });
  } catch (error: any) {
    console.error("Error checking expiring quotes:", error);
    res.status(500).json({ message: error.message });
  }
});

// ============ SITE PHOTO SCHEDULER ============

async function runSitePhotoNotificationCheck(): Promise<{ sent: number; errors: number }> {
  let sent = 0;
  let errors = 0;
  try {
    const now = new Date();

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

    // Bulk fetch leads in 1 query invece di N query
    const claimedLeadIds = claimedOpps.map(o => o.leadId).filter(Boolean) as string[];
    const claimedLeadsData = claimedLeadIds.length > 0
      ? await db
          .select({ id: leadsTable.id, name: leadsTable.name, firstName: leadsTable.firstName, lastName: leadsTable.lastName, entityType: leadsTable.entityType })
          .from(leadsTable)
          .where(inArray(leadsTable.id, claimedLeadIds))
      : [];
    const claimedLeadMap = new Map(claimedLeadsData.map(l => [l.id, l]));

    for (const opp of claimedOpps) {
      try {
        const sq = opp.siteQuality;
        const notifType = sq === "PHOTO_VIDEO" ? "SITE_PHOTO_VIDEO" : "SITE_PHOTO";
        const notifTitle = sq === "PHOTO_VIDEO" ? "Cantiere da foto + video" : "Cantiere da foto";

        const lead = claimedLeadMap.get(opp.leadId);
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

// GET /api/notifications/check-site-photo — solo SUPER_ADMIN
notificationsRouter.get("/notifications/check-site-photo", isAuthenticated, requireRole("SUPER_ADMIN"), async (_req, res) => {
  try {
    const result = await runSitePhotoNotificationCheck();
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[photo-notification] Errore endpoint check:", error);
    res.status(500).json({ message: error.message });
  }
});

// Scheduler automatico: ogni 24 ore
setInterval(async () => {
  console.log("[photo-notification] Esecuzione check notifiche foto/video programmato...");
  const result = await runSitePhotoNotificationCheck();
  console.log(`[photo-notification] Check completato: ${result.sent} inviate, ${result.errors} errori`);
}, 24 * 60 * 60 * 1000);

// Check iniziale con ritardo di 30s per lasciar avviare il DB
setTimeout(async () => {
  console.log("[photo-notification] Check iniziale notifiche foto/video...");
  const result = await runSitePhotoNotificationCheck();
  console.log(`[photo-notification] Check iniziale completato: ${result.sent} inviate, ${result.errors} errori`);
}, 30_000);
