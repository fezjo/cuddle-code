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
  const attempts = playbackAttempts(file);

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

function playbackAttempts(file: string): Array<{ cmd: string; args: string[] }> {
  if (process.platform === "win32") {
    const shellAttempts = ["powershell", "powershell.exe", "pwsh", "pwsh.exe"];
    const attempts: Array<{ cmd: string; args: string[] }> = [];
    for (const shell of shellAttempts) {
      attempts.push({
        cmd: shell,
        args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Sta", "-Command", windowsMediaPlayerScript(file)]
      });
      attempts.push({
        cmd: shell,
        args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", windowsWmPlayerComScript(file)]
      });
    }

    return attempts;
  }

  return [
    { cmd: "ffplay", args: ["-nodisp", "-autoexit", "-loglevel", "quiet", file] },
    { cmd: "mpg123", args: ["-q", file] },
    { cmd: "paplay", args: [file] },
    { cmd: "aplay", args: [file] },
    { cmd: "play", args: ["-q", file] },
    { cmd: "cvlc", args: ["--play-and-exit", "--intf", "dummy", file] },
    { cmd: "afplay", args: [file] }
  ];
}

function psEscape(path: string): string {
  return path.replaceAll("'", "''");
}

function windowsMediaPlayerScript(file: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    `$fullPath = '${psEscape(file)}'`,
    "Add-Type -AssemblyName presentationCore",
    "$player = New-Object System.Windows.Media.MediaPlayer",
    "$player.Open([System.Uri]::new($fullPath, [System.UriKind]::Absolute))",
    "$waitUntil = [DateTime]::UtcNow.AddSeconds(5)",
    "while (-not $player.NaturalDuration.HasTimeSpan -and [DateTime]::UtcNow -lt $waitUntil) { Start-Sleep -Milliseconds 50 }",
    "$player.Volume = 1.0",
    "$player.Play()",
    "if ($player.NaturalDuration.HasTimeSpan) {",
    "  $ms = [Math]::Max(1, [int]$player.NaturalDuration.TimeSpan.TotalMilliseconds)",
    "  Start-Sleep -Milliseconds ($ms + 120)",
    "} else {",
    "  Start-Sleep -Milliseconds 1500",
    "}",
    "$player.Close()"
  ].join("; ");
}

function windowsWmPlayerComScript(file: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    `$fullPath = '${psEscape(file)}'`,
    "$player = New-Object -ComObject WMPlayer.OCX",
    "$player.settings.volume = 100",
    "$player.URL = $fullPath",
    "$player.controls.play()",
    "$waitUntil = [DateTime]::UtcNow.AddSeconds(30)",
    "while ([DateTime]::UtcNow -lt $waitUntil) {",
    "  if ($player.playState -eq 1 -or $player.playState -eq 8) { break }",
    "  Start-Sleep -Milliseconds 100",
    "}",
    "$player.controls.stop()",
    "[void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($player)"
  ].join("; ");
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
