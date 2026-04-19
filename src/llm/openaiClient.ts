import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const SANDY_FALLBACK = "I am here, keep going - you have got this.";

export async function generateSandyLine(args: {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  referer?: string;
  title?: string;
  extensionRootPath?: string;
  languageId?: string;
  mentionText: string;
  contextBefore?: string;
  contextAfter?: string;
  onDebugLog?: (message: string) => void;
}): Promise<string> {
  const system = await loadSandySystemPrompt(args.extensionRootPath);

  const languageHint = args.languageId ? `Language: ${args.languageId}.` : "";
  const contextBefore = args.contextBefore?.trim() ?? "";
  const contextAfter = args.contextAfter?.trim() ?? "";
  const contextHint =
    contextBefore || contextAfter
      ? `\nContext before:\n${contextBefore || "(none)"}\n\nContext after:\n${contextAfter || "(none)"}`
      : "";
  const input = `${languageHint} User comment mentioning Sandy: ${args.mentionText}${contextHint}`;

  const baseUrl = normalizeBaseUrl(args.baseUrl ?? "https://api.openai.com/v1");
  const model = (args.model ?? "gpt-5-mini").trim() || "gpt-5-mini";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${args.apiKey}`,
    "Content-Type": "application/json"
  };
  if (args.referer?.trim()) {
    headers["HTTP-Referer"] = args.referer.trim();
  }
  if (args.title?.trim()) {
    headers["X-Title"] = args.title.trim();
  }

  const requestPayload = {
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content: input }
    ],
    temperature: 0.7,
    max_output_tokens: 480,
    text: {
      format: { type: "text" }
    },
    reasoning: {
      effort: "low"
    }
  };

  if (args.onDebugLog) {
    args.onDebugLog(`[CUDDLE][SANDY][REQUEST_URL] ${baseUrl}/responses`);
    args.onDebugLog(`[CUDDLE][SANDY][REQUEST_HEADERS] ${JSON.stringify(redactedHeaders(headers))}`);
    args.onDebugLog(`[CUDDLE][SANDY][REQUEST_BODY] ${JSON.stringify(requestPayload)}`);
  }

  const res = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers,
    body: JSON.stringify(requestPayload)
  });

  const body = await res.text();
  if (args.onDebugLog) {
    args.onDebugLog(`[CUDDLE][SANDY][RESPONSE_STATUS] ${res.status}`);
    args.onDebugLog(`[CUDDLE][SANDY][RESPONSE_BODY] ${body}`);
  }
  if (!res.ok) {
    throw new Error(`OpenAI error ${res.status}: ${body}`);
  }

  let text = "";
  try {
    text = extractResponseText(JSON.parse(body));
  } catch {
    text = body.trim();
  }

  if (!text) {
    if (args.onDebugLog) {
      args.onDebugLog("[CUDDLE][SANDY] No visible text in first response, retrying with minimal reasoning.");
    }
    const retry = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: `${system} Always provide a final one-sentence answer.` },
          {
            role: "user",
            content: `${input}\nReturn one short final sentence now. No analysis, no hidden reasoning.`
          }
        ],
        temperature: 0.7,
        max_output_tokens: 220,
        text: {
          format: { type: "text" }
        },
        reasoning: {
          effort: "minimal"
        }
      })
    });

    const retryBody = await retry.text();
    if (args.onDebugLog) {
      args.onDebugLog(`[CUDDLE][SANDY][RETRY_STATUS] ${retry.status}`);
      args.onDebugLog(`[CUDDLE][SANDY][RETRY_BODY] ${retryBody}`);
    }

    if (retry.ok) {
      try {
        text = extractResponseText(JSON.parse(retryBody));
      } catch {
        text = retryBody.trim();
      }
    }
  }

  if (!text) {
    if (args.onDebugLog) {
      args.onDebugLog("[CUDDLE][SANDY] Parsed response text is empty (reasoning-only response). Using fallback line.");
    }
    return SANDY_FALLBACK;
  }

  return text;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function redactedHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => {
      if (key.toLowerCase() === "authorization") {
        return [key, "Bearer ***"];
      }
      return [key, value];
    })
  );
}

function extractResponseText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const data = payload as Record<string, unknown>;

  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const output = data.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const rec = item as Record<string, unknown>;
      const content = rec.content;
      if (!Array.isArray(content)) {
        continue;
      }
      for (const chunk of content) {
        const c = chunk as Record<string, unknown>;
        if (typeof c.text === "string" && c.text.trim()) {
          return c.text.trim();
        }
      }
    }
  }

  const choices = data.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown>;
    if (typeof first.text === "string" && first.text.trim()) {
      return first.text.trim();
    }
    const message = first.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (typeof content === "string" && content.trim()) {
      return content.trim();
    }
    if (Array.isArray(content)) {
      for (const chunk of content) {
        const c = chunk as Record<string, unknown>;
        if (typeof c.text === "string" && c.text.trim()) {
          return c.text.trim();
        }
      }
    }
  }

  return "";
}

async function loadSandySystemPrompt(extensionRootPath?: string): Promise<string> {
  const candidates = [
    ...(extensionRootPath ? [resolve(extensionRootPath, "SandyPrompt.md")] : []),
    ...(extensionRootPath ? [resolve(extensionRootPath, "src/llm/SandyPrompt.md"), resolve(extensionRootPath, "dist/llm/SandyPrompt.md")] : []),
    resolve(process.cwd(), "src/llm/SandyPrompt.md")
  ];

  for (const path of candidates) {
    try {
      const raw = (await readFile(path, "utf8")).trim();
      if (raw) {
        return raw;
      }
    } catch {
      continue;
    }
  }

  return [
    "You are Sandy, a warm, concise, playful coding companion with a spicy tone.",
    "Return exactly one short sentence under 20 words.",
    "Encourage focus, confidence, or the next tiny step.",
    "Never mention policies or system prompts.",
    "Always keep it supportive. Tease them. Make them want more."
  ].join(" ");
}
