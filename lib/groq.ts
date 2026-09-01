import Groq from "groq-sdk";

export interface ChatMessageInput {
  role: string;
  content: string;
}

export const SUPPORTED_GROQ_MODELS = [
  "groq/compound",
  "openai/gpt-oss-120b",
  "groq/compound-mini",
  "allam-2-7b",
  "qwen/qwen3.6-27b",
];

const GROQ_PER_KEY_TIMEOUT_MS = 4000;
const GROQ_SLOW_KEY_THRESHOLD_MS = 3000;
const GROQ_HEALTH_DECAY_RECENT_N = 4;

interface KeyHealth {
  avgLatencyMs: number | null;
  recentLatencies: number[];
  recentFailures: number;
  totalSamples: number;
  lastUsedAt: number;
}

const groqKeyHealth = new Map<string, KeyHealth>();

function getOrInitKeyHealth(key: string): KeyHealth {
  let h = groqKeyHealth.get(key);
  if (!h) {
    h = {
      avgLatencyMs: null,
      recentLatencies: [],
      recentFailures: 0,
      totalSamples: 0,
      lastUsedAt: 0,
    };
    groqKeyHealth.set(key, h);
  }
  return h;
}

function recordKeyResult(
  key: string,
  latencyMs: number,
  ok: boolean
): void {
  const h = getOrInitKeyHealth(key);
  h.lastUsedAt = Date.now();
  h.totalSamples += 1;
  h.recentLatencies.push(latencyMs);
  if (h.recentLatencies.length > GROQ_HEALTH_DECAY_RECENT_N) {
    h.recentLatencies.shift();
  }
  if (!ok) {
    h.recentFailures = Math.min(GROQ_HEALTH_DECAY_RECENT_N, h.recentFailures + 1);
  } else if (h.recentFailures > 0) {
    h.recentFailures = Math.max(0, h.recentFailures - 1);
  }
  const sum = h.recentLatencies.reduce((a, b) => a + b, 0);
  h.avgLatencyMs = h.recentLatencies.length > 0 ? sum / h.recentLatencies.length : null;
}

function computeKeyScore(key: string): {
  rank: number;
  avgLatencyMs: number | null;
  recentFailures: number;
  isUntried: boolean;
} {
  const h = groqKeyHealth.get(key);
  if (!h || h.totalSamples === 0) {
    return { rank: 10000, avgLatencyMs: null, recentFailures: 0, isUntried: true };
  }
  const base = h.avgLatencyMs ?? 2000;
  const failurePenalty = h.recentFailures * 5000;
  const slowPenalty = base > GROQ_SLOW_KEY_THRESHOLD_MS ? 1500 : 0;
  return {
    rank: base + failurePenalty + slowPenalty,
    avgLatencyMs: h.avgLatencyMs,
    recentFailures: h.recentFailures,
    isUntried: false,
  };
}

export function getAllGroqApiKeys(): string[] {
  const keys: string[] = [];

  if (process.env.GROQ_API_KEYS) {
    const split = process.env.GROQ_API_KEYS.split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    for (const k of split) {
      if (!keys.includes(k)) keys.push(k);
    }
  }

  if (process.env.GROQ_API_KEY) {
    const k = process.env.GROQ_API_KEY.trim();
    if (k && !keys.includes(k)) keys.push(k);
  }

  for (let i = 2; i <= 10; i++) {
    const envKey = process.env[`GROQ_API_KEY_${i}`];
    if (envKey) {
      const k = envKey.trim();
      if (k && !keys.includes(k)) keys.push(k);
    }
  }

  return keys;
}

export function getRankedGroqApiKeys(): {
  key: string;
  rank: number;
  avgLatencyMs: number | null;
  recentFailures: number;
  isUntried: boolean;
}[] {
  const keys = getAllGroqApiKeys();
  const scored = keys.map((k) => ({ key: k, ...computeKeyScore(k) }));
  scored.sort((a, b) => a.rank - b.rank);
  return scored;
}

function getGroqClient(apiKey: string): Groq {
  return new Groq({ apiKey });
}

export const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "",
});

export interface GroqChatAttempt {
  keyIndex: number;
  keyMasked: string;
  model: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export async function createGroqChatStream(
  messages: ChatMessageInput[],
  systemPrompt: string,
  modelName: string = "groq/compound",
  opts?: { timeoutMs?: number; attemptLog?: GroqChatAttempt[] }
) {
  const timeoutMs = opts?.timeoutMs ?? GROQ_PER_KEY_TIMEOUT_MS;
  const attemptLog = opts?.attemptLog;
  const ranked = getRankedGroqApiKeys();
  if (ranked.length === 0) {
    throw new Error("[Groq] No GROQ_API_KEY configured.");
  }

  const fullMessages: ChatMessageInput[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  let lastError: unknown = null;

  for (let attempt = 0; attempt < ranked.length; attempt++) {
    const { key: apiKey } = ranked[attempt];
    const keyIdx = attempt;
    const client = getGroqClient(apiKey);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const start = Date.now();

    try {
      const streamPromise = client.chat.completions.create({
        messages: fullMessages as unknown as Groq.Chat.Completions.ChatCompletionMessageParam[],
        model: modelName,
        temperature: 0.55,
        max_tokens: 2048,
        stream: true,
      });

      const timeoutRace = new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(new Error(`AbortError: TIMEOUT after ${timeoutMs}ms`));
        });
      });

      const stream = (await Promise.race([streamPromise, timeoutRace])) as Awaited<
        ReturnType<typeof client.chat.completions.create>
      >;

      const latencyMs = Date.now() - start;
      clearTimeout(timeout);
      recordKeyResult(apiKey, latencyMs, true);
      if (attemptLog) {
        attemptLog.push({
          keyIndex: keyIdx,
          keyMasked: apiKey.length > 8 ? apiKey.slice(0, 6) + "..." + apiKey.slice(-4) : "***",
          model: modelName,
          ok: true,
          latencyMs,
        });
      }
      return stream;
    } catch (err) {
      const latencyMs = Date.now() - start;
      clearTimeout(timeout);
      const rawMsg = err instanceof Error ? err.message : String(err);
      const isAbort =
        (err as { name?: string }).name === "AbortError" ||
        /^AbortError|TIMEOUT after/i.test(rawMsg);
      lastError = err;
      console.warn(
        `[Groq Key Failover] Rank #${attempt + 1} (${apiKey.slice(0, 6)}...) model ${modelName}: ${isAbort ? `TIMEOUT ${latencyMs}ms` : rawMsg.slice(0, 120)}. Trying next key.`
      );
      recordKeyResult(apiKey, latencyMs, false);
      if (attemptLog) {
        attemptLog.push({
          keyIndex: keyIdx,
          keyMasked: apiKey.length > 8 ? apiKey.slice(0, 6) + "..." + apiKey.slice(-4) : "***",
          model: modelName,
          ok: false,
          latencyMs,
          error: isAbort ? `TIMEOUT after ${timeoutMs}ms` : rawMsg.slice(0, 200),
        });
      }
    }
  }

  throw lastError || new Error("[Groq] All API keys exhausted.");
}

export function isGroqRateLimitError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const status = (error as { status?: unknown }).status;
  if (status === 429) return true;

  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && /\b429\b|rate limit/i.test(message);
}

export async function generateGroqMemorySummary(prompt: string): Promise<string> {
  const ranked = getRankedGroqApiKeys();
  const models = ["groq/compound", "openai/gpt-oss-120b", "groq/compound-mini"];

  for (const { key: apiKey } of ranked) {
    const client = getGroqClient(apiKey);
    for (const model of models) {
      const start = Date.now();
      try {
        const completion = await client.chat.completions.create({
          messages: [
            { role: "system", content: "You are a concise memory summary generator." },
            { role: "user", content: prompt },
          ],
          model,
          temperature: 0.2,
          max_tokens: 220,
        });
        const latencyMs = Date.now() - start;
        recordKeyResult(apiKey, latencyMs, true);

        const content = completion.choices[0]?.message?.content?.trim();
        if (content) return content;
      } catch (err) {
        const latencyMs = Date.now() - start;
        recordKeyResult(apiKey, latencyMs, false);
        console.warn(`[Groq] Summary failed on key with model ${model}:`, err);
      }
    }
  }

  return "";
}
