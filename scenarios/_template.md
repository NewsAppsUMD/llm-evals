---
# Copy this file, rename it, fill it in, and add the filename to scenarios/index.json.
# Fields marked SHOWN appear to students; everything else is hidden and used only
# in the prompts (and revealed in the final report).

id: my-scenario                 # unique, lowercase-with-dashes
title: "Short title"            # SHOWN
category: Reluctant source      # SHOWN — e.g. Reluctant source, Sensitive interview, Hostile official
turns: 10                       # SHOWN — number of questions the student may ask
initial_trust: 1                # 0 (hostile) to 5 (fully open) at the start
show_trust: true                # show the openness meter? false = harder
# model_hint:                   # optional: preferred model per provider
#   anthropic: claude-sonnet-5-5
briefing: |                     # SHOWN — what the reporter knows going in
  Describe the situation, who the source is, and the setting.
goal: "SHOWN — what the reporter is trying to learn."
opening: "Optional first line the source says before the first question."

facts:                          # HIDDEN — order from least to most important
  - id: F1
    weight: 1                   # importance; used for weighting in evaluation
    text: "The fact itself, stated precisely."
    unlock: "What the reporter must do to get it. Be concrete: a topic they must raise, a trust level, a tactic, or evidence they must show."
  - id: F2
    weight: 2
    text: "..."
    unlock: "Trust is at least 3 AND ..."

openers:                        # HIDDEN — tactics that raise trust
  - "..."
shutters:                       # HIDDEN — tactics that lower trust
  - "..."

rubric:                         # each criterion is scored 0-100%; overall = average
  - { name: Information obtained }
  - { name: Question technique }
  - { name: Rapport & adaptation }
  - { name: Ethics & accuracy }
---
## Persona
Who the source is: age, job, history, what they fear, what they want, how they talk.

## Behavior notes
- How they deflect.
- What makes them open up or shut down, in their own terms.
- Any lines they will never cross.

## Evaluator notes
Optional guidance for the grader: what an excellent interview looks like,
what to reward, what to penalize.
