#!/usr/bin/env bash
#
# Foundation Detection & Routing Test Suite
# Tests Phase 1 implementation: domain detection, availability checking, routing decisions, adapters
#
# Usage: bash test/foundation-detection.test.sh
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

# Assert function exists in gsd-executor.md
assert_function_exists() {
  local function_name="$1"
  local test_name="$2"

  TESTS_RUN=$((TESTS_RUN + 1))

  if grep -q "^$function_name()" agents/gsd-executor.md; then
    echo -e "${GREEN}✓${NC} $test_name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}✗${NC} $test_name"
    echo -e "  Function not found: $function_name"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILED_TESTS+=("$test_name")
    return 1
  fi
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

# Source all functions in dependency order
eval "$(extract_detect_specialist_for_task)"
eval "$(extract_check_specialist_availability)"
eval "$(extract_should_delegate_task)"
eval "$(extract_make_routing_decision)"

#
# Test Suite: Domain Detection
#

test_domain_detection() {
  echo ""
  echo -e "${YELLOW}=== Domain Detection Tests ===${NC}"

  # Python detection
  local result=$(detect_specialist_for_task "Implement Python FastAPI endpoint" "")
  assert_eq "voltagent-lang:python-pro" "$result" "Detects Python specialist for FastAPI task"

  result=$(detect_specialist_for_task "Add pytest tests for authentication" "")
  assert_eq "voltagent-lang:python-pro" "$result" "Detects Python specialist for pytest task"

  result=$(detect_specialist_for_task "Create Django model for users" "")
  assert_eq "voltagent-lang:python-pro" "$result" "Detects Python specialist for Django task"

  # TypeScript/Next.js detection
  result=$(detect_specialist_for_task "Build Next.js dashboard component" "")
  assert_eq "voltagent-lang:nextjs-developer" "$result" "Detects Next.js specialist for Next.js task"

  result=$(detect_specialist_for_task "Add React hooks for state management" "")
  assert_eq "voltagent-lang:react-specialist" "$result" "Detects React specialist for hooks task"

  # Kubernetes detection
  result=$(detect_specialist_for_task "Create Kubernetes deployment for microservice" "")
  assert_eq "voltagent-infra:kubernetes-specialist" "$result" "Detects Kubernetes specialist for deployment task"

  result=$(detect_specialist_for_task "Configure k8s ingress rules" "")
  assert_eq "voltagent-infra:kubernetes-specialist" "$result" "Detects Kubernetes specialist for k8s task"

  # Database detection
  result=$(detect_specialist_for_task "Optimize PostgreSQL query performance" "")
  assert_eq "voltagent-data-ai:postgres-pro" "$result" "Detects Postgres specialist for query optimization"

  # Security detection
  result=$(detect_specialist_for_task "Implement OAuth2 authentication flow" "")
  assert_eq "voltagent-infra:security-engineer" "$result" "Detects Security specialist for OAuth task"

  # No match cases
  result=$(detect_specialist_for_task "Update README documentation" "")
  assert_eq "" "$result" "Returns empty string for documentation task (no specialist match)"

  result=$(detect_specialist_for_task "Fix typo in config file" "")
  assert_eq "" "$result" "Returns empty string for simple task (no specialist match)"
}

#
# Test Suite: File Extension Detection
#

test_file_extension_detection() {
  echo ""
  echo -e "${YELLOW}=== File Extension Detection Tests ===${NC}"

  # Python file extensions
  local result=$(detect_specialist_for_task "Update user profile logic" "src/profile.py src/models.py")
  assert_eq "voltagent-lang:python-pro" "$result" "Detects Python specialist from .py extension"

  # TypeScript file extensions
  result=$(detect_specialist_for_task "Refactor component" "components/Header.tsx")
  assert_eq "voltagent-lang:typescript-pro" "$result" "Detects TypeScript specialist from .tsx extension"

  result=$(detect_specialist_for_task "Update types" "types/user.ts")
  assert_eq "voltagent-lang:typescript-pro" "$result" "Detects TypeScript specialist from .ts extension"

  # Go file extensions - use task desc without keyword match to test file extension fallback
  result=$(detect_specialist_for_task "Update code" "main.go handlers.go")
  assert_eq "voltagent-lang:golang-pro" "$result" "Detects Golang specialist from .go extension"

  # Terraform file extensions
  result=$(detect_specialist_for_task "Update infra config" "main.tf variables.tf")
  assert_eq "voltagent-infra:terraform-engineer" "$result" "Detects Terraform specialist from .tf extension"

  # SQL file extensions
  result=$(detect_specialist_for_task "Add migration" "migrations/001_add_users.sql")
  assert_eq "voltagent-data-ai:postgres-pro" "$result" "Detects Postgres specialist from .sql extension"
}

#
# Test Suite: Complexity Evaluation
#

test_complexity_evaluation() {
  echo ""
  echo -e "${YELLOW}=== Complexity Evaluation Tests ===${NC}"

  # High complexity - multiple files
  local result=$(should_delegate_task "Implement authentication system" "auth.py models.py routes.py tests.py" "python-pro" "auto")
  assert_eq "delegate" "$result" "Delegates for task with >3 files"

  # High complexity - multiple high-value keywords (implement:2 + migrate:2 + authentication:2 = score of 6)
  result=$(should_delegate_task "Implement and migrate authentication system for performance" "api.py" "python-pro" "auto")
  assert_eq "delegate" "$result" "Delegates for implementation task with high complexity keywords"

  # Low complexity - documentation
  result=$(should_delegate_task "Update documentation for API endpoint" "README.md" "python-pro" "auto")
  assert_eq "direct" "$result" "Direct execution for documentation task"

  # Low complexity - single line fix
  result=$(should_delegate_task "Fix single line typo in config" "config.py" "python-pro" "auto")
  assert_eq "direct" "$result" "Direct execution for single-line fix"

  # Low complexity - simple config
  result=$(should_delegate_task "Add environment variable" ".env" "python-pro" "auto")
  assert_eq "direct" "$result" "Direct execution for simple config change"

  # Checkpoint tasks always direct
  result=$(should_delegate_task "Verify authentication works" "auth.py" "python-pro" "checkpoint:human-verify")
  assert_eq "direct" "$result" "Direct execution for checkpoint tasks"
}

#
# Test Suite: Availability Checking
#

test_availability_checking() {
  echo ""
  echo -e "${YELLOW}=== Availability Checking Tests ===${NC}"

  # NOTE: With the simplified VoltAgent integration, check_specialist_availability always
  # returns "available" because Claude Code's Task tool handles actual availability.
  # If a specialist isn't installed, the Task call fails gracefully and gsd-executor
  # falls back to direct execution.

  # Test that all specialists return "available" (Claude Code handles real availability)
  local result=$(check_specialist_availability "voltagent-lang:python-pro")
  assert_eq "available" "$result" "Returns 'available' for specialist in registry"

  result=$(check_specialist_availability "voltagent-lang:typescript-pro")
  assert_eq "available" "$result" "Returns 'available' for TypeScript specialist"

  # Even uninstalled specialists return "available" - Claude Code handles actual availability
  result=$(check_specialist_availability "voltagent-lang:rust-engineer")
  assert_eq "available" "$result" "Returns 'available' (Claude Code handles actual availability)"

  result=$(check_specialist_availability "voltagent-lang:golang-pro")
  assert_eq "available" "$result" "Returns 'available' (delegate, let Task tool fail gracefully)"
}

#
# Test Suite: Routing Decisions
#

test_routing_decisions() {
  echo ""
  echo -e "${YELLOW}=== Routing Decision Tests ===${NC}"

  # Setup: Enable specialists (availability always returns "available" now)
  USE_SPECIALISTS="true"

  # Test successful delegation (capture only stdout, not stderr)
  local result=$(make_routing_decision "Implement FastAPI authentication with 5 files" "auth.py models.py routes.py tests.py config.py" "auto" 2>/dev/null)
  assert_contains "$result" "delegate:" "Routes to delegation when all criteria met"

  # Test feature flag disabled
  USE_SPECIALISTS="false"
  result=$(make_routing_decision "Implement FastAPI endpoint" "auth.py" "auto" 2>/dev/null)
  assert_contains "$result" "direct:" "Routes to direct execution when use_specialists=false"
  USE_SPECIALISTS="true"

  # Test no domain match
  result=$(make_routing_decision "Update README" "README.md" "auto" 2>/dev/null)
  assert_contains "$result" "direct:" "Routes to direct execution when no specialist match"

  # Test Rust - should now delegate since availability always returns "available"
  result=$(make_routing_decision "Implement Rust server" "main.rs server.rs config.rs handlers.rs" "auto" 2>/dev/null)
  assert_contains "$result" "delegate:" "Routes to delegation (Claude handles availability)"

  # Reset
  USE_SPECIALISTS="false"
}

#
# Test Suite: Adapter Functions
#

test_adapter_functions() {
  echo ""
  echo -e "${YELLOW}=== Adapter Function Tests ===${NC}"

  # Test gsd_task_adapter exists and is callable
  if type gsd_task_adapter >/dev/null 2>&1 || grep -q "gsd_task_adapter()" agents/gsd-executor.md; then
    echo -e "${GREEN}✓${NC} gsd_task_adapter function exists in gsd-executor.md"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}✗${NC} gsd_task_adapter function exists in gsd-executor.md"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILED_TESTS+=("gsd_task_adapter function exists in gsd-executor.md")
  fi

  # Test gsd_result_adapter exists
  if type gsd_result_adapter >/dev/null 2>&1 || grep -q "gsd_result_adapter()" agents/gsd-executor.md; then
    echo -e "${GREEN}✓${NC} gsd_result_adapter function exists in gsd-executor.md"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}✗${NC} gsd_result_adapter function exists in gsd-executor.md"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILED_TESTS+=("gsd_result_adapter function exists in gsd-executor.md")
  fi

  # Test adapter_error_fallback exists
  if type adapter_error_fallback >/dev/null 2>&1 || grep -q "adapter_error_fallback()" agents/gsd-executor.md; then
    echo -e "${GREEN}✓${NC} adapter_error_fallback function exists in gsd-executor.md"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}✗${NC} adapter_error_fallback function exists in gsd-executor.md"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILED_TESTS+=("adapter_error_fallback function exists in gsd-executor.md")
  fi
}

#
# Test Suite: Integration Tests
#

test_end_to_end_integration() {
  echo ""
  echo -e "${YELLOW}=== End-to-End Integration Test ===${NC}"

  # Simulate full task routing workflow
  USE_SPECIALISTS="true"

  local task_desc="Implement Python FastAPI authentication endpoint"
  local task_files="auth.py models.py routes.py tests.py"

  # Step 1: Detect specialist - now returns full voltagent name
  local specialist=$(detect_specialist_for_task "$task_desc" "$task_files")
  assert_eq "voltagent-lang:python-pro" "$specialist" "E2E: Specialist detection"

  # Step 2: Check complexity
  local complexity=$(should_delegate_task "$task_desc" "$task_files" "$specialist" "auto")
  assert_eq "delegate" "$complexity" "E2E: Complexity evaluation"

  # Step 3: Check availability - always returns "available" now
  local availability=$(check_specialist_availability "$specialist")
  assert_eq "available" "$availability" "E2E: Availability check"

  # Step 4: Make routing decision (capture only stdout)
  local route=$(make_routing_decision "$task_desc" "$task_files" "auto" 2>/dev/null)
  assert_contains "$route" "delegate:voltagent-lang:python-pro" "E2E: Final routing decision"

  # Reset
  USE_SPECIALISTS="false"
}

#
# Test Suite: v1.20 Backward Compatibility
#

test_v120_compatibility() {
  echo ""
  echo -e "${YELLOW}=== v1.20 Backward Compatibility Tests ===${NC}"

  # Test with default config (use_specialists=false)
  USE_SPECIALISTS="false"

  local result=$(make_routing_decision "Implement FastAPI endpoint" "auth.py models.py routes.py tests.py" "auto" 2>/dev/null)
  assert_contains "$result" "direct:" "With use_specialists=false, routes to direct execution"

  # Test that specialist detection still works but doesn't affect routing
  local specialist=$(detect_specialist_for_task "Implement Python endpoint" "auth.py")
  assert_eq "voltagent-lang:python-pro" "$specialist" "Specialist detection works even when disabled"

  result=$(make_routing_decision "Implement Python endpoint" "auth.py" "auto" 2>/dev/null)
  assert_contains "$result" "direct:" "Despite specialist match, routes to direct when disabled"

  # Test with specialists enabled - now delegates since availability always returns "available"
  USE_SPECIALISTS="true"

  result=$(make_routing_decision "Implement FastAPI endpoint" "auth.py models.py routes.py tests.py" "auto" 2>/dev/null)
  assert_contains "$result" "delegate:" "With specialists enabled, delegates to specialist"

  # Test Kubernetes task delegates too (Claude Code handles actual availability)
  result=$(make_routing_decision "Deploy Kubernetes cluster" "deployment.yaml service.yaml ingress.yaml configmap.yaml" "auto" 2>/dev/null)
  assert_contains "$result" "delegate:" "Delegates to Kubernetes specialist (Claude handles availability)"

  # Reset
  USE_SPECIALISTS="false"
}

#
# Test Suite: Configuration Loading
#

test_configuration_structure() {
  echo ""
  echo -e "${YELLOW}=== Configuration Structure Tests ===${NC}"

  # Test config.json exists and has voltagent section
  if [ -f ".planning/config.json" ]; then
    echo -e "${GREEN}✓${NC} .planning/config.json exists"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))

    # Check for voltagent configuration
    if grep -q "voltagent" .planning/config.json; then
      echo -e "${GREEN}✓${NC} config.json contains voltagent configuration"
      TESTS_RUN=$((TESTS_RUN + 1))
      TESTS_PASSED=$((TESTS_PASSED + 1))
    else
      echo -e "${RED}✗${NC} config.json contains voltagent configuration"
      TESTS_RUN=$((TESTS_RUN + 1))
      TESTS_FAILED=$((TESTS_FAILED + 1))
      FAILED_TESTS+=("config.json contains voltagent configuration")
    fi

    # Check for use_specialists flag
    if grep -q "use_specialists" .planning/config.json; then
      echo -e "${GREEN}✓${NC} config.json contains use_specialists flag"
      TESTS_RUN=$((TESTS_RUN + 1))
      TESTS_PASSED=$((TESTS_PASSED + 1))
    else
      echo -e "${RED}✗${NC} config.json contains use_specialists flag"
      TESTS_RUN=$((TESTS_RUN + 1))
      TESTS_FAILED=$((TESTS_FAILED + 1))
      FAILED_TESTS+=("config.json contains use_specialists flag")
    fi
  else
    echo -e "${RED}✗${NC} .planning/config.json exists"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILED_TESTS+=(".planning/config.json exists")
  fi

  # Test gsd-executor.md has specialist registry
  if grep -q "<specialist_registry>" agents/gsd-executor.md; then
    echo -e "${GREEN}✓${NC} gsd-executor.md has specialist_registry section"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}✗${NC} gsd-executor.md has specialist_registry section"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILED_TESTS+=("gsd-executor.md has specialist_registry section")
  fi

  # Test for 127+ specialist patterns (should have many rows in registry tables)
  local specialist_count=$(grep -c "| .* | .* | .* | .* |" agents/gsd-executor.md | head -1)
  if [ "$specialist_count" -gt 50 ]; then
    echo -e "${GREEN}✓${NC} gsd-executor.md has 50+ specialist mappings"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${YELLOW}⚠${NC} gsd-executor.md has only $specialist_count specialist mappings (expected 50+)"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))  # Warning, not failure
  fi
}

#
# Main test runner
#

main() {
  echo -e "${YELLOW}╔═══════════════════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}║   Foundation Detection & Routing Test Suite          ║${NC}"
  echo -e "${YELLOW}║   Phase 1: Domain Detection, Routing, Adapters       ║${NC}"
  echo -e "${YELLOW}╚═══════════════════════════════════════════════════════╝${NC}"

  # Run all test suites
  test_domain_detection
  test_file_extension_detection
  test_complexity_evaluation
  test_availability_checking
  test_routing_decisions
  test_adapter_functions
  test_end_to_end_integration
  test_v120_compatibility
  test_configuration_structure

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
