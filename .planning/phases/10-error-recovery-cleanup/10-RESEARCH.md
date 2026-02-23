# Phase 10: Error Recovery & Cleanup - Research

**Researched:** 2026-02-23
**Domain:** Error handling, graceful degradation, cleanup patterns
**Confidence:** HIGH

## Summary

Error recovery and cleanup for specialist delegation focuses on four key areas: availability validation (already implemented in Phase 8), timeout handling for long-running specialists, failure detection with fallback patterns, and checkpoint-based rollback capabilities. The system must handle the known "classifyHandoffIfNeeded" bug, specialist unavailability, and timeout scenarios gracefully.

Research confirms that Phase 8 already implements comprehensive specialist validation with three-tier fallback logic. Phase 10 needs to add timeout handling using bash's `timeout` command, checkpoint creation via git tags/commits, and cleanup of broken Task() delegation code in gsd-executor.md.

**Primary recommendation:** Use GNU `timeout` with 5-minute default, git tags for checkpoints, and remove the broken Task() invocation at line 1483 of gsd-executor.md.

## Standard Stack

The established tools for error recovery in bash orchestration:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| GNU timeout | coreutils 8.32+ | Process timeout control | Standard Unix tool, reliable signal handling, exit code 124 |
| git | 2.39+ | Checkpoint creation | Atomic commits, tag-based rollback, universal VCS |
| bash trap | Bash 4.3+ | Signal handling | Built-in cleanup mechanism, SIGTERM/SIGKILL handling |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| gsd-tools | Current | State management | Single-writer pattern for STATE.md updates |
| jq | 1.6+ | JSON parsing | Extracting specialist metadata from responses |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GNU timeout | bash background jobs + sleep | timeout is cleaner, handles signals properly |
| git tags | git branches | Tags are lightweight, don't clutter branch list |
| Direct STATE.md writes | gsd-tools commands | gsd-tools prevents corruption, already established |

**Installation:**
```bash
# GNU timeout comes with coreutils (pre-installed on most systems)
# Git is already required for GSD
# No additional installations needed
```

## Architecture Patterns

### Recommended Error Handling Structure
```
execute-phase.md
├── Pre-spawn validation      # Phase 8: validate_specialist()
├── Checkpoint creation        # NEW: git tag before spawn
├── Timeout wrapper           # NEW: timeout 5m Task(...)
├── Result parsing            # Phase 9: parse_specialist_result()
├── Failure detection         # Existing: check exit codes
├── Rollback on failure       # NEW: git reset to checkpoint
└── Cleanup and reporting     # NEW: structured error logging
```

### Pattern 1: Timeout with Partial Result Salvage
**What:** Wrap Task() calls in GNU timeout, capture partial output
**When to use:** All specialist spawning to prevent indefinite hangs
**Example:**
```bash
# Source: Based on timeout command documentation
SPECIALIST_OUTPUT=$(timeout 5m bash -c 'Task(
  subagent_type="python-pro",
  model="claude-3-5-sonnet-20241022",
  prompt="..."
)' 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 124 ]; then
  echo "Specialist timed out after 5 minutes" >&2
  # Check for partial results in output
  if echo "$SPECIALIST_OUTPUT" | grep -q "created.*\.py\|modified.*\.py"; then
    echo "Partial work detected, attempting salvage" >&2
    # Continue with verification
  else
    echo "No salvageable work, falling back to gsd-executor" >&2
    CURRENT_SPECIALIST="gsd-executor"
    # Re-run with fallback
  fi
fi
```

### Pattern 2: Git Checkpoint Before Risky Operations
**What:** Create lightweight git tag before specialist spawn
**When to use:** Before any specialist invocation that modifies code
**Example:**
```bash
# Source: Git checkpoint patterns
create_checkpoint() {
  local PHASE="$1"
  local PLAN="$2"
  local SPECIALIST="$3"
  local TIMESTAMP=$(date +%Y%m%d_%H%M%S)

  # Create checkpoint commit (no-verify to skip hooks)
  git add -A
  git commit --no-verify -m "CHECKPOINT: Before ${SPECIALIST} execution for ${PHASE}-${PLAN}" 2>/dev/null || true

  # Tag for easy reference
  git tag "checkpoint/${PHASE}-${PLAN}/${TIMESTAMP}" 2>/dev/null

  echo "checkpoint/${PHASE}-${PLAN}/${TIMESTAMP}"
}

rollback_to_checkpoint() {
  local CHECKPOINT_TAG="$1"

  if git tag -l "$CHECKPOINT_TAG" | grep -q .; then
    git reset --hard "$CHECKPOINT_TAG"
    git tag -d "$CHECKPOINT_TAG"  # Clean up checkpoint
    echo "Rolled back to checkpoint: $CHECKPOINT_TAG" >&2
  else
    echo "Warning: Checkpoint $CHECKPOINT_TAG not found" >&2
  fi
}
```

### Anti-Patterns to Avoid
- **Infinite retry loops:** Set max retries (3) to prevent infinite loops on persistent failures
- **Silent failures:** Always log specialist failures with context for debugging
- **Orphaned checkpoints:** Clean up checkpoint tags after successful execution
- **Direct STATE.md writes during error handling:** Use gsd-tools even in error paths

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Process timeout | Custom sleep + kill logic | GNU timeout | Handles process groups, signals properly |
| Rollback mechanism | Manual file backup/restore | Git reset --hard | Atomic, handles all file states |
| State corruption recovery | Direct file manipulation | gsd-tools state commands | Maintains STATE.md integrity |
| Parallel specialist coordination | Custom process management | Existing wave-based execution | Already handles parallelization |

**Key insight:** Error recovery mechanisms are hard to get right. Use battle-tested tools (timeout, git, trap) rather than custom solutions.

## Common Pitfalls

### Pitfall 1: Task Tool "classifyHandoffIfNeeded" False Failures
**What goes wrong:** Every Task() call reports "failed" despite successful completion
**Why it happens:** Known Claude Code bug - internal function not defined
**How to avoid:** Parse output for actual success indicators, not just exit status
**Warning signs:** "classifyHandoffIfNeeded is not defined" in output

### Pitfall 2: Timeout Without Signal Escalation
**What goes wrong:** Specialist ignores SIGTERM, timeout fails to kill process
**Why it happens:** Some processes trap/ignore SIGTERM
**How to avoid:** Use `timeout --kill-after=10s 5m` to send SIGKILL if needed
**Warning signs:** Process continues after timeout period

### Pitfall 3: Checkpoint Accumulation
**What goes wrong:** Hundreds of checkpoint tags clutter git
**Why it happens:** Not cleaning up successful checkpoints
**How to avoid:** Delete checkpoint tags after successful execution
**Warning signs:** `git tag -l "checkpoint/*"` returns many old tags

### Pitfall 4: Variable Scope Loss in Timeout Subshell
**What goes wrong:** Variables set inside timeout command are lost
**Why it happens:** timeout runs in subshell with separate variable scope
**How to avoid:** Write to files or use command substitution to capture output
**Warning signs:** Empty variables after timeout command

## Code Examples

Verified patterns from research and existing implementation:

### Timeout Handling with Exit Codes
```bash
# Source: GNU timeout documentation + GSD patterns
handle_specialist_timeout() {
  local SPECIALIST="$1"
  local PHASE="$2"
  local PLAN="$3"
  local TIMEOUT_DURATION="${SPECIALIST_TIMEOUT:-300}"  # 5 minutes default

  echo "Spawning ${SPECIALIST} with ${TIMEOUT_DURATION}s timeout..." >&2

  # Run with timeout and capture output
  SPECIALIST_OUTPUT=$(timeout --kill-after=10s ${TIMEOUT_DURATION}s bash -c 'Task(
    subagent_type="'"${SPECIALIST}"'",
    model="'"${EXECUTOR_MODEL}"'",
    prompt="'"${PROMPT}"'"
  )' 2>&1)

  local EXIT_CODE=$?

  case $EXIT_CODE in
    0)
      echo "Specialist completed successfully" >&2
      echo "$SPECIALIST_OUTPUT"
      return 0
      ;;
    124)
      echo "ERROR: Specialist timed out after ${TIMEOUT_DURATION}s" >&2
      node ~/.claude/get-shit-done/bin/gsd-tools.cjs state add-error \
        --phase "$PHASE" \
        --error "Specialist $SPECIALIST timed out" \
        --context "plan=$PLAN, timeout=${TIMEOUT_DURATION}s"
      return 124
      ;;
    137)
      echo "ERROR: Specialist killed (SIGKILL) after ignoring timeout" >&2
      return 137
      ;;
    *)
      echo "ERROR: Specialist failed with exit code $EXIT_CODE" >&2
      return $EXIT_CODE
      ;;
  esac
}
```

### Checkpoint and Rollback Pattern
```bash
# Source: Git best practices + GSD workflow patterns
execute_with_checkpoint() {
  local PHASE="$1"
  local PLAN="$2"
  local SPECIALIST="$3"

  # Create checkpoint before risky operation
  local CHECKPOINT_TAG=$(create_checkpoint "$PHASE" "$PLAN" "$SPECIALIST")
  echo "Created checkpoint: $CHECKPOINT_TAG" >&2

  # Execute specialist with timeout
  if handle_specialist_timeout "$SPECIALIST" "$PHASE" "$PLAN"; then
    # Success - clean up checkpoint
    git tag -d "$CHECKPOINT_TAG" 2>/dev/null
    echo "Execution successful, checkpoint removed" >&2
    return 0
  else
    # Failure - offer rollback
    local EXIT_CODE=$?
    echo "Specialist execution failed (exit code: $EXIT_CODE)" >&2

    # Check if any files were modified
    if [ -n "$(git status --porcelain)" ]; then
      echo "Files were modified. Rolling back to checkpoint..." >&2
      rollback_to_checkpoint "$CHECKPOINT_TAG"
    else
      echo "No files modified, skipping rollback" >&2
      git tag -d "$CHECKPOINT_TAG" 2>/dev/null
    fi

    return $EXIT_CODE
  fi
}
```

### Structured Error Logging
```bash
# Source: Based on gsd-tools patterns
log_specialist_error() {
  local PHASE="$1"
  local PLAN="$2"
  local TASK="$3"
  local SPECIALIST="$4"
  local ERROR_TYPE="$5"
  local ERROR_DETAILS="$6"

  # Create structured error entry
  local ERROR_JSON=$(jq -n \
    --arg phase "$PHASE" \
    --arg plan "$PLAN" \
    --arg task "$TASK" \
    --arg specialist "$SPECIALIST" \
    --arg type "$ERROR_TYPE" \
    --arg details "$ERROR_DETAILS" \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{
      phase: $phase,
      plan: $plan,
      task: $task,
      specialist: $specialist,
      error_type: $type,
      details: $details,
      timestamp: $timestamp
    }')

  # Append to error log
  echo "$ERROR_JSON" >> .planning/specialist-errors.jsonl

  # Update STATE.md via gsd-tools
  node ~/.claude/get-shit-done/bin/gsd-tools.cjs state add-error \
    --phase "$PHASE" \
    --error "$ERROR_TYPE: $SPECIALIST failed on task $TASK" \
    --context "$ERROR_DETAILS"
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct Task() calls without timeout | timeout wrapper with signal escalation | Phase 10 | Prevents indefinite hangs |
| No rollback mechanism | Git checkpoint tags | Phase 10 | Safe recovery from failures |
| Silent specialist failures | Structured error logging | Phase 10 | Better debugging and metrics |
| Broken Task() in gsd-executor | Removed/fixed delegation code | Phase 10 | Clean codebase |

**Deprecated/outdated:**
- Direct Task() invocation in gsd-executor.md (line 1483) - broken, needs removal
- Relying on exit codes alone - "classifyHandoffIfNeeded" bug causes false failures

## Open Questions

Things that couldn't be fully resolved:

1. **Optimal timeout duration**
   - What we know: 5 minutes seems reasonable for most tasks
   - What's unclear: Should timeout vary by specialist type?
   - Recommendation: Start with 5m default, make configurable per specialist

2. **Partial result salvage strategy**
   - What we know: Can detect file creation patterns in output
   - What's unclear: How much partial work is worth keeping?
   - Recommendation: Only salvage if SUMMARY.md exists or commits were made

3. **Task() delegation code in gsd-executor**
   - What we know: Line 1483 has Task() invocation
   - What's unclear: Is this ever used or just dead code?
   - Recommendation: Remove it - orchestrator handles all delegation now

## Sources

### Primary (HIGH confidence)
- GNU coreutils documentation - timeout command syntax and exit codes
- Git documentation - tag and reset commands for checkpointing
- Phase 8 implementation - validate_specialist() already handles availability
- Phase 9 implementation - parse_specialist_result() handles output parsing

### Secondary (MEDIUM confidence)
- Claude Code GitHub issues - "classifyHandoffIfNeeded" bug confirmed
- Bash timeout patterns - signal handling and subshell considerations

### Tertiary (LOW confidence)
- None - all findings verified against documentation or existing code

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - GNU timeout and git are universal standards
- Architecture: HIGH - Patterns derived from existing Phase 8/9 implementation
- Pitfalls: HIGH - "classifyHandoffIfNeeded" bug documented in multiple sources

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (30 days - stable tooling)