import { Link } from "wouter";
import { Shield, ArrowLeft } from "lucide-react";
import Footer from "@/components/footer";

const LAST_UPDATED = "26 June 2025";
const CONTROLLER = "PUTITUP – putitupbusiness.it";
const CONTACT_EMAIL = "privacy@putitupbusiness.it";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Navbar mini */}
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors text-sm">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <span className="text-muted-foreground/40">|</span>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">Privacy Policy</span>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-3xl w-full px-6 py-12 space-y-10">
        <div>
          <h1 className="text-3xl font-black mb-2">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED} &middot; Effective immediately</p>
        </div>

        <Section title="1. Data Controller">
          <p>The data controller for personal data processed through the PUTITUP Business platform is:</p>
          <p className="mt-2 font-semibold">{CONTROLLER}</p>
          <p className="mt-1">Contact: <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-4">{CONTACT_EMAIL}</a></p>
        </Section>

        <Section title="2. Data We Collect">
          <p>When you use the PUTITUP Business platform we collect the following categories of personal data:</p>
          <ul className="mt-3 space-y-2 list-none">
            {[
              ["Account data", "First name, last name, email address, company name, VAT/Codice Fiscale, phone number, billing address."],
              ["Usage data", "Pages visited, datasets viewed and unlocked, download activity, session duration."],
              ["Technical data", "IP address, browser type and version, operating system, referring URL, time zone."],
              ["Communication data", "Messages sent through the platform contact form or email support."],
            ].map(([label, desc]) => (
              <li key={label} className="pl-4 border-l-2 border-primary/30">
                <span className="font-semibold">{label}:</span> <span className="text-muted-foreground">{desc}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="3. Legal Basis for Processing">
          <p>We process your personal data on the following legal bases under Art. 6 GDPR:</p>
          <ul className="mt-3 space-y-2 list-disc pl-5 text-muted-foreground">
            <li><span className="text-foreground font-semibold">Contract performance (Art. 6(1)(b))</span> — to create and manage your account, provide access to datasets, and process subscriptions.</li>
            <li><span className="text-foreground font-semibold">Legitimate interest (Art. 6(1)(f))</span> — to analyse platform usage, prevent fraud, improve services, and ensure security.</li>
            <li><span className="text-foreground font-semibold">Legal obligation (Art. 6(1)(c))</span> — to comply with applicable tax, accounting, and regulatory obligations.</li>
            <li><span className="text-foreground font-semibold">Consent (Art. 6(1)(a))</span> — for optional marketing communications. You may withdraw consent at any time.</li>
          </ul>
        </Section>

        <Section title="4. How We Use Your Data">
          <ul className="space-y-1.5 list-disc pl-5 text-muted-foreground">
            <li>Creating and managing your account and subscription</li>
            <li>Providing access to purchased or unlocked datasets</li>
            <li>Processing payments and issuing invoices</li>
            <li>Sending transactional emails (OTP codes, access confirmations)</li>
            <li>Analysing platform usage to improve features and content quality</li>
            <li>Detecting and preventing abusive, fraudulent, or illegal activity</li>
            <li>Complying with legal and regulatory requirements</li>
          </ul>
        </Section>

        <Section title="5. Data Retention">
          <p className="text-muted-foreground">We retain your personal data only as long as necessary for the purposes described above:</p>
          <ul className="mt-3 space-y-2 list-disc pl-5 text-muted-foreground">
            <li><span className="text-foreground">Account data</span> — retained for the duration of your account plus 2 years after deletion, unless longer retention is required by law.</li>
            <li><span className="text-foreground">Billing/invoice data</span> — retained for 10 years as required by Italian and EU tax law.</li>
            <li><span className="text-foreground">Technical/usage logs</span> — retained for 12 months then automatically deleted.</li>
            <li><span className="text-foreground">OTP verification codes</span> — retained for 10 minutes from issuance.</li>
          </ul>
        </Section>

        <Section title="6. Data Sharing and Third Parties">
          <p className="text-muted-foreground">We do not sell your personal data. We share data only with:</p>
          <ul className="mt-3 space-y-2 list-disc pl-5 text-muted-foreground">
            <li><span className="text-foreground">Payment processors</span> (Stripe, Inc.) — to handle subscription and one-off payments. Governed by Stripe's Privacy Policy.</li>
            <li><span className="text-foreground">Cloud infrastructure providers</span> — for hosting the platform (Render, Neon). All operate under GDPR-compliant DPAs.</li>
            <li><span className="text-foreground">Legal authorities</span> — when required by applicable law or court order.</li>
          </ul>
        </Section>

        <Section title="7. International Transfers">
          <p className="text-muted-foreground">
            Some service providers (e.g. Stripe, Render) may transfer data outside the European Economic Area. Such transfers are subject to appropriate safeguards (Standard Contractual Clauses or equivalent) in accordance with Chapter V GDPR.
          </p>
        </Section>

        <Section title="8. Cookies">
          <p className="text-muted-foreground">
            We use strictly necessary session cookies to maintain your authenticated session. We do not use tracking or advertising cookies. Your session token is stored in your browser's localStorage and expires upon logout.
          </p>
        </Section>

        <Section title="9. Your Rights (GDPR)">
          <p className="text-muted-foreground">Under the GDPR you have the following rights regarding your personal data:</p>
          <ul className="mt-3 space-y-1.5 list-disc pl-5 text-muted-foreground">
            <li><span className="text-foreground">Right of access</span> — request a copy of your personal data (Art. 15)</li>
            <li><span className="text-foreground">Right to rectification</span> — correct inaccurate data (Art. 16)</li>
            <li><span className="text-foreground">Right to erasure</span> — request deletion of your data ("right to be forgotten") (Art. 17)</li>
            <li><span className="text-foreground">Right to restriction</span> — restrict processing in certain circumstances (Art. 18)</li>
            <li><span className="text-foreground">Right to data portability</span> — receive your data in a structured, machine-readable format (Art. 20)</li>
            <li><span className="text-foreground">Right to object</span> — object to processing based on legitimate interest (Art. 21)</li>
            <li><span className="text-foreground">Right to withdraw consent</span> — at any time, without affecting prior lawful processing</li>
          </ul>
          <p className="mt-3 text-muted-foreground">
            To exercise any right, contact us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-4">{CONTACT_EMAIL}</a>. We respond within 30 days. You also have the right to lodge a complaint with the Italian data protection authority (<a href="https://www.garanteprivacy.it" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">Garante per la protezione dei dati personali</a>).
          </p>
        </Section>

        <Section title="10. Data Security">
          <p className="text-muted-foreground">
            We implement technical and organisational measures to protect your data, including TLS encryption in transit, bcrypt password hashing, HMAC-SHA256 session tokens, rate limiting, and access controls. No transmission over the internet is completely secure; please notify us immediately of any suspected breach.
          </p>
        </Section>

        <Section title="11. Changes to This Policy">
          <p className="text-muted-foreground">
            We may update this Privacy Policy periodically. Material changes will be notified by email or by a prominent notice on the platform at least 15 days before taking effect. Continued use of the platform after that date constitutes acceptance of the updated policy.
          </p>
        </Section>

        <Section title="12. Contact">
          <p className="text-muted-foreground">
            For any privacy-related questions, data subject requests, or complaints, contact our data protection team at:<br />
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
