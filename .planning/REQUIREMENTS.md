# Requirements: GSD v1.21 Hybrid Agent Team Execution

**Defined:** 2026-02-22
**Core Value:** Delegate tasks to domain specialists while preserving GSD guarantees

## v1.21 Requirements

Requirements for hybrid agent team execution. Each maps to roadmap phases.

### Delegation Core

- [ ] **DLGT-01**: gsd-executor detects task domain via keyword-based pattern matching
- [ ] **DLGT-02**: gsd-executor checks VoltAgent specialist availability (npm list -g)
- [ ] **DLGT-03**: gsd-executor falls back to direct execution when specialist unavailable
- [ ] **DLGT-04**: Only gsd-executor writes STATE.md (single-writer pattern)
- [ ] **DLGT-05**: gsd-executor applies complexity threshold before delegating (>3 files OR domain expertise clearly beneficial)
- [ ] **DLGT-06**: Fallback decisions are logged ("python-pro unavailable, using generalist")

### Adapter Layer

- [ ] **ADPT-01**: gsd-task-adapter translates GSD PLAN.md task → specialist prompt
- [ ] **ADPT-02**: gsd-task-adapter prunes context (essential subset, not full state dump)
- [ ] **ADPT-03**: gsd-task-adapter injects GSD rules ("atomic commits only, report deviations")
- [ ] **ADPT-04**: gsd-result-adapter parses specialist output → GSD completion format
- [ ] **ADPT-05**: gsd-result-adapter validates structured output schema (files_modified, deviations, commit_message)
- [ ] **ADPT-06**: gsd-result-adapter extracts deviations from specialist output

### Integration

- [ ] **INTG-01**: gsd-executor routing logic (Route A: delegate vs Route B: direct)
- [ ] **INTG-02**: Specialist invocation via Task(subagent_type="${SPECIALIST_TYPE}")
- [ ] **INTG-03**: Co-authored commits: `Co-authored-by: {specialist} <specialist@voltagent>`
- [ ] **INTG-04**: SUMMARY.md includes specialist usage metadata (which specialist, why selected)
- [ ] **INTG-05**: Specialists receive project context (CLAUDE.md, .agents/skills/)
- [ ] **INTG-06**: Checkpoint handling preserved (specialists return checkpoint status → gsd-executor presents)

### Configuration

- [ ] **CONF-01**: config.json setting `workflow.use_specialists` (default: false for v1.21)
- [ ] **CONF-02**: Specialist registry JSON mapping domains → specialist types
- [ ] **CONF-03**: config.json setting `voltagent.fallback_on_error` (default: true)

### Observability

- [ ] **OBSV-01**: Structured logging of delegation decisions (timestamp, specialist, task, reason)
- [ ] **OBSV-02**: Logging captured in SUMMARY.md "Specialist Delegation" section
- [ ] **OBSV-03**: Fallback occurrences logged with reason

### Specialist Support

- [ ] **SPEC-01**: Support all VoltAgent specialists via dynamic detection (127+ specialists)
- [ ] **SPEC-02**: Specialist registry auto-populates from detected VoltAgent plugins
- [ ] **SPEC-03**: Domain patterns map file extensions and keywords to specialist types

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
| DLGT-01 | — | Pending |
| DLGT-02 | — | Pending |
| DLGT-03 | — | Pending |
| DLGT-04 | — | Pending |
| DLGT-05 | — | Pending |
| DLGT-06 | — | Pending |
| ADPT-01 | — | Pending |
| ADPT-02 | — | Pending |
| ADPT-03 | — | Pending |
| ADPT-04 | — | Pending |
| ADPT-05 | — | Pending |
| ADPT-06 | — | Pending |
| INTG-01 | — | Pending |
| INTG-02 | — | Pending |
| INTG-03 | — | Pending |
| INTG-04 | — | Pending |
| INTG-05 | — | Pending |
| INTG-06 | — | Pending |
| CONF-01 | — | Pending |
| CONF-02 | — | Pending |
| CONF-03 | — | Pending |
| OBSV-01 | — | Pending |
| OBSV-02 | — | Pending |
| OBSV-03 | — | Pending |
| SPEC-01 | — | Pending |
| SPEC-02 | — | Pending |
| SPEC-03 | — | Pending |

**Coverage:**
- v1.21 requirements: 27 total
- Mapped to phases: 0
- Unmapped: 27 ⚠️

---
*Requirements defined: 2026-02-22*
*Last updated: 2026-02-22 after initial definition*
