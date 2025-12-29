"""
WhatsApp Agent - Bridge between Python agents and Node.js WhatsApp service
Handles sending messages, images, documents via WhatsApp
"""

import requests
import json
from typing import Dict, Any, Optional, List
from pathlib import Path
import os

class WhatsAppAgent:
    """
    WhatsApp Agent for sending messages and media via WhatsApp Web
    Communicates with Node.js WhatsApp service
    """
    
    def __init__(self, api_url: str = "http://localhost:3000"):
        self.api_url = api_url
        self.name = "WhatsApp Agent"
        self.description = "Send messages, images, documents, and more via WhatsApp"
    
    def _check_service_health(self) -> bool:
        """Check if WhatsApp service is running and ready"""
        try:
            response = requests.get(f"{self.api_url}/health", timeout=2)
            data = response.json()
            return data.get('ready', False)
        except:
            return False
    
    def _format_phone_number(self, phone: str) -> str:
        """Format phone number - remove '+' and ensure proper format"""
        # Remove all non-numeric characters (including +)
        phone = ''.join(filter(str.isdigit, phone))
        
        # Validate: should be 12 digits (country code + 10 digits)
        # If only 10 digits, user needs to add country code
        if len(phone) == 10:
            return None  # Return None to indicate error - need country code
        elif len(phone) == 12 and phone.startswith('91'):
            return phone  # Valid Indian number
        elif len(phone) >= 11:
            return phone  # Assume valid international number
        else:
            return None  # Invalid format
    
    def send_message(self, phone_number: str, message: str) -> Dict[str, Any]:
        """
        Send a text message via WhatsApp
        
        Args:
            phone_number: Phone number (with or without country code)
            message: Text message to send
            
        Returns:
            Response with success status and message ID
        """
        try:
            if not self._check_service_health():
                return {
                    'status': 'error',
                    'message': 'WhatsApp service is not ready. Please start the WhatsApp agent first.',
                    'service_url': self.api_url
                }
            
            phone_number = self._format_phone_number(phone_number)
            
            # Check if phone number formatting failed
            if phone_number is None:
                return {
                    'status': 'error',
                    'message': 'Invalid phone number format. Please provide number with country code (e.g., 919865324172 for India)',
                }
            
            response = requests.post(
                f"{self.api_url}/send/message",
                json={
                    'phoneNumber': phone_number,
                    'message': message
                },
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                return {
                    'status': 'success',
                    'message': f'Message sent to +{phone_number}',
                    'data': result
                }
            else:
                return {
                    'status': 'error',
                    'message': f'Failed to send message: {response.text}'
                }
                
        except Exception as e:
            return {
                'status': 'error',
                'message': f'Error sending WhatsApp message: {str(e)}'
            }
    
    def send_image(self, phone_number: str, image_path: str, caption: str = '') -> Dict[str, Any]:
        """
        Send an image via WhatsApp
        
        Args:
            phone_number: Phone number
            image_path: Path to image file
            caption: Optional caption for the image
            
        Returns:
            Response with success status
        """
        try:
            if not self._check_service_health():
                return {
                    'status': 'error',
                    'message': 'WhatsApp service is not ready'
                }
            
            if not os.path.exists(image_path):
                return {
                    'status': 'error',
                    'message': f'Image file not found: {image_path}'
                }
            
            phone_number = self._format_phone_number(phone_number)
            
            with open(image_path, 'rb') as f:
                files = {'image': f}
                data = {
                    'phoneNumber': phone_number,
                    'caption': caption
                }
                
                response = requests.post(
                    f"{self.api_url}/send/image",
                    files=files,
                    data=data,
                    timeout=60
                )
            
            if response.status_code == 200:
                result = response.json()
                return {
                    'status': 'success',
                    'message': f'Image sent to +{phone_number}',
                    'data': result
                }
            else:
                return {
                    'status': 'error',
                    'message': f'Failed to send image: {response.text}'
                }
                
        except Exception as e:
            return {
                'status': 'error',
                'message': f'Error sending image: {str(e)}'
            }
    
    def send_document(self, phone_number: str, file_path: str, caption: str = '') -> Dict[str, Any]:
        """
        Send a document via WhatsApp
        
        Args:
            phone_number: Phone number
            file_path: Path to document file
            caption: Optional caption
            
        Returns:
            Response with success status
        """
        try:
            if not self._check_service_health():
                return {
                    'status': 'error',
                    'message': 'WhatsApp service is not ready'
                }
            
            if not os.path.exists(file_path):
                return {
                    'status': 'error',
                    'message': f'File not found: {file_path}'
                }
            
            phone_number = self._format_phone_number(phone_number)
            
            with open(file_path, 'rb') as f:
                files = {'document': f}
                data = {
                    'phoneNumber': phone_number,
                    'caption': caption
                }
                
                response = requests.post(
                    f"{self.api_url}/send/document",
                    files=files,
                    data=data,
                    timeout=60
                )
            
            if response.status_code == 200:
                result = response.json()
                return {
                    'status': 'success',
                    'message': f'Document sent to +{phone_number}',
                    'data': result
                }
            else:
                return {
                    'status': 'error',
                    'message': f'Failed to send document: {response.text}'
                }
                
        except Exception as e:
            return {
                'status': 'error',
                'message': f'Error sending document: {str(e)}'
            }
    
    def broadcast_message(self, phone_numbers: List[str], message: str) -> Dict[str, Any]:
        """
        Broadcast message to multiple contacts
        
        Args:
            phone_numbers: List of phone numbers
            message: Message to broadcast
            
        Returns:
            Response with success status and results
        """
        try:
            if not self._check_service_health():
                return {
                    'status': 'error',
                    'message': 'WhatsApp service is not ready'
                }
            
            formatted_numbers = [self._format_phone_number(num) for num in phone_numbers]
            
            response = requests.post(
                f"{self.api_url}/send/broadcast",
                json={
                    'phoneNumbers': formatted_numbers,
                    'message': message
                },
                timeout=60
            )
            
            if response.status_code == 200:
                result = response.json()
                return {
                    'status': 'success',
                    'message': f'Broadcast sent to {len(phone_numbers)} contacts',
                    'data': result
                }
            else:
                return {
                    'status': 'error',
                    'message': f'Failed to broadcast: {response.text}'
                }
                
        except Exception as e:
            return {
                'status': 'error',
                'message': f'Error broadcasting message: {str(e)}'
            }
    
    def verify_number(self, phone_number: str) -> Dict[str, Any]:
        """Check if a number is registered on WhatsApp"""
        try:
            if not self._check_service_health():
                return {
                    'status': 'error',
                    'message': 'WhatsApp service is not ready'
                }
            
            phone_number = self._format_phone_number(phone_number)
            
            response = requests.post(
                f"{self.api_url}/verify/number",
                json={'phoneNumber': phone_number},
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                return {
                    'status': 'success',
                    'data': result
                }
            else:
                return {
                    'status': 'error',
                    'message': f'Failed to verify: {response.text}'
                }
                
        except Exception as e:
            return {
                'status': 'error',
                'message': f'Error verifying number: {str(e)}'
            }
    
    def process(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process WhatsApp request
        
        Supported operations:
        - send_message: Send text message
        - send_image: Send image with optional caption
        - send_document: Send document/file
        - broadcast: Send to multiple contacts
        - verify: Check if number is on WhatsApp
        """
        operation = request.get('operation', 'send_message')
        
        if operation == 'send_message':
            phone = request.get('phone_number')
            message = request.get('message')
            
            if not phone or not message:
                return {
                    'status': 'error',
                    'message': 'phone_number and message are required'
                }
            
            return self.send_message(phone, message)
        
        elif operation == 'send_image':
            phone = request.get('phone_number')
            image_path = request.get('image_path')
            caption = request.get('caption', '')
            
            if not phone or not image_path:
                return {
                    'status': 'error',
                    'message': 'phone_number and image_path are required'
                }
            
            return self.send_image(phone, image_path, caption)
        
        elif operation == 'send_document':
            phone = request.get('phone_number')
            file_path = request.get('file_path')
            caption = request.get('caption', '')
            
            if not phone or not file_path:
                return {
                    'status': 'error',
                    'message': 'phone_number and file_path are required'
                }
            
            return self.send_document(phone, file_path, caption)
        
        elif operation == 'broadcast':
            phones = request.get('phone_numbers', [])
            message = request.get('message')
            
            if not phones or not message:
                return {
                    'status': 'error',
                    'message': 'phone_numbers and message are required'
                }
            
            return self.broadcast_message(phones, message)
        
        elif operation == 'verify':
            phone = request.get('phone_number')
            
            if not phone:
                return {
                    'status': 'error',
                    'message': 'phone_number is required'
                }
            
            return self.verify_number(phone)
        
        else:
            return {
                'status': 'error',
                'message': f'Unknown operation: {operation}'
            }


# For testing
if __name__ == "__main__":
    agent = WhatsAppAgent()
    
    # Test health check
    print("Testing WhatsApp service connection...")
    if agent._check_service_health():
        print("✅ WhatsApp service is ready!")
    else:
        print("❌ WhatsApp service is not ready. Please start it first.")
        print(f"   Run: cd Whatsapp-Agent && npm start")

