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


class CalendarAgent(BaseAgent):
    """
    Calendar Agent - Manages events and schedules in Supabase based on natural language input.
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(
            name="Calendar Agent",
            description="Manages events, schedules, and appointments in Supabase",
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
             return AgentResponse(self.name, AgentStatus.SUCCESS, result={"message": f"Hello {username}, checking your calendar."})

        try:
            return self._handle_chat(user_id, user_input)
        except Exception as e:
            traceback.print_exc()
            self.status = AgentStatus.ERROR
            return AgentResponse(self.name, AgentStatus.ERROR, result=None, error=str(e))

    def _handle_chat(self, user_id: str, user_input: str) -> AgentResponse:
        """
        Analyze input with Gemini and insert into Supabase events table.
        """
        # Get current time with day of week for better relative date understanding
        now = datetime.now()
        current_time_str = now.strftime("%A, %B %d, %Y %H:%M:%S")

        schema_desc = """
        Tables:
        - events (user_id, title, start_time, end_time, all_day, description, location, color, created_at)
        """
        
        prompt = f"""
        You are a dedicated Calendar Assistant.
        Current Date and Time: {current_time_str}
        User ID: {user_id}
        Schema:
        {schema_desc}
        
        User Input: "{user_input}"
        
        Analyze the input. The user wants to manage their calendar events.
        
        CRITICAL INSTRUCTION FOR DATES:
        - Calculate all dates relative to 'Current Date and Time'.
        - 'tomorrow' = Current Date + 1 day.
        - 'next Friday' = The upcoming Friday.
        - Always return dates in ISO 8601 format (YYYY-MM-DDTHH:MM:SS).
        
        CRITICAL INSTRUCTION FOR EVENTS:
        - Extract 'title'.
        - Extract 'start_time' and 'end_time' (ISO format).
        - 'all_day' boolean.
        - 'description' (optional).
        - 'location' (optional) - Extract if mentioned.
        
        CRITICAL INSTRUCTION FOR COLORS:
        - The ONLY allowed colors are: ["sky", "amber", "orange", "emerald", "violet", "rose"].
        - Map user requests to the closest allowed color:
          - "red" -> "rose"
          - "blue" -> "sky"
          - "green" -> "emerald"
          - "yellow" -> "amber"
          - "purple" -> "violet"
        - If unsure or no match, default to "sky".

        CRITICAL INSTRUCTION FOR DESCRIPTIONS:
        - If the user asks to "add a description saying..." or "generate a description...", do not just copy their instruction.
        - Instead, GENERATE the actual content of the description based on their intent.
        
        Return a JSON object with a key "actions" which is a LIST of action objects.
        
        Supported Action Types:
        1. "insert": Create new event.
           - "table": "events"
           - "data": {{ ... }}
        2. "update": Update an existing event by matching the title.
           - "table": "events"
           - "match_field": "title"
           - "match_value": "Exact Title to Update"
           - "data": {{ "end_time": "...", "color": "..." }} (Only include fields to change)
        3. "delete": Delete an event by matching the title.
           - "table": "events"
           - "match_field": "title"
           - "match_value": "Exact Title to Delete"
        4. "delete_last": Delete the most recently created N events.
           - "table": "events"
           - "count": 1 (or more)

        Example structure (Creating an Event):
        {{
            "actions": [
                {{
                    "type": "insert",
                    "table": "events",
                    "data": {{ "title": "Project Deadline", "start_time": "...", "color": "rose", "location": "Office", "all_day": false }}
                }}
            ],
            "confirmation_message": "I've scheduled the 'Project Deadline' event."
        }}
        
        Example structure (Updating an Event):
        {{
            "actions": [
                {{
                    "type": "update",
                    "table": "events",
                    "match_field": "title",
                    "match_value": "Boss Incoming",
                    "data": {{ "end_time": "2025-12-22T11:00:00", "color": "sky" }}
                }}
            ],
            "confirmation_message": "I've extended 'Boss Incoming' to Dec 22nd and changed the color."
        }}
        
        Example structure (Deleting last 2 Events):
        {{
            "actions": [
                {{
                    "type": "delete_last",
                    "table": "events",
                    "count": 2
                }}
            ],
            "confirmation_message": "I've removed the last 2 events."
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
                if table != "events": continue # Safety check
                
                data = action.get("data")
                data["user_id"] = user_id
                
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

            elif action.get("type") == "update":
                table = action.get("table")
                if table != "events": continue
                
                match_field = action.get("match_field")
                match_value = action.get("match_value")
                data = action.get("data")
                
                try:
                    # Find the event first to get its ID (handling potential duplicates by taking the most recent)
                    existing = client.table(table).select("id").eq("user_id", user_id).eq(match_field, match_value).order("created_at", desc=True).limit(1).execute()
                    
                    if existing.data and len(existing.data) > 0:
                        event_id = existing.data[0]["id"]
                        client.table(table).update(data).eq("id", event_id).execute()
                        results.append(f"Updated event '{match_value}'")
                    else:
                        results.append(f"Event '{match_value}' not found")
                except Exception as e:
                    print(f"Error updating event: {e}")

            elif action.get("type") == "delete":
                table = action.get("table")
                if table != "events": continue
                
                match_field = action.get("match_field")
                match_value = action.get("match_value")
                
                try:
                    client.table(table).delete().eq("user_id", user_id).eq(match_field, match_value).execute()
                    results.append(f"Deleted from {table}")
                except Exception as e:
                    print(f"Error deleting from {table}: {e}")

            elif action.get("type") == "delete_last":
                table = action.get("table")
                if table != "events": continue
                
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
        
        # Extract event data for preview if an insert action was performed
        event_preview = None
        for action in actions:
            if action.get("type") == "insert" and action.get("table") == "events":
                event_data = action.get("data", {})
                event_preview = {
                    "title": event_data.get("title", "Untitled Event"),
                    "start_time": event_data.get("start_time", ""),
                    "end_time": event_data.get("end_time", ""),
                    "all_day": event_data.get("all_day", False),
                    "description": event_data.get("description", ""),
                    "location": event_data.get("location", ""),
                    "color": event_data.get("color", "sky")
                }
                break  # Only preview the first event
        
        return AgentResponse(
            self.name, 
            AgentStatus.SUCCESS, 
            result={
                "message": parsed.get("confirmation_message"),
                "details": results,
                "event_preview": event_preview
            }
        )

if __name__ == "__main__":
    agent = CalendarAgent()
    
    print("--- Calendar Agent ---")
    
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
    print("Tell me what to schedule (or 'exit').")
    
    while True:
        try:
            user_input = input("\n> ")
            if user_input.lower() in ['exit', 'quit']:
                break
                
            response = agent.process({"username": username, "input": user_input})
            
            if response.status == AgentStatus.SUCCESS:
                print(f"AI: {response.result['message']}")
            else:
                print(f"Error: {response.error}")
                
        except KeyboardInterrupt:
            break
