from __future__ import annotations

import os
import tempfile
import requests
import time
import random
from typing import Any, Dict, Optional
from datetime import datetime
from flask import Flask, request
from twilio.rest import Client
from twilio.twiml.voice_response import VoiceResponse, Gather

from agents.base_agent import BaseAgent, AgentResponse, AgentStatus

try:
    import google.generativeai as genai
except ImportError:
    raise ImportError("Install google-genai: pip install google-genai")


INDIAN_VOICES = {
    'female': ['Google.en-IN-Neural2-A', 'Google.en-IN-Neural2-D', 'Polly.Aditi', 'Polly.Kajal-Neural'],
    'male': ['Google.en-IN-Neural2-B', 'Google.en-IN-Neural2-C']
}

INDIAN_NAMES = {
    'female': ['Priya', 'Ananya', 'Kavya', 'Diya', 'Meera', 'Riya'],
    'male': ['Arjun', 'Rohan', 'Aditya', 'Karan', 'Rahul', 'Vikram']
}


class CallAgent(BaseAgent):
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(
            name="Call Agent",
            description="Sets up calls, records key points, and auto-responds",
            config=config
        )
        
        self.twilio_sid = self.config.get("twilio_sid") or os.getenv("TWILIO_ACCOUNT_SID")
        self.twilio_token = self.config.get("twilio_token") or os.getenv("TWILIO_AUTH_TOKEN")
        self.twilio_phone = self.config.get("twilio_phone") or os.getenv("TWILIO_PHONE_NUMBER")
        self.gemini_api_key = self.config.get("gemini_api_key") or os.getenv("GEMINI_API_KEY")
        self.model_name = self.config.get("model_name", "gemini-2.0-flash-exp")
        
        if self.twilio_sid and self.twilio_token:
            self.twilio_client = Client(self.twilio_sid, self.twilio_token)
        else:
            self.twilio_client = None
        
        if self.gemini_api_key:
            genai.configure(api_key=self.gemini_api_key)
            self.ai_model = genai.GenerativeModel(self.model_name)
        else:
            self.ai_model = None
        
        self.call_contexts = {}
        self.flask_app = None
    
    def process(self, request: Dict[str, Any]) -> AgentResponse:
        self.status = AgentStatus.PROCESSING
        
        try:
            action = request.get("action", "make_call")
            
            if action == "make_call":
                return self._make_call(request)
            elif action == "transcribe":
                return self._transcribe_audio(request)
            elif action == "generate_response":
                return self._generate_ai_response(request)
            elif action == "start_server":
                return self._start_flask_server(request)
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
    
    def _make_call(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["phone_number"])
        
        if not self.twilio_client:
            raise ValueError("Twilio credentials required")
        
        phone_number = request["phone_number"]
        webhook_url = request.get("webhook_url")
        
        if not webhook_url:
            raise ValueError("webhook_url required for call setup")
        
        call = self.twilio_client.calls.create(
            to=phone_number,
            from_=self.twilio_phone,
            url=webhook_url
        )
        
        self.status = AgentStatus.SUCCESS
        return AgentResponse(
            agent_name=self.name,
            status=AgentStatus.SUCCESS,
            result={
                "call_sid": call.sid,
                "to": phone_number,
                "status": call.status
            }
        )
    
    def _transcribe_audio(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["audio_url"])
        
        if not self.ai_model:
            raise ValueError("Gemini API key required")
        
        audio_url = request["audio_url"]
        auth = (self.twilio_sid, self.twilio_token) if request.get("use_twilio_auth") else None
        
        response = requests.get(audio_url, auth=auth, timeout=30)
        
        if response.status_code != 200:
            raise Exception(f"Failed to download audio: {response.status_code}")
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_audio:
            temp_audio.write(response.content)
            temp_audio_path = temp_audio.name
        
        try:
            with open(temp_audio_path, 'rb') as audio_file:
                audio_data = audio_file.read()
            
            prompt = "Transcribe this audio accurately:"
            response = self.ai_model.generate_content([
                prompt,
                {"mime_type": "audio/wav", "data": audio_data}
            ])
            
            transcription = response.text.strip()
            
            os.unlink(temp_audio_path)
            
            self.status = AgentStatus.SUCCESS
            return AgentResponse(
                agent_name=self.name,
                status=AgentStatus.SUCCESS,
                result={"transcription": transcription}
            )
            
        except Exception as e:
            if os.path.exists(temp_audio_path):
                os.unlink(temp_audio_path)
            raise e
    
    def _generate_ai_response(self, request: Dict[str, Any]) -> AgentResponse:
        self.validate_request(request, ["query"])
        
        if not self.ai_model:
            raise ValueError("Gemini API key required")
        
        query = request["query"]
        call_sid = request.get("call_sid")
        ai_name = request.get("ai_name", "Assistant")
        
        history = []
        if call_sid and call_sid in self.call_contexts:
            history = self.call_contexts[call_sid].get("history", [])
        
        system_prompt = call_sid and call_sid in self.call_contexts and self.call_contexts[call_sid].get('system_prompt')
        
        if not system_prompt:
            system_prompt = f"""You are {ai_name}, a friendly AI assistant in a phone conversation.
Keep responses under 40 words for easy listening.
Be conversational and natural."""
        
        conversation = f"{system_prompt}\n\n"
        for entry in history:
            conversation += f"User: {entry['query']}\nAssistant: {entry['response']}\n\n"
        conversation += f"User: {query}\nAssistant:"
        
        response = self.ai_model.generate_content(conversation)
        ai_response = response.text.strip()
        
        if call_sid:
            if call_sid not in self.call_contexts:
                self.call_contexts[call_sid] = {"history": []}
            self.call_contexts[call_sid]["history"].append({
                "query": query,
                "response": ai_response,
                "timestamp": datetime.now().isoformat()
            })
        
        self.status = AgentStatus.SUCCESS
        return AgentResponse(
            agent_name=self.name,
            status=AgentStatus.SUCCESS,
            result={"response": ai_response, "ai_name": ai_name}
        )
    
    def _start_flask_server(self, request: Dict[str, Any]) -> AgentResponse:
        if self.flask_app:
            return AgentResponse(
                agent_name=self.name,
                status=AgentStatus.SUCCESS,
                result={"message": "Server already running"}
            )
        
        app = Flask(__name__)
        self.flask_app = app
        
        @app.route("/voice-webhook", methods=["POST"])
        def voice_webhook():
            response = VoiceResponse()
            call_sid = request.form.get('CallSid')
            
            gender = random.choice(['female', 'male'])
            voice = random.choice(INDIAN_VOICES[gender])
            ai_name = random.choice(INDIAN_NAMES[gender])
            
            self.call_contexts[call_sid] = {
                'voice': voice,
                'ai_name': ai_name,
                'history': []
            }
            
            greeting = f"Hello! I'm {ai_name}, your AI assistant. Press 5 to end call. Press 0 when done speaking."
            
            gather = Gather(input='dtmf', action='/check-end', timeout=1, num_digits=1)
            gather.say(greeting, voice=voice, language='en-IN')
            response.append(gather)
            
            response.record(timeout=5, max_length=50, action='/process-message', 
                          transcribe=False, play_beep=True, finish_on_key='0')
            
            return str(response), 200, {'Content-Type': 'text/xml'}
        
        @app.route("/process-message", methods=["POST"])
        def process_message():
            response = VoiceResponse()
            recording_url = request.form.get('RecordingUrl')
            call_sid = request.form.get('CallSid')
            
            if not call_sid or call_sid not in self.call_contexts:
                response.redirect('/voice-webhook')
                return str(response), 200, {'Content-Type': 'text/xml'}
            
            context = self.call_contexts[call_sid]
            voice = context['voice']
            
            if not recording_url:
                response.say("I didn't catch that. Try again.", voice=voice, language='en-IN')
                response.redirect('/start-conversation')
                return str(response), 200, {'Content-Type': 'text/xml'}
            
            response.say("Let me think about that.", voice=voice, language='en-IN')
            
            try:
                transcribe_result = self._transcribe_audio({
                    "audio_url": recording_url,
                    "use_twilio_auth": True
                })
                
                if transcribe_result.status != AgentStatus.SUCCESS:
                    raise Exception("Transcription failed")
                
                user_query = transcribe_result.result["transcription"]
                
                ai_result = self._generate_ai_response({
                    "query": user_query,
                    "call_sid": call_sid,
                    "ai_name": context['ai_name']
                })
                
                ai_response = ai_result.result["response"]
                response.say(ai_response, voice=voice, language='en-IN')
                
                farewell_keywords = ['goodbye', 'bye', 'end call', 'hang up']
                if any(kw in user_query.lower() or kw in ai_response.lower() for kw in farewell_keywords):
                    response.hangup()
                else:
                    response.redirect('/start-conversation')
                
            except Exception as e:
                response.say("Sorry, I had trouble understanding. Try again.", voice=voice, language='en-IN')
                response.redirect('/start-conversation')
            
            return str(response), 200, {'Content-Type': 'text/xml'}
        
        @app.route("/start-conversation", methods=["POST"])
        def start_conversation():
            response = VoiceResponse()
            call_sid = request.form.get('CallSid')
            
            if call_sid not in self.call_contexts:
                response.redirect('/voice-webhook')
                return str(response), 200, {'Content-Type': 'text/xml'}
            
            voice = self.call_contexts[call_sid]['voice']
            
            gather = Gather(input='dtmf', action='/check-end', timeout=1, num_digits=1)
            gather.say("Press 0 when done.", voice=voice, language='en-IN')
            response.append(gather)
            
            response.record(timeout=5, max_length=50, action='/process-message',
                          transcribe=False, play_beep=True, finish_on_key='0')
            
            return str(response), 200, {'Content-Type': 'text/xml'}
        
        @app.route("/check-end", methods=["POST"])
        def check_end():
            response = VoiceResponse()
            digit = request.form.get('Digits', '')
            call_sid = request.form.get('CallSid')
            
            if call_sid not in self.call_contexts:
                response.redirect('/voice-webhook')
                return str(response), 200, {'Content-Type': 'text/xml'}
            
            if digit == '5':
                voice = self.call_contexts[call_sid]['voice']
                ai_name = self.call_contexts[call_sid]['ai_name']
                response.say(f"Thanks for talking with me! Goodbye from {ai_name}!", voice=voice, language='en-IN')
                response.hangup()
            else:
                response.redirect('/start-conversation')
            
            return str(response), 200, {'Content-Type': 'text/xml'}
        
        port = request.get("port", 5000)
        app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)
        
        self.status = AgentStatus.SUCCESS
        return AgentResponse(
            agent_name=self.name,
            status=AgentStatus.SUCCESS,
            result={"message": f"Server started on port {port}"}
        )
    
    def get_capabilities(self) -> Dict[str, Any]:
        base_caps = super().get_capabilities()
        base_caps.update({
            "actions": ["make_call", "transcribe", "generate_response", "start_server"],
            "has_twilio": bool(self.twilio_client),
            "has_ai": bool(self.ai_model),
            "phone_number": self.twilio_phone
        })
        return base_caps


if __name__ == "__main__":
    agent = CallAgent()
    
    response = agent.process({
        "action": "start_server",
        "port": 5000
    })
    
    print(f"Status: {response.status.value}")
    print(f"Result: {response.result}")
