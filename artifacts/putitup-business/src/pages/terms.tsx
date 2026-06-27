import { Link } from "wouter";
import { FileText, ArrowLeft } from "lucide-react";
import Footer from "@/components/footer";

const LAST_UPDATED = "26 June 2025";
const CONTACT_EMAIL = "legal@putitupbusiness.it";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors text-sm">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <span className="text-muted-foreground/40">|</span>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">Terms of Service</span>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-3xl w-full px-6 py-12 space-y-10">
        <div>
          <h1 className="text-3xl font-black mb-2">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED} &middot; Effective immediately</p>
        </div>

        <div className="p-4 rounded-xl bg-primary/10 border border-primary/30 text-sm">
          By accessing or using the PUTITUP Business platform you agree to be bound by these Terms of Service and our <Link href="/privacy" className="text-primary underline underline-offset-4">Privacy Policy</Link>. If you do not agree, do not use the platform.
        </div>

        <Section title="1. Definitions">
          <ul className="space-y-1.5 list-disc pl-5 text-muted-foreground">
            <li><span className="text-foreground">"Platform"</span> — the PUTITUP Business web application at putitupbusiness.it and its API.</li>
            <li><span className="text-foreground">"Service"</span> — access to human-validated AI training datasets provided through the Platform.</li>
            <li><span className="text-foreground">"Client" / "you"</span> — any registered business or individual accessing the Service.</li>
            <li><span className="text-foreground">"Datasets"</span> — curated, labelled data collections made available through the Platform.</li>
            <li><span className="text-foreground">"PUTITUP" / "we" / "us"</span> — the operator of the Platform (putitupbusiness.it).</li>
          </ul>
        </Section>

        <Section title="2. Account Registration">
          <p className="text-muted-foreground">To access premium features you must register for an account. You agree to:</p>
          <ul className="mt-2 space-y-1 list-disc pl-5 text-muted-foreground">
            <li>Provide accurate, complete, and up-to-date information (including VAT number where applicable)</li>
            <li>Maintain the security of your session credentials and notify us immediately of any unauthorised use</li>
            <li>Use a valid professional email address that you control</li>
            <li>Not create accounts for third parties without their consent</li>
          </ul>
          <p className="mt-2 text-muted-foreground">We reserve the right to suspend or terminate accounts that violate these terms or provide false information.</p>
        </Section>

        <Section title="3. Subscription Plans and Billing">
          <p className="text-muted-foreground">The Platform offers the following subscription tiers:</p>
          <ul className="mt-3 space-y-2 list-none">
            {[
              ["Free", "€0/month", "Access to 5 ads per dataset; BASIC datasets only via ad challenges."],
              ["Starter", "€9.99/month", "Unlimited access to BASIC datasets; 5 ad challenges for MEDIUM datasets."],
              ["Business", "€19.99/month", "Unlimited access to BASIC and MEDIUM datasets; custom dataset requests."],
              ["Premium", "Custom pricing", "Full access including PREMIUM datasets; dedicated support; SLA."],
            ].map(([plan, price, desc]) => (
              <li key={plan} className="p-3 rounded-lg border border-border bg-card/50 text-sm">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold">{plan}</span>
                  <span className="text-primary font-semibold">{price}</span>
                </div>
                <span className="text-muted-foreground">{desc}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-muted-foreground">
            Subscriptions are billed monthly or annually (with a discount) in advance. Payments are processed by Stripe, Inc. All prices are exclusive of applicable VAT unless stated otherwise. We reserve the right to change pricing with 30 days' notice.
          </p>
        </Section>

        <Section title="4. Cancellation and Refunds">
          <p className="text-muted-foreground">
            You may cancel your subscription at any time from your dashboard. Cancellation takes effect at the end of the current billing period; you retain access until then. We do not provide refunds for partial billing periods except where required by applicable EU consumer law. For annual plans, a pro-rata refund may be issued within 14 days of the initial purchase (EU statutory cooling-off right).
          </p>
        </Section>

        <Section title="5. Dataset Licence">
          <p className="text-muted-foreground">
            Upon unlocking or subscribing to a dataset, PUTITUP grants you a non-exclusive, non-transferable, revocable licence to use the dataset solely for your internal AI/ML research and development purposes. You may not:
          </p>
          <ul className="mt-2 space-y-1 list-disc pl-5 text-muted-foreground">
            <li>Resell, sublicence, or redistribute the dataset or any portion thereof</li>
            <li>Use the dataset to train models intended for illegal, harmful, or discriminatory purposes</li>
            <li>Reverse-engineer or attempt to identify individual data contributors</li>
            <li>Remove or alter any proprietary notices or labels</li>
          </ul>
          <p className="mt-2 text-muted-foreground">Datasets remain the property of PUTITUP. Your licence terminates immediately upon account cancellation or breach of these terms.</p>
        </Section>

        <Section title="6. Ad-Based Unlocking">
          <p className="text-muted-foreground">
            Free and certain paid tiers may unlock datasets by watching interactive advertisements. Each ad session includes anti-bot verification challenges. Attempting to circumvent, automate, or manipulate the ad-watching or challenge system is a material breach of these terms and will result in immediate account suspension.
          </p>
        </Section>

        <Section title="7. Acceptable Use">
          <p className="text-muted-foreground">You agree not to:</p>
          <ul className="mt-2 space-y-1 list-disc pl-5 text-muted-foreground">
            <li>Use the Platform for any unlawful purpose or in violation of any applicable regulation</li>
            <li>Attempt to gain unauthorised access to any part of the Platform or its infrastructure</li>
            <li>Transmit viruses, malware, or any code of a destructive character</li>
            <li>Scrape, crawl, or otherwise harvest data from the Platform without our express written consent</li>
            <li>Use the Platform to compete directly with PUTITUP</li>
          </ul>
        </Section>

        <Section title="8. Intellectual Property">
          <p className="text-muted-foreground">
            All content on the Platform — including dataset schemas, interface designs, software, documentation, and branding — is owned by PUTITUP or its licensors and protected by applicable intellectual property law. You acquire no ownership rights by using the Service.
          </p>
        </Section>

        <Section title="9. Disclaimers and Limitation of Liability">
          <p className="text-muted-foreground">
            The Service is provided "as is" and "as available". PUTITUP makes no warranties, express or implied, regarding accuracy, completeness, fitness for a particular purpose, or uninterrupted availability of datasets.
          </p>
          <p className="mt-2 text-muted-foreground">
            To the maximum extent permitted by law, PUTITUP's total liability for any claim arising from your use of the Service shall not exceed the amount you paid us in the 3 months preceding the claim. PUTITUP is not liable for indirect, incidental, consequential, or punitive damages.
          </p>
        </Section>

        <Section title="10. Governing Law and Disputes">
          <p className="text-muted-foreground">
            These Terms are governed by Italian law and, where applicable, EU regulations (including GDPR and the Digital Services Act). Any dispute shall be submitted to the exclusive jurisdiction of the courts of Italy. For consumers within the EU, mandatory consumer-protection provisions of your country of residence may also apply. The European Commission's Online Dispute Resolution platform is available at <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">ec.europa.eu/consumers/odr</a>.
          </p>
        </Section>

        <Section title="11. Changes to These Terms">
          <p className="text-muted-foreground">
            We may modify these Terms at any time. Material changes will be communicated via email or prominent notice on the Platform at least 15 days before taking effect. Continued use after that date constitutes acceptance of the revised Terms.
          </p>
        </Section>

        <Section title="12. Contact">
          <p className="text-muted-foreground">
            Questions about these Terms? Contact us at:<br />
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-4">{CONTACT_EMAIL}</a>
          </p>
        </Section>
      </main>

      <Footer />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold border-b border-border pb-2">{title}</h2>
      <div className="text-sm leading-relaxed space-y-2">{children}</div>
    </section>
  );
}
