# Roadmap: GSD

## Milestones

- ✅ **v1.21 Hybrid Agent Team Execution** — Phases 1-6 (shipped 2026-02-23) — [archived](milestones/v1.21-ROADMAP.md)
- 🚧 **v1.22 Orchestrator-Mediated Specialist Delegation** — Phases 7-10 (in progress)

## Overview

This milestone fixes the orchestrator-mediated delegation architecture. In v1.21, gsd-executor attempted to spawn specialists via Task(), but subagents lack this capability. v1.22 moves delegation to the orchestrator (main Claude instance) where Task tool access exists. The journey: build infrastructure for agent discovery and planning integration, enable orchestrator spawning with context injection, implement reliable result parsing and state management, and add error recovery with graceful fallback.

## Phases

**Phase Numbering:**
- Integer phases (7, 8, 9, 10): Planned milestone work
- Decimal phases (7.1, 7.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

<details>
<summary>✅ v1.21 Hybrid Agent Team Execution (Phases 1-6) - SHIPPED 2026-02-23</summary>

### Phase 1: Domain Detection & Specialist Registry
**Goal**: Enable gsd-planner to detect task domains and match to VoltAgent specialists
**Plans**: 3 plans
**Status**: Complete

### Phase 2: Task & Result Adapter Layers
**Goal**: Translate GSD tasks to specialist format and parse specialist results
**Plans**: 2 plans
**Status**: Complete

### Phase 3: Delegation Execution & Co-authored Commits
**Goal**: Execute specialist delegation with proper attribution
**Plans**: 2 plans
**Status**: Complete

### Phase 4: Single-Writer State Pattern
**Goal**: Prevent state corruption from concurrent writes
**Plans**: 2 plans
**Status**: Complete

### Phase 5: Delegation Observability & Logging
**Goal**: Track delegation decisions and specialist performance
**Plans**: 1 plan
**Status**: Complete

### Phase 6: Comprehensive Testing
**Goal**: Validate specialist integration with mock specialists
**Plans**: 2 plans
**Status**: Complete

</details>

### 🚧 v1.22 Orchestrator-Mediated Specialist Delegation (In Progress)

**Milestone Goal:** Fix specialist delegation by having orchestrator spawn specialists based on planner assignments.

- [x] **Phase 7: Infrastructure** - Agent enumeration and planning integration (completed 2026-02-23)
- [x] **Phase 07.1: VoltAgent Verification Teams** - (INSERTED) (completed 2026-02-23)
- [x] **Phase 8: Orchestrator Spawning** - Specialist spawning with context injection (completed 2026-02-23)
- [x] **Phase 9: Result Handling** - Result parsing and state management (completed 2026-02-23)
- [ ] **Phase 10: Error Recovery & Cleanup** - Graceful fallback and cleanup

## Phase Details

### Phase 7: Infrastructure (Agent Enumeration & Planning Integration)
**Goal**: Planner knows which specialists exist and assigns them during planning
**Depends on**: Nothing (first phase of v1.22)
**Requirements**: DISC-01, DISC-02, DISC-03, DISC-04, PLAN-01, PLAN-02, PLAN-03, PLAN-04, PLAN-05
**Success Criteria** (what must be TRUE):
  1. Orchestrator generates available_agents.md from ~/.claude/agents/ before planning
  2. Planner reads available_agents.md and sees all installed VoltAgent specialists
  3. Planner assigns specialist attribute to tasks in PLAN.md based on domain detection
  4. Tasks without matching domain get specialist=null (direct execution)
  5. Planner validates specialist exists before assignment (prevents spawn failures)
**Plans**: 2 plans

Plans:
- [x] 07-01-PLAN.md — Agent enumeration in gsd-tools and orchestrator validation
- [x] 07-02-PLAN.md — Planning integration with specialist assignment

### Phase 07.1: VoltAgent Verification Teams (INSERTED)
**Goal**: Implement multi-specialist verification teams for validating task output
**Depends on**: Phase 7
**Requirements**: VT-01, VT-02, VT-03, VT-04, VT-05, VT-06, VT-07, VT-08, VT-09, VT-10, VT-11
**Success Criteria** (what must be TRUE):
  1. Execute-phase orchestrator spawns verification specialists after task completion
  2. Verification tier determines which specialists review (Tier 1/2/3)
  3. Sequential verification chain for Tier 3 critical tasks
  4. Verification results determine go/no-go for task completion
  5. Verification is configurable and supports graceful degradation
**Plans**: 2 plans

Plans:
- [ ] 07.1-01-PLAN.md — Core verification infrastructure and single-specialist support
- [ ] 07.1-02-PLAN.md — Multi-specialist teams and configuration options

### Phase 8: Orchestrator Spawning (Specialist Spawning & Context Passing)
**Goal**: Orchestrator spawns specialists with proper context injection
**Depends on**: Phase 7
**Requirements**: SPAWN-01, SPAWN-02, SPAWN-03, SPAWN-04, SPAWN-05
**Success Criteria** (what must be TRUE):
  1. Orchestrator reads specialist field from PLAN.md tasks
  2. Orchestrator spawns specialist via Task(subagent_type=...) with fresh context window
  3. Orchestrator injects task context via files_to_read (paths, not content)
  4. Orchestrator falls back to gsd-executor when specialist=null or unavailable
  5. Specialists execute tasks with same context quality as gsd-executor
**Plans**: 2 plans

Plans:
- [x] 08-01-PLAN.md — Specialist field parsing and spawning logic (completed 2026-02-23)
- [x] 08-02-PLAN.md — Fallback mechanisms and integration (completed 2026-02-23)

### Phase 9: Result Handling (Result Parsing & State Management)
**Goal**: Orchestrator reliably parses specialist results and updates state
**Depends on**: Phase 8
**Requirements**: RESULT-01, RESULT-02, RESULT-03, RESULT-04
**Success Criteria** (what must be TRUE):
  1. Orchestrator parses specialist output regardless of format variations
  2. Orchestrator updates STATE.md via gsd-tools (single-writer pattern preserved)
  3. Orchestrator tracks specialist metadata in task summaries
  4. Co-authored commits include specialist attribution (Co-Authored-By: Specialist)
**Plans**: 2 plans

Plans:
- [x] 09-01-PLAN.md — Multi-layer result parsing with fallback strategies (2026-02-23)
- [x] 09-02-PLAN.md — State management via gsd-tools and attribution tracking (2026-02-23)

### Phase 10: Error Recovery & Cleanup (Graceful Fallback & Robustness)
**Goal**: System handles specialist failures gracefully and cleans up broken code
**Depends on**: Phase 9
**Requirements**: ERROR-01, ERROR-02, ERROR-03, ERROR-04, ERROR-05, CLEAN-01, CLEAN-02
**Success Criteria** (what must be TRUE):
  1. Orchestrator validates specialist availability before spawning
  2. Orchestrator handles timeouts with partial result salvage
  3. Orchestrator falls back to gsd-executor when specialist fails
  4. Orchestrator creates checkpoint before spawn for rollback on failure
  5. Broken Task() delegation code removed from gsd-executor.md
**Plans**: 2 plans

Plans:
- [ ] 10-01-PLAN.md — Error recovery and robustness (timeout, checkpoint, rollback)
- [ ] 10-02-PLAN.md — Cleanup and documentation (remove broken code, document architecture)

## Progress

**Execution Order:**
Phases execute in numeric order: 7 → 07.1 → 8 → 9 → 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 7. Infrastructure | 2/2 | Complete | 2026-02-23 |
| 07.1. VoltAgent Verification Teams | 2/2 | Complete    | 2026-02-23 |
| 8. Orchestrator Spawning | 2/2 | Complete | 2026-02-23 |
| 9. Result Handling | 2/2 | Complete | 2026-02-23 |
| 10. Error Recovery & Cleanup | 0/2 | Not started | - |