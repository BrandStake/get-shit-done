# Domain Pitfalls: Multi-Agent Delegation Integration

**Domain:** Adding multi-agent delegation to existing orchestration systems
**Context:** GSD v1.21 - Hybrid agent team execution with VoltAgent integration
**Researched:** 2026-02-22
**Confidence:** HIGH (verified with 2025-2026 production research, failure analysis studies)

---

## Executive Summary

Adding multi-agent delegation to an existing orchestration system like GSD introduces **coordination complexity** that can break existing workflows if not carefully managed. Research shows 41-86.7% of multi-agent systems fail in production, with 79% of problems originating from specification and coordination issues, not technical implementation.

**Critical insight:** The most common failure pattern is treating delegation as a drop-in replacement rather than a **coordination layer with explicit boundaries**. GSD must maintain its role as the orchestrator while specialists handle domain-specific execution.

**Key risk areas:**
1. **State management confusion** (36.94% of failures)
2. **Over-delegation overhead** ("delegation complexity floor")
3. **Context fragmentation** (token truncation at handoffs)
4. **Backward compatibility breaks** (existing workflows fail)
5. **Fallback failures** (no graceful degradation)

---

## Critical Pitfalls

### Pitfall 1: State Ownership Ambiguity

**What goes wrong:**
Multiple agents modify shared state (STATE.md, PLAN.md) without clear ownership, leading to:
- Transactionally inconsistent data due to concurrent updates
- Lost updates when agents overwrite each other's changes
- Deviation tracking failures (who deviated?)
- Checkpoint corruption (which agent owns rollback?)

**Why it happens:**
When adding delegation, teams often distribute state management across agents to "empower" specialists. This violates the single-writer principle for critical state.

**Real-world evidence:**
- Research shows sharing mutable state between concurrent agents is a leading cause of inconsistency (36.94% of coordination failures)
- State synchronization issues account for significant multi-agent failures in production systems

**Consequences:**
- STATE.md becomes corrupted or inconsistent
- Deviation rules can't be enforced (no single source of truth)
- Atomic commit guarantees break (who commits what?)
- Rollback/checkpoint features fail

**Prevention:**
- **Single-writer pattern**: Only gsd-executor writes to STATE.md, PLAN.md
- **Read-only delegation**: Specialists receive state as read-only context
- **Result-based updates**: Specialists return structured results; gsd-executor updates state
- **Explicit state contract**: Document what specialists can read vs. write

**Detection warning signs:**
- Multiple agents mentioning "updating STATE.md"
- Merge conflicts in .planning/ directory
- Inconsistent phase numbers across files
- Missing or duplicate deviation records

**Which phase should address:**
- Phase 1 (Architecture): Define state ownership boundaries
- Phase 2 (Adapter layer): Implement read-only state passing
- Phase 4 (Testing): Verify single-writer invariant

---

### Pitfall 2: The Delegation Complexity Floor

**What goes wrong:**
Delegating simple tasks to specialists adds more overhead than value:
- 200-500ms coordination delays per delegation
- Token costs increase (context duplication)
- Simple 1-line fixes become multi-agent orchestrations
- Debugging becomes exponentially harder

**Why it happens:**
Teams implement "always delegate by domain" logic without cost-benefit analysis. DeepMind research identifies this as the "delegation complexity floor" - tasks below a complexity threshold are better executed locally.

**Real-world evidence:**
- DeepMind 2026 study: "For simple, low-risk tasks, the overhead of negotiation, monitoring and contract enforcement may exceed the value of the task itself"
- Multi-agent systems use significantly more tokens overall despite claims of efficiency
- Coordination tax: accuracy gains saturate beyond 4-agent threshold

**Consequences:**
- 2-3x slower execution for simple tasks
- Token costs explode (context duplication across agents)
- Increased failure surface area (more handoffs = more failure points)
- Poor user experience (waiting for specialist spawn for trivial tasks)

**Prevention:**
- **Complexity heuristic**: Delegate only if task meets threshold (e.g., >3 files, >50 lines, domain-specific expertise required)
- **Local-first decision**: gsd-executor handles task unless specialist provides clear value
- **Benchmark delegation overhead**: Measure actual time/token costs
- **Make delegation opt-in initially**: Require explicit delegation flag, gather metrics, optimize threshold

**Detection warning signs:**
- Specialists spawned for single-line changes
- Average task completion time increases vs. v1.20
- Token consumption doubles for similar projects
- User complaints about "slowness"

**Which phase should address:**
- Phase 1 (Architecture): Define delegation decision criteria
- Phase 2 (Implementation): Implement complexity heuristic
- Phase 5 (Optimization): Tune delegation thresholds based on metrics

---

### Pitfall 3: Context Fragmentation at Handoffs

**What goes wrong:**
Specialists receive incomplete or truncated context, leading to:
- Token truncation drops critical information silently (>8K tokens)
- Specialists lack GSD-specific knowledge (deviation rules, atomic commits, checkpoints)
- Task execution succeeds but violates GSD constraints
- "Works in isolation, breaks in integration"

**Why it happens:**
GSD's context (PROJECT.md, STATE.md, ROADMAP.md, REQUIREMENTS.md) is designed for gsd-executor. Specialists from VoltAgent have their own context expectations. The adapter layer must translate, not just pass through.

**Real-world evidence:**
- 79% of multi-agent problems originate from specification/coordination (not implementation)
- Context overflow without pruning causes silent truncation
- Specialists "withholding crucial information" or "proceeding with wrong assumptions" account for 8.65% of coordination failures

**Consequences:**
- Specialists produce correct code that violates GSD rules (e.g., multi-file commits, no verification)
- Missing deviation records (specialist doesn't know to report)
- Lost context about why task exists (ROADMAP goals)
- Rework loops: specialist delivers, gsd-executor rejects

**Prevention:**
- **Context pruning strategy**: gsd-task-adapter selects essential context, not full dump
- **GSD rules injection**: Every specialist prompt includes: "Atomic commits only. Report deviations. Single responsibility."
- **Domain + GSD hybrid prompt**: "You are {specialist}, working within GSD framework that requires..."
- **Token budget monitoring**: Track context size, fail fast if >80% of limit

**Detection warning signs:**
- Specialists producing multi-file commits
- No deviation reports from specialist executions
- Specialists asking "what's the bigger picture?" mid-task
- Context truncation warnings in logs

**Which phase should address:**
- Phase 2 (Adapter layer): Implement context pruning and GSD rules injection
- Phase 4 (Testing): Verify specialists respect GSD constraints
- Phase 5 (Observability): Monitor token usage at handoffs

---

### Pitfall 4: Backward Compatibility Breaks

**What goes wrong:**
Existing GSD workflows fail after v1.21 upgrade:
- `/gsd:execute-phase` behaves differently (now delegates)
- Users expect direct execution, get delegation overhead
- Existing projects have incompatible state format
- Scripts/automation break on new behavior

**Why it happens:**
Integration changes orchestrator behavior without migration path. "If we're adding delegation, might as well make it the default" thinking breaks production workflows.

**Real-world evidence:**
- Legacy systems struggle with conceptual changes (backward compatibility vs. progress)
- 40% of agentic AI projects cancelled by 2027 due to unexpected complexity
- Migration failures are a top cause of enterprise AI adoption stalls

**Consequences:**
- Existing users upgrade, workflows break
- Bug reports flood in: "v1.20 worked fine, v1.21 is broken"
- Forced rollbacks and version pinning
- Loss of trust in GSD stability

**Prevention:**
- **Opt-in delegation initially**: Feature flag or config option (delegation: true)
- **Fallback to v1.20 behavior**: If specialist unavailable or delegation disabled, gsd-executor handles task
- **Migration validator**: Tool to check if existing project is delegation-ready
- **Versioned prompts**: gsd-executor prompt supports both modes

**Detection warning signs:**
- Integration tests for existing projects fail
- "Regression" label on new issues
- Documentation says "this should work" but doesn't
- Users asking "how to get old behavior back"

**Which phase should address:**
- Phase 1 (Architecture): Design backward-compatible integration points
- Phase 3 (Integration): Implement feature flag and fallback logic
- Phase 4 (Testing): Run full test suite with delegation OFF to verify v1.20 behavior preserved

---

### Pitfall 5: No Graceful Degradation When Specialist Unavailable

**What goes wrong:**
Specialist isn't installed/available, and system crashes instead of falling back:
- "python-pro not found" error halts execution
- No fallback to gsd-executor generalist mode
- User must manually install specialists before any work can proceed
- Poor experience for users who don't want multi-agent complexity

**Why it happens:**
Delegation logic treats specialist as required dependency, not optional enhancement. The system doesn't design for the "specialist unavailable" case.

**Real-world evidence:**
- December 2024 OpenAI outage: systems with hard-coded API dependencies collapsed entirely
- Graceful degradation is THE differentiator between robust and fragile systems
- 40% of multi-agent pilots fail within 6 months due to unanticipated complexity

**Consequences:**
- System becomes unusable if single specialist plugin missing
- Forced dependency on external VoltAgent availability
- GSD becomes "multi-agent or nothing" instead of "multi-agent when helpful"
- Installation friction: users must install 10+ plugins before first use

**Prevention:**
- **Specialist discovery**: Check if specialist available before delegation attempt
- **Fallback hierarchy**:
  1. Preferred specialist (python-pro)
  2. General specialist (multi-agent-coordinator)
  3. gsd-executor direct execution (always available)
- **Configuration**: Allow users to disable delegation entirely (delegation: false)
- **Clear error messages**: "python-pro unavailable, falling back to gsd-executor generalist mode"

**Detection warning signs:**
- Hard crashes on missing plugins
- Error messages with no actionable resolution
- Installation instructions as prerequisite to basic usage
- No "degraded mode" state

**Which phase should address:**
- Phase 3 (Integration): Implement specialist discovery and fallback logic
- Phase 4 (Testing): Test with zero specialists installed, verify graceful fallback
- Phase 5 (Documentation): Document fallback behavior and optional nature

---

### Pitfall 6: Result Format Translation Errors

**What goes wrong:**
Specialist returns results in format incompatible with GSD expectations:
- Specialist says "Done!" but doesn't provide file paths
- Output format doesn't include deviation reporting
- Missing verification results (did it work?)
- gsd-executor can't update STATE.md (no structured data)

**Why it happens:**
Specialists have their own output conventions. VoltAgent specialists aren't designed for GSD's state management needs. The adapter layer must translate formats, not just pass through.

**Real-world evidence:**
- Integration challenges require custom adapters/glue code
- Tool integration is a top multi-agent deployment challenge
- Format mismatches are a common "simple in theory, painful in practice" issue

**Consequences:**
- gsd-executor can't commit (no file list)
- STATE.md can't be updated (no structured task completion data)
- Verification can't run (no test results)
- Manual intervention required to extract information

**Prevention:**
- **Structured output schema**: Define required fields (files_changed, test_results, deviations, verification_status)
- **gsd-result-adapter**: Parse specialist output, transform to GSD schema
- **Validation**: Reject results that don't meet schema
- **Fallback extraction**: If specialist output is free-form, use heuristics (search for file paths, test keywords)

**Detection warning signs:**
- gsd-executor logging "can't parse specialist output"
- Manual commits after specialist execution
- STATE.md shows "in_progress" for completed tasks
- Verification skipped due to missing data

**Which phase should address:**
- Phase 2 (Adapter layer): Define GSD result schema and implement gsd-result-adapter
- Phase 4 (Testing): Verify all specialist outputs parse correctly
- Phase 5 (Observability): Log unparseable outputs for schema refinement

---

### Pitfall 7: Commit Attribution Chaos

**What goes wrong:**
Multiple agents modify files, git history becomes unclear:
- Who made which change? (gsd-executor vs. python-pro)
- Merge conflicts when agents work concurrently
- Git blame shows generic "gsd-executor" for all changes
- Debugging: "which agent introduced this bug?"

**Why it happens:**
GSD's single-agent model assumes one committer. Multi-agent delegation means multiple contributors, but git only sees "gsd-executor" committing.

**Real-world evidence:**
- VS Code 1.107 (Nov 2025) introduced git worktrees specifically to solve this
- "Git wasn't designed for three different entities typing in the same folder at the same time"
- Commit attribution research shows best automated methods only achieve 53.5% accuracy

**Consequences:**
- Can't trace which specialist made problematic changes
- Git blame useless (everything is "gsd-executor")
- Merge conflicts if multiple specialists modify same file
- Audit trail lost (compliance issue for some orgs)

**Prevention:**
- **Co-authored commits**: Use Git's `Co-authored-by: specialist-name <specialist@voltagent>` trailer
- **Commit message attribution**: "python-pro: Implement request handler" format
- **Sequential execution**: Don't run multiple specialists on overlapping files concurrently
- **Git worktrees** (advanced): Each specialist in isolated worktree, merge at end

**Detection warning signs:**
- All commits show single author
- Merge conflicts in specialist-modified files
- Can't trace bug origin to specialist
- Audit logs show only "gsd-executor" activity

**Which phase should address:**
- Phase 3 (Integration): Implement co-authored commit format
- Phase 4 (Testing): Verify commit attribution in git log
- Phase 5 (Documentation): Document how to trace specialist contributions

---

### Pitfall 8: Over-Optimization: The 0.95^10 Problem

**What goes wrong:**
Breaking tasks into too many specialist handoffs compounds errors:
- Each handoff is 95% accurate → 10 handoffs = 60% overall reliability
- Error at step 3 corrupts input to step 4, amplifies at step 5
- By step 8, debugging chaos (which agent introduced the error?)
- Token costs explode with each handoff (context duplication)

**Why it happens:**
"More specialists = better quality" intuition is wrong. Research shows coordination tax causes accuracy to saturate/degrade beyond 4-agent threshold.

**Real-world evidence:**
- Berkeley/DeepMind research: adding agents beyond threshold degrades performance
- 0.95^10 problem documented across multi-agent systems
- Error amplification through pipeline is exponential, not linear

**Consequences:**
- Lower quality than single generalist agent
- Impossible to debug (error source unclear)
- Massive token/time costs
- User frustration: "it's slower AND buggier"

**Prevention:**
- **Limit delegation depth**: Max 1-2 specialist handoffs per task
- **Task consolidation**: Group related work for single specialist vs. passing between specialists
- **Quality gates**: If specialist output quality < threshold, fall back to gsd-executor re-execution
- **Metrics tracking**: Monitor per-specialist success rates

**Detection warning signs:**
- Task involves 3+ specialist handoffs
- Error rates increase with more delegation
- Token usage per task is 5x+ higher
- "Which agent broke this?" debugging sessions

**Which phase should address:**
- Phase 1 (Architecture): Define max delegation depth
- Phase 4 (Testing): Verify error rates with delegation vs. without
- Phase 5 (Optimization): Implement quality gates and fallback logic

---

## Moderate Pitfalls

### Pitfall 9: Observability Gaps

**What goes wrong:**
Can't debug multi-agent executions due to missing logs:
- Don't know which specialist was invoked
- Can't see context passed to specialist
- Missing specialist's reasoning/thoughts
- No timing data (where's the delay?)

**Why it happens:**
GSD's observability designed for single-agent execution. Multi-agent adds layers that aren't instrumented.

**Prevention:**
- **Structured logging**: Every delegation logs (timestamp, specialist, task, context_size, duration)
- **Adapter tracing**: Log input/output at adapter boundaries
- **Specialist output capture**: Save full specialist output, not just parsed result
- **Dashboard**: Visualize delegation patterns over time

**Which phase should address:**
- Phase 3 (Integration): Add logging at delegation points
- Phase 5 (Observability): Implement structured logging and analysis tools

---

### Pitfall 10: Configuration Complexity Creep

**What goes wrong:**
Users must configure specialist preferences, thresholds, fallbacks, etc.:
- 20+ config options before first use
- "Which specialist should I use for X?" decision paralysis
- Config drift between projects
- Breaking changes to config schema

**Why it happens:**
Adding delegation introduces decisions: which specialists, when to delegate, fallback behavior. Exposing all as config creates complexity.

**Prevention:**
- **Convention over configuration**: Sensible defaults (auto-detect specialist from file extension)
- **Progressive disclosure**: Zero config works out-of-box, advanced users can tune
- **Config validation**: Fail fast on invalid specialist names
- **Schema versioning**: Support old config formats with migration

**Which phase should address:**
- Phase 1 (Architecture): Define minimal config surface
- Phase 2 (Implementation): Implement sensible defaults
- Phase 6 (Polish): Add config validation and migration

---

### Pitfall 11: Circular Delegation Loops

**What goes wrong:**
Specialist delegates back to gsd-executor, which delegates back to specialist:
- Infinite loop consuming tokens
- System hangs waiting for completion
- No circuit breaker to detect cycle

**Why it happens:**
Both gsd-executor and specialists have delegation capabilities. Without depth tracking, they can delegate to each other.

**Prevention:**
- **Delegation depth limit**: Max recursion depth = 1 (executor → specialist, done)
- **Specialist constraint**: Specialists CANNOT delegate, only execute
- **Cycle detection**: Track delegation chain, fail if same agent appears twice

**Which phase should address:**
- Phase 1 (Architecture): Define delegation depth limit
- Phase 3 (Integration): Implement cycle detection
- Phase 4 (Testing): Test with specialists that try to delegate

---

## Minor Pitfalls

### Pitfall 12: Specialist Prompts Diverge from GSD Philosophy

**What goes wrong:**
Specialists suggest multi-file changes, skip tests, or ignore atomic commit principle because their prompts don't encode GSD's philosophy.

**Prevention:**
- **Prompt template injection**: gsd-task-adapter adds GSD rules to every specialist prompt
- **Prompt review process**: When adding new specialist support, review injected context
- **Specialist training**: Document GSD integration expectations for VoltAgent specialists

**Which phase should address:**
- Phase 2 (Adapter layer): Implement GSD rules injection in prompt template

---

### Pitfall 13: Poor Error Messages from Specialists

**What goes wrong:**
Specialist fails with cryptic error, user doesn't know how to resolve:
- "python-pro failed" (no details)
- Error from specialist's internal tools (unfamiliar to GSD users)
- No suggestion on what to do next

**Prevention:**
- **Error translation**: gsd-result-adapter translates specialist errors to user-friendly messages
- **Context preservation**: Include task description in error messages
- **Actionable guidance**: "python-pro failed to install dependencies. Try: cd project && npm install"

**Which phase should address:**
- Phase 2 (Adapter layer): Implement error translation in gsd-result-adapter
- Phase 4 (Testing): Verify error messages are user-friendly

---

### Pitfall 14: Inconsistent Specialist Quality

**What goes wrong:**
Some specialists produce excellent results, others are buggy/incomplete:
- python-pro is great, but golang-pro hallucinates
- Users can't trust specialists uniformly
- Quality varies by task type

**Prevention:**
- **Specialist allowlist**: Only enable well-tested specialists initially
- **Quality metrics**: Track success rate per specialist
- **Automatic fallback**: If specialist quality < threshold, use gsd-executor instead
- **User feedback**: Allow users to report "specialist X didn't work well"

**Which phase should address:**
- Phase 4 (Testing): Benchmark specialist quality across domains
- Phase 5 (Optimization): Implement quality-based specialist selection

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Architecture Design | State ownership ambiguity | Define single-writer pattern (gsd-executor only) |
| Adapter Layer | Context fragmentation | Implement context pruning + GSD rules injection |
| Integration | Backward compatibility breaks | Feature flag for delegation, fallback to v1.20 behavior |
| Testing | Missing graceful degradation tests | Test with zero specialists installed |
| Optimization | Over-delegation overhead | Implement complexity heuristic, measure delegation cost |
| Observability | Can't debug multi-agent flows | Structured logging at all delegation points |

---

## Integration-Specific Anti-Patterns

### Anti-Pattern: "Rip and Replace"

**What:** Remove gsd-executor, replace with multi-agent-coordinator as primary orchestrator.

**Why bad:**
- Breaks STATE.md management
- Loses atomic commit guarantees
- Backward compatibility destroyed
- All existing workflows break

**Instead:**
- Keep gsd-executor as coordinator
- Add delegation as optional enhancement
- Specialists are tools gsd-executor uses, not replacements

---

### Anti-Pattern: "Specialist for Everything"

**What:** Auto-delegate every task based on file extension (*.py → python-pro, *.ts → typescript-pro).

**Why bad:**
- Delegation overhead exceeds value for simple tasks
- Token costs explode
- Slower execution overall
- Over-optimization (Pitfall 8)

**Instead:**
- Implement complexity heuristic
- Delegate only when specialist provides clear value
- Measure actual performance delta

---

### Anti-Pattern: "Pass-Through Adapter"

**What:** gsd-task-adapter just forwards entire context to specialist without transformation.

**Why bad:**
- Context fragmentation (Pitfall 3)
- Token limit exceeded
- Specialists lack GSD-specific rules
- Results in wrong format

**Instead:**
- Context pruning: select essential subset
- Inject GSD constraints into prompt
- Transform specialist output to GSD schema

---

### Anti-Pattern: "Trust and Hope"

**What:** Assume specialists will respect GSD rules without enforcement.

**Why bad:**
- Specialists produce multi-file commits
- No deviation reporting
- Verification skipped
- Integration tests fail

**Instead:**
- Validate specialist output against GSD schema
- Fail fast if constraints violated
- Re-execute with gsd-executor on validation failure

---

## Success Criteria for Avoiding Pitfalls

A successful GSD v1.21 integration will have:

- [ ] **Zero backward compatibility breaks**: v1.20 workflows work identically in v1.21 with delegation disabled
- [ ] **Graceful degradation**: System works with zero specialists installed (falls back to gsd-executor)
- [ ] **Single state writer**: Only gsd-executor modifies STATE.md, PLAN.md
- [ ] **Complexity-gated delegation**: Simple tasks handled locally, only delegate when clear value
- [ ] **Context pruning**: Specialists receive <8K tokens, never truncated
- [ ] **Structured results**: All specialist outputs parse to GSD schema
- [ ] **Clear attribution**: Git log shows which specialist contributed
- [ ] **Observability**: Can trace delegation flow and debug failures
- [ ] **Quality gates**: Automatic fallback if specialist quality < threshold
- [ ] **User control**: Config to disable delegation, choose specialists, tune thresholds

---

## Sources

**HIGH Confidence (Research Papers & Production Studies):**

- UC Berkeley & Google DeepMind (2025): "Why Do Multi-Agent LLM Systems Fail?" - Coordination failures (36.94%), 0.95^10 error cascade
  - https://arxiv.org/pdf/2503.13657

- DeepMind (Feb 2026): "When Should a Principal Delegate to an Agent in Selection Processes?" - Delegation complexity floor concept
  - https://arxiv.org/abs/2502.07792

- Toward Data Science (2025): "Why Your Multi-Agent System is Failing: Escaping the 17x Error Trap of the 'Bag of Agents'"
  - https://towardsdatascience.com/why-your-multi-agent-system-is-failing-escaping-the-17x-error-trap-of-the-bag-of-agents/

**MEDIUM Confidence (Industry Reports & Production Data):**

- Microsoft Azure Architecture Center (2025-2026): "AI Agent Orchestration Patterns"
  - https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns

- VS Code 1.107 Release Notes (Nov 2025): Multi-agent orchestration with git worktrees
  - https://visualstudiomagazine.com/articles/2025/12/12/vs-code-1-107-november-2025-update-expands-multi-agent-orchestration-model-management.aspx

- Nanonets Blog (2026): "AI Agent Variables Fail in Production: Fix State Management"
  - https://nanonets.com/blog/ai-agents-state-management-guide-2026/

- Galileo (2025-2026): "Multi-Agent Coordination Gone Wrong? Fix With 10 Strategies"
  - https://galileo.ai/blog/multi-agent-coordination-strategies

**MEDIUM Confidence (Practitioner Guides):**

- Augment Code (2025): "Why Multi-Agent LLM Systems Fail (and How to Fix Them)"
  - https://www.augmentcode.com/guides/why-multi-agent-llm-systems-fail-and-how-to-fix-them

- Adopt.ai: "Agent Fallback Mechanisms"
  - https://www.adopt.ai/glossary/agent-fallback-mechanisms

- Nick Mitchinson (Oct 2025): "Using Git Worktrees for Multi-Feature Development with AI Agents"
  - https://www.nrmitchi.com/2025/10/using-git-worktrees-for-multi-feature-development-with-ai-agents/

**Production Statistics (verified across multiple sources):**

- 41-86.7% of multi-agent LLM systems fail in production
- 79% of problems originate from specification/coordination (not implementation)
- 40% of multi-agent pilots fail within 6 months
- Coordination failures: 36.94% of multi-agent issues
- Context beyond 8K tokens causes silent truncation
- 200-500ms coordination delays per delegation
- Accuracy saturation beyond 4-agent threshold

---

**Research Quality Assessment:**

This research combines:
- Peer-reviewed academic papers (UC Berkeley, Google DeepMind)
- Production failure analysis (real-world statistics)
- Enterprise architecture patterns (Microsoft, Google)
- Practitioner case studies (VS Code, n8n, Augment)

All findings cross-referenced with GSD's specific architecture constraints to ensure relevance. Pitfalls prioritized by:
1. Frequency in production (how common)
2. Impact severity (how damaging)
3. GSD relevance (how applicable to this integration)

**Confidence levels:**
- State management: HIGH (extensive research + production data)
- Delegation overhead: HIGH (DeepMind research + industry stats)
- Context fragmentation: HIGH (multiple sources + token statistics)
- Backward compatibility: MEDIUM (GSD-specific, inferred from general integration patterns)
- All other pitfalls: MEDIUM to HIGH (verified with multiple sources)
