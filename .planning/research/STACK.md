# Technology Stack: VoltAgent Multi-Agent Integration

**Project:** GSD v1.21 Hybrid Agent Team Execution
**Researched:** 2026-02-22
**Overall confidence:** MEDIUM-HIGH

## Executive Summary

Integrating VoltAgent's 127+ specialist subagents into GSD's execution workflow requires **adapter layers** rather than framework replacement. GSD's existing Task-based spawning system maps cleanly to VoltAgent's architecture, but integration must preserve GSD's state management guarantees (atomic commits, deviation rules, checkpoint protocol).

**Core insight:** VoltAgent specialists are **Claude Code subagents**, not a separate runtime. They're invoked via the same Task tool GSD already uses. The integration is **prompt engineering + detection**, not dependency installation.

## Recommended Stack (What to ADD)

### 1. Detection Layer (NEW)
| Component | Technology | Purpose | Why |
|-----------|------------|---------|-----|
| Plugin detector | Bash + npm CLI | Detect installed VoltAgent plugins | Native, zero-dependency, cross-platform |
| Specialist registry | JSON manifest | Map task domains → specialist types | Fast lookup, versioned with GSD |
| Capability cache | `.planning/voltagent-cache.json` | Cache detected specialists per session | Avoid repeated npm queries |

**Implementation pattern:**
```bash
# Detection at executor init
VOLTAGENT_AVAILABLE=$(npm list -g --depth=0 2>/dev/null | grep -c "voltagent-" || echo "0")

# If plugins found, populate cache
if [ "$VOLTAGENT_AVAILABLE" -gt 0 ]; then
  npm list -g --depth=0 --json 2>/dev/null | \
    jq '.dependencies | keys[] | select(startswith("voltagent-"))' > \
    .planning/voltagent-cache.json
fi
```

**Why this approach:**
- `npm list -g` is native, works everywhere (Mac/Windows/Linux)
- No new dependencies added to GSD's zero-dependency policy
- Detection runs once per session, results cached in `.planning/`

### 2. Task Domain Analyzer (NEW)
| Component | Technology | Purpose | Why |
|-----------|------------|---------|-----|
| Domain classifier | Embedded logic in gsd-executor | Analyze task → determine specialist type | Inline, no external calls needed |
| Specialist mapper | Static registry (JSON) | Map domains to VoltAgent subagent types | Deterministic, versionable |

**Domain classification logic:**
```typescript
// Pseudo-code for domain analysis
interface TaskDomain {
  primary: string;      // "python" | "typescript" | "infrastructure" | "security"
  confidence: number;   // 0-1
  specialist: string | null;  // "python-pro" | null (fallback to gsd-executor)
}

function classifyTaskDomain(task: PlanTask): TaskDomain {
  const patterns = {
    python: /\.py$|pip install|pytest|django|flask/i,
    typescript: /\.ts$|npm install|jest|react|next\.js/i,
    infrastructure: /docker|kubernetes|terraform|aws|gcp|azure/i,
    security: /auth|encryption|jwt|oauth|security audit/i,
    database: /postgres|mysql|migration|query optimization/i
  };

  // Check file paths, task description, implementation context
  // Return matched domain + confidence
}
```

**Why static analysis:**
- Task context fully available at execution time (description, files, implementation block)
- No LLM call needed (fast, deterministic, free)
- Pattern-based matching proven reliable in similar systems

### 3. Adapter Layers (NEW)

#### gsd-task-adapter (Outbound)
| Aspect | Technology | Purpose |
|--------|------------|---------|
| Format | Markdown template | Transform GSD task → specialist-compatible prompt |
| Context | Extract from PLAN.md | Provide task context without full GSD protocol |
| Constraints | Explicit boundaries | Tell specialist what NOT to do (no commits, no state updates) |

**Template structure:**
```markdown
---
name: {specialist-type}
description: Execute task {task-num} from {phase}-{plan}
tools: Read, Write, Edit, Bash, Grep, Glob
# NOTE: No Task tool — specialists can't spawn sub-specialists
---

<role>
You are a {domain} specialist executing a single task for the GSD workflow.
Your job: Complete the implementation, return structured result.
You do NOT commit, update state, or create summaries — the coordinator handles that.
</role>

<task>
**Name:** {task.name}
**Verification:** {task.verification}
**Done when:** {task.done_criteria}

{task.implementation}
</task>

<context>
{@-references from plan}
{relevant previous task outputs}
</context>

<output_format>
Return structured completion status:

## TASK COMPLETE

**Task:** {task-num}
**Status:** [success | blocked | needs-decision]
**Files modified:** {list}
**Next steps:** {any follow-up needed}

{implementation notes}
</output_format>
```

**Why this format:**
- Specialists understand role/task/output structure (standard Claude Code pattern)
- Explicitly removes GSD-specific responsibilities (commits, state)
- Preserves task context without requiring specialist to parse PLAN.md

#### gsd-result-adapter (Inbound)
| Aspect | Technology | Purpose |
|--------|------------|---------|
| Parser | Regex + structured text | Extract completion status from specialist output |
| Validator | File existence checks | Verify claimed modifications actually exist |
| Normalizer | Convert to GSD format | Transform specialist result → SUMMARY.md format |

**Parse pattern:**
```bash
# Extract completion status
STATUS=$(echo "$SPECIALIST_OUTPUT" | grep "^**Status:**" | cut -d: -f2 | tr -d ' ')

# Extract modified files
FILES=$(echo "$SPECIALIST_OUTPUT" | sed -n '/\*\*Files modified:\*\*/,/^$/p' | tail -n +2)

# Validate files exist
for file in $FILES; do
  [ -f "$file" ] || echo "WARNING: Specialist claimed to modify $file but it doesn't exist"
done
```

**Why simple parsing:**
- Specialists return markdown (same as gsd-executor currently does)
- Regex/sed sufficient for structured extraction
- No JSON parsing dependencies needed

### 4. Coordinator Integration Point
| Component | Technology | Purpose | Why |
|-----------|------------|---------|-----|
| Routing logic | Embedded in gsd-executor | Decide: specialist or fallback | Single decision point, clear ownership |
| multi-agent-coordinator | VoltAgent plugin (optional) | Coordinate multiple specialists for complex tasks | VoltAgent's proven coordination expertise |

**When to use multi-agent-coordinator:**
- Task explicitly requires multiple domains (e.g., "Add Postgres, update Python API, deploy with Docker")
- Complex workflows with inter-specialist dependencies
- Parallel specialist execution with result aggregation

**When to skip coordinator:**
- Single-domain task (most cases)
- Simple linear execution
- VoltAgent plugins not installed (graceful fallback)

**Integration pattern:**
```bash
# In gsd-executor task loop
for task in $TASKS; do
  DOMAIN=$(analyze_task_domain "$task")

  if [ "$VOLTAGENT_AVAILABLE" -gt 0 ] && [ -n "$DOMAIN.specialist" ]; then
    # Multi-domain task? Use coordinator
    if [ "$DOMAIN.count" -gt 1 ]; then
      RESULT=$(spawn_coordinator "$task" "$DOMAIN.specialists")
    else
      # Single specialist
      RESULT=$(spawn_specialist "$DOMAIN.specialist" "$task")
    fi

    # Parse result
    parse_specialist_result "$RESULT"

    # gsd-executor commits (preserves GSD protocol)
    commit_task "$task"
  else
    # Fallback: gsd-executor handles directly (current behavior)
    execute_task_directly "$task"
  fi
done
```

## What NOT to Add

### ❌ VoltAgent Framework Runtime
**Why not:** VoltAgent specialists are Claude Code subagents, not a separate framework to embed. GSD doesn't need `@voltagent/core` or `npm install` dependencies.

**What happens instead:** Specialists are invoked via Claude Code's Task tool, same as gsd-executor currently spawns gsd-planner, gsd-debugger, etc.

### ❌ TypeScript Rewrite
**Why not:** GSD is Bash + Markdown prompts by design (portable, no build step, runtime-agnostic). Adding TypeScript breaks:
- Zero-dependency guarantee
- Cross-platform compatibility (Claude Code, OpenCode, Gemini CLI)
- Simplicity (no compilation, no package.json in user projects)

**What happens instead:** Domain classification and routing logic embedded as Bash functions in gsd-executor.md.

### ❌ Prompt Management Library
**Why not:** GSD already has a prompt system (agents/*.md, templates/*.md, workflows/*.md). Adding prompt-foundry or llm-exe creates:
- Dependency overhead
- Version conflicts with user projects
- Unnecessary abstraction over what's already a template system

**What happens instead:** gsd-task-adapter is a Markdown template (`.planning/templates/specialist-task.md`), populated via Bash variable substitution.

### ❌ Persistent Specialist State
**Why not:** Specialists are ephemeral (fresh context per task). Persisting state across specialists violates:
- GSD's "fresh context = peak quality" principle
- Checkpoint protocol (only gsd-executor manages STATE.md)
- Commit atomicity (one commit per task, owned by executor)

**What happens instead:** Specialists return results, gsd-executor aggregates, commits, and updates STATE.md (single source of truth).

## Integration with Existing GSD Stack

### Preserved Components (No changes needed)
| Component | Role | Why unchanged |
|-----------|------|---------------|
| gsd-tools.cjs | CLI utilities | Detection/adapter logic doesn't need new CLI commands |
| Task tool | Subagent spawning | Already supports `subagent_type` parameter (just add specialist types) |
| Checkpoint protocol | Human-in-loop gates | Specialists respect checkpoints same as current executors |
| Deviation rules | Auto-fix logic | Specialists apply same rules (documented in task prompt) |

### Modified Components
| Component | Change | Why |
|-----------|--------|-----|
| gsd-executor.md | Add routing logic | Single decision point: specialist vs direct execution |
| execute-plan.md | Add detection step | Check VoltAgent availability at orchestrator init |
| .planning/config.json | Add `use_specialists: boolean` | User opt-in (default: false until stable) |

### New Components
| Component | Location | Purpose |
|-----------|----------|---------|
| specialist-task.md | `.planning/templates/` | Task adapter template |
| domain-registry.json | `get-shit-done/config/` | Task patterns → specialist types |
| voltagent-cache.json | `.planning/` (gitignored) | Session cache of detected plugins |

## Specialist Registry Format

**Purpose:** Map task characteristics → VoltAgent specialist subagent types

**Location:** `~/.claude/get-shit-done/config/domain-registry.json`

**Format:**
```json
{
  "version": "1.0",
  "specialists": {
    "python": {
      "subagent_type": "python-pro",
      "plugin": "voltagent-lang",
      "patterns": ["\\.py$", "pip install", "pytest", "django", "flask"],
      "confidence_threshold": 0.7
    },
    "typescript": {
      "subagent_type": "typescript-pro",
      "plugin": "voltagent-lang",
      "patterns": ["\\.ts$", "\\.tsx$", "npm install", "jest", "react"],
      "confidence_threshold": 0.7
    },
    "infrastructure": {
      "subagent_type": "kubernetes-specialist",
      "plugin": "voltagent-infra",
      "patterns": ["kubernetes", "k8s", "kubectl", "helm"],
      "confidence_threshold": 0.8
    },
    "security": {
      "subagent_type": "security-engineer",
      "plugin": "voltagent-qa-sec",
      "patterns": ["auth", "jwt", "oauth", "encryption", "security audit"],
      "confidence_threshold": 0.8
    }
  },
  "coordinator": {
    "subagent_type": "multi-agent-coordinator",
    "plugin": "voltagent-meta",
    "use_when": "multi_domain_task"
  }
}
```

**Update strategy:** Ship with GSD updates, users can extend locally

## Detection Implementation

### At Executor Init (execute-plan.md)
```bash
# Step: detect_voltagent (NEW, runs once per phase)
detect_voltagent() {
  # Check cache first
  if [ -f .planning/voltagent-cache.json ] && \
     [ $(find .planning/voltagent-cache.json -mmin -60 2>/dev/null | wc -l) -gt 0 ]; then
    VOLTAGENT_AVAILABLE="true"
    return
  fi

  # Detect globally installed plugins
  PLUGIN_COUNT=$(npm list -g --depth=0 2>/dev/null | grep -c "voltagent-" || echo "0")

  if [ "$PLUGIN_COUNT" -gt 0 ]; then
    VOLTAGENT_AVAILABLE="true"

    # Cache detected plugins (JSON array)
    npm list -g --depth=0 --json 2>/dev/null | \
      jq -r '.dependencies | keys[] | select(startswith("voltagent-"))' | \
      jq -R -s -c 'split("\n") | map(select(length > 0))' > \
      .planning/voltagent-cache.json
  else
    VOLTAGENT_AVAILABLE="false"
    echo '[]' > .planning/voltagent-cache.json
  fi
}
```

**Why cache for 60 minutes:**
- npm list -g is slow (200-500ms)
- Plugins don't change mid-session
- Cache invalidates after 1 hour (catches new installs)

### At Task Execution (gsd-executor.md)
```bash
# Before executing task
if [ "$VOLTAGENT_AVAILABLE" = "true" ] && [ "$USE_SPECIALISTS" = "true" ]; then
  DOMAIN=$(classify_task_domain "$TASK")

  if [ -n "$DOMAIN" ]; then
    # Check if required plugin installed
    PLUGIN=$(jq -r ".specialists.${DOMAIN}.plugin" ~/.claude/get-shit-done/config/domain-registry.json)
    PLUGIN_INSTALLED=$(jq -r --arg p "$PLUGIN" 'any(. == $p)' .planning/voltagent-cache.json)

    if [ "$PLUGIN_INSTALLED" = "true" ]; then
      SPECIALIST_TYPE=$(jq -r ".specialists.${DOMAIN}.subagent_type" ~/.claude/get-shit-done/config/domain-registry.json)
      spawn_specialist "$SPECIALIST_TYPE" "$TASK"
    else
      # Graceful fallback
      execute_task_directly "$TASK"
    fi
  else
    execute_task_directly "$TASK"
  fi
else
  # VoltAgent not available or user disabled specialists
  execute_task_directly "$TASK"
fi
```

## Task Spawning Pattern

### Current GSD Pattern (Proven)
```bash
Task(
  prompt="Execute plan at ${PLAN_PATH}...",
  subagent_type="gsd-executor",
  model="${EXECUTOR_MODEL}",
  description="Execute ${PHASE}-${PLAN}"
)
```

### New Specialist Pattern (Same mechanism)
```bash
Task(
  prompt="$(render_specialist_prompt "$TASK" "$DOMAIN")",
  subagent_type="${SPECIALIST_TYPE}",  # "python-pro", "typescript-pro", etc.
  model="${EXECUTOR_MODEL}",           # Inherit model profile
  description="Execute task ${TASK_NUM} (${DOMAIN})"
)
```

**Key insight:** VoltAgent specialists ARE Claude Code subagents. They use the same Task tool, same model parameter, same result format. The only difference is `subagent_type` value and prompt content.

## Graceful Fallback Strategy

**Fallback triggers:**
1. VoltAgent plugins not installed globally
2. Required plugin missing (e.g., task needs `python-pro` but `voltagent-lang` not installed)
3. Domain classification fails (confidence < threshold)
4. User disabled specialists (`use_specialists: false` in config)
5. Specialist returns error/blocked status

**Fallback action:** gsd-executor executes task directly (current behavior)

**User experience:**
- No error messages (silent fallback)
- Works identically to current GSD
- Optional logging: "Task {N}: No specialist available, using generalist executor"

**Why this matters:**
- Backward compatibility guaranteed
- Works on machines without VoltAgent
- Degrades gracefully (no breaking changes)

## Configuration Schema

**Add to `.planning/config.json`:**
```json
{
  "workflow": {
    "mode": "interactive",
    "auto_advance": false,
    "use_specialists": false  // NEW: opt-in until v1.22 (stable)
  },
  "voltagent": {  // NEW section
    "detection_cache_ttl": 60,       // minutes
    "confidence_threshold": 0.7,     // domain classification minimum
    "fallback_on_error": true,       // use gsd-executor if specialist fails
    "log_specialist_usage": false    // track which specialists used
  }
}
```

**Why opt-in initially:**
- v1.21 = experimental integration
- v1.22 = default true after validation
- Users can enable early via `use_specialists: true`

## Performance Considerations

| Operation | Current (gsd-executor) | With Specialists | Delta |
|-----------|----------------------|------------------|-------|
| Task execution | ~30-90s | ~30-90s | 0s (same LLM) |
| Detection (once/phase) | 0s | ~300ms | +0.3s |
| Domain classification | 0s | ~50ms (regex) | +0.05s |
| Task adapter render | 0s | ~10ms (template) | +0.01s |
| **Total overhead** | - | - | **~360ms per phase** |

**Conclusion:** Negligible overhead (< 1 second per phase)

## Testing Strategy

### Phase 1: Detection validation
```bash
# Test detection works on all platforms
npm install -g voltagent-lang voltagent-infra
/gsd:execute-plan 01-01  # Should detect and log availability

# Test graceful fallback
npm uninstall -g voltagent-lang
/gsd:execute-plan 01-02  # Should work without error
```

### Phase 2: Specialist invocation
```bash
# Create plan with obvious domain (Python)
# Plan includes tasks: Create main.py, Write pytest tests
# Enable specialists: set use_specialists: true
/gsd:execute-plan 02-01

# Verify specialist was used (check logs)
# Verify result format matches GSD expectations
# Verify commits work correctly
```

### Phase 3: Multi-domain coordination
```bash
# Create plan with mixed domains
# Task 1: Python API (python-pro)
# Task 2: Dockerfile (infrastructure specialist)
# Task 3: Deploy (kubernetes-specialist)

# Should spawn multi-agent-coordinator
# Verify all specialists complete
# Verify aggregated result correct
```

## Alternatives Considered

### Alternative 1: VoltAgent Framework Embedding
**Approach:** Install `@voltagent/core`, use programmatic API
**Rejected because:**
- Adds npm dependencies to GSD (violates zero-dependency design)
- Requires Node.js runtime (GSD is runtime-agnostic)
- Framework overhead unnecessary (Task tool already works)

### Alternative 2: Separate VoltAgent Orchestrator
**Approach:** Create new orchestrator that manages both GSD and VoltAgent
**Rejected because:**
- Breaks GSD's state management (two sources of truth)
- Loses checkpoint protocol, deviation rules
- Massive refactor for unclear benefit

### Alternative 3: Prompt Library for Specialist Communication
**Approach:** Use prompt-foundry or llm-exe for specialist prompts
**Rejected because:**
- GSD already has template system (Markdown + variable substitution)
- Adds dependency, build step, version conflicts
- Markdown templates simpler, more maintainable

## Migration Path

**v1.21.0 (Current milestone):**
- Add detection layer
- Add domain classifier
- Add adapter templates
- Ship with `use_specialists: false` (opt-in)
- Document VoltAgent plugin installation

**v1.21.1 (Patch - validation):**
- Collect telemetry (how often specialists used vs fallback)
- Fix edge cases from user feedback
- Expand domain registry based on real usage

**v1.22.0 (Next milestone - default enabled):**
- Set `use_specialists: true` by default
- Add specialist usage metrics to SUMMARY.md
- Optimize domain classification (learned patterns)
- Add specialist recommendation to plan-phase (suggest specialist-friendly task structure)

## Sources

**HIGH Confidence:**
- VoltAgent awesome-claude-code-subagents documentation: https://github.com/VoltAgent/awesome-claude-code-subagents
- VoltAgent multi-agent-coordinator definition: https://github.com/VoltAgent/awesome-claude-code-subagents/blob/main/categories/09-meta-orchestration/multi-agent-coordinator.md
- Claude Code Task tool documentation: https://code.claude.com/docs/en/sub-agents
- GSD codebase (execute-plan.md, gsd-executor.md, gsd-tools.cjs)

**MEDIUM Confidence:**
- VoltAgent core architecture (WebSearch + voltagent.dev)
- npm global package detection patterns (npm docs + is-installed-globally package)
- TypeScript adapter patterns for LLMs (community articles)

**LOW Confidence:**
- VoltAgent programmatic API examples (limited public examples, inferred from framework docs)
- Multi-agent coordination patterns (described in blogs, not official docs)

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Detection approach | HIGH | npm CLI native, proven in similar systems |
| Task tool integration | HIGH | VoltAgent specialists ARE Claude Code subagents (verified) |
| Adapter pattern | HIGH | Standard prompt engineering, GSD already uses templates |
| Domain classification | MEDIUM | Regex patterns work but need real-world tuning |
| Multi-agent coordination | MEDIUM | VoltAgent provides coordinator but integration untested |
| Performance impact | MEDIUM | Detection measured, specialist execution estimated |

## Open Questions

1. **Specialist model inheritance:** Do VoltAgent specialists respect Claude Code's `model` parameter, or do they use plugin defaults? (Test during implementation)

2. **Coordinator overhead:** How much slower is multi-agent-coordinator vs sequential specialist spawning? (Benchmark during Phase 3 testing)

3. **Error propagation:** When specialist returns "blocked" status, should gsd-executor retry with fallback or surface to user? (Design decision needed)

4. **Plugin versioning:** What if user has old voltagent-lang (missing specialists)? Detect versions or graceful fallback? (v1.21.1 enhancement)

5. **Cross-platform detection:** Does `npm list -g` work identically on Windows? (Verify during testing)
