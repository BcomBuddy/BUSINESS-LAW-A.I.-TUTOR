"""
Voice Routes for Business Law AI Tutor
Handles audio file uploads and transcription.
Note: Audio transcription is temporarily disabled when using Gemini API.
"""

import os
import logging
from datetime import datetime
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename

# Configure logging
logger = logging.getLogger(__name__)

# Create blueprint
voice_bp = Blueprint('voice', __name__)

# Allowed audio file extensions
ALLOWED_AUDIO_EXTENSIONS = {
    'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'
}

# Maximum audio file size (25MB for audio files)
MAX_AUDIO_SIZE = 25 * 1024 * 1024

def allowed_audio_file(filename):
    """Check if the uploaded audio file has an allowed extension."""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_AUDIO_EXTENSIONS

@voice_bp.route('/voice', methods=['POST'])
def transcribe_audio():
    """
    Handle audio file uploads and transcribe using Whisper API.
    
    Expected form data:
    - audio: The uploaded audio file
    
    Returns:
    {
        "success": true/false,
        "transcription": "Transcribed text",
        "filename": "Original filename",
        "timestamp": "ISO timestamp"
    }
    """
    try:
        # Check if audio file is present in request
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio']
        
        # Check if file was selected
        if audio_file.filename == '':
            return jsonify({'error': 'No audio file selected'}), 400
        
        # Validate file extension
        filename = secure_filename(audio_file.filename)
        if not allowed_audio_file(filename):
            return jsonify({
                'error': f'Unsupported audio format. Supported formats: {", ".join(ALLOWED_AUDIO_EXTENSIONS)}'
            }), 400
        
        # Check file size
        audio_file.seek(0, 2)  # Seek to end
        file_size = audio_file.tell()
        audio_file.seek(0)  # Reset to beginning
        
        if file_size > MAX_AUDIO_SIZE:
            return jsonify({
                'error': f'Audio file too large. Maximum size is {MAX_AUDIO_SIZE // (1024*1024)}MB'
            }), 413
        
        # Audio transcription is temporarily disabled with Gemini API
        logger.info(f"Audio transcription requested for file: {filename}")
        
        timestamp = datetime.now().isoformat()
        
        return jsonify({
            'success': False,
            'transcription': "Audio transcription is currently unavailable. Please type your question instead.",
            'filename': filename,
                'file_size': file_size,
                'timestamp': timestamp
            })
        
    except Exception as e:
        logger.error(f"Unexpected error in voice transcription: {e}")
        return jsonify({'error': f'Failed to process audio: {str(e)}'}), 500

@voice_bp.route('/voice/status', methods=['GET'])
def voice_status():
    """Check if voice transcription service is available."""
    try:
        # Voice transcription is temporarily disabled with Gemini API
        return jsonify({
            'available': False,
            'message': 'Audio transcription is currently unavailable with Gemini API',
            'supported_formats': list(ALLOWED_AUDIO_EXTENSIONS),
            'max_file_size_mb': MAX_AUDIO_SIZE // (1024 * 1024)
        })
    
    except Exception as e:
        logger.error(f"Error checking voice service status: {e}")
        return jsonify({
            'available': False,
            'message': 'Voice transcription service status unknown'
        })
