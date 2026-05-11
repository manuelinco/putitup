# PUTITUP — Ecosistema Completo

---

## Visione d'insieme

PUTITUP è una **piattaforma duale di AI data labeling** basata sul modello *human-in-the-loop*: esseri umani reali etichettano dati per addestrare modelli di intelligenza artificiale, e vengono pagati in criptovaluta TON per farlo. Dall'altro lato, aziende comprano questi dati validati per i loro progetti AI.

La piattaforma ha due facce distinte che si alimentano a vicenda:

- **PUTITUP TG** — la Telegram Mini App dove lavorano i contributor
- **PUTITUP Business** — il sito web dove comprano i clienti enterprise

---

## 1. IL CONTRIBUTOR (lato Telegram)

### Chi è
Un utente comune su Telegram che vuole guadagnare crypto svolgendo piccole attività di classificazione dati. Non serve essere tecnici: si tratta di rispondere a domande semplici ("questa frase è positiva, negativa o neutrale?", "questo è un cane o un gatto?").

### Come accede
1. Trova il bot **@Putituo_bot** su Telegram
2. Preme **TAP TO PLAY** — il bot apre direttamente la Mini App dentro Telegram
3. Collega il suo **wallet TON** (es. Tonkeeper, Wallet.tg)
4. Crea un nickname e inizia immediatamente

### Il ciclo di lavoro
```
Riceve un task → Legge/vede il contenuto → Seleziona la risposta → Invia → Riceve punti + TON
```

Ogni task ha un **timer di 30 secondi**. Se non risponde in tempo, il task si chiude automaticamente e non guadagna nulla.

### Tipi di task disponibili
Il database contiene **11 milioni di task reali** distribuiti su 20 dataset:

| Tipo | Esempi concreti |
|------|----------------|
| **Testo** | Analisi del sentiment, classificazione intenti, NER, traduzione |
| **Immagine** | Riconoscimento oggetti, espressioni facciali, controllo qualità prodotti, uso del suolo satellitare |
| **Audio** | Trascrizione speech (EN/IT/FR), rilevamento lingua, emozioni vocali |
| **Video** | Classificazione azioni |
| **Medico** | Triage testi clinici, validazione OCR documenti |

### Il sistema di energia
Ogni task consuma **5 punti energia**. L'energia massima è 100 (20 task consecutivi). Quando finisce, il contributor deve guardare una pubblicità per ricaricare +20 energia. Questo garantisce pause naturali e impedisce abusi di scala.

### Le ricompense
- **0.00004 TON** per ogni task completato (accreditato dopo approvazione admin)
- **Punti** in base alla difficoltà: easy ×1, medium ×2, hard ×3
- **XP** che fanno salire di livello: Base → Pro → Expert
- **Bonus Combo**: rispondendo task consecutivi il moltiplicatore sale (×1 → ×2 → ×3)
- **Streak giornaliero**: più giorni consecutivi = streak che si accumula
- **Missioni giornaliere** con obiettivi extra

### Il sistema anti-bot (Ad Challenge)
Ogni 10 task completati appare una pubblicità obbligatoria con doppia sfida anti-bot:
1. **Red dot chase** — un puntino rosso si muove sullo schermo, devi cliccarlo entro il tempo
2. **Word pick** — devi selezionare una parola specifica tra più opzioni

Se fallisci le sfide, l'ad si blocca e non ricevi la ricarica energia. Questo garantisce che sia un essere umano reale e non un bot automatico.

### La gamification
- **Leaderboard** giornaliero, settimanale e all-time con podio
- **Badge di livello** visibili nel profilo (Base, Pro, Expert)
- **Profilo pubblico** con statistiche complete
- **Live feed** in home page con le attività recenti della community

---

## 2. IL WORKFLOW DI VALIDAZIONE DEI DATI

Questo è il cuore della piattaforma: ogni risposta non viene accettata direttamente, ma passa per un processo di validazione a più livelli.

### Il percorso di un task

```
LABELING (crowd)
    ↓
Raccoglie N risposte da N contributor diversi
    ↓
Algoritmo di consenso: se la stessa risposta supera il 99% delle votazioni
    ↓ (consenso raggiunto)
SUPERVISOR REVIEW (controller umano)
    ↓ (approvato)
ADMIN REVIEW
    ↓ (approvato)
PUBLISHED (dati validati, TON rilasciato ai contributor)
```

### I parametri di consenso
- Ogni dataset richiede un minimo di **voti per task** (default: 5 contributor diversi)
- La risposta vincente deve essere scelta da almeno il **99%** dei votanti
- Questo livello di threshold garantisce dati di altissima qualità

### I ruoli umani nel workflow
- **Contributor** — etichetta i task
- **Controller/Supervisor** — rivede i task che hanno raggiunto il consenso di folla
- **Admin** — approvazione finale, gestione dataset, analisi piattaforma, rilascio ricompense TON

### Task Golden
Alcuni task hanno una risposta corretta pre-verificata (task "golden"). Vengono usati come controllo qualità nascosto per verificare che i contributor stiano lavorando seriamente. Se un contributor sbaglia sistematicamente i golden task, il suo score di accuratezza scende.

---

## 3. IL CLIENTE ENTERPRISE (lato Business)

### Chi è
Un'azienda che ha bisogno di dati etichettati per addestrare i propri modelli AI — startup AI, centri di ricerca, grandi tech company.

### Come accede
1. Va su **putitup.io/putitup-business/**
2. Sfoglia il catalogo dei 20 dataset disponibili
3. Sceglie il piano di abbonamento
4. Sblocca i dataset e li scarica

### Il catalogo dataset
20 dataset in 4 categorie principali:
- **NLP**: sentiment multilingue, classificazione intenti, NER, preferenze RLHF
- **Vision**: object detection, segmentazione, qualità prodotti, immagini satellite
- **Audio**: trascrizione speech EN/IT/FR, rilevamento lingua, emozioni
- **Medico/Specialistico**: triage clinico, OCR documenti

### I tier di accesso
| Tier | Come si sblocca |
|------|----------------|
| **BASIC** | Guarda 3 ad challenge OPPURE abbonamento Starter/Business |
| **MEDIUM** | Guarda 5 ad challenge OPPURE abbonamento Business/Premium |
| **PREMIUM** | Solo contatto commerciale diretto |

### I piani di abbonamento
- **Free** — accesso gratuito, sblocco dataset con ads (max 5 ads per dataset)
- **Starter €9.99/mese** — accesso dataset BASIC senza ads, download illimitati
- **Business €19.99/mese** — BASIC + MEDIUM + dataset personalizzati su richiesta
- **Premium** — accordo commerciale, dataset dedicati, SLA garantito

---

## 4. IL SISTEMA PUBBLICITARIO (ponte tra i due lati)

Le pubblicità sono il meccanismo che connette contributor e clienti senza che debbano pagarsi direttamente.

### Sul lato Contributor (Mini App)
- Ogni 10 task → ad obbligatoria con red dot challenge
- Se passa la sfida → +20 energia per continuare a lavorare
- Se fallisce → nessuna ricarica, deve aspettare

### Sul lato Cliente (Business)
- Dataset BASIC: guarda 3 ad challenge per sbloccare
- Dataset MEDIUM: guarda 5 ad challenge per sbloccare
- Le sfide anti-bot garantiscono che siano persone reali a guardare gli ad

### Il flusso economico degli ads
```
Inserzionista paga → Revenue da ads → PUTITUP incassa → Paga TON ai contributor
```

Senza abbonamento, sia il contributor che il cliente "lavorano" per la piattaforma tramite le pubblicità, finanziando indirettamente le ricompense crypto.

---

## 5. L'API SERVER (il cervello)

Il server backend gestisce tutta la logica della piattaforma ed è accessibile al path `/api`.

### Autenticazione
- **Contributor**: validazione HMAC-SHA256 dei dati Telegram (initData), poi sessione con wallet TON
- **Cliente Business**: email + password, sessione localStorage
- **Admin/Supervisor**: HTTP Basic Auth con credenziali dedicate

### Route principali
| Gruppo | Funzione |
|--------|---------|
| `/api/auth/telegram/validate` | Valida il login Telegram |
| `/api/users` | Gestione profili contributor |
| `/api/tasks/next` | Pesca un task casuale non ancora risposto |
| `/api/responses` | Invia una risposta a un task |
| `/api/datasets` | Lista e dettaglio dataset |
| `/api/leaderboard` | Classifica contributor |
| `/api/clients` | Gestione clienti business |
| `/api/clients/:id/ads/watch` | Registra visione ad con challenge token |
| `/api/clients/:id/datasets/:id/unlock` | Sblocca dataset per cliente |
| `/api/tasks/review` | Coda di revisione per supervisor/admin |
| `/api/telegram/webhook` | Riceve comandi dal bot Telegram |
| `/api/analytics/summary` | Statistiche piattaforma in tempo reale |

### Sicurezza implementata
- Rate limiting su tutti gli endpoint
- Helmet.js + HSTS in produzione
- CORS ristretto ai domini autorizzati
- Challenge token HMAC per le visioni pubblicitarie (impossibile simulare senza guardare davvero)
- Protezione replay attack sulle richieste Telegram (window 5 minuti)
- Nessun log sensibile in produzione — logging strutturato con Pino

---

## 6. IL DATABASE

PostgreSQL con Drizzle ORM. Le tabelle principali:

| Tabella | Contenuto |
|---------|-----------|
| `users` | Contributor: wallet, punti, XP, energia, livello, isAdmin, isSupervisor |
| `datasets` | 20 dataset con config workflow, threshold consenso, modalità importazione |
| `tasks` | 11 milioni di task con status, stage revisione, consenso, ricompense |
| `task_responses` | Ogni risposta di ogni contributor a ogni task |
| `clients` | Clienti enterprise con balance token e risk score |
| `dataset_access` | Chi ha sbloccato quale dataset, come e quando |
| `reward_ledger` | Registro TON: ogni ricompensa, chi l'ha guadagnata, status rilascio |
| `activity_events` | Feed live: ogni completamento task, level up, ecc. |

---

## 7. IL BOT TELEGRAM

Il bot **@Putituo_bot** ha un unico compito: quando un utente manda `/start`, risponde con un pulsante **TAP TO PLAY** che apre direttamente la Mini App dentro Telegram.

È configurato tramite webhook: ogni messaggio al bot arriva su `/api/telegram/webhook`, viene processato dal server, e il bot risponde automaticamente.

---

## 8. IL FLUSSO ECONOMICO COMPLETO

```
CONTRIBUTOR lavora (etichetta dati)
    ↓
Guadagna TON (trattenuto finché admin non approva)
    ↓
Dati validati vengono aggiunti ai dataset
    ↓
CLIENTE BUSINESS compra abbonamento o guarda ads
    ↓
Revenue entra in PUTITUP
    ↓
PUTITUP usa il revenue per pagare TON ai contributor
    ↓
Il ciclo si chiude e si automantiene
```

---

## 9. STATO ATTUALE E COSA MANCA

### Funzionante e in produzione
- Tutta la Mini App Telegram con task reali (11M)
- Tutta la Business Platform con catalogo e pricing
- API server completo con sicurezza enterprise
- Bot Telegram webhook attivo
- Sistema di consenso e workflow validazione
- Gamification completa (XP, livelli, streak, leaderboard)
- Ad challenge anti-bot

### Da attivare (scaffold pronto, manca configurazione esterna)
- **Ads reali** (Adsgram per TG, AdSense/altro per il sito) — manca il publisher ID
- **Pagamenti Stripe** — scaffold pronto, mancano le chiavi Stripe
- **Auth backend Business** — il login UI è pronto, il collegamento DB non è attivato
- **Rilascio TON automatico** — il ledger è pronto, manca l'integrazione con TON blockchain per i pagamenti effettivi

---

*In sintesi: la piattaforma è completa architetturalmente — ogni pezzo è costruito e funzionante. I pezzi mancanti sono tutti "interruttori da accendere" che richiedono account/chiavi esterne (ad network, Stripe, TON wallet aziendale), non nuove funzionalità da costruire da zero.*
