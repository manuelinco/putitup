# PUTITUP — Guida Deploy su putitupbusiness.it

## Architettura finale
| Cosa | Dove | URL |
|------|------|-----|
| Sito Business | Cloudflare Pages | https://putitupbusiness.it |
| Mini App TG | Cloudflare Pages | https://tg.putitupbusiness.it |
| API Server | Render.com | https://api.putitupbusiness.it |
| Database | Neon.tech | (connessione interna) |

---

## STEP 1 — GitHub (5 min)

1. Vai su github.com → **New repository** → nome `putitup` → Private → Create
2. Nella pagina del repo appena creato, copia i comandi "push an existing repository"
3. Aprire un terminale e incolla i comandi (oppure chiedi all'agente di fare il push)

---

## STEP 2 — Cloudflare: aggiungi dominio (10 min)

1. Vai su cloudflare.com → Sign Up (gratis)
2. **Add a Site** → inserisci `putitupbusiness.it` → piano **Free** → Continue
3. Cloudflare scansiona e ti mostra i nameserver attuali → clicca **Continue**
4. Copia i 2 **nameserver Cloudflare** (es. `aria.ns.cloudflare.com`, `bob.ns.cloudflare.com`)
5. Vai su **IONOS** → Dominio → Gestisci → Nameserver → cambia con quelli Cloudflare
6. Attendi 10-30 min per propagazione
7. Su Cloudflare: **SSL/TLS** → Full (strict) | **Edge Certificates** → Always Use HTTPS ✓

---

## STEP 3 — Database Neon (10 min)

1. Vai su neon.tech → Sign Up con GitHub → crea progetto → nome `putitup` → region **Frankfurt**
2. Copia la **Connection String** (inizia con `postgresql://...`)
3. Conservala: serve al STEP 4

---

## STEP 4 — API Server su Render (15 min)

1. Vai su render.com → Sign Up con GitHub
2. **New → Web Service** → collega il repo `putitup`
3. Impostazioni:
   - **Name**: `putitup-api`
   - **Region**: Frankfurt (EU Central)
   - **Runtime**: Node
   - **Build Command**: `npm install -g pnpm && pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build`
   - **Start Command**: `pnpm --filter @workspace/api-server run start`
   - **Plan**: Free
4. **Environment Variables** (aggiungi tutte):
   - `NODE_ENV` = `production`
   - `DATABASE_URL` = (la connection string di Neon)
   - `SESSION_SECRET` = (stringa casuale lunga almeno 32 caratteri)
   - `TELEGRAM_BOT_TOKEN` = (il token del bot)
   - `ALLOWED_ORIGINS` = `https://putitupbusiness.it,https://www.putitupbusiness.it,https://tg.putitupbusiness.it`
5. Click **Create Web Service** → Render esegue il build (~3-5 min)
6. Render ti dà un URL tipo `putitup-api.onrender.com`

---

## STEP 5 — DNS: punta api al server Render (5 min)

Su **Cloudflare → DNS → Records** → aggiungi:

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | api | putitup-api.onrender.com | OFF (DNS only) |
| CNAME | tg | putitup-tg.pages.dev | ON |

---

## STEP 6 — Deploy Sito Business su Cloudflare Pages (10 min)

1. Cloudflare → **Pages** → **Create a project** → Connect to Git → seleziona `putitup`
2. Impostazioni build:
   - **Project name**: `putitup-business`
   - **Build command**: `npm install -g pnpm && pnpm install --frozen-lockfile && pnpm --filter @workspace/putitup-business run build:cloudflare`
   - **Build output directory**: `artifacts/putitup-business/dist/public`
3. **Environment Variables**:
   - `VITE_API_URL` = `https://api.putitupbusiness.it`
4. Click **Save and Deploy** (~2-3 min)
5. Vai su **Custom domains** → aggiungi `putitupbusiness.it` e `www.putitupbusiness.it`

---

## STEP 7 — Deploy Mini App TG su Cloudflare Pages (10 min)

1. Cloudflare → **Pages** → **Create a project** → Connect to Git → seleziona `putitup`
2. Impostazioni build:
   - **Project name**: `putitup-tg`
   - **Build command**: `npm install -g pnpm && pnpm install --frozen-lockfile && pnpm --filter @workspace/ia-games run build:cloudflare`
   - **Build output directory**: `artifacts/ia-games/dist/public`
3. **Environment Variables**:
   - `VITE_API_URL` = `https://api.putitupbusiness.it`
4. Click **Save and Deploy**
5. Vai su **Custom domains** → aggiungi `tg.putitupbusiness.it`

---

## STEP 8 — Webhook Telegram (2 min)

Una volta che l'API è live, imposta il webhook del bot:

```
POST https://api.putitupbusiness.it/api/telegram/set-webhook
Body: { "webhookUrl": "https://api.putitupbusiness.it/api/telegram/webhook" }
```

Puoi farlo con curl:
```bash
curl -X POST https://api.putitupbusiness.it/api/telegram/set-webhook \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl":"https://api.putitupbusiness.it/api/telegram/webhook"}'
```

---

## STEP 9 — Configura Mini App in BotFather (5 min)

1. Apri Telegram → @BotFather → `/mybots` → @Putituo_bot
2. **Bot Settings → Menu Button** → imposta URL: `https://tg.putitupbusiness.it`
3. Il pulsante TAP TO PLAY aprirà la Mini App sul dominio reale

---

## Variabili d'ambiente — riepilogo

### Render (API Server)
```
NODE_ENV=production
DATABASE_URL=postgresql://...  (da Neon)
SESSION_SECRET=<stringa-casuale-32-chars>
TELEGRAM_BOT_TOKEN=<token-bot>
ALLOWED_ORIGINS=https://putitupbusiness.it,https://www.putitupbusiness.it,https://tg.putitupbusiness.it
```

### Cloudflare Pages (entrambi i siti)
```
VITE_API_URL=https://api.putitupbusiness.it
```

---

## Checklist finale

- [ ] Dominio putitupbusiness.it su Cloudflare con nameserver aggiornati
- [ ] Record DNS CNAME api → Render
- [ ] Record DNS CNAME tg → Cloudflare Pages
- [ ] Database Neon creato e migration eseguita
- [ ] API su Render con tutte le env vars → healthcheck OK
- [ ] Sito Business su Cloudflare Pages → https://putitupbusiness.it funziona
- [ ] Mini App TG su Cloudflare Pages → https://tg.putitupbusiness.it funziona
- [ ] Webhook Telegram aggiornato
- [ ] BotFather Menu Button aggiornato
- [ ] Testare login Mini App con Telegram
- [ ] Testare unlock dataset su Business con ad challenge
