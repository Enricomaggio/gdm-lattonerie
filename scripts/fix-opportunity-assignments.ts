import { db } from "../server/db";
import { leads, opportunities } from "../shared/schema";
import { eq, isNull, inArray } from "drizzle-orm";

const OPPORTUNITY_PATTERN = /^\d+-\d{4}$/;

async function fixOpportunityAssignments() {
  console.log("Starting fix: syncing assignedToUserId from leads to imported opportunities...");

  const nullOpps = await db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      leadId: opportunities.leadId,
    })
    .from(opportunities)
    .where(isNull(opportunities.assignedToUserId));

  const toUpdate = nullOpps.filter(o => OPPORTUNITY_PATTERN.test(o.title ?? ""));

  console.log(`Found ${nullOpps.length} opportunities with null assignedToUserId.`);
  console.log(`Of those, ${toUpdate.length} match pattern NNN-AAAA and will be processed.`);

  if (toUpdate.length === 0) {
    console.log("Nothing to update. Exiting.");
    process.exit(0);
  }

  const leadIds = Array.from(new Set(toUpdate.map(o => o.leadId)));

  const leadsData = await db
    .select({ id: leads.id, assignedToUserId: leads.assignedToUserId })
    .from(leads)
    .where(inArray(leads.id, leadIds));

  const leadMap = new Map(leadsData.map(l => [l.id, l.assignedToUserId]));

  let updated = 0;
  let skipped = 0;

  for (const opp of toUpdate) {
    const assignedUserId = leadMap.get(opp.leadId);
    if (!assignedUserId) {
      console.log(`  SKIP opportunity "${opp.title}" (id: ${opp.id}): lead ${opp.leadId} has no assignedToUserId`);
      skipped++;
      continue;
    }

    await db
      .update(opportunities)
      .set({ assignedToUserId: assignedUserId, updatedAt: new Date() })
      .where(eq(opportunities.id, opp.id));

    console.log(`  UPDATED opportunity "${opp.title}" (id: ${opp.id}) -> userId: ${assignedUserId}`);
    updated++;
  }

  console.log(`\nDone! Updated: ${updated}, Skipped (lead has no assignedToUserId): ${skipped}`);
  process.exit(0);
}

fixOpportunityAssignments().catch((err) => {
  console.error("Error during fix:", err);
  process.exit(1);
});
