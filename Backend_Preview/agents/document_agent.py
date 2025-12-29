from __future__ import annotations

import os
from typing import Any, Dict, Optional, List
from pathlib import Path
from datetime import datetime

from agents.base_agent import BaseAgent, AgentResponse, AgentStatus

try:
    import google.generativeai as genai
except ImportError:
    raise ImportError("Install google-genai: pip install google-genai")


class DocumentAgent(BaseAgent):
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(
            name="Document Agent",
            description="Drafts reports, proposals, or posts in the user's tone with editable outlines",
            config=config
        )
        
        self.api_key = self.config.get("gemini_api_key") or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not found in config or environment")
        
        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel("gemini-2.0-flash-exp")
        
        self.output_dir = Path(self.config.get("output_dir", "outputs/documents"))
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        self.document_templates = {
            "report": {
                "sections": ["Executive Summary", "Introduction", "Methodology", "Findings", "Analysis", "Conclusion", "Recommendations"],
                "tone": "professional and analytical"
            },
            "proposal": {
                "sections": ["Introduction", "Problem Statement", "Solution", "Implementation Plan", "Budget", "Timeline", "Expected Outcomes"],
                "tone": "persuasive and professional"
            },
            "blog_post": {
                "sections": ["Introduction", "Main Content", "Key Points", "Examples", "Conclusion", "Call to Action"],
                "tone": "engaging and conversational"
            },
            "essay": {
                "sections": ["Introduction", "Thesis Statement", "Body Paragraphs", "Counterarguments", "Conclusion"],
                "tone": "academic and formal"
            },
            "documentation": {
                "sections": ["Overview", "Getting Started", "Features", "API Reference", "Examples", "Troubleshooting"],
                "tone": "clear and technical"
            },
            "article": {
                "sections": ["Introduction", "Main Content", "Supporting Evidence", "Analysis", "Conclusion"],
                "tone": "informative and balanced"
            }
        }
    
    def process(self, request: Dict[str, Any]) -> AgentResponse:
        self.status = AgentStatus.PROCESSING
        
        try:
            action = request.get("action", "draft")
            
            if action == "draft":
                return self._draft_document(request)
            elif action == "outline":
                return self._generate_outline(request)
            elif action == "expand_outline":
                return self._expand_outline(request)
            elif action == "refine":
                return self._refine_document(request)
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
    
    def _draft_document(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["topic", "document_type"])
        
        topic = request["topic"]
        doc_type = request["document_type"]
        tone = request.get("tone", "professional")
        format_type = request.get("format", "markdown")
        length = request.get("length", "medium")
        outline = request.get("outline")
        additional_info = request.get("additional_info", "")
        
        if doc_type in self.document_templates:
            template = self.document_templates[doc_type]
            default_tone = template["tone"]
            if tone == "professional":
                tone = default_tone
            sections = outline if outline else template["sections"]
        else:
            sections = outline if outline else ["Introduction", "Main Content", "Conclusion"]
        
        length_guidance = {
            "short": "500-800 words total",
            "medium": "1200-2000 words total",
            "long": "2500-4000 words total"
        }
        
        prompt = f"""You are an expert document writer. Create a {doc_type} on: {topic}

DOCUMENT REQUIREMENTS:
- Type: {doc_type}
- Tone: {tone}
- Length: {length_guidance.get(length, length_guidance['medium'])}
- Format: {format_type}

SECTIONS TO INCLUDE:
{self._format_sections(sections)}

{additional_info}

INSTRUCTIONS:
1. Write a comprehensive, well-structured {doc_type}
2. Use {tone} tone throughout
3. Follow the section structure provided
4. Include relevant details, examples, and analysis
5. Make it engaging and informative
6. Ensure smooth transitions between sections

OUTPUT FORMAT:
- Use {format_type} formatting
- Include proper headings and structure
- Use markdown syntax if format is markdown
- Use HTML tags if format is HTML
- Use plain text with clear section breaks if format is text

Generate the complete document now:"""
        
        try:
            response = self.model.generate_content(prompt)
            document_content = response.text.strip()
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"document_{timestamp}.{self._get_file_extension(format_type)}"
            file_path = self.output_dir / filename
            
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(document_content)
            
            self.status = AgentStatus.SUCCESS
            return AgentResponse(
                agent_name=self.name,
                status=AgentStatus.SUCCESS,
                result={
                    "document": document_content,
                    "filename": filename,
                    "file_path": str(file_path),
                    "topic": topic,
                    "document_type": doc_type,
                    "format": format_type,
                    "length": len(document_content.split()),
                    "sections": sections
                },
                metadata={
                    "topic": topic,
                    "document_type": doc_type,
                    "format": format_type,
                    "length": length
                }
            )
        except Exception as e:
            raise Exception(f"Error generating document: {str(e)}")
    
    def _generate_outline(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["topic", "document_type"])
        
        topic = request["topic"]
        doc_type = request["document_type"]
        custom_sections = request.get("custom_sections")
        
        if doc_type in self.document_templates and not custom_sections:
            template = self.document_templates[doc_type]
            sections = template["sections"]
        elif custom_sections:
            sections = custom_sections if isinstance(custom_sections, list) else [custom_sections]
        else:
            sections = None
        
        prompt = f"""Create a detailed outline for a {doc_type} on: {topic}

{"Use these sections: " + ", ".join(sections) if sections else "Generate appropriate sections for this document type."}

OUTLINE REQUIREMENTS:
- Clear hierarchical structure (main sections, subsections)
- Logical flow and organization
- Each section should have a brief description (1-2 sentences)
- Include key points or topics for each section

Format as JSON:
{{
  "title": "Document Title",
  "sections": [
    {{
      "section": "Section Name",
      "description": "What this section covers",
      "subsections": ["Subsection 1", "Subsection 2"]
    }},
    ...
  ]
}}

Return ONLY valid JSON, no markdown, no explanations."""
        
        try:
            response = self.model.generate_content(prompt)
            text = response.text.strip()
            
            if text.startswith('```json'):
                text = text.replace('```json', '').replace('```', '').strip()
            elif text.startswith('```'):
                text = text.replace('```', '').strip()
            
            import json
            outline = json.loads(text)
            
            self.status = AgentStatus.SUCCESS
            return AgentResponse(
                agent_name=self.name,
                status=AgentStatus.SUCCESS,
                result={
                    "outline": outline,
                    "topic": topic,
                    "document_type": doc_type
                },
                metadata={"topic": topic, "document_type": doc_type}
            )
        except Exception as e:
            raise Exception(f"Error generating outline: {str(e)}")
    
    def _expand_outline(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["topic", "outline"])
        
        topic = request["topic"]
        outline = request["outline"]
        doc_type = request.get("document_type", "document")
        tone = request.get("tone", "professional")
        format_type = request.get("format", "markdown")
        length = request.get("length", "medium")
        
        if isinstance(outline, dict):
            sections_list = [s.get("section", "") for s in outline.get("sections", [])]
        elif isinstance(outline, list):
            sections_list = outline
        else:
            sections_list = [str(outline)]
        
        length_guidance = {
            "short": "500-800 words total",
            "medium": "1200-2000 words total",
            "long": "2500-4000 words total"
        }
        
        prompt = f"""Expand this outline into a complete {doc_type} on: {topic}

OUTLINE:
{self._format_outline_for_prompt(outline)}

DOCUMENT REQUIREMENTS:
- Type: {doc_type}
- Tone: {tone}
- Length: {length_guidance.get(length, length_guidance['medium'])}
- Format: {format_type}

Write the full document following the outline structure. Include:
- Detailed content for each section
- Smooth transitions
- Relevant examples and analysis
- Proper formatting for {format_type}

Generate the complete document now:"""
        
        try:
            response = self.model.generate_content(prompt)
            document_content = response.text.strip()
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"document_{timestamp}.{self._get_file_extension(format_type)}"
            file_path = self.output_dir / filename
            
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(document_content)
            
            self.status = AgentStatus.SUCCESS
            return AgentResponse(
                agent_name=self.name,
                status=AgentStatus.SUCCESS,
                result={
                    "document": document_content,
                    "filename": filename,
                    "file_path": str(file_path),
                    "topic": topic,
                    "document_type": doc_type,
                    "format": format_type,
                    "length": len(document_content.split())
                },
                metadata={"topic": topic, "document_type": doc_type}
            )
        except Exception as e:
            raise Exception(f"Error expanding outline: {str(e)}")
    
    def _refine_document(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["document", "changes"])
        
        document = request["document"]
        changes = request["changes"]
        format_type = request.get("format", "markdown")
        
        prompt = f"""Refine and improve this document based on the requested changes.

ORIGINAL DOCUMENT:
{document[:3000]}

REQUESTED CHANGES:
{changes}

Update the document to incorporate these changes while maintaining:
- Original tone and style
- Document structure
- {format_type} formatting

Return the complete refined document:"""
        
        try:
            response = self.model.generate_content(prompt)
            refined_content = response.text.strip()
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"document_refined_{timestamp}.{self._get_file_extension(format_type)}"
            file_path = self.output_dir / filename
            
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(refined_content)
            
            self.status = AgentStatus.SUCCESS
            return AgentResponse(
                agent_name=self.name,
                status=AgentStatus.SUCCESS,
                result={
                    "document": refined_content,
                    "filename": filename,
                    "file_path": str(file_path),
                    "changes_applied": changes
                },
                metadata={"format": format_type}
            )
        except Exception as e:
            raise Exception(f"Error refining document: {str(e)}")
    
    def _format_sections(self, sections: List[str]) -> str:
        if isinstance(sections, list):
            return "\n".join([f"- {section}" for section in sections])
        return str(sections)
    
    def _format_outline_for_prompt(self, outline: Any) -> str:
        if isinstance(outline, dict):
            result = f"Title: {outline.get('title', 'Document')}\n\n"
            for section in outline.get('sections', []):
                result += f"Section: {section.get('section', '')}\n"
                result += f"Description: {section.get('description', '')}\n"
                if section.get('subsections'):
                    result += f"Subsections: {', '.join(section['subsections'])}\n"
                result += "\n"
            return result
        elif isinstance(outline, list):
            return "\n".join([f"- {s}" for s in outline])
        else:
            return str(outline)
    
    def _get_file_extension(self, format_type: str) -> str:
        extensions = {
            "markdown": "md",
            "html": "html",
            "text": "txt"
        }
        return extensions.get(format_type.lower(), "txt")
    
    def get_capabilities(self) -> Dict[str, Any]:
        base_caps = super().get_capabilities()
        base_caps.update({
            "actions": ["draft", "outline", "expand_outline", "refine"],
            "document_types": list(self.document_templates.keys()),
            "formats": ["markdown", "html", "text"],
            "lengths": ["short", "medium", "long"],
            "output_dir": str(self.output_dir)
        })
        return base_caps

