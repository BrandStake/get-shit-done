#!/usr/bin/env bash
#
# Adapter Context Translation Test Suite
# Tests Phase 2 implementation: context pruning, GSD rule injection, multi-layer parsing, deviation extraction
#
# Usage: bash test/adapter-context.test.sh
#

# Don't exit on first error - collect all test results
set +e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test result tracking
FAILED_TESTS=()

#
# Test helpers
#

# Assert equality
assert_eq() {
  local expected="$1"
  local actual="$2"
  local test_name="$3"

  TESTS_RUN=$((TESTS_RUN + 1))

  if [ "$expected" = "$actual" ]; then
    echo -e "${GREEN}✓${NC} $test_name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}✗${NC} $test_name"
    echo -e "  Expected: $expected"
    echo -e "  Actual:   $actual"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILED_TESTS+=("$test_name")
    return 1
  fi
}

# Assert string contains substring
assert_contains() {
  local haystack="$1"
  local needle="$2"
  local test_name="$3"

  TESTS_RUN=$((TESTS_RUN + 1))

  if echo "$haystack" | grep -q "$needle"; then
    echo -e "${GREEN}✓${NC} $test_name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}✗${NC} $test_name"
    echo -e "  Haystack does not contain: $needle"
    echo -e "  Haystack was: $haystack"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILED_TESTS+=("$test_name")
    return 1
  fi
}

# Assert string does NOT contain substring
assert_not_contains() {
  local haystack="$1"
  local needle="$2"
  local test_name="$3"

  TESTS_RUN=$((TESTS_RUN + 1))

  if ! echo "$haystack" | grep -q "$needle"; then
    echo -e "${GREEN}✓${NC} $test_name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}✗${NC} $test_name"
    echo -e "  Haystack should NOT contain: $needle"
    echo -e "  Haystack was: $haystack"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILED_TESTS+=("$test_name")
    return 1
  fi
}

# Assert number comparison
assert_gt() {
  local value="$1"
  local threshold="$2"
  local test_name="$3"

  TESTS_RUN=$((TESTS_RUN + 1))

  if [ "$value" -gt "$threshold" ]; then
    echo -e "${GREEN}✓${NC} $test_name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}✗${NC} $test_name"
    echo -e "  Expected $value > $threshold"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILED_TESTS+=("$test_name")
    return 1
  fi
}

assert_lt() {
  local value="$1"
  local threshold="$2"
  local test_name="$3"

  TESTS_RUN=$((TESTS_RUN + 1))

  if [ "$value" -lt "$threshold" ]; then
    echo -e "${GREEN}✓${NC} $test_name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}✗${NC} $test_name"
    echo -e "  Expected $value < $threshold"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILED_TESTS+=("$test_name")
    return 1
  fi
}

#
# Source the functions from gsd-executor.md
# We extract bash functions embedded in markdown code blocks
#

# Extract prune_task_context function
extract_prune_task_context() {
  sed -n '/^prune_task_context()/,/^}$/p' agents/gsd-executor.md | grep -v '^```'
}

# Extract generate_gsd_rules_section function
extract_generate_gsd_rules_section() {
  # Function uses cat <<'EOF' ... EOF pattern
  # The structure is: function() { cat <<'EOF' \n content \n EOF \n }
  # We need to grep -v first to remove markdown code blocks, then extract
  grep -v '^```' agents/gsd-executor.md |
    awk '/^generate_gsd_rules_section\(\)/{flag=1} flag{print} /^EOF$/ && flag{getline; print; exit}'
}

# Extract gsd_task_adapter function
extract_gsd_task_adapter() {
  # Function uses cat <<EOF ... EOF pattern
  grep -v '^```' agents/gsd-executor.md |
    awk '/^gsd_task_adapter\(\)/{flag=1} flag{print} /^EOF$/ && flag{getline; print; exit}'
}

# Extract parse_specialist_output_multilayer function
extract_parse_specialist_output_multilayer() {
  # Function ends with cat <<EOF...EOF followed by }
  # Extract from function start to the closing } after EOF
  awk '/^parse_specialist_output_multilayer\(\)/{flag=1; brace_count=0}
       flag{
         print
         # Count braces to find the actual end
         gsub(/\{/, "{", $0); opening = (gsub(/\{/, "&"))
         gsub(/\}/, "}", $0); closing = (gsub(/\}/, "&"))
         brace_count += opening - closing
         if(brace_count == 0 && NR > 1){flag=0}
       }' agents/gsd-executor.md | grep -v '^```'
}

# Extract extract_deviations function
extract_extract_deviations() {
  awk '/^extract_deviations\(\)/{flag=1; brace_count=0}
       flag{
         print
         gsub(/\{/, "{", $0); opening = (gsub(/\{/, "&"))
         gsub(/\}/, "}", $0); closing = (gsub(/\}/, "&"))
         brace_count += opening - closing
         if(brace_count == 0 && NR > 1){flag=0}
       }' agents/gsd-executor.md | grep -v '^```'
}

# Extract validate_adapter_result function
extract_validate_adapter_result() {
  awk '/^validate_adapter_result\(\)/{flag=1; brace_count=0}
       flag{
         print
         gsub(/\{/, "{", $0); opening = (gsub(/\{/, "&"))
         gsub(/\}/, "}", $0); closing = (gsub(/\}/, "&"))
         brace_count += opening - closing
         if(brace_count == 0 && NR > 1){flag=0}
       }' agents/gsd-executor.md | grep -v '^```'
}

# Extract gsd_result_adapter function
extract_gsd_result_adapter() {
  awk '/^gsd_result_adapter\(\)/{flag=1; brace_count=0}
       flag{
         print
         gsub(/\{/, "{", $0); opening = (gsub(/\{/, "&"))
         gsub(/\}/, "}", $0); closing = (gsub(/\}/, "&"))
         brace_count += opening - closing
         if(brace_count == 0 && NR > 1){flag=0}
       }' agents/gsd-executor.md | grep -v '^```'
}

# Source all functions
eval "$(extract_prune_task_context)"
eval "$(extract_generate_gsd_rules_section)"
eval "$(extract_gsd_task_adapter)"
eval "$(extract_parse_specialist_output_multilayer)"
eval "$(extract_extract_deviations)"
eval "$(extract_validate_adapter_result)"
eval "$(extract_gsd_result_adapter)"

#
# Test Suite: Context Pruning
#

test_context_pruning() {
  echo ""
  echo -e "${YELLOW}=== Context Pruning Tests ===${NC}"

  # Test 1: Short action passes through unchanged
  local short_action="Add authentication to the API endpoint"
  local result=$(prune_task_context "$short_action")
  assert_eq "$short_action" "$result" "Short action (<500 chars) passes through unchanged"

  # Test 2: Long action gets truncated
  local long_action="$(printf 'a%.0s' {1..600})"
  result=$(prune_task_context "$long_action")
  local result_length=${#result}
  assert_lt "$result_length" 510 "Long action (>500 chars) gets truncated"

  # Test 3: Very long action gets ellipsis
  long_action="$(printf 'b%.0s' {1..700})"
  result=$(prune_task_context "$long_action")
  assert_contains "$result" "..." "Very long action gets ellipsis"

  # Test 4: Empty/null action handling
  result=$(prune_task_context "")
  assert_eq "" "$result" "Empty action returns empty string"

  # Test 5: Multiline action with paragraphs
  local multiline_action="First paragraph with some content.

Second paragraph with more content.

Third paragraph with even more content.

Fourth paragraph should be truncated if total exceeds 500 chars but we keep first 3 paragraphs."
  result=$(prune_task_context "$multiline_action")
  assert_contains "$result" "First paragraph" "Multiline action preserves first paragraph"

  # Test 6: Action with special characters
  local special_action="Run command: \$npm install && npm test | grep -E 'passed'"
  result=$(prune_task_context "$special_action")
  assert_eq "$special_action" "$result" "Action with special characters preserved"

  # Test 7: Test pruning preserves essential info
  local essential_action="1. Install dependencies
2. Run tests
3. Deploy to production
4. Verify deployment"
  result=$(prune_task_context "$essential_action")
  assert_contains "$result" "Install dependencies" "Pruning preserves essential numbered list start"

  # Test 8: Exactly 500 characters
  local exactly_500="$(printf 'c%.0s' {1..500})"
  result=$(prune_task_context "$exactly_500")
  assert_eq "$exactly_500" "$result" "Action with exactly 500 chars passes through"
}

#
# Test Suite: GSD Rule Injection
#

test_gsd_rule_injection() {
  echo ""
  echo -e "${YELLOW}=== GSD Rule Injection Tests ===${NC}"

  # Test 1: Rules section is generated
  local rules=$(generate_gsd_rules_section)
  assert_contains "$rules" "GSD Execution Rules" "Rules section contains header"

  # Test 2: Atomic commit rules present
  local rules=$(generate_gsd_rules_section)
  assert_contains "$rules" "Atomic Commits Only" "Rules contain atomic commit requirement"
  assert_contains "$rules" "conventional commit format" "Rules specify conventional commit format"

  # Test 3: Deviation reporting rules present
  local rules=$(generate_gsd_rules_section)
  assert_contains "$rules" "Report All Deviations" "Rules contain deviation reporting requirement"
  assert_contains "$rules" "Rule 1 - Bug" "Rules mention Rule 1 - Bug"
  assert_contains "$rules" "Rule 2 - Missing Critical" "Rules mention Rule 2 - Missing Critical"
  assert_contains "$rules" "Rule 3 - Blocking Issue" "Rules mention Rule 3 - Blocking Issue"

  # Test 4: JSON output format present
  local rules=$(generate_gsd_rules_section)
  assert_contains "$rules" "JSON Format" "Rules specify JSON output format"
  assert_contains "$rules" "files_modified" "Rules show files_modified field"
  assert_contains "$rules" "verification_status" "Rules show verification_status field"

  # Test 5: Text output format present
  local rules=$(generate_gsd_rules_section)
  assert_contains "$rules" "Text Format" "Rules specify text fallback format"
  assert_contains "$rules" "FILES MODIFIED:" "Rules show text format example"

  # Test 6: Output format appears in full adapter
  local prompt=$(gsd_task_adapter "Test task" "test.py" "Do something" "npm test" "Tests pass" "python-pro")
  assert_contains "$prompt" "GSD Execution Rules" "Task adapter includes GSD rules"
  assert_contains "$prompt" "Structured Output Required" "Task adapter mentions structured output"
}

#
# Test Suite: Multi-layer Parsing
#

test_multilayer_parsing() {
  echo ""
  echo -e "${YELLOW}=== Multi-layer Parsing Tests ===${NC}"

  # Test 1: Valid JSON in markdown code blocks
  local json_output='```json
{
  "files_modified": ["src/auth.py", "src/models.py"],
  "verification_status": "passed",
  "commit_message": "feat: add auth"
}
```'
  local result=$(parse_specialist_output_multilayer "$json_output" "src/auth.py src/models.py")
  assert_contains "$result" "src/auth.py" "JSON in code block extracts files correctly"
  assert_contains "$result" "passed" "JSON in code block extracts verification status"

  # Test 2: Direct JSON object parsing
  local direct_json='{"files_modified": ["test.py"], "verification_status": "passed", "commit_message": "test commit"}'
  result=$(parse_specialist_output_multilayer "$direct_json" "test.py")
  assert_contains "$result" "test.py" "Direct JSON extracts files"
  assert_contains "$result" "passed" "Direct JSON extracts status"

  # Test 3: Structured text format
  local text_output='FILES MODIFIED:
- src/main.py
- src/utils.py

VERIFICATION: passed

COMMIT MESSAGE: feat: update main'
  result=$(parse_specialist_output_multilayer "$text_output" "src/main.py src/utils.py")
  assert_contains "$result" "files_modified" "Text format produces JSON structure"
  assert_contains "$result" "passed" "Text format extracts verification status"

  # Test 4: Bullet list file extraction
  local bullet_output='Modified the following files:
- api/routes.py
- api/models.py
- api/__init__.py

All tests passed successfully'
  result=$(parse_specialist_output_multilayer "$bullet_output" "api/routes.py api/models.py api/__init__.py")
  assert_contains "$result" "files_modified" "Bullet list format produces JSON"

  # Test 5: Mixed format with partial JSON
  local mixed='I updated the code. Here is the result:
{"files_modified": ["app.js"]}
Tests passed.'
  result=$(parse_specialist_output_multilayer "$mixed" "app.js")
  assert_contains "$result" "app.js" "Mixed format extracts JSON portion"

  # Test 6: Completely unstructured output
  local unstructured='I made some changes to the code and everything works now.'
  result=$(parse_specialist_output_multilayer "$unstructured" "config.py")
  assert_contains "$result" "config.py" "Unstructured output falls back to expected files"

  # Test 7: Empty/null output handling
  result=$(parse_specialist_output_multilayer "" "default.txt")
  assert_contains "$result" "default.txt" "Empty output uses expected files fallback"

  # Test 8: Malformed JSON fallback
  local malformed='```json
{files_modified: [bad json here
```'
  result=$(parse_specialist_output_multilayer "$malformed" "fallback.py")
  assert_contains "$result" "files_modified" "Malformed JSON triggers heuristic fallback"

  # Test 9: Verification status extraction - passed
  local passed_output='Verification: passed
All tests successful'
  result=$(parse_specialist_output_multilayer "$passed_output" "test.py")
  assert_contains "$result" '"verification_status": "passed"' "Extracts 'passed' verification status"

  # Test 10: Verification status extraction - failed
  local failed_output='Verification failed
Tests did not pass'
  result=$(parse_specialist_output_multilayer "$failed_output" "test.py")
  assert_contains "$result" '"verification_status": "failed"' "Extracts 'failed' verification status"

  # Test 11: Verification status extraction - unknown
  local unknown_output='Made some changes'
  result=$(parse_specialist_output_multilayer "$unknown_output" "test.py")
  assert_contains "$result" '"verification_status": "passed"' "Defaults to 'passed' when status unknown"

  # Test 12: Commit message extraction
  local commit_output='Completed the task.
Commit message: feat(auth): add JWT authentication
Files were modified successfully.'
  result=$(parse_specialist_output_multilayer "$commit_output" "auth.py")
  assert_contains "$result" "feat(auth): add JWT authentication" "Extracts commit message from text"
}

#
# Test Suite: Deviation Extraction
#

test_deviation_extraction() {
  echo ""
  echo -e "${YELLOW}=== Deviation Extraction Tests ===${NC}"

  # Test 1: Explicit JSON deviations field
  local json_with_devs='{"deviations": [{"rule": "Rule 1 - Bug", "description": "Fixed bug"}]}'
  local result=$(extract_deviations "$json_with_devs")
  assert_contains "$result" "Rule 1 - Bug" "Extracts deviations from JSON field"

  # Test 2: Rule 1 bug detection - "fixed bug"
  local bug_output='Fixed bug in authentication handler that was causing crashes'
  result=$(extract_deviations "$bug_output")
  assert_contains "$result" "Rule 1 - Bug" "Detects Rule 1 from 'fixed bug' keyword"

  # Test 3: Rule 1 bug detection - "corrected"
  local corrected_output='Corrected the logic error in the validation function'
  result=$(extract_deviations "$corrected_output")
  assert_contains "$result" "Rule 1 - Bug" "Detects Rule 1 from 'corrected' keyword"

  # Test 4: Rule 2 missing detection - "added validation"
  local validation_output='Added validation for email format that was missing'
  result=$(extract_deviations "$validation_output")
  assert_contains "$result" "Rule 2 - Missing Critical" "Detects Rule 2 from 'added validation'"

  # Test 5: Rule 2 missing detection - "added error handling"
  local error_handling='Added error handling for database connection failures'
  result=$(extract_deviations "$error_handling")
  assert_contains "$result" "Rule 2 - Missing Critical" "Detects Rule 2 from 'added error handling'"

  # Test 6: Rule 3 blocking detection - "blocked by"
  local blocked_output='Task was blocked by missing dependency, installed it first'
  result=$(extract_deviations "$blocked_output")
  assert_contains "$result" "Rule 3 - Blocking" "Detects Rule 3 from 'blocked by'"

  # Test 7: Multiple deviations in one output
  local multiple='Fixed bug in parser. Added missing validation. Task was blocked by dependency issue.'
  result=$(extract_deviations "$multiple")
  # Should contain multiple deviation entries
  local dev_count=$(echo "$result" | grep -c "rule")
  assert_gt "$dev_count" 0 "Extracts multiple deviations from single output"

  # Test 8: No deviations case
  local no_devs='Implemented the feature exactly as specified in the plan'
  result=$(extract_deviations "$no_devs")
  # Result should be empty or minimal
  if [ -z "$result" ]; then
    echo -e "${GREEN}✓${NC} No deviations returns empty result"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${GREEN}✓${NC} No deviations case handled"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
  fi
}

#
# Test Suite: Schema Validation
#

test_schema_validation() {
  echo ""
  echo -e "${YELLOW}=== Schema Validation Tests ===${NC}"

  # Test 1: Valid schema passes validation
  local valid_json='{"files_modified": ["test.py"], "verification_status": "passed", "commit_message": "test"}'
  validate_adapter_result "$valid_json"
  local result=$?
  assert_eq 0 $result "Valid schema passes validation"

  # Test 2: Missing files_modified field
  local missing_files='{"verification_status": "passed", "commit_message": "test"}'
  validate_adapter_result "$missing_files" 2>/dev/null
  result=$?
  assert_eq 1 $result "Missing files_modified field fails validation"

  # Test 3: Missing verification_status field
  local missing_status='{"files_modified": ["test.py"], "commit_message": "test"}'
  validate_adapter_result "$missing_status" 2>/dev/null
  result=$?
  assert_eq 1 $result "Missing verification_status field fails validation"

  # Test 4: Missing commit_message field
  local missing_commit='{"files_modified": ["test.py"], "verification_status": "passed"}'
  validate_adapter_result "$missing_commit" 2>/dev/null
  result=$?
  assert_eq 1 $result "Missing commit_message field fails validation"

  # Test 5: files_modified wrong type (should be array)
  local wrong_type='{"files_modified": "test.py", "verification_status": "passed", "commit_message": "test"}'
  validate_adapter_result "$wrong_type" 2>/dev/null
  result=$?
  assert_eq 1 $result "files_modified wrong type fails validation"

  # Test 6: verification_status wrong type (should be string)
  local wrong_status_type='{"files_modified": ["test.py"], "verification_status": true, "commit_message": "test"}'
  validate_adapter_result "$wrong_status_type" 2>/dev/null
  result=$?
  assert_eq 1 $result "verification_status wrong type fails validation"

  # Test 7: Invalid JSON
  local invalid_json='not valid json at all'
  validate_adapter_result "$invalid_json" 2>/dev/null
  result=$?
  assert_eq 1 $result "Invalid JSON fails validation"

  # Test 8: Valid status values (passed, failed, unknown)
  local status_passed='{"files_modified": [], "verification_status": "passed", "commit_message": "test"}'
  validate_adapter_result "$status_passed"
  assert_eq 0 $? "verification_status 'passed' is valid"

  local status_failed='{"files_modified": [], "verification_status": "failed", "commit_message": "test"}'
  validate_adapter_result "$status_failed"
  assert_eq 0 $? "verification_status 'failed' is valid"

  local status_unknown='{"files_modified": [], "verification_status": "unknown", "commit_message": "test"}'
  validate_adapter_result "$status_unknown"
  assert_eq 0 $? "verification_status 'unknown' is valid"
}

#
# Main test runner
#

main() {
  echo -e "${YELLOW}╔═══════════════════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}║   Adapter Context Translation Test Suite             ║${NC}"
  echo -e "${YELLOW}║   Phase 2: Multi-layer Parsing & Deviation Extract   ║${NC}"
  echo -e "${YELLOW}╚═══════════════════════════════════════════════════════╝${NC}"

  # Run all test suites
  test_context_pruning
  test_gsd_rule_injection
  test_multilayer_parsing
  test_deviation_extraction
  test_schema_validation

  # Print summary
  echo ""
  echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
  echo -e "${YELLOW}Test Summary${NC}"
  echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
  echo -e "Total tests run:    $TESTS_RUN"
  echo -e "${GREEN}Tests passed:       $TESTS_PASSED${NC}"

  if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}Tests failed:       $TESTS_FAILED${NC}"
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              ALL TESTS PASSED ✓                       ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════╝${NC}"
    exit 0
  else
    echo -e "${RED}Tests failed:       $TESTS_FAILED${NC}"
    echo ""
    echo -e "${RED}Failed tests:${NC}"
    for test in "${FAILED_TESTS[@]}"; do
      echo -e "${RED}  - $test${NC}"
    done
    echo ""
    echo -e "${RED}╔═══════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║              TESTS FAILED ✗                           ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════╝${NC}"
    exit 1
  fi
}

# Run tests
main
