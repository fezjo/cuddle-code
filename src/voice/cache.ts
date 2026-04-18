import { Buffer } from "node:buffer";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { Persona, TriggerType } from "../types";

interface CacheIndex {
  version: number;
  entries: Array<{
    trigger: TriggerType;
    persona: Persona;
    text: string;
    file: string;
    blockedReason?: string;
  }>;
}

const INDEX_FILE = "audio-cache/index.json";
const CACHE_VERSION = 1;

export class AudioCache {
  private readonly context: vscode.ExtensionContext;
  private readonly output: vscode.OutputChannel;
  private index: CacheIndex = { version: CACHE_VERSION, entries: [] };
  private loaded = false;

  constructor(context: vscode.ExtensionContext, output: vscode.OutputChannel) {
    this.context = context;
    this.output = output;
  }

  public async get(args: {
    trigger: TriggerType;
    persona: Persona;
    text: string;
  }): Promise<{ indexed: boolean; audio?: Buffer; blockedReason?: string }> {
    await this.load();
    const hit = this.findEntry(args);
    if (!hit) {
      return { indexed: false };
    }

    if (hit.blockedReason) {
      return { indexed: true, blockedReason: hit.blockedReason };
    }

    try {
      return { indexed: true, audio: await fs.readFile(this.absAudioFile(hit.file)) };
    } catch {
      return { indexed: true };
    }
  }

  public async put(args: { trigger: TriggerType; persona: Persona; text: string; audio: Buffer }): Promise<void> {
    await this.load();
    const key = cacheFileName(args);
    await fs.mkdir(this.audioDir(), { recursive: true });
    await fs.writeFile(this.absAudioFile(key), args.audio);

    const existing = this.findEntry(args);
    if (existing) {
      existing.file = key;
      delete existing.blockedReason;
    } else {
      this.index.entries.push({
        trigger: args.trigger,
        persona: args.persona,
        text: args.text,
        file: key
      });
    }

    await this.save();
  }

  public async block(args: {
    trigger: TriggerType;
    persona: Persona;
    text: string;
    reason: string;
  }): Promise<void> {
    await this.load();
    const existing = this.findEntry(args);
    if (existing) {
      existing.blockedReason = args.reason;
    } else {
      this.index.entries.push({
        trigger: args.trigger,
        persona: args.persona,
        text: args.text,
        file: "",
        blockedReason: args.reason
      });
    }
    await this.save();
  }

  public async hasAll(lines: Array<{ trigger: TriggerType; persona: Persona; text: string }>): Promise<boolean> {
    await this.load();
    for (const line of lines) {
      const x = await this.get(line);
      if (!x.audio) {
        return false;
      }
    }
    return true;
  }

  public async preload(
    lines: Array<{ trigger: TriggerType; persona: Persona; text: string }>,
    synthesize: (args: { persona: Persona; text: string }) => Promise<Buffer>,
    onError?: (args: { line: { trigger: TriggerType; persona: Persona; text: string }; error: unknown }) => Promise<void> | void
  ): Promise<{ generated: number; reused: number; retriedBlocked: number; blocked: number; failed: number }> {
    await this.load();

    let generated = 0;
    let reused = 0;
    let retriedBlocked = 0;
    let blocked = 0;
    let failed = 0;

    for (const line of lines) {
      const existing = await this.get(line);
      if (existing.audio) {
        reused += 1;
        continue;
      }

      if (existing.indexed && !existing.blockedReason) {
        reused += 1;
        continue;
      }

      if (existing.blockedReason) {
        retriedBlocked += 1;
      }

      try {
        const audio = await synthesize({ persona: line.persona, text: line.text });
        await this.put({ ...line, audio });
        generated += 1;
      } catch (err) {
        failed += 1;
        if (existing.blockedReason) {
          blocked += 1;
        }
        this.output.appendLine(`[CUDDLE] Preload failed for ${line.trigger}/${line.persona}: ${String(err)}`);
        if (onError) {
          await onError({ line, error: err });
        }
      }
    }

    return { generated, reused, retriedBlocked, blocked, failed };
  }

  public async clear(): Promise<void> {
    await fs.rm(this.audioDir(), { recursive: true, force: true });
    this.index = { version: CACHE_VERSION, entries: [] };
    this.loaded = true;
    await this.save();
  }

  public async stats(
    lines: Array<{ trigger: TriggerType; persona: Persona; text: string }>
  ): Promise<{ total: number; cached: number; blocked: number; missing: number }> {
    await this.load();
    let cached = 0;
    let blocked = 0;

    for (const line of lines) {
      const x = await this.get(line);
      if (x.indexed) {
        if (x.blockedReason) {
          blocked += 1;
        } else {
          cached += 1;
        }
      }
    }

    const total = lines.length;
    return {
      total,
      cached,
      blocked,
      missing: total - cached - blocked
    };
  }

  private async load(): Promise<void> {
    if (this.loaded) {
      return;
    }

    const abs = this.absIndex();
    try {
      const raw = await fs.readFile(abs, "utf8");
      const parsed = JSON.parse(raw) as CacheIndex;
      if (parsed.version === CACHE_VERSION && Array.isArray(parsed.entries)) {
        this.index = parsed;
      }
    } catch {
      await fs.mkdir(this.audioDir(), { recursive: true });
      await this.save();
    }
    this.loaded = true;
  }

  private async save(): Promise<void> {
    await fs.mkdir(this.audioDir(), { recursive: true });
    await fs.writeFile(this.absIndex(), JSON.stringify(this.index, null, 2), "utf8");
  }

  private audioDir(): string {
    return join(this.context.globalStorageUri.fsPath, "audio-cache");
  }

  private absIndex(): string {
    return join(this.context.globalStorageUri.fsPath, INDEX_FILE);
  }

  private absAudioFile(file: string): string {
    return join(this.audioDir(), file);
  }

  private findEntry(args: { trigger: TriggerType; persona: Persona; text: string }): CacheIndex["entries"][number] | undefined {
    return this.index.entries.find((x) => x.trigger === args.trigger && x.persona === args.persona && x.text === args.text);
  }
}

function cacheFileName(args: { trigger: TriggerType; persona: Persona; text: string }): string {
  return `${simpleHash(`${args.trigger}|${args.persona}|${args.text}`)}.mp3`;
}

function simpleHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return (h >>> 0).toString(16);
}
