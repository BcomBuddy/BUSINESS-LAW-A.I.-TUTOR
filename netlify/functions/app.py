import json
import os
import sys
from flask import Flask, request, jsonify, render_template, send_from_directory
from werkzeug.utils import secure_filename
import logging

# Add the parent directory to the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# Import your existing modules
from firebase_config import initialize_firebase
from routes.chat_routes import chat, edit_regenerate
from routes.chat_management_routes import get_chat_endpoint, create_new_chat, delete_chat, rename_chat, share_chat
from routes.upload_routes import upload_file, serve_file_by_id, delete_file
from routes.bookmark_routes import get_bookmarks, create_bookmark, delete_bookmark
from routes.history_routes import get_chat_history, save_chat_history_entry, clear_all_chat_history, export_history
from routes.voice_routes import text_to_speech

# Initialize Flask app
app = Flask(__name__)

# Configure app
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-change-in-production')
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Create uploads directory if it doesn't exist
UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'uploads')
if not os.path.exists(UPLOADS_DIR):
    os.makedirs(UPLOADS_DIR)

# Initialize Firebase
db = initialize_firebase()

# Register routes
app.add_url_rule('/', 'index', lambda: render_template('index.html'))
app.add_url_rule('/login', 'login', lambda: render_template('login.html'))
app.add_url_rule('/api/auth/check', 'check_auth', lambda: jsonify({'authenticated': True}), methods=['GET'])

# Chat routes
app.add_url_rule('/api/chat', 'chat', chat, methods=['POST'])
app.add_url_rule('/api/chat/edit-regenerate', 'edit_regenerate', edit_regenerate, methods=['POST'])

# Chat management routes
app.add_url_rule('/api/chats', 'get_chats', get_chat_endpoint, methods=['GET'])
app.add_url_rule('/api/chats', 'create_chat', create_new_chat, methods=['POST'])
app.add_url_rule('/api/chats/<chat_id>', 'delete_chat', delete_chat, methods=['DELETE'])
app.add_url_rule('/api/chats/<chat_id>/rename', 'rename_chat', rename_chat, methods=['PUT'])
app.add_url_rule('/api/chats/<chat_id>/share', 'share_chat', share_chat, methods=['POST'])

# Upload routes
app.add_url_rule('/api/upload', 'upload_file', upload_file, methods=['POST'])
app.add_url_rule('/api/files/<upload_id>', 'serve_file_by_id', serve_file_by_id, methods=['GET'])
app.add_url_rule('/api/files/<upload_id>', 'delete_file', delete_file, methods=['DELETE'])

# Bookmark routes
app.add_url_rule('/api/bookmarks', 'get_bookmarks', get_bookmarks, methods=['GET'])
app.add_url_rule('/api/bookmarks', 'create_bookmark', create_bookmark, methods=['POST'])
app.add_url_rule('/api/bookmarks/<bookmark_id>', 'delete_bookmark', delete_bookmark, methods=['DELETE'])

# History routes
app.add_url_rule('/api/history', 'get_chat_history', get_chat_history, methods=['GET'])
app.add_url_rule('/api/history', 'save_chat_history_entry', save_chat_history_entry, methods=['POST'])
app.add_url_rule('/api/history/clear', 'clear_all_chat_history', clear_all_chat_history, methods=['DELETE'])
app.add_url_rule('/api/history/export', 'export_history', export_history, methods=['GET'])

# Voice routes
app.add_url_rule('/api/voice/tts', 'text_to_speech', text_to_speech, methods=['POST'])

# Serve static files
@app.route('/static/<path:filename>')
def static_files(filename):
    return send_from_directory('static', filename)

# Netlify Functions handler
def handler(event, context):
    """Netlify Functions entry point"""
    try:
        # Set up the request context
        with app.test_request_context(
            path=event.get('path', '/'),
            method=event.get('httpMethod', 'GET'),
            headers=event.get('headers', {}),
            data=event.get('body', ''),
            query_string=event.get('queryStringParameters', {})
        ):
            # Process the request
            response = app.full_dispatch_request()
            
            return {
                'statusCode': response.status_code,
                'headers': dict(response.headers),
                'body': response.get_data(as_text=True)
            }
    except Exception as e:
        logging.error(f"Error in handler: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': str(e)})
        }

if __name__ == '__main__':
    app.run(debug=True)
