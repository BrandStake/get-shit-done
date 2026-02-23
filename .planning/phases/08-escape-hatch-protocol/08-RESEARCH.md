# Phase 08: Orchestrator Spawning - Research

**Researched:** 2026-02-23
**Domain:** Agent orchestration, context passing, Task tool usage
**Confidence:** HIGH

## Summary

Orchestrator spawning in the GSD system involves the execute-phase workflow reading the specialist field from PLAN.md tasks and spawning the appropriate agent via the Task tool's `subagent_type` parameter. The current implementation already validates specialist availability and falls back to gsd-executor when needed. The critical implementation detail is that subagents receive fresh context windows and cannot access @ references from the parent orchestrator's context, requiring explicit context injection through the prompt.

The existing execute-phase.md workflow (lines 106-176) demonstrates the pattern: validate specialist availability against available_agents.md, fall back to gsd-executor if unavailable, then spawn via Task() with files listed in a `<files_to_read>` block for the subagent to load itself.

**Primary recommendation:** Extend the existing specialist validation logic to read specialist fields from individual tasks in PLAN.md, maintaining the current context-passing pattern where file paths (not content) are passed in the prompt for subagents to read themselves.

## Standard Stack

The GSD system uses built-in Claude Code primitives for orchestration:

### Core
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| Task tool | Built-in | Spawn subagents with fresh context | Native Claude Code tool for parallelism |
| subagent_type param | Native | Specify which agent to spawn | Direct agent routing mechanism |
| files_to_read pattern | Established | Context injection via prompt | Subagents read files themselves |

### Supporting
| Component | Version | Purpose | When to Use |
|-----------|---------|---------|-------------|
| available_agents.md | Generated | Specialist roster validation | Before any specialist spawn |
| gsd-tools agents enumerate | Current | Generate agent list | During orchestrator initialization |
| specialist field | PLAN.md frontmatter | Task-level routing | Planning time assignment |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| File paths in prompt | Pass file content directly | Would bloat prompt, exceed limits |
| @ references | Direct content injection | Don't work across Task boundaries |
| Runtime routing | Planning-time assignment | Less flexible but more predictable |

## Architecture Patterns

### Recommended Implementation Structure
```
execute-phase.md modifications:
├── Parse task specialist fields from PLAN.md
├── Validate each specialist against roster
├── Spawn with appropriate subagent_type
└── Fall back to gsd-executor on null/unavailable
```

### Pattern 1: Task-Level Specialist Reading
**What:** Extract specialist field from each task's frontmatter in PLAN.md
**When to use:** Before spawning executor for each task
**Example:**
```bash
# Source: Current execute-phase.md lines 111-113
# Extract specialist field from task frontmatter
SPECIALIST=$(grep -A 10 "^<task" {plan_file} | grep "^specialist:" | head -n 1 | sed 's/specialist:\s*//' | xargs)
```

### Pattern 2: Context Injection via files_to_read
**What:** Pass file paths in prompt, subagent reads content itself
**When to use:** Always when spawning specialists
**Example:**
```markdown
# Source: Current execute-phase.md lines 152-159
<files_to_read>
Read these files at execution start using the Read tool:
- {phase_dir}/{plan_file} (Plan)
- .planning/STATE.md (State)
- .planning/config.json (Config, if exists)
</files_to_read>
```

### Pattern 3: Availability Validation with Fallback
**What:** Check specialist exists before spawning, fall back to gsd-executor
**When to use:** Every specialist spawn attempt
**Example:**
```bash
# Source: Current execute-phase.md lines 115-127
if [ -n "$SPECIALIST" ] && [ "$SPECIALIST" != "gsd-executor" ]; then
  if ! grep -q "^- \*\*${SPECIALIST}\*\*:" .planning/available_agents.md; then
    echo "Warning: Specialist '${SPECIALIST}' not available, falling back to gsd-executor" >&2
    SPECIALIST="gsd-executor"
  fi
else
  SPECIALIST="gsd-executor"
fi
```

### Anti-Patterns to Avoid
- **Passing file content directly:** Bloats prompts, exceeds token limits
- **Using @ references in Task prompts:** They don't resolve across Task boundaries
- **Skipping availability validation:** Causes spawn failures at runtime
- **Reading files in orchestrator:** Wastes orchestrator context that should stay lean

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Agent discovery | Manual filesystem scan | gsd-tools agents enumerate | Handles filtering, formatting |
| Context passing | String concatenation | files_to_read pattern | Subagents manage own context |
| Specialist validation | Direct spawn attempts | Pre-flight roster check | Prevents runtime failures |
| Fallback logic | Complex error handling | Simple null/unavailable check | Deterministic routing |

**Key insight:** The Task tool provides context isolation by design. Each subagent gets a fresh 200k token window. Don't try to share context directly; let each agent read what it needs.

## Common Pitfalls

### Pitfall 1: Assuming @ References Work Across Task Boundaries
**What goes wrong:** @ references in Task prompts aren't resolved, subagent sees literal "@" paths
**Why it happens:** Task tool creates fresh context, doesn't inherit parent's resolved references
**How to avoid:** List files in `<files_to_read>` block, subagent uses Read tool
**Warning signs:** Subagent reports "can't find @~/.claude/..." files

### Pitfall 2: Passing File Content Instead of Paths
**What goes wrong:** Prompt becomes massive, exceeds token limits, duplicates reading
**Why it happens:** Trying to "help" subagent by pre-loading content
**How to avoid:** Pass paths only, let subagent read with its fresh context
**Warning signs:** Task spawn fails with "prompt too long" errors

### Pitfall 3: Not Validating Specialist Availability
**What goes wrong:** Task spawn fails when specialist doesn't exist
**Why it happens:** Assuming planner's assignment is always valid
**How to avoid:** Always check available_agents.md before spawning
**Warning signs:** "Agent not found" errors at execution time

### Pitfall 4: classifyHandoffIfNeeded Runtime Errors
**What goes wrong:** Agent reports failure but work completed successfully
**Why it happens:** Known Claude Code bug in completion handler
**How to avoid:** Spot-check actual outputs (files exist, commits made) before treating as failure
**Warning signs:** Error message contains "classifyHandoffIfNeeded is not defined"

## Code Examples

Verified patterns from the current implementation:

### Reading Specialist from Task
```bash
# Source: execute-phase.md concept, adapted for per-task
for TASK_NUM in $(seq 1 $TASK_COUNT); do
  # Extract task N specialist field
  SPECIALIST=$(awk '/^<task/{task++} task=='"$TASK_NUM"' && /^specialist:/{print $2; exit}' "$PLAN_FILE")

  # Validate and spawn...
done
```

### Spawning Specialist with Context
```bash
# Source: execute-phase.md lines 136-169
Task(
  subagent_type="${SPECIALIST}",
  model="${EXECUTOR_MODEL}",
  prompt="
    <objective>
    Execute task ${TASK_NUM} from plan ${PLAN_ID}
    </objective>

    <files_to_read>
    - ${PHASE_DIR}/${PLAN_FILE}
    - .planning/STATE.md
    </files_to_read>

    <task_focus>
    Execute only task ${TASK_NUM}, not the entire plan
    </task_focus>
  "
)
```

### Fallback Handling
```bash
# Source: execute-phase.md lines 115-127
# Three-tier fallback
if [ -z "$SPECIALIST" ]; then
  SPECIALIST="gsd-executor"  # No specialist assigned
elif [ "$SPECIALIST" = "null" ]; then
  SPECIALIST="gsd-executor"  # Explicit null
elif ! grep -q "^- \*\*${SPECIALIST}\*\*:" .planning/available_agents.md; then
  echo "Warning: ${SPECIALIST} unavailable, using gsd-executor"
  SPECIALIST="gsd-executor"  # Not available
fi
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Runtime routing | Planning-time assignment | Phase 7.2 | Predictable execution |
| Orchestrator decides | Planner assigns specialist | Phase 7.2 | Better domain matching |
| No validation | Roster pre-check | Phase 7.1 | Fewer spawn failures |
| All tasks to gsd-executor | Specialist per task | Phase 8 (this) | Domain expertise |

**Deprecated/outdated:**
- Direct context sharing between orchestrator and subagent (never worked)
- Using environment variables for context (Task tool doesn't support)
- Resuming interrupted agents (fresh spawn more reliable)

## Open Questions

Things requiring validation during implementation:

1. **Task-level specialist parsing**
   - What we know: PLAN.md has tasks with specialist field
   - What's unclear: Best way to parse individual task frontmatter
   - Recommendation: Use awk or sed to extract per-task fields

2. **Granularity of spawning**
   - What we know: Current spawns entire plan at once
   - What's unclear: Whether to spawn per-task or per-plan
   - Recommendation: Start with per-plan, refactor if needed

3. **Context size limits**
   - What we know: Each subagent gets 200k context
   - What's unclear: How much the orchestrator prompt consumes
   - Recommendation: Keep files_to_read list minimal

## Sources

### Primary (HIGH confidence)
- execute-phase.md lines 106-176 - Current specialist validation implementation
- execute-phase.md lines 136-169 - Task spawning pattern with files_to_read
- REQUIREMENTS.md SPAWN-01 through SPAWN-05 - Formal requirements
- available_agents.md - Current roster format

### Secondary (MEDIUM confidence)
- WebSearch: Task tool documentation indicating fresh context windows
- WebSearch: Subagent isolation patterns in Claude Code

### Tertiary (LOW confidence)
- Community discussions about @ reference limitations (needs verification)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using built-in Claude Code tools
- Architecture: HIGH - Pattern already proven in execute-phase.md
- Pitfalls: HIGH - classifyHandoffIfNeeded documented in CHANGELOG
- Context passing: MEDIUM - Inferred from current implementation

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (30 days - stable patterns)