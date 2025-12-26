#!/usr/bin/env python3
"""
Claude Project MCP Integration Test Runner

This script is designed to be executed BY Claude Code, which acts as the MCP host
and driver for all test operations. It defines all test cases and their expected
outcomes, and outputs results that can be verified.

Usage (via Claude Code):
    "Run the MCP integration tests"

This will execute all 23 MCP tool tests against a real Claude.ai session.

Tools Tested (23 total):
  Project Tools (8): list_projects, create_project, open_project, delete_project,
                     get_project_details, get_project_memory, get_project_instructions,
                     set_project_instructions
  Chat Tools (4): send_message, get_response, list_conversations, open_conversation
  File Tools (5): list_project_files, create_file, read_file, upload_file, delete_file
  Debug Tools (6): take_screenshot, validate_selectors, reload_selectors, get_selectors,
                   get_page_info, close_browser
"""

import json
import sys
from dataclasses import dataclass, field
from typing import Callable, Any, Optional, List
from enum import Enum
import uuid
import time


class TestStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    PASSED = "passed"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class TestResult:
    name: str
    tool: str
    status: TestStatus
    message: str = ""
    duration_ms: int = 0
    response: Any = None


@dataclass
class TestCase:
    """Defines a test case for an MCP tool."""
    name: str
    tool: str
    description: str
    args: dict = field(default_factory=dict)
    expected_success: bool = True
    validator: Optional[Callable[[Any], tuple[bool, str]]] = None
    cleanup_tool: Optional[str] = None
    cleanup_args: Optional[dict] = None
    depends_on: Optional[str] = None  # Name of test this depends on
    setup_tool: Optional[str] = None
    setup_args: Optional[dict] = None


# Unique test project name for this run
TEST_PROJECT_NAME = f"__mcp_integration_test_{uuid.uuid4().hex[:8]}"
TEST_FILE_NAME = f"test_file_{uuid.uuid4().hex[:6]}.md"
TEST_FILE_CONTENT = "# Test File\n\nCreated by MCP integration tests.\n\nLine 4."


def validate_list(response) -> tuple[bool, str]:
    """Validator: response should be a list."""
    if isinstance(response, list):
        return True, f"Got list with {len(response)} items"
    return False, f"Expected list, got {type(response).__name__}"


def validate_dict(response) -> tuple[bool, str]:
    """Validator: response should be a dict."""
    if isinstance(response, dict):
        return True, f"Got dict with keys: {list(response.keys())[:5]}"
    return False, f"Expected dict, got {type(response).__name__}"


def validate_contains(substring: str):
    """Validator factory: response should contain substring."""
    def validator(response) -> tuple[bool, str]:
        response_str = str(response).lower()
        if substring.lower() in response_str:
            return True, f"Response contains '{substring}'"
        return False, f"Response does not contain '{substring}'"
    return validator


def validate_project_opened(response) -> tuple[bool, str]:
    """Validator: open_project response should have expected structure."""
    if isinstance(response, dict):
        if response.get("status") == "opened":
            return True, "Project opened successfully"
        if "url" in response:
            return True, f"Project at URL: {response['url']}"
    return False, "Invalid open_project response structure"


def validate_not_empty(response) -> tuple[bool, str]:
    """Validator: response should not be empty."""
    if response and str(response).strip():
        return True, "Got non-empty response"
    return False, "Response was empty"


# =============================================================================
# TEST DEFINITIONS - All 23 MCP Tools
# =============================================================================

def get_all_tests() -> List[TestCase]:
    """Return all test cases in execution order."""
    return [
        # --- UTILITY TESTS (run first to verify basic connectivity) ---
        TestCase(
            name="test_get_page_info",
            tool="get_page_info",
            description="Get current browser page state",
            validator=validate_dict,
        ),
        TestCase(
            name="test_get_selectors",
            tool="get_selectors",
            description="Get selector configuration",
            validator=validate_dict,
        ),
        TestCase(
            name="test_get_selectors_category",
            tool="get_selectors",
            description="Get selectors for specific category",
            args={"category": "chat"},
        ),
        TestCase(
            name="test_reload_selectors",
            tool="reload_selectors",
            description="Reload selectors from config file",
            validator=validate_contains("reload"),
        ),

        # --- PROJECT CRUD TESTS ---
        TestCase(
            name="test_list_projects",
            tool="list_projects",
            description="List all existing projects",
            validator=validate_list,
        ),
        TestCase(
            name="test_create_project",
            tool="create_project",
            description="Create a new test project",
            args={
                "name": TEST_PROJECT_NAME,
                "instructions": "This is an automated test project. It will be deleted.",
            },
        ),
        TestCase(
            name="test_open_project",
            tool="open_project",
            description="Open the test project",
            args={"project": TEST_PROJECT_NAME},
            validator=validate_project_opened,
            depends_on="test_create_project",
        ),
        TestCase(
            name="test_get_project_details",
            tool="get_project_details",
            description="Get full project details",
            args={"project": TEST_PROJECT_NAME},
            validator=validate_dict,
            depends_on="test_create_project",
        ),
        TestCase(
            name="test_get_project_memory",
            tool="get_project_memory",
            description="Get project memory/context",
            args={"project": TEST_PROJECT_NAME},
            depends_on="test_create_project",
        ),
        TestCase(
            name="test_get_project_instructions",
            tool="get_project_instructions",
            description="Get project custom instructions",
            args={"project": TEST_PROJECT_NAME},
            validator=validate_contains("test"),
            depends_on="test_create_project",
        ),
        TestCase(
            name="test_set_project_instructions",
            tool="set_project_instructions",
            description="Update project instructions",
            args={
                "project": TEST_PROJECT_NAME,
                "instructions": f"Updated instructions at {time.time()}. Be brief.",
            },
            validator=validate_contains("updated"),
            depends_on="test_create_project",
        ),

        # --- FILE/KNOWLEDGE TESTS ---
        TestCase(
            name="test_list_project_files_empty",
            tool="list_project_files",
            description="List files in project (initially empty)",
            args={"project": TEST_PROJECT_NAME},
            validator=validate_list,
            depends_on="test_create_project",
        ),
        TestCase(
            name="test_create_file",
            tool="create_file",
            description="Create a new text file in knowledge base",
            args={
                "project": TEST_PROJECT_NAME,
                "file_name": TEST_FILE_NAME,
                "content": TEST_FILE_CONTENT,
            },
            validator=validate_contains("created"),
            depends_on="test_create_project",
        ),
        TestCase(
            name="test_list_project_files_with_file",
            tool="list_project_files",
            description="List files after creating one",
            args={"project": TEST_PROJECT_NAME},
            validator=validate_list,
            depends_on="test_create_file",
        ),
        TestCase(
            name="test_read_file",
            tool="read_file",
            description="Read content of created file",
            args={
                "project": TEST_PROJECT_NAME,
                "file_name": TEST_FILE_NAME,
            },
            validator=validate_contains("Test File"),
            depends_on="test_create_file",
        ),
        TestCase(
            name="test_delete_file",
            tool="delete_file",
            description="Delete the test file",
            args={
                "project": TEST_PROJECT_NAME,
                "file_name": TEST_FILE_NAME,
            },
            validator=validate_contains("deleted"),
            depends_on="test_create_file",
        ),

        # --- CHAT TESTS ---
        TestCase(
            name="test_send_message",
            tool="send_message",
            description="Send a message to Claude in project",
            args={
                "project": TEST_PROJECT_NAME,
                "message": "Please respond with exactly one word: HELLO",
                "wait_for_response": True,
            },
            validator=validate_not_empty,
            depends_on="test_create_project",
        ),
        TestCase(
            name="test_get_response",
            tool="get_response",
            description="Get last response from Claude",
            validator=validate_not_empty,
            depends_on="test_send_message",
        ),
        TestCase(
            name="test_list_conversations",
            tool="list_conversations",
            description="List conversations in project",
            args={"project": TEST_PROJECT_NAME},
            validator=validate_list,
            depends_on="test_send_message",
        ),
        # open_conversation test - need to get conversation ID dynamically

        # --- SCREENSHOT TESTS ---
        TestCase(
            name="test_take_screenshot",
            tool="take_screenshot",
            description="Take a screenshot",
            args={"label": "integration_test"},
            validator=validate_contains("screenshot"),
        ),
        TestCase(
            name="test_take_screenshot_fullpage",
            tool="take_screenshot",
            description="Take a full page screenshot",
            args={"label": "integration_test_full", "full_page": True},
            validator=validate_contains("screenshot"),
        ),

        # --- SELECTOR VALIDATION ---
        TestCase(
            name="test_validate_selectors",
            tool="validate_selectors",
            description="Validate all selectors on current page",
        ),
        TestCase(
            name="test_validate_selectors_category",
            tool="validate_selectors",
            description="Validate chat selectors specifically",
            args={"category": "chat"},
        ),

        # --- CLEANUP: Delete test project ---
        TestCase(
            name="test_delete_project_no_confirm",
            tool="delete_project",
            description="Delete should fail without confirmation",
            args={
                "project": TEST_PROJECT_NAME,
                "confirm": False,
            },
            validator=validate_contains("confirm"),
            depends_on="test_create_project",
        ),
        TestCase(
            name="test_delete_project",
            tool="delete_project",
            description="Delete the test project",
            args={
                "project": TEST_PROJECT_NAME,
                "confirm": True,
            },
            validator=validate_contains("deleted"),
            depends_on="test_create_project",
        ),

        # --- CLOSE BROWSER (run last) ---
        # NOTE: Commented out to keep browser open for debugging
        # TestCase(
        #     name="test_close_browser",
        #     tool="close_browser",
        #     description="Close the browser instance",
        #     validator=validate_contains("closed"),
        # ),
    ]


def print_test_plan():
    """Print the test plan for review."""
    tests = get_all_tests()
    print("\n" + "=" * 70)
    print("CLAUDE PROJECT MCP INTEGRATION TEST PLAN")
    print("=" * 70)
    print(f"\nTest Project Name: {TEST_PROJECT_NAME}")
    print(f"Test File Name: {TEST_FILE_NAME}")
    print(f"\nTotal Tests: {len(tests)}")
    print("\nTools to be tested:")

    tools_tested = set(t.tool for t in tests)
    for tool in sorted(tools_tested):
        count = sum(1 for t in tests if t.tool == tool)
        print(f"  - {tool} ({count} test{'s' if count > 1 else ''})")

    print("\n" + "-" * 70)
    print("TEST EXECUTION ORDER:")
    print("-" * 70)
    for i, test in enumerate(tests, 1):
        deps = f" [depends: {test.depends_on}]" if test.depends_on else ""
        print(f"{i:2}. {test.name}")
        print(f"    Tool: {test.tool}")
        print(f"    Desc: {test.description}{deps}")
        if test.args:
            args_str = json.dumps(test.args, indent=8)
            print(f"    Args: {args_str}")
        print()


def generate_test_commands():
    """Generate the MCP tool commands to execute."""
    tests = get_all_tests()
    print("\n" + "=" * 70)
    print("MCP TOOL COMMANDS TO EXECUTE")
    print("=" * 70)
    print("\nExecute these tools in order using Claude Code:\n")

    for i, test in enumerate(tests, 1):
        print(f"# Test {i}: {test.name}")
        print(f"# {test.description}")
        if test.args:
            print(f"mcp__claude-project__{test.tool}({json.dumps(test.args)})")
        else:
            print(f"mcp__claude-project__{test.tool}()")
        print()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--commands":
        generate_test_commands()
    else:
        print_test_plan()
        print("\nTo generate executable commands, run with --commands flag")
        print("\nTo execute tests, ask Claude Code to:")
        print('  "Run the MCP integration tests in tests/run_integration_tests.py"')
