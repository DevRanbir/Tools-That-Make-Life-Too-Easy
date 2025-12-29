from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from agents import (
    FlowchartAgent,
    EmailAgent,
    ResearchAgent,
    CallAgent,
    ImageAgent,
    SummaryAgent,
    BrainstormAgent,
    DocumentAgent,
    CaseStudyAgent,
    ChecklistAgent,
    CalendarAgent,
    DailyDigestSystem,
    WhatsAppAgent,
    PresentationAgent,
)
from agents.plotting_agent_matplotlib import PlottingAgentMatplotlib
import os
import json
import requests
import base64
from pathlib import Path
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

try:
    import google.generativeai as genai
except ImportError:
    raise ImportError("Install google-genai: pip install google-genai")

# Initialize Supabase Client
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
supabase: Client = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("[SUPABASE] Client initialized successfully")
    except Exception as e:
        print(f"[SUPABASE] Failed to initialize client: {e}")

app = Flask(__name__)
CORS(app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
}, supports_credentials=True)

flowchart_agent = FlowchartAgent()
email_agent = EmailAgent()
research_agent = ResearchAgent()
call_agent = CallAgent()
image_agent = ImageAgent()
summary_agent = SummaryAgent()
brainstorm_agent = BrainstormAgent()
document_agent = DocumentAgent()
case_study_agent = CaseStudyAgent()
plotting_agent = PlottingAgentMatplotlib()
checklist_agent = ChecklistAgent()
calendar_agent = CalendarAgent()
daily_digest_agent = DailyDigestSystem()
whatsapp_agent = WhatsAppAgent()
presentation_agent = PresentationAgent()
case_study_agent.set_agents(flowchart_agent, image_agent)

gemini_api_key = os.getenv("GEMINI_API_KEY")
if gemini_api_key:
    genai.configure(api_key=gemini_api_key)
    router_model = genai.GenerativeModel("gemini-2.0-flash")
else:
    router_model = None

def _extract_flowchart_title(task, mermaid_code):
    """Extract a meaningful title from the flowchart task and mermaid code."""
    import re
    
    # Try to extract the first meaningful node label from mermaid code
    # Look for patterns like: nodeID[Label] or nodeID{Label} or nodeID(Label)
    node_patterns = [
        r'(\w+)\[([^\]]+)\]',  # nodeID[Label]
        r'(\w+)\{([^\}]+)\}',  # nodeID{Label}
        r'(\w+)\(([^\)]+)\)',  # nodeID(Label)
    ]
    
    first_label = None
    for pattern in node_patterns:
        matches = re.findall(pattern, mermaid_code, re.IGNORECASE)
        if matches:
            # Get the first non-empty label
            for match in matches:
                label = match[1].strip()
                # Skip generic labels like "Start", "End", etc.
                if label and len(label) > 3 and label.lower() not in ['start', 'end', 'begin', 'finish']:
                    first_label = label
                    break
            if first_label:
                break
    
    # Clean up the task description
    task_clean = task.strip()
    
    # Remove common prefixes
    prefixes_to_remove = [
        'create a flowchart',
        'make a flowchart',
        'generate a flowchart',
        'draw a flowchart',
        'create flowchart',
        'make flowchart',
        'generate flowchart',
        'draw flowchart',
        'create a diagram',
        'make a diagram',
        'generate a diagram',
        'draw a diagram',
        'illustrate',
        'show',
        'visualize',
    ]
    
    for prefix in prefixes_to_remove:
        if task_clean.lower().startswith(prefix):
            task_clean = task_clean[len(prefix):].strip()
            # Remove "of" or "for" if it follows
            if task_clean.lower().startswith(('of ', 'for ', 'about ')):
                task_clean = task_clean[3:].strip()
            break
    
    # Capitalize first letter
    if task_clean:
        task_clean = task_clean[0].upper() + task_clean[1:] if len(task_clean) > 1 else task_clean.upper()
    
    # Build title - prefer first_label if meaningful, otherwise use cleaned task
    if first_label and len(first_label) > 5:
        # Use first label as title, but limit length
        title = first_label[:40].strip()
        if len(first_label) > 40:
            title += "..."
    elif task_clean:
        # Use cleaned task, limit to 35 chars
        title = task_clean[:35].strip()
        if len(task_clean) > 35:
            title += "..."
    else:
        # Fallback
        title = "Flowchart Diagram"
    
    return title

def route_to_agents(prompt):
    if not router_model:
        return [{"agent": "research", "task": prompt}]
    
    routing_prompt = f"""You are Bianca, an intelligent AI assistant from Alien X Corp, built by Abhi. You are a task router with full decision-making power. Think deeply about the user's request and determine the best agent(s) to handle it.

AVAILABLE AGENTS:
1. flowchart - Creates diagrams, flowcharts, process maps, visual workflows. Use for: "create a flowchart", "draw a diagram", "show the process", "visualize the workflow"
2. email - Drafts emails, replies, composes messages. Use for: "send email", "draft email", "write to", "email about"
3. call - Makes phone calls. Use ONLY when: phone number is present (e.g., +1234567890) OR explicit "call" command with number
4. research - Researches topics, finds information, explains concepts. Use for: "research", "find information", "explain", "what is", "tell me about", "compare"
5. image - Generates images, visuals, graphics. Use for: "generate image", "create visual", "make a picture", "design", "draw"
6. summary - Condenses content into summaries. Use for: "summarize", "condense", "brief overview", "key points"
7. brainstorm - Generates ideas, creates wireframes, creative prompts. Use for: "brainstorm", "ideas for", "wireframe", "design ideas", "creative"
8. document - Drafts reports, proposals, blog posts, essays. Use for: "write report", "draft proposal", "create blog post", "essay", "documentation"
9. case_study - Creates comprehensive case studies with flowcharts/images. Use for: "case study", "project showcase", "portfolio piece"
10. plotting - Creates charts (bar, pie, line, etc.) from data or research. Use for: "create chart", "make a bar chart", "plot data", "visualize data", "pie chart", "research and plot", "bar graph". CRITICAL RULES: 
   - If user says "three chart types" or explicitly lists multiple types (bar, line, pie), include ALL types in task
   - If user asks for ONLY ONE type (e.g., "create a pie chart"), include ONLY that type
   - Preserve chart type names exactly as user requests
   - Example multi: "Create bar chart, line chart, and pie chart for revenue data"
   - Example single: "Create pie chart for Q4 revenue data"
11. checklist - Manages todos/checklists in Supabase. Use for: "add todo", "create checklist", "mark tasks done", "pin task"
12. calendar - Manages events/schedules in Supabase. Use for: "schedule event", "add meeting", "update calendar", "delete event"
13. daily_digest - Analyze CSV/Excel/PDF/DOCX data files to extract metrics and trends. Use for: "analyze metrics", "data digest", "generate daily summary", "summarize business data"
14. whatsapp - Send messages/images/documents via WhatsApp. Use for: "send on whatsapp", "whatsapp to", "send message to [name] on whatsapp". IMPORTANT: Extract recipient name/phone and message content. AGENT CHAINING SUPPORTED: When user asks to "create [something] and send to [person] on whatsapp", use TWO agents with priority ordering (e.g., "create discord logo and send to 917814996201" → image agent priority=1, whatsapp agent priority=2). The whatsapp agent will automatically receive and send the image from the image agent.
15. presentation - Creates PowerPoint presentations with AI-generated slides. Use for: "create presentation", "make ppt", "make a ppt", "create ppt", "powerpoint about", "slides for", "present about", "ppt on", "presentation on"
16. general - Greetings, questions about capabilities, unclear requests. Use for: "hi", "hello", "what can you do", "help", general conversation

USER REQUEST:
"{prompt}"

THINKING PROCESS:
1. Analyze the user's intent - what do they really want?
2. Identify keywords and action verbs
3. Determine if multiple tasks are present
4. Consider context and implicit needs
5. Choose the most appropriate agent(s)
6. If unclear, use "general" agent

DECISION RULES:
- Think about what the user is trying to accomplish, not just keywords
- A request like "I need to explain my project" might need: research (to understand), document (to write), flowchart (to visualize)
- "Show me how X works" → flowchart or research depending on context
- "I want to present Y" → case_study or document
- Be smart about combining agents when it makes sense
- Call agent ONLY with phone numbers or explicit call intent

OUTPUT FORMAT (JSON):
{{
  "reasoning": "Brief explanation of why you chose these agents",
  "tasks": [
    {{"agent": "agent_name", "task": "detailed task description", "priority": 1}},
    ...
  ]
}}

Priority: 1 = highest priority, execute first. Lower numbers = can be done in parallel or later.

EXAMPLES:

Request: "hi"
Response: {{
  "reasoning": "User is greeting, no specific task requested",
  "tasks": [{{"agent": "general", "task": "hi", "priority": 1}}]
}}

Request: "I need to explain my AI chatbot project to investors"
Response: {{
  "reasoning": "User needs to present a project - this requires a case study with visuals and documentation",
  "tasks": [
    {{"agent": "case_study", "task": "Create comprehensive case study for AI chatbot project for investors", "priority": 1}}
  ]
}}

Request: "Email John about the meeting and research AI trends"
Response: {{
  "reasoning": "Two distinct tasks: email composition and research",
  "tasks": [
    {{"agent": "email", "task": "Draft email to John about the meeting", "priority": 1}},
    {{"agent": "research", "task": "Research current AI trends", "priority": 1}}
  ]
}}

Request: "Create a flowchart for user login, then write a blog post about it"
Response: {{
  "reasoning": "Sequential tasks: first flowchart, then blog post about the flowchart",
  "tasks": [
    {{"agent": "flowchart", "task": "Create flowchart for user login process", "priority": 1}},
    {{"agent": "document", "task": "Write blog post about the user login flowchart", "priority": 2}}
  ]
}}

Request: "make an image of discord logo christmas theme and send it to 917814996201 on whatsapp"
Response: {{
  "reasoning": "User wants to generate an image and send it via WhatsApp - this requires sequential execution: first create image, then send via WhatsApp",
  "tasks": [
    {{"agent": "image", "task": "Generate an image of the Discord app logo with a Christmas theme", "priority": 1}},
    {{"agent": "whatsapp", "task": "Send the generated image to WhatsApp number 917814996201", "priority": 2}}
  ]
}}

Return ONLY valid JSON. NO markdown, NO code blocks."""

    try:
        response = router_model.generate_content(routing_prompt)
        text = response.text.strip()
        
        if text.startswith('```json'):
            text = text.replace('```json', '').replace('```', '').strip()
        elif text.startswith('```'):
            text = text.replace('```', '').strip()
        
        import json
        result = json.loads(text)
        
        if isinstance(result, dict) and "tasks" in result:
            reasoning = result.get("reasoning", "")
            if reasoning:
                print(f"[ROUTER] Reasoning: {reasoning}")
            tasks = result["tasks"]
        elif isinstance(result, list):
            tasks = result
        else:
            tasks = [result] if isinstance(result, dict) else []
        
        if not tasks:
            return [{"agent": "general", "task": prompt}]
        
        valid_agents = [
            'flowchart',
            'email',
            'call',
            'research',
            'image',
            'summary',
            'brainstorm',
            'document',
            'case_study',
            'plotting',
            'checklist',
            'calendar',
            'daily_digest',
            'whatsapp',
            'presentation',
            'general'
        ]
        
        for task in tasks:
            if not isinstance(task, dict):
                continue
            if task.get('agent') not in valid_agents:
                task['agent'] = 'general'
            if 'priority' not in task:
                task['priority'] = 1
        
        tasks.sort(key=lambda x: x.get('priority', 1))
        
        return tasks
    except Exception as e:
        print(f"Routing error: {e}")
        import traceback
        traceback.print_exc()
        return [{"agent": "general", "task": prompt}]

def process_with_agent(agent_name, task):
    # Extract user info if task is a dict (passed from whatsapp_incoming)
    user_phone = None
    if isinstance(task, dict) and 'user' in task:
        user_phone = task.get('user')
        # If task is wrapped in a dict, extract the actual task description if needed
        # But some agents expect the dict (checklist, calendar), others expect string
        if agent_name not in ['checklist', 'calendar', 'daily_digest']:
            if 'task' in task:
                task = task['task']

    if agent_name == 'flowchart':
        level = "3"
        # Handle task being a dict or string
        task_desc = task if isinstance(task, str) else str(task)
        
        if "full" in task_desc.lower() or "fledged" in task_desc.lower() or "detailed" in task_desc.lower() or "complete" in task_desc.lower():
            level = "3"
        
        print(f"[FLOWCHART] Processing flowchart request: {task_desc}")
        print(f"[FLOWCHART] Level: {level}")
        
        try:
            response = flowchart_agent.process({
                "description": task_desc,
                "level": level,
                "output_format": "mermaid"
            })
            result = response.to_dict()
            print(f"[FLOWCHART] Response status: {result.get('status')}")
            
            if result.get('status') == 'success':
                result_data = result.get('result', {})
                mermaid_code = result_data.get('mermaid_code', '')
                print(f"[FLOWCHART] Mermaid code length: {len(mermaid_code)}")
                print(f"[FLOWCHART] Result data keys: {list(result_data.keys())}")
                
                if mermaid_code:
                    # Generate a descriptive title from the flowchart content
                    title = _extract_flowchart_title(task_desc, mermaid_code)
                    
                    # Create .mermaid file in outputs/flowcharts
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    filename = f"flowchart_{timestamp}.mermaid"
                    flowchart_folder = Path("outputs/flowcharts")
                    flowchart_folder.mkdir(parents=True, exist_ok=True)
                    flowchart_path = flowchart_folder / filename
                    
                    # Write mermaid code to file
                    with open(flowchart_path, 'w', encoding='utf-8') as f:
                        f.write(mermaid_code)
                    
                    print(f"[FLOWCHART] Saved to: {flowchart_path}")
                    
                    save_to_storage('flowcharts', {
                        "title": title,
                        "description": "Flowchart diagram",
                        "preview": mermaid_code,  # Store full mermaid code in preview
                        "mermaid_code": mermaid_code,  # Also store separately for download
                        "url": str(flowchart_path),
                        "filename": filename,
                        "downloadable": True
                    }, user_phone=user_phone)
                    
                    result['result']['flowchart'] = mermaid_code
                    print(f"[FLOWCHART] Successfully added flowchart to result")
                else:
                    print(f"[FLOWCHART] WARNING: mermaid_code is empty!")
            else:
                print(f"[FLOWCHART] ERROR: Status is not success. Error: {result.get('error')}")
            
            return result
        except Exception as e:
            import traceback
            print(f"[FLOWCHART] EXCEPTION: {e}")
            traceback.print_exc()
            return {
                "status": "error",
                "result": {},
                "error": str(e)
            }
    
    elif agent_name == 'email':
        # Extract task string properly
        task_str = task if isinstance(task, str) else task.get('task', str(task))
        
        print(f"[EMAIL] Processing email request: {task_str}")
        
        # Always draft first (don't auto-send)
        action = "draft"
        
        try:
            response = email_agent.process({
                "action": action,
                "prompt": task_str,
                "tone": "professional but friendly"
            })
            result = response.to_dict()
            
            print(f"[EMAIL] Agent response status: {result.get('status')}")
            print(f"[EMAIL] Result keys: {list(result.get('result', {}).keys())}")
            
            if result.get('status') == 'success':
                email_data = result.get('result', {})
                
                # Check if we got the required fields
                if not email_data.get('to'):
                    print(f"[EMAIL] WARNING: No 'to' field in result. Full result: {email_data}")
                
                # Create email draft file
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                email_filename = f"email_{timestamp}.txt"
                email_folder = Path("outputs/emails")
                email_folder.mkdir(parents=True, exist_ok=True)
                email_path = email_folder / email_filename
                
                # Format email as text file
                email_content = f"To: {email_data.get('to', '')}\n"
                email_content += f"Subject: {email_data.get('subject', '')}\n\n"
                email_content += email_data.get('body', '')
                
                with open(email_path, 'w', encoding='utf-8') as f:
                    f.write(email_content)
                
                save_to_storage('emails', {
                    "title": email_data.get('subject', 'Email Draft'),
                    "description": f"To: {email_data.get('to', 'N/A')}",
                    "to": email_data.get('to', ''),
                    "subject": email_data.get('subject', ''),
                    "preview": email_data.get('body', ''),
                    "url": str(email_path),
                    "filename": email_filename,
                    "downloadable": False
                }, user_phone=user_phone)
            
            return result
        except Exception as e:
            import traceback
            print(f"[EMAIL] EXCEPTION: {e}")
            traceback.print_exc()
            return {
                "status": "error",
                "result": {},
                "error": str(e)
            }
    
    elif agent_name == 'call':
        import re
        phone_match = re.search(r'\+?[\d\s\-\(\)]{10,}', task)
        
        print(f"[CALL] Task: {task}")
        print(f"[CALL] Phone match: {phone_match}")
        
        if phone_match:
            phone_number = phone_match.group().replace(' ', '').replace('-', '').replace('(', '').replace(')', '')
            webhook_url = os.getenv("NGROK_URL")
            
            print(f"[CALL] Extracted phone: {phone_number}")
            print(f"[CALL] Webhook URL: {webhook_url}")
            
            if not webhook_url:
                return {
                    "status": "error",
                    "result": {
                        "message": "NGROK_URL not set in .env file. Please add it and restart server.",
                        "phone_number": phone_number
                    }
                }
            
            try:
                print(f"[CALL] Initiating call to {phone_number}...")
                response = call_agent.process({
                    "action": "make_call",
                    "phone_number": phone_number,
                    "webhook_url": f"{webhook_url}/voice-webhook"
                })
                print(f"[CALL] Response: {response.to_dict()}")
                return response.to_dict()
            except Exception as e:
                import traceback
                traceback.print_exc()
                return {
                    "status": "error",
                    "result": {
                        "message": f"Call initiation failed: {str(e)}",
                        "phone_number": phone_number,
                        "error_details": str(e)
                    }
                }
        else:
            return {
                "status": "info",
                "result": {
                    "message": "No phone number detected in request. Include a phone number like +919876543210"
                }
            }
    
    elif agent_name == 'research':
        response = research_agent.process({
            "action": "research",
            "query": task,
            "focus": "detailed",  # Use detailed for more comprehensive research
            "model": "sonar-pro"  # Use better model for research
        })
        result = response.to_dict()
        
        if result.get('status') == 'success':
            result_data = result.get('result', {})
            simple_title = task[:30].strip() if len(task) > 30 else task.strip()
            if not simple_title:
                simple_title = "Research"
            
            # Create markdown file with research results
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"research_{timestamp}.md"
            research_folder = Path("outputs/research")
            research_folder.mkdir(parents=True, exist_ok=True)
            research_path = research_folder / filename
            
            # Format research as markdown
            research_content = f"# {simple_title}\n\n"
            research_content += f"## Summary\n{result_data.get('summary', '')}\n\n"
            if result_data.get('sources'):
                research_content += "## Sources\n"
                for idx, source in enumerate(result_data.get('sources', []), 1):
                    if isinstance(source, dict):
                        research_content += f"{idx}. [{source.get('title', 'Source')}]({source.get('url', '')})\n"
                    else:
                        research_content += f"{idx}. {source}\n"
            
            with open(research_path, 'w', encoding='utf-8') as f:
                f.write(research_content)
            
            save_to_storage('research', {
                "title": simple_title,
                "description": "Research results",
                "preview": result_data.get('summary', '')[:200],
                "summary": result_data.get('summary', ''),
                "sources": result_data.get('sources', []),
                "query": result_data.get('query', ''),
                "url": str(research_path),
                "filename": filename,
                "downloadable": True
            }, user_phone=user_phone)
        
        return result
    
    elif agent_name == 'image':
        response = image_agent.process({
            "topic": task,
            "style": "professional and modern",
            "aspect_ratio": "16:9"
        })
        result_dict = response.to_dict()
        if result_dict.get('status') == 'success' and result_dict.get('result', {}).get('image_path'):
            image_path = Path(result_dict['result']['image_path'])
            result_dict['result']['image_url'] = f"/api/image/{image_path.name}"
            
            simple_title = task[:30].strip() if len(task) > 30 else task.strip()
            if not simple_title:
                simple_title = "Image"
            stored_item = save_to_storage('images', {
                "title": simple_title,
                "description": result_dict['result'].get('style', 'Image'),
                "url": str(image_path),  # Save full local path for upload
                "filename": image_path.name,
                "preview": True,
                "downloadable": True,
                "size": f"{image_path.stat().st_size // 1024}KB" if image_path.exists() else None
            }, user_phone=user_phone)
            
            # Use Supabase URL if available, otherwise fallback to local API endpoint
            if stored_item.get('supabase_url'):
                result_dict['result']['image_url'] = stored_item['supabase_url']
                print(f"[IMAGE] Using Supabase URL: {stored_item['supabase_url']}")
        
        return result_dict
    
    elif agent_name == 'brainstorm':
        response = brainstorm_agent.process({
            "action": "full",
            "topic": task
        })
        result = response.to_dict()
        
        if result.get('status') == 'success':
            result_data = result.get('result', {})
            wireframe_path = result_data.get('wireframe', {}).get('file_path')
            simple_title = task[:30].strip() if len(task) > 30 else task.strip()
            if not simple_title:
                simple_title = "Brainstorm"
            
            # Create markdown file with brainstorm ideas
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            brainstorm_filename = f"brainstorm_{timestamp}.md"
            brainstorm_folder = Path("outputs/brainstorm")
            brainstorm_folder.mkdir(parents=True, exist_ok=True)
            brainstorm_path = brainstorm_folder / brainstorm_filename
            
            # Format brainstorm as markdown
            brainstorm_content = f"# {simple_title}\n\n"
            if result_data.get('ideas'):
                brainstorm_content += "## Ideas\n"
                for idx, idea in enumerate(result_data.get('ideas', []), 1):
                    if isinstance(idea, dict):
                        brainstorm_content += f"{idx}. **{idea.get('title', 'Idea')}**: {idea.get('description', '')}\n"
                    else:
                        brainstorm_content += f"{idx}. {idea}\n"
            
            with open(brainstorm_path, 'w', encoding='utf-8') as f:
                f.write(brainstorm_content)
            
            # Use wireframe if exists, otherwise use the markdown file
            file_url = wireframe_path if wireframe_path else str(brainstorm_path)
            file_name = os.path.basename(wireframe_path) if wireframe_path else brainstorm_filename
            
            stored_item = save_to_storage('brainstorm', {
                "title": simple_title,
                "description": f"Brainstorming session with {len(result_data.get('ideas', []))} ideas",
                "preview": f"{len(result_data.get('ideas', []))} ideas generated",
                "url": file_url,
                "filename": file_name,
                "downloadable": True
            }, user_phone=user_phone)
            
            # Use Supabase URL if available
            if stored_item.get('supabase_url') and result_data.get('wireframe'):
                result_data['wireframe']['file_path'] = stored_item['supabase_url']
        
        return result
    
    elif agent_name == 'document':
        doc_type = "report"
        if "proposal" in task.lower():
            doc_type = "proposal"
        elif "blog" in task.lower() or "post" in task.lower():
            doc_type = "blog_post"
        elif "essay" in task.lower():
            doc_type = "essay"
        elif "documentation" in task.lower() or "docs" in task.lower():
            doc_type = "documentation"
        
        response = document_agent.process({
            "action": "draft",
            "topic": task,
            "document_type": doc_type,
            "tone": "professional",
            "format": "markdown",
            "length": "medium"
        })
        result = response.to_dict()
        
        if result.get('status') == 'success':
            result_data = result.get('result', {})
            simple_title = task[:30].strip() if len(task) > 30 else task.strip()
            if not simple_title:
                simple_title = "Document"
            stored_item = save_to_storage('documents', {
                "title": simple_title,
                "description": f"{doc_type} document",
                "preview": result_data.get('document', '')[:200],
                "url": result_data.get('file_path'),
                "filename": result_data.get('filename'),
                "downloadable": True,
                "format": result_data.get('format', 'markdown')
            }, user_phone=user_phone)
            
            # Use Supabase URL if available
            if stored_item.get('supabase_url'):
                result_data['file_path'] = stored_item['supabase_url']
        
        return result
    
    elif agent_name == 'case_study':
        response = case_study_agent.process({
            "action": "create",
            "project_name": task,
            "description": task,
            "include_flowcharts": True,
            "include_images": True
        })
        result = response.to_dict()
        
        if result.get('status') == 'success':
            result_data = result.get('result', {})
            simple_title = task[:30].strip() if len(task) > 30 else task.strip()
            if not simple_title:
                simple_title = "Case Study"
            stored_item = save_to_storage('case_studies', {
                "title": simple_title,
                "description": f"Case study with {result_data.get('sections_count', 0)} sections",
                "preview": result_data.get('document', '')[:200],
                "document": result_data.get('document', ''),  # Full document for viewing
                "url": result_data.get('file_path'),
                "filename": result_data.get('filename'),
                "downloadable": True,
                "format": "markdown",
                "flowcharts": result_data.get('flowcharts_count', 0),
                "images": result_data.get('images_count', 0)
            }, user_phone=user_phone)
            
            # Use Supabase URL if available
            if stored_item.get('supabase_url'):
                result_data['file_path'] = stored_item['supabase_url']
        
            return result
    
    elif agent_name == 'plotting':
        print(f"[PLOTTING] Processing plotting request: {task}")
        try:
            # Detect if multiple chart types are requested
            chart_type_keywords = {
                'bar': ['bar chart', 'bar graph', 'grouped bar', 'bar '],
                'line': ['line chart', 'line graph', 'trend', 'line '],
                'pie': ['pie chart', 'pie graph', 'percentage share', 'pie '],
            }
            
            detected_chart_types = []
            task_lower = task.lower()
            for chart_type, keywords in chart_type_keywords.items():
                if any(kw in task_lower for kw in keywords):
                    detected_chart_types.append(chart_type)
            
            # Check if user wants separate charts
            wants_separate = any(phrase in task_lower for phrase in [
                'separate', 'separately', 'individual', 'independently',
                'each chart', 'three different', 'three separate',
                'two different', 'two separate'
            ])
            
            # Build request
            plot_request = {"topic": task}
            if len(detected_chart_types) > 1:
                plot_request["chart_types"] = detected_chart_types
                if wants_separate:
                    plot_request["create_separate"] = True
                    print(f"[PLOTTING] User wants SEPARATE charts: {detected_chart_types}")
                else:
                    print(f"[PLOTTING] Detected multiple chart types: {detected_chart_types}")
            
            response = plotting_agent.process(plot_request)
            result = response.to_dict()
            
            if result.get('status') == 'success':
                result_data = result.get('result', {})
                
                simple_title = task[:30].strip() if len(task) > 30 else task.strip()
                if not simple_title:
                    simple_title = "Chart"
                
                # Handle multiple separate charts (image_urls array)
                if 'image_urls' in result_data and isinstance(result_data['image_urls'], list):
                    # Multiple separate charts - keep image_urls as is
                    # Save each chart to storage
                    supabase_urls = []
                    for idx, img_url in enumerate(result_data['image_urls']):
                        chart_type_name = result_data.get('chart_types', [])[idx] if idx < len(result_data.get('chart_types', [])) else 'chart'
                        
                        # Convert URL to local path
                        if img_url.startswith('/api/chart/'):
                            local_path = img_url.replace('/api/chart/', 'outputs/plots/')
                        elif img_url.startswith('outputs/'):
                            local_path = img_url
                        else:
                            filename = result_data.get('filenames', [])[idx] if idx < len(result_data.get('filenames', [])) else ''
                            local_path = f"outputs/plots/{filename}" if filename else img_url
                        
                        stored_item = save_to_storage('plots', {
                            "title": f"{simple_title} - {chart_type_name}",
                            "description": f"{chart_type_name} chart - {result_data.get('title', '')}",
                            "url": local_path,
                            "filename": result_data.get('filenames', [])[idx] if idx < len(result_data.get('filenames', [])) else '',
                            "image_url": img_url,
                            "chart_type": chart_type_name,
                            "preview": True,
                            "downloadable": True
                        }, user_phone=user_phone)
                        # Collect Supabase URLs
                        if stored_item and stored_item.get('supabase_url'):
                            supabase_urls.append(stored_item['supabase_url'])
                        else:
                            supabase_urls.append(img_url)
                    
                    # Update result with Supabase URLs
                    if supabase_urls:
                        result_data['image_urls'] = supabase_urls
                else:
                    # Single chart or combined multiple charts
                    filename = result_data.get('filename', '')
                    image_url = result_data.get('image_url', '')
                    file_path = result_data.get('file_path', '')  # Full path from plotting agent
                    
                    print(f"[PLOTTING] Single chart - filename: {filename}, image_url: {image_url}, file_path: {file_path}")
                    
                    # Matplotlib returns image_url (PNG), not chart_html
                    result_data['chart_url'] = image_url  # For compatibility
                    
                    # Use file_path if available (absolute path), otherwise construct from filename
                    if file_path and os.path.exists(file_path):
                        local_path = file_path
                        print(f"[PLOTTING] Using file_path: {local_path}")
                    elif filename:
                        # Construct absolute path
                        local_path = os.path.join(os.getcwd(), 'outputs', 'plots', filename)
                        print(f"[PLOTTING] Constructed path: {local_path}, exists: {os.path.exists(local_path)}")
                    else:
                        # Fallback: try to extract from image_url
                        if image_url.startswith('/api/chart/'):
                            local_path = image_url.replace('/api/chart/', 'outputs/plots/')
                        elif image_url.startswith('/outputs/'):
                            local_path = image_url.lstrip('/')
                        elif image_url.startswith('outputs/'):
                            local_path = image_url
                        else:
                            local_path = f"outputs/plots/{os.path.basename(image_url)}"
                        print(f"[PLOTTING] Fallback path: {local_path}")
                    
                    print(f"[PLOTTING] Final local_path for Supabase: {local_path}")
                    print(f"[PLOTTING] File exists: {os.path.exists(local_path) if os.path.isabs(local_path) else os.path.exists(os.path.join(os.getcwd(), local_path))}")
                    
                    stored_item = save_to_storage('plots', {
                        "title": simple_title,
                        "description": f"{result_data.get('chart_type', 'chart')} chart - {result_data.get('title', '')}",
                        "url": local_path,
                        "filename": filename,
                        "image_url": image_url,
                        "chart_type": result_data.get('chart_type', 'bar'),
                        "preview": True,
                        "downloadable": True
                    }, user_phone=user_phone)
                    
                    print(f"[PLOTTING] stored_item returned: {stored_item is not None}")
                    if stored_item:
                        print(f"[PLOTTING] stored_item has supabase_url: {'supabase_url' in stored_item}")
                    
                    # Use Supabase URL if available
                    if stored_item and stored_item.get('supabase_url'):
                        result_data['image_url'] = stored_item['supabase_url']
                        result_data['chart_url'] = stored_item['supabase_url']
                        print(f"[PLOTTING] Updated chart_url to Supabase URL: {stored_item['supabase_url']}")
                    else:
                        print(f"[PLOTTING] WARNING: No Supabase URL, keeping local path: {result_data.get('chart_url')}")
            
            print(f"[PLOTTING] Returning result with chart_url: {result.get('result', {}).get('chart_url')}")
            return result
        except Exception as e:
            import traceback
            print(f"[PLOTTING] EXCEPTION: {e}")
            traceback.print_exc()
            return {
                "status": "error",
                "result": {},
                "error": str(e)
            }
    
    elif agent_name == 'checklist':
        # Extract username from task dict
        if isinstance(task, dict):
            task_desc = task.get('task') or task.get('input') or ''
            username = task.get('username') or task.get('user')
        else:
            task_desc = str(task) if task else ''
            username = None
        
        if not username:
            return {
                "status": "error",
                "result": {
                    "message": "⚠️ Checklist agent requires you to be signed in. Please sign in and try again."
                }
            }
        
        print(f"[CHECKLIST] Processing for user: {username}, task: {task_desc}")
        response = checklist_agent.process({
            "username": username,
            "input": task_desc
        })
        return response.to_dict()

    elif agent_name == 'calendar':
        # Extract username from task dict
        if isinstance(task, dict):
            task_desc = task.get('task') or task.get('input') or ''
            username = task.get('username') or task.get('user')
        else:
            task_desc = str(task) if task else ''
            username = None
        
        if not username:
            return {
                "status": "error",
                "result": {
                    "message": "⚠️ Calendar agent requires you to be signed in. Please sign in and try again."
                }
            }
        
        print(f"[CALENDAR] Processing for user: {username}, task: {task_desc}")
        response = calendar_agent.process({
            "username": username,
            "input": task_desc
        })
        return response.to_dict()

    elif agent_name == 'daily_digest':
        # Daily digest requires uploaded data files; inform user to use Data page uploads
        return {
            "status": "info",
            "result": {
                "message": "Daily Digest needs data files (CSV/Excel/PDF/DOCX). Please upload via Data page or provide file paths."
            }
        }
    
    elif agent_name == 'general':
        print(f"[GENERAL] Received task: '{task}'")
        original_prompt = task.lower().strip()
        print(f"[GENERAL] Processed prompt: '{original_prompt}'")
        
        greeting_responses = {
            "hi": "Hi there! 👋 I'm Bianca from Alien X Corp, built by Abhi. How can I help you today?",
            "hello": "Hello! 👋 I'm Bianca, your AI assistant from Alien X Corp. What can I do for you?",
            "hey": "Hey! 👋 I'm Bianca from Alien X Corp. I'm here to help. What do you need?",
            "good morning": "Good morning! ☀️ I'm Bianca from Alien X Corp. Ready to help you get things done!",
            "good afternoon": "Good afternoon! 👋 I'm Bianca, your AI assistant. What can I help you with?",
            "good evening": "Good evening! 🌙 I'm Bianca from Alien X Corp. How can I assist you?",
            "howdy": "Howdy! 🤠 I'm Bianca from Alien X Corp, built by Abhi. What brings you here today?",
            "yo": "Yo! 👋 I'm Bianca. What's up? How can I help?",
            "sup": "Hey! 👋 I'm Bianca from Alien X Corp. What can I do for you?",
            "what's up": "Not much, just here to help! 😊 I'm Bianca from Alien X Corp. What do you need?"
        }
        
        capabilities_response = """I'm Bianca, your AI Assistant from Alien X Corp (built by Abhi), with multiple specialized agents:

📊 **Flowchart Agent** - Creates diagrams and process maps
✉️ **Email Agent** - Drafts professional emails
📞 **Call Agent** - Makes phone calls (format: "call +1234567890")
🔍 **Research Agent** - Researches topics and finds information
🖼️ **Image Agent** - Generates images and visuals
📝 **Document Agent** - Writes reports, proposals, blog posts
💡 **Brainstorm Agent** - Generates ideas and wireframes
📋 **Case Study Agent** - Creates comprehensive case studies
📄 **Summary Agent** - Condenses long content
✅ **Checklist Agent** - Creates and manages checklists
📅 **Calendar Agent** - Manages schedule and events
💬 **WhatsApp Agent** - Sends WhatsApp messages
📊 **Plotting Agent** - Creates data visualizations
📢 **Presentation Agent** - Creates presentations
📰 **Daily Digest Agent** - Compiles daily summaries

Just tell me what you need! For example:
- "Create a flowchart for user login"
- "Research AI trends in 2024"
- "Draft an email to my team"
- "Generate an image of a modern dashboard"
- "Summarize this document"
"""
        
        if original_prompt in greeting_responses:
            print(f"[GENERAL] Matched greeting: '{original_prompt}'")
            response_text = greeting_responses[original_prompt]
        elif any(word in original_prompt for word in ["what can you", "capabilities", "help", "what do you", "how does", "what are you"]):
            print(f"[GENERAL] Matched capabilities question")
            response_text = capabilities_response
        elif router_model:
            try:
                prompt = f"""You are Bianca, a friendly AI assistant from Alien X Corp, built by Abhi. The user said: "{task}"

Respond naturally and helpfully. If it's a greeting, greet them back warmly and briefly mention what you can help with.
If they're asking about capabilities, list the available agents and what they do.
Always remember: You are Bianca from Alien X Corp, created by Abhi.
If it's unclear what they want, ask how you can help.

Available agents:
- Flowchart Agent: Creates diagrams and process maps
- Email Agent: Drafts professional emails
- Call Agent: Makes phone calls (with phone number)
- Research Agent: Researches topics and finds information
- Image Agent: Generates images and visuals
- Document Agent: Writes reports, proposals, blog posts
- Brainstorm Agent: Generates ideas and wireframes
- Case Study Agent: Creates comprehensive case studies
- Summary Agent: Condenses long content

Keep your response friendly, concise (2-3 sentences for greetings, longer for capability questions), and helpful.
Return ONLY your response, no markdown formatting, no code blocks."""
                
                response = router_model.generate_content(prompt)
                response_text = response.text.strip()
                
                if not response_text or len(response_text) < 5:
                    response_text = "Hello! I'm your AI assistant. I can help you with flowcharts, emails, research, images, documents, brainstorming, case studies, summaries, plotting, and more. What would you like to do?"
            except Exception as e:
                print(f"[GENERAL] Error generating response: {e}")
                response_text = "Hello! I'm your AI assistant. I can help you with flowcharts, emails, research, images, documents, brainstorming, case studies, summaries, plotting, and more. What would you like to do?"
        else:
            response_text = "Hello! I'm your AI assistant. I can help you with flowcharts, emails, research, images, documents, brainstorming, case studies, summaries, plotting, and more. What would you like to do?"
        
        print(f"[GENERAL] Returning response (length: {len(response_text)})")
        return {
            "status": "success",
            "result": {
                "response": response_text,
                "type": "general_response"
            }
        }
    
    elif agent_name == 'whatsapp':
        try:
            # Extract phone number and message from task
            import re
            
            print(f"[WHATSAPP] Processing request: {task}")
            
            # Check if we have results from previous agents (for chaining)
            agent_results = {}
            if isinstance(task, dict):
                agent_results = task.get('agent_results', {})
                task = task.get('task', str(task))
            
            # Check for image from previous image agent
            image_url = None
            if 'image' in agent_results:
                image_result = agent_results['image']
                if image_result.get('status') == 'success':
                    result_data = image_result.get('result', {})
                    image_url = result_data.get('image_url')
                    print(f"[WHATSAPP] Found image from previous agent: {image_url}")
            
            # Try to extract phone number
            phone_pattern = r'\+?[\d\s\-\(\)]{10,}|\b\d{10}\b'
            phone_match = re.search(phone_pattern, str(task))
            
            # Extract recipient name if mentioned
            name_pattern = r'(?:send|message|whatsapp)\s+(?:to\s+)?([A-Z][a-z]+)'
            name_match = re.search(name_pattern, task, re.IGNORECASE)
            
            recipient = None
            if phone_match:
                # Remove '+' and format properly
                recipient = phone_match.group().replace(' ', '').replace('-', '').replace('(', '').replace(')', '').replace('+', '')
                
                # Validate: need 12 digits with country code
                if len(recipient) == 10:
                    return {
                        "status": "error",
                        "result": {
                            "message": "⚠️ Please include country code with phone number (e.g., 919876543210 for India, not just 9876543210)"
                        }
                    }
            elif name_match:
                recipient = name_match.group(1)
            
            # Extract message content - improved patterns
            message_content = None
            
            # Pattern 1: Message after colon (e.g., "to +123: Hello")
            colon_pattern = r':\s*(.+?)$'
            colon_match = re.search(colon_pattern, task)
            if colon_match:
                message_content = colon_match.group(1).strip()
            
            # Pattern 2: Message in quotes
            if not message_content:
                quote_patterns = [
                    r'"([^"]+)"',
                    r"'([^']+)'",
                    r'say\s+(.+?)$',
                    r'saying\s+(.+?)$'
                ]
                for pattern in quote_patterns:
                    msg_match = re.search(pattern, task, re.IGNORECASE)
                    if msg_match:
                        message_content = msg_match.group(1).strip()
                        break
            
            # Pattern 3: Everything after "message" keyword
            if not message_content:
                after_to = re.search(r'to\s+\+?[\d\s\-\(\)]+\s+(.+?)$', task, re.IGNORECASE)
                if after_to:
                    message_content = after_to.group(1).strip()
            
            print(f"[WHATSAPP] Recipient: {recipient}, Message: {message_content}")
            
            # Check if WhatsApp service is ready
            try:
                service_ready = whatsapp_agent._check_service_health()
            except Exception as e:
                print(f"[WHATSAPP] Health check failed: {e}")
                service_ready = False
            
            if not service_ready:
                return {
                    "status": "error",
                    "result": {
                        "message": "WhatsApp service is not running. Please start it first:",
                        "instructions": "cd Whatsapp-Agent && npm start",
                        "preview_data": {
                            "recipient": recipient,
                            "message": message_content,
                            "type": "image" if image_url else "text",
                            "image_url": image_url
                        }
                    }
                }
            
            # Determine content type
            content_type = "image" if image_url else "text"
            preview_message = f"Image will be sent to WhatsApp" if image_url else "WhatsApp message prepared. Review and send."
            
            # Return preview data for UI to show before sending
            return {
                "status": "pending",
                "result": {
                    "message": preview_message,
                    "preview_data": {
                        "recipient": recipient,
                        "recipient_name": name_match.group(1) if name_match else None,
                        "message": message_content,
                        "type": content_type,
                        "image_url": image_url,
                        "service_ready": service_ready
                    }
                }
            }
        except Exception as e:
            print(f"[WHATSAPP] Error: {e}")
            import traceback
            traceback.print_exc()
            return {
                "status": "error",
                "result": {
                    "message": f"WhatsApp agent error: {str(e)}"
                }
            }
    
    elif agent_name == 'presentation':
        print(f"[PRESENTATION] Processing request: {task}")
        response = presentation_agent.process({
            "topic": task
        })
        result = response if isinstance(response, dict) else response.to_dict()
        
        if result.get('status') == 'success':
            result_data = result.get('result', {})
            simple_title = task[:30].strip() if len(task) > 30 else task.strip()
            if not simple_title:
                simple_title = "Presentation"
            stored_item = save_to_storage('presentations', {
                "title": simple_title,
                "description": f"PowerPoint presentation - {result_data.get('slides', 0)} slides",
                "preview": f"{result_data.get('slides', 0)} slides • {result_data.get('template', 'modern')} template",
                "url": result_data.get('file_path'),
                "filename": result_data.get('filename'),
                "downloadable": True,
                "slides": result_data.get('slides', 0),
                "template": result_data.get('template', 'modern'),
                "tone": result_data.get('tone', 'professional')
            }, user_phone=user_phone)
            
            # Use Supabase URL if available
            if stored_item.get('supabase_url'):
                result_data['file_path'] = stored_item['supabase_url']
        
        return result
    
    elif agent_name == 'summary':
        # Summary agent only works with file uploads, not text input
        return {
            "status": "info",
            "result": {
                "message": "Summary agent requires a file upload. Please upload a PDF, DOCX, TXT, or MD file to summarize."
            }
        }

@app.route('/api/test', methods=['GET'])
def test_connection():
    return jsonify({"status": "ok", "message": "Backend is running!"})

@app.route('/api/process-stream', methods=['POST', 'OPTIONS'])
def process_prompt_stream():
    """Streaming endpoint that sends results as each agent completes"""
    from flask import Response, stream_with_context
    from concurrent.futures import ThreadPoolExecutor, as_completed
    
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        return response
    
    def generate():
        try:
            print(f"[API STREAM] Received request: {request.json}")
            data = request.json
            prompt = data.get("prompt")
            username = data.get("user")
            
            if not prompt:
                yield f"data: {json.dumps({'error': 'Prompt is required'})}\n\n"
                return
            
            tasks = route_to_agents(prompt)
            
            # Send initial task list
            yield f"data: {json.dumps({'type': 'tasks', 'tasks': tasks})}\n\n"
            
            agent_name_map = {
                'flowchart': 'Flowchart Agent',
                'email': 'Email Agent',
                'call': 'Call Agent',
                'research': 'Research Agent',
                'image': 'Image Agent',
                'summary': 'Summary Agent',
                'brainstorm': 'Brainstorm Agent',
                'document': 'Document Agent',
                'case_study': 'Case Study Agent',
                'plotting': 'Plotting Agent',
                'checklist': 'Checklist Agent',
                'calendar': 'Calendar Agent',
                'daily_digest': 'Daily Digest Agent',
                'whatsapp': 'WhatsApp Agent',
                'presentation': 'Presentation Agent',
                'general': 'Assistant'
            }
            
            # Use ThreadPoolExecutor for parallel processing
            # BUT: Execute agents in priority order to support chaining (image -> whatsapp)
            future_to_task = {}
            agent_results = {}  # Store results for agent chaining
            
            with ThreadPoolExecutor(max_workers=5) as executor:
                # Group tasks by priority to handle dependencies
                tasks_by_priority = {}
                for idx, task_info in enumerate(tasks):
                    priority = task_info.get('priority', 1)
                    if priority not in tasks_by_priority:
                        tasks_by_priority[priority] = []
                    tasks_by_priority[priority].append((idx, task_info))
                
                # Process each priority group in order
                for priority in sorted(tasks_by_priority.keys()):
                    priority_tasks = tasks_by_priority[priority]
                    
                    for idx, task_info in priority_tasks:
                        agent_name = task_info.get('agent')
                        task_desc = task_info.get('task')
                        display_name = agent_name_map.get(agent_name, agent_name.title() + ' Agent')
                        
                        # Send processing notification immediately
                        yield f"data: {json.dumps({'type': 'processing', 'agent': display_name, 'index': idx})}\n\n"
                        
                        # Prepare arguments
                        if agent_name == 'general':
                            args = (agent_name, prompt)
                        elif agent_name in ['checklist', 'calendar', 'daily_digest']:
                            args = (agent_name, {
                                "task": task_desc,
                                "username": username,
                                "user": username
                            })
                        else:
                            # Pass sender info AND previous agent results for chaining
                            args = (agent_name, {
                                "task": task_desc,
                                "user": username,
                                "agent_results": agent_results  # Pass previous results
                            })
                        
                        # Submit task
                        future = executor.submit(process_with_agent, *args)
                        future_to_task[future] = (idx, task_info, display_name)
                    
                    # Wait for this priority group to complete before moving to next priority
                    priority_futures = {f: info for f, info in future_to_task.items() 
                                      if info[1].get('priority', 1) == priority}
                    
                    for future in as_completed(priority_futures):
                        idx, task_info, display_name = future_to_task[future]
                        agent_name = task_info.get('agent')
                        
                        try:
                            result = future.result()
                            
                            # Store result for potential use by subsequent agents
                            agent_results[agent_name] = result
                            
                            if not result:
                                yield f"data: {json.dumps({'type': 'result', 'agent': display_name, 'index': idx, 'error': 'No result returned'})}\n\n"
                                continue
                            
                            # Format result based on agent type
                            formatted_result = {'agent': display_name, 'index': idx}
                            
                            if result.get('status') in ['success', 'pending']:
                                result_data = result.get('result', {})
                                
                                if agent_name == 'flowchart':
                                    flowchart_text = result_data.get('flowchart') or result_data.get('mermaid_code', '')
                                    formatted_result['data'] = { 'flowchart': flowchart_text } if flowchart_text else {'error': 'No flowchart generated'}
                                elif agent_name == 'email':
                                    formatted_result['data'] = {
                                        'to': result_data.get('to', ''),
                                        'subject': result_data.get('subject', ''),
                                        'body': result_data.get('body', ''),
                                        'status': result_data.get('status', 'drafted')
                                    }
                                elif agent_name == 'image':
                                    image_url = result_data.get('image_url', '')
                                    print(f"[STREAM] Sending image result for task {idx}: {image_url}")
                                    formatted_result['data'] = {
                                        'topic': result_data.get('topic', ''),
                                        'style': result_data.get('style', ''),
                                        'image_url': image_url
                                    }
                                elif agent_name == 'research':
                                    formatted_result['data'] = {
                                        'result': result_data.get('summary', ''),
                                        'sources': result_data.get('sources', []),
                                        'query': result_data.get('query', '')
                                    }
                                elif agent_name == 'plotting':
                                    formatted_result['data'] = {
                                        'chart_type': result_data.get('chart_type', 'bar'),
                                        'title': result_data.get('title', 'Chart'),
                                        'chart_url': result_data.get('chart_url', ''),
                                        'image_url': result_data.get('image_url', ''),
                                        'data': result_data.get('data', {}),
                                        'filename': result_data.get('filename', '')
                                    }
                                    # Only include chart_html if it actually exists (for Chart.js version)
                                    if result_data.get('chart_html'):
                                        formatted_result['data']['chart_html'] = result_data['chart_html']
                                elif agent_name == 'checklist':
                                    formatted_result['data'] = {
                                        'message': result_data.get('message', ''),
                                        'details': result_data.get('details', [])
                                    }
                                elif agent_name == 'calendar':
                                    formatted_result['data'] = {
                                        'message': result_data.get('message', ''),
                                        'details': result_data.get('details', []),
                                        'event_preview': result_data.get('event_preview')
                                    }
                                elif agent_name == 'whatsapp':
                                    formatted_result['data'] = {
                                        'message': result_data.get('message', ''),
                                        'preview_data': result_data.get('preview_data', {})
                                    }
                                    formatted_result['status'] = result.get('status', 'success')
                                elif agent_name == 'presentation':
                                    formatted_result['data'] = {
                                        'filename': result_data.get('filename', ''),
                                        'file_path': result_data.get('file_path', ''),
                                        'topic': result_data.get('topic', ''),
                                        'slides': result_data.get('slides', 0),
                                        'template': result_data.get('template', 'modern'),
                                        'tone': result_data.get('tone', 'professional'),
                                        'pptx_url': f"/outputs/presentations/{result_data.get('filename', '')}" if result_data.get('filename') else None
                                    }
                                else:
                                    formatted_result['data'] = result_data
                            else:
                                formatted_result['error'] = result.get('error', 'Unknown error')
                        
                            # Send result
                            result_json = {'type': 'result', **formatted_result}
                            print(f"[STREAM] Yielding result for task {idx}: agent={display_name}, has_image_url={'image_url' in formatted_result.get('data', {})}")
                            yield f"data: {json.dumps(result_json)}\n\n"
                            
                        except Exception as e:
                            print(f"Error in task {idx}: {e}")
                            yield f"data: {json.dumps({'type': 'result', 'agent': display_name, 'index': idx, 'error': str(e)})}\n\n"
            
            # Send completion
            yield f"data: {json.dumps({'type': 'complete'})}\n\n"
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
    
    return Response(stream_with_context(generate()), mimetype='text/event-stream')

@app.route('/api/process', methods=['POST'])
def process_prompt():
    try:
        print(f"[API] Received request: {request.json}")
        data = request.json
        prompt = data.get("prompt")
        username = data.get("user")
        
        if not prompt:
            return jsonify({"error": "Prompt is required"}), 400
        
        tasks = route_to_agents(prompt)
        
        results = {}
        agent_name_map = {
            'flowchart': 'Flowchart Agent',
            'email': 'Email Agent',
            'call': 'Call Agent',
            'research': 'Research Agent',
            'image': 'Image Agent',
            'summary': 'Summary Agent',
            'brainstorm': 'Brainstorm Agent',
            'document': 'Document Agent',
            'case_study': 'Case Study Agent',
            'plotting': 'Plotting Agent',
            'checklist': 'Checklist Agent',
            'calendar': 'Calendar Agent',
            'daily_digest': 'Daily Digest Agent',
            'general': 'Assistant'
        }
        
        for task_info in tasks:
            agent_name = task_info.get('agent')
            task_desc = task_info.get('task')
            
            if agent_name == 'general':
                result = process_with_agent(agent_name, prompt)
            elif agent_name in ['checklist', 'calendar', 'daily_digest']:
                result = process_with_agent(agent_name, {
                    "task": task_desc,
                    "username": username,
                    "user": username
                })
            else:
                # Pass username/user info to enable Supabase storage upload
                result = process_with_agent(agent_name, {
                    "task": task_desc,
                    "user": username
                })
            display_name = agent_name_map.get(agent_name, agent_name.title() + ' Agent')
            
            if not result:
                print(f"[ERROR] Agent '{agent_name}' returned None result")
                results[display_name] = { 'error': f'Agent processing failed - no result returned' }
                continue
            
            if result.get('status') == 'success':
                result_data = result.get('result', {})
                if agent_name == 'flowchart':
                    # The flowchart agent returns mermaid_code, and process_with_agent adds it as 'flowchart'
                    flowchart_text = result_data.get('flowchart') or result_data.get('mermaid_code', '')
                    print(f"[FLOWCHART] Extracting flowchart - flowchart key: {bool(result_data.get('flowchart'))}, mermaid_code key: {bool(result_data.get('mermaid_code'))}")
                    print(f"[FLOWCHART] Flowchart text length: {len(flowchart_text) if flowchart_text else 0}")
                    if flowchart_text:
                        results[display_name] = { 'flowchart': flowchart_text }
                    else:
                        print(f"[FLOWCHART] ERROR: No flowchart text found in result_data. Keys: {list(result_data.keys())}")
                        results[display_name] = { 'error': 'Flowchart generation failed - no output produced' }
                elif agent_name == 'email':
                    results[display_name] = {
                        'to': result_data.get('to', ''),
                        'subject': result_data.get('subject', ''),
                        'body': result_data.get('body', ''),
                        'status': result_data.get('status', 'drafted')
                    }
                elif agent_name == 'image':
                    results[display_name] = {
                        'topic': result_data.get('topic', ''),
                        'style': result_data.get('style', ''),
                        'image_url': result_data.get('image_url', '')
                    }
                elif agent_name == 'research':
                    results[display_name] = { 
                        'result': result_data.get('summary', ''),
                        'sources': result_data.get('sources', []),
                        'query': result_data.get('query', '')
                    }
                elif agent_name == 'summary':
                    results[display_name] = { 'summary': result_data.get('summary', '') }
                elif agent_name == 'brainstorm':
                    results[display_name] = {
                        'topic': result_data.get('topic', ''),
                        'ideas': result_data.get('ideas', []),
                        'research': result_data.get('research'),
                        'flowchart': result_data.get('flowchart'),
                        'wireframe': result_data.get('wireframe')
                    }
                elif agent_name == 'document':
                    results[display_name] = {
                        'document': result_data.get('document', ''),
                        'filename': result_data.get('filename', ''),
                        'file_path': result_data.get('file_path', ''),
                        'document_type': result_data.get('document_type', ''),
                        'format': result_data.get('format', 'markdown')
                    }
                elif agent_name == 'presentation':
                    results[display_name] = {
                        'filename': result_data.get('filename', ''),
                        'file_path': result_data.get('file_path', ''),
                        'topic': result_data.get('topic', ''),
                        'slides': result_data.get('slides', 0),
                        'template': result_data.get('template', 'modern'),
                        'tone': result_data.get('tone', 'professional'),
                        'pptx_url': f"/outputs/presentations/{result_data.get('filename', '')}" if result_data.get('filename') else None
                    }
                elif agent_name == 'case_study':
                    results[display_name] = {
                        'document': result_data.get('document', ''),
                        'filename': result_data.get('filename', ''),
                        'file_path': result_data.get('file_path', ''),
                        'project_name': result_data.get('project_name', ''),
                        'sections_count': result_data.get('sections_count', 0),
                        'flowcharts_count': result_data.get('flowcharts_count', 0),
                        'images_count': result_data.get('images_count', 0)
                    }
                elif agent_name == 'general':
                    results[display_name] = {
                        'response': result_data.get('response', ''),
                        'type': result_data.get('type', 'general_response')
                    }
                elif agent_name == 'call':
                    results[display_name] = result_data
                elif agent_name == 'plotting':
                    results[display_name] = {
                        'chart_type': result_data.get('chart_type', 'bar'),
                        'title': result_data.get('title', 'Chart'),
                        'chart_url': result_data.get('chart_url', ''),
                        'image_url': result_data.get('image_url', ''),
                        'data': result_data.get('data', {}),
                        'filename': result_data.get('filename', '')
                    }
                    # Only include chart_html if it actually exists (for Chart.js version)
                    if result_data.get('chart_html'):
                        results[display_name]['chart_html'] = result_data['chart_html']
                elif agent_name == 'checklist':
                    results[display_name] = {
                        'message': result_data.get('message', ''),
                        'details': result_data.get('details', [])
                    }
                elif agent_name == 'calendar':
                    results[display_name] = {
                        'message': result_data.get('message', ''),
                        'details': result_data.get('details', []),
                        'event_preview': result_data.get('event_preview')
                    }
                elif agent_name == 'daily_digest':
                    results[display_name] = {
                        'digest': result_data.get('digest', {}),
                        'summary': result_data.get('summary', '')
                    }
                else:
                    results[display_name] = result_data
            else:
                results[display_name] = { 'error': result.get('error', 'Unknown error') }
        
        summary = f"Completed {len(tasks)} task(s): " + ", ".join([agent_name_map.get(t.get('agent'), t.get('agent')) for t in tasks])
        
        return jsonify({
            "summary": summary,
            "tasks": tasks,
            "results": results
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/image', methods=['POST'])
def generate_image():
    try:
        data = request.json
        topic = data.get('topic')
        style = data.get('style', 'professional and modern')
        aspect_ratio = data.get('aspect_ratio', '1:1')
        
        if not topic:
            return jsonify({"error": "topic required"}), 400
        
        print(f"[IMAGE] Generating image for: {topic}")
        
        response = image_agent.process({
            "topic": topic,
            "style": style,
            "aspect_ratio": aspect_ratio
        })
        
        return jsonify(response.to_dict())
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/image/<path:filename>', methods=['GET'])
def serve_image(filename):
    try:
        image_path = Path("outputs/images") / filename
        if image_path.exists():
            should_download = request.args.get('download', 'false').lower() == 'true'
            return send_file(image_path, mimetype='image/png', as_attachment=should_download)
        return jsonify({"error": "Image not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/chart/<path:filename>', methods=['GET'])
def serve_chart(filename):
    try:
        chart_path = Path("outputs/plots") / filename
        if chart_path.exists():
            should_download = request.args.get('download', 'false').lower() == 'true'
            return send_file(chart_path, mimetype='text/html', as_attachment=should_download)
        return jsonify({"error": "Chart not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/email/send', methods=['POST'])
def send_email():
    try:
        data = request.json
        to_email = data.get('to')
        subject = data.get('subject')
        body = data.get('body')
        from_email = data.get('from')
        
        if not to_email or not subject or not body:
            return jsonify({"error": "to, subject, and body are required"}), 400
        
        # Use the email agent to send
        response = email_agent.process({
            "action": "send",
            "to": to_email,
            "subject": subject,
            "body": body,
            "html": True,
            "from": from_email  # Override from_email if provided
        })
        
        result = response.to_dict()
        
        if result.get('status') == 'success':
            return jsonify({
                "success": True,
                "message": "Email sent successfully",
                "message_id": result.get('result', {}).get('message_id')
            })
        else:
            return jsonify({
                "error": result.get('error', 'Failed to send email')
            }), 500
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/summary/upload', methods=['POST'])
def upload_and_summarize():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        # Validate file type
        allowed_extensions = ['.pdf', '.txt', '.md', '.docx', '.doc']
        file_ext = Path(file.filename).suffix.lower()
        if file_ext not in allowed_extensions:
            return jsonify({"error": f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}"}), 400
        
        # Save uploaded file
        uploads_dir = Path("uploads")
        uploads_dir.mkdir(exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_filename = "".join(c for c in file.filename if c.isalnum() or c in (' ', '-', '_', '.')).strip()
        safe_filename = safe_filename.replace(' ', '_')
        saved_filename = f"{timestamp}_{safe_filename}"
        file_path = uploads_dir / saved_filename
        
        file.save(file_path)
        print(f"[SUMMARY] File uploaded: {file_path}")
        
        # Get optional parameters
        focus = request.form.get('focus', 'general')
        max_length = request.form.get('max_length', 'medium')
        
        # Process file with summary agent
        response = summary_agent.process({
            "content_type": "file",
            "file_path": str(file_path),
            "focus": focus,
            "max_length": max_length
        })
        result = response.to_dict()
        
        if result.get('status') == 'success':
            result_data = result.get('result', {})
            summary_text = result_data.get('summary', '')
            
            # Create text file with summary
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            summary_filename = f"summary_{timestamp}.txt"
            summary_folder = Path("outputs/summaries")
            summary_folder.mkdir(parents=True, exist_ok=True)
            summary_path = summary_folder / summary_filename
            
            with open(summary_path, 'w', encoding='utf-8') as f:
                f.write(f"Summary of: {file.filename}\n\n")
                f.write(summary_text)
            
            # Save to storage with full summary
            save_to_storage('summaries', {
                "title": Path(file.filename).stem,
                "description": f"Summary of {file.filename}",
                "preview": summary_text[:200] if summary_text else '',
                "summary": summary_text,
                "original_filename": file.filename,
                "file_type": file_ext,
                "url": str(summary_path),
                "filename": summary_filename,
                "downloadable": True
            }, user_phone=user_phone)
        
        return jsonify(result)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/summary', methods=['POST'])
def create_summary():
    try:
        data = request.json
        content_type = data.get('content_type', 'text')
        
        if content_type == 'text':
            text = data.get('text')
            if not text:
                return jsonify({"error": "text required for content_type='text'"}), 400
            
            response = summary_agent.process({
                "content_type": "text",
                "text": text,
                "focus": data.get("focus", "general"),
                "max_length": data.get("max_length", "medium")
            })
            result = response.to_dict()
            
            if result.get('status') == 'success':
                simple_title = text[:30].strip() if len(text) > 30 else text.strip()
                if not simple_title:
                    simple_title = "Summary"
                save_to_storage('summaries', {
                    "title": simple_title,
                    "description": "Text summary",
                    "preview": result.get('result', {}).get('summary', '')[:200],
                    "summary": result.get('result', {}).get('summary', ''),  # Full summary
                    "url": None,
                    "downloadable": False
                })
            
            return jsonify(result)
        
        elif content_type == 'file':
            file_path = data.get('file_path')
            if not file_path:
                return jsonify({"error": "file_path required for content_type='file'"}), 400
            
            response = summary_agent.process({
                "content_type": "file",
                "file_path": file_path,
                "focus": data.get("focus", "general"),
                "max_length": data.get("max_length", "medium")
            })
            result = response.to_dict()
            
            if result.get('status') == 'success':
                result_data = result.get('result', {})
                save_to_storage('summaries', {
                    "title": Path(file_path).name,
                    "description": f"File summary: {Path(file_path).suffix}",
                    "preview": result_data.get('summary', '')[:200],
                    "summary": result_data.get('summary', ''),  # Full summary
                    "url": None,
                    "downloadable": False
                })
            
            return jsonify(result)
        
        elif content_type == 'transcript':
            transcript = data.get('transcript')
            if not transcript:
                return jsonify({"error": "transcript required for content_type='transcript'"}), 400
            
            response = summary_agent.process({
                "content_type": "transcript",
                "transcript": transcript,
                "include_speakers": data.get("include_speakers", True),
                "extract_action_items": data.get("extract_action_items", True)
            })
            result = response.to_dict()
            
            if result.get('status') == 'success':
                save_to_storage('summaries', {
                    "title": "Meeting Transcript Summary",
                    "description": "Transcript summary",
                    "preview": result.get('result', {}).get('summary', '')[:200],
                    "url": None,
                    "downloadable": False
                })
            
            return jsonify(result)
        
        elif content_type == 'chat':
            messages = data.get('messages')
            if not messages:
                return jsonify({"error": "messages required for content_type='chat'"}), 400
            
            response = summary_agent.process({
                "content_type": "chat",
                "messages": messages,
                "focus": data.get("focus", "general")
            })
            result = response.to_dict()
            
            if result.get('status') == 'success':
                result_data = result.get('result', {})
                save_to_storage('summaries', {
                    "title": f"Chat Summary ({len(messages)} messages)",
                    "description": "Chat conversation summary",
                    "preview": result_data.get('summary', '')[:200],
                    "summary": result_data.get('summary', ''),  # Full summary
                    "url": None,
                    "downloadable": False
                })
            
            return jsonify(result)
        
        else:
            return jsonify({"error": f"Unknown content_type: {content_type}. Use 'text', 'file', 'transcript', or 'chat'"}), 400
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/brainstorm', methods=['POST'])
def create_brainstorm():
    try:
        data = request.json
        topic = data.get('topic')
        action = data.get('action', 'full')
        
        if not topic:
            return jsonify({"error": "topic required"}), 400
        
        print(f"[BRAINSTORM] Processing: {topic} (action: {action})")
        
        response = brainstorm_agent.process({
            "action": action,
            "topic": topic,
            "include_research": data.get("include_research", True),
            "include_flowchart": data.get("include_flowchart", action == "full"),
            "include_wireframe": data.get("include_wireframe", action == "full")
        })
        result = response.to_dict()
        
        if result.get('status') == 'success':
            result_data = result.get('result', {})
            wireframe_path = result_data.get('wireframe', {}).get('file_path') if isinstance(result_data.get('wireframe'), dict) else None
            simple_title = topic[:30].strip() if len(topic) > 30 else topic.strip()
            if not simple_title:
                simple_title = "Brainstorm"
            save_to_storage('brainstorm', {
                "title": simple_title,
                "description": f"Brainstorming session with {len(result_data.get('ideas', []))} ideas",
                "preview": f"{len(result_data.get('ideas', []))} ideas generated",
                "url": wireframe_path,
                "downloadable": bool(wireframe_path)
            })
        
        return jsonify(result)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/brainstorm/wireframe/<path:filename>', methods=['GET'])
def serve_wireframe(filename):
    try:
        wireframe_path = Path("outputs/brainstorm") / filename
        if wireframe_path.exists():
            return send_file(wireframe_path, mimetype='text/html')
        return jsonify({"error": "Wireframe not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/document', methods=['POST'])
def create_document():
    try:
        data = request.json
        action = data.get('action', 'draft')
        topic = data.get('topic')
        
        if not topic:
            return jsonify({"error": "topic required"}), 400
        
        print(f"[DOCUMENT] Processing: {topic} (action: {action})")
        
        if action == 'outline':
            response = document_agent.process({
                "action": "outline",
                "topic": topic,
                "document_type": data.get("document_type", "report"),
                "custom_sections": data.get("custom_sections")
            })
        elif action == 'expand_outline':
            outline = data.get('outline')
            if not outline:
                return jsonify({"error": "outline required for expand_outline action"}), 400
            response = document_agent.process({
                "action": "expand_outline",
                "topic": topic,
                "outline": outline,
                "document_type": data.get("document_type", "report"),
                "tone": data.get("tone", "professional"),
                "format": data.get("format", "markdown"),
                "length": data.get("length", "medium")
            })
        elif action == 'refine':
            document = data.get('document')
            changes = data.get('changes')
            if not document or not changes:
                return jsonify({"error": "document and changes required for refine action"}), 400
            response = document_agent.process({
                "action": "refine",
                "document": document,
                "changes": changes,
                "format": data.get("format", "markdown")
            })
        else:
            response = document_agent.process({
                "action": "draft",
                "topic": topic,
                "document_type": data.get("document_type", "report"),
                "tone": data.get("tone", "professional"),
                "format": data.get("format", "markdown"),
                "length": data.get("length", "medium"),
                "outline": data.get("outline"),
                "additional_info": data.get("additional_info", "")
            })
        
        result = response.to_dict()
        
        if result.get('status') == 'success':
            result_data = result.get('result', {})
            if action == 'draft' or action == 'expand_outline' or action == 'refine':
                simple_title = topic[:30].strip() if len(topic) > 30 else topic.strip()
                if not simple_title:
                    simple_title = "Document"
                save_to_storage('documents', {
                    "title": simple_title,
                    "description": f"{data.get('document_type', 'document')} document",
                    "preview": result_data.get('document', '')[:200] if 'document' in result_data else "Document generated",
                    "url": result_data.get('file_path'),
                    "filename": result_data.get('filename'),
                    "downloadable": True,
                    "format": result_data.get('format', 'markdown')
                })
        
        return jsonify(result)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/document/<path:filename>', methods=['GET'])
def serve_document(filename):
    try:
        doc_path = Path("outputs/documents") / filename
        if doc_path.exists():
            mimetype = 'text/markdown' if filename.endswith('.md') else 'text/html' if filename.endswith('.html') else 'text/plain'
            return send_file(doc_path, mimetype=mimetype)
        return jsonify({"error": "Document not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/case-study', methods=['POST'])
def create_case_study():
    try:
        data = request.json
        action = data.get('action', 'create')
        project_name = data.get('project_name')
        description = data.get('description')
        
        if not project_name or not description:
            return jsonify({"error": "project_name and description required"}), 400
        
        print(f"[CASE STUDY] Processing: {project_name} (action: {action})")
        
        if action == 'outline':
            response = case_study_agent.process({
                "action": "outline",
                "project_name": project_name,
                "description": description,
                "metrics": data.get("metrics", {}),
                "challenges": data.get("challenges", []),
                "solutions": data.get("solutions", []),
                "results": data.get("results", "")
            })
        else:
            response = case_study_agent.process({
                "action": "create",
                "project_name": project_name,
                "description": description,
                "metrics": data.get("metrics", {}),
                "quotes": data.get("quotes", []),
                "challenges": data.get("challenges", []),
                "solutions": data.get("solutions", []),
                "results": data.get("results", ""),
                "include_flowcharts": data.get("include_flowcharts", True),
                "include_images": data.get("include_images", True)
            })
        
        result = response.to_dict()
        
        if result.get('status') == 'success' and action == 'create':
            result_data = result.get('result', {})
            save_to_storage('case_studies', {
                "title": project_name[:50] + "..." if len(project_name) > 50 else project_name,
                "description": f"Case study with {result_data.get('sections_count', 0)} sections",
                "preview": result_data.get('document', '')[:200],
                "document": result_data.get('document', ''),  # Full document for viewing
                "url": result_data.get('file_path'),
                "filename": result_data.get('filename'),
                "downloadable": True,
                "format": "markdown",
                "flowcharts": result_data.get('flowcharts_count', 0),
                "images": result_data.get('images_count', 0)
            })
        
        return jsonify(result)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/case-study/<path:filename>', methods=['GET'])
def serve_case_study(filename):
    try:
        case_study_path = Path("outputs/case_studies") / filename
        if case_study_path.exists():
            return send_file(case_study_path, mimetype='text/markdown')
        return jsonify({"error": "Case study not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/brainstorm/chat', methods=['POST'])
def brainstorm_chat():
    try:
        data = request.json
        session_id = data.get('session_id')
        message = data.get('message')
        
        if not session_id or not message:
            return jsonify({"error": "session_id and message required"}), 400
        
        print(f"[BRAINSTORM] Chat message in session {session_id}: {message}")
        
        response = brainstorm_agent.process({
            "action": "chat",
            "session_id": session_id,
            "message": message
        })
        result = response.to_dict()
        
        if result.get('status') == 'success':
            result_data = result.get('result', {})
            if result_data.get('updated_wireframe'):
                wireframe_path = result_data['updated_wireframe'].get('file_path')
                if wireframe_path:
                    save_to_storage('brainstorm', {
                        "title": f"Updated wireframe - {session_id}",
                        "description": "Wireframe updated via chat",
                        "preview": "Wireframe updated",
                        "url": wireframe_path,
                        "downloadable": True
                    })
        
        return jsonify(result)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

STORAGE_BASE = Path("storage")
STORAGE_FOLDERS = {
    "emails": STORAGE_BASE / "emails",
    "flowcharts": STORAGE_BASE / "flowcharts",
    "images": STORAGE_BASE / "images",
    "research": STORAGE_BASE / "research",
    "summaries": STORAGE_BASE / "summaries",
    "brainstorm": STORAGE_BASE / "brainstorm",
    "documents": STORAGE_BASE / "documents",
    "case_studies": STORAGE_BASE / "case_studies",
    "charts": STORAGE_BASE / "charts",
    "plots": STORAGE_BASE / "plots",  # Added for plotting agent
    "presentations": STORAGE_BASE / "presentations"
}

for folder in STORAGE_FOLDERS.values():
    folder.mkdir(parents=True, exist_ok=True)

def get_user_uuid(user_identifier):
    """Get user UUID from user_details table (for web app users) or whatsapp_users (for WhatsApp users)"""
    if not supabase or not user_identifier:
        return user_identifier # Fallback to identifier if no supabase
    
    try:
        # First, try to find user by username in user_details
        res = supabase.table("user_details").select("id").eq("username", user_identifier).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]['id']
        
        # If not found by username, try by email if it contains @
        if '@' in user_identifier:
            # Query auth.users table through a view or RPC if available
            # For now, we'll try user_details with a direct email match
            res = supabase.table("user_details").select("id").eq("email", user_identifier).execute()
            if res.data and len(res.data) > 0:
                return res.data[0]['id']
        
        # If it's a phone number, try whatsapp_users table (if it exists)
        if not '@' in user_identifier:
            try:
                res = supabase.table("whatsapp_users").select("id").eq("phone_number", user_identifier).execute()
                if res.data and len(res.data) > 0:
                    return res.data[0]['id']
            except:
                pass  # whatsapp_users table might not exist
        
        print(f"[SUPABASE] User not found in database: {user_identifier}, using identifier as fallback")
            
    except Exception as e:
        print(f"[SUPABASE] Error getting user UUID: {e}")
        
    return user_identifier # Fallback to identifier

def save_to_storage(folder_type, data, user_phone=None):
    folder = STORAGE_FOLDERS.get(folder_type)
    if not folder:
        return None
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    metadata_file = folder / f"{timestamp}_metadata.json"
    
    item = {
        "id": timestamp,
        "type": folder_type,
        "created_at": datetime.now().isoformat(),
        "user_phone": user_phone,
        **data
    }
    
    # 1. Save Local Metadata (Legacy/Backup)
    with open(metadata_file, 'w') as f:
        json.dump(item, f, indent=2)
        
    # 2. Upload to Supabase Storage (if available)
    print(f"[SUPABASE] save_to_storage called - supabase: {bool(supabase)}, user_phone: {user_phone}, folder_type: {folder_type}")
    if supabase and user_phone:
        try:
            # Get UUID for the user
            user_id = get_user_uuid(user_phone)
            print(f"[SUPABASE] User ID: {user_id}")
            
            # Determine file path and content to upload
            file_path_local = None
            print(f"[SUPABASE] Data URL: {data.get('url')}")
            if 'url' in data and data['url'] and not data['url'].startswith('http'):
                # It's a local path (relative or absolute)
                if os.path.isabs(data['url']):
                    file_path_local = data['url']
                else:
                    # Try to resolve relative path
                    if data['url'].startswith('/api/image/'):
                        filename = data['url'].split('/')[-1]
                        file_path_local = os.path.join(os.getcwd(), 'outputs', 'images', filename)
                    elif data['url'].startswith('/api/chart/'):
                        filename = data['url'].split('/')[-1]
                        file_path_local = os.path.join(os.getcwd(), 'outputs', 'plots', filename)
                    elif data['url'].startswith('outputs/'):
                        # Already a relative path from root
                        file_path_local = os.path.join(os.getcwd(), data['url'])
                    else:
                        file_path_local = os.path.join(os.getcwd(), data['url'].lstrip('/'))
            
            print(f"[SUPABASE] Resolved file path: {file_path_local}, exists: {os.path.exists(file_path_local) if file_path_local else 'N/A'}")
            if file_path_local and os.path.exists(file_path_local):
                filename = os.path.basename(file_path_local)
                # Use 'drive' bucket and UUID structure
                storage_path = f"{user_id}/{folder_type}/{filename}"
                
                print(f"[SUPABASE] ✓ Uploading to DRIVE bucket: {storage_path}")
                print(f"[SUPABASE] ✓ File: {filename} | Size: {os.path.getsize(file_path_local)} bytes")
                
                with open(file_path_local, 'rb') as f:
                    upload_result = supabase.storage.from_("drive").upload(
                        file=f,
                        path=storage_path,
                        file_options={"content-type": "auto", "upsert": "true"}
                    )
                    print(f"[SUPABASE] ✓ Upload result: {upload_result}")
                
                # Get Public URL
                public_url = supabase.storage.from_("drive").get_public_url(storage_path)
                item['supabase_url'] = public_url
                print(f"[SUPABASE] ✅ SUCCESS! File uploaded to DRIVE bucket")
                print(f"[SUPABASE] ✅ Public URL: {public_url}")
                
                # Update local metadata with Supabase URL
                with open(metadata_file, 'w') as f:
                    json.dump(item, f, indent=2)
                    
        except Exception as e:
            import traceback
            print(f"[SUPABASE] Upload failed: {e}")
            traceback.print_exc()
    else:
        if not supabase:
            print("[SUPABASE] Skipping upload - Supabase client not initialized")
        if not user_phone:
            print("[SUPABASE] Skipping upload - user_phone is None")

    return item

def get_storage_items(folder_type=None):
    items = []
    
    folders_to_check = [STORAGE_FOLDERS[folder_type]] if folder_type and folder_type != 'all' else STORAGE_FOLDERS.values()
    
    for folder in folders_to_check:
        if not folder.exists():
            continue
        
        for metadata_file in folder.glob("*_metadata.json"):
            try:
                with open(metadata_file, 'r') as f:
                    item = json.load(f)
                    items.append(item)
            except Exception as e:
                print(f"Error reading {metadata_file}: {e}")
    
    items.sort(key=lambda x: x.get('created_at', ''), reverse=True)
    return items

@app.route('/api/storage', methods=['GET'])
def get_storage():
    try:
        folder = request.args.get('folder', 'all')
        items = get_storage_items(folder if folder != 'all' else None)
        return jsonify({"items": items})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/storage/<folder_type>/<item_id>', methods=['DELETE'])
def delete_storage_item(folder_type, item_id):
    try:
        folder = STORAGE_FOLDERS.get(folder_type)
        if not folder:
            return jsonify({"error": "Invalid folder type"}), 400
        
        metadata_file = folder / f"{item_id}_metadata.json"
        if metadata_file.exists():
            metadata_file.unlink()
        
        data_file = folder / f"{item_id}.*"
        for file in folder.glob(f"{item_id}.*"):
            if not file.name.endswith('_metadata.json'):
                file.unlink()
        
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        "status": "healthy",
        "router": "gemini-multi-task" if router_model else "keyword-based",
        "agents": {
            "flowchart": flowchart_agent.get_capabilities(),
            "email": email_agent.get_capabilities(),
            "research": research_agent.get_capabilities(),
            "call": call_agent.get_capabilities(),
            "image": image_agent.get_capabilities(),
            "summary": summary_agent.get_capabilities(),
            "brainstorm": brainstorm_agent.get_capabilities(),
            "document": document_agent.get_capabilities(),
            "case_study": case_study_agent.get_capabilities()
        }
    })

CALL_SYSTEM_PROMPT = """You are {name}, a friendly and helpful AI assistant in a phone conversation.

PERSONALITY:
- Warm, conversational, and natural
- Professional but not stiff
- Empathetic and understanding
- Quick and to the point (phone conversations are brief)

CONVERSATION STYLE:
- Keep responses under 40 words (phone-friendly)
- Ask follow-up questions when appropriate
- Acknowledge what the user said before responding
- Use natural filler words occasionally ("hmm", "I see", "got it")
- Be helpful and action-oriented

CAPABILITIES:
- Answer questions
- Provide information
- Have casual conversations
- Help with tasks
- Be a good listener

Remember: You're on a PHONE CALL - be concise, clear, and engaging!"""

@app.route('/voice-webhook', methods=['GET', 'POST'])
def voice_webhook():
    from twilio.twiml.voice_response import VoiceResponse
    import random
    
    response = VoiceResponse()
    call_sid = request.form.get('CallSid')
    
    INDIAN_VOICES = {
        'female': ['Google.en-IN-Neural2-A', 'Google.en-IN-Neural2-D'],
        'male': ['Google.en-IN-Neural2-B', 'Google.en-IN-Neural2-C']
    }
    INDIAN_NAMES = {
        'female': ['Priya', 'Ananya', 'Kavya', 'Diya'],
        'male': ['Arjun', 'Rohan', 'Aditya', 'Karan']
    }
    
    gender = random.choice(['female', 'male'])
    voice = random.choice(INDIAN_VOICES[gender])
    ai_name = random.choice(INDIAN_NAMES[gender])
    
    call_agent.call_contexts[call_sid] = {
        'voice': voice,
        'ai_name': ai_name,
        'history': [],
        'system_prompt': CALL_SYSTEM_PROMPT.format(name=ai_name)
    }
    
    greeting = f"Hello! I'm {ai_name}, your AI assistant. How can I help you? Just speak naturally, I'll respond when you pause."
    
    response.say(greeting, voice=voice, language='en-IN')
    response.record(timeout=2, max_length=30, action='/process-message', 
                  transcribe=False, play_beep=False)
    
    return str(response), 200, {'Content-Type': 'text/xml'}

@app.route('/process-message', methods=['POST'])
def process_message():
    from twilio.twiml.voice_response import VoiceResponse
    import time
    import requests as req
    from pathlib import Path
    from datetime import datetime
    
    response = VoiceResponse()
    recording_url = request.form.get('RecordingUrl')
    call_sid = request.form.get('CallSid')
    recording_duration = request.form.get('RecordingDuration', '0')
    
    if not call_sid or call_sid not in call_agent.call_contexts:
        response.redirect('/voice-webhook')
        return str(response), 200, {'Content-Type': 'text/xml'}
    
    context = call_agent.call_contexts[call_sid]
    voice = context['voice']
    
    if not recording_url or int(recording_duration) < 1:
        response.record(timeout=2, max_length=30, action='/process-message', 
                      transcribe=False, play_beep=False)
        return str(response), 200, {'Content-Type': 'text/xml'}
    
    try:
        time.sleep(0.5)
        
        recordings_dir = Path("call_recordings")
        recordings_dir.mkdir(exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        audio_filename = recordings_dir / f"{call_sid}_{timestamp}.wav"
        
        audio_response = req.get(recording_url, 
                                auth=(os.getenv("TWILIO_ACCOUNT_SID"), 
                                      os.getenv("TWILIO_AUTH_TOKEN")),
                                timeout=30)
        if audio_response.status_code == 200:
            audio_filename.write_bytes(audio_response.content)
            print(f"[CALL] Recording saved: {audio_filename}")
        
        print(f"[CALL] Transcribing audio file...")
        
        with open(audio_filename, 'rb') as f:
            audio_data = f.read()
        
        if not call_agent.ai_model:
            raise Exception("Gemini API not configured")
        
        transcribe_prompt = "Transcribe this phone call audio accurately. Return ONLY what the user said, no extra text."
        
        gemini_response = call_agent.ai_model.generate_content([
            transcribe_prompt,
            {"mime_type": "audio/wav", "data": audio_data}
        ])
        
        user_query = gemini_response.text.strip()
        
        if not user_query or len(user_query) < 3:
            raise Exception("Transcription too short or empty")
        
        print(f"[CALL] User said: {user_query}")
        
        ai_result = call_agent._generate_ai_response({
            "query": user_query,
            "call_sid": call_sid,
            "ai_name": context['ai_name']
        })
        
        ai_response = ai_result.result["response"]
        print(f"[CALL] AI responding: {ai_response}")
        
        response.say(ai_response, voice=voice, language='en-IN')
        
        farewell_keywords = ['goodbye', 'bye', 'end call', 'hang up', 'thank you bye']
        if any(kw in user_query.lower() or kw in ai_response.lower() for kw in farewell_keywords):
            response.say("Thank you for calling! Goodbye!", voice=voice, language='en-IN')
            response.hangup()
        else:
            response.record(timeout=2, max_length=30, action='/process-message', 
                          transcribe=False, play_beep=False)
        
    except Exception as e:
        print(f"[CALL] Error: {e}")
        import traceback
        traceback.print_exc()
        response.say("Sorry, let me try again.", voice=voice, language='en-IN')
        response.record(timeout=2, max_length=30, action='/process-message', 
                      transcribe=False, play_beep=False)
    
    return str(response), 200, {'Content-Type': 'text/xml'}


# Serve static files (plots, images, charts)
@app.route('/outputs/<path:subpath>/<path:filename>')
def serve_outputs(subpath, filename):
    """Serve files from outputs directory (plots, images, etc.)"""
    try:
        from flask import request, make_response
        outputs_dir = Path('outputs') / subpath
        
        # Check if this is a download request
        is_download = request.args.get('download', '').lower() == 'true'
        
        response = make_response(send_from_directory(outputs_dir, filename))
        
        if is_download:
            # Force download with proper headers
            response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
            response.headers['Content-Type'] = 'application/octet-stream'
        
        return response
    except Exception as e:
        print(f"[SERVER] Error serving file: {e}")
        return jsonify({"error": "File not found"}), 404


# ============================================
# WHATSAPP API ENDPOINTS
# ============================================

@app.route('/api/whatsapp/send', methods=['POST'])
def whatsapp_send():
    """Send WhatsApp message (text, image, or document)"""
    try:
        data = request.json
        operation = data.get('operation', 'send_message')
        
        print(f"[WHATSAPP API] Operation: {operation}, Data: {data}")
        
        result = whatsapp_agent.process(data)
        
        if result.get('status') == 'success':
            return jsonify(result), 200
        else:
            return jsonify(result), 400
            
    except Exception as e:
        print(f"[WHATSAPP API] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@app.route('/api/whatsapp/webhook', methods=['POST'])
def whatsapp_webhook():
    """
    Webhook for incoming WhatsApp messages
    This receives messages from the Node.js WhatsApp service
    and routes them to appropriate agents
    """
    try:
        data = request.json
        print(f"[WHATSAPP WEBHOOK] Received: {data}")
        
        # Extract message details
        from_number = data.get('from')
        message_body = data.get('body', '')
        message_type = data.get('type', 'text')
        sender_name = data.get('senderName', from_number)
        
        print(f"[WHATSAPP WEBHOOK] From: {sender_name} ({from_number})")
        print(f"[WHATSAPP WEBHOOK] Message: {message_body}")
        
        # Route the message to appropriate agent
        tasks = route_to_agents(message_body)
        print(f"[WHATSAPP WEBHOOK] Routed to: {tasks}")
        
        # Process all tasks
        results = []
        for task_info in tasks:
            agent_name = task_info.get('agent')
            task_desc = task_info.get('task')
            
            print(f"[WHATSAPP WEBHOOK] Processing with {agent_name}: {task_desc}")
            result = process_with_agent(agent_name, task_desc)
            results.append({
                'agent': agent_name,
                'result': result
            })
        
        # Format response to send back via WhatsApp
        response_message = ""
        media_to_send = []
        
        for item in results:
            agent = item['agent']
            result = item['result']
            
            if result.get('status') == 'success':
                result_data = result.get('result', {})
                
                # Format response based on agent type
                if agent == 'flowchart':
                    mermaid = result_data.get('mermaid_code', '')
                    if mermaid:
                        response_message += f"\n✅ Flowchart created!\n"
                        # TODO: Convert mermaid to image and send
                        
                elif agent == 'image':
                    image_url = result_data.get('image_url', '')
                    if image_url:
                        response_message += f"\n✅ Image generated!\n"
                        # Convert URL to file path
                        image_path = image_url.replace('/api/image/', 'outputs/images/')
                        media_to_send.append({
                            'type': 'image',
                            'path': image_path,
                            'caption': result_data.get('style', 'Generated image')
                        })
                        
                elif agent == 'research':
                    summary = result_data.get('summary', '')
                    if summary:
                        response_message += f"\n📚 Research Results:\n{summary[:500]}..."
                        
                elif agent == 'plotting':
                    chart_url = result_data.get('image_url', '')
                    if chart_url:
                        response_message += f"\n📊 Chart created!\n"
                        chart_path = chart_url.replace('/outputs/', 'outputs/')
                        media_to_send.append({
                            'type': 'image',
                            'path': chart_path,
                            'caption': result_data.get('title', 'Chart')
                        })
                        
                elif agent == 'general':
                    response_text = result_data.get('response', '')
                    response_message += f"\n{response_text}\n"
                    
                else:
                    response_message += f"\n✅ {agent.title()} completed!\n"
            else:
                response_message += f"\n❌ {agent.title()} failed: {result.get('error', 'Unknown error')}\n"
        
        # Send response back via WhatsApp
        if response_message:
            send_result = whatsapp_agent.send_message(from_number, response_message.strip())
            print(f"[WHATSAPP WEBHOOK] Text sent: {send_result}")
        
        # Send media files
        for media in media_to_send:
            if media['type'] == 'image':
                media_result = whatsapp_agent.send_image(
                    from_number,
                    media['path'],
                    media.get('caption', '')
                )
                print(f"[WHATSAPP WEBHOOK] Media sent: {media_result}")
        
        return jsonify({
            'status': 'success',
            'message': 'Processed and responded'
        }), 200
        
    except Exception as e:
        print(f"[WHATSAPP WEBHOOK] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@app.route('/api/whatsapp/rewrite', methods=['POST'])
def whatsapp_rewrite():
    """Use Gemini to rewrite WhatsApp message"""
    try:
        data = request.json
        original_message = data.get('message', '')
        tone = data.get('tone', 'friendly')  # friendly, professional, casual, formal
        
        if not original_message:
            return jsonify({
                'status': 'error',
                'message': 'Message is required'
            }), 400
        
        # Use Gemini to rewrite
        if not router_model:
            return jsonify({
                'status': 'error',
                'message': 'Gemini API not configured'
            }), 500
        
        rewrite_prompt = f"""Rewrite this WhatsApp message to be {tone} and well-written.
Keep it concise and natural for WhatsApp. Don't add greetings or closings unless they were in the original.

Original message: "{original_message}"

Rewritten message (just the message, no quotes or labels):"""
        
        response = router_model.generate_content(rewrite_prompt)
        rewritten = response.text.strip()
        
        # Remove quotes if present
        rewritten = rewritten.strip('"').strip("'")
        
        return jsonify({
            'status': 'success',
            'original': original_message,
            'rewritten': rewritten,
            'tone': tone
        }), 200
        
    except Exception as e:
        print(f"[WHATSAPP REWRITE] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

# Global store for pending WhatsApp actions (e.g. confirming email send)
pending_whatsapp_actions = {}

def clean_html_for_whatsapp(html_text):
    """Convert HTML to WhatsApp markdown"""
    if not html_text:
        return ""
    
    import re
    
    # Replace <br> and <p> with newlines
    text = re.sub(r'<br\s*/?>', '\n', html_text, flags=re.IGNORECASE)
    text = re.sub(r'</p>', '\n\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<p.*?>', '', text, flags=re.IGNORECASE)
    
    # Bold
    text = re.sub(r'<b>(.*?)</b>', r'*\1*', text, flags=re.IGNORECASE)
    text = re.sub(r'<strong>(.*?)</strong>', r'*\1*', text, flags=re.IGNORECASE)
    
    # Italic
    text = re.sub(r'<i>(.*?)</i>', r'_\1_', text, flags=re.IGNORECASE)
    text = re.sub(r'<em>(.*?)</em>', r'_\1_', text, flags=re.IGNORECASE)
    
    # Remove other tags
    text = re.sub(r'<[^>]+>', '', text)
    
    # Fix multiple newlines
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    return text.strip()

# --- Access Control Configuration ---
APPROVED_USERS_FILE = "approved_users.json"
BOT_SETTINGS_FILE = "bot_settings.json"

def load_approved_users():
    if os.path.exists(APPROVED_USERS_FILE):
        try:
            with open(APPROVED_USERS_FILE, 'r') as f:
                return json.load(f)
        except:
            return []
    return []

def save_approved_users(users):
    with open(APPROVED_USERS_FILE, 'w') as f:
        json.dump(users, f)

def load_settings():
    if os.path.exists(BOT_SETTINGS_FILE):
        try:
            with open(BOT_SETTINGS_FILE, 'r') as f:
                return json.load(f)
        except:
            return {"public_mode": False}
    return {"public_mode": False}

def save_settings(settings):
    with open(BOT_SETTINGS_FILE, 'w') as f:
        json.dump(settings, f)

@app.route('/api/whatsapp/incoming', methods=['POST'])
def whatsapp_incoming():
    global pending_whatsapp_actions
    try:
        data = request.json
        message = data.get("message")
        sender = data.get("sender")
        
        if not message:
            return jsonify({"error": "Message is required"}), 400
            
        print(f"[WHATSAPP] Received message from {sender}: {message}")
        
        # --- Access Control & Admin Commands ---
        approved_users = load_approved_users()
        settings = load_settings()
        public_mode = settings.get("public_mode", False)
        msg_lower = message.strip().lower()
        
        # Normalize phone number for comparison (remove @c.us, @lid, +, spaces)
        def normalize_phone(phone):
            if not phone:
                return ""
            # Remove @c.us or @lid suffix
            phone = phone.split('@')[0]
            # Remove + and spaces
            phone = phone.replace('+', '').replace(' ', '').replace('-', '')
            return phone
        
        sender_normalized = normalize_phone(sender)
        approved_normalized = [normalize_phone(u) for u in approved_users]
        
        # Debug logging
        print(f"[WHATSAPP] Sender format: '{sender}' -> normalized: '{sender_normalized}'")
        print(f"[WHATSAPP] Approved users: {approved_users} -> normalized: {approved_normalized}")
        print(f"[WHATSAPP] Public mode: {public_mode}")
        print(f"[WHATSAPP] Sender in approved list: {sender_normalized in approved_normalized}")
        
        # Admin Commands (Only approved users can run these, or anyone if list is empty)
        is_admin = not approved_users or sender_normalized in approved_normalized
        
        if is_admin:
            if msg_lower == '.help':
                help_text = """🤖 *Admin Commands:*

`.help` - Show this help message
`.list approved` - List all approved users
`.approve <phone>` - Add user to approved list
`.deapprove <phone>` - Remove user from approved list
`.replyall` - Enable public mode (reply to everyone)
`.restrict` - Enable restricted mode (only approved users)

📝 *Example:*
`.approve +919876543210`"""
                return jsonify({"responses": [{"type": "text", "content": help_text}]})
            
            if msg_lower == '.list approved':
                if not approved_users:
                    user_list = "_No approved users yet. Use `.approve <phone>` to add users._"
                else:
                    user_list = "\n".join([f"• {u}" for u in approved_users])
                return jsonify({"responses": [{"type": "text", "content": f"📋 *Approved Users:*\n{user_list}"}]})
                
            if msg_lower == '.replyall':
                settings["public_mode"] = True
                save_settings(settings)
                return jsonify({"responses": [{"type": "text", "content": "🔓 *Public Mode Enabled*\nI will now reply to everyone."}]})
                
            if msg_lower == '.restrict':
                settings["public_mode"] = False
                save_settings(settings)
                return jsonify({"responses": [{"type": "text", "content": "🔒 *Restricted Mode Enabled*\nI will only reply to approved users."}]})

            if msg_lower.startswith('.approve'):
                parts = message.strip().split(maxsplit=1)
                if len(parts) > 1:
                    target_user = parts[1].strip()
                    # If it contains @lid or @c.us, keep it as-is (WhatsApp ID)
                    # Otherwise, normalize as phone number
                    if '@lid' not in target_user and '@c.us' not in target_user:
                        target_user = target_user.replace(' ', '').replace('-', '').replace('(', '').replace(')', '').replace('+', '')
                    if target_user not in approved_users:
                        approved_users.append(target_user)
                    # Auto-approve sender (admin)
                    if sender not in approved_users:
                        approved_users.append(sender)
                    save_approved_users(approved_users)
                    return jsonify({"responses": [{"type": "text", "content": f"✅ User `{target_user}` approved."}]})
                return jsonify({"responses": [{"type": "text", "content": "⚠️ Usage: .approve <phone_number_or_whatsapp_id>"}]})
                
            if msg_lower.startswith('.deapprove'):
                parts = message.strip().split(maxsplit=1)
                if len(parts) > 1:
                    target_user = parts[1].strip()
                    # If it contains @lid or @c.us, keep it as-is (WhatsApp ID)
                    # Otherwise, normalize as phone number
                    if '@lid' not in target_user and '@c.us' not in target_user:
                        target_user = target_user.replace(' ', '').replace('-', '').replace('(', '').replace(')', '').replace('+', '')
                    if target_user in approved_users:
                        approved_users.remove(target_user)
                        save_approved_users(approved_users)
                        return jsonify({"responses": [{"type": "text", "content": f"🚫 User `{target_user}` deapproved."}]})
                    return jsonify({"responses": [{"type": "text", "content": f"⚠️ User `{target_user}` not found."}]})
                return jsonify({"responses": [{"type": "text", "content": "⚠️ Usage: .deapprove <phone_number_or_whatsapp_id>"}]})
            
        # Check Authorization
        # If public_mode is False (restrict mode), check approval
        if not public_mode:
            # If no one is approved yet, deny everyone with a message
            if not approved_users:
                print(f"[WHATSAPP] Denying access from {sender} - No approved users in restrict mode")
                return jsonify({"responses": [{"type": "text", "content": "🔒 *Access Restricted*\n\nThis bot is in restricted mode and no users are approved yet.\n\nContact the admin to get approved."}]})
            
            # If approved list exists but sender is not in it, deny with message
            # Check both normalized (phone only) and full ID (with @lid/@c.us)
            if sender_normalized not in approved_normalized and sender not in approved_users:
                print(f"[WHATSAPP] Denying access from {sender} ({sender_normalized}) - Not in approved list")
                return jsonify({"responses": [{"type": "text", "content": f"🔒 *Access Restricted*\n\nYou are not authorized to use this bot.\n\nYour ID: `{sender}`\n\nContact the admin to get approved."}]})
        # ---------------------------------------
        
        # Check for pending actions
        if sender in pending_whatsapp_actions:
            pending = pending_whatsapp_actions[sender]
            msg_lower = message.lower().strip()
            
            if msg_lower in ['yes', 'send', 'confirm', 'sure', 'ok', 'okay']:
                if pending['type'] == 'email':
                    # Execute send
                    email_data = pending['data']
                    print(f"[WHATSAPP] Executing pending email send to {email_data.get('to')}")
                    
                    response = email_agent.process({
                        "action": "send",
                        "to": email_data.get('to'),
                        "subject": email_data.get('subject'),
                        "body": email_data.get('body')
                    })
                    
                    result = response.to_dict()
                    del pending_whatsapp_actions[sender]
                    
                    if result.get('status') == 'success':
                        return jsonify({"responses": [{
                            "type": "text",
                            "content": "✅ Email sent successfully!"
                        }]})
                    else:
                        return jsonify({"responses": [{
                            "type": "text",
                            "content": f"❌ Failed to send email: {result.get('error')}"
                        }]})
                        
            elif msg_lower in ['no', 'cancel', 'stop', 'abort']:
                del pending_whatsapp_actions[sender]
                return jsonify({"responses": [{
                    "type": "text",
                    "content": "❌ Action cancelled."
                }]})
            
            # If neither yes nor no, assume new command and clear pending
            # Or we could keep it? Let's clear it to avoid confusion.
            # Actually, let's keep it ONLY if they typed something that looks like a question about it?
            # No, simpler to clear it if they start a new task.
            del pending_whatsapp_actions[sender]
        
        # Route the message to appropriate agents
        tasks = route_to_agents(message)
        
        responses = []
        
        agent_name_map = {
            'flowchart': 'Flowchart Agent',
            'email': 'Email Agent',
            'call': 'Call Agent',
            'research': 'Research Agent',
            'image': 'Image Agent',
            'summary': 'Summary Agent',
            'brainstorm': 'Brainstorm Agent',
            'document': 'Document Agent',
            'case_study': 'Case Study Agent',
            'plotting': 'Plotting Agent',
            'checklist': 'Checklist Agent',
            'calendar': 'Calendar Agent',
            'daily_digest': 'Daily Digest Agent',
            'whatsapp': 'WhatsApp Agent',
            'presentation': 'Presentation Agent',
            'general': 'Assistant'
        }
        
        for task_info in tasks:
            agent_name = task_info.get('agent')
            task_desc = task_info.get('task')
            
            print(f"[WHATSAPP] Routing to {agent_name}: {task_desc}")
            
            # Process with agent
            if agent_name == 'general':
                result = process_with_agent(agent_name, message)
            elif agent_name in ['checklist', 'calendar', 'daily_digest']:
                result = process_with_agent(agent_name, {
                    "task": task_desc,
                    "username": sender, # Use sender phone as username
                    "user": sender
                })
            else:
                # Pass sender info to all agents for storage purposes
                result = process_with_agent(agent_name, {
                    "task": task_desc,
                    "user": sender
                })
            
            # Special handling for WhatsApp agent (which returns 'pending' for UI confirmation)
            if agent_name == 'whatsapp' and result.get('status') == 'pending':
                preview_data = result.get('result', {}).get('preview_data', {})
                recipient = preview_data.get('recipient')
                msg_content = preview_data.get('message')
                
                if recipient and msg_content:
                    print(f"[WHATSAPP] Auto-sending message to {recipient}")
                    send_result = whatsapp_agent.send_message(recipient, msg_content)
                    
                    if send_result.get('status') == 'success':
                        # Mock a success result to pass the check below
                        result = {
                            'status': 'success',
                            'result': {
                                'sent': True,
                                'recipient': recipient,
                                'message': msg_content
                            }
                        }
                    else:
                        # Propagate error
                        result = {
                            'status': 'error',
                            'error': send_result.get('message', 'Failed to send message')
                        }
            
            if not result or result.get('status') != 'success':
                error_msg = result.get('error') if result else "No result returned"
                responses.append({
                    "type": "text",
                    "content": f"⚠️ Error with {agent_name_map.get(agent_name, agent_name)}: {error_msg}"
                })
                continue
                
            result_data = result.get('result', {})
            
            # Format response based on agent type
            if agent_name == 'general':
                responses.append({
                    "type": "text",
                    "content": result_data.get('response', '')
                })
            elif agent_name == 'research':
                summary = result_data.get('summary', '')
                sources = result_data.get('sources', [])
                
                # Create a research file
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"research_{timestamp}.md"
                output_dir = Path("outputs/research")
                output_dir.mkdir(parents=True, exist_ok=True)
                file_path = output_dir / filename
                
                content_md = f"# Research Result: {task[:50]}...\n\n"
                content_md += f"{summary}\n\n"
                if sources:
                    content_md += "## Sources\n" + "\n".join([f"- {s}" for s in sources])
                
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content_md)
                
                abs_path = os.path.abspath(file_path)
                
                responses.append({
                    "type": "document",
                    "path": abs_path,
                    "caption": f"🔍 Research: {task[:30]}..."
                })
                
                # Also send a short text summary
                responses.append({
                    "type": "text",
                    "content": f"🔍 *Research Complete*\n\nI've attached the detailed research report above.\n\n*Summary Preview:*\n{summary[:500]}..."
                })

            elif agent_name == 'case_study':
                file_path = result_data.get('file_path')
                filename = result_data.get('filename')
                
                if file_path:
                    abs_path = os.path.abspath(file_path)
                    if os.path.exists(abs_path):
                        responses.append({
                            "type": "document",
                            "path": abs_path,
                            "caption": f"📋 Case Study: {result_data.get('project_name', 'Generated Case Study')}"
                        })
                    else:
                        responses.append({
                            "type": "text",
                            "content": f"📋 Case Study generated but file not found: {filename}"
                        })
                else:
                    # Fallback if no file path returned (though agent should return it)
                    responses.append({
                        "type": "text",
                        "content": "📋 Case Study generated (check dashboard for details)."
                    })

            elif agent_name == 'image':
                image_url = result_data.get('image_url', '')
                if image_url:
                    # Handle both relative paths (starting with /) and absolute paths or filenames
                    
                    # Check if it's an API URL (e.g. /api/image/filename.png)
                    if '/api/image/' in image_url:
                        filename = image_url.split('/')[-1]
                        file_path = os.path.join(os.getcwd(), 'outputs', 'images', filename)
                    elif image_url.startswith('/'):
                        # It's a relative path from server root, e.g. /outputs/images/file.png
                        # Remove leading slash and join with current working directory
                        clean_path = image_url.lstrip('/')
                        file_path = os.path.join(os.getcwd(), clean_path)
                    else:
                        # Assume it's just a filename or relative path
                        file_path = os.path.join(os.getcwd(), image_url)
                    
                    # Verify file exists
                    if os.path.exists(file_path):
                        responses.append({
                            "type": "image",
                            "path": file_path,
                            "caption": f"🖼️ Generated Image: {result_data.get('topic', '')}"
                        })
                    else:
                        print(f"[WHATSAPP] Image file not found at: {file_path}")
                        # Try one last fallback - check outputs/images directly with just the filename
                        filename = os.path.basename(image_url)
                        fallback_path = os.path.join(os.getcwd(), 'outputs', 'images', filename)
                        if os.path.exists(fallback_path):
                             responses.append({
                                "type": "image",
                                "path": fallback_path,
                                "caption": f"🖼️ Generated Image: {result_data.get('topic', '')}"
                            })
                        else:
                            responses.append({
                                "type": "text",
                                "content": f"🖼️ Image generated but file not found: {image_url}"
                            })
                else:
                    responses.append({
                        "type": "text",
                        "content": f"🖼️ Image generated: {image_url}"
                    })
            elif agent_name == 'flowchart':
                mermaid_code = result_data.get('flowchart') or result_data.get('mermaid_code', '')
                
                # Clean mermaid code using regex to extract from code blocks if present
                import re
                code_match = re.search(r'```(?:mermaid)?\s*(.*?)```', mermaid_code, re.DOTALL)
                if code_match:
                    mermaid_code = code_match.group(1)
                else:
                    # If no code block, just strip whitespace and potential "mermaid" prefix
                    mermaid_code = mermaid_code.strip()
                    if mermaid_code.lower().startswith('mermaid'):
                        mermaid_code = mermaid_code[7:].strip()
                
                mermaid_code = mermaid_code.strip()
                
                print(f"[WHATSAPP] Generating flowchart image for code: {mermaid_code[:50]}...")
                
                # Try to generate image from mermaid.ink
                try:
                    import base64
                    import requests
                    
                    # Use standard base64 encoding but ensure it's clean
                    graphbytes = mermaid_code.encode("utf8")
                    base64_bytes = base64.b64encode(graphbytes)
                    base64_string = base64_bytes.decode("ascii")
                    
                    # mermaid.ink uses standard base64
                    url = "https://mermaid.ink/img/" + base64_string
                    
                    print(f"[WHATSAPP] Fetching flowchart image from: {url}")
                    # Add timeout to prevent hanging
                    response = requests.get(url, timeout=20)
                    
                    if response.status_code == 200 and 'image' in response.headers.get('Content-Type', ''):
                        # Save to file
                        filename = f"flowchart_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                        # Use storage/flowcharts to match workspace structure
                        output_dir = Path("storage/flowcharts")
                        output_dir.mkdir(parents=True, exist_ok=True)
                        file_path = output_dir / filename
                        
                        with open(file_path, 'wb') as f:
                            f.write(response.content)
                            
                        # Convert to absolute path
                        abs_path = os.path.abspath(file_path)
                        print(f"[WHATSAPP] Saved flowchart to: {abs_path} (Size: {len(response.content)} bytes)")
                        
                        # Upload to Supabase if available
                        if supabase and sender:
                            try:
                                user_id = get_user_uuid(sender)
                                storage_path = f"{user_id}/flowcharts/{filename}"
                                print(f"[SUPABASE] Uploading flowchart to {storage_path}...")
                                supabase.storage.from_("drive").upload(
                                    file=response.content,
                                    path=storage_path,
                                    file_options={"content-type": "image/png", "upsert": "true"}
                                )
                                public_url = supabase.storage.from_("drive").get_public_url(storage_path)
                                print(f"[SUPABASE] Flowchart upload success: {public_url}")
                            except Exception as e:
                                print(f"[SUPABASE] Flowchart upload failed: {e}")
                            
                        responses.append({
                            "type": "image",
                            "path": abs_path,
                            "caption": "📊 Flowchart Generated"
                        })
                    else:
                        print(f"[WHATSAPP] Failed to fetch flowchart image. Status: {response.status_code}, Type: {response.headers.get('Content-Type')}")
                        # Fallback to text if image generation fails
                        responses.append({
                            "type": "text",
                            "content": f"📊 *Flowchart Generated (Image Failed)*\n\n```mermaid\n{mermaid_code}\n```"
                        })
                except Exception as e:
                    print(f"[WHATSAPP] Error generating flowchart image: {e}")
                    responses.append({
                        "type": "text",
                        "content": f"📊 *Flowchart Generated (Error)*\n\n```mermaid\n{mermaid_code}\n```"
                    })
            elif agent_name == 'email':
                if result_data.get('sent'):
                    responses.append({
                        "type": "text",
                        "content": f"✉️ *Email Sent Successfully!* ✅\n\nTo: {result_data.get('to')}\nSubject: {result_data.get('subject')}"
                    })
                else:
                    # Clean HTML for display
                    body_clean = clean_html_for_whatsapp(result_data.get('body', ''))
                    
                    # Store pending action
                    pending_whatsapp_actions[sender] = {
                        'type': 'email',
                        'data': result_data
                    }
                    
                    responses.append({
                        "type": "text",
                        "content": f"✉️ *Email Drafted:*\n\nTo: {result_data.get('to')}\nSubject: {result_data.get('subject')}\n\n{body_clean}\n\n*Reply 'Yes' to send this email.*"
                    })
            elif agent_name == 'whatsapp':
                if result_data.get('sent'):
                    responses.append({
                        "type": "text",
                        "content": f"✅ *Message Sent!* \nTo: {result_data.get('recipient')}\nMessage: {result_data.get('message')}"
                    })
                else:
                    responses.append({
                        "type": "text",
                        "content": "⚠️ WhatsApp message prepared but not sent."
                    })
            elif agent_name == 'presentation':
                file_path = result_data.get('file_path')
                filename = result_data.get('filename')
                
                if file_path:
                    # Check if it's a Supabase URL or local path
                    if file_path.startswith('http://') or file_path.startswith('https://'):
                        # It's a Supabase URL - download it first
                        print(f"[WHATSAPP] Downloading presentation from Supabase: {file_path}")
                        import requests
                        import tempfile
                        
                        try:
                            response = requests.get(file_path, timeout=30)
                            response.raise_for_status()
                            
                            # Save to temp file
                            temp_dir = tempfile.gettempdir()
                            temp_path = os.path.join(temp_dir, filename or 'presentation.pptx')
                            
                            with open(temp_path, 'wb') as f:
                                f.write(response.content)
                            
                            print(f"[WHATSAPP] Downloaded to: {temp_path}")
                            
                            responses.append({
                                "type": "document",
                                "path": temp_path,
                                "caption": f"📢 Presentation: {result_data.get('topic', 'Generated Presentation')}"
                            })
                        except Exception as e:
                            print(f"[WHATSAPP] Failed to download presentation: {e}")
                            responses.append({
                                "type": "text",
                                "content": f"📢 Presentation created! Download it from: {file_path}"
                            })
                    else:
                        # It's a local path
                        abs_path = os.path.abspath(file_path)
                        
                        if os.path.exists(abs_path):
                            responses.append({
                                "type": "document",
                                "path": abs_path,
                                "caption": f"📢 Presentation: {result_data.get('topic', 'Generated Presentation')}"
                            })
                        else:
                            responses.append({
                                "type": "text",
                                "content": f"📢 Presentation generated but file not found: {filename}"
                            })
            elif agent_name == 'summary':
                responses.append({
                    "type": "text",
                    "content": f"📄 *Summary:*\n\n{result_data.get('summary')}"
                })
            elif agent_name == 'brainstorm':
                ideas = result_data.get('ideas', [])
                content = f"💡 *Brainstorming: {result_data.get('topic')}*\n\n"
                content += "\n".join([f"• {idea}" for idea in ideas])
                responses.append({
                    "type": "text",
                    "content": content
                })
            elif agent_name == 'document':
                content = result_data.get('content', '')
                if content:
                     responses.append({
                        "type": "text",
                        "content": f"📝 *Document Draft:*\n\n{content[:1000]}..." 
                    })
                else:
                     responses.append({
                        "type": "text",
                        "content": "📝 Document created."
                    })
            elif agent_name == 'plotting':
                 image_url = result_data.get('image_url', '')
                 if image_url and image_url.startswith('/'):
                    file_path = os.path.join(os.getcwd(), image_url.lstrip('/'))
                    responses.append({
                        "type": "image",
                        "path": file_path,
                        "caption": f"📊 Chart: {result_data.get('title', '')}"
                    })
            elif agent_name == 'checklist':
                responses.append({
                    "type": "text",
                    "content": f"✅ {result_data.get('message', 'Checklist updated')}"
                })
            elif agent_name == 'calendar':
                responses.append({
                    "type": "text",
                    "content": f"📅 {result_data.get('message', 'Calendar updated')}"
                })
            else:
                responses.append({
                    "type": "text",
                    "content": f"✅ {agent_name_map.get(agent_name, agent_name)} task completed."
                })
                
        return jsonify({"responses": responses})
        
    except Exception as e:
        print(f"[WHATSAPP] Error processing incoming message: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    print("🚀 Multi-Agent Manager Server Running")
    print("📍 http://localhost:5001")
    print(f"\n🧠 Router: {'Gemini AI (Multi-Task)' if router_model else 'Keyword-based fallback'}")
    print("\n🤖 Available Agents:")
    print("  📊 Flowchart Agent - Creates diagrams and process maps")
    print("  ✉️ Email Agent - Drafts professional emails")
    print("  📞 Call Agent - Makes phone calls")
    print("  🔍 Research Agent - Researches topics and finds information")
    print("  🖼️ Image Agent - Generates images and visuals")
    print("  📝 Document Agent - Writes reports, proposals, blog posts")
    print("  💡 Brainstorm Agent - Generates ideas and wireframes")
    print("  📋 Case Study Agent - Creates comprehensive case studies")
    print("  📄 Summary Agent - Condenses long content")
    print("  📊 Plotting Agent - Creates charts and visualizations")
    print("\n💡 Can handle multiple tasks in one prompt!")
    app.run(host='0.0.0.0', port=5001, debug=True)
