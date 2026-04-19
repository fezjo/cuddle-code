import { spawn } from "node:child_process";

export class AudioKeepAlive {
  private interval: NodeJS.Timeout | undefined;
  private running = false;
  private disabled = false;

  constructor(private readonly output: { appendLine(message: string): void }) { }

  public update(active: boolean): void {
    if (!active) {
      this.stop();
      return;
    }

    if (this.interval || this.disabled) {
      return;
    }

    this.output.appendLine("[CUDDLE] Audio keepalive enabled.");
    this.interval = setInterval(() => {
      void this.tick();
    }, 1000);
    void this.tick();
  }

  public dispose(): void {
    this.stop();
  }

  private stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
      this.output.appendLine("[CUDDLE] Audio keepalive disabled.");
    }
  }

  private async tick(): Promise<void> {
    if (this.running || this.disabled) {
      return;
    }
    this.running = true;
    try {
      await runKeepAlivePulse();
    } catch (err) {
      this.disabled = true;
      this.stop();
      this.output.appendLine(`[CUDDLE] Audio keepalive stopped: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }
}

// Minimal valid WAV: PCM, mono, 8000Hz, 8-bit, 4 samples of silence (0x80 = unsigned silence)
// RIFF(40) WAVE fmt(16): PCM,1ch,8000Hz,8bit data(4): 0x80 x4
const SILENT_WAV_HEX =
  "52494646" + "28000000" + "57415645" +
  "666d7420" + "10000000" + "0100" + "0100" + "401f0000" + "401f0000" + "0100" + "0800" +
  "64617461" + "04000000" + "80808080";

function windowsKeepAliveScript(): string {
  return [
    "Add-Type -AssemblyName System.Windows.Forms",
    `$hex = '${SILENT_WAV_HEX}'`,
    "$bytes = [byte[]]($hex -split '(..)' | Where-Object { $_ } | ForEach-Object { [Convert]::ToByte($_, 16) })",
    "$ms = New-Object System.IO.MemoryStream(,$bytes)",
    "$player = New-Object System.Media.SoundPlayer($ms)",
    "$player.PlaySync()"
  ].join("; ");
}

function runKeepAlivePulse(): Promise<void> {
  if (process.platform === "win32") {
    return runShellPulse(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", windowsKeepAliveScript()]
    );
  }
  return runShellPulse("ffplay", [
    "-nodisp", "-autoexit", "-loglevel", "quiet",
    "-f", "lavfi",
    "-i", "sine=frequency=19000:sample_rate=44100:duration=0.03,volume=0.001"
  ]);
}

function runShellPulse(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} keepalive exited with ${code}`));
      }
    });
  });
}
