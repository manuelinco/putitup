import { useAuth } from "@/contexts/auth";
import { Zap, Trophy, Database, TrendingUp } from "lucide-react";

export function LoginScreen({ telegramOnboarding = false }: { telegramOnboarding?: boolean }) {
  const { connectWallet, skipWalletConnect, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{ minHeight: "100dvh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid #7c3aed", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100dvh",
      background: "linear-gradient(160deg, #0a0a0f 0%, #13091f 60%, #0a0a0f 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 28 }}>

        {/* Hero */}
        <div style={{ textAlign: "center", paddingTop: 16 }}>
          <div style={{ position: "relative", display: "inline-block", marginBottom: 16 }}>
            <div style={{
              position: "absolute", inset: -12,
              background: "radial-gradient(circle, rgba(124,58,237,0.35) 0%, transparent 70%)",
              borderRadius: "50%",
            }} />
            <Zap size={64} color="#7c3aed" style={{ display: "block", position: "relative" }} />
          </div>
          <h1 style={{
            fontSize: 42, fontWeight: 900, letterSpacing: "-1px", margin: "0 0 8px",
            background: "linear-gradient(135deg, #7c3aed, #a78bfa, #6d28d9)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            PUTITUP
          </h1>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: "0 0 6px" }}>
            {telegramOnboarding ? "Connetti il tuo TON Wallet" : "Human-in-the-Loop AI Data"}
          </p>
          <p style={{ fontSize: 13, color: "#888", margin: 0, lineHeight: 1.5 }}>
            {telegramOnboarding
              ? "Collega il wallet per ricevere i tuoi guadagni in TON. Puoi saltare e aggiungerlo dopo."
              : "Etichetta dati AI. Guadagna TON crypto. Alimenta il futuro dell'AI."}
          </p>
        </div>

        {/* Features (show only on non-onboarding) */}
        {!telegramOnboarding && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { Icon: Trophy, label: "Classifica globale", color: "#facc15" },
              { Icon: TrendingUp, label: "XP & Livelli", color: "#34d399" },
              { Icon: Database, label: "Dataset validati", color: "#60a5fa" },
              { Icon: Zap, label: "Ricompense TON", color: "#a78bfa" },
            ].map(({ Icon, label, color }) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 10, padding: "10px 12px",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <Icon size={16} color={color} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#ddd" }}>{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* TON Wallet visual (only during onboarding) */}
        {telegramOnboarding && (
          <div style={{
            background: "rgba(124,58,237,0.08)",
            border: "1px solid rgba(124,58,237,0.25)",
            borderRadius: 14, padding: "20px 16px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: "50%",
              background: "linear-gradient(135deg, #0088cc, #005fa3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 28, fontWeight: 900, color: "#fff",
            }}>
              ◆
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#fff" }}>TON Wallet</p>
              <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Ricevi 0,00004 TON per ogni task completato</p>
            </div>
          </div>
        )}

        {/* CTA */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button
            onClick={connectWallet}
            style={{
              width: "100%", height: 56, borderRadius: 12, border: "none",
              background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
              color: "#fff", fontSize: 16, fontWeight: 900, cursor: "pointer",
              boxShadow: "0 0 30px rgba(124,58,237,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              transition: "box-shadow 0.2s",
            }}
          >
            <span style={{ fontSize: 20 }}>◆</span>
            {telegramOnboarding ? "Connetti TON Wallet" : "Connect TON Wallet"}
          </button>

          {telegramOnboarding && (
            <button
              onClick={skipWalletConnect}
              style={{
                background: "none", border: "none", color: "#888",
                fontSize: 13, cursor: "pointer", padding: "8px 0",
                textDecoration: "underline", textUnderlineOffset: 3,
              }}
            >
              Salta, aggiungo il wallet dopo →
            </button>
          )}

          <p style={{ fontSize: 11, textAlign: "center", color: "#555", margin: 0, lineHeight: 1.5 }}>
            {telegramOnboarding
              ? "Il wallet non è obbligatorio per iniziare"
              : "Apri in Telegram per il login automatico."}
          </p>
        </div>

        {/* Footer */}
        <p style={{ fontSize: 10, textAlign: "center", color: "#444", margin: 0 }}>
          Powered by TON Blockchain · PUTITUP © 2025
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
