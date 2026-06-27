/**
 * Stripe product seeder — run once to create PUTITUP plans in Stripe.
 * Usage: pnpm --filter @workspace/scripts exec tsx src/seed-products.ts
 *
 * Idempotent: skips creation if product already exists.
 */

import { getUncachableStripeClient } from "../../artifacts/api-server/src/lib/stripeClient";

const PLANS = [
  {
    name: "Starter",
    description: "Unlimited access to BASIC datasets. Perfect for individuals and small teams.",
    monthly_eur: 999,   // €9.99
    yearly_eur: 9588,   // €95.88 (save ~20%)
    metadata: { plan: "starter", tier: "basic" },
  },
  {
    name: "Business",
    description: "BASIC + MEDIUM datasets plus custom dataset requests. For growing companies.",
    monthly_eur: 1999,  // €19.99
    yearly_eur: 19188,  // €191.88 (save ~20%)
    metadata: { plan: "business", tier: "medium" },
  },
];

async function seed() {
  const stripe = await getUncachableStripeClient();
  console.log("Connected to Stripe\n");

  for (const plan of PLANS) {
    // Check if product already exists
    const existing = await stripe.products.search({
      query: `name:'${plan.name}' AND active:'true'`,
    });

    let productId: string;

    if (existing.data.length > 0) {
      productId = existing.data[0].id;
      console.log(`[skip] ${plan.name} already exists (${productId})`);
    } else {
      const product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: plan.metadata,
      });
      productId = product.id;
      console.log(`[create] ${plan.name} → ${productId}`);
    }

    // Prices (check by metadata)
    const existingPrices = await stripe.prices.list({ product: productId, active: true });

    const hasMonthly = existingPrices.data.some((p) => p.recurring?.interval === "month");
    const hasYearly  = existingPrices.data.some((p) => p.recurring?.interval === "year");

    if (!hasMonthly) {
      const p = await stripe.prices.create({
        product: productId,
        unit_amount: plan.monthly_eur,
        currency: "eur",
        recurring: { interval: "month" },
        metadata: { plan: plan.metadata.plan, billing: "monthly" },
      });
      console.log(`  [price] monthly €${(plan.monthly_eur / 100).toFixed(2)}/mo → ${p.id}`);
    } else {
      console.log(`  [skip] monthly price already exists`);
    }

    if (!hasYearly) {
      const p = await stripe.prices.create({
        product: productId,
        unit_amount: plan.yearly_eur,
        currency: "eur",
        recurring: { interval: "year" },
        metadata: { plan: plan.metadata.plan, billing: "yearly" },
      });
      console.log(`  [price] yearly €${(plan.yearly_eur / 100).toFixed(2)}/yr → ${p.id}`);
    } else {
      console.log(`  [skip] yearly price already exists`);
    }

    console.log();
  }

  console.log("Done. Webhook will sync data to the local database automatically.");
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
