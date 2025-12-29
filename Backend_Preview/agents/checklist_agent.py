from __future__ import annotations

import os
import sys

# Suppress GRPC/Abseil warnings
os.environ["GRPC_VERBOSITY"] = "NONE"
os.environ["GLOG_minloglevel"] = "2"

import json
import traceback
from typing import Any, Dict, Optional
from datetime import datetime

from agents.base_agent import BaseAgent, AgentResponse, AgentStatus

try:
    from supabase import create_client, Client
except ImportError:
    raise ImportError("Install supabase: pip install supabase")

try:
    from dotenv import load_dotenv
except ImportError:
    raise ImportError("Install python-dotenv: pip install python-dotenv")

try:
    import google.generativeai as genai
except ImportError:
    raise ImportError("Install google-generativeai: pip install google-generativeai")


class ChecklistAgent(BaseAgent):
    """
    Checklist Agent - Manages todos, checklists, and subtasks in Supabase based on natural language input.
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(
            name="Checklist Agent",
            description="Manages todos, checklists, and subtasks in Supabase",
            config=config
        )
        
        # Load environment variables
        load_dotenv()
        
        self.url = os.getenv("VITE_SUPABASE_URL")
        self.key = os.getenv("VITE_SUPABASE_ANON_KEY")
        
        if not self.url or not self.key:
            self.url = self.url or os.getenv("SUPABASE_URL")
            self.key = self.key or os.getenv("SUPABASE_KEY")

        # Initialize Gemini
        self.gemini_api_key = os.getenv("GEMINI_API_KEY")
        if self.gemini_api_key:
            genai.configure(api_key=self.gemini_api_key)
            self.model = genai.GenerativeModel('gemini-2.0-flash')
        else:
            print("Warning: GEMINI_API_KEY not found. Chat functionality will be disabled.")
            self.model = None

    def _get_client(self) -> Client:
        """Helper to establish Supabase client."""
        # Prefer Service Role Key for backend operations to bypass RLS
        service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if service_key:
            return create_client(self.url, service_key)

        if not self.url or not self.key:
            raise ValueError("Supabase URL and Key not found in environment variables.")
        return create_client(self.url, self.key)

    def get_user_id(self, username: str) -> Optional[str]:
        """Fetch user_id for a given username."""
        try:
            client = self._get_client()
            response = client.table("user_details").select("id").eq("username", username).execute()
            if response.data and len(response.data) > 0:
                return response.data[0]["id"]
            return None
        except Exception as e:
            print(f"Error fetching user: {e}")
            return None

    def process(self, request: Dict[str, Any]) -> AgentResponse:
        """
        Process the request.
        Expected request: {"username": "...", "input": "..."}
        """
        self.status = AgentStatus.PROCESSING
        
        username = request.get("username")
        user_input = request.get("input")
        
        if not username:
            return AgentResponse(self.name, AgentStatus.ERROR, result=None, error="Username is required")
        
        user_id = self.get_user_id(username)
        if not user_id:
            return AgentResponse(self.name, AgentStatus.ERROR, result=None, error=f"User '{username}' not found")

        if not user_input:
             return AgentResponse(self.name, AgentStatus.SUCCESS, result={"message": f"Hello {username}, what's on your checklist?"})

        try:
            return self._handle_chat(user_id, user_input)
        except Exception as e:
            traceback.print_exc()
            self.status = AgentStatus.ERROR
            return AgentResponse(self.name, AgentStatus.ERROR, result=None, error=str(e))

    def _handle_chat(self, user_id: str, user_input: str) -> AgentResponse:
        """
        Analyze input with Gemini and insert into Supabase todos table.
        """
        # Get current time with day of week for better relative date understanding
        now = datetime.now()
        current_time_str = now.strftime("%A, %B %d, %Y %H:%M:%S")

        schema_desc = """
        Tables:
        - todos (user_id, text, completed, pinned, subtasks, created_at)
        """
        
        prompt = f"""
        You are a dedicated Checklist Assistant.
        Current Date and Time: {current_time_str}
        User ID: {user_id}
        Schema:
        {schema_desc}
        
        User Input: "{user_input}"
        
        Analyze the input. The user wants to manage their todos and checklists.
        
        CRITICAL INSTRUCTION FOR DATES:
        - Calculate all dates relative to 'Current Date and Time'.
        - 'tomorrow' = Current Date + 1 day.
        - 'next Friday' = The upcoming Friday.
        - Always return dates in ISO 8601 format (YYYY-MM-DDTHH:MM:SS).
        
        CRITICAL INSTRUCTION FOR UPDATES (PINNING):
        - If the user asks to "pin" a task or todo, you need to find the most recent or relevant todo and update it.
        - Since you can't easily search, assume the user refers to the last added todo if context implies it.
        - However, for this agent, we will support a generic "update_last" action for pinning.
        
        CRITICAL INSTRUCTION FOR TODOS:
        - If the user lists multiple related tasks (e.g., "Finish project: do A, do B, do C"), create ONE main Todo item (e.g., "Finish project") and put the details (A, B, C) into the 'subtasks' JSON column.
        - Only create separate Todo rows if the tasks are completely unrelated.
        - 'subtasks' format: A JSON array of objects. Each object must have:
          - "id": <current_timestamp_integer> (generate a unique random integer for each)
          - "text": <subtask description>
          - "completed": false
        - If no subtasks, use an empty list [].
        
        Return a JSON object with a key "actions" which is a LIST of action objects.
        
        Supported Action Types:
        1. "insert": Create new todo.
           - "table": "todos"
           - "data": {{ ... }}
        2. "update_last": Update the most recently created item for this user.
           - "table": "todos"
           - "data": {{ "pinned": true }}
        3. "delete": Delete a todo by matching the text.
           - "table": "todos"
           - "match_field": "text"
           - "match_value": "Exact Text to Delete"
        4. "delete_last": Delete the most recently created N todos.
           - "table": "todos"
           - "count": 1 (or more)
        5. "update_subtasks": Update subtasks status (completed/not completed).
           - "target": "last" (most recent), "all" (all todos), or "match" (specific todo by text)
           - "match_text": "Exact Todo Text" (required if target is "match")
           - "status": true (for done) or false (for not done)
           - "scope": "all" (all subtasks in the todo) - currently only "all" is supported for simplicity.
        6. "list": List todos and their subtasks.
           - "table": "todos"
           - "query": "Optional search text to filter by task name"
           - "status": "all" | "completed" | "pending" (optional, default "all")
           - "subtask_status": "all" | "completed" | "pending" (optional, default "all")

        Example structure (Creating a Todo with Subtasks):
        {{
            "actions": [
                {{
                    "type": "insert",
                    "table": "todos",
                    "data": {{ 
                        "text": "Finish Project Work", 
                        "subtasks": [
                            {{ "id": 1765734478364, "text": "Review pending tasks", "completed": false }},
                            {{ "id": 1765734478365, "text": "Submit files", "completed": false }}
                        ]
                    }}
                }}
            ],
            "confirmation_message": "I've added the task 'Finish Project Work' with 2 subtasks."
        }}
        
        Example structure (Completing subtasks for a specific task):
        {{
            "actions": [
                {{
                    "type": "update_subtasks",
                    "target": "match",
                    "match_text": "Project Kite",
                    "status": true,
                    "scope": "all"
                }}
            ],
            "confirmation_message": "I've marked all subtasks of 'Project Kite' as done."
        }}
        
        Example structure (Listing specific tasks):
        {{
            "actions": [
                {{
                    "type": "list",
                    "table": "todos",
                    "query": "Project Kite"
                }}
            ],
            "confirmation_message": "Here are the details for 'Project Kite':"
        }}
        
        Example structure (Listing pending tasks):
        {{
            "actions": [
                {{
                    "type": "list",
                    "table": "todos",
                    "status": "pending"
                }}
            ],
            "confirmation_message": "Here are your incomplete tasks:"
        }}

        Example structure (Listing all tasks):
        {{
            "actions": [
                {{
                    "type": "list",
                    "table": "todos"
                }}
            ],
            "confirmation_message": "Here are your current tasks:"
        }}
        
        If the input is just chat or unclear, return:
        {{
            "actions": [],
            "confirmation_message": "Generate a friendly and helpful response to the user's input."
        }}
        
        Return ONLY the JSON.
        """
        
        response = self.model.generate_content(prompt)
        
        try:
            text = response.text.strip()
            if text.startswith("```json"):
                text = text[7:-3]
            elif text.startswith("```"):
                text = text[3:-3]
            parsed = json.loads(text)
        except Exception as e:
            return AgentResponse(self.name, AgentStatus.ERROR, result=None, error=f"Failed to parse AI response: {e}")

        actions = parsed.get("actions", [])
        client = self._get_client()
        results = []
        
        for action in actions:
            if action.get("type") == "insert":
                table = action.get("table")
                if table != "todos": continue # Safety check
                
                data = action.get("data")
                data["user_id"] = user_id
                
                # Fix for subtasks not-null constraint
                if "subtasks" not in data or data.get("subtasks") is None:
                    data["subtasks"] = []
                elif isinstance(data["subtasks"], dict) and not data["subtasks"]:
                    data["subtasks"] = []
                
                try:
                    insert_response = client.table(table).insert(data).execute()
                    results.append(f"Added to {table}")
                except Exception as e:
                    error_msg = str(e)
                    if "42501" in error_msg or "row-level security" in error_msg:
                        return AgentResponse(
                            self.name,
                            AgentStatus.ERROR,
                            error="Permission denied (RLS policy). Please add 'SUPABASE_SERVICE_ROLE_KEY' to your .env file."
                        )
                    print(f"Error inserting into {table}: {e}")

            elif action.get("type") == "update_last":
                table = action.get("table")
                if table != "todos": continue
                
                data = action.get("data")
                
                try:
                    recent = client.table(table).select("id").eq("user_id", user_id).order("created_at", desc=True).limit(1).execute()
                    
                    if recent.data and len(recent.data) > 0:
                        item_id = recent.data[0]["id"]
                        client.table(table).update(data).eq("id", item_id).execute()
                        results.append(f"Updated latest {table}")
                    else:
                        results.append(f"No {table} found to update")
                except Exception as e:
                    print(f"Error updating {table}: {e}")

            elif action.get("type") == "delete":
                table = action.get("table")
                if table != "todos": continue
                
                match_field = action.get("match_field")
                match_value = action.get("match_value")
                
                try:
                    client.table(table).delete().eq("user_id", user_id).eq(match_field, match_value).execute()
                    results.append(f"Deleted from {table}")
                except Exception as e:
                    print(f"Error deleting from {table}: {e}")

            elif action.get("type") == "delete_last":
                table = action.get("table")
                if table != "todos": continue
                
                count = action.get("count", 1)
                
                try:
                    recent = client.table(table).select("id").eq("user_id", user_id).order("created_at", desc=True).limit(count).execute()
                    
                    if recent.data and len(recent.data) > 0:
                        ids_to_delete = [item["id"] for item in recent.data]
                        client.table(table).delete().in_("id", ids_to_delete).execute()
                        results.append(f"Deleted last {len(ids_to_delete)} from {table}")
                    else:
                        results.append(f"No {table} found to delete")
                except Exception as e:
                    print(f"Error deleting last {count} from {table}: {e}")

            elif action.get("type") == "update_subtasks":
                target = action.get("target")
                status = action.get("status", True)
                match_text = action.get("match_text")
                
                try:
                    query = client.table("todos").select("*").eq("user_id", user_id)
                    
                    if target == "last":
                        query = query.order("created_at", desc=True).limit(1)
                    elif target == "match" and match_text:
                        query = query.eq("text", match_text)
                    elif target == "all":
                        pass # No extra filter needed
                    else:
                        results.append(f"Invalid target: {target}")
                        continue

                    todos_response = query.execute()
                    todos = todos_response.data
                    
                    if todos:
                        updated_count = 0
                        for todo in todos:
                            subtasks = todo.get("subtasks", [])
                            if isinstance(subtasks, list):
                                updated_any = False
                                for task in subtasks:
                                    if isinstance(task, dict):
                                        task["completed"] = status
                                        updated_any = True
                                
                                if updated_any:
                                    client.table("todos").update({"subtasks": subtasks}).eq("id", todo["id"]).execute()
                                    updated_count += 1
                        
                        results.append(f"Updated subtasks for {updated_count} todo(s)")
                    else:
                        results.append("No matching todos found")
                except Exception as e:
                    print(f"Error updating subtasks: {e}")

            elif action.get("type") == "list":
                try:
                    query_text = action.get("query")
                    status_filter = action.get("status", "all")
                    subtask_filter = action.get("subtask_status", "all")
                    
                    db_query = client.table("todos").select("*").eq("user_id", user_id).order("created_at", desc=True)
                    
                    if query_text:
                        # Use ilike for case-insensitive partial match
                        db_query = db_query.ilike("text", f"%{query_text}%")
                    
                    if status_filter == "completed":
                        db_query = db_query.eq("completed", True)
                    elif status_filter == "pending":
                        db_query = db_query.eq("completed", False)
                    
                    todos = db_query.execute()
                    
                    if todos.data:
                        formatted_list = []
                        for t in todos.data:
                            status = "[x]" if t.get("completed") else "[ ]"
                            pinned = "📌 " if t.get("pinned") else ""
                            formatted_list.append(f"{pinned}{status} {t.get('text')}")
                            
                            subtasks = t.get("subtasks", [])
                            if isinstance(subtasks, list):
                                for s in subtasks:
                                    if isinstance(s, dict):
                                        s_completed = s.get("completed", False)
                                        
                                        # Filter subtasks based on subtask_filter
                                        if subtask_filter == "completed" and not s_completed:
                                            continue
                                        if subtask_filter == "pending" and s_completed:
                                            continue
                                            
                                        s_status = "[x]" if s_completed else "[ ]"
                                        formatted_list.append(f"    {s_status} {s.get('text')}")
                        
                        if formatted_list:
                            results.append("\n".join(formatted_list))
                        else:
                            results.append("No tasks found matching your criteria.")
                    else:
                        if query_text:
                            results.append(f"No tasks found matching '{query_text}'.")
                        else:
                            results.append("No todos found.")
                except Exception as e:
                    print(f"Error listing todos: {e}")
        
        return AgentResponse(
            self.name, 
            AgentStatus.SUCCESS, 
            result={
                "message": parsed.get("confirmation_message"),
                "details": results
            }
        )

if __name__ == "__main__":
    agent = ChecklistAgent()
    
    print("--- Checklist Agent ---")
    
    if len(sys.argv) > 1:
        username = sys.argv[1]
    else:
        username = input("Enter username: ").strip()
    
    # Verify user first
    user_id = agent.get_user_id(username)
    if not user_id:
        print(f"User '{username}' not found in database.")
        exit()
        
    print(f"Welcome, {username}! (User ID: {user_id})")
    print("Tell me what to add to your checklist (or 'exit').")
    
    while True:
        try:
            user_input = input("\n> ")
            if user_input.lower() in ['exit', 'quit']:
                break
                
            response = agent.process({"username": username, "input": user_input})
            
            if response.status == AgentStatus.SUCCESS:
                print(f"AI: {response.result['message']}")
                if response.result.get('details'):
                    for detail in response.result['details']:
                        print(detail)
            else:
                print(f"Error: {response.error}")
                
        except KeyboardInterrupt:
            break
