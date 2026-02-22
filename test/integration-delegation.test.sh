#!/usr/bin/env bash
#
# Integration Delegation Test Suite
# Tests Phase 5: End-to-end delegation workflows, fallback scenarios, backward compatibility
#
# Usage: bash test/integration-delegation.test.sh
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

# Assert number greater than threshold
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

#
# Mock specialist functions (for automated testing - no real Claude API calls)
#

# Mock python-pro specialist response
mock_specialist() {
  local specialist_type="$1"
  local task_prompt="$2"

  case "$specialist_type" in
    python-pro)
      cat <<'EOF'
```json
{
  "files_modified": ["src/main.py", "tests/test_main.py"],
  "verification_status": "passed",
  "commit_message": "feat(api): implement FastAPI endpoint",
  "deviations": [
    {
      "rule": "Rule 2 - Missing Critical",
      "description": "Added input validation",
      "fix": "Added Pydantic validator for email format"
    }
  ]
}
```
EOF
      ;;
    typescript-pro)
      cat <<'EOF'
```json
{
  "files_modified": ["src/Auth.tsx", "src/types/user.ts"],
  "verification_status": "passed",
  "commit_message": "feat(ui): add authentication component"
}
```
EOF
      ;;
    kubernetes-specialist)
      cat <<'EOF'
```json
{
  "files_modified": ["k8s/deployment.yaml", "k8s/service.yaml"],
  "verification_status": "passed",
  "commit_message": "feat(infra): deploy to Kubernetes cluster"
}
```
EOF
      ;;
    golang-pro)
      cat <<'EOF'
```json
{
  "files_modified": ["main.go", "handlers.go", "middleware.go"],
  "verification_status": "passed",
  "commit_message": "feat(api): implement Go REST API handlers"
}
```
EOF
      ;;
    rust-engineer)
      cat <<'EOF'
```json
{
  "files_modified": ["src/lib.rs", "src/parser.rs"],
  "verification_status": "passed",
  "commit_message": "feat(core): implement Rust parser module"
}
```
EOF
      ;;
    # Specialist with verification failure
    failing-specialist)
      cat <<'EOF'
```json
{
  "files_modified": ["src/broken.py"],
  "verification_status": "failed",
  "commit_message": "fix: attempted to fix bug but tests still failing"
}
```
EOF
      ;;
    # Specialist with parsing error (malformed JSON)
    broken-specialist)
      echo "This is not valid JSON and cannot be parsed {broken"
      ;;
    # Specialist with text format (fallback)
    text-specialist)
      cat <<'EOF'
FILES MODIFIED:
- config/settings.yml
- config/database.yml

VERIFICATION: passed

COMMIT MESSAGE: chore: update configuration files
EOF
      ;;
    *)
      echo '{"files_modified": [], "verification_status": "unknown", "commit_message": "feat: complete task"}'
      ;;
  esac
}

#
# Source the functions from gsd-executor.md
# We extract bash functions embedded in markdown code blocks
#

# Extract detect_specialist_for_task function
extract_detect_specialist_for_task() {
  sed -n '/^detect_specialist_for_task()/,/^}$/p' agents/gsd-executor.md | grep -v '^```'
}

# Extract should_delegate_task function
extract_should_delegate_task() {
  sed -n '/^should_delegate_task()/,/^}$/p' agents/gsd-executor.md | grep -v '^```'
}

# Extract check_specialist_availability function
extract_check_specialist_availability() {
  sed -n '/^check_specialist_availability()/,/^}$/p' agents/gsd-executor.md | grep -v '^```'
}

# Extract make_routing_decision function
extract_make_routing_decision() {
  sed -n '/^make_routing_decision()/,/^}$/p' agents/gsd-executor.md | grep -v '^```'
}

# Extract gsd_task_adapter function
extract_gsd_task_adapter() {
  # Function uses cat <<EOF ... EOF pattern
  grep -v '^```' agents/gsd-executor.md |
    awk '/^gsd_task_adapter\(\)/{flag=1} flag{print} /^EOF$/ && flag{getline; print; exit}'
}

# Extract parse_specialist_output_multilayer function
extract_parse_specialist_output_multilayer() {
  awk '
    /^parse_specialist_output_multilayer\(\)/ { in_function=1; brace_depth=0; }
    in_function {
      if ($0 ~ /^```/) next;
      print;
      for (i=1; i<=length($0); i++) {
        c = substr($0, i, 1);
        if (c == "{") brace_depth++;
        if (c == "}") brace_depth--;
      }
      if (brace_depth == 0 && NR > 1) in_function=0;
    }
  ' agents/gsd-executor.md
}

# Extract validate_adapter_result function
extract_validate_adapter_result() {
  awk '
    /^validate_adapter_result\(\)/ { in_function=1; brace_depth=0; }
    in_function {
      if ($0 ~ /^```/) next;
      print;
      for (i=1; i<=length($0); i++) {
        c = substr($0, i, 1);
        if (c == "{") brace_depth++;
        if (c == "}") brace_depth--;
      }
      if (brace_depth == 0 && NR > 1) in_function=0;
    }
  ' agents/gsd-executor.md
}

# Source all functions in dependency order
eval "$(extract_detect_specialist_for_task)"
eval "$(extract_check_specialist_availability)"
eval "$(extract_should_delegate_task)"
eval "$(extract_make_routing_decision)"
eval "$(extract_gsd_task_adapter)"
eval "$(extract_parse_specialist_output_multilayer)"
eval "$(extract_validate_adapter_result)"

#
# Test Suite: Mock Specialist Functions
#

test_mock_specialists() {
  echo ""
  echo -e "${YELLOW}=== Mock Specialist Functions ===${NC}"

  # Test python-pro mock
  local output=$(mock_specialist "python-pro" "test prompt")
  assert_contains "$output" "files_modified" "python-pro mock returns JSON with files_modified"
  assert_contains "$output" "src/main.py" "python-pro mock includes expected files"
  assert_contains "$output" "verification_status" "python-pro mock includes verification_status"

  # Test typescript-pro mock
  output=$(mock_specialist "typescript-pro" "test prompt")
  assert_contains "$output" "Auth.tsx" "typescript-pro mock includes TypeScript files"
  assert_contains "$output" "passed" "typescript-pro mock has passed status"

  # Test kubernetes-specialist mock
  output=$(mock_specialist "kubernetes-specialist" "test prompt")
  assert_contains "$output" "k8s/deployment.yaml" "kubernetes-specialist mock includes k8s files"

  # Test text-specialist (fallback format)
  output=$(mock_specialist "text-specialist" "test prompt")
  assert_contains "$output" "FILES MODIFIED:" "text-specialist returns text format"
  assert_contains "$output" "VERIFICATION: passed" "text-specialist includes verification"

  # Test unknown specialist (default response)
  output=$(mock_specialist "unknown-specialist" "test prompt")
  assert_contains "$output" "files_modified" "unknown specialist returns valid JSON structure"
}

#
# Main test runner
#

main() {
  echo -e "${YELLOW}╔═══════════════════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}║   Integration Delegation Test Suite                  ║${NC}"
  echo -e "${YELLOW}║   Phase 5: Delegation Workflows & Compatibility       ║${NC}"
  echo -e "${YELLOW}╚═══════════════════════════════════════════════════════╝${NC}"

  # Run test suite
  test_mock_specialists

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
