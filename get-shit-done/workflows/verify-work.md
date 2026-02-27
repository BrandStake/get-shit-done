<purpose>
Validate built features through conversational testing with persistent state. Creates UAT.md that tracks test progress, survives /clear, and feeds gaps into /gsd:plan-phase --gaps.

User tests, Claude records. One test at a time. Plain text responses.
</purpose>

<philosophy>
**Show expected, ask if reality matches.**

Claude presents what SHOULD happen. User confirms or describes what's different.
- "yes" / "y" / "next" / empty → pass
- Anything else → logged as issue, severity inferred

No Pass/Fail buttons. No severity questions. Just: "Here's what should happen. Does it?"
</philosophy>

<template>
@~/.claude/get-shit-done/templates/UAT.md
</template>

<process>

<step name="initialize" priority="first">
If $ARGUMENTS contains a phase number, load context:

```bash
INIT=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs init verify-work "${PHASE_ARG}")
```

Parse JSON for: `planner_model`, `checker_model`, `commit_docs`, `phase_found`, `phase_dir`, `phase_number`, `phase_name`, `has_verification`.

**Parse `--auto` flag:**

```bash
AUTO_MODE=false
if [[ "$ARGUMENTS" == *"--auto"* ]]; then
  AUTO_MODE=true
fi
```

When AUTO_MODE=true, skip manual testing (present_test, process_response) and use automated_testing instead.
</step>

<step name="check_active_session">
**First: Check for active UAT sessions**

```bash
find .planning/phases -name "*-UAT.md" -type f 2>/dev/null | head -5
```

**If active sessions exist AND no $ARGUMENTS provided:**

Read each file's frontmatter (status, phase) and Current Test section.

Display inline:

```
## Active UAT Sessions

| # | Phase | Status | Current Test | Progress |
|---|-------|--------|--------------|----------|
| 1 | 04-comments | testing | 3. Reply to Comment | 2/6 |
| 2 | 05-auth | testing | 1. Login Form | 0/4 |

Reply with a number to resume, or provide a phase number to start new.
```

Wait for user response.

- If user replies with number (1, 2) → Load that file, go to `resume_from_file`
- If user replies with phase number → Treat as new session, go to `create_uat_file`

**If active sessions exist AND $ARGUMENTS provided:**

Check if session exists for that phase. If yes, offer to resume or restart.
If no, continue to `create_uat_file`.

**If no active sessions AND no $ARGUMENTS:**

```
No active UAT sessions.

Provide a phase number to start testing (e.g., /gsd:verify-work 4)
```

**If no active sessions AND $ARGUMENTS provided:**

Continue to `create_uat_file`.
</step>

<step name="find_summaries">
**Find what to test:**

Use `phase_dir` from init (or run init if not already done).

```bash
ls "$phase_dir"/*-SUMMARY.md 2>/dev/null
```

Read each SUMMARY.md to extract testable deliverables.
</step>

<step name="extract_tests">
**Extract testable deliverables from SUMMARY.md:**

Parse for:
1. **Accomplishments** - Features/functionality added
2. **User-facing changes** - UI, workflows, interactions

Focus on USER-OBSERVABLE outcomes, not implementation details.

For each deliverable, create a test:
- name: Brief test name
- expected: What the user should see/experience (specific, observable)

Examples:
- Accomplishment: "Added comment threading with infinite nesting"
  → Test: "Reply to a Comment"
  → Expected: "Clicking Reply opens inline composer below comment. Submitting shows reply nested under parent with visual indentation."

Skip internal/non-observable items (refactors, type changes, etc.).
</step>

<step name="create_uat_file">
**Create UAT file with all tests:**

```bash
mkdir -p "$PHASE_DIR"
```

Build test list from extracted deliverables.

Create file:

```markdown
---
status: testing
phase: XX-name
mode: [manual | auto]  # Set based on AUTO_MODE flag
source: [list of SUMMARY.md files]
started: [ISO timestamp]
updated: [ISO timestamp]
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: [first test name]
expected: |
  [what user should observe]
awaiting: user response

## Tests

### 1. [Test Name]
expected: [observable behavior]
result: [pending]

### 2. [Test Name]
expected: [observable behavior]
result: [pending]

...

## Summary

total: [N]
passed: 0
issues: 0
pending: [N]
skipped: 0

## Gaps

[none yet]
```

Write to `.planning/phases/XX-name/{phase_num}-UAT.md`

**If AUTO_MODE=true:** Proceed to `automated_testing`
**If AUTO_MODE=false:** Proceed to `present_test`
</step>

<step name="automated_testing" conditional="AUTO_MODE=true">
**CRITICAL: You MUST execute ALL of the following steps in order. Do NOT skip any step. Do NOT proceed to `complete_session` until all steps finish.**

**Step 1. REQUIRED - Check agent teams config:**

You MUST run this command first:
```bash
AGENT_TEAMS_ENABLED=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-get agent_teams.enabled --raw 2>/dev/null || echo "false")
MAX_TESTERS=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-get agent_teams.max_teammates --raw 2>/dev/null || echo "4")
SPECIALIST_MODEL=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-get agent_teams.specialist_model --raw 2>/dev/null || echo "sonnet")
```

**If AGENT_TEAMS_ENABLED=false:**
```
Agent teams not enabled. Run /gsd:settings to enable agent_teams.

Falling back to manual verification...
```
You MUST proceed to `present_test` instead. Do NOT continue with automated testing.

**Step 2. REQUIRED - Create verification team:**

You MUST create the team before spawning any agents:
```
TeamCreate(
  team_name="verify-{phase_number}",
  description="Automated UAT for phase {phase_number}"
)
```

**Step 3. REQUIRED - Create tasks for each test:**

For EACH test extracted from SUMMARY.md, you MUST create a task:
```
TaskCreate(
  subject="Test: {test_name}",
  description="""
  **Expected:** {expected}
  **Files:** {relevant files from SUMMARY.md}

  Verify this behavior is correctly implemented.
  Return: PASS, FAIL (with reason), or SKIP (if can't test automatically)
  """,
  activeForm="Testing {test_name}"
)
```

Do NOT skip any tests. Every test from SUMMARY.md MUST have a corresponding task.

**Step 4. REQUIRED - Spawn test agents as teammates:**

**Step 4a.** Determine agent type based on test characteristics:
- Contains "API", "endpoint", "request" → `backend-developer`
- Contains "UI", "component", "display", "render" → `voltagent-qa-sec:qa-expert`
- Contains "flow", "integration", "end-to-end" → `gsd-integration-checker`
- Default → `voltagent-qa-sec:qa-expert`

**Step 4b.** You MUST spawn agents in parallel (up to MAX_TESTERS concurrent):
```
Task(
  team_name="verify-{phase_number}",
  name="tester-{N}",
  subagent_type="{appropriate_agent}",
  model="{SPECIALIST_MODEL}",
  prompt="""
You are a test agent on team verify-{phase_number}.

<instructions>
1. Check TaskList for available test tasks
2. Claim a task (TaskUpdate with owner)
3. Read the relevant files
4. Verify the expected behavior
5. Update task with result:
   - PASS: Mark completed, add "PASS: [brief confirmation]" to description
   - FAIL: Mark completed, add "FAIL: [what's wrong]" to description
   - SKIP: Mark completed, add "SKIP: [reason]" to description
6. Repeat until no tasks remain
7. Send message to orchestrator when done
</instructions>
  """,
  description="Test agent {N} for phase {phase_number}"
)
```

**Step 5. REQUIRED - Monitor team completion:**

You MUST wait for ALL test tasks to be completed. Use SendMessage to coordinate. Do NOT proceed until every task has status `completed`.

**Step 6. REQUIRED - Collect results and update UAT.md:**

For EACH completed task, you MUST:
- Parse result from task description (PASS/FAIL/SKIP)
- Map to UAT format (pass/issue/skipped)
- If FAIL: extract reason, infer severity using severity_inference rules
- Update UAT.md Tests section with result

Do NOT skip any task results. Every task MUST be recorded in UAT.md.

**Step 7. REQUIRED - Cleanup team:**

You MUST delete the team after collecting all results:
```
TeamDelete(team_name="verify-{phase_number}")
```

**Step 8.** Proceed to `complete_session` (which handles specialist verification)
</step>

<step name="present_test">
**If AUTO_MODE=true:** Skip this step — automated_testing already handled verification. Proceed directly to `complete_session`.

**Present current test to user:**

Read Current Test section from UAT file.

Display using checkpoint box format:

```
╔══════════════════════════════════════════════════════════════╗
║  CHECKPOINT: Verification Required                           ║
╚══════════════════════════════════════════════════════════════╝

**Test {number}: {name}**

{expected}

──────────────────────────────────────────────────────────────
→ Type "pass" or describe what's wrong
──────────────────────────────────────────────────────────────
```

Wait for user response (plain text, no AskUserQuestion).
</step>

<step name="process_response">
**Process user response and update file:**

**If response indicates pass:**
- Empty response, "yes", "y", "ok", "pass", "next", "approved", "✓"

Update Tests section:
```
### {N}. {name}
expected: {expected}
result: pass
```

**If response indicates skip:**
- "skip", "can't test", "n/a"

Update Tests section:
```
### {N}. {name}
expected: {expected}
result: skipped
reason: [user's reason if provided]
```

**If response is anything else:**
- Treat as issue description

Infer severity from description:
- Contains: crash, error, exception, fails, broken, unusable → blocker
- Contains: doesn't work, wrong, missing, can't → major
- Contains: slow, weird, off, minor, small → minor
- Contains: color, font, spacing, alignment, visual → cosmetic
- Default if unclear: major

Update Tests section:
```
### {N}. {name}
expected: {expected}
result: issue
reported: "{verbatim user response}"
severity: {inferred}
```

Append to Gaps section (structured YAML for plan-phase --gaps):
```yaml
- truth: "{expected behavior from test}"
  status: failed
  reason: "User reported: {verbatim user response}"
  severity: {inferred}
  test: {N}
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis
```

**After any response:**

Update Summary counts.
Update frontmatter.updated timestamp.

If more tests remain → Update Current Test, go to `present_test`
If no more tests → Go to `complete_session`
</step>

<step name="resume_from_file">
**Resume testing from UAT file:**

Read the full UAT file.

Find first test with `result: [pending]`.

Announce:
```
Resuming: Phase {phase} UAT
Progress: {passed + issues + skipped}/{total}
Issues found so far: {issues count}

Continuing from Test {N}...
```

Update Current Test section with the pending test.
Proceed to `present_test`.
</step>

<step name="complete_session">
**Complete testing and commit:**

Update frontmatter:
- status: complete
- updated: [now]

Clear Current Test section:
```
## Current Test

[testing complete]
```

Commit the UAT file:
```bash
node ~/.claude/get-shit-done/bin/gsd-tools.cjs commit "test({phase_num}): complete UAT - {passed} passed, {issues} issues" --files ".planning/phases/XX-name/{phase_num}-UAT.md"
```

Present summary:
```
## UAT Complete: Phase {phase}

| Result | Count |
|--------|-------|
| Passed | {N}   |
| Issues | {N}   |
| Skipped| {N}   |

[If issues > 0:]
### Issues Found

[List from Issues section]
```

**If issues > 0:** Proceed to `diagnose_issues`

**If issues == 0:**

**CRITICAL: You MUST execute ALL of the following steps in order. Do NOT skip to "Next Steps" until specialist verification is complete.**

**Step 1.** Display UAT completion:
```
All tests passed or skipped. No issues found.
```

**Step 2. REQUIRED - Run this command NOW before proceeding:**
```bash
node -e "
const fs=require('fs');
const cfg=JSON.parse(fs.readFileSync('.planning/config.json','utf8'));
const enabled = cfg.agent_teams?.enabled || false;
const tier = cfg.verification?.default_tier || 2;
console.log('ENABLED=' + enabled);
console.log('TIER=' + tier);
"
```

**Step 3. REQUIRED if ENABLED=true - Spawn verification specialists:**

You MUST spawn these specialists based on TIER. Do NOT skip this step. Do NOT display "Next Steps" until specialists complete.

**Step 3a.** (All tiers) Spawn code-reviewer - REQUIRED:
```
Task(
  subagent_type="code-reviewer",
  description="Code review phase files",
  prompt="Review source files modified in this phase for code quality. Focus on: patterns, bugs, maintainability. Return 3-5 line summary."
)
```

**Step 3b.** (Tier 2, 3) Spawn qa-expert - REQUIRED for tier >= 2:
```
Task(
  subagent_type="qa-expert",
  description="QA review phase",
  prompt="Review test coverage and quality for this phase. Focus on: edge cases, error handling. Return 3-5 line summary."
)
```

**Step 3c.** (Tier 3 only) Spawn architect-reviewer - REQUIRED for tier 3:
```
Task(
  subagent_type="voltagent-qa-sec:architect-reviewer",
  description="Architecture review phase",
  prompt="Review architecture and production-readiness for this phase. Focus on: scalability, patterns. Return 3-5 line summary."
)
```

**Step 4. REQUIRED - Wait for ALL Tasks then compile findings:**
```
---
## Specialist Verification Summary

### Code Review (code-reviewer)
[Summarize findings from code-reviewer Task]

### QA Review (qa-expert)
[Summarize findings from qa-expert Task - or N/A if tier < 2]

### Architecture Review (architect-reviewer)
[Summarize findings from architect-reviewer Task - or N/A if tier < 3]

### Overall Assessment
- Critical issues: [count]
- Recommendations for next phase: [list]
```

**Step 5. Display next steps (only AFTER specialist verification or if ENABLED=false):**
```
---
Verification Complete

Next Steps:
- /gsd:plan-phase {next} — Plan next phase
- /gsd:execute-phase {next} — Execute next phase
```
</step>

<step name="specialist_verification_legacy" conditional="false">
**DEPRECATED - specialist verification is now inline in complete_session**

**Prerequisites:** Agent teams feature enabled in config (`agent_teams.enabled: true`).

**1. Determine verification tier from plans:**

```bash
# Read verification tier from plan frontmatter
VERIFICATION_TIER=$(grep -h "^tier:" "$PHASE_DIR"/*-PLAN.md 2>/dev/null | head -1 | cut -d: -f2 | tr -d ' ' || echo "1")

# Load tier overrides from config
TIER_CONFIG=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-get verification.tier_overrides 2>/dev/null || echo "{}")
```

**2. Map tier to verification specialists:**

| Tier | Specialists | Focus Areas |
|------|-------------|-------------|
| 1 | code-reviewer | Code quality, patterns |
| 2 | code-reviewer, qa-expert | + Test coverage, edge cases |
| 3 | code-reviewer, qa-expert, principal-engineer | + Architecture, security, production-readiness |

```bash
case $VERIFICATION_TIER in
  1) SPECIALISTS="voltagent-qa-sec:code-reviewer" ;;
  2) SPECIALISTS="voltagent-qa-sec:code-reviewer voltagent-qa-sec:qa-expert" ;;
  3) SPECIALISTS="voltagent-qa-sec:code-reviewer voltagent-qa-sec:qa-expert voltagent-core-dev:principal-engineer" ;;
  *) SPECIALISTS="voltagent-qa-sec:code-reviewer" ;;
esac
```

**3. Create verification team:**

```
TeamCreate(
  team_name="verify-${PHASE_NUMBER}",
  description="Specialist verification for phase ${PHASE_NUMBER}"
)
```

**4. Spawn verification specialists:**

```bash
# Get files modified from SUMMARY.md files
FILES_MODIFIED=$(grep -h "^- " "$PHASE_DIR"/*-SUMMARY.md | grep -E "\.(ts|js|py|go|rs|java)$" | sort -u)

for SPECIALIST in $SPECIALISTS; do
  SPECIALIST_NAME=$(echo "$SPECIALIST" | cut -d: -f2)

  # Define focus area per specialist
  case $SPECIALIST_NAME in
    code-reviewer) FOCUS="Code quality, design patterns, security vulnerabilities, maintainability" ;;
    qa-expert) FOCUS="Test coverage, edge cases, error handling, integration points" ;;
    principal-engineer) FOCUS="Architecture alignment, scalability, production readiness, technical debt" ;;
    *) FOCUS="General code review" ;;
  esac

  Task(
    team_name="verify-${PHASE_NUMBER}",
    name="${SPECIALIST_NAME}",
    subagent_type="${SPECIALIST}",
    model="${checker_model}",
    prompt="
You are a verification specialist reviewing phase ${PHASE_NUMBER} implementation.

**Your role:** ${SPECIALIST_NAME}
**Focus area:** ${FOCUS}

## Files to Review

${FILES_MODIFIED}

## Instructions

1. Read all modified files
2. Review with your specialist focus area in mind
3. Create findings as team tasks via TaskCreate:
   - severity: critical/major/minor/cosmetic
   - file: path to affected file
   - line: line number(s) if applicable
   - issue: description of the problem
   - recommendation: suggested fix

4. Return structured summary:
   ```
   ## ${SPECIALIST_NAME} Review

   **Files reviewed:** [count]
   **Issues found:** [count by severity]

   ### Critical Issues
   [list]

   ### Recommendations
   [list]
   ```
"
  )
done
```

**5. Monitor verification team:**

```bash
echo "Verification specialists reviewing implementation..."

while true; do
  TASK_STATUS=$(TaskList(team_name="verify-${PHASE_NUMBER}"))

  COMPLETED=$(echo "$TASK_STATUS" | jq '[.[] | select(.status == "completed")] | length')
  TOTAL=$(echo "$TASK_STATUS" | jq 'length')

  if [ "$COMPLETED" -eq "$TOTAL" ]; then
    echo "All specialists complete."
    break
  fi

  sleep 15
done
```

**6. Aggregate findings and update UAT:**

```bash
# Collect all findings from team tasks
FINDINGS=$(TaskList(team_name="verify-${PHASE_NUMBER}") | jq '[.[] | select(.subject | startswith("finding:"))]')

# Count by severity
CRITICAL=$(echo "$FINDINGS" | jq '[.[] | select(.description | contains("severity: critical"))] | length')
MAJOR=$(echo "$FINDINGS" | jq '[.[] | select(.description | contains("severity: major"))] | length')
MINOR=$(echo "$FINDINGS" | jq '[.[] | select(.description | contains("severity: minor"))] | length')

# Append specialist findings to UAT.md
cat >> "$PHASE_DIR/${PHASE_NUMBER}-UAT.md" << EOF

## Specialist Verification

**Tier:** $VERIFICATION_TIER
**Specialists:** $(echo $SPECIALISTS | tr ' ' ', ')

### Findings Summary

| Severity | Count |
|----------|-------|
| Critical | $CRITICAL |
| Major    | $MAJOR |
| Minor    | $MINOR |

### Detailed Findings

$(echo "$FINDINGS" | jq -r '.[] | "- **\(.subject)**: \(.description)"')
EOF

# Cleanup verification team
TeamDelete(team_name="verify-${PHASE_NUMBER}")

echo "Specialist verification complete. Findings added to UAT.md"
```

**7. Handle critical findings:**

If critical findings > 0:
- Block automatic progression
- Add critical issues to Gaps section
- Require explicit user acknowledgment before proceeding

If no critical findings:
- Proceed to diagnose_issues (if UAT issues exist)
- Otherwise, display:
```
---
Specialist verification complete. No critical issues.

Next Steps:
- /gsd:plan-phase {next} — Plan next phase
- /gsd:execute-phase {next} — Execute next phase
```
</step>

<step name="diagnose_issues">
**Diagnose root causes before planning fixes:**

```
---

{N} issues found. Diagnosing root causes...

Spawning parallel debug agents to investigate each issue.
```

- Load diagnose-issues workflow
- Follow @~/.claude/get-shit-done/workflows/diagnose-issues.md
- Spawn parallel debug agents for each issue
- Collect root causes
- Update UAT.md with root causes

**After diagnosis, check routing:**

```bash
AUTO_INSERT_PHASES=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-get workflow.auto_insert_fix_phases --raw 2>/dev/null || echo "false")
```

- **If AUTO_INSERT_PHASES=true:** Proceed to `auto_insert_fix_phases`
- **If AUTO_INSERT_PHASES=false:** Proceed to `plan_gap_closure`

Diagnosis runs automatically - no user prompt. Parallel agents investigate simultaneously, so overhead is minimal and fixes are more accurate.
</step>

<step name="auto_insert_fix_phases" conditional="AUTO_INSERT_PHASES=true">
**CRITICAL: You MUST execute ALL of the following steps in order. Do NOT skip any step. Do NOT proceed to next steps until each step completes.**

This step enables fully autonomous fix cycles. Instead of planning fixes within the current phase, we create new phases for each fix, allowing them to go through the standard plan→execute→verify cycle.

**Step 1. REQUIRED - Display status:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► AUTO-INSERTING FIX PHASES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Creating fix phases from diagnosed gaps...
```

**Step 2. REQUIRED - Read diagnosed gaps from UAT.md:**

You MUST read the UAT file and parse the Gaps section:
```bash
cat "${phase_dir}/${phase_num}-UAT.md"
```

Extract each gap's: `truth`, `reason`, `severity`, `root_cause`, `artifacts`, `missing`

**Step 3. REQUIRED - Group gaps into logical fix phases:**

You MUST group gaps using these rules:
- Same affected file/component → combine into one fix phase
- Same subsystem (auth, API, UI) → combine
- Dependency order (fix stubs before wiring)
- Keep phases focused: 1-3 gaps each

Do NOT create one phase per gap unless gaps are completely unrelated.

**Step 4. REQUIRED - Create fix phases:**

For EACH grouped fix phase, you MUST run:

**Step 4a.** Generate descriptive name from gaps:
```bash
FIX_NAME="Fix: {primary issue summary}"
```

**Step 4b.** Insert as decimal phase after current phase - REQUIRED:
```bash
RESULT=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs phase insert "${phase_number}" "${FIX_NAME}")
```

**Step 4c.** Extract from result: `new_phase_number`, `directory`, `slug`

**Step 5. REQUIRED - Create GAPS.md for each new fix phase:**

For EACH new fix phase directory, you MUST write a context file:

```bash
cat > "${directory}/GAPS.md" << 'EOF'
---
source_phase: {phase_number}
source_uat: {phase_dir}/{phase_num}-UAT.md
created: {timestamp}
---

## Gaps to Close

### Gap {N}: {truth}

**Severity:** {severity}
**Root Cause:** {root_cause}
**Reported:** {reason}

**Artifacts:**
{list artifacts}

**Missing:**
{list missing items}
EOF
```

Do NOT skip this step. The GAPS.md file is consumed by `/gsd:plan-phase` to understand what to fix.

**Step 6. REQUIRED - Update STATE.md:**

You MUST add entry under "Roadmap Evolution":
```
- Phases {X.1}, {X.2}... inserted after Phase {X}: Fix phases from UAT (AUTO)
```

**Step 7. REQUIRED - Commit changes:**

```bash
node ~/.claude/get-shit-done/bin/gsd-tools.cjs commit "fix({phase_num}): create fix phases from UAT gaps" --files .planning/ROADMAP.md .planning/STATE.md .planning/phases/*
```

**Step 8. REQUIRED - Present completion (only AFTER all previous steps complete):**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► FIX PHASES CREATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Source:** Phase {phase_number} UAT
**Gaps diagnosed:** {N}
**Fix phases created:** {M}

| Phase | Name | Gaps |
|-------|------|------|
| {X.1} | {name} | {gap list} |
| {X.2} | {name} | {gap list} |

Each fix phase has a GAPS.md with full diagnosis context.

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Plan first fix phase:**

`/gsd:plan-phase {X.1}`

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Or for fully autonomous execution:**

`/gsd:execute-phase {X.1} --auto`  (if auto-planning enabled)

───────────────────────────────────────────────────────────────
```

**Exit workflow** — fix phases are now tracked in roadmap for standard execution. Do NOT proceed to `plan_gap_closure`.
</step>

<step name="plan_gap_closure">
**Auto-plan fixes from diagnosed gaps:**

Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PLANNING FIXES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning planner for gap closure...
```

Spawn gsd-planner in --gaps mode:

```
Task(
  prompt="""
<planning_context>

**Phase:** {phase_number}
**Mode:** gap_closure

<files_to_read>
- {phase_dir}/{phase_num}-UAT.md (UAT with diagnoses)
- .planning/STATE.md (Project State)
- .planning/ROADMAP.md (Roadmap)
</files_to_read>

</planning_context>

<downstream_consumer>
Output consumed by /gsd:execute-phase
Plans must be executable prompts.
</downstream_consumer>
""",
  subagent_type="gsd-planner",
  model="{planner_model}",
  description="Plan gap fixes for Phase {phase}"
)
```

On return:
- **PLANNING COMPLETE:** Proceed to `verify_gap_plans`
- **PLANNING INCONCLUSIVE:** Report and offer manual intervention
</step>

<step name="verify_gap_plans">
**Verify fix plans with checker:**

Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► VERIFYING FIX PLANS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning plan checker...
```

Initialize: `iteration_count = 1`

Spawn gsd-plan-checker:

```
Task(
  prompt="""
<verification_context>

**Phase:** {phase_number}
**Phase Goal:** Close diagnosed gaps from UAT

<files_to_read>
- {phase_dir}/*-PLAN.md (Plans to verify)
</files_to_read>

</verification_context>

<expected_output>
Return one of:
- ## VERIFICATION PASSED — all checks pass
- ## ISSUES FOUND — structured issue list
</expected_output>
""",
  subagent_type="gsd-plan-checker",
  model="{checker_model}",
  description="Verify Phase {phase} fix plans"
)
```

On return:
- **VERIFICATION PASSED:** Proceed to `present_ready`
- **ISSUES FOUND:** Proceed to `revision_loop`
</step>

<step name="revision_loop">
**Iterate planner ↔ checker until plans pass (max 3):**

**If iteration_count < 3:**

Display: `Sending back to planner for revision... (iteration {N}/3)`

Spawn gsd-planner with revision context:

```
Task(
  prompt="""
<revision_context>

**Phase:** {phase_number}
**Mode:** revision

<files_to_read>
- {phase_dir}/*-PLAN.md (Existing plans)
</files_to_read>

**Checker issues:**
{structured_issues_from_checker}

</revision_context>

<instructions>
Read existing PLAN.md files. Make targeted updates to address checker issues.
Do NOT replan from scratch unless issues are fundamental.
</instructions>
""",
  subagent_type="gsd-planner",
  model="{planner_model}",
  description="Revise Phase {phase} plans"
)
```

After planner returns → spawn checker again (verify_gap_plans logic)
Increment iteration_count

**If iteration_count >= 3:**

Display: `Max iterations reached. {N} issues remain.`

Offer options:
1. Force proceed (execute despite issues)
2. Provide guidance (user gives direction, retry)
3. Abandon (exit, user runs /gsd:plan-phase manually)

Wait for user response.
</step>

<step name="present_ready">
**Present completion and next steps:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► FIXES READY ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase {X}: {Name}** — {N} gap(s) diagnosed, {M} fix plan(s) created

| Gap | Root Cause | Fix Plan |
|-----|------------|----------|
| {truth 1} | {root_cause} | {phase}-04 |
| {truth 2} | {root_cause} | {phase}-04 |

Plans verified and ready for execution.

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Execute fixes** — run fix plans

`/clear` then `/gsd:execute-phase {phase} --gaps-only`

───────────────────────────────────────────────────────────────
```
</step>

</process>

<update_rules>
**Batched writes for efficiency:**

Keep results in memory. Write to file only when:
1. **Issue found** — Preserve the problem immediately
2. **Session complete** — Final write before commit
3. **Checkpoint** — Every 5 passed tests (safety net)

| Section | Rule | When Written |
|---------|------|--------------|
| Frontmatter.status | OVERWRITE | Start, complete |
| Frontmatter.updated | OVERWRITE | On any file write |
| Current Test | OVERWRITE | On any file write |
| Tests.{N}.result | OVERWRITE | On any file write |
| Summary | OVERWRITE | On any file write |
| Gaps | APPEND | When issue found |

On context reset: File shows last checkpoint. Resume from there.
</update_rules>

<severity_inference>
**Infer severity from user's natural language:**

| User says | Infer |
|-----------|-------|
| "crashes", "error", "exception", "fails completely" | blocker |
| "doesn't work", "nothing happens", "wrong behavior" | major |
| "works but...", "slow", "weird", "minor issue" | minor |
| "color", "spacing", "alignment", "looks off" | cosmetic |

Default to **major** if unclear. User can correct if needed.

**Never ask "how severe is this?"** - just infer and move on.
</severity_inference>

<success_criteria>
- [ ] UAT file created with all tests from SUMMARY.md
- [ ] Tests presented one at a time with expected behavior
- [ ] User responses processed as pass/issue/skip
- [ ] Severity inferred from description (never asked)
- [ ] Batched writes: on issue, every 5 passes, or completion
- [ ] Committed on completion
- [ ] If issues: parallel debug agents diagnose root causes
- [ ] If issues: gsd-planner creates fix plans (gap_closure mode)
- [ ] If issues: gsd-plan-checker verifies fix plans
- [ ] If issues: revision loop until plans pass (max 3 iterations)
- [ ] Ready for `/gsd:execute-phase --gaps-only` when complete
</success_criteria>
