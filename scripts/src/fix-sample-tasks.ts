import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    console.log("Counting Sample text tasks...");
    const count = await client.query(`
      SELECT COUNT(*) AS n FROM tasks
      WHERE data_payload->>'text' LIKE 'Sample text%'
    `);
    const total = Number(count.rows[0].n);
    console.log(`Found ${total} tasks to fix.`);
    if (total === 0) { console.log("Nothing to do."); return; }

    // Converti tutti i task "Sample text" → image task con URL picsum deterministico
    // Singola query: type='image', rimuove text, aggiunge imageUrl + question italiani
    console.log("Running bulk UPDATE (image conversion)...");
    const t0 = Date.now();
    const result = await client.query(`
      UPDATE tasks
      SET
        type = 'image',
        data_payload = (
          data_payload::jsonb
          - 'text'
          || jsonb_build_object(
              'imageUrl',
              'https://picsum.photos/seed/r-' || dataset_id::text || '-' || id::text || '/640/420',
              'question',
              CASE
                WHEN data_payload->'options' @> '["spam","not_spam"]'::jsonb
                  OR data_payload->'options' @> '["not_spam","spam"]'::jsonb
                  THEN 'Questa immagine contiene elementi di spam o contenuto inappropriato?'
                WHEN data_payload->'options' @> '["positive","negative","neutral"]'::jsonb
                  OR data_payload->'options' @> '["negative","positive","neutral"]'::jsonb
                  THEN 'Qual è il tono generale espresso da questa immagine?'
                WHEN data_payload->'options' @> '["complaint","question","return","compliment","billing"]'::jsonb
                  THEN 'A quale categoria appartiene il contenuto di questa immagine?'
                ELSE 'Qual è il contenuto principale di questa immagine?'
              END
          )
        )
      WHERE data_payload->>'text' LIKE 'Sample text%'
    `);
    const ms = Date.now() - t0;
    console.log(`✓ Updated ${result.rowCount} tasks in ${ms}ms`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
