from __future__ import annotations

import os
import re
from typing import Any, Dict, Optional

from agents.base_agent import BaseAgent, AgentResponse, AgentStatus

try:
    import requests
except ImportError:
    raise ImportError("Install requests: pip install requests")

try:
    import google.generativeai as genai
except ImportError:
    raise ImportError("Install google-genai: pip install google-genai")


class EmailAgent(BaseAgent):
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(
            name="Email Agent",
            description="Cleans inbox, drafts replies, and spots follow-up items",
            config=config
        )
        
        self.mailgun_api_key = self.config.get("mailgun_api_key") or os.getenv("MAILGUN_API_KEY")
        self.mailgun_domain = self.config.get("mailgun_domain") or os.getenv("MAILGUN_DOMAIN")
        self.from_email = self.config.get("from_email") or os.getenv("FROM_EMAIL")
        self.gemini_api_key = self.config.get("gemini_api_key") or os.getenv("GEMINI_API_KEY")
        self.model_name = self.config.get("model_name", "gemini-2.0-flash")
        
        if self.gemini_api_key:
            genai.configure(api_key=self.gemini_api_key)
            self.ai_model = genai.GenerativeModel(self.model_name)
        else:
            self.ai_model = None
    
    def process(self, request: Dict[str, Any]) -> AgentResponse:
        self.status = AgentStatus.PROCESSING
        
        try:
            action = request.get("action", "send")
            
            if action == "send":
                return self._send_email(request)
            elif action == "draft":
                return self._draft_email(request)
            elif action == "reply":
                return self._draft_reply(request)
            else:
                raise ValueError(f"Unknown action: {action}")
                
        except Exception as exc:
            self.status = AgentStatus.ERROR
            return AgentResponse(
                agent_name=self.name,
                status=AgentStatus.ERROR,
                result=None,
                error=str(exc),
                metadata={"request": request}
            )
    
    def _send_email(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["to", "subject", "body"])
        
        to_email = request["to"]
        subject = request["subject"]
        body = request["body"]
        is_html = request.get("html", True)
        
        if is_html and not body.strip().startswith("<"):
            body = self._convert_to_html(body)
        
        response = requests.post(
            f"https://api.mailgun.net/v3/{self.mailgun_domain}/messages",
            auth=("api", self.mailgun_api_key),
            data={
                "from": self.from_email,
                "to": to_email,
                "subject": subject,
                "html" if is_html else "text": body
            }
        )
        
        if response.status_code == 200:
            self.status = AgentStatus.SUCCESS
            return AgentResponse(
                agent_name=self.name,
                status=AgentStatus.SUCCESS,
                result={
                    "sent": True,
                    "to": to_email,
                    "subject": subject,
                    "message_id": response.json().get("id")
                },
                metadata={"mailgun_response": response.json()}
            )
        else:
            raise Exception(f"Mailgun error: {response.text}")
    
    def _draft_email(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["prompt"])
        
        if not self.ai_model:
            raise ValueError("Gemini API key required for drafting emails")
        
        prompt = request["prompt"]
        tone = request.get("tone", "professional but friendly")
        
        # Extract recipient email from prompt
        import re
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        email_matches = re.findall(email_pattern, prompt)
        to_email = email_matches[0] if email_matches else ""
        
        # Extract recipient name if mentioned
        name_pattern = r'(?:to|for|send to|email to|write to)\s+([A-Z][a-z]+)'
        name_match = re.search(name_pattern, prompt, re.IGNORECASE)
        recipient_name = name_match.group(1) if name_match else ""
        
        system_prompt = f"""You are an expert email writer. Create a professional, well-formatted email.

REQUIREMENTS:
1. Tone: {tone}
2. Greeting: Use "Hi" or "Hey" followed by the recipient's name if provided (avoid "Dear")
3. Keep it concise and clear
4. Professional but friendly
5. Proper email structure: greeting, body, closing
6. HTML format with clean styling

User request: {prompt}
{f"Recipient name: {recipient_name}" if recipient_name else ""}
{f"Recipient email: {to_email}" if to_email else ""}

Return ONLY the HTML body (no subject line). Include:
- Proper greeting with name if provided (e.g., "Hi {recipient_name}" or "Hi Abhi")
- Clear message body with paragraphs
- Professional closing (Best regards, Thanks, etc.)
- No extra explanations outside the email"""

        response = self.ai_model.generate_content(system_prompt)
        html_body = response.text.strip()
        
        # Remove markdown code block markers (handle multiple variations)
        html_body = html_body.replace("```html", "").replace("```", "").strip()
        
        # Extract body content if full HTML document
        if "<body" in html_body:
            body_match = re.search(r'<body[^>]*>(.*?)</body>', html_body, re.DOTALL | re.IGNORECASE)
            if body_match:
                html_body = body_match.group(1).strip()
        
        # Remove DOCTYPE, html, head tags if present
        html_body = re.sub(r'<!DOCTYPE[^>]*>', '', html_body, flags=re.IGNORECASE)
        html_body = re.sub(r'<html[^>]*>', '', html_body, flags=re.IGNORECASE)
        html_body = re.sub(r'</html>', '', html_body, flags=re.IGNORECASE)
        html_body = re.sub(r'<head[^>]*>.*?</head>', '', html_body, flags=re.DOTALL | re.IGNORECASE)
        html_body = re.sub(r'<style[^>]*>.*?</style>', '', html_body, flags=re.DOTALL | re.IGNORECASE)
        
        # Remove any leading/trailing whitespace and newlines
        html_body = html_body.strip()
        
        if not html_body.startswith("<"):
            html_body = self._convert_to_html(html_body)
        else:
            # Ensure it's just the body content, not full HTML
            # Wrap in a simple structure if needed
            if not html_body.startswith("<p") and not html_body.startswith("<div"):
                # If it's just text, wrap in paragraph
                html_body = f"<p style='margin: 0.5em 0;'>{html_body}</p>"
        
        subject = self._generate_subject(prompt)
        
        self.status = AgentStatus.SUCCESS
        return AgentResponse(
            agent_name=self.name,
            status=AgentStatus.SUCCESS,
            result={
                "to": to_email,
                "subject": subject,
                "body": html_body,
                "draft": True
            },
            metadata={"prompt": prompt, "tone": tone, "recipient_name": recipient_name}
        )
    
    def _draft_reply(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["original_email", "reply_prompt"])
        
        if not self.ai_model:
            raise ValueError("Gemini API key required for drafting replies")
        
        original = request["original_email"]
        reply_prompt = request["reply_prompt"]
        tone = request.get("tone", "professional but friendly")
        
        system_prompt = f"""You are an expert email writer. Create a professional reply email.

ORIGINAL EMAIL:
{original}

REPLY INSTRUCTIONS:
{reply_prompt}

REQUIREMENTS:
1. Tone: {tone}
2. Reference the original email context naturally
3. Address the sender appropriately (Hi [name])
4. Keep reply focused and clear
5. HTML format with clean styling
6. Professional closing

Return ONLY the HTML reply body. Structure:
- Greeting
- Context acknowledgment
- Your response
- Closing"""

        response = self.ai_model.generate_content(system_prompt)
        html_body = response.text.strip()
        
        if html_body.startswith("```html"):
            html_body = html_body.replace("```html", "").replace("```", "").strip()
        elif html_body.startswith("```"):
            html_body = html_body.replace("```", "").strip()
        
        if not html_body.startswith("<"):
            html_body = self._convert_to_html(html_body)
        
        self.status = AgentStatus.SUCCESS
        return AgentResponse(
            agent_name=self.name,
            status=AgentStatus.SUCCESS,
            result={
                "subject": f"Re: {original.get('subject', 'Your email')}",
                "body": html_body,
                "draft": True
            },
            metadata={"reply_to": original.get("from"), "tone": tone}
        )
    
    def _generate_subject(self, prompt: str) -> str:
        if not self.ai_model:
            return "Email from AI Agent"
        
        subject_prompt = f"""Generate a clear, professional email subject line.

Email content: {prompt}

RULES:
- Maximum 8 words
- Clear and specific
- No quotes or formatting
- Professional tone

Return ONLY the subject line text."""
        response = self.ai_model.generate_content(subject_prompt)
        return response.text.strip().strip('"').strip("'")
    
    def _convert_to_html(self, text: str) -> str:
        lines = text.strip().split("\n")
        html_lines = []
        
        in_list = False
        for line in lines:
            line = line.strip()
            if not line:
                if in_list:
                    html_lines.append("</ul>")
                    in_list = False
                continue
            
            if line.startswith("- ") or line.startswith("* "):
                if not in_list:
                    html_lines.append("<ul style='margin: 0.5em 0;'>")
                    in_list = True
                html_lines.append(f"<li>{line[2:]}</li>")
            else:
                if in_list:
                    html_lines.append("</ul>")
                    in_list = False
                html_lines.append(f"<p style='margin: 0.5em 0;'>{line}</p>")
        
        if in_list:
            html_lines.append("</ul>")
        
        html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{ 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            color: #333; 
            line-height: 1.6; 
            padding: 20px;
            max-width: 600px;
        }}
        p {{ margin: 0.5em 0; }}
        ul {{ margin: 0.5em 0; padding-left: 20px; }}
        li {{ margin: 0.3em 0; }}
        a {{ color: #0066cc; text-decoration: none; }}
        a:hover {{ text-decoration: underline; }}
    </style>
</head>
<body>
    {"".join(html_lines)}
</body>
</html>"""
        return html
    
    def get_capabilities(self) -> Dict[str, Any]:
        base_caps = super().get_capabilities()
        base_caps.update({
            "actions": ["send", "draft", "reply"],
            "has_mailgun": bool(self.mailgun_api_key and self.mailgun_domain),
            "has_ai": bool(self.ai_model),
            "from_email": self.from_email
        })
        return base_caps


if __name__ == "__main__":
    agent = EmailAgent()
    
    draft_request = {
        "action": "draft",
        "prompt": "Tell the team about tomorrow's standup meeting at 10am",
        "tone": "casual and friendly"
    }
    
    response = agent.process(draft_request)
    print(f"Status: {response.status.value}")
    if response.status == AgentStatus.SUCCESS:
        print(f"Subject: {response.result['subject']}")
        print(f"\nBody:\n{response.result['body']}")
    else:
        print(f"Error: {response.error}")

