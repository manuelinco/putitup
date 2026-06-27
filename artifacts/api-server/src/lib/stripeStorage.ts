import { sql } from "drizzle-orm";
import { db, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export class StripeStorage {
  async listProductsWithPrices(active = true) {
    const result = await db.execute(sql`
      WITH prods AS (
        SELECT id, name, description, metadata, active
        FROM stripe.products WHERE active = ${active} ORDER BY name
      )
      SELECT
        p.id            AS product_id,
        p.name          AS product_name,
        p.description   AS product_description,
        p.metadata      AS product_metadata,
        pr.id           AS price_id,
        pr.unit_amount,
        pr.currency,
        pr.recurring,
        pr.active       AS price_active
      FROM prods p
      LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      ORDER BY p.name, pr.unit_amount
    `);
    return result.rows;
  }

  async getPrice(priceId: string) {
    const result = await db.execute(sql`SELECT * FROM stripe.prices WHERE id = ${priceId}`);
    return result.rows[0] ?? null;
  }

  async getClientByEmail(email: string) {
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.email, email));
    return client ?? null;
  }

  async updateClientStripe(clientId: number, data: { stripeCustomerId?: string; stripeSubscriptionId?: string; plan?: string }) {
    const [updated] = await db.update(clientsTable).set(data).where(eq(clientsTable.id, clientId)).returning();
    return updated;
  }

  async getClientSubscription(stripeSubscriptionId: string) {
    const result = await db.execute(sql`SELECT * FROM stripe.subscriptions WHERE id = ${stripeSubscriptionId}`);
    return result.rows[0] ?? null;
  }
}

export const stripeStorage = new StripeStorage();
