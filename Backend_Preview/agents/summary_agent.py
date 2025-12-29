from __future__ import annotations

import os
from typing import Any, Dict, Optional
from pathlib import Path

from agents.base_agent import BaseAgent, AgentResponse, AgentStatus

try:
    import google.generativeai as genai
except ImportError:
    raise ImportError("Install google-genai: pip install google-genai")


class SummaryAgent(BaseAgent):
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(
            name="Summary Agent",
            description="Condenses long documents, chat threads, or recordings into digestible bullet notes",
            config=config
        )
        
        self.api_key = self.config.get("gemini_api_key") or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not found in config or environment")
        
        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel("gemini-2.0-flash-exp")
        
        self.summary_system_prompt = """You are an expert at condensing information into clear, concise summaries.

Your task is to create well-structured bullet-point summaries that:
- Capture all key points and main ideas
- Maintain logical flow and hierarchy
- Use clear, concise language
- Highlight important details, dates, names, and numbers
- Organize information into sections when appropriate
- Preserve critical context and relationships

OUTPUT FORMAT:
- Use bullet points (• or -)
- Group related points together
- Use sub-bullets for details
- Add section headers when content has distinct topics
- Keep each bullet concise (1-2 sentences max)
- Prioritize actionable items and key takeaways

Return ONLY the summary, no meta-commentary or explanations."""

    def process(self, request: Dict[str, Any]) -> AgentResponse:
        self.status = AgentStatus.PROCESSING
        
        try:
            content_type = request.get("content_type", "text")
            
            if content_type == "text":
                return self._summarize_text(request)
            elif content_type == "file":
                return self._summarize_file(request)
            elif content_type == "transcript":
                return self._summarize_transcript(request)
            elif content_type == "chat":
                return self._summarize_chat(request)
            else:
                raise ValueError(f"Unknown content_type: {content_type}")
                
        except Exception as exc:
            self.status = AgentStatus.ERROR
            return AgentResponse(
                agent_name=self.name,
                status=AgentStatus.ERROR,
                result=None,
                error=str(exc),
                metadata={"content_type": request.get("content_type", "unknown")}
            )
    
    def _summarize_text(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["text"])
        
        text = request["text"]
        focus = request.get("focus", "general")
        max_length = request.get("max_length", "medium")
        
        if not text or len(text.strip()) < 50:
            raise ValueError("Text must be at least 50 characters long")
        
        length_guidance = {
            "short": "Create a very brief summary (3-5 bullet points, ~50 words)",
            "medium": "Create a concise summary (8-12 bullet points, ~150 words)",
            "long": "Create a detailed summary (15-20 bullet points, ~300 words)"
        }
        
        focus_guidance = {
            "general": "Summarize all key points equally",
            "key_points": "Focus on main ideas and conclusions",
            "action_items": "Emphasize tasks, deadlines, and actionable items",
            "decisions": "Highlight decisions made, agreements, and outcomes",
            "timeline": "Organize by chronological order and dates"
        }
        
        prompt = f"""{self.summary_system_prompt}

CONTENT TO SUMMARIZE:
{text}

REQUIREMENTS:
- {length_guidance.get(max_length, length_guidance["medium"])}
- {focus_guidance.get(focus, focus_guidance["general"])}

Generate the summary now:"""
        
        response = self.model.generate_content(prompt)
        summary = response.text.strip()
        
        self.status = AgentStatus.SUCCESS
        return AgentResponse(
            agent_name=self.name,
            status=AgentStatus.SUCCESS,
            result={
                "summary": summary,
                "original_length": len(text),
                "summary_length": len(summary),
                "compression_ratio": f"{len(summary)/len(text)*100:.1f}%"
            },
            metadata={
                "content_type": "text",
                "focus": focus,
                "max_length": max_length
            }
        )
    
    def _summarize_file(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["file_path"])
        
        file_path = Path(request["file_path"])
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        focus = request.get("focus", "general")
        max_length = request.get("max_length", "medium")
        
        try:
            if file_path.suffix.lower() == ".txt":
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
            elif file_path.suffix.lower() == ".md":
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
            elif file_path.suffix.lower() == ".pdf":
                try:
                    import PyPDF2
                    with open(file_path, "rb") as f:
                        reader = PyPDF2.PdfReader(f)
                        content = "\n".join([page.extract_text() for page in reader.pages])
                except ImportError:
                    raise ImportError("Install PyPDF2 for PDF support: pip install PyPDF2")
            elif file_path.suffix.lower() in [".docx", ".doc"]:
                try:
                    from docx import Document
                    doc = Document(file_path)
                    content = "\n".join([paragraph.text for paragraph in doc.paragraphs])
                except ImportError:
                    raise ImportError("Install python-docx for DOCX support: pip install python-docx")
            else:
                raise ValueError(f"Unsupported file type: {file_path.suffix}")
            
            if not content or len(content.strip()) < 50:
                raise ValueError("File content is too short or empty")
            
            request_with_text = {
                "text": content,
                "focus": focus,
                "max_length": max_length
            }
            
            result = self._summarize_text(request_with_text)
            result.metadata["file_path"] = str(file_path)
            result.metadata["file_type"] = file_path.suffix.lower()
            return result
            
        except Exception as exc:
            raise Exception(f"Error reading file: {str(exc)}")
    
    def _summarize_transcript(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["transcript"])
        
        transcript = request["transcript"]
        include_speakers = request.get("include_speakers", True)
        extract_action_items = request.get("extract_action_items", True)
        
        if not transcript or len(transcript.strip()) < 50:
            raise ValueError("Transcript must be at least 50 characters long")
        
        prompt = f"""{self.summary_system_prompt}

This is a meeting/recording transcript. Extract:
- Key discussion points
- Decisions made
- Important information shared
- {"Action items with owners and deadlines" if extract_action_items else ""}
- {"Speaker names and their contributions" if include_speakers else "Main points without speaker attribution"}

TRANSCRIPT:
{transcript}

Generate a structured summary with:
1. Meeting Overview (date, topic, participants if available)
2. Key Discussion Points
3. Decisions Made
4. Action Items (if any)
5. Next Steps

Generate the summary now:"""
        
        response = self.model.generate_content(prompt)
        summary = response.text.strip()
        
        self.status = AgentStatus.SUCCESS
        return AgentResponse(
            agent_name=self.name,
            status=AgentStatus.SUCCESS,
            result={
                "summary": summary,
                "original_length": len(transcript),
                "summary_length": len(summary),
                "compression_ratio": f"{len(summary)/len(transcript)*100:.1f}%"
            },
            metadata={
                "content_type": "transcript",
                "include_speakers": include_speakers,
                "extract_action_items": extract_action_items
            }
        )
    
    def _summarize_chat(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["messages"])
        
        messages = request["messages"]
        if not isinstance(messages, list):
            raise ValueError("Messages must be a list")
        
        if len(messages) < 2:
            raise ValueError("Need at least 2 messages to summarize")
        
        chat_text = "\n".join([
            f"{msg.get('sender', 'User')}: {msg.get('text', '')}"
            for msg in messages
        ])
        
        focus = request.get("focus", "general")
        
        prompt = f"""{self.summary_system_prompt}

This is a chat conversation thread. Summarize:
- Main topics discussed
- Key information exchanged
- Questions asked and answers given
- Decisions or agreements reached
- Important links, dates, or references mentioned

CHAT THREAD:
{chat_text}

Generate a concise summary organized by topic or chronologically:"""
        
        response = self.model.generate_content(prompt)
        summary = response.text.strip()
        
        self.status = AgentStatus.SUCCESS
        return AgentResponse(
            agent_name=self.name,
            status=AgentStatus.SUCCESS,
            result={
                "summary": summary,
                "message_count": len(messages),
                "summary_length": len(summary)
            },
            metadata={
                "content_type": "chat",
                "focus": focus
            }
        )

