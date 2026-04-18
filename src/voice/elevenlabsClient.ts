import { Buffer } from "node:buffer";

const FEMALE_VOICE_ID = "j05EIz3iI3JmBTWC3CsA";
const MALE_VOICE_ID = "HgyIHe81F3nXywNwkraY";

export class ElevenLabsApiError extends Error {
  public readonly status: number;
  public readonly code?: string;

  constructor(args: { status: number; message: string; code?: string }) {
    super(args.message);
    this.name = "ElevenLabsApiError";
    this.status = args.status;
    this.code = args.code;
  }
}

export async function synthesizeWithElevenLabs(args: {
  apiKey: string;
  persona: "female" | "male";
  text: string;
}): Promise<Buffer> {
  const voiceId = args.persona === "female" ? FEMALE_VOICE_ID : MALE_VOICE_ID;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": args.apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg"
    },
    body: JSON.stringify({
      text: args.text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
        style: 0.25,
        use_speaker_boost: true
      }
    })
  });

  if (!res.ok) {
    const body = await safeText(res);
    const code = parseCode(body);
    throw new ElevenLabsApiError({
      status: res.status,
      code,
      message: `ElevenLabs error ${res.status}: ${body}`
    });
  }

  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no-body>";
  }
}

function parseCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { detail?: { code?: string } };
    return parsed.detail?.code;
  } catch {
    return undefined;
  }
}
