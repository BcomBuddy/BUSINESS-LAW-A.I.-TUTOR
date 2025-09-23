"""
Chat Management Routes for Business Law AI Tutor
Handles chat creation, management, and sharing with Firebase Firestore integration.
"""

import logging
from flask import Blueprint, request, jsonify, current_app

# Import Firebase functions
from firebase_config import (
    create_chat, get_user_chats, get_chat, update_chat_name, delete_chat,
    get_chat_history_by_chat, update_chat_timestamp, get_demo_user_id,
    format_firestore_timestamp
)

# Configure logging
logger = logging.getLogger(__name__)

# Create blueprint
chat_management_bp = Blueprint('chat_management', __name__)

def get_user_id():
    """Get the current user ID from the request parameters."""
    user_uid = request.args.get('user_uid')
    if user_uid:
        return user_uid
    else:
        # Fallback to demo user for backward compatibility
        return get_demo_user_id()

@chat_management_bp.route('/chats', methods=['GET'])
def get_user_chats_endpoint():
    """
    Retrieve all chats for the current user.
    
    Returns:
    {
        "chats": [
            {
                "id": "chat_id",
                "chatName": "Chat Name",
                "createdAt": "ISO timestamp",
                "lastUpdated": "ISO timestamp"
            }
        ]
    }
    """
    try:
        if current_app.config.get('FIREBASE_DB'):
            user_id = get_user_id()
            chats = get_user_chats(user_id)
            
            # Format chats for frontend
            formatted_chats = []
            for chat in chats:
                formatted_chats.append({
                    'id': chat.get('id', ''),
                    'chatName': chat.get('chatName', ''),
                    'createdAt': format_firestore_timestamp(chat.get('createdAt', '')),
                    'lastUpdated': format_firestore_timestamp(chat.get('lastUpdated', ''))
                })
            
            logger.info(f"Retrieved {len(formatted_chats)} chats for user {user_id}")
            
            return jsonify({
                'chats': formatted_chats,
                'total': len(formatted_chats)
            })
        else:
            return jsonify({
                'chats': [],
                'total': 0,
                'note': 'Firebase not available'
            })
        
    except Exception as e:
        logger.error(f"Error retrieving chats: {str(e)}")
        return jsonify({'error': 'Failed to retrieve chats'}), 500

@chat_management_bp.route('/chats', methods=['POST'])
def create_new_chat():
    """
    Create a new chat for the current user.
    
    Request body:
    {
        "chatName": "New Chat Name" (optional, defaults to "New Chat")
    }
    
    Returns:
    {
        "success": true,
        "chat_id": "new_chat_id",
        "message": "Chat created successfully"
    }
    """
    try:
        if not current_app.config.get('FIREBASE_DB'):
            return jsonify({'error': 'Firebase not available'}), 500
        
        data = request.get_json()
        chat_name = data.get('chatName', 'New Chat') if data else 'New Chat'
        
        user_id = get_user_id()
        chat_id = create_chat(user_id, chat_name)
        
        if chat_id:
            logger.info(f"Created new chat for user {user_id}: {chat_id}")
            return jsonify({
                'success': True,
                'chat_id': chat_id,
                'message': 'Chat created successfully'
            })
        else:
            return jsonify({'error': 'Failed to create chat'}), 500
        
    except Exception as e:
        logger.error(f"Error creating chat: {str(e)}")
        return jsonify({'error': 'Failed to create chat'}), 500

@chat_management_bp.route('/chats/<chat_id>', methods=['GET'])
def get_chat_endpoint(chat_id):
    """
    Retrieve a specific chat and its history.
    
    Args:
        chat_id: Chat ID
    
    Returns:
    {
        "success": true,
        "chat": {
            "id": "chat_id",
            "chatName": "Chat Name",
            "createdAt": "ISO timestamp",
            "lastUpdated": "ISO timestamp"
        },
        "messages": [
            {
                "id": "message_id",
                "message": "Message content",
                "sender": "user|tutor",
                "timestamp": "ISO timestamp"
            }
        ]
    }
    """
    try:
        if not current_app.config.get('FIREBASE_DB'):
            return jsonify({'error': 'Firebase not available'}), 500
        
        user_id = get_user_id()
        chat = get_chat(user_id, chat_id)
        
        if not chat:
            return jsonify({'error': 'Chat not found'}), 404
        
        # Get chat messages
        messages = get_chat_history_by_chat(user_id, chat_id)
        
        # Format chat and messages
        formatted_chat = {
            'id': chat.get('id', ''),
            'chatName': chat.get('chatName', ''),
            'createdAt': format_firestore_timestamp(chat.get('createdAt', '')),
            'lastUpdated': format_firestore_timestamp(chat.get('lastUpdated', ''))
        }
        
        formatted_messages = []
        for message in messages:
            formatted_message = {
                'id': message.get('id', ''),
                'message': message.get('message', ''),
                'sender': message.get('sender', ''),
                'timestamp': format_firestore_timestamp(message.get('timestamp', ''))
            }
            
            # Include file attachment data if present
            if message.get('fileAttachments'):
                formatted_message['fileAttachments'] = message.get('fileAttachments')
            
            # Include structured file content if present
            if message.get('structuredFileContent'):
                formatted_message['structuredFileContent'] = message.get('structuredFileContent')
            
            # Include file type if present
            if message.get('type'):
                formatted_message['type'] = message.get('type')
                
            formatted_messages.append(formatted_message)
        
        logger.info(f"Retrieved chat {chat_id} with {len(formatted_messages)} messages")
        
        return jsonify({
            'success': True,
            'chat': formatted_chat,
            'messages': formatted_messages
        })
        
    except Exception as e:
        logger.error(f"Error retrieving chat: {str(e)}")
        return jsonify({'error': 'Failed to retrieve chat'}), 500

@chat_management_bp.route('/chats/<chat_id>/rename', methods=['PUT'])
def rename_chat_endpoint(chat_id):
    """
    Rename a chat.
    
    Request body:
    {
        "newName": "New Chat Name"
    }
    
    Returns:
    {
        "success": true,
        "message": "Chat renamed successfully"
    }
    """
    try:
        if not current_app.config.get('FIREBASE_DB'):
            return jsonify({'error': 'Firebase not available'}), 500
        
        data = request.get_json()
        new_name = data.get('newName', '') if data else ''
        
        if not new_name.strip():
            return jsonify({'error': 'New name is required'}), 400
        
        user_id = get_user_id()
        success = update_chat_name(user_id, chat_id, new_name.strip())
        
        if success:
            logger.info(f"Renamed chat {chat_id} to '{new_name}'")
            return jsonify({
                'success': True,
                'message': 'Chat renamed successfully'
            })
        else:
            return jsonify({'error': 'Failed to rename chat'}), 500
        
    except Exception as e:
        logger.error(f"Error renaming chat: {str(e)}")
        return jsonify({'error': 'Failed to rename chat'}), 500

@chat_management_bp.route('/chats/<chat_id>', methods=['DELETE'])
def delete_chat_endpoint(chat_id):
    """
    Delete a chat and all its messages.
    
    Args:
        chat_id: Chat ID
    
    Returns:
    {
        "success": true,
        "message": "Chat deleted successfully"
    }
    """
    try:
        if not current_app.config.get('FIREBASE_DB'):
            return jsonify({'error': 'Firebase not available'}), 500
        
        user_id = get_user_id()
        logger.info(f"Attempting to delete chat {chat_id} for user {user_id}")
        
        success = delete_chat(user_id, chat_id)
        
        if success:
            logger.info(f"Successfully deleted chat {chat_id} for user {user_id}")
            return jsonify({
                'success': True,
                'message': 'Chat deleted successfully'
            })
        else:
            logger.error(f"Failed to delete chat {chat_id} for user {user_id}")
            return jsonify({'error': 'Failed to delete chat'}), 500
        
    except Exception as e:
        logger.error(f"Error deleting chat {chat_id}: {str(e)}")
        return jsonify({'error': 'Failed to delete chat'}), 500

@chat_management_bp.route('/chats/<chat_id>/share', methods=['POST'])
def share_chat_endpoint(chat_id):
    """
    Generate a shareable link for a chat.
    
    Args:
        chat_id: Chat ID
    
    Returns:
    {
        "success": true,
        "shareLink": "https://yourapp.com/chat/share/chat_id",
        "message": "Share link generated successfully"
    }
    """
    try:
        if not current_app.config.get('FIREBASE_DB'):
            return jsonify({'error': 'Firebase not available'}), 500
        
        user_id = get_user_id()
        chat = get_chat(user_id, chat_id)
        
        if not chat:
            return jsonify({'error': 'Chat not found'}), 404
        
        # Generate share link (this would be implemented based on your domain)
        base_url = request.host_url.rstrip('/')
        share_link = f"{base_url}/chat/share/{chat_id}"
        
        logger.info(f"Generated share link for chat {chat_id}: {share_link}")
        
        return jsonify({
            'success': True,
            'shareLink': share_link,
            'message': 'Share link generated successfully'
        })
        
    except Exception as e:
        logger.error(f"Error generating share link: {str(e)}")
        return jsonify({'error': 'Failed to generate share link'}), 500
