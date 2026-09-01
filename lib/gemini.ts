export interface ChatMessageInput {
  role: string;
  content: string;
}

const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

const GEMINI_PER_KEY_TIMEOUT_MS = 3500;
const GEMINI_SLOW_KEY_THRESHOLD_MS = 2500;
const GEMINI_HEALTH_DECAY_RECENT_N = 4;

interface KeyHealth {
  avgLatencyMs: number | null;
  recentLatencies: number[];
  recentFailures: number;
  totalSamples: number;
  lastUsedAt: number;
}

const geminiKeyHealth = new Map<string, KeyHealth>();

function getOrInitKeyHealth(key: string): KeyHealth {
  let h = geminiKeyHealth.get(key);
  if (!h) {
    h = {
      avgLatencyMs: null,
      recentLatencies: [],
      recentFailures: 0,
      totalSamples: 0,
      lastUsedAt: 0,
    };
    geminiKeyHealth.set(key, h);
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
  if (h.recentLatencies.length > GEMINI_HEALTH_DECAY_RECENT_N) {
    h.recentLatencies.shift();
  }
  if (!ok) {
    h.recentFailures = Math.min(GEMINI_HEALTH_DECAY_RECENT_N, h.recentFailures + 1);
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
  const h = geminiKeyHealth.get(key);
  if (!h || h.totalSamples === 0) {
    return { rank: 10000, avgLatencyMs: null, recentFailures: 0, isUntried: true };
  }
  const base = h.avgLatencyMs ?? 2000;
  const failurePenalty = h.recentFailures * 5000;
  const slowPenalty = base > GEMINI_SLOW_KEY_THRESHOLD_MS ? 1500 : 0;
  return {
    rank: base + failurePenalty + slowPenalty,
    avgLatencyMs: h.avgLatencyMs,
    recentFailures: h.recentFailures,
    isUntried: false,
  };
}

export function getAllGeminiApiKeys(): string[] {
  const keys: string[] = [];

  if (process.env.GEMINI_API_KEYS) {
    const split = process.env.GEMINI_API_KEYS.split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    for (const k of split) {
      if (!keys.includes(k)) keys.push(k);
    }
  }

  if (process.env.GEMINI_API_KEY) {
    const k = process.env.GEMINI_API_KEY.trim();
    if (k && !keys.includes(k)) keys.push(k);
  }

  for (let i = 2; i <= 10; i++) {
    const envKey = process.env[`GEMINI_API_KEY_${i}`];
    if (envKey) {
      const k = envKey.trim();
      if (k && !keys.includes(k)) keys.push(k);
    }
  }

  return keys;
}

export function getRankedGeminiApiKeys(): {
  key: string;
  rank: number;
  avgLatencyMs: number | null;
  recentFailures: number;
  isUntried: boolean;
}[] {
  const keys = getAllGeminiApiKeys();
  const scored = keys.map((k) => ({ key: k, ...computeKeyScore(k) }));
  scored.sort((a, b) => a.rank - b.rank);
  return scored;
}

function mapMessagesToGeminiContents(messages: ChatMessageInput[]) {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
}

function extractTextFromGeminiPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";

  const candidates = (payload as { candidates?: unknown[] }).candidates;
  if (!Array.isArray(candidates)) return "";

  let text = "";

  for (const candidate of candidates) {
    const parts = (candidate as {
      content?: { parts?: { text?: string }[] };
    }).content?.parts;

    if (!Array.isArray(parts)) continue;

    for (const part of parts) {
      if (typeof part?.text === "string") {
        text += part.text;
      }
    }
  }

  return text;
}

export interface GeminiPostAttempt {
  keyIndex: number;
  keyMasked: string;
  ok: boolean;
  latencyMs: number;
  status?: number;
  error?: string;
}

export async function postGeminiJson(
  path: string,
  body: Record<string, unknown>,
  opts?: {
    timeoutMs?: number;
    attemptLog?: GeminiPostAttempt[];
  }
): Promise<Response> {
  const timeoutMs = opts?.timeoutMs ?? GEMINI_PER_KEY_TIMEOUT_MS;
  const attemptLog = opts?.attemptLog;
  const ranked = getRankedGeminiApiKeys();
  const joiner = path.includes("?") ? "&" : "?";
  let lastResponse: Response | null = null;
  let lastErrorDetails = "";

  if (ranked.length === 0) {
    throw new Error("[Gemini] No GEMINI_API_KEY configured.");
  }

  for (let attempt = 0; attempt < ranked.length; attempt++) {
    const { key: apiKey } = ranked[attempt];
    const keyIdx = attempt;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const start = Date.now();
    let ok = false;
    let latencyMs = 0;
    let statusCode: number | undefined;
    let errMsg: string | undefined;

    try {
      const response = await fetch(
        `${GEMINI_API_BASE}/${GEMINI_MODEL}:${path}${joiner}key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        }
      );
      latencyMs = Date.now() - start;
      clearTimeout(timeout);
      statusCode = response.status;

      if (response.ok) {
        ok = true;
        recordKeyResult(apiKey, latencyMs, true);
        if (attemptLog) {
          attemptLog.push({
            keyIndex: keyIdx,
            keyMasked: apiKey.length > 8 ? apiKey.slice(0, 6) + "..." + apiKey.slice(-4) : "***",
            ok: true,
            latencyMs,
            status: statusCode,
          });
        }
        return response;
      }

      const details = await response.text();
      lastErrorDetails = details;
      lastResponse = response;

      const isQuotaOr429 =
        response.status === 429 ||
        /quota|429|RESOURCE_EXHAUSTED/i.test(details);
      errMsg = `HTTP ${response.status} — ${details.slice(0, 160) || response.statusText}`;

      if (isQuotaOr429 && ranked.length > 1) {
        console.warn(
          `[Gemini Key Failover] Rank #${attempt + 1} (${apiKey.slice(0, 6)}...) quota reached (status ${response.status}, ${latencyMs}ms). Trying next fastest key...`
        );
        continue;
      }

      recordKeyResult(apiKey, latencyMs, false);
      if (attemptLog) {
        attemptLog.push({
          keyIndex: keyIdx,
          keyMasked: apiKey.length > 8 ? apiKey.slice(0, 6) + "..." + apiKey.slice(-4) : "***",
          ok: false,
          latencyMs,
          status: statusCode,
          error: errMsg,
        });
      }
      return new Response(details, {
        status: response.status,
        headers: response.headers,
      });
    } catch (err) {
      latencyMs = Date.now() - start;
      clearTimeout(timeout);
      const isAbort = (err as { name?: string }).name === "AbortError";
      errMsg = isAbort
        ? `TIMEOUT after ${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : String(err);
      console.warn(
        `[Gemini Key Failover] Rank #${attempt + 1} (${apiKey.slice(0, 6)}...) ${isAbort ? `timed out ${latencyMs}ms` : "network failure"}. Trying next key.`
      );
      recordKeyResult(apiKey, latencyMs, false);
      if (attemptLog) {
        attemptLog.push({
          keyIndex: keyIdx,
          keyMasked: apiKey.length > 8 ? apiKey.slice(0, 6) + "..." + apiKey.slice(-4) : "***",
          ok: false,
          latencyMs,
          error: errMsg,
        });
      }
    }
  }

  if (lastResponse) {
    return new Response(lastErrorDetails, {
      status: lastResponse.status,
      headers: lastResponse.headers,
    });
  }

  throw new Error("[Gemini] All API keys exhausted or network failed.");
}

export async function createGeminiChatStream(
  messages: ChatMessageInput[],
  systemPrompt: string,
  opts?: { timeoutMs?: number; attemptLog?: GeminiPostAttempt[] }
): Promise<AsyncGenerator<string>> {
  const response = await postGeminiJson(
    "streamGenerateContent?alt=sse",
    {
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: mapMessagesToGeminiContents(messages),
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 2048,
      },
    },
    opts
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `[Gemini] Request failed with status ${response.status}: ${details || "Unknown error"}`
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("[Gemini] Response body is not readable.");
  }

  return (async function* () {
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      let separatorIndex = buffer.indexOf("\n\n");
      while (separatorIndex !== -1) {
        const eventBlock = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        const dataLines = eventBlock
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .filter(Boolean);

        if (dataLines.length > 0) {
          const data = dataLines.join("\n");
          if (data !== "[DONE]") {
            try {
              const payload = JSON.parse(data) as unknown;
              const text = extractTextFromGeminiPayload(payload);
              if (text.length > 0) {
                yield text;
              }
            } catch (error) {
              console.warn(
                "[Gemini] Failed to parse SSE chunk:",
                error instanceof Error ? error.message : String(error)
              );
            }
          }
        }

        separatorIndex = buffer.indexOf("\n\n");
      }

      if (done) {
        const remaining = buffer.trim();
        if (remaining.startsWith("data:")) {
          try {
            const data = remaining
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim())
              .join("\n");

            if (data && data !== "[DONE]") {
              const payload = JSON.parse(data) as unknown;
              const text = extractTextFromGeminiPayload(payload);
              if (text.length > 0) {
                yield text;
              }
            }
          } catch (error) {
            console.warn(
              "[Gemini] Failed to parse trailing SSE chunk:",
              error instanceof Error ? error.message : String(error)
            );
          }
        }
        break;
      }
    }
  })();
}

export async function generateGeminiMemorySummary(prompt: string) {
  const response = await postGeminiJson("generateContent", {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 220,
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `[Gemini] Memory summary request failed with status ${response.status}: ${details || "Unknown error"}`
    );
  }

  const payload = (await response.json()) as unknown;
  return extractTextFromGeminiPayload(payload).trim();
}
