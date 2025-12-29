from __future__ import annotations

import os
from typing import Any, Dict, Optional, List

from agents.base_agent import BaseAgent, AgentResponse, AgentStatus

try:
    import requests
except ImportError:
    raise ImportError("Install requests: pip install requests")


class ResearchAgent(BaseAgent):
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(
            name="Research Agent",
            description="Finds sources, compares options, and delivers short summaries with links",
            config=config
        )
        
        self.perplexity_api_key = self.config.get("perplexity_api_key") or os.getenv("PERPLEXITY_API_KEY")
        self.model = self.config.get("model", "sonar-pro")
        self.max_tokens = self.config.get("max_tokens", 2048)
        self.temperature = self.config.get("temperature", 0.2)
        
        self.available_models = [
            "sonar",
            "sonar-pro",
            "sonar-reasoning",
            "sonar-reasoning-pro",
            "sonar-deep-research"
        ]
    
    def process(self, request: Dict[str, Any]) -> AgentResponse:
        self.status = AgentStatus.PROCESSING
        
        try:
            action = request.get("action", "research")
            
            if action == "research":
                return self._research(request)
            elif action == "compare":
                return self._compare_options(request)
            elif action == "deep_dive":
                return self._deep_dive(request)
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
    
    def _research(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["query"])
        
        if not self.perplexity_api_key:
            raise ValueError("Perplexity API key required")
        
        query = request["query"]
        focus = request.get("focus", "detailed")  # Default to detailed for more content
        model = request.get("model", self.model)
        
        if model not in self.available_models:
            raise ValueError(f"Invalid model. Choose from: {', '.join(self.available_models)}")
        
        system_prompt = self._get_system_prompt(focus)
        
        # Use higher max_tokens for detailed research
        max_tokens = 2048 if focus == "detailed" else 1536
        response = self._call_perplexity(system_prompt, query, model=model, max_tokens=max_tokens)
        
        # Format the content with citations at the end
        content = response["content"]
        citations = response.get("citations", [])
        
        # Append citations section if we have citations
        if citations:
            content += "\n\n## References\n\n"
            for i, citation in enumerate(citations, 1):
                content += f"{i}. {citation}\n"
        
        self.status = AgentStatus.SUCCESS
        return AgentResponse(
            agent_name=self.name,
            status=AgentStatus.SUCCESS,
            result={
                "summary": content,
                "sources": citations,
                "query": query
            },
            metadata={"focus": focus, "model": model}
        )
    
    def _compare_options(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["options", "criteria"])
        
        if not self.perplexity_api_key:
            raise ValueError("Perplexity API key required")
        
        options = request["options"]
        criteria = request["criteria"]
        model = request.get("model", "sonar-reasoning")
        
        query = f"Compare {', '.join(options)} based on {criteria}. Provide detailed comparison with pros, cons, and recommendation."
        
        system_prompt = """You are an expert comparison analyst. Create a thorough, unbiased comparison.

STRUCTURE:
1. Quick Overview (1-2 sentences per option)
2. Detailed Comparison:
   - Feature-by-feature comparison table format
   - Pros and cons for each option
   - Key differentiators
3. Verdict:
   - Clear recommendation based on criteria
   - Best use cases for each option
   - Final thoughts

REQUIREMENTS:
- Objective and unbiased
- Data-driven (include stats/facts)
- Consider multiple perspectives
- Cite reliable sources
- Total length: 300-400 words"""
        
        response = self._call_perplexity(system_prompt, query, model=model)
        
        self.status = AgentStatus.SUCCESS
        return AgentResponse(
            agent_name=self.name,
            status=AgentStatus.SUCCESS,
            result={
                "comparison": response["content"],
                "sources": response.get("citations", []),
                "options": options,
                "criteria": criteria
            },
            metadata={"model": model}
        )
    
    def _deep_dive(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["topic"])
        
        if not self.perplexity_api_key:
            raise ValueError("Perplexity API key required")
        
        topic = request["topic"]
        aspects = request.get("aspects", ["overview", "key points", "recent developments"])
        model = request.get("model", "sonar-deep-research")
        
        query = f"Provide comprehensive research on {topic}. Cover these aspects: {', '.join(aspects)}."
        
        system_prompt = """You are a senior research expert. Provide comprehensive, authoritative analysis.

STRUCTURE:
1. Executive Summary (2-3 sentences)
2. For Each Aspect:
   - Clear heading
   - Detailed explanation
   - Supporting data/evidence
   - Recent developments
3. Key Insights & Trends
4. Future Outlook/Implications
5. Conclusion

REQUIREMENTS:
- Deep, thorough coverage
- Multiple authoritative sources (8-12)
- Recent data and statistics
- Expert perspectives
- Clear, organized structure
- Critical analysis
- Total length: 600-800 words

Cite sources throughout the analysis."""
        
        response = self._call_perplexity(system_prompt, query, model=model, max_tokens=2048)
        
        self.status = AgentStatus.SUCCESS
        return AgentResponse(
            agent_name=self.name,
            status=AgentStatus.SUCCESS,
            result={
                "research": response["content"],
                "sources": response.get("citations", []),
                "topic": topic,
                "aspects": aspects
            },
            metadata={"model": model, "depth": "comprehensive"}
        )
    
    def _call_perplexity(
        self, 
        system_prompt: str, 
        user_query: str,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None
    ) -> Dict[str, Any]:
        url = "https://api.perplexity.ai/chat/completions"
        
        headers = {
            "Authorization": f"Bearer {self.perplexity_api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": model or self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_query}
            ],
            "max_tokens": max_tokens or self.max_tokens,
            "temperature": self.temperature,
            "return_citations": True,
            "return_images": False
        }
        
        response = requests.post(url, json=payload, headers=headers, timeout=60)
        
        if response.status_code != 200:
            raise Exception(f"Perplexity API error: {response.status_code} - {response.text}")
        
        data = response.json()
        
        content = data["choices"][0]["message"]["content"]
        citations = data.get("citations", [])
        
        return {
            "content": content,
            "citations": citations
        }
    
    def _get_system_prompt(self, focus: str) -> str:
        prompts = {
            "quick": """You are a research assistant. Provide quick, accurate information.

REQUIREMENTS:
- 2-3 key points maximum
- Clear and direct
- Include 2-3 relevant sources
- Total length: 100-150 words

Format: Brief intro, bullet points, conclusion.""",

            "balanced": """You are an expert researcher. Provide comprehensive yet concise information in MARKDOWN format.

REQUIREMENTS:
- Use proper markdown formatting (headers, bold, lists, etc.)
- Clear introduction with ## Introduction
- 4-6 main points with explanations using ### Key Points and bullet points
- Balance depth with readability
- Include relevant statistics/facts
- Cite sources inline using [1][2][3] format
- Total length: 400-600 words
- Include a ## Conclusion section

Format: 
## Introduction
### Key Points
- Point 1 with citation [1]
- Point 2 with citation [2]
## Conclusion

Always format in markdown with proper headers and structure.""",

            "detailed": """You are a senior research analyst. Provide in-depth, thorough information in MARKDOWN format.

REQUIREMENTS:
- Use proper markdown formatting (headers, bold, lists, code blocks, etc.)
- Comprehensive coverage of topic
- Multiple perspectives/aspects
- Detailed explanations with examples
- Recent data and statistics
- 5-10 quality sources with inline citations [1][2][3]
- Total length: 600-800 words
- Well-structured with clear sections

Format:
## Introduction
### Section 1: [Topic Aspect]
- Detailed point with citation [1]
- Another point with citation [2]
### Section 2: [Another Aspect]
...
## Conclusion

Always use markdown formatting with proper headers, bold text for emphasis, and bullet points for lists.""",

            "academic": """You are an academic researcher. Provide scholarly, well-cited information.

REQUIREMENTS:
- Academic tone and rigor
- Proper citations throughout
- Peer-reviewed sources preferred
- Theoretical frameworks
- Critical analysis
- 5+ academic sources
- Total length: 400-500 words

Format: Abstract → Literature Review → Analysis → References""",

            "practical": """You are a practical consultant. Provide actionable, real-world information.

REQUIREMENTS:
- Focus on practical applications
- Real-world examples
- Step-by-step guidance where relevant
- Tools and resources
- Industry best practices
- 3-5 practical sources
- Total length: 250-350 words

Format: Problem → Solutions → Implementation → Resources"""
        }
        
        return prompts.get(focus, prompts["balanced"])
    
    def get_capabilities(self) -> Dict[str, Any]:
        base_caps = super().get_capabilities()
        base_caps.update({
            "actions": ["research", "compare", "deep_dive"],
            "has_api_key": bool(self.perplexity_api_key),
            "default_model": self.model,
            "available_models": self.available_models,
            "focus_modes": ["quick", "balanced", "detailed", "academic", "practical"]
        })
        return base_caps


if __name__ == "__main__":
    agent = ResearchAgent()
    
    response = agent.process({
        "action": "research",
        "query": "Latest developments in AI agents 2024",
        "focus": "balanced"
    })
    
    print(f"Status: {response.status.value}")
    if response.status == AgentStatus.SUCCESS:
        print(f"\nSummary:\n{response.result['summary']}")
        print(f"\nSources: {len(response.result['sources'])}")
        for i, source in enumerate(response.result['sources'][:3], 1):
            print(f"{i}. {source}")
    else:
        print(f"Error: {response.error}")

