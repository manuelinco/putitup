import { getUncachableStripeClient } from "./stripeClient";
import { stripeStorage } from "./stripeStorage";

const VALID_PAID_PLANS = ["starter", "business", "premium"];

function normalizePlan(value?: unknown): string | null {
  if (!value) return null;
  const p = String(value).toLowerCase().trim();
  return VALID_PAID_PLANS.includes(p) ? p : null;
}

/**
 * Derive the app plan from a Stripe price object. Prefers the price's own
 * metadata.plan, falling back to its product's metadata.plan.
 */
function planFromPrice(price: any): string | null {
  if (!price) return null;
  const fromPrice = normalizePlan(price.metadata?.plan);
  if (fromPrice) return fromPrice;
  const product = price.product;
  if (product && typeof product === "object" && product.metadata) {
    return normalizePlan(product.metadata.plan);
  }
  return null;
}

/**
 * Confirm a completed Stripe Checkout session and grant the corresponding plan
 * to the client. The plan is derived from the actual Stripe price (never from
 * the request) so a client can only receive what they paid for.
 * Throws if the session does not belong to the authenticated client.
 */
export async function applyCheckoutSession(
  clientId: number,
  sessionId: string,
  expectedCustomerId: string | null,
): Promise<{ plan: string | null; status: string | null }> {
  const stripe = await getUncachableStripeClient();
  const session = (await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription", "line_items.data.price.product"],
  })) as any;

  // Ownership: the session must have been created for THIS client at checkout
  // time (client_reference_id) AND its customer must match the client's stored
  // Stripe customer. Both are required so a paid session can never be replayed
  // against a different account, even one that has no customer yet.
  if (String(session.client_reference_id ?? "") !== String(clientId)) {
    throw new Error("This checkout session does not belong to your account");
  }
  const sessionCustomer =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  if (!expectedCustomerId || !sessionCustomer || sessionCustomer !== expectedCustomerId) {
    throw new Error("This checkout session does not belong to your account");
  }

  // Payment validity: the session must be completed AND either marked paid or
  // backed by an active/trialing subscription. 'complete' alone is not enough
  // (e.g. fully-discounted or trial sessions with no successful charge).
  const subscription = session.subscription;
  const subscriptionId = typeof subscription === "string" ? subscription : subscription?.id ?? null;
  const subStatus =
    subscription && typeof subscription === "object" ? (subscription.status as string | null) : null;
  const completed = session.status === "complete";
  const paid = session.payment_status === "paid";
  const subActive = subStatus === "active" || subStatus === "trialing";
  if (!completed || !(paid || subActive)) {
    return { plan: null, status: session.status ?? null };
  }

  const price = session.line_items?.data?.[0]?.price;
  const plan = planFromPrice(price);

  if (plan && subscriptionId) {
    await stripeStorage.updateClientStripe(clientId, { plan, stripeSubscriptionId: subscriptionId });
  }

  return { plan, status: session.status ?? null };
}

/**
 * Reconcile a client's stored plan against the live Stripe subscription:
 * - active/trialing -> ensure plan matches the subscribed price
 * - anything else   -> downgrade to free
 * Never throws: on any Stripe error it returns the currently stored plan so
 * /auth/client/me keeps working even when Stripe is unreachable. Clients with
 * no subscription id incur no Stripe API call.
 */
export async function reconcileClientPlan(client: Record<string, any>): Promise<string> {
  const current = (client.plan as string) ?? "free";
  const subscriptionId = client.stripeSubscriptionId as string | null | undefined;
  if (!subscriptionId) return current;

  try {
    const stripe = await getUncachableStripeClient();
    const sub = (await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price.product"],
    })) as any;

    const active = sub.status === "active" || sub.status === "trialing";
    if (!active) {
      if (current !== "free") {
        await stripeStorage.updateClientStripe(client.id as number, { plan: "free" });
      }
      return "free";
    }

    const price = sub.items?.data?.[0]?.price;
    const plan = planFromPrice(price) ?? current;
    if (plan !== current) {
      await stripeStorage.updateClientStripe(client.id as number, { plan });
    }
    return plan;
  } catch {
    return current;
  }
}
