import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enum per i ruoli utente
export const userRoleEnum = ["SUPER_ADMIN", "COMPANY_ADMIN", "SALES_AGENT", "TECHNICIAN"] as const;
export type UserRole = typeof userRoleEnum[number];

// Enum per lo stato utente
export const userStatusEnum = ["ACTIVE", "SUSPENDED"] as const;
export type UserStatus = typeof userStatusEnum[number];

// Session storage table (mantenuta per compatibilità)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table con Email/Password authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  password: varchar("password").notNull(),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  profileImageUrl: varchar("profile_image_url"),
  profileImageData: text("profile_image_data"),
  role: varchar("role").$type<UserRole>().notNull().default("SALES_AGENT"),
  status: varchar("status").$type<UserStatus>().notNull().default("ACTIVE"),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  // Campi profilo per documenti
  displayName: varchar("display_name"),        // Nome che appare nei documenti
  contactEmail: varchar("contact_email"),      // Email di contatto (diversa da login)
  phone: varchar("phone"),                     // Numero di telefono
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Schema di validazione per registrazione
export const registerUserSchema = z.object({
  email: z.string().email("Email non valida"),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri").regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "La password deve contenere almeno una maiuscola, una minuscola e un numero"),
  firstName: z.string().min(1, "Nome richiesto"),
  lastName: z.string().min(1, "Cognome richiesto"),
});

// Schema di validazione per login
export const loginUserSchema = z.object({
  email: z.string().email("Email non valida"),
  password: z.string().min(1, "Password richiesta"),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type RegisterUser = z.infer<typeof registerUserSchema>;
export type LoginUser = z.infer<typeof loginUserSchema>;
