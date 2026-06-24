/**
 * Virtual Task Generation Engine
 * ================================
 * Generates 100 million task "slots" deterministically from (datasetId, slotNumber).
 * Tasks are materialized lazily in the DB only when a user actually requests them.
 *
 * Slot distribution (5M per dataset × 20 datasets = 100M total):
 *   IMAGE  (50M): datasets 10, 12, 20, 21, 22, 28, 29 + overflow to other image datasets
 *   AUDIO  (20M): datasets 23, 24, 25, 26, 27
 *   VIDEO  (30M): datasets 19, 28 (served as rich image tasks with scene descriptions)
 */

export const VIRTUAL_SLOT_COUNT = 5_000_000; // per dataset

// Seeded pseudo-random — Mulberry32
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rng(datasetId: number, slot: number) {
  return mulberry32((datasetId * 10_000_000 + slot + 1) >>> 0);
}

function pick<T>(arr: T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length)]!;
}

// ────────────────────────────────────────────────
// Dataset metadata
// ────────────────────────────────────────────────

const DATASET_META: Record<number, {
  name: string;
  kind: "image" | "audio" | "text" | "video";
  question: string | string[];
  options: string[];
  difficulty: "easy" | "medium" | "hard";
  pointsReward: number;
}> = {
  10: {
    name: "Sentiment Analysis",
    kind: "text",
    question: [
      "What is the overall sentiment of this customer review?",
      "How would you classify the emotion in this text?",
      "Rate the sentiment of the following message:",
    ],
    options: ["positive", "negative", "neutral"],
    difficulty: "easy", pointsReward: 10,
  },
  11: {
    name: "Customer Intent Detection",
    kind: "text",
    question: [
      "What is the customer's primary intent in this message?",
      "Classify the intent behind this support request:",
      "What action does the customer want to take?",
    ],
    options: ["purchase", "browse", "return", "complaint", "inquiry"],
    difficulty: "medium", pointsReward: 20,
  },
  12: {
    name: "Object Detection",
    kind: "image",
    question: [
      "What is the primary subject in this image?",
      "Identify the main category of this photograph:",
      "What category best describes what you see in this image?",
    ],
    options: ["Person or people", "Animal or wildlife", "Vehicle or transport", "Building or architecture", "Nature or landscape", "Food or drink", "Electronics or technology", "Furniture or interior", "Other / Mixed"],
    difficulty: "easy", pointsReward: 10,
  },
  13: {
    name: "Named Entity Recognition",
    kind: "text",
    question: [
      "What type of named entity is highlighted in this text?",
      "Classify the underlined entity:",
      "What category does the bold term belong to?",
    ],
    options: ["Person", "Organization", "Location", "Date", "Product", "Other"],
    difficulty: "medium", pointsReward: 20,
  },
  14: {
    name: "Response Evaluation",
    kind: "text",
    question: [
      "Which AI response better answers the question?",
      "Compare these two responses and select the better one:",
      "Which answer is more helpful and accurate?",
    ],
    options: ["Response A is better", "Response B is better", "Both are equally good", "Both are poor"],
    difficulty: "medium", pointsReward: 20,
  },
  15: {
    name: "Translation Quality",
    kind: "text",
    question: [
      "How accurate is this machine translation?",
      "Rate the quality of this translated text:",
      "Does this translation preserve the original meaning?",
    ],
    options: ["Correct", "Minor errors", "Major errors", "Completely wrong"],
    difficulty: "hard", pointsReward: 30,
  },
  16: {
    name: "Medical Text Triage",
    kind: "text",
    question: [
      "Which medical specialty is most relevant for this case?",
      "Classify the medical department for this patient note:",
      "What specialty should review this medical record?",
    ],
    options: ["Cardiology", "Neurology", "Oncology", "Emergency", "General Practice", "Orthopedics"],
    difficulty: "hard", pointsReward: 30,
  },
  17: {
    name: "Customer Support Classification",
    kind: "text",
    question: [
      "What type of customer support ticket is this?",
      "Classify this support request:",
      "How should this customer message be routed?",
    ],
    options: ["Complaint", "Question", "Return request", "Compliment", "Billing issue"],
    difficulty: "easy", pointsReward: 10,
  },
  18: {
    name: "Sarcasm Detection",
    kind: "text",
    question: [
      "Is this text sarcastic or sincere?",
      "Detect the tone of this online comment:",
      "How would you classify the writing style of this post?",
    ],
    options: ["Sincere", "Sarcastic", "Neutral", "Ambiguous"],
    difficulty: "hard", pointsReward: 30,
  },
  19: {
    name: "Content Quality Assessment",
    kind: "image",
    question: [
      "Rate the overall quality of this image:",
      "How would you assess the visual quality?",
      "What is the quality tier of this photograph?",
    ],
    options: ["Excellent", "Good", "Fair", "Poor"],
    difficulty: "easy", pointsReward: 10,
  },
  20: {
    name: "Image Scene Classification",
    kind: "image",
    question: [
      "What is the main subject or scene shown in this image?",
      "Which category best describes what you see in this photo?",
      "How would you classify the content of this image?",
    ],
    options: ["Person or people", "Animal or wildlife", "Vehicle or transport", "Building or architecture", "Nature or landscape", "Food or drink", "Urban or street scene", "Abstract or texture", "Other"],
    difficulty: "easy", pointsReward: 10,
  },
  21: {
    name: "Image Emotion & Expression",
    kind: "image",
    question: [
      "If a person's face is visible, what expression do they show? If not, select 'No face visible'.",
      "Identify the mood or expression visible in this image:",
      "What is the dominant human emotion visible, if any?",
    ],
    options: ["Happy or joyful", "Sad or upset", "Angry or frustrated", "Surprised or shocked", "Neutral or calm", "No person or face visible"],
    difficulty: "medium", pointsReward: 20,
  },
  22: {
    name: "Image Quality Assessment",
    kind: "image",
    question: [
      "Rate the overall visual quality and clarity of this image:",
      "How would you assess the technical quality of this photograph?",
      "Is this image suitable for professional or commercial use?",
    ],
    options: ["Excellent — sharp, well-lit, professional", "Good — minor issues but usable", "Fair — noticeable blur or lighting problems", "Poor — very low quality or unusable"],
    difficulty: "medium", pointsReward: 20,
  },
  23: {
    name: "Audio Speech Transcription EN",
    kind: "audio",
    question: [
      "Is this English transcription accurate?",
      "Rate the quality of this speech-to-text output:",
      "Does this transcription correctly capture the spoken words?",
    ],
    options: ["Correct", "Minor word errors", "Missing words", "Completely wrong"],
    difficulty: "medium", pointsReward: 20,
  },
  24: {
    name: "Audio Speech Transcription IT",
    kind: "audio",
    question: [
      "Is this Italian transcription accurate?",
      "Rate the quality of this Italian speech-to-text:",
      "How well does this transcription match the audio?",
    ],
    options: ["Correct", "Minor errors", "Missing content", "Incorrect"],
    difficulty: "hard", pointsReward: 30,
  },
  25: {
    name: "Audio Speech Transcription FR",
    kind: "audio",
    question: [
      "Is this French transcription accurate?",
      "Rate the quality of this French speech-to-text output:",
      "Does the transcription match the spoken French?",
    ],
    options: ["Correct", "Minor errors", "Missing content", "Incorrect"],
    difficulty: "hard", pointsReward: 30,
  },
  26: {
    name: "Audio Language Detection",
    kind: "audio",
    question: [
      "What language is spoken in this audio clip?",
      "Identify the spoken language:",
      "Which language does this speaker use?",
    ],
    options: ["English", "Italian", "French", "Spanish", "German", "Portuguese", "Other"],
    difficulty: "easy", pointsReward: 10,
  },
  27: {
    name: "Audio Emotion Recognition",
    kind: "audio",
    question: [
      "What emotion does the speaker express?",
      "Classify the emotional tone of this voice:",
      "What is the speaker's primary emotion?",
    ],
    options: ["Happy", "Sad", "Angry", "Calm", "Excited", "Fearful", "Neutral"],
    difficulty: "medium", pointsReward: 20,
  },
  28: {
    name: "Video Action Classification",
    kind: "video",
    question: [
      "What action is performed in this video clip?",
      "Classify the activity shown:",
      "What is the person doing in this scene?",
    ],
    options: ["Running", "Cooking", "Driving", "Playing sports", "Working", "Dancing", "Reading", "Other"],
    difficulty: "medium", pointsReward: 20,
  },
  29: {
    name: "Scene & Environment Classification",
    kind: "image",
    question: [
      "What type of environment or setting is shown in this image?",
      "Classify the scene or location visible in this photo:",
      "Which environment best describes what this image shows?",
    ],
    options: ["Urban or city environment", "Forest or woodland", "Countryside or farmland", "Coastal or water", "Desert or arid landscape", "Indoor or built interior", "Industrial or commercial site", "Other natural scene"],
    difficulty: "medium", pointsReward: 20,
  },
};

// ────────────────────────────────────────────────
// Text snippets for text/audio tasks
// ────────────────────────────────────────────────

const TEXT_SNIPPETS = {
  sentiment: [
    "This product exceeded all my expectations. Highly recommended!",
    "The delivery was delayed by two weeks and the packaging was damaged.",
    "It works as described. Nothing special, but gets the job done.",
    "Absolutely terrible quality. Broke after one day of use.",
    "Customer support was very helpful in resolving my issue quickly.",
    "I've had better experiences elsewhere. Wouldn't buy again.",
    "Good value for money. Works perfectly for my needs.",
    "The app crashes constantly and the interface is confusing.",
    "Outstanding performance and beautiful design.",
    "Mediocre product at best. Not worth the price.",
    "Fast shipping, great packaging, exactly what I ordered!",
    "The instructions were unclear and setup took hours.",
    "Solid product, reliable, does what it says.",
    "Worst purchase I've ever made. Complete waste of money.",
    "Pretty decent overall. A few minor issues but nothing major.",
  ],
  intent: [
    "I'd like to return the item I purchased last week, it's not the right size.",
    "Can you tell me if this product is compatible with my laptop?",
    "I want to buy 3 units of product SKU-4821 for my office.",
    "Your app keeps crashing every time I try to checkout.",
    "When will the new model be available? I want to pre-order.",
    "I've been charged twice for the same order. Please refund.",
    "Just wanted to say your support team was amazing today!",
    "Is there a bulk discount for orders over 50 units?",
    "The product I received doesn't match the description on your site.",
    "How do I reset my account password?",
  ],
  medical: [
    "Patient reports acute chest pain radiating to the left arm, onset 2 hours ago.",
    "55-year-old with persistent headache, visual disturbances, and nausea for 3 days.",
    "Follow-up visit for type 2 diabetes management. HbA1c levels reviewed.",
    "Fracture of the distal radius following a fall. X-ray confirms displacement.",
    "Elevated PSA levels detected during routine screening. Biopsy recommended.",
    "Child presenting with fever 39.2°C, sore throat, and swollen tonsils.",
    "New onset seizures in a 40-year-old. MRI scheduled for tomorrow.",
    "Post-operative care notes for laparoscopic cholecystectomy performed this morning.",
  ],
  support: [
    "I ordered 3 days ago but still haven't received a tracking number.",
    "The product stopped working after just two uses. This is unacceptable.",
    "How many days does standard shipping take to Italy?",
    "I accidentally ordered the wrong color. Can I change it before it ships?",
    "Your chatbot isn't helpful. I need to speak to a real person.",
    "I was charged the wrong amount on my credit card statement.",
    "The promo code from your email isn't working at checkout.",
    "Thank you! The team went above and beyond to help me today.",
  ],
  sarcasm: [
    "Oh sure, because waiting 3 weeks for a package is totally normal.",
    "Great, another software update that breaks everything I loved.",
    "The manual is only 200 pages long. Super user-friendly!",
    "What a surprise! The cheapest option is also the worst.",
    "I love how customer service puts me on hold for 45 minutes.",
    "Wow, the battery lasts a whole 2 hours. Revolutionary!",
    "Nothing says premium like plastic that cracks in a week.",
  ],
};

const AUDIO_TRANSCRIPTS: Record<number, string[]> = {
  23: [ // English
    "The weather forecast shows heavy rain expected throughout the weekend.",
    "Please proceed to gate twenty-three for boarding. Flight departs in thirty minutes.",
    "Our quarterly revenue increased by fifteen percent compared to last year.",
    "The museum will be closed on Mondays and national holidays.",
    "To reset your password, click the link we sent to your email address.",
    "Hi, I'd like to reschedule my appointment for next Thursday if possible.",
    "The system is currently undergoing scheduled maintenance until midnight.",
    "All passengers must show valid identification before boarding the aircraft.",
  ],
  24: [ // Italian (transcribed)
    "Il volo numero quattordici è in partenza dal gate diciassette.",
    "Il museo sarà chiuso durante le festività nazionali e il lunedì.",
    "Per favore, inserisci il codice ricevuto via messaggio per continuare.",
    "La riunione di domani è stata spostata alle quindici e trenta.",
    "Buongiorno, vorrei prenotare un tavolo per quattro persone stasera.",
  ],
  25: [ // French (transcribed)
    "Le vol numéro vingt-deux est retardé d'une heure en raison des conditions météo.",
    "Veuillez vous présenter à l'enregistrement avec votre passeport valide.",
    "Le musée est ouvert tous les jours sauf le mardi et les jours fériés.",
    "Bonjour, je voudrais modifier ma réservation pour le week-end prochain.",
    "La réunion commence dans dix minutes. Merci d'être ponctuel.",
  ],
  26: [ // Language detection — mixed
    "Good morning, how can I help you today?",
    "Buongiorno, come posso aiutarla?",
    "Bonjour, je m'appelle Marie.",
    "Guten Morgen, wie kann ich helfen?",
    "Buenos días, ¿en qué le puedo ayudar?",
    "Bom dia, como posso ajudá-lo?",
    "Dzień dobry, w czym mogę pomóc?",
  ],
  27: [ // Emotion
    "I can't believe I finally got the promotion! This is the best day ever!",
    "I'm sorry, I just... I don't know how I'm going to get through this.",
    "This is absolutely ridiculous! I've been waiting for TWO HOURS!",
    "Okay, so here's what happened. Basically nothing unusual.",
    "Oh my goodness, you're here! I had no idea you were coming!",
    "I'm honestly terrified of what's going to happen next.",
    "I don't really have any strong feelings about it either way.",
  ],
};

const VIDEO_ACTIONS = [
  "A person jogging along a coastal path at sunrise",
  "Chef preparing pasta in a professional kitchen",
  "Children playing soccer in a park on a sunny day",
  "Office worker presenting data on a large screen",
  "Dancer performing contemporary choreography on stage",
  "Mechanic repairing an engine in an automotive workshop",
  "Teacher writing mathematical equations on a whiteboard",
  "Swimmer performing freestyle stroke in an Olympic pool",
  "Farmer harvesting crops using modern agricultural machinery",
  "Artist painting a landscape with oil paints",
  "Cyclist navigating a mountain trail at high speed",
  "Doctor examining a patient in a clinical setting",
  "Musician playing piano during a live concert",
  "Construction worker operating heavy machinery on site",
  "Barista crafting latte art in a coffee shop",
];

const NER_TEXTS = [
  "Apple announced their new iPhone model at a conference in San Francisco.",
  "Elon Musk visited the Tesla factory in Austin, Texas last week.",
  "The UEFA Champions League final will be held in London on June 15th.",
  "Amazon Web Services reported a revenue of 25 billion dollars in Q3.",
  "Dr. Emily Chen from Harvard Medical School published a groundbreaking study.",
  "The Louvre Museum in Paris attracted over 9 million visitors last year.",
  "Microsoft acquired LinkedIn for approximately 26 billion dollars in 2016.",
  "President Biden signed the Infrastructure Investment Act on November 15.",
];

const TRANSLATION_EXAMPLES = [
  { original: "The quick brown fox jumps over the lazy dog.", translated: "La volpe marrone veloce salta sopra il cane pigro." },
  { original: "We need to finalize the report by tomorrow morning.", translated: "Dobbiamo finalizzare il rapport entomorrow mattina." },
  { original: "Please confirm your attendance before Friday.", translated: "Por favor confirme su asistencia antes del viernes." },
  { original: "The meeting has been rescheduled to next Monday.", translated: "La réunion a été reportée à lundi prochain." },
  { original: "Thank you for your patience and understanding.", translated: "Grazie por la pazienza e la comprensione." },
];

const RESPONSE_PAIRS = [
  {
    question: "What is the capital of Australia?",
    a: "Sydney is the capital of Australia.",
    b: "Canberra is the capital of Australia.",
  },
  {
    question: "How do I center a div in CSS?",
    a: "Use display: flex and justify-content: center on the parent.",
    b: "Just add margin: auto and it will center automatically.",
  },
  {
    question: "What causes inflation?",
    a: "Inflation occurs when too much money chases too few goods.",
    b: "Inflation is caused by the government printing money.",
  },
];

// ────────────────────────────────────────────────
// Main generator
// ────────────────────────────────────────────────

export interface VirtualTaskPayload {
  question: string;
  options: string[];
  imageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
  transcript?: string;
  language?: string;
  content?: string;
  text?: string;
  category?: string;
}

export interface VirtualTask {
  id: number;
  type: "image" | "text" | "classification";
  difficulty: "easy" | "medium" | "hard";
  pointsReward: number;
  datasetId: number;
  dataPayload: VirtualTaskPayload;
  correctAnswer: string | null;
  isGolden: boolean;
  status: "active";
  reviewStage: "labeling";
  requiredVotes: number;
  consensusThreshold: number;
  consensusCount: number;
  _virtual: true;
  _virtualSlot: number;
}

/**
 * Generate a virtual task deterministically from (datasetId, slot).
 * The `id` returned is a synthetic large integer to avoid collision with real task IDs.
 */
export function generateVirtualTask(datasetId: number, slot: number): VirtualTask {
  const meta = DATASET_META[datasetId];
  if (!meta) throw new Error(`Unknown datasetId: ${datasetId}`);

  const r = rng(datasetId, slot);
  const question = typeof meta.question === "string"
    ? meta.question
    : pick(meta.question as string[], r);

  let payload: VirtualTaskPayload = { question, options: meta.options };
  let taskType: "image" | "text" | "classification" = "image";

  switch (meta.kind) {
    case "image": {
      const seed = (datasetId * 10_000_000 + slot + 1) & 0x7fffffff;
      payload.imageUrl = `https://picsum.photos/seed/${seed}/640/480`;
      taskType = "image";
      break;
    }

    case "video": {
      // Serve as image (scene frame) with video description
      const seed = (datasetId * 10_000_000 + slot + 1) & 0x7fffffff;
      payload.imageUrl = `https://picsum.photos/seed/${seed}/640/360`;
      payload.content  = pick(VIDEO_ACTIONS, r);
      payload.category = "video-action";
      taskType = "image";
      break;
    }

    case "audio": {
      const transcripts = AUDIO_TRANSCRIPTS[datasetId] ?? AUDIO_TRANSCRIPTS[23]!;
      const transcript  = pick(transcripts, r);
      const langMap: Record<number, string> = { 23: "EN", 24: "IT", 25: "FR", 26: "auto", 27: "EN" };
      payload.transcript = transcript;
      payload.language   = langMap[datasetId] ?? "EN";
      payload.category   = "audio";
      taskType = "classification";
      break;
    }

    case "text": {
      taskType = "text";
      switch (datasetId) {
        case 10: payload.content = pick(TEXT_SNIPPETS.sentiment, r); break;
        case 11: payload.content = pick(TEXT_SNIPPETS.intent, r); break;
        case 13: {
          const eg = pick(NER_TEXTS, r);
          payload.text = eg;
          payload.content = eg;
          break;
        }
        case 14: {
          const pair = pick(RESPONSE_PAIRS, r);
          payload.content = `Q: ${pair.question}\n\nResponse A: ${pair.a}\n\nResponse B: ${pair.b}`;
          break;
        }
        case 15: {
          const ex = pick(TRANSLATION_EXAMPLES, r);
          payload.content = `Original: "${ex.original}"\n\nTranslation: "${ex.translated}"`;
          break;
        }
        case 16: payload.content = pick(TEXT_SNIPPETS.medical, r); break;
        case 17: payload.content = pick(TEXT_SNIPPETS.support, r); break;
        case 18: payload.content = pick(TEXT_SNIPPETS.sarcasm, r); break;
        default: payload.content = pick(TEXT_SNIPPETS.sentiment, r); break;
      }
      break;
    }
  }

  // Synthetic large ID — base 10_000_000_000 to avoid collision with real IDs
  const syntheticId = 10_000_000_000 + datasetId * 10_000_000 + slot;

  return {
    id:               syntheticId,
    type:             taskType,
    difficulty:       meta.difficulty,
    pointsReward:     meta.pointsReward,
    datasetId,
    dataPayload:      payload,
    correctAnswer:    null,
    isGolden:         false,
    status:           "active",
    reviewStage:      "labeling",
    requiredVotes:    3,
    consensusThreshold: 0.67,
    consensusCount:   0,
    _virtual:         true,
    _virtualSlot:     slot,
  };
}

/** Get the slot number for a user based on how many virtual tasks they've done in a dataset */
export function getNextSlot(userVirtualCount: number): number {
  return userVirtualCount;
}

/** All dataset IDs that support virtual tasks */
export const VIRTUAL_DATASET_IDS = Object.keys(DATASET_META).map(Number);
