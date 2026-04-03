// Script di seeding per popolare il database con dati di test
// Esegui con: npx tsx scripts/seed.ts

import { db } from "../server/db";
import { companies, leads, opportunities, pipelineStages, articles } from "../shared/schema";
import { eq } from "drizzle-orm";

const companyAId = "company-a-test-id";
const companyBId = "company-b-test-id";

async function seed() {
  console.log("🌱 Inizio seeding del database...");

  try {
    // Crea Company A
    console.log("📦 Creazione Company A (Scaffolding Pro)...");
    await db.insert(companies).values({
      id: companyAId,
      name: "Scaffolding Pro S.r.l.",
      vatNumber: "IT12345678901",
    }).onConflictDoNothing();

    // Crea Company B  
    console.log("📦 Creazione Company B (Edil Service)...");
    await db.insert(companies).values({
      id: companyBId,
      name: "Edil Service S.p.A.",
      vatNumber: "IT98765432109",
    }).onConflictDoNothing();

    // Crea le fasi pipeline per Company A (se non esistono)
    console.log("🔧 Creazione fasi pipeline per Company A...");
    const existingStagesA = await db.select().from(pipelineStages).where(eq(pipelineStages.companyId, companyAId));
    
    let stagesA: { id: string; name: string; order: number; color: string }[] = [];
    
    if (existingStagesA.length === 0) {
      const defaultStagesA = [
        { name: "Nuova Opportunità", order: 1, color: "#61CE85", companyId: companyAId },
        { name: "Contattato", order: 2, color: "#4563FF", companyId: companyAId },
        { name: "Sopralluogo", order: 3, color: "#F59E0B", companyId: companyAId },
        { name: "Preventivo Inviato", order: 4, color: "#8B5CF6", companyId: companyAId },
        { name: "Vinto", order: 5, color: "#059669", companyId: companyAId },
        { name: "Perso", order: 6, color: "#EF4444", companyId: companyAId },
      ];
      
      stagesA = await db.insert(pipelineStages).values(defaultStagesA).returning();
    } else {
      stagesA = existingStagesA;
    }

    // Lead per Company A (mix di COMPANY e PRIVATE)
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

    // Opportunità per i lead di Company A
    console.log("🎯 Creazione opportunità per Company A...");
    
    // Costruzioni Rossi ha 2 opportunità in stadi diversi
    const opportunitiesData = [
      {
        title: "Cantiere Via Roma 15",
        description: "Ristrutturazione edificio residenziale 5 piani",
        value: "25000",
        stageId: stagesA.find(s => s.name === "Preventivo Inviato")?.id || stagesA[3]?.id,
        leadId: "lead-costruzioni-rossi",
        companyId: companyAId,
        probability: 70,
      },
      {
        title: "Nuovo Complesso Residenziale Est",
        description: "Costruzione nuovo condominio 8 piani",
        value: "45000",
        stageId: stagesA.find(s => s.name === "Sopralluogo")?.id || stagesA[2]?.id,
        leadId: "lead-costruzioni-rossi",
        companyId: companyAId,
        probability: 40,
      },
      {
        title: "Villetta Bianchi",
        description: "Ristrutturazione villetta privata",
        value: "12000",
        stageId: stagesA.find(s => s.name === "Contattato")?.id || stagesA[1]?.id,
        leadId: "lead-laura-bianchi",
        companyId: companyAId,
        probability: 50,
      },
      {
        title: "Stabilimento Industriale Nord",
        description: "Manutenzione capannone industriale",
        value: "18500",
        stageId: stagesA.find(s => s.name === "Vinto")?.id || stagesA[4]?.id,
        leadId: "lead-edil-green",
        companyId: companyAId,
        probability: 100,
      },
      {
        title: "Eco-Residence Green Valley",
        description: "Costruzione residenziale green",
        value: "55000",
        stageId: stagesA.find(s => s.name === "Nuova Opportunità")?.id || stagesA[0]?.id,
        leadId: "lead-edil-green",
        companyId: companyAId,
        probability: 20,
      },
    ];

    for (const opp of opportunitiesData) {
      if (opp.stageId) {
        await db.insert(opportunities).values(opp).onConflictDoNothing();
      }
    }

    // Lead per Company B
    console.log("👥 Creazione contatti per Company B...");
    const leadsCompanyB = [
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
    ];

    for (const lead of leadsCompanyB) {
      await db.insert(leads).values(lead).onConflictDoNothing();
    }

    // Seeding Articoli Listino per Company A
    console.log("📋 Creazione listino articoli per Company A...");
    
    // Elimina articoli esistenti per Company A e ricrea con nuovi dati
    await db.delete(articles).where(eq(articles.companyId, companyAId));
    
    const articlesData = [
      // Voci Checklist Preventivatore (14 voci principali) - RENTAL con scaglioni
      { 
        code: "PON-001", 
        name: "Ponteggio", 
        description: "Ponteggio prefabbricato standard",
        unitType: "MQ" as const, 
        pricingLogic: "RENTAL" as const, 
        basePrice: "8.50",
        pricingData: { 
          firstMonthPrice: 8.50, 
          dailyExtraPrice: 0.28,
          tiers: [
            { months: "1-2", price: 8.50 },
            { months: "3-5", price: 7.50 },
            { months: "6+", price: 6.50 }
          ]
        },
        isChecklistItem: 1, 
        checklistOrder: 1, 
        companyId: companyAId 
      },
      { 
        code: "PDC-002", 
        name: "Piani di carico", 
        description: "Piani di carico per materiali",
        unitType: "CAD" as const, 
        pricingLogic: "RENTAL" as const, 
        basePrice: "45.00",
        pricingData: { firstMonthPrice: 45.00, dailyExtraPrice: 1.50 },
        isChecklistItem: 1, 
        checklistOrder: 2, 
        companyId: companyAId 
      },
      { 
        code: "CIE-003", 
        name: "Cielo", 
        description: "Copertura superiore ponteggio",
        unitType: "MQ" as const, 
        pricingLogic: "RENTAL" as const, 
        basePrice: "12.00",
        pricingData: { firstMonthPrice: 12.00, dailyExtraPrice: 0.40 },
        isChecklistItem: 1, 
        checklistOrder: 3, 
        companyId: companyAId 
      },
      { 
        code: "PAR-004", 
        name: "Parapetti", 
        description: "Parapetti di sicurezza",
        unitType: "ML" as const, 
        pricingLogic: "RENTAL" as const, 
        basePrice: "6.00",
        pricingData: { firstMonthPrice: 6.00, dailyExtraPrice: 0.20 },
        isChecklistItem: 1, 
        checklistOrder: 4, 
        companyId: companyAId 
      },
      { 
        code: "MEN-005", 
        name: "Mensole", 
        description: "Mensole di appoggio",
        unitType: "CAD" as const, 
        pricingLogic: "RENTAL" as const, 
        basePrice: "35.00",
        pricingData: { firstMonthPrice: 35.00, dailyExtraPrice: 1.17 },
        isChecklistItem: 1, 
        checklistOrder: 5, 
        companyId: companyAId 
      },
      { 
        code: "MON-006", 
        name: "Montacarichi", 
        description: "Sistema montacarichi elettrico",
        unitType: "CAD" as const, 
        pricingLogic: "RENTAL" as const, 
        basePrice: "250.00",
        pricingData: { firstMonthPrice: 250.00, dailyExtraPrice: 8.33 },
        isChecklistItem: 1, 
        checklistOrder: 6, 
        companyId: companyAId 
      },
      { 
        code: "MCO-007", 
        name: "Monocolonna", 
        description: "Struttura monocolonna",
        unitType: "CAD" as const, 
        pricingLogic: "RENTAL" as const, 
        basePrice: "180.00",
        pricingData: { firstMonthPrice: 180.00, dailyExtraPrice: 6.00 },
        isChecklistItem: 1, 
        checklistOrder: 7, 
        companyId: companyAId 
      },
      { 
        code: "BCO-008", 
        name: "Bicolonna", 
        description: "Struttura bicolonna",
        unitType: "CAD" as const, 
        pricingLogic: "RENTAL" as const, 
        basePrice: "320.00",
        pricingData: { firstMonthPrice: 320.00, dailyExtraPrice: 10.67 },
        isChecklistItem: 1, 
        checklistOrder: 8, 
        companyId: companyAId 
      },
      { 
        code: "COP-009", 
        name: "Copertura", 
        description: "Telo copertura protettiva",
        unitType: "MQ" as const, 
        pricingLogic: "RENTAL" as const, 
        basePrice: "15.00",
        pricingData: { firstMonthPrice: 15.00, dailyExtraPrice: 0.50 },
        isChecklistItem: 1, 
        checklistOrder: 9, 
        companyId: companyAId 
      },
      { 
        code: "ALL-010", 
        name: "Allarme", 
        description: "Sistema allarme antintrusione",
        unitType: "CAD" as const, 
        pricingLogic: "RENTAL" as const, 
        basePrice: "75.00",
        pricingData: { firstMonthPrice: 75.00, dailyExtraPrice: 2.50 },
        isChecklistItem: 1, 
        checklistOrder: 10, 
        companyId: companyAId 
      },
      { 
        code: "MAN-011", 
        name: "Mantovana", 
        description: "Mantovana di protezione",
        unitType: "ML" as const, 
        pricingLogic: "RENTAL" as const, 
        basePrice: "18.00",
        pricingData: { firstMonthPrice: 18.00, dailyExtraPrice: 0.60 },
        isChecklistItem: 1, 
        checklistOrder: 11, 
        companyId: companyAId 
      },
      { 
        code: "TUG-012", 
        name: "Tubo e giunto", 
        description: "Sistema tubo e giunto",
        unitType: "ML" as const, 
        pricingLogic: "RENTAL" as const, 
        basePrice: "4.50",
        pricingData: { firstMonthPrice: 4.50, dailyExtraPrice: 0.15 },
        isChecklistItem: 1, 
        checklistOrder: 12, 
        companyId: companyAId 
      },
      { 
        code: "TUT-013", 
        name: "Tubo + tavola", 
        description: "Sistema tubo e tavola",
        unitType: "ML" as const, 
        pricingLogic: "RENTAL" as const, 
        basePrice: "7.00",
        pricingData: { firstMonthPrice: 7.00, dailyExtraPrice: 0.23 },
        isChecklistItem: 1, 
        checklistOrder: 13, 
        companyId: companyAId 
      },
      { 
        code: "CES-014", 
        name: "Cesta", 
        description: "Cesta per materiali",
        unitType: "CAD" as const, 
        pricingLogic: "EXTRA" as const, 
        basePrice: "50.00",
        pricingData: { price: 50.00 },
        isChecklistItem: 1, 
        checklistOrder: 14, 
        companyId: companyAId 
      },
      
      // Voci di servizio
      { 
        code: "TRA-015", 
        name: "Trasporto Camion Grande", 
        description: "Trasporto con camion grande capacità",
        unitType: "NUM" as const, 
        pricingLogic: "TRANSPORT" as const, 
        basePrice: "150.00",
        pricingData: { fixedPrice: 150.00, pricePerKm: 1.20, capacity: 3000 },
        isChecklistItem: 0, 
        checklistOrder: 100, 
        companyId: companyAId 
      },
      { 
        code: "MOP-016", 
        name: "Manodopera Montaggio", 
        description: "Servizio montaggio e smontaggio",
        unitType: "MQ" as const, 
        pricingLogic: "LABOR" as const, 
        basePrice: "0.00",
        pricingData: { mountPrice: 12.00, dismountPrice: 8.00 },
        isChecklistItem: 0, 
        checklistOrder: 101, 
        companyId: companyAId 
      },
      { 
        code: "RDC-017", 
        name: "Relazione di Calcolo", 
        description: "Documentazione tecnica obbligatoria",
        unitType: "NUM" as const, 
        pricingLogic: "DOCUMENT" as const, 
        basePrice: "350.00",
        pricingData: { price: 350.00 },
        isChecklistItem: 0, 
        checklistOrder: 102, 
        companyId: companyAId 
      },
    ];

    for (const article of articlesData) {
      await db.insert(articles).values(article);
    }
    console.log("   - Creati 17 articoli nel listino (14 checklist + 3 servizi)")

    console.log("✅ Seeding completato con successo!");
    console.log("📊 Creati:");
    console.log("   - 2 aziende (Company A e Company B)");
    console.log("   - 3 lead per Company A con 5 opportunità in varie fasi");
    console.log("   - 2 lead per Company B");
    console.log("   - 16 articoli nel listino (14 checklist + 2 servizi)");
    console.log("");
    console.log("💡 Esempio di 1 Lead con multiple Opportunità:");
    console.log("   Marco Rossi ha 2 opportunità: 'Cantiere Via Roma 15' e 'Nuovo Complesso Residenziale Est'");

  } catch (error) {
    console.error("❌ Errore durante il seeding:", error);
    throw error;
  }
}

seed()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
