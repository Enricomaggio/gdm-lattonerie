import bcrypt from "bcryptjs";
import { db } from "../server/db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";

async function resetPasswords() {
  const password = "123456";
  const hashedPassword = await bcrypt.hash(password, 12);
  
  console.log("Resetting passwords for all users to '123456'...");
  console.log("Hash generated:", hashedPassword);
  
  // Update SUPER_ADMIN
  await db.update(users)
    .set({ password: hashedPassword })
    .where(eq(users.email, "enricomaggio@gmail.com"));
  console.log("Updated: enricomaggio@gmail.com");
  
  // Update COMPANY_ADMIN
  await db.update(users)
    .set({ password: hashedPassword })
    .where(eq(users.email, "info@enricomaggiolo.com"));
  console.log("Updated: info@enricomaggiolo.com");
  
  console.log("Done! All users can now login with password: 123456");
  process.exit(0);
}

resetPasswords().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
