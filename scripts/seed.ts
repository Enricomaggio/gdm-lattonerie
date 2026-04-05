// Script di seeding per popolare il database con dati di test
// Esegui con: npx tsx scripts/seed.ts

import { db } from "../server/db";
import { companies, leads, opportunities, pipelineStages, articles, userCompanies } from "../shared/schema";
import { users } from "../shared/models/auth";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const companyAId = "company-a-test-id";
const companyBId = "company-b-test-id";
const adminUserId = "admin-test-user-id";

async function seed() {
  console.log("🌱 Inizio seeding del database...");

  try {
    // ─── 1. COMPANY ─────────────────────────────────────────────────────────────
    console.log("📦 Creazione Company A (Scaffolding Pro)...");
    await db.insert(companies).values({
      id: companyAId,
      name: "Scaffolding Pro S.r.l.",
      email: "info@scaffoldingpro.it",
      vatNumber: "IT12345678901",
    }).onConflictDoNothing();

    console.log("📦 Creazione Company B (Edil Service)...");
    await db.insert(companies).values({
      id: companyBId,
      name: "Edil Service S.p.A.",
      email: "info@edilservice.it",
      vatNumber: "IT98765432109",
    }).onConflictDoNothing();

    // ─── 2. UTENTE ADMIN DI TEST ─────────────────────────────────────────────────
    console.log("👤 Creazione utente admin di test...");
    const hashedPassword = await bcrypt.hash("password", 12);

    await db.insert(users).values({
      id: adminUserId,
      email: "admin@test.it",
      password: hashedPassword,
      firstName: "Admin",
      lastName: "Test",
      role: "COMPANY_ADMIN",
      status: "ACTIVE",
    }).onConflictDoNothing();

    // Collega utente alla company A
    await db.insert(userCompanies).values({
      userId: adminUserId,
      companyId: companyAId,
    }).onConflictDoNothing();

    console.log("   ✓ Email: admin@test.it | Password: password | Ruolo: COMPANY_ADMIN");

    // ─── 3. PIPELINE STAGES ──────────────────────────────────────────────────────
    console.log("🔧 Creazione fasi pipeline per Company A...");
    const existingStagesA = await db.select().from(pipelineStages).where(eq(pipelineStages.companyId, companyAId));

    let stagesA: { id: string; name: string; order: number; color: string }[] = [];

    if (existingStagesA.length === 0) {
      const defaultStagesA = [
        { name: "Nuovo",              order: 1, color: "#61CE85", companyId: companyAId },
        { name: "In trattativa",      order: 2, color: "#4563FF", companyId: companyAId },
        { name: "Proposta inviata",   order: 3, color: "#F59E0B", companyId: companyAId },
        { name: "Chiuso vinto",       order: 4, color: "#059669", companyId: companyAId },
        { name: "Chiuso perso",       order: 5, color: "#EF4444", companyId: companyAId },
      ];
      stagesA = await db.insert(pipelineStages).values(defaultStagesA).returning();
    } else {
      stagesA = existingStagesA;
    }

    // Pipeline stages per Company B
    console.log("🔧 Creazione fasi pipeline per Company B...");
    const existingStagesB = await db.select().from(pipelineStages).where(eq(pipelineStages.companyId, companyBId));
    if (existingStagesB.length === 0) {
      await db.insert(pipelineStages).values([
        { name: "Nuovo",            order: 1, color: "#61CE85", companyId: companyBId },
        { name: "In trattativa",    order: 2, color: "#4563FF", companyId: companyBId },
        { name: "Proposta inviata", order: 3, color: "#F59E0B", companyId: companyBId },
        { name: "Chiuso vinto",     order: 4, color: "#059669", companyId: companyBId },
        { name: "Chiuso perso",     order: 5, color: "#EF4444", companyId: companyBId },
      ]);
    }

    // ─── 4. LEADS ────────────────────────────────────────────────────────────────
    console.log("👥 Creazione contatti per Company A...");
    const leadsCompanyA = [
      {
        id: "lead-costruzioni-rossi",
        entityType: "COMPANY" as const,
        type: "cliente" as const,
        name: "Costruzioni Rossi S.r.l.",
        firstName: "Marco",
        lastName: "Rossi",
        email: "info@costruzionirossi.it",
        phone: "+39 333 123 4567",
        vatNumber: "IT01234567890",
        fiscalCode: "01234567890",
        sdiCode: "KRRH6B9",
        pecEmail: "pec@costruzionirossi.it",
        address: "Via Roma 15",
        city: "Milano",
        zipCode: "20121",
        province: "MI",
        source: "Passaparola" as const,
        notes: "Cliente importante, interessato a forniture ricorrenti",
        companyId: companyAId,
      },
      {
        id: "lead-laura-bianchi",
        entityType: "PRIVATE" as const,
        type: "lead" as const,
        firstName: "Laura",
        lastName: "Bianchi",
        email: "laura.bianchi@gmail.com",
        phone: "+39 348 987 6543",
        fiscalCode: "BNCLRA80A41F205X",
        address: "Via Garibaldi 22",
        city: "Roma",
        zipCode: "00185",
        province: "RM",
        source: "Facebook" as const,
        notes: "Privato interessato a ristrutturazione casa",
        companyId: companyAId,
      },
      {
        id: "lead-edil-green",
        entityType: "COMPANY" as const,
        type: "lead" as const,
        name: "Edil Green S.p.A.",
        firstName: "Giuseppe",
        lastName: "Verdi",
        email: "g.verdi@edilgreen.com",
        phone: "+39 320 555 1234",
        vatNumber: "IT09876543210",
        sdiCode: "W7YVJK9",
        pecEmail: "amministrazione@pec.edilgreen.com",
        address: "Via Eco 100",
        city: "Bologna",
        zipCode: "40121",
        province: "BO",
        source: "LinkedIn" as const,
        notes: "Titolare di Edil Green, specializzati in bioedilizia",
        companyId: companyAId,
      },
    ];

    for (const lead of leadsCompanyA) {
      await db.insert(leads).values(lead).onConflictDoNothing();
    }

    // ─── 5. OPPORTUNITÀ ───────────────────────────────────────────────────────────
    console.log("🎯 Creazione opportunità per Company A...");
    const opportunitiesData = [
      {
        title: "Cantiere Via Roma 15",
        description: "Ristrutturazione edificio residenziale 5 piani",
        value: "25000",
        stageId: stagesA.find(s => s.name === "Proposta inviata")?.id ?? stagesA[2]?.id,
        leadId: "lead-costruzioni-rossi",
        companyId: companyAId,
        probability: 70,
      },
      {
        title: "Nuovo Complesso Residenziale Est",
        description: "Costruzione nuovo condominio 8 piani",
        value: "45000",
        stageId: stagesA.find(s => s.name === "In trattativa")?.id ?? stagesA[1]?.id,
        leadId: "lead-costruzioni-rossi",
        companyId: companyAId,
        probability: 40,
      },
      {
        title: "Villetta Bianchi",
        description: "Ristrutturazione villetta privata",
        value: "12000",
        stageId: stagesA.find(s => s.name === "Nuovo")?.id ?? stagesA[0]?.id,
        leadId: "lead-laura-bianchi",
        companyId: companyAId,
        probability: 50,
      },
      {
        title: "Stabilimento Industriale Nord",
        description: "Manutenzione capannone industriale",
        value: "18500",
        stageId: stagesA.find(s => s.name === "Chiuso vinto")?.id ?? stagesA[3]?.id,
        leadId: "lead-edil-green",
        companyId: companyAId,
        probability: 100,
      },
    ];

    for (const opp of opportunitiesData) {
      if (opp.stageId) {
        await db.insert(opportunities).values(opp).onConflictDoNothing();
      }
    }

    // Lead per Company B
    console.log("👥 Creazione contatti per Company B...");
    await db.insert(leads).values([
      {
        id: "lead-impresa-marino",
        entityType: "COMPANY" as const,
        type: "lead" as const,
        name: "Impresa Edile Marino",
        firstName: "Francesca",
        lastName: "Marino",
        email: "f.marino@impresaedile.it",
        phone: "+39 338 222 3333",
        vatNumber: "IT11223344556",
        source: "Google Ads" as const,
        notes: "Nuova cliente, primo contatto",
        companyId: companyBId,
      },
      {
        id: "lead-paolo-costa",
        entityType: "PRIVATE" as const,
        type: "cliente" as const,
        firstName: "Paolo",
        lastName: "Costa",
        email: "paolo.costa@email.it",
        phone: "+39 347 666 7777",
        fiscalCode: "CSTPLA75D15H501Z",
        address: "Via Appia 150",
        city: "Roma",
        zipCode: "00179",
        province: "RM",
        source: "Cartellonistica" as const,
        notes: "Privato con grande villa in ristrutturazione",
        companyId: companyBId,
      },
    ]).onConflictDoNothing();

    // ─── 6. ARTICOLI LISTINO ─────────────────────────────────────────────────────
    console.log("📋 Creazione listino articoli per Company A...");
    await db.delete(articles).where(eq(articles.companyId, companyAId));

    await db.insert(articles).values([
      { code: "PON-001", name: "Ponteggio",              description: "Ponteggio prefabbricato standard",   unitType: "MQ" as const, pricingLogic: "RENTAL" as const,    basePrice: "8.50",   pricingData: { firstMonthPrice: 8.50,  dailyExtraPrice: 0.28 }, isChecklistItem: 1, checklistOrder: 1,   companyId: companyAId },
      { code: "PDC-002", name: "Piani di carico",        description: "Piani di carico per materiali",      unitType: "CAD" as const, pricingLogic: "RENTAL" as const,    basePrice: "45.00",  pricingData: { firstMonthPrice: 45.00, dailyExtraPrice: 1.50 }, isChecklistItem: 1, checklistOrder: 2,   companyId: companyAId },
      { code: "CIE-003", name: "Cielo",                  description: "Copertura superiore ponteggio",      unitType: "MQ" as const, pricingLogic: "RENTAL" as const,    basePrice: "12.00",  pricingData: { firstMonthPrice: 12.00, dailyExtraPrice: 0.40 }, isChecklistItem: 1, checklistOrder: 3,   companyId: companyAId },
      { code: "PAR-004", name: "Parapetti",              description: "Parapetti di sicurezza",             unitType: "ML" as const, pricingLogic: "RENTAL" as const,    basePrice: "6.00",   pricingData: { firstMonthPrice: 6.00,  dailyExtraPrice: 0.20 }, isChecklistItem: 1, checklistOrder: 4,   companyId: companyAId },
      { code: "MAN-005", name: "Mantovana",              description: "Mantovana di protezione",            unitType: "ML" as const, pricingLogic: "RENTAL" as const,    basePrice: "18.00",  pricingData: { firstMonthPrice: 18.00, dailyExtraPrice: 0.60 }, isChecklistItem: 1, checklistOrder: 5,   companyId: companyAId },
      { code: "TRA-006", name: "Trasporto Camion",       description: "Trasporto con camion grande",        unitType: "NUM" as const, pricingLogic: "TRANSPORT" as const, basePrice: "150.00", pricingData: { fixedPrice: 150.00, pricePerKm: 1.20 },         isChecklistItem: 0, checklistOrder: 100, companyId: companyAId },
      { code: "RDC-007", name: "Relazione di Calcolo",   description: "Documentazione tecnica obbligatoria",unitType: "NUM" as const, pricingLogic: "DOCUMENT" as const,  basePrice: "350.00", pricingData: { price: 350.00 },                                 isChecklistItem: 0, checklistOrder: 101, companyId: companyAId },
    ]);

    // ─── RIEPILOGO ────────────────────────────────────────────────────────────────
    console.log("");
    console.log("✅ Seeding completato con successo!");
    console.log("");
    console.log("📊 Creati:");
    console.log("   - 2 aziende (Scaffolding Pro + Edil Service)");
    console.log("   - 1 utente admin → admin@test.it / password");
    console.log("   - 5 pipeline stages per ciascuna azienda");
    console.log("   - 3 lead per Company A con 4 opportunità");
    console.log("   - 2 lead per Company B");
    console.log("   - 7 articoli nel listino");
    console.log("");
    console.log("🔑 Credenziali di accesso:");
    console.log("   Email:    admin@test.it");
    console.log("   Password: password");
    console.log("   Ruolo:    COMPANY_ADMIN");

  } catch (error) {
    console.error("❌ Errore durante il seeding:", error);
    throw error;
  }
}

seed()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
