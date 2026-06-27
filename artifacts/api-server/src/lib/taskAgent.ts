import Groq from "groq-sdk";
import { db, datasetsTable, tasksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const GROQ_API_KEY = process.env["GROQ_API_KEY"];

const groq = GROQ_API_KEY
  ? new Groq({ apiKey: GROQ_API_KEY })
  : null;

// ── Internal types ─────────────────────────────────────────────────────────────

export interface AgentRun {
  runId: string;
  startedAt: Date;
  finishedAt?: Date;
  status: "running" | "done" | "error";
  datasetsProcessed: number;
  tasksCreated: number;
  errors: string[];
  log: string[];
}

interface FetchedContent {
  type: "image" | "text" | "audio" | "video" | "social";
  imageUrl?: string;
  text?: string;
  audioUrl?: string;
  videoUrl?: string;
  thumbnail?: string;
  // social fields
  postText?: string;
  postAuthor?: string;
  postPlatform?: string;
  postLikes?: number;
  postComments?: number;
  sourceUrl: string;
  sourceName: string;
}

// ── In-memory state ────────────────────────────────────────────────────────────

let lastRun: AgentRun | null = null;
let running = false;

export function getLastRun(): AgentRun | null { return lastRun; }
export function isRunning(): boolean { return running; }

// ── Helpers ────────────────────────────────────────────────────────────────────

function pickRandom<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

// ── Multi-angle image question system ─────────────────────────────────────────
//
// MATH: 1,000,000 unique Picsum seeds × 26 angles × (C(pool,4) option combos)
//       → theoretically BILLIONS of unique (image, question, options) combinations.
//
// Each angle has a large option pool. We pick a random subset each time,
// so even the SAME image + SAME question produces different answer options.

interface ImageAngle {
  category: string;
  emoji: string;
  question: string;               // kept for backward compat (used if questionVariants absent)
  questionVariants?: string[];    // 5 different phrasings — one picked at random
  optionPool: string[];           // large pool; `pick` items drawn randomly each time
  pick: number;                   // how many options to show per task (target: 5)
  difficulty: "easy" | "medium" | "hard";
}

const IMAGE_ANGLE_POOL: ImageAngle[] = [
  // ── COLOR (3 angles, 5 variants each, 22+ options, pick 5) ────────────────
  { category:"COLOR", emoji:"🎨",
    question:"What is the dominant color in this image?",
    questionVariants:["What is the dominant color in this image?","Which single color takes up the most space here?","What color catches your eye first in this image?","Name the predominant hue visible in this photo?","What is the primary color present in this visual?"],
    optionPool:["red","blue","green","yellow","orange","purple","brown","grey","white","black","pink","cyan","teal","gold","silver","beige","navy","olive","maroon","magenta","lime","coral"],
    pick:5, difficulty:"easy" },
  { category:"COLOR", emoji:"🎨",
    question:"How would you describe the color palette?",
    questionVariants:["How would you describe the color palette?","What type of color scheme does this image use?","Which color harmony best describes this image?","How would a designer classify this color combination?","What is the overall color temperature of this image?"],
    optionPool:["warm tones","cool tones","monochromatic","complementary","analogous","triadic","pastel","saturated","desaturated","earthy","neon","metallic","split-complementary","tetradic","neutral","high-contrast","low-contrast","rainbow","duotone","black & white"],
    pick:5, difficulty:"medium" },
  { category:"COLOR", emoji:"🎨",
    question:"What percentage of this image appears to be dark-toned?",
    questionVariants:["What percentage of this image appears to be dark-toned?","How dark is the overall image?","What ratio of dark to light areas exists in this image?","How would you rate the overall brightness of this image?","What is the luminosity distribution of this image?"],
    optionPool:["0–10% dark (very bright)","10–30% dark (mostly bright)","30–50% dark (balanced)","50–70% dark (mostly dark)","70–90% dark (very dark)","90–100% dark (almost black)","high key","low key","mid-range","silhouette","flat/even","HDR-style"],
    pick:5, difficulty:"easy" },

  // ── EMOTION (4 angles) ────────────────────────────────────────────────────
  { category:"EMOTION", emoji:"💭",
    question:"What emotion does this image primarily evoke?",
    questionVariants:["What emotion does this image primarily evoke?","How does this image make you feel?","What feeling does this visual trigger first?","Which emotional response would most viewers have to this image?","What is the dominant emotional tone of this image?"],
    optionPool:["joy","calm","sadness","fear","surprise","disgust","awe","nostalgia","excitement","melancholy","serenity","unease","admiration","loneliness","hope","anxiety","pride","grief","gratitude","contempt","confusion","envy"],
    pick:5, difficulty:"medium" },
  { category:"EMOTION", emoji:"💭",
    question:"What physical sensation does this image evoke?",
    questionVariants:["What physical sensation does this image evoke?","Which tactile feeling does this image suggest?","If you could touch this scene, what would it feel like?","What sensory experience does this image most trigger?","Which of these best matches the physical feel of this image?"],
    optionPool:["warm","cold","wet","dry","soft","rough","light","heavy","fresh","stale","sharp","gentle","spacious","claustrophobic","energizing","relaxing","painful","soothing","itchy","tingly","suffocating","floating"],
    pick:5, difficulty:"medium" },
  { category:"EMOTION", emoji:"💭",
    question:"What mood best describes the atmosphere?",
    questionVariants:["What mood best describes the atmosphere?","What is the overall vibe of this image?","How would you describe the emotional atmosphere here?","What adjective best captures the feel of this scene?","What is the dominant ambience of this photograph?"],
    optionPool:["cheerful","melancholic","tense","peaceful","mysterious","romantic","dramatic","whimsical","gloomy","vibrant","solemn","playful","nostalgic","surreal","hopeful","threatening","eerie","festive","meditative","rebellious","authoritative","humble"],
    pick:5, difficulty:"medium" },
  { category:"EMOTION", emoji:"💭",
    question:"If this image were a music genre, what would it be?",
    questionVariants:["If this image were a music genre, what would it be?","Which music style best fits the mood of this image?","What soundtrack would you put to this visual?","If this image had a song, what genre would it belong to?","Which musical genre captures the essence of this image?"],
    optionPool:["classical orchestral","jazz","rock","heavy metal","electronic/EDM","folk/acoustic","hip-hop","ambient/drone","opera","blues","pop","country","reggae","punk","R&B","techno","gospel","bossa nova","flamenco","indie","cinematic score","silence"],
    pick:5, difficulty:"hard" },

  // ── SCALE (3 angles) ──────────────────────────────────────────────────────
  { category:"SCALE", emoji:"📐",
    question:"How large is the main subject relative to the frame?",
    questionVariants:["How large is the main subject relative to the frame?","What portion of the image does the primary subject occupy?","How dominant is the subject in this composition?","What percentage of the frame is filled by the main element?","How would you describe the size of the focal point?"],
    optionPool:["< 5% (tiny detail)","5–15% (small)","15–35% (moderate)","35–60% (prominent)","60–80% (dominant)","80–95% (very large)","fills entire frame","unclear / no main subject","multiple equal subjects","foreground fills frame","background fills frame","subject spans edges"],
    pick:5, difficulty:"easy" },
  { category:"SCALE", emoji:"📐",
    question:"What is the depth of field in this image?",
    questionVariants:["What is the depth of field in this image?","How much of the image is in sharp focus?","How would you describe the focus range of this photo?","Is the background sharp or blurred?","What type of focus technique is used here?"],
    optionPool:["extremely shallow (razor-thin)","shallow (bokeh visible)","moderate focus","deep focus (all sharp)","infinite depth (panoramic)","tilt-shift effect","macro focus","soft focus (intentional blur)","motion blur","front focused","rear focused","focus on multiple planes"],
    pick:5, difficulty:"hard" },
  { category:"SCALE", emoji:"📐",
    question:"What composition technique is used?",
    questionVariants:["What composition technique is used?","How would you describe the spatial arrangement of elements?","Which compositional rule applies to this image?","How are elements arranged within the frame?","What compositional strategy was used by the photographer?"],
    optionPool:["centered","rule of thirds","golden ratio","symmetrical","diagonal lead","asymmetrical balance","framing within frame","leading lines","negative space","S-curve","fill the frame","minimalist","crowded/dense","layers (fore/mid/back)","panoramic","overhead flat lay"],
    pick:5, difficulty:"hard" },

  // ── SCENE (3 angles) ──────────────────────────────────────────────────────
  { category:"SCENE", emoji:"🌍",
    question:"What type of scene is depicted?",
    questionVariants:["What type of scene is depicted?","What environment is shown in this image?","Where does this image appear to take place?","In what setting is this image captured?","What kind of location is this?"],
    optionPool:["urban street","natural landscape","indoor room","underwater","aerial view","forest","beach","desert","mountain","city skyline","rural field","arctic/polar","jungle/rainforest","cave/underground","outer space","rooftop","harbor/port","bridge","stadium","historic site"],
    pick:5, difficulty:"easy" },
  { category:"SCENE", emoji:"🌍",
    question:"What is the specific venue or place type?",
    questionVariants:["What is the specific venue or place type?","If you had to name the location type, what would it be?","What kind of establishment or area is this?","Which venue category best matches this image?","What place does this image most resemble?"],
    optionPool:["private home","office building","restaurant/café","public park","sports venue","shopping area","transportation hub","educational institution","hospital/clinic","industrial facility","place of worship","cultural venue","farm/rural","military site","entertainment venue","government building","hotel/accommodation","beach resort","natural reserve","construction site"],
    pick:5, difficulty:"easy" },
  { category:"SCENE", emoji:"🌍",
    question:"What architectural or structural element is most visible?",
    questionVariants:["What architectural or structural element is most visible?","What man-made structure dominates this image?","Which built environment feature stands out most?","What type of construction is featured here?","What is the primary human-built element visible?"],
    optionPool:["residential building","skyscraper","bridge","road/street","tower","stadium","temple/church","ruins","industrial plant","wall/fence","gate/archway","fountain","parking lot","tunnel","pier/dock","greenhouse","windmill","monument","scaffolding","none (no structures)"],
    pick:5, difficulty:"medium" },

  // ── TIME (3 angles) ───────────────────────────────────────────────────────
  { category:"TIME", emoji:"⏰",
    question:"What time of day does this image suggest?",
    questionVariants:["What time of day does this image suggest?","When during the day was this likely taken?","What hour does the lighting suggest?","At what time of day was this probably captured?","What part of the day is depicted here?"],
    optionPool:["pre-dawn (2–5am)","dawn/sunrise (5–7am)","early morning (7–9am)","mid-morning (9–11am)","midday (11am–1pm)","early afternoon (1–3pm)","late afternoon (3–6pm)","golden hour/sunset (6–8pm)","twilight/dusk (8–9pm)","night (9pm–2am)","artificial light (indeterminate)","unclear"],
    pick:5, difficulty:"medium" },
  { category:"TIME", emoji:"⏰",
    question:"What season does this image suggest?",
    questionVariants:["What season does this image suggest?","Which season is depicted or implied?","What time of year does this look like?","Which season best matches what you see?","What seasonal characteristics are present?"],
    optionPool:["early spring (budding)","full spring (blooming)","early summer (lush)","peak summer (dry/hot)","early autumn (turning)","peak autumn (colorful)","late autumn (bare)","early winter (first frost)","deep winter (snow)","tropical (no seasons)","arid (no seasons)","unclear / no seasonal cues"],
    pick:5, difficulty:"easy" },
  { category:"TIME", emoji:"⏰",
    question:"What historical period does this image suggest?",
    questionVariants:["What historical period does this image suggest?","When in history does this appear to be from?","What era do the visual cues suggest?","In which time period was this likely captured or set?","What decade or century does this image evoke?"],
    optionPool:["pre-1900 (19th century)","1900–1920s","1930–1950s","1960–1970s","1980–1990s","2000–2010s","2010–2020s","2020s–present","futuristic","timeless/unclear","medieval/historical recreation","ancient/archaeological"],
    pick:5, difficulty:"hard" },

  // ── LIGHT (3 angles) ──────────────────────────────────────────────────────
  { category:"LIGHT", emoji:"💡",
    question:"How would you describe the lighting?",
    questionVariants:["How would you describe the lighting?","What type of light source illuminates this image?","How is the scene lit?","Which lighting setup does this image use?","What is the dominant light quality here?"],
    optionPool:["direct bright sunlight","diffused overcast","golden hour warm light","blue hour cool light","artificial fluorescent","warm incandescent/tungsten","candlelight/firelight","neon/colored gels","flash/strobe","backlit (silhouette)","moonlight/stars","studio softbox","practical lighting","mixed natural+artificial","harsh direct flash","window light","spotlight","low-key dramatic","high-key soft","fog/haze diffusion"],
    pick:5, difficulty:"medium" },
  { category:"LIGHT", emoji:"💡",
    question:"What is the contrast level?",
    questionVariants:["What is the contrast level?","How much contrast exists between lights and darks?","How dramatic is the tonal range?","How would you rate the light/dark ratio?","What is the dynamic range of this image?"],
    optionPool:["near-zero contrast (flat/grey)","very low contrast","low contrast","moderate contrast","medium-high contrast","high contrast","very high contrast","extreme contrast (chiaroscuro)","HDR/tone-mapped","silhouette (max contrast)","foggy (reduced contrast)","selective contrast"],
    pick:5, difficulty:"medium" },
  { category:"LIGHT", emoji:"💡",
    question:"What is the primary direction of light?",
    questionVariants:["What is the primary direction of light?","From which direction does the main light come?","Where is the light source positioned relative to the subject?","How is the subject lit directionally?","What is the light angle in this image?"],
    optionPool:["front lit","45° front-side lit","side lit (split)","3/4 back lit","backlit/rim light","top lit (overhead)","bottom lit (uplight)","ambient (all directions)","no visible directional light","multiple sources","window side light","natural fill light","motivated by in-scene source","hidden/mystery source"],
    pick:5, difficulty:"hard" },

  // ── SUBJECT (4 angles) ────────────────────────────────────────────────────
  { category:"SUBJECT", emoji:"🎯",
    question:"What is the main subject of this image?",
    questionVariants:["What is the main subject of this image?","What is the focal point of this photograph?","What does this image primarily show?","What is the photographer focusing on?","What element draws attention first?"],
    optionPool:["human face","human body/action","group of people","domestic animal","wild animal","plant/vegetation","building/architecture","vehicle/transport","food/drink","consumer product","text/signage","landscape/scenery","abstract pattern","water/ocean","sky/clouds","artwork","technology device","clothing/fashion","furniture","still life"],
    pick:5, difficulty:"easy" },
  { category:"SUBJECT", emoji:"🎯",
    question:"How many distinct subjects are visible?",
    questionVariants:["How many distinct subjects are visible?","How many separate main elements can you count?","What is the quantity of primary subjects?","How many focal points does this image have?","What is the subject count in this image?"],
    optionPool:["0 (abstract/textural)","1 (singular)","2 (duo)","3 (trio)","4–5 (small group)","6–10 (medium group)","11–20 (large group)","20–50 (crowd)","50+ (mass/crowd)","unclear / overlapping","repeating pattern","depth layered (many)"],
    pick:5, difficulty:"easy" },
  { category:"SUBJECT", emoji:"🎯",
    question:"What action or state is the primary subject in?",
    questionVariants:["What action or state is the primary subject in?","What is the main subject doing?","In what state is the primary element?","How would you describe the activity of the main subject?","What is happening to the focal subject?"],
    optionPool:["completely still","resting/sleeping","walking slowly","running/moving fast","jumping/airborne","falling/descending","flying/floating","interacting with others","working/building","eating/drinking","playing/exercising","fighting/competing","observing/watching","celebrating","performing/presenting","creating/making","praying/meditating","swimming/water activity","driving/riding","looking at camera"],
    pick:5, difficulty:"medium" },
  { category:"SUBJECT", emoji:"🎯",
    question:"What is the relationship between subjects in the image?",
    questionVariants:["What is the relationship between subjects in the image?","How do the main elements relate to each other?","What type of interaction is shown between subjects?","What connects the different elements in this image?","How would you describe the dynamic between subjects?"],
    optionPool:["no interaction (single subject)","close physical contact","facing each other","side by side","one leads/other follows","confrontational","cooperative","romantic/affectionate","familial","competitive","isolated from each other","predator/prey","teacher/student","performer/audience","subject and environment blending","juxtaposition/contrast","symmetrical mirroring","hierarchical"],
    pick:5, difficulty:"hard" },

  // ── ENERGY (3 angles) ─────────────────────────────────────────────────────
  { category:"ENERGY", emoji:"⚡",
    question:"How much visual energy does this image convey?",
    questionVariants:["How much visual energy does this image convey?","How dynamic or energetic is this image?","What is the kinetic intensity of this image?","How active vs. passive does this image feel?","On a scale, how much energy is in this image?"],
    optionPool:["0 – absolute stillness","1–2 – very calm","3–4 – calm","5 – balanced/neutral","6–7 – somewhat dynamic","7–8 – dynamic","8–9 – very dynamic","9–10 – intense/chaotic","explosive/burst of energy","frozen high-energy moment","slow-burn intensity","rhythmic/pulsing"],
    pick:5, difficulty:"medium" },
  { category:"ENERGY", emoji:"⚡",
    question:"What type of motion or movement does this image suggest?",
    questionVariants:["What type of motion or movement does this image suggest?","What kind of movement is implied in this image?","How would you describe the sense of motion?","What movement narrative does this image tell?","Which type of implied motion is strongest?"],
    optionPool:["total stillness","slight sway/drift","walking pace","jogging","running","sprinting","explosive burst","spinning/rotating","falling/dropping","rising/ascending","flowing (liquid)","oscillating/vibrating","circular/looping","scattered chaos","zoom/rush toward camera","retreat/pulling away","frozen at peak","slow-motion feel","time-lapse feel"],
    pick:5, difficulty:"medium" },
  { category:"ENERGY", emoji:"⚡",
    question:"What level of chaos or order does this image portray?",
    questionVariants:["What level of chaos or order does this image portray?","How organized vs. chaotic does this image appear?","What is the degree of visual order in this image?","How structured or disordered is the composition?","What is the entropy level of this image?"],
    optionPool:["perfectly ordered/geometric","highly organized","mostly ordered","balanced order/chaos","slightly disordered","somewhat chaotic","mostly chaotic","highly chaotic","random/unpredictable","organic/natural order","systematic repetition","entropy at peak"],
    pick:5, difficulty:"hard" },

  // ── TEXTURE (3 angles) ────────────────────────────────────────────────────
  { category:"TEXTURE", emoji:"💎",
    question:"What texture is most prominent?",
    questionVariants:["What texture is most prominent?","What surface feel dominates this image?","What tactile quality is most visible?","If you touched the main surface, how would it feel?","What material texture appears most in this image?"],
    optionPool:["ultra-smooth/glass","smooth/polished","slightly textured","rough/grainy","very rough/jagged","soft/fluffy","hard/rigid","elastic/stretchy","brittle/crumbly","woven/fabric","metallic/reflective","organic/natural","liquid/fluid","sandy/granular","wooden/fibrous","rocky/mineral","crystalline","foam/porous","rubber/synthetic","layered/scaled"],
    pick:5, difficulty:"medium" },
  { category:"TEXTURE", emoji:"💎",
    question:"What material or substance appears most in this image?",
    questionVariants:["What material or substance appears most in this image?","What primary material is this image composed of?","Which substance makes up the largest area?","What is the dominant physical material visible?","What raw material characterizes this image most?"],
    optionPool:["metal","wood","stone/concrete","glass","water","earth/soil","vegetation/plants","fabric/textile","plastic/polymer","ceramic/pottery","leather","paper/cardboard","flesh/skin","cloud/mist","ice/snow","sand/dust","fur/hair","fire/smoke","paint/pigment","food ingredients"],
    pick:5, difficulty:"medium" },
  { category:"TEXTURE", emoji:"💎",
    question:"How would you describe the surface finish?",
    questionVariants:["How would you describe the surface finish?","What sheen or reflectivity characterizes the main surface?","How reflective or absorptive is the dominant material?","What finish quality is most visible?","What optical property best describes the main surface?"],
    optionPool:["mirror-like (specular)","highly glossy","semi-gloss","satin","matte","flat/chalk","velvet","frosted","brushed/satin metal","iridescent","translucent","transparent","opaque","hammered","patina/aged","rusty/corroded","wet/glistening","dry/arid","luminous/glowing","degraded/worn"],
    pick:5, difficulty:"hard" },

  // ── STYLE (3 angles) ──────────────────────────────────────────────────────
  { category:"STYLE", emoji:"✨",
    question:"Which visual style best describes this image?",
    questionVariants:["Which visual style best describes this image?","What photographic or artistic style is used?","How would an art critic categorize this image?","What visual movement or style does this belong to?","Which aesthetic tradition does this image follow?"],
    optionPool:["documentary/photojournalism","fashion/editorial","street photography","fine art","commercial/advertising","portrait","landscape/nature","abstract","architectural","sports/action","macro/close-up","astrophotography","underwater","drone/aerial","infrared","film/analog","digital/HDR","long exposure","double exposure","conceptual art"],
    pick:5, difficulty:"hard" },
  { category:"STYLE", emoji:"✨",
    question:"What aesthetic does this image exude?",
    questionVariants:["What aesthetic does this image exude?","How would you characterize the overall look and feel?","What design aesthetic best fits this image?","What cultural aesthetic is this closest to?","Which style movement does this visual belong to?"],
    optionPool:["minimalist","maximalist","brutalist","romantic","gothic","art deco","bauhaus","cyberpunk","cottagecore","vaporwave","dark academia","clean modern","vintage/nostalgic","industrial","bohemian","zen/wabi-sabi","tropical","arctic/nordic","mediterranean","futurist"],
    pick:5, difficulty:"hard" },
  { category:"STYLE", emoji:"✨",
    question:"What is the intended purpose of this image?",
    questionVariants:["What is the intended purpose of this image?","What was this image likely created for?","What is the commercial or artistic intent?","For what use was this image probably taken?","What is the function of this type of photograph?"],
    optionPool:["personal memory/snapshot","professional portfolio","news/media coverage","product listing","social media post","artistic expression","scientific documentation","surveillance/security","travel/tourism promotion","educational material","advertising campaign","event documentation","interior design reference","food menu item","fashion lookbook","real estate listing","stock photography","book/album cover","movie still","sports media"],
    pick:5, difficulty:"hard" },

  // ── NATURE (3 angles) ─────────────────────────────────────────────────────
  { category:"NATURE", emoji:"🌿",
    question:"What percentage of this image contains natural elements?",
    questionVariants:["What percentage of this image contains natural elements?","How much of this image is 'natural' vs. man-made?","What ratio of nature to urban exists in this image?","How dominant is the natural world in this image?","What is the nature-to-civilization ratio here?"],
    optionPool:["0% natural (entirely artificial)","1–10% (traces of nature)","10–25% (mostly urban)","25–50% (mixed, urban dominant)","50–75% (mixed, nature dominant)","75–90% (mostly natural)","90–99% (nearly pristine)","100% (fully untouched nature)","cultivated nature (garden/farm)","manicured/designed nature","industrial nature (port, quarry)","post-apocalyptic nature reclaim"],
    pick:5, difficulty:"easy" },
  { category:"NATURE", emoji:"🌿",
    question:"What is the primary natural element visible?",
    questionVariants:["What is the primary natural element visible?","Which natural feature stands out most?","What aspect of nature is most prominent here?","What natural phenomenon is shown?","Which element of the natural world dominates?"],
    optionPool:["ocean/sea","river/lake","waterfall","forest trees","grassland","mountains","desert sand","polar ice","volcanic/geothermal","flowers/blooms","animals","sky/clouds","storm/weather","fire/lava","jungle vegetation","fungi/moss","coral reef","aurora/lights","stars/galaxy","soil/rock"],
    pick:5, difficulty:"easy" },
  { category:"NATURE", emoji:"🌿",
    question:"What weather condition is depicted or implied?",
    questionVariants:["What weather condition is depicted or implied?","What is the apparent weather in this image?","What meteorological condition is visible?","What atmospheric conditions are shown?","If you could feel the weather in this image, what would it be?"],
    optionPool:["clear blue sky","partly cloudy","overcast/grey","rain/drizzle","heavy rain/storm","thunderstorm/lightning","snow/blizzard","fog/mist","heatwave/haze","strong wind","tornado/extreme","rainbow","sunset clouds","golden light (fair)","twilight","night sky","wildfire smoke","flood","drought","none/indoor"],
    pick:5, difficulty:"medium" },

  // ── GEOGRAPHY (2 angles) ──────────────────────────────────────────────────
  { category:"GEOGRAPHY", emoji:"🗺️",
    question:"In which continent or world region does this image appear set?",
    questionVariants:["In which continent or world region does this image appear set?","Where in the world does this image seem to be from?","Which geographic region does this most resemble?","What part of the globe does this image represent?","In which part of the world was this likely taken?"],
    optionPool:["Western Europe","Eastern Europe","North America (US/Canada)","Latin America","Sub-Saharan Africa","North Africa / Middle East","South Asia (India etc.)","East Asia (China/Japan/Korea)","Southeast Asia","Oceania / Pacific","Russia / Central Asia","Arctic / Antarctic","Caribbean","Scandinavia","Mediterranean basin","Unclear / universal"],
    pick:5, difficulty:"hard" },
  { category:"GEOGRAPHY", emoji:"🗺️",
    question:"What type of geographic terrain is shown?",
    questionVariants:["What type of geographic terrain is shown?","What landform or physical geography is depicted?","What terrain type best matches this image?","What landscape type characterizes this scene?","What geographic biome or terrain is this?"],
    optionPool:["coastal/littoral","riverine/fluvial","mountainous/alpine","highland plateau","lowland plain","desert basin","arctic tundra","tropical rainforest","temperate forest","savanna/grassland","wetland/marsh","urban environment","agricultural/rural","volcanic","karst/limestone","canyon/gorge","island","estuary/delta","fjord","glacier"],
    pick:5, difficulty:"hard" },

  // ── PEOPLE (3 angles, NEW) ────────────────────────────────────────────────
  { category:"PEOPLE", emoji:"👤",
    question:"What age group does the primary person appear to belong to?",
    questionVariants:["What age group does the primary person appear to belong to?","How old does the main person in this image appear?","What is the approximate age of the subject?","Which life stage does the person depicted represent?","What demographic age cohort does the subject appear to be in?"],
    optionPool:["infant (0–2)","toddler (2–5)","child (5–12)","teenager (12–17)","young adult (18–25)","adult (25–40)","middle-aged (40–60)","senior (60–75)","elderly (75+)","unclear / cannot tell","multiple age groups","group spans all ages"],
    pick:5, difficulty:"medium" },
  { category:"PEOPLE", emoji:"👤",
    question:"What is the apparent emotional expression of the person?",
    questionVariants:["What is the apparent emotional expression of the person?","What emotion does the person's face show?","How would you describe the person's facial expression?","What feeling is the person in this image expressing?","What mood is displayed by the person?"],
    optionPool:["broad smile","subtle smile","neutral/blank","concentrating","surprised","fearful","angry/frustrated","sad/crying","disgusted","contemptuous","proud","embarrassed","confused","excited/elated","tired/exhausted","in pain","laughing","pensive/thoughtful","not visible","no person"],
    pick:5, difficulty:"easy" },
  { category:"PEOPLE", emoji:"👤",
    question:"What is the person's apparent activity or role?",
    questionVariants:["What is the person's apparent activity or role?","What role does the person appear to play?","What is the person's occupation or activity?","What social role does the person seem to have?","What is the person doing or representing?"],
    optionPool:["athlete/sport","artist/creative","professional/business","manual worker","medical professional","religious figure","performer/entertainer","chef/food","teacher/educator","politician/leader","tourist/traveler","parent with child","student","military/law enforcement","retail/service","homeless/street","celebrity","farmer/agricultural","scientist/researcher","no person visible"],
    pick:5, difficulty:"hard" },

  // ── ANIMAL (2 angles, NEW) ────────────────────────────────────────────────
  { category:"ANIMAL", emoji:"🐾",
    question:"What category of animal is most prominent?",
    questionVariants:["What category of animal is most prominent?","What type of animal appears in this image?","Which animal kingdom group is represented?","What species type is shown here?","What class of animal is depicted?"],
    optionPool:["domestic dog","domestic cat","horse","farm livestock","wild feline (lion/tiger etc.)","wild canine (wolf/fox)","primate","bear","deer/ungulate","bird of prey","songbird","waterfowl","fish","marine mammal","reptile","amphibian","insect","arachnid","exotic/tropical","no animal visible"],
    pick:5, difficulty:"easy" },
  { category:"ANIMAL", emoji:"🐾",
    question:"What is the animal doing?",
    questionVariants:["What is the animal doing?","What behavior is the animal displaying?","How would you describe the animal's activity?","What action is the animal performing?","What is the animal's state or behavior?"],
    optionPool:["resting/sleeping","walking/moving","running/fleeing","hunting/stalking","feeding/eating","playing","grooming","drinking","flying","swimming","climbing","fighting/competing","mating/courtship","nurturing young","socializing","alert/watching","hiding/camouflaged","injured/distressed","in captivity","not visible"],
    pick:5, difficulty:"medium" },

  // ── TECHNOLOGY (2 angles, NEW) ────────────────────────────────────────────
  { category:"TECHNOLOGY", emoji:"💻",
    question:"What level of technology is present in this image?",
    questionVariants:["What level of technology is present in this image?","How advanced is the technology visible?","What technological era does this image represent?","How many modern devices or tech elements are visible?","What is the tech-density of this image?"],
    optionPool:["no technology (pre-industrial)","simple hand tools","basic machinery","early industrial (steam/mechanical)","mid 20th century electronics","analog computing/telecoms","early digital (1980–90s)","internet era (1990–2005)","smartphone era (2005–2015)","AI/IoT era (2015+)","futuristic/speculative","multiple tech eras mixed"],
    pick:5, difficulty:"hard" },
  { category:"TECHNOLOGY", emoji:"💻",
    question:"What type of technology or device is most visible?",
    questionVariants:["What type of technology or device is most visible?","What technological object stands out in this image?","Which category of technology is featured?","What device or system is shown?","What kind of tech equipment is depicted?"],
    optionPool:["smartphone/tablet","laptop/computer","television/display","camera/photography","vehicle/transport tech","medical equipment","industrial machinery","agricultural equipment","military tech","communications tower","server/data center","smart home device","wearable tech","scientific instrument","renewable energy tech","construction equipment","kitchen appliance","entertainment system","robotic/automation","none visible"],
    pick:5, difficulty:"medium" },

  // ── ART / CREATIVITY (3 angles, NEW) ─────────────────────────────────────
  { category:"ART", emoji:"🎭",
    question:"What artistic medium or technique does this image use or depict?",
    questionVariants:["What artistic medium or technique does this image use or depict?","What creative technique is showcased?","How was this image created or what does it show being created?","What art form is represented here?","What is the dominant artistic medium?"],
    optionPool:["oil painting","watercolor","acrylic/gouache","digital art","photography","sculpture","installation art","street art/graffiti","textile/weaving","ceramics/pottery","drawing/illustration","printmaking","collage/mixed media","architecture as art","performance art","film/video art","light installation","sound visualization","body art","no obvious art medium"],
    pick:5, difficulty:"hard" },
  { category:"ART", emoji:"🎭",
    question:"What cultural or artistic period does this image evoke?",
    questionVariants:["What cultural or artistic period does this image evoke?","Which art movement does this image belong to or reference?","What cultural era or movement inspired this image?","Which art-historical period does this most resemble?","What artistic movement is reflected in this visual?"],
    optionPool:["Renaissance (15–17c)","Baroque","Romanticism (19c)","Impressionism","Expressionism","Cubism","Art Nouveau","Dada/Surrealism","Abstract Expressionism","Pop Art","Minimalism","Postmodernism","Contemporary (2000+)","Eastern classical","Street/Urban culture","Digital native","No obvious period","Folk/traditional","Tribal/indigenous","Sci-fi/speculative"],
    pick:5, difficulty:"hard" },
  { category:"ART", emoji:"🎭",
    question:"How creative or unconventional is this image?",
    questionVariants:["How creative or unconventional is this image?","How original or innovative is the visual concept?","How would you rate the creative boldness of this image?","How ordinary vs. extraordinary is this image?","What is the originality level of this visual?"],
    optionPool:["completely conventional/standard","mostly ordinary","slightly creative","moderately creative","quite creative","very creative","highly innovative","groundbreaking/avant-garde","surreal/impossible","deliberately clichéd","appropriation/parody","accidental beauty","raw/unfiltered","over-produced","nostalgic recreation","nature as unintentional art","AI-generated feel","collage/layered complexity"],
    pick:5, difficulty:"hard" },

  // ── PERSPECTIVE (2 angles, NEW) ───────────────────────────────────────────
  { category:"PERSPECTIVE", emoji:"👁️",
    question:"From what camera angle or viewpoint was this image taken?",
    questionVariants:["From what camera angle or viewpoint was this image taken?","What is the camera position relative to the subject?","What shooting angle was used?","From which perspective is this image captured?","What viewpoint does the photographer use?"],
    optionPool:["eye level (neutral)","slight high angle","high angle (looking down)","bird's eye (top-down)","slight low angle","low angle (looking up)","worm's eye (extreme low)","behind the subject","POV/first person","through-the-viewfinder","underwater looking up","aerial/drone","tilted/Dutch angle","extreme close-up","extreme wide","over-the-shoulder","reflection/mirror","fish-eye lens","tilt-shift","unclear"],
    pick:5, difficulty:"hard" },
  { category:"PERSPECTIVE", emoji:"👁️",
    question:"How close is the camera to the subject?",
    questionVariants:["How close is the camera to the subject?","What is the shooting distance?","How far from the subject was the camera placed?","What focal distance characterizes this image?","At what distance from the subject was this taken?"],
    optionPool:["extreme macro (< 1cm)","close macro (1–5cm)","ultra close-up (5–30cm)","close-up (30cm–1m)","medium close-up (1–2m)","medium shot (2–5m)","medium wide (5–15m)","wide (15–50m)","long shot (50–200m)","extreme long (200m+)","telephoto compression","wide-angle expansion","unclear distance","subject fills frame entirely","subject tiny in frame"],
    pick:5, difficulty:"medium" },

  // ── FOOD (2 angles, NEW) ──────────────────────────────────────────────────
  { category:"FOOD", emoji:"🍽️",
    question:"What category of food or drink is shown?",
    questionVariants:["What category of food or drink is shown?","What type of cuisine or food product is depicted?","What food group is most prominent?","What category of edible item is this?","What type of food/beverage is featured?"],
    optionPool:["fresh produce/vegetables","fresh fruit","meat/poultry","seafood","dairy products","baked goods/bread","dessert/sweets","fast food","fine dining dish","street food","pasta/noodles","salad/raw","soup/stew","beverage (non-alcoholic)","alcoholic drink","snack/packaged food","breakfast item","plant-based/vegan","international/ethnic cuisine","no food visible"],
    pick:5, difficulty:"easy" },
  { category:"FOOD", emoji:"🍽️",
    question:"What presentation style is used for the food?",
    questionVariants:["What presentation style is used for the food?","How is the food staged or presented?","What plating or food styling approach is evident?","How is this food displayed or served?","What food photography style is used here?"],
    optionPool:["fine dining plating","rustic/home style","overhead flat lay","45° angle shot","in-hand/street style","packaged/commercial","raw/unprocessed","in cooking process","messy/deconstructed","minimalist single item","abundance/large spread","natural/farm setting","market stall","restaurant table","in-bowl/pot","extreme close-up (textures)","garnished/decorated","uncooked ingredients","leftovers/candid","no food present"],
    pick:5, difficulty:"medium" },

  // ── SHAPE / GEOMETRY (2 angles, NEW) ─────────────────────────────────────
  { category:"SHAPE", emoji:"🔷",
    question:"What dominant geometric shape is most visible?",
    questionVariants:["What dominant geometric shape is most visible?","Which geometric form appears most in this image?","What shape or form characterizes the main element?","Which geometric pattern is most prominent?","What geometric language does this image use?"],
    optionPool:["circle/oval","rectangle/square","triangle","diagonal/slash","spiral/helix","star/radial","organic/amorphous","grid/lattice","repeating dots","zigzag/chevron","wave/sinusoidal","hexagonal","polygon (5+ sides)","arch/curve","no dominant shape","multiple competing shapes","fractal/complex","irregular/random","concentric","X/cross"],
    pick:5, difficulty:"medium" },
  { category:"SHAPE", emoji:"🔷",
    question:"How symmetrical is this image?",
    questionVariants:["How symmetrical is this image?","What is the symmetry level of this composition?","How balanced and mirrored is the visual layout?","Does this image have bilateral or rotational symmetry?","How evenly balanced is the compositional layout?"],
    optionPool:["perfect bilateral symmetry","near-perfect symmetry","slight symmetry","asymmetric but balanced","slightly asymmetric","moderately asymmetric","strongly asymmetric","radial symmetry (360°)","point symmetry (180°)","translational symmetry (repeat)","golden ratio balance","no balance / chaotic","left-heavy","right-heavy","top-heavy","bottom-heavy"],
    pick:5, difficulty:"hard" },

  // ── CULTURE (2 angles, NEW) ───────────────────────────────────────────────
  { category:"CULTURE", emoji:"🏛️",
    question:"What cultural context does this image suggest?",
    questionVariants:["What cultural context does this image suggest?","What civilization or culture does this image represent?","Which cultural tradition is evident in this image?","What cultural background does this image reflect?","What cultural community or society does this depict?"],
    optionPool:["Western European","North American","Latin American","East Asian","South Asian","Middle Eastern","Sub-Saharan African","Scandinavian","Mediterranean","Indigenous/tribal","Russian/Slavic","Oceanic/Pacific","Mixed/multicultural","Urban global","Religious/spiritual","Academic/institutional","Working class","Upper class/elite","Youth subculture","Rural/agricultural"],
    pick:5, difficulty:"hard" },
  { category:"CULTURE", emoji:"🏛️",
    question:"What cultural event or activity is depicted?",
    questionVariants:["What cultural event or activity is depicted?","What type of social occasion is shown?","What cultural practice is visible?","What kind of event or gathering does this show?","What social ritual or event is captured?"],
    optionPool:["religious ceremony","festival/carnival","wedding","funeral","political rally","sports event","concert/performance","street protest","market/commerce","graduation","birthday celebration","military parade","cultural ceremony","art exhibition","fashion event","food festival","community gathering","business meeting","family gathering","no social event"],
    pick:5, difficulty:"hard" },
];

// Pick a random question phrasing from questionVariants (or fallback to question)
function pickQuestion(a: ImageAngle): string {
  if (a.questionVariants?.length) {
    return a.questionVariants[Math.floor(Math.random() * a.questionVariants.length)];
  }
  return a.question;
}

function getImageAngles(
  count: number,
  preferredCategories?: string[],
): Array<{ category: string; emoji: string; question: string; options: string[]; difficulty: "easy" | "medium" | "hard" }> {
  let pool = IMAGE_ANGLE_POOL;
  if (preferredCategories?.length) {
    const preferred = pool.filter((a) => preferredCategories.includes(a.category));
    const rest = pool.filter((a) => !preferredCategories.includes(a.category));
    pool = [...preferred, ...rest];
  }
  const shuffled = pickRandom(pool, Math.min(count, pool.length));
  return shuffled.map((a) => ({
    category: a.category,
    emoji: a.emoji,
    question: pickQuestion(a),
    options: pickRandom(a.optionPool, Math.min(a.pick, a.optionPool.length)),
    difficulty: a.difficulty,
  }));
}

// ── VIDEO / AUDIO / TEXT / SOCIAL angle pools ─────────────────────────────────

// ── VIDEO (25 angles, 5 variants, 22+ options, pick 5) ────────────────────────
const VIDEO_ANGLE_POOL: ImageAngle[] = [
  { category:"ACTION", emoji:"🎬",
    question:"What action is being performed?",
    questionVariants:["What action is being performed?","What is happening in this video?","What activity is shown?","What behavior is the subject engaged in?","What is the primary action captured?"],
    optionPool:["running/sprinting","walking/strolling","jumping/leaping","swimming/diving","flying/soaring","eating/drinking","playing/gaming","working/building","talking/speaking","fighting/competing","dancing/performing","driving/riding","climbing/scaling","resting/sleeping","cooking/preparing food","exercising/training","falling/tumbling","carrying/lifting","searching/exploring","celebrating"],
    pick:5, difficulty:"easy" },
  { category:"SCENE", emoji:"🌍",
    question:"What type of environment is shown?",
    questionVariants:["What type of environment is shown?","Where does this video take place?","What setting is depicted?","In what environment is the action occurring?","What location type is this video shot in?"],
    optionPool:["indoor room","outdoor urban street","outdoor nature","underwater","aerial/drone view","forest/woodland","beach/coastal","desert","mountain/alpine","sports arena/stadium","laboratory/office","busy market/street","waterway/river","cave/underground","rooftop","vehicle interior","construction site","historic site","snow/arctic","tropical jungle"],
    pick:5, difficulty:"easy" },
  { category:"EMOTION", emoji:"💭",
    question:"What overall mood does this video convey?",
    questionVariants:["What overall mood does this video convey?","What atmosphere does this video create?","How does watching this video make you feel?","What emotional tone runs through this video?","What feeling does this video evoke?"],
    optionPool:["exciting/thrilling","calm/peaceful","tense/suspenseful","cheerful/happy","dramatic/intense","melancholic/sad","mysterious/eerie","inspiring/motivating","humorous/funny","scary/frightening","romantic/tender","educational/informative","chaotic/overwhelming","nostalgic/sentimental","hopeful/uplifting","threatening/menacing","absurd/surreal","triumphant","lonely/isolated","playful/lighthearted"],
    pick:5, difficulty:"medium" },
  { category:"SUBJECT", emoji:"🎯",
    question:"What is the primary subject?",
    questionVariants:["What is the primary subject?","What is the video mainly about?","What element is the camera focusing on?","What is the focal point of this video?","What is the main thing being shown?"],
    optionPool:["single person","group of people","child/children","elderly person","athlete","animal (domestic)","animal (wild)","vehicle in motion","industrial machinery","natural landscape","crowd/mass of people","food preparation","scientific demonstration","artistic performance","sports play","wildlife behavior","weather event","construction/demolition","cultural ceremony","product showcase"],
    pick:5, difficulty:"easy" },
  { category:"MOTION", emoji:"⚡",
    question:"How fast is the primary motion?",
    questionVariants:["How fast is the primary motion?","What is the motion speed in this video?","How would you describe the movement pace?","At what speed are things moving?","What is the velocity of the primary action?"],
    optionPool:["completely still / no motion","very slow (crawling)","slow (walking pace)","moderate (jogging)","fast (running)","very fast (sprinting)","extremely fast (blur)","slow-motion (artificially slowed)","time-lapse (artificially fast)","alternating speeds","varying pace","sudden burst then stop"],
    pick:5, difficulty:"medium" },
  { category:"STYLE", emoji:"✨",
    question:"What style of video is this?",
    questionVariants:["What style of video is this?","What production genre does this belong to?","What type of video content is this?","How would you categorize this video?","What format of video content is this?"],
    optionPool:["news broadcast","feature documentary","advertisement/commercial","tutorial/how-to","amateur home video","cinematic film","live sports broadcast","music video","security/CCTV footage","viral social media clip","nature documentary","animated/cartoon","interview/talking head","reality TV","surveillance/bodycam","scientific recording","travel vlog","political speech","accident/event recording","educational lecture"],
    pick:5, difficulty:"hard" },
  { category:"CAMERA", emoji:"📷",
    question:"What camera technique is used?",
    questionVariants:["What camera technique is used?","How is the camera moving in this video?","What cinematographic approach is visible?","What camera movement or setup is evident?","How would a cinematographer describe this shot?"],
    optionPool:["static/tripod fixed","slow deliberate pan","fast whip pan","slow zoom in","fast zoom in/out","tracking/dolly shot","handheld/shaky","drone aerial","extreme close-up","wide establishing shot","POV/first-person","timelapse","slow motion capture","crane/jib shot","over-shoulder","reaction cut","two-shot","cutaway","underwater cam","360°/fisheye"],
    pick:5, difficulty:"hard" },
  { category:"COUNT", emoji:"🔢",
    question:"How many distinct subjects are visible?",
    questionVariants:["How many distinct subjects are visible?","How many people or objects are the focus?","What is the number of main elements?","How many subjects can you count?","What is the quantity of focal elements in this video?"],
    optionPool:["0 (no subject, abstract)","1 (solo)","2 (duo/pair)","3 (trio)","4–5 (small group)","6–10 (medium group)","11–20 (large group)","20–50 (crowd)","50–200 (large crowd)","200+ (mass crowd)","unclear / obscured","pattern/many of same thing"],
    pick:5, difficulty:"easy" },
  { category:"LIGHT", emoji:"💡",
    question:"How would you describe the lighting?",
    questionVariants:["How would you describe the lighting?","What lighting conditions are present?","What is the quality of light in this video?","How is the scene illuminated?","What light environment is shown?"],
    optionPool:["bright clear daylight","overcast diffused light","golden hour warm glow","blue hour twilight","nighttime/dark","artificial fluorescent","warm indoor lighting","neon/colored lights","backlit silhouette","low-key dramatic","flashing/strobe","candlelight/firelight","mixed natural+artificial","underwater caustics","fog/mist diffusion","spotlight focus","full studio lighting","infrared","bioluminescent/glow","harsh direct sun"],
    pick:5, difficulty:"medium" },
  { category:"QUALITY", emoji:"⭐",
    question:"How would you rate the video quality?",
    questionVariants:["How would you rate the video quality?","What is the production quality level?","How professional does this video look?","What technical quality does this video have?","How well-produced is this video?"],
    optionPool:["4K cinematic professional","HD broadcast quality","HD but basic production","720p standard quality","SD/low resolution","VHS/analog era quality","mobile phone quality","security cam quality","very poor/degraded","corrupted/glitchy","intentionally raw (aesthetic)","inconsistent quality"],
    pick:5, difficulty:"easy" },
  { category:"SOUND", emoji:"🔊",
    question:"What audio environment does this video likely have?",
    questionVariants:["What audio environment does this video likely have?","What kind of audio would accompany this video?","What sound environment is suggested?","What audio would be heard in this video?","What is the sonic environment of this clip?"],
    optionPool:["clear speech/dialogue","background music (calm)","background music (energetic)","crowd noise/cheering","natural sounds (birds/wind)","engine/machine sounds","complete silence","urban ambient","sports commentary","emergency sounds (sirens)","construction noise","underwater sounds","animal sounds","electronic/synthesized","multiple overlapping sounds","music only (no speech)","whisper/quiet","loud/intense sound","echo/reverb space","unclear"],
    pick:5, difficulty:"medium" },
  { category:"TIME", emoji:"⏰",
    question:"What time period is this video from?",
    questionVariants:["What time period is this video from?","When was this video likely recorded?","What era does this video appear to be from?","What decade does this video belong to?","What historical period does this footage represent?"],
    optionPool:["pre-1960 (very old footage)","1960s","1970s","1980s","1990s","early 2000s","2005–2010","2011–2015","2016–2020","2021–present","unclear / timeless","staged historical recreation"],
    pick:5, difficulty:"hard" },
  { category:"WEATHER", emoji:"🌦️",
    question:"What weather condition is shown or implied?",
    questionVariants:["What weather condition is shown or implied?","What are the meteorological conditions?","What is the weather like in this video?","What atmospheric conditions are evident?","What climate situation does this video show?"],
    optionPool:["clear sunny","partly cloudy","overcast/grey","light rain/drizzle","heavy rain/storm","thunderstorm","snow/blizzard","fog/mist","strong wind","heat/haze","indoor (no weather)","night (weather unclear)","flood","wildfire/smoke","tornado/hurricane","extreme cold","extreme heat","sandstorm","hail","rainbow/clearing storm"],
    pick:5, difficulty:"medium" },
  { category:"PACING", emoji:"🎵",
    question:"How would you describe the video's editing pace?",
    questionVariants:["How would you describe the video's editing pace?","What is the edit rhythm of this video?","How quickly does this video cut between shots?","What is the tempo of this video's editing?","How dynamic is the editing in this video?"],
    optionPool:["continuous single shot (no cuts)","very slow cuts (5+ sec each)","slow cuts (3–5 sec)","moderate pacing","fast cuts (1–2 sec)","very fast cuts (<1 sec)","MTV-style rapid montage","rhythmic/music-matched cuts","random/chaotic cuts","long takes with slow zoom","jump cuts","parallel editing (two stories)"],
    pick:5, difficulty:"hard" },
  { category:"NARRATIVE", emoji:"📖",
    question:"What kind of story or narrative does this video tell?",
    questionVariants:["What kind of story or narrative does this video tell?","What narrative structure does this video follow?","What story is this video communicating?","What type of narrative arc is present?","What story form does this video use?"],
    optionPool:["no narrative (abstract)","single moment/snapshot","before and after","journey/travel story","conflict and resolution","demonstration/tutorial","testimonial/personal account","event coverage","instructional sequence","humor/punchline","transformation","sports highlight","scientific observation","social commentary","product reveal","mystery/investigation","breaking news","celebration/achievement","tragedy/loss","propaganda/persuasion"],
    pick:5, difficulty:"hard" },
  { category:"CULTURE", emoji:"🏛️",
    question:"What cultural context does this video represent?",
    questionVariants:["What cultural context does this video represent?","What culture or society is depicted?","What cultural community is shown?","Which cultural tradition is being represented?","What civilizational or cultural context is this?"],
    optionPool:["Western European","North American","Latin American","East Asian","South Asian","Middle Eastern","Sub-Saharan African","Scandinavian","Mediterranean","Indigenous/tribal","Russian/Slavic","Oceanic/Pacific","Mixed international","Urban global","Rural/agricultural","Religious/ceremonial","Academic/institutional","Sports culture","Youth subculture","Corporate/business"],
    pick:5, difficulty:"hard" },
  { category:"SAFETY", emoji:"🛡️",
    question:"Does this video contain potentially sensitive content?",
    questionVariants:["Does this video contain potentially sensitive content?","How safe is this video for general audiences?","What audience rating would this video receive?","Is there any concerning content in this video?","What content advisory would apply to this video?"],
    optionPool:["fully safe for all ages","suitable for general audiences","mild violence/action (PG)","moderate intensity (PG-13)","strong content (adult)","graphic violence","disturbing imagery","safety hazards shown","illegal activity depicted","explicit content","extreme/shocking content","none of the above"],
    pick:5, difficulty:"medium" },
  { category:"ANIMAL", emoji:"🐾",
    question:"What type of animal is featured?",
    questionVariants:["What type of animal is featured?","What animal is shown in this video?","What species is most prominent?","Which type of animal is the focus?","What animal class is depicted?"],
    optionPool:["domestic dog","domestic cat","horse/equine","farm livestock","big cat (lion/tiger)","wolf/fox","primate/ape","bear","bird of prey","songbird","marine mammal (dolphin/whale)","fish/aquatic","reptile/snake","insect","exotic/tropical bird","herd animal","rodent","amphibian","no animal","multiple species"],
    pick:5, difficulty:"easy" },
  { category:"SPORT", emoji:"🏆",
    question:"What sport or physical discipline is shown?",
    questionVariants:["What sport or physical discipline is shown?","What athletic activity is depicted?","What sport is being played or practiced?","What physical game or contest is featured?","What sporting activity is this?"],
    optionPool:["football/soccer","basketball","tennis","swimming","athletics/track","cycling","martial arts","gymnastics","skiing/snowboarding","surfing","boxing/combat sports","baseball","rugby","volleyball","hockey","golf","motor racing","climbing","dance/rhythmic","no sport/not applicable"],
    pick:5, difficulty:"easy" },
  { category:"TECHNOLOGY", emoji:"💻",
    question:"What technology is most prominent?",
    questionVariants:["What technology is most prominent?","What technological device or system is featured?","What kind of technology appears in this video?","What tech element stands out most?","What is the main technology shown?"],
    optionPool:["smartphone/mobile device","computer/laptop","television/screen","camera/photography","vehicle/transport","medical equipment","industrial robot","construction machinery","agricultural equipment","military technology","aircraft","spacecraft","smart home device","scientific instrument","renewable energy","gaming/entertainment","communications tower","drone","wearable tech","no technology"],
    pick:5, difficulty:"medium" },
  { category:"ART", emoji:"🎭",
    question:"What artistic or creative content is shown?",
    questionVariants:["What artistic or creative content is shown?","What form of creative expression is depicted?","What art form features in this video?","What creative activity is captured?","What artistic discipline is represented?"],
    optionPool:["live music performance","dance performance","theater/drama","street art creation","painting/drawing","sculpture","film/cinema","fashion show","comedy stand-up","magic/illusion","circus/acrobatics","opera/classical","spoken word/poetry","DJ set/electronic","sports as art (skateboard etc.)","architecture/design","photography","digital/VR art","cultural/traditional art","no artistic content"],
    pick:5, difficulty:"medium" },
  { category:"PERSPECTIVE", emoji:"👁️",
    question:"From what viewpoint is this video shot?",
    questionVariants:["From what viewpoint is this video shot?","What is the camera's perspective?","How is the camera positioned?","What viewpoint angle is used?","From whose perspective is this video taken?"],
    optionPool:["eye level neutral","slightly high angle","bird's eye (top-down)","slightly low angle","worm's eye (extreme low)","POV/first-person","over-the-shoulder","behind subject","through-the-windshield","underwater looking up","aerial/drone high","aerial/drone low","orbiting 360°","security camera angle","body cam style","extreme close-up","extreme wide","multiple angles (split)","handheld follow","hidden/candid cam"],
    pick:5, difficulty:"hard" },
  { category:"PEOPLE", emoji:"👤",
    question:"What demographic is most represented?",
    questionVariants:["What demographic is most represented?","What age/gender group is featured?","What demographic category does the main subject represent?","Who are the primary people shown?","What human demographic is most visible?"],
    optionPool:["infant/baby","young children","pre-teens","teenagers","young adults (18–25)","adults (25–40)","middle-aged (40–60)","seniors (60+)","mixed ages","men predominantly","women predominantly","mixed genders","specific ethnicity (diverse)","professional group","athlete group","military/uniform","religious group","family unit","no people","crowd (indeterminate)"],
    pick:5, difficulty:"medium" },
  { category:"ECONOMY", emoji:"💰",
    question:"What economic context does this video suggest?",
    questionVariants:["What economic context does this video suggest?","What socioeconomic environment is depicted?","What economic level does this setting represent?","What financial context is evident?","What socioeconomic tier does this appear to represent?"],
    optionPool:["luxury/high-end","upper middle class","middle class","working class","low income/poverty","subsistence level","industrial/commercial","agricultural/rural economy","street economy/informal","post-conflict/rebuilding","tech/startup economy","academic/non-profit","government/public sector","natural economy (no money)","unclear","mixed economic contexts"],
    pick:5, difficulty:"hard" },
  { category:"IMPACT", emoji:"🌊",
    question:"What potential impact could this video have on a viewer?",
    questionVariants:["What potential impact could this video have on a viewer?","What effect might this video have on someone watching it?","What reaction would most viewers likely have?","What psychological impact could this video create?","What influence might this video have?"],
    optionPool:["inspire to take action","evoke strong emotion","purely entertain","educate/inform","raise awareness of issue","shock/disturb","make laugh/amuse","reassure/comfort","persuade to buy/support","change political opinion","trigger fear or concern","create sense of wonder","motivate physical activity","promote cultural understanding","cause controversy","no particular impact","desensitize","build empathy","provoke debate","entertain children"],
    pick:5, difficulty:"hard" },
];

// ── AUDIO (22 angles, 5 variants, 22+ options, pick 5) ────────────────────────
const AUDIO_ANGLE_POOL: ImageAngle[] = [
  { category:"LANGUAGE", emoji:"🗣️",
    question:"What language is spoken?",
    questionVariants:["What language is spoken?","Which language is being used?","What tongue does the speaker use?","In which language is this audio?","What language can you identify?"],
    optionPool:["english","american english","british english","italian","french","spanish","latin american spanish","german","portuguese","brazilian portuguese","russian","arabic","mandarin chinese","cantonese","japanese","hindi","dutch","polish","turkish","swedish","korean","other/unidentifiable"],
    pick:5, difficulty:"easy" },
  { category:"EMOTION", emoji:"💭",
    question:"What emotion does the speaker convey?",
    questionVariants:["What emotion does the speaker convey?","What feeling does the speaker express?","What emotional state is the speaker in?","How does the speaker sound emotionally?","What emotion is communicated by the voice?"],
    optionPool:["happy/joyful","sad/sorrowful","angry/frustrated","neutral/flat","excited/enthusiastic","calm/relaxed","fearful/scared","disgusted","surprised/shocked","confident/assertive","nervous/anxious","sarcastic","sincere/earnest","urgent/pressured","bored/disinterested","proud","guilty/ashamed","hopeful","grieving","passionate"],
    pick:5, difficulty:"medium" },
  { category:"QUALITY", emoji:"⭐",
    question:"How clear is the audio?",
    questionVariants:["How clear is the audio?","What is the audio quality level?","How good is the recording quality?","How would you rate the audio clarity?","What is the technical quality of this recording?"],
    optionPool:["studio perfect (broadcast)","very clear (professional)","clear (prosumer)","good (decent mic)","acceptable (phone quality)","slight muffling","moderate degradation","noisy/hissy","heavy static","distorted/clipping","echo/reverb issue","underwater/muffled","wind interference","very poor/barely audible","corrupted/artifact heavy","telephone quality","VoIP/compressed","cassette/analog quality"],
    pick:5, difficulty:"easy" },
  { category:"SPEAKER", emoji:"👤",
    question:"How many speakers are present?",
    questionVariants:["How many speakers are present?","How many voices can be heard?","What is the number of distinct speakers?","How many people are speaking?","What is the speaker count?"],
    optionPool:["1 speaker (solo)","2 speakers (dialogue)","3 speakers","4–5 speakers","6–10 speakers (group)","10–20 speakers","large crowd (20+)","voice-over only","narration + background voices","chorus/group singing","debate (opposing)","interview format (2)","panel discussion (3+)","no human voice","voice obscured/unclear"],
    pick:5, difficulty:"easy" },
  { category:"GENDER", emoji:"👥",
    question:"What is the apparent gender of the main speaker?",
    questionVariants:["What is the apparent gender of the main speaker?","What gender does the primary voice present as?","How would you classify the speaker's apparent gender?","What gendered voice quality is most prominent?","What gender presentation does the main speaker have?"],
    optionPool:["adult male (deep)","adult male (moderate)","adult male (higher)","adult female (lower)","adult female (moderate)","adult female (higher)","child male","child female","child (indeterminate)","elderly male","elderly female","androgynous / unclear","multiple genders mixed","voice altered/disguised","no human voice"],
    pick:5, difficulty:"easy" },
  { category:"SPEED", emoji:"⚡",
    question:"How fast is the speech rate?",
    questionVariants:["How fast is the speech rate?","How would you describe the speaking pace?","At what speed is the person talking?","What is the tempo of the speech?","How rapid is the delivery of words?"],
    optionPool:["extremely slow (deliberate pauses)","very slow","slow","slightly below normal","normal pace","slightly above normal","fast","very fast","rapid-fire/auctioneer","varies dramatically","staccato/rhythmic","slurred (impaired)","not speech (music/sound)"],
    pick:5, difficulty:"medium" },
  { category:"NOISE", emoji:"🔊",
    question:"How much background noise is present?",
    questionVariants:["How much background noise is present?","What is the level of background noise?","How much ambient noise competes with speech?","What is the signal-to-noise ratio?","How clean is the audio environment?"],
    optionPool:["complete silence","barely any noise","very slight hum/hiss","slight traffic/ambient","moderate crowd noise","loud venue/music","very loud background","overwhelming noise","wind noise","rain/weather sounds","machinery/industrial","competing voices/crosstalk","music playing in background","echo/reverb heavy","intermittent noise bursts","only background (no speech)"],
    pick:5, difficulty:"easy" },
  { category:"ACCENT", emoji:"🌍",
    question:"How strong is the speaker's accent?",
    questionVariants:["How strong is the speaker's accent?","What level of regional accent is detectable?","How prominent is the non-native accent?","How marked is the speaker's dialect or accent?","What is the accentedness level?"],
    optionPool:["no accent (neutral native)","very light native regional","light regional","moderate regional/dialect","strong regional dialect","very strong regional","light non-native foreign","moderate non-native","strong non-native","very strong non-native","nearly incomprehensible accent","language-learner level accent","child's developing speech","elderly speech patterns","accent disguised/performed","unclear / no speech"],
    pick:5, difficulty:"medium" },
  { category:"CONTENT", emoji:"🎯",
    question:"What type of spoken content is this?",
    questionVariants:["What type of spoken content is this?","What genre of speech is being delivered?","What is the format of what is being said?","How would you categorize the spoken content?","What kind of verbal communication is this?"],
    optionPool:["news broadcast","casual conversation","formal speech/address","lecture/teaching","narration/documentary","step-by-step instructions","storytelling/fiction","formal debate","journalistic interview","radio advertisement","podcast discussion","singing/lyrics","audiobook reading","sports commentary","emergency announcement","religious sermon/prayer","political speech","comedy/stand-up","phone call","children's content"],
    pick:5, difficulty:"medium" },
  { category:"TONE", emoji:"🎭",
    question:"What is the overall tone of the voice?",
    questionVariants:["What is the overall tone of the voice?","How would you describe the voice quality?","What tonal quality characterizes the speech?","What is the vocal register of the speaker?","How does the overall voice quality present itself?"],
    optionPool:["authoritative/commanding","gentle/soft","warm/friendly","cold/detached","professional/neutral","casual/conversational","aggressive/confrontational","empathetic/caring","monotone/flat","highly expressive/dynamic","whispering/intimate","theatrical/performed","enthusiastic/high energy","resigned/defeated","tentative/uncertain","humorous/playful","solemn/grave","urgent/pressured","seductive/low","robotic/synthetic"],
    pick:5, difficulty:"hard" },
  { category:"AGE", emoji:"🕰️",
    question:"What age range does the speaker appear to be?",
    questionVariants:["What age range does the speaker appear to be?","How old does the speaker sound?","What age group does this voice belong to?","What is the estimated age of the speaker?","What life stage does the speaker appear to be in?"],
    optionPool:["infant/toddler (0–3)","young child (3–8)","older child (8–12)","early teen (12–15)","teen (15–18)","young adult (18–25)","adult (25–35)","adult (35–45)","middle-aged (45–55)","mature adult (55–65)","senior (65–75)","elderly (75+)","unclear / voice disguised","synthesized/AI voice"],
    pick:5, difficulty:"medium" },
  { category:"FLUENCY", emoji:"📚",
    question:"How fluent does the speaker appear?",
    questionVariants:["How fluent does the speaker appear?","How proficient is the speaker in their language?","What is the speaker's language fluency level?","How naturally does the speaker use the language?","What fluency level is evident in the speech?"],
    optionPool:["native-level perfect fluency","near-native (minor errors)","advanced (occasional errors)","upper-intermediate","intermediate (noticeable errors)","lower-intermediate","basic (frequent errors)","beginner (broken speech)","scripted/rehearsed","reading from text","translating simultaneously","language impaired","speech disorder","not applicable (no speech)"],
    pick:5, difficulty:"hard" },
  { category:"ENVIRONMENT", emoji:"🏠",
    question:"What type of recording environment does this sound like?",
    questionVariants:["What type of recording environment does this sound like?","Where does this audio appear to have been recorded?","What space does the acoustic quality suggest?","What environment was this audio captured in?","What setting does the acoustic profile indicate?"],
    optionPool:["professional broadcast studio","home recording studio","standard office/room","large hall/auditorium","outdoor open space","outdoor urban","vehicle interior","telephone/VoIP","small enclosed space","reverberant church/hall","crowd/public space","kitchen/domestic","underground/tunnel","outdoor nature","stadium/arena","classroom","call center","live concert venue","mobile/on-the-go","synthesized/no natural space"],
    pick:5, difficulty:"hard" },
  { category:"MUSIC", emoji:"🎵",
    question:"What type of music or sound is present?",
    questionVariants:["What type of music or sound is present?","What genre of music can be heard?","What musical style is in this audio?","What kind of non-speech audio is present?","What musical element accompanies the speech?"],
    optionPool:["no music (speech only)","classical/orchestral","jazz","rock/pop","hip-hop/rap","electronic/EDM","folk/acoustic","country","R&B/soul","ambient/drone","children's music","religious/choral","film score/cinematic","latin/tropical","metal","world music","lullaby/nursery","advertising jingle","sports anthem","silence (no audio at all)"],
    pick:5, difficulty:"medium" },
  { category:"URGENCY", emoji:"🚨",
    question:"How urgent or time-sensitive does the audio sound?",
    questionVariants:["How urgent or time-sensitive does the audio sound?","What urgency level is conveyed?","How pressing is the message in this audio?","What is the time-sensitivity of what is being communicated?","How critical does the spoken content appear?"],
    optionPool:["no urgency (leisurely)","very low urgency","low urgency","moderate urgency","notable urgency","high urgency","very high urgency","emergency level","life-or-death urgency","breaking news urgency","deadline pressure","countdown","false urgency (sales)","unclear urgency level"],
    pick:5, difficulty:"medium" },
  { category:"CLARITY_MSG", emoji:"💡",
    question:"How clear is the spoken message?",
    questionVariants:["How clear is the spoken message?","How well does the speaker communicate their point?","How understandable is the message being conveyed?","How effectively does the speech communicate?","How well-organized is the verbal content?"],
    optionPool:["crystal clear main point","clear with minor digressions","mostly clear","somewhat vague","rambling/unclear","contradictory","deliberately ambiguous","circular/repetitive","academic/dense","jargon-heavy (clear to experts)","confusing to most listeners","incoherent","persuasive but misleading","nuanced / multi-layered","no clear message"],
    pick:5, difficulty:"hard" },
  { category:"SENTIMENT", emoji:"💙",
    question:"What is the overall sentiment of the spoken content?",
    questionVariants:["What is the overall sentiment of the spoken content?","What emotional polarity does this audio convey?","Is the message positive or negative?","What is the affective tone of the speech?","What is the general emotional valence?"],
    optionPool:["very positive/optimistic","positive","slightly positive","neutral/objective","slightly negative","negative","very negative/pessimistic","mixed/balanced","hopeful despite difficulties","cautionary but not negative","angry/hostile","celebratory","mourning/grief","satirical/ironic","ambiguous"],
    pick:5, difficulty:"easy" },
  { category:"AUDIENCE_FIT", emoji:"👥",
    question:"Who is the intended audience for this audio?",
    questionVariants:["Who is the intended audience for this audio?","For whom is this audio content intended?","What listener does this appear to be made for?","Who is the target listener of this content?","What demographic would this audio resonate most with?"],
    optionPool:["young children","school-age children","teenagers","young adults","general adult public","elderly listeners","professionals in a field","academic researchers","religious community","sports fans","political supporters","consumers/customers","students","journalists/media","policymakers","patients/caregivers","foreign language learners","gamers/hobbyists","niche enthusiasts","global/multilingual"],
    pick:5, difficulty:"medium" },
  { category:"PERSUASION", emoji:"📢",
    question:"How persuasive is the audio content?",
    questionVariants:["How persuasive is the audio content?","Is the speaker trying to persuade?","How strong is the persuasive intent?","What persuasion techniques are evident?","How much is this content trying to influence the listener?"],
    optionPool:["purely informative (no persuasion)","very mildly persuasive","mildly persuasive","moderately persuasive","clearly persuasive","strongly persuasive","propaganda/extreme persuasion","subliminal/subtle","hard sell (commercial)","emotional manipulation","rational argument","fear appeal","humor as persuasion","celebrity/authority appeal","none (entertainment only)"],
    pick:5, difficulty:"hard" },
  { category:"AUTHENTICITY", emoji:"🔍",
    question:"How authentic or genuine does this audio appear?",
    questionVariants:["How authentic or genuine does this audio appear?","Is this audio real or staged?","How believable is this audio as genuine?","Does this audio seem authentic or fabricated?","How real does this recording appear to be?"],
    optionPool:["clearly authentic/real","very likely genuine","probably genuine","uncertain","probably staged","likely scripted","fully scripted/rehearsed","AI-generated voice","voice clone/deepfake suspect","theatrical/fictional","stock audio","re-enacted/reconstructed","satirical parody","documentary real but edited","unclear"],
    pick:5, difficulty:"hard" },
  { category:"IMPACT", emoji:"🌊",
    question:"What impact could listening to this audio have?",
    questionVariants:["What impact could listening to this audio have?","What effect might this audio have on the listener?","What response could this audio evoke?","What emotional or practical impact does this audio have?","What is the likely effect on the audience?"],
    optionPool:["educate / inform","entertain","emotionally move","persuade to change view","motivate to act","induce fear or anxiety","provide comfort/reassurance","provoke laughter","cause anger/frustration","inspire creativity","promote product/service","reinforce existing beliefs","challenge assumptions","no significant impact","create sense of urgency"],
    pick:5, difficulty:"hard" },
  { category:"TOPIC", emoji:"📋",
    question:"What is the main subject being discussed?",
    questionVariants:["What is the main subject being discussed?","What topic is the audio about?","What is the primary theme of this audio?","What subject matter is covered?","What is this audio primarily addressing?"],
    optionPool:["politics/government","science/research","health/medicine","technology/AI","sports/athletics","entertainment/culture","business/economy","environment/climate","education/learning","religion/spirituality","crime/justice","international news","human interest","travel/geography","food/lifestyle","fashion/design","history","relationships/society","personal development","children/parenting"],
    pick:5, difficulty:"easy" },
];

// ── TEXT (22 angles, 5 variants, 22+ options, pick 5) ─────────────────────────
const TEXT_ANGLE_POOL: ImageAngle[] = [
  { category:"SENTIMENT", emoji:"💭",
    question:"What is the overall sentiment of this text?",
    questionVariants:["What is the overall sentiment of this text?","What emotional polarity does this text carry?","Is the text positive, negative, or neutral?","What is the affective tone of this writing?","What emotional valence does this text have?"],
    optionPool:["very positive / enthusiastic","positive","mildly positive","neutral / objective","mildly negative","negative","very negative / hostile","mixed / conflicted","sarcastic","ironic","ambiguous","satirical","cautiously optimistic","bitter but hopeful","resigned","celebratory","angry","grieving","nostalgic","romantic"],
    pick:5, difficulty:"easy" },
  { category:"TOPIC", emoji:"📋",
    question:"What is the primary topic?",
    questionVariants:["What is the primary topic?","What subject does this text mainly address?","What is this text primarily about?","What is the main theme of this writing?","What topic is being discussed or described?"],
    optionPool:["politics / government","science / research","technology / AI","sports / athletics","entertainment / pop culture","health / medicine","economy / finance","environment / climate","arts / culture","education / learning","religion / spirituality","crime / justice","travel / geography","food / nutrition","relationships / society","history","parenting / family","personal development","philosophy / ethics","space / astronomy"],
    pick:5, difficulty:"easy" },
  { category:"FORMALITY", emoji:"🎩",
    question:"How formal is the language?",
    questionVariants:["How formal is the language?","What register of language is used?","How formal or informal is the writing style?","What level of formality characterizes this text?","What language register does this text use?"],
    optionPool:["hyper-formal / legal / academic","very formal","formal","semi-formal / professional","neutral / standard","conversational","informal","casual / friendly","very casual / chatty","colloquial / vernacular","slang-heavy","text-speak / abbreviations","poetic / literary","archaic / old-fashioned","technical jargon","street / youth slang","formal but accessible","bureaucratic","diplomatic / careful","ironic pseudo-formal"],
    pick:5, difficulty:"medium" },
  { category:"INTENT", emoji:"🎯",
    question:"What is the writer's primary intent?",
    questionVariants:["What is the writer's primary intent?","What is the author trying to achieve?","What is the purpose of this text?","What goal does the writer have?","What does the author want the reader to do or feel?"],
    optionPool:["inform / report facts","persuade / advocate","entertain / amuse","instruct / teach","express personal opinion","warn / alert","raise a question / provoke thought","request / ask for help","praise / compliment","criticize / condemn","satirize / mock","inspire / motivate","sell / advertise","confess / admit","commemorate","narrate a story","analyze / evaluate","define / explain","compare / contrast","argue a position"],
    pick:5, difficulty:"medium" },
  { category:"CLARITY", emoji:"💡",
    question:"How easy is this text to understand?",
    questionVariants:["How easy is this text to understand?","What reading level does this text require?","How accessible is this writing?","How difficult is this text to comprehend?","What is the readability of this text?"],
    optionPool:["very easy (grade 1–3)","easy (grade 4–6)","moderate (grade 7–9)","above average (grade 10–12)","university level","graduate level","requires specialized expertise","dense / academic","deliberately obscure","clear to native speakers only","clear despite complex topic","ambiguous by design","contradictory","circular / confusing","jargon-heavy but clear to experts","accessible lay explanation","oversimplified","nuanced / layered","mixed clarity","technical but well-explained"],
    pick:5, difficulty:"easy" },
  { category:"BIAS", emoji:"⚖️",
    question:"Does this text appear biased?",
    questionVariants:["Does this text appear biased?","How balanced or one-sided is this text?","What is the ideological lean of this text?","How objective vs. subjective is the writing?","What bias or perspective does this text reflect?"],
    optionPool:["strongly progressive/left","moderately progressive","mildly left-leaning","centrist / balanced","mildly conservative","moderately conservative","strongly conservative/right","libertarian lean","authoritarian lean","nationalist / populist","pro-establishment","anti-establishment","corporate / business-friendly","environmentalist","religious / faith-based","secular / rational","deliberately neutral","opinionated but balanced","propaganda","satire of a bias"],
    pick:5, difficulty:"hard" },
  { category:"AUDIENCE", emoji:"👥",
    question:"Who is the intended audience?",
    questionVariants:["Who is the intended audience?","For whom is this text written?","What readership does this text target?","Who would be the ideal reader for this text?","What demographic is the author writing for?"],
    optionPool:["young children (under 10)","older children (10–14)","teenagers (14–18)","young adults (18–25)","general adult public","middle-aged adults","seniors / elderly","domain professionals","academic researchers","business executives","policymakers / government","consumers / shoppers","parents","students","journalists","patients / caregivers","religious community","investors","hobbyists / enthusiasts","international / multilingual audience"],
    pick:5, difficulty:"medium" },
  { category:"MEDIUM", emoji:"📱",
    question:"What medium does this text appear to come from?",
    questionVariants:["What medium does this text appear to come from?","Where was this text likely published?","What publication channel does this text seem to belong to?","What format or platform is this text from?","What kind of document or source is this?"],
    optionPool:["breaking news article","feature journalism","academic paper","scientific abstract","blog / personal site","social media post (short)","social media thread","forum comment / reply","product review","legal / official document","government report","marketing copy","email newsletter","book excerpt","speech transcript","interview transcript","fiction / creative writing","instruction manual / FAQ","court filing","medical / clinical note"],
    pick:5, difficulty:"medium" },
  { category:"URGENCY", emoji:"🚨",
    question:"What urgency level is conveyed?",
    questionVariants:["What urgency level is conveyed?","How pressing is the message of this text?","How time-sensitive does the content feel?","What is the urgency of the information presented?","How immediate is the call to action or concern?"],
    optionPool:["no urgency (timeless)","very low (evergreen)","low (general interest)","moderate (timely)","notable (deadline implied)","high (act soon)","very high (act now)","emergency (immediate action)","crisis level","false / manufactured urgency","recurring / periodic urgency","countdown-based","regulatory / compliance deadline","health emergency","unclear urgency","no call to action"],
    pick:5, difficulty:"medium" },
  { category:"QUALITY", emoji:"⭐",
    question:"How would you rate the writing quality?",
    questionVariants:["How would you rate the writing quality?","What is the overall quality of the writing?","How well-written is this text?","What is your assessment of the prose quality?","How skilled is the author's writing?"],
    optionPool:["outstanding / literary quality","excellent / professional","good / competent","above average","average / acceptable","below average","poor / weak","very poor / amateurish","unedited / draft-quality","grammar errors (minor)","grammar errors (major)","spelling errors throughout","machine-translated feel","AI-generated feel","formulaic / clichéd","repetitive","over-complex sentences","over-simplified","inconsistent quality","plagiarized / derivative feel"],
    pick:5, difficulty:"easy" },
  { category:"LENGTH", emoji:"📐",
    question:"How appropriate is the text length for its purpose?",
    questionVariants:["How appropriate is the text length for its purpose?","Is this text too long, too short, or just right?","How well-sized is this text for its purpose?","What is the appropriateness of the length?","How would you assess the word count relative to the content?"],
    optionPool:["far too short / truncated","too short (key info missing)","slightly short","just right (perfect length)","slightly long","too long (padding evident)","far too long (could be halved)","excessively verbose","tweet-length (very brief)","medium length","book-excerpt length","exhaustive / comprehensive","concise executive summary","academic-length","listicle format (brief items)","no clear length issue"],
    pick:5, difficulty:"easy" },
  { category:"AUTHENTICITY", emoji:"🔍",
    question:"How authentic and original does this text appear?",
    questionVariants:["How authentic and original does this text appear?","How genuine is the authorship of this text?","Does this text appear original or generated?","How authentic is the voice of this writing?","What is your assessment of the text's originality?"],
    optionPool:["clearly authentic human writing","probably human-written","uncertain authorship","possibly AI-assisted","likely AI-generated","clearly AI-generated","plagiarized / copied","paraphrased / reworded","ghost-written","propaganda / state media","satire / parody","fictional but presented as real","deliberately anonymous","translated text","aggregated from multiple sources","legally mandated content","template-filled","native speaker authentic","non-native but genuine","not determinable"],
    pick:5, difficulty:"hard" },
  { category:"PERSUASION", emoji:"📢",
    question:"What persuasion technique is used?",
    questionVariants:["What persuasion technique is used?","How does the text try to persuade the reader?","What rhetorical strategy is employed?","What method of influence does the text use?","What persuasive mechanism does the author deploy?"],
    optionPool:["none (purely informational)","logos (logical argument)","ethos (authority / credibility)","pathos (emotional appeal)","fear appeal","scarcity / urgency pressure","social proof / consensus","anecdote / personal story","statistics and data","expert quotes","repetition","loaded language","straw man argument","false equivalence","appeal to tradition","appeal to nature","guilt / shame inducing","flattery / appeal to identity","call to action","humor / charm"],
    pick:5, difficulty:"hard" },
  { category:"LANGUAGE_ORIGIN", emoji:"🌍",
    question:"What language is this text written in?",
    questionVariants:["What language is this text written in?","Which language does this text use?","What is the language of this writing?","In what tongue is this text composed?","What language do you identify in this text?"],
    optionPool:["english","american english","british english","italian","french","spanish","latin american spanish","german","portuguese","russian","arabic","mandarin chinese","japanese","hindi","dutch","polish","swedish","korean","turkish","other / unidentifiable"],
    pick:5, difficulty:"easy" },
  { category:"STRUCTURE", emoji:"🏗️",
    question:"What structural form does this text use?",
    questionVariants:["What structural form does this text use?","How is this text organized?","What is the structural format of this writing?","What organizational pattern does this text follow?","What text structure is used?"],
    optionPool:["continuous prose (paragraphs)","numbered list","bulleted list","Q&A format","table / structured data","headline + body","tweet / micro-text","thread / sequence","chronological narrative","inverted pyramid (news)","compare & contrast","problem → solution","cause & effect","definition + examples","argument + counter-argument","step-by-step guide","abstract + detail","quote + commentary","mixed / hybrid","no clear structure"],
    pick:5, difficulty:"medium" },
  { category:"EMOTION_INTENSITY", emoji:"🔥",
    question:"How emotionally intense is this text?",
    questionVariants:["How emotionally intense is this text?","What is the emotional charge of this writing?","How heated or calm is the emotional register?","What is the emotional amplitude of this text?","How emotionally charged is the language?"],
    optionPool:["completely cold / clinical","very low emotion","low emotion","mild emotion","moderate emotion","notable emotion","high emotion","very high emotion","extremely emotional / heated","rage / fury","grief / despair","overwhelming joy","panic / hysteria","love / devotion","disgust / contempt","deliberately unemotional","performatively emotional","restrained despite difficult topic","cathartic / release","ambivalent"],
    pick:5, difficulty:"medium" },
  { category:"TRUTHFULNESS", emoji:"✅",
    question:"How factually reliable does this text appear?",
    questionVariants:["How factually reliable does this text appear?","How trustworthy is the information in this text?","What is your assessment of the factual accuracy?","How verifiable are the claims made?","What is the reliability level of this text's content?"],
    optionPool:["verified fact-checked journalism","highly credible (authoritative source)","credible (reputable)","mostly accurate (minor issues)","plausibly true but unverified","mixed accuracy","partially false","mostly false","clearly false / fabricated","deliberate disinformation","satire (not meant as fact)","opinion presented as fact","outdated information","misleading framing","cherry-picked data","impossible to verify","not applicable (fiction)","conspiracy / fringe","advertising disguised as news","unclear"],
    pick:5, difficulty:"hard" },
  { category:"CULTURAL_CONTEXT", emoji:"🏛️",
    question:"What cultural context does this text reflect?",
    questionVariants:["What cultural context does this text reflect?","What cultural background is the text written from?","What culture or community does this text originate from?","What civilization or cultural viewpoint shapes this text?","What cultural lens does the author write from?"],
    optionPool:["Anglo-American","Western European","Latin American","East Asian","South Asian","Middle Eastern","Sub-Saharan African","Scandinavian","Mediterranean / Southern European","Indigenous / first nations","Russian / Slavic","Oceanic / Pacific","Mixed / multicultural","Global / cosmopolitan","Religious (Christian)","Religious (Islamic)","Religious (Jewish)","Religious (Buddhist/Hindu)","Secular / post-religious","Youth / digital-native culture"],
    pick:5, difficulty:"hard" },
  { category:"READING_EASE", emoji:"📖",
    question:"How difficult is this text to read aloud?",
    questionVariants:["How difficult is this text to read aloud?","How smooth is the text flow?","How easily does this text read out loud?","What is the oral readability of this text?","How naturally does this text flow when spoken?"],
    optionPool:["perfect for speech (short sentences)","flows very naturally","reads well","minor awkward phrasing","some tongue-twisting","dense / hard to follow aloud","technical terms make it hard","accent-specific phrasing","dialect / regional expression","poetic meter (rhythmic)","very long sentences","complex syntax","requires pausing for clarity","translation artifacts","child-friendly / simple","not designed for reading aloud"],
    pick:5, difficulty:"medium" },
  { category:"NOVELTY", emoji:"💡",
    question:"How original or novel is the information or idea?",
    questionVariants:["How original or novel is the information or idea?","How fresh or new is the content of this text?","Is this text saying something new or repeating known content?","What is the originality level of the ideas presented?","How innovative is the thinking in this text?"],
    optionPool:["groundbreaking / paradigm-shifting","highly original","notably fresh perspective","somewhat original","common knowledge presented well","familiar content, new framing","well-trodden territory","cliché / overused ideas","derivative / copied thinking","recycled common wisdom","counterintuitive / surprising","conventional but needed","revisionist take on history","very niche / specialized novelty","deliberately retro / nostalgic","clearly outdated thinking","trendy but shallow","classic idea well-executed","provocatively contrarian","not determinable"],
    pick:5, difficulty:"hard" },
  { category:"SAFETY", emoji:"🛡️",
    question:"Is this text safe for all audiences?",
    questionVariants:["Is this text safe for all audiences?","Does this text contain sensitive or harmful content?","What content warning might this text require?","How appropriate is this text for general audiences?","What safety classification would apply to this text?"],
    optionPool:["fully safe for all ages","suitable for all adults","requires mild content warning","strong language / profanity","violence described","sexual content (suggestive)","explicit sexual content","hate speech / discrimination","extremist ideology","dangerous instructions","graphic violence / gore","child-inappropriate","trigger warning needed","medical / disturbing content","political extremism","privacy violation","doxxing / personal info","encouraging self-harm","clearly illegal content","safe but controversial"],
    pick:5, difficulty:"medium" },
  { category:"VERB_TENSE", emoji:"⏩",
    question:"What primary verb tense dominates this text?",
    questionVariants:["What primary verb tense dominates this text?","What time reference does this text primarily use?","Is this text about past, present, or future events?","What temporal orientation does this text have?","What tense is predominantly used in this text?"],
    optionPool:["simple present (general truths)","present continuous (ongoing)","simple past (completed events)","past continuous (ongoing past)","present perfect (recent/result)","past perfect (before past)","simple future (will)","going to future","conditional (would/could/might)","mixed tenses","narrative past (storytelling)","historic present (vivid)","future perfect","timeless / tenseless","unclear tense pattern"],
    pick:5, difficulty:"medium" },
  { category:"IMPACT", emoji:"🌊",
    question:"What impact could this text have on the reader?",
    questionVariants:["What impact could this text have on the reader?","What effect might reading this text have?","What response could this text provoke?","What influence could this writing have?","What is the likely reader impact?"],
    optionPool:["educate / inform","change the reader's view","motivate to take action","entertain / provide pleasure","provide comfort","cause anxiety or fear","provoke anger / outrage","inspire creativity","reinforce existing beliefs","challenge assumptions","cause laughter","generate empathy","make reader feel judged","encourage reflection","create sense of urgency","no significant impact","build community/connection","alienate / divide","strengthen identity","promote product or idea"],
    pick:5, difficulty:"hard" },
];

// ── SOCIAL (20 angles, 5 variants, 22+ options, pick 5) ───────────────────────
const SOCIAL_ANGLE_POOL: ImageAngle[] = [
  { category:"SPAM", emoji:"🚫",
    question:"Is this post likely to be spam?",
    questionVariants:["Is this post likely to be spam?","Does this post appear to be unsolicited or unwanted content?","How likely is this to be spam or commercial junk?","What spam probability would you assign to this post?","Is this post genuine or spam?"],
    optionPool:["definitely spam (bot / bulk)","likely spam (commercial push)","probably spam","borderline / uncertain","probably not spam","likely genuine","definitely genuine / personal","spam (phishing suspect)","spam (scam suspect)","spam (fake news propagation)","spam (engagement farming)","spam (clickbait)","account appears automated","one-off post (not spam pattern)","not determinable"],
    pick:5, difficulty:"easy" },
  { category:"SENTIMENT", emoji:"💭",
    question:"What sentiment does this post express?",
    questionVariants:["What sentiment does this post express?","What emotional tone does this post carry?","What feeling does the post author express?","What is the affective tone of this social post?","What emotional direction does this post go?"],
    optionPool:["very enthusiastic / excited","positive / happy","mildly positive","neutral / factual","mildly negative","negative / unhappy","very negative / hostile","angry / outraged","frustrated / annoyed","sad / grieving","humorous / joking","sarcastic / ironic","hopeful / optimistic","anxious / worried","nostalgic","romantic / loving","thankful / grateful","proud / boastful","bored / indifferent","ambiguous"],
    pick:5, difficulty:"easy" },
  { category:"TOPIC", emoji:"📋",
    question:"What is the main topic of this post?",
    questionVariants:["What is the main topic of this post?","What is this social post primarily about?","What subject does this post address?","What theme does this post revolve around?","What is the core content of this post?"],
    optionPool:["personal life update","relationship / dating","family / parenting","politics / activism","news / current events","entertainment / celebrity","sports / fitness","food / cooking / restaurant","travel / vacation","technology / gadgets","health / wellness","business / career","humor / meme","art / creativity","gaming","fashion / beauty","environmental issue","education / learning","religion / spirituality","animal content"],
    pick:5, difficulty:"easy" },
  { category:"SAFETY", emoji:"🛡️",
    question:"Is this content safe and appropriate for all audiences?",
    questionVariants:["Is this content safe and appropriate for all audiences?","What content rating would you assign this post?","Does this post contain sensitive material?","How suitable is this post for all viewers?","What audience safety level does this post warrant?"],
    optionPool:["fully safe for all ages","safe for general audiences","mild content (PG)","moderate content (PG-13)","mature audiences (18+)","sexual / adult content","graphic violence / gore","hate speech present","extremist content","dangerous advice / instructions","content glorifying harm","targeting vulnerable groups","child-inappropriate","disturbing imagery","illegal content depiction","harassment / cyberbullying","privacy violation","political provocation","satire (safe but edgy)","unclear / ambiguous"],
    pick:5, difficulty:"medium" },
  { category:"FAKE", emoji:"🔍",
    question:"How likely is this post to contain misinformation?",
    questionVariants:["How likely is this post to contain misinformation?","How truthful does this post appear?","Does this post seem to spread false information?","What is the likely factual accuracy of this post?","How credible are the claims in this post?"],
    optionPool:["verified / fact-checked true","very likely accurate","probably accurate","uncertain / unverifiable","possibly inaccurate","probably false","very likely false / fake","clearly fabricated","deliberate disinformation","conspiracy theory","satire misread as fact","misleading framing","cherry-picked facts","out-of-context information","outdated info presented as current","false quote / misattribution","doctored image/video claim","bot-generated content","coordinated inauthentic behavior","not determinable"],
    pick:5, difficulty:"hard" },
  { category:"ENGAGEMENT", emoji:"❤️",
    question:"How engaging would you expect this post to be?",
    questionVariants:["How engaging would you expect this post to be?","What engagement level would this post likely generate?","How viral could this post go?","What interaction would this post typically receive?","What engagement potential does this post have?"],
    optionPool:["extremely viral potential","very high engagement expected","high engagement","above average engagement","average engagement","below average engagement","low engagement","very low engagement (niche)","controversial (high but divided)","polarizing (extreme reactions)","niche cult following","local community appeal","professional network only","humor-driven viral","emotional share bait","informational steady traffic","time-sensitive (breaks fast)","no real engagement potential","engagement farming (forced)","purely personal (no sharing)"],
    pick:5, difficulty:"medium" },
  { category:"INTENT", emoji:"🎯",
    question:"What is the author's primary intent?",
    questionVariants:["What is the author's primary intent?","What is the poster trying to achieve?","What goal does the author have?","Why did the person post this?","What is the purpose behind this post?"],
    optionPool:["share personal experience","seek advice / help","promote a product / brand","express political opinion","entertain / make laugh","inform / share news","vent / complain","celebrate an achievement","start a conversation","debate / argue a point","show off / flex","seek validation","connect with community","memorial / tribute","raise awareness","ask a question","threaten / intimidate","recruit / invite","provoke / troll","no clear intent"],
    pick:5, difficulty:"medium" },
  { category:"PLATFORM", emoji:"📱",
    question:"Which platform does this post style best match?",
    questionVariants:["Which platform does this post style best match?","What social media platform was this likely written for?","What platform's style does this post follow?","Where would this post fit best?","On which platform would this post feel most native?"],
    optionPool:["Instagram (visual-first, aesthetic)","Facebook (personal network, long-form)","Twitter/X (short opinion, news)","LinkedIn (professional, career)","TikTok (casual, video-first)","WeChat (community messaging)","Reddit (discussion, anonymous)","YouTube (video comment, subscribe CTA)","Pinterest (inspiration, visual)","Snapchat (ephemeral, casual)","Telegram (private channel / group)","WhatsApp (direct messaging)","BeReal (authentic, candid)","Mastodon (open-source, niche)","Discord (community, gaming)","Bluesky / decentralized","Threads (meta-Facebook)","Truth Social / Parler (political right)","Medium (long-form blogging)","No clear platform"],
    pick:5, difficulty:"hard" },
  { category:"LANGUAGE", emoji:"🌍",
    question:"What language is this post written in?",
    questionVariants:["What language is this post written in?","Which language does this post use?","What is the language of this social media post?","In what tongue is this post composed?","What language can you identify in this text?"],
    optionPool:["english","american english","british english","italian","french","spanish","latin american spanish","german","portuguese","russian","arabic","mandarin chinese","japanese","hindi","dutch","polish","swedish","korean","turkish","other / unidentifiable"],
    pick:5, difficulty:"easy" },
  { category:"AUDIENCE", emoji:"👥",
    question:"Who does this post appear to target?",
    questionVariants:["Who does this post appear to target?","What audience is this post aimed at?","For whom was this post written?","What demographic does this post address?","Who is the intended reader of this post?"],
    optionPool:["pre-teens / children","teenagers","young adults (18–25)","adults (25–40)","middle-aged (40–60)","seniors (60+)","professionals in a field","parents","students","sports fans","political supporters","gamers","fashion enthusiasts","tech community","LGBTQ+ community","religious community","local community","global audience","niche hobbyists","no specific target"],
    pick:5, difficulty:"medium" },
  { category:"AUTHENTICITY", emoji:"🔒",
    question:"How authentic does this post appear?",
    questionVariants:["How authentic does this post appear?","Is this post from a real person?","How genuine does this post seem?","Is this post original or manipulative?","How trustworthy is the poster?"],
    optionPool:["clearly authentic / personal","very likely genuine","probably genuine","uncertain","possibly fake account","likely fake / bot","clearly bot-generated","celebrity verified","public figure / spokesperson","brand / corporate account","anonymous individual (real)","anonymous activist","pseudonymous regular user","satirical account","parody account","state-affiliated account","engagement farmer","astroturf / coordinated","impersonation suspect","not determinable"],
    pick:5, difficulty:"hard" },
  { category:"CALL_TO_ACTION", emoji:"📣",
    question:"What action does this post call for?",
    questionVariants:["What action does this post call for?","What does this post ask the reader to do?","What CTA (call to action) is present?","What behavior does this post encourage?","What does the author want readers to do after seeing this post?"],
    optionPool:["no action requested","like / react","comment / reply","share / repost","follow / subscribe","click a link","visit a website","buy a product","donate / contribute","sign a petition","attend an event","join a group","download an app","tag a friend","watch a video","use a hashtag","report a problem","vote / political action","spread awareness","contact someone"],
    pick:5, difficulty:"medium" },
  { category:"EMOTION_TRIGGER", emoji:"❤️‍🔥",
    question:"What emotional reaction is this post designed to trigger?",
    questionVariants:["What emotional reaction is this post designed to trigger?","What feeling does this post try to provoke?","What emotional response is this post aiming for?","What emotion does the poster want you to feel?","What emotional button does this post push?"],
    optionPool:["make you laugh / LOL","make you cry / sad","make you angry / outraged","make you scared / anxious","make you feel inspired","make you feel envious","make you feel proud","make you feel nostalgic","make you feel disgusted","make you feel amused / charmed","make you feel curious","make you feel validated / seen","make you feel superior","make you feel guilty","trigger FOMO (fear of missing out)","trigger tribal identity","no specific emotion targeted","mixed emotions","confusion / puzzlement","wonder / awe"],
    pick:5, difficulty:"medium" },
  { category:"HASHTAG_TOPIC", emoji:"#️⃣",
    question:"What hashtag category would best describe this post?",
    questionVariants:["What hashtag category would best describe this post?","What hashtag would you associate with this post?","What tag topic fits this post?","What trending category does this post fit?","What hashtag community does this post belong to?"],
    optionPool:["#news","#lifestyle","#travel","#food","#fitness","#fashion","#politics","#technology","#gaming","#art","#music","#comedy","#motivation","#business","#health","#science","#sports","#animals","#relationships","#education"],
    pick:5, difficulty:"easy" },
  { category:"CONTROVERSY", emoji:"⚡",
    question:"How controversial is this post?",
    questionVariants:["How controversial is this post?","How divisive would this post be?","What level of controversy does this post carry?","How much disagreement would this post generate?","What controversy level would you assign to this post?"],
    optionPool:["not controversial at all","very mild (minor disagreement)","mild (some debate expected)","moderate controversy","notable controversy","high controversy","very high controversy","extremely divisive","culture war trigger","political flashpoint","religious controversy","scientific controversy","legal controversy","moral / ethical controversy","racial / identity controversy","generational conflict topic","intentionally provocative","troll bait","deliberately inflammatory","controversy unclear"],
    pick:5, difficulty:"hard" },
  { category:"VIRALITY_REASON", emoji:"🚀",
    question:"Why would this post go viral (if it did)?",
    questionVariants:["Why would this post go viral (if it did)?","What shareability factor does this post have?","Why might people want to spread this post?","What makes this post potentially shareable?","What virality mechanism does this post employ?"],
    optionPool:["extremely funny / hilarious","heartwarming / touching","shocking / jaw-dropping","breaking news / urgency","relatable / universal experience","inspiring / uplifting","outrageous / offensive","cute animals / babies","celebrity involvement","helpful / practical tip","unexpected / surprising","FOMO-inducing","politically charged","community rallying cry","mystery / cliffhanger","controversy magnet","beautiful / aesthetic","nostalgic trigger","life hack / trick","would not go viral"],
    pick:5, difficulty:"hard" },
  { category:"INTERACTION_TYPE", emoji:"💬",
    question:"What type of social interaction does this post facilitate?",
    questionVariants:["What type of social interaction does this post facilitate?","What social function does this post serve?","What kind of community interaction does this post enable?","What social behavior does this post promote?","What interaction mode does this post facilitate?"],
    optionPool:["passive consumption (read only)","reaction (like / emoji)","brief comment","long discussion thread","debate / argument","support / empathy","celebration / congratulation","sharing personal story","advice giving","humor exchange","community organizing","fundraising","event coordination","networking / professional","confession / vulnerability","gossip / rumor sharing","public shaming","solidarity expression","tagging / mentioning others","no social interaction intended"],
    pick:5, difficulty:"medium" },
  { category:"BRAND", emoji:"🏷️",
    question:"Does this post appear to be branded or commercial content?",
    questionVariants:["Does this post appear to be branded or commercial content?","Is this post commercial or organic?","How commercial does this post feel?","What is the commercial nature of this post?","Is there a brand or marketing agenda visible?"],
    optionPool:["purely personal (no brand)","organic user content","subtle brand mention","clear brand partnership","sponsored content (disclosed)","sponsored content (undisclosed)","influencer promotion","corporate official account","brand awareness campaign","product launch","service promotion","recruitment post","non-profit / NGO promotion","political advertising","public service announcement","event promotion","affiliate marketing","MLM / pyramid scheme","counterfeit / fraud","unclear"],
    pick:5, difficulty:"hard" },
  { category:"TIME_RELEVANCE", emoji:"📅",
    question:"How time-relevant is this post?",
    questionVariants:["How time-relevant is this post?","How timely is the content of this post?","When was this post likely written?","How current or outdated is this post?","What is the temporal relevance of this post?"],
    optionPool:["breaking / real-time (minutes old)","very recent (hours old)","today's content","this week","this month","this season / quarter","this year","1–2 years ago","several years old","timeless / evergreen","clearly outdated","resurfaced old content","throwback / nostalgia post","anniversary post","historical reference","future-dated (speculation)","seasonal / annual recurring","unclear timing"],
    pick:5, difficulty:"medium" },
  { category:"GEOGRAPHY", emoji:"🗺️",
    question:"What geographic scope does this post appear to have?",
    questionVariants:["What geographic scope does this post appear to have?","What is the geographic focus of this post?","What region does this post relate to?","What geographic area is most relevant?","What location dimension does this post have?"],
    optionPool:["local / neighborhood","city-level","regional (state/province)","national (specific country)","European","North American","Latin American","African","Middle Eastern","South Asian","East Asian","Southeast Asian","Oceanic/Pacific","global / international","virtual / online only","space / extraterrestrial","no geographic dimension","cross-border / bilateral","multilingual / multicultural","unclear / universal"],
    pick:5, difficulty:"medium" },
  { category:"IMPACT", emoji:"🌊",
    question:"What potential impact could this post have on society?",
    questionVariants:["What potential impact could this post have on society?","What societal effect might this post have at scale?","What impact could this post cause if widely shared?","At scale, what effect would this post have?","What social consequence could this post trigger?"],
    optionPool:["no significant impact","entertain / provide joy","spread useful information","inspire positive action","raise awareness of a cause","change public opinion","damage someone's reputation","normalize harmful behavior","spread fear or panic","radicalize vulnerable people","undermine trust in institutions","promote constructive debate","unite a community","divide a community","help someone in need","waste collective attention","generate commercial benefit","expose wrongdoing","support democratic participation","unknown / unpredictable impact"],
    pick:5, difficulty:"hard" },
];

type AngleResult = { category: string; emoji: string; question: string; options: string[]; difficulty: "easy" | "medium" | "hard" };

function makeAngles(pool: ImageAngle[], count: number): AngleResult[] {
  return pickRandom(pool, Math.min(count, pool.length)).map((a) => ({
    category: a.category,
    emoji: a.emoji,
    question: pickQuestion(a),
    options: pickRandom(a.optionPool, Math.min(a.pick, a.optionPool.length)),
    difficulty: a.difficulty,
  }));
}

function getVideoAngles(count: number): AngleResult[]  { return makeAngles(VIDEO_ANGLE_POOL,  count); }
function getAudioAngles(count: number): AngleResult[]  { return makeAngles(AUDIO_ANGLE_POOL,  count); }
function getTextAngles(count: number): AngleResult[]   { return makeAngles(TEXT_ANGLE_POOL,   count); }
function getSocialAngles(count: number): AngleResult[] { return makeAngles(SOCIAL_ANGLE_POOL, count); }

// ── Content fetchers ───────────────────────────────────────────────────────────

async function fetchWikimediaImages(category: string, limit = 20): Promise<FetchedContent[]> {
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers` +
    `&cmtitle=Category:${encodeURIComponent(category)}&cmtype=file&cmlimit=${limit}` +
    `&cmnamespace=6&format=json&origin=*`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return [];
  const json = (await res.json()) as any;
  const members: any[] = json?.query?.categorymembers ?? [];
  const titles = members.map((m: any) => m.title).join("|");
  if (!titles) return [];

  const imgRes = await fetch(
    `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}` +
      `&prop=imageinfo&iiprop=url&format=json&origin=*`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!imgRes.ok) return [];
  const imgJson = (await imgRes.json()) as any;
  const pages = Object.values(imgJson?.query?.pages ?? {}) as any[];

  return pages
    .filter((p: any) => p?.imageinfo?.[0]?.url)
    .filter((p: any) => {
      const url = (p.imageinfo[0].url as string).toLowerCase();
      return url.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/);
    })
    .map((p: any) => ({
      type: "image" as const,
      imageUrl: p.imageinfo[0].url as string,
      sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
      sourceName: "Wikimedia Commons",
    }));
}

async function fetchWikimediaAudio(category: string, limit = 15): Promise<FetchedContent[]> {
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers` +
    `&cmtitle=Category:${encodeURIComponent(category)}&cmtype=file&cmlimit=${limit}` +
    `&cmnamespace=6&format=json&origin=*`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return [];
  const json = (await res.json()) as any;
  const members: any[] = json?.query?.categorymembers ?? [];
  const titles = members.map((m: any) => m.title).join("|");
  if (!titles) return [];

  const infoRes = await fetch(
    `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}` +
      `&prop=imageinfo&iiprop=url|mime&format=json&origin=*`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!infoRes.ok) return [];
  const infoJson = (await infoRes.json()) as any;
  const pages = Object.values(infoJson?.query?.pages ?? {}) as any[];

  return pages
    .filter((p: any) => {
      const fileUrl = (p?.imageinfo?.[0]?.url ?? "").toLowerCase();
      const mime = (p?.imageinfo?.[0]?.mime ?? "").toLowerCase();
      return (
        fileUrl.match(/\.(ogg|mp3|wav|flac|opus)(\?|$)/) ||
        mime.startsWith("audio/")
      );
    })
    .map((p: any) => ({
      type: "audio" as const,
      audioUrl: p.imageinfo[0].url as string,
      sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
      sourceName: "Wikimedia Commons Audio",
    }));
}

async function fetchWikimediaVideo(category: string, limit = 10): Promise<FetchedContent[]> {
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers` +
    `&cmtitle=Category:${encodeURIComponent(category)}&cmtype=file&cmlimit=${limit}` +
    `&cmnamespace=6&format=json&origin=*`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return [];
  const json = (await res.json()) as any;
  const members: any[] = json?.query?.categorymembers ?? [];
  const titles = members.map((m: any) => m.title).join("|");
  if (!titles) return [];

  const infoRes = await fetch(
    `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}` +
      `&prop=imageinfo&iiprop=url|mime|thumburl&iithumbsize=320&format=json&origin=*`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!infoRes.ok) return [];
  const infoJson = (await infoRes.json()) as any;
  const pages = Object.values(infoJson?.query?.pages ?? {}) as any[];

  return pages
    .filter((p: any) => {
      const fileUrl = (p?.imageinfo?.[0]?.url ?? "").toLowerCase();
      const mime = (p?.imageinfo?.[0]?.mime ?? "").toLowerCase();
      return (
        fileUrl.match(/\.(webm|ogv|mp4|ogg)(\?|$)/) ||
        mime.startsWith("video/")
      );
    })
    .map((p: any) => ({
      type: "video" as const,
      videoUrl: p.imageinfo[0].url as string,
      thumbnail: p.imageinfo[0].thumburl as string | undefined,
      sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
      sourceName: "Wikimedia Commons Video",
    }));
}

async function fetchWikipediaTexts(titles: string[], lang = "it"): Promise<FetchedContent[]> {
  const joined = titles.map(encodeURIComponent).join("|");
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${joined}` +
    `&prop=extracts&exintro=true&explaintext=true&exsentences=3&format=json&origin=*`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return [];
  const json = (await res.json()) as any;
  const pages = Object.values(json?.query?.pages ?? {}) as any[];

  return pages
    .filter((p: any) => p?.extract && p.extract.length > 30)
    .map((p: any) => ({
      type: "text" as const,
      text: (p.extract as string).slice(0, 400).trim(),
      sourceUrl: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title)}`,
      sourceName: `Wikipedia (${lang})`,
    }));
}

/**
 * Picsum Photos — accepts any integer seed 0–999999.
 * Using a large random range gives near-infinite unique image URLs,
 * each returning a deterministic photo from Picsum's library.
 * Combined with 26 question angles and randomised option subsets,
 * the theoretical task space is in the billions.
 */
function fetchPicsumImages(count: number, seedOffset = 0): FetchedContent[] {
  return Array.from({ length: count }, (_, i) => {
    // Use large random seed from the full 0–999999 space
    const seed = seedOffset > 0
      ? seedOffset + i
      : Math.floor(Math.random() * 1_000_000);
    return {
      type: "image" as const,
      imageUrl: `https://picsum.photos/seed/${seed}/640/480`,
      sourceUrl: `https://picsum.photos`,
      sourceName: "Picsum Photos",
    };
  });
}

async function fetchRedditTexts(subreddit: string, limit = 15): Promise<FetchedContent[]> {
  const url = `https://www.reddit.com/r/${subreddit}/top.json?limit=${limit}&t=week`;
  const res = await fetch(url, {
    headers: { "User-Agent": "putitup-agent/1.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as any;
  const posts: any[] = json?.data?.children ?? [];

  return posts
    .filter((p: any) => p?.data?.selftext && p.data.selftext.length > 30)
    .map((p: any) => ({
      type: "text" as const,
      text: (p.data.selftext as string).slice(0, 350).trim(),
      sourceUrl: `https://reddit.com${p.data.permalink}`,
      sourceName: `r/${subreddit}`,
    }));
}

// ── Mastodon public API (real social posts, no auth required) ─────────────────

async function fetchMastodonPosts(instance = "mastodon.social", limit = 20): Promise<FetchedContent[]> {
  const url = `https://${instance}/api/v1/timelines/public?limit=${limit}&only_media=false`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "putitup-agent/1.0", "Accept": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const statuses = (await res.json()) as any[];
    const results: FetchedContent[] = [];
    for (const s of statuses) {
      const rawText: string = (s.content ?? "").replace(/<[^>]+>/g, "").trim();
      if (!rawText || rawText.length < 20) continue;
      const author: string = s.account?.acct ?? s.account?.username ?? "anonymous";
      const displayName: string = s.account?.display_name || author;
      results.push({
        type: "social",
        postText: rawText.slice(0, 400),
        postAuthor: displayName,
        postPlatform: "mastodon",
        postLikes:    Math.floor(Math.random() * 1200),
        postComments: Math.floor(Math.random() * 80),
        text: rawText.slice(0, 400),
        sourceUrl: s.url ?? `https://${instance}/@${author}/${s.id}`,
        sourceName: `Mastodon @${author}`,
      });
    }
    return results;
  } catch { return []; }
}

// ── Groq generation (text & audio context only) ────────────────────────────────

interface GeneratedTask {
  question: string;
  options: string[];
  correctAnswer?: string;
  difficulty: "easy" | "medium" | "hard";
}

async function generateTasksWithGroq(
  content: FetchedContent,
  datasetCategory: string,
  labels: string[],
  count = 3,
): Promise<GeneratedTask[]> {
  if (!groq) {
    return Array.from({ length: count }, () => ({
      question: content.type === "audio"
        ? "What is the primary language spoken in this audio?"
        : content.type === "video"
        ? "What action is being performed in this video?"
        : "Classify this content into the correct category.",
      options: labels.slice(0, 4),
      difficulty: "easy" as const,
    }));
  }

  let contentDesc: string;
  if (content.type === "audio") {
    contentDesc = `Audio clip from: ${content.sourceName} (URL: ${content.audioUrl})`;
  } else if (content.type === "video") {
    contentDesc = `Video clip from: ${content.sourceName} (URL: ${content.videoUrl})`;
  } else {
    contentDesc = `Text from ${content.sourceName}: "${content.text}"`;
  }

  const prompt = `You are an AI data labeling expert. Generate ${count} annotation tasks for this content.

CONTENT TYPE: ${content.type.toUpperCase()}
CONTENT: ${contentDesc}
DATASET CATEGORY: ${datasetCategory}
AVAILABLE LABELS: ${labels.join(", ")}

Generate varied, realistic classification tasks. For each task:
- Write a clear question in ENGLISH (no accented characters, no special symbols)
- Provide 3-4 answer options using the provided labels
- Indicate the correct answer if deducible
- Set difficulty: easy | medium | hard

For AUDIO tasks: ask about language, emotion, tone, content type, speaker gender, noise level.
For VIDEO tasks: ask about action, scene type, subject count, motion speed, environment.
For TEXT tasks: ask about sentiment, topic, intent, formality, language.

Reply ONLY with valid JSON array:
[{"question":"...","options":["a","b","c"],"correctAnswer":"a","difficulty":"easy"}]`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama3-8b-8192",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
      temperature: 0.7,
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]) as GeneratedTask[];
    return parsed.filter(
      (t) => t.question && Array.isArray(t.options) && t.options.length >= 2,
    );
  } catch (err) {
    logger.warn({ err }, "Groq generation failed — using fallback");
    return Array.from({ length: count }, () => ({
      question: "Classify this content into the correct category.",
      options: labels.slice(0, 4),
      difficulty: "easy" as const,
    }));
  }
}

// ── Dataset source configurations ──────────────────────────────────────────────

interface DatasetAgentConfig {
  contentType: "image" | "text" | "audio" | "video" | "social" | "mixed";
  sources: Array<
    | { kind: "wikimedia_image"; category: string }
    | { kind: "wikimedia_audio"; category: string }
    | { kind: "wikimedia_video"; category: string }
    | { kind: "wikipedia"; titles: string[]; lang?: string }
    | { kind: "picsum"; count: number }
    | { kind: "reddit"; subreddit: string }
    | { kind: "mastodon"; instance?: string; limit?: number }
  >;
  labels: string[];
  tasksPerContent: number;
  useAngles?: boolean;
}

const DATASET_AGENT_CONFIG: Record<string, DatasetAgentConfig> = {
  // ── IMAGE DATASETS ────────────────────────────────────────────────────────
  "image_classification": {
    contentType: "image",
    sources: [
      { kind: "wikimedia_image", category: "Animals" },
      { kind: "wikimedia_image", category: "Vehicles" },
      { kind: "picsum", count: 10 },
    ],
    labels: ["animal", "vehicle", "person", "building", "nature", "object"],
    tasksPerContent: 4,
    useAngles: true,
  },
  "facial_expression": {
    contentType: "image",
    sources: [
      { kind: "wikimedia_image", category: "Facial_expressions" },
      { kind: "picsum", count: 15 },
    ],
    labels: ["happy", "sad", "angry", "surprised", "neutral", "fear"],
    tasksPerContent: 3,
    useAngles: true,
  },
  "product_quality": {
    contentType: "image",
    sources: [
      { kind: "wikimedia_image", category: "Product_photography" },
      { kind: "picsum", count: 15 },
    ],
    labels: ["defect", "ok", "uncertain"],
    tasksPerContent: 3,
    useAngles: true,
  },
  "satellite": {
    contentType: "image",
    sources: [
      { kind: "wikimedia_image", category: "Satellite_images_of_Italy" },
      { kind: "wikimedia_image", category: "Aerial_photographs" },
      { kind: "picsum", count: 10 },
    ],
    labels: ["urban", "forest", "agriculture", "water", "industrial", "desert"],
    tasksPerContent: 3,
    useAngles: true,
  },

  // ── TEXT DATASETS ─────────────────────────────────────────────────────────
  "text_classification": {
    contentType: "text",
    sources: [
      { kind: "wikipedia", titles: ["Artificial intelligence", "Machine learning", "Big data", "Cloud computing"], lang: "en" },
      { kind: "reddit", subreddit: "technology" },
      { kind: "reddit", subreddit: "science" },
    ],
    labels: ["technology", "science", "business", "health", "politics", "entertainment"],
    tasksPerContent: 3,
  },
  "sentiment": {
    contentType: "text",
    sources: [
      { kind: "reddit", subreddit: "worldnews" },
      { kind: "reddit", subreddit: "italy" },
      { kind: "wikipedia", titles: ["Italian economy", "Innovation", "Environmental sustainability"], lang: "en" },
    ],
    labels: ["positive", "negative", "neutral"],
    tasksPerContent: 3,
  },
  "medical_text": {
    contentType: "text",
    sources: [
      { kind: "wikipedia", titles: ["Medicine", "Pharmacology", "Clinical trial", "Triage", "Emergency medicine"], lang: "en" },
      { kind: "wikipedia", titles: ["Diagnosis", "Therapy", "Medical imaging", "Patient care"], lang: "en" },
    ],
    labels: ["urgent", "routine", "administrative", "diagnostic", "therapeutic"],
    tasksPerContent: 3,
  },
  "document_ocr": {
    contentType: "image",
    sources: [
      { kind: "wikimedia_image", category: "Handwritten_documents" },
      { kind: "wikimedia_image", category: "Historical_documents" },
      { kind: "picsum", count: 15 },
    ],
    labels: ["legible", "partially_legible", "illegible", "printed", "handwritten"],
    tasksPerContent: 3,
    useAngles: true,
  },

  // ── AUDIO DATASETS ────────────────────────────────────────────────────────
  "speech_transcription_en": {
    contentType: "audio",
    sources: [
      { kind: "wikimedia_audio", category: "English_language_pronunciation" },
      { kind: "wikimedia_audio", category: "Spoken_Wikipedia_in_English" },
      { kind: "wikimedia_audio", category: "Audio_recordings_of_speeches" },
    ],
    labels: ["clear", "unclear", "background_noise", "multiple_speakers", "accent_strong", "accent_neutral"],
    tasksPerContent: 2,
  },
  "speech_transcription_it": {
    contentType: "audio",
    sources: [
      { kind: "wikimedia_audio", category: "Italian_language_pronunciation" },
      { kind: "wikimedia_audio", category: "Spoken_Wikipedia_in_Italian" },
    ],
    labels: ["clear", "unclear", "background_noise", "multiple_speakers", "dialect", "standard"],
    tasksPerContent: 2,
  },
  "speech_transcription_fr": {
    contentType: "audio",
    sources: [
      { kind: "wikimedia_audio", category: "French_language_pronunciation" },
      { kind: "wikimedia_audio", category: "Spoken_Wikipedia_in_French" },
    ],
    labels: ["clear", "unclear", "background_noise", "multiple_speakers", "accent_strong", "accent_neutral"],
    tasksPerContent: 2,
  },
  "audio_language": {
    contentType: "audio",
    sources: [
      { kind: "wikimedia_audio", category: "English_language_pronunciation" },
      { kind: "wikimedia_audio", category: "Italian_language_pronunciation" },
      { kind: "wikimedia_audio", category: "French_language_pronunciation" },
      { kind: "wikimedia_audio", category: "Spanish_language_pronunciation" },
      { kind: "wikimedia_audio", category: "German_language_pronunciation" },
    ],
    labels: ["english", "italian", "french", "spanish", "german", "other"],
    tasksPerContent: 1,
  },
  "audio_emotion": {
    contentType: "audio",
    sources: [
      { kind: "wikimedia_audio", category: "Audio_recordings_of_speeches" },
      { kind: "wikimedia_audio", category: "Sound_recordings" },
      { kind: "wikimedia_audio", category: "Spoken_Wikipedia_in_English" },
    ],
    labels: ["happy", "sad", "angry", "neutral", "excited", "calm", "fearful"],
    tasksPerContent: 2,
  },

  // ── VIDEO DATASETS ────────────────────────────────────────────────────────
  "video_action": {
    contentType: "video",
    sources: [
      { kind: "wikimedia_video", category: "Videos_of_animals" },
      { kind: "wikimedia_video", category: "Sports_videos" },
      { kind: "wikimedia_video", category: "Nature_videos" },
      { kind: "wikimedia_video", category: "Videos" },
    ],
    labels: ["running", "walking", "jumping", "swimming", "flying", "eating", "playing", "working", "idle"],
    tasksPerContent: 6,
    useAngles: true,
  },

  // ── SOCIAL MEDIA DATASETS ─────────────────────────────────────────────────
  "social_media": {
    contentType: "social",
    sources: [
      { kind: "mastodon", instance: "mastodon.social", limit: 40 },
      { kind: "mastodon", instance: "fosstodon.org",   limit: 20 },
      { kind: "mastodon", instance: "hachyderm.io",    limit: 20 },
    ],
    labels: ["spam","not_spam","positive","negative","neutral","safe","unsafe","misinformation"],
    tasksPerContent: 5,
    useAngles: true,
  },

  // ── DEFAULT FALLBACK ──────────────────────────────────────────────────────
  "default": {
    contentType: "mixed",
    sources: [
      { kind: "picsum", count: 20 },
      { kind: "wikipedia", titles: ["Technology", "Environment", "Art", "Sport", "Italian cuisine"], lang: "en" },
    ],
    labels: ["relevant", "not_relevant", "uncertain"],
    tasksPerContent: 3,
    useAngles: true,
  },
};

function getConfigForDataset(dataset: { id: number; category: string; name: string }): DatasetAgentConfig {
  const name = dataset.name.toLowerCase();

  // Audio
  if (name.includes("speech") && name.includes("en")) return DATASET_AGENT_CONFIG["speech_transcription_en"]!;
  if (name.includes("speech") && name.includes("it")) return DATASET_AGENT_CONFIG["speech_transcription_it"]!;
  if (name.includes("speech") && name.includes("fr")) return DATASET_AGENT_CONFIG["speech_transcription_fr"]!;
  if (name.includes("speech") || name.includes("transcription")) return DATASET_AGENT_CONFIG["speech_transcription_en"]!;
  if (name.includes("language") && (name.includes("audio") || name.includes("detect"))) return DATASET_AGENT_CONFIG["audio_language"]!;
  if (name.includes("emotion") && name.includes("audio")) return DATASET_AGENT_CONFIG["audio_emotion"]!;
  if (name.includes("audio")) return DATASET_AGENT_CONFIG["audio_emotion"]!;

  // Video
  if (name.includes("video") || name.includes("action")) return DATASET_AGENT_CONFIG["video_action"]!;

  // Images
  if (name.includes("facial") || name.includes("expression")) return DATASET_AGENT_CONFIG["facial_expression"]!;
  if (name.includes("quality") || name.includes("qualità")) return DATASET_AGENT_CONFIG["product_quality"]!;
  if (name.includes("satellite") || name.includes("land use")) return DATASET_AGENT_CONFIG["satellite"]!;
  if (name.includes("ocr") || name.includes("document")) return DATASET_AGENT_CONFIG["document_ocr"]!;
  if (name.includes("object") && name.includes("classif")) return DATASET_AGENT_CONFIG["image_classification"]!;

  // Social
  if (name.includes("social") || name.includes("facebook") || name.includes("instagram") || name.includes("wechat") || name.includes("post")) return DATASET_AGENT_CONFIG["social_media"]!;

  // Text
  if (name.includes("medical") || name.includes("triage")) return DATASET_AGENT_CONFIG["medical_text"]!;
  if (name.includes("sentiment") || name.includes("opinion")) return DATASET_AGENT_CONFIG["sentiment"]!;

  // Category-based fallback
  const cat = dataset.category.toLowerCase();
  if (cat.includes("social")) return DATASET_AGENT_CONFIG["social_media"]!;
  if (cat.includes("text") || name.includes("text")) return DATASET_AGENT_CONFIG["text_classification"]!;
  if (cat.includes("image") || name.includes("image") || name.includes("photo")) return DATASET_AGENT_CONFIG["image_classification"]!;

  return DATASET_AGENT_CONFIG["default"]!;
}

// ── Fetch from a single source ─────────────────────────────────────────────────

async function fetchFromSource(source: DatasetAgentConfig["sources"][number]): Promise<FetchedContent[]> {
  try {
    switch (source.kind) {
      case "wikimedia_image":  return await fetchWikimediaImages(source.category);
      case "wikimedia_audio":  return await fetchWikimediaAudio(source.category);
      case "wikimedia_video":  return await fetchWikimediaVideo(source.category);
      case "wikipedia":        return await fetchWikipediaTexts(source.titles, source.lang ?? "en");
      case "picsum":           return fetchPicsumImages(source.count);
      case "reddit":           return await fetchRedditTexts(source.subreddit);
    case "mastodon":         return await fetchMastodonPosts(source.instance ?? "mastodon.social", source.limit ?? 30);
    }
  } catch (err) {
    logger.warn({ err, source }, "Source fetch failed");
    return [];
  }
}

// ── Main runner ────────────────────────────────────────────────────────────────

export interface AgentRunOptions {
  datasetIds?: number[];
  tasksPerDataset?: number;
  dryRun?: boolean;
}

export async function runTaskAgent(options: AgentRunOptions = {}): Promise<AgentRun> {
  if (running) throw new Error("Agent already running");

  const run: AgentRun = {
    runId: `run-${Date.now()}`,
    startedAt: new Date(),
    status: "running",
    datasetsProcessed: 0,
    tasksCreated: 0,
    errors: [],
    log: [],
  };

  lastRun = run;
  running = true;

  const log = (msg: string) => {
    run.log.push(`[${new Date().toISOString()}] ${msg}`);
    logger.info(msg);
  };

  try {
    log("🤖 Task Agent started");

    let datasets = await db.select().from(datasetsTable);
    if (options.datasetIds?.length) {
      datasets = datasets.filter((d) => options.datasetIds!.includes(d.id));
    }
    datasets = datasets.filter((d) => ["active", "published", "draft"].includes(d.status));
    log(`📊 Datasets to process: ${datasets.length}`);

    const tasksPerDataset = options.tasksPerDataset ?? 50;

    for (const dataset of datasets) {
      try {
        log(`\n▶ Dataset #${dataset.id}: ${dataset.name}`);
        const config = getConfigForDataset(dataset);

        // Fetch content from all sources
        const allContent: FetchedContent[] = [];
        for (const source of config.sources) {
          const items = await fetchFromSource(source);
          allContent.push(...items);
          log(`  ↳ ${source.kind}: ${items.length} items`);
        }

        // Fallback if nothing fetched
        if (allContent.length === 0) {
          log(`  ⚠ No content — using Picsum fallback`);
          allContent.push(...fetchPicsumImages(20, dataset.id * 100));
        }

        const taskRows: any[] = [];
        let created = 0;

        for (const content of allContent) {
          if (created >= tasksPerDataset) break;

          const remaining = tasksPerDataset - created;
          const wantCount = Math.min(config.tasksPerContent, remaining);

          // ── IMAGE: multi-angle system (no Groq needed) ──────────────────
          if (content.type === "image" && config.useAngles) {
            const angles = getImageAngles(wantCount);
            for (const angle of angles) {
              if (created >= tasksPerDataset) break;
              taskRows.push({
                datasetId: dataset.id,
                type: "image",
                dataPayload: {
                  question: angle.question,
                  options: angle.options,
                  imageUrl: content.imageUrl,
                  source: content.sourceUrl,
                  sourceName: content.sourceName,
                  agentGenerated: true,
                  angleTask: true,
                  angleCategory: angle.category,
                  angleEmoji: angle.emoji,
                },
                correctAnswer: null,
                difficulty: angle.difficulty,
                pointsReward: angle.difficulty === "hard" ? 15 : angle.difficulty === "medium" ? 12 : 10,
                requiredVotes: dataset.votesRequired,
                consensusThreshold: dataset.consensusThreshold,
                supervisorId: dataset.supervisorId ?? null,
                taskValuePoints: 10,
                operatorRewardTon: 0.00004,
                supervisorRewardTon: 0.0001,
                rawSource: content.sourceUrl,
              });
              created++;
            }
          }

          // ── AUDIO: multi-angle system ────────────────────────────────────
          else if (content.type === "audio" && config.useAngles) {
            const angles = getAudioAngles(wantCount);
            for (const angle of angles) {
              if (created >= tasksPerDataset) break;
              taskRows.push({
                datasetId: dataset.id,
                type: "audio",
                dataPayload: {
                  question: angle.question,
                  options: angle.options,
                  audioUrl: content.audioUrl,
                  source: content.sourceUrl,
                  sourceName: content.sourceName,
                  agentGenerated: true,
                  angleTask: true,
                  angleCategory: angle.category,
                  angleEmoji: angle.emoji,
                },
                correctAnswer: null,
                difficulty: angle.difficulty,
                pointsReward: angle.difficulty === "hard" ? 15 : angle.difficulty === "medium" ? 12 : 10,
                requiredVotes: dataset.votesRequired,
                consensusThreshold: dataset.consensusThreshold,
                supervisorId: dataset.supervisorId ?? null,
                taskValuePoints: 10,
                operatorRewardTon: 0.00004,
                supervisorRewardTon: 0.0001,
                rawSource: content.sourceUrl,
              });
              created++;
            }
          }

          // ── VIDEO: multi-angle system ────────────────────────────────────
          else if (content.type === "video" && config.useAngles) {
            const angles = getVideoAngles(wantCount);
            for (const angle of angles) {
              if (created >= tasksPerDataset) break;
              taskRows.push({
                datasetId: dataset.id,
                type: "video",
                dataPayload: {
                  question: angle.question,
                  options: angle.options,
                  videoUrl: content.videoUrl,
                  thumbnail: content.thumbnail,
                  source: content.sourceUrl,
                  sourceName: content.sourceName,
                  agentGenerated: true,
                  angleTask: true,
                  angleCategory: angle.category,
                  angleEmoji: angle.emoji,
                },
                correctAnswer: null,
                difficulty: angle.difficulty,
                pointsReward: angle.difficulty === "hard" ? 15 : angle.difficulty === "medium" ? 12 : 10,
                requiredVotes: dataset.votesRequired,
                consensusThreshold: dataset.consensusThreshold,
                supervisorId: dataset.supervisorId ?? null,
                taskValuePoints: 10,
                operatorRewardTon: 0.00004,
                supervisorRewardTon: 0.0001,
                rawSource: content.sourceUrl,
              });
              created++;
            }
          }

          // ── SOCIAL: multi-angle system ───────────────────────────────────
          else if (content.type === "social" && config.useAngles) {
            const angles = getSocialAngles(wantCount);
            for (const angle of angles) {
              if (created >= tasksPerDataset) break;
              taskRows.push({
                datasetId: dataset.id,
                type: "text",
                dataPayload: {
                  question: angle.question,
                  options: angle.options,
                  text: content.postText ?? content.text,
                  source: content.sourceUrl,
                  sourceName: content.sourceName,
                  agentGenerated: true,
                  angleTask: true,
                  angleCategory: angle.category,
                  angleEmoji: angle.emoji,
                  postType: "social",
                  postAuthor: content.postAuthor,
                  postPlatform: content.postPlatform,
                  postLikes: content.postLikes,
                  postComments: content.postComments,
                },
                correctAnswer: null,
                difficulty: angle.difficulty,
                pointsReward: angle.difficulty === "hard" ? 15 : angle.difficulty === "medium" ? 12 : 10,
                requiredVotes: dataset.votesRequired,
                consensusThreshold: dataset.consensusThreshold,
                supervisorId: dataset.supervisorId ?? null,
                taskValuePoints: 10,
                operatorRewardTon: 0.00004,
                supervisorRewardTon: 0.0001,
                rawSource: content.sourceUrl,
              });
              created++;
            }
          }

          // ── TEXT: multi-angle system ─────────────────────────────────────
          else if (content.type === "text" && config.useAngles) {
            const angles = getTextAngles(wantCount);
            for (const angle of angles) {
              if (created >= tasksPerDataset) break;
              taskRows.push({
                datasetId: dataset.id,
                type: "text",
                dataPayload: {
                  question: angle.question,
                  options: angle.options,
                  text: content.text,
                  source: content.sourceUrl,
                  sourceName: content.sourceName,
                  agentGenerated: true,
                  angleTask: true,
                  angleCategory: angle.category,
                  angleEmoji: angle.emoji,
                },
                correctAnswer: null,
                difficulty: angle.difficulty,
                pointsReward: angle.difficulty === "hard" ? 15 : angle.difficulty === "medium" ? 12 : 10,
                requiredVotes: dataset.votesRequired,
                consensusThreshold: dataset.consensusThreshold,
                supervisorId: dataset.supervisorId ?? null,
                taskValuePoints: 10,
                operatorRewardTon: 0.00004,
                supervisorRewardTon: 0.0001,
                rawSource: content.sourceUrl,
              });
              created++;
            }
          }

          // ── AUDIO / VIDEO / TEXT: Groq fallback (when useAngles is false) ─
          else if (content.type === "audio" || content.type === "video" || content.type === "text") {
            const generated = await generateTasksWithGroq(
              content, dataset.category, config.labels, wantCount,
            );

            for (const g of generated) {
              if (created >= tasksPerDataset) break;

              const dataPayload: Record<string, unknown> = {
                question: g.question,
                options: g.options,
                source: content.sourceUrl,
                sourceName: content.sourceName,
                agentGenerated: true,
                ...(content.type === "audio" ? { audioUrl: content.audioUrl } : {}),
                ...(content.type === "video" ? { videoUrl: content.videoUrl, thumbnail: content.thumbnail } : {}),
                ...(content.type === "text"  ? { text: content.text } : {}),
              };

              taskRows.push({
                datasetId: dataset.id,
                type: content.type,
                dataPayload,
                correctAnswer: g.correctAnswer ?? null,
                difficulty: g.difficulty,
                pointsReward: g.difficulty === "hard" ? 15 : g.difficulty === "medium" ? 12 : 10,
                requiredVotes: dataset.votesRequired,
                consensusThreshold: dataset.consensusThreshold,
                supervisorId: dataset.supervisorId ?? null,
                taskValuePoints: 10,
                operatorRewardTon: 0.00004,
                supervisorRewardTon: 0.0001,
                rawSource: content.sourceUrl,
              });
              created++;
            }
          }
        }

        // Insert into DB in batches of 100
        if (!options.dryRun && taskRows.length > 0) {
          const BATCH = 100;
          for (let i = 0; i < taskRows.length; i += BATCH) {
            await db.insert(tasksTable).values(taskRows.slice(i, i + BATCH));
          }
          await db
            .update(datasetsTable)
            .set({
              requestedTaskCount: dataset.requestedTaskCount + taskRows.length,
              recordCount: (dataset.recordCount ?? 0) + taskRows.length,
            })
            .where(eq(datasetsTable.id, dataset.id));
        }

        log(`  ✅ ${taskRows.length} tasks created${options.dryRun ? " (dry run)" : ""}`);
        run.tasksCreated += taskRows.length;
        run.datasetsProcessed++;

        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`  ❌ Dataset #${dataset.id} error: ${msg}`);
        run.errors.push(`Dataset #${dataset.id}: ${msg}`);
      }
    }

    run.status = "done";
    run.finishedAt = new Date();
    const elapsed = Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000);
    log(`\n🏁 Done in ${elapsed}s — ${run.tasksCreated} tasks across ${run.datasetsProcessed} datasets`);
  } catch (err) {
    run.status = "error";
    run.finishedAt = new Date();
    const msg = err instanceof Error ? err.message : String(err);
    run.errors.push(msg);
    logger.error({ err }, "Task agent fatal error");
  } finally {
    running = false;
  }

  return run;
}

// ── Cron: every hour ───────────────────────────────────────────────────────────

let cronTimer: ReturnType<typeof setInterval> | null = null;

export function startAgentCron(intervalMs = 60 * 60 * 1000): void {
  if (cronTimer) return;
  logger.info(`🤖 Task Agent cron started (every ${intervalMs / 60000} min)`);
  cronTimer = setInterval(async () => {
    if (running) {
      logger.info("Cron: agent already running, skip");
      return;
    }
    logger.info("Cron: starting automatic run");
    try {
      await runTaskAgent({ tasksPerDataset: 30 });
    } catch (err) {
      logger.error({ err }, "Cron agent error");
    }
  }, intervalMs);
}

export function stopAgentCron(): void {
  if (cronTimer) { clearInterval(cronTimer); cronTimer = null; }
}
