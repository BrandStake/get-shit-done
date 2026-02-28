# Unified Verification Template

Template for `.planning/phases/XX-name/{phase_num}-VERIFICATION.md` — unified phase verification combining structural and functional testing.

---

## File Template

```markdown
---
phase: XX-name
verified: YYYY-MM-DDTHH:MM:SSZ
status: passed | gaps_found | issues_found
mode: auto | manual

stage1:
  status: passed | gaps_found | skipped
  score: N/M must-haves verified
  truths_verified: N
  truths_total: M
  artifacts_verified: N
  artifacts_total: M
  key_links_verified: N
  key_links_total: M
  anti_patterns: N
  specialist_review:
    tier: 2
    specialists_run:
      - voltagent-qa-sec:code-reviewer
      - voltagent-qa-sec:qa-expert
    total_issues: N
    critical: N
    major: N
    minor: N
    verdict: passed | failed

stage2:
  status: passed | issues_found | skipped
  score: N/M tests passed
  tests_passed: N
  tests_failed: N
  tests_skipped: N
  tests_total: M

gaps:
  - truth: "Observable truth or test that failed"
    stage: 1 | 2
    status: failed
    reason: "Why it failed"
    severity: critical | major | minor | cosmetic
    artifacts:
      - path: "src/path/to/file.tsx"
        issue: "What's wrong"
    missing:
      - "Specific thing to add/fix"
    root_cause: ""      # Filled by diagnosis
    debug_session: ""   # Filled by diagnosis
---

# Phase {X}: {Name} Verification Report

**Phase Goal:** {goal from ROADMAP.md}
**Verified:** {timestamp}
**Status:** {status}
**Mode:** {auto | manual}

---

## Stage 1: Structural Verification

{If skipped: "Skipped via --skip-structural flag"}

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | {truth from must_haves} | ✓ VERIFIED | {what confirmed it} |
| 2 | {truth from must_haves} | ✗ FAILED | {what's wrong} |
| 3 | {truth from must_haves} | ? UNCERTAIN | {why can't verify} |

**Score:** {N}/{M} truths verified

### Required Artifacts

| Artifact | Status | L1 (Exists) | L2 (Substance) | L3 (Wired) |
|----------|--------|-------------|----------------|------------|
| `src/components/Chat.tsx` | ✓ VERIFIED | ✓ | ✓ | ✓ |
| `src/app/api/chat/route.ts` | ✗ STUB | ✓ | ✗ | - |
| `prisma/schema.prisma` | ⚠️ ORPHANED | ✓ | ✓ | ✗ |

**Artifacts:** {N}/{M} verified

### Key Links

| From | To | Via | Status | Evidence |
|------|-----|-----|--------|----------|
| Chat.tsx | /api/chat | fetch in useEffect | ✓ WIRED | Line 23: fetch() with response handling |
| ChatInput | /api/chat POST | onSubmit | ✗ NOT_WIRED | Handler only console.logs |

**Wiring:** {N}/{M} connections verified

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/api/chat/route.ts | 12 | `// TODO: implement` | ⚠️ Warning | Incomplete |
| src/components/Chat.tsx | 8 | `return null` | 🛑 Blocker | No render output |

**Anti-patterns:** {N} found ({blockers} blockers)

### Specialist Reviews

{If no specialists configured: "Specialist review not configured for this phase."}

#### Code Review (voltagent-qa-sec:code-reviewer)

| Severity | File | Line | Issue | Recommendation |
|----------|------|------|-------|----------------|
| minor | src/example.ts | 42 | Function too long | Extract helper |

#### QA Review (voltagent-qa-sec:qa-expert)

| Severity | File | Line | Issue | Recommendation |
|----------|------|------|-------|----------------|
| major | src/example.ts | - | Missing tests | Add unit tests |

**Specialist Summary:** {N} issues ({critical} critical, {major} major, {minor} minor)
**Verdict:** {passed | failed}

---

## Stage 2: Functional Verification (UAT)

{If skipped: "Skipped via --skip-functional flag or Stage 1 critical gaps"}

### Test Results

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 1 | Send a message | User types, clicks send, message appears | ✓ PASS | |
| 2 | View history | Existing messages display on load | ✗ FAIL | Shows empty until refresh |
| 3 | Delete message | Click delete removes from list | ⊘ SKIP | Feature not in scope |

**Score:** {N}/{M} tests passed

### Failed Test Details

{For each failed test:}

#### Test {N}: {name}
- **Expected:** {what should happen}
- **Actual:** {what user reported or automation found}
- **Severity:** {inferred severity}

---

## Summary

| Stage | Status | Score |
|-------|--------|-------|
| Stage 1: Structural | {passed/gaps_found/skipped} | {N/M} |
| Stage 2: Functional | {passed/issues_found/skipped} | {N/M} |
| **Overall** | **{status}** | |

---

## Gaps Found

{If no gaps: "No gaps found. Phase goal achieved."}

{If gaps found:}

### {N} gap(s) require attention:

#### Gap 1: {Truth/Test Name} (Stage {N})

- **Status:** {failed}
- **Severity:** {critical | major | minor}
- **Reason:** {why it failed}
- **Artifacts:**
  - `{path}`: {issue}
- **Missing:**
  - {what needs to be added}
- **Root Cause:** {filled after diagnosis}

---

## Human Verification Required

{If items need human testing:}

### 1. {Test Name}
- **Test:** {what to do}
- **Expected:** {what should happen}
- **Why human:** {can't verify programmatically}

---

## Verification Metadata

**Mode:** {auto | manual}
**Stage 1 duration:** {time}
**Stage 2 duration:** {time}
**Specialists run:** {list or none}
**Total issues:** {N} ({critical} critical, {major} major, {minor} minor)

---

*Verified: {timestamp}*
*Verifier: Claude (verify-work)*
```

---

## Status Values

- `passed` — Both stages pass, no gaps found
- `gaps_found` — Stage 1 structural issues (artifacts missing/stub/unwired)
- `issues_found` — Stage 2 functional issues (tests failed)

## Stage Status Values

- `passed` — All checks pass
- `gaps_found` / `issues_found` — Problems detected
- `skipped` — Stage skipped via flag or early exit

## Severity Levels

| Severity | Stage 1 Signal | Stage 2 Signal |
|----------|----------------|----------------|
| critical | Missing artifact, blocker anti-pattern | Crash, exception, unusable |
| major | Stub artifact, unwired link | Doesn't work, wrong behavior |
| minor | Orphaned artifact, warning anti-pattern | Works but..., slow, weird |
| cosmetic | Info-level anti-pattern | Visual issues |

## Gap Structure (YAML Frontmatter)

Gaps are structured for consumption by `/gsd:plan-phase --gaps`:

```yaml
gaps:
  - truth: "User can send a message"
    stage: 1
    status: failed
    reason: "API route returns stub response"
    severity: critical
    artifacts:
      - path: "src/app/api/chat/route.ts"
        issue: "POST returns { ok: true } instead of created message"
    missing:
      - "Wire prisma.message.create in POST handler"
      - "Return created message data"
    root_cause: ""      # Filled by diagnosis
    debug_session: ""   # Filled by diagnosis

  - truth: "Comment appears after submission"
    stage: 2
    status: failed
    reason: "User reported: works but doesn't show until refresh"
    severity: major
    artifacts:
      - path: "src/components/CommentList.tsx"
        issue: "useEffect missing dependency"
    missing:
      - "Add commentCount to useEffect dependency array"
    root_cause: "useEffect stale closure"
    debug_session: ".planning/debug/comment-refresh.md"
```

---

## Example (Passed)

```markdown
---
phase: 04-comments
verified: 2025-01-15T14:30:00Z
status: passed
mode: auto

stage1:
  status: passed
  score: 5/5 must-haves verified
  truths_verified: 5
  truths_total: 5
  artifacts_verified: 8
  artifacts_total: 8
  key_links_verified: 6
  key_links_total: 6
  anti_patterns: 0
  specialist_review:
    tier: 2
    specialists_run:
      - voltagent-qa-sec:code-reviewer
      - voltagent-qa-sec:qa-expert
    total_issues: 2
    critical: 0
    major: 0
    minor: 2
    verdict: passed

stage2:
  status: passed
  score: 6/6 tests passed
  tests_passed: 6
  tests_failed: 0
  tests_skipped: 0
  tests_total: 6

gaps: []
---

# Phase 4: Comments Verification Report

**Phase Goal:** Working comment system with threading and moderation
**Verified:** 2025-01-15T14:30:00Z
**Status:** passed
**Mode:** auto

...

## Summary

| Stage | Status | Score |
|-------|--------|-------|
| Stage 1: Structural | passed | 5/5 |
| Stage 2: Functional | passed | 6/6 |
| **Overall** | **passed** | |

No gaps found. Phase goal achieved.
```

---

## Example (Gaps Found)

```markdown
---
phase: 03-chat
verified: 2025-01-15T14:30:00Z
status: gaps_found
mode: auto

stage1:
  status: gaps_found
  score: 2/5 must-haves verified
  truths_verified: 2
  truths_total: 5
  artifacts_verified: 2
  artifacts_total: 4
  key_links_verified: 0
  key_links_total: 4
  anti_patterns: 3

stage2:
  status: skipped
  score: 0/0 tests passed
  tests_passed: 0
  tests_failed: 0
  tests_skipped: 0
  tests_total: 0

gaps:
  - truth: "User can see existing messages"
    stage: 1
    status: failed
    reason: "Component renders placeholder, not message data"
    severity: critical
    artifacts:
      - path: "src/components/Chat.tsx"
        issue: "Returns <div>Chat will be here</div>"
    missing:
      - "Implement actual message list rendering"
      - "Add useEffect to fetch messages"
---

# Phase 3: Chat Interface Verification Report

**Phase Goal:** Working chat interface where users can send and receive messages
**Verified:** 2025-01-15T14:30:00Z
**Status:** gaps_found
**Mode:** auto

## Stage 1: Structural Verification

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can see existing messages | ✗ FAILED | Component renders placeholder |
| 2 | User can type a message | ✓ VERIFIED | Input field with onChange |
| 3 | User can send a message | ✗ FAILED | onSubmit only console.logs |
| 4 | Sent message appears in list | ✗ FAILED | No state update after send |
| 5 | Messages persist | ? UNCERTAIN | Can't verify - send broken |

**Score:** 1/5 truths verified

...

## Stage 2: Functional Verification (UAT)

Skipped — Stage 1 critical gaps make functional testing meaningless.

## Summary

| Stage | Status | Score |
|-------|--------|-------|
| Stage 1: Structural | gaps_found | 2/5 |
| Stage 2: Functional | skipped | 0/0 |
| **Overall** | **gaps_found** | |

### 3 gap(s) require attention:

#### Gap 1: User can see existing messages (Stage 1)

- **Status:** failed
- **Severity:** critical
- **Reason:** Component renders placeholder, not message data
- **Artifacts:**
  - `src/components/Chat.tsx`: Returns placeholder div
- **Missing:**
  - Implement actual message list rendering
  - Add useEffect to fetch messages
```
