# Phase 09: Result Handling - Research

**Researched:** 2026-02-23
**Domain:** Specialist result parsing, state management, attribution patterns
**Confidence:** HIGH

## Summary

This research investigates how the GSD orchestrator should parse specialist outputs, maintain single-writer state updates, track metadata, and ensure proper commit attribution. Based on analysis of existing implementation patterns in execute-phase.md, gsd-tools.cjs, and related workflows, the standard approach is to use multi-layer parsing with fallback strategies, centralized state updates via gsd-tools, structured metadata in SUMMARY.md frontmatter, and Git trailer format for co-authorship.

The orchestrator already has partial implementation for verification specialists (parsing status/issues/suggestions). This needs to be generalized for all specialist types while preserving the single-writer pattern that prevents STATE.md corruption.

**Primary recommendation:** Implement a three-tier result parser that handles structured returns, common patterns, and raw output fallback. Use gsd-tools exclusively for STATE.md updates. Track specialist metadata in SUMMARY.md frontmatter. Include Co-Authored-By trailers in commits when specialists execute tasks.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| gsd-tools.cjs | Current | State file operations | Enforces single-writer pattern, prevents corruption |
| bash (built-in) | 5.0+ | Result parsing | Already used for orchestrator logic |
| grep/sed/awk | POSIX | Text extraction | Standard Unix tools for pattern matching |
| jq | 1.6+ | JSON parsing | If specialists return JSON (optional) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js fs module | 16+ | File operations | Already used by gsd-tools |
| Git trailers | 2.0+ | Attribution | Standard co-authorship format |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| bash parsing | Node.js parser | More complexity, but better for complex formats |
| Git trailers | Custom metadata | Loses GitHub/GitLab UI integration |
| Single-writer | Direct writes | Risk of concurrent corruption |

**Installation:**
```bash
# All tools are already present in GSD environment
# No additional installation needed
```

## Architecture Patterns

### Recommended Project Structure
```
.planning/
├── STATE.md              # Single-writer protected (gsd-tools only)
├── ROADMAP.md            # Single-writer protected (gsd-tools only)
├── REQUIREMENTS.md       # Single-writer protected (gsd-tools only)
├── agent-history.json    # Specialist execution history
└── phases/
    └── XX-name/
        ├── XX-YY-SUMMARY.md  # Contains specialist_usage metadata
        └── XX-YY-RESULT.txt  # Raw specialist output (for debugging)
```

### Pattern 1: Three-Tier Result Parsing
**What:** Parse specialist output through three layers - structured format, common patterns, raw fallback
**When to use:** Every specialist return
**Example:**
```bash
# Source: execute-phase.md lines 506-509
# Tier 1: Try structured format (status: PASS/FAIL)
VERIFICATION_STATUS=$(echo "$VERIFICATION_RESULT" | grep -o "status: [A-Z]*" | cut -d' ' -f2)

# Tier 2: Try common patterns (## COMPLETE, ## FAILED)
if [ -z "$VERIFICATION_STATUS" ]; then
  if echo "$RESULT" | grep -q "## TASK COMPLETE"; then
    STATUS="PASS"
  elif echo "$RESULT" | grep -q "## FAILED"; then
    STATUS="FAIL"
  fi
fi

# Tier 3: Fallback to heuristics (file existence, commit presence)
if [ -z "$STATUS" ]; then
  # Check if expected files exist
  if [ -f "${EXPECTED_OUTPUT}" ]; then
    STATUS="PASS"
  else
    STATUS="FAIL"
  fi
fi
```

### Pattern 2: Single-Writer State Updates
**What:** All STATE.md updates go through gsd-tools to prevent concurrent corruption
**When to use:** Any state modification
**Example:**
```bash
# Source: execute-plan.md lines 331-344
# Never write directly to STATE.md
# Always use gsd-tools commands:

node ~/.claude/get-shit-done/bin/gsd-tools.cjs state advance-plan

node ~/.claude/get-shit-done/bin/gsd-tools.cjs state update-progress

node ~/.claude/get-shit-done/bin/gsd-tools.cjs state record-metric \
  --phase "${PHASE}" --plan "${PLAN}" --duration "${DURATION}"

node ~/.claude/get-shit-done/bin/gsd-tools.cjs state add-decision \
  --phase "${PHASE}" --summary "${DECISION_TEXT}"
```

### Pattern 3: Specialist Metadata in Frontmatter
**What:** Track which specialist executed each task in SUMMARY.md frontmatter
**When to use:** When generating SUMMARY.md after specialist execution
**Example:**
```yaml
# In SUMMARY.md frontmatter
specialist_usage:
  gsd-executor: [1, 3, 5]      # Task numbers
  python-pro: [2, 4]            # Task numbers
  qa-expert: [verification]     # Special roles
```

### Anti-Patterns to Avoid
- **Direct STATE.md writes:** Never use echo/sed/awk directly on STATE.md - always use gsd-tools
- **Assuming output format:** Always implement fallback parsing tiers
- **Losing specialist context:** Always preserve which specialist did what work

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| STATE.md updates | Direct file writes | gsd-tools state commands | Prevents corruption from concurrent writes |
| Progress calculation | Manual counting | gsd-tools state update-progress | Handles all edge cases |
| Requirement tracking | Grep REQUIREMENTS.md | gsd-tools requirements mark-complete | Maintains consistency |
| Commit attribution | Custom headers | Git trailers (Co-Authored-By) | GitHub/GitLab parse and display |
| Agent history | In-memory tracking | agent-history.json | Persistent across crashes |

**Key insight:** The single-writer pattern is critical. Multiple agents writing to STATE.md simultaneously causes corruption. gsd-tools serializes all writes.

## Common Pitfalls

### Pitfall 1: Concurrent STATE.md Corruption
**What goes wrong:** Multiple specialists complete simultaneously, both try to update STATE.md, file gets corrupted
**Why it happens:** Direct file writes without locking
**How to avoid:** Always use gsd-tools for state operations - it implements proper locking
**Warning signs:** Malformed STATE.md, missing sections, duplicate entries

### Pitfall 2: Lost Specialist Attribution
**What goes wrong:** Can't tell which specialist did which work after execution
**Why it happens:** Not tracking specialist per task, only per plan
**How to avoid:** Store specialist_usage in SUMMARY.md frontmatter with task-level granularity
**Warning signs:** Generic commits without specialist attribution

### Pitfall 3: Unparseable Specialist Output
**What goes wrong:** Specialist returns unexpected format, parser fails, execution marked as failed
**Why it happens:** Specialists have varying output styles
**How to avoid:** Implement three-tier parsing with fallback to file/commit verification
**Warning signs:** False failures when work was actually done

### Pitfall 4: ClassifyHandoffIfNeeded False Failures
**What goes wrong:** Task() returns error but work completed successfully
**Why it happens:** Known Claude Code bug in completion handler
**How to avoid:** Always verify actual outputs (files, commits) before treating as failure
**Warning signs:** Error message contains "classifyHandoffIfNeeded is not defined"

## Code Examples

Verified patterns from official sources:

### Parse Specialist Result with Fallback
```bash
# Source: Based on execute-phase.md verification parsing
parse_specialist_result() {
  local RESULT="$1"
  local TASK_NUM="$2"
  local SPECIALIST="$3"

  # Tier 1: Structured format
  local STATUS=$(echo "$RESULT" | grep -o "^##.*COMPLETE" | head -1)
  if [ -n "$STATUS" ]; then
    echo "SUCCESS"
    return
  fi

  # Tier 2: Common patterns
  if echo "$RESULT" | grep -q "Task.*completed successfully"; then
    echo "SUCCESS"
    return
  fi

  # Tier 3: Verification fallback
  # Check if specialist created expected outputs
  local PLAN_DIR="${PHASE_DIR}"
  if [ -f "${PLAN_DIR}/${PHASE}-${PLAN}-SUMMARY.md" ]; then
    echo "SUCCESS"
  else
    echo "FAILURE"
  fi
}
```

### Update STATE.md via gsd-tools
```bash
# Source: execute-plan.md lines 331-358
# Record execution metrics
node ~/.claude/get-shit-done/bin/gsd-tools.cjs state record-metric \
  --phase "${PHASE}" \
  --plan "${PLAN}" \
  --duration "${DURATION}" \
  --tasks "${TASK_COUNT}" \
  --files "${FILE_COUNT}"

# Add decision from specialist
DECISION="Use React Context for state management"
RATIONALE="Redux overhead not justified for app size"
node ~/.claude/get-shit-done/bin/gsd-tools.cjs state add-decision \
  --phase "${PHASE}" \
  --summary "${DECISION}" \
  --rationale "${RATIONALE}"
```

### Extract Specialist Metadata for SUMMARY
```bash
# Source: New pattern for specialist tracking
# Build specialist usage map during execution
declare -A SPECIALIST_TASKS
for TASK_NUM in "${!SPECIALISTS[@]}"; do
  SPEC="${SPECIALISTS[$TASK_NUM]}"
  if [ -z "${SPECIALIST_TASKS[$SPEC]}" ]; then
    SPECIALIST_TASKS[$SPEC]="$TASK_NUM"
  else
    SPECIALIST_TASKS[$SPEC]="${SPECIALIST_TASKS[$SPEC]}, $TASK_NUM"
  fi
done

# Format for SUMMARY.md frontmatter
echo "specialist_usage:"
for SPEC in "${!SPECIALIST_TASKS[@]}"; do
  echo "  ${SPEC}: [${SPECIALIST_TASKS[$SPEC]}]"
done
```

### Generate Co-Authored Commit
```bash
# Source: Pattern from v1.21 implementation
# When specialist executes task, include attribution
SPECIALIST_NAME="python-pro"
SPECIALIST_EMAIL="${SPECIALIST_NAME}@voltagent"

git commit -m "$(cat <<EOF
feat(${PHASE}-${PLAN}): implement user authentication

- Add JWT token generation
- Implement refresh token rotation
- Add rate limiting middleware

Co-Authored-By: ${SPECIALIST_NAME} <${SPECIALIST_EMAIL}>
EOF
)"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct STATE.md writes | gsd-tools single-writer | v1.20 | No more corruption |
| No specialist tracking | specialist_usage in frontmatter | v1.22 | Full attribution |
| Binary pass/fail | Three-tier parsing with fallback | v1.22 | Fewer false failures |
| No co-authorship | Git trailers for specialists | v1.22 | GitHub shows attribution |

**Deprecated/outdated:**
- Direct sed/awk on STATE.md: Use gsd-tools instead
- In-memory agent tracking: Use persistent agent-history.json
- Single parsing attempt: Always implement fallback tiers

## Open Questions

Things that couldn't be fully resolved:

1. **Specialist Output Format Standardization**
   - What we know: Specialists have varying output styles
   - What's unclear: Should we mandate a format or handle all variations?
   - Recommendation: Handle variations with three-tier parsing for now

2. **Partial Failure Handling**
   - What we know: Specialist might complete some tasks but not others
   - What's unclear: How to track partial completion in STATE.md
   - Recommendation: Track at task level in SUMMARY.md, binary at plan level

3. **Specialist Error Messages**
   - What we know: Errors vary by specialist type
   - What's unclear: How to normalize error reporting
   - Recommendation: Preserve raw output in XX-YY-RESULT.txt for debugging

## Sources

### Primary (HIGH confidence)
- execute-phase.md - Current orchestrator implementation with verification parsing
- gsd-tools.cjs and lib/state.cjs - Single-writer state operations
- execute-plan.md - State update patterns and commit flow

### Secondary (MEDIUM confidence)
- Git documentation on trailers - Verified co-authorship format
- agent-history.json pattern - Tracking specialist executions

### Tertiary (LOW confidence)
- Three-tier parsing approach - Inferred from verification specialist pattern, needs validation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools already in use
- Architecture: HIGH - Based on existing patterns
- Pitfalls: HIGH - Documented from actual issues (classifyHandoffIfNeeded bug, STATE.md corruption)

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (30 days - stable patterns)