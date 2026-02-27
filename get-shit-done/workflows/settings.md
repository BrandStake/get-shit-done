<purpose>
Interactive configuration of GSD workflow agents (research, plan_check, verifier) and model profile selection via multi-question prompt. Updates .planning/config.json with user preferences. Optionally saves settings as global defaults (~/.gsd/defaults.json) for future projects.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="ensure_and_load_config">
Ensure config exists and load current state:

```bash
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-ensure-section
INIT=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs state load)
```

Creates `.planning/config.json` with defaults if missing and loads current config values.
</step>

<step name="read_current">
```bash
cat .planning/config.json
```

Parse current values (default to `true` if not present):
- `workflow.research` — spawn researcher during plan-phase
- `workflow.plan_check` — spawn plan checker during plan-phase
- `workflow.verifier` — spawn verifier during execute-phase
- `workflow.nyquist_validation` — validation architecture research during plan-phase
- `workflow.auto_insert_fix_phases` — create fix phases from UAT gaps instead of inline planning
- `workflow.self_discussion` — use architect agents instead of user questions during discuss-phase
- `workflow.self_discussion_rounds` — number of deeper questioning rounds per topic (default: 3)
- `model_profile` — which model each agent uses (default: `balanced`)
- `git.branching_strategy` — branching approach (default: `"none"`)
</step>

<step name="present_settings">
Use AskUserQuestion with current values pre-selected:

```
AskUserQuestion([
  {
    question: "Which model profile for agents?",
    header: "Model",
    multiSelect: false,
    options: [
      { label: "Quality", description: "Opus everywhere except verification (highest cost)" },
      { label: "Balanced (Recommended)", description: "Opus for planning, Sonnet for execution/verification" },
      { label: "Budget", description: "Sonnet for writing, Haiku for research/verification (lowest cost)" }
    ]
  },
  {
    question: "Spawn Plan Researcher? (researches domain before planning)",
    header: "Research",
    multiSelect: false,
    options: [
      { label: "Yes", description: "Research phase goals before planning" },
      { label: "No", description: "Skip research, plan directly" }
    ]
  },
  {
    question: "Spawn Plan Checker? (verifies plans before execution)",
    header: "Plan Check",
    multiSelect: false,
    options: [
      { label: "Yes", description: "Verify plans meet phase goals" },
      { label: "No", description: "Skip plan verification" }
    ]
  },
  {
    question: "Spawn Execution Verifier? (verifies phase completion)",
    header: "Verifier",
    multiSelect: false,
    options: [
      { label: "Yes", description: "Verify must-haves after execution" },
      { label: "No", description: "Skip post-execution verification" }
    ]
  },
  {
    question: "Auto-advance pipeline? (discuss → plan → execute automatically)",
    header: "Auto",
    multiSelect: false,
    options: [
      { label: "No (Recommended)", description: "Manual /clear + paste between stages" },
      { label: "Yes", description: "Chain stages via Task() subagents (same isolation)" }
    ]
  },
  {
    question: "Enable Nyquist Validation? (researches test coverage during planning)",
    header: "Nyquist",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Research automated test coverage during plan-phase. Adds validation requirements to plans. Blocks approval if tasks lack automated verify." },
      { label: "No", description: "Skip validation research. Good for rapid prototyping or no-test phases." }
    ]
  },
  {
    question: "Git branching strategy?",
    header: "Branching",
    multiSelect: false,
    options: [
      { label: "None (Recommended)", description: "Commit directly to current branch" },
      { label: "Per Phase", description: "Create branch for each phase (gsd/phase-{N}-{name})" },
      { label: "Per Milestone", description: "Create branch for entire milestone (gsd/{version}-{name})" }
    ]
  },
  {
    question: "Auto-insert fix phases from UAT issues?",
    header: "Fix Phases",
    multiSelect: false,
    options: [
      { label: "No (Recommended)", description: "Plan fixes inline within current phase" },
      { label: "Yes", description: "Create new phases for UAT issues (enables autonomous fix cycles)" }
    ]
  },
  {
    question: "Use self-discussion mode? (architect agents instead of user questions)",
    header: "Self-Discuss",
    multiSelect: false,
    options: [
      { label: "No (Recommended)", description: "Interactive discussion with user" },
      { label: "Yes", description: "Spawn architect agents to discuss gray areas autonomously" }
    ]
  },
  {
    question: "How many discussion rounds per topic? (only applies if self-discussion enabled)",
    header: "Rounds",
    multiSelect: false,
    options: [
      { label: "2 rounds", description: "Quick analysis and recommendation" },
      { label: "3 rounds (Recommended)", description: "Initial analysis, deeper investigation, final recommendation" },
      { label: "4 rounds", description: "Additional round for implementation details and edge cases" }
    ]
  }
])
```
</step>

<step name="update_config">
Merge new settings into existing config.json:

```json
{
  ...existing_config,
  "model_profile": "quality" | "balanced" | "budget",
  "workflow": {
    "research": true/false,
    "plan_check": true/false,
    "verifier": true/false,
    "auto_advance": true/false,
    "nyquist_validation": true/false,
    "auto_insert_fix_phases": true/false,
    "self_discussion": true/false,
    "self_discussion_rounds": 2/3/4
  },
  "git": {
    "branching_strategy": "none" | "phase" | "milestone"
  }
}
```

Write updated config to `.planning/config.json`.
</step>

<step name="save_as_defaults">
Ask whether to save these settings as global defaults for future projects:

```
AskUserQuestion([
  {
    question: "Save these as default settings for all new projects?",
    header: "Defaults",
    multiSelect: false,
    options: [
      { label: "Yes", description: "New projects start with these settings (saved to ~/.gsd/defaults.json)" },
      { label: "No", description: "Only apply to this project" }
    ]
  }
])
```

If "Yes": write the same config object (minus project-specific fields like `brave_search`) to `~/.gsd/defaults.json`:

```bash
mkdir -p ~/.gsd
```

Write `~/.gsd/defaults.json` with:
```json
{
  "mode": <current>,
  "depth": <current>,
  "model_profile": <current>,
  "commit_docs": <current>,
  "parallelization": <current>,
  "branching_strategy": <current>,
  "workflow": {
    "research": <current>,
    "plan_check": <current>,
    "verifier": <current>,
    "auto_advance": <current>,
    "nyquist_validation": <current>,
    "auto_insert_fix_phases": <current>,
    "self_discussion": <current>,
    "self_discussion_rounds": <current>
  }
}
```
</step>

<step name="confirm">
Display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► SETTINGS UPDATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Setting              | Value |
|----------------------|-------|
| Model Profile        | {quality/balanced/budget} |
| Plan Researcher      | {On/Off} |
| Plan Checker         | {On/Off} |
| Execution Verifier   | {On/Off} |
| Auto-Advance         | {On/Off} |
| Nyquist Validation   | {On/Off} |
| Git Branching        | {None/Per Phase/Per Milestone} |
| Auto Fix Phases      | {On/Off} |
| Self-Discussion      | {On/Off} |
| Discussion Rounds    | {2/3/4} |
| Saved as Defaults    | {Yes/No} |

These settings apply to future /gsd:plan-phase and /gsd:execute-phase runs.

Quick commands:
- /gsd:set-profile <profile> — switch model profile
- /gsd:plan-phase --research — force research
- /gsd:plan-phase --skip-research — skip research
- /gsd:plan-phase --skip-verify — skip plan check
```
</step>

</process>

<success_criteria>
- [ ] Current config read
- [ ] User presented with 10 settings (profile + 8 workflow toggles + git branching)
- [ ] Config updated with model_profile, workflow, and git sections
- [ ] User offered to save as global defaults (~/.gsd/defaults.json)
- [ ] Changes confirmed to user
</success_criteria>
