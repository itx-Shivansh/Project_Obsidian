import Groq from "groq-sdk";

const groqApiKey = process.env.GROQ_API_KEY;

if (!groqApiKey) {
  console.warn(
    "[Groq] Warning: GROQ_API_KEY is not set in environment variables. API calls will fail."
  );
}

export const groq = new Groq({
  apiKey: groqApiKey,
});

export interface ChatMessageInput {
  role: string;
  content: string;
}

export async function createGroqChatStream(
  messages: ChatMessageInput[],
  systemPrompt: string,
  modelName: string = "llama-3.3-70b-versatile"
) {
  const fullMessages: ChatMessageInput[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  return groq.chat.completions.create({
    messages: fullMessages as unknown as Groq.Chat.Completions.ChatCompletionMessageParam[],
    model: modelName,
    temperature: 0.8,
    max_tokens: 2048,
    stream: true,
  });
}

export function isGroqRateLimitError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const status = (error as { status?: unknown }).status;
  if (status === 429) return true;

  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && /\b429\b|rate limit/i.test(message);
}

export async function generateGroqMemorySummary(prompt: string): Promise<string> {
  const completion = await groq.chat.completions.create({
    messages: [
      { role: "system", content: "You are a concise memory summary generator." },
      { role: "user", content: prompt },
    ],
    model: "llama-3.3-70b-versatile",
    temperature: 0.2,
    max_tokens: 220,
  });

  return completion.choices[0]?.message?.content?.trim() || "";
}

