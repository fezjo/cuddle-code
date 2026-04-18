import { spawn } from "node:child_process";

export class AudioKeepAlive {
  private interval: NodeJS.Timeout | undefined;
  private running = false;
  private disabled = false;

  constructor(private readonly output: { appendLine(message: string): void }) {}

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

function runKeepAlivePulse(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffplay",
      [
        "-nodisp",
        "-autoexit",
        "-loglevel",
        "quiet",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=19000:sample_rate=44100:duration=0.03,volume=0.001"
      ],
      { stdio: "ignore" }
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffplay exited with ${code}`));
      }
    });
  });
}
