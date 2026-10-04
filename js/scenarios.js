// Loads scenarios listed in scenarios/index.json. Each scenario is a Markdown
// file with YAML front matter (settings, hidden facts, rubric) and a body of
// "## Heading" sections (persona, behavior notes) used only in the prompts.
// Published scenarios are .dat files made by build_scenarios.py (gzip + XOR +
// base64) so the answers aren't readable at a glance; plain .md also works.

const KEY = new TextEncoder().encode("interview-practice"); // must match build_scenarios.py
const MAGIC = "IPS1:";

async function decode(text) {
  const bytes = Uint8Array.from(atob(text.slice(MAGIC.length).trim()), (c) => c.charCodeAt(0));
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= KEY[i % KEY.length];
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

const REQUIRED = ["id", "title", "turns", "briefing", "goal", "facts"];

export function parseScenario(text, filename = "") {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`${filename}: missing YAML front matter (--- ... ---)`);
  const meta = window.jsyaml.load(m[1]) || {};
  for (const key of REQUIRED) {
    if (meta[key] === undefined) throw new Error(`${filename}: missing required field "${key}"`);
  }
  if (!Array.isArray(meta.facts) || meta.facts.length === 0) {
    throw new Error(`${filename}: "facts" must be a non-empty list`);
  }
  meta.facts.forEach((f, i) => {
    f.id = String(f.id ?? `F${i + 1}`);
    f.weight = Number(f.weight ?? 1);
  });

  const sections = {};
  let current = "body";
  for (const line of m[2].split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      current = h[1].trim();
      sections[current] = "";
    } else {
      sections[current] = (sections[current] ?? "") + line + "\n";
    }
  }
  for (const k of Object.keys(sections)) {
    sections[k] = sections[k].trim();
    if (!sections[k]) delete sections[k];
  }

  return {
    category: "",
    openers: [],
    shutters: [],
    show_trust: true,
    model_hint: {},
    rubric: [
      { name: "Information obtained" },
      { name: "Question technique" },
      { name: "Rapport & adaptation" },
      { name: "Ethics & accuracy" },
    ],
    ...meta,
    turns: Number(meta.turns),
    minutes: meta.minutes === undefined ? Math.ceil(Number(meta.turns) * 1.5) : Number(meta.minutes) || 0,
    sections,
    file: filename,
  };
}

export async function loadScenarios() {
  const res = await fetch("scenarios/index.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load scenarios/index.json");
  const files = await res.json();
  const results = await Promise.allSettled(
    files.map(async (f) => {
      const r = await fetch(`scenarios/${f}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`);
      const text = await r.text();
      return parseScenario(text.startsWith(MAGIC) ? await decode(text) : text, f);
    }),
  );
  const scenarios = [];
  const errors = [];
  for (const r of results) {
    if (r.status === "fulfilled") scenarios.push(r.value);
    else errors.push(r.reason.message);
  }
  return { scenarios, errors };
}
