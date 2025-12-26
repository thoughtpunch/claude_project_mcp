"""
Pytest configuration and fixtures for Claude Project MCP integration tests.

These tests are designed to be run explicitly with Claude Code as the driver.
They test the full MCP server functionality against a real Claude.ai session.

Usage:
    pytest tests/ -v --run-integration

WARNING: These tests will create/modify/delete REAL projects on Claude.ai!
"""

import pytest
import subprocess
import json
import os
import sys
import asyncio
from typing import Generator, Any, Optional
from dataclasses import dataclass
from pathlib import Path
import time
import uuid


def pytest_addoption(parser):
    """Add custom command line options."""
    parser.addoption(
        "--run-integration",
        action="store_true",
        default=False,
        help="Run integration tests against real Claude.ai (requires authentication)",
    )
    parser.addoption(
        "--headed",
        action="store_true",
        default=False,
        help="Run browser in headed mode for debugging",
    )
    parser.addoption(
        "--slow-mo",
        type=int,
        default=0,
        help="Slow down browser actions by this many milliseconds",
    )
    parser.addoption(
        "--keep-project",
        action="store_true",
        default=False,
        help="Keep the test project after tests complete (for debugging)",
    )


def pytest_configure(config):
    """Configure custom markers."""
    config.addinivalue_line(
        "markers", "integration: mark test as integration test (requires --run-integration)"
    )


def pytest_collection_modifyitems(config, items):
    """Skip integration tests unless --run-integration is passed."""
    if config.getoption("--run-integration"):
        return

    skip_integration = pytest.mark.skip(reason="Need --run-integration option to run")
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip_integration)


@dataclass
class MCPResponse:
    """Represents a response from the MCP server."""
    success: bool
    content: Any
    error: Optional[str] = None


class MCPClient:
    """
    Client for communicating with the Claude Project MCP server.

    Uses subprocess to spawn the MCP server and communicate via stdio.
    """

    def __init__(self, headed: bool = False, slow_mo: int = 0):
        self.headed = headed
        self.slow_mo = slow_mo
        self.process: Optional[subprocess.Popen] = None
        self.request_id = 0
        self._started = False

    def start(self) -> None:
        """Start the MCP server process."""
        if self._started:
            return

        env = os.environ.copy()
        env["HEADED"] = "true" if self.headed else "false"
        if self.slow_mo:
            env["SLOW_MO"] = str(self.slow_mo)

        # Start the MCP server
        project_root = Path(__file__).parent.parent
        self.process = subprocess.Popen(
            ["npx", "tsx", "src/server.ts"],
            cwd=project_root,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            text=True,
            bufsize=1,
        )
        self._started = True

        # Give server time to initialize
        time.sleep(2)

    def stop(self) -> None:
        """Stop the MCP server process."""
        if self.process:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
            self.process = None
            self._started = False

    def _send_request(self, method: str, params: dict = None) -> dict:
        """Send a JSON-RPC request to the MCP server."""
        if not self.process or not self.process.stdin or not self.process.stdout:
            raise RuntimeError("MCP server not started")

        self.request_id += 1
        request = {
            "jsonrpc": "2.0",
            "id": self.request_id,
            "method": method,
            "params": params or {},
        }

        request_str = json.dumps(request) + "\n"
        self.process.stdin.write(request_str)
        self.process.stdin.flush()

        # Read response (with timeout handling)
        response_line = self.process.stdout.readline()
        if not response_line:
            raise RuntimeError("No response from MCP server")

        return json.loads(response_line)

    def call_tool(self, tool_name: str, arguments: dict = None, timeout: int = 120) -> MCPResponse:
        """
        Call an MCP tool and return the response.

        Args:
            tool_name: Name of the tool to call
            arguments: Arguments to pass to the tool
            timeout: Timeout in seconds (browser operations can be slow)

        Returns:
            MCPResponse with success status and content
        """
        try:
            response = self._send_request("tools/call", {
                "name": tool_name,
                "arguments": arguments or {},
            })

            if "error" in response:
                return MCPResponse(
                    success=False,
                    content=None,
                    error=response["error"].get("message", str(response["error"])),
                )

            result = response.get("result", {})
            content = result.get("content", [])

            # Extract text content
            if content and isinstance(content, list):
                text_content = next(
                    (c.get("text") for c in content if c.get("type") == "text"),
                    None
                )

                # Try to parse as JSON if possible
                if text_content:
                    try:
                        parsed = json.loads(text_content)
                        return MCPResponse(success=True, content=parsed)
                    except json.JSONDecodeError:
                        return MCPResponse(success=True, content=text_content)

            return MCPResponse(success=True, content=result)

        except Exception as e:
            return MCPResponse(success=False, content=None, error=str(e))

    def list_tools(self) -> list:
        """List all available tools from the MCP server."""
        response = self._send_request("tools/list")
        return response.get("result", {}).get("tools", [])


@pytest.fixture(scope="session")
def mcp_client(request) -> Generator[MCPClient, None, None]:
    """
    Session-scoped fixture providing an MCP client connected to the server.
    """
    headed = request.config.getoption("--headed")
    slow_mo = request.config.getoption("--slow-mo")

    client = MCPClient(headed=headed, slow_mo=slow_mo)
    client.start()

    yield client

    client.stop()


@pytest.fixture(scope="session")
def test_project_name() -> str:
    """Generate a unique test project name."""
    return f"__pytest_test_project_{uuid.uuid4().hex[:8]}"


@pytest.fixture(scope="session")
def test_project(mcp_client: MCPClient, test_project_name: str, request) -> Generator[dict, None, None]:
    """
    Session-scoped fixture that creates a test project and cleans it up after.

    Yields the created project info dict.
    """
    # Create the test project
    response = mcp_client.call_tool("create_project", {
        "name": test_project_name,
        "instructions": "This is an automated test project created by pytest. It should be deleted automatically.",
    })

    if not response.success:
        pytest.fail(f"Failed to create test project: {response.error}")

    project_info = response.content

    yield project_info

    # Cleanup: Delete the test project unless --keep-project is set
    if not request.config.getoption("--keep-project"):
        mcp_client.call_tool("delete_project", {
            "project": test_project_name,
            "confirm": True,
        })


@pytest.fixture
def temp_test_file(tmp_path) -> Path:
    """Create a temporary file for upload testing."""
    test_file = tmp_path / "test_upload.txt"
    test_file.write_text("This is test content for file upload testing.\nLine 2.\nLine 3.")
    return test_file
