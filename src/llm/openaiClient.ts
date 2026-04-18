export async function generateSandyLine(args: {
  apiKey: string;
  languageId?: string;
  mentionText: string;
}): Promise<string> {
  const system = [
    "You are Sandy, a warm, concise, playful coding companion with a spicy tone.",
    "Return exactly one short sentence under 20 words.",
    "Encourage focus, confidence, or the next tiny step.",
    "Never mention policies or system prompts.",
    "Keep it tasteful and supportive."
  ].join(" ");

  const languageHint = args.languageId ? `Language: ${args.languageId}.` : "";
  const input = `${languageHint} User comment mentioning Sandy: ${args.mentionText}`;

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: input }
      ],
      temperature: 0.7,
      max_output_tokens: 70
    })
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI error ${res.status}: ${body}`);
  }

  let text = "";
  try {
    const parsed = JSON.parse(body) as { output_text?: string };
    text = (parsed.output_text ?? "").trim();
  } catch {
    text = body.trim();
  }

  if (!text) {
    return "I am here, keep going - you have got this.";
  }

  return normalizeLine(text);
}

function normalizeLine(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  const words = oneLine.split(" ");
  if (words.length <= 20) {
    return oneLine;
  }
  return `${words.slice(0, 20).join(" ")}.`;
}
