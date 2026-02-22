# Requirements: GSD v1.21 Hybrid Agent Team Execution

**Defined:** 2026-02-22
**Core Value:** Delegate tasks to domain specialists while preserving GSD guarantees

## v1.21 Requirements

Requirements for hybrid agent team execution. Each maps to roadmap phases.

### Delegation Core

- [x] **DLGT-01**: gsd-executor detects task domain via keyword-based pattern matching
- [x] **DLGT-02**: gsd-executor checks VoltAgent specialist availability (filesystem ~/.claude/agents/)
- [x] **DLGT-03**: gsd-executor falls back to direct execution when specialist unavailable
- [x] **DLGT-04**: Only gsd-executor writes STATE.md (single-writer pattern)
- [x] **DLGT-05**: gsd-executor applies complexity threshold before delegating (>3 files OR domain expertise clearly beneficial)
- [x] **DLGT-06**: Fallback decisions are logged ("python-pro unavailable, using generalist")

### Adapter Layer

- [x] **ADPT-01**: gsd-task-adapter translates GSD PLAN.md task → specialist prompt
- [x] **ADPT-02**: gsd-task-adapter prunes context (essential subset, not full state dump)
- [x] **ADPT-03**: gsd-task-adapter injects GSD rules ("atomic commits only, report deviations")
- [x] **ADPT-04**: gsd-result-adapter parses specialist output → GSD completion format
- [x] **ADPT-05**: gsd-result-adapter validates structured output schema (files_modified, deviations, commit_message)
- [x] **ADPT-06**: gsd-result-adapter extracts deviations from specialist output

### Integration

- [x] **INTG-01**: gsd-executor routing logic (Route A: delegate vs Route B: direct)
- [x] **INTG-02**: Specialist invocation via Task(subagent_type="${SPECIALIST_TYPE}")
- [x] **INTG-03**: Co-authored commits: `Co-authored-by: {specialist} <specialist@voltagent>`
- [x] **INTG-04**: SUMMARY.md includes specialist usage metadata (which specialist, why selected)
- [x] **INTG-05**: Specialists receive project context (CLAUDE.md, .agents/skills/)
- [x] **INTG-06**: Checkpoint handling preserved (specialists return checkpoint status → gsd-executor presents)

### Configuration

- [x] **CONF-01**: config.json setting `workflow.use_specialists` (default: false for v1.21)
- [x] **CONF-02**: Specialist registry JSON mapping domains → specialist types
- [x] **CONF-03**: config.json setting `voltagent.fallback_on_error` (default: true)

### Observability

- [x] **OBSV-01**: Structured logging of delegation decisions (timestamp, specialist, task, reason)
- [x] **OBSV-02**: Logging captured in SUMMARY.md "Specialist Delegation" section
- [x] **OBSV-03**: Fallback occurrences logged with reason

### Specialist Support

- [x] **SPEC-01**: Support all VoltAgent specialists via dynamic detection (127+ specialists)
- [x] **SPEC-02**: Specialist registry auto-populates from detected VoltAgent plugins
- [x] **SPEC-03**: Domain patterns map file extensions and keywords to specialist types

## Future Requirements (v1.22+)

Deferred to future release. Tracked but not in current roadmap.

### Multi-Specialist Coordination

- **MULT-01**: Tasks can specify multiple specialists in PLAN.md
- **MULT-02**: multi-agent-coordinator orchestrates multi-specialist workflows
- **MULT-03**: Result merging when multiple specialists contribute to same task

### Advanced Observability

- **AOBS-01**: Delegation metrics tracking (success rate, duration per specialist)
- **AOBS-02**: Quality gates (fallback if specialist quality < threshold)
- **AOBS-03**: Specialist performance dashboard

### Intelligent Routing

- **INTL-01**: LLM-based domain classification for ambiguous tasks
- **INTL-02**: Automatic specialist selection based on task complexity analysis
- **INTL-03**: Capability learning ("typescript-pro excels at React hooks")

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Specialist-to-specialist direct handoff | Creates untrackable delegation chains, loses GSD state management |
| Specialist state persistence | Violates fresh context principle, creates hidden dependencies |
| Custom prompts per specialist | Maintenance burden, duplicates VoltAgent knowledge |
| Parallel specialist execution | Complexity deferred to v1.22+; sequential is simpler for v1.21 |
| VoltAgent framework embedding | GSD stays zero-dependency (detection via npm CLI, not runtime) |
| Ensemble execution (2+ specialists compare) | Very high complexity, 2x cost, defer to v1.23+ |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DLGT-01 | Phase 1 | Complete |
| DLGT-02 | Phase 1 | Complete |
| DLGT-03 | Phase 1 | Complete |
| DLGT-04 | Phase 3 | Complete |
| DLGT-05 | Phase 1 | Complete |
| DLGT-06 | Phase 3 | Complete |
| ADPT-01 | Phase 2 | Complete |
| ADPT-02 | Phase 2 | Complete |
| ADPT-03 | Phase 2 | Complete |
| ADPT-04 | Phase 2 | Complete |
| ADPT-05 | Phase 2 | Complete |
| ADPT-06 | Phase 2 | Complete |
| INTG-01 | Phase 3 | Complete |
| INTG-02 | Phase 3 | Complete |
| INTG-03 | Phase 3 | Complete |
| INTG-04 | Phase 3 | Complete |
| INTG-05 | Phase 3 | Complete |
| INTG-06 | Phase 3 | Complete |
| CONF-01 | Phase 1 | Complete |
| CONF-02 | Phase 1 | Complete |
| CONF-03 | Phase 1 | Complete |
| OBSV-01 | Phase 3 | Complete |
| OBSV-02 | Phase 3 | Complete |
| OBSV-03 | Phase 3 | Complete |
| SPEC-01 | Phase 1 | Complete |
| SPEC-02 | Phase 1 | Complete |
| SPEC-03 | Phase 1 | Complete |

**Coverage:**
- v1.21 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0

---
*Requirements defined: 2026-02-22*
*Last updated: 2026-02-22 after roadmap creation (100% coverage)*
