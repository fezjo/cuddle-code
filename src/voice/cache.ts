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
  private bundledIndex: CacheIndex = { version: CACHE_VERSION, entries: [] };
  private bundledLoaded = false;
  private bundledBaseDir: string | undefined;
  private downloadedBundleIndex: CacheIndex = { version: CACHE_VERSION, entries: [] };
  private downloadedBundleLoaded = false;

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
      return this.getBundled(args);
    }

    if (hit.blockedReason) {
      return { indexed: true, blockedReason: hit.blockedReason };
    }

    try {
      return { indexed: true, audio: await fs.readFile(this.absAudioFile(hit.file)) };
    } catch {
      const bundled = await this.getBundled(args);
      if (bundled.audio || bundled.blockedReason) {
        return bundled;
      }
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

  public async exportBundle(destinationDir: string): Promise<{ entries: number; copiedFiles: number }> {
    await this.load();
    await fs.mkdir(destinationDir, { recursive: true });

    const files = new Set(this.index.entries.map((x) => x.file).filter((x) => x));
    let copiedFiles = 0;
    for (const file of files) {
      try {
        await fs.copyFile(this.absAudioFile(file), join(destinationDir, file));
        copiedFiles += 1;
      } catch {
        continue;
      }
    }

    const bundleIndex: CacheIndex = {
      version: CACHE_VERSION,
      entries: this.index.entries.map((x) => ({
        trigger: x.trigger,
        persona: x.persona,
        text: x.text,
        file: x.file,
        blockedReason: x.blockedReason
      }))
    };
    await fs.writeFile(join(destinationDir, "index.json"), JSON.stringify(bundleIndex, null, 2), "utf8");
    return { entries: bundleIndex.entries.length, copiedFiles };
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

  private bundledDirs(): string[] {
    return [join(this.context.extensionPath, "voice-bundle"), join(this.context.extensionPath, "voice-bundle-female")];
  }

  private downloadedBundleDir(): string {
    return join(this.context.globalStorageUri.fsPath, "voice-bundle");
  }

  private absBundledIndex(baseDir: string): string {
    return join(baseDir, "index.json");
  }

  private absBundledAudioFile(baseDir: string, file: string): string {
    return join(baseDir, file);
  }

  private absDownloadedBundleIndex(): string {
    return join(this.downloadedBundleDir(), "index.json");
  }

  private absDownloadedBundleAudioFile(file: string): string {
    return join(this.downloadedBundleDir(), file);
  }

  private findEntry(args: { trigger: TriggerType; persona: Persona; text: string }): CacheIndex["entries"][number] | undefined {
    return this.index.entries.find((x) => x.trigger === args.trigger && x.persona === args.persona && x.text === args.text);
  }

  private async getBundled(args: {
    trigger: TriggerType;
    persona: Persona;
    text: string;
  }): Promise<{ indexed: boolean; audio?: Buffer; blockedReason?: string }> {
    await this.loadDownloadedBundle();
    const downloaded = this.downloadedBundleIndex.entries.find(
      (x) => x.trigger === args.trigger && x.persona === args.persona && x.text === args.text
    );
    if (downloaded) {
      if (downloaded.blockedReason) {
        return { indexed: true, blockedReason: downloaded.blockedReason };
      }
      try {
        return { indexed: true, audio: await fs.readFile(this.absDownloadedBundleAudioFile(downloaded.file)) };
      } catch {
        return { indexed: true };
      }
    }

    await this.loadBundled();
    const hit = this.bundledIndex.entries.find(
      (x) => x.trigger === args.trigger && x.persona === args.persona && x.text === args.text
    );
    if (!hit) {
      return { indexed: false };
    }
    if (hit.blockedReason) {
      return { indexed: true, blockedReason: hit.blockedReason };
    }
    try {
      return {
        indexed: true,
        audio: await fs.readFile(this.absBundledAudioFile(this.bundledBaseDir ?? this.bundledDirs()[0], hit.file))
      };
    } catch {
      return { indexed: true };
    }
  }

  private async loadBundled(): Promise<void> {
    if (this.bundledLoaded) {
      return;
    }

    for (const dir of this.bundledDirs()) {
      try {
        const raw = await fs.readFile(this.absBundledIndex(dir), "utf8");
        const parsed = JSON.parse(raw) as CacheIndex;
        if (parsed.version === CACHE_VERSION && Array.isArray(parsed.entries)) {
          this.bundledIndex = parsed;
          this.bundledBaseDir = dir;
          this.output.appendLine(`[CUDDLE] Bundled voice cache loaded: dir=${dir} entries=${parsed.entries.length}`);
          this.bundledLoaded = true;
          return;
        }
      } catch {
        continue;
      }
    }

    this.bundledBaseDir = undefined;
    this.bundledIndex = { version: CACHE_VERSION, entries: [] };
    this.bundledLoaded = true;
  }

  private async loadDownloadedBundle(): Promise<void> {
    if (this.downloadedBundleLoaded) {
      return;
    }

    try {
      const raw = await fs.readFile(this.absDownloadedBundleIndex(), "utf8");
      const parsed = JSON.parse(raw) as CacheIndex;
      if (parsed.version === CACHE_VERSION && Array.isArray(parsed.entries)) {
        this.downloadedBundleIndex = parsed;
        this.output.appendLine(`[CUDDLE] Downloaded voice bundle loaded: entries=${parsed.entries.length}`);
      }
    } catch {
      this.downloadedBundleIndex = { version: CACHE_VERSION, entries: [] };
    }

    this.downloadedBundleLoaded = true;
  }

  public async installDownloadedBundle(
    indexUrl: string,
    onProgress?: (args: { done: number; total: number; file: string }) => void
  ): Promise<{ entries: number; downloadedFiles: number }> {
    const normalizedIndexUrl = indexUrl.trim();
    if (!normalizedIndexUrl) {
      throw new Error("Voice bundle index URL is empty.");
    }

    const indexRes = await fetch(normalizedIndexUrl);
    if (!indexRes.ok) {
      throw new Error(`Failed to download bundle index (${indexRes.status}).`);
    }
    const rawIndex = (await indexRes.text()).trim();
    const parsed = JSON.parse(rawIndex) as CacheIndex;
    if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.entries)) {
      throw new Error("Bundle index has unsupported format/version.");
    }

    const baseUrl = normalizedIndexUrl.replace(/\/[^/]*$/, "");
    const files = [...new Set(parsed.entries.map((x) => x.file).filter((x) => x))];

    await fs.mkdir(this.downloadedBundleDir(), { recursive: true });
    let done = 0;
    for (const file of files) {
      const res = await fetch(`${baseUrl}/${encodeURIComponent(file)}`);
      if (!res.ok) {
        throw new Error(`Failed to download bundle audio file ${file} (${res.status}).`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(this.absDownloadedBundleAudioFile(file), buf);
      done += 1;
      if (onProgress) {
        onProgress({ done, total: files.length, file });
      }
    }

    await fs.writeFile(this.absDownloadedBundleIndex(), JSON.stringify(parsed, null, 2), "utf8");
    this.downloadedBundleIndex = parsed;
    this.downloadedBundleLoaded = true;
    return { entries: parsed.entries.length, downloadedFiles: files.length };
  }

  public async clearDownloadedBundle(): Promise<void> {
    await fs.rm(this.downloadedBundleDir(), { recursive: true, force: true });
    this.downloadedBundleIndex = { version: CACHE_VERSION, entries: [] };
    this.downloadedBundleLoaded = true;
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
