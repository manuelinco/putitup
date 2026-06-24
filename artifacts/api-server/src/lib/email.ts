const RESEND_API_KEY = process.env["RESEND_API_KEY"];
const FROM = "PUTITUP Business <noreply@putitupbusiness.it>";

/** Escape HTML per prevenire XSS in template email */
function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

function otpEmailHtml(code: string, isNewUser: boolean): string {
  const safeCode = escHtml(code);
  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Il tuo codice PUTITUP</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f8;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- Logo header -->
        <tr>
          <td align="center" style="padding-bottom:24px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background-color:#7c3aed;border-radius:10px;width:40px;height:40px;text-align:center;vertical-align:middle;">
                  <span style="font-size:22px;line-height:40px;">&#9889;</span>
                </td>
                <td style="padding-left:10px;vertical-align:middle;">
                  <span style="font-size:22px;font-weight:900;color:#1a1a2e;letter-spacing:-0.5px;">PUTIT<span style="color:#7c3aed;">UP</span></span>
                  <span style="margin-left:6px;font-size:10px;background-color:#ede9fe;color:#7c3aed;border-radius:20px;padding:2px 8px;font-weight:700;letter-spacing:0.5px;vertical-align:middle;">BUSINESS</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Main card -->
        <tr>
          <td style="background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e2ef;">

            <!-- Purple top bar -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background-color:#7c3aed;height:5px;font-size:0;line-height:0;">&nbsp;</td>
              </tr>
            </table>

            <!-- Card content -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:40px 48px;">

                  <!-- Title -->
                  <p style="margin:0 0 8px;font-size:24px;font-weight:800;color:#1a1a2e;">
                    ${isNewUser ? "Benvenuto su PUTITUP &#127881;" : "Il tuo codice di accesso"}
                  </p>
                  <p style="margin:0 0 32px;font-size:15px;color:#6b7280;line-height:1.6;">
                    ${isNewUser
                      ? "La tua registrazione è quasi completa. Inserisci il codice di verifica qui sotto per attivare il tuo account."
                      : "Hai richiesto l'accesso al tuo account PUTITUP Business. Usa il codice qui sotto entro 10 minuti."}
                  </p>

                  <!-- OTP box -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                    <tr>
                      <td style="background-color:#f5f3ff;border:2px solid #7c3aed;border-radius:12px;padding:28px;text-align:center;">
                        <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#7c3aed;">Codice di verifica</p>
                        <p style="margin:0;font-size:48px;font-weight:900;letter-spacing:14px;color:#1a1a2e;font-family:'Courier New',Courier,monospace;">${safeCode}</p>
                        <p style="margin:12px 0 0;font-size:13px;color:#9ca3af;">Valido per <strong style="color:#4b5563;">10 minuti</strong></p>
                      </td>
                    </tr>
                  </table>

                  <!-- Security notice -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                    <tr>
                      <td style="background-color:#fef9f0;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:14px 18px;">
                        <p style="margin:0;font-size:13px;color:#78350f;line-height:1.5;">
                          <strong>&#128274; Non condividere questo codice</strong> con nessuno.<br/>
                          PUTITUP non ti chiederà mai questo codice per telefono o via email.
                        </p>
                      </td>
                    </tr>
                  </table>

                  <!-- Help text -->
                  <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
                    Hai bisogno di aiuto? Scrivi a <a href="mailto:support@putitupbusiness.it" style="color:#7c3aed;text-decoration:none;font-weight:600;">support@putitupbusiness.it</a>
                  </p>

                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 0;text-align:center;">
            <p style="margin:0 0 6px;font-size:12px;color:#9ca3af;">
              PUTITUP S.r.l. &middot; AI Data Platform
            </p>
            <p style="margin:0;font-size:12px;">
              <a href="https://putitupbusiness.it" style="color:#7c3aed;text-decoration:none;">putitupbusiness.it</a>
              &nbsp;&middot;&nbsp;
              <a href="https://putitupbusiness.it/catalog" style="color:#9ca3af;text-decoration:none;">Catalogo Dataset</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const IS_DEV = process.env.NODE_ENV !== "production";

export interface SendOtpResult {
  sent: boolean;
  devCode?: string;
}

export async function sendOtpEmail(
  to: string,
  code: string,
  isNewUser: boolean
): Promise<SendOtpResult> {
  if (IS_DEV) {
    console.log(`\n📧 OTP DEV MODE — to: ${to} | code: ${code} | newUser: ${isNewUser}\n`);
  }

  if (!RESEND_API_KEY) {
    if (IS_DEV) return { sent: false, devCode: code };
    throw new Error("RESEND_API_KEY not configured");
  }

  const subject = isNewUser
    ? `${code} — Codice di verifica PUTITUP Business`
    : `${code} — Il tuo codice di accesso PUTITUP`;

  const body = JSON.stringify({
    from: FROM,
    to: [to],
    subject,
    html: otpEmailHtml(code, isNewUser),
    text: `Il tuo codice PUTITUP Business: ${code}\n\nValido 10 minuti. Non condividerlo con nessuno.\n\n— PUTITUP Business`,
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
    const errText = await res.text();
    console.error(`Resend error ${res.status}: ${errText}`);
    if (IS_DEV) return { sent: false, devCode: code };
    throw new Error(`Resend error ${res.status}: ${errText}`);
  }

  return { sent: true };
}
