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

let activeGroqKeyIndex = 0;

function getGroqClient(apiKey: string): Groq {
  return new Groq({ apiKey });
}

export const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "",
});

export async function createGroqChatStream(
  messages: ChatMessageInput[],
  systemPrompt: string,
  modelName: string = "groq/compound"
) {
  const keys = getAllGroqApiKeys();
  if (keys.length === 0) {
    throw new Error("[Groq] No GROQ_API_KEY configured.");
  }

  const fullMessages: ChatMessageInput[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  const startIndex = activeGroqKeyIndex % keys.length;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const keyIdx = (startIndex + attempt) % keys.length;
    const apiKey = keys[keyIdx];
    const client = getGroqClient(apiKey);

    try {
      const stream = await client.chat.completions.create({
        messages: fullMessages as unknown as Groq.Chat.Completions.ChatCompletionMessageParam[],
        model: modelName,
        temperature: 0.8,
        max_tokens: 2048,
        stream: true,
      });

      activeGroqKeyIndex = keyIdx;
      return stream;
    } catch (err) {
      lastError = err;
      console.warn(
        `[Groq Key Failover] Key #${keyIdx + 1} error on model ${modelName}:`,
        err instanceof Error ? err.message : String(err)
      );
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
  const keys = getAllGroqApiKeys();
  const models = ["groq/compound", "openai/gpt-oss-120b", "groq/compound-mini"];

  for (const apiKey of keys) {
    const client = getGroqClient(apiKey);
    for (const model of models) {
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

        const content = completion.choices[0]?.message?.content?.trim();
        if (content) return content;
      } catch (err) {
        console.warn(`[Groq] Summary failed on key with model ${model}:`, err);
      }
    }
  }

  return "";
}

