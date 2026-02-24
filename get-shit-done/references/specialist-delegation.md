# Specialist Delegation Architecture

Complete reference for VoltAgent specialist delegation in GSD.

## Architecture Overview

### Two Execution Modes

GSD supports two execution modes for specialist delegation:

| Mode | When Used | Token Cost | Coordination |
|------|-----------|------------|--------------|
| **Simple Mode** | Sequential tasks, single domain, cost-constrained | ~200k/3 agents | None |
| **Team Mode** | Complex phases, multi-domain, parallel execution | ~800k/3-person team | Full |

### Why Orchestrator-Only Delegation

**Architectural Constraint:** The Task() tool is only available to orchestrators (main Claude instance), not to subagents spawned via Task(). This is a fundamental limitation of the multi-agent architecture.

**Implication:** Only the execute-phase orchestrator can spawn specialists. Subagents like gsd-executor cannot delegate work to other agents.

**Error Manifestation:** If a subagent attempts Task() invocation, it fails with "classifyHandoffIfNeeded is not defined" or similar errors, as the Task tool is not in their tool manifest.

---

## Agent Teams Mode (New)

Agent Teams is an experimental Claude Code feature that enables true multi-agent coordination with persistent teammates, shared task lists, and inter-agent messaging.

**Prerequisites:**
1. Set environment variable: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
2. Enable in config: `agent_teams.enabled: true`

### Team Mode Architecture

```
execute-phase (Team Lead)
    │
    ├── TeamCreate("phase-{N}-{slug}")
    │
    ├── TaskCreate for each plan task
    │   └── Include dependencies via addBlockedBy
    │
    ├── Spawn specialist teammates
    │   ├── Task(team_name="...", name="python-specialist", subagent_type="voltagent-lang:python-pro")
    │   ├── Task(team_name="...", name="db-specialist", subagent_type="voltagent-data-ai:postgres-pro")
    │   └── ...
    │
    ├── Specialists self-claim tasks from shared TaskList
    │
    ├── SendMessage for coordination/handoffs
    │
    ├── Monitor progress, handle failures
    │
    ├── Aggregate results → SUMMARY.md
    │
    └── TeamDelete("phase-{N}-{slug}")
```

### Team Mode Benefits

| Benefit | Description |
|---------|-------------|
| **True Parallelization** | Multiple specialists work simultaneously |
| **Domain Expertise** | Right specialist for each task type |
| **Self-Organization** | Automatic work claiming reduces coordination |
| **Inter-Agent Communication** | Messaging enables handoffs and clarifications |
| **Plan Approval Gates** | Critical tasks require lead approval |

### Team Mode Configuration

**File:** `.planning/config.json`

```json
"agent_teams": {
  "enabled": false,
  "mode": "auto",
  "min_tasks_for_team": 5,
  "min_domains_for_team": 2,
  "teammate_mode": "in-process",
  "plan_approval_required": ["security", "database", "authentication"],
  "specialist_model": "sonnet",
  "fallback_on_failure": true,
  "max_teammates": 5,
  "task_timeout_minutes": 10,
  "stuck_task_threshold_minutes": 5
}
```

### Complexity Detection

Team mode triggers when:
- `mode: "always"` is set, OR
- `mode: "auto"` AND (task_count >= min_tasks_for_team OR unique_domains >= min_domains_for_team)

```bash
determine_execution_mode() {
  local task_count=$1
  local domain_count=$2
  local config_mode=$3

  if [ "$config_mode" = "always" ]; then
    echo "team"
  elif [ "$config_mode" = "never" ]; then
    echo "simple"
  elif [ "$task_count" -ge "$MIN_TASKS" ] || [ "$domain_count" -ge "$MIN_DOMAINS" ]; then
    echo "team"
  else
    echo "simple"
  fi
}
```

### Team Mode Task Flow

1. **Team Creation:**
   ```
   TeamCreate(
     team_name="phase-{phase_number}-{phase_slug}",
     description="Execute {phase_name}"
   )
   ```

2. **Task Creation:**
   ```
   For each task in plan:
     TaskCreate(
       subject="{task.name}",
       description="Plan: {plan_id}\nAction: {task.action}\nFiles: {task.files}",
       team_name="phase-{phase_number}-{phase_slug}"
     )

     # Add dependencies
     TaskUpdate(taskId={id}, addBlockedBy=[{dependency_ids}])
   ```

3. **Specialist Spawning:**
   ```
   For each unique domain:
     Task(
       team_name="phase-{phase_number}-{phase_slug}",
       name="{domain}-specialist",
       subagent_type="{domain}",
       prompt="Check TaskList, claim matching tasks, execute, commit."
     )
   ```

4. **Progress Monitoring:**
   ```
   while tasks_remaining > 0:
     status = TaskList(team_name="...")

     # Check for stuck tasks
     for task in status where duration > stuck_threshold:
       SendMessage(to=task.owner, content="Status check?")

     sleep(30)
   ```

5. **Result Aggregation:**
   ```
   results = TaskList(team_name="...", filter="completed")
   write_summary(results)
   TeamDelete(team_name="...")
   ```

### Plan Approval Gates

Critical domains require lead approval before specialists make changes:

```json
"plan_approval_required": ["security", "database", "authentication"]
```

**Flow:**
1. Specialist claims task in critical domain
2. Specialist enters plan mode (read-only)
3. Specialist proposes changes via SendMessage
4. Lead reviews and approves/rejects
5. Specialist proceeds only if approved

### Fallback Behavior

If `fallback_on_failure: true` and team creation fails:
1. Log warning
2. Fall back to simple mode (gsd-executor per plan)
3. Execution continues without team features

---

## Simple Mode (Current Default)

### Delegation Flow

```
┌─────────────┐
│ gsd-planner │ Analyzes tasks, assigns specialist field
└──────┬──────┘
       │
       v
┌──────────────────┐
│ execute-phase.md │ Orchestrator reads PLAN.md
└──────┬───────────┘
       │
       ├─ Parses specialist field from tasks
       ├─ Validates specialist availability
       ├─ Creates checkpoint before spawn
       ├─ Wraps spawn with timeout
       │
       v
┌────────────────┐
│  Task() spawn  │ Orchestrator invokes specialist
└────────┬───────┘
         │
         v
┌─────────────────┐
│ python-pro      │ VoltAgent specialist executes
│ typescript-pro  │
│ postgres-pro    │
│ etc.            │
└────────┬────────┘
         │
         v
┌──────────────────────┐
│ Result parsing       │ Multi-tier parser (Phase 09)
│ (execute-phase.md)   │
└──────┬───────────────┘
       │
       v
┌──────────────────┐
│ Commit + STATE   │ Orchestrator updates state
└──────────────────┘
```

### Decision Points

1. **Planning time:** gsd-planner assigns `specialist` field to tasks based on keyword matching
2. **Pre-spawn validation:** Orchestrator checks specialist availability via available_agents.md
3. **Fallback:** If specialist unavailable or null, orchestrator falls back to gsd-executor
4. **Timeout:** Specialist execution wrapped in 5-minute timeout (configurable)
5. **Error recovery:** Checkpoint rollback on failure, structured logging to specialist-errors.jsonl

## Implementation Details

### How Planner Assigns Specialists

**File:** `get-shit-done/agents/gsd-planner.md`

**Method:** Keyword pattern matching against task descriptions

**Process:**
1. Planner reads available_agents.md (generated by orchestrator at phase start)
2. For each task, scans description for domain keywords:
   - "python", "fastapi", "django" → python-pro
   - "typescript", "tsx", "react" → typescript-pro
   - "postgres", "sql", "migration" → postgres-pro
   - etc.
3. Assigns `specialist="specialist-name"` in task XML
4. Falls back to `specialist="null"` if no match or specialist unavailable

**Example task assignment:**
```xml
<task type="auto" specialist="python-pro">
  <name>Implement FastAPI authentication endpoint</name>
  <files>src/api/auth.py, src/models/user.py</files>
  <action>Create JWT-based auth endpoint...</action>
</task>
```

### How Orchestrator Parses Specialists

**File:** `get-shit-done/workflows/execute-phase.md`

**Function:** `parse_specialists_from_plan()`

**Process:**
1. Read PLAN.md file
2. Use XML parsing to extract `specialist` attribute from each `<task>` element
3. Build associative array: `SPECIALISTS[task_number]=specialist_name`
4. Call `validate_specialist()` for each entry (three-tier validation from Phase 08)

**Validation logic (Phase 08-02):**
```bash
validate_specialist() {
  local specialist="$1"

  # Tier 1: Null/empty check
  if [ -z "$specialist" ] || [ "$specialist" = "null" ]; then
    echo "gsd-executor"
    return
  fi

  # Tier 2: String "null" check
  if [ "$specialist" = "\"null\"" ] || [ "$specialist" = "'null'" ]; then
    echo "gsd-executor"
    return
  fi

  # Tier 3: Availability check
  if ! grep -q "^$specialist$" .planning/available_agents.md; then
    echo "gsd-executor"
    echo "WARNING: Specialist $specialist not available, falling back to gsd-executor" >&2
    return
  fi

  # Valid specialist
  echo "$specialist"
}
```

### Timeout and Checkpoint Mechanisms

**Timeout wrapper (Phase 10-01):**
```bash
handle_specialist_timeout() {
  local command="$1"
  local phase="$2"
  local plan="$3"
  local timeout="${SPECIALIST_TIMEOUT:-300}"  # 5 minutes default

  # Execute with timeout
  timeout -k 10s "${timeout}s" bash -c "$command"
  local exit_code=$?

  # Handle timeout codes
  if [ $exit_code -eq 124 ]; then
    echo "ERROR: Specialist timed out (SIGTERM after ${timeout}s)" >&2
    node gsd-tools.cjs log-specialist-error \
      --phase "$phase" --plan "$plan" \
      --error-type "timeout" --details "SIGTERM after ${timeout}s"
  elif [ $exit_code -eq 137 ]; then
    echo "ERROR: Specialist killed (SIGKILL after ${timeout}s + 10s grace)" >&2
    node gsd-tools.cjs log-specialist-error \
      --phase "$phase" --plan "$plan" \
      --error-type "timeout-kill" --details "SIGKILL after grace period"
  fi

  return $exit_code
}
```

**Checkpoint creation (Phase 10-01):**
```bash
create_checkpoint() {
  local phase="$1"
  local plan="$2"
  local specialist="$3"
  local timestamp=$(date +%s)

  # Create checkpoint commit
  git add -A
  git commit --no-verify -m "checkpoint: before ${specialist} spawn" >/dev/null 2>&1

  # Tag checkpoint
  local tag="checkpoint/${phase}-${plan}/${timestamp}"
  git tag "$tag"

  echo "$tag"
}

rollback_to_checkpoint() {
  local tag="$1"

  git reset --hard "$tag"
  git tag -d "$tag"

  echo "Rolled back to checkpoint: $tag" >&2
}
```

**Usage in orchestrator:**
```bash
# Before specialist spawn
CHECKPOINT=$(create_checkpoint "$PHASE" "$PLAN" "$SPECIALIST")

# Spawn specialist with timeout
RESULT=$(handle_specialist_timeout "Task(...)" "$PHASE" "$PLAN")
EXIT_CODE=$?

# Check result
if [ $EXIT_CODE -eq 0 ]; then
  # Success - cleanup checkpoint
  git tag -d "$CHECKPOINT"
else
  # Failure - rollback
  rollback_to_checkpoint "$CHECKPOINT"
fi
```

## Error Recovery Patterns

### Timeout Handling

**Default timeout:** 5 minutes (300 seconds)

**Configuration:** `SPECIALIST_TIMEOUT` environment variable

**Signal escalation:**
1. SIGTERM sent at timeout
2. 10-second grace period
3. SIGKILL if still running

**Exit codes:**
- `0` = Success
- `124` = SIGTERM timeout
- `137` = SIGKILL timeout

**Actions on timeout:**
1. Log structured error to specialist-errors.jsonl
2. Rollback to checkpoint (restore pre-spawn state)
3. Update STATE.md with blocker
4. Continue with next task or return checkpoint to user

### Structured Error Logging

**Log format:** JSONL (JSON Lines) - one JSON object per line

**Log file:** `.planning/specialist-errors.jsonl`

**Schema:**
```json
{
  "timestamp": "2026-02-23T14:32:15Z",
  "phase": "10",
  "plan": "02",
  "task": "3",
  "specialist": "python-pro",
  "error_type": "timeout",
  "details": "SIGTERM after 300s",
  "git_state": "checkpoint/10-02/1771864258"
}
```

**Logging mechanism:**

Two-layer approach (Phase 10-01):

1. **Inline logging** (immediate feedback):
   ```bash
   echo "ERROR: Specialist $SPECIALIST timed out" >&2
   ```

2. **Structured logging** (analysis/debugging):
   ```bash
   node gsd-tools.cjs log-specialist-error \
     --phase "$PHASE" --plan "$PLAN" \
     --task "$TASK_NUM" --specialist "$SPECIALIST" \
     --error-type "timeout" --details "SIGTERM after 300s"
   ```

**Error types:**
- `timeout` - SIGTERM timeout
- `timeout-kill` - SIGKILL timeout
- `validation-failed` - Output parsing failure
- `checkpoint-failed` - Git checkpoint creation failure
- `unknown` - Unclassified errors

**Querying error log:**
```bash
# All errors for a phase
jq -r 'select(.phase == "10")' .planning/specialist-errors.jsonl

# All timeouts
jq -r 'select(.error_type == "timeout")' .planning/specialist-errors.jsonl

# Errors for specific specialist
jq -r 'select(.specialist == "python-pro")' .planning/specialist-errors.jsonl
```

### Checkpoint and Rollback

**Purpose:** Preserve git state before risky operations, enable atomic rollback on failure

**Implementation:** Git tags (lightweight, easy cleanup, don't clutter branches)

**Lifecycle:**
1. Create checkpoint before specialist spawn
2. Spawn specialist
3. Success → delete checkpoint tag (cleanup)
4. Failure → reset to checkpoint, delete tag (rollback + cleanup)

**Manual inspection:**
```bash
# List all checkpoints
git tag -l "checkpoint/*"

# View checkpoint state
git show checkpoint/10-02/1771864258

# Manually rollback if needed
git reset --hard checkpoint/10-02/1771864258
git tag -d checkpoint/10-02/1771864258
```

**Retention:** Checkpoints are ephemeral - cleaned up on success or after rollback. No automatic retention policy needed.

### Partial Result Salvage

**Detection:** Check for file modifications before rollback

**Strategy:**
```bash
# After timeout, check for work in progress
if git diff --quiet HEAD; then
  echo "No changes detected - clean rollback"
else
  echo "Files modified by specialist before timeout:"
  git diff --name-only HEAD

  # Option 1: Salvage changes (manual decision)
  # Option 2: Full rollback (default)
fi
```

**Current behavior:** Full rollback on timeout (conservative approach)

**Future enhancement:** Partial salvage for specific error types (e.g., timeout with passing tests)

## Configuration

### config.json Verification Settings

**File:** `.planning/config.json`

**Relevant fields:**
```json
{
  "workflow": {
    "use_specialists": false  // Global enable/disable
  },
  "voltagent": {
    "fallback_on_error": true,  // Fall back to gsd-executor on specialist failure
    "max_delegation_depth": 1,  // Prevent recursive delegation
    "complexity_threshold": {
      "min_files": 3,
      "min_lines": 50,
      "require_domain_match": true
    }
  }
}
```

**Note:** Current system does NOT implement complexity thresholds (v2.0 feature). Planning-time assignment only.

### Environment Variables

**SPECIALIST_TIMEOUT:**
- Purpose: Override default 5-minute timeout
- Usage: `SPECIALIST_TIMEOUT=600 gsd execute-phase 10`
- Format: Seconds as integer

**DEBUG:**
- Purpose: Enable verbose logging of specialist routing
- Usage: `DEBUG=true gsd execute-phase 10`
- Output: Logs validation decisions to stderr

**SKIP_VERIFICATION:**
- Purpose: Skip post-spawn verification (testing only)
- Usage: `SKIP_VERIFICATION=true gsd execute-phase 10`
- Warning: Bypasses safety checks, use with caution

### Available Specialists

**File:** `.planning/available_agents.md`

**Generated by:** execute-phase orchestrator at phase start

**Content:** One specialist name per line
```
python-pro
typescript-pro
postgres-pro
...
```

**Generation method:**
1. List `~/.claude/agents/*.md` files
2. Filter for VoltAgent specialists (naming pattern: `*-pro`, `*-specialist`, etc.)
3. Exclude GSD system agents (`gsd-*`)
4. Write to available_agents.md

**Usage:**
- Planner reads to validate assignments
- Orchestrator reads to validate before spawn
- Cached for entire phase execution

## Troubleshooting Guide

### Common Issues and Solutions

**Issue:** "Specialist not found" error
- **Cause:** Specialist not installed or available_agents.md outdated
- **Solution:**
  1. Check `~/.claude/agents/` for specialist file
  2. Regenerate available_agents.md: `gsd init-phase 10`
  3. Verify specialist name matches filename

**Issue:** Specialist timeout on every spawn
- **Cause:** Default 5-minute timeout too short for complex tasks
- **Solution:** Increase timeout: `SPECIALIST_TIMEOUT=900 gsd execute-phase 10`

**Issue:** "classifyHandoffIfNeeded is not defined"
- **Cause:** Subagent attempting Task() invocation (architectural violation)
- **Solution:** Remove Task() code from subagent, move to orchestrator
- **Context:** This is the error that Plan 10-02 fixes

**Issue:** Checkpoint tag clutter in `git tag -l`
- **Cause:** Checkpoint cleanup failed (rare)
- **Solution:** Manual cleanup: `git tag -l "checkpoint/*" | xargs git tag -d`

**Issue:** Specialist output unparsable
- **Cause:** Specialist returned non-standard format
- **Solution:**
  1. Check raw output in `.planning/phases/XX-name/XX-YY-RESULT.txt`
  2. Add parsing pattern to multi-tier parser (Phase 09-01)
  3. Fall back to gsd-executor if persistent

### Debug Mode Usage

**Enable:**
```bash
DEBUG=true gsd execute-phase 10
```

**Output:**
```
→ Validating specialist: python-pro
  ✓ Non-null, non-empty
  ✓ Not string "null"
  ✓ Found in available_agents.md
  → python-pro validated

→ Creating checkpoint before spawn...
  ✓ Checkpoint created: checkpoint/10-02/1771864258

→ Spawning specialist python-pro with timeout 300s...
  [specialist output...]
  ✓ Specialist completed (exit code 0)

→ Cleaning up checkpoint...
  ✓ Checkpoint deleted
```

### Error Log Analysis

**View recent errors:**
```bash
tail -n 20 .planning/specialist-errors.jsonl | jq .
```

**Timeout pattern analysis:**
```bash
jq -r 'select(.error_type | startswith("timeout")) | [.specialist, .phase, .plan, .task] | @csv' .planning/specialist-errors.jsonl
```

**Error frequency by specialist:**
```bash
jq -r .specialist .planning/specialist-errors.jsonl | sort | uniq -c | sort -rn
```

### Manual Checkpoint Cleanup

**List orphaned checkpoints:**
```bash
git tag -l "checkpoint/*"
```

**Delete all checkpoints:**
```bash
git tag -l "checkpoint/*" | xargs git tag -d
```

**Delete specific checkpoint:**
```bash
git tag -d checkpoint/10-02/1771864258
```

**Checkpoint retention:** Checkpoints should be ephemeral. If you see many orphaned tags, investigate cleanup logic in execute-phase.md.

## Best Practices

1. **Always validate before spawn** - Check available_agents.md, don't trust plan blindly
2. **Use checkpoints for risky operations** - Specialist spawns, database migrations, deployments
3. **Set appropriate timeouts** - Complex tasks may need >5 minutes
4. **Monitor error log** - Regularly check specialist-errors.jsonl for patterns
5. **Clean up checkpoints** - Verify no orphaned tags after phase completion
6. **Document specialist assignments** - Track specialist_usage in SUMMARY.md frontmatter
7. **Test fallback paths** - Ensure gsd-executor can handle tasks if specialists unavailable

## Version History

- **Phase 07:** Initial specialist assignment (gsd-planner keyword matching)
- **Phase 08:** Orchestrator validation and fallback (three-tier system)
- **Phase 09:** Multi-tier result parsing and state management
- **Phase 10:** Timeout, checkpoint, and error recovery infrastructure
- **Phase 10 Plan 02:** Cleanup of broken Task() code in gsd-executor (this plan)

## References

- `get-shit-done/workflows/execute-phase.md` - Orchestrator implementation
- `get-shit-done/agents/gsd-planner.md` - Specialist assignment logic
- `.planning/available_agents.md` - Runtime specialist roster
- `.planning/specialist-errors.jsonl` - Error log
- `.planning/config.json` - Configuration
