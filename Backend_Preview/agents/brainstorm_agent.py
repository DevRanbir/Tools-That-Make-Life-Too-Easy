from __future__ import annotations

import os
import json
from typing import Any, Dict, Optional, List
from pathlib import Path
from datetime import datetime

from agents.base_agent import BaseAgent, AgentResponse, AgentStatus

try:
    import google.generativeai as genai
except ImportError:
    raise ImportError("Install google-genai: pip install google-genai")

try:
    import requests
except ImportError:
    raise ImportError("Install requests: pip install requests")


class BrainstormAgent(BaseAgent):
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(
            name="Brainstorm Agent",
            description="Generates idea lists, quick wireframes, and creative prompts for new projects",
            config=config
        )
        
        self.gemini_api_key = self.config.get("gemini_api_key") or os.getenv("GEMINI_API_KEY")
        self.perplexity_api_key = self.config.get("perplexity_api_key") or os.getenv("PERPLEXITY_API_KEY")
        
        if not self.gemini_api_key:
            raise ValueError("GEMINI_API_KEY not found in config or environment")
        
        genai.configure(api_key=self.gemini_api_key)
        self.gemini_model = genai.GenerativeModel("gemini-2.0-flash-exp")
        
        self.output_dir = Path(self.config.get("output_dir", "outputs/brainstorm"))
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        self.sessions: Dict[str, Dict[str, Any]] = {}
    
    def process(self, request: Dict[str, Any]) -> AgentResponse:
        self.status = AgentStatus.PROCESSING
        
        try:
            action = request.get("action", "brainstorm")
            
            if action == "brainstorm":
                return self._brainstorm(request)
            elif action == "wireframe":
                return self._generate_wireframe(request)
            elif action == "ideas":
                return self._generate_ideas(request)
            elif action == "full":
                return self._full_brainstorm(request)
            elif action == "chat":
                return self._chat(request)
            elif action == "update_research":
                return self._update_research(request)
            elif action == "update_flowchart":
                return self._update_flowchart(request)
            elif action == "update_wireframe":
                return self._update_wireframe(request)
            else:
                raise ValueError(f"Unknown action: {action}")
                
        except Exception as exc:
            self.status = AgentStatus.ERROR
            return AgentResponse(
                agent_name=self.name,
                status=AgentStatus.ERROR,
                result=None,
                error=str(exc),
                metadata={"action": request.get("action", "unknown")}
            )
    
    def _brainstorm(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["topic"])
        
        topic = request["topic"]
        include_research = request.get("include_research", True)
        include_flowchart = request.get("include_flowchart", False)
        include_wireframe = request.get("include_wireframe", False)
        session_id = request.get("session_id", f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
        
        result = {
            "topic": topic,
            "ideas": [],
            "research": None,
            "flowchart": None,
            "wireframe": None
        }
        
        if include_research and self.perplexity_api_key:
            research_result = self._research_topic(topic)
            result["research"] = research_result
        
        ideas_result = self._generate_ideas_list(topic, result.get("research"))
        result["ideas"] = ideas_result
        
        if include_flowchart:
            flowchart_result = self._generate_flowchart_for_topic(topic, ideas_result)
            result["flowchart"] = flowchart_result
        
        if include_wireframe:
            wireframe_result = self._generate_wireframe_internal(topic, ideas_result)
            result["wireframe"] = wireframe_result
        
        self.sessions[session_id] = {
            "topic": topic,
            "ideas": ideas_result,
            "research": result["research"],
            "flowchart": result["flowchart"],
            "wireframe": result["wireframe"],
            "conversation": []
        }
        result["session_id"] = session_id
        
        self.status = AgentStatus.SUCCESS
        return AgentResponse(
            agent_name=self.name,
            status=AgentStatus.SUCCESS,
            result=result,
            metadata={
                "topic": topic,
                "session_id": session_id,
                "include_research": include_research,
                "include_flowchart": include_flowchart,
                "include_wireframe": include_wireframe
            }
        )
    
    def _full_brainstorm(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["topic"])
        
        topic = request["topic"]
        session_id = request.get("session_id", f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
        
        research_result = None
        if self.perplexity_api_key:
            research_result = self._research_topic(topic)
        
        ideas_result = self._generate_ideas_list(topic, research_result)
        flowchart_result = self._generate_flowchart_for_topic(topic, ideas_result)
        wireframe_result = self._generate_wireframe_internal(topic, ideas_result)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"brainstorm_{timestamp}"
        
        output_file = self.output_dir / f"{filename}.json"
        output_data = {
            "topic": topic,
            "timestamp": datetime.now().isoformat(),
            "research": research_result,
            "ideas": ideas_result,
            "flowchart": flowchart_result,
            "wireframe": wireframe_result
        }
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2)
        
        self.sessions[session_id] = {
            "topic": topic,
            "ideas": ideas_result,
            "research": research_result,
            "flowchart": flowchart_result,
            "wireframe": wireframe_result,
            "conversation": []
        }
        
        self.status = AgentStatus.SUCCESS
        return AgentResponse(
            agent_name=self.name,
            status=AgentStatus.SUCCESS,
            result={
                "topic": topic,
                "research": research_result,
                "ideas": ideas_result,
                "flowchart": flowchart_result,
                "wireframe": wireframe_result,
                "output_file": str(output_file),
                "session_id": session_id
            },
            metadata={"filename": filename, "session_id": session_id}
        )
    
    def _research_topic(self, topic: str) -> Dict[str, Any]:
        if not self.perplexity_api_key:
            return None
        
        url = "https://api.perplexity.ai/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.perplexity_api_key}",
            "Content-Type": "application/json"
        }
        
        system_prompt = """You are a research assistant helping with brainstorming. Provide:
- Current trends and best practices
- Key concepts and approaches
- Real-world examples and case studies
- Tools and technologies
- Common challenges and solutions

Keep it concise and actionable for brainstorming."""
        
        payload = {
            "model": "sonar",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Research topic for brainstorming: {topic}. Provide key insights, trends, and inspiration."}
            ],
            "max_tokens": 500,
            "temperature": 0.7,
            "return_citations": True
        }
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=60)
            if response.status_code == 200:
                data = response.json()
                content = data["choices"][0]["message"]["content"]
                citations = data.get("citations", [])
                return {
                    "content": content,
                    "citations": citations
                }
        except Exception as e:
            print(f"[BRAINSTORM] Research error: {e}")
        
        return None
    
    def _generate_ideas_list(self, topic: str, research: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        research_context = ""
        if research:
            research_context = f"\n\nRESEARCH CONTEXT:\n{research.get('content', '')[:500]}"
        
        prompt = f"""You are a creative brainstorming expert. Generate innovative ideas for: {topic}

{research_context}

Generate 10-15 creative, actionable ideas. For each idea, provide:
1. Idea name (short, catchy)
2. Brief description (1-2 sentences)
3. Key features (3-5 bullet points)
4. Potential challenges (2-3 points)
5. Implementation difficulty (Easy/Medium/Hard)

Format as JSON array:
[
  {{
    "name": "Idea Name",
    "description": "Brief description",
    "features": ["feature1", "feature2", "feature3"],
    "challenges": ["challenge1", "challenge2"],
    "difficulty": "Medium"
  }},
  ...
]

Return ONLY valid JSON, no markdown, no explanations."""
        
        try:
            response = self.gemini_model.generate_content(prompt)
            text = response.text.strip()
            
            if text.startswith('```json'):
                text = text.replace('```json', '').replace('```', '').strip()
            elif text.startswith('```'):
                text = text.replace('```', '').strip()
            
            ideas = json.loads(text)
            if not isinstance(ideas, list):
                ideas = [ideas]
            
            return ideas
        except Exception as e:
            print(f"[BRAINSTORM] Ideas generation error: {e}")
            return [
                {
                    "name": f"{topic} - Basic Approach",
                    "description": "A foundational approach to the topic",
                    "features": ["Core functionality", "User-friendly interface", "Scalable design"],
                    "challenges": ["Initial setup", "User adoption"],
                    "difficulty": "Medium"
                }
            ]
    
    def _generate_flowchart_for_topic(self, topic: str, ideas: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not ideas:
            return None
        
        main_idea = ideas[0] if ideas else {"name": topic}
        
        prompt = f"""Generate a Mermaid flowchart for: {topic}

Main idea: {main_idea.get('name', topic)}
Description: {main_idea.get('description', '')}

Create a flowchart showing the main process flow. Use valid Mermaid syntax.

SYNTAX RULES:
- Start with: flowchart TD
- Use unique node IDs
- Format: nodeID[Label] --> nextID[Label]
- For decisions: decisionID{{Question?}} -->|Yes| yesNode[Action]

Return ONLY the Mermaid code, no markdown, no explanations."""
        
        try:
            response = self.gemini_model.generate_content(prompt)
            mermaid_code = response.text.strip()
            
            if mermaid_code.startswith('```'):
                mermaid_code = mermaid_code.split('```')[1]
                if mermaid_code.startswith('mermaid'):
                    mermaid_code = mermaid_code.replace('mermaid', '').strip()
            
            if not mermaid_code.startswith('flowchart'):
                mermaid_code = f"flowchart TD\n{mermaid_code}"
            
            return {
                "mermaid_code": mermaid_code,
                "description": f"Process flow for {topic}"
            }
        except Exception as e:
            print(f"[BRAINSTORM] Flowchart error: {e}")
            return None
    
    def _generate_wireframe_internal(self, topic: str, ideas: List[Dict[str, Any]]) -> Dict[str, Any]:
        main_idea = ideas[0] if ideas else {"name": topic, "features": []}
        
        prompt = f"""Create an HTML wireframe for: {topic}

Main idea: {main_idea.get('name', topic)}
Key features: {', '.join(main_idea.get('features', [])[:5])}

Generate a complete HTML wireframe with:
- Modern, clean layout
- Responsive design
- Wireframe-style appearance (use borders, light backgrounds, placeholder text)
- Key sections: Header, Navigation, Main Content, Sidebar (if needed), Footer
- Use divs with borders to show layout structure
- Include placeholder text like "Logo", "Navigation", "Content Area", etc.
- Use CSS inline or in <style> tag
- Make it visually clear as a wireframe (gray borders, light backgrounds)

Return complete HTML document with <!DOCTYPE html>, <html>, <head>, <body> tags.
Include wireframe styling (borders, spacing, placeholder text)."""
        
        try:
            response = self.gemini_model.generate_content(prompt)
            html_code = response.text.strip()
            
            if html_code.startswith('```html'):
                html_code = html_code.replace('```html', '').replace('```', '').strip()
            elif html_code.startswith('```'):
                html_code = html_code.replace('```', '').strip()
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"wireframe_{timestamp}.html"
            wireframe_path = self.output_dir / filename
            
            with open(wireframe_path, 'w', encoding='utf-8') as f:
                f.write(html_code)
            
            return {
                "html_code": html_code,
                "filename": filename,
                "file_path": str(wireframe_path),
                "description": f"UI wireframe for {topic}"
            }
        except Exception as e:
            print(f"[BRAINSTORM] Wireframe error: {e}")
            return None
    
    def _generate_wireframe(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["topic"])
        
        topic = request["topic"]
        ideas = request.get("ideas", [])
        
        if not ideas:
            ideas = self._generate_ideas_list(topic)
        
        wireframe_result = self._generate_wireframe_internal(topic, ideas)
        
        self.status = AgentStatus.SUCCESS
        return AgentResponse(
            agent_name=self.name,
            status=AgentStatus.SUCCESS,
            result=wireframe_result,
            metadata={"topic": topic}
        )
    
    def _generate_ideas(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["topic"])
        
        topic = request["topic"]
        include_research = request.get("include_research", True)
        
        research = None
        if include_research and self.perplexity_api_key:
            research = self._research_topic(topic)
        
        ideas = self._generate_ideas_list(topic, research)
        
        self.status = AgentStatus.SUCCESS
        return AgentResponse(
            agent_name=self.name,
            status=AgentStatus.SUCCESS,
            result={
                "topic": topic,
                "ideas": ideas,
                "research": research
            },
            metadata={"count": len(ideas)}
        )
    
    def _chat(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["session_id", "message"])
        
        session_id = request["session_id"]
        message = request["message"]
        
        if session_id not in self.sessions:
            return AgentResponse(
                agent_name=self.name,
                status=AgentStatus.ERROR,
                result=None,
                error=f"Session {session_id} not found. Start with 'full' or 'brainstorm' action first.",
                metadata={"session_id": session_id}
            )
        
        session = self.sessions[session_id]
        conversation_history = session.get("conversation", [])
        
        conversation_history.append({"role": "user", "content": message})
        
        context = f"""You are a brainstorming assistant helping refine a project.

CURRENT PROJECT:
Topic: {session.get('topic', 'Unknown')}
Ideas: {len(session.get('ideas', []))} ideas generated
Has Research: {bool(session.get('research'))}
Has Flowchart: {bool(session.get('flowchart'))}
Has Wireframe: {bool(session.get('wireframe'))}

CONVERSATION HISTORY:
{self._format_conversation(conversation_history[-5:])}

USER MESSAGE: {message}

Analyze the user's request and determine what they want:
1. Update research? (e.g., "research more about X", "find better sources")
2. Update flowchart? (e.g., "add a step", "change the flow", "make it simpler")
3. Update wireframe? (e.g., "add a sidebar", "make it mobile-first", "change layout")
4. Generate new ideas? (e.g., "more ideas", "different approach")
5. General question/feedback?

Respond with JSON:
{{
  "intent": "update_research|update_flowchart|update_wireframe|generate_ideas|general",
  "response": "Your helpful response to the user",
  "action_needed": "What specific action to take",
  "parameters": {{}}
}}

If intent is update_*, include what needs to change in parameters."""
        
        try:
            response = self.gemini_model.generate_content(context)
            text = response.text.strip()
            
            if text.startswith('```json'):
                text = text.replace('```json', '').replace('```', '').strip()
            elif text.startswith('```'):
                text = text.replace('```', '').strip()
            
            analysis = json.loads(text)
            
            assistant_response = analysis.get("response", "I understand. Let me help with that.")
            conversation_history.append({"role": "assistant", "content": assistant_response})
            session["conversation"] = conversation_history
            
            result = {
                "response": assistant_response,
                "intent": analysis.get("intent", "general"),
                "session_id": session_id,
                "current_state": {
                    "topic": session.get("topic"),
                    "has_research": bool(session.get("research")),
                    "has_flowchart": bool(session.get("flowchart")),
                    "has_wireframe": bool(session.get("wireframe")),
                    "ideas_count": len(session.get("ideas", []))
                }
            }
            
            intent = analysis.get("intent")
            if intent == "update_research":
                update_result = self._update_research_internal(session, analysis.get("parameters", {}), message)
                result["updated_research"] = update_result
                session["research"] = update_result
            elif intent == "update_flowchart":
                update_result = self._update_flowchart_internal(session, analysis.get("parameters", {}), message)
                result["updated_flowchart"] = update_result
                session["flowchart"] = update_result
            elif intent == "update_wireframe":
                update_result = self._update_wireframe_internal(session, analysis.get("parameters", {}), message)
                result["updated_wireframe"] = update_result
                session["wireframe"] = update_result
            elif intent == "generate_ideas":
                new_ideas = self._generate_ideas_list(session.get("topic"), session.get("research"))
                result["new_ideas"] = new_ideas
                session["ideas"].extend(new_ideas)
            
            self.sessions[session_id] = session
            
            self.status = AgentStatus.SUCCESS
            return AgentResponse(
                agent_name=self.name,
                status=AgentStatus.SUCCESS,
                result=result,
                metadata={"session_id": session_id, "intent": intent}
            )
            
        except Exception as e:
            print(f"[BRAINSTORM] Chat error: {e}")
            import traceback
            traceback.print_exc()
            return AgentResponse(
                agent_name=self.name,
                status=AgentStatus.ERROR,
                result=None,
                error=str(e),
                metadata={"session_id": session_id}
            )
    
    def _format_conversation(self, history: List[Dict[str, str]]) -> str:
        formatted = []
        for msg in history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            formatted.append(f"{role.upper()}: {content}")
        return "\n".join(formatted)
    
    def _update_research_internal(self, session: Dict[str, Any], parameters: Dict[str, Any], user_message: str) -> Dict[str, Any]:
        topic = session.get("topic", "")
        current_research = session.get("research")
        
        research_query = f"{topic}. {user_message}"
        if current_research:
            research_query += f"\n\nPrevious research context: {current_research.get('content', '')[:300]}"
        
        return self._research_topic(research_query) or current_research
    
    def _update_flowchart_internal(self, session: Dict[str, Any], parameters: Dict[str, Any], user_message: str) -> Dict[str, Any]:
        topic = session.get("topic", "")
        current_flowchart = session.get("flowchart", {})
        ideas = session.get("ideas", [])
        
        current_mermaid = current_flowchart.get("mermaid_code", "")
        
        prompt = f"""Update this Mermaid flowchart based on user feedback.

ORIGINAL FLOWCHART:
{current_mermaid}

USER REQUEST: {user_message}

Update the flowchart to incorporate the user's changes. Maintain valid Mermaid syntax.
Return ONLY the updated Mermaid code, no markdown, no explanations."""
        
        try:
            response = self.gemini_model.generate_content(prompt)
            mermaid_code = response.text.strip()
            
            if mermaid_code.startswith('```'):
                mermaid_code = mermaid_code.split('```')[1]
                if mermaid_code.startswith('mermaid'):
                    mermaid_code = mermaid_code.replace('mermaid', '').strip()
            
            if not mermaid_code.startswith('flowchart'):
                mermaid_code = f"flowchart TD\n{mermaid_code}"
            
            return {
                "mermaid_code": mermaid_code,
                "description": f"Updated process flow for {topic}",
                "updated": True
            }
        except Exception as e:
            print(f"[BRAINSTORM] Flowchart update error: {e}")
            return current_flowchart
    
    def _update_wireframe_internal(self, session: Dict[str, Any], parameters: Dict[str, Any], user_message: str) -> Dict[str, Any]:
        topic = session.get("topic", "")
        current_wireframe = session.get("wireframe", {})
        ideas = session.get("ideas", [])
        
        current_html = current_wireframe.get("html_code", "")
        
        prompt = f"""Update this HTML wireframe based on user feedback.

ORIGINAL WIREFRAME:
{current_html[:2000]}

USER REQUEST: {user_message}

Update the wireframe HTML to incorporate the user's changes. Maintain wireframe styling.
Return complete updated HTML document with <!DOCTYPE html>, <html>, <head>, <body> tags."""
        
        try:
            response = self.gemini_model.generate_content(prompt)
            html_code = response.text.strip()
            
            if html_code.startswith('```html'):
                html_code = html_code.replace('```html', '').replace('```', '').strip()
            elif html_code.startswith('```'):
                html_code = html_code.replace('```', '').strip()
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"wireframe_{timestamp}.html"
            wireframe_path = self.output_dir / filename
            
            with open(wireframe_path, 'w', encoding='utf-8') as f:
                f.write(html_code)
            
            return {
                "html_code": html_code,
                "filename": filename,
                "file_path": str(wireframe_path),
                "description": f"Updated UI wireframe for {topic}",
                "updated": True
            }
        except Exception as e:
            print(f"[BRAINSTORM] Wireframe update error: {e}")
            return current_wireframe
    
    def _update_research(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["session_id", "query"])
        
        session_id = request["session_id"]
        if session_id not in self.sessions:
            return AgentResponse(
                agent_name=self.name,
                status=AgentStatus.ERROR,
                result=None,
                error=f"Session {session_id} not found"
            )
        
        session = self.sessions[session_id]
        updated_research = self._update_research_internal(session, {}, request["query"])
        session["research"] = updated_research
        self.sessions[session_id] = session
        
        self.status = AgentStatus.SUCCESS
        return AgentResponse(
            agent_name=self.name,
            status=AgentStatus.SUCCESS,
            result={"research": updated_research},
            metadata={"session_id": session_id}
        )
    
    def _update_flowchart(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["session_id", "changes"])
        
        session_id = request["session_id"]
        if session_id not in self.sessions:
            return AgentResponse(
                agent_name=self.name,
                status=AgentStatus.ERROR,
                result=None,
                error=f"Session {session_id} not found"
            )
        
        session = self.sessions[session_id]
        updated_flowchart = self._update_flowchart_internal(session, {}, request["changes"])
        session["flowchart"] = updated_flowchart
        self.sessions[session_id] = session
        
        self.status = AgentStatus.SUCCESS
        return AgentResponse(
            agent_name=self.name,
            status=AgentStatus.SUCCESS,
            result={"flowchart": updated_flowchart},
            metadata={"session_id": session_id}
        )
    
    def _update_wireframe(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["session_id", "changes"])
        
        session_id = request["session_id"]
        if session_id not in self.sessions:
            return AgentResponse(
                agent_name=self.name,
                status=AgentStatus.ERROR,
                result=None,
                error=f"Session {session_id} not found"
            )
        
        session = self.sessions[session_id]
        updated_wireframe = self._update_wireframe_internal(session, {}, request["changes"])
        session["wireframe"] = updated_wireframe
        self.sessions[session_id] = session
        
        self.status = AgentStatus.SUCCESS
        return AgentResponse(
            agent_name=self.name,
            status=AgentStatus.SUCCESS,
            result={"wireframe": updated_wireframe},
            metadata={"session_id": session_id}
        )
    
    def get_capabilities(self) -> Dict[str, Any]:
        base_caps = super().get_capabilities()
        base_caps.update({
            "actions": ["brainstorm", "wireframe", "ideas", "full", "chat", "update_research", "update_flowchart", "update_wireframe"],
            "has_perplexity": bool(self.perplexity_api_key),
            "has_gemini": bool(self.gemini_api_key),
            "output_dir": str(self.output_dir)
        })
        return base_caps

