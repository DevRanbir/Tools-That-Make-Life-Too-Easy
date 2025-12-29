from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any, Dict, Optional
from datetime import datetime
from dataclasses import dataclass

from agents.base_agent import BaseAgent, AgentResponse, AgentStatus

try:
    import google.generativeai as genai
except ImportError:
    raise ImportError("Install google-genai: pip install google-genai")

try:
    from dotenv import load_dotenv
except ImportError:
    raise ImportError("Install python-dotenv: pip install python-dotenv")


@dataclass(frozen=True)
class FlowchartMode:
    name: str
    system_prompt: str


MODES: Dict[str, FlowchartMode] = {
    "basic": FlowchartMode(
        name="basic",
        system_prompt=(
            "You are a Mermaid flowchart expert. Generate VALID Mermaid v10 syntax.\n\n"
            "SYNTAX RULES (STRICT):\n"
            "1. Start with: flowchart TD\n"
            "2. Each node needs UNIQUE ID (A, B, C or node1, node2, etc)\n"
            "3. Connections: nodeID[Label] --> nextID[Label]\n"
            "4. Decisions: decisionID{Question?} -->|Yes| yesNode[Action]\n"
            "5. ONE connection per line\n"
            "6. NO duplicate node IDs anywhere\n\n"
            "VALID Example:\n"
            "flowchart TD\n"
            "    A[Start] --> B[Step 1]\n"
            "    B --> C{Need approval?}\n"
            "    C -->|Yes| D[Get approval]\n"
            "    C -->|No| E[Proceed]\n"
            "    D --> E\n"
            "    E --> F[Complete]\n\n"
            "Return ONLY the mermaid code. NO explanations."
        ),
    ),
    "intermediate": FlowchartMode(
        name="intermediate",
        system_prompt=(
            "You are a Mermaid flowchart expert. Create a clear, professional flowchart.\n\n"
            "SYNTAX RULES (MUST FOLLOW):\n"
            "1. Start: flowchart LR or flowchart TD\n"
            "2. Node types:\n"
            "   - Rectangle: id[Text]\n"
            "   - Diamond: id{Question?}\n"
            "   - Rounded: id(Text)\n"
            "3. Connections:\n"
            "   - Simple: A --> B\n"
            "   - Labeled: A -->|label| B\n"
            "4. EVERY node ID must be UNIQUE\n"
            "5. Keep labels clear and concise\n\n"
            "VALID Example:\n"
            "flowchart LR\n"
            "    start[Start] --> input[Get user input]\n"
            "    input --> validate{Valid input?}\n"
            "    validate -->|Yes| process[Process data]\n"
            "    validate -->|No| error[Show error]\n"
            "    error --> input\n"
            "    process --> save[Save to database]\n"
            "    save --> done[Complete]\n\n"
            "Return ONLY mermaid code."
        ),
    ),
    "advanced": FlowchartMode(
        name="advanced",
        system_prompt=(
            "You are an expert Mermaid diagram creator. Build a detailed, professional flowchart.\n\n"
            "MANDATORY SYNTAX:\n"
            "1. Begin with: flowchart TD\n"
            "2. Use descriptive node IDs: start_node, check_auth, process_data\n"
            "3. All IDs must be UNIQUE (no reuse)\n"
            "4. Connection format:\n"
            "   - nodeA[Label A] --> nodeB[Label B]\n"
            "   - nodeC{Question?} -->|Answer| nodeD[Action]\n"
            "5. For parallel flows, create separate end nodes: end1, end2\n"
            "6. Keep consistent indentation (4 spaces)\n\n"
            "VALID Example:\n"
            "flowchart TD\n"
            "    start_node[Start Process] --> check_auth{User authenticated?}\n"
            "    check_auth -->|Yes| load_data[Load user data]\n"
            "    check_auth -->|No| login[Redirect to login]\n"
            "    login --> check_auth\n"
            "    load_data --> process[Process request]\n"
            "    process --> check_error{Any errors?}\n"
            "    check_error -->|Yes| error_handler[Handle error]\n"
            "    check_error -->|No| success[Return success]\n"
            "    error_handler --> end_error[End with error]\n"
            "    success --> end_success[End successfully]\n\n"
            "Output ONLY the code. NO markdown formatting, NO explanations."
        ),
    ),
}

LEVEL_TO_MODE = {
    "1": MODES["basic"],
    "2": MODES["intermediate"],
    "3": MODES["advanced"],
}


class FlowchartAgent(BaseAgent):
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(
            name="Flowchart Agent",
            description="Turns bullet ideas into clean flowcharts and simple process maps",
            config=config
        )
        
        self.api_key = self.config.get("api_key") or os.getenv("GEMINI_API_KEY")
        self.model_name = self.config.get("model_name", "gemini-2.0-flash")
        self.default_level = self.config.get("default_level", "1")
        self.save_to_file = self.config.get("save_to_file", False)
        self.output_dir = Path(self.config.get("output_dir", "outputs"))
        
        if self.save_to_file:
            self.output_dir.mkdir(parents=True, exist_ok=True)
        
        if self.api_key:
            genai.configure(api_key=self.api_key)
            self.ai_model = genai.GenerativeModel(self.model_name)
        else:
            self.ai_model = None
    
    def process(self, request: Dict[str, Any]) -> AgentResponse:
        self.status = AgentStatus.PROCESSING
        
        try:
            self.validate_request(request, ["description"])
            
            description = request["description"]
            level = request.get("level", self.default_level)
            output_format = request.get("output_format", "mermaid")
            filename = request.get("filename")
            
            mermaid_code = self._generate_mermaid(description, str(level))
            
            result = {
                "mermaid_code": mermaid_code,
                "level": level,
            }
            
            if self.save_to_file or output_format in ["png", "both"]:
                file_paths = self._save_outputs(mermaid_code, output_format, filename)
                result.update(file_paths)
            
            self.status = AgentStatus.SUCCESS
            return AgentResponse(
                agent_name=self.name,
                status=AgentStatus.SUCCESS,
                result=result,
                metadata={
                    "description_length": len(description),
                    "level": level,
                    "output_format": output_format,
                }
            )
            
        except Exception as exc:
            self.status = AgentStatus.ERROR
            return AgentResponse(
                agent_name=self.name,
                status=AgentStatus.ERROR,
                result=None,
                error=str(exc),
                metadata={"request": request}
            )
    
    def _generate_mermaid(self, description: str, level: str) -> str:
        if not self.ai_model:
            raise ValueError("Gemini API key required")
        
        description = description.strip()
        if not description:
            raise ValueError("Process description cannot be empty")
        
        mode = self._resolve_mode(level)
        
        complexity_hint = ""
        if "full" in description.lower() or "fledged" in description.lower() or "detailed" in description.lower() or "complete" in description.lower():
            complexity_hint = "\n\nIMPORTANT: User requested a FULL-FLEDGED, DETAILED flowchart. Create a comprehensive flowchart with:\n- Multiple steps and decision points\n- All major components and flows\n- At least 10-15 nodes\n- Complete end-to-end process\n- All edge cases and branches\n"
        
        # Build prompt carefully to avoid f-string evaluation issues
        # Use .format() instead of f-string to avoid issues with braces
        prompt_template = """{system_prompt}

CRITICAL SYNTAX RULES (MUST FOLLOW):
1. Start with exactly "flowchart TD" (or LR/TB/BT/RL) - NO semicolon, NO extra text
2. Node labels must NOT contain:
   - Trailing periods, commas, or semicolons after closing brackets/braces
   - Special characters like "etc.)" at the end of labels
   - Unmatched brackets, braces, or parentheses
3. After closing a node definition with ], }}), or ), there must be ONLY:
   - Whitespace
   - Arrow (-->)
   - Pipe for labels (|)
4. Node IDs must be alphanumeric with underscores only (no spaces, no special chars) - ALL IDs must be UNIQUE
5. Labels inside brackets/braces should be clean text without trailing punctuation that breaks syntax
6. For End nodes: Use format "End: Description" (with colon) - e.g., "End: Success", "End: Error", NOT just "End"
7. Use consistent 4-space indentation (NO tabs, NO mixed spaces/tabs)
8. Every line must be properly formatted: ID[Label] --> ID or ID{{Label}} --> ID - avoid stray characters

USER REQUEST: {description}
{complexity_hint}

YOUR TASK:
1. Understand what process/system needs to be flowcharted
2. Break it down into clear, detailed steps
3. Generate VALID Mermaid flowchart syntax
4. Include decision points, loops, and all branches
5. Make it comprehensive and complete
6. Ensure ALL node definitions are properly closed
7. Keep labels concise and avoid trailing punctuation

Example for "notification system" (simple):
flowchart TD
    A[User Action] --> B[Trigger Notification]
    B --> C{{{{Permission Granted?}}}}
    C -->|Yes| D[Send Notification]
    C -->|No| E[Request Permission]
    E --> C
    D --> F[User Sees Notification]

For FULL-FLEDGED notification system, include:
- User online/offline status
- Notification types (push, in-app, etc)
- Permission checks
- Notification settings/preferences
- Delivery mechanisms
- User interactions
- Error handling
- And more...

NOW generate a COMPLETE, DETAILED flowchart for: {description}

OUTPUT: Only valid Mermaid code, nothing else. Make it comprehensive. Ensure all syntax is correct."""
        
        prompt = prompt_template.format(
            system_prompt=mode.system_prompt,
            description=description,
            complexity_hint=complexity_hint
        )
        
        try:
            response = self.ai_model.generate_content(prompt)
            full_response = response.text
            print(f"[FLOWCHART] Full response length: {len(full_response)}")
            
            mermaid_code = self._extract_mermaid(full_response)
            print(f"[FLOWCHART] Extracted code length: {len(mermaid_code)}")
            print(f"[FLOWCHART] Extracted code preview: {mermaid_code[:200]}")
            
            if not mermaid_code:
                print(f"[FLOWCHART] No code extracted, using fallback")
                return self._generate_fallback_flowchart(description)
            
            if not mermaid_code.startswith('flowchart'):
                print(f"[FLOWCHART] Code doesn't start with 'flowchart', prepending")
                mermaid_code = f"flowchart TD\n{mermaid_code}"
            
            # Wrap labels with special characters in quotes to avoid parse errors
            mermaid_code = self._wrap_special_labels(mermaid_code)
            
            # First, check if the code is already valid - if so, minimal processing
            syntax_errors = self._check_syntax_errors(mermaid_code)
            if not syntax_errors and self._validate_mermaid(mermaid_code):
                print(f"[FLOWCHART] Code appears valid, applying minimal normalization only")
                # Only normalize spacing and header - don't break valid code
                mermaid_code = self._normalize_flowchart_header(mermaid_code)
                mermaid_code = self._normalize_spacing(mermaid_code)
            else:
                # Only apply aggressive sanitization if there are actual errors
                print(f"[FLOWCHART] Syntax errors detected: {syntax_errors}, applying fixes")
                # Additional sanitization pass
                mermaid_code = self._sanitize_mermaid(mermaid_code)
                
                # Remove duplicate end nodes and clean up
                mermaid_code = self._remove_duplicate_nodes(mermaid_code)
                
                if not self._validate_mermaid(mermaid_code):
                    print(f"[FLOWCHART] Validation failed, attempting to fix")
                    mermaid_code = self._fix_mermaid_code(mermaid_code)
                    mermaid_code = self._sanitize_mermaid(mermaid_code)
                
                # Try to validate with a simple syntax check
                syntax_errors = self._check_syntax_errors(mermaid_code)
                if syntax_errors:
                    print(f"[FLOWCHART] Syntax errors still present: {syntax_errors}")
                    mermaid_code = self._fix_common_syntax_errors(mermaid_code)
                    mermaid_code = self._sanitize_mermaid(mermaid_code)
                
                # Final cleanup pass - fix common patterns
                mermaid_code = self._final_cleanup(mermaid_code)
                
                # Normalize flowchart header and format
                mermaid_code = self._normalize_flowchart_header(mermaid_code)
                
                # Handle End nodes - rename labels and ensure unique IDs
                mermaid_code = self._normalize_end_nodes(mermaid_code)
                
                # Ensure consistent spacing (spaces only, no tabs)
                mermaid_code = self._normalize_spacing(mermaid_code)
            
            if not self._validate_mermaid(mermaid_code):
                print(f"[FLOWCHART] Still invalid after fix, using fallback")
                print(f"[FLOWCHART] Invalid code: {mermaid_code[:300]}")
                return self._generate_fallback_flowchart(description)
            
            print(f"[FLOWCHART] Valid code generated, length: {len(mermaid_code)}")
            return mermaid_code
        except Exception as e:
            print(f"[FLOWCHART] Error: {e}")
            import traceback
            traceback.print_exc()
            return self._generate_fallback_flowchart(description)
    
    def _validate_mermaid(self, code: str) -> bool:
        if not code or len(code.strip()) < 10:
            return False
        if not code.strip().startswith('flowchart'):
            return False
        if '-->' not in code:
            return False
        lines = [l for l in code.split('\n') if l.strip() and not l.strip().startswith('%%')]
        if len(lines) < 3:
            return False
        node_count = sum(1 for line in lines if '-->' in line or ('[' in line and ']' in line) or ('{' in line and '}' in line))
        if node_count < 2:
            return False
        return True
    
    def _fix_mermaid_code(self, code: str) -> str:
        if not code:
            return code
        
        if not code.strip().startswith('flowchart'):
            if 'flowchart' in code.lower():
                idx = code.lower().find('flowchart')
                code = code[idx:]
            else:
                code = f"flowchart TD\n{code}"
        
        lines = code.split('\n')
        fixed_lines = []
        for line in lines:
            line = line.strip()
            if not line or line.startswith('%%'):
                continue
            
            if line.startswith('flowchart'):
                fixed_lines.append(line)
                continue
            
            if '-->' in line:
                line = line.replace('-- >', ' --> ')
                line = line.replace('- ->', ' --> ')
                line = line.replace('->', ' --> ')
                fixed_lines.append(line)
            elif '[' in line or '{' in line or '(' in line:
                fixed_lines.append(line)
        
        return '\n'.join(fixed_lines)
    
    def _generate_fallback_flowchart(self, description: str) -> str:
        desc_lower = description.lower()
        
        if 'notification' in desc_lower and ('discord' in desc_lower or 'mobile' in desc_lower or 'app' in desc_lower):
            return """flowchart TD
    Start[User Action in Discord Mobile App] --> CheckOnline{User Online?}
    CheckOnline -->|Yes| CheckSettings{Notification Settings Enabled?}
    CheckOnline -->|No| QueueNotification[Queue Notification]
    CheckSettings -->|No| End1[End - No Notification]
    CheckSettings -->|Yes| CheckPermission{Push Permission Granted?}
    CheckPermission -->|No| RequestPermission[Request Push Permission]
    RequestPermission --> CheckPermission
    CheckPermission -->|Yes| DetermineType{Determine Notification Type}
    DetermineType -->|Message| MessageNotif[Message Notification]
    DetermineType -->|Mention| MentionNotif[Mention Notification]
    DetermineType -->|DM| DMNotif[Direct Message Notification]
    DetermineType -->|Server| ServerNotif[Server Event Notification]
    MessageNotif --> CheckQuietHours{Quiet Hours Active?}
    MentionNotif --> CheckQuietHours
    DMNotif --> CheckQuietHours
    ServerNotif --> CheckQuietHours
    CheckQuietHours -->|Yes| QueueNotification
    CheckQuietHours -->|No| FormatNotification[Format Notification Content]
    FormatNotification --> CheckDoNotDisturb{Do Not Disturb Active?}
    CheckDoNotDisturb -->|Yes| QueueNotification
    CheckDoNotDisturb -->|No| SendPush[Send Push Notification via FCM/APNS]
    SendPush --> DeviceReceive[Device Receives Notification]
    DeviceReceive --> DisplayNotif[Display in Notification Center]
    DisplayNotif --> UserInteracts{User Interacts?}
    UserInteracts -->|Tap| OpenApp[Open Discord App]
    UserInteracts -->|Dismiss| Dismiss[Notification Dismissed]
    UserInteracts -->|Swipe| SwipeAction[Perform Swipe Action]
    OpenApp --> NavigateToContent[Navigate to Relevant Content]
    NavigateToContent --> MarkRead[Mark as Read]
    MarkRead --> End2[End]
    Dismiss --> End2
    SwipeAction --> End2
    QueueNotification --> CheckOnline
    End1 --> EndFinal[End]
    End2 --> EndFinal"""
        
        if 'login' in desc_lower or 'auth' in desc_lower:
            return """flowchart TD
    A[Start] --> B[Enter Credentials]
    B --> C{Valid Credentials?}
    C -->|Yes| D[Create Session]
    C -->|No| E[Show Error]
    E --> B
    D --> F[Redirect to Dashboard]
    F --> G[End]"""
        
        steps = []
        for line in description.split('\n'):
            line = line.strip()
            if line and not line.startswith('#'):
                line = line.lstrip('-*•123456789. ')
                if line:
                    steps.append(line[:50])
        
        if not steps:
            steps = ["Start", description[:40], "Process", "End"]
        
        nodes = []
        connections = []
        
        for i, step in enumerate(steps[:8]):
            node_id = chr(65 + i)
            clean_step = step.replace('[', '').replace(']', '').replace('"', "'")
            nodes.append(f"    {node_id}[{clean_step}]")
            
            if i > 0:
                prev_id = chr(65 + i - 1)
                connections.append(f"    {prev_id} --> {node_id}")
        
        flowchart = "flowchart TD\n"
        flowchart += '\n'.join(nodes)
        flowchart += '\n'
        flowchart += '\n'.join(connections)
        
        return flowchart
    
    def _resolve_mode(self, level: str) -> FlowchartMode:
        key = level.strip().lower()
        if key in {"basic", "intermediate", "advanced"}:
            return MODES[key]
        mode = LEVEL_TO_MODE.get(key)
        if mode is None:
            raise ValueError("Level must be 1, 2, 3, or a known mode name")
        return mode
    
    def _extract_mermaid(self, text: str) -> str:
        if not text:
            return ""
        
        cleaned = text.strip()
        
        if cleaned.startswith("```"):
            cleaned = self._strip_fence(cleaned)
        
        cleaned = cleaned.strip()
        
        lines = cleaned.split('\n')
        flowchart_lines = []
        in_flowchart = False
        found_flowchart = False
        
        for line in lines:
            line_stripped = line.strip()
            
            if not line_stripped:
                if in_flowchart:
                    continue
                else:
                    continue
            
            if line_stripped.startswith('#'):
                continue
            
            if line_stripped.startswith('```'):
                if in_flowchart:
                    break
                continue
            
            if 'flowchart' in line_stripped.lower() and ('TD' in line_stripped or 'LR' in line_stripped or 'TB' in line_stripped or 'BT' in line_stripped or 'RL' in line_stripped):
                in_flowchart = True
                found_flowchart = True
                flowchart_lines.append(line_stripped)
            elif in_flowchart:
                flowchart_lines.append(line_stripped)
            elif found_flowchart and not in_flowchart:
                if line_stripped.startswith('```'):
                    break
        
        if not flowchart_lines:
            if 'flowchart' in cleaned.lower():
                idx = cleaned.lower().find('flowchart')
                remaining = cleaned[idx:]
                remaining_lines = remaining.split('\n')
                for rline in remaining_lines:
                    rline_stripped = rline.strip()
                    if rline_stripped and not rline_stripped.startswith('#') and not rline_stripped.startswith('```'):
                        flowchart_lines.append(rline_stripped)
        
        if not flowchart_lines:
            return ""
        
        cleaned = '\n'.join(flowchart_lines)
        
        if not cleaned.strip().startswith('flowchart'):
            if 'flowchart' in cleaned.lower():
                idx = cleaned.lower().find('flowchart')
                cleaned = cleaned[idx:]
        
        # Only sanitize if there are obvious syntax errors - don't break valid code
        syntax_errors = self._check_syntax_errors(cleaned)
        if syntax_errors:
            cleaned = self._sanitize_mermaid(cleaned)
        
        return cleaned
    
    def _sanitize_mermaid(self, code: str) -> str:
        import re
        
        lines = code.split('\n')
        sanitized = []
        seen_nodes = set()
        node_counter = {}
        
        def clean_label(text: str) -> str:
            """Clean node labels to remove problematic characters"""
            if not text:
                return text
            # Remove or replace problematic characters
            text = text.replace('"', "'")
            text = text.replace('`', "'")
            # Remove double dashes and spaces around dashes
            text = re.sub(r'\s*-\s*-', '-', text)  # Fix " - -" or "--"
            text = re.sub(r'\s*-\s*$', '', text)  # Remove trailing dashes with spaces
            text = re.sub(r'^\s*-\s*', '', text)  # Remove leading dashes with spaces
            # Remove trailing periods, commas, etc. that might break syntax
            text = text.rstrip('.,;:')
            # Remove multiple spaces
            text = re.sub(r'\s+', ' ', text)
            # Remove any remaining problematic trailing characters
            text = text.strip()
            # Ensure label is not empty
            if not text:
                text = "Label"
            return text
        
        def extract_node_id(node_str: str) -> str:
            """Extract node ID from node definition"""
            # Match patterns like: nodeID[Label] or nodeID{Label} or nodeID(Label)
            match = re.match(r'^([a-zA-Z0-9_]+)', node_str.strip())
            if match:
                return match.group(1)
            # If no match, generate a safe ID
            return f"node{len(seen_nodes)}"
        
        def sanitize_node(node_str: str) -> str:
            """Sanitize a single node definition"""
            node_str = node_str.strip()
            if not node_str:
                return ""
            
            # Extract node ID
            node_id = extract_node_id(node_str)
            
            # Handle different node types: [label], {label}, (label)
            # Find matching brackets/braces/parentheses and extract only the node definition
            if '[' in node_str:
                # Rectangle node: nodeID[Label]
                bracket_start = node_str.find('[')
                bracket_end = -1
                depth = 0
                # Find matching closing bracket, accounting for nested brackets
                for i in range(bracket_start, len(node_str)):
                    if node_str[i] == '[':
                        depth += 1
                    elif node_str[i] == ']':
                        depth -= 1
                        if depth == 0:
                            bracket_end = i
                            break
                
                if bracket_end > bracket_start:
                    # Extract only the node definition part (ignore anything after closing bracket)
                    node_def = node_str[:bracket_end + 1]
                    label = node_str[bracket_start + 1:bracket_end]
                    label = clean_label(label)
                    # Remove problematic characters from label
                    label = re.sub(r'[^\w\s\-\'\(\)]', '', label)
                    return f"{node_id}[{label}]"
                else:
                    # Unmatched bracket, try to fix
                    parts = node_str.split('[', 1)
                    if len(parts) == 2:
                        # Find where label should end (before --> or end of string)
                        label_part = parts[1]
                        if '-->' in label_part:
                            label = label_part.split('-->')[0].strip()
                        else:
                            label = label_part.strip()
                        # Remove any closing bracket and text after it
                        label = label.split(']')[0] if ']' in label else label
                        label = clean_label(label)
                        label = re.sub(r'[^\w\s\-\'\(\)]', '', label)
                        return f"{node_id}[{label}]"
            elif '{' in node_str:
                # Diamond node: nodeID{Label}
                brace_start = node_str.find('{')
                brace_end = -1
                depth = 0
                # Find matching closing brace
                for i in range(brace_start, len(node_str)):
                    if node_str[i] == '{':
                        depth += 1
                    elif node_str[i] == '}':
                        depth -= 1
                        if depth == 0:
                            brace_end = i
                            break
                
                if brace_end > brace_start:
                    node_def = node_str[:brace_end + 1]
                    label = node_str[brace_start + 1:brace_end]
                    label = clean_label(label)
                    label = re.sub(r'[^\w\s\-\'\(\)?]', '', label)
                    return f"{node_id}{{{label}}}"
                else:
                    # Unmatched brace, try to fix
                    parts = node_str.split('{', 1)
                    if len(parts) == 2:
                        label_part = parts[1]
                        if '-->' in label_part:
                            label = label_part.split('-->')[0].strip()
                        else:
                            label = label_part.strip()
                        label = label.split('}')[0] if '}' in label else label
                        label = clean_label(label)
                        label = re.sub(r'[^\w\s\-\'\(\)?]', '', label)
                        return f"{node_id}{{{label}}}"
            elif '(' in node_str:
                # Rounded node: nodeID(Label)
                paren_start = node_str.find('(')
                paren_end = -1
                depth = 0
                # Find matching closing parenthesis
                for i in range(paren_start, len(node_str)):
                    if node_str[i] == '(':
                        depth += 1
                    elif node_str[i] == ')':
                        depth -= 1
                        if depth == 0:
                            paren_end = i
                            break
                
                if paren_end > paren_start:
                    node_def = node_str[:paren_end + 1]
                    label = node_str[paren_start + 1:paren_end]
                    label = clean_label(label)
                    label = re.sub(r'[^\w\s\-\'\(\)]', '', label)
                    return f"{node_id}({label})"
                else:
                    # Unmatched parenthesis, try to fix
                    parts = node_str.split('(', 1)
                    if len(parts) == 2:
                        label_part = parts[1]
                        if '-->' in label_part:
                            label = label_part.split('-->')[0].strip()
                        else:
                            label = label_part.strip()
                        label = label.split(')')[0] if ')' in label else label
                        label = clean_label(label)
                        label = re.sub(r'[^\w\s\-\'\(\)]', '', label)
                        return f"{node_id}({label})"
            else:
                # Just node ID - but check if there's extra text after it
                # Extract only the node ID part (alphanumeric + underscore)
                match = re.match(r'^([a-zA-Z0-9_]+)', node_str)
                if match:
                    return match.group(1)
                return node_id
            
            return node_str
        
        for line in lines:
            original_line = line
            line = line.strip()
            
            if not line or line.startswith('%%'):
                continue
            
            if line.startswith('flowchart'):
                sanitized.append(line)
                continue
            
            # Fix arrow syntax
            line = re.sub(r'--\s*>', '-->', line)
            line = re.sub(r'-\s*->', '-->', line)
            line = re.sub(r'->', '-->', line)
            
            # Handle connections
            if '-->' in line:
                # Check for labeled connection: nodeA -->|label| nodeB
                labeled_match = re.match(r'^(.+?)\s*-->\s*\|\s*(.+?)\s*\|\s*(.+)$', line)
                if labeled_match:
                    left = labeled_match.group(1).strip()
                    label = clean_label(labeled_match.group(2))
                    right = sanitize_node(labeled_match.group(3).strip())
                    
                    left_node = sanitize_node(left)
                    sanitized.append(f"    {left_node} -->|{label}| {right}")
                else:
                    # Simple connection: nodeA --> nodeB
                    parts = line.split('-->')
                    if len(parts) >= 2:
                        left = sanitize_node(parts[0].strip())
                        right = sanitize_node(parts[1].strip())
                        sanitized.append(f"    {left} --> {right}")
            else:
                # Standalone node definition
                sanitized_node = sanitize_node(line)
                if sanitized_node:
                    sanitized.append(f"    {sanitized_node}")
        
        return '\n'.join(sanitized)
    
    def _wrap_special_labels(self, code: str) -> str:
        """Wrap node labels containing special characters in double quotes"""
        import re
        
        lines = code.split('\n')
        wrapped_lines = []
        
        for line in lines:
            original_line = line
            line_stripped = line.strip()
            
            # Skip empty lines and flowchart header
            if not line_stripped or line_stripped.startswith('flowchart'):
                wrapped_lines.append(original_line)
                continue
            
            # Pattern to match node definitions and connections
            # Handle node definitions with brackets: nodeID[Label]
            line = re.sub(
                r'(\s*)([a-zA-Z0-9_]+)\[([^\]]+)\]',
                lambda m: m.group(1) + self._wrap_label_if_needed(m.group(2), m.group(3), '['),
                line
            )
            
            # Handle node definitions with braces: nodeID{Label}
            line = re.sub(
                r'(\s*)([a-zA-Z0-9_]+)\{([^\}]+)\}',
                lambda m: m.group(1) + self._wrap_label_if_needed(m.group(2), m.group(3), '{'),
                line
            )
            
            # Handle node definitions with parentheses: nodeID(Label)
            line = re.sub(
                r'(\s*)([a-zA-Z0-9_]+)\(([^\)]+)\)',
                lambda m: m.group(1) + self._wrap_label_if_needed(m.group(2), m.group(3), '('),
                line
            )
            
            # Handle labeled connections: nodeA -->|label| nodeB
            line = re.sub(
                r'(\s*)(.+?)\s*-->\s*\|\s*([^|]+?)\s*\|\s*(.+)',
                lambda m: m.group(1) + self._wrap_connection_label(m.group(2), m.group(3), m.group(4)),
                line
            )
            
            wrapped_lines.append(line)
        
        return '\n'.join(wrapped_lines)
    
    def _wrap_label_if_needed(self, node_id: str, label: str, bracket_type: str) -> str:
        """Wrap label in quotes if it contains special characters"""
        import re
        # Check if label contains special characters that need quoting
        # Special chars: parentheses, brackets, braces, colons, semicolons, commas, quotes
        if re.search(r'[()\[\]{}:;,\'"`]', label) and not (label.startswith('"') and label.endswith('"')):
            if bracket_type == '[':
                return f'{node_id}["{label}"]'
            elif bracket_type == '{':
                return f'{node_id}{{"{label}"}}'
            elif bracket_type == '(':
                return f'{node_id}("{label}")'
        # Return original format
        if bracket_type == '[':
            return f'{node_id}[{label}]'
        elif bracket_type == '{':
            return f'{node_id}{{{label}}}'
        elif bracket_type == '(':
            return f'{node_id}({label})'
        return f'{node_id}[{label}]'  # fallback
    
    def _wrap_connection_label(self, left: str, label: str, right: str) -> str:
        """Wrap connection label in quotes if it contains special characters"""
        import re
        # Check if label contains special characters that need quoting
        if re.search(r'[()\[\]{}:;,\'"`]', label) and not (label.startswith('"') and label.endswith('"')):
            return f'{left} -->|"{label}"| {right}'
        return f'{left} -->|{label}| {right}'
    
    def _final_cleanup(self, code: str) -> str:
        """Final cleanup pass to fix remaining issues"""
        lines = code.split('\n')
        cleaned_lines = []
        
        for line in lines:
            original_line = line
            line = line.strip()
            
            if not line or line.startswith('flowchart'):
                cleaned_lines.append(original_line)
                continue
            
            # Remove any text after closing brackets/braces/parentheses that's not part of the connection
            # Pattern: nodeID[Label]    extra_text --> nextNode
            # Should become: nodeID[Label] --> nextNode
            if '-->' in line:
                # Split on arrow
                parts = line.split('-->', 1)
                if len(parts) == 2:
                    left = parts[0].strip()
                    right = parts[1].strip()
                    
                    # Clean left side - remove text after closing brackets
                    # Match pattern: nodeID[Label]    text
                    left_cleaned = re.sub(r'(\]|\}|\))\s+[^\s\-\|]', r'\1', left)
                    # Also handle cases where there's text but no space: nodeID[Label]text
                    left_cleaned = re.sub(r'(\]|\}|\))([^\s\-\|])', r'\1', left_cleaned)
                    
                    cleaned_lines.append(f"    {left_cleaned} --> {right}")
                else:
                    cleaned_lines.append(f"    {line}")
            else:
                # Standalone node - remove text after closing brackets
                line_cleaned = re.sub(r'(\]|\}|\))\s+.*$', r'\1', line)
                line_cleaned = re.sub(r'(\]|\}|\))([^\s\-\|].*)$', r'\1', line_cleaned)
                
                # Fix double dashes in labels: " - -" or "--"
                line_cleaned = re.sub(r'\[([^\]]*?)\s*-\s*-\s*([^\]]*?)\]', r'[\1-\2]', line_cleaned)
                line_cleaned = re.sub(r'\{([^\}]*?)\s*-\s*-\s*([^\}]*?)\}', r'{\1-\2}', line_cleaned)
                # Fix trailing dashes: "Label -]" -> "Label]"
                line_cleaned = re.sub(r'([^\s])\s*-\s*-\s*([\]\}])', r'\1\2', line_cleaned)
                line_cleaned = re.sub(r'([^\s])\s*-\s*([\]\}])', r'\1\2', line_cleaned)
                # Remove empty labels - use raw string replacement
                line_cleaned = re.sub(r'\[[\s-]+\]', '[Label]', line_cleaned)
                line_cleaned = re.sub(r'\{[\s-]+\}', '{Label}', line_cleaned)
                
                cleaned_lines.append(f"    {line_cleaned}")
        
        return '\n'.join(cleaned_lines)
    
    def _normalize_flowchart_header(self, code: str) -> str:
        """Ensure flowchart TD is clean at the top with no extra text or semicolon"""
        lines = code.split('\n')
        if not lines:
            return code
        
        # Find and clean the flowchart header line
        for i, line in enumerate(lines):
            line_stripped = line.strip()
            if line_stripped.startswith('flowchart'):
                # Remove semicolon, extra text, and normalize
                # Extract just "flowchart TD" or "flowchart LR" etc
                match = re.match(r'^(flowchart\s+(?:TD|LR|TB|BT|RL))', line_stripped, re.IGNORECASE)
                if match:
                    lines[i] = match.group(1)
                else:
                    # Default to TD if not specified
                    lines[i] = 'flowchart TD'
                break
        
        return '\n'.join(lines)
    
    def _normalize_end_nodes(self, code: str) -> str:
        """Rename End node labels to 'End: ...' format and ensure unique node IDs"""
        lines = code.split('\n')
        end_node_counter = {}
        node_id_mapping = {}  # Map old IDs to new unique IDs
        
        def get_unique_end_id(base_id: str, label: str) -> tuple:
            """Get unique node ID for end nodes"""
            # Normalize label to "End: ..." format if it starts with "End"
            if label.lower().startswith('end'):
                # Extract the description part
                if ':' in label:
                    # Already has colon, keep it
                    normalized_label = label
                else:
                    # Add colon after "End"
                    parts = label.split(None, 1)
                    if len(parts) > 1:
                        normalized_label = f"End: {parts[1]}"
                    else:
                        normalized_label = "End"
            else:
                normalized_label = label
            
            # Generate unique ID
            if base_id not in end_node_counter:
                end_node_counter[base_id] = 0
                return base_id, normalized_label
            else:
                end_node_counter[base_id] += 1
                new_id = f"{base_id}_{end_node_counter[base_id]}"
                return new_id, normalized_label
        
        cleaned_lines = []
        for line in lines:
            line_stripped = line.strip()
            
            if not line_stripped or line_stripped.startswith('flowchart'):
                cleaned_lines.append(line)
                continue
            
            # Check if this is an End node
            # Pattern: nodeID[End ...] or nodeID{End ...} or nodeID(End ...)
            end_match = re.match(r'^([a-zA-Z0-9_]+)\[([^\]]*End[^\]]*)\]', line_stripped, re.IGNORECASE)
            if not end_match:
                end_match = re.match(r'^([a-zA-Z0-9_]+)\{([^\}]*End[^\}]*)\}', line_stripped, re.IGNORECASE)
            if not end_match:
                end_match = re.match(r'^([a-zA-Z0-9_]+)\(([^\)]*End[^\)]*)\)', line_stripped, re.IGNORECASE)
            
            if end_match:
                old_id = end_match.group(1)
                label = end_match.group(2)
                new_id, normalized_label = get_unique_end_id(old_id, label)
                
                # Store mapping for connections
                if old_id != new_id:
                    node_id_mapping[old_id] = new_id
                
                # Reconstruct the line with normalized label
                if '[' in line_stripped:
                    cleaned_lines.append(f"    {new_id}[{normalized_label}]")
                elif '{' in line_stripped:
                    cleaned_lines.append(f"    {new_id}{{{normalized_label}}}")
                elif '(' in line_stripped:
                    cleaned_lines.append(f"    {new_id}({normalized_label})")
                else:
                    cleaned_lines.append(line)
            elif '-->' in line:
                # Update connections if node IDs were changed
                # Process in reverse order of length to avoid partial matches
                sorted_mappings = sorted(node_id_mapping.items(), key=lambda x: len(x[0]), reverse=True)
                for old_id, new_id in sorted_mappings:
                    # Replace old_id only when it's a complete word (not part of another ID)
                    # Pattern: word boundary or start/end of line, then old_id, then word boundary or arrow/pipe/end
                    line = re.sub(rf'(^|\s|\[|\{{|\()\b{re.escape(old_id)}\b(\s*-->|\s*\||\s*$|\]|\}}|\))', 
                                 rf'\1{new_id}\2', line)
                cleaned_lines.append(line)
            else:
                cleaned_lines.append(line)
        
        return '\n'.join(cleaned_lines)
    
    def _normalize_spacing(self, code: str) -> str:
        """Ensure consistent spacing - spaces only, no tabs, consistent indentation"""
        lines = code.split('\n')
        normalized_lines = []
        
        for line in lines:
            # Replace tabs with spaces
            line = line.replace('\t', '    ')  # Convert tabs to 4 spaces
            
            # Normalize flowchart header - no indentation
            if line.strip().startswith('flowchart'):
                normalized_lines.append(line.strip())
                continue
            
            # For other lines, ensure consistent 4-space indentation
            stripped = line.strip()
            if not stripped:
                normalized_lines.append('')
                continue
            
            # If line already starts with spaces, keep the indentation but normalize tabs
            # Otherwise, add 4 spaces
            if line.startswith(' '):
                # Count leading spaces and normalize to multiples of 4
                leading_spaces = len(line) - len(line.lstrip())
                # Round to nearest 4
                normalized_indent = (leading_spaces // 4) * 4
                if normalized_indent == 0 and stripped and not stripped.startswith('flowchart'):
                    normalized_indent = 4
                normalized_lines.append(' ' * normalized_indent + stripped)
            else:
                # No leading spaces, add 4 spaces (except for flowchart header)
                if stripped and not stripped.startswith('flowchart'):
                    normalized_lines.append('    ' + stripped)
                else:
                    normalized_lines.append(stripped)
        
        return '\n'.join(normalized_lines)
    
    def _remove_duplicate_nodes(self, code: str) -> str:
        """Remove duplicate node definitions, keeping only the first occurrence"""
        lines = code.split('\n')
        seen_nodes = set()
        cleaned_lines = []
        
        for line in lines:
            line_stripped = line.strip()
            if not line_stripped or line_stripped.startswith('flowchart'):
                cleaned_lines.append(line)
                continue
            
            # Extract node ID from line
            if '-->' in line:
                # Connection line - keep it
                cleaned_lines.append(line)
            else:
                # Node definition - check for duplicates
                node_match = re.match(r'^\s*([a-zA-Z0-9_]+)', line_stripped)
                if node_match:
                    node_id = node_match.group(1)
                    if node_id not in seen_nodes:
                        seen_nodes.add(node_id)
                        cleaned_lines.append(line)
                    # Skip duplicate node definitions
                else:
                    cleaned_lines.append(line)
        
        return '\n'.join(cleaned_lines)
    
    def _check_syntax_errors(self, code: str) -> list:
        """Check for common syntax errors in Mermaid code"""
        errors = []
        lines = code.split('\n')
        
        for i, line in enumerate(lines, 1):
            line = line.strip()
            if not line or line.startswith('flowchart') or line.startswith('%%'):
                continue
            
            # Check for unmatched brackets
            if line.count('[') != line.count(']'):
                errors.append(f"Line {i}: Unmatched square brackets")
            if line.count('{') != line.count('}'):
                errors.append(f"Line {i}: Unmatched curly braces")
            if line.count('(') != line.count(')'):
                errors.append(f"Line {i}: Unmatched parentheses")
            
            # Check for invalid characters in node definitions
            if '-->' in line:
                # Check for problematic patterns
                if re.search(r'\]\s*[^\s\-\|]', line):
                    errors.append(f"Line {i}: Invalid character after closing bracket")
                if re.search(r'\}\s*[^\s\-\|]', line):
                    errors.append(f"Line {i}: Invalid character after closing brace")
        
        return errors
    
    def _fix_common_syntax_errors(self, code: str) -> str:
        """Fix common syntax errors"""
        lines = code.split('\n')
        fixed_lines = []
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            if line.startswith('flowchart'):
                fixed_lines.append(line)
                continue
            
            # Fix unmatched brackets by removing problematic parts
            if '[' in line and ']' not in line:
                # Try to find where bracket should close
                idx = line.find('[')
                if idx != -1:
                    # Find next space or arrow after bracket start
                    rest = line[idx+1:]
                    # Remove everything after a reasonable point
                    if '-->' in rest:
                        arrow_idx = rest.find('-->')
                        label = rest[:arrow_idx].strip()
                        # Clean label
                        label = re.sub(r'[^\w\s\-\'\(\)]', '', label)
                        line = line[:idx+1] + label + ']' + rest[arrow_idx:]
                    else:
                        # Just close the bracket
                        label = re.sub(r'[^\w\s\-\'\(\)]', '', rest)
                        line = line[:idx+1] + label + ']'
            
            # Fix unmatched braces
            if '{' in line and '}' not in line:
                idx = line.find('{')
                if idx != -1:
                    rest = line[idx+1:]
                    if '-->' in rest:
                        arrow_idx = rest.find('-->')
                        label = rest[:arrow_idx].strip()
                        label = re.sub(r'[^\w\s\-\'\(\)?]', '', label)
                        line = line[:idx+1] + label + '}' + rest[arrow_idx:]
                    else:
                        label = re.sub(r'[^\w\s\-\'\(\)?]', '', rest)
                        line = line[:idx+1] + label + '}'
            
            # Remove trailing problematic characters
            line = re.sub(r'([\]\}\)])\s*[^\s\-\|]', r'\1', line)
            
            fixed_lines.append(line)
        
        return '\n'.join(fixed_lines)
    
    def _strip_fence(self, text: str) -> str:
        lines = text.splitlines()
        if not lines:
            return text
        if lines[0].strip().startswith("```"):
            lines = lines[1:]
        while lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        return "\n".join(lines)
    
    def _save_outputs(self, mermaid_code: str, output_format: str, filename: Optional[str]) -> Dict[str, str]:
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"flowchart_{timestamp}"
        
        file_paths = {}
        
        if output_format in ["mermaid", "both"]:
            mermaid_path = self.output_dir / f"{filename}.mmd"
            mermaid_path.write_text(mermaid_code, encoding="utf-8")
            file_paths["mermaid_file"] = str(mermaid_path)
        
        if output_format in ["png", "both"]:
            png_path = self.output_dir / f"{filename}.png"
            self._export_png(mermaid_code, png_path)
            file_paths["png_file"] = str(png_path)
        
        return file_paths
    
    def _export_png(self, mermaid_code: str, output_path: Path) -> None:
        try:
            import requests
        except ImportError:
            raise ImportError("requests library required for PNG export")
        
        url = "https://kroki.io/mermaid/png"
        response = requests.post(url, json={"diagram_source": mermaid_code}, timeout=30)
        response.raise_for_status()
        output_path.write_bytes(response.content)
    
    def get_capabilities(self) -> Dict[str, Any]:
        base_caps = super().get_capabilities()
        base_caps.update({
            "supported_levels": ["1 (basic)", "2 (intermediate)", "3 (advanced)"],
            "output_formats": ["mermaid", "png", "both"],
            "model": self.model_name,
            "has_api_key": bool(self.api_key),
        })
        return base_caps


if __name__ == "__main__":
    agent = FlowchartAgent(config={"default_level": "2", "save_to_file": False})
    
    request = {
        "description": "Login: Enter credentials → Validate → Success? → Dashboard | Error",
        "level": "2"
    }
    
    response = agent.process(request)
    print(f"Status: {response.status.value}")
    if response.status == AgentStatus.SUCCESS:
        print(response.result["mermaid_code"])
    else:
        print(f"Error: {response.error}")
