// Renders the evaluator's JSON into HTML and Markdown.

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const arr = (x) => (Array.isArray(x) ? x : []);

const pct = (x) => Math.max(0, Math.min(100, Math.round(Number(x) || 0)));

/** Overall = plain average of the criterion percentages, computed here rather than by the model. */
export function overallPercent(ev) {
  const scores = arr(ev.rubric_scores).map((r) => pct(r.percent));
  return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
}

function factText(s, id) {
  return s.facts.find((f) => f.id === id)?.text ?? "";
}

export function renderReportHTML(ev, s, transcript, meta) {
  const facts = arr(ev.facts);
  const found = facts.filter((f) => f.obtained === "full").length;
  const partial = facts.filter((f) => f.obtained === "partial").length;

  return `
  <header class="report-head">
    <div>
      <p class="eyebrow">Progress report · ${esc(meta.date)}</p>
      <h2>${esc(s.title)}</h2>
      <p class="muted">${esc(meta.providerLabel)} · ${esc(meta.model)} · ${transcript.length} of ${s.turns} questions used</p>
    </div>
    <div class="score" aria-label="Overall score">
      <span class="score-num">${overallPercent(ev)}%</span>
    </div>
  </header>

  <p class="summary">${esc(ev.summary)}</p>

  <section>
    <h3>Information obtained <span class="muted">(${found} full, ${partial} partial of ${s.facts.length})</span></h3>
    <ul class="facts">
      ${facts
        .map(
          (f) => `<li class="fact ${esc(f.obtained)}">
            <span class="badge">${esc(f.obtained)}</span>
            <div><strong>${esc(f.id)}</strong> ${esc(factText(s, f.id))}
            ${f.turn ? `<span class="muted"> · Q${esc(f.turn)}</span>` : ""}
            ${f.evidence ? `<blockquote>${esc(f.evidence)}</blockquote>` : ""}</div>
          </li>`,
        )
        .join("")}
    </ul>
  </section>

  <section>
    <h3>Rubric</h3>
    <table class="rubric">
      <thead><tr><th>Criterion</th><th>Score</th><th>Why</th></tr></thead>
      <tbody>
      ${arr(ev.rubric_scores)
        .map(
          (r) => `<tr><td>${esc(r.name)}</td><td class="num">${pct(r.percent)}%<span class="bar"><span style="width:${pct(r.percent)}%"></span></span></td><td>${esc(r.justification)}</td></tr>`,
        )
        .join("")}
      </tbody>
    </table>
  </section>

  <section>
    <h3>Tactics observed</h3>
    <ul class="tactics">
      ${arr(ev.tactics_observed)
        .map(
          (t) => `<li><span class="effect ${esc(t.effect)}">${esc(t.effect)}</span> <strong>Q${esc(t.turn)}</strong> ${esc(t.tactic)}${t.note ? ` — <span class="muted">${esc(t.note)}</span>` : ""}</li>`,
        )
        .join("")}
    </ul>
  </section>

  ${
    arr(ev.missed_opportunities).length
      ? `<section>
    <h3>Missed opportunities</h3>
    ${arr(ev.missed_opportunities)
      .map(
        (m) => `<div class="missed">
          <p><strong>Q${esc(m.turn)}</strong> You asked: <em>“${esc(m.student_asked)}”</em></p>
          <p>Try instead: <strong>“${esc(m.better_question)}”</strong></p>
          ${m.why ? `<p class="muted">${esc(m.why)}</p>` : ""}
        </div>`,
      )
      .join("")}
  </section>`
      : ""
  }

  <div class="two-col">
    <section><h3>Strengths</h3><ul>${arr(ev.strengths).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>
    <section><h3>Next time</h3><ul>${arr(ev.next_time).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>
  </div>

  <section>
    <h3>Transcript</h3>
    <ol class="transcript-list">
      ${transcript
        .map((t) => `<li><p><strong>You:</strong> ${esc(t.question)}</p><p><strong>Source:</strong> ${esc(t.answer)}</p></li>`)
        .join("")}
    </ol>
  </section>`;
}

export function renderReportMarkdown(ev, s, transcript, meta) {
  const out = [];
  out.push(`# Interview practice report: ${s.title}`, "");
  out.push(`- Date: ${meta.date}`);
  if (meta.student) out.push(`- Student: ${meta.student}`);
  out.push(`- Model: ${meta.providerLabel} / ${meta.model}`);
  out.push(`- Questions used: ${transcript.length} of ${s.turns}`);
  out.push(`- **Overall score: ${overallPercent(ev)}%**`, "");
  out.push(ev.summary || "", "");

  out.push("## Information obtained", "");
  for (const f of arr(ev.facts)) {
    out.push(`- **${f.id}** [${f.obtained}]${f.turn ? ` (Q${f.turn})` : ""}: ${factText(s, f.id)}`);
    if (f.evidence) out.push(`  > ${f.evidence}`);
  }
  out.push("", "## Rubric", "", "| Criterion | Score | Why |", "|---|---|---|");
  for (const r of arr(ev.rubric_scores)) {
    out.push(`| ${r.name} | ${pct(r.percent)}% | ${String(r.justification ?? "").replace(/\|/g, "/")} |`);
  }
  out.push("", "## Tactics observed", "");
  for (const t of arr(ev.tactics_observed)) out.push(`- Q${t.turn} (${t.effect}): ${t.tactic}${t.note ? ` — ${t.note}` : ""}`);
  if (arr(ev.missed_opportunities).length) {
    out.push("", "## Missed opportunities", "");
    for (const m of arr(ev.missed_opportunities)) {
      out.push(`- Q${m.turn}: you asked “${m.student_asked}”. Try: “${m.better_question}”${m.why ? ` (${m.why})` : ""}`);
    }
  }
  out.push("", "## Strengths", "", ...arr(ev.strengths).map((x) => `- ${x}`));
  out.push("", "## Next time", "", ...arr(ev.next_time).map((x) => `- ${x}`));
  out.push("", "## Transcript", "");
  transcript.forEach((t, i) => {
    out.push(`**Q${i + 1} — You:** ${t.question}`, "", `**Source:** ${t.answer}`, "");
  });
  return out.join("\n");
}
