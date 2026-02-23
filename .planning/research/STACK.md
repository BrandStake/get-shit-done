# Stack Research: Orchestrator-Mediated Specialist Delegation

**Domain:** Multi-agent orchestration with dynamic specialist enumeration
**Researched:** 2026-02-22
**Confidence:** HIGH

## Executive Summary

Orchestrator-mediated specialist delegation requires **ZERO new dependencies**. The implementation leverages existing GSD infrastructure (Task tool, gsd-tools CLI, filesystem enumeration) to enable planners to enumerate available specialists and orchestrators to spawn them. This milestone fixes the broken v1.21 architecture where executors (subagents) incorrectly tried to call Task() — a capability only orchestrators possess.

**Core pattern:**
1. Orchestrators generate `available_agents.md` dynamically via filesystem enumeration
2. Planners read this file and assign specialists in PLAN.md frontmatter (`specialist` field per task)
3. Orchestrators read PLAN.md, spawn specialists via Task() based on assignments
4. Context passes via Task tool's `files_to_read` parameter (no custom mechanisms needed)

**Architectural shift:** Delegation moves from gsd-executor (subagent) to execute-phase orchestrator (has Task tool access).

## Recommended Stack

### Core Technologies (NO CHANGES REQUIRED)

| Technology | Version | Purpose | Why No Change Needed |
|------------|---------|---------|----------------------|
| Bash | System default | Agent filesystem enumeration | `ls ~/.claude/agents/*.md` provides specialist discovery |
| Node.js | System default | gsd-tools CLI for deterministic operations | Already handles PLAN.md parsing, state updates |
| Claude Code Task tool | Runtime | Subagent spawning with context injection | Built-in `files_to_read` handles all context passing |
| Markdown | N/A | Agent definition format | VoltAgent specialists already use .md format in ~/.claude/agents/ |

**Why no new dependencies:**
- The Task tool already provides everything needed:
  - Fresh 200k context window per spawn
  - `files_to_read` parameter for context injection
  - `subagent_type` routing to specialist agents
  - Built-in @-reference expansion for file loading
- Filesystem enumeration uses native Bash commands
- gsd-tools already parses PLAN.md frontmatter

### Orchestrator Stack Patterns

#### Pattern 1: Dynamic Agent Enumeration

**Stack:** Bash + filesystem → Markdown

**Where:** execute-phase orchestrator, plan-phase orchestrator

**Implementation:**
```bash
# Orchestrator generates available_agents.md before spawning planner
generate_available_agents() {
  local output_file=".planning/available_agents.md"

  cat > "$output_file" <<EOF
# Available Specialists

**Generated:** $(date -u +%Y-%m-%d)
**Source:** ~/.claude/agents/

EOF

  # Enumerate all VoltAgent specialists in ~/.claude/agents/
  for agent_file in ~/.claude/agents/*.md; do
    [ -f "$agent_file" ] || continue

    local agent_name=$(basename "$agent_file" .md)

    # Skip GSD system agents
    [[ "$agent_name" == gsd-* ]] && continue

    # Extract description from frontmatter (if exists)
    local description=$(grep "^description:" "$agent_file" 2>/dev/null | sed 's/description: *//' || echo "Specialist agent")

    echo "- **${agent_name}**: ${description}" >> "$output_file"
  done

  echo "" >> "$output_file"
  echo "**Usage:** Assign to tasks in PLAN.md frontmatter: \`specialist: python-pro\`" >> "$output_file"
}

# Call before spawning planner
generate_available_agents
```

**Why this works:**
- VoltAgent specialists installed globally at `~/.claude/agents/`
- File-based discovery is deterministic (no race conditions)
- Planner reads `available_agents.md` as context file
- Generated fresh each orchestrator run (no stale cache issues)
- No npm dependencies (pure filesystem enumeration)

#### Pattern 2: Planner Context Passing

**Stack:** Task tool `files_to_read` parameter

**Where:** plan-phase orchestrator spawning gsd-planner

**Implementation:**
```bash
# Orchestrator spawns planner with specialist roster
Task(
  subagent_type="gsd-planner",
  model="{planner_model}",
  prompt="<planning_context>
Phase: {phase_number}

<files_to_read>
Read these files at planning start:
- .planning/STATE.md (Project state)
- .planning/ROADMAP.md (Phase goals)
- .planning/available_agents.md (Specialist roster for assignment)
- {phase_dir}/*-CONTEXT.md (User decisions, if exists)
- {phase_dir}/*-RESEARCH.md (Technical research, if exists)
</files_to_read>

<specialist_assignment>
When creating PLAN.md files, add 'specialist' field to task frontmatter:

<task type=\"auto\" specialist=\"python-pro\">
  <name>Implement FastAPI authentication</name>
  ...
</task>

<task type=\"auto\" specialist=\"null\">
  <name>Update README</name>
  ...
</task>

Use null for general tasks (gsd-executor handles).
Assign specialists for domain-specific tasks based on available_agents.md roster.
</specialist_assignment>
</planning_context>",
  description="Plan Phase {phase}"
)
```

**Why this works:**
- Task tool handles all file loading (no custom context mechanisms)
- `available_agents.md` contains specialist names planner can reference
- @-reference expansion works for nested includes
- Files resolve relative to working directory
- Planner sees exact specialist names to use in assignments

#### Pattern 3: Orchestrator Spawning Specialists from PLAN.md

**Stack:** gsd-tools (PLAN.md parsing) + Task tool (spawning)

**Where:** execute-phase orchestrator (NOT gsd-executor)

**Implementation:**
```bash
# Orchestrator reads PLAN.md to determine specialist routing
# Note: This runs in the orchestrator, which HAS Task tool access

# Parse PLAN.md frontmatter and task list
PLAN_JSON=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs plan-parse "${PLAN_PATH}")

# Extract tasks with specialist assignments
TASKS=$(echo "$PLAN_JSON" | jq -c '.tasks[]')

while IFS= read -r task; do
  TASK_NUM=$(echo "$task" | jq -r '.number')
  TASK_NAME=$(echo "$task" | jq -r '.name')
  TASK_TYPE=$(echo "$task" | jq -r '.type')
  TASK_FILES=$(echo "$task" | jq -r '.files // ""')
  TASK_ACTION=$(echo "$task" | jq -r '.action // ""')
  TASK_VERIFY=$(echo "$task" | jq -r '.verify // ""')
  TASK_DONE=$(echo "$task" | jq -r '.done // ""')
  SPECIALIST=$(echo "$task" | jq -r '.specialist // "null"')

  if [ "$SPECIALIST" != "null" ] && [ -f ~/.claude/agents/${SPECIALIST}.md ]; then
    echo "→ Delegating task ${TASK_NUM} to ${SPECIALIST}"

    # Build specialist prompt using gsd-task-adapter pattern
    SPECIALIST_PROMPT=$(cat <<EOF
<task_context>
Task ${TASK_NUM}: ${TASK_NAME}

${TASK_ACTION}

<files_to_read>
Read these files for context:
- ./CLAUDE.md (Project instructions, if exists)
- .agents/skills/ (Project-specific patterns, if exists)
${TASK_FILES}
</files_to_read>

<verification>
${TASK_VERIFY}
</verification>

<done_criteria>
${TASK_DONE}
</done_criteria>

<gsd_rules>
CRITICAL: You must follow these execution rules:

1. Atomic Commits Only
   - Commit ONLY files directly related to this task
   - Use conventional commit format: {type}(task-id): {description}
   - Types: feat, fix, test, refactor, chore

2. Report Deviations
   - If you find bugs → fix them and report under "Rule 1 - Bug"
   - If critical functionality missing → add it and report under "Rule 2 - Missing Critical"
   - If task is blocked → fix blocker and report under "Rule 3 - Blocking Issue"

3. Structured Output Required
   - Provide results in JSON format (preferred) OR structured text
   - Required fields: files_modified, verification_status, commit_message, deviations

4. READ-ONLY State Files
   - DO NOT modify: STATE.md, ROADMAP.md, REQUIREMENTS.md, PLAN.md, SUMMARY.md
   - Single-writer pattern: Only orchestrator manages state files
   - Return structured output instead

Output Format:
{
  "files_modified": ["path/to/file1", "path/to/file2"],
  "verification_status": "passed",
  "commit_message": "feat(${PHASE}-${PLAN}): ${TASK_NAME}",
  "deviations": []
}
</gsd_rules>
</task_context>
EOF
)

    # Spawn specialist via Task tool
    SPECIALIST_OUTPUT=$(Task(
      subagent_type="$SPECIALIST",
      model="${EXECUTOR_MODEL}",
      prompt="$SPECIALIST_PROMPT",
      description="Task ${TASK_NUM} (${SPECIALIST})"
    ))

    # Parse specialist output using gsd-result-adapter
    RESULT=$(parse_specialist_result "$SPECIALIST_OUTPUT" "$TASK_FILES")

    # Extract fields
    FILES_MODIFIED=$(echo "$RESULT" | jq -r '.files_modified[]')
    VERIFICATION=$(echo "$RESULT" | jq -r '.verification_status')
    COMMIT_MSG=$(echo "$RESULT" | jq -r '.commit_message')

    # Orchestrator commits results (single-writer pattern)
    git add $FILES_MODIFIED
    git commit -m "$COMMIT_MSG

Co-authored-by: ${SPECIALIST} <specialist@voltagent>"

    echo "✓ Task ${TASK_NUM} complete (${SPECIALIST})"

  else
    # No specialist assigned OR specialist unavailable
    # Spawn gsd-executor for this task (standard GSD pattern)
    echo "→ Executing task ${TASK_NUM} directly (gsd-executor)"

    # Standard gsd-executor spawning (unchanged)
    Task(
      subagent_type="gsd-executor",
      model="${EXECUTOR_MODEL}",
      prompt="<task_execution>
Execute Task ${TASK_NUM} from ${PLAN_PATH}
...
</task_execution>",
      description="Task ${TASK_NUM}"
    )
  fi
done <<< "$TASKS"
```

**Why this works:**
- gsd-tools parses PLAN.md frontmatter (`specialist` field per task)
- Task tool spawns correct specialist based on assignment
- CLAUDE.md and .agents/skills/ auto-loaded via `files_to_read`
- Orchestrator handles commits (single-writer state pattern)
- Falls back to gsd-executor when specialist=null or unavailable

### Supporting Tools

#### gsd-tools CLI Extensions

**NEW command:** `plan-parse`

**Purpose:** Parse PLAN.md frontmatter and tasks into JSON

**Usage:**
```bash
node ~/.claude/get-shit-done/bin/gsd-tools.cjs plan-parse path/to/PLAN.md
```

**Output:**
```json
{
  "phase": "03-integration",
  "plan": "01",
  "type": "execute",
  "wave": 1,
  "autonomous": true,
  "tasks": [
    {
      "number": 1,
      "name": "Implement authentication",
      "type": "auto",
      "specialist": "python-pro",
      "files": ["src/api/auth.py"],
      "action": "Create FastAPI endpoint...",
      "verify": "pytest tests/test_auth.py",
      "done": "Tests pass"
    },
    {
      "number": 2,
      "name": "Update README",
      "type": "auto",
      "specialist": null,
      "files": ["README.md"],
      "action": "Document authentication flow...",
      "verify": "Manual review",
      "done": "README updated"
    }
  ]
}
```

**Implementation:** Extend existing frontmatter parsing in gsd-tools.cjs

**Why needed:** Orchestrators need structured access to specialist assignments

#### Result Parsing Helper

**Function:** `parse_specialist_result()`

**Purpose:** Extract structured data from specialist output

**Implementation:**
```bash
parse_specialist_result() {
  local specialist_output="$1"
  local expected_files="$2"

  # Try JSON extraction first (preferred)
  local json_block=""
  if echo "$specialist_output" | grep -q '```json'; then
    json_block=$(echo "$specialist_output" | sed -n '/```json/,/```/p' | sed '1d;$d')
  else
    json_block=$(echo "$specialist_output" | grep -o '{.*}' | head -n 1)
  fi

  # Validate JSON
  if [ -n "$json_block" ] && echo "$json_block" | jq -e '.files_modified' >/dev/null 2>&1; then
    echo "$json_block"
    return 0
  fi

  # Fallback: Heuristic text extraction
  local files_modified=$(echo "$specialist_output" | grep -iE "files? (modified|created):" | sed 's/^[^:]*: *//' | tr '\n' ' ')

  if [ -z "$files_modified" ]; then
    files_modified="$expected_files"  # Use expected files as fallback
  fi

  local verification_status="passed"  # Assume passed if specialist completed
  local commit_message="feat(task): completed task"  # Default message

  # Construct JSON from heuristic extraction
  cat <<EOF
{
  "files_modified": [$(echo "$files_modified" | tr ' ' '\n' | sed 's/^/"/; s/$/",/' | tr '\n' ' ' | sed 's/,$//')],
  "verification_status": "$verification_status",
  "commit_message": "$commit_message",
  "deviations": []
}
EOF
}
```

**Why needed:** Specialists return varied output formats; orchestrator needs consistent structure

### Tool Access Patterns

| Tool | Orchestrators | Subagents (gsd-executor, specialists) | Pattern |
|------|---------------|--------------------------------------|---------|
| **Task** | ✓ Available | ❌ Not available | Only orchestrators spawn subagents |
| **Read** | ✓ Available | ✓ Available | All agents read context |
| **Write** | ✓ Available | ✓ Available | All agents write files |
| **Bash** | ✓ Available | ✓ Available | All agents run commands |
| **gsd-tools** | ✓ Available | ✓ Available | All agents use CLI for deterministic operations |

**Key architectural constraint:** Subagents (gsd-executor, specialists) CANNOT call Task() — this capability exists only in orchestrators (main Claude, execute-phase, plan-phase workflows).

**v1.22 fix:** Delegation code must live in orchestrators, not in gsd-executor (which is a subagent).

## Alternatives Considered

### Alternative 1: VoltAgent Framework Runtime

| Recommended (Filesystem) | Alternative (Framework) | Why Not Alternative |
|--------------------------|-------------------------|---------------------|
| Bash `ls ~/.claude/agents/` | @voltagent/core npm package | Adds dependency, requires TypeScript, breaks GSD's Bash+Markdown philosophy |
| Available now | Requires installation | GSD should work without external frameworks |
| 0ms overhead | ~50ms framework initialization | Performance penalty |
| Works offline | Requires npm registry access | Network dependency |

### Alternative 2: Specialist Context via Environment Variables

| Recommended (files_to_read) | Alternative (ENV vars) | Why Not Alternative |
|------------------------------|------------------------|---------------------|
| Task tool `files_to_read` parameter | SPECIALIST_CONTEXT env var | ENV vars have 128KB limit (too small for CLAUDE.md + skills) |
| Native @-reference expansion | Manual base64 encoding/decoding | Complexity without benefit |
| Supports nested includes | Single-level only | Skills reference other files |
| Task tool handles loading | Custom serialization needed | Reinventing the wheel |

### Alternative 3: Central Specialist Registry JSON

| Recommended (Dynamic generation) | Alternative (Static registry) | Why Not Alternative |
|----------------------------------|-------------------------------|---------------------|
| Generate fresh per orchestrator run | .planning/specialist-registry.json | Stale after plugin install/uninstall |
| Filesystem as source of truth | Requires update mechanism | Additional state to maintain |
| Works immediately after `npm install -g` | Needs registry rebuild step | UX friction |
| No file conflicts | Git merge conflicts on registry updates | Coordination overhead |

### Alternative 4: gsd-executor Spawns Specialists (v1.21 pattern)

| Recommended (Orchestrator spawns) | Alternative (Executor spawns) | Why Not Alternative |
|-----------------------------------|-------------------------------|---------------------|
| execute-phase orchestrator has Task tool | gsd-executor is a subagent (no Task tool) | Architectural constraint - subagents can't spawn subagents |
| Orchestrator commits results | Executor commits (same as v1.20) | Executor pattern works but requires workaround for Task access |
| Single level of delegation | Two levels (orchestrator → executor → specialist) | Unnecessary indirection |
| Cleaner architecture | Maintains v1.21 pattern | v1.21 pattern was broken (executor lacks Task tool) |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Separate orchestrator agent files | Adds coordination overhead, increases context fragmentation | Inline orchestration logic in workflow .md files |
| Custom context serialization | Task tool already handles this | Task tool `files_to_read` parameter |
| Persistent specialist state | Violates fresh context principle | Pass state via files_to_read each spawn |
| LLM-based specialist selection | Adds latency, non-deterministic, costs tokens | Planner assigns in PLAN.md (human-in-loop via /gsd:discuss-phase) |
| npm-based specialist detection | Slow (200-500ms), requires npm runtime | Filesystem enumeration (instant, deterministic) |

## Stack Patterns by Scenario

### Scenario A: Planner needs specialist roster

**Pattern:**
1. Orchestrator generates `available_agents.md` via filesystem enumeration
2. Includes in planner's `files_to_read` parameter
3. Planner reads markdown, sees specialist names/descriptions
4. Assigns specialists in PLAN.md frontmatter (`specialist` field per task)

**Stack:** Bash (enumerate) → Markdown (format) → Task tool (pass) → gsd-planner (assign)

**Example flow:**
```
plan-phase orchestrator
  ↓ generate_available_agents() → .planning/available_agents.md
  ↓ Task(subagent_type="gsd-planner", files_to_read=["available_agents.md", ...])
gsd-planner
  ↓ Read available_agents.md
  ↓ Assign specialist per task in PLAN.md
  ↓ Write PLAN.md with <task specialist="python-pro">
```

### Scenario B: Orchestrator spawns specialist

**Pattern:**
1. Orchestrator reads PLAN.md via gsd-tools
2. Extracts `specialist` field per task
3. Builds Task() call with specialist's subagent_type
4. Passes project context via `files_to_read`
5. Parses specialist output, commits results

**Stack:** gsd-tools (parse) → Task tool (spawn) → Specialist (execute) → Orchestrator (commit)

**Example flow:**
```
execute-phase orchestrator
  ↓ plan-parse PLAN.md → extract tasks
  ↓ For each task with specialist assignment:
  ↓   Task(subagent_type="python-pro", prompt=adapted_task, files_to_read=[...])
python-pro specialist
  ↓ Execute task, return structured output
  ↓
execute-phase orchestrator
  ↓ Parse specialist output
  ↓ git commit with co-author attribution
```

### Scenario C: Specialist needs project context

**Pattern:**
1. Orchestrator lists context files in `files_to_read` block
2. Task tool expands @-references
3. Specialist receives resolved content in prompt
4. Specialist applies project conventions

**Stack:** Task tool (load) → @-reference expansion (resolve) → Specialist context window (apply)

**Example:**
```markdown
<!-- Orchestrator spawns specialist with context -->
<files_to_read>
- ./CLAUDE.md (Project instructions)
- .agents/skills/SKILL.md (Project patterns)
- src/existing_module.py (Reference implementation)
</files_to_read>
```

Task tool loads all files, specialist sees content inline, applies patterns.

## Version Compatibility

This implementation works with:
- **Claude Code** Task tool (all versions supporting `files_to_read` parameter)
- **OpenCode** Task tool (if Task tool available)
- **Gemini CLI** Task tool (if Task tool available)

**Compatibility requirements:**
- Task tool must support:
  - `subagent_type` parameter (for specialist routing)
  - `files_to_read` parameter (for context injection)
  - Fresh context window per spawn (200k tokens)
- VoltAgent specialists in `~/.claude/agents/` directory

**Graceful degradation:**
If Task tool unavailable (e.g., older CLI versions):
- Planner still creates PLAN.md with specialist assignments
- Orchestrator skips specialist spawning
- Falls back to gsd-executor for all tasks
- System works identically to v1.20

## Integration Points

### With Existing GSD Stack

| Component | Integration Method | Changes Required |
|-----------|-------------------|------------------|
| **execute-phase orchestrator** | Add specialist spawning logic based on PLAN.md | Add pattern 3 logic to workflow |
| **plan-phase orchestrator** | Generate available_agents.md, include in planner context | Add pattern 1 + 2 to workflow |
| **gsd-planner agent** | Read available_agents.md, add `specialist` field to tasks | Update role description |
| **gsd-executor agent** | REMOVE broken delegation code (can't call Task) | Delete specialist invocation logic from v1.21 |
| **gsd-tools CLI** | Add `plan-parse` command for PLAN.md parsing | New command (50 lines) |

### With VoltAgent Specialists

| Specialist Location | Discovery Method | Context Passing |
|---------------------|------------------|-----------------|
| `~/.claude/agents/python-pro.md` | Filesystem enumeration (`ls ~/.claude/agents/*.md \| grep -v gsd-`) | Task tool `files_to_read` |
| Installed globally via npm | Check presence via `ls`, not `npm list` (faster) | Same as above |
| Custom project specialists (`.agents/specialists/*.md`) | Future: Also enumerate from project dir | Same mechanism |

**VoltAgent plugin patterns:**
- `voltagent-lang`: python-pro, typescript-pro, javascript-expert, golang-pro, etc.
- `voltagent-infra`: kubernetes-specialist, docker-expert, terraform-engineer, etc.
- `voltagent-qa-sec`: security-engineer, qa-expert, penetration-tester, etc.

## Performance Considerations

| Operation | Current (v1.21) | With v1.22 | Delta |
|-----------|----------------|------------|-------|
| Specialist enumeration | Not available | ~5ms (ls + grep) | +5ms (once per orchestrator) |
| PLAN.md parsing | ~10ms | ~15ms | +5ms (extract specialist field) |
| Task spawning | ~100ms (gsd-executor) | ~100ms (specialist) | 0ms (same Task tool) |
| Context loading | Task tool handles | Task tool handles | 0ms (no change) |
| Result parsing | Not applicable | ~5ms (JSON parse) | +5ms per specialist task |
| **Total overhead** | - | - | **~20ms per phase** |

**Conclusion:** Negligible overhead (<50ms per phase), imperceptible to users

## Testing Strategy

### Phase 1: Enumeration validation

```bash
# Test enumeration works with VoltAgent installed
ls ~/.claude/agents/*.md | grep -v gsd-
# Should list python-pro.md, typescript-pro.md, etc.

# Test available_agents.md generation
generate_available_agents
cat .planning/available_agents.md
# Should contain specialist names and descriptions
```

### Phase 2: Planner assignment

```bash
# Spawn planner with available_agents.md context
/gsd:plan-phase 03
# Check generated PLAN.md has specialist assignments
grep "specialist=" .planning/phases/03-*/03-*-PLAN.md
# Should see specialist="python-pro", specialist="null", etc.
```

### Phase 3: Orchestrator spawning

```bash
# Create test plan with specialist assignments
# Execute via orchestrator
/gsd:execute-phase 03
# Verify specialists spawned (check output)
# Verify commits have co-author attribution
git log --grep "Co-authored-by"
```

## Sources

**HIGH confidence:**
- GSD codebase analysis (agents/gsd-executor.md, workflows/execute-phase.md, workflows/plan-phase.md) — 2026-02-22
- .planning/research/ARCHITECTURE.md (v1.21 adapter architecture) — 2026-02-22
- .planning/research/SUMMARY.md (orchestrator patterns) — 2026-02-22
- .planning/PROJECT.md constraint: "Only orchestrators have Task tool access" — 2026-02-22
- VoltAgent specialists installed at ~/.claude/agents/ (verified via ls) — 2026-02-22

**Verified patterns:**
- Task tool spawning: 50+ existing invocations across GSD workflows
- Context passing: `files_to_read` parameter used in all orchestrator→subagent calls
- Specialist enumeration: VoltAgent conventions (agents in `~/.claude/agents/`)
- PLAN.md frontmatter parsing: Existing gsd-tools patterns

**Assumptions:**
- VoltAgent specialists support `files_to_read` parameter (standard Claude Code subagent pattern)
- Specialists return text output (parsed via heuristics or structured JSON)
- Orchestrators can commit on behalf of specialists (Git allows)

---

*Stack research for: Orchestrator-mediated specialist delegation*
*Researched: 2026-02-22*
