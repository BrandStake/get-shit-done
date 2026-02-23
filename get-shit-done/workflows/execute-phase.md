<purpose>
Execute all plans in a phase using wave-based parallel execution. Orchestrator stays lean — delegates plan execution to subagents.
</purpose>

<core_principle>
Orchestrator coordinates, not executes. Each subagent loads the full execute-plan context. Orchestrator: discover plans → analyze deps → group waves → spawn agents → handle checkpoints → collect results.
</core_principle>

<required_reading>
Read STATE.md before any operation to load project context.
</required_reading>

<process>

<step name="initialize" priority="first">
Load all context in one call:

```bash
INIT=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs init execute-phase "${PHASE_ARG}")
```

Parse JSON for: `executor_model`, `verifier_model`, `commit_docs`, `parallelization`, `branching_strategy`, `branch_name`, `phase_found`, `phase_dir`, `phase_number`, `phase_name`, `phase_slug`, `plans`, `incomplete_plans`, `plan_count`, `incomplete_count`, `state_exists`, `roadmap_exists`.

**If `phase_found` is false:** Error — phase directory not found.
**If `plan_count` is 0:** Error — no plans found in phase.
**If `state_exists` is false but `.planning/` exists:** Offer reconstruct or continue.

When `parallelization` is false, plans within a wave execute sequentially.

**Generate fresh agent roster for specialist validation:**

```bash
node ~/.claude/get-shit-done/bin/gsd-tools.cjs agents enumerate --output .planning/available_agents.md
```

This creates an up-to-date roster of available VoltAgent specialists, excluding GSD system agents (gsd-*). The roster is used for specialist validation before spawning.
</step>

<step name="handle_branching">
Check `branching_strategy` from init:

**"none":** Skip, continue on current branch.

**"phase" or "milestone":** Use pre-computed `branch_name` from init:
```bash
git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"
```

All subsequent commits go to this branch. User handles merging.
</step>

<step name="validate_phase">
From init JSON: `phase_dir`, `plan_count`, `incomplete_count`.

Report: "Found {plan_count} plans in {phase_dir} ({incomplete_count} incomplete)"
</step>

<step name="discover_and_group_plans">
Load plan inventory with wave grouping in one call:

```bash
PLAN_INDEX=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs phase-plan-index "${PHASE_NUMBER}")
```

Parse JSON for: `phase`, `plans[]` (each with `id`, `wave`, `autonomous`, `objective`, `files_modified`, `task_count`, `has_summary`), `waves` (map of wave number → plan IDs), `incomplete`, `has_checkpoints`.

**Filtering:** Skip plans where `has_summary: true`. If `--gaps-only`: also skip non-gap_closure plans. If all filtered: "No matching incomplete plans" → exit.

Report:
```
## Execution Plan

**Phase {X}: {Name}** — {total_plans} plans across {wave_count} waves

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1 | 01-01, 01-02 | {from plan objectives, 3-8 words} |
| 2 | 01-03 | ... |
```
</step>

<step name="execute_waves">
Execute each wave in sequence. Within a wave: parallel if `PARALLELIZATION=true`, sequential if `false`.

**For each wave:**

1. **Describe what's being built (BEFORE spawning):**

   Read each plan's `<objective>`. Extract what's being built and why.

   ```
   ---
   ## Wave {N}

   **{Plan ID}: {Plan Name}**
   {2-3 sentences: what this builds, technical approach, why it matters}

   Spawning {count} agent(s)...
   ---
   ```

   - Bad: "Executing terrain generation plan"
   - Good: "Procedural terrain generator using Perlin noise — creates height maps, biome zones, and collision meshes. Required before vehicle physics can interact with ground."

2. **Validate specialist availability and spawn executor agents:**

   **Before spawning, validate specialist if task has specialist field:**

   Read task frontmatter from plan file to check for specialist assignment:
   ```bash
   # Extract specialist field from task frontmatter
   SPECIALIST=$(grep -A 10 "^<task" {plan_file} | grep "^specialist:" | head -n 1 | sed 's/specialist:\s*//' | xargs)

   # If specialist assigned, validate availability
   if [ -n "$SPECIALIST" ] && [ "$SPECIALIST" != "gsd-executor" ]; then
     # Check if specialist exists in available_agents.md
     if [ ! -f .planning/available_agents.md ]; then
       echo "Warning: available_agents.md missing, falling back to gsd-executor" >&2
       SPECIALIST="gsd-executor"
     elif ! grep -q "^- \*\*${SPECIALIST}\*\*:" .planning/available_agents.md; then
       echo "Warning: Specialist '${SPECIALIST}' not available, falling back to gsd-executor" >&2
       SPECIALIST="gsd-executor"
     fi
   else
     # No specialist assigned or already gsd-executor
     SPECIALIST="gsd-executor"
   fi
   ```

   **Spawn with validated specialist:**

   Pass paths only — executors read files themselves with their fresh 200k context.
   This keeps orchestrator context lean (~10-15%).

   ```
   Task(
     subagent_type="${SPECIALIST}",
     model="{executor_model}",
     prompt="
       <objective>
       Execute plan {plan_number} of phase {phase_number}-{phase_name}.
       Commit each task atomically. Create SUMMARY.md. Update STATE.md and ROADMAP.md.
       </objective>

       <execution_context>
       @~/.claude/get-shit-done/workflows/execute-plan.md
       @~/.claude/get-shit-done/templates/summary.md
       @~/.claude/get-shit-done/references/checkpoints.md
       @~/.claude/get-shit-done/references/tdd.md
       </execution_context>

       <files_to_read>
       Read these files at execution start using the Read tool:
       - {phase_dir}/{plan_file} (Plan)
       - .planning/STATE.md (State)
       - .planning/config.json (Config, if exists)
       - ./CLAUDE.md (Project instructions, if exists — follow project-specific guidelines and coding conventions)
       - .agents/skills/ (Project skills, if exists — list skills, read SKILL.md for each, follow relevant rules during implementation)
       </files_to_read>

       <success_criteria>
       - [ ] All tasks executed
       - [ ] Each task committed individually
       - [ ] SUMMARY.md created in plan directory
       - [ ] STATE.md updated with position and decisions
       - [ ] ROADMAP.md updated with plan progress (via `roadmap update-plan-progress`)
       </success_criteria>
     "
   )
   ```

   **Error handling:**
   - If available_agents.md missing → log error, fall back to gsd-executor
   - If specialist field malformed → treat as null (use gsd-executor)
   - If specialist not found in roster → log warning, fall back to gsd-executor

3. **Wait for all agents in wave to complete.**

4. **Report completion — spot-check claims first:**

   For each SUMMARY.md:
   - Verify first 2 files from `key-files.created` exist on disk
   - Check `git log --oneline --all --grep="{phase}-{plan}"` returns ≥1 commit
   - Check for `## Self-Check: FAILED` marker

   If ANY spot-check fails: report which plan failed, route to failure handler — ask "Retry plan?" or "Continue with remaining waves?"

   If pass, proceed to verification (if tier > 0):

   **Verification (if tier > 0):**

   After each task completes successfully, determine verification needs:

   ```bash
   # Load verification configuration
   VERIFICATION_CONFIG=$(cat .planning/config.json 2>/dev/null | jq '.verification // {}')
   VERIFICATION_ENABLED=$(echo "$VERIFICATION_CONFIG" | jq -r '.enabled // true')
   DEFAULT_TIER=$(echo "$VERIFICATION_CONFIG" | jq -r '.default_tier // 1')
   TIER_OVERRIDES=$(echo "$VERIFICATION_CONFIG" | jq -r '.tier_overrides // {}')
   REQUIRED_SPECIALISTS=$(echo "$VERIFICATION_CONFIG" | jq -r '.required_specialists[]' 2>/dev/null)
   FAIL_ON_MISSING=$(echo "$VERIFICATION_CONFIG" | jq -r '.fail_on_missing_required // false')

   # Check if verification is enabled
   if [ "$VERIFICATION_ENABLED" = "false" ]; then
     echo "Verification disabled in config.json, skipping"
     continue
   fi

   # Check for environment override
   if [ "$SKIP_VERIFICATION" = "true" ]; then
     echo "SKIP_VERIFICATION set, bypassing verification"
     continue
   fi

   # Extract task description and modified files from SUMMARY.md
   TASK_DESC=$(grep -A 2 "## What Was Built" {phase_dir}/{plan_id}-SUMMARY.md | tail -n 1)
   MODIFIED_FILES=$(grep -A 10 "key-files:" {phase_dir}/{plan_id}-SUMMARY.md | grep "  - " | sed 's/  - //' | tr '\n' ' ')

   # Determine verification tier
   TIER_INFO=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs determine-verification-tier "$TASK_DESC" "$MODIFIED_FILES" --check-available --raw)
   TIER=$(echo "$TIER_INFO" | jq -r '.tier')
   TIER_REASON=$(echo "$TIER_INFO" | jq -r '.reason')

   # Check for config-based tier overrides
   for KEYWORD in authentication payments database security; do
     if echo "$TASK_DESC" | grep -qi "$KEYWORD"; then
       OVERRIDE_TIER=$(echo "$TIER_OVERRIDES" | jq -r ".${KEYWORD} // 0")
       if [ "$OVERRIDE_TIER" -gt 0 ]; then
         echo "Config override: $KEYWORD tasks use Tier $OVERRIDE_TIER"
         TIER=$OVERRIDE_TIER
       fi
     fi
   done

   # Generate specialist list based on tier
   case $TIER in
     1) SPECIALIST_LIST="code-reviewer" ;;
     2) SPECIALIST_LIST="code-reviewer qa-expert" ;;
     3) SPECIALIST_LIST="code-reviewer qa-expert principal-engineer" ;;
     *) SPECIALIST_LIST="" ;;
   esac

   # Check specialist availability against available_agents.md
   AVAILABLE_SPECIALISTS=""
   for SPECIALIST in $SPECIALIST_LIST; do
     if grep -q "^- \*\*${SPECIALIST}\*\*:" .planning/available_agents.md 2>/dev/null; then
       AVAILABLE_SPECIALISTS="$AVAILABLE_SPECIALISTS $SPECIALIST"
     else
       echo "Warning: ${SPECIALIST} not available" >&2
     fi
   done

   # Check required specialists availability
   SKIP_VERIFICATION=false
   for SPECIALIST in $REQUIRED_SPECIALISTS; do
     if ! grep -q "^- \*\*${SPECIALIST}\*\*:" .planning/available_agents.md 2>/dev/null; then
       if [ "$FAIL_ON_MISSING" = "true" ]; then
         echo "ERROR: Required specialist ${SPECIALIST} not available"
         exit 1
       else
         echo "Warning: Required specialist ${SPECIALIST} not available, skipping verification"
         SKIP_VERIFICATION=true
       fi
     fi
   done

   # Skip if required specialists missing
   if [ "$SKIP_VERIFICATION" = "true" ]; then
     echo "Skipping verification due to missing required specialists"
     continue
   fi

   # Log the verification plan
   echo "Verification Tier $TIER detected - Specialists: $AVAILABLE_SPECIALISTS"

   # Generate verification brief before spawning specialist
   cat > /tmp/verification-brief.md << EOF
# Verification Brief

## Task: {task_name from plan}
**Plan:** {plan_id}
**Type:** {task_type from plan}
**Tier:** $TIER ($TIER_REASON)

## What was built
$TASK_DESC

## Files modified
$MODIFIED_FILES

## Verification focus
Based on Tier $TIER, focus on:
$(if [ "$TIER" = "1" ]; then
    echo "- Code quality and consistent patterns"
    echo "- Obvious bugs or logic errors"
    echo "- Basic error handling"
  elif [ "$TIER" = "2" ]; then
    echo "- Code quality and patterns"
    echo "- Test coverage and edge cases"
    echo "- Comprehensive error handling"
    echo "- Integration points"
  elif [ "$TIER" = "3" ]; then
    echo "- Security vulnerabilities and attack vectors"
    echo "- Performance and scalability concerns"
    echo "- Production readiness and monitoring"
    echo "- Complete test coverage"
    echo "- Error recovery and resilience"
  fi)

## Success criteria from plan
{Extract done criteria from task in plan file}
EOF

   # Handle case where no specialists are available
   if [ -z "$AVAILABLE_SPECIALISTS" ]; then
     echo "Warning: No verification specialists available, skipping verification"
     VERIFICATION_PASSED=true
   else
     # Spawn verification specialists
     echo "Spawning verification specialists..."
     VERIFICATION_PASSED=true
     AGGREGATED_ISSUES=""
     AGGREGATED_SUGGESTIONS=""

     # Process each specialist
     for SPECIALIST in $AVAILABLE_SPECIALISTS; do
       echo "Spawning ${SPECIALIST} for verification..."

       # Define specialist focus area
       case $SPECIALIST in
         code-reviewer) FOCUS_AREA="Code quality, patterns, security vulnerabilities" ;;
         qa-expert) FOCUS_AREA="Test coverage, edge cases, quality metrics" ;;
         principal-engineer) FOCUS_AREA="Architecture, scalability, production readiness" ;;
         *) FOCUS_AREA="General verification" ;;
       esac

       # Create context file for this specialist
       cat > /tmp/specialist-context.md << EOF
# Specialist Verification Context

**Specialist:** ${SPECIALIST}
**Focus Area:** ${FOCUS_AREA}
**Previous findings:** ${AGGREGATED_ISSUES:-None}

Review with emphasis on: ${FOCUS_AREA}
EOF

       # Spawn the specialist
       VERIFICATION_RESULT=$(Task(
         subagent_type="${SPECIALIST}",
         model="{verifier_model}",
         prompt="
           <objective>
           Review the implementation from plan {plan_id} of phase {phase_number}.
           Verify ${FOCUS_AREA}.
           </objective>

           <files_to_read>
           - /tmp/verification-brief.md (Verification context and focus)
           - /tmp/specialist-context.md (Your specific focus area)
           - {phase_dir}/{plan_file} (Plan requirements)
           - {phase_dir}/{plan_id}-SUMMARY.md (What was built)
           - {modified_files from SUMMARY.md} (Changed code to review)
           </files_to_read>

           <verification_focus>
           As ${SPECIALIST}, focus on: ${FOCUS_AREA}
           </verification_focus>

           Return structured result:
           - status: PASS/FAIL/WARNING
           - issues: list of problems found (if any)
           - suggestions: improvements (non-blocking)
         "
       ))

       # Parse result status
       VERIFICATION_STATUS=$(echo "$VERIFICATION_RESULT" | grep -o "status: [A-Z]*" | cut -d' ' -f2)
       VERIFICATION_ISSUES=$(echo "$VERIFICATION_RESULT" | sed -n '/issues:/,/suggestions:/p' | grep "^- " | sed 's/^- //')
       VERIFICATION_SUGGESTIONS=$(echo "$VERIFICATION_RESULT" | sed -n '/suggestions:/,$p' | grep "^- " | sed 's/^- //')

       # Handle failures
       if [ "$VERIFICATION_STATUS" = "FAIL" ]; then
         VERIFICATION_PASSED=false
         AGGREGATED_ISSUES="${AGGREGATED_ISSUES}## ${SPECIALIST}:
${VERIFICATION_ISSUES}

"

         # For Tier 3, stop on first failure
         if [ "$TIER" = "3" ]; then
           echo "Tier 3 verification failed at ${SPECIALIST}, stopping chain"
           break
         fi
       elif [ "$VERIFICATION_STATUS" = "WARNING" ]; then
         # Accumulate warnings but don't fail
         AGGREGATED_ISSUES="${AGGREGATED_ISSUES}## ${SPECIALIST} (warning):
${VERIFICATION_ISSUES}

"
       fi

       # Accumulate suggestions
       if [ -n "$VERIFICATION_SUGGESTIONS" ]; then
         AGGREGATED_SUGGESTIONS="${AGGREGATED_SUGGESTIONS}## ${SPECIALIST}:
${VERIFICATION_SUGGESTIONS}

"
       fi
     done

     # Aggregate verification results
     echo "Aggregating verification results..."

     # Determine overall verification status
     if [ "$VERIFICATION_PASSED" = "false" ]; then
       echo "VERIFICATION FAILED - Issues found:"
       echo "$AGGREGATED_ISSUES"

       # Ask user for decision
       echo "Verification failed. Options:"
       echo "1. Fix issues and retry task"
       echo "2. Continue anyway (acknowledge technical debt)"
       echo "3. Skip remaining tasks in this plan"
       read -p "Choice (1/2/3): " USER_CHOICE

       case $USER_CHOICE in
         1) RETRY_TASK=true ;;
         2) CONTINUE_WITH_DEBT=true ;;
         3) SKIP_PLAN=true ;;
       esac
     else
       echo "Verification PASSED - Task approved by all specialists"
     fi
   fi

   # Log verification results to SUMMARY.md
   cat >> {phase_dir}/{plan_id}-SUMMARY.md << EOF

## Verification

**Tier:** $TIER ($TIER_REASON)
**Specialists:** ${AVAILABLE_SPECIALISTS:-None available}
**Status:** ${VERIFICATION_PASSED}

$(if [ -n "$AGGREGATED_ISSUES" ]; then
    echo "### Issues Found"
    echo "$AGGREGATED_ISSUES"
  fi)

$(if [ -n "$AGGREGATED_SUGGESTIONS" ]; then
    echo "### Suggestions (non-blocking)"
    echo "$AGGREGATED_SUGGESTIONS"
  fi)
EOF

   # Handle verification result
   if [ "$VERIFICATION_PASSED" = "false" ]; then
     echo "❌ Verification FAILED for plan {plan_id}"

     # Handle user choice
     if [ "$RETRY_TASK" = "true" ]; then
       echo "Retrying task with fixes..."
       # Re-spawn executor to fix issues
     elif [ "$CONTINUE_WITH_DEBT" = "true" ]; then
       echo "⚠️ Continuing with known issues (technical debt logged)"
     elif [ "$SKIP_PLAN" = "true" ]; then
       echo "Skipping remaining tasks in plan"
       # Exit plan execution
     fi
   elif [ "$VERIFICATION_PASSED" = "true" ] && [ -n "$AGGREGATED_ISSUES" ]; then
     echo "⚠️ Verification passed with warnings for plan {plan_id}"
     # Warnings logged to SUMMARY.md, continue execution
   else
     echo "✓ Verification PASSED for plan {plan_id}"
   fi
   ```

   **Graceful degradation:**
   - If code-reviewer not available, log warning and skip verification
   - Check available_agents.md before spawning
   - If specialist spawn fails, log error but don't block plan completion

   After verification (or skip), report completion:
   ```
   ---
   ## Wave {N} Complete

   **{Plan ID}: {Plan Name}**
   {What was built — from SUMMARY.md}
   {Notable deviations, if any}
   {Verification status, if performed}

   {If more waves: what this enables for next wave}
   ---
   ```

   - Bad: "Wave 2 complete. Proceeding to Wave 3."
   - Good: "Terrain system complete — 3 biome types, height-based texturing, physics collision meshes. Vehicle physics (Wave 3) can now reference ground surfaces."

5. **Handle failures:**

   **Known Claude Code bug (classifyHandoffIfNeeded):** If an agent reports "failed" with error containing `classifyHandoffIfNeeded is not defined`, this is a Claude Code runtime bug — not a GSD or agent issue. The error fires in the completion handler AFTER all tool calls finish. In this case: run the same spot-checks as step 4 (SUMMARY.md exists, git commits present, no Self-Check: FAILED). If spot-checks PASS → treat as **successful**. If spot-checks FAIL → treat as real failure below.

   For real failures: report which plan failed → ask "Continue?" or "Stop?" → if continue, dependent plans may also fail. If stop, partial completion report.

6. **Execute checkpoint plans between waves** — see `<checkpoint_handling>`.

7. **Proceed to next wave.**
</step>

<step name="checkpoint_handling">
Plans with `autonomous: false` require user interaction.

**Auto-mode checkpoint handling:**

Read auto-advance config:
```bash
AUTO_CFG=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-get workflow.auto_advance 2>/dev/null || echo "false")
```

When executor returns a checkpoint AND `AUTO_CFG` is `"true"`:
- **human-verify** → Auto-spawn continuation agent with `{user_response}` = `"approved"`. Log `⚡ Auto-approved checkpoint`.
- **decision** → Auto-spawn continuation agent with `{user_response}` = first option from checkpoint details. Log `⚡ Auto-selected: [option]`.
- **human-action** → Present to user (existing behavior below). Auth gates cannot be automated.

**Standard flow (not auto-mode, or human-action type):**

1. Spawn agent for checkpoint plan
2. Agent runs until checkpoint task or auth gate → returns structured state
3. Agent return includes: completed tasks table, current task + blocker, checkpoint type/details, what's awaited
4. **Present to user:**
   ```
   ## Checkpoint: [Type]

   **Plan:** 03-03 Dashboard Layout
   **Progress:** 2/3 tasks complete

   [Checkpoint Details from agent return]
   [Awaiting section from agent return]
   ```
5. User responds: "approved"/"done" | issue description | decision selection
6. **Spawn continuation agent (NOT resume)** using continuation-prompt.md template:
   - `{completed_tasks_table}`: From checkpoint return
   - `{resume_task_number}` + `{resume_task_name}`: Current task
   - `{user_response}`: What user provided
   - `{resume_instructions}`: Based on checkpoint type
7. Continuation agent verifies previous commits, continues from resume point
8. Repeat until plan completes or user stops

**Why fresh agent, not resume:** Resume relies on internal serialization that breaks with parallel tool calls. Fresh agents with explicit state are more reliable.

**Checkpoints in parallel waves:** Agent pauses and returns while other parallel agents may complete. Present checkpoint, spawn continuation, wait for all before next wave.
</step>

<step name="aggregate_results">
After all waves:

```markdown
## Phase {X}: {Name} Execution Complete

**Waves:** {N} | **Plans:** {M}/{total} complete

| Wave | Plans | Status |
|------|-------|--------|
| 1 | plan-01, plan-02 | ✓ Complete |
| CP | plan-03 | ✓ Verified |
| 2 | plan-04 | ✓ Complete |

### Plan Details
1. **03-01**: [one-liner from SUMMARY.md]
2. **03-02**: [one-liner from SUMMARY.md]

### Issues Encountered
[Aggregate from SUMMARYs, or "None"]
```
</step>

<step name="close_parent_artifacts">
**For decimal/polish phases only (X.Y pattern):** Close the feedback loop by resolving parent UAT and debug artifacts.

**Skip if** phase number has no decimal (e.g., `3`, `04`) — only applies to gap-closure phases like `4.1`, `03.1`.

**1. Detect decimal phase and derive parent:**
```bash
# Check if phase_number contains a decimal
if [[ "$PHASE_NUMBER" == *.* ]]; then
  PARENT_PHASE="${PHASE_NUMBER%%.*}"
fi
```

**2. Find parent UAT file:**
```bash
PARENT_INFO=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs find-phase "${PARENT_PHASE}" --raw)
# Extract directory from PARENT_INFO JSON, then find UAT file in that directory
```

**If no parent UAT found:** Skip this step (gap-closure may have been triggered by VERIFICATION.md instead).

**3. Update UAT gap statuses:**

Read the parent UAT file's `## Gaps` section. For each gap entry with `status: failed`:
- Update to `status: resolved`

**4. Update UAT frontmatter:**

If all gaps now have `status: resolved`:
- Update frontmatter `status: diagnosed` → `status: resolved`
- Update frontmatter `updated:` timestamp

**5. Resolve referenced debug sessions:**

For each gap that has a `debug_session:` field:
- Read the debug session file
- Update frontmatter `status:` → `resolved`
- Update frontmatter `updated:` timestamp
- Move to resolved directory:
```bash
mkdir -p .planning/debug/resolved
mv .planning/debug/{slug}.md .planning/debug/resolved/
```

**6. Commit updated artifacts:**
```bash
node ~/.claude/get-shit-done/bin/gsd-tools.cjs commit "docs(phase-${PARENT_PHASE}): resolve UAT gaps and debug sessions after ${PHASE_NUMBER} gap closure" --files .planning/phases/*${PARENT_PHASE}*/*-UAT.md .planning/debug/resolved/*.md
```
</step>

<step name="verify_phase_goal">
Verify phase achieved its GOAL, not just completed tasks.

```bash
PHASE_REQ_IDS=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs roadmap get-phase "${PHASE_NUMBER}" | jq -r '.section' | grep -i "Requirements:" | sed 's/.*Requirements:\*\*\s*//' | sed 's/[\[\]]//g')
```

```
Task(
  prompt="Verify phase {phase_number} goal achievement.
Phase directory: {phase_dir}
Phase goal: {goal from ROADMAP.md}
Phase requirement IDs: {phase_req_ids}
Check must_haves against actual codebase.
Cross-reference requirement IDs from PLAN frontmatter against REQUIREMENTS.md — every ID MUST be accounted for.
Create VERIFICATION.md.",
  subagent_type="gsd-verifier",
  model="{verifier_model}"
)
```

Read status:
```bash
grep "^status:" "$PHASE_DIR"/*-VERIFICATION.md | cut -d: -f2 | tr -d ' '
```

| Status | Action |
|--------|--------|
| `passed` | → update_roadmap |
| `human_needed` | Present items for human testing, get approval or feedback |
| `gaps_found` | Present gap summary, offer `/gsd:plan-phase {phase} --gaps` |

**If human_needed:**
```
## ✓ Phase {X}: {Name} — Human Verification Required

All automated checks passed. {N} items need human testing:

{From VERIFICATION.md human_verification section}

"approved" → continue | Report issues → gap closure
```

**If gaps_found:**
```
## ⚠ Phase {X}: {Name} — Gaps Found

**Score:** {N}/{M} must-haves verified
**Report:** {phase_dir}/{phase_num}-VERIFICATION.md

### What's Missing
{Gap summaries from VERIFICATION.md}

---
## ▶ Next Up

`/gsd:plan-phase {X} --gaps`

<sub>`/clear` first → fresh context window</sub>

Also: `cat {phase_dir}/{phase_num}-VERIFICATION.md` — full report
Also: `/gsd:verify-work {X}` — manual testing first
```

Gap closure cycle: `/gsd:plan-phase {X} --gaps` reads VERIFICATION.md → creates gap plans with `gap_closure: true` → user runs `/gsd:execute-phase {X} --gaps-only` → verifier re-runs.
</step>

<step name="update_roadmap">
**Mark phase complete and update all tracking files:**

```bash
COMPLETION=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs phase complete "${PHASE_NUMBER}")
```

The CLI handles:
- Marking phase checkbox `[x]` with completion date
- Updating Progress table (Status → Complete, date)
- Updating plan count to final
- Advancing STATE.md to next phase
- Updating REQUIREMENTS.md traceability

Extract from result: `next_phase`, `next_phase_name`, `is_last_phase`.

```bash
node ~/.claude/get-shit-done/bin/gsd-tools.cjs commit "docs(phase-{X}): complete phase execution" --files .planning/ROADMAP.md .planning/STATE.md .planning/REQUIREMENTS.md {phase_dir}/*-VERIFICATION.md
```
</step>

<step name="offer_next">

**Exception:** If `gaps_found`, the `verify_phase_goal` step already presents the gap-closure path (`/gsd:plan-phase {X} --gaps`). No additional routing needed — skip auto-advance.

**No-transition check (spawned by auto-advance chain):**

Parse `--no-transition` flag from $ARGUMENTS.

**If `--no-transition` flag present:**

Execute-phase was spawned by plan-phase's auto-advance. Do NOT run transition.md.
After verification passes and roadmap is updated, return completion status to parent:

```
## PHASE COMPLETE

Phase: ${PHASE_NUMBER} - ${PHASE_NAME}
Plans: ${completed_count}/${total_count}
Verification: {Passed | Gaps Found}

[Include aggregate_results output]
```

STOP. Do not proceed to auto-advance or transition.

**If `--no-transition` flag is NOT present:**

**Auto-advance detection:**

1. Parse `--auto` flag from $ARGUMENTS
2. Read `workflow.auto_advance` from config:
   ```bash
   AUTO_CFG=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-get workflow.auto_advance 2>/dev/null || echo "false")
   ```

**If `--auto` flag present OR `AUTO_CFG` is true (AND verification passed with no gaps):**

```
╔══════════════════════════════════════════╗
║  AUTO-ADVANCING → TRANSITION             ║
║  Phase {X} verified, continuing chain    ║
╚══════════════════════════════════════════╝
```

Execute the transition workflow inline (do NOT use Task — orchestrator context is ~10-15%, transition needs phase completion data already in context):

Read and follow `~/.claude/get-shit-done/workflows/transition.md`, passing through the `--auto` flag so it propagates to the next phase invocation.

**If neither `--auto` nor `AUTO_CFG` is true:**

The workflow ends. The user runs `/gsd:progress` or invokes the transition workflow manually.
</step>

</process>

<context_efficiency>
Orchestrator: ~10-15% context. Subagents: fresh 200k each. No polling (Task blocks). No context bleed.
</context_efficiency>

<failure_handling>
- **classifyHandoffIfNeeded false failure:** Agent reports "failed" but error is `classifyHandoffIfNeeded is not defined` → Claude Code bug, not GSD. Spot-check (SUMMARY exists, commits present) → if pass, treat as success
- **Agent fails mid-plan:** Missing SUMMARY.md → report, ask user how to proceed
- **Dependency chain breaks:** Wave 1 fails → Wave 2 dependents likely fail → user chooses attempt or skip
- **All agents in wave fail:** Systemic issue → stop, report for investigation
- **Checkpoint unresolvable:** "Skip this plan?" or "Abort phase execution?" → record partial progress in STATE.md
</failure_handling>

<resumption>
Re-run `/gsd:execute-phase {phase}` → discover_plans finds completed SUMMARYs → skips them → resumes from first incomplete plan → continues wave execution.

STATE.md tracks: last completed plan, current wave, pending checkpoints.
</resumption>
