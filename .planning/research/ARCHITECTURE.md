# Architecture Research: Orchestrator-Mediated Specialist Delegation

**Domain:** Multi-agent orchestration with specialist delegation for GSD v1.22
**Researched:** 2026-02-22
**Confidence:** HIGH

## Integration Architecture

### Current System (v1.21 - Broken Delegation)

```
┌──────────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR (Main Claude)                 │
│                    - Runs slash commands                      │
│                    - Has Task() tool access                   │
│                    - Spawns subagents                         │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌──────────────┐  ┌───────────────┐        │
│  │ Workflow   │  │  Workflow    │  │   Workflow    │        │
│  │ plan-phase │  │execute-phase │  │ verify-phase  │        │
│  └──────┬─────┘  └──────┬───────┘  └───────┬───────┘        │
│         │                │                  │                │
│         ↓                ↓                  ↓                │
│  ┌────────────┐  ┌──────────────┐  ┌───────────────┐        │
│  │ gsd-       │  │ gsd-executor │  │ gsd-verifier  │        │
│  │ planner    │  │              │  │               │        │
│  └────────────┘  └──────┬───────┘  └───────────────┘        │
│                         │                                     │
│                         │ BROKEN: Tries to spawn             │
│                         │ specialists via Task()             │
│                         │ But NO Task tool access!           │
│                         ↓                                     │
│                  ❌ VoltAgent Specialist (fails)              │
└──────────────────────────────────────────────────────────────┘
```

**The Problem (v1.21):**
- gsd-executor tried to call `Task(subagent_type="python-pro", ...)`
- **Subagents DON'T have Task tool access** (only orchestrator does)
- Result: delegation fails at runtime

### Target System (v1.22 - Orchestrator-Mediated)

```
┌───────────────────────────────────────────────────────────────────┐
│                     ORCHESTRATOR (Main Claude)                     │
│                     - ONLY entity with Task() tool                 │
│                     - Runs slash commands (/gsd:*)                │
│                     - Spawns ALL subagents (gsd + specialists)    │
├───────────────────────────────────────────────────────────────────┤
│  ┌────────────────┐  ┌──────────────────┐  ┌─────────────┐       │
│  │ plan-phase.md  │  │ execute-phase.md │  │verify-phase │       │
│  └────────┬───────┘  └─────────┬────────┘  └──────┬──────┘       │
│           │                    │                   │              │
│           ↓                    │                   ↓              │
│    ┌────────────┐              │            ┌─────────────┐      │
│    │ Generate   │              │            │ gsd-verifier│      │
│    │ available_ │              │            └─────────────┘      │
│    │ agents.md  │              │                                 │
│    └──────┬─────┘              │                                 │
│           │                    │                                 │
│           ↓                    │                                 │
│    ┌────────────┐              │                                 │
│    │ gsd-       │              │                                 │
│    │ planner    │              │                                 │
│    │            │              │                                 │
│    │ Reads      │              │                                 │
│    │ available_ │              │                                 │
│    │ agents.md  │              │                                 │
│    │            │              │                                 │
│    │ Assigns    │              │                                 │
│    │ specialist │              │                                 │
│    │ field ──┐  │              │                                 │
│    └─────────┼──┘              │                                 │
│              │                 │                                 │
│              ↓                 │                                 │
│        PLAN.md with            │                                 │
│        specialist: python-pro  │                                 │
│              │                 │                                 │
│              └─────────────────┤                                 │
│                                │                                 │
│                                ↓                                 │
│                      ┌────────────────────┐                      │
│                      │ FOR EACH TASK:     │                      │
│                      │ Read specialist    │                      │
│                      │ field from PLAN.md │                      │
│                      └─────────┬──────────┘                      │
│                                │                                 │
│                        ┌───────┴────────┐                        │
│                        │                │                        │
│                   specialist          No specialist              │
│                   assigned            (direct)                   │
│                        │                │                        │
│                        ↓                ↓                        │
│              Task(subagent_type=  Task(subagent_type=           │
│              "python-pro", ...)   "gsd-executor", ...)          │
│                        │                │                        │
├────────────────────────┼────────────────┼─────────────────────────┤
│                 EXECUTION LAYER         │                        │
├────────────────────────┼────────────────┼─────────────────────────┤
│  ┌─────────────────────┴──┐  ┌──────────┴──────────────────┐    │
│  │  VoltAgent Specialist  │  │  gsd-executor (direct)      │    │
│  │  (python-pro, etc)     │  │                             │    │
│  │                        │  │  - Manages STATE.md         │    │
│  │  - Executes task       │  │  - Commits                  │    │
│  │  - Returns result      │  │  - Checkpoints              │    │
│  │  - NO Task access      │  │  - Deviations               │    │
│  │  - NO state writes     │  │                             │    │
│  └────────────┬───────────┘  └──────────┬──────────────────┘    │
│               │                         │                        │
│               └─────────────┬───────────┘                        │
│                             │                                    │
│                      Results flow back                           │
│                      to orchestrator                             │
│                             │                                    │
│                             ↓                                    │
│               Orchestrator updates STATE.md                      │
│               via gsd-tools (single-writer)                      │
└──────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | Location | New/Modified |
|-----------|----------------|----------|--------------|
| **Orchestrator** | Spawns ALL subagents via Task() | Workflows (*.md) | Modified |
| **available_agents.md generator** | Create specialist registry for planner | plan-phase.md | **NEW** |
| **gsd-planner** | Assign specialist field to tasks | agents/gsd-planner.md | Modified |
| **execute-phase workflow** | Read specialist field, spawn appropriately | workflows/execute-phase.md | Modified |
| **VoltAgent Specialists** | Execute tasks with domain expertise | ~/.claude/agents/*.md | External |
| **gsd-executor** | Direct execution, STATE.md management | agents/gsd-executor.md | Unchanged (v1.22) |
| **STATE.md writer** | Single-writer pattern via gsd-tools | gsd-tools.cjs | Unchanged |

## Data Flow

### Flow 1: Planning with Specialist Assignment

```
User: /gsd:plan-phase X
    ↓
Orchestrator (plan-phase.md)
    ↓
1. Generate available_agents.md
   ┌────────────────────────────────────────┐
   │ Scan ~/.claude/agents/*.md             │
   │ Check npm global voltagent-*           │
   │ Write to .planning/available_agents.md │
   └────────────────────┬───────────────────┘
                        ↓
2. Spawn gsd-planner via Task()
   ┌────────────────────────────────────────┐
   │ Task(                                  │
   │   subagent_type="general-purpose",     │
   │   prompt="Read ~/.claude/agents/       │
   │           gsd-planner.md               │
   │           <files_to_read>              │
   │           - ROADMAP.md                 │
   │           - STATE.md                   │
   │           - available_agents.md ← NEW  │
   │           </files_to_read>"            │
   │ )                                      │
   └────────────────────┬───────────────────┘
                        ↓
gsd-planner executes:
   ┌────────────────────────────────────────┐
   │ 1. Read available_agents.md            │
   │ 2. For each task:                      │
   │    - Detect domain (keyword match)     │
   │    - Check if specialist available     │
   │    - Evaluate complexity (>3 files?)   │
   │    ┌─────────────────────────────┐    │
   │    │ If domain + available +      │    │
   │    │ complex enough:              │    │
   │    │   specialist: python-pro     │    │
   │    └─────────────────────────────┘    │
   │ 3. Write PLAN.md with specialist field │
   └────────────────────┬───────────────────┘
                        ↓
PLAN.md created:
<task type="auto" specialist="python-pro">
  <name>Implement FastAPI authentication</name>
  <files>src/api/auth.py</files>
  <action>Create POST /auth/login...</action>
  <verify>pytest tests/test_auth.py</verify>
  <done>Login returns JWT</done>
</task>
                        ↓
Return to orchestrator:
## PLANNING COMPLETE
```

### Flow 2: Execution with Orchestrator-Mediated Delegation

```
User: /gsd:execute-phase X
    ↓
Orchestrator (execute-phase.md)
    ↓
1. Read PLAN.md files for phase
    ↓
2. Group into waves (unchanged)
    ↓
3. For each plan in wave:
   ┌────────────────────────────────────────┐
   │ Parse ALL tasks in PLAN.md             │
   │                                        │
   │ For each task:                         │
   │   1. Extract specialist field from XML │
   │   2. Route based on field:             │
   │                                        │
   │   If specialist assigned:              │
   │   ┌──────────────────────────────────┐ │
   │   │ Task(                            │ │
   │   │   subagent_type="python-pro",    │ │
   │   │   model=executor_model,          │ │
   │   │   prompt="                       │ │
   │   │     <task_context>               │ │
   │   │     [Task details from PLAN.md]  │ │
   │   │     </task_context>              │ │
   │   │     <files_to_read>              │ │
   │   │     - CLAUDE.md                  │ │
   │   │     - .agents/skills/            │ │
   │   │     - [task files]               │ │
   │   │     </files_to_read>             │ │
   │   │     <gsd_rules>                  │ │
   │   │     - Commit format              │ │
   │   │     - Deviation rules            │ │
   │   │     - Output format              │ │
   │   │     </gsd_rules>                 │ │
   │   │   ",                             │ │
   │   │   description="Task 03-02-1"     │ │
   │   │ )                                │ │
   │   └──────────────┬───────────────────┘ │
   │                  │                     │
   │                  ↓                     │
   │         python-pro executes            │
   │                  │                     │
   │                  ↓                     │
   │         Returns result:                │
   │         {                              │
   │           files_modified: [...],       │
   │           verification_status: "...",  │
   │           commit_message: "...",       │
   │           deviations: [...]            │
   │         }                              │
   │                  │                     │
   │   If NO specialist:                    │
   │   ┌──────────────────────────────────┐ │
   │   │ Task(                            │ │
   │   │   subagent_type="gsd-executor",  │ │
   │   │   model=executor_model,          │ │
   │   │   prompt="@gsd-executor.md       │ │
   │   │           <files_to_read>        │ │
   │   │           - PLAN.md              │ │
   │   │           - STATE.md             │ │
   │   │           </files_to_read>"      │ │
   │   │ )                                │ │
   │   └──────────────┬───────────────────┘ │
   │                  │                     │
   │                  ↓                     │
   │        gsd-executor executes           │
   │        (traditional flow)              │
   │                  │                     │
   │                  ↓                     │
   │        Returns via SUMMARY.md          │
   └──────────────────┬─────────────────────┘
                      ↓
4. Orchestrator receives results
   ┌────────────────────────────────────────┐
   │ Parse specialist/executor output       │
   │ Update STATE.md via gsd-tools:         │
   │   - state advance-plan                 │
   │   - state update-progress              │
   │   - state record-metric                │
   │ Update ROADMAP.md progress             │
   │ Update REQUIREMENTS.md checkboxes      │
   └────────────────────┬───────────────────┘
                        ↓
5. Next task or complete
```

## Integration Points

### Point 1: available_agents.md Generation (NEW)

**Location:** plan-phase.md workflow (before spawning gsd-planner)

**Implementation:**
```bash
# In plan-phase.md Step 5.5 (after research, before planner spawn)
generate_available_agents() {
  local output_file=".planning/available_agents.md"

  echo "# Available Specialists" > "$output_file"
  echo "" >> "$output_file"
  echo "VoltAgent specialists installed and available for delegation:" >> "$output_file"
  echo "" >> "$output_file"

  # Scan ~/.claude/agents/
  if [ -d "$HOME/.claude/agents" ]; then
    for agent_file in "$HOME/.claude/agents"/*.md; do
      if [[ -f "$agent_file" ]]; then
        agent_name=$(basename "$agent_file" .md)
        # Filter for VoltAgent specialists (exclude gsd-* agents)
        if [[ "$agent_name" =~ (pro|specialist|expert|engineer|architect|tester)$ ]] && \
           [[ ! "$agent_name" =~ ^gsd- ]]; then
          echo "- $agent_name" >> "$output_file"
        fi
      fi
    done
  fi

  # Optionally check npm global for voltagent-* packages
  if command -v npm >/dev/null 2>&1; then
    npm list -g --depth=0 2>/dev/null | grep 'voltagent-' | \
      sed 's/.*voltagent-\([^ @]*\).*/- \1/' >> "$output_file"
  fi
}

generate_available_agents
```

**Output format (.planning/available_agents.md):**
```markdown
# Available Specialists

VoltAgent specialists installed and available for delegation:

- python-pro
- typescript-pro
- postgres-pro
- kubernetes-specialist
- docker-expert
- terraform-engineer
- aws-architect
- security-engineer
```

### Point 2: Planner Specialist Assignment (MODIFIED)

**Location:** agents/gsd-planner.md

**Changes:**
1. Add available_agents.md to files_to_read
2. Add domain detection logic to task creation
3. Add specialist field to task XML when applicable

**Implementation (in gsd-planner.md <task_breakdown>):**
```xml
<!-- NEW section in gsd-planner.md -->
<specialist_assignment>

## Specialist Assignment

For each task, determine if specialist delegation is beneficial:

1. **Read available_agents.md**
   - Load list of installed specialists
   - If file missing, skip specialist assignment

2. **Detect domain** (keyword matching):
   ```bash
   detect_specialist() {
     local desc="$1"

     # Language specialists
     if echo "$desc" | grep -iE "python|fastapi|django|flask|pytest" >/dev/null; then
       echo "python-pro"
     elif echo "$desc" | grep -iE "typescript|react|next\.js|tsx" >/dev/null; then
       echo "typescript-pro"
     elif echo "$desc" | grep -iE "golang|go " >/dev/null; then
       echo "golang-pro"

     # Infrastructure specialists
     elif echo "$desc" | grep -iE "kubernetes|k8s|helm" >/dev/null; then
       echo "kubernetes-specialist"
     elif echo "$desc" | grep -iE "docker|container" >/dev/null; then
       echo "docker-expert"
     elif echo "$desc" | grep -iE "terraform|\.tf" >/dev/null; then
       echo "terraform-engineer"

     # Data specialists
     elif echo "$desc" | grep -iE "postgres|postgresql|sql" >/dev/null; then
       echo "postgres-pro"
     elif echo "$desc" | grep -iE "security|auth|cors|csrf" >/dev/null; then
       echo "security-engineer"

     else
       echo ""  # No specialist match
     fi
   }
   ```

3. **Check availability**:
   - Verify specialist is in available_agents.md list
   - If detected but unavailable, do NOT assign (orchestrator will execute directly)

4. **Evaluate complexity**:
   - File count: >3 files modified → delegate
   - Line count estimate: >50 lines → delegate
   - Simple tasks (docs, config) → do NOT delegate

5. **Assign specialist field**:
   ```xml
   <!-- If specialist appropriate and available -->
   <task type="auto" specialist="python-pro">
     ...
   </task>

   <!-- If no specialist or unavailable -->
   <task type="auto">
     ...
   </task>
   ```

</specialist_assignment>
```

### Point 3: Orchestrator Specialist Spawning (MODIFIED)

**Location:** workflows/execute-phase.md

**Changes:** Add specialist field parsing and routing logic

**Implementation (new step after identify_plan):**
```xml
<step name="parse_specialist_assignments">

For each PLAN.md in the phase:

```bash
# Extract specialist assignments from ALL tasks
parse_task_specialists() {
  local plan_file="$1"

  # Parse each task
  while IFS= read -r task_block; do
    # Extract specialist attribute if present
    if echo "$task_block" | grep -q 'specialist="[^"]*"'; then
      SPECIALIST=$(echo "$task_block" | grep -o 'specialist="[^"]*"' | cut -d'"' -f2)
    else
      SPECIALIST=""  # No specialist assigned
    fi

    # Extract task details
    TASK_NAME=$(echo "$task_block" | grep -oP '<name>\K[^<]+')
    TASK_FILES=$(echo "$task_block" | grep -oP '<files>\K[^<]+')
    TASK_ACTION=$(echo "$task_block" | grep -oP '<action>\K[^<]+')
    TASK_VERIFY=$(echo "$task_block" | grep -oP '<verify>\K[^<]+')
    TASK_DONE=$(echo "$task_block" | grep -oP '<done>\K[^<]+')

    # Store routing decision
    if [[ -n "$SPECIALIST" ]]; then
      TASKS["$task_num"]="specialist:$SPECIALIST"
    else
      TASKS["$task_num"]="direct"
    fi
  done < <(sed -n '/<task/,/<\/task>/p' "$plan_file")
}
```

</step>

<step name="execute_with_routing">

For each task:

```bash
if [[ "${TASKS[$task_num]}" == specialist:* ]]; then
  # Extract specialist name
  SPECIALIST="${TASKS[$task_num]#specialist:}"

  # Build specialist prompt (adapter logic)
  SPECIALIST_PROMPT=$(cat <<EOF
<task_context>
**Task:** $TASK_NAME

**Objective:**
$TASK_ACTION

**Files to modify:**
$TASK_FILES

**Verification:**
$TASK_VERIFY

**Success criteria:**
$TASK_DONE
</task_context>

<files_to_read>
- CLAUDE.md (project conventions)
- .agents/skills/ (project patterns)
$(echo "$TASK_FILES" | sed 's/^/- /')
</files_to_read>

<gsd_execution_rules>
**CRITICAL:** You must follow these execution rules:

1. **Atomic Commits Only**
   - Commit ONLY files related to this task
   - Use format: {type}(${PHASE}-${PLAN}): {description}
   - Types: feat, fix, test, refactor, chore

2. **Report Deviations**
   - Bug fixes → [Rule 1 - Bug]
   - Missing critical → [Rule 2 - Missing Critical]
   - Blocking issues → [Rule 3 - Blocking]

3. **Output Format**
   Return structured output with:
   - files_modified: [list]
   - verification_status: passed|failed
   - commit_message: "type(${PHASE}-${PLAN}): description"
   - deviations: [list of {rule, description, fix}]
</gsd_execution_rules>
EOF
)

  # Spawn specialist via Task()
  echo "→ Delegating to $SPECIALIST..."
  Task(
    subagent_type="$SPECIALIST",
    model="$EXECUTOR_MODEL",
    prompt="$SPECIALIST_PROMPT",
    description="Task ${PHASE}-${PLAN}-${task_num}"
  )

  # Parse specialist result (orchestrator parses output)
  # Update STATE.md via gsd-tools

else
  # Direct execution via gsd-executor
  echo "→ Executing directly..."
  Task(
    subagent_type="gsd-executor",
    model="$EXECUTOR_MODEL",
    prompt="@gsd-executor.md
           <files_to_read>
           - $PLAN_FILE
           - .planning/STATE.md
           - CLAUDE.md
           </files_to_read>
           Execute tasks $task_num through $task_num",
    description="Execute ${PHASE}-${PLAN}"
  )
fi
```

</step>
```

### Point 4: State Management (UNCHANGED)

**Constraint:** Single-writer pattern preserved

**Implementation:** Orchestrator (not specialists) updates STATE.md

```bash
# After specialist OR executor returns
node ~/.claude/get-shit-done/bin/gsd-tools.cjs state advance-plan
node ~/.claude/get-shit-done/bin/gsd-tools.cjs state update-progress
node ~/.claude/get-shit-done/bin/gsd-tools.cjs state record-metric \
  --phase "$PHASE" --plan "$PLAN" --duration "$DURATION"
```

**Why:** Specialists don't have access to STATE.md write operations. Orchestrator remains single writer.

## Architectural Patterns

### Pattern 1: Orchestrator-Mediated Delegation

**What:** Only orchestrator spawns subagents. Subagents NEVER call Task().

**Why:** Tool access constraint. Only main Claude (orchestrator) has Task tool.

**How implemented:**
- Planner: Assigns specialist field in PLAN.md
- Orchestrator: Reads field, spawns appropriate subagent
- Subagent: Executes, returns result (no further spawning)

**Trade-offs:**
- Pro: Clear responsibility, no coordination failures
- Pro: Preserves single-writer state pattern
- Con: Extra parse step (read PLAN.md, extract specialist field)

### Pattern 2: Declarative Routing via PLAN.md

**What:** Routing decisions made at planning time, embedded as specialist attribute in task XML.

**Why:** Planner has domain knowledge, complexity signals, specialist availability.

**How implemented:**
```xml
<task type="auto" specialist="python-pro">
  ...
</task>
```

**Trade-offs:**
- Pro: Explicit routing visible in plan
- Pro: Can be reviewed/edited before execution
- Pro: Deterministic (no runtime surprises)
- Con: Less dynamic than runtime routing

### Pattern 3: Fresh Context Windows

**What:** Spawn new subagent for each substantial task with full 200k context budget.

**Why:** Prevents context degradation, maintains quality throughout execution.

**How implemented:**
- Each Task() call gets fresh context
- Project conventions (CLAUDE.md, skills) loaded via files_to_read
- No context carryover between tasks

**Trade-offs:**
- Pro: Quality maintained (no degradation curve)
- Pro: Parallel execution possible
- Con: Context transfer overhead (files_to_read parameter)

### Pattern 4: Single-Writer State Pattern

**What:** Only orchestrator writes STATE.md, ROADMAP.md, REQUIREMENTS.md.

**Why:** Prevents concurrent write conflicts, maintains single source of truth.

**How implemented:**
- Specialists: Return results (files_modified, verification_status, deviations)
- Orchestrator: Parses results, updates state via gsd-tools
- gsd-executor: When executing directly, also returns (doesn't write state during task execution)

**Trade-offs:**
- Pro: No race conditions
- Pro: Single source of truth
- Con: Specialists can't update state directly (must return structured data)

## New vs Modified Components

### NEW Components

| Component | Purpose | Location |
|-----------|---------|----------|
| available_agents.md generator | Create specialist registry | plan-phase.md (new function) |
| Specialist field parser | Extract specialist from task XML | execute-phase.md (new function) |
| Specialist prompt builder | Build specialist-friendly prompts | execute-phase.md (new function) |
| Specialist result parser | Parse specialist output | execute-phase.md (new function) |

### MODIFIED Components

| Component | Change | Impact |
|-----------|--------|--------|
| plan-phase.md | Add available_agents.md generation before planner spawn | +30 lines |
| gsd-planner.md | Add specialist assignment logic to task creation | +150 lines |
| execute-phase.md | Add specialist field parsing and routing | +200 lines |

### UNCHANGED Components

| Component | Why Unchanged |
|-----------|---------------|
| gsd-executor.md | No longer attempts delegation (v1.21 broken code removed) |
| gsd-verifier.md | Independent of execution path |
| STATE.md management | Single-writer via orchestrator preserved |
| Checkpoint protocol | Works regardless of executor type |
| Deviation rules | Apply to all execution modes |
| Commit protocol | Specialist commits handled by orchestrator |

## Data Structures

### PLAN.md with Specialist Field

```xml
<task type="auto" specialist="python-pro">
  <name>Implement FastAPI authentication</name>
  <files>
    src/api/auth.py
    src/models/user.py
    tests/test_auth.py
  </files>
  <action>
    Create POST /auth/login endpoint accepting email and password.
    Use bcrypt for password hashing, jose library for JWT tokens.
    Return JWT in httpOnly cookie with 15-min expiry.
  </action>
  <verify>
    pytest tests/test_auth.py::test_login
    pytest tests/test_auth.py::test_invalid_credentials
  </verify>
  <done>
    Valid credentials return 200 with JWT cookie.
    Invalid credentials return 401.
    Tests pass.
  </done>
</task>
```

### available_agents.md Format

```markdown
# Available Specialists

VoltAgent specialists installed and available for delegation:

- python-pro
- typescript-pro
- golang-pro
- rust-engineer
- java-specialist
- kubernetes-specialist
- docker-expert
- terraform-engineer
- aws-architect
- postgres-pro
- mongodb-specialist
- security-engineer
```

### Specialist Result Format (Expected Output)

```
Implementation Summary:
Created FastAPI authentication endpoint with JWT tokens. Used jose library for token generation, bcrypt for password hashing. Added httpOnly cookie with 15-min expiry.

Files Modified:
- src/api/auth.py
- src/models/user.py
- tests/test_auth.py

Verification Results:
✓ pytest tests/test_auth.py::test_login PASSED
✓ pytest tests/test_auth.py::test_invalid_credentials PASSED

Deviations:
- [Rule 2 - Missing Critical] Added input validation for email format (regex validation)
- [Rule 2 - Missing Critical] Added rate limiting to prevent brute force (10 attempts/min)

Suggested Commit Message:
feat(03-02): implement JWT authentication with FastAPI
```

## Build Order

### Phase 1: Infrastructure (Planner Integration)

**Goal:** Planner can assign specialists, orchestrator can parse

1. **available_agents.md generation**
   - Add to plan-phase.md before planner spawn
   - Scan ~/.claude/agents/, write registry
   - Dependencies: None

2. **Planner specialist assignment**
   - Add domain detection to gsd-planner.md
   - Add specialist field to task XML
   - Dependencies: available_agents.md exists

3. **Orchestrator parsing**
   - Add specialist field parser to execute-phase.md
   - Extract specialist from task XML
   - Dependencies: PLAN.md with specialist field

**Verification:** Planner creates PLAN.md with specialist fields. Orchestrator parses correctly.

### Phase 2: Orchestrator Spawning

**Goal:** Orchestrator spawns specialists via Task()

4. **Specialist prompt builder**
   - Extract task details from PLAN.md
   - Build specialist-friendly prompt
   - Include GSD execution rules
   - Dependencies: Specialist field parser

5. **Specialist spawning**
   - Call Task(subagent_type=specialist, ...)
   - Pass built prompt
   - Dependencies: Specialist prompt builder

6. **Direct execution fallback**
   - If no specialist field, spawn gsd-executor
   - Preserve existing behavior
   - Dependencies: None

**Verification:** Orchestrator spawns python-pro for Python tasks, gsd-executor for unassigned tasks.

### Phase 3: Result Handling

**Goal:** Parse specialist output, update STATE.md

7. **Specialist result parser**
   - Parse specialist output (heuristic text parsing)
   - Extract files_modified, verification_status, deviations
   - Fallback to git status if parsing fails
   - Dependencies: Specialist spawning

8. **STATE.md updates**
   - Orchestrator calls gsd-tools state commands
   - Single-writer pattern preserved
   - Dependencies: Result parser

9. **SUMMARY.md metadata**
   - Track specialist usage
   - Include delegation_rate
   - Document specialist outcomes
   - Dependencies: Result parser

**Verification:** Specialist completes task, orchestrator updates STATE.md correctly, SUMMARY.md includes specialist metadata.

### Phase 4: Validation & Robustness

**Goal:** Handle errors, edge cases, graceful fallback

10. **Specialist availability check**
    - Verify specialist exists before spawning
    - Fallback to direct execution if missing
    - Dependencies: Specialist spawning

11. **Result validation**
    - Verify files exist on disk
    - Validate commit message format
    - Check verification passed
    - Dependencies: Result parser

12. **Error handling**
    - Specialist execution failure → fallback
    - Parse error → fallback
    - Missing fields → generate defaults
    - Dependencies: All previous

**Verification:** Missing specialist gracefully falls back. Parse errors don't break execution.

## Anti-Patterns to Avoid

### ❌ Subagent Task Invocation (v1.21 Mistake)

**What NOT to do:**
```typescript
// In gsd-executor.md (WRONG - this is what v1.21 tried)
Task(subagent_type="python-pro", ...) // FAILS - no Task access
```

**Why wrong:** Subagents don't have Task tool access

**Do this instead:**
```typescript
// In gsd-planner.md (planning time)
<task specialist="python-pro">...</task>

// In execute-phase.md (orchestrator)
Task(subagent_type="python-pro", ...)  // ✓ Orchestrator has Task access
```

### ❌ Specialist State File Writes

**What NOT to do:**
```bash
# In specialist context (WRONG)
echo "completed" >> .planning/STATE.md
```

**Why wrong:** Breaks single-writer pattern, causes corruption

**Do this instead:**
```bash
# Specialist returns result
# Orchestrator updates state:
node gsd-tools.cjs state advance-plan
```

### ❌ Runtime Routing in Executor

**What NOT to do:**
```bash
# In gsd-executor (WRONG)
if [[ "$TASK" == *"python"* ]]; then
  Task(subagent_type="python-pro", ...)  # FAILS - no Task access
fi
```

**Why wrong:** Executor can't spawn subagents

**Do this instead:**
```xml
<!-- In gsd-planner (planning time) -->
<task specialist="python-pro">...</task>
<!-- Orchestrator spawns based on field -->
```

### ❌ Requiring VoltAgent Plugins

**What NOT to do:**
```bash
# Check specialist exists, error if missing (WRONG)
if [[ ! -f ~/.claude/agents/python-pro.md ]]; then
  echo "ERROR: python-pro not installed"
  exit 1
fi
```

**Why wrong:** Breaks users without plugins

**Do this instead:**
```bash
# Graceful fallback
if [[ -f ~/.claude/agents/python-pro.md ]]; then
  # Spawn specialist
else
  # Direct execution
fi
```

## Validation Checklist

### Planning Phase

- [ ] available_agents.md generated with installed specialists
- [ ] gsd-planner reads available_agents.md
- [ ] gsd-planner assigns specialist field when applicable
- [ ] PLAN.md contains `<task specialist="...">` for qualifying tasks
- [ ] PLAN.md contains `<task>` (no specialist) for others

### Execution Phase

- [ ] execute-phase.md parses specialist field from task XML
- [ ] Orchestrator spawns specialist via Task() when field present
- [ ] Orchestrator spawns gsd-executor when field absent
- [ ] Specialist prompt includes task context, project files, GSD rules
- [ ] Specialist executes and returns structured output

### State Management

- [ ] Orchestrator parses specialist result
- [ ] Orchestrator updates STATE.md via gsd-tools (single-writer)
- [ ] Orchestrator updates ROADMAP.md progress
- [ ] Orchestrator updates REQUIREMENTS.md checkboxes
- [ ] SUMMARY.md includes specialist usage metadata

### Backward Compatibility

- [ ] PLAN.md without specialist field → direct execution
- [ ] No VoltAgent plugins → all tasks execute directly
- [ ] Existing v1.21 PLANs work unchanged

## Sources

**PRIMARY (HIGH confidence):**
- agents/gsd-executor.md (lines 1-2067) — adapter functions, delegation logic (v1.21)
- agents/gsd-planner.md (lines 1-1195) — task creation, frontmatter structure
- workflows/plan-phase.md (lines 1-479) — orchestrator for planning
- workflows/execute-phase.md (lines 1-446) — orchestrator for execution
- PROJECT.md (lines 1-106) — v1.22 goals, constraints

**VALIDATION (HIGH confidence):**
- v1.21 shipped with broken delegation (executor assumed Task access)
- v1.22 fixes by moving delegation to orchestrator level
- Tool access verified: only main Claude has Task tool (subagents don't)

---
*Architecture research for: Orchestrator-mediated specialist delegation*
*Researched: 2026-02-22*
