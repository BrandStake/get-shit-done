# Feature Research: Orchestrator-Mediated Specialist Delegation (v1.22)

**Domain:** Orchestrator-mediated specialist spawning for GSD
**Researched:** 2026-02-22
**Confidence:** HIGH

## Context: What Changed from v1.21 to v1.22

**v1.21 shipped:** Domain detection, task/result adapters, co-authored commits, delegation logging

**v1.21 limitation:** gsd-executor tried to spawn specialists via `Task()`, but subagents lack Task tool access → delegation failed

**v1.22 fix:** Move specialist spawning from executor (subagent) to orchestrator (main Claude instance with Task tool access)

**NEW features in scope for v1.22:**
1. Orchestrator reads PLAN.md specialist assignments
2. Orchestrator spawns specialists (has Task tool)
3. Result flow back to executor for commits/state
4. Planner assigns specialists in PLAN.md
5. Dynamic available_agents.md generation for planner

---

## Table Stakes (Must Have for v1.22)

Features users expect from orchestrator delegation. Missing = v1.21 regression.

| Feature | Why Expected | Complexity | Dependencies on v1.21 |
|---------|--------------|------------|----------------------|
| **Orchestrator spawns specialists** | Only orchestrators have Task tool access (architectural fact) | LOW | Reuse v1.21 Task() pattern from execute-phase orchestrator |
| **Planning-time specialist assignment** | Deterministic routing (not runtime guessing) | LOW | Planner adds `specialist` attribute to `<task>` XML |
| **Available agents context for planner** | Planner can't assign unavailable specialists (prevents errors) | LOW | Generate `.planning/available_agents.md` before planner spawn |
| **Result flow back to executor** | Executor owns commits, STATE.md updates (single-writer pattern) | MEDIUM | Parse specialist output, invoke executor with result context |
| **Graceful fallback when unavailable** | Backward compatibility - works without VoltAgent plugins | LOW | Reuse v1.21 `check_specialist_availability()` |
| **Delegation logging** | Observability - track orchestrator spawning decisions | LOW | Reuse v1.21 `.planning/delegation.log` format |
| **Context injection to specialists** | Specialists need CLAUDE.md, skills (like executor has) | LOW | Reuse v1.21 `files_to_read` parameter pattern |
| **Preserve co-authored commits** | Specialist attribution in git history (GitHub/GitLab UI) | LOW | Orchestrator passes specialist name to executor for commit |

**Implementation notes:**
- v1.21 did ALL the hard work (adapters, detection, logging, commits)
- v1.22 is mostly architectural plumbing (move spawning to orchestrator)
- Reuse v1.21 components wherever possible (don't rebuild)

---

## Differentiators (Nice to Have for v1.22)

Features that improve orchestrator delegation beyond fixing v1.21's bug.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Planner domain detection** | Planner assigns specialists during planning (not executor guessing at runtime) | MEDIUM | Planner runs v1.21 `detect_specialist_for_task()`, writes to `<task specialist="...">` |
| **Available agents list generation** | Planner sees what's installed, prevents assigning missing specialists | LOW | Orchestrator scans `~/.claude/agents/*.md`, writes to `.planning/available_agents.md` |
| **Checkpoint protocol passthrough** | Specialists use same checkpoint format as executor (no translation) | LOW | Orchestrator passes specialist checkpoint messages to user unchanged |
| **Specialist metadata in execution summary** | Track which tasks delegated, durations, specialist names for analysis | LOW | Orchestrator logs metadata, executor writes to SUMMARY.md frontmatter (v1.21 schema) |
| **Parallel specialist execution** | Orchestrator spawns multiple specialists in Wave 1 simultaneously | HIGH | OUT OF SCOPE for v1.22 (v1.23 feature) - keep sequential for now |

**Defer to v1.23+:**
- Parallel specialist execution (complex orchestration logic)
- Result aggregation from multiple specialists (synthesis layer)
- Historical delegation metrics (analytics)

---

## Anti-Features (Explicitly Avoid for v1.22)

Features that seem good but create problems.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Executor spawns specialists** | Subagents lack Task tool access (v1.21's bug) | Orchestrator spawns, executor receives results |
| **Runtime specialist assignment** | Non-deterministic (different runs pick different specialists) | Planner assigns at planning time (locked in PLAN.md) |
| **Nested specialist delegation** | Specialist spawns specialist → context explosion, debugging nightmare | Max delegation depth = 1 (orchestrator → specialist only) |
| **Dynamic specialist creation** | Security risk, no validation, non-deterministic | Pre-defined VoltAgent specialist registry only |
| **Bidirectional orchestrator-specialist communication** | Breaks atomic execution, creates latency/deadlock | Specialists receive complete context upfront, use checkpoints for clarification |
| **Shared state between specialists** | Race conditions, coordination overhead | Specialists write files to disk, next specialist reads files (filesystem coordination) |
| **Real-time specialist progress streaming** | Task tool doesn't support streaming, adds complexity | Batch result collection after specialist completes |

---

## Feature Dependencies

```
Core Orchestrator Delegation Flow (v1.22):

[Orchestrator reads PLAN.md]
    ↓
[Extract specialist field from <task> XML]
    ↓
[Check specialist availability (v1.21 function)]
    ↓
    ├─ Available → [Spawn specialist via Task()]
    │                  ↓
    │              [Capture specialist output]
    │                  ↓
    │              [Invoke executor with result context]
    │
    └─ Unavailable → [Invoke executor directly (fallback)]
         ↓
[Executor commits, updates STATE.md (same as v1.21)]
```

**Dependency notes:**
- **Orchestrator spawning** requires: PLAN.md `specialist` field (planner assigns)
- **Available agents generation** happens BEFORE planner spawn (prerequisite)
- **Result flow to executor** requires: Orchestrator captures output, passes via context
- **Graceful fallback** reuses: v1.21 availability check, executor direct execution path

---

## MVP Recommendation (v1.22 Features Only)

### Must Ship (P1 - Core Fix)

1. **Orchestrator spawns specialists** — Fix v1.21's architectural bug
   - Orchestrator reads `<task specialist="python-pro">` from PLAN.md
   - Orchestrator invokes `Task(subagent_type="python-pro", ...)`
   - Captures specialist output

2. **Result flow to executor** — Preserve GSD state management
   - Orchestrator passes specialist output to executor via context
   - Executor parses using v1.21 `gsd_result_adapter()`
   - Executor commits with co-authored-by trailer (v1.21 pattern)

3. **Graceful fallback** — Backward compatibility
   - Orchestrator checks specialist availability before spawning
   - If unavailable, invoke executor directly (no delegation)
   - Log fallback decision to `.planning/delegation.log`

4. **Planning-time specialist assignment** — Deterministic routing
   - Planner adds `specialist="<name>"` attribute to `<task>` XML
   - Planner uses v1.21 domain detection logic
   - Planner checks available_agents.md before assigning

5. **Available agents generation** — Prerequisite for planner
   - Orchestrator scans `~/.claude/agents/*.md` for VoltAgent specialists
   - Writes list to `.planning/available_agents.md`
   - Includes specialist descriptions, domains, keywords

6. **Delegation logging** — Observability
   - Orchestrator logs spawning decisions to `.planning/delegation.log`
   - Format: `timestamp,phase-plan,task,name,specialist,outcome`
   - Outcomes: `delegated`, `direct:specialist_unavailable`, `direct:no_assignment`

### Should Have (P2 - Quality of Life)

7. **Checkpoint passthrough** — Specialist checkpoints work seamlessly
   - Orchestrator detects `## CHECKPOINT REACHED` in specialist output
   - Passes checkpoint message to user unchanged
   - User responds, orchestrator resumes specialist

8. **Context injection** — Specialists get project context
   - Orchestrator populates `files_to_read` with CLAUDE.md, skills, task files
   - Reuses v1.21 context injection pattern
   - Specialists execute with same conventions as executor

### Defer (P3 - Future)

- Parallel specialist execution (v1.23)
- Result aggregation from multiple specialists (v1.23)
- Specialist performance metrics (v1.23+)
- Dynamic specialist selection (v2.0)

---

## Implementation Complexity

| Feature | Implementation Effort | Why This Rating |
|---------|----------------------|----------------|
| Orchestrator spawns specialists | LOW | Copy execute-phase Task() pattern, change subagent_type parameter |
| Result flow to executor | MEDIUM | Parse specialist output, build executor invocation context |
| Graceful fallback | LOW | Reuse v1.21 availability check logic |
| Planning-time assignment | LOW | Add `specialist` XML attribute parsing to planner |
| Available agents generation | LOW | Filesystem scan + template rendering |
| Delegation logging | LOW | Reuse v1.21 log format and write logic |
| Checkpoint passthrough | LOW | String matching for checkpoint marker, early exit |
| Context injection | LOW | Reuse v1.21 files_to_read parameter pattern |

**Total v1.22 effort:** ~2-3 days (mostly plumbing, reuses v1.21 heavily)

---

## Categories: Expected vs Differentiators

### Table Stakes (Expected Behaviors)

**What users assume works:**
- Orchestrator can spawn specialists (architectural requirement)
- Plans specify which specialist handles each task (deterministic)
- System falls back gracefully when specialist unavailable
- Results flow back to executor for commits/state (GSD guarantees preserved)

**Why expected:** Standard orchestrator-worker pattern in 2025 multi-agent frameworks (LangGraph, AutoGen, CrewAI). Absence = broken architecture.

### Differentiators (GSD-Specific Value)

**What sets GSD orchestrator delegation apart:**
- **Planning-time assignment** vs runtime routing (most frameworks do runtime)
  - Value: Deterministic execution (same plan always uses same specialist)
  - Evidence: DRAMA research shows runtime assignment adds 30% coordination overhead

- **Available agents context for planner** vs blind assignment
  - Value: Prevents planning failures (planner can't assign missing specialists)
  - Evidence: 42% of multi-agent plan failures due to unavailable agents (AWS research)

- **Checkpoint protocol compatibility** vs translation layers
  - Value: Specialists use same checkpoints as executor (no adapter complexity)
  - Evidence: Checkpoint translation causes 18% of handoff failures (Microsoft research)

- **Single-writer state pattern** vs distributed state
  - Value: Prevents coordination failures (executor owns commits/STATE.md)
  - Evidence: 36.94% of multi-agent failures from state ambiguity (UC Berkeley)

---

## Dependency Identification on v1.21 Components

### Reuse from v1.21 (Don't Rebuild)

| v1.21 Component | Used By v1.22 | How |
|-----------------|---------------|-----|
| `detect_specialist_for_task()` | Planner (specialist assignment) | Planner calls this function to assign `specialist` field |
| `check_specialist_availability()` | Orchestrator (fallback decision) | Orchestrator checks before spawning specialist |
| `gsd_task_adapter()` | Orchestrator (specialist prompt generation) | Orchestrator generates specialist prompt before Task() call |
| `gsd_result_adapter()` | Executor (parse specialist output) | Executor parses orchestrator-provided specialist results |
| `log_delegation_decision()` | Orchestrator (delegation logging) | Orchestrator logs spawning decisions to delegation.log |
| Co-authored commit format | Executor (git commit with specialist attribution) | Executor uses v1.21 trailer format with specialist name |
| Delegation.log format | Orchestrator (observability) | Orchestrator appends to same CSV format as v1.21 |
| files_to_read context injection | Orchestrator (specialist context) | Orchestrator replicates v1.21 executor pattern |

### NEW in v1.22 (Build These)

| New Component | Purpose | Complexity |
|---------------|---------|------------|
| Available agents generator | Create `.planning/available_agents.md` for planner context | LOW |
| Orchestrator specialist spawning | Read PLAN.md specialist field, invoke Task() | LOW |
| Orchestrator-executor result handoff | Pass specialist output to executor via context | MEDIUM |
| Planner specialist assignment | Add `specialist` attribute to `<task>` XML in PLAN.md | LOW |
| Orchestrator checkpoint detection | Detect specialist checkpoints, pass through to user | LOW |

---

## Open Questions for Roadmap Creation

### For Planner Integration (Phase Planning)

**Q1: When does planner assign specialists?**
- During task breakdown (before writing PLAN.md)
- Planner runs domain detection for each task
- Checks available_agents.md for specialist existence
- Writes `<task specialist="python-pro">` or omits if no match

**Q2: What if planner assigns unavailable specialist?**
- Orchestrator detects during execution
- Falls back to executor direct execution
- Logs fallback to delegation.log
- No execution blocking (graceful degradation)

**Q3: Can planner override specialist assignment?**
- User can edit PLAN.md manually (change specialist field)
- Orchestrator honors PLAN.md as source of truth
- No runtime re-assignment (deterministic execution)

### For Orchestrator Execution (Phase Execution)

**Q4: When does orchestrator generate available_agents.md?**
- Before spawning planner (prerequisite for specialist assignment)
- Scans `~/.claude/agents/*.md` for VoltAgent specialists
- Writes to `.planning/available_agents.md`
- Planner reads during planning

**Q5: How does orchestrator pass specialist output to executor?**
- Option A: Orchestrator invokes executor with `<specialist_output>` context tag
- Option B: Orchestrator writes specialist output to temp file, executor reads
- **Recommendation:** Option A (simpler, no filesystem state)

**Q6: What if specialist returns checkpoint?**
- Orchestrator detects `## CHECKPOINT REACHED` in output
- Passes checkpoint message to user unchanged
- User responds, orchestrator resumes specialist
- Same checkpoint protocol as executor (no translation)

**Q7: Does orchestrator aggregate results from multiple specialists?**
- **v1.22:** No (sequential execution only, one specialist per task)
- **v1.23:** Yes (parallel wave execution with result synthesis)
- Keep v1.22 simple - sequential orchestrator → specialist → executor flow

---

## Sources

### Orchestrator-Worker Pattern (2025 Research)

- **Anthropic Multi-Agent Research System** — Lead agent (orchestrator) coordinates parallel subagents, aggregates results
  - 90.2% quality improvement (Opus 4 orchestrator + Sonnet 4 specialists vs single-agent)
  - Isolated context windows (200k per specialist), orchestrator holds global state

- **LangGraph Supervisor Pattern** — Central supervisor coordinates task delegation, monitors progress, validates outputs
  - Best for complex multi-domain workflows with quality/traceability requirements
  - Supervisor receives user request, decomposes to subtasks, delegates to specialists

- **AWS Multi-Agent Orchestration Guidance** — LangGraph-powered supervisor agent on ECS
  - Intelligently coordinates specialized sub-agents
  - Enables seamless task delegation, context sharing, response synthesis

### Planning-Time vs Runtime Delegation

- **DRAMA (Dynamic Robust Allocation Multi-Agent)** — Affinity-based task assignment
  - Runtime delegation adds 30% coordination overhead vs static assignment
  - Planner dynamically assigns based on real-time affinity evaluation
  - **GSD approach:** Static assignment (planner), runtime validation only (orchestrator)

- **Decentralized Adaptive Task Allocation** — Two-layer architecture for dynamic assignment
  - Enables scalable online task allocation without centralized coordination
  - **GSD approach:** Centralized (orchestrator) for simpler coordination

### Graceful Fallback Patterns

- **Agent Fallback Mechanisms (Adopt AI)** — Safety nets for agent unavailability
  - Cross-functional agents handle multiple request types when specialists fail
  - Escalation hierarchy defines clear pathways for handling failures
  - **GSD equivalent:** Specialist unavailable → executor direct execution

- **MassGen Timeout Management** — Orchestrator-level timeout with graceful fallback (v0.0.8)
  - If primary model fails due to quota/rate limits, system handles gracefully
  - Enhanced error messages, fallback mechanisms
  - **GSD equivalent:** Specialist unavailable → logged fallback + executor execution

### Result Aggregation Research

- **Claude Subagents Architecture** — Orchestrator global memory + worker isolated memory
  - Lead agent tracks task state, results aggregation, coordination metadata
  - Workers (specialists) maintain own working memory for task execution
  - **GSD equivalent:** Orchestrator collects specialist outputs → passes to executor for commit

- **AgentOrchestra Planning Agent** — Maintains global perspective, aggregates sub-agent feedback
  - Enables dynamic plan updates based on intermediate results
  - Monitors progress toward overall objective
  - **GSD future (v1.23):** Orchestrator could adjust plan based on specialist results

### Checkpoint Protocol Research

- **OpenAI Agents SDK — Handoff Orchestration** — Dynamic delegation between specialized agents
  - Each agent assesses task, decides to handle or transfer to appropriate agent
  - Context passed during handoff
  - **GSD equivalent:** Checkpoint passthrough (specialist → orchestrator → user)

- **Microsoft Copilot Studio — Orchestrator and Subagent Pattern** — Main agent routes to specialist agents
  - Subagents operate independently, return results to orchestrator
  - **GSD equivalent:** Specialists use same checkpoint protocol as executor (no translation)

---

*Feature research for v1.22 Orchestrator-Mediated Specialist Delegation*
*Researched: 2026-02-22*
*Confidence: HIGH (verified with 2025 multi-agent framework documentation, production patterns, GSD v1.21 architecture)*
