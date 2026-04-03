import fs from 'fs';
import csv from 'csv-parser';
import pg from 'pg';

const { Client } = pg;

const connectionString = "postgresql://neondb_owner:npg_rX1AHNF3tZez@ep-fancy-flower-ahl0w2t4.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";

const client = new Client({
  connectionString: connectionString,
});

async function runUpdate() {
  try {
    await client.connect();
    console.log("🚀 CONNESSO A NEON PROD");

    const rows = [];
    fs.createReadStream('indirizzi.csv')
      .pipe(csv())
      .on('data', (data) => rows.push(data))
      .on('end', async () => {
        console.log(`📊 Totale record nel CSV: ${rows.length}`);

        let updatedCount = 0;
        let notFoundCount = 0;

        for (const row of rows) {
          if (!row.id) continue;

          try {
            const query = `
              UPDATE opportunities 
              SET 
                site_address = COALESCE(NULLIF($1, ''), site_address), 
                site_city = COALESCE(NULLIF($2, ''), site_city) 
              WHERE id = $3
            `;
            const values = [
              row.site_address?.trim() || '', 
              row.site_city?.trim() || '', 
              row.id.trim()
            ];

            const res = await client.query(query, values);

            if (res.rowCount > 0) {
              updatedCount++;
              if (updatedCount % 100 === 0) console.log(`✅ Progress: ${updatedCount} aggiornati...`);
            } else {
              notFoundCount++;
            }
          } catch (err) {
            console.error(`❌ Errore su ID ${row.id}:`, err.message);
          }
        }

        console.log("\n--- FINITO ---");
        console.log(`✅ Aggiornati: ${updatedCount}`);
        console.log(`⚠️ Non trovati: ${notFoundCount}`);

        await client.end();
        process.exit(0);
      });

  } catch (err) {
    console.error("🔴 Errore connessione:", err.message);
    process.exit(1);
  }
}

runUpdate();