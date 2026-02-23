# Requirements: GSD v1.22

**Defined:** 2026-02-23
**Core Value:** Give Claude everything it needs to do the work AND verify it

## v1.22 Requirements

Requirements for orchestrator-mediated specialist delegation. Each maps to roadmap phases.

### Agent Discovery

- [ ] **DISC-01**: gsd-tools generates available_agents.md from ~/.claude/agents/
- [ ] **DISC-02**: available_agents.md includes agent name, type, and description
- [ ] **DISC-03**: Orchestrator validates agent exists before spawning (fresh check)
- [ ] **DISC-04**: Filter excludes GSD system agents (gsd-executor, gsd-planner, etc.)

### Planning Integration

- [ ] **PLAN-01**: Planner reads available_agents.md as context
- [ ] **PLAN-02**: Planner detects task domain using keyword patterns (reuse v1.21)
- [ ] **PLAN-03**: Planner assigns specialist attribute to tasks in PLAN.md
- [ ] **PLAN-04**: Planner validates specialist exists before assignment
- [ ] **PLAN-05**: Tasks without matching domain get specialist=null (direct execution)

### Orchestrator Spawning

- [ ] **SPAWN-01**: Orchestrator reads specialist field from PLAN.md tasks
- [ ] **SPAWN-02**: Orchestrator spawns specialist via Task(subagent_type=...)
- [ ] **SPAWN-03**: Orchestrator injects context via files_to_read (content, not paths)
- [ ] **SPAWN-04**: Orchestrator falls back to gsd-executor if specialist=null
- [ ] **SPAWN-05**: Orchestrator falls back to gsd-executor if specialist unavailable

### Result Handling

- [ ] **RESULT-01**: Orchestrator parses specialist output (multi-layer parser)
- [ ] **RESULT-02**: Orchestrator updates STATE.md via gsd-tools (single-writer)
- [ ] **RESULT-03**: Orchestrator tracks specialist metadata in SUMMARY.md
- [ ] **RESULT-04**: Co-authored commits include specialist attribution (reuse v1.21)

### Error Recovery

- [ ] **ERROR-01**: Check specialist availability before spawning
- [ ] **ERROR-02**: Timeout handling for long-running specialists
- [ ] **ERROR-03**: Fallback to gsd-executor on specialist failure
- [ ] **ERROR-04**: Checkpoint before specialist spawn for rollback
- [ ] **ERROR-05**: Structured error logging for failed delegations

### Cleanup

- [ ] **CLEAN-01**: Remove broken Task() delegation code from gsd-executor.md
- [ ] **CLEAN-02**: Update gsd-executor documentation to reflect new architecture

## Future Requirements

Deferred to v1.23+. Tracked but not in current roadmap.

### Parallel Execution

- **PARA-01**: Spawn multiple specialists in parallel for independent tasks
- **PARA-02**: Aggregate results from parallel specialists

### Analytics

- **ANAL-01**: Historical delegation metrics dashboard
- **ANAL-02**: Specialist performance tracking

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Dynamic specialist selection at runtime | Adds complexity, planning-time is sufficient |
| Nested specialist delegation | Specialists cannot call Task(), architectural constraint |
| Bidirectional orchestrator-specialist communication | One-way flow is simpler, sufficient for v1.22 |
| Specialist progress streaming | Adds complexity, defer to v1.23 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DISC-01 | Phase 7 | Pending |
| DISC-02 | Phase 7 | Pending |
| DISC-03 | Phase 7 | Pending |
| DISC-04 | Phase 7 | Pending |
| PLAN-01 | Phase 7 | Pending |
| PLAN-02 | Phase 7 | Pending |
| PLAN-03 | Phase 7 | Pending |
| PLAN-04 | Phase 7 | Pending |
| PLAN-05 | Phase 7 | Pending |
| SPAWN-01 | Phase 8 | Pending |
| SPAWN-02 | Phase 8 | Pending |
| SPAWN-03 | Phase 8 | Pending |
| SPAWN-04 | Phase 8 | Pending |
| SPAWN-05 | Phase 8 | Pending |
| RESULT-01 | Phase 9 | Pending |
| RESULT-02 | Phase 9 | Pending |
| RESULT-03 | Phase 9 | Pending |
| RESULT-04 | Phase 9 | Pending |
| ERROR-01 | Phase 10 | Pending |
| ERROR-02 | Phase 10 | Pending |
| ERROR-03 | Phase 10 | Pending |
| ERROR-04 | Phase 10 | Pending |
| ERROR-05 | Phase 10 | Pending |
| CLEAN-01 | Phase 10 | Pending |
| CLEAN-02 | Phase 10 | Pending |

**Coverage:**
- v1.22 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0

---
*Requirements defined: 2026-02-23*
*Last updated: 2026-02-22 after roadmap creation*
