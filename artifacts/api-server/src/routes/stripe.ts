import { Router, type IRouter } from "express";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { stripeStorage } from "../lib/stripeStorage";
import { authenticateClient } from "../lib/clientAuth";
import { applyCheckoutSession } from "../lib/stripePlanSync";

const router: IRouter = Router();

function baseUrl(): string {
  return process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
    : "https://putitupbusiness.it";
}

// List all active products with their prices (for pricing page)
router.get("/stripe/products", async (_req, res): Promise<void> => {
  try {
    const stripe = await getUncachableStripeClient();
    const [products, prices] = await Promise.all([
      stripe.products.list({ active: true, limit: 100 }),
      stripe.prices.list({ active: true, limit: 100 }),
    ]);

    const result = products.data.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description ?? null,
      metadata: (product.metadata ?? {}) as Record<string, string>,
      prices: prices.data
        .filter((p) => p.product === product.id)
        .map((p) => ({
          id: p.id,
          unit_amount: p.unit_amount ?? 0,
          currency: p.currency,
          interval: p.recurring?.interval ?? null,
        })),
    }));

    res.json({ products: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Could not load products";
    res.status(500).json({ error: msg });
  }
});

// Create a Stripe Checkout session for a plan. Requires an authenticated client;
// the customer is derived from the session token (never from the request body)
// so a user can only start checkout for their own account.
// Body: { priceId }
router.post("/stripe/checkout", async (req, res): Promise<void> => {
  const auth = await authenticateClient(req);
  if (!auth) {
    res.status(401).json({ error: "Please sign in to subscribe" });
    return;
  }

  const { priceId } = req.body ?? {};
  if (!priceId) {
    res.status(400).json({ error: "priceId is required" });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    const email = auth.client.email as string;

    let stripeCustomerId = (auth.client.stripeCustomerId as string | null) ?? null;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { clientId: String(auth.clientId) },
      });
      stripeCustomerId = customer.id;
      await stripeStorage.updateClientStripe(auth.clientId, { stripeCustomerId });
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      client_reference_id: String(auth.clientId),
      success_url: `${baseUrl()}/putitup-business/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl()}/putitup-business/pricing?checkout=cancelled`,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
    });

    res.json({ url: session.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Checkout session failed";
    res.status(500).json({ error: msg });
  }
});

// Confirm a completed checkout on return and grant the paid plan.
// Body: { sessionId }
router.post("/stripe/confirm", async (req, res): Promise<void> => {
  const auth = await authenticateClient(req);
  if (!auth) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { sessionId } = req.body ?? {};
  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }

  try {
    const expectedCustomerId = (auth.client.stripeCustomerId as string | null) ?? null;
    const result = await applyCheckoutSession(auth.clientId, String(sessionId), expectedCustomerId);
    res.json({ ok: true, plan: result.plan, status: result.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Could not confirm payment";
    res.status(400).json({ error: msg });
  }
});

// Customer portal — manage subscription / billing. Requires an authenticated client.
router.post("/stripe/portal", async (req, res): Promise<void> => {
  const auth = await authenticateClient(req);
  if (!auth) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    const stripeCustomerId = (auth.client.stripeCustomerId as string | null) ?? null;
    if (!stripeCustomerId) {
      res.status(404).json({ error: "No Stripe customer found for this account" });
      return;
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${baseUrl()}/putitup-business/dashboard`,
    });
    res.json({ url: session.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Portal session failed";
    res.status(500).json({ error: msg });
  }
});

export default router;
