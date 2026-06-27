import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Shield, ArrowLeft, ExternalLink } from "lucide-react";

const LAST_UPDATED = "26 June 2025";
const CONTACT_EMAIL = "privacy@putitupbusiness.it";

export default function PrivacyPage() {
  const [, navigate] = useLocation();

  return (
    <Layout>
      <div className="p-4 pb-10 space-y-5 max-w-lg mx-auto">
        <div className="flex items-center gap-3 pt-2">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h1 className="text-lg font-black">Privacy & Terms</h1>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">Last updated: {LAST_UPDATED}</p>

        <section className="space-y-3">
          <h2 className="font-bold text-sm border-b border-border pb-1.5">Privacy Policy</h2>
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p>PUTITUP collects the following data when you use this Mini App:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><span className="text-foreground font-semibold">Telegram profile data</span> — user ID, username, display name (provided by Telegram upon launch).</li>
              <li><span className="text-foreground font-semibold">TON wallet address</span> — provided by you via TON Connect to receive rewards.</li>
              <li><span className="text-foreground font-semibold">Task responses</span> — your labeling answers and associated timestamps.</li>
              <li><span className="text-foreground font-semibold">Activity data</span> — XP, level, energy, streaks, leaderboard position.</li>
            </ul>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-bold text-sm border-b border-border pb-1.5">Legal Basis (GDPR)</h2>
          <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
            <p>We process your data to provide the labeling service (contract performance, Art. 6(1)(b) GDPR) and to maintain platform security and quality (legitimate interest, Art. 6(1)(f) GDPR).</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-bold text-sm border-b border-border pb-1.5">Data Retention</h2>
          <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
            <p>Account data is retained for the duration of your activity plus 2 years. Task responses are retained indefinitely as part of the validated dataset. You may request deletion at any time.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-bold text-sm border-b border-border pb-1.5">TON Rewards</h2>
          <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
            <p>You earn <span className="text-foreground font-semibold">0.00004 TON per approved task</span>. Rewards are held in a custody ledger and released to your connected wallet upon admin approval. PUTITUP does not guarantee a minimum reward; payout depends on task quality and consensus threshold.</p>
            <p className="mt-1">TON transactions are recorded on the public TON blockchain. Blockchain records are irreversible and publicly visible.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-bold text-sm border-b border-border pb-1.5">Terms of Service</h2>
          <div className="text-xs text-muted-foreground leading-relaxed space-y-2">
            <p>By using PUTITUP you agree to:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Label tasks honestly and to the best of your ability</li>
              <li>Not use bots, scripts, or automated tools to complete tasks or ad challenges</li>
              <li>Not attempt to manipulate the consensus or reward system</li>
              <li>Not create multiple accounts to gain unfair advantages</li>
            </ul>
            <p>Violations result in permanent account suspension and forfeiture of pending rewards.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-bold text-sm border-b border-border pb-1.5">Ad Challenges</h2>
          <div className="text-xs text-muted-foreground leading-relaxed">
            <p>Ads are shown to energy recharge. Each ad includes an anti-bot challenge (dot chase / word pick). These challenges are required to verify you are human. Failure to complete them honestly will result in reduced rewards.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-bold text-sm border-b border-border pb-1.5">Your Rights</h2>
          <div className="text-xs text-muted-foreground leading-relaxed">
            <p>Under GDPR you have the right to access, correct, delete, or port your data. Contact us at:</p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="flex items-center gap-1 mt-1.5 text-primary font-semibold"
            >
              {CONTACT_EMAIL} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-bold text-sm border-b border-border pb-1.5">Governing Law</h2>
          <div className="text-xs text-muted-foreground leading-relaxed">
            <p>These terms are governed by Italian law and EU regulations. Disputes are subject to the exclusive jurisdiction of Italian courts, with EU consumer protection rules applying where applicable.</p>
          </div>
        </section>

        <div className="pt-2 text-center text-[10px] text-muted-foreground">
          © {new Date().getFullYear()} PUTITUP. All rights reserved.
        </div>
      </div>
    </Layout>
  );
}
