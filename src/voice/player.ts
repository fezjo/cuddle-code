import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";

export async function playMp3Buffer(audio: Buffer): Promise<void> {
  const file = join(tmpdir(), `cuddle-code-${randomUUID()}.mp3`);
  await fs.writeFile(file, audio);
  try {
    await playFile(file);
  } finally {
    void fs.unlink(file).catch(() => undefined);
  }
}

async function playFile(file: string): Promise<void> {
  const attempts: Array<{ cmd: string; args: string[] }> = [
    { cmd: "ffplay", args: ["-nodisp", "-autoexit", "-loglevel", "quiet", file] },
    { cmd: "mpg123", args: ["-q", file] },
    { cmd: "paplay", args: [file] },
    { cmd: "aplay", args: [file] },
    { cmd: "play", args: ["-q", file] },
    { cmd: "cvlc", args: ["--play-and-exit", "--intf", "dummy", file] },
    { cmd: "afplay", args: [file] },
    { cmd: "powershell", args: ["-c", `(New-Object Media.SoundPlayer '${file}').PlaySync();`] }
  ];

  const failures: string[] = [];
  for (const attempt of attempts) {
    try {
      await run(attempt.cmd, attempt.args);
      return;
    } catch (err) {
      failures.push(`${attempt.cmd}: ${String(err)}`);
    }
  }

  throw new Error(`No supported audio player found. Attempts: ${failures.join(" | ")}`);
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} exited with ${code}`));
      }
    });
  });
}
