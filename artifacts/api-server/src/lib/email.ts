const RESEND_API_KEY = process.env["RESEND_API_KEY"];
const FROM = "PUTITUP Business <noreply@putitupbusiness.it>";

function otpEmailHtml(code: string, isNewUser: boolean): string {
  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Il tuo codice PUTITUP</title>
</head>
<body style="margin:0;padding:0;background:#0a0a12;font-family:'Inter',Arial,sans-serif;color:#fff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a12;padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#13131f;border-radius:16px;border:1px solid #1e1e3a;overflow:hidden;max-width:520px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a0a3a 0%,#0f0f2a 100%);padding:32px 40px;text-align:center;border-bottom:1px solid #2d1b69;">
            <div style="display:inline-flex;align-items:center;gap:10px;">
              <div style="width:36px;height:36px;background:#7c3aed;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;">
                <span style="font-size:20px;line-height:1;">⚡</span>
              </div>
              <span style="font-size:20px;font-weight:900;letter-spacing:-0.5px;">PUTIT<span style="color:#a855f7;">UP</span></span>
              <span style="font-size:11px;background:#1e0a4e;color:#a855f7;border:1px solid #4c1d95;border-radius:20px;padding:2px 8px;font-weight:600;letter-spacing:0.5px;">BUSINESS</span>
            </div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#fff;">
              ${isNewUser ? "Benvenuto su PUTITUP 🎉" : "Il tuo codice di accesso"}
            </h1>
            <p style="margin:0 0 28px;font-size:14px;color:#888;line-height:1.6;">
              ${isNewUser
                ? "Grazie per esserti registrato alla piattaforma dati AI più avanzata d'Europa. Inserisci il codice qui sotto per completare la registrazione."
                : "Hai richiesto un codice di accesso al tuo account PUTITUP Business. Inseriscilo nella pagina di login entro 10 minuti."}
            </p>

            <!-- OTP Code Box -->
            <div style="background:#0f0f2a;border:2px solid #4c1d95;border-radius:12px;padding:28px;text-align:center;margin-bottom:28px;">
              <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#7c3aed;font-weight:600;">Codice di verifica</p>
              <div style="font-size:42px;font-weight:900;letter-spacing:12px;color:#a855f7;font-family:'Courier New',monospace;">${code}</div>
              <p style="margin:12px 0 0;font-size:12px;color:#555;">⏱ Valido per <strong style="color:#888;">10 minuti</strong></p>
            </div>

            <!-- Security notice -->
            <div style="background:#1a0a0a;border:1px solid #3a1515;border-radius:8px;padding:16px;margin-bottom:28px;">
              <p style="margin:0;font-size:12px;color:#888;line-height:1.5;">
                🔒 <strong style="color:#cc4444;">Non condividere questo codice</strong> con nessuno.<br/>
                PUTITUP non ti chiederà mai questo codice per telefono o email.<br/>
                Se non hai richiesto questo codice, ignora questa email.
              </p>
            </div>

            <p style="margin:0;font-size:12px;color:#555;line-height:1.5;">
              Hai bisogno di aiuto? Rispondi a questa email o scrivi a <a href="mailto:support@putitupbusiness.it" style="color:#a855f7;">support@putitupbusiness.it</a>
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#0f0f1a;border-top:1px solid #1e1e3a;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#444;line-height:1.6;">
              PUTITUP S.r.l. · AI Data Platform<br/>
              <a href="https://putitupbusiness.it" style="color:#7c3aed;text-decoration:none;">putitupbusiness.it</a>
              &nbsp;·&nbsp;
              <a href="https://putitupbusiness.it/catalog" style="color:#555;text-decoration:none;">Catalogo Dataset</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendOtpEmail(to: string, code: string, isNewUser: boolean): Promise<void> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

  const subject = isNewUser
    ? `⚡ ${code} — Codice di verifica PUTITUP`
    : `⚡ ${code} — Il tuo codice di accesso PUTITUP`;

  const body = JSON.stringify({
    from: FROM,
    to: [to],
    subject,
    html: otpEmailHtml(code, isNewUser),
    text: `Il tuo codice PUTITUP Business: ${code}\n\nValido 10 minuti. Non condividerlo con nessuno.`,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error ${res.status}: ${err}`);
  }
}
