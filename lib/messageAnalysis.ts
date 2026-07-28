const SENSITIVE_KEYWORDS: string[] = [
  "suicide",
  "kill myself",
  "killing myself",
  "want to die",
  "self-harm",
  "self harm",
  "cut myself",
  "cutting myself",
  "end my life",
  "end it all",
  "depressed",
  "depression",
  "anxious",
  "anxiety",
  "panic attack",
  "panic",
  "having a breakdown",
  "mental breakdown",
  "crisis",
  "emergency",
  "need help now",
  "urgent help",
  "911",
  "112",
  "poison",
  "overdose",
  "seizure",
  "stroke",
  "heart attack",
  "dying",
  "grieving",
  "grief",
  "mourning",
  "died",
  "passed away",
  "lost someone",
  "suicidal",
  "abuse",
  "being abused",
  "domestic violence",
  "assaulted",
  "raped",
  "sexual assault",
  "harassed",
  "stalked",
  "lawyer",
  "lawsuit",
  "legal advice",
  "getting sued",
  "arrested",
  "jail",
  "prison",
  "court case",
  "divorce",
  "custody",
  "pregnant",
  "pregnancy",
  "miscarriage",
  "cancer",
  "tumor",
  "diagnosed",
  "diagnosis",
  "health scare",
  "bad diagnosis",
  "seriously ill",
  "chronic pain",
  "addiction",
  "relapse",
  "withdrawal",
];

const SENSITIVE_REGEXES: RegExp[] = [
  /i\s*(don'?t|do not)\s*want\s+to\s+(live|be here|exist)/i,
  /nobody\s+(would|will|could)\s+(care|mind|notice)/i,
  /what'?s\s+the\s+point\s+of\s+(living|life)/i,
  /should\s+i\s+just\s+(die|end\s+it)/i,
  /(please|i need|can someone)\s+help\s+me\s+(please|i'?m\s+scared|i'?m\s+scared)/i,
  /i\s+'?m\s+scared\s+(for|about|that)/i,
  /thoughts?\s+about\s+(suicide|killing\s+myself|dying)/i,
  /(abusive|toxic)\s+(parent|partner|relationship|family|home)/i,
];

export interface MessageLike {
  role: string;
  content: string;
}

export function detectSensitiveContext(messages: MessageLike[]): boolean {
  if (!messages || messages.length === 0) return false;

  const recentUserMessages = [...messages]
    .reverse()
    .filter((m) => m.role === "user")
    .slice(0, 2);

  const combined = recentUserMessages.map((m) => m.content).join("\n\n");
  const lower = combined.toLowerCase();

  for (const keyword of SENSITIVE_KEYWORDS) {
    if (lower.includes(keyword)) return true;
  }

  for (const regex of SENSITIVE_REGEXES) {
    if (regex.test(combined)) return true;
  }

  return false;
}
