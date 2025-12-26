"""
Comprehensive integration tests for Claude Project MCP server.

This test suite covers ALL 23 MCP tools with real browser automation against Claude.ai.

Run with: pytest tests/test_mcp_integration.py -v --run-integration

Tools tested:
  Project Tools (8):
    - list_projects
    - create_project
    - open_project
    - delete_project
    - get_project_details
    - get_project_memory
    - get_project_instructions
    - set_project_instructions

  Chat Tools (4):
    - send_message
    - get_response
    - list_conversations
    - open_conversation

  File/Knowledge Tools (5):
    - list_project_files
    - create_file
    - read_file
    - upload_file
    - delete_file

  Debug/Utility Tools (6):
    - take_screenshot
    - validate_selectors
    - reload_selectors
    - get_selectors
    - get_page_info
    - close_browser
"""

import pytest
import time
import uuid
from pathlib import Path


# =============================================================================
# PROJECT TOOLS TESTS (8 tools)
# =============================================================================

@pytest.mark.integration
class TestProjectTools:
    """Tests for project CRUD operations."""

    def test_list_projects(self, mcp_client):
        """
        Test: list_projects
        Should return a list of existing projects.
        """
        response = mcp_client.call_tool("list_projects")

        assert response.success, f"list_projects failed: {response.error}"
        assert isinstance(response.content, list), "Expected list of projects"

        # Each project should have id, name, url
        if len(response.content) > 0:
            project = response.content[0]
            assert "id" in project, "Project should have 'id' field"
            assert "name" in project, "Project should have 'name' field"
            assert "url" in project, "Project should have 'url' field"

    def test_create_project(self, mcp_client):
        """
        Test: create_project
        Should create a new project and return its details.
        """
        unique_name = f"__pytest_create_test_{uuid.uuid4().hex[:8]}"

        response = mcp_client.call_tool("create_project", {
            "name": unique_name,
            "instructions": "Test instructions for pytest",
        })

        assert response.success, f"create_project failed: {response.error}"
        assert response.content is not None

        # Clean up: delete the created project
        mcp_client.call_tool("delete_project", {
            "project": unique_name,
            "confirm": True,
        })

    def test_open_project(self, mcp_client, test_project, test_project_name):
        """
        Test: open_project
        Should open an existing project and return its state.
        """
        response = mcp_client.call_tool("open_project", {
            "project": test_project_name,
        })

        assert response.success, f"open_project failed: {response.error}"
        assert isinstance(response.content, dict)
        assert response.content.get("status") == "opened"
        assert "url" in response.content
        assert "conversations" in response.content
        assert "files" in response.content

    def test_open_project_by_id(self, mcp_client, test_project):
        """
        Test: open_project (by ID)
        Should open a project using its UUID.
        """
        project_id = test_project.get("id") or test_project.get("projectId")
        if not project_id:
            pytest.skip("Test project doesn't have an ID")

        response = mcp_client.call_tool("open_project", {
            "project": project_id,
        })

        assert response.success, f"open_project by ID failed: {response.error}"

    def test_delete_project_requires_confirmation(self, mcp_client, test_project_name):
        """
        Test: delete_project (without confirmation)
        Should fail when confirm=false.
        """
        response = mcp_client.call_tool("delete_project", {
            "project": test_project_name,
            "confirm": False,
        })

        # Should return an error message, not actually delete
        assert response.success  # The call succeeds but with an error message
        assert "confirm" in str(response.content).lower() or "true" in str(response.content).lower()

    def test_get_project_details(self, mcp_client, test_project_name):
        """
        Test: get_project_details
        Should return comprehensive project information.
        """
        response = mcp_client.call_tool("get_project_details", {
            "project": test_project_name,
        })

        assert response.success, f"get_project_details failed: {response.error}"
        assert isinstance(response.content, dict)
        # Should have name, description, or other details
        # The exact structure depends on what's returned by the page

    def test_get_project_memory(self, mcp_client, test_project_name):
        """
        Test: get_project_memory
        Should return the project's memory/context content.
        """
        response = mcp_client.call_tool("get_project_memory", {
            "project": test_project_name,
        })

        assert response.success, f"get_project_memory failed: {response.error}"
        # Memory might be empty for a new project, that's OK

    def test_get_project_instructions(self, mcp_client, test_project_name):
        """
        Test: get_project_instructions
        Should return the project's custom instructions.
        """
        response = mcp_client.call_tool("get_project_instructions", {
            "project": test_project_name,
        })

        assert response.success, f"get_project_instructions failed: {response.error}"
        # Should contain the instructions we set during creation
        assert "pytest" in str(response.content).lower() or "test" in str(response.content).lower()

    def test_set_project_instructions(self, mcp_client, test_project_name):
        """
        Test: set_project_instructions
        Should update the project's custom instructions.
        """
        new_instructions = f"Updated instructions at {time.time()}"

        response = mcp_client.call_tool("set_project_instructions", {
            "project": test_project_name,
            "instructions": new_instructions,
        })

        assert response.success, f"set_project_instructions failed: {response.error}"
        assert "updated" in str(response.content).lower()

        # Verify the update
        verify_response = mcp_client.call_tool("get_project_instructions", {
            "project": test_project_name,
        })
        assert new_instructions in str(verify_response.content)


# =============================================================================
# FILE/KNOWLEDGE TOOLS TESTS (5 tools)
# =============================================================================

@pytest.mark.integration
class TestFileTools:
    """Tests for file/knowledge base operations."""

    def test_list_project_files_empty(self, mcp_client, test_project_name):
        """
        Test: list_project_files (on empty project)
        Should return empty list or list of files.
        """
        response = mcp_client.call_tool("list_project_files", {
            "project": test_project_name,
        })

        assert response.success, f"list_project_files failed: {response.error}"
        assert isinstance(response.content, list)

    def test_create_file(self, mcp_client, test_project_name):
        """
        Test: create_file
        Should create a new text file in the project's knowledge base.
        """
        file_name = f"test_file_{uuid.uuid4().hex[:8]}.md"
        file_content = "# Test File\n\nThis is test content created by pytest."

        response = mcp_client.call_tool("create_file", {
            "project": test_project_name,
            "file_name": file_name,
            "content": file_content,
        })

        assert response.success, f"create_file failed: {response.error}"
        assert "created" in str(response.content).lower()

        # Clean up
        mcp_client.call_tool("delete_file", {
            "project": test_project_name,
            "file_name": file_name,
        })

    def test_read_file(self, mcp_client, test_project_name):
        """
        Test: read_file
        Should read content of a file in the knowledge base.
        """
        # First create a file
        file_name = f"read_test_{uuid.uuid4().hex[:8]}.txt"
        expected_content = "Content to read back: pytest integration test"

        create_response = mcp_client.call_tool("create_file", {
            "project": test_project_name,
            "file_name": file_name,
            "content": expected_content,
        })
        assert create_response.success, f"Setup create_file failed: {create_response.error}"

        # Now read it back
        response = mcp_client.call_tool("read_file", {
            "project": test_project_name,
            "file_name": file_name,
        })

        assert response.success, f"read_file failed: {response.error}"
        # Content should contain what we wrote
        assert "pytest" in str(response.content).lower() or expected_content in str(response.content)

        # Clean up
        mcp_client.call_tool("delete_file", {
            "project": test_project_name,
            "file_name": file_name,
        })

    def test_upload_file(self, mcp_client, test_project_name, temp_test_file):
        """
        Test: upload_file
        Should upload a local file to the project's knowledge base.
        """
        response = mcp_client.call_tool("upload_file", {
            "project": test_project_name,
            "file_path": str(temp_test_file),
        })

        assert response.success, f"upload_file failed: {response.error}"
        assert "uploaded" in str(response.content).lower()

        # Clean up - delete the uploaded file
        mcp_client.call_tool("delete_file", {
            "project": test_project_name,
            "file_name": temp_test_file.name,
        })

    def test_delete_file(self, mcp_client, test_project_name):
        """
        Test: delete_file
        Should delete a file from the project's knowledge base.
        """
        # First create a file to delete
        file_name = f"delete_test_{uuid.uuid4().hex[:8]}.txt"

        create_response = mcp_client.call_tool("create_file", {
            "project": test_project_name,
            "file_name": file_name,
            "content": "File to be deleted",
        })
        assert create_response.success

        # Now delete it
        response = mcp_client.call_tool("delete_file", {
            "project": test_project_name,
            "file_name": file_name,
        })

        assert response.success, f"delete_file failed: {response.error}"
        assert "deleted" in str(response.content).lower()

    def test_list_project_files_after_create(self, mcp_client, test_project_name):
        """
        Test: list_project_files (after creating files)
        Should show the created file in the list.
        """
        file_name = f"list_test_{uuid.uuid4().hex[:8]}.md"

        # Create a file
        mcp_client.call_tool("create_file", {
            "project": test_project_name,
            "file_name": file_name,
            "content": "Test content",
        })

        # List files
        response = mcp_client.call_tool("list_project_files", {
            "project": test_project_name,
        })

        assert response.success
        assert isinstance(response.content, list)

        # Find our file in the list
        file_names = [f.get("name", f.get("filename", "")) for f in response.content]
        assert any(file_name in name for name in file_names), f"Created file not in list: {file_names}"

        # Clean up
        mcp_client.call_tool("delete_file", {
            "project": test_project_name,
            "file_name": file_name,
        })


# =============================================================================
# CHAT TOOLS TESTS (4 tools)
# =============================================================================

@pytest.mark.integration
class TestChatTools:
    """Tests for chat/conversation operations."""

    def test_send_message(self, mcp_client, test_project_name):
        """
        Test: send_message
        Should send a message and get a response from Claude.
        """
        response = mcp_client.call_tool("send_message", {
            "project": test_project_name,
            "message": "Please respond with exactly: PYTEST_OK",
            "wait_for_response": True,
        })

        assert response.success, f"send_message failed: {response.error}"
        # Should have gotten some response
        assert response.content is not None
        assert len(str(response.content)) > 0

    def test_send_message_no_wait(self, mcp_client, test_project_name):
        """
        Test: send_message (without waiting)
        Should send a message without waiting for response.
        """
        response = mcp_client.call_tool("send_message", {
            "project": test_project_name,
            "message": "This is a test message without waiting.",
            "wait_for_response": False,
        })

        assert response.success, f"send_message (no wait) failed: {response.error}"
        assert "sent" in str(response.content).lower()

    def test_get_response(self, mcp_client, test_project_name):
        """
        Test: get_response
        Should get the last response from Claude.
        """
        # First send a message
        mcp_client.call_tool("send_message", {
            "project": test_project_name,
            "message": "Say hello",
            "wait_for_response": True,
        })

        # Now get the response
        response = mcp_client.call_tool("get_response")

        assert response.success, f"get_response failed: {response.error}"
        # Should have some content
        assert response.content is not None

    def test_list_conversations(self, mcp_client, test_project_name):
        """
        Test: list_conversations
        Should list conversations in the project.
        """
        response = mcp_client.call_tool("list_conversations", {
            "project": test_project_name,
        })

        assert response.success, f"list_conversations failed: {response.error}"
        assert isinstance(response.content, list)

    def test_open_conversation(self, mcp_client, test_project_name):
        """
        Test: open_conversation
        Should open an existing conversation.
        """
        # First list conversations to get an ID
        list_response = mcp_client.call_tool("list_conversations", {
            "project": test_project_name,
        })

        if not list_response.success or not list_response.content:
            pytest.skip("No conversations available to open")

        conversations = list_response.content
        if len(conversations) == 0:
            pytest.skip("No conversations available to open")

        # Get first conversation ID
        conv = conversations[0]
        conv_id = conv.get("id") or conv.get("url", "").split("/")[-1]

        if not conv_id:
            pytest.skip("Could not extract conversation ID")

        response = mcp_client.call_tool("open_conversation", {
            "conversation_id": conv_id,
        })

        assert response.success, f"open_conversation failed: {response.error}"


# =============================================================================
# DEBUG/UTILITY TOOLS TESTS (6 tools)
# =============================================================================

@pytest.mark.integration
class TestDebugTools:
    """Tests for debug and utility operations."""

    def test_get_page_info(self, mcp_client):
        """
        Test: get_page_info
        Should return current page state information.
        """
        response = mcp_client.call_tool("get_page_info")

        assert response.success, f"get_page_info failed: {response.error}"
        assert isinstance(response.content, dict)
        assert "url" in response.content
        assert "title" in response.content
        assert "context" in response.content

    def test_take_screenshot(self, mcp_client, tmp_path):
        """
        Test: take_screenshot
        Should capture a screenshot of the current browser state.
        """
        response = mcp_client.call_tool("take_screenshot", {
            "label": "pytest_test",
        })

        assert response.success, f"take_screenshot failed: {response.error}"
        assert "screenshot" in str(response.content).lower() or "saved" in str(response.content).lower()

    def test_take_screenshot_full_page(self, mcp_client):
        """
        Test: take_screenshot (full page)
        Should capture a full page screenshot.
        """
        response = mcp_client.call_tool("take_screenshot", {
            "label": "pytest_fullpage",
            "full_page": True,
        })

        assert response.success, f"take_screenshot (full page) failed: {response.error}"
        assert "screenshot" in str(response.content).lower() or "saved" in str(response.content).lower()

    def test_get_selectors(self, mcp_client):
        """
        Test: get_selectors
        Should return the current selector configuration.
        """
        response = mcp_client.call_tool("get_selectors")

        assert response.success, f"get_selectors failed: {response.error}"
        assert isinstance(response.content, dict)

    def test_get_selectors_by_category(self, mcp_client):
        """
        Test: get_selectors (specific category)
        Should return selectors for a specific category.
        """
        response = mcp_client.call_tool("get_selectors", {
            "category": "chat",
        })

        assert response.success, f"get_selectors (category) failed: {response.error}"

    def test_reload_selectors(self, mcp_client):
        """
        Test: reload_selectors
        Should reload selectors from the config file.
        """
        response = mcp_client.call_tool("reload_selectors")

        assert response.success, f"reload_selectors failed: {response.error}"
        assert "reload" in str(response.content).lower()

    def test_validate_selectors(self, mcp_client, test_project_name):
        """
        Test: validate_selectors
        Should validate that selectors work on the current page.
        """
        # First open a project to have content on the page
        mcp_client.call_tool("open_project", {"project": test_project_name})

        response = mcp_client.call_tool("validate_selectors")

        assert response.success, f"validate_selectors failed: {response.error}"
        # Should return validation results

    def test_validate_selectors_by_category(self, mcp_client, test_project_name):
        """
        Test: validate_selectors (specific category)
        Should validate selectors for a specific category.
        """
        mcp_client.call_tool("open_project", {"project": test_project_name})

        response = mcp_client.call_tool("validate_selectors", {
            "category": "chat",
        })

        assert response.success, f"validate_selectors (category) failed: {response.error}"


# =============================================================================
# FULL WORKFLOW TEST
# =============================================================================

@pytest.mark.integration
class TestFullWorkflow:
    """
    End-to-end workflow test that exercises multiple tools in sequence.
    """

    def test_complete_project_lifecycle(self, mcp_client):
        """
        Test a complete project lifecycle:
        1. Create project
        2. Set instructions
        3. Create a file
        4. Send a message
        5. Get response
        6. List files and conversations
        7. Delete file
        8. Delete project
        """
        project_name = f"__pytest_lifecycle_{uuid.uuid4().hex[:8]}"

        try:
            # 1. Create project
            create_response = mcp_client.call_tool("create_project", {
                "name": project_name,
            })
            assert create_response.success, f"Step 1 (create) failed: {create_response.error}"

            # 2. Set instructions
            set_instructions_response = mcp_client.call_tool("set_project_instructions", {
                "project": project_name,
                "instructions": "You are a helpful test assistant. Always respond briefly.",
            })
            assert set_instructions_response.success, f"Step 2 (set_instructions) failed: {set_instructions_response.error}"

            # 3. Create a file
            file_name = "lifecycle_test.md"
            create_file_response = mcp_client.call_tool("create_file", {
                "project": project_name,
                "file_name": file_name,
                "content": "# Lifecycle Test\n\nThis is test content.",
            })
            assert create_file_response.success, f"Step 3 (create_file) failed: {create_file_response.error}"

            # 4. Send a message
            send_response = mcp_client.call_tool("send_message", {
                "project": project_name,
                "message": "What file do you have access to?",
                "wait_for_response": True,
            })
            assert send_response.success, f"Step 4 (send_message) failed: {send_response.error}"

            # 5. Get response
            get_response = mcp_client.call_tool("get_response")
            assert get_response.success, f"Step 5 (get_response) failed: {get_response.error}"

            # 6. List files and conversations
            list_files_response = mcp_client.call_tool("list_project_files", {
                "project": project_name,
            })
            assert list_files_response.success, f"Step 6a (list_files) failed: {list_files_response.error}"

            list_convs_response = mcp_client.call_tool("list_conversations", {
                "project": project_name,
            })
            assert list_convs_response.success, f"Step 6b (list_conversations) failed: {list_convs_response.error}"

            # 7. Delete file
            delete_file_response = mcp_client.call_tool("delete_file", {
                "project": project_name,
                "file_name": file_name,
            })
            assert delete_file_response.success, f"Step 7 (delete_file) failed: {delete_file_response.error}"

        finally:
            # 8. Delete project (cleanup)
            delete_response = mcp_client.call_tool("delete_project", {
                "project": project_name,
                "confirm": True,
            })
            # Don't assert here - we want cleanup to happen even if earlier steps failed


# =============================================================================
# CLOSE BROWSER TEST (must be last)
# =============================================================================

@pytest.mark.integration
class TestCloseBrowser:
    """
    Test for close_browser tool.
    NOTE: This should run LAST as it terminates the browser session.
    """

    @pytest.mark.order("last")
    def test_close_browser(self, mcp_client):
        """
        Test: close_browser
        Should close the browser instance.

        This test is marked to run last since it closes the browser.
        """
        response = mcp_client.call_tool("close_browser")

        assert response.success, f"close_browser failed: {response.error}"
        assert "closed" in str(response.content).lower()
