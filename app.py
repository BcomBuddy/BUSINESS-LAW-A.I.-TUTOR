"""
Business Law AI Tutor - Main Flask Application
A comprehensive web application for Business Law tutoring with AI assistance.
"""

import os
from flask import Flask, render_template, request, jsonify, session
from flask_cors import CORS
from datetime import datetime
import logging
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Import route modules
from routes.chat_routes import chat_bp
from routes.upload_routes import upload_bp
from routes.voice_routes import voice_bp
from routes.history_routes import history_bp
from routes.bookmark_routes import bookmark_bp
from routes.chat_management_routes import chat_management_bp

# Import Firebase configuration
from firebase_config import initialize_firebase

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_app():
    """Application factory pattern for Flask app creation."""
    app = Flask(__name__)
    
    # Configuration
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
    
    # Enable CORS for frontend integration
    CORS(app, resources={r"/*": {"origins": "*"}})
    
    # Initialize Firebase Firestore
    firebase_db = initialize_firebase()
    if firebase_db:
        logger.info("Firebase Firestore initialized successfully")
        # Store Firebase client in app config for access in routes
        app.config['FIREBASE_DB'] = firebase_db
    else:
        logger.warning("Firebase Firestore initialization failed - app will run without database persistence")
        app.config['FIREBASE_DB'] = None
    
    # Register blueprints
    app.register_blueprint(chat_bp, url_prefix='/api')
    app.register_blueprint(upload_bp, url_prefix='/api')
    app.register_blueprint(voice_bp, url_prefix='/api')
    app.register_blueprint(history_bp, url_prefix='/api')
    app.register_blueprint(bookmark_bp, url_prefix='/api')
    app.register_blueprint(chat_management_bp, url_prefix='/api')
    
    # Login route
    @app.route('/login')
    def login():
        """Serve the login page."""
        return render_template('login.html')
    
    # Authentication check endpoint
    @app.route('/api/auth/check')
    def check_auth():
        """Check if user is authenticated."""
        # This will be handled by the frontend Firebase Auth
        # For now, we'll return a simple response
        return jsonify({'authenticated': True})
    
    # Main route - serves the HTML frontend (protected)
    @app.route('/')
    def index():
        """Serve the main HTML page for the Business Law AI Tutor."""
        return render_template('index.html')
    
    # Health check endpoint
    @app.route('/health')
    def health_check():
        """Health check endpoint for monitoring."""
        firebase_status = "connected" if app.config.get('FIREBASE_DB') else "disconnected"
        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.now().isoformat(),
            'service': 'Business Law AI Tutor',
            'firebase': firebase_status
        })
    
    # Error handlers
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({'error': 'Endpoint not found'}), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        logger.error(f"Internal server error: {error}")
        return jsonify({'error': 'Internal server error'}), 500
    
    @app.errorhandler(413)
    def file_too_large(error):
        return jsonify({'error': 'File too large. Maximum size is 16MB.'}), 413
    
    return app

if __name__ == '__main__':
    app = create_app()
    
    # Get configuration from environment variables
    debug_mode = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    host = os.environ.get('FLASK_HOST', '0.0.0.0')
    port = int(os.environ.get('FLASK_PORT', 5000))
    
    logger.info(f"Starting Business Law AI Tutor on {host}:{port}")
    logger.info(f"Debug mode: {debug_mode}")
    
    app.run(
        host=host,
        port=port,
        debug=debug_mode
    )
