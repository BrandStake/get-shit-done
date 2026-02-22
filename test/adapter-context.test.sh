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
  sed -n '/^generate_gsd_rules_section()/,/^EOF$/p' agents/gsd-executor.md | grep -v '^```'
}

# Extract gsd_task_adapter function
extract_gsd_task_adapter() {
  sed -n '/^gsd_task_adapter()/,/^EOF$/p' agents/gsd-executor.md | grep -v '^```'
}

# Extract parse_specialist_output_multilayer function
extract_parse_specialist_output_multilayer() {
  sed -n '/^parse_specialist_output_multilayer()/,/^EOF$/p' agents/gsd-executor.md | grep -v '^```'
}

# Extract extract_deviations function
extract_extract_deviations() {
  sed -n '/^extract_deviations()/,/^}$/p' agents/gsd-executor.md | grep -v '^```'
}

# Extract validate_adapter_result function
extract_validate_adapter_result() {
  sed -n '/^validate_adapter_result()/,/^}$/p' agents/gsd-executor.md | grep -v '^```'
}

# Extract gsd_result_adapter function
extract_gsd_result_adapter() {
  sed -n '/^gsd_result_adapter()/,/^}$/p' agents/gsd-executor.md | grep -v '^```'
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
# Main test runner
#

main() {
  echo -e "${YELLOW}╔═══════════════════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}║   Adapter Context Translation Test Suite             ║${NC}"
  echo -e "${YELLOW}║   Phase 2: Context Pruning & GSD Rule Injection      ║${NC}"
  echo -e "${YELLOW}╚═══════════════════════════════════════════════════════╝${NC}"

  # Run all test suites
  test_context_pruning
  test_gsd_rule_injection

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
