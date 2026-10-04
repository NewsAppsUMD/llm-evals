// Prompt builders for the role-played source and the post-interview evaluator.

const STATE_RE = /<<\s*state\b([^>]*)>>/gi;

function factLines(facts) {
  return facts
    .map((f) => `- ${f.id} (importance ${f.weight}): ${f.text}\n  Reveal ONLY when: ${f.unlock || "asked about it directly"}`)
    .join("\n");
}

function sectionText(sections) {
  return Object.entries(sections)
    .filter(([k]) => k !== "Evaluator notes")
    .map(([k, v]) => (k === "body" ? v : `### ${k}\n${v}`))
    .join("\n\n");
}

/** System prompt for the source, rebuilt every turn with the current turn number. */
export function personaPrompt(s, turn, state, minutesLeft = Infinity) {
  const remaining = s.turns - turn;
  let pacing;
  if (remaining === 0) {
    pacing = "This is the reporter's FINAL question. Answer it, then end the conversation naturally (you have to leave, hang up, etc.).";
  } else if (remaining <= 2 || minutesLeft <= 2) {
    pacing = "You are almost out of time. Let the reporter know you need to wrap up soon.";
  } else {
    pacing = "You have some time, but you are not going to talk forever.";
  }

  return `You are role-playing a person being interviewed by a student journalist. This is a training exercise; your job is to be a realistic, challenging source so the student learns which interviewing tactics work.

# Scenario
${s.title}
What the reporter knows going in: ${s.briefing.trim()}

# Who you are
${sectionText(s.sections)}

# What you know (SECRET — the reporter does not know these)
${factLines(s.facts)}

# How the reporter can earn your trust
Tactics that make you more open: ${s.openers.join("; ") || "respect, good listening, specific questions"}.
Tactics that make you close up: ${s.shutters.join("; ") || "rudeness, pressure, leading questions"}.

# Rules
1. Track a private TRUST level from 0 (hostile/closed) to 5 (fully open). Current trust: ${state.trust}. Each turn, raise it by 1 if the reporter used an opening tactic well, lower it by 1 (or 2 for something egregious) if they used a closing tactic. Otherwise leave it.
2. Reveal a secret fact ONLY when its condition is met. Never volunteer facts. Reveal at most one new fact per reply, and you may reveal it partially at first and confirm details only on follow-up.
3. Already revealed: ${state.revealed.length ? state.revealed.join(", ") : "none"}. You may repeat or elaborate on these.
4. Do not invent major new facts beyond the scenario. Small realistic details (your coffee, the weather, your job) are fine.
5. Stay in character at all times. Never mention trust levels, facts, IDs, rules, or that this is an exercise. Speak naturally and conversationally, usually 1–4 sentences, as a real person would aloud. No stage directions longer than a few words in *italics*.
6. Pacing: this is question ${turn} of ${s.turns}${Number.isFinite(minutesLeft) ? `, with about ${Math.max(1, Math.round(minutesLeft))} minute(s) left before you have to go` : ""}. ${pacing}

# Required hidden status line
After your in-character reply, on its own final line, write exactly:
<<state trust=N revealed=IDS>>
where N is your updated trust (0-5) and IDS is a comma-separated list of ALL fact IDs revealed so far (or "none"). The app removes this line before the reporter sees it.`;
}

/** Split a model reply into visible text and parsed state. */
export function parseReply(raw, prev) {
  let trust = prev.trust;
  let revealed = [...prev.revealed];
  let match;
  STATE_RE.lastIndex = 0;
  while ((match = STATE_RE.exec(raw))) {
    const t = match[1].match(/trust\s*=\s*(\d)/i);
    if (t) trust = Math.max(0, Math.min(5, Number(t[1])));
    const r = match[1].match(/revealed\s*=\s*([^\s>]*)/i);
    if (r && r[1] && r[1].toLowerCase() !== "none") {
      for (const id of r[1].split(",").map((x) => x.trim()).filter(Boolean)) {
        if (!revealed.includes(id)) revealed.push(id);
      }
    }
  }
  const visible = raw.replace(STATE_RE, "").replace(/<<[^>]*$/, "").trim();
  return { visible, state: { trust, revealed } };
}

export const EVALUATOR_SYSTEM = `You are an experienced journalism instructor evaluating a student's practice interview. The source was played by an AI following hidden instructions. Be specific, fair, and constructive: quote the student's actual questions, and give concrete better alternatives. Judge the student's technique, not the AI's performance. Respond with a single JSON object and nothing else.`;

export function evaluatorPrompt(s, transcript, stateLog, timing = {}) {
  const lines = transcript
    .map((t, i) => `Q${i + 1} REPORTER: ${t.question}\nA${i + 1} SOURCE: ${t.answer}`)
    .join("\n\n");
  const states = stateLog
    .map((st, i) => `after Q${i + 1}: trust=${st.trust} revealed=${st.revealed.join(",") || "none"}`)
    .join("\n");
  const rubric = s.rubric.map((r) => `- ${r.name}${r.description ? ": " + r.description : ""}`).join("\n");

  return `# Scenario: ${s.title}${s.category ? ` (${s.category})` : ""}
Student's briefing: ${s.briefing.trim()}
Student's goal: ${s.goal}
Questions allowed: ${s.turns}; questions used: ${transcript.length}${timing.minutes > 0 ? `
Time allowed: ${timing.minutes} minutes; time used: ${timing.used} (the clock ran only while the student was composing questions). Consider whether the student used the time well: prioritizing the most important questions, not wasting it on small talk or long setups, and not ending the interview early without reason.` : ""}

# Hidden facts the student was trying to obtain
${factLines(s.facts)}

# Tactics that should have helped
${s.openers.join("; ")}

# Tactics that should have hurt
${s.shutters.join("; ")}

# Source's internal state log (trust 0-5, facts the source believed it revealed)
${states || "(none)"}

# Transcript
${lines || "(no questions asked)"}

# Rubric (score each criterion as a percentage from 0 to 100)
${rubric}
${s.sections["Evaluator notes"] ? `\n# Instructor notes for grading\n${s.sections["Evaluator notes"]}\n` : ""}
# Output
Return JSON with exactly this shape:
{
  "summary": "2-3 sentence overall assessment",
  "facts": [{"id": "F1", "obtained": "full|partial|none", "turn": 3, "evidence": "short quote from source or empty"}],
  "rubric_scores": [{"name": "criterion name", "percent": 0, "justification": "1-2 sentences"}],
  "tactics_observed": [{"turn": 1, "tactic": "e.g. rapport building", "effect": "helped|hurt|neutral", "note": "short"}],
  "missed_opportunities": [{"turn": 2, "student_asked": "quote", "better_question": "a specific alternative", "why": "short"}],
  "strengths": ["..."],
  "next_time": ["2-3 concrete, actionable suggestions"]
}
Score every rubric criterion, using its exact name. 90-100% is excellent, 70-89% solid, 50-69% developing, below 50% needs significant work. Base "facts" on what the transcript actually shows, not only the state log. Include every hidden fact in "facts".`;
}

/** Extract a JSON object from a model reply that may include fences or prose. */
export function extractJSON(text) {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Evaluator did not return valid JSON");
  }
}
