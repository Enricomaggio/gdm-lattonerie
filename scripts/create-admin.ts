// Script per creare l'utente admin iniziale (SUPER_ADMIN)
// Esegui con: npx tsx scripts/create-admin.ts

import { db } from "../server/db";
import { companies, userCompanies } from "../shared/schema";
import { users } from "../shared/models/auth";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const ADMIN_EMAIL = "admin@gestionale.it";
const ADMIN_PASSWORD = "Admin2024!";
const DEFAULT_COMPANY_NAME = "Azienda Demo";

async function createAdmin() {
  console.log("🚀 Creazione utente admin iniziale...");

  try {
    // ─── 1. Verifica se esiste già almeno una company ─────────────────────────
    const existingCompanies = await db.select().from(companies);

    let companyId: string;

    if (existingCompanies.length === 0) {
      console.log(`📦 Nessuna company trovata. Creazione di "${DEFAULT_COMPANY_NAME}"...`);
      const [newCompany] = await db.insert(companies).values({
        name: DEFAULT_COMPANY_NAME,
      }).returning();
      companyId = newCompany.id;
      console.log(`   ✓ Company creata con ID: ${companyId}`);
    } else {
      companyId = existingCompanies[0].id;
      console.log(`   ✓ Company esistente trovata: "${existingCompanies[0].name}" (ID: ${companyId})`);
    }

    // ─── 2. Verifica se l'utente admin esiste già ─────────────────────────────
    const existingAdmin = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL));

    if (existingAdmin.length > 0) {
      console.log(`⚠️  L'utente ${ADMIN_EMAIL} esiste già. Nessuna modifica effettuata.`);
      process.exit(0);
    }

    // ─── 3. Crea l'utente SUPER_ADMIN ─────────────────────────────────────────
    console.log("👤 Creazione utente SUPER_ADMIN...");
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

    const [adminUser] = await db.insert(users).values({
      email: ADMIN_EMAIL,
      password: hashedPassword,
      firstName: "Admin",
      lastName: "Principale",
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    }).returning();

    // ─── 4. Collega utente alla company ───────────────────────────────────────
    await db.insert(userCompanies).values({
      userId: adminUser.id,
      companyId: companyId,
    });

    console.log("");
    console.log("✅ Utente admin creato con successo!");
    console.log("");
    console.log("🔑 Credenziali di accesso:");
    console.log(`   Email:    ${ADMIN_EMAIL}`);
    console.log(`   Password: ${ADMIN_PASSWORD}`);
    console.log("   Ruolo:    SUPER_ADMIN");
    console.log("");

  } catch (error) {
    console.error("❌ Errore durante la creazione dell'admin:", error);
    throw error;
  }
}

createAdmin()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
