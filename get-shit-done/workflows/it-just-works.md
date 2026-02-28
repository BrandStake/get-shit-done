<purpose>
Fully autonomous milestone execution. Zero human intervention. Plan→Execute→Verify→Fix loop until milestone ships.

**CRITICAL INSTRUCTION TO EXECUTING AGENT:**

You are in FULLY AUTONOMOUS mode. You MUST NOT:
- Stop to ask the user anything
- Wait for user confirmation
- Present options and wait for selection
- Use AskUserQuestion under ANY circumstances
- Display "Next Steps" and wait
- Stop for context warnings (see below)

You MUST:
- Execute every step without pause
- Make all decisions autonomously
- Continue until milestone complete OR critical failure
- Log progress but never wait for acknowledgment

**CONTEXT WINDOW HANDLING:**

IGNORE all context monitor warnings ("CONTEXT MONITOR WARNING/CRITICAL"). Do NOT stop execution when you receive these warnings. Here's why:

1. Claude Code AUTOMATICALLY compacts context when it fills up
2. All workflow state is persisted in files (ROADMAP.md, STATE.md, phase directories)
3. After compaction, you will receive a summary of prior work
4. Simply continue the main loop from wherever the summary indicates

When context compacts:
- Re-read the phase status (main_loop Step 2)
- Continue from the first non-verified phase
- Do NOT display pause messages or ask user to restart

The ONLY reasons to stop are:
- Milestone complete (all phases verified + audit passed)
- MAX_PHASES limit reached
- Critical build/compile failure that cannot be auto-fixed
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="parse_arguments" priority="first">
Parse command arguments:

```bash
MAX_PHASES=50
DRY_RUN=false

# Parse --max-phases N
if [[ "$ARGUMENTS" =~ --max-phases[[:space:]]+([0-9]+) ]]; then
  MAX_PHASES="${BASH_REMATCH[1]}"
fi

# Parse --dry-run
if [[ "$ARGUMENTS" == *"--dry-run"* ]]; then
  DRY_RUN=true
fi
```
</step>

<step name="validate_config">
**CRITICAL: You MUST configure optimal autonomous settings before proceeding.**

**Step 1. REQUIRED - Apply full autonomous configuration:**

For it-just-works mode, we don't check existing config - we ALWAYS apply optimal settings.
This ensures consistent autonomous behavior regardless of prior configuration.

```bash
# Core settings
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set model_profile quality
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set mode yolo
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set depth comprehensive

# Workflow settings
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set workflow.research true
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set workflow.plan_check true
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set workflow.verifier true
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set workflow.auto_advance true
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set workflow.auto_insert_fix_phases true
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set workflow.self_discussion true
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set workflow.self_discussion_rounds 3

# Parallelization settings
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set parallelization.enabled true
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set parallelization.plan_level true
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set parallelization.task_level false
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set parallelization.max_concurrent_agents 3

# Agent teams settings - ALWAYS use teams
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set agent_teams.enabled true
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set agent_teams.mode always
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set agent_teams.min_tasks_for_team 3
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set agent_teams.min_domains_for_team 2
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set agent_teams.specialist_model opus
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set agent_teams.fallback_on_failure true
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set agent_teams.max_teammates 5
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set agent_teams.task_timeout_minutes 10

# Verification settings
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set verification.enabled true
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set verification.default_tier 2
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set verification.tier_overrides.authentication 3
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set verification.tier_overrides.payments 3
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set verification.tier_overrides.database 3
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set verification.tier_overrides.security 3
```

**Step 2. REQUIRED - Display applied configuration:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 AUTONOMOUS CONFIG APPLIED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 • Model: quality (opus for discussion/planning)
 • Mode: yolo (no confirmations)
 • Depth: comprehensive
 • Agent Teams: always (specialists per domain)
 • Verification: tier 2 default, tier 3 for critical paths

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Do NOT ask user permission. Do NOT display warnings. Just apply and continue.

**Step 3. REQUIRED - Validate project structure:**

```bash
ls .planning/ROADMAP.md .planning/STATE.md .planning/PROJECT.md 2>/dev/null
```

If any file missing:
```
CRITICAL FAILURE: Project not properly initialized.
Missing: {list missing files}

Run /gsd:new-project first.
```
EXIT workflow. This is the ONLY acceptable early exit.
</step>

<step name="load_milestone_state">
**CRITICAL: You MUST determine current milestone state. Do NOT guess.**

**Step 1. REQUIRED - Get milestone info:**

```bash
INIT=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs state load)
```

Extract: `current_milestone`, `milestone_version`, `total_phases`, `completed_phases`

**Step 2. REQUIRED - Get all phases and their status:**

```bash
PHASES=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs phases list)
```

For each phase, determine status:
- `not_started` — No PLAN.md exists
- `planned` — PLAN.md exists, no SUMMARY.md
- `executed` — SUMMARY.md exists, no VERIFICATION.md
- `verified` — VERIFICATION.md exists with status: passed
- `has_issues` — VERIFICATION.md exists with status: gaps_found or issues_found

**Step 3. REQUIRED - Initialize loop counter:**

```bash
PHASES_EXECUTED=0
```
</step>

<step name="dry_run_report" conditional="DRY_RUN=true">
**If --dry-run flag set, display report and exit:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► IT JUST WORKS - DRY RUN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Milestone:** {milestone_version}
**Config:** All autonomous settings enabled
**Max Phases:** {MAX_PHASES}

**Phase Status:**
| Phase | Name | Status |
|-------|------|--------|
{for each phase}
| {N} | {name} | {status} |
{end for}

**Execution Plan:**
1. {first phase needing work} — {what will happen}
2. Continue until all phases verified
3. Audit milestone
4. Fix any gaps
5. Complete milestone

**Ready to execute.** Remove --dry-run to start autonomous execution.
```

EXIT workflow.
</step>

<step name="display_start">
**Step 1. REQUIRED - Display autonomous mode banner:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► IT JUST WORKS - AUTONOMOUS MODE ENGAGED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Milestone:** {milestone_version}
**Phases:** {total_phases} total, {completed_phases} complete
**Max Iterations:** {MAX_PHASES}

AUTONOMOUS EXECUTION STARTING. NO HUMAN INTERVENTION REQUIRED.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Do NOT wait for acknowledgment. Proceed immediately.
</step>

<step name="main_loop">
**CRITICAL: This is the main autonomous execution loop. You MUST NOT exit this loop until milestone is complete or MAX_PHASES reached.**

```
LOOP_START:
```

**Step 1. REQUIRED - Check loop limit:**

```bash
if [ "$PHASES_EXECUTED" -ge "$MAX_PHASES" ]; then
  echo "MAX_PHASES limit reached ($MAX_PHASES)"
  # Proceed to milestone_audit anyway
fi
```

**Step 2. REQUIRED - Find next phase needing work:**

For each phase in order, check what exists and determine next action:

```bash
# For each phase directory, check file existence to determine status
PHASE_DIR=".planning/phases/{phase_dir}"

# Check what files exist
HAS_CONTEXT=$(ls "$PHASE_DIR"/*-CONTEXT.md 2>/dev/null | wc -l)
HAS_PLANS=$(ls "$PHASE_DIR"/*-PLAN.md 2>/dev/null | wc -l)
HAS_SUMMARY=$(ls "$PHASE_DIR"/*-SUMMARY.md 2>/dev/null | wc -l)
HAS_VERIFICATION=$(ls "$PHASE_DIR"/*-VERIFICATION.md 2>/dev/null | wc -l)

# Determine phase status based on files
if [ "$HAS_VERIFICATION" -gt 0 ]; then
  # Check if verification passed (status: passed)
  VERIFY_STATUS=$(grep -l "status: passed" "$PHASE_DIR"/*-VERIFICATION.md 2>/dev/null | wc -l)
  if [ "$VERIFY_STATUS" -gt 0 ]; then
    PHASE_STATUS="verified"  # Phase complete, skip to next
  else
    PHASE_STATUS="has_issues"  # Verification failed, needs fixes
  fi
elif [ "$HAS_SUMMARY" -gt 0 ]; then
  PHASE_STATUS="executed"  # Needs verification
elif [ "$HAS_PLANS" -gt 0 ]; then
  PHASE_STATUS="planned"  # Needs execution
elif [ "$HAS_CONTEXT" -gt 0 ]; then
  PHASE_STATUS="discussed"  # Needs planning
else
  PHASE_STATUS="not_started"  # Needs discussion
fi
```

**Status → Action mapping:**
- `not_started` → run `/gsd:discuss-phase`
- `discussed` → run `/gsd:plan-phase`
- `planned` → run `/gsd:execute-phase`
- `executed` → run `/gsd:verify-work --auto`
- `has_issues` → fix phases should already exist, find and execute them
- `verified` → skip to next phase

Find the FIRST phase that is NOT `verified`. If ALL phases are `verified` → proceed to `milestone_audit`

**Step 3. REQUIRED - Log progress:**

```
───────────────────────────────────────────────────────────────
[{timestamp}] Phase {N}: {name} — {action}
───────────────────────────────────────────────────────────────
```

**Step 4. REQUIRED - Execute appropriate action using existing GSD commands:**

**CRITICAL:** Use the Skill tool to invoke existing GSD commands directly. Do NOT duplicate their logic. Do NOT spawn agents to call commands.

**Step 4a.** If phase needs DISCUSSION (no CONTEXT.md):

Invoke discuss-phase directly:

```
Skill(skill="gsd:discuss-phase", args="{phase_number}")
```

The discuss-phase workflow handles everything: gray area analysis, architect-reviewer spawning, CONTEXT.md creation. With self_discussion=true (set in config), it runs autonomously.

After CONTEXT.md exists, continue to planning.

**Step 4b.** If phase needs PLANNING (no PLAN.md files):

Invoke plan-phase directly:

```
Skill(skill="gsd:plan-phase", args="{phase_number}")
```

The plan-phase workflow handles everything: research, planning, plan-checker verification. With mode=yolo (set in config), it runs without confirmations.

After PLAN.md files exist, continue to execution.

**Step 4c.** If phase needs EXECUTION (has PLAN.md, no SUMMARY.md):

Invoke execute-phase directly:

```
Skill(skill="gsd:execute-phase", args="{phase_number}")
```

The execute-phase workflow handles everything: team creation, specialist spawning, task monitoring, SUMMARY.md creation. With agent_teams.mode=always (set in config), it uses teams.

After SUMMARY.md files exist, continue to verification.

**Step 4d.** If phase needs VERIFICATION (has SUMMARY.md, no VERIFICATION.md):

Invoke verify-work with --auto flag:

```
Skill(skill="gsd:verify-work", args="{phase_number} --auto")
```

The verify-work workflow handles everything:
- Stage 1 (Structural): Must-haves, artifacts, key links, anti-patterns, specialist reviews
- Stage 2 (Functional): UAT tests via team-based automated testing

With --auto flag, it runs autonomously without interactive prompts.

If issues are found, fix phases are auto-inserted (workflow.auto_insert_fix_phases is enabled in config).

After VERIFICATION.md exists with status=passed, phase is done. Continue to next phase.

**Step 5. REQUIRED - Increment counter and loop:**

```bash
PHASES_EXECUTED=$((PHASES_EXECUTED + 1))
```

**Step 6. REQUIRED - Refresh phase status and continue:**

Re-run `phases list` to get updated status. New fix phases may have been inserted.

```
GOTO LOOP_START
```

Do NOT exit loop until no phases need work.
</step>

<step name="milestone_audit">
**CRITICAL: All phases complete. You MUST audit the milestone. Do NOT skip.**

**Step 1. REQUIRED - Run milestone audit:**

```
Skill(skill="gsd:audit-milestone", args="")
```

The audit-milestone workflow checks all requirements are satisfied and all phases verified.

**Step 2. If AUDIT FAILED:**

Create fix phases for gaps:

```
Skill(skill="gsd:plan-milestone-gaps", args="")
```

The plan-milestone-gaps workflow creates phases for all must/should gaps automatically.

After fix phases created, return to `main_loop` to execute them.

**Step 3. If AUDIT PASSED:**

Proceed to `complete_milestone`.
</step>

<step name="complete_milestone">
**CRITICAL: Milestone complete. You MUST archive it. Do NOT stop here.**

**Step 1. REQUIRED - Complete and archive milestone:**

```
Skill(skill="gsd:complete-milestone", args="")
```

The complete-milestone workflow archives the milestone and commits the completion.

**Step 2. REQUIRED - Display completion:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► MILESTONE COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Milestone:** {milestone_version}
**Phases Executed:** {PHASES_EXECUTED}
**Status:** SHIPPED

All phases planned, executed, verified, and archived.
Zero human intervention required.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## What's Next?

- `/gsd:new-milestone` — Start next milestone
- `git log --oneline -20` — Review commits
- Review archived milestone in `.planning/archive/`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

EXIT workflow. Milestone shipped.
</step>

<step name="handle_critical_failure">
**If at any point a CRITICAL failure occurs:**

Critical failures are:
- Build/compile errors that cannot be auto-fixed
- Missing dependencies that cannot be installed
- Git conflicts that require human resolution
- API/service outages

**Step 1. REQUIRED - Log failure:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► CRITICAL FAILURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase:** {current_phase}
**Error:** {error_description}
**Phases Completed:** {PHASES_EXECUTED}

This failure requires human intervention.

**To resume:** Fix the issue, then run:
`/gsd:it-just-works`

The workflow will continue from where it left off.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

EXIT workflow. Human intervention required.
</step>

</process>

<autonomous_principles>
**These principles MUST guide all decisions:**

1. **Never ask, always decide** — If multiple approaches exist, pick the most reasonable one and proceed.

2. **Never wait, always continue** — After any action completes, immediately proceed to the next.

3. **Never warn, always fix** — If something is misconfigured, fix it and continue.

4. **Never partial, always complete** — Every phase must be fully planned, executed, AND verified.

5. **Fail fast, fail loud** — If something truly cannot be auto-fixed, stop immediately with clear error.

6. **Progress over perfection** — A working solution now beats a perfect solution never.

7. **Ignore context warnings** — Context compaction is automatic. After compaction, re-read phase status and continue from where you left off. NEVER stop execution due to context limits.
</autonomous_principles>

<success_criteria>
- [ ] Config validated and auto-fixed if needed
- [ ] All phases planned (gsd-planner spawned for each)
- [ ] All phases executed (gsd-executor spawned for each)
- [ ] All phases verified (verify-work --auto for each)
- [ ] Fix phases auto-created and executed for any issues
- [ ] Milestone audit passed
- [ ] Milestone archived
- [ ] Zero human prompts throughout entire execution
</success_criteria>
