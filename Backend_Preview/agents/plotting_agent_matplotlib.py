from __future__ import annotations

import os
import json
import re
from typing import Any, Dict, Optional, List
from pathlib import Path
from datetime import datetime

from agents.base_agent import BaseAgent, AgentResponse, AgentStatus

try:
    import matplotlib
    matplotlib.use('Agg')  # Non-interactive backend
    import matplotlib.pyplot as plt
    import numpy as np
except ImportError:
    raise ImportError("Install matplotlib: pip install matplotlib")

try:
    import google.generativeai as genai
except ImportError:
    raise ImportError("Install google-genai: pip install google-genai")


class PlottingAgentMatplotlib(BaseAgent):
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(
            name="Plotting Agent",
            description="Creates bar charts, pie charts, line charts, and other visualizations using matplotlib",
            config=config
        )
        
        self.gemini_api_key = self.config.get("gemini_api_key") or os.getenv("GEMINI_API_KEY")
        
        if self.gemini_api_key:
            genai.configure(api_key=self.gemini_api_key)
            self.gemini_model = genai.GenerativeModel("gemini-2.0-flash-exp")
        else:
            self.gemini_model = None
        
        self.output_dir = Path(self.config.get("output_dir", "outputs/plots"))
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        self.supported_chart_types = [
            "bar", "pie", "line", "scatter", "area",
            "horizontal_bar", "stacked_bar", "grouped_bar"
        ]
        
        # Set matplotlib style
        plt.style.use('seaborn-v0_8-darkgrid' if 'seaborn-v0_8-darkgrid' in plt.style.available else 'default')
    
    def process(self, request: Dict[str, Any]) -> AgentResponse:
        self.status = AgentStatus.PROCESSING
        
        try:
            topic = request.get("topic", "")
            data = request.get("data")
            chart_types = request.get("chart_types", [])  # NEW: Support multiple chart types
            chart_type = request.get("chart_type", "bar")  # OLD: Single chart type
            
            # Auto-detect chart types from topic if not explicitly provided
            if not chart_types and topic:
                detected_types = []
                topic_lower = topic.lower()
                
                # Detect which chart types are mentioned
                if 'bar chart' in topic_lower or 'bar graph' in topic_lower or 'grouped bar' in topic_lower:
                    detected_types.append('bar')
                if 'line chart' in topic_lower or 'line graph' in topic_lower:
                    detected_types.append('line')
                if 'pie chart' in topic_lower or 'pie graph' in topic_lower or 'percentage share' in topic_lower:
                    detected_types.append('pie')
                
                # Check if user wants separate charts or combined
                wants_separate = any(phrase in topic_lower for phrase in [
                    'separate',
                    'separately',
                    'individual',
                    'each chart',
                    'three different',
                    'three separate',
                    'two different',
                    'two separate'
                ])
                
                # Also check if instructions are listed separately for each chart type
                # This usually indicates they want separate charts
                if not wants_separate and len(detected_types) > 1:
                    # Count how many times "chart" appears with instructions (colon or dash before it)
                    instruction_patterns = [
                        r'[-–:]\s*' + dt + r'\s+chart' for dt in detected_types
                    ]
                    if sum(1 for pattern in instruction_patterns if re.search(pattern, topic_lower)) >= len(detected_types):
                        wants_separate = True
                        print(f"[PLOTTING] Detected separate instructions for each chart type - creating separate charts")
                
                # Check if user wants multiple charts or just mentions them in instructions
                # If they explicitly say "and" or list multiple types, they want multiple charts
                wants_multiple = False
                if len(detected_types) > 1:
                    # Check if it's an explicit request for multiple charts
                    multi_indicators = [
                        'chart types:',  # "in three chart types: bar, line, pie"
                        'chart type:',   # "in chart type: bar and line"
                        'charts:',       # "create charts: bar and pie"
                        ' and ',         # "bar chart and pie chart"
                        'multiple',      # "multiple chart types"
                        'both',          # "both bar and pie"
                        'all',           # "all three charts"
                    ]
                    wants_multiple = any(indicator in topic_lower for indicator in multi_indicators)
                
                # Store the separate flag in the request for later use
                if wants_separate:
                    request['create_separate'] = True
                
                if wants_multiple and len(detected_types) > 1:
                    # User explicitly wants multiple charts
                    chart_types = detected_types
                    print(f"[PLOTTING] Auto-detected chart types from topic: {chart_types}")
                    if wants_separate:
                        print(f"[PLOTTING] User wants SEPARATE charts")
                elif len(detected_types) == 1:
                    # Only one type mentioned, use it
                    chart_type = detected_types[0]
                elif len(detected_types) > 1 and not wants_multiple:
                    # Multiple types mentioned but not explicitly requested (probably in instructions)
                    # Use the first one mentioned as the primary request
                    chart_type = detected_types[0]
            
            # If chart_types is provided, create multiple charts
            if chart_types and isinstance(chart_types, list) and len(chart_types) > 1:
                print(f"[PLOTTING] Creating {len(chart_types)} charts for: {topic[:100]}")
                
                # Parse data from topic if not provided
                if not data:
                    data = self._extract_data_from_text(topic)
                
                if not data:
                    raise ValueError("Could not extract data from prompt")
                
                # Check if user wants separate images or combined
                create_separate = request.get('create_separate', False)
                
                if create_separate:
                    # Create separate images for each chart type
                    print(f"[PLOTTING] Creating SEPARATE images for each chart type")
                    image_paths = []
                    for chart_type in chart_types:
                        image_path = self._create_matplotlib_chart(data, chart_type, topic)
                        image_paths.append(image_path)
                    
                    self.status = AgentStatus.SUCCESS
                    return AgentResponse(
                        agent_name=self.name,
                        status=AgentStatus.SUCCESS,
                        result={
                            "chart_types": chart_types,
                            "title": data.get("title", topic[:50]),
                            "image_urls": [f"/outputs/plots/{p.name}" for p in image_paths],
                            "filenames": [p.name for p in image_paths],
                            "file_paths": [str(p) for p in image_paths],
                            "multiple_separate_charts": True
                        },
                        metadata={"chart_types": chart_types, "count": len(chart_types), "separate": True}
                    )
                else:
                    # Create multiple charts in one combined image
                    image_path = self._create_multiple_charts(data, chart_types, topic)
                    
                    self.status = AgentStatus.SUCCESS
                    return AgentResponse(
                        agent_name=self.name,
                        status=AgentStatus.SUCCESS,
                        result={
                            "chart_types": chart_types,
                            "title": data.get("title", topic[:50]),
                            "image_url": f"/outputs/plots/{image_path.name}",
                            "filename": image_path.name,
                            "file_path": str(image_path),
                            "multiple_charts": True
                        },
                        metadata={"chart_types": chart_types, "count": len(chart_types)}
                    )
            else:
                # Single chart (original behavior)
                print(f"[PLOTTING] Creating {chart_type} chart for: {topic[:100]}")
                
                # Parse data from topic if not provided
                if not data:
                    data = self._extract_data_from_text(topic)
                
                if not data:
                    raise ValueError("Could not extract data from prompt")
                
                # Create the chart
                image_path = self._create_matplotlib_chart(data, chart_type, topic)
                
                self.status = AgentStatus.SUCCESS
                return AgentResponse(
                    agent_name=self.name,
                    status=AgentStatus.SUCCESS,
                    result={
                        "chart_type": chart_type,
                        "title": data.get("title", topic[:50]),
                        "image_url": f"/outputs/plots/{image_path.name}",
                        "filename": image_path.name,
                        "file_path": str(image_path)
                    },
                    metadata={"chart_type": chart_type}
                )
                
        except Exception as exc:
            self.status = AgentStatus.ERROR
            print(f"[PLOTTING] ERROR: {exc}")
            import traceback
            traceback.print_exc()
            return AgentResponse(
                agent_name=self.name,
                status=AgentStatus.ERROR,
                result=None,
                error=str(exc),
                metadata={"request": request}
            )
    
    def _extract_data_from_text(self, text: str) -> Optional[Dict[str, Any]]:
        """Extract data from text using regex or Gemini"""
        print(f"[PLOTTING] Extracting data from text...")
        
        # Check if multiple chart types are requested
        chart_type_keywords = {
            'bar': ['bar chart', 'bar graph', 'grouped bar'],
            'line': ['line chart', 'line graph', 'trend'],
            'pie': ['pie chart', 'pie graph', 'percentage'],
        }
        
        detected_chart_types = []
        text_lower = text.lower()
        for chart_type, keywords in chart_type_keywords.items():
            if any(kw in text_lower for kw in keywords):
                detected_chart_types.append(chart_type)
        
        # Try regex pattern matching first (faster)
        data = self._regex_extract_data(text)
        if data:
            print(f"[PLOTTING] Data extracted via regex: {data}")
            if detected_chart_types:
                data['requested_chart_types'] = detected_chart_types
            return data
        
        # Fallback to Gemini if available
        if self.gemini_model:
            print(f"[PLOTTING] Using Gemini to extract data...")
            data = self._gemini_extract_data(text)
            if data:
                print(f"[PLOTTING] Data extracted via Gemini: {data}")
                if detected_chart_types:
                    data['requested_chart_types'] = detected_chart_types
                return data
        
        return None
    
    def _regex_extract_data(self, text: str) -> Optional[Dict[str, Any]]:
        """Extract data using regex patterns"""
        try:
            # Normalize text: replace semicolons with newlines for easier parsing
            text_normalized = text.replace(';', '\n')
            
            # Check if it's quarterly data with regions - match all regions in one line
            # Pattern: "Q1 - North: 120, South: 90, East: 75, West: 60"
            quarterly_line_pattern = r'Q(\d+)\s*[-–]\s*(.+?)(?=Q\d+|$)'
            quarterly_lines = re.findall(quarterly_line_pattern, text_normalized, re.IGNORECASE | re.DOTALL)
            
            if quarterly_lines:
                region_data = {}
                for quarter_num, region_values_str in quarterly_lines:
                    # Extract all "Region: value" pairs from this line
                    region_value_pattern = r'(\w+):\s*(\d+)'
                    region_matches = re.findall(region_value_pattern, region_values_str)
                    
                    for region, value in region_matches:
                        region = region.strip().title()
                        if region not in region_data:
                            region_data[region] = []
                        region_data[region].append((int(quarter_num), float(value)))
                
                if region_data and len(region_data) >= 2:  # At least 2 regions
                    # Use Q4 data for pie chart, or last available quarter
                    labels = []
                    values = []
                    for region in sorted(region_data.keys()):  # Sorted for consistency
                        data_points = region_data[region]
                        # Sort by quarter and take the last (Q4) data
                        data_points.sort(key=lambda x: x[0])
                        labels.append(region)
                        values.append(data_points[-1][1])  # Use last quarter's data
                    
                    if labels and values:
                        title_match = re.search(r'[Tt]itle[:\s]+["\']?([^"\'\n]+)["\']?', text)
                        title = title_match.group(1).strip() if title_match else "Regional Revenue Performance"
                        
                        return {
                            "labels": labels,
                            "values": values,
                            "title": title,
                            "quarterly_data": region_data
                        }
            
            # Pattern: "Category: value" or "Category - value"
            pattern = r'([A-Za-z0-9\s]+)[\s:,-]+(\d+(?:\.\d+)?)'
            matches = re.findall(pattern, text)
            
            if matches and len(matches) >= 2:
                labels = []
                values = []
                seen_labels = set()
                for label, value in matches:
                    label = label.strip()
                    # Skip quarter indicators and common words, but allow region names
                    if label and label.lower() not in ['q1', 'q2', 'q3', 'q4', 'quarter', 'data', 'title']:
                        if label not in seen_labels:  # Avoid duplicates
                            labels.append(label)
                            values.append(float(value))
                            seen_labels.add(label)
                
                if labels and values:
                    # Extract title if present
                    title_match = re.search(r'[Tt]itle[:\s]+["\']?([^"\'\n]+)["\']?', text)
                    title = title_match.group(1).strip() if title_match else "Chart"
                    
                    return {
                        "labels": labels,
                        "values": values,
                        "title": title
                    }
        except Exception as e:
            print(f"[PLOTTING] Regex extraction failed: {e}")
        
        return None
    
    def _gemini_extract_data(self, text: str) -> Optional[Dict[str, Any]]:
        """Use Gemini to extract structured data"""
        prompt = f"""Extract chartable data from this text:

{text}

Return ONLY a JSON object with this EXACT structure:
{{
    "labels": ["Label1", "Label2", "Label3"],
    "values": [value1, value2, value3],
    "title": "Chart Title"
}}

Rules:
- If multiple quarters are mentioned for same categories, use the LATEST quarter (Q4) data
- For regional data like "North: 150, South: 110", extract region names as labels
- Labels should be category names (e.g., "North", "South", "East", "West")
- Values must be numbers only (use latest/Q4 values if quarterly data)
- If title is specified in text, use it; otherwise create a meaningful title
- Return ONLY JSON, no markdown, no explanation
"""

        try:
            response = self.gemini_model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.1,
                    max_output_tokens=500
                )
            )
            result_text = response.text.strip()
            
            # Clean markdown if present
            if result_text.startswith("```"):
                result_text = result_text.split("```")[1]
                if result_text.startswith("json"):
                    result_text = result_text[4:]
                result_text = result_text.strip()
            
            data = json.loads(result_text)
            
            if "labels" in data and "values" in data:
                return data
        except Exception as e:
            print(f"[PLOTTING] Gemini extraction failed: {e}")
        
        return None
    
    def _create_multiple_charts(self, data: Dict[str, Any], chart_types: List[str], topic: str) -> Path:
        """Create multiple charts in one image with subplots"""
        labels = data.get("labels", [])
        values = data.get("values", [])
        title = data.get("title", topic[:50] if topic else "Charts")
        quarterly_data = data.get("quarterly_data", {})
        
        # Convert values to floats
        values = [float(v) for v in values]
        
        # Determine layout based on number of charts
        num_charts = len(chart_types)
        if num_charts == 2:
            fig, axes = plt.subplots(1, 2, figsize=(16, 6))
        elif num_charts == 3:
            fig, axes = plt.subplots(1, 3, figsize=(20, 6))
        elif num_charts == 4:
            fig, axes = plt.subplots(2, 2, figsize=(16, 12))
        else:
            fig, axes = plt.subplots(1, num_charts, figsize=(8*num_charts, 6))
        
        # Ensure axes is always iterable
        if num_charts == 1:
            axes = [axes]
        else:
            axes = axes.flatten() if num_charts > 2 else axes
        
        # Color palette
        colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
                  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1']
        
        # Create each chart
        for idx, chart_type in enumerate(chart_types):
            ax = axes[idx]
            
            if chart_type == "bar":
                bars = ax.bar(labels, values, color=colors[:len(labels)], alpha=0.8, edgecolor='black', linewidth=1.5)
                ax.set_ylabel('Value', fontsize=11, fontweight='bold')
                ax.set_xlabel('Category', fontsize=11, fontweight='bold')
                ax.set_title('Bar Chart (Q4 Data)', fontsize=13, fontweight='bold', pad=10)
                # Add value labels on bars
                for bar in bars:
                    height = bar.get_height()
                    ax.text(bar.get_x() + bar.get_width()/2., height,
                           f'{height:.0f}',
                           ha='center', va='bottom', fontsize=9, fontweight='bold')
                ax.tick_params(axis='x', rotation=45)
                
            elif chart_type == "line":
                # If quarterly data is available, plot trends across quarters
                if quarterly_data:
                    # Get all quarters (assuming Q1-Q4)
                    all_quarters = sorted(set(q for region_data in quarterly_data.values() for q, _ in region_data))
                    quarter_labels = [f'Q{q}' for q in all_quarters]
                    
                    # Plot each region as a separate line
                    for region_idx, (region, region_values) in enumerate(sorted(quarterly_data.items())):
                        region_values_sorted = sorted(region_values, key=lambda x: x[0])
                        quarters = [q for q, _ in region_values_sorted]
                        vals = [v for _, v in region_values_sorted]
                        
                        ax.plot(quarter_labels, vals, marker='o', linewidth=2.5, markersize=8,
                               label=region, color=colors[region_idx % len(colors)],
                               markeredgewidth=2, markeredgecolor='black')
                    
                    ax.set_ylabel('Value', fontsize=11, fontweight='bold')
                    ax.set_xlabel('Quarter', fontsize=11, fontweight='bold')
                    ax.set_title('Revenue Trends (Q1-Q4)', fontsize=13, fontweight='bold', pad=10)
                    ax.legend(loc='best', fontsize=9, framealpha=0.9)
                    ax.grid(True, alpha=0.3)
                else:
                    # Single line if no quarterly data
                    ax.plot(labels, values, marker='o', linewidth=2.5, markersize=8, 
                           color=colors[0], markerfacecolor=colors[1], markeredgewidth=2, markeredgecolor='black')
                    ax.set_ylabel('Value', fontsize=11, fontweight='bold')
                    ax.set_xlabel('Category', fontsize=11, fontweight='bold')
                    ax.set_title('Line Chart', fontsize=13, fontweight='bold', pad=10)
                    ax.grid(True, alpha=0.3)
                    ax.tick_params(axis='x', rotation=45)
                
            elif chart_type == "pie":
                wedges, texts, autotexts = ax.pie(values, labels=labels, autopct='%1.1f%%',
                                                   colors=colors[:len(labels)],
                                                   startangle=90, textprops={'fontsize': 10, 'fontweight': 'bold'})
                ax.set_title('Revenue Share (Q4)', fontsize=13, fontweight='bold', pad=10)
                # Make percentage text white and bold
                for autotext in autotexts:
                    autotext.set_color('white')
                    autotext.set_fontweight('bold')
                    autotext.set_fontsize(11)
        
        # Main title
        fig.suptitle(title, fontsize=16, fontweight='bold', y=0.98)
        
        # Improve layout
        plt.tight_layout()
        
        # Save figure
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).strip()[:30]
        filename = f"charts_{safe_title}_{timestamp}.png"
        filepath = self.output_dir / filename
        
        plt.savefig(filepath, dpi=150, bbox_inches='tight', facecolor='white')
        plt.close(fig)
        
        print(f"[PLOTTING] Multiple charts saved to: {filepath}")
        return filepath
    
    def _create_matplotlib_chart(self, data: Dict[str, Any], chart_type: str, topic: str) -> Path:
        """Create chart using matplotlib"""
        labels = data.get("labels", [])
        values = data.get("values", [])
        title = data.get("title", topic[:50] if topic else "Chart")
        
        # Convert values to floats
        values = [float(v) for v in values]
        
        # Create figure with good size
        fig, ax = plt.subplots(figsize=(12, 7))
        
        # Color palette
        colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
                  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1']
        
        if chart_type == "bar" or chart_type == "grouped_bar":
            bars = ax.bar(labels, values, color=colors[:len(labels)], alpha=0.8, edgecolor='black', linewidth=1.5)
            ax.set_ylabel('Value', fontsize=12, fontweight='bold')
            ax.set_xlabel('Category', fontsize=12, fontweight='bold')
            # Add value labels on bars
            for bar in bars:
                height = bar.get_height()
                ax.text(bar.get_x() + bar.get_width()/2., height,
                       f'{height:.0f}',
                       ha='center', va='bottom', fontsize=10, fontweight='bold')
            plt.xticks(rotation=45, ha='right')
            
        elif chart_type == "horizontal_bar":
            bars = ax.barh(labels, values, color=colors[:len(labels)], alpha=0.8, edgecolor='black', linewidth=1.5)
            ax.set_xlabel('Value', fontsize=12, fontweight='bold')
            ax.set_ylabel('Category', fontsize=12, fontweight='bold')
            for bar in bars:
                width = bar.get_width()
                ax.text(width, bar.get_y() + bar.get_height()/2.,
                       f'{width:.0f}',
                       ha='left', va='center', fontsize=10, fontweight='bold')
            
        elif chart_type == "line":
            ax.plot(labels, values, marker='o', linewidth=3, markersize=10, 
                   color=colors[0], markerfacecolor=colors[1], markeredgewidth=2, markeredgecolor='black')
            ax.set_ylabel('Value', fontsize=12, fontweight='bold')
            ax.set_xlabel('Category', fontsize=12, fontweight='bold')
            ax.grid(True, alpha=0.3)
            plt.xticks(rotation=45, ha='right')
            
        elif chart_type == "pie":
            wedges, texts, autotexts = ax.pie(values, labels=labels, autopct='%1.1f%%',
                                               colors=colors[:len(labels)],
                                               startangle=90, textprops={'fontsize': 11, 'fontweight': 'bold'})
            # Make percentage text white and bold
            for autotext in autotexts:
                autotext.set_color('white')
                autotext.set_fontweight('bold')
                autotext.set_fontsize(12)
            
        elif chart_type == "scatter":
            ax.scatter(range(len(values)), values, s=200, c=colors[:len(values)], 
                      alpha=0.7, edgecolors='black', linewidth=2)
            ax.set_xticks(range(len(labels)))
            ax.set_xticklabels(labels, rotation=45, ha='right')
            ax.set_ylabel('Value', fontsize=12, fontweight='bold')
            ax.grid(True, alpha=0.3)
            
        else:  # Default to bar
            bars = ax.bar(labels, values, color=colors[:len(labels)], alpha=0.8, edgecolor='black', linewidth=1.5)
            ax.set_ylabel('Value', fontsize=12, fontweight='bold')
            plt.xticks(rotation=45, ha='right')
        
        # Set title
        ax.set_title(title, fontsize=16, fontweight='bold', pad=20)
        
        # Improve layout
        plt.tight_layout()
        
        # Save figure
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).strip()[:30]
        filename = f"chart_{safe_title}_{timestamp}.png"
        filepath = self.output_dir / filename
        
        plt.savefig(filepath, dpi=150, bbox_inches='tight', facecolor='white')
        plt.close(fig)
        
        print(f"[PLOTTING] Chart saved to: {filepath}")
        return filepath
    
    def get_capabilities(self) -> Dict[str, Any]:
        base_caps = super().get_capabilities()
        base_caps.update({
            "supported_chart_types": self.supported_chart_types,
            "has_gemini": bool(self.gemini_model),
            "backend": "matplotlib"
        })
        return base_caps


if __name__ == "__main__":
    agent = PlottingAgentMatplotlib()
    
    # Test with data
    test_request = {
        "topic": "Sales by Region: North 120, South 150, East 100, West 130",
        "chart_type": "bar"
    }
    
    response = agent.process(test_request)
    print(f"Status: {response.status.value}")
    if response.status == AgentStatus.SUCCESS:
        print(f"Chart saved to: {response.result['file_path']}")
    else:
        print(f"Error: {response.error}")

