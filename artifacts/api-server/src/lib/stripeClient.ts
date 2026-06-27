import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

async function getStripeCredentials(): Promise<{ secretKey: string; webhookSecret?: string }> {
  const hostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  const identity = process.env["REPL_IDENTITY"];

  if (!hostname || !identity) {
    throw new Error("Missing Replit connector env vars (REPLIT_CONNECTORS_HOSTNAME / REPL_IDENTITY).");
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": `repl ${identity}`,
      },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!resp.ok) throw new Error(`Stripe connector fetch failed: ${resp.status}`);

  const data = await resp.json() as {
    items?: { settings?: { secret?: string; publishable?: string; webhook_secret?: string } }[];
  };

  const settings = data.items?.[0]?.settings;
  if (!settings?.secret) {
    throw new Error("Stripe integration not connected or missing secret key.");
  }

  return { secretKey: settings.secret, webhookSecret: settings.webhook_secret };
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}

export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const { secretKey, webhookSecret } = await getStripeCredentials();
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret ?? "",
  });
}
