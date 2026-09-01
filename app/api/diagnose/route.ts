import { NextResponse } from "next/server";
import { getRankedGeminiApiKeys } from "@/lib/gemini";
import { getRankedGroqApiKeys } from "@/lib/groq";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = "gemini-3.6-flash";

function maskKey(key: string): string {
  if (key.length <= 8) return "***";
  return key.slice(0, 6) + "..." + key.slice(-4);
}

async function testGeminiKey(apiKey: string, timeoutMs = 10000): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
  latencyMs?: number;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const res = await fetch(
      `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: "Say ok in one word." }],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 4,
          },
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);
    const latencyMs = Date.now() - start;

    if (res.ok) {
      return { ok: true, status: res.status, latencyMs };
    }

    const text = await res.text().catch(() => "");
    const isQuotaOr429 =
      res.status === 429 || /quota|429|RESOURCE_EXHAUSTED/i.test(text);
    const snippet = text.slice(0, 200);
    return {
      ok: false,
      status: res.status,
      error: isQuotaOr429
        ? `QUOTA/429 — ${snippet || "Rate limited"}`
        : `HTTP ${res.status} — ${snippet || res.statusText}`,
      latencyMs,
    };
  } catch (err) {
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    if ((err as { name?: string }).name === "AbortError") {
      return { ok: false, error: `TIMEOUT after ${timeoutMs}ms`, latencyMs };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs,
    };
  }
}

async function testGroqKey(apiKey: string, timeoutMs = 10000): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
  latencyMs?: number;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "groq/compound-mini",
        messages: [{ role: "user", content: "Say ok in one word." }],
        temperature: 0,
        max_tokens: 4,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const latencyMs = Date.now() - start;

    if (res.ok) {
      return { ok: true, status: res.status, latencyMs };
    }

    const text = await res.text().catch(() => "");
    const isQuotaOr429 =
      res.status === 429 || /quota|429|rate.?limit/i.test(text);
    const snippet = text.slice(0, 200);
    return {
      ok: false,
      status: res.status,
      error: isQuotaOr429
        ? `QUOTA/429 — ${snippet || "Rate limited"}`
        : `HTTP ${res.status} — ${snippet || res.statusText}`,
      latencyMs,
    };
  } catch (err) {
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    if ((err as { name?: string }).name === "AbortError") {
      return { ok: false, error: `TIMEOUT after ${timeoutMs}ms`, latencyMs };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs,
    };
  }
}

function getAllGeminiKeys(): { name: string; key: string }[] {
  const out: { name: string; key: string }[] = [];

  if (process.env.GEMINI_API_KEYS) {
    const split = process.env.GEMINI_API_KEYS.split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    split.forEach((k, i) => out.push({ name: `GEMINI_API_KEYS[${i}]`, key: k }));
  }

  if (process.env.GEMINI_API_KEY) {
    out.push({ name: "GEMINI_API_KEY", key: process.env.GEMINI_API_KEY.trim() });
  }

  for (let i = 2; i <= 10; i++) {
    const envKey = process.env[`GEMINI_API_KEY_${i}`];
    if (envKey) {
      out.push({ name: `GEMINI_API_KEY_${i}`, key: envKey.trim() });
    }
  }

  const seen = new Set<string>();
  return out.filter(({ key }) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getAllGroqKeys(): { name: string; key: string }[] {
  const out: { name: string; key: string }[] = [];

  if (process.env.GROQ_API_KEYS) {
    const split = process.env.GROQ_API_KEYS.split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    split.forEach((k, i) => out.push({ name: `GROQ_API_KEYS[${i}]`, key: k }));
  }

  if (process.env.GROQ_API_KEY) {
    out.push({ name: "GROQ_API_KEY", key: process.env.GROQ_API_KEY.trim() });
  }

  for (let i = 2; i <= 10; i++) {
    const envKey = process.env[`GROQ_API_KEY_${i}`];
    if (envKey) {
      out.push({ name: `GROQ_API_KEY_${i}`, key: envKey.trim() });
    }
  }

  const seen = new Set<string>();
  return out.filter(({ key }) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function GET() {
  const geminiKeys = getAllGeminiKeys();
  const groqKeys = getAllGroqKeys();

  const rankedGemini = getRankedGeminiApiKeys();
  const rankedGroq = getRankedGroqApiKeys();

  const geminiResults = await Promise.all(
    geminiKeys.map(async (k) => {
      const rankInfo = rankedGemini.find((r) => r.key === k.key);
      return {
        name: k.name,
        masked: maskKey(k.key),
        health: rankInfo
          ? {
              rankScore: Math.round(rankInfo.rank),
              avgLatencyMs: rankInfo.avgLatencyMs
                ? Math.round(rankInfo.avgLatencyMs)
                : null,
              recentFailures: rankInfo.recentFailures,
              isUntried: rankInfo.isUntried,
            }
          : null,
        ...(await testGeminiKey(k.key, 4500)),
      };
    })
  );

  const groqResults = await Promise.all(
    groqKeys.map(async (k) => {
      const rankInfo = rankedGroq.find((r) => r.key === k.key);
      return {
        name: k.name,
        masked: maskKey(k.key),
        health: rankInfo
          ? {
              rankScore: Math.round(rankInfo.rank),
              avgLatencyMs: rankInfo.avgLatencyMs
                ? Math.round(rankInfo.avgLatencyMs)
                : null,
              recentFailures: rankInfo.recentFailures,
              isUntried: rankInfo.isUntried,
            }
          : null,
        ...(await testGroqKey(k.key, 4500)),
      };
    })
  );

  const anyGeminiWorking = geminiResults.some((r) => r.ok);
  const anyGroqWorking = groqResults.some((r) => r.ok);

  const fastestGemini = [...geminiResults]
    .filter((r) => r.ok)
    .sort((a, b) => (a.latencyMs ?? 99999) - (b.latencyMs ?? 99999))[0];
  const fastestGroq = [...groqResults]
    .filter((r) => r.ok)
    .sort((a, b) => (a.latencyMs ?? 99999) - (b.latencyMs ?? 99999))[0];

  let effectiveLayer: string;
  if (anyGeminiWorking) {
    const ms = fastestGemini?.latencyMs ?? "?";
    effectiveLayer =
      `LAYER 1 ACTIVE — Gemini 3.6 Flash wins (fastest key ${ms}ms). ` +
      `Keys ranked fastest-first; 3.5s per-key timeout; 5.2s total L1 budget; + Groq hedge after 2.2s.`;
  } else if (anyGroqWorking) {
    const ms = fastestGroq?.latencyMs ?? "?";
    effectiveLayer =
      `LAYER 2+ ACTIVE — Gemini FAILED → Groq active (fastest key ${ms}ms). ` +
      `Speculative hedge after 2.2s + total L1 budget 5.2s prevent long waits.`;
  } else {
    effectiveLayer = "ALL LAYERS DOWN — every provider key is failing";
  }

  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      effectiveLayer,
      optimizationsActive: {
        perKeyTimeout: "Gemini 3.5s / Groq 4s per fetch — no more 10s hangs",
        fastestKeyFirst:
          "Keys are sorted by rolling-avg latency + failure penalty (last 4 samples)",
        speculativeHedge:
          "If Gemini first-token > 2.2s → Groq Compound starts IN PARALLEL and wins the race",
        totalLayerBudget:
          "Gemini Layer 1 hard capped at 5.2s total → then escalate, no infinite waits",
        firstTokenMetrics:
          "Server console logs first-chunk latency per layer for debugging",
      },
      summary: {
        gemini: {
          total: geminiResults.length,
          working: geminiResults.filter((r) => r.ok).length,
          failing: geminiResults.filter((r) => !r.ok).length,
          fastestLatencyMs: fastestGemini?.latencyMs ?? null,
        },
        groq: {
          total: groqResults.length,
          working: groqResults.filter((r) => r.ok).length,
          failing: groqResults.filter((r) => !r.ok).length,
          fastestLatencyMs: fastestGroq?.latencyMs ?? null,
        },
      },
      geminiKeys: geminiResults,
      groqKeys: groqResults,
      rankedOrder: {
        geminiFirstTryOrder: rankedGemini.map((r, i) => ({
          priority: i + 1,
          masked: maskKey(r.key),
          rankScore: Math.round(r.rank),
          avgLatencyMs: r.avgLatencyMs ? Math.round(r.avgLatencyMs) : null,
          recentFailures: r.recentFailures,
        })),
        groqFirstTryOrder: rankedGroq.map((r, i) => ({
          priority: i + 1,
          masked: maskKey(r.key),
          rankScore: Math.round(r.rank),
          avgLatencyMs: r.avgLatencyMs ? Math.round(r.avgLatencyMs) : null,
          recentFailures: r.recentFailures,
        })),
      },
      note: "Open the Obsidian dev server terminal during real chat traffic to see [Stream Engine] logs (won/lost layer, hedge trigger, first-chunk ms, timeout escalations) in real time.",
    },
    { status: 200 }
  );
}
