import { PROVIDERS, chat, detectLocalMode, isLocalMode } from "./providers.js";
import { loadScenarios } from "./scenarios.js";
import { personaPrompt, parseReply, EVALUATOR_SYSTEM, evaluatorPrompt, extractJSON } from "./prompts.js";
import { renderReportHTML, renderReportMarkdown } from "./report.js";

const $ = (id) => document.getElementById(id);

const store = {
  get(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k, v) {
    try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage unavailable */ }
  },
};

const app = {
  scenarios: [],
  scenario: null,
  history: [],     // raw messages sent to the model (assistant turns keep the state line)
  transcript: [],  // [{question, answer}] visible text only
  state: { trust: 1, revealed: [] },
  stateLog: [],
  busy: false,
  report: null,
};

// ---------- setup view ----------

function populateProviders() {
  const sel = $("provider");
  sel.innerHTML = "";
  for (const [id, p] of Object.entries(PROVIDERS)) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = p.label;
    sel.append(opt);
  }
  const saved = store.get("provider");
  sel.value = PROVIDERS[saved] ? saved : "anthropic";
  onProviderChange();
}

function onProviderChange() {
  const id = $("provider").value;
  const p = PROVIDERS[id];
  store.set("provider", id);
  $("model-list").innerHTML = p.models.map((m) => `<option value="${m}">`).join("");
  const savedModel = store.get(`model:${id}`);
  const hint = app.scenario?.model_hint?.[id];
  $("model").value = hint || savedModel || p.defaultModel;
  const remembered = store.get(`key:${id}`);
  $("api-key").value = remembered || ""; // each provider has its own key
  $("remember-key").checked = !!remembered;

  const note = $("provider-note");
  note.hidden = false;
  note.textContent = isLocalMode()
    ? "Local mode: requests go through server.py on your computer. Reports are also saved to the sessions/ folder."
    : "Hosted mode: your browser calls the provider directly. Reports are not saved automatically, so download yours at the end.";
}

function renderScenarioList() {
  const list = $("scenario-list");
  list.innerHTML = "";
  for (const s of app.scenarios) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "scenario";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", "false");
    b.innerHTML = `<span class="eyebrow"></span><strong></strong><span class="muted"></span>`;
    b.children[0].textContent = s.category || "Scenario";
    b.children[1].textContent = s.title;
    b.children[2].textContent = `${s.turns} questions`;
    b.addEventListener("click", () => selectScenario(s, b));
    list.append(b);
  }
}

function selectScenario(s, btn) {
  app.scenario = s;
  document.querySelectorAll(".scenario").forEach((el) => el.setAttribute("aria-checked", String(el === btn)));
  $("brief-category").textContent = s.category;
  $("brief-title").textContent = s.title;
  $("brief-text").textContent = s.briefing.trim();
  $("brief-goal").textContent = s.goal;
  $("brief-turns").textContent = s.turns;
  $("briefing-card").hidden = false;
  const hint = s.model_hint?.[$("provider").value];
  if (hint) $("model").value = hint;
  $("briefing-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

function settings() {
  const provider = $("provider").value;
  return { provider, model: $("model").value.trim(), apiKey: $("api-key").value.trim() };
}

function persistSettings() {
  const { provider, model, apiKey } = settings();
  store.set(`model:${provider}`, model);
  store.set(`key:${provider}`, $("remember-key").checked ? apiKey : null);
}

// ---------- interview view ----------

function show(view) {
  for (const v of ["setup", "interview", "report"]) $(`view-${v}`).hidden = v !== view;
  window.scrollTo(0, 0);
}

function startInterview() {
  const { apiKey, model } = settings();
  if (!apiKey) return alert("Please paste an API key first.");
  if (!model) return alert("Please enter a model name.");
  persistSettings();

  const s = app.scenario;
  Object.assign(app, {
    history: [],
    transcript: [],
    state: { trust: Number(s.initial_trust ?? 1), revealed: [] },
    stateLog: [],
    report: null,
  });
  $("iv-category").textContent = s.category;
  $("iv-title").textContent = s.title;
  $("iv-brief").textContent = s.briefing.trim();
  $("iv-goal").textContent = s.goal;
  $("trust-meter").hidden = s.show_trust === false;
  $("transcript").innerHTML = "";
  if (s.opening) addBubble("source", s.opening.trim());
  $("iv-error").hidden = true;
  updateMeters();
  setInputEnabled(true);
  show("interview");
  $("question").focus();
}

function addBubble(who, text) {
  const div = document.createElement("div");
  div.className = `bubble ${who}`;
  const label = document.createElement("span");
  label.className = "who";
  label.textContent = who === "you" ? "You" : who === "source" ? "Source" : "";
  const p = document.createElement("p");
  p.textContent = text;
  div.append(label, p);
  $("transcript").append(div);
  div.scrollIntoView({ behavior: "smooth", block: "end" });
  return div;
}

function updateMeters() {
  const s = app.scenario;
  $("turns-left").textContent = s.turns - app.transcript.length;
  const known = app.state.revealed.filter((id) => s.facts.some((f) => f.id === id)).length;
  $("facts-found").textContent = `${known} / ${s.facts.length}`;
  $("trust-dots").innerHTML = Array.from({ length: 5 }, (_, i) =>
    `<span class="dot${i < app.state.trust ? " on" : ""}"></span>`).join("");
  $("trust-dots").setAttribute("aria-label", `Openness ${app.state.trust} of 5`);
  $("turns-left").parentElement.classList.toggle("low", s.turns - app.transcript.length <= 2);
}

function setInputEnabled(on) {
  $("question").disabled = !on;
  $("send-btn").disabled = !on;
}

async function ask(e) {
  e?.preventDefault();
  if (app.busy) return;
  const q = $("question").value.trim();
  if (!q) return;
  const s = app.scenario;
  const turn = app.transcript.length + 1;
  if (turn > s.turns) return;

  app.busy = true;
  setInputEnabled(false);
  $("iv-error").hidden = true;
  $("question").value = "";
  const mine = addBubble("you", q);
  const pending = addBubble("source", "…");
  pending.classList.add("pending");

  const messages = [...app.history, { role: "user", content: q }];
  try {
    const raw = await chat({
      ...settings(),
      system: personaPrompt(s, turn, app.state),
      messages,
      maxTokens: 600,
    });
    const { visible, state } = parseReply(raw, app.state);
    pending.classList.remove("pending");
    pending.querySelector("p").textContent = visible || "(no response)";
    app.history = [...messages, { role: "assistant", content: raw }];
    app.transcript.push({ question: q, answer: visible });
    app.state = state;
    app.stateLog.push(state);
    updateMeters();
  } catch (err) {
    // Failed calls don't use up a question.
    mine.remove();
    pending.remove();
    $("question").value = q;
    $("iv-error").textContent = err.message;
    $("iv-error").hidden = false;
  } finally {
    app.busy = false;
  }

  if (app.transcript.length >= s.turns) {
    setInputEnabled(false);
    addBubble("system", "That was your last question. The interview is over.");
    $("end-btn").textContent = "Get my report";
    $("end-btn").classList.replace("ghost", "primary");
  } else {
    setInputEnabled(true);
    $("question").focus();
  }
}

// ---------- report view ----------

async function evaluate() {
  const s = app.scenario;
  show("report");
  $("report").hidden = true;
  $("report-actions").hidden = true;
  $("report-error").hidden = true;
  $("retry-eval-btn").hidden = true;
  $("report-status").hidden = false;
  $("report-status").textContent = "Your editor is reviewing the interview…";

  const userPrompt = evaluatorPrompt(s, app.transcript, app.stateLog);
  let ev = null;
  let lastErr;
  for (let attempt = 0; attempt < 2 && !ev; attempt++) {
    try {
      const text = await chat({
        ...settings(),
        system: EVALUATOR_SYSTEM,
        messages: [{ role: "user", content: attempt ? userPrompt + "\n\nReturn ONLY the JSON object." : userPrompt }],
        maxTokens: 4000,
        json: true,
      });
      ev = extractJSON(text);
    } catch (err) {
      lastErr = err;
    }
  }

  $("report-status").hidden = true;
  if (!ev) {
    $("report-error").textContent = `Could not generate the report: ${lastErr?.message}`;
    $("report-error").hidden = false;
    $("retry-eval-btn").hidden = false;
    $("report-actions").hidden = false;
    return;
  }

  const meta = {
    date: new Date().toLocaleString(),
    student: $("student-name").value.trim(),
    providerLabel: PROVIDERS[$("provider").value].label,
    model: $("model").value.trim(),
  };
  app.report = { markdown: renderReportMarkdown(ev, s, app.transcript, meta) };
  $("report").innerHTML = renderReportHTML(ev, s, app.transcript, meta);
  $("report").hidden = false;
  $("report-actions").hidden = false;

  if (isLocalMode()) {
    try {
      const r = await fetch("api/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario: s.id, markdown: app.report.markdown }),
      });
      const { saved } = await r.json();
      $("save-note").textContent = saved ? `Saved to ${saved}` : "";
    } catch {
      $("save-note").textContent = "";
    }
  }
}

function download() {
  if (!app.report) return;
  const blob = new Blob([app.report.markdown], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${app.scenario.id}-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function copy() {
  if (!app.report) return;
  try {
    await navigator.clipboard.writeText(app.report.markdown);
    $("copy-btn").textContent = "Copied!";
    setTimeout(() => ($("copy-btn").textContent = "Copy to clipboard"), 1500);
  } catch {
    alert("Copy failed. Use Download instead.");
  }
}

function resetToSetup() {
  if (app.transcript.length && !app.report && !confirm("Leave this interview? Your progress will be lost.")) return;
  $("end-btn").textContent = "End interview & get report";
  $("end-btn").classList.replace("primary", "ghost");
  show("setup");
}

// ---------- init ----------

async function init() {
  const local = await detectLocalMode();
  $("mode-badge").hidden = false;
  $("mode-badge").textContent = local ? "Local mode" : "Hosted mode";
  populateProviders();

  $("provider").addEventListener("change", () => onProviderChange());
  $("model").addEventListener("change", persistSettings);
  $("remember-key").addEventListener("change", persistSettings);
  $("start-btn").addEventListener("click", startInterview);
  $("ask-form").addEventListener("submit", ask);
  $("question").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) ask(e);
  });
  $("end-btn").addEventListener("click", () => {
    if (app.busy) return;
    if (!app.transcript.length) return resetToSetup();
    const left = app.scenario.turns - app.transcript.length;
    if (left > 0 && !confirm(`You still have ${left} question(s). End the interview now?`)) return;
    evaluate();
  });
  $("dl-btn").addEventListener("click", download);
  $("copy-btn").addEventListener("click", copy);
  $("print-btn").addEventListener("click", () => window.print());
  $("retry-eval-btn").addEventListener("click", evaluate);
  $("again-btn").addEventListener("click", resetToSetup);

  if (!window.jsyaml) {
    $("scenario-errors").textContent = "Could not load the YAML parser (check your internet connection).";
    $("scenario-errors").hidden = false;
    return;
  }
  try {
    const { scenarios, errors } = await loadScenarios();
    app.scenarios = scenarios;
    if (errors.length) {
      $("scenario-errors").textContent = `Some scenarios failed to load: ${errors.join("; ")}`;
      $("scenario-errors").hidden = false;
    }
    renderScenarioList();
  } catch (err) {
    $("scenario-errors").textContent = err.message;
    $("scenario-errors").hidden = false;
  }
}

init();
