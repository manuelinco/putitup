import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth";
import { Loader2, CheckCircle, XCircle, Zap, Wallet, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE } from "@/lib/api";

async function fetchWithTimeout(url: string, ms = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

type Status = "idle" | "checking" | "available" | "taken" | "invalid";

export function NicknameModal() {
  const { completeRegistration, connectWallet, pendingWallet, pendingTelegramId } = useAuth();
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    if (username.length < 3) {
      setStatus("idle");
      setReason("");
      return;
    }
    setStatus("checking");
    const t = setTimeout(async () => {
      try {
        const res = await fetchWithTimeout(
          `${API_BASE}/api/users/check-username/${encodeURIComponent(username)}`
        );
        const data = await res.json();
        if (data.available) {
          setStatus("available");
          setReason("");
        } else {
          setStatus(data.reason ? "invalid" : "taken");
          setReason(data.reason ?? "Username already taken, choose another");
        }
      } catch {
        setStatus("idle");
        setReason("Slow connection, please retry");
      }
    }, 500);
    return () => clearTimeout(t);
  }, [username]);

  const handleSubmit = async () => {
    if (status !== "available" || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await completeRegistration(username);
      setSubmitSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration error";
      setSubmitError(
        msg.includes("abort") || msg.includes("signal") || msg.includes("timeout")
          ? "Server is slow, retry in a few seconds."
          : msg
      );
      setSubmitting(false);
    }
  };

  const buttonLabel = () => {
    if (submitting) return "Creating account...";
    if (submitSuccess) return "Signing in...";
    if (status === "idle" && username.length === 0) return "Enter your username";
    if (status === "idle" && username.length < 3) return "Minimum 3 characters";
    if (status === "checking") return "Checking availability...";
    if (status === "taken" || status === "invalid") return "Username not available";
    if (status === "available") return "Start earning →";
    return "Enter your username";
  };

  const isEnabled = status === "available" && !submitting && !submitSuccess;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(10,10,20,0.95)",
        backdropFilter: "blur(8px)",
        padding: "16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "360px",
          background: "#13131f",
          border: "1px solid rgba(168,85,247,0.3)",
          borderRadius: "20px",
          padding: "28px 20px",
          boxShadow: "0 0 60px rgba(168,85,247,0.2)",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "rgba(168,85,247,0.15)",
              border: "2px solid rgba(168,85,247,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 12px",
              fontSize: "24px",
            }}
          >
            ⚡
          </div>
          <h2 style={{ fontSize: "20px", fontWeight: 900, color: "#fff", margin: 0 }}>
            Choose your username
          </h2>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            {pendingTelegramId ? (
              <><span style={{ color: "#a855f7" }}>Telegram verified</span> — pick a unique name</>
            ) : pendingWallet ? (
              <><span style={{ color: "#a855f7" }}>{pendingWallet.slice(0, 6)}…</span> connected</>
            ) : (
              "Choose a name to get started"
            )}
          </p>
        </div>

        {/* Input */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20));
                setSubmitError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="e.g. DataHunter99"
              autoFocus
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "14px 44px 14px 16px",
                borderRadius: "12px",
                fontSize: "16px",
                fontWeight: 700,
                color: "#fff",
                background: "#1a1a2e",
                border: `2px solid ${
                  status === "available" ? "#22c55e" :
                  status === "taken" || status === "invalid" ? "#ef4444" :
                  status === "checking" ? "#a855f7" :
                  "#2d2d4e"
                }`,
                outline: "none",
                transition: "border-color 0.2s",
              }}
            />
            <div style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)" }}>
              {status === "checking" && <Loader2 style={{ width: 18, height: 18, color: "#a855f7", animation: "spin 1s linear infinite" }} />}
              {status === "available" && <CheckCircle style={{ width: 18, height: 18, color: "#22c55e" }} />}
              {(status === "taken" || status === "invalid") && <XCircle style={{ width: 18, height: 18, color: "#ef4444" }} />}
            </div>
          </div>

          {/* Status message below input */}
          <div style={{ minHeight: "20px", marginTop: "6px" }}>
            {status === "available" && (
              <p style={{ fontSize: "12px", color: "#22c55e", fontWeight: 700, margin: 0 }}>
                ✓ Available! Press the button below to continue
              </p>
            )}
            {(status === "taken" || status === "invalid") && (
              <p style={{ fontSize: "12px", color: "#ef4444", margin: 0 }}>
                ✗ {reason || "Username not available, choose another"}
              </p>
            )}
            {status === "checking" && (
              <p style={{ fontSize: "12px", color: "#a855f7", margin: 0 }}>
                Checking availability...
              </p>
            )}
            {status === "idle" && username.length > 0 && username.length < 3 && (
              <p style={{ fontSize: "12px", color: "#666", margin: 0 }}>
                Minimum 3 characters (letters, numbers, _)
              </p>
            )}
            {status === "idle" && username.length === 0 && (
              <p style={{ fontSize: "12px", color: "#444", margin: 0 }}>
                Letters, numbers and underscore · 3–20 characters
              </p>
            )}
          </div>
        </div>

        {/* Submit error */}
        {submitError && (
          <div
            style={{
              display: "flex",
              gap: "8px",
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "10px",
              padding: "12px",
              marginBottom: "12px",
            }}
          >
            <AlertCircle style={{ width: 16, height: 16, color: "#ef4444", flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: "12px", color: "#ef4444", margin: 0 }}>{submitError}</p>
          </div>
        )}

        {/* Optional wallet button */}
        {!!pendingTelegramId && !pendingWallet && (
          <button
            type="button"
            onClick={connectWallet}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              borderRadius: "10px",
              border: "1px dashed rgba(168,85,247,0.4)",
              background: "rgba(168,85,247,0.05)",
              padding: "10px",
              fontSize: "12px",
              fontWeight: 600,
              color: "#a855f7",
              cursor: "pointer",
              marginBottom: "12px",
            }}
          >
            <Wallet style={{ width: 14, height: 14 }} />
            Connect TON Wallet (optional)
          </button>
        )}

        {/* Main CTA button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isEnabled}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: "12px",
            border: "none",
            fontSize: "16px",
            fontWeight: 800,
            cursor: isEnabled ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "all 0.2s",
            background: isEnabled
              ? "linear-gradient(135deg, #7c3aed, #a855f7)"
              : "#1e1e2e",
            color: isEnabled ? "#fff" : "#555",
            boxShadow: isEnabled ? "0 0 24px rgba(168,85,247,0.4)" : "none",
          }}
        >
          {(submitting || submitSuccess) && (
            <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} />
          )}
          {!submitting && !submitSuccess && status === "available" && (
            <Zap style={{ width: 18, height: 18 }} />
          )}
          {buttonLabel()}
        </button>

        <p style={{ textAlign: "center", fontSize: "11px", color: "#444", marginTop: "12px" }}>
          TON wallet is optional — you can add it later
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
