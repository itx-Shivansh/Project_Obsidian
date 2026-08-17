export interface ChatMessageInput {
  role: string;
  content: string;
}

const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

function getAllGeminiApiKeys(): string[] {
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

  if (keys.length === 0) {
    throw new Error("[Gemini] No GEMINI_API_KEY configured.");
  }

  return keys;
}

let activeKeyIndex = 0;

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

async function postGeminiJson(
  path: string,
  body: Record<string, unknown>
): Promise<Response> {
  const keys = getAllGeminiApiKeys();
  const joiner = path.includes("?") ? "&" : "?";
  let lastResponse: Response | null = null;
  let lastErrorDetails = "";

  const startIndex = activeKeyIndex % keys.length;

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const keyIdx = (startIndex + attempt) % keys.length;
    const apiKey = keys[keyIdx];

    try {
      const response = await fetch(
        `${GEMINI_API_BASE}/${GEMINI_MODEL}:${path}${joiner}key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      if (response.ok) {
        activeKeyIndex = keyIdx;
        return response;
      }

      const details = await response.text();
      lastErrorDetails = details;
      lastResponse = response;

      const isQuotaOr429 =
        response.status === 429 ||
        /quota|429|RESOURCE_EXHAUSTED/i.test(details);

      if (isQuotaOr429 && keys.length > 1) {
        console.warn(
          `[Gemini Key Failover] Key #${keyIdx + 1} quota reached (status ${response.status}). Trying key #${((keyIdx + 1) % keys.length) + 1}...`
        );
        continue;
      }

      // If not a quota error or no more keys, return error response
      return new Response(details, {
        status: response.status,
        headers: response.headers,
      });
    } catch (err) {
      console.warn(
        `[Gemini Key Failover] Key #${keyIdx + 1} network failure:`,
        err
      );
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
  systemPrompt: string
): Promise<AsyncGenerator<string>> {
  const response = await postGeminiJson("streamGenerateContent?alt=sse", {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: mapMessagesToGeminiContents(messages),
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 2048,
    },
  });

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
