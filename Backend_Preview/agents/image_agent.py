from __future__ import annotations

import os
import json
from pathlib import Path
from typing import Any, Dict, Optional
from datetime import datetime

from agents.base_agent import BaseAgent, AgentResponse, AgentStatus

try:
    import google.generativeai as genai
except ImportError:
    raise ImportError("Install google-genai: pip install google-genai")

try:
    from dotenv import load_dotenv
except ImportError:
    raise ImportError("Install python-dotenv: pip install python-dotenv")


class ImageAgent(BaseAgent):
    """
    Image Agent - Produces quick visuals, mockups, and social-ready graphics from text prompts.
    
    This agent works in two steps:
    1. Generates a detailed JSON prompt from the user's topic
    2. Uses that prompt to generate an image with Gemini's image generation model
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(
            name="Image Agent",
            description="Produces quick visuals, mockups, and social-ready graphics from text prompts",
            config=config
        )
        
        # Load environment variables
        load_dotenv()
        
        self.api_key = self.config.get("api_key") or os.getenv("GEMINI_API_KEY")
        self.text_model_name = self.config.get("text_model_name", "gemini-2.0-flash")
        self.image_model_name = self.config.get("image_model_name", "gemini-3-pro-image-preview")
        self.save_to_file = self.config.get("save_to_file", True)
        self.output_dir = Path(self.config.get("output_dir", "outputs/images"))
        
        if self.save_to_file:
            self.output_dir.mkdir(parents=True, exist_ok=True)
        
        if self.api_key:
            genai.configure(api_key=self.api_key)
            self.text_model = genai.GenerativeModel(self.text_model_name)
            self.image_model = genai.GenerativeModel(self.image_model_name)
        else:
            self.text_model = None
            self.image_model = None
    
    def process(self, request: Dict[str, Any]) -> AgentResponse:
        """
        Process the image generation request.
        
        Args:
            request: Dictionary containing:
                - topic (required): The topic/description for the image
                - style (optional): Art style preference (e.g., "realistic", "cartoon", "minimalist")
                - aspect_ratio (optional): Image aspect ratio (e.g., "1:1", "16:9", "9:16")
                - filename (optional): Custom filename for the output
                
        Returns:
            AgentResponse with generated image path and metadata
        """
        self.status = AgentStatus.PROCESSING
        
        try:
            self.validate_request(request, ["topic"])
            
            topic = request["topic"]
            style = request.get("style", "professional and modern")
            aspect_ratio = request.get("aspect_ratio", "1:1")
            filename = request.get("filename")
            
            # Step 1: Generate detailed JSON prompt
            print(f"[IMAGE AGENT] Step 1: Generating detailed prompt from topic...")
            json_prompt = self._generate_detailed_prompt(topic, style, aspect_ratio)
            print(f"[IMAGE AGENT] Generated prompt: {json.dumps(json_prompt, indent=2)}")
            
            # Step 2: Generate image using the detailed prompt
            print(f"[IMAGE AGENT] Step 2: Generating image with Gemini...")
            image_path = self._generate_image(json_prompt, filename)
            print(f"[IMAGE AGENT] Image saved to: {image_path}")
            
            result = {
                "image_path": str(image_path),
                "prompt": json_prompt,
                "topic": topic,
                "style": style,
                "aspect_ratio": aspect_ratio,
            }
            
            self.status = AgentStatus.SUCCESS
            return AgentResponse(
                agent_name=self.name,
                status=AgentStatus.SUCCESS,
                result=result,
                metadata={
                    "topic": topic,
                    "prompt_length": len(json_prompt["detailed_description"]),
                    "model": self.image_model_name,
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
    
    def _generate_detailed_prompt(self, topic: str, style: str, aspect_ratio: str) -> Dict[str, Any]:
        """
        Generate a detailed JSON prompt from the topic using the text model.
        
        Args:
            topic: User's topic/description
            style: Desired art style
            aspect_ratio: Image aspect ratio
            
        Returns:
            Dictionary with detailed prompt information
        """
        if not self.text_model:
            raise ValueError("Gemini API key required")
        
        system_prompt = """You are an expert image prompt engineer. Your job is to take a simple topic 
and expand it into a detailed, comprehensive image generation prompt.

Generate a JSON response with the following structure:
{
    "main_subject": "The primary subject of the image",
    "detailed_description": "A detailed, vivid description of what should be in the image (3-5 sentences)",
    "visual_elements": ["element1", "element2", "element3"],
    "composition": "How elements should be arranged (e.g., centered, rule of thirds)",
    "lighting": "Lighting description (e.g., soft natural light, dramatic studio lighting)",
    "color_palette": "Color scheme description (e.g., warm earth tones, vibrant and saturated)",
    "mood": "The emotional tone (e.g., professional, playful, serene)",
    "technical_details": "Camera/rendering details (e.g., 4K, sharp focus, depth of field)"
}

Make the prompt detailed, specific, and visually descriptive. Focus on what makes a great image."""

        user_prompt = f"""Topic: {topic}
Style: {style}
Aspect Ratio: {aspect_ratio}

Generate a detailed image prompt in JSON format. Be specific about visual details, composition, and atmosphere."""

        try:
            response = self.text_model.generate_content(f"{system_prompt}\n\n{user_prompt}")
            response_text = response.text.strip()
            
            # Extract JSON from response (handle code blocks)
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0].strip()
            
            prompt_data = json.loads(response_text)
            
            # Add metadata
            prompt_data["style"] = style
            prompt_data["aspect_ratio"] = aspect_ratio
            prompt_data["original_topic"] = topic
            
            return prompt_data
            
        except json.JSONDecodeError as e:
            print(f"[IMAGE AGENT] JSON parsing error: {e}")
            print(f"[IMAGE AGENT] Response text: {response_text}")
            # Fallback to a basic prompt structure
            return {
                "main_subject": topic,
                "detailed_description": f"A {style} image depicting {topic}",
                "visual_elements": [topic],
                "composition": "centered, balanced composition",
                "lighting": "natural, even lighting",
                "color_palette": "harmonious and appealing colors",
                "mood": "professional and polished",
                "technical_details": "high quality, sharp focus, 4K resolution",
                "style": style,
                "aspect_ratio": aspect_ratio,
                "original_topic": topic,
            }
        except Exception as e:
            print(f"[IMAGE AGENT] Error generating prompt: {e}")
            raise
    
    def _generate_image(self, json_prompt: Dict[str, Any], filename: Optional[str]) -> Path:
        """
        Generate an image using the detailed JSON prompt.
        
        Args:
            json_prompt: Detailed prompt dictionary
            filename: Optional custom filename
            
        Returns:
            Path to the saved image file
        """
        if not self.image_model:
            raise ValueError("Gemini image model not configured")
        
        # Construct the final image prompt from JSON
        image_prompt = self._construct_image_prompt(json_prompt)
        
        print(f"[IMAGE AGENT] Final prompt for image generation:")
        print(f"[IMAGE AGENT] {image_prompt}")
        
        try:
            # Generate image with Gemini
            response = self.image_model.generate_content(image_prompt)
            
            # Save the image
            if filename is None:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                import uuid
                unique_id = str(uuid.uuid4())[:8]
                safe_topic = "".join(c for c in json_prompt["original_topic"][:30] if c.isalnum() or c in (' ', '-', '_')).strip()
                safe_topic = safe_topic.replace(' ', '_')
                filename = f"image_{safe_topic}_{timestamp}_{unique_id}"
            
            image_path = self.output_dir / f"{filename}.png"
            
            # Extract and save image from response
            if hasattr(response, '_result'):
                # Check if the response contains image data
                for candidate in response._result.candidates:
                    for part in candidate.content.parts:
                        if hasattr(part, 'inline_data'):
                            image_data = part.inline_data.data
                            image_path.write_bytes(image_data)
                            return image_path
            
            # If no image data found in response, try to extract it differently
            # This is a fallback in case the API response structure is different
            raise ValueError("No image data found in response. The model may not support image generation yet.")
            
        except Exception as e:
            print(f"[IMAGE AGENT] Error during image generation: {e}")
            print(f"[IMAGE AGENT] Note: Make sure you have access to the image generation model")
            raise
    
    def _construct_image_prompt(self, json_prompt: Dict[str, Any]) -> str:
        """
        Construct a comprehensive text prompt from the JSON structure.
        
        Args:
            json_prompt: Detailed prompt dictionary
            
        Returns:
            Formatted text prompt for image generation
        """
        parts = [
            f"Main Subject: {json_prompt.get('main_subject', '')}",
            f"\nDescription: {json_prompt.get('detailed_description', '')}",
        ]
        
        if json_prompt.get('visual_elements'):
            elements = ", ".join(json_prompt['visual_elements'])
            parts.append(f"\nVisual Elements: {elements}")
        
        parts.extend([
            f"\nComposition: {json_prompt.get('composition', '')}",
            f"\nLighting: {json_prompt.get('lighting', '')}",
            f"\nColor Palette: {json_prompt.get('color_palette', '')}",
            f"\nMood: {json_prompt.get('mood', '')}",
            f"\nStyle: {json_prompt.get('style', '')}",
            f"\nTechnical: {json_prompt.get('technical_details', '')}",
        ])
        
        return " ".join(parts)
    
    def get_capabilities(self) -> Dict[str, Any]:
        """Get agent capabilities and configuration."""
        base_caps = super().get_capabilities()
        base_caps.update({
            "text_model": self.text_model_name,
            "image_model": self.image_model_name,
            "has_api_key": bool(self.api_key),
            "output_directory": str(self.output_dir),
            "supported_styles": [
                "realistic",
                "cartoon",
                "minimalist",
                "watercolor",
                "professional",
                "modern",
                "vintage",
                "abstract",
            ],
            "supported_aspect_ratios": ["1:1", "16:9", "9:16", "4:3", "3:4"],
        })
        return base_caps


if __name__ == "__main__":
    # Example usage
    agent = ImageAgent(config={"save_to_file": True})
    
    request = {
        "topic": "A modern AI assistant helping a student with homework in a cozy study room",
        "style": "professional and modern",
        "aspect_ratio": "16:9"
    }
    
    response = agent.process(request)
    print(f"\nStatus: {response.status.value}")
    if response.status == AgentStatus.SUCCESS:
        print(f"Image saved to: {response.result['image_path']}")
        print(f"Generated prompt: {json.dumps(response.result['prompt'], indent=2)}")
    else:
        print(f"Error: {response.error}")


