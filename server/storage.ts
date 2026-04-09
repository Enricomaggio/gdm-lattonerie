import { 
  companies, leads, userCompanies, users, pipelineStages, opportunities, activityLogs, invites, contactReferents, articles, quotes, quoteItems, projectStages, projects, projectTasks,
  workers, teams, drivers, vehicles, dailyAssignments, teamMembers, paymentMethods, leadSources, reminders, billingProfiles, notifications, notificationPreferences, clauseOverrides, salesTargets, externalEngineers, promoCodes, warehouseBalances,
  type Company, type InsertCompany,
  type Lead, type InsertLead,
  type UserCompany, type InsertUserCompany,
  type PipelineStage, type InsertPipelineStage,
  type Opportunity, type InsertOpportunity,
  type ActivityLog, type InsertActivityLog,
  type Invite, type InsertInvite,
  type ContactReferent, type InsertContactReferent,
  type Article, type InsertArticle,
  type Quote, type InsertQuote,
  type QuoteItem, type InsertQuoteItem,
  type ProjectStage, type InsertProjectStage,
  type Project, type InsertProject,
  type ProjectTask, type InsertProjectTask,
  type Worker, type InsertWorker,
  type Team, type InsertTeam,
  type Driver, type InsertDriver,
  type Vehicle, type InsertVehicle,
  type DailyAssignment, type InsertDailyAssignment,
  type TeamMember, type InsertTeamMember,
  type PaymentMethod, type InsertPaymentMethod,
  type LeadSource, type InsertLeadSource,
  type Reminder, type InsertReminder,
  type BillingProfile, type InsertBillingProfile,
  type AppNotification, type InsertNotification,
  type NotificationPreference, type InsertNotificationPreference,
  type ClauseOverride,
  type SalesTarget, type InsertSalesTarget,
  type ExternalEngineer, type InsertExternalEngineer,
  type PromoCode, type InsertPromoCode,
  type WarehouseBalance, type InsertWarehouseBalance,
  type UserRole, type UserStatus, type User,
  type ContactType, type EntityType, type ContactSource
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, or, isNull, gte, lte, sql, inArray, not } from "drizzle-orm";
import bcrypt from "bcryptjs";

// Parametri per il controllo accesso basato sui ruoli
export interface AccessContext {
  userId: string;
  role: UserRole;
  companyId: string | null;
}

// Tipo per company con conteggio utenti
export interface CompanyWithUserCount extends Company {
  userCount: number;
}

// Interfaccia per tutte le operazioni CRUD multi-tenant
export interface IStorage {
  // Companies
  getCompany(id: string): Promise<Company | undefined>;
  getAllCompanies(): Promise<Company[]>;
  getAllCompaniesWithUserCount(): Promise<CompanyWithUserCount[]>;
  createCompany(data: InsertCompany): Promise<Company>;
  updateCompany(id: string, data: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompanyWithCascade(id: string): Promise<boolean>;
  
  // Leads con controllo accesso basato sui ruoli
  getLeadsWithAccess(ctx: AccessContext): Promise<Lead[]>;
  getLeadWithAccess(id: string, ctx: AccessContext): Promise<Lead | undefined>;
  createLead(data: InsertLead): Promise<Lead>;
  updateLeadWithAccess(id: string, ctx: AccessContext, data: Partial<InsertLead>): Promise<Lead | undefined>;
  propagateAssignedUserToOpportunities(leadId: string, assignedToUserId: string): Promise<number>;
  syncOpportunityAssignments(companyId?: string): Promise<number>;
  deleteLeadWithAccess(id: string, ctx: AccessContext): Promise<boolean>;
  
  // Legacy methods per compatibilità
  getLeadsByCompany(companyId: string): Promise<Lead[]>;
  getLead(id: string, companyId: string): Promise<Lead | undefined>;
  updateLead(id: string, companyId: string, data: Partial<InsertLead>): Promise<Lead | undefined>;
  deleteLead(id: string, companyId: string): Promise<boolean>;
  
  // User-Company associations
  getUserCompany(userId: string): Promise<UserCompany | undefined>;
  getUserCompanyByCompanyId(companyId: string): Promise<UserCompany[]>;
  createUserCompany(data: InsertUserCompany): Promise<UserCompany>;
  
  // Transazioni atomiche
  createCompanyWithAdmin(companyData: InsertCompany, adminData: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }): Promise<{ company: Company; admin: User }>;
  
  // Team Management (utenti per azienda)
  getUsersByCompanyId(companyId: string): Promise<User[]>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  createUserWithCompany(userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: UserRole;
  }, companyId: string): Promise<User>;
  updateUserRole(userId: string, role: UserRole): Promise<User | undefined>;
  updateUserStatus(userId: string, status: UserStatus): Promise<User | undefined>;
  updateUserProfile(userId: string, data: { displayName?: string; contactEmail?: string; phone?: string; profileImageUrl?: string }): Promise<User | undefined>;
  
  // Invites
  createInvite(data: InsertInvite): Promise<Invite>;
  getInviteByToken(token: string): Promise<Invite | undefined>;
  getInviteByEmail(email: string, companyId: string): Promise<Invite | undefined>;
  deleteInvite(id: string): Promise<boolean>;
  deleteExpiredInvites(): Promise<number>;
  
  // Pipeline Stages
  getStagesByCompany(companyId: string): Promise<PipelineStage[]>;
  getStage(id: string, companyId: string): Promise<PipelineStage | undefined>;
  createStage(data: InsertPipelineStage): Promise<PipelineStage>;
  updateStage(id: string, companyId: string, data: Partial<{ name: string; order: number; color: string }>): Promise<PipelineStage | undefined>;
  deleteStage(id: string, companyId: string): Promise<boolean>;
  reorderStages(companyId: string, stageIds: string[]): Promise<void>;

  // Contact Referents (referenti aziendali)
  getReferentsByContactId(contactId: string): Promise<ContactReferent[]>;
  getReferent(id: string): Promise<ContactReferent | undefined>;
  createReferent(data: InsertContactReferent): Promise<ContactReferent>;
  updateReferent(id: string, data: Partial<InsertContactReferent>): Promise<ContactReferent | undefined>;
  deleteReferent(id: string): Promise<boolean>;
  
  // Articles (Listino per Preventivatore)
  getArticlesByCompany(companyId: string, checklistOnly?: boolean): Promise<Article[]>;
  getArticle(id: string, companyId: string): Promise<Article | undefined>;
  createArticle(data: InsertArticle): Promise<Article>;
  updateArticle(id: string, companyId: string, data: Partial<InsertArticle>): Promise<Article | undefined>;
  deleteArticle(id: string, companyId: string): Promise<boolean>;
  
  // Quotes (Preventivi)
  getQuotesByOpportunity(opportunityId: string, companyId: string): Promise<Quote[]>;
  getQuote(id: string, companyId: string): Promise<Quote | undefined>;
  createQuote(data: InsertQuote): Promise<Quote>;
  createQuoteWithNextNumber(data: Omit<InsertQuote, 'number'>, customNumber?: string): Promise<Quote>;
  updateQuote(id: string, companyId: string, data: Partial<InsertQuote>): Promise<Quote | undefined>;
  deleteQuote(id: string, companyId: string): Promise<boolean>;
  
  // Quote Items (Righe Preventivo)
  getQuoteItems(quoteId: string): Promise<QuoteItem[]>;
  getQuoteItem(id: string, quoteId: string): Promise<QuoteItem | undefined>;
  createQuoteItem(data: InsertQuoteItem): Promise<QuoteItem>;
  createQuoteItems(data: InsertQuoteItem[]): Promise<QuoteItem[]>;
  updateQuoteItem(id: string, quoteId: string, data: { unitPriceApplied?: string; quantity?: string; totalRow?: string }): Promise<QuoteItem | undefined>;
  deleteQuoteItems(quoteId: string): Promise<boolean>;
  
  // Project Stages (Fasi workflow progetti)
  getProjectStagesByCompany(companyId: string): Promise<ProjectStage[]>;
  createProjectStage(data: InsertProjectStage): Promise<ProjectStage>;
  updateProjectStage(id: string, companyId: string, data: Partial<InsertProjectStage>): Promise<ProjectStage | undefined>;
  deleteProjectStage(id: string, companyId: string): Promise<boolean>;
  reorderProjectStages(companyId: string, stageIds: string[]): Promise<void>;
  
  // External Engineers (Ingegneri Esterni RDC)
  getExternalEngineersByCompany(companyId: string): Promise<ExternalEngineer[]>;
  getExternalEngineer(id: string, companyId: string): Promise<ExternalEngineer | undefined>;
  createExternalEngineer(data: InsertExternalEngineer): Promise<ExternalEngineer>;
  updateExternalEngineer(id: string, companyId: string, data: Partial<InsertExternalEngineer>): Promise<ExternalEngineer | undefined>;
  deleteExternalEngineer(id: string, companyId: string): Promise<boolean>;
  
  // Projects (Commesse)
  getProjectsByCompany(companyId: string): Promise<Project[]>;
  getUsersByIds(ids: string[]): Promise<User[]>;
  getOpportunitiesByIds(ids: string[], companyId: string): Promise<Opportunity[]>;
  getQuotesByOpportunityIds(opportunityIds: string[], companyId: string): Promise<Quote[]>;
  getDailyAssignmentsByProjectIds(projectIds: string[], companyId: string): Promise<DailyAssignment[]>;
  getProject(id: string, companyId: string): Promise<Project | undefined>;
  getProjectByOpportunity(opportunityId: string, companyId: string): Promise<Project | undefined>;
  createProject(data: InsertProject): Promise<Project>;
  updateProject(id: string, companyId: string, data: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string, companyId: string): Promise<boolean>;
  
  // Project Tasks (Attività Gantt)
  getProjectTasksByProject(projectId: string, companyId: string): Promise<ProjectTask[]>;
  getProjectTask(id: string, companyId: string): Promise<ProjectTask | undefined>;
  createProjectTask(data: InsertProjectTask): Promise<ProjectTask>;
  updateProjectTask(id: string, companyId: string, data: Partial<InsertProjectTask>): Promise<ProjectTask | undefined>;
  deleteProjectTask(id: string, companyId: string): Promise<boolean>;
  
  // Workers (Persone - Proxit)
  getWorkersByCompany(companyId: string): Promise<Worker[]>;
  getWorker(id: string, companyId: string): Promise<Worker | undefined>;
  createWorker(data: InsertWorker): Promise<Worker>;
  updateWorker(id: string, companyId: string, data: Partial<InsertWorker>): Promise<Worker | undefined>;
  deleteWorker(id: string, companyId: string): Promise<boolean>;

  // Teams (Squadre - Proxit)
  getTeamsByCompany(companyId: string): Promise<Team[]>;
  getTeam(id: string, companyId: string): Promise<Team | undefined>;
  createTeam(data: InsertTeam): Promise<Team>;
  updateTeam(id: string, companyId: string, data: Partial<InsertTeam>): Promise<Team | undefined>;
  deleteTeam(id: string, companyId: string): Promise<boolean>;
  
  // Team Members (Componenti squadre - Proxit)
  getTeamMembersByTeam(teamId: string, companyId: string): Promise<TeamMember[]>;
  getTeamMembersByCompany(companyId: string): Promise<TeamMember[]>;
  createTeamMember(data: InsertTeamMember): Promise<TeamMember>;
  updateTeamMember(id: string, companyId: string, data: Pick<Partial<InsertTeamMember>, "name" | "isActive">): Promise<TeamMember | undefined>;
  deleteTeamMember(id: string, companyId: string): Promise<boolean>;
  
  // Drivers (Autisti - Proxit)
  getDriversByCompany(companyId: string): Promise<Driver[]>;
  getDriver(id: string, companyId: string): Promise<Driver | undefined>;
  createDriver(data: InsertDriver): Promise<Driver>;
  updateDriver(id: string, companyId: string, data: Partial<InsertDriver>): Promise<Driver | undefined>;
  deleteDriver(id: string, companyId: string): Promise<boolean>;
  
  // Vehicles (Mezzi - Proxit)
  getVehiclesByCompany(companyId: string): Promise<Vehicle[]>;
  getVehicle(id: string, companyId: string): Promise<Vehicle | undefined>;
  createVehicle(data: InsertVehicle): Promise<Vehicle>;
  updateVehicle(id: string, companyId: string, data: Partial<InsertVehicle>): Promise<Vehicle | undefined>;
  deleteVehicle(id: string, companyId: string): Promise<boolean>;
  
  // Daily Assignments (Assegnazioni - Proxit)
  getDailyAssignmentsByDateRange(companyId: string, startDate: Date, endDate: Date): Promise<DailyAssignment[]>;
  getDailyAssignmentsByProjectId(projectId: string, companyId: string): Promise<DailyAssignment[]>;
  getDailyAssignment(id: string, companyId: string): Promise<DailyAssignment | undefined>;
  createDailyAssignment(data: InsertDailyAssignment): Promise<DailyAssignment>;
  updateDailyAssignment(id: string, companyId: string, data: Partial<InsertDailyAssignment>): Promise<DailyAssignment | undefined>;
  deleteDailyAssignment(id: string, companyId: string): Promise<boolean>;
  reorderDailyAssignments(companyId: string, idA: string, idB: string): Promise<boolean>;
  moveDailyAssignmentToIndex(companyId: string, id: string, toIndex: number, prePadding?: number): Promise<boolean>;
  moveDailyAssignmentToDay(companyId: string, id: string, targetDate: Date, toIndex: number, prePadding?: number): Promise<boolean>;
  getNextSortOrderForDay(companyId: string, date: Date): Promise<number>;
  updateDailyAssignmentPrePadding(companyId: string, id: string, delta: number): Promise<DailyAssignment | undefined>;
  
  // Payment Methods (Modalità di pagamento)
  getPaymentMethodsByCompany(companyId: string): Promise<PaymentMethod[]>;
  getPaymentMethod(id: string, companyId: string): Promise<PaymentMethod | undefined>;
  createPaymentMethod(data: InsertPaymentMethod): Promise<PaymentMethod>;
  updatePaymentMethod(id: string, companyId: string, data: Partial<InsertPaymentMethod>): Promise<PaymentMethod | undefined>;
  deletePaymentMethod(id: string, companyId: string): Promise<boolean>;
  
  // Lead Sources (Provenienze)
  getLeadSourcesByCompany(companyId: string): Promise<LeadSource[]>;
  createLeadSource(data: InsertLeadSource): Promise<LeadSource>;
  updateLeadSource(id: string, companyId: string, data: Partial<InsertLeadSource>): Promise<LeadSource | undefined>;
  deleteLeadSource(id: string, companyId: string): Promise<boolean>;

  // Reminders (Promemoria)
  getRemindersByUser(userId: string, companyId: string, filters?: { dueBefore?: Date; dueAfter?: Date; completed?: boolean }): Promise<Reminder[]>;
  getRemindersByLead(leadId: string, companyId: string): Promise<Reminder[]>;
  getRemindersByOpportunity(opportunityId: string, companyId: string): Promise<Reminder[]>;
  getOpportunitiesWithActiveManualReminders(companyId: string): Promise<string[]>;
  getReminder(id: string, companyId: string): Promise<Reminder | undefined>;
  createReminder(data: InsertReminder): Promise<Reminder>;
  updateReminder(id: string, companyId: string, data: Partial<InsertReminder & { completedAt: Date | null }>): Promise<Reminder | undefined>;
  deleteReminder(id: string, companyId: string): Promise<boolean>;
  
  // Billing Profiles (Profili di fatturazione)
  getBillingProfilesByCompany(companyId: string): Promise<BillingProfile[]>;
  getBillingProfileByType(companyId: string, profileType: "PRIVATE" | "PUBLIC"): Promise<BillingProfile | undefined>;
  getBillingProfile(id: string, companyId: string): Promise<BillingProfile | undefined>;
  createBillingProfile(data: InsertBillingProfile): Promise<BillingProfile>;
  updateBillingProfile(id: string, companyId: string, data: Partial<InsertBillingProfile>): Promise<BillingProfile | undefined>;
  deleteBillingProfile(id: string, companyId: string): Promise<boolean>;

  // Notifications
  getNotifications(userId: string): Promise<AppNotification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  createNotification(data: InsertNotification): Promise<AppNotification>;
  markNotificationRead(id: string, userId: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  createNotificationsForCompanyRoles(companyId: string, roles: string[], data: Omit<InsertNotification, 'userId' | 'companyId'>): Promise<void>;

  // Notification Preferences
  getNotificationPreferences(userId: string): Promise<NotificationPreference[]>;
  setNotificationPreference(userId: string, notificationType: string, enabled: boolean): Promise<void>;

  // Clause Overrides (Testi personalizzati clausole Step 4)
  getClauseOverridesByCompany(companyId: string): Promise<ClauseOverride[]>;
  upsertClauseOverride(companyId: string, clauseId: string, text: string): Promise<ClauseOverride>;
  deleteClauseOverride(companyId: string, clauseId: string): Promise<boolean>;

  // Dashboard: vinti per anno (12 mesi x 3 anni)
  getWonByMonth(companyId: string, currentYear: number, vintoStageId: string, sellerUserId?: string): Promise<{ currentYear: number[]; lastYear: number[]; twoYearsAgo: number[] }>;

  // Sales Targets (Obiettivi mensili per venditore)
  getSalesTargets(companyId: string, month: number, year: number): Promise<SalesTarget[]>;
  getSalesTargetsForRange(companyId: string, startDate: Date, endDate: Date): Promise<SalesTarget[]>;
  getSalesTarget(companyId: string, userId: string, month: number, year: number): Promise<SalesTarget | undefined>;
  upsertSalesTarget(data: InsertSalesTarget): Promise<SalesTarget>;

  // Promo Codes
  getPromoCodesByCompany(companyId: string): Promise<PromoCode[]>;
  getActivePromoCodes(companyId: string): Promise<PromoCode[]>;
  getPromoCode(id: string, companyId: string): Promise<PromoCode | undefined>;
  createPromoCode(data: InsertPromoCode): Promise<PromoCode>;
  updatePromoCode(id: string, companyId: string, data: Partial<InsertPromoCode>): Promise<PromoCode | undefined>;
  deletePromoCode(id: string, companyId: string): Promise<boolean>;

  // Warehouse Balances
  getWarehouseBalances(companyId: string): Promise<WarehouseBalance[]>;
  upsertWarehouseBalance(companyId: string, warehouseType: "VILLA" | "PL" | "EP", date: Date | null, value: number): Promise<WarehouseBalance>;
  deleteWarehouseBalance(companyId: string, warehouseType: "VILLA" | "PL" | "EP", date: Date | null): Promise<void>;
}

// Storage con PostgreSQL e isolamento multi-tenant
export class DatabaseStorage implements IStorage {
  // Companies
  async getCompany(id: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company || undefined;
  }

  async getAllCompanies(): Promise<Company[]> {
    return db.select().from(companies).orderBy(companies.name);
  }

  async getAllCompaniesWithUserCount(): Promise<CompanyWithUserCount[]> {
    const allCompanies = await db.select().from(companies).orderBy(desc(companies.createdAt));
    
    // Per ogni company, conta gli utenti associati
    const companiesWithCount = await Promise.all(
      allCompanies.map(async (company) => {
        const userCompanyList = await db
          .select()
          .from(userCompanies)
          .where(eq(userCompanies.companyId, company.id));
        
        return {
          ...company,
          userCount: userCompanyList.length,
        };
      })
    );
    
    return companiesWithCount;
  }

  async createCompany(data: InsertCompany): Promise<Company> {
    const [company] = await db.insert(companies).values(data).returning();
    return company;
  }

  async updateCompany(id: string, data: Partial<InsertCompany>): Promise<Company | undefined> {
    const [company] = await db
      .update(companies)
      .set(data)
      .where(eq(companies.id, id))
      .returning();
    return company || undefined;
  }

  // Elimina azienda con cascade: utenti associati, lead, opportunities, e associazioni user_companies
  // SICUREZZA: Nel nostro schema, ogni utente appartiene a UNA SOLA azienda (UNIQUE su userId in userCompanies)
  // IMPORTANTE: I SUPER_ADMIN non vengono mai eliminati per proteggere l'accesso al sistema
  async deleteCompanyWithCascade(id: string): Promise<boolean> {
    return await db.transaction(async (tx) => {
      // 1. Recupera tutti gli userId associati a questa company con i loro ruoli
      const userCompanyList = await tx
        .select({
          userId: userCompanies.userId,
          role: users.role,
        })
        .from(userCompanies)
        .innerJoin(users, eq(userCompanies.userId, users.id))
        .where(eq(userCompanies.companyId, id));
      
      // Filtra: elimina solo utenti NON SUPER_ADMIN
      const userIdsToDelete = userCompanyList
        .filter((uc) => uc.role !== "SUPER_ADMIN")
        .map((uc) => uc.userId);

      // 2. Elimina le opportunities dell'azienda
      await tx.delete(opportunities).where(eq(opportunities.companyId, id));

      // 3. Elimina i lead dell'azienda (rimuove anche le FK su assignedToUserId)
      await tx.delete(leads).where(eq(leads.companyId, id));

      // 4. Elimina le associazioni user_companies (tutte, anche SUPER_ADMIN se associato)
      await tx.delete(userCompanies).where(eq(userCompanies.companyId, id));

      // 5. Elimina solo gli utenti NON SUPER_ADMIN
      for (const userId of userIdsToDelete) {
        await tx.delete(users).where(eq(users.id, userId));
      }

      // 6. Elimina la company
      const result = await tx.delete(companies).where(eq(companies.id, id)).returning();
      
      return result.length > 0;
    });
  }

  // Leads con controllo accesso basato sui ruoli
  async getLeadsWithAccess(ctx: AccessContext): Promise<Lead[]> {
    const { userId, role, companyId } = ctx;

    // SUPER_ADMIN: vede tutti i lead di tutte le aziende
    if (role === "SUPER_ADMIN") {
      return db.select().from(leads).orderBy(desc(leads.createdAt));
    }

    // TECHNICIAN: non può accedere ai lead
    if (role === "TECHNICIAN") {
      return [];
    }

    // Se non ha un companyId, non può vedere nulla
    if (!companyId) {
      return [];
    }

    // COMPANY_ADMIN: vede tutti i lead della sua azienda
    if (role === "COMPANY_ADMIN") {
      return db
        .select()
        .from(leads)
        .where(eq(leads.companyId, companyId))
        .orderBy(desc(leads.createdAt));
    }

    // SALES_AGENT: vede solo i lead assegnati a lui
    if (role === "SALES_AGENT") {
      return db
        .select()
        .from(leads)
        .where(
          and(
            eq(leads.companyId, companyId),
            eq(leads.assignedToUserId, userId)
          )
        )
        .orderBy(desc(leads.createdAt));
    }

    return [];
  }

  async getLeadWithAccess(id: string, ctx: AccessContext): Promise<Lead | undefined> {
    const { userId, role, companyId } = ctx;

    // SUPER_ADMIN: può accedere a qualsiasi lead
    if (role === "SUPER_ADMIN") {
      const [lead] = await db.select().from(leads).where(eq(leads.id, id));
      return lead || undefined;
    }

    // TECHNICIAN: non può accedere ai lead
    if (role === "TECHNICIAN") {
      return undefined;
    }

    if (!companyId) {
      return undefined;
    }

    // COMPANY_ADMIN: può accedere a qualsiasi lead della sua azienda
    if (role === "COMPANY_ADMIN") {
      const [lead] = await db
        .select()
        .from(leads)
        .where(and(eq(leads.id, id), eq(leads.companyId, companyId)));
      return lead || undefined;
    }

    // SALES_AGENT: solo lead assegnati a lui
    if (role === "SALES_AGENT") {
      const [lead] = await db
        .select()
        .from(leads)
        .where(
          and(
            eq(leads.id, id),
            eq(leads.companyId, companyId),
            eq(leads.assignedToUserId, userId)
          )
        );
      return lead || undefined;
    }

    return undefined;
  }

  async updateLeadWithAccess(id: string, ctx: AccessContext, data: Partial<InsertLead>): Promise<Lead | undefined> {
    // Prima verifica che l'utente abbia accesso al lead
    const lead = await this.getLeadWithAccess(id, ctx);
    if (!lead) {
      return undefined;
    }

    // SICUREZZA: Non permettere mai la modifica di companyId tramite update
    // Rimuovi companyId dal payload per impedire tenant-hopping
    const { companyId: _, ...safeData } = data;
    
    const updateData: Record<string, unknown> = { ...safeData, updatedAt: new Date() };
    const [updatedLead] = await db
      .update(leads)
      .set(updateData)
      .where(eq(leads.id, id))
      .returning();
    return updatedLead || undefined;
  }

  async propagateAssignedUserToOpportunities(leadId: string, assignedToUserId: string): Promise<number> {
    const result = await db
      .update(opportunities)
      .set({ assignedToUserId, updatedAt: new Date() })
      .where(eq(opportunities.leadId, leadId))
      .returning();
    return result.length;
  }

  async syncOpportunityAssignments(companyId?: string): Promise<number> {
    const opportunityPattern = /^\d+-\d{4}$/;

    const conditions = [isNull(opportunities.assignedToUserId)];
    if (companyId) {
      conditions.push(eq(opportunities.companyId, companyId));
    }

    const nullOpps = await db
      .select({
        id: opportunities.id,
        title: opportunities.title,
        leadId: opportunities.leadId,
      })
      .from(opportunities)
      .where(and(...conditions));

    const toUpdate = nullOpps.filter(o => opportunityPattern.test(o.title ?? ""));

    if (toUpdate.length === 0) return 0;

    const leadIds = Array.from(new Set(toUpdate.map(o => o.leadId)));

    const leadsData = await db
      .select({ id: leads.id, assignedToUserId: leads.assignedToUserId })
      .from(leads)
      .where(inArray(leads.id, leadIds));

    const leadMap = new Map(leadsData.map(l => [l.id, l.assignedToUserId]));

    let updated = 0;
    for (const opp of toUpdate) {
      const assignedUserId = leadMap.get(opp.leadId);
      if (!assignedUserId) continue;

      await db
        .update(opportunities)
        .set({ assignedToUserId: assignedUserId, updatedAt: new Date() })
        .where(eq(opportunities.id, opp.id));
      updated++;
    }

    return updated;
  }

  async deleteLeadWithAccess(id: string, ctx: AccessContext): Promise<boolean> {
    const lead = await this.getLeadWithAccess(id, ctx);
    if (!lead) {
      return false;
    }

    const leadOpportunities = await db.select({ id: opportunities.id }).from(opportunities).where(eq(opportunities.leadId, id));
    for (const opp of leadOpportunities) {
      await db.delete(quoteItems).where(
        sql`${quoteItems.quoteId} IN (SELECT id FROM quotes WHERE opportunity_id = ${opp.id})`
      );
      await db.delete(quotes).where(eq(quotes.opportunityId, opp.id));
    }
    await db.delete(opportunities).where(eq(opportunities.leadId, id));

    await db.execute(sql`DELETE FROM creditsafe_reports WHERE lead_id = ${id}`);

    await db.delete(activityLogs).where(
      and(eq(activityLogs.entityType, "lead"), eq(activityLogs.entityId, id))
    );

    const result = await db.delete(leads).where(eq(leads.id, id)).returning();
    return result.length > 0;
  }

  // Legacy methods per compatibilità
  async getLeadsByCompany(companyId: string): Promise<Lead[]> {
    return db
      .select()
      .from(leads)
      .where(eq(leads.companyId, companyId))
      .orderBy(desc(leads.createdAt));
  }

  async getLead(id: string, companyId: string): Promise<Lead | undefined> {
    const [lead] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, id), eq(leads.companyId, companyId)));
    return lead || undefined;
  }

  async createLead(data: InsertLead): Promise<Lead> {
    const insertData = {
      // Dati anagrafici
      name: data.name,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      
      // Tipo entità e classificazione
      entityType: (data.entityType || "COMPANY") as EntityType,
      type: (data.type || "lead") as ContactType,
      
      // Indirizzo
      address: data.address,
      city: data.city,
      zipCode: data.zipCode,
      province: data.province,
      country: data.country || "Italia",
      
      // Dati fiscali
      vatNumber: data.vatNumber,
      fiscalCode: data.fiscalCode,
      sdiCode: data.sdiCode,
      pecEmail: data.pecEmail,
      
      // Provenienza e assegnazione
      source: data.source as ContactSource | undefined,
      notes: data.notes,
      companyId: data.companyId,
      assignedToUserId: data.assignedToUserId,
      
      // Brochure
      brochureSent: data.brochureSent ?? false,
    };
    const [lead] = await db.insert(leads).values(insertData).returning();
    return lead;
  }

  async updateLead(id: string, companyId: string, data: Partial<InsertLead>): Promise<Lead | undefined> {
    const updateData: Record<string, unknown> = { ...data, updatedAt: new Date() };
    const [lead] = await db
      .update(leads)
      .set(updateData)
      .where(and(eq(leads.id, id), eq(leads.companyId, companyId)))
      .returning();
    return lead || undefined;
  }

  async deleteLead(id: string, companyId: string): Promise<boolean> {
    const result = await db
      .delete(leads)
      .where(and(eq(leads.id, id), eq(leads.companyId, companyId)))
      .returning();
    return result.length > 0;
  }

  // User-Company associations
  async getUserCompany(userId: string): Promise<UserCompany | undefined> {
    const [userCompany] = await db
      .select()
      .from(userCompanies)
      .where(eq(userCompanies.userId, userId));
    return userCompany || undefined;
  }

  async getUserCompanyByCompanyId(companyId: string): Promise<UserCompany[]> {
    return db
      .select()
      .from(userCompanies)
      .where(eq(userCompanies.companyId, companyId));
  }

  async createUserCompany(data: InsertUserCompany): Promise<UserCompany> {
    // Usa onConflictDoNothing per evitare duplicati in caso di race condition
    const [userCompany] = await db
      .insert(userCompanies)
      .values(data)
      .onConflictDoNothing({ target: userCompanies.userId })
      .returning();
    
    // Se onConflictDoNothing ha saltato l'insert, recupera il record esistente
    if (!userCompany) {
      const existing = await this.getUserCompany(data.userId);
      if (existing) return existing;
      throw new Error("Failed to create or retrieve user company");
    }
    
    return userCompany;
  }

  // Transazione atomica: crea company + admin + associazione
  async createCompanyWithAdmin(
    companyData: InsertCompany, 
    adminData: {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
    }
  ): Promise<{ company: Company; admin: User }> {
    return await db.transaction(async (tx) => {
      // 1. Crea la company
      const [company] = await tx.insert(companies).values(companyData).returning();
      
      // 2. Hash della password e creazione utente admin
      const hashedPassword = await bcrypt.hash(adminData.password, 12);
      const [admin] = await tx.insert(users).values({
        email: adminData.email.toLowerCase(),
        password: hashedPassword,
        firstName: adminData.firstName,
        lastName: adminData.lastName,
        role: "COMPANY_ADMIN" as const,
      }).returning();
      
      // 3. Associa l'utente alla company
      await tx.insert(userCompanies).values({
        userId: admin.id,
        companyId: company.id,
      });
      
      // 4. Crea le fasi di default della pipeline
      const defaultStages: { name: string; order: number; color: string }[] = [
        { name: "Nuovo Lead", order: 1, color: "#61CE85" },
        { name: "Contattato", order: 2, color: "#4563FF" },
        { name: "Sopralluogo da fare", order: 3, color: "#F59E0B" },
        { name: "Preventivo da Inviare", order: 4, color: "#EC4899" },
        { name: "Preventivo Inviato", order: 5, color: "#8B5CF6" },
        { name: "Vinto", order: 6, color: "#059669" },
        { name: "Perso", order: 7, color: "#EF4444" },
      ];
      
      await tx.insert(pipelineStages).values(
        defaultStages.map(stage => ({
          name: stage.name,
          order: stage.order,
          color: stage.color,
          companyId: company.id,
        }))
      );
      
      return { company, admin };
    });
  }
  
  // Pipeline Stages
  async getStagesByCompany(companyId: string): Promise<PipelineStage[]> {
    return db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.companyId, companyId))
      .orderBy(pipelineStages.order);
  }
  
  async getStage(id: string, companyId: string): Promise<PipelineStage | undefined> {
    const [stage] = await db
      .select()
      .from(pipelineStages)
      .where(and(eq(pipelineStages.id, id), eq(pipelineStages.companyId, companyId)));
    return stage || undefined;
  }

  async createStage(data: InsertPipelineStage): Promise<PipelineStage> {
    const [stage] = await db.insert(pipelineStages).values(data).returning();
    return stage;
  }

  async updateStage(id: string, companyId: string, data: Partial<{ name: string; order: number; color: string }>): Promise<PipelineStage | undefined> {
    const [stage] = await db
      .update(pipelineStages)
      .set(data)
      .where(and(eq(pipelineStages.id, id), eq(pipelineStages.companyId, companyId)))
      .returning();
    return stage || undefined;
  }

  async deleteStage(id: string, companyId: string): Promise<boolean> {
    const result = await db
      .delete(pipelineStages)
      .where(and(eq(pipelineStages.id, id), eq(pipelineStages.companyId, companyId)))
      .returning();
    return result.length > 0;
  }

  async reorderStages(companyId: string, stageIds: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (let i = 0; i < stageIds.length; i++) {
        await tx
          .update(pipelineStages)
          .set({ order: i + 1 })
          .where(and(eq(pipelineStages.id, stageIds[i]), eq(pipelineStages.companyId, companyId)));
      }
    });
  }
  
  // ============ OPPORTUNITIES ============
  
  async getOpportunitiesWithAccess(ctx: AccessContext): Promise<Opportunity[]> {
    const { userId, role, companyId } = ctx;

    // SUPER_ADMIN: vede tutte le opportunità
    if (role === "SUPER_ADMIN") {
      return db.select().from(opportunities).orderBy(desc(opportunities.createdAt));
    }

    // TECHNICIAN: non può accedere alle opportunità
    if (role === "TECHNICIAN") {
      return [];
    }

    // Se non ha un companyId, non può vedere nulla
    if (!companyId) {
      return [];
    }

    // COMPANY_ADMIN: vede tutte le opportunità della sua azienda
    if (role === "COMPANY_ADMIN") {
      return db
        .select()
        .from(opportunities)
        .where(eq(opportunities.companyId, companyId))
        .orderBy(desc(opportunities.createdAt));
    }

    // SALES_AGENT: vede solo le opportunità assegnate a lui
    if (role === "SALES_AGENT") {
      return db
        .select()
        .from(opportunities)
        .where(
          and(
            eq(opportunities.companyId, companyId),
            eq(opportunities.assignedToUserId, userId)
          )
        )
        .orderBy(desc(opportunities.createdAt));
    }

    return [];
  }

  async getOpportunitiesByCompany(companyId: string): Promise<Opportunity[]> {
    return db
      .select()
      .from(opportunities)
      .where(eq(opportunities.companyId, companyId))
      .orderBy(desc(opportunities.createdAt));
  }

  async getOpportunitiesByLeadWithAccess(leadId: string, ctx: AccessContext): Promise<Opportunity[]> {
    const { userId, role, companyId } = ctx;

    // TECHNICIAN: non può accedere
    if (role === "TECHNICIAN" || !companyId) {
      return [];
    }

    // COMPANY_ADMIN: vede tutte le opportunità del lead
    if (role === "COMPANY_ADMIN" || role === "SUPER_ADMIN") {
      return db
        .select()
        .from(opportunities)
        .where(and(eq(opportunities.leadId, leadId), eq(opportunities.companyId, companyId)))
        .orderBy(desc(opportunities.createdAt));
    }

    // SALES_AGENT: vede solo le opportunità del lead assegnate a lui
    if (role === "SALES_AGENT") {
      return db
        .select()
        .from(opportunities)
        .where(
          and(
            eq(opportunities.leadId, leadId),
            eq(opportunities.companyId, companyId),
            eq(opportunities.assignedToUserId, userId)
          )
        )
        .orderBy(desc(opportunities.createdAt));
    }

    return [];
  }

  async getOpportunitiesByLead(leadId: string, companyId: string): Promise<Opportunity[]> {
    return db
      .select()
      .from(opportunities)
      .where(and(eq(opportunities.leadId, leadId), eq(opportunities.companyId, companyId)))
      .orderBy(desc(opportunities.createdAt));
  }

  async getOpportunity(id: string, companyId: string): Promise<Opportunity | undefined> {
    const [opp] = await db
      .select()
      .from(opportunities)
      .where(and(eq(opportunities.id, id), eq(opportunities.companyId, companyId)));
    return opp || undefined;
  }

  async createOpportunity(data: InsertOpportunity): Promise<Opportunity> {
    const [opp] = await db.insert(opportunities).values(data).returning();
    return opp;
  }

  async updateOpportunity(id: string, companyId: string, data: Partial<InsertOpportunity> & { wonAt?: Date; lostAt?: Date; quoteSentAt?: Date; quoteReminderSnoozedUntil?: Date | null; photoNotificationScheduledAt?: Date | null; photoNotificationSentAt?: Date | null }): Promise<Opportunity | undefined> {
    // SICUREZZA: Non permettere mai la modifica di companyId tramite update
    // wonAt e lostAt sono gestiti solo internamente e non possono essere sovrascritti tramite update normale
    const { companyId: _, wonAt: _wonAt, lostAt: _lostAt, quoteSentAt: _quoteSentAt, quoteReminderSnoozedUntil: _quoteReminderSnoozedUntil, photoNotificationScheduledAt: _photoNotificationScheduledAt, photoNotificationSentAt: _photoNotificationSentAt, ...safeData } = data;
    const updateData: Record<string, unknown> = { ...safeData, updatedAt: new Date() };
    // Permetti impostazione di wonAt/lostAt/quoteSentAt/quoteReminderSnoozedUntil solo quando esplicitamente passato dall'interno (non da client)
    if (_wonAt !== undefined) updateData.wonAt = _wonAt;
    if (_lostAt !== undefined) updateData.lostAt = _lostAt;
    if (_quoteSentAt !== undefined) updateData.quoteSentAt = _quoteSentAt;
    if (_quoteReminderSnoozedUntil !== undefined) updateData.quoteReminderSnoozedUntil = _quoteReminderSnoozedUntil;
    if (_photoNotificationScheduledAt !== undefined) updateData.photoNotificationScheduledAt = _photoNotificationScheduledAt;
    if (_photoNotificationSentAt !== undefined) updateData.photoNotificationSentAt = _photoNotificationSentAt;
    const [opp] = await db
      .update(opportunities)
      .set(updateData)
      .where(and(eq(opportunities.id, id), eq(opportunities.companyId, companyId)))
      .returning();
    return opp || undefined;
  }

  async deleteOpportunity(id: string, companyId: string): Promise<boolean> {
    const relatedProjects = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.opportunityId, id), eq(projects.companyId, companyId)));

    for (const proj of relatedProjects) {
      await db.delete(dailyAssignments)
        .where(and(eq(dailyAssignments.projectId, proj.id), eq(dailyAssignments.companyId, companyId)));
      await db.delete(projectTasks)
        .where(and(eq(projectTasks.projectId, proj.id), eq(projectTasks.companyId, companyId)));
    }

    await db.delete(projects)
      .where(and(eq(projects.opportunityId, id), eq(projects.companyId, companyId)));

    const relatedQuotes = await db.select({ id: quotes.id }).from(quotes)
      .where(and(eq(quotes.opportunityId, id), eq(quotes.companyId, companyId)));

    for (const q of relatedQuotes) {
      await db.delete(quoteItems).where(eq(quoteItems.quoteId, q.id));
    }

    await db.delete(quotes)
      .where(and(eq(quotes.opportunityId, id), eq(quotes.companyId, companyId)));

    await db.delete(reminders)
      .where(and(eq(reminders.opportunityId, id), eq(reminders.companyId, companyId)));

    await db.delete(activityLogs)
      .where(and(eq(activityLogs.entityId, id), eq(activityLogs.entityType, "opportunity"), eq(activityLogs.companyId, companyId)));

    const result = await db
      .delete(opportunities)
      .where(and(eq(opportunities.id, id), eq(opportunities.companyId, companyId)))
      .returning();
    return result.length > 0;
  }

  async moveOpportunityToStage(opportunityId: string, stageId: string, companyId: string): Promise<Opportunity | undefined> {
    // Verifica che lo stage esista e appartenga alla stessa company
    const stage = await this.getStage(stageId, companyId);
    if (!stage) {
      return undefined;
    }

    const now = new Date();
    const updateFields: Record<string, unknown> = { stageId, updatedAt: now };

    if (stage.name === "Vinto") {
      updateFields.wonAt = now;
      updateFields.lostAt = null;
    } else if (stage.name === "Perso") {
      updateFields.lostAt = now;
      updateFields.wonAt = null;
    } else {
      updateFields.wonAt = null;
      updateFields.lostAt = null;
    }

    if (stage.name === "Preventivo Inviato") {
      const existing = await db
        .select({ quoteSentAt: opportunities.quoteSentAt })
        .from(opportunities)
        .where(and(eq(opportunities.id, opportunityId), eq(opportunities.companyId, companyId)))
        .limit(1);
      if (!existing[0]?.quoteSentAt) {
        updateFields.quoteSentAt = now;
      }
    }

    const [opp] = await db
      .update(opportunities)
      .set(updateFields)
      .where(and(eq(opportunities.id, opportunityId), eq(opportunities.companyId, companyId)))
      .returning();
    return opp || undefined;
  }

  // ============ ACTIVITY LOGS ============

  async createActivityLog(data: InsertActivityLog): Promise<ActivityLog> {
    const [log] = await db.insert(activityLogs).values(data).returning();
    return log;
  }

  async getActivitiesByEntity(entityType: string, entityId: string, companyId: string): Promise<(ActivityLog & { userName: string | null })[]> {
    const rows = await db
      .select({
        id: activityLogs.id,
        companyId: activityLogs.companyId,
        userId: activityLogs.userId,
        entityType: activityLogs.entityType,
        entityId: activityLogs.entityId,
        action: activityLogs.action,
        details: activityLogs.details,
        createdAt: activityLogs.createdAt,
        userFirstName: users.firstName,
        userLastName: users.lastName,
      })
      .from(activityLogs)
      .leftJoin(users, eq(activityLogs.userId, users.id))
      .where(
        and(
          eq(activityLogs.entityType, entityType),
          eq(activityLogs.entityId, entityId),
          eq(activityLogs.companyId, companyId)
        )
      )
      .orderBy(desc(activityLogs.createdAt));
    return rows.map(r => ({
      id: r.id,
      companyId: r.companyId,
      userId: r.userId,
      entityType: r.entityType,
      entityId: r.entityId,
      action: r.action,
      details: r.details,
      createdAt: r.createdAt,
      userName: r.userFirstName && r.userLastName ? `${r.userFirstName} ${r.userLastName}` : r.userFirstName || null,
    }));
  }

  async getActivitiesByCompany(companyId: string, limit: number = 50): Promise<ActivityLog[]> {
    return db
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.companyId, companyId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);
  }

  async getActivitiesByLead(leadId: string, companyId: string): Promise<(ActivityLog & { userName: string | null })[]> {
    const leadActivities = await this.getActivitiesByEntity("lead", leadId, companyId);
    
    const leadOpportunities = await this.getOpportunitiesByLead(leadId, companyId);
    const opportunityIds = leadOpportunities.map(o => o.id);
    
    let opportunityActivities: (ActivityLog & { userName: string | null })[] = [];
    for (const oppId of opportunityIds) {
      const oppLogs = await this.getActivitiesByEntity("opportunity", oppId, companyId);
      opportunityActivities = [...opportunityActivities, ...oppLogs];
    }
    
    const allActivities = [...leadActivities, ...opportunityActivities];
    allActivities.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
    
    return allActivities;
  }

  // ============ TEAM MANAGEMENT ============

  async getUsersByCompanyId(companyId: string): Promise<User[]> {
    const userCompanyList = await db
      .select({ userId: userCompanies.userId })
      .from(userCompanies)
      .where(eq(userCompanies.companyId, companyId));
    
    if (userCompanyList.length === 0) {
      return [];
    }
    
    const userIds = userCompanyList.map(uc => uc.userId);
    const companyUsers = await db
      .select()
      .from(users)
      .where(or(...userIds.map(id => eq(users.id, id))));
    
    return companyUsers;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user || undefined;
  }

  async createUserWithCompany(userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: UserRole;
  }, companyId: string): Promise<User> {
    return await db.transaction(async (tx) => {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      const [user] = await tx.insert(users).values({
        email: userData.email.toLowerCase(),
        password: hashedPassword,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role,
      }).returning();
      
      await tx.insert(userCompanies).values({
        userId: user.id,
        companyId: companyId,
      });
      
      return user;
    });
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async updateUserRole(userId: string, role: UserRole): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user || undefined;
  }

  async updateUserStatus(userId: string, status: UserStatus): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ status, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user || undefined;
  }

  async updateUserProfile(userId: string, data: { displayName?: string; contactEmail?: string; phone?: string; profileImageUrl?: string; profileImageData?: string | null }): Promise<User | undefined> {
    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (data.displayName !== undefined) updateData.displayName = data.displayName;
    if (data.contactEmail !== undefined) updateData.contactEmail = data.contactEmail;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.profileImageUrl !== undefined) updateData.profileImageUrl = data.profileImageUrl;
    if (data.profileImageData !== undefined) updateData.profileImageData = data.profileImageData;
    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();
    return user || undefined;
  }

  // ============ INVITES ============

  async createInvite(data: InsertInvite): Promise<Invite> {
    const [invite] = await db.insert(invites).values({
      ...data,
      role: data.role as UserRole,
    }).returning();
    return invite;
  }

  async getInviteByToken(token: string): Promise<Invite | undefined> {
    const [invite] = await db.select().from(invites).where(eq(invites.token, token));
    return invite || undefined;
  }

  async getInviteByEmail(email: string, companyId: string): Promise<Invite | undefined> {
    const [invite] = await db
      .select()
      .from(invites)
      .where(and(eq(invites.email, email.toLowerCase()), eq(invites.companyId, companyId)));
    return invite || undefined;
  }

  async deleteInvite(id: string): Promise<boolean> {
    const result = await db.delete(invites).where(eq(invites.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteExpiredInvites(): Promise<number> {
    const { lte } = await import("drizzle-orm");
    const result = await db.delete(invites).where(
      lte(invites.expiresAt, new Date())
    );
    return result.rowCount ?? 0;
  }

  // ============ CONTACT REFERENTS ============

  async getReferentsByContactId(contactId: string): Promise<ContactReferent[]> {
    return db
      .select()
      .from(contactReferents)
      .where(eq(contactReferents.contactId, contactId))
      .orderBy(contactReferents.createdAt);
  }

  async getReferent(id: string): Promise<ContactReferent | undefined> {
    const [referent] = await db
      .select()
      .from(contactReferents)
      .where(eq(contactReferents.id, id));
    return referent || undefined;
  }

  async createReferent(data: InsertContactReferent): Promise<ContactReferent> {
    const [referent] = await db.insert(contactReferents).values(data).returning();
    return referent;
  }

  async updateReferent(id: string, data: Partial<InsertContactReferent>): Promise<ContactReferent | undefined> {
    const updateData = { ...data, updatedAt: new Date() };
    const [referent] = await db
      .update(contactReferents)
      .set(updateData)
      .where(eq(contactReferents.id, id))
      .returning();
    return referent || undefined;
  }

  async deleteReferent(id: string): Promise<boolean> {
    const result = await db.delete(contactReferents).where(eq(contactReferents.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ============ ARTICLES (Listino Preventivatore) ============

  async getArticlesByCompany(companyId: string, checklistOnly?: boolean): Promise<Article[]> {
    if (checklistOnly) {
      return db
        .select()
        .from(articles)
        .where(and(
          eq(articles.companyId, companyId),
          eq(articles.isChecklistItem, 1),
          eq(articles.isActive, 1)
        ))
        .orderBy(articles.checklistOrder);
    }
    return db
      .select()
      .from(articles)
      .where(and(
        eq(articles.companyId, companyId),
        eq(articles.isActive, 1)
      ))
      .orderBy(articles.checklistOrder);
  }

  async getArticle(id: string, companyId: string): Promise<Article | undefined> {
    const [article] = await db
      .select()
      .from(articles)
      .where(and(eq(articles.id, id), eq(articles.companyId, companyId)));
    return article || undefined;
  }

  async createArticle(data: InsertArticle): Promise<Article> {
    const [article] = await db.insert(articles).values(data).returning();
    return article;
  }

  async updateArticle(id: string, companyId: string, data: Partial<InsertArticle>): Promise<Article | undefined> {
    const updateData = { ...data, updatedAt: new Date() };
    const [article] = await db
      .update(articles)
      .set(updateData)
      .where(and(eq(articles.id, id), eq(articles.companyId, companyId)))
      .returning();
    return article || undefined;
  }

  async deleteArticle(id: string, companyId: string): Promise<boolean> {
    // Soft delete: imposta isActive = 0
    const [article] = await db
      .update(articles)
      .set({ isActive: 0, updatedAt: new Date() })
      .where(and(eq(articles.id, id), eq(articles.companyId, companyId)))
      .returning();
    return !!article;
  }

  // ============ QUOTES (Preventivi) ============

  async getQuotesByOpportunity(opportunityId: string, companyId: string): Promise<Quote[]> {
    return db
      .select()
      .from(quotes)
      .where(and(
        eq(quotes.opportunityId, opportunityId),
        eq(quotes.companyId, companyId)
      ))
      .orderBy(desc(quotes.createdAt));
  }

  async getQuote(id: string, companyId: string): Promise<Quote | undefined> {
    const [quote] = await db
      .select()
      .from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.companyId, companyId)));
    return quote || undefined;
  }

  async createQuote(data: InsertQuote): Promise<Quote> {
    const [quote] = await db.insert(quotes).values(data).returning();
    return quote;
  }

  /**
   * Crea un preventivo con numero auto-generato in modo atomico e sicuro contro race condition.
   * Calcola il prossimo numero disponibile e inserisce il preventivo nella stessa transazione
   * con un lock FOR UPDATE sulle righe esistenti, garantendo unicità anche con richieste concorrenti.
   * Se viene passato un customNumber, lo usa direttamente (la validazione avviene nel route).
   */
  async createQuoteWithNextNumber(data: Omit<InsertQuote, 'number'>, customNumber?: string): Promise<Quote> {
    return await db.transaction(async (tx) => {
      // Acquisisci un advisory lock per-company per serializzare l'allocazione dei numeri.
      // hashtext(companyId) genera un intero univoco per company, evitando race condition
      // anche quando non ci sono righe quote esistenti da bloccare con FOR UPDATE.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${data.companyId}))`);

      let quoteNumber: string;
      if (customNumber) {
        quoteNumber = customNumber;
      } else {
        const year = new Date().getFullYear();
        const allQuotes = await tx.execute(
          sql`SELECT number FROM quotes WHERE company_id = ${data.companyId}`
        );
        let maxNum = 299;
        for (const q of allQuotes.rows as Array<{ number: string }>) {
          if (!q.number) continue;
          if (!q.number.endsWith(`-${year}`) && !q.number.startsWith(`PREV-${year}`)) continue;
          const match = q.number.match(/^(?:PREV-\d{4}-)?(\d+)/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
          }
        }
        quoteNumber = `${String(maxNum + 1).padStart(3, '0')}-${year}`;
      }
      const [quote] = await tx.insert(quotes).values({ ...data, number: quoteNumber }).returning();
      return quote;
    });
  }

  async updateQuote(id: string, companyId: string, data: Partial<InsertQuote>): Promise<Quote | undefined> {
    const updateData = { ...data, updatedAt: new Date() };
    const [quote] = await db
      .update(quotes)
      .set(updateData)
      .where(and(eq(quotes.id, id), eq(quotes.companyId, companyId)))
      .returning();
    return quote || undefined;
  }

  async deleteQuote(id: string, companyId: string): Promise<boolean> {
    const result = await db
      .delete(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  }

  // ============ QUOTE ITEMS (Righe Preventivo) ============

  async getQuoteItems(quoteId: string): Promise<QuoteItem[]> {
    return db
      .select()
      .from(quoteItems)
      .where(eq(quoteItems.quoteId, quoteId))
      .orderBy(quoteItems.phase);
  }

  async createQuoteItem(data: InsertQuoteItem): Promise<QuoteItem> {
    const [item] = await db.insert(quoteItems).values(data).returning();
    return item;
  }

  async createQuoteItems(data: InsertQuoteItem[]): Promise<QuoteItem[]> {
    if (data.length === 0) return [];
    return db.insert(quoteItems).values(data).returning();
  }

  async getQuoteItem(id: string, quoteId: string): Promise<QuoteItem | undefined> {
    const [item] = await db
      .select()
      .from(quoteItems)
      .where(and(eq(quoteItems.id, id), eq(quoteItems.quoteId, quoteId)));
    return item || undefined;
  }

  async updateQuoteItem(
    id: string, 
    quoteId: string, 
    data: { unitPriceApplied?: string; quantity?: string; totalRow?: string }
  ): Promise<QuoteItem | undefined> {
    const [item] = await db
      .update(quoteItems)
      .set(data)
      .where(and(eq(quoteItems.id, id), eq(quoteItems.quoteId, quoteId)))
      .returning();
    return item || undefined;
  }

  async deleteQuoteItems(quoteId: string): Promise<boolean> {
    const result = await db.delete(quoteItems).where(eq(quoteItems.quoteId, quoteId));
    return (result.rowCount ?? 0) >= 0;
  }

  // Project Stages
  async getProjectStagesByCompany(companyId: string): Promise<ProjectStage[]> {
    return db
      .select()
      .from(projectStages)
      .where(eq(projectStages.companyId, companyId))
      .orderBy(projectStages.order);
  }

  async createProjectStage(data: InsertProjectStage): Promise<ProjectStage> {
    const [stage] = await db.insert(projectStages).values(data).returning();
    return stage;
  }

  async updateProjectStage(id: string, companyId: string, data: Partial<InsertProjectStage>): Promise<ProjectStage | undefined> {
    const [stage] = await db
      .update(projectStages)
      .set(data)
      .where(and(eq(projectStages.id, id), eq(projectStages.companyId, companyId)))
      .returning();
    return stage || undefined;
  }

  async deleteProjectStage(id: string, companyId: string): Promise<boolean> {
    const result = await db
      .delete(projectStages)
      .where(and(eq(projectStages.id, id), eq(projectStages.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  }

  async reorderProjectStages(companyId: string, stageIds: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (let i = 0; i < stageIds.length; i++) {
        await tx
          .update(projectStages)
          .set({ order: i + 1 })
          .where(and(eq(projectStages.id, stageIds[i]), eq(projectStages.companyId, companyId)));
      }
    });
  }

  // Projects
  async getProjectsByCompany(companyId: string): Promise<Project[]> {
    return db
      .select()
      .from(projects)
      .where(eq(projects.companyId, companyId))
      .orderBy(desc(projects.createdAt));
  }

  async getUsersByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    return db.select().from(users).where(inArray(users.id, ids));
  }

  async getOpportunitiesByIds(ids: string[], companyId: string): Promise<Opportunity[]> {
    if (ids.length === 0) return [];
    return db.select().from(opportunities).where(and(inArray(opportunities.id, ids), eq(opportunities.companyId, companyId)));
  }

  async getQuotesByOpportunityIds(opportunityIds: string[], companyId: string): Promise<Quote[]> {
    if (opportunityIds.length === 0) return [];
    return db.select().from(quotes).where(and(inArray(quotes.opportunityId, opportunityIds), eq(quotes.companyId, companyId))).orderBy(desc(quotes.createdAt));
  }

  async getDailyAssignmentsByProjectIds(projectIds: string[], companyId: string): Promise<DailyAssignment[]> {
    if (projectIds.length === 0) return [];
    return db.select().from(dailyAssignments).where(and(inArray(dailyAssignments.projectId, projectIds), eq(dailyAssignments.companyId, companyId))).orderBy(dailyAssignments.date);
  }

  async getProject(id: string, companyId: string): Promise<Project | undefined> {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.companyId, companyId)));
    return project || undefined;
  }

  async getProjectByOpportunity(opportunityId: string, companyId: string): Promise<Project | undefined> {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.opportunityId, opportunityId), eq(projects.companyId, companyId)));
    return project || undefined;
  }

  async createProject(data: InsertProject): Promise<Project> {
    const [project] = await db.insert(projects).values(data as any).returning();
    return project;
  }

  async updateProject(id: string, companyId: string, data: Partial<InsertProject>): Promise<Project | undefined> {
    const [project] = await db
      .update(projects)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(and(eq(projects.id, id), eq(projects.companyId, companyId)))
      .returning();
    return project || undefined;
  }

  async deleteProject(id: string, companyId: string): Promise<boolean> {
    const result = await db
      .delete(projects)
      .where(and(eq(projects.id, id), eq(projects.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  }

  // External Engineers (Ingegneri Esterni RDC)
  async getExternalEngineersByCompany(companyId: string): Promise<ExternalEngineer[]> {
    return db
      .select()
      .from(externalEngineers)
      .where(eq(externalEngineers.companyId, companyId))
      .orderBy(externalEngineers.name);
  }

  async getExternalEngineer(id: string, companyId: string): Promise<ExternalEngineer | undefined> {
    const [engineer] = await db
      .select()
      .from(externalEngineers)
      .where(and(eq(externalEngineers.id, id), eq(externalEngineers.companyId, companyId)));
    return engineer || undefined;
  }

  async createExternalEngineer(data: InsertExternalEngineer): Promise<ExternalEngineer> {
    const [engineer] = await db.insert(externalEngineers).values(data).returning();
    return engineer;
  }

  async updateExternalEngineer(id: string, companyId: string, data: Partial<InsertExternalEngineer>): Promise<ExternalEngineer | undefined> {
    const [engineer] = await db
      .update(externalEngineers)
      .set(data)
      .where(and(eq(externalEngineers.id, id), eq(externalEngineers.companyId, companyId)))
      .returning();
    return engineer || undefined;
  }

  async deleteExternalEngineer(id: string, companyId: string): Promise<boolean> {
    const result = await db
      .delete(externalEngineers)
      .where(and(eq(externalEngineers.id, id), eq(externalEngineers.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Project Tasks (Attività Gantt)
  async getProjectTasksByProject(projectId: string, companyId: string): Promise<ProjectTask[]> {
    return db
      .select()
      .from(projectTasks)
      .where(and(eq(projectTasks.projectId, projectId), eq(projectTasks.companyId, companyId)))
      .orderBy(projectTasks.sortOrder);
  }

  async getProjectTask(id: string, companyId: string): Promise<ProjectTask | undefined> {
    const [task] = await db
      .select()
      .from(projectTasks)
      .where(and(eq(projectTasks.id, id), eq(projectTasks.companyId, companyId)));
    return task || undefined;
  }

  async createProjectTask(data: InsertProjectTask): Promise<ProjectTask> {
    const [task] = await db.insert(projectTasks).values(data as any).returning();
    return task;
  }

  async updateProjectTask(id: string, companyId: string, data: Partial<InsertProjectTask>): Promise<ProjectTask | undefined> {
    const [task] = await db
      .update(projectTasks)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(and(eq(projectTasks.id, id), eq(projectTasks.companyId, companyId)))
      .returning();
    return task || undefined;
  }

  async deleteProjectTask(id: string, companyId: string): Promise<boolean> {
    const result = await db
      .delete(projectTasks)
      .where(and(eq(projectTasks.id, id), eq(projectTasks.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  }

  // ========== PROXIT - Workers ==========
  async getWorkersByCompany(companyId: string): Promise<Worker[]> {
    return db.select().from(workers).where(eq(workers.companyId, companyId)).orderBy(workers.sortOrder, workers.name);
  }

  async getWorker(id: string, companyId: string): Promise<Worker | undefined> {
    const [worker] = await db.select().from(workers).where(and(eq(workers.id, id), eq(workers.companyId, companyId)));
    return worker || undefined;
  }

  async createWorker(data: InsertWorker): Promise<Worker> {
    const [worker] = await db.insert(workers).values(data as any).returning();
    return worker;
  }

  async updateWorker(id: string, companyId: string, data: Partial<InsertWorker>): Promise<Worker | undefined> {
    const [worker] = await db.update(workers).set(data as any).where(and(eq(workers.id, id), eq(workers.companyId, companyId))).returning();
    return worker || undefined;
  }

  async deleteWorker(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(workers).where(and(eq(workers.id, id), eq(workers.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  }

  // ========== PROXIT - Teams ==========
  async getTeamsByCompany(companyId: string): Promise<Team[]> {
    return db.select().from(teams).where(eq(teams.companyId, companyId)).orderBy(teams.name);
  }

  async getTeam(id: string, companyId: string): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(and(eq(teams.id, id), eq(teams.companyId, companyId)));
    return team || undefined;
  }

  async createTeam(data: InsertTeam): Promise<Team> {
    const [team] = await db.insert(teams).values(data as any).returning();
    return team;
  }

  async updateTeam(id: string, companyId: string, data: Partial<InsertTeam>): Promise<Team | undefined> {
    const [team] = await db.update(teams).set(data as any).where(and(eq(teams.id, id), eq(teams.companyId, companyId))).returning();
    return team || undefined;
  }

  async deleteTeam(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(teams).where(and(eq(teams.id, id), eq(teams.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  }

  // ========== PROXIT - Team Members ==========
  async getTeamMembersByTeam(teamId: string, companyId: string): Promise<TeamMember[]> {
    return db.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.companyId, companyId))).orderBy(teamMembers.name);
  }

  async getTeamMembersByCompany(companyId: string): Promise<TeamMember[]> {
    return db.select().from(teamMembers).where(eq(teamMembers.companyId, companyId)).orderBy(teamMembers.name);
  }

  async createTeamMember(data: InsertTeamMember): Promise<TeamMember> {
    const [member] = await db.insert(teamMembers).values(data as any).returning();
    return member;
  }

  async updateTeamMember(id: string, companyId: string, data: Pick<Partial<InsertTeamMember>, "name" | "isActive">): Promise<TeamMember | undefined> {
    const safeFields: Partial<{ name: string; isActive: boolean }> = {};
    if (data.name !== undefined) safeFields.name = data.name;
    if (data.isActive !== undefined) safeFields.isActive = data.isActive;
    if (Object.keys(safeFields).length === 0) return undefined;
    const [member] = await db.update(teamMembers).set(safeFields).where(and(eq(teamMembers.id, id), eq(teamMembers.companyId, companyId))).returning();
    return member || undefined;
  }

  async deleteTeamMember(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(teamMembers).where(and(eq(teamMembers.id, id), eq(teamMembers.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  }

  // ========== PROXIT - Drivers ==========
  async getDriversByCompany(companyId: string): Promise<Driver[]> {
    return db.select().from(drivers).where(eq(drivers.companyId, companyId)).orderBy(drivers.name);
  }

  async getDriver(id: string, companyId: string): Promise<Driver | undefined> {
    const [driver] = await db.select().from(drivers).where(and(eq(drivers.id, id), eq(drivers.companyId, companyId)));
    return driver || undefined;
  }

  async createDriver(data: InsertDriver): Promise<Driver> {
    const [driver] = await db.insert(drivers).values(data as any).returning();
    return driver;
  }

  async updateDriver(id: string, companyId: string, data: Partial<InsertDriver>): Promise<Driver | undefined> {
    const [driver] = await db.update(drivers).set(data as any).where(and(eq(drivers.id, id), eq(drivers.companyId, companyId))).returning();
    return driver || undefined;
  }

  async deleteDriver(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(drivers).where(and(eq(drivers.id, id), eq(drivers.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  }

  // ========== PROXIT - Vehicles ==========
  async getVehiclesByCompany(companyId: string): Promise<Vehicle[]> {
    return db.select().from(vehicles).where(eq(vehicles.companyId, companyId)).orderBy(vehicles.name);
  }

  async getVehicle(id: string, companyId: string): Promise<Vehicle | undefined> {
    const [vehicle] = await db.select().from(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.companyId, companyId)));
    return vehicle || undefined;
  }

  async createVehicle(data: InsertVehicle): Promise<Vehicle> {
    const [vehicle] = await db.insert(vehicles).values(data as any).returning();
    return vehicle;
  }

  async updateVehicle(id: string, companyId: string, data: Partial<InsertVehicle>): Promise<Vehicle | undefined> {
    const [vehicle] = await db.update(vehicles).set(data as any).where(and(eq(vehicles.id, id), eq(vehicles.companyId, companyId))).returning();
    return vehicle || undefined;
  }

  async deleteVehicle(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  }

  // ========== PROXIT - Daily Assignments ==========
  async getDailyAssignmentsByDateRange(companyId: string, startDate: Date, endDate: Date): Promise<DailyAssignment[]> {
    return db.select().from(dailyAssignments)
      .where(and(
        eq(dailyAssignments.companyId, companyId),
        lte(dailyAssignments.date, endDate),
        or(
          and(isNull(dailyAssignments.endDate), gte(dailyAssignments.date, startDate)),
          gte(dailyAssignments.endDate, startDate)
        )
      ))
      .orderBy(dailyAssignments.date, dailyAssignments.sortOrder, dailyAssignments.createdAt);
  }

  async getDailyAssignmentsByProjectId(projectId: string, companyId: string): Promise<DailyAssignment[]> {
    return db.select().from(dailyAssignments)
      .where(and(
        eq(dailyAssignments.companyId, companyId),
        eq(dailyAssignments.projectId, projectId)
      ))
      .orderBy(dailyAssignments.date);
  }

  async getDailyAssignment(id: string, companyId: string): Promise<DailyAssignment | undefined> {
    const [assignment] = await db.select().from(dailyAssignments).where(and(eq(dailyAssignments.id, id), eq(dailyAssignments.companyId, companyId)));
    return assignment || undefined;
  }

  async createDailyAssignment(data: InsertDailyAssignment): Promise<DailyAssignment> {
    const [assignment] = await db.insert(dailyAssignments).values(data as any).returning();
    return assignment;
  }

  async updateDailyAssignment(id: string, companyId: string, data: Partial<InsertDailyAssignment>): Promise<DailyAssignment | undefined> {
    const [assignment] = await db.update(dailyAssignments).set({ ...data, updatedAt: new Date() } as any).where(and(eq(dailyAssignments.id, id), eq(dailyAssignments.companyId, companyId))).returning();
    return assignment || undefined;
  }

  async deleteDailyAssignment(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(dailyAssignments).where(and(eq(dailyAssignments.id, id), eq(dailyAssignments.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  }

  async reorderDailyAssignments(companyId: string, idA: string, idB: string): Promise<boolean> {
    return await db.transaction(async (tx) => {
      const [a, b] = await Promise.all([
        tx.select().from(dailyAssignments).where(and(eq(dailyAssignments.id, idA), eq(dailyAssignments.companyId, companyId))).then(r => r[0]),
        tx.select().from(dailyAssignments).where(and(eq(dailyAssignments.id, idB), eq(dailyAssignments.companyId, companyId))).then(r => r[0]),
      ]);
      if (!a || !b) return false;
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      const sameDay =
        dateA.getFullYear() === dateB.getFullYear() &&
        dateA.getMonth() === dateB.getMonth() &&
        dateA.getDate() === dateB.getDate();
      if (!sameDay) return false;
      const sortA = a.sortOrder;
      const sortB = b.sortOrder;
      await tx.update(dailyAssignments).set({ sortOrder: sortB, updatedAt: new Date() }).where(eq(dailyAssignments.id, idA));
      await tx.update(dailyAssignments).set({ sortOrder: sortA, updatedAt: new Date() }).where(eq(dailyAssignments.id, idB));
      return true;
    });
  }

  async moveDailyAssignmentToIndex(companyId: string, id: string, toIndex: number, prePadding?: number): Promise<boolean> {
    return await db.transaction(async (tx) => {
      const target = await tx.select().from(dailyAssignments)
        .where(and(eq(dailyAssignments.id, id), eq(dailyAssignments.companyId, companyId)))
        .then(r => r[0]);
      if (!target) return false;

      const targetDate = new Date(target.date);
      const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0);
      const dayEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);

      const dayRows = await tx.select()
        .from(dailyAssignments)
        .where(and(
          eq(dailyAssignments.companyId, companyId),
          gte(dailyAssignments.date, dayStart),
          lte(dailyAssignments.date, dayEnd)
        ))
        .orderBy(dailyAssignments.sortOrder, dailyAssignments.createdAt);

      const filtered = dayRows.filter(r => r.id !== id);
      const clampedIndex = Math.max(0, Math.min(toIndex, filtered.length));
      filtered.splice(clampedIndex, 0, target);

      for (let i = 0; i < filtered.length; i++) {
        const updates: Record<string, any> = { sortOrder: i, updatedAt: new Date() };
        if (filtered[i].id === id && prePadding !== undefined) {
          updates.prePadding = Math.max(0, prePadding);
        }
        await tx.update(dailyAssignments)
          .set(updates)
          .where(eq(dailyAssignments.id, filtered[i].id));
      }
      return true;
    });
  }

  async moveDailyAssignmentToDay(companyId: string, id: string, targetDate: Date, toIndex: number, prePadding?: number): Promise<boolean> {
    return await db.transaction(async (tx) => {
      const target = await tx.select().from(dailyAssignments)
        .where(and(eq(dailyAssignments.id, id), eq(dailyAssignments.companyId, companyId)))
        .then(r => r[0]);
      if (!target) return false;

      const oldDate = new Date(target.date);
      const dayDiff = Math.round((targetDate.getTime() - new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate()).getTime()) / (1000 * 60 * 60 * 24));
      if (dayDiff === 0) {
        const filtered = (await tx.select().from(dailyAssignments)
          .where(and(eq(dailyAssignments.companyId, companyId), gte(dailyAssignments.date, new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), 0, 0, 0, 0)), lte(dailyAssignments.date, new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), 23, 59, 59, 999))))
          .orderBy(dailyAssignments.sortOrder, dailyAssignments.createdAt)).filter(r => r.id !== id);
        const ci = Math.max(0, Math.min(toIndex, filtered.length));
        filtered.splice(ci, 0, target);
        for (let i = 0; i < filtered.length; i++) {
          const updates: Record<string, any> = { sortOrder: i, updatedAt: new Date() };
          if (filtered[i].id === id && prePadding !== undefined) {
            updates.prePadding = Math.max(0, prePadding);
          }
          await tx.update(dailyAssignments).set(updates).where(eq(dailyAssignments.id, filtered[i].id));
        }
        return true;
      }

      const newDate = new Date(targetDate);
      newDate.setHours(12, 0, 0, 0);
      let newEndDate: Date | null = null;
      if (target.endDate) {
        const endD = new Date(target.endDate);
        newEndDate = new Date(endD.getTime() + dayDiff * 24 * 60 * 60 * 1000);
        newEndDate.setHours(12, 0, 0, 0);
      }

      await tx.update(dailyAssignments)
        .set({ date: newDate, endDate: newEndDate, sortOrder: 0, prePadding: prePadding !== undefined ? Math.max(0, prePadding) : 0, updatedAt: new Date() })
        .where(eq(dailyAssignments.id, id));

      const oldDayStart = new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), 0, 0, 0, 0);
      const oldDayEnd = new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), 23, 59, 59, 999);
      const oldDayRows = await tx.select().from(dailyAssignments)
        .where(and(eq(dailyAssignments.companyId, companyId), gte(dailyAssignments.date, oldDayStart), lte(dailyAssignments.date, oldDayEnd), not(eq(dailyAssignments.id, id))))
        .orderBy(dailyAssignments.sortOrder, dailyAssignments.createdAt);
      for (let i = 0; i < oldDayRows.length; i++) {
        await tx.update(dailyAssignments).set({ sortOrder: i, updatedAt: new Date() }).where(eq(dailyAssignments.id, oldDayRows[i].id));
      }

      const newDayStart = new Date(targetDate);
      newDayStart.setHours(0, 0, 0, 0);
      const newDayEnd = new Date(targetDate);
      newDayEnd.setHours(23, 59, 59, 999);
      const newDayRows = await tx.select().from(dailyAssignments)
        .where(and(eq(dailyAssignments.companyId, companyId), gte(dailyAssignments.date, newDayStart), lte(dailyAssignments.date, newDayEnd)))
        .orderBy(dailyAssignments.sortOrder, dailyAssignments.createdAt);
      const filtered = newDayRows.filter(r => r.id !== id);
      const ci = Math.max(0, Math.min(toIndex, filtered.length));
      filtered.splice(ci, 0, { ...target, date: newDate, endDate: newEndDate, sortOrder: 0 } as any);
      for (let i = 0; i < filtered.length; i++) {
        await tx.update(dailyAssignments).set({ sortOrder: i, updatedAt: new Date() }).where(eq(dailyAssignments.id, filtered[i].id));
      }

      return true;
    });
  }

  async getNextSortOrderForDay(companyId: string, date: Date): Promise<number> {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    const rows = await db.select({ sortOrder: dailyAssignments.sortOrder })
      .from(dailyAssignments)
      .where(and(
        eq(dailyAssignments.companyId, companyId),
        gte(dailyAssignments.date, dayStart),
        lte(dailyAssignments.date, dayEnd)
      ));
    if (rows.length === 0) return 0;
    return Math.max(...rows.map(r => r.sortOrder)) + 1;
  }

  async updateDailyAssignmentPrePadding(companyId: string, id: string, delta: number): Promise<DailyAssignment | undefined> {
    const [existing] = await db.select().from(dailyAssignments).where(and(eq(dailyAssignments.id, id), eq(dailyAssignments.companyId, companyId)));
    if (!existing) return undefined;
    const newPrePadding = Math.max(0, existing.prePadding + delta);
    const [updated] = await db.update(dailyAssignments).set({ prePadding: newPrePadding, updatedAt: new Date() }).where(and(eq(dailyAssignments.id, id), eq(dailyAssignments.companyId, companyId))).returning();
    return updated || undefined;
  }

  // ========== Payment Methods ==========
  async getPaymentMethodsByCompany(companyId: string): Promise<PaymentMethod[]> {
    return db.select().from(paymentMethods)
      .where(eq(paymentMethods.companyId, companyId))
      .orderBy(paymentMethods.sortOrder);
  }

  async getPaymentMethod(id: string, companyId: string): Promise<PaymentMethod | undefined> {
    const [method] = await db.select().from(paymentMethods).where(and(eq(paymentMethods.id, id), eq(paymentMethods.companyId, companyId)));
    return method || undefined;
  }

  async createPaymentMethod(data: InsertPaymentMethod): Promise<PaymentMethod> {
    const [method] = await db.insert(paymentMethods).values(data as any).returning();
    return method;
  }

  async updatePaymentMethod(id: string, companyId: string, data: Partial<InsertPaymentMethod>): Promise<PaymentMethod | undefined> {
    const [method] = await db.update(paymentMethods).set(data as any).where(and(eq(paymentMethods.id, id), eq(paymentMethods.companyId, companyId))).returning();
    return method || undefined;
  }

  async deletePaymentMethod(id: string, companyId: string): Promise<boolean> {
    await db.update(leads).set({ paymentMethodId: null } as any).where(and(eq(leads.paymentMethodId, id), eq(leads.companyId, companyId)));
    const result = await db.delete(paymentMethods).where(and(eq(paymentMethods.id, id), eq(paymentMethods.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  }

  // ========== Lead Sources ==========
  async getLeadSourcesByCompany(companyId: string): Promise<LeadSource[]> {
    return db.select().from(leadSources)
      .where(eq(leadSources.companyId, companyId))
      .orderBy(leadSources.sortOrder);
  }

  async createLeadSource(data: InsertLeadSource): Promise<LeadSource> {
    const [source] = await db.insert(leadSources).values(data as any).returning();
    return source;
  }

  async updateLeadSource(id: string, companyId: string, data: Partial<InsertLeadSource>): Promise<LeadSource | undefined> {
    const [source] = await db.update(leadSources).set(data as any).where(and(eq(leadSources.id, id), eq(leadSources.companyId, companyId))).returning();
    return source || undefined;
  }

  async deleteLeadSource(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(leadSources).where(and(eq(leadSources.id, id), eq(leadSources.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Reminders
  async getRemindersByUser(userId: string, companyId: string, filters?: { dueBefore?: Date; dueAfter?: Date; completed?: boolean }): Promise<Reminder[]> {
    const conditions = [eq(reminders.userId, userId), eq(reminders.companyId, companyId)];
    if (filters?.dueBefore) conditions.push(lte(reminders.dueDate, filters.dueBefore));
    if (filters?.dueAfter) conditions.push(gte(reminders.dueDate, filters.dueAfter));
    if (filters?.completed !== undefined) conditions.push(eq(reminders.completed, filters.completed));
    return db.select().from(reminders).where(and(...conditions)).orderBy(reminders.dueDate);
  }

  async getRemindersByLead(leadId: string, companyId: string): Promise<Reminder[]> {
    return db.select().from(reminders).where(and(eq(reminders.leadId, leadId), eq(reminders.companyId, companyId))).orderBy(reminders.dueDate);
  }

  async getRemindersByOpportunity(opportunityId: string, companyId: string): Promise<Reminder[]> {
    return db.select().from(reminders).where(and(eq(reminders.opportunityId, opportunityId), eq(reminders.companyId, companyId))).orderBy(reminders.dueDate);
  }

  async getOpportunitiesWithActiveManualReminders(companyId: string): Promise<string[]> {
    const results = await db
      .selectDistinct({ opportunityId: reminders.opportunityId })
      .from(reminders)
      .where(
        and(
          eq(reminders.companyId, companyId),
          or(eq(reminders.isAutomatic, false), isNull(reminders.isAutomatic)),
          eq(reminders.completed, false),
        )
      );
    return results
      .map(r => r.opportunityId)
      .filter((id): id is string => id !== null);
  }

  async getReminder(id: string, companyId: string): Promise<Reminder | undefined> {
    const [reminder] = await db.select().from(reminders).where(and(eq(reminders.id, id), eq(reminders.companyId, companyId)));
    return reminder || undefined;
  }

  async createReminder(data: InsertReminder): Promise<Reminder> {
    const [reminder] = await db.insert(reminders).values(data).returning();
    return reminder;
  }

  async updateReminder(id: string, companyId: string, data: Partial<InsertReminder & { completedAt: Date | null }>): Promise<Reminder | undefined> {
    const [reminder] = await db.update(reminders).set(data as any).where(and(eq(reminders.id, id), eq(reminders.companyId, companyId))).returning();
    return reminder || undefined;
  }

  async deleteReminder(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(reminders).where(and(eq(reminders.id, id), eq(reminders.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Billing Profiles
  async getBillingProfilesByCompany(companyId: string): Promise<BillingProfile[]> {
    return db.select().from(billingProfiles).where(eq(billingProfiles.companyId, companyId)).orderBy(billingProfiles.profileType);
  }

  async getBillingProfileByType(companyId: string, profileType: "PRIVATE" | "PUBLIC"): Promise<BillingProfile | undefined> {
    const [profile] = await db.select().from(billingProfiles).where(and(eq(billingProfiles.companyId, companyId), eq(billingProfiles.profileType, profileType)));
    return profile || undefined;
  }

  async getBillingProfile(id: string, companyId: string): Promise<BillingProfile | undefined> {
    const [profile] = await db.select().from(billingProfiles).where(and(eq(billingProfiles.id, id), eq(billingProfiles.companyId, companyId)));
    return profile || undefined;
  }

  async createBillingProfile(data: InsertBillingProfile): Promise<BillingProfile> {
    const [profile] = await db.insert(billingProfiles).values(data).returning();
    return profile;
  }

  async updateBillingProfile(id: string, companyId: string, data: Partial<InsertBillingProfile>): Promise<BillingProfile | undefined> {
    const [profile] = await db.update(billingProfiles).set({ ...data, updatedAt: new Date() } as any).where(and(eq(billingProfiles.id, id), eq(billingProfiles.companyId, companyId))).returning();
    return profile || undefined;
  }

  async deleteBillingProfile(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(billingProfiles).where(and(eq(billingProfiles.id, id), eq(billingProfiles.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Notifications
  async getNotifications(userId: string): Promise<AppNotification[]> {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return result?.count || 0;
  }

  async createNotification(data: InsertNotification): Promise<AppNotification> {
    const [notif] = await db.insert(notifications).values(data).returning();
    return notif;
  }

  async markNotificationRead(id: string, userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  }

  async createNotificationsForCompanyRoles(companyId: string, roles: string[], data: Omit<InsertNotification, 'userId' | 'companyId'>): Promise<void> {
    const companyUsers = await db
      .select({ userId: userCompanies.userId })
      .from(userCompanies)
      .where(eq(userCompanies.companyId, companyId));

    const userIds = companyUsers.map(uc => uc.userId);
    if (userIds.length === 0) return;

    const matchingUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(
        inArray(users.id, userIds),
        inArray(users.role, roles)
      ));

    if (matchingUsers.length === 0) return;

    const matchingUserIds = matchingUsers.map(u => u.id);
    const prefs = await db
      .select()
      .from(notificationPreferences)
      .where(and(
        inArray(notificationPreferences.userId, matchingUserIds),
        eq(notificationPreferences.notificationType, data.type)
      ));
    const disabledUserIds = new Set(prefs.filter(p => !p.enabled).map(p => p.userId));
    const filteredUsers = matchingUsers.filter(u => !disabledUserIds.has(u.id));

    if (filteredUsers.length === 0) return;

    const notifValues = filteredUsers.map(u => ({
      ...data,
      userId: u.id,
      companyId,
    }));

    await db.insert(notifications).values(notifValues);
  }

  async getNotificationPreferences(userId: string): Promise<NotificationPreference[]> {
    return db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  }

  async setNotificationPreference(userId: string, notificationType: string, enabled: boolean): Promise<void> {
    const existing = await db
      .select()
      .from(notificationPreferences)
      .where(and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.notificationType, notificationType)
      ));

    if (existing.length > 0) {
      await db
        .update(notificationPreferences)
        .set({ enabled })
        .where(and(
          eq(notificationPreferences.userId, userId),
          eq(notificationPreferences.notificationType, notificationType)
        ));
    } else {
      await db.insert(notificationPreferences).values({ userId, notificationType, enabled });
    }
  }

  // Clause Overrides
  async getClauseOverridesByCompany(companyId: string): Promise<ClauseOverride[]> {
    try {
      return await db
        .select()
        .from(clauseOverrides)
        .where(eq(clauseOverrides.companyId, companyId));
    } catch (error: any) {
      console.error(`[storage] getClauseOverridesByCompany companyId=${companyId} error: ${error?.message} code=${error?.code}`);
      throw error;
    }
  }

  async upsertClauseOverride(companyId: string, clauseId: string, text: string): Promise<ClauseOverride> {
    try {
      const [result] = await db
        .insert(clauseOverrides)
        .values({ companyId, clauseId, text })
        .onConflictDoUpdate({
          target: [clauseOverrides.companyId, clauseOverrides.clauseId],
          set: { text, updatedAt: new Date() },
        })
        .returning();
      return result;
    } catch (error: any) {
      console.error(`[storage] upsertClauseOverride companyId=${companyId} clauseId=${clauseId} error: ${error?.message} code=${error?.code}`);
      throw error;
    }
  }

  async deleteClauseOverride(companyId: string, clauseId: string): Promise<boolean> {
    const result = await db
      .delete(clauseOverrides)
      .where(and(eq(clauseOverrides.companyId, companyId), eq(clauseOverrides.clauseId, clauseId)))
      .returning();
    return result.length > 0;
  }

  async getWonByMonth(companyId: string, currentYear: number, vintoStageId: string, sellerUserId?: string): Promise<{ currentYear: number[]; lastYear: number[]; twoYearsAgo: number[] }> {
    const years = [currentYear, currentYear - 1, currentYear - 2];
    const results: Record<string, number[]> = {
      currentYear: Array(12).fill(0),
      lastYear: Array(12).fill(0),
      twoYearsAgo: Array(12).fill(0),
    };
    const yearKeys = ["currentYear", "lastYear", "twoYearsAgo"];

    for (let i = 0; i < years.length; i++) {
      const year = years[i];
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59, 999);

      const conditions = [
        eq(opportunities.companyId, companyId),
        eq(opportunities.stageId, vintoStageId),
        gte(opportunities.wonAt, startDate),
        lte(opportunities.wonAt, endDate),
      ];

      if (sellerUserId) {
        conditions.push(eq(opportunities.assignedToUserId, sellerUserId));
      }

      const opps = await db
        .select({
          wonAt: opportunities.wonAt,
          value: opportunities.value,
        })
        .from(opportunities)
        .where(and(...conditions));

      for (const opp of opps) {
        if (!opp.wonAt) continue;
        const month = new Date(opp.wonAt).getMonth();
        results[yearKeys[i]][month] += parseFloat(opp.value ?? "0") || 0;
      }
    }

    return results as { currentYear: number[]; lastYear: number[]; twoYearsAgo: number[] };
  }

  // Sales Targets
  async getSalesTargets(companyId: string, month: number, year: number): Promise<SalesTarget[]> {
    return db
      .select()
      .from(salesTargets)
      .where(and(
        eq(salesTargets.companyId, companyId),
        eq(salesTargets.month, month),
        eq(salesTargets.year, year)
      ));
  }

  async getSalesTargetsForRange(companyId: string, startDate: Date, endDate: Date): Promise<SalesTarget[]> {
    // Collect all (year, month) pairs covered by the range
    const monthKeys: { year: number; month: number }[] = [];
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const rangeEnd = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    while (cursor <= rangeEnd) {
      monthKeys.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    if (monthKeys.length === 0) return [];
    // Fetch all targets for all those months
    const results: SalesTarget[] = [];
    for (const { year, month } of monthKeys) {
      const rows = await db
        .select()
        .from(salesTargets)
        .where(and(
          eq(salesTargets.companyId, companyId),
          eq(salesTargets.month, month),
          eq(salesTargets.year, year)
        ));
      results.push(...rows);
    }
    return results;
  }

  async getSalesTarget(companyId: string, userId: string, month: number, year: number): Promise<SalesTarget | undefined> {
    const [target] = await db
      .select()
      .from(salesTargets)
      .where(and(
        eq(salesTargets.companyId, companyId),
        eq(salesTargets.userId, userId),
        eq(salesTargets.month, month),
        eq(salesTargets.year, year)
      ));
    return target || undefined;
  }

  async upsertSalesTarget(data: InsertSalesTarget): Promise<SalesTarget> {
    const existing = await this.getSalesTarget(data.companyId, data.userId, data.month, data.year);
    if (existing) {
      const [updated] = await db
        .update(salesTargets)
        .set({ quoteTarget: data.quoteTarget, wonTarget: data.wonTarget, updatedAt: new Date() })
        .where(eq(salesTargets.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(salesTargets).values(data).returning();
      return created;
    }
  }

  async getPromoCodesByCompany(companyId: string): Promise<PromoCode[]> {
    return db.select().from(promoCodes).where(eq(promoCodes.companyId, companyId)).orderBy(desc(promoCodes.createdAt));
  }

  async getActivePromoCodes(companyId: string): Promise<PromoCode[]> {
    const now = new Date();
    // validFrom/validTo are stored as timestamps from date inputs (typically midnight UTC).
    // To be fully day-inclusive:
    //   - a promo starting "today" is valid even if validFrom is today's midnight (lte now = true)
    //   - a promo ending "today" should be valid all day, so compare validTo >= start-of-today
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    return db.select().from(promoCodes).where(
      and(
        eq(promoCodes.companyId, companyId),
        lte(promoCodes.validFrom, now),
        gte(promoCodes.validTo, startOfToday)
      )
    );
  }

  async getPromoCode(id: string, companyId: string): Promise<PromoCode | undefined> {
    const [promo] = await db.select().from(promoCodes).where(and(eq(promoCodes.id, id), eq(promoCodes.companyId, companyId)));
    return promo || undefined;
  }

  async createPromoCode(data: InsertPromoCode): Promise<PromoCode> {
    const [promo] = await db.insert(promoCodes).values(data).returning();
    return promo;
  }

  async updatePromoCode(id: string, companyId: string, data: Partial<InsertPromoCode>): Promise<PromoCode | undefined> {
    const [promo] = await db.update(promoCodes).set({ ...data, updatedAt: new Date() }).where(and(eq(promoCodes.id, id), eq(promoCodes.companyId, companyId))).returning();
    return promo || undefined;
  }

  async deletePromoCode(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(promoCodes).where(and(eq(promoCodes.id, id), eq(promoCodes.companyId, companyId))).returning();
    return result.length > 0;
  }

  async getWarehouseBalances(companyId: string): Promise<WarehouseBalance[]> {
    return db.select().from(warehouseBalances).where(eq(warehouseBalances.companyId, companyId));
  }

  async upsertWarehouseBalance(companyId: string, warehouseType: "VILLA" | "PL" | "EP", date: Date | null, value: number): Promise<WarehouseBalance> {
    const existing = await db.select().from(warehouseBalances).where(
      and(
        eq(warehouseBalances.companyId, companyId),
        eq(warehouseBalances.warehouseType, warehouseType),
        date === null ? isNull(warehouseBalances.date) : eq(warehouseBalances.date, date)
      )
    );
    if (existing.length > 0) {
      const [updated] = await db.update(warehouseBalances)
        .set({ value: value.toString() })
        .where(eq(warehouseBalances.id, existing[0].id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(warehouseBalances)
        .values({ companyId, warehouseType, date, value: value.toString() })
        .returning();
      return created;
    }
  }

  async deleteWarehouseBalance(companyId: string, warehouseType: "VILLA" | "PL" | "EP", date: Date | null): Promise<void> {
    await db.delete(warehouseBalances).where(
      and(
        eq(warehouseBalances.companyId, companyId),
        eq(warehouseBalances.warehouseType, warehouseType),
        date === null ? isNull(warehouseBalances.date) : eq(warehouseBalances.date, date)
      )
    );
  }
}

export const storage = new DatabaseStorage();
