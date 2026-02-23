# Pitfalls Research: Orchestrator-Mediated Specialist Delegation

**Domain:** Adding orchestrator-mediated delegation to existing multi-agent system
**Context:** GSD v1.22 - Fixing v1.21's executor delegation (subagents lack Task tool)
**Researched:** 2026-02-22
**Confidence:** HIGH (based on v1.21 lessons learned + 2025-2026 research)

---

## Executive Summary

GSD v1.21 made the **critical assumption that subagents have Task tool access** (they don't). v1.22 fixes this by moving to orchestrator-mediated delegation: **only the orchestrator (main Claude) can spawn agents**. This architectural shift introduces new coordination pitfalls beyond v1.21's challenges.

**Key architectural insight:**
```
v1.21 (BROKEN):  Orchestrator → Executor → Executor tries Task() → FAILS (no Task tool)
v1.22 (CORRECT): Orchestrator → Planner (assigns specialist) → Orchestrator spawns → Specialist executes
```

**Critical risks when adding orchestrator mediation:**
1. **Tool access assumptions** — What else did we assume wrong?
2. **Context passing layers** — Orchestrator → Planner → Orchestrator → Specialist (4 hops)
3. **State coordination** — Who owns PLAN.md reads/writes at each layer?
4. **Error recovery** — If specialist fails, how does orchestrator know?
5. **Available agents enumeration** — How does planner know which specialists exist?

Research shows 79% of multi-agent problems originate from **coordination and specification**, not implementation. The v1.21 Task tool mistake is a perfect example.

---

## Critical Pitfalls

### Pitfall 1: Capability Assumption Cascades (The "Task Tool" Pattern)

**What goes wrong:**
v1.21 assumed subagents have Task tool access. **What other capabilities are we assuming wrong?**

Potential capability mismatches in orchestrator-mediated delegation:
- **File system visibility**: Does specialist see same file paths as orchestrator?
- **Permissions inheritance**: Does specialist inherit orchestrator's approved permissions?
- **Skill access**: Do specialists have access to `.agents/skills/` directories?
- **Git context**: Can specialist see git history, or just working directory?
- **Environment variables**: Are env vars from orchestrator context passed to specialist?

**Why it happens:**
Mental model: "spawned agent inherits parent capabilities." Reality: each agent type (orchestrator, planner, specialist) has **different tool access and context isolation**.

**Real-world evidence:**
- Claude Code GitHub Issue #22665: Subagents don't inherit permission allowlist from settings.json
- GitHub Issue #14714: Subagents don't inherit parent's allowed tools
- WebSearch (2025): "Skills are NOT inherited—must list them explicitly"

**How to avoid:**
1. **Capability matrix documentation:** Create `.planning/research/CAPABILITIES.md`:
   ```markdown
   | Capability | Orchestrator | Planner | Specialist |
   |-----------|--------------|---------|-----------|
   | Task() tool | YES | NO | NO |
   | File read | YES | YES | YES (if path injected) |
   | Permissions | Full | Restricted | Restricted (isolated) |
   | Skills | All | Passed explicitly | Passed explicitly |
   ```

2. **Verification at plan time:** Before planner assigns specialist, verify specialist CAN execute (has required tools/permissions)

3. **Fail-fast capability checks:** Orchestrator validates before spawning:
   ```javascript
   if (specialist_needs_git_access && !specialist_has_tool('git')) {
     fallback_to_direct_execution();
   }
   ```

4. **Never assume inheritance:** Treat each spawned agent as **isolated** unless explicitly injected

**Warning signs:**
- Plans include "specialist will use Tool X" without verification Tool X available
- Errors like "unknown tool: Task" appearing mid-execution
- Different behavior between orchestrator-direct vs. orchestrator→specialist→execution
- Specialists prompting for permissions orchestrator already approved

**Phase to address:**
Phase 1 (Agent Enumeration & Discovery) — Document capability boundaries, generate available_agents.md with capability metadata

---

### Pitfall 2: Multi-Hop Context Degradation

**What goes wrong:**
Orchestrator-mediated delegation creates **4-hop context passing**:
1. Orchestrator → Planner (plan creation)
2. Planner → PLAN.md (specialist assignment)
3. Orchestrator reads PLAN.md → Specialist (invocation)
4. Specialist → Result → Orchestrator (completion)

At each hop, context can degrade:
- **Hop 1→2**: Planner doesn't know specialist capabilities (assigns wrong specialist)
- **Hop 2→3**: PLAN.md loses nuance from orchestrator's analysis
- **Hop 3→4**: Specialist misses constraints from PLAN.md
- **Hop 4→1**: Orchestrator can't parse specialist's output format

**Why it happens:**
Each layer optimizes for its own concerns. Planner cares about task decomposition, not specialist invocation details. Specialist cares about code quality, not GSD state management.

**Real-world evidence:**
- Research shows "lossy context summarization" is a top multi-agent failure mode
- Token duplication: systems use 1.5x-7x more tokens than necessary due to redundant context
- Invocation failures: "most sub-agent failures aren't execution failures—they're invocation failures"

**How to avoid:**
1. **Context protocol with checksum:** Each hop validates it received complete context:
   ```markdown
   ## Context Metadata
   - Origin: Orchestrator
   - Hops: 1
   - Required fields: [goal, files, constraints, success_criteria]
   - Checksum: PRESENT ✓
   ```

2. **available_agents.md as source of truth:** Orchestrator generates, planner reads (not cached or stale)

3. **Structured handoffs:** Define exact schema for each hop:
   - Orchestrator → Planner: PROJECT.md + available_agents.md
   - Planner → PLAN.md: Task + specialist assignment + reasoning
   - Orchestrator → Specialist: Task + GSD rules + file contents (not paths)
   - Specialist → Orchestrator: Structured result (schema validated)

4. **Avoid telephone game:** Orchestrator re-reads PROJECT.md when spawning specialist (don't trust planner's summary)

**Warning signs:**
- Specialists asking "what's the goal here?" mid-execution
- Planner assigns specialist that can't handle the task
- Context size grows at each hop (token duplication)
- Specialists producing output that violates constraints documented 3 hops ago

**Phase to address:**
Phase 2 (Context Passing) — Implement structured handoff protocol with validation at each hop

---

### Pitfall 3: Agent Enumeration Staleness (Dynamic vs. Static Registry)

**What goes wrong:**
v1.22 requires orchestrator to generate `available_agents.md` for planner. **When is this generated?**

Scenarios:
- **Too early (milestone start):** User installs new specialist mid-milestone → planner doesn't know it exists
- **Too late (per-task):** Re-scanning `~/.claude/agents/` for every task → filesystem thrash, slow planning
- **Never refreshed:** Specialist uninstalled → planner assigns it → orchestrator spawn fails

**Why it happens:**
Tension between **performance** (cache registry) and **correctness** (always fresh). Classic cache invalidation problem.

**Real-world evidence:**
- WebSearch (2025): "Cache discovery results for speed, and you risk sending requests to dead services"
- Service discovery at scale: Uber Engineering hit limits at 2,000 microservices when registry queries exceeded service traffic
- Agent registry challenges: "Simple, flat list of agents isn't enough for dynamic environments"

**How to avoid:**
1. **Generate-once with validation-at-spawn:**
   - Orchestrator generates available_agents.md at milestone start
   - Planner reads cached registry (fast planning)
   - **Before spawning**, orchestrator validates specialist still exists
   - If missing, orchestrator falls back gracefully (logs "python-pro assigned but unavailable")

2. **TTL-based refresh:**
   - Registry has timestamp: "Generated: 2026-02-22 10:00:00"
   - Orchestrator re-scans if >5 minutes old
   - Avoids per-task overhead while staying reasonably fresh

3. **Fallback hierarchy built into registry:**
   ```markdown
   ## Python Tasks
   - Primary: python-pro (installed: YES)
   - Fallback: python-dev (installed: YES)
   - Last resort: gsd-executor direct execution
   ```

4. **User override mechanism:** `/gsd:refresh-specialists` command regenerates available_agents.md

**Warning signs:**
- Errors like "Specialist 'python-pro' not found" mid-execution
- Planner assigns specialist A, orchestrator spawns specialist B (different registry versions)
- User installs specialist but it's never used
- Filesystem scans dominate planning time

**Phase to address:**
Phase 1 (Agent Enumeration) — Implement generate-once with validation-at-spawn, include fallback hierarchy in registry

---

### Pitfall 4: PLAN.md Ownership Confusion (Read-Only vs. Read-Write)

**What goes wrong:**
In orchestrator-mediated pattern, **who owns PLAN.md at which stage?**

Dangerous scenarios:
- Planner writes PLAN.md, orchestrator reads, orchestrator updates status → **planner's context stale if it runs again**
- Specialist tries to read PLAN.md (doesn't have access or gets stale version)
- Orchestrator updates PLAN.md while planner still planning → **race condition**
- User edits PLAN.md manually → orchestrator's parse fails

**Why it happens:**
v1.21 single-writer pattern (gsd-executor only) doesn't map cleanly to v1.22's orchestrator-mediated flow. PLAN.md transitions through multiple ownership states.

**Real-world evidence:**
- Research: "Sharing mutable state between concurrent agents" causes 36.94% of coordination failures
- Single-writer pattern violations lead to corrupted state, lost updates, inconsistent data

**How to avoid:**
1. **Explicit ownership lifecycle:**
   ```
   1. Orchestrator creates PLAN.md (template)
   2. Planner writes PLAN.md (initial plan)
   3. Orchestrator owns PLAN.md for remainder of milestone
   4. Orchestrator updates task status, specialist assignments, deviations
   5. Planner/Specialists NEVER write PLAN.md
   ```

2. **Read-only injection for specialists:**
   - Orchestrator reads relevant task from PLAN.md
   - Injects task description into specialist prompt (don't give specialist PLAN.md path)
   - Specialist returns results, orchestrator updates PLAN.md

3. **Lock mechanism (if concurrent):**
   - .planning/.plan.lock file prevents simultaneous writes
   - Orchestrator acquires lock before updates
   - Planner fails fast if lock exists: "Planning in progress, wait..."

4. **Immutable plan snapshot:**
   - Planner writes PLAN.md.initial (never modified)
   - Orchestrator copies to PLAN.md, updates working copy
   - If corruption detected, reset from .initial

**Warning signs:**
- PLAN.md merge conflicts
- Task status stuck at "in_progress" despite completion
- Planner's second invocation overwrites orchestrator's status updates
- Specialist errors: "can't read PLAN.md"

**Phase to address:**
Phase 1 (Architecture) — Document PLAN.md ownership lifecycle, enforce read-only for specialists

---

### Pitfall 5: Result Flow Break (Specialist → Orchestrator → State Update)

**What goes wrong:**
Specialist completes task, but orchestrator doesn't know:
- Specialist has no way to signal "I'm done"
- Orchestrator polls specialist status? (inefficient)
- Specialist returns success but orchestrator's result parser fails
- Partial results (specialist crashed mid-execution)

**Why it happens:**
Task tool invocation is **synchronous** (orchestrator blocks until specialist completes), but result format is **undefined**. Specialist's final output might be:
- Structured markdown (expected)
- Free-form prose ("I fixed the bug!")
- Error message ("Failed to...")
- Incomplete (timeout/crash)

**Real-world evidence:**
- Research: "Result aggregation failures" due to format mismatches, incomplete data, parsing errors
- Automated failure attribution achieves only 53.5% accuracy identifying responsible agent

**How to avoid:**
1. **Enforce structured result schema in specialist prompt:**
   ```markdown
   ## Required Output Format
   When complete, you MUST respond with:

   ### Task Result
   Status: SUCCESS | PARTIAL | FAILED

   ### Files Modified
   - path/to/file1.js (created)
   - path/to/file2.ts (modified)

   ### Deviations
   [None | Description of why deviated from plan]

   ### Verification
   [How to verify this worked]
   ```

2. **Multi-layer result parser:**
   - Layer 1: Try exact structured format
   - Layer 2: Fuzzy heading match ("Task Result" ≈ "Result" ≈ "Summary")
   - Layer 3: Heuristic extraction (find file paths, keywords like "success")
   - Layer 4: Fail gracefully, log full output, mark task as "needs review"

3. **Sanity checks before STATE.md update:**
   ```javascript
   if (specialist_claims_modified(['file.js', 'file.ts'])) {
     actual_modified = git_status_files();
     if (specialist_claims !== actual_modified) {
       log_warning("Specialist claims don't match git status");
       prompt_user_verification();
     }
   }
   ```

4. **Timeout + partial result handling:**
   - Orchestrator sets 5-minute timeout for specialist
   - If timeout, orchestrator checks git status (did specialist commit anything?)
   - Partial results: orchestrator can salvage completed work

**Warning signs:**
- STATE.md shows task complete, but git shows no changes
- Orchestrator logs "can't parse specialist output"
- Manual intervention required after every specialist execution
- Different result formats from same specialist type

**Phase to address:**
Phase 3 (Result Handling) — Implement multi-layer parser + sanity checks + timeout handling

---

### Pitfall 6: Specialist Assignment Without Capability Verification

**What goes wrong:**
Planner assigns specialist based on task domain, **without knowing if specialist can execute**:
- Planner assigns "python-pro" but specialist requires Python 3.12 (user has 3.11)
- Specialist needs database access (not available in user's environment)
- Task requires tool specialist doesn't have (e.g., specialist needs kubectl but it's not installed)
- Circular dependencies (specialist A needs specialist B)

**Why it happens:**
Planner makes **routing decision based on domain match** (Python task → python-pro), not capability verification. available_agents.md lists specialists but not their requirements/constraints.

**Real-world evidence:**
- Research: "Poor task delegation instructions" — specialists assigned without verifying they can execute
- Adding agents without meaningful specialization increases coordination overhead without benefit

**How to avoid:**
1. **Capability metadata in available_agents.md:**
   ```markdown
   ## python-pro
   - Domains: Python, Django, Flask, pytest
   - Required tools: python3, pip, git
   - Min Python version: 3.10
   - Environment: Needs write access to venv/
   - Constraints: Cannot access external APIs
   ```

2. **Preflight checks before assignment:**
   - Planner reads capability metadata
   - If task requires Python 3.12 but specialist only supports 3.10 → fallback to generalist
   - If task needs database and specialist has "no external access" → skip specialist

3. **Specialist self-assessment:**
   - Before execution, specialist checks environment
   - Returns early with "CANNOT_EXECUTE: Missing Python 3.12" → orchestrator falls back

4. **Gradual rollout by capability:**
   - v1.22.0: Only enable specialists with zero dependencies (safe)
   - v1.22.1: Enable specialists with well-tested requirements
   - v1.22.2: Enable complex specialists after validation

**Warning signs:**
- Specialists frequently returning "environment not suitable"
- Planner assigns specialist, orchestrator immediately falls back
- User environment incompatibilities discovered at execution time
- Different success rates across user environments

**Phase to address:**
Phase 1 (Agent Enumeration) — Include capability requirements in available_agents.md, implement preflight checks

---

### Pitfall 7: Error Recovery Without Orchestrator Visibility

**What goes wrong:**
Specialist fails (crash, timeout, bad output), but orchestrator doesn't know **why** or **how to recover**:
- Generic error: "Task() failed" (no details)
- Orchestrator doesn't know if failure is retriable
- Partial work committed (specialist crashed after committing)
- No rollback mechanism for failed specialist work

**Why it happens:**
Task tool invocation is **opaque**—orchestrator sends request, gets back success/failure, but **no structured error metadata**.

**Real-world evidence:**
- Research: "Which Agent Causes Task Failures and When?" — automated methods only 14.2% accurate at pinpointing failure steps
- Error amplification: failures at step 3 corrupt input to step 4, cascade to step 5
- Recovery cost: cascading errors are HIGH cost to recover (git reset, STATE.md repair)

**How to avoid:**
1. **Structured error responses:**
   ```markdown
   ### Task Result
   Status: FAILED

   ### Error Type
   TIMEOUT | ENVIRONMENT_ERROR | DEPENDENCY_ERROR | EXECUTION_ERROR

   ### Error Details
   Failed to install dependencies: npm ERR! 404 Not Found

   ### Retriable
   YES | NO

   ### Partial Work
   - Committed: a1b2c3d (partial implementation)
   - Uncommitted: 3 modified files in working directory

   ### Suggested Recovery
   Run: npm install --legacy-peer-deps
   ```

2. **Checkpoint before specialist execution:**
   ```javascript
   orchestrator.create_checkpoint({
     task_id: "03-implement-api",
     specialist: "python-pro",
     git_sha: get_current_commit(),
     state_backup: copy_file("STATE.md", ".checkpoint/STATE.md.backup")
   });
   ```

3. **Automatic rollback on failure:**
   - If specialist fails AND made commits → offer rollback
   - If specialist fails AND working directory dirty → stash changes
   - Orchestrator restores pre-execution state

4. **Retry with fallback strategy:**
   ```
   1. Try: python-pro (primary specialist)
   2. If FAIL (retriable): Retry python-pro with different approach
   3. If FAIL (non-retriable): Try python-dev (fallback specialist)
   4. If FAIL: Fall back to gsd-executor direct execution
   5. If FAIL: Escalate to user
   ```

**Warning signs:**
- Specialists fail but orchestrator just retries same approach
- No ability to rollback failed specialist work
- Working directory in unknown state after failure
- User has to manually clean up after specialist crashes

**Phase to address:**
Phase 4 (Error Recovery) — Implement checkpoint protocol, structured error responses, automatic rollback

---

### Pitfall 8: Context File vs. Context Injection Confusion

**What goes wrong:**
Orchestrator generates available_agents.md and PROJECT.md. **How do specialists receive these?**

Dangerous approaches:
- **Pass file paths:** `Task(subagent_type="planner", context_files=["PROJECT.md", "available_agents.md"])`
  - Problem: Specialist may not have filesystem visibility to those paths
  - Problem: Specialists in isolated contexts can't read shared files

- **Assume shared filesystem:** Specialist reads `.planning/PROJECT.md`
  - Problem: Works locally, breaks in containerized/remote execution
  - Problem: Specialist gets stale version (orchestrator updated, specialist sees old)

- **Dump everything into prompt:** Inject full PROJECT.md + STATE.md + ROADMAP.md
  - Problem: Token overflow (exceeds context window)
  - Problem: Specialist drowns in irrelevant context

**Why it happens:**
Unclear mental model: do orchestrator and specialist share filesystem? Do they share environment? What's the boundary?

**Real-world evidence:**
- Claude Code GitHub: "Context file passing—assume specialist can read it" → fails if specialist has different filesystem view
- Research: "All or nothing context isolation" — either pass everything or specialist has nothing

**How to avoid:**
1. **Inject file contents, not paths:**
   ```javascript
   // WRONG
   Task(subagent_type="planner", context_files=["PROJECT.md"])

   // CORRECT
   const project_content = read_file("PROJECT.md");
   const specialist_prompt = `
   You are a planner for GSD project.

   ## Project Context
   ${project_content}

   ## Available Agents
   ${available_agents_content}

   ## Your Task
   Create execution plan for: ${task_description}
   `;
   Task(subagent_type="planner", prompt=specialist_prompt);
   ```

2. **Context pruning:** Only inject essential sections
   - For planner: PROJECT.md summary + available_agents.md + REQUIREMENTS.md
   - For specialist: Relevant task description + GSD rules + affected files (contents, not paths)

3. **Explicit context budget:**
   - Calculate: specialist_context_size = prompt + injected_files + task_description
   - If >80% of context window → prune or fail fast
   - Log: "Context size: 45K / 200K tokens (22% used)"

4. **Test with isolated filesystem:**
   - Integration test: Specialist runs in temp directory (no access to .planning/)
   - Verify specialist still works (proves no hidden filesystem dependencies)

**Warning signs:**
- Specialists asking "where is PROJECT.md?"
- Errors: "File not found: /path/to/PROJECT.md"
- Different behavior local vs. CI/remote execution
- Token overflow warnings when spawning specialists

**Phase to address:**
Phase 2 (Context Passing) — Implement content injection (not file paths), context budget monitoring

---

## Moderate Pitfalls

### Pitfall 9: No Specialist Attribution in Intermediate States

**What goes wrong:**
PLAN.md shows task "in_progress" but **which specialist is working on it?**
- User cancels execution mid-task → can't tell if specialist was spawned
- Orchestrator crashes → resume logic doesn't know which specialist to re-invoke
- Multiple tasks in parallel → can't tell which specialist owns which task

**Prevention:**
- PLAN.md task status includes specialist metadata:
  ```yaml
  status: in_progress
  specialist: python-pro
  started_at: 2026-02-22T10:30:00Z
  orchestrator_pid: 12345
  ```
- Checkpoint file includes specialist assignment
- Resume logic reads checkpoint, knows which specialist to re-invoke

**Phase to address:**
Phase 3 (Integration) — Add specialist metadata to PLAN.md task status

---

### Pitfall 10: Synchronous Blocking Creates UX Delays

**What goes wrong:**
Orchestrator invokes `Task(subagent_type="python-pro")` and **blocks** until specialist completes.
- User sees no progress feedback (appears frozen)
- Can't cancel mid-execution (no interrupt mechanism)
- Can't parallelize independent tasks (sequential execution only)

**Prevention:**
- **Progress streaming:** Orchestrator logs "Spawning python-pro for task 3..." → user sees activity
- **Timeout + graceful degradation:** 5-minute timeout, then fallback
- **Future enhancement:** Parallel specialist execution (defer to v1.23)
- **Cancellation protocol:** User hits Ctrl+C → orchestrator sends cancel signal to specialist

**Phase to address:**
Phase 3 (Integration) — Implement progress logging, timeout handling
Phase 5 (Future) — Async specialist execution with parallelization

---

### Pitfall 11: Specialist Versioning (VoltAgent Updates)

**What goes wrong:**
User updates VoltAgent plugin, specialist behavior changes:
- python-pro v1.0: Returns structured markdown
- python-pro v2.0: Returns JSON (breaks orchestrator's parser)
- Specialist capabilities expand (new tools), but available_agents.md not updated
- Breaking changes in specialist prompt format

**Prevention:**
- **Version metadata in available_agents.md:**
  ```markdown
  ## python-pro
  Version: 2.1.0
  Last detected: 2026-02-22
  ```
- **Parser resilience:** Multi-layer parsing handles format variations
- **Capability detection:** Re-scan specialists periodically (not just at install)
- **Deprecation warnings:** "python-pro v1.x is deprecated, update to v2.x"

**Phase to address:**
Phase 1 (Agent Enumeration) — Include version in registry, document versioning strategy

---

### Pitfall 12: Over-Reliance on "Smart Planner"

**What goes wrong:**
Assumption: "Planner will figure out the right specialist for each task."
Reality: Planner makes routing errors:
- Assigns specialist to task outside its domain
- Assigns expensive specialist to trivial task
- Doesn't consider specialist availability (assigns missing specialist)
- Ignores user preferences (user wants generalist, planner assigns specialist)

**Prevention:**
- **Planner guidance in prompt:** "Only assign specialist if complexity >3 files OR domain expertise clearly beneficial"
- **User override:** `/gsd:plan --no-specialists` disables specialist assignment
- **Validation layer:** Orchestrator reviews planner assignments before spawning
- **Fallback on mismatch:** If specialist returns "this isn't my domain," orchestrator reassigns

**Phase to address:**
Phase 1 (Planning Integration) — Provide planner with clear specialist assignment heuristics

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| **Agent Enumeration** | Stale registry | Generate-once + validate-at-spawn with fallback |
| **Context Passing** | Multi-hop degradation | Structured handoff protocol, content injection (not paths) |
| **Result Handling** | Unparseable outputs | Multi-layer parser + sanity checks + graceful degradation |
| **Error Recovery** | Orchestrator crash during specialist execution | Checkpoint before spawn, detect orphaned work on resume |
| **State Coordination** | PLAN.md ownership confusion | Explicit lifecycle: planner writes, orchestrator owns thereafter |

---

## Integration-Specific Anti-Patterns

### Anti-Pattern: "Planner Knows All"

**What:** Give planner full autonomy to assign specialists without orchestrator validation.

**Why bad:**
- Planner doesn't know specialist availability (generates stale available_agents.md)
- Planner can't verify specialist capabilities (assigns wrong specialist)
- Orchestrator becomes dumb executor (violates single-coordinator principle)

**Instead:**
- Planner suggests specialists (reasoning included)
- Orchestrator validates before spawning
- Orchestrator owns final delegation decision

---

### Anti-Pattern: "Context Teleportation"

**What:** Assume specialist has access to orchestrator's context (PROJECT.md, STATE.md) via shared filesystem.

**Why bad:**
- Breaks in isolated execution (containers, remote)
- Specialists get stale versions (orchestrator updated, specialist sees old)
- Hidden dependencies make system fragile

**Instead:**
- Inject file contents into specialist prompt
- No file path references
- Test with isolated filesystem

---

### Anti-Pattern: "Fire and Forget"

**What:** Orchestrator spawns specialist, doesn't track status, assumes success.

**Why bad:**
- Specialist fails silently
- Partial work committed (no rollback)
- STATE.md out of sync with reality

**Instead:**
- Checkpoint before spawn
- Validate specialist result
- Rollback on failure

---

## Success Criteria for Avoiding Pitfalls

A successful GSD v1.22 orchestrator-mediated delegation will have:

- [ ] **Capability boundaries documented:** CAPABILITIES.md lists what each agent type can/cannot do
- [ ] **No tool access assumptions:** Verified planner and specialists CANNOT call Task()
- [ ] **available_agents.md generated fresh:** Orchestrator creates before planner invocation
- [ ] **Validation at spawn:** Orchestrator checks specialist exists before calling Task()
- [ ] **Fallback hierarchy:** If specialist unavailable, orchestrator falls back gracefully
- [ ] **Structured result schema:** Specialist outputs parse reliably (multi-layer parser)
- [ ] **Context injection (not file paths):** Specialists receive content, not paths
- [ ] **PLAN.md ownership lifecycle:** Planner writes, orchestrator owns, specialists read-only
- [ ] **Checkpoint before spawn:** Orchestrator can rollback/resume on failure
- [ ] **Multi-hop context validation:** Each handoff verifies required fields present
- [ ] **Specialist attribution:** PLAN.md shows which specialist assigned to which task
- [ ] **Error recovery protocol:** Structured errors, automatic rollback, retry logic

---

## Lessons from v1.21 → v1.22

**What v1.21 taught us:**

1. **Never assume tool access:** Subagents don't have Task tool → verify capabilities explicitly
2. **Test capability boundaries early:** Integration tests with restricted contexts
3. **Document what each agent type CAN'T do:** Negative capabilities as important as positive
4. **Fail-fast on assumptions:** Better to crash with clear error than proceed with wrong assumption

**Mistakes to never repeat:**

- ❌ Assuming inheritance without verification
- ❌ Coding against mental model without testing reality
- ❌ Discovering capability limits in production
- ❌ No fallback when assumption proves wrong

**v1.22 improvements:**

- ✅ Explicit capability matrix (CAPABILITIES.md)
- ✅ Orchestrator-only delegation (no recursive Task() calls)
- ✅ Validation-at-spawn (check before invoke)
- ✅ Comprehensive fallback hierarchy

---

## Sources

**HIGH Confidence (Production Failures & Direct Evidence):**

- **GSD v1.21 post-mortem** (2026-02-22): Task tool assumption failure—executor delegation broke because subagents lack Task()
  - Source: .planning/PROJECT.md, .planning/milestones/v1.21-REQUIREMENTS.md

- **Claude Code GitHub Issues:**
  - #22665: "Subagent does not inherit permission allowlist from settings.json"
  - #14714: "Subagents don't inherit parent conversation's allowed tools"
  - #4908: Feature request for scoped context passing

- **UC Berkeley & Google DeepMind (2025):** "Why Do Multi-Agent LLM Systems Fail?"
  - 79% of failures from coordination/specification (not implementation)
  - 36.94% coordination failures from state management issues
  - https://arxiv.org/pdf/2503.13657

- **Toward Data Science (2025):** "17x Error Trap of the 'Bag of Agents'"
  - Error amplification in independent multi-agent systems
  - 0.95^10 reliability cascade
  - https://towardsdatascience.com/why-your-multi-agent-system-is-failing

**MEDIUM Confidence (Industry Research & Best Practices):**

- **Microsoft Azure Architecture Center (2025-2026):** AI Agent Orchestration Patterns
  - Centralized vs. decentralized patterns
  - State management best practices
  - https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns

- **OpenAI Agents SDK (March 2025):** Multi-agent orchestration patterns
  - Handoff patterns, state management
  - https://openai.github.io/openai-agents-python/multi_agent/

- **Galileo AI (2025):** "Multi-Agent Coordination Gone Wrong? Fix With 10 Strategies"
  - Context management, coordination tax
  - https://galileo.ai/blog/multi-agent-coordination-strategies

- **Stytch (2025):** "Handling AI Agent Permissions"
  - Delegated access, least privilege
  - https://stytch.com/blog/handling-ai-agent-permissions

**Production Statistics (verified across multiple sources):**

- 79% of multi-agent problems from coordination/specification
- 36.94% of failures from state management issues
- 1.5x-7x token duplication in multi-agent systems
- 53.5% accuracy for automated failure attribution (agent level)
- 14.2% accuracy for automated failure attribution (step level)
- 200-500ms coordination delays per delegation

---

**Confidence Assessment:**

- **Capability assumptions:** HIGH (directly experienced in v1.21 + corroborating GitHub issues)
- **Multi-hop context:** HIGH (research + token statistics)
- **Registry staleness:** MEDIUM (inferred from service discovery patterns)
- **PLAN.md ownership:** HIGH (GSD architecture + state management research)
- **Result flow:** HIGH (research on result aggregation + parsing failures)
- **Error recovery:** MEDIUM (general orchestrator patterns + GSD requirements)

All pitfalls prioritized by: **1) Relevance to v1.22 orchestrator-mediated pattern**, **2) Lessons from v1.21 failure**, **3) Severity/frequency in research**

---

*Pitfalls research for: GSD v1.22 Orchestrator-Mediated Specialist Delegation*
*Researched: 2026-02-22*
*Focus: Fixing v1.21's Task tool assumption + adding orchestrator mediation layer*
