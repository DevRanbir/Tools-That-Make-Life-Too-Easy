"""
Presentation Agent - Creates PowerPoint presentations using Presenton API
"""

import requests
import json
import os
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime

class PresentationAgent:
    """
    Presentation Agent for creating PowerPoint slides
    Uses Presenton Docker service to generate presentations
    """
    
    def __init__(self, api_url: str = "http://20.197.35.140:5000/api/v1/ppt/presentation"):
        self.api_url = api_url
        self.name = "Presentation Agent"
        self.description = "Creates PowerPoint presentations with AI-generated content"
        self.output_dir = Path("outputs/presentations")
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    def _get_gemini_key(self) -> Optional[str]:
        """Get Gemini API key from environment"""
        return os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    
    def _analyze_topic(self, topic: str) -> Dict[str, Any]:
        """Use Gemini to determine best presentation settings"""
        api_key = self._get_gemini_key()
        if not api_key:
            # Return defaults if no API key
            return {
                "tone": "professional",
                "verbosity": "standard",
                "include_table_of_contents": True,
                "web_search": False,
                "instructions": f"Create a comprehensive presentation about {topic}",
                "n_slides": 8,
                "template": "general"
            }
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
        
        prompt = f"""
        You are an expert presentation designer. I need to create a presentation about: "{topic}".
        
        Analyze this topic and determine the best configuration. Return ONLY a JSON object with these keys:
        - tone: one of ["default", "casual", "professional", "funny", "educational", "sales_pitch"]
        - verbosity: one of ["concise", "standard", "text-heavy"]
        - include_table_of_contents: boolean (true if topic is complex)
        - web_search: boolean (true if topic requires up-to-date info or facts)
        - instructions: string (specific guidance for the content generator)
        - n_slides: integer (between 6 and 12)
        - template: one of ["general", "swift"] (choose the best visual style for the topic)
        
        JSON:
        """
        
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }]
        }
        
        try:
            response = requests.post(url, json=payload, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            
            # Extract JSON from response - handle nested JSON properly
            import re
            # Try to find JSON object (handles nested braces)
            text_cleaned = text.strip()
            
            # Remove markdown code blocks if present
            text_cleaned = re.sub(r'```json|```', '', text_cleaned).strip()
            
            # Find JSON object by matching braces properly
            brace_count = 0
            start_idx = -1
            for i, char in enumerate(text_cleaned):
                if char == '{':
                    if start_idx == -1:
                        start_idx = i
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0 and start_idx != -1:
                        json_str = text_cleaned[start_idx:i+1]
                        try:
                            config = json.loads(json_str)
                            return config
                        except json.JSONDecodeError:
                            continue
            
            # Fallback: try simple regex if brace matching fails
            json_match = re.search(r'\{.*\}', text_cleaned, re.DOTALL)
            if json_match:
                try:
                    config = json.loads(json_match.group(0))
                    return config
                except json.JSONDecodeError:
                    pass
        except Exception as e:
            print(f"[PRESENTATION] Gemini analysis failed: {e}, using defaults")
        
        # Return defaults
        return {
            "tone": "professional",
            "verbosity": "standard",
            "include_table_of_contents": True,
            "web_search": False,
            "instructions": f"Create a comprehensive presentation about {topic}",
            "n_slides": 8,
            "template": "general"
        }
    
    def _convert_pptx_to_images(self, pptx_path: Path) -> list[str]:
        """Convert PPTX slides to images for preview"""
        try:
            from pptx import Presentation
            from PIL import Image
            import io
            
            prs = Presentation(str(pptx_path))
            slide_images = []
            
            # Note: This is a simplified version
            # For proper conversion, you'd need LibreOffice or similar
            print(f"[PRESENTATION] PPTX has {len(prs.slides)} slides")
            
            # For now, just return the count
            # In production, use LibreOffice headless or similar
            return []
            
        except Exception as e:
            print(f"[PRESENTATION] Could not convert to images: {e}")
            return []
    
    def generate_presentation(self, topic: str, config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Generate a PowerPoint presentation
        
        Args:
            topic: Presentation topic
            config: Optional configuration (tone, verbosity, etc.)
            
        Returns:
            Dictionary with status, file path, and metadata
        """
        try:
            print(f"[PRESENTATION] Generating presentation for: {topic}")
            
            # Default settings
            default_config = {
                "tone": "professional",
                "verbosity": "standard",
                "web_search": True,
                "include_table_of_contents": True,
                "instructions": "",
                "n_slides": 8,
                "template": "general"
            }
            
            # Analyze topic if no config provided
            if not config:
                config = self._analyze_topic(topic)
                if config:
                    default_config.update(config)
            
            config = default_config
            print(f"[PRESENTATION] Using config: {config}")
            
            # Prepare payload exactly like working code
            payload = {
                "content": topic,
                "n_slides": config["n_slides"],
                "language": "English",
                "template": "general",  # Hardcoded like working code
                
                # Dynamic Options
                "tone": config["tone"],
                "verbosity": config["verbosity"],
                "web_search": config["web_search"],
                "include_title_slide": True,
                "include_table_of_contents": config["include_table_of_contents"],
                "instructions": config["instructions"],
                
                "export_as": "pptx"
            }
            
            # Call Presenton API
            print(f"[PRESENTATION] Calling Presenton API...")
            response = requests.post(f"{self.api_url}/generate", json=payload, timeout=120)
            response.raise_for_status()
            
            result = response.json()
            print(f"[PRESENTATION] API Response: {result}")
            
            # Get file path from response
            presentation_id = result.get("presentation_id")
            container_path = result.get("path")
            
            if not container_path:
                raise Exception("No file path returned from API")
            
            # Extract filename from path
            filename = os.path.basename(container_path)
            
            # Try to copy file from container/server to local outputs folder
            local_path = self.output_dir / filename
            
            print(f"[PRESENTATION] Container path: {container_path}")
            print(f"[PRESENTATION] Target local path: {local_path}")
            
            try:
                # Option 1: Try direct HTTP download if API provides download endpoint
                download_url = f"{self.api_url.rsplit('/', 3)[0]}/download/{presentation_id}"
                print(f"[PRESENTATION] Attempting download from: {download_url}")
                
                download_response = requests.get(download_url, timeout=30)
                if download_response.status_code == 200:
                    with open(local_path, 'wb') as f:
                        f.write(download_response.content)
                    print(f"[PRESENTATION] File downloaded successfully via HTTP")
                else:
                    raise Exception(f"HTTP download failed with status {download_response.status_code}")
                    
            except Exception as http_error:
                print(f"[PRESENTATION] HTTP download failed: {http_error}, trying other methods...")
                
                try:
                    # Option 2: Try docker cp (assuming container name is 'presenton')
                    subprocess.run(
                        ["docker", "cp", f"presenton:{container_path}", str(local_path)],
                        check=True,
                        capture_output=True
                    )
                    print(f"[PRESENTATION] File copied via docker cp")
                    
                except (subprocess.CalledProcessError, FileNotFoundError) as docker_error:
                    print(f"[PRESENTATION] Docker cp failed: {docker_error}, trying mounted volumes...")
                    
                    # Option 3: Check various mounted volume paths
                    possible_paths = [
                        Path("app_data/exports") / filename,
                        Path("../app_data/exports") / filename,
                        Path("Presenton/app_data/exports") / filename,
                        Path(f"/home/azureuser/app_data/exports/{filename}")  # Direct Linux path
                    ]
                    
                    file_found = False
                    for p in possible_paths:
                        if p.exists():
                            import shutil
                            shutil.copy2(p, local_path)
                            print(f"[PRESENTATION] File copied from mounted volume: {p}")
                            file_found = True
                            break
                    
                    if not file_found:
                        # Option 4: Create a placeholder if we can't get the file
                        print(f"[PRESENTATION] WARNING: Could not retrieve file, creating placeholder")
                        # Still return success but with warning
            
            if not local_path.exists():
                print(f"[PRESENTATION] ERROR: File not found at {local_path}")
                raise Exception(f"Could not retrieve presentation file from {container_path}")
            
            return {
                'status': 'success',
                'file_path': str(local_path),
                'filename': filename,
                'topic': topic,
                'slides': config.get('n_slides', 8),
                'template': config.get('template', 'general'),
                'tone': config.get('tone', 'professional')
            }
            
        except requests.exceptions.RequestException as e:
            print(f"[PRESENTATION] Error: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"Server response: {e.response.text}")
            return {
                'status': 'error',
                'error': str(e)
            }
        except Exception as e:
            print(f"[PRESENTATION] Error: {e}")
            return {
                'status': 'error',
                'error': str(e)
            }
    
    def process(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process presentation generation request
        
        Expected request format:
        {
            "topic": "Presentation topic",
            "config": {  # Optional
                "tone": "professional",
                "n_slides": 8,
                ...
            }
        }
        """
        topic = request.get('topic')
        if not topic:
            return {
                'status': 'error',
                'result': {},
                'error': 'No topic provided'
            }
        
        config = request.get('config')
        result = self.generate_presentation(topic, config)
        
        if result.get('status') == 'success':
            return {
                'status': 'success',
                'result': result,
                'error': None
            }
        else:
            return {
                'status': 'error',
                'result': {},
                'error': result.get('error', 'Unknown error')
            }


# For testing
if __name__ == "__main__":
    import sys
    
    agent = PresentationAgent()
    
    if len(sys.argv) > 1:
        topic = " ".join(sys.argv[1:])
    else:
        topic = input("Enter presentation topic: ")
    
    print(f"\n🎯 Creating presentation: {topic}\n")
    result = agent.generate_presentation(topic)
    
    if result.get('status') == 'success':
        print(f"\n✅ Presentation created successfully!")
        print(f"📁 File: {result['file_path']}")
        print(f"📊 Slides: {result['slides']}")
        print(f"🎨 Template: {result['template']}")
    else:
        print(f"\n❌ Error: {result.get('error')}")

