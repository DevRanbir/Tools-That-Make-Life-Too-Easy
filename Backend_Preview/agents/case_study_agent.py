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


class CaseStudyAgent(BaseAgent):
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(
            name="Case Study Agent",
            description="Gathers wins, metrics, and quotes to publish concise case study narratives",
            config=config
        )
        
        self.api_key = self.config.get("gemini_api_key") or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not found in config or environment")
        
        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel("gemini-2.0-flash-exp")
        
        self.output_dir = Path(self.config.get("output_dir", "outputs/case_studies"))
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        self.flowchart_agent = None
        self.image_agent = None
    
    def set_agents(self, flowchart_agent, image_agent):
        self.flowchart_agent = flowchart_agent
        self.image_agent = image_agent
    
    def process(self, request: Dict[str, Any]) -> AgentResponse:
        self.status = AgentStatus.PROCESSING
        
        try:
            action = request.get("action", "create")
            
            if action == "create":
                return self._create_case_study(request)
            elif action == "outline":
                return self._generate_outline(request)
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
    
    def _create_case_study(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["project_name", "description"])
        
        project_name = request["project_name"]
        description = request["description"]
        metrics = request.get("metrics", {})
        quotes = request.get("quotes", [])
        challenges = request.get("challenges", [])
        solutions = request.get("solutions", [])
        results = request.get("results", "")
        include_flowcharts = request.get("include_flowcharts", True)
        include_images = request.get("include_images", True)
        
        outline_result = self._generate_outline_internal(project_name, description, metrics, challenges, solutions, results)
        outline = outline_result.get("outline", {})
        
        markdown_content = f"# {outline.get('title', project_name)}\n\n"
        markdown_content += f"**Project Overview**\n\n{description}\n\n---\n\n"
        
        sections = outline.get("sections", [])
        flowchart_count = 0
        image_count = 0
        
        for section in sections:
            section_name = section.get("section", "")
            section_desc = section.get("description", "")
            subsections = section.get("subsections", [])
            
            markdown_content += f"## {section_name}\n\n"
            
            if section_desc:
                markdown_content += f"{section_desc}\n\n"
            
            section_content = self._generate_section_content(
                project_name, section_name, section_desc, 
                metrics, quotes, challenges, solutions, results
            )
            markdown_content += f"{section_content}\n\n"
            
            if subsections:
                for subsection in subsections:
                    markdown_content += f"### {subsection}\n\n"
                    subsection_content = self._generate_subsection_content(
                        project_name, subsection, metrics, quotes
                    )
                    markdown_content += f"{subsection_content}\n\n"
            
            needs_flowchart = self._needs_flowchart(section_name, section_content)
            if needs_flowchart and include_flowcharts and self.flowchart_agent:
                flowchart_result = self._add_flowchart(section_name, section_content)
                if flowchart_result:
                    markdown_content += f"### Process Flow\n\n"
                    markdown_content += f"```mermaid\n{flowchart_result}\n```\n\n"
                    flowchart_count += 1
            
            needs_image = self._needs_image(section_name, section_content)
            if needs_image and include_images and self.image_agent:
                image_result = self._add_image(section_name, project_name)
                if image_result:
                    image_url = image_result.get("image_url", "")
                    if image_url:
                        markdown_content += f"![{section_name} Visualization]({image_url})\n\n"
                        image_count += 1
            
            markdown_content += "---\n\n"
        
        markdown_content += f"## Conclusion\n\n"
        conclusion = self._generate_conclusion(project_name, metrics, results)
        markdown_content += f"{conclusion}\n\n"
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"case_study_{timestamp}.md"
        file_path = self.output_dir / filename
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(markdown_content)
        
        self.status = AgentStatus.SUCCESS
        return AgentResponse(
            agent_name=self.name,
            status=AgentStatus.SUCCESS,
            result={
                "document": markdown_content,
                "filename": filename,
                "file_path": str(file_path),
                "project_name": project_name,
                "sections_count": len(sections),
                "flowcharts_count": flowchart_count,
                "images_count": image_count
            },
            metadata={
                "project_name": project_name,
                "format": "markdown"
            }
        )
    
    def _generate_outline(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["project_name", "description"])
        
        project_name = request["project_name"]
        description = request["description"]
        metrics = request.get("metrics", {})
        challenges = request.get("challenges", [])
        solutions = request.get("solutions", [])
        results = request.get("results", "")
        
        outline = self._generate_outline_internal(project_name, description, metrics, challenges, solutions, results)
        
        self.status = AgentStatus.SUCCESS
        return AgentResponse(
            agent_name=self.name,
            status=AgentStatus.SUCCESS,
            result=outline,
            metadata={"project_name": project_name}
        )
    
    def _generate_outline_internal(self, project_name: str, description: str, 
                                   metrics: Dict, challenges: List, solutions: List, results: str) -> Dict[str, Any]:
        metrics_text = ""
        if metrics:
            metrics_text = "\nKey Metrics:\n" + "\n".join([f"- {k}: {v}" for k, v in metrics.items()])
        
        challenges_text = ""
        if challenges:
            challenges_text = "\nChallenges Faced:\n" + "\n".join([f"- {c}" for c in challenges])
        
        solutions_text = ""
        if solutions:
            solutions_text = "\nSolutions Implemented:\n" + "\n".join([f"- {s}" for s in solutions])
        
        prompt = f"""Create a comprehensive case study outline for: {project_name}

PROJECT DESCRIPTION:
{description}
{metrics_text}
{challenges_text}
{solutions_text}
{("Results: " + results) if results else ""}

Generate a structured outline with:
- Title
- Main sections (typically: Problem/Challenge, Solution, Implementation, Results, Impact)
- Subsections for each main section
- Brief description for each section

Format as JSON:
{{
  "title": "Case Study: Project Name",
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
            
            outline = json.loads(text)
            return {"outline": outline}
        except Exception as e:
            print(f"[CASE STUDY] Outline error: {e}")
            return {
                "outline": {
                    "title": f"Case Study: {project_name}",
                    "sections": [
                        {"section": "Problem Statement", "description": "The challenge we faced", "subsections": []},
                        {"section": "Solution", "description": "Our approach", "subsections": []},
                        {"section": "Implementation", "description": "How we built it", "subsections": []},
                        {"section": "Results", "description": "Outcomes and metrics", "subsections": []}
                    ]
                }
            }
    
    def _generate_section_content(self, project_name: str, section_name: str, 
                                   section_desc: str, metrics: Dict, quotes: List,
                                   challenges: List, solutions: List, results: str) -> str:
        context = f"Project: {project_name}\nSection: {section_name}\n"
        
        if metrics:
            context += f"Metrics: {json.dumps(metrics)}\n"
        if quotes:
            context += f"Quotes: {', '.join(quotes[:3])}\n"
        if challenges:
            context += f"Challenges: {', '.join(challenges[:3])}\n"
        if solutions:
            context += f"Solutions: {', '.join(solutions[:3])}\n"
        if results:
            context += f"Results: {results}\n"
        
        prompt = f"""Write comprehensive content for the "{section_name}" section of a case study.

{context}

Section Description: {section_desc}

Write 2-4 paragraphs covering:
- Key points and details
- Relevant metrics and data
- Real examples and evidence
- Impact and significance

Use professional, engaging tone. Include specific details and numbers where available.

IMPORTANT: 
- Do NOT repeat the section title "{section_name}" in your response
- Do NOT include any headings or markdown formatting
- Return ONLY the paragraph content, no titles, no headers
- Start directly with the content"""
        
        try:
            response = self.model.generate_content(prompt)
            return response.text.strip()
        except Exception as e:
            print(f"[CASE STUDY] Content generation error: {e}")
            return f"This section covers {section_desc}."
    
    def _generate_subsection_content(self, project_name: str, subsection: str, 
                                     metrics: Dict, quotes: List) -> str:
        prompt = f"""Write content for subsection "{subsection}" in a case study about {project_name}.

Write 1-2 paragraphs with specific details, examples, and relevant information.
Keep it concise and informative.

IMPORTANT:
- Do NOT repeat the subsection title "{subsection}" in your response
- Do NOT include any headings or markdown formatting
- Return ONLY the paragraph content, no titles, no headers
- Start directly with the content"""
        
        try:
            response = self.model.generate_content(prompt)
            return response.text.strip()
        except Exception as e:
            print(f"[CASE STUDY] Subsection error: {e}")
            return f"Details about {subsection}."
    
    def _generate_conclusion(self, project_name: str, metrics: Dict, results: str) -> str:
        prompt = f"""Write a conclusion section for a case study about {project_name}.

Summarize:
- Key achievements
- Impact and outcomes
- Lessons learned
- Future implications

Keep it 2-3 paragraphs, professional and forward-looking."""
        
        try:
            response = self.model.generate_content(prompt)
            return response.text.strip()
        except Exception as e:
            print(f"[CASE STUDY] Conclusion error: {e}")
            return f"The {project_name} project achieved significant results and provided valuable insights."
    
    def _needs_flowchart(self, section_name: str, content: str) -> bool:
        flowchart_keywords = [
            "process", "flow", "workflow", "pipeline", "system", "architecture",
            "steps", "procedure", "methodology", "implementation", "algorithm"
        ]
        section_lower = section_name.lower()
        content_lower = content.lower()
        
        return any(keyword in section_lower or keyword in content_lower for keyword in flowchart_keywords)
    
    def _needs_image(self, section_name: str, content: str) -> bool:
        image_keywords = [
            "dashboard", "interface", "ui", "design", "visualization", "chart",
            "graph", "diagram", "mockup", "prototype", "screenshot", "result"
        ]
        section_lower = section_name.lower()
        content_lower = content.lower()
        
        return any(keyword in section_lower or keyword in content_lower for keyword in image_keywords)
    
    def _add_flowchart(self, section_name: str, content: str) -> Optional[str]:
        if not self.flowchart_agent:
            return None
        
        prompt = f"Create a flowchart for: {section_name}\n\nContext: {content[:200]}"
        
        try:
            response = self.flowchart_agent.process({
                "description": prompt,
                "level": "2",
                "output_format": "mermaid"
            })
            
            if response.status == AgentStatus.SUCCESS:
                result = response.result
                mermaid_code = result.get("mermaid_code", "")
                return mermaid_code
        except Exception as e:
            print(f"[CASE STUDY] Flowchart generation error: {e}")
        
        return None
    
    def _add_image(self, section_name: str, project_name: str) -> Optional[Dict[str, Any]]:
        if not self.image_agent:
            return None
        
        image_prompt = f"{section_name} visualization for {project_name} case study, professional and modern style"
        
        try:
            response = self.image_agent.process({
                "topic": image_prompt,
                "style": "professional and modern",
                "aspect_ratio": "16:9"
            })
            
            if response.status == AgentStatus.SUCCESS:
                result = response.result
                image_path = result.get("image_path")
                if image_path:
                    from pathlib import Path
                    image_filename = Path(image_path).name
                    return {
                        "image_url": f"/api/image/{image_filename}",
                        "filename": image_filename
                    }
        except Exception as e:
            print(f"[CASE STUDY] Image generation error: {e}")
        
        return None
    
    def get_capabilities(self) -> Dict[str, Any]:
        base_caps = super().get_capabilities()
        base_caps.update({
            "actions": ["create", "outline"],
            "formats": ["markdown"],
            "integrations": {
                "flowchart_agent": self.flowchart_agent is not None,
                "image_agent": self.image_agent is not None
            },
            "output_dir": str(self.output_dir)
        })
        return base_caps

