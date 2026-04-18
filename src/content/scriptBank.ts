import { Persona, TriggerType } from "../types";

const LINES: Record<TriggerType, Record<Persona, string[]>> = {
  longLinePraise: {
    female: [
      "That line is wonderfully bold. I love your confidence.",
      "Long line energy. You are cooking right now.",
      "That was a big sweep of code. Nicely done.",
      "You commit to the idea fully. Respect.",
      "Such a long line, you naughty boy.",
      "Keeping your code DRY makes me wet."
    ],
    male: [
      "Huge line. Strong momentum.",
      "You are moving with intent. Keep that flow.",
      "Big statement line. I like it.",
      "Power move. Keep building."
    ]
  },
  idleNudge: {
    female: [
      "Quiet moment. Breathe in, then continue.",
      "No rush. Your next line can be clean and calm.",
      "Tiny pause accepted. Ready when you are.",
      "The code is waiting for your touch.",
      "What are you thinking about babe.",
      "You are doing great love.",
      "Do not forget to take breaks darling."
    ],
    male: [
      "Nice pause. Reset and go.",
      "Take your time. Next edit can be sharp.",
      "Silence is fine. Progress resumes now.",
      "You are still in control. Continue."
    ]
  },
  sustainedTyping: {
    female: [
      "Steady rhythm. This is beautiful focus.",
      "Sustained flow detected. You are locked in.",
      "Your consistency is impressive. Keep gliding.",
      "This pace is elegant and strong.",
      "The sound of you typing is so calming.",
      "Hmm, keep typing."
    ],
    male: [
      "That is strong sustained output.",
      "Excellent cadence. Keep driving.",
      "Focus level is high. Great work.",
      "Clean momentum. Stay with it."
    ]
  },
  burstTyping: {
    female: [
      "Rapid burst! That spark was delightful.",
      "Fast fingers, clear intent. Love it.",
      "What a burst. You are absolutely on it.",
      "That quick sprint was satisfying.",
      "Fast fingers, I like that... a lot."
    ],
    male: [
      "Burst detected. Great acceleration.",
      "Fast sequence. Very nice.",
      "Quick fire edits. Keep the edge.",
      "Excellent spike in speed."
    ]
  }
};

export function pickLine(trigger: TriggerType, persona: Persona): string {
  const choices = LINES[trigger][persona];
  return choices[Math.floor(Math.random() * choices.length)] ?? "Nice work.";
}

export function linesFor(trigger: TriggerType, persona: Persona): string[] {
  return LINES[trigger][persona];
}

export function allScriptLines(): Array<{ trigger: TriggerType; persona: Persona; text: string }> {
  const out: Array<{ trigger: TriggerType; persona: Persona; text: string }> = [];
  const triggers: TriggerType[] = ["longLinePraise", "idleNudge", "sustainedTyping", "burstTyping"];
  const personas: Persona[] = ["female", "male"];

  for (const trigger of triggers) {
    for (const persona of personas) {
      for (const text of LINES[trigger][persona]) {
        out.push({ trigger, persona, text });
      }
    }
  }

  return out;
}
