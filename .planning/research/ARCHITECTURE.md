# Architecture: VoltAgent Adapter Integration

**Domain:** Hybrid agent team execution for GSD
**Researched:** 2026-02-22
**Confidence:** HIGH

## Executive Summary

The VoltAgent adapter integration extends GSD's existing Task-based orchestration pattern without replacing it. Adapters are **inline functions within gsd-executor**, not separate agent files. This keeps the architecture lean while enabling specialist delegation when VoltAgent plugins are available.

**Key insight:** GSD already has robust subagent spawning infrastructure via the Task tool. The adapters translate between GSD's task format and specialist prompts, then route back to the existing Task tool for execution.

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ execute-phase orchestrator (UNCHANGED)                       │
│ - Discovers plans                                            │
│ - Groups into waves                                          │
│ - Spawns gsd-executor per plan via Task()                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ gsd-executor (MODIFIED - adds adapter logic)                 │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 1. Load PLAN.md                                         │ │
│ │ 2. For each task:                                       │ │
│ │    ┌──────────────────────────────────────────────┐    │ │
│ │    │ NEW: Domain Detection                        │    │ │
│ │    │ - Check task description/type/tags           │    │ │
│ │    │ - Check VoltAgent availability               │    │ │
│ │    │ - Decide: delegate vs execute directly       │    │ │
│ │    └──────────────┬───────────────────────────────┘    │ │
│ │                   │                                     │ │
│ │    ┌──────────────▼────────────────┐                   │ │
│ │    │ Route A: Delegate             │  Route B: Direct  │ │
│ │    └──────────────┬────────────────┘                   │ │
│ └───────────────────┼──────────────────────────────────┬─┘ │
│                     │                                  │   │
│    ┌────────────────▼────────────────┐                 │   │
│    │ NEW: gsd-task-adapter()         │                 │   │
│    │ - Extract task context          │                 │   │
│    │ - Build specialist prompt       │                 │   │
│    │ - Include GSD constraints       │                 │   │
│    └────────────────┬────────────────┘                 │   │
│                     │                                  │   │
│                     ▼                                  │   │
│    ┌─────────────────────────────────────┐            │   │
│    │ Task(                               │            │   │
│    │   subagent_type="python-pro",      │            │   │
│    │   prompt=adapted_prompt,           │            │   │
│    │   model=executor_model             │            │   │
│    │ )                                  │            │   │
│    └────────────────┬────────────────────┘            │   │
│                     │                                 │   │
│                     ▼                                 │   │
│    ┌────────────────────────────────────┐            │   │
│    │ VoltAgent Specialist               │            │   │
│    │ - Fresh context window             │            │   │
│    │ - Domain expertise                 │            │   │
│    │ - Returns raw output               │            │   │
│    └────────────────┬────────────────────┘            │   │
│                     │                                 │   │
│                     ▼                                 │   │
│    ┌────────────────────────────────────┐            │   │
│    │ NEW: gsd-result-adapter()          │            │   │
│    │ - Parse specialist output          │            │   │
│    │ - Extract files modified           │            │   │
│    │ - Format as task completion        │            │   │
│    │ - Return to gsd-executor           │            │   │
│    └────────────────┬────────────────────┘            │   │
│                     │                                 │   │
│ ┌───────────────────▼─────────────────────────────────▼─┐ │
│ │ 3. EXISTING: Commit task (gsd-executor continues)     │ │
│ │ 4. EXISTING: Update tracking                          │ │
│ │ 5. EXISTING: Create SUMMARY.md                        │ │
│ │ 6. EXISTING: Update STATE.md, ROADMAP.md              │ │
│ └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Component Boundaries

| Component | Responsibility | Lives Where | Communicates With |
|-----------|---------------|-------------|-------------------|
| **execute-phase orchestrator** | Wave coordination, spawn executors per plan | `get-shit-done/workflows/execute-phase.md` | gsd-executor (unchanged) |
| **gsd-executor** | Task execution, deviation rules, commits, state management | `agents/gsd-executor.md` | Domain detector, adapters, Task tool |
| **Domain Detector** | Analyze task, decide delegate vs direct | NEW: inline logic in gsd-executor | gsd-executor |
| **gsd-task-adapter()** | Translate GSD task → specialist prompt | NEW: function in gsd-executor | Domain detector, Task tool |
| **VoltAgent Specialist** | Execute task with domain expertise | External: `~/.claude/agents/` | Task tool, gsd-result-adapter |
| **gsd-result-adapter()** | Parse specialist output → GSD format | NEW: function in gsd-executor | VoltAgent specialist, gsd-executor |
| **Task tool** | Spawn subagent with fresh context | Claude Code runtime | Orchestrator, adapters, specialists |

### Key Architectural Decisions

**1. Adapters are functions, not agents**

- **Why:** Keeps gsd-executor self-contained, no extra agent files to maintain
- **How:** Add `<adapter_functions>` section to gsd-executor.md with JavaScript-style pseudocode
- **Tradeoff:** Adds ~200 lines to gsd-executor but eliminates coordination complexity

**2. Detection happens per-task, not per-plan**

- **Why:** Plans mix task types (auth setup + Python migration + database schema)
- **Where:** New `<domain_detection>` step in gsd-executor's `<execute_tasks>` flow
- **Granularity:** Each task independently evaluated for delegation

**3. VoltAgent specialists invoked via existing Task tool**

- **Why:** GSD already spawns gsd-executor, gsd-verifier, gsd-planner via Task()
- **Pattern:** `Task(subagent_type="python-pro", prompt=adapted_prompt, model=executor_model)`
- **Benefit:** Zero changes to Claude Code integration, uses proven orchestration

**4. Graceful fallback is implicit**

- **Detection:** `ls ~/.claude/agents/python-pro.md 2>/dev/null` returns empty → specialist unavailable
- **Fallback:** Domain detector returns `route: "direct"` → gsd-executor handles task normally
- **No special mode:** Availability check is part of detection logic

**5. GSD state management stays in gsd-executor**

- **Why:** Specialists don't understand PLAN.md, STATE.md, deviation rules, checkpoints
- **How:** Adapters provide context, specialists execute, gsd-executor commits/updates state
- **Preserved:** Atomic commits, deviation tracking, checkpoint protocol, SUMMARY creation

## Data Flow

### Flow 1: Specialist Delegation (Happy Path)

```
1. gsd-executor loads PLAN.md
   → Task 3: "Migrate user authentication to Python FastAPI"

2. Domain detection analyzes task:
   → Keywords: ["Python", "FastAPI", "authentication"]
   → Check: ~/.claude/agents/python-pro.md exists
   → Decision: DELEGATE to python-pro

3. gsd-task-adapter() builds prompt:
   Input:
   - Task description from PLAN.md
   - Project context (CLAUDE.md, .agents/skills/)
   - GSD constraints (must verify, must commit format)
   - Current state (what's been built so far)

   Output:
   - Specialist-friendly prompt
   - Includes verification criteria
   - Specifies files to read
   - NO GSD-specific formatting

4. Task() spawns specialist:
   → subagent_type="python-pro"
   → Fresh 200k context window
   → Specialist executes with domain expertise
   → Returns output (code, files modified, verification results)

5. gsd-result-adapter() parses output:
   Input:
   - Raw specialist output
   - Expected task completion format

   Output:
   - files_modified: ["src/api/auth.py", "requirements.txt"]
   - verification_passed: true
   - deviations: ["Added CORS middleware (security)"]
   - commit_message: "feat(03-02): migrate auth to FastAPI"

6. gsd-executor continues normally:
   → Commits with extracted message
   → Tracks deviation
   → Updates STATE.md
   → Creates SUMMARY.md after all tasks
```

### Flow 2: Direct Execution (Fallback)

```
1. gsd-executor loads PLAN.md
   → Task 1: "Update documentation for authentication flow"

2. Domain detection analyzes task:
   → Keywords: ["documentation"]
   → No specialist match (docs are general-purpose)
   → Decision: DIRECT

3. gsd-executor handles task normally:
   → EXISTING execution flow
   → Deviation rules apply
   → Commit as usual
   → No adapter involvement
```

### Flow 3: Specialist Unavailable (Graceful Fallback)

```
1. Domain detection analyzes task:
   → Keywords: ["Terraform", "infrastructure"]
   → Check: ~/.claude/agents/terraform-engineer.md
   → Result: File not found (plugin not installed)
   → Decision: DIRECT (fallback)

2. gsd-executor handles task normally:
   → Executes with generalist capability
   → Logs: "Note: terraform-engineer specialist unavailable, executing directly"
   → SUMMARY.md includes note in metadata
```

## Integration Points with Existing GSD

### 1. execute-phase orchestrator (NO CHANGES)

**Location:** `get-shit-done/workflows/execute-phase.md`

**Current behavior:**
```
Task(
  subagent_type="gsd-executor",
  model="{executor_model}",
  prompt="<objective>Execute plan {plan_number}...</objective>
  <files_to_read>
  - {phase_dir}/{plan_file}
  - .planning/STATE.md
  - ./CLAUDE.md
  </files_to_read>"
)
```

**Integration:** NONE. Orchestrator continues spawning gsd-executor as before. Delegation happens internally within gsd-executor.

### 2. gsd-executor (MODIFICATIONS)

**Location:** `agents/gsd-executor.md`

**New sections to add:**

```xml
<domain_detection>
For each task in PLAN.md, analyze domain and decide routing:

1. Extract domain signals:
   - Task description keywords
   - Task type/tags (if present)
   - Technology stack references
   - Implementation patterns

2. Check VoltAgent specialist availability:
   ```bash
   SPECIALIST=$(detect_specialist_for_task "$TASK_DESC")
   if [ -f ~/.claude/agents/${SPECIALIST}.md ]; then
     AVAILABLE=true
   else
     AVAILABLE=false
   fi
   ```

3. Routing decision:
   | Condition | Route | Rationale |
   |-----------|-------|-----------|
   | High-value domain match + specialist available | DELEGATE | Domain expertise improves quality |
   | General-purpose task | DIRECT | No specialist benefit |
   | Specialist unavailable | DIRECT | Graceful fallback |
   | Checkpoint task | DIRECT | Requires GSD checkpoint protocol |

4. Domain mapping (examples):
   | Keywords | Specialist | Value Proposition |
   |----------|-----------|-------------------|
   | Python, FastAPI, Django, Flask | python-pro | Framework expertise, testing patterns |
   | TypeScript, React, Next.js | typescript-pro | Type safety, component patterns |
   | PostgreSQL, database schema | postgres-pro | Query optimization, schema design |
   | Kubernetes, deployment | kubernetes-specialist | Manifest patterns, scaling |
   | Security, auth, CORS | security-engineer | Vulnerability detection |

</domain_detection>

<adapter_functions>

## gsd-task-adapter()

Translate GSD task context → specialist-friendly prompt.

**Input:**
- task_number: Current task number
- task_description: From PLAN.md <task> element
- task_type: auto/checkpoint/tdd
- plan_context: PLAN.md objective and context sections
- project_context: CLAUDE.md, .agents/skills/ references
- state_context: What's been built (from previous tasks)
- verification_criteria: From task <verification> or <done>
- specialist: Target specialist name (e.g., "python-pro")

**Output:** String prompt for Task() call

**Example:**
```javascript
function gsd_task_adapter(input) {
  return `
<objective>
${input.task_description}

This is task ${input.task_number} in a multi-task plan for: ${input.plan_context.objective}
</objective>

<project_context>
Read these files for project-specific guidelines:
- ./CLAUDE.md (coding conventions, security requirements)
- .agents/skills/ (project patterns and best practices)
${input.project_context.files.map(f => `- ${f}`).join('\n')}
</project_context>

<built_so_far>
${input.state_context.completed_tasks.map(t => `- Task ${t.num}: ${t.summary}`).join('\n')}

Key files from previous tasks:
${input.state_context.files_created.join('\n')}
</built_so_far>

<verification>
Task is complete when:
${input.verification_criteria.map(c => `- ${c}`).join('\n')}
</verification>

<output_format>
Return:
1. Implementation summary (2-3 sentences)
2. Files modified (list with paths)
3. Verification results (did criteria pass?)
4. Any deviations from requirements (bugs fixed, missing functionality added)
5. Suggested commit message
</output_format>

<constraints>
- Follow project conventions in CLAUDE.md
- Apply relevant patterns from .agents/skills/
- Test your changes before reporting complete
- Report actual verification results (don't assume pass)
</constraints>
`;
}
```

## gsd-result-adapter()

Parse specialist output → GSD task completion format.

**Input:**
- specialist_output: Raw output from Task() call
- task_number: For tracking
- expected_files: From task specification

**Output:** Structured object

```javascript
function gsd_result_adapter(specialist_output, task_number, expected_files) {
  // Parse output for GSD-required fields
  const parsed = {
    task_number: task_number,
    files_modified: extract_files(specialist_output),
    verification_passed: check_verification(specialist_output),
    deviations: extract_deviations(specialist_output),
    commit_message: extract_commit_message(specialist_output),
    summary: extract_summary(specialist_output),
    issues: extract_issues(specialist_output)
  };

  // Validate required fields present
  if (!parsed.files_modified.length) {
    // Specialist didn't report files - scan git status
    parsed.files_modified = scan_git_modified();
  }

  if (!parsed.commit_message) {
    // Generate default from task
    parsed.commit_message = `feat(${PHASE}-${PLAN}): complete task ${task_number}`;
  }

  return parsed;
}

function extract_files(output) {
  // Parse "Files modified:" section or similar
  // Return array of file paths
}

function check_verification(output) {
  // Look for verification results
  // Return true/false based on criteria met
}

function extract_deviations(output) {
  // Find auto-fixes, added features, blocking issues
  // Return array of deviation descriptions
}

function extract_commit_message(output) {
  // Look for "Suggested commit message:" or similar
  // Return commit message string
}
```

</adapter_functions>
```

**Modified execution flow in `<execute_tasks>`:**

```xml
<step name="execute_tasks">
For each task:

1. **NEW: Domain detection**
   ```bash
   ROUTE=$(detect_task_route "$TASK_DESC" "$TASK_TYPE")
   ```

2. **If route is "DELEGATE":**
   - Build specialist prompt via gsd-task-adapter()
   - Spawn specialist via Task(subagent_type="${SPECIALIST}", prompt="${ADAPTED_PROMPT}")
   - Parse specialist output via gsd-result-adapter()
   - Validate verification passed
   - Commit using extracted message and files
   - Track completion + specialist used

3. **If route is "DIRECT" (EXISTING FLOW):**
   - Execute task normally
   - Apply deviation rules
   - Run verification
   - Commit
   - Track completion

4. After all tasks: create SUMMARY.md (include specialist usage metadata)
</step>
```

### 3. PLAN.md Format (OPTIONAL ENHANCEMENT)

**Current:** Tasks don't specify domain explicitly

**Optional addition for Phase 2+:**

```yaml
<task type="auto" domain="python">
  Migrate user authentication to FastAPI
  <verification>Tests pass, auth endpoints respond</verification>
</task>
```

**Benefit:** Explicit hint for domain detection (fallback to keyword analysis if missing)

### 4. SUMMARY.md Format (MINOR ADDITION)

**New metadata in frontmatter:**

```yaml
---
specialist_usage:
  - task: 3
    specialist: python-pro
    reason: Python FastAPI migration
  - task: 5
    specialist: postgres-pro
    reason: Database schema optimization
delegation_rate: "40%" # 2 of 5 tasks delegated
---
```

**Body section addition:**

```markdown
## Specialist Delegation

| Task | Specialist | Outcome |
|------|-----------|---------|
| 3 | python-pro | ✓ Completed - Auth migrated to FastAPI |
| 5 | postgres-pro | ✓ Completed - Indexes optimized |

**Delegation benefit:** Domain expertise improved test coverage (98% → 100%) and identified 2 security improvements (CORS, rate limiting) auto-applied via deviation rules.
```

### 5. Context Propagation

**Challenge:** Specialists need project context but don't understand GSD formats

**Solution:** Adapter extracts and reformats

| GSD Context | Adapter Translation | Specialist Receives |
|-------------|---------------------|---------------------|
| PLAN.md `<objective>` | Plain text goal | "Build authentication for multi-tenant SaaS" |
| PLAN.md `<context>` @-references | Resolve and summarize | "Uses PostgreSQL, existing user table schema: ..." |
| CLAUDE.md | Include as file_to_read | Specialist reads directly |
| .agents/skills/ | Include as file_to_read | Specialist reads directly |
| STATE.md decisions | Extract relevant decisions | "Prior decisions: JWT tokens, no sessions" |
| Previous task results | Summarize completions | "Auth routes created in tasks 1-2, now add Python impl" |

**Key principle:** Specialists receive context as documentation, not GSD-specific XML/YAML.

## New Components Needed

### 1. Domain Detector Logic

**File:** Part of `agents/gsd-executor.md`

**Function:** `detect_task_route(task_description, task_type) → {route: "delegate"|"direct", specialist: "python-pro"|null, confidence: "high"|"medium"|"low"}`

**Implementation approach:**

```bash
# Keyword matching (simple, works for MVP)
detect_specialist_for_task() {
  local desc="$1"

  if echo "$desc" | grep -iE "python|fastapi|django|flask|pytest" >/dev/null; then
    echo "python-pro"
  elif echo "$desc" | grep -iE "typescript|react|next\.js|tsx" >/dev/null; then
    echo "typescript-pro"
  elif echo "$desc" | grep -iE "postgres|postgresql|database schema|sql" >/dev/null; then
    echo "postgres-pro"
  elif echo "$desc" | grep -iE "kubernetes|k8s|deployment|helm" >/dev/null; then
    echo "kubernetes-specialist"
  elif echo "$desc" | grep -iE "security|auth|cors|csrf|xss" >/dev/null; then
    echo "security-engineer"
  else
    echo ""  # No match, use direct
  fi
}
```

**Enhancement for Phase 2:** LLM-based domain classification (more accurate but adds latency)

### 2. Adapter Functions

**File:** Part of `agents/gsd-executor.md` in new `<adapter_functions>` section

**Functions:**
- `gsd_task_adapter(task_context) → specialist_prompt`
- `gsd_result_adapter(specialist_output) → gsd_completion`

**Implementation:** JavaScript-style pseudocode in gsd-executor.md (Claude interprets during execution)

### 3. VoltAgent Availability Detection

**File:** Part of domain detector

**Function:** `check_specialist_available(specialist_name) → boolean`

**Implementation:**

```bash
check_specialist_available() {
  local specialist="$1"
  [ -f ~/.claude/agents/${specialist}.md ]
}
```

**Caching:** Check once per gsd-executor invocation, not per task (specialists don't change mid-execution)

## Modified Components

### gsd-executor.md

**Changes:**

1. Add `<domain_detection>` section before `<execute_tasks>`
2. Add `<adapter_functions>` section with gsd-task-adapter() and gsd-result-adapter()
3. Modify `<execute_tasks>` step to include delegation routing
4. Add specialist metadata to `<summary_creation>` template
5. Update `<success_criteria>` to include specialist tracking

**Estimated addition:** ~300 lines

**Backward compatibility:** If domain detection returns "direct" for all tasks, behavior identical to v1.20.5

### execute-phase orchestrator

**Changes:** NONE

**Reason:** Orchestrator is unaware of delegation - still spawns gsd-executor normally

### gsd-verifier

**Changes:** NONE initially

**Future enhancement:** Specialist verification agents (python-test-pro for Python tasks)

## Architecture Patterns to Follow

### 1. Thin Orchestrators, Fat Agents

**Current pattern:** execute-phase orchestrator stays at ~15% context, spawns fresh gsd-executor per plan

**Preserved:** Adapters don't change this. gsd-executor remains the "fat agent" with all execution logic.

**Delegation adds:** Another layer of "fresh context" - specialists get 200k context just for their task

### 2. Context Isolation via Task Tool

**Current pattern:** Each Task() call gets fresh context window, no bleed between agents

**Preserved:** Specialists are Task() calls, so same isolation

**Data passing:** Orchestrator → gsd-executor via prompt. gsd-executor → specialist via adapter-built prompt. Specialist → gsd-executor via return value.

### 3. File-Based State Management

**Current pattern:** GSD writes STATE.md, ROADMAP.md, SUMMARY.md to disk. Agents read from disk.

**Preserved:** Specialists don't write GSD state files. They modify code, return summaries. gsd-executor reads specialist output, writes state files as before.

**Tradeoff:** Specialists can't directly update STATE.md (good - single responsibility)

### 4. Graceful Degradation

**Current pattern:** If gsd-tools.cjs fails, fallback to manual parsing. If verifier unavailable, skip verification.

**Added:** If specialist unavailable, execute directly. No error, no user prompt - silent fallback.

**Logging:** Note delegation attempts in SUMMARY.md metadata for debugging

### 5. Structured Returns

**Current pattern:** Subagents return markdown with `## PLANNING COMPLETE` or `## VERIFICATION PASSED` headers

**Extended:** Specialists return structured output (parsed by gsd-result-adapter), gsd-executor continues with structured data

**Format:** Adapter defines expected output format in specialist prompt, then parses return

## Anti-Patterns to Avoid

### ❌ Adapters as Separate Agents

**Why bad:** Adds orchestration complexity, another context window, more coordination

**Instead:** Inline functions in gsd-executor that build/parse prompts

### ❌ Specialists Writing GSD State Files

**Why bad:** Specialists don't understand GSD state format, leads to corruption

**Instead:** Specialists return data, gsd-executor writes state files

### ❌ Detection at Plan Level

**Why bad:** Plans mix domains (auth setup + Python migration + DB schema = 3 specialists)

**Instead:** Detect per-task, allows mixed specialist usage within one plan

### ❌ Requiring VoltAgent Plugins

**Why bad:** Breaks existing users, mandatory dependency

**Instead:** Graceful fallback - if not installed, execute directly

### ❌ Specialist-Specific Deviation Rules

**Why bad:** Specialists have different fix patterns, hard to standardize

**Instead:** Specialist reports deviations in output, gsd-executor applies existing deviation rules to categorize

### ❌ LLM-Based Domain Detection for MVP

**Why bad:** Adds latency, complexity, potential failure modes

**Instead:** Keyword matching for MVP (simple, fast, deterministic). Upgrade to LLM in Phase 2 if needed.

## Scalability Considerations

### At 10 Specialists (MVP)

**Approach:** Hardcoded keyword mapping in domain detector

**Performance:** Instant detection, deterministic routing

**Maintenance:** Add mappings manually when new specialists added

### At 50 Specialists

**Approach:** Specialist metadata catalog (JSON file mapping keywords → specialists)

**Performance:** O(1) lookup, still fast

**Maintenance:** Update catalog when installing new specialist plugins

### At 127+ Specialists (Full VoltAgent)

**Approach:** Multi-specialist routing (coordinator delegates to coordinator)

**Performance:** Use multi-agent-coordinator specialist for complex tasks

**Maintenance:** Let multi-agent-coordinator decide which specialists to invoke

**Example flow:**
```
gsd-executor
  → Detects: "Complex full-stack auth with Python + React + Postgres"
  → Routes to: multi-agent-coordinator specialist
  → Coordinator spawns: python-pro, typescript-pro, postgres-pro
  → Coordinator synthesizes results
  → gsd-result-adapter parses coordinator output
  → gsd-executor commits and updates state
```

## Build Order (Suggested Phasing)

### Phase 1: Foundation (Tasks 1-3)

**Goal:** Minimal delegation capability without breaking existing flow

1. **Domain detector with 5 specialists**
   - Implement keyword-based detection
   - Support: python-pro, typescript-pro, postgres-pro, kubernetes-specialist, security-engineer
   - Graceful fallback if specialists missing

2. **gsd-task-adapter() function**
   - Build specialist prompts from GSD context
   - Include project files (CLAUDE.md, skills)
   - Specify verification criteria

3. **gsd-result-adapter() function**
   - Parse specialist output
   - Extract files modified, commit message, deviations
   - Validate required fields present

**Verification:** Execute a Python task with python-pro installed → task delegated, committed, tracked. Execute same task without python-pro → direct execution, identical result.

### Phase 2: Enrichment (Tasks 4-6)

**Goal:** Better detection, specialist catalog, metadata tracking

4. **Expand specialist mappings to 20**
   - Add language specialists (golang-pro, rust-engineer, java-expert)
   - Add infra specialists (docker-expert, terraform-engineer)
   - Add domain specialists (api-designer, database-optimizer)

5. **Specialist usage tracking**
   - Add metadata to SUMMARY.md frontmatter
   - Track delegation rate, specialist outcomes
   - Log fallback occurrences

6. **Context propagation improvements**
   - Better @-reference resolution in adapter
   - Include relevant STATE.md decisions
   - Pass previous task summaries for continuity

**Verification:** Execute mixed-domain plan → tasks routed to appropriate specialists, metadata tracked, SUMMARY shows delegation breakdown.

### Phase 3: Orchestration (Tasks 7-9)

**Goal:** Multi-specialist coordination for complex tasks

7. **multi-agent-coordinator integration**
   - Detect complex multi-domain tasks
   - Route to multi-agent-coordinator specialist
   - Parse coordinator's multi-specialist results

8. **Specialist availability caching**
   - Check installed specialists once per executor invocation
   - Build specialist registry at startup
   - Avoid repeated filesystem checks

9. **LLM-based domain classification** (optional)
   - Use Claude to classify task domain when keywords ambiguous
   - Fallback to keyword matching if classification fails
   - Track accuracy vs keyword matching

**Verification:** Execute complex task requiring 3+ specialists → multi-agent-coordinator delegates appropriately, results synthesized, single commit created.

### Phase 4: Optimization (Tasks 10-12)

**Goal:** Performance, error handling, edge cases

10. **Error recovery for specialist failures**
    - If specialist fails, attempt direct execution
    - Track failure reason in SUMMARY
    - Surface specialist errors clearly

11. **Specialist output validation**
    - Verify specialist completed verification
    - Check files exist on disk
    - Validate commit message format

12. **Performance monitoring**
    - Track delegation overhead (time)
    - Compare specialist vs direct execution quality
    - Identify high-value delegation patterns

**Verification:** Force specialist failure → gsd-executor recovers gracefully, task completed via direct execution, failure logged in SUMMARY.

## Integration Testing Checkpoints

### Checkpoint 1: Hello World Delegation

**Test:** Single Python task with python-pro installed

**Expected:**
- Domain detector identifies "python" keywords
- gsd-task-adapter builds prompt with project context
- Task() spawns python-pro specialist
- Specialist completes task
- gsd-result-adapter parses output
- gsd-executor commits with proper message
- SUMMARY.md shows specialist usage

**Pass criteria:** Task completes, commit created, SUMMARY accurate

### Checkpoint 2: Graceful Fallback

**Test:** Same Python task WITHOUT python-pro installed

**Expected:**
- Domain detector checks ~/.claude/agents/python-pro.md
- File not found → route = "direct"
- gsd-executor executes task normally
- No specialist invocation
- Identical commit and SUMMARY format

**Pass criteria:** Task completes identically to manual execution, no errors

### Checkpoint 3: Mixed Domain Plan

**Test:** Plan with 5 tasks: documentation, Python, TypeScript, database, deployment

**Expected:**
- Task 1 (docs): direct
- Task 2 (Python): python-pro
- Task 3 (TypeScript): typescript-pro
- Task 4 (database): postgres-pro
- Task 5 (deployment): direct (assuming no k8s specialist)

**Pass criteria:** Each task routed correctly, SUMMARY shows 3/5 delegated

### Checkpoint 4: Context Propagation

**Test:** Multi-task plan where task 3 depends on tasks 1-2

**Expected:**
- Adapter for task 3 includes summaries of tasks 1-2
- Specialist receives "built so far" context
- Specialist builds on previous work correctly

**Pass criteria:** Task 3 references previous task outputs, no duplication

### Checkpoint 5: Deviation Tracking

**Test:** Specialist auto-fixes bug during execution

**Expected:**
- Specialist reports deviation in output
- gsd-result-adapter extracts deviation
- gsd-executor categorizes via existing deviation rules
- SUMMARY.md documents deviation under "Auto-fixed Issues"

**Pass criteria:** Deviation tracked correctly, matches existing format

## Decision Log

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Adapters as inline functions | Keeps gsd-executor self-contained | Separate adapter agents (rejected: too complex) |
| Task-level detection | Plans mix domains | Plan-level detection (rejected: too coarse) |
| Keyword-based detection MVP | Simple, deterministic, fast | LLM classification (deferred to Phase 3) |
| Task() for specialist invocation | Reuses existing pattern | Direct specialist calls (rejected: no isolation) |
| Graceful fallback implicit | No user friction | Prompt user to install specialists (rejected: breaks flow) |
| State management stays in executor | Single responsibility | Specialists write state (rejected: corruption risk) |

## Open Questions for Phase-Specific Research

1. **Specialist communication protocol:** Can specialists message each other directly (like Agent Teams)? Or only through gsd-executor?

2. **Multi-agent-coordinator capabilities:** Does it handle GSD context automatically or does adapter need to translate?

3. **Specialist context limits:** Do specialists inherit parent context window size or get fresh 200k?

4. **Nested delegation depth:** Can specialists spawn sub-specialists? Max depth?

5. **Specialist versioning:** How to handle specialist updates? Do we pin versions?

## Sources

- **HIGH confidence:** GSD codebase analysis (agents/gsd-executor.md, workflows/execute-phase.md)
- **HIGH confidence:** Task tool usage patterns (10+ examples in workflows/)
- **MEDIUM confidence:** VoltAgent structure (GitHub repo README, no hands-on verification)
- **MEDIUM confidence:** Specialist invocation patterns (inferred from VoltAgent docs, not tested)
- **LOW confidence:** Multi-agent-coordinator capabilities (mentioned in PROJECT.md, not documented)

## Validation Needed

- [ ] Verify specialist invocation syntax: `Task(subagent_type="python-pro")` works?
- [ ] Test specialist output format: Is it structured or freeform?
- [ ] Confirm VoltAgent detection: Is `~/.claude/agents/` the correct path?
- [ ] Validate multi-agent-coordinator exists in voltagent-meta plugin
- [ ] Test graceful fallback: Does missing specialist error or silently skip?
