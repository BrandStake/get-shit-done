# GSD Volt Agent Architecture Upgrade v2

## Using Claude Code Agent Teams for True Multi-Agent Execution

---

## Executive Summary

The current GSD architecture has a fundamental flaw: **subagents cannot spawn other agents**. The gsd-executor has ~500 lines of specialist delegation code that can never execute because subagents don't have access to the Task tool.

Claude Code's new **Agent Teams** feature solves this by enabling:
- **Persistent teammates** (not fire-and-forget subagents)
- **Shared task lists** with dependency tracking
- **Inter-agent communication** via messaging
- **Self-organized work claiming** (automatic load balancing)
- **Plan approval gates** for quality control

This upgrade replaces the broken delegation model with a team-based architecture where execute-phase acts as **Team Lead**, specialists are **Teammates**, and work is coordinated through a **shared task list**.

---

## Current Architecture Analysis

### What We Have Now

```
execute-phase orchestrator
    └── Task(subagent_type="gsd-executor")
            └── gsd-executor receives plan
            └── gsd-executor has 500+ lines of specialist delegation code
            └── BUT: subagents CAN'T use Task() tool (architectural constraint)
            └── RESULT: All specialist code is dead weight
```

### Why It Fails

| Issue | Root Cause | Impact |
|-------|------------|--------|
| gsd-executor can't delegate | Subagents lack Task tool access | Specialist code never runs |
| execute-phase spawns gsd-executor | Orchestrator delegates to generalist | No domain expertise used |
| Specialists are defined but unused | Task tool constraint not understood | 500+ lines of dead code |
| No parallel execution | Sequential subagent spawning | Slow phase execution |

### Evidence

From `gsd-executor.md` line 35-47:
```markdown
**gsd-executor is a pure task executor without delegation capability.**
This agent cannot invoke the Task() tool to spawn other agents.
Specialist delegation is handled exclusively by the execute-phase orchestrator.
```

But execute-phase doesn't actually spawn specialists - it spawns gsd-executor for everything!

---

## Claude Code Agent Teams Feature

### Capability Overview

| Feature | Description | GSD Application |
|---------|-------------|-----------------|
| **TeamCreate** | Creates team with shared namespace | Phase-level coordination |
| **Teammates** | Persistent agents with own context | Domain specialists |
| **TaskCreate** | Creates tasks with dependencies | Plan tasks → team tasks |
| **TaskUpdate** | Claim/complete tasks | Self-organized work |
| **SendMessage** | Direct inter-agent communication | Coordination, handoffs |
| **TaskList** | Shared work queue | Parallel execution |
| **Plan Approval** | Require lead approval before changes | Quality gates |

### Agent Teams vs Task Tool (Subagents)

| Aspect | Task Tool (Current) | Agent Teams (Proposed) |
|--------|---------------------|------------------------|
| Agent Lifecycle | Fire-and-forget | Persistent |
| Communication | Results to parent only | Direct messaging |
| Parallelization | Manual, limited | Automatic |
| Work Distribution | Parent assigns | Self-claim |
| Context | Isolated | Shared task list |
| Token Cost | ~200k for 3 agents | ~800k for 3-person team |
| Coordination | None | Built-in |

### When to Use Each

**Use Agent Teams for:**
- Complex phases spanning multiple architectural layers
- Tasks requiring live inter-agent communication
- QA/testing scenarios needing multiple perspectives
- Work where specialists must resolve dependencies dynamically

**Continue using Task Tool for:**
- Simple, focused tasks
- Single-domain phases
- Cost-constrained scenarios
- When coordination overhead > benefit

---

## Proposed Architecture: Hybrid Team Model

### Design Principles

1. **Team Lead = Orchestrator**: execute-phase becomes team lead
2. **Teammates = Specialists**: Domain experts join team as needed
3. **Shared Task List = Plan**: PLAN.md tasks convert to team tasks
4. **Self-Claiming = Parallelization**: Specialists claim work automatically
5. **Plan Approval = Quality Gates**: Critical tasks require lead approval
6. **Graceful Degradation**: Fall back to simple mode for basic phases

### New Execution Flow

```
execute-phase (Team Lead)
    │
    ├── 1. Analyze phase complexity
    │       └── Complex (multi-layer, parallel tasks) → Team Mode
    │       └── Simple (sequential, single-domain) → Simple Mode
    │
    ├── [TEAM MODE]
    │   ├── 2. TeamCreate("phase-{N}-{name}")
    │   ├── 3. Parse PLAN.md → TaskCreate for each task
    │   │       └── Include dependencies (addBlockedBy)
    │   │       └── Tag tasks with domain hints
    │   ├── 4. Spawn specialist teammates based on domains
    │   │       └── Task(team_name="...", name="python-expert", subagent_type="voltagent-lang:python-pro")
    │   │       └── Task(team_name="...", name="db-expert", subagent_type="voltagent-data-ai:postgres-pro")
    │   ├── 5. Teammates self-claim tasks from TaskList
    │   ├── 6. SendMessage for coordination/handoffs
    │   ├── 7. Monitor completion, handle failures
    │   ├── 8. Aggregate results → SUMMARY.md
    │   └── 9. TeamCleanup
    │
    └── [SIMPLE MODE]
        └── Existing flow: Task(subagent_type="gsd-executor") per plan
```

### Complexity Heuristics

```bash
determine_execution_mode() {
  local plan_count=$1
  local unique_domains=$2  # from plan task specialist hints
  local has_parallel_waves=$3
  local total_tasks=$4

  # Team mode triggers
  if [ "$plan_count" -gt 3 ]; then
    echo "team"
  elif [ "$unique_domains" -gt 2 ]; then
    echo "team"
  elif [ "$has_parallel_waves" = "true" ] && [ "$total_tasks" -gt 5 ]; then
    echo "team"
  else
    echo "simple"
  fi
}
```

---

## Implementation Plan

### Phase 1: Enable Agent Teams Feature

**Files:** `settings.json`, `.claude/settings.json`

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

**Also add to GSD config.json schema:**
```json
{
  "agent_teams": {
    "enabled": true,
    "min_tasks_for_team": 5,
    "min_domains_for_team": 2,
    "plan_approval_required": ["security", "database"],
    "teammate_mode": "in-process"
  }
}
```

### Phase 2: Update execute-phase.md Orchestrator

**File:** `get-shit-done/workflows/execute-phase.md`

**Key Changes:**

1. **Add complexity analysis step** (after initialize)
2. **Branch to team or simple mode** (new step)
3. **Team mode execution flow** (new section)
4. **Simple mode execution flow** (existing code, refactored)

**New Team Mode Section:**

```markdown
<step name="team_mode_execution">
## Team-Based Parallel Execution

**1. Create team for phase:**
```
TeamCreate(
  team_name="phase-{phase_number}-{phase_slug}",
  description="Execute {phase_name} with specialist teammates"
)
```

**2. Convert plan tasks to team tasks:**

For each plan in the phase, parse tasks and create in team task list:

```
For each task in plan:
  TaskCreate(
    subject="{task.name}",
    description="""
      Plan: {plan_id}
      Action: {task.action}
      Files: {task.files}
      Verify: {task.verify}
      Done: {task.done}
      Domain hint: {detected_domain}
    """,
    team_name="phase-{phase_number}-{phase_slug}"
  )

  # Add dependencies
  if task.depends_on:
    TaskUpdate(
      taskId={created_task_id},
      addBlockedBy=[{dependency_task_ids}]
    )
```

**3. Determine required specialists:**

Analyze all tasks for domain hints. Deduplicate and spawn one teammate per domain:

```
domains = unique([detect_domain(task) for task in all_tasks])

For each domain in domains:
  Task(
    team_name="phase-{phase_number}-{phase_slug}",
    name="{domain}-specialist",
    subagent_type="voltagent-{category}:{domain}",
    prompt="""
      You are a specialist teammate in the GSD execution team.

      Your domain: {domain}

      ## Instructions
      1. Check TaskList for unblocked tasks matching your domain
      2. Claim task via TaskUpdate(status="in_progress", owner="{domain}-specialist")
      3. Execute the task following GSD execution rules
      4. Commit atomically with proper format
      5. Mark complete via TaskUpdate(status="completed")
      6. Check for more tasks, repeat
      7. When no more tasks match your domain, go idle

      ## GSD Execution Rules
      - Atomic commits per task
      - Deviation rules 1-4 apply
      - Return structured results
      - DO NOT modify STATE.md (lead handles)
    """
  )
```

**4. Monitor team progress:**

Team lead monitors via TaskList polling:

```
while tasks_remaining > 0:
  task_status = TaskList(team_name="...")

  # Check for stuck tasks (in_progress > 5 min)
  for task in task_status:
    if task.status == "in_progress" and task.duration > 300:
      SendMessage(
        to=task.owner,
        type="message",
        content="Status check: Are you blocked on {task.subject}?"
      )

  # Check for failures
  # Handle retries or reassignment

  sleep(30)  # Poll interval
```

**5. Aggregate results and cleanup:**

```
# Collect all task results
results = [task for task in TaskList() if task.status == "completed"]

# Create SUMMARY.md aggregating specialist work
write_summary(results)

# Cleanup team
TeamDelete(team_name="phase-{phase_number}-{phase_slug}")
```
</step>
```

### Phase 3: Simplify gsd-executor.md

**File:** `agents/gsd-executor.md`

**Remove:**
- `<specialist_registry>` section (~70 lines)
- `<domain_detection>` section (~200 lines)
- `<adapter_functions>` section (~300 lines)
- All delegation-related code in `<execution_flow>`

**Keep:**
- Core task execution logic
- Deviation rules
- Checkpoint protocol
- Commit protocol
- Summary creation

**Result:** gsd-executor becomes a focused **single-task executor** (~500 lines instead of ~1900 lines)

New role:
```markdown
<role>
You are a GSD task executor. You execute ONE task at a time:
1. Read task details from prompt
2. Execute the task
3. Apply deviation rules as needed
4. Commit atomically
5. Return structured result

You do NOT:
- Delegate to specialists (orchestrator handles this)
- Manage state files (lead handles this)
- Coordinate with other agents (team infrastructure handles this)
</role>
```

### Phase 4: Update verify-work.md for Team-Based Verification

**File:** `get-shit-done/workflows/verify-work.md`

**Add team-based specialist verification:**

```markdown
<step name="spawn_verification_specialists">
## Specialist Verification Phase

After automated gsd-verifier completes:

**1. Determine verification specialists from plan:**
```bash
VERIFICATION_TIER=$(grep "tier:" $PLAN_PATH | cut -d: -f2 | tr -d ' ')
```

**2. Create verification team (if tier > 1):**
```
TeamCreate(
  team_name="verify-{phase_number}",
  description="Verification specialists for phase {phase_number}"
)
```

**3. Spawn verification specialists:**

Tier 1: code-reviewer only
Tier 2: + qa-expert
Tier 3: + security-engineer, principal-engineer

```
For each specialist in tier_specialists:
  Task(
    team_name="verify-{phase_number}",
    name="{specialist}",
    subagent_type="{specialist}",
    prompt="""
      Review phase {phase_number} implementation.
      Files: {files_modified from SUMMARY.md}

      Focus: {specialist-specific focus}

      Create TaskCreate with your findings.
      Return: severity, file, line, issue, recommendation
    """
  )
```

**4. Aggregate findings:**
```
findings = TaskList(team_name="verify-{phase_number}")
append_to_verification_md(findings)
TeamDelete(team_name="verify-{phase_number}")
```
</step>
```

### Phase 5: Add gsd-tools.cjs Support

**File:** `get-shit-done/bin/lib/tools.cjs`

**New commands:**

```javascript
// Analyze phase complexity for team vs simple mode
gsd-tools.cjs phase analyze-complexity {phase}
// Returns: { mode: "team"|"simple", domains: [...], task_count: N, reasons: [...] }

// Convert plan tasks to team task format
gsd-tools.cjs plan to-team-tasks {plan_path}
// Returns: JSON array of team task objects with dependencies

// Detect domain from task description
gsd-tools.cjs task detect-domain {task_description}
// Returns: { domain: "python-pro", confidence: 0.85, keywords: [...] }

// Aggregate team results into SUMMARY.md
gsd-tools.cjs team aggregate-results {team_name} {output_path}
// Creates SUMMARY.md from completed team tasks
```

---

## File Changes Summary

| File | Action | Complexity | Lines Changed |
|------|--------|------------|---------------|
| `settings.json` | Add agent teams env var | Low | +3 |
| `.planning/config.json` schema | Add agent_teams config | Low | +10 |
| `workflows/execute-phase.md` | Major rewrite - add team mode | High | +300 |
| `workflows/verify-work.md` | Add specialist spawning | Medium | +100 |
| `agents/gsd-executor.md` | Massive simplification | Medium | -1400 |
| `bin/lib/tools.cjs` | Add team support commands | Medium | +200 |

---

## Migration Strategy

### Backward Compatibility

The hybrid model ensures backward compatibility:

1. **Default: Simple mode** - Existing behavior preserved
2. **Opt-in: Team mode** - Only activates for complex phases
3. **Config override** - Users can force simple mode via `agent_teams.enabled: false`
4. **Graceful degradation** - If team creation fails, fall back to simple mode

### Rollout Phases

1. **Alpha (v1.25)**: Agent teams behind feature flag, manual activation only
2. **Beta (v1.26)**: Auto-detection enabled, simple mode fallback
3. **GA (v2.0)**: Team mode as default for complex phases

### Testing Checklist

- [ ] Simple phase executes in simple mode (no team overhead)
- [ ] Complex phase creates team with correct specialists
- [ ] Tasks have proper dependencies (blocked/unblocked)
- [ ] Specialists claim matching tasks
- [ ] Inter-agent messaging works for coordination
- [ ] Plan approval gates block when configured
- [ ] SUMMARY.md correctly aggregates team results
- [ ] Team cleanup removes all artifacts
- [ ] Fallback to simple mode on team creation failure
- [ ] Token usage acceptable for team mode phases

---

## Benefits of New Architecture

| Benefit | Description |
|---------|-------------|
| **Actual Delegation** | Specialists run as teammates, not dead code |
| **True Parallelization** | Multiple specialists work simultaneously |
| **Domain Expertise** | Right specialist for each task type |
| **Self-Organization** | Automatic work claiming reduces coordination |
| **Inter-Agent Coordination** | Messaging enables handoffs and clarifications |
| **Quality Gates** | Plan approval before critical changes |
| **Simplified Agents** | gsd-executor 70% smaller, single responsibility |
| **Observability** | Team infrastructure tracks all work |

---

## Token Economics

### Cost Comparison

| Scenario | Simple Mode | Team Mode |
|----------|-------------|-----------|
| 3 tasks, 1 domain | ~200k tokens | ~300k tokens |
| 6 tasks, 3 domains | ~400k tokens | ~600k tokens |
| 12 tasks, 4 domains | ~800k tokens | ~1.2M tokens |

### Cost Justification

Team mode costs ~50% more tokens but provides:
- 2-4x faster execution (parallelization)
- Higher quality (domain expertise)
- Better coordination (messaging)
- Reduced failures (self-healing)

**Recommendation:** Use team mode for phases with >5 tasks or >2 domains, where the quality and speed benefits justify token cost.

---

## Open Questions

1. **Teammate model selection**: Should specialists use same model as lead or cheaper model?
   - Proposal: Use `haiku` for quick domain tasks, `sonnet` for complex ones

2. **Task claiming priority**: How to ensure fair distribution vs fastest execution?
   - Proposal: Domain-match first, then round-robin

3. **Failure handling**: How to handle specialist that fails repeatedly?
   - Proposal: After 2 failures, reassign to different specialist or gsd-executor

4. **Context sharing**: How much project context do teammates need?
   - Proposal: CLAUDE.md + skills + task-specific files only

---

## Next Steps

1. [ ] Review and approve this upgrade plan
2. [ ] Enable agent teams feature in dev environment
3. [ ] Implement Phase 1 (config changes)
4. [ ] Implement Phase 2 (execute-phase team mode)
5. [ ] Implement Phase 3 (simplify gsd-executor)
6. [ ] Implement Phase 4 (verify-work team mode)
7. [ ] Implement Phase 5 (gsd-tools support)
8. [ ] Integration testing
9. [ ] Documentation updates
10. [ ] Alpha release
