# Interview Practice

A browser-based simulator where journalism students interview an AI-played source
(a reluctant official, a grieving parent, and so on) with a fixed number of questions,
then get a progress report that evaluates their technique.

Students bring their own API key for **Anthropic** or **OpenAI**.

## For students

### Option A: use the website
1. Open the course site (GitHub Pages link from your instructor).
2. Choose a provider, paste your API key, and pick a scenario.
3. Read the assignment, plan your approach, and start the interview.

### Option B: run it on your computer
You need Python 3.9 or newer. No other installs are required.

```bash
git clone <this repo URL>
cd llm-evals
python3 server.py
```

On Windows use `python server.py`. Your browser opens at `http://localhost:8000`.
In this mode, every finished report is also saved to the `sessions/` folder.

### How an interview works
- Each message you send counts as one question. When you run out, the interview ends.
- The source opens up or shuts down depending on **how** you ask. Specific questions,
  respect, and good follow-ups work. Accusations, leading questions, and pressure don't.
- "Facts uncovered" shows how many key pieces of information you've obtained so far,
  but not what they are.
- At the end, click **Get my report**. Download it (.md), copy it, or print it to
  PDF, and submit it as your instructor directs.

**About your API key:** it is sent only to the provider you choose (or to the local
`server.py`, which forwards it). It is stored in your browser only if you tick
"Remember key". Each interview costs a few cents or less.

## For instructors

### Writing scenarios
Readable scenarios live in `scenarios-src/`. Git ignores that folder because
those files contain the answers. Students get only encoded copies.

1. Copy `scenarios-src/_template.md` to a new file in `scenarios-src/` and fill it in.
2. Run `python3 build_scenarios.py`. This writes the encoded `scenarios/*.dat` files
   and `scenarios/index.json`.
3. Commit the `.dat` files and `index.json`.

`index.json` sets the order students see. New scenarios are added at the end; edit the
file to reorder them. To remove a scenario, delete its source file and rebuild.

**Back up `scenarios-src/`.** It is the only readable copy, and git doesn't track it.
Keep it in a private repo or a cloud drive.

- **Shown to students:** `title`, `category`, `turns`, `briefing`, `goal`, `opening`.
- **Hidden:** `facts` (each with an `unlock` condition), `openers`, `shutters`, the
  `## Persona`, `## Behavior notes`, and `## Evaluator notes` sections. These go into the
  prompts and appear only in the final report.

The encoding is obfuscation, not encryption. It stops a student from opening a file in a
text editor or on GitHub. Anyone willing to dig through the page's code, or to watch the
API requests in the browser's developer tools, can still read the hidden fields. Treat
this as a practice tool, not a secure exam.

### Tuning difficulty
The source keeps a private **trust level** from 0 to 5. Openers raise it and shutters
lower it. Each fact's `unlock` condition can require a trust level, a topic, a specific
tactic, or evidence:

```yaml
unlock: "Trust is at least 4 AND the reporter negotiates background attribution."
```

- **Harder:** use fewer `turns`, a lower `initial_trust`, stricter unlocks, and `show_trust: false`.
- **Easier:** use more turns and unlocks that depend only on asking about the right topic.
- Put the most important fact last and make it require both trust and a tactic. That
  makes students build toward it.

### How it works
- `js/prompts.js` rebuilds the source's system prompt every turn. The prompt includes the
  current turn number, so the source signals time pressure near the end. The model adds
  a hidden `<<state trust=N revealed=F1,F2>>` line to each reply, which the app strips
  out and uses to update the meters.
- The turn limit is enforced in code, not by the model. Failed API calls don't count
  as a turn.
- The report comes from a separate evaluator call. It gets the transcript, the hidden facts,
  the rubric, and the state log, and returns structured JSON.
- `server.py` is a local server that uses only Python's standard library. It serves the
  site, forwards API calls to a fixed list of provider URLs, and saves each report
  to `sessions/`.

### Publishing on GitHub Pages
Settings → Pages → Deploy from branch → `main`, folder `/ (root)`. The site detects
that `server.py` isn't running and calls the provider directly from the browser.
