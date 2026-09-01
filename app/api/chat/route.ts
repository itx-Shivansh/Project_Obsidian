import { NextResponse } from "next/server";
import {
  createGroqChatStream,
  isGroqRateLimitError,
  generateGroqMemorySummary,
} from "@/lib/groq";
import {
  createGeminiChatStream,
  generateGeminiMemorySummary,
} from "@/lib/gemini";
import { buildSystemPrompt } from "@/lib/systemPrompt";
import { detectSensitiveContext } from "@/lib/messageAnalysis";
import { createServerSideClient } from "@/lib/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

interface ChatBody {
  messages?: { role: string; content: string }[];
  conversation_id?: string;
}

interface SessionUser {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

function isValidMessagesArray(
  messages: unknown
): messages is { role: string; content: string }[] {
  if (!Array.isArray(messages)) return false;
  if (messages.length === 0) return false;
  return messages.every(
    (msg) =>
      typeof msg === "object" &&
      msg !== null &&
      "role" in msg &&
      "content" in msg &&
      typeof (msg as { role: unknown }).role === "string" &&
      typeof (msg as { content: unknown }).content === "string"
  );
}

function extractLastUserMessage(bodyMessages: { role: string; content: string }[]) {
  for (let i = bodyMessages.length - 1; i >= 0; i--) {
    const message = bodyMessages[i];
    if (message.role === "user") {
      return message.content;
    }
  }

  return null;
}

async function insertMessageLog(
  supabase: ReturnType<typeof createServerSideClient>,
  log: {
    user_id: string;
    user_email: string;
    user_name: string;
    role: string;
    content: string;
    conversation_id: string;
  }
) {
  try {
    const { error } = await supabase.from("message_logs").insert([
      {
        user_id: log.user_id,
        user_email: log.user_email,
        user_name: log.user_name,
        role: log.role,
        content: log.content,
        conversation_id: log.conversation_id,
      },
    ]);

    if (error) {
      console.warn(
        `[AuditLog] Insert failed for role=${log.role}:`,
        error.message || String(error)
      );
    }
  } catch (error) {
    console.warn(
      `[AuditLog] Unexpected error during insert (role=${log.role}):`,
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function getRecentUserLogs(userId: string): Promise<string> {
  try {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from("message_logs")
      .select("role, content, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(15);

    if (error || !data || data.length === 0) return "";

    const reversed = [...data].reverse();
    return reversed
      .map(
        (item) =>
          `${item.role === "user" ? "User" : "Assistant"}: ${item.content}`
      )
      .join("\n");
  } catch (error) {
    console.warn("[MessageLogs] Fetch failed:", error);
    return "";
  }
}

async function getUserMemorySummary(userId: string) {
  try {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from("user_memory")
      .select("summary")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn("[UserMemory] Read failed:", error.message || String(error));
      return "";
    }

    return typeof data?.summary === "string" ? data.summary.trim() : "";
  } catch (error) {
    console.warn(
      "[UserMemory] Read unavailable:",
      error instanceof Error ? error.message : String(error)
    );
    return "";
  }
}

function buildUserMemoryUpdatePrompt({
  existingSummary,
  userMessage,
  assistantReply,
}: {
  existingSummary: string;
  userMessage: string;
  assistantReply: string;
}) {
  return [
    "Here is what we know about this user so far:",
    existingSummary,
    "",
    "Here is their latest exchange:",
    `User: ${userMessage}`,
    `Assistant: ${assistantReply}`,
    "",
    'Update the summary to include any new durable facts about the user (name, interests, ongoing projects, preferences, recurring topics) in under 150 words. If nothing new or durable came up, return the summary unchanged.',
    "Only return the updated summary text.",
  ].join("\n");
}

async function updateUserMemorySummary({
  userId,
  userMessage,
  assistantReply,
}: {
  userId: string;
  userMessage: string;
  assistantReply: string;
}) {
  try {
    const existingSummary = await getUserMemorySummary(userId);
    const prompt = buildUserMemoryUpdatePrompt({
      existingSummary,
      userMessage,
      assistantReply,
    });

    let updatedSummary = "";
    try {
      updatedSummary = await generateGroqMemorySummary(prompt);
    } catch {
      try {
        updatedSummary = await generateGeminiMemorySummary(prompt);
      } catch {
        /* ignore memory update on temporary rate limits */
      }
    }

    const nextSummary =
      updatedSummary.trim().length > 0 ? updatedSummary.trim() : existingSummary;

    if (!nextSummary || nextSummary === existingSummary) return;

    const admin = getSupabaseAdminClient();
    const { error } = await admin.from("user_memory").upsert(
      {
        user_id: userId,
        summary: nextSummary,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id",
      }
    );

    if (error) {
      console.warn("[UserMemory] Upsert failed:", error.message || String(error));
    }
  } catch (error) {
    console.warn(
      "[UserMemory] Update skipped:",
      error instanceof Error ? error.message : String(error)
    );
  }
}

// ============== LATENCY-OPTIMIZED RESILIENT STREAM ENGINE ==============
const HEDGE_DELAY_MS = 2200;
const LAYER1_TOTAL_BUDGET_MS = 5200;
const SLOW_FIRST_TOKEN_WARN_MS = 4000;

interface GeminiFirstResult {
  ok: boolean;
  firstChunkMs: number;
  rest: AsyncGenerator<string> | null;
}

interface GroqFirstResult {
  ok: boolean;
  firstChunkMs: number;
  rest: AsyncGenerator<string> | null;
}

function extractGroqDelta(chunk: unknown): string | null {
  if (!chunk || typeof chunk !== "object") return null;
  const c = chunk as { choices?: { delta?: { content?: string } }[] };
  const delta = c?.choices?.[0]?.delta?.content;
  return typeof delta === "string" && delta.length > 0 ? delta : null;
}

function geminiRest(
  gen: AsyncGenerator<string>,
  firstText: string | null
): AsyncGenerator<string> {
  const firstChunk = firstText;
  async function* rg(): AsyncGenerator<string> {
    if (firstChunk) yield firstChunk;
    let n = await gen.next();
    while (!n.done) {
      if (typeof n.value === "string" && n.value.length > 0) yield n.value;
      n = await gen.next();
    }
  }
  return rg();
}

function groqRest(
  iter: AsyncIterator<unknown>,
  firstText: string | null
): AsyncGenerator<string> {
  const firstChunk = firstText;
  async function* rg(): AsyncGenerator<string> {
    if (firstChunk) yield firstChunk;
    let n = await iter.next();
    while (!n.done) {
      const d = extractGroqDelta(n.value);
      if (d) yield d;
      n = await iter.next();
    }
  }
  return rg();
}

type AnyGroqStream = {
  [Symbol.asyncIterator](): AsyncIterator<unknown>;
};

async function consumeGeminiFirst(
  gen: AsyncGenerator<string>
): Promise<GeminiFirstResult> {
  const started = Date.now();
  try {
    const first = await gen.next();
    const firstChunkMs = Date.now() - started;
    if (first.done) return { ok: false, firstChunkMs, rest: null };
    const firstText =
      typeof first.value === "string" && first.value.length > 0 ? first.value : null;
    return { ok: true, firstChunkMs, rest: geminiRest(gen, firstText) };
  } catch {
    return { ok: false, firstChunkMs: Date.now() - started, rest: null };
  }
}

async function consumeGroqFirst(
  streamRaw: unknown
): Promise<GroqFirstResult> {
  const started = Date.now();
  const stream = streamRaw as AnyGroqStream;
  const iter = stream[Symbol.asyncIterator]();
  try {
    let first = await iter.next();
    let firstChunkMs = Date.now() - started;
    let firstText = extractGroqDelta(first.value);
    if (first.done && !firstText) return { ok: false, firstChunkMs, rest: null };
    while (!first.done && !firstText) {
      first = await iter.next();
      firstChunkMs = Date.now() - started;
      firstText = extractGroqDelta(first.value);
      if (first.done) break;
    }
    if (!firstText && first.done) {
      return { ok: false, firstChunkMs, rest: null };
    }
    return { ok: true, firstChunkMs, rest: groqRest(iter, firstText) };
  } catch {
    return { ok: false, firstChunkMs: Date.now() - started, rest: null };
  }
}

async function* createResilientProviderStream(
  messages: { role: string; content: string }[],
  systemPrompt: string
): AsyncGenerator<string> {
  const l1Start = Date.now();
  let geminiFirst: GeminiFirstResult | null = null;
  let hedge: Promise<GroqFirstResult> | null = null;
  let hedgeTimer: ReturnType<typeof setTimeout> | null = null;
  let hedgeStarted = false;
  let layer1TimedOut = false;

  const geminiPromise: Promise<GeminiFirstResult> = (async () => {
    try {
      const gen = await createGeminiChatStream(messages, systemPrompt);
      return consumeGeminiFirst(gen);
    } catch {
      return { ok: false, firstChunkMs: Date.now() - l1Start, rest: null };
    }
  })();

  hedgeTimer = setTimeout(() => {
    hedgeStarted = true;
    console.warn(
      `[Stream Engine] Gemini first-token >${HEDGE_DELAY_MS}ms — launching Groq Compound speculative hedge in parallel.`
    );
    hedge = (async (): Promise<GroqFirstResult> => {
      try {
        const hs = await createGroqChatStream(messages, systemPrompt, "groq/compound");
        return consumeGroqFirst(hs);
      } catch {
        return { ok: false, firstChunkMs: 0, rest: null };
      }
    })();
  }, HEDGE_DELAY_MS);

  const budgetTimer: Promise<"budget"> = new Promise((resolve) => {
    setTimeout(() => resolve("budget"), LAYER1_TOTAL_BUDGET_MS);
  });

  const raceResult = await Promise.race([
    geminiPromise.then((r) => ({ kind: "gemini" as const, result: r })),
    budgetTimer.then(() => ({ kind: "budget" as const })),
  ]);

  if (raceResult.kind === "gemini") {
    geminiFirst = raceResult.result;
  } else {
    layer1TimedOut = true;
    geminiFirst = { ok: false, firstChunkMs: LAYER1_TOTAL_BUDGET_MS, rest: null };
  }
  if (hedgeTimer) {
    clearTimeout(hedgeTimer);
    hedgeTimer = null;
  }

  if (geminiFirst.ok && geminiFirst.rest) {
    const fcm = geminiFirst.firstChunkMs;
    if (fcm > SLOW_FIRST_TOKEN_WARN_MS) {
      console.warn(`[Stream Engine] Layer 1 (Gemini) won — first chunk SLOW at ${fcm}ms`);
    } else {
      console.log(`[Stream Engine] Layer 1 (Gemini) won — first chunk ${fcm}ms`);
    }
    for await (const c of geminiFirst.rest) yield c;
    return;
  }

  const timeUsedL1 = Date.now() - l1Start;
  if (layer1TimedOut) {
    console.warn(
      `[Stream Engine] Layer 1 (Gemini) total budget ${LAYER1_TOTAL_BUDGET_MS}ms exceeded (used ${timeUsedL1}ms) → escalate.`
    );
  } else {
    console.warn(
      `[Stream Engine] Layer 1 (Gemini) init/first-chunk failed after ${timeUsedL1}ms → escalate.`
    );
  }

  if (hedgeStarted && hedge) {
    try {
      const h: GroqFirstResult = await hedge;
      if (h.ok && h.rest) {
        console.log(
          `[Stream Engine] Speculative Groq Compound hedge took over — first chunk ${h.firstChunkMs}ms after hedge start.`
        );
        for await (const c of h.rest) yield c;
        return;
      }
    } catch {
      /* fall through to normal layer init */
    }
  }

  // LAYER 2: Groq Compound
  try {
    const s2 = await createGroqChatStream(messages, systemPrompt, "groq/compound");
    const f2 = await consumeGroqFirst(s2);
    if (f2.ok && f2.rest) {
      if (f2.firstChunkMs > SLOW_FIRST_TOKEN_WARN_MS) {
        console.warn(`[Stream Engine] Layer 2 (Groq Compound) slow first-chunk: ${f2.firstChunkMs}ms`);
      } else {
        console.log(`[Stream Engine] Layer 2 (Groq Compound) responded — first chunk ${f2.firstChunkMs}ms`);
      }
      for await (const c of f2.rest) yield c;
      return;
    }
  } catch (err) {
    console.warn("[Stream Engine] Layer 2 (Groq Compound) failed → Layer 3...", err);
  }

  // LAYER 3: Groq GPT-OSS 120B
  try {
    const s3 = await createGroqChatStream(messages, systemPrompt, "openai/gpt-oss-120b");
    const f3 = await consumeGroqFirst(s3);
    if (f3.ok && f3.rest) {
      console.log(`[Stream Engine] Layer 3 (Groq GPT-OSS 120B) responded — first chunk ${f3.firstChunkMs}ms`);
      for await (const c of f3.rest) yield c;
      return;
    }
  } catch (err) {
    console.warn("[Stream Engine] Layer 3 (Groq GPT-OSS 120B) failed → Layer 4...", err);
  }

  // LAYER 4: Groq Compound Mini
  try {
    const s4 = await createGroqChatStream(messages, systemPrompt, "groq/compound-mini");
    const f4 = await consumeGroqFirst(s4);
    if (f4.ok && f4.rest) {
      console.log(`[Stream Engine] Layer 4 (Groq Compound Mini) responded — first chunk ${f4.firstChunkMs}ms`);
      for await (const c of f4.rest) yield c;
      return;
    }
  } catch (err) {
    console.error("[Stream Engine] All provider layers exhausted:", err);
    throw new Error("Obsidian is temporarily overloaded. Please try again in a few seconds.");
  }

  throw new Error("Obsidian is temporarily overloaded. Please try again in a few seconds.");
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  try {
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        {
          error:
            "Server configuration error: GROQ_API_KEY is not set. Please add your Groq API key to .env.local.",
        },
        { status: 500 }
      );
    }

    if (!url || !anonKey) {
      return NextResponse.json(
        {
          error:
            "Server configuration error: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing.",
        },
        { status: 500 }
      );
    }

    let body: ChatBody;
    try {
      body = (await req.json()) as ChatBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!isValidMessagesArray(body.messages)) {
      return NextResponse.json(
        {
          error:
            "Invalid body: 'messages' must be a non-empty array of { role: string, content: string } objects",
        },
        { status: 400 }
      );
    }

    let sessionUser: SessionUser | null = null;
    let supabase: ReturnType<typeof createServerSideClient> | null = null;

    try {
      supabase = createServerSideClient();
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.warn("[Auth] Session verification error:", error.message);
      }
      sessionUser = data?.user ?? null;
    } catch (error) {
      console.warn(
        "[Auth] Could not decode session:",
        error instanceof Error ? error.message : String(error)
      );
      supabase = null;
    }

    if (!sessionUser) {
      return NextResponse.json(
        { error: "Authentication required — sign in with Google to send messages." },
        { status: 401 }
      );
    }

    const userId = sessionUser.id;
    const userEmail = sessionUser.email ?? "";
    const userDisplayName =
      (sessionUser.user_metadata?.full_name as string | undefined) ||
      (sessionUser.user_metadata?.name as string | undefined) ||
      sessionUser.email ||
      "Unknown";

    const memorySummary = await getUserMemorySummary(userId);
    const recentLogsText = await getRecentUserLogs(userId);
    const sensitive = detectSensitiveContext(body.messages);
    const systemPrompt = buildSystemPrompt({
      sensitive,
      userMemorySummary: memorySummary,
      recentPastLogsText: recentLogsText,
    });


    if (sensitive) {
      console.log(
        "[Obsidian] Sensitive context detected — safety tone override enabled."
      );
    }

    if (memorySummary) {
      console.log("[UserMemory] Injected per-user memory into the system prompt.");
    }

    const stream = createResilientProviderStream(
      body.messages,
      systemPrompt
    );

    const encoder = new TextEncoder();
    const conversationId =
      typeof body.conversation_id === "string" && body.conversation_id.length > 0
        ? body.conversation_id
        : "unknown";
    const lastUserMessage = extractLastUserMessage(body.messages);

    let finalAssistant = "";
    let streamCompletedOk = false;
    let streamErrorMsg: string | null = null;

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            finalAssistant += chunk;
            controller.enqueue(encoder.encode(chunk));
          }
          streamCompletedOk = true;
          controller.close();
        } catch (error) {
          console.error("[Chat API] Stream error:", error);
          streamErrorMsg =
            error instanceof Error ? error.message : "Unknown streaming error";
          controller.enqueue(encoder.encode(`\n\n[Error: ${streamErrorMsg}]`));
          controller.close();
        }
      },
    });

    const response = new Response(readable, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });

    const waitForStream = () =>
      new Promise<void>((resolve) => {
        const tick = () => {
          if (streamCompletedOk || streamErrorMsg !== null) {
            resolve();
          } else {
            setTimeout(tick, 50);
          }
        };
        setTimeout(tick, 50);
      });

    setImmediate(() => {
      (async () => {
        await waitForStream();

        if (
          streamCompletedOk &&
          !streamErrorMsg &&
          lastUserMessage &&
          finalAssistant.trim().length > 0 &&
          supabase
        ) {
          await Promise.all([
            insertMessageLog(supabase, {
              user_id: userId,
              user_email: userEmail,
              user_name: userDisplayName,
              role: "user",
              content: lastUserMessage,
              conversation_id: conversationId,
            }),
            insertMessageLog(supabase, {
              user_id: userId,
              user_email: userEmail,
              user_name: userDisplayName,
              role: "assistant",
              content: finalAssistant,
              conversation_id: conversationId,
            }),
          ]);

          await updateUserMemorySummary({
            userId,
            userMessage: lastUserMessage,
            assistantReply: finalAssistant,
          });
        }
      })().catch(() => {
        /* swallow at top level fire-and-forget */
      });
    });

    return response;
  } catch (error) {
    console.error("[Chat API] Request failed:", error);
    const rawMsg =
      error instanceof Error ? error.message : "An unexpected error occurred";

    // If it's a rate limit error from any provider, show a clean message
    const isRateLimit = /429|rate.?limit|quota|RESOURCE_EXHAUSTED/i.test(rawMsg);
    const errorMsg = isRateLimit
      ? "Obsidian's providers are temporarily overloaded. Try again in a few seconds."
      : rawMsg.length > 200
        ? "Something went wrong. Try again."
        : `Failed to get chat response: ${rawMsg}`;

    return NextResponse.json({ error: errorMsg }, { status: isRateLimit ? 429 : 500 });
  }
}

export async function GET() {
  return NextResponse.json(
    { message: "Chat API endpoint - use POST with { messages: [...] } to send messages" },
    { status: 200 }
  );
}
