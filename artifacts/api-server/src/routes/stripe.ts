import { Router, type IRouter } from "express";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { stripeStorage } from "../lib/stripeStorage";

const router: IRouter = Router();

// List all active products with their prices (for pricing page)
router.get("/stripe/products", async (_req, res): Promise<void> => {
  try {
    const rows = await stripeStorage.listProductsWithPrices();

    const map = new Map<string, {
      id: string; name: string; description: string | null;
      metadata: Record<string, string>; prices: { id: string; unit_amount: number; currency: string; interval: string | null }[];
    }>();

    for (const row of rows as Record<string, unknown>[]) {
      const pid = row.product_id as string;
      if (!map.has(pid)) {
        map.set(pid, {
          id: pid,
          name: row.product_name as string,
          description: (row.product_description as string | null) ?? null,
          metadata: (row.product_metadata as Record<string, string>) ?? {},
          prices: [],
        });
      }
      if (row.price_id) {
        const recurring = row.recurring as { interval?: string } | null;
        map.get(pid)!.prices.push({
          id: row.price_id as string,
          unit_amount: row.unit_amount as number,
          currency: row.currency as string,
          interval: recurring?.interval ?? null,
        });
      }
    }

    res.json({ products: Array.from(map.values()) });
  } catch (err) {
    res.status(500).json({ error: "Could not load products" });
  }
});

// Create Stripe Checkout session for a plan
// Body: { email, clientId, priceId, successUrl, cancelUrl }
router.post("/stripe/checkout", async (req, res): Promise<void> => {
  const { email, clientId, priceId, successUrl, cancelUrl } = req.body ?? {};

  if (!email || !priceId) {
    res.status(400).json({ error: "email and priceId are required" });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();

    // Reuse or create Stripe customer
    let stripeCustomerId: string | null = null;
    if (clientId) {
      const client = await stripeStorage.getClientByEmail(email);
      if (client?.stripeCustomerId) {
        stripeCustomerId = client.stripeCustomerId;
      }
    }

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({ email });
      stripeCustomerId = customer.id;
      if (clientId) {
        await stripeStorage.updateClientStripe(Number(clientId), { stripeCustomerId });
      }
    }

    const baseUrl = process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : "https://putitupbusiness.it";

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: successUrl ?? `${baseUrl}/putitup-business/dashboard?checkout=success`,
      cancel_url: cancelUrl ?? `${baseUrl}/putitup-business/pricing?checkout=cancelled`,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
    });

    res.json({ url: session.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Checkout session failed";
    res.status(500).json({ error: msg });
  }
});

// Customer portal — manage subscription / billing
// Body: { email }
router.post("/stripe/portal", async (req, res): Promise<void> => {
  const { email } = req.body ?? {};
  if (!email) { res.status(400).json({ error: "email required" }); return; }

  try {
    const stripe = await getUncachableStripeClient();
    const client = await stripeStorage.getClientByEmail(email);
    if (!client?.stripeCustomerId) {
      res.status(404).json({ error: "No Stripe customer found for this account" });
      return;
    }
    const baseUrl = "https://putitupbusiness.it";
    const session = await stripe.billingPortal.sessions.create({
      customer: client.stripeCustomerId,
      return_url: `${baseUrl}/putitup-business/dashboard`,
    });
    res.json({ url: session.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Portal session failed";
    res.status(500).json({ error: msg });
  }
});

export default router;
