# Roadmap: GSD v1.21 Hybrid Agent Team Execution

## Overview

This milestone transforms GSD from a single generalist executor to a hybrid team orchestrator. gsd-executor gains the ability to detect task domains and delegate to VoltAgent specialists when complexity warrants it, while preserving all GSD guarantees through adapter layers and single-writer state management. The system gracefully degrades to direct execution when specialists are unavailable, ensuring backward compatibility.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation - Detection & Routing** - Domain detection, availability checks, and fallback hierarchy
- [ ] **Phase 2: Adapters - Context Translation** - Translate GSD tasks to specialist prompts and parse results
- [ ] **Phase 3: Integration - Wiring & Delegation** - End-to-end delegation flow with Task tool invocation
- [ ] **Phase 4: Configuration - Settings & Registry** - Config schema, specialist registry, and feature flags
- [ ] **Phase 5: Testing - Validation & Edge Cases** - Integration tests, backward compatibility, fallback validation
- [ ] **Phase 6: Observability - Logging & Metrics** - Structured logging, delegation metrics, quality gates

## Phase Details

### Phase 1: Foundation - Detection & Routing
**Goal**: gsd-executor can detect task domains, check specialist availability, and route to specialists or fallback gracefully
**Depends on**: Nothing (first phase)
**Requirements**: DLGT-01, DLGT-02, DLGT-03, DLGT-05, SPEC-01, SPEC-02, SPEC-03
**Success Criteria** (what must be TRUE):
  1. gsd-executor analyzes task description and identifies domain (Python, TypeScript, Kubernetes, etc.)
  2. gsd-executor checks if matching VoltAgent specialist is installed globally
  3. gsd-executor makes delegation decision based on complexity threshold (>3 files OR domain expertise clearly beneficial)
  4. When specialist unavailable, gsd-executor executes task directly without errors
  5. All 127+ VoltAgent specialists are detectable via dynamic registry population
**Plans**: 4 plans

Plans:
- [x] 01-01-PLAN.md — Domain detection patterns and specialist registry mapping
- [x] 01-02-PLAN.md — Configuration schema with feature flags and fallback settings
- [x] 01-03-PLAN.md — Availability checking, routing logic, and adapter functions
- [x] 01-04-PLAN.md — End-to-end testing and backward compatibility validation

### Phase 2: Adapters - Context Translation
**Goal**: gsd-executor can translate GSD task format to specialist prompts and parse specialist output back to GSD format
**Depends on**: Phase 1
**Requirements**: ADPT-01, ADPT-02, ADPT-03, ADPT-04, ADPT-05, ADPT-06
**Success Criteria** (what must be TRUE):
  1. gsd-task-adapter extracts essential context from PLAN.md (task description, verification criteria, @-references)
  2. gsd-task-adapter injects GSD rules into specialist prompt ("atomic commits only, report deviations")
  3. gsd-task-adapter prunes context to prevent token overflow (essential subset, not full state dump)
  4. gsd-result-adapter parses specialist output and extracts structured fields (files_modified, deviations, commit_message)
  5. gsd-result-adapter validates required fields are present and falls back to heuristic parsing if needed
**Plans**: 3 plans

Plans:
- [ ] 02-01-PLAN.md — Enhance task adapter with context pruning and GSD rule injection
- [ ] 02-02-PLAN.md — Enhance result adapter with multi-layer parsing and deviation extraction
- [ ] 02-03-PLAN.md — Comprehensive test suite for adapter robustness

### Phase 3: Integration - Wiring & Delegation
**Goal**: gsd-executor orchestrates end-to-end delegation flow from task routing to specialist execution to state updates
**Depends on**: Phase 2
**Requirements**: INTG-01, INTG-02, INTG-03, INTG-04, INTG-05, INTG-06, DLGT-04, DLGT-06
**Success Criteria** (what must be TRUE):
  1. gsd-executor routing logic (Route A: delegate vs Route B: direct) executes correctly per task
  2. When delegating, gsd-executor invokes specialist via Task(subagent_type="${SPECIALIST_TYPE}")
  3. Specialists receive project context (CLAUDE.md, .agents/skills/) in their prompts
  4. Git commits include co-authorship attribution: "Co-authored-by: {specialist} <specialist@voltagent>"
  5. SUMMARY.md includes specialist usage metadata (which specialist, why selected)
  6. Only gsd-executor writes STATE.md, PLAN.md, ROADMAP.md (single-writer pattern enforced)
  7. Checkpoint status from specialists is captured and presented by gsd-executor
  8. Fallback decisions are logged when specialists unavailable
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Configuration - Settings & Registry
**Goal**: Users can control delegation behavior through config.json settings and specialist registry mappings
**Depends on**: Phase 3
**Requirements**: CONF-01, CONF-02, CONF-03
**Success Criteria** (what must be TRUE):
  1. config.json setting "workflow.use_specialists" exists (default: false for v1.21)
  2. Specialist registry JSON maps task domains to specialist types (Python → python-pro)
  3. config.json setting "voltagent.fallback_on_error" exists (default: true)
  4. When use_specialists=false, delegation is completely disabled and execution matches v1.20 behavior
  5. Specialist registry auto-populates from detected VoltAgent plugins
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

### Phase 5: Testing - Validation & Edge Cases
**Goal**: v1.21 delegation works correctly across all scenarios and maintains backward compatibility
**Depends on**: Phase 4
**Requirements**: (Validates all prior requirements)
**Success Criteria** (what must be TRUE):
  1. Integration test passes: Python task with python-pro installed delegates correctly
  2. Integration test passes: Same Python task without python-pro executes directly
  3. Integration test passes: Mixed-domain plan (5 tasks, different specialists) routes correctly
  4. Integration test passes: Existing v1.20 workflows work identically with use_specialists=false
  5. Integration test passes: System works correctly with zero VoltAgent specialists installed
  6. Specialist outputs parse correctly in gsd-result-adapter (structured format validated)
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

### Phase 6: Observability - Logging & Metrics
**Goal**: Delegation decisions and specialist usage are observable through structured logs and metrics
**Depends on**: Phase 5
**Requirements**: OBSV-01, OBSV-02, OBSV-03
**Success Criteria** (what must be TRUE):
  1. Delegation decisions are logged with structured format (timestamp, specialist, task, reason, context_size)
  2. SUMMARY.md includes "Specialist Delegation" section showing which tasks used which specialists
  3. Fallback occurrences are logged with reason when specialists unavailable or fail
  4. Logs capture both successful delegations and fallback-to-direct events
**Plans**: TBD

Plans:
- [ ] 06-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation - Detection & Routing | 4/4 | Complete | 2026-02-22 |
| 2. Adapters - Context Translation | 0/3 | Ready to execute | - |
| 3. Integration - Wiring & Delegation | 0/TBD | Not started | - |
| 4. Configuration - Settings & Registry | 0/TBD | Not started | - |
| 5. Testing - Validation & Edge Cases | 0/TBD | Not started | - |
| 6. Observability - Logging & Metrics | 0/TBD | Not started | - |