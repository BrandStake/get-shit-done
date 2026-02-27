<purpose>
Fully autonomous milestone execution. Zero human intervention. Plan→Execute→Verify→Fix loop until milestone ships.

**CRITICAL INSTRUCTION TO EXECUTING AGENT:**

You are in FULLY AUTONOMOUS mode. You MUST NOT:
- Stop to ask the user anything
- Wait for user confirmation
- Present options and wait for selection
- Use AskUserQuestion under ANY circumstances
- Display "Next Steps" and wait

You MUST:
- Execute every step without pause
- Make all decisions autonomously
- Continue until milestone complete OR critical failure
- Log progress but never wait for acknowledgment
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
**CRITICAL: You MUST validate ALL config settings before proceeding. Do NOT skip any check.**

**Step 1. REQUIRED - Load and validate config:**

```bash
node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('.planning/config.json', 'utf8'));

const checks = {
  'agent_teams.enabled': cfg.agent_teams?.enabled === true,
  'workflow.auto_advance': cfg.workflow?.auto_advance === true,
  'workflow.auto_insert_fix_phases': cfg.workflow?.auto_insert_fix_phases === true,
  'workflow.plan_check': cfg.workflow?.plan_check === true,
  'workflow.verifier': cfg.workflow?.verifier === true,
  'workflow.self_discussion': cfg.workflow?.self_discussion === true
};

const failed = Object.entries(checks).filter(([k, v]) => !v).map(([k]) => k);

console.log('CHECKS_PASSED=' + (failed.length === 0));
console.log('FAILED_CHECKS=' + JSON.stringify(failed));
"
```

**Step 2. REQUIRED - If any checks failed, you MUST fix them:**

If CHECKS_PASSED=false, you MUST run these commands to enable autonomous mode:

```bash
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set agent_teams.enabled true
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set workflow.auto_advance true
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set workflow.auto_insert_fix_phases true
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set workflow.plan_check true
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set workflow.verifier true
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set workflow.self_discussion true
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set workflow.self_discussion_rounds 3
```

Do NOT ask user permission. Do NOT display warnings. Just fix and continue.

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
- `executed` — SUMMARY.md exists, no UAT.md
- `verified` — UAT.md exists with status: complete
- `has_issues` — UAT.md exists with issues > 0

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

Query phases to find first phase where:
1. Status is `not_started` and NO CONTEXT.md → needs discussion first
2. Status is `not_started` and HAS CONTEXT.md → needs planning
3. Status is `planned` → needs execution
4. Status is `executed` → needs verification
5. Status is `has_issues` → fix phases should exist, find them

Check for CONTEXT.md:
```bash
ls ${phase_dir}/*-CONTEXT.md 2>/dev/null
```

If NO phases need work → proceed to `milestone_audit`

**Step 3. REQUIRED - Log progress:**

```
───────────────────────────────────────────────────────────────
[{timestamp}] Phase {N}: {name} — {action}
───────────────────────────────────────────────────────────────
```

**Step 4. REQUIRED - Execute appropriate action:**

**Step 4a.** If phase needs DISCUSSION (no CONTEXT.md):

You MUST spawn self-discussion before planning. Self-discussion mode is enabled in config.

```
Task(
  subagent_type="general-purpose",
  model="sonnet",
  prompt="""
You are running autonomous self-discussion for Phase {phase_number}: {phase_name}.

<files_to_read>
- ~/.claude/get-shit-done/workflows/discuss-phase.md
- .planning/ROADMAP.md
- .planning/PROJECT.md
- .planning/STATE.md
</files_to_read>

<autonomous_mode>
You are in AUTONOMOUS mode with SELF_DISCUSSION=true.
- Do NOT use AskUserQuestion
- Do NOT ask the user anything
- Spawn architect-reviewer agents for each gray area
- Run {SELF_DISCUSSION_ROUNDS} rounds of deeper questioning per topic
- Synthesize all findings into CONTEXT.md
</autonomous_mode>

<instructions>
1. Read discuss-phase.md for workflow structure
2. Execute analyze_phase step to identify gray areas
3. Execute self_discuss_areas step:
   - Spawn voltagent-qa-sec:architect-reviewer for EACH gray area in PARALLEL
   - Each agent conducts {SELF_DISCUSSION_ROUNDS} rounds of analysis
   - Collect all recommendations
4. Execute write_context step with synthesized decisions
5. Commit CONTEXT.md
6. Return: DISCUSSION COMPLETE
</instructions>
""",
  description="Self-discuss phase {phase_number} (autonomous)"
)
```

After discussion completes, continue to planning (do not re-enter loop yet).

**Step 4b.** If phase needs PLANNING:

You MUST spawn gsd-planner directly. Do NOT use /gsd:plan-phase interactively.

```
Task(
  subagent_type="gsd-planner",
  model="sonnet",
  prompt="""
<planning_context>
**Phase:** {phase_number}
**Phase Name:** {phase_name}
**Mode:** autonomous

<files_to_read>
- .planning/ROADMAP.md
- .planning/STATE.md
- .planning/PROJECT.md
- .planning/phases/{phase_dir}/ (all files)
</files_to_read>
</planning_context>

<autonomous_mode>
You are in AUTONOMOUS mode. Do NOT ask questions. Do NOT wait for approval.
Make all decisions based on context. Create complete, executable plans.
</autonomous_mode>

<downstream_consumer>
Output consumed by gsd-executor. Plans must be executable prompts.
</downstream_consumer>
""",
  description="Plan phase {phase_number} (autonomous)"
)
```

After planner completes, spawn checker:

```
Task(
  subagent_type="gsd-plan-checker",
  model="sonnet",
  prompt="""
<verification_context>
**Phase:** {phase_number}

<files_to_read>
- .planning/phases/{phase_dir}/*-PLAN.md
</files_to_read>
</verification_context>

Return: VERIFICATION PASSED or ISSUES FOUND with specific fixes needed.
""",
  description="Check phase {phase_number} plans"
)
```

If checker finds issues, loop planner→checker up to 3 times. Then proceed regardless.

**Step 4c.** If phase needs EXECUTION:

You MUST spawn gsd-executor directly:

```
Task(
  subagent_type="gsd-executor",
  model="sonnet",
  prompt="""
<execution_context>
**Phase:** {phase_number}
**Mode:** autonomous

<files_to_read>
- .planning/phases/{phase_dir}/*-PLAN.md (all plans)
</files_to_read>
</execution_context>

<autonomous_mode>
You are in AUTONOMOUS mode. Execute all tasks. Make atomic commits.
Do NOT ask questions. Do NOT wait for approval. Just execute.
</autonomous_mode>
""",
  description="Execute phase {phase_number} (autonomous)"
)
```

**Step 4d.** If phase needs VERIFICATION:

You MUST spawn verification with --auto mode:

```
Task(
  subagent_type="general-purpose",
  model="sonnet",
  prompt="""
Execute /gsd:verify-work {phase_number} --auto

You are in AUTONOMOUS mode. Do NOT ask questions. Do NOT present tests interactively.
Use automated testing via agent teams. Record all results to UAT.md.

If issues are found:
1. Diagnosis runs automatically
2. Fix phases are auto-inserted (workflow.auto_insert_fix_phases is enabled)
3. Return with list of fix phases created

If no issues:
1. Complete specialist verification
2. Return success
""",
  description="Verify phase {phase_number} (autonomous)"
)
```

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
Task(
  subagent_type="gsd-integration-checker",
  model="sonnet",
  prompt="""
Audit milestone {milestone_version} for completion.

<files_to_read>
- .planning/ROADMAP.md
- .planning/REQUIREMENTS.md
- .planning/STATE.md
- .planning/phases/**/SUMMARY.md
- .planning/phases/**/*-UAT.md
</files_to_read>

Check:
1. All requirements satisfied
2. All phases verified
3. All E2E flows working
4. No unresolved gaps

Return:
- AUDIT PASSED — milestone ready for completion
- AUDIT FAILED — list gaps that need phases
""",
  description="Audit milestone {milestone_version}"
)
```

**Step 2. If AUDIT FAILED:**

You MUST create fix phases for gaps:

```
Task(
  subagent_type="general-purpose",
  model="sonnet",
  prompt="""
Execute /gsd:plan-milestone-gaps

You are in AUTONOMOUS mode. Create all fix phases needed.
Do NOT ask user which gaps to include. Include ALL must/should gaps.
Defer only nice-to-have gaps.
""",
  description="Create gap closure phases"
)
```

After fix phases created, return to `main_loop` to execute them.

**Step 3. If AUDIT PASSED:**

Proceed to `complete_milestone`.
</step>

<step name="complete_milestone">
**CRITICAL: Milestone complete. You MUST archive it. Do NOT stop here.**

**Step 1. REQUIRED - Complete and archive milestone:**

```bash
# Archive milestone
node ~/.claude/get-shit-done/bin/gsd-tools.cjs milestone complete "${milestone_version}"
```

**Step 2. REQUIRED - Commit completion:**

```bash
node ~/.claude/get-shit-done/bin/gsd-tools.cjs commit "milestone(${milestone_version}): complete" --files .planning/
```

**Step 3. REQUIRED - Display completion:**

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
