
"""
History Routes for Business Law AI Tutor
Handles chat history retrieval and management with Firebase Firestore integration.
"""

import logging
from datetime import datetime
from flask import Blueprint, request, jsonify, session, current_app

# Import Firebase functions
from firebase_config import (
    get_chat_history, get_bookmarks, get_uploads, delete_all_chat_messages,
    delete_all_bookmarks, delete_upload, get_demo_user_id, format_firestore_timestamp,
    delete_chat_messages
)

# Configure logging
logger = logging.getLogger(__name__)

# Create blueprint
history_bp = Blueprint('history', __name__)

# Import chat history from chat_routes (in-memory storage as fallback)
from routes.chat_routes import chat_history

def get_user_id():
    """Get the current user ID from the request parameters."""
    user_uid = request.args.get('user_uid')
    if user_uid:
        return user_uid
    else:
        # Fallback to demo user for backward compatibility
        return get_demo_user_id()

@history_bp.route('/history', methods=['GET'])
def get_chat_history_endpoint():
    """
    Retrieve the full conversation history from Firestore.
    
    Query parameters:
    - limit: Maximum number of entries to return (default: all)
    - chapter: Filter by specific chapter (optional)
    - start_date: Filter from specific date (ISO format, optional)
    - end_date: Filter until specific date (ISO format, optional)
    
    Returns:
    {
        "history": [
            {
                "user_message": "User's question",
                "ai_reply": "AI response",
                "chapter": "Chapter name",
                "timestamp": "ISO timestamp",
                "model_used": "Model name"
            }
        ],
        "total_entries": 123,
        "filtered_entries": 45
    }
    """
    try:
        # Get query parameters
        limit = request.args.get('limit', type=int)
        chapter_filter = request.args.get('chapter', '').strip()
        start_date = request.args.get('start_date', '').strip()
        end_date = request.args.get('end_date', '').strip()
        
        # Try to get history from Firestore first
        if current_app.config.get('FIREBASE_DB'):
            user_id = get_user_id()
            firestore_history = get_chat_history(user_id, limit)
            
            # Convert Firestore format to app format
            filtered_history = []
            for msg in firestore_history:
                # Handle both user and AI messages
                if msg.get('sender') == 'user':
                    filtered_history.append({
                        'user_message': msg.get('message', ''),
                        'ai_reply': '',  # Will be filled by next AI message
                        'chapter': msg.get('chapter', ''),
                        'timestamp': format_firestore_timestamp(msg.get('timestamp', '')),
                        'model_used': msg.get('model_used', ''),
                        'message_id': msg.get('id', '')
                    })
                elif msg.get('sender') == 'tutor':
                    # Find the corresponding user message and update it
                    if filtered_history:
                        filtered_history[-1]['ai_reply'] = msg.get('message', '')
                        filtered_history[-1]['timestamp'] = format_firestore_timestamp(msg.get('timestamp', ''))
        else:
            # Fallback to in-memory storage
            filtered_history = chat_history.copy()
        
        # Apply chapter filter
        if chapter_filter:
            filtered_history = [
                entry for entry in filtered_history 
                if entry.get('chapter', '').lower() == chapter_filter.lower()
            ]
        
        # Apply date filters
        if start_date:
            try:
                start_datetime = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                filtered_history = [
                    entry for entry in filtered_history
                    if datetime.fromisoformat(entry['timestamp'].replace('Z', '+00:00')) >= start_datetime
                ]
            except ValueError:
                return jsonify({'error': 'Invalid start_date format. Use ISO format (YYYY-MM-DDTHH:MM:SS)'}), 400
        
        if end_date:
            try:
                end_datetime = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                filtered_history = [
                    entry for entry in filtered_history
                    if datetime.fromisoformat(entry['timestamp'].replace('Z', '+00:00')) <= end_datetime
                ]
            except ValueError:
                return jsonify({'error': 'Invalid end_date format. Use ISO format (YYYY-MM-DDTHH:MM:SS)'}), 400
        
        # Apply limit
        if limit and limit > 0:
            filtered_history = filtered_history[-limit:]
        
        # Log history retrieval
        logger.info(f"Retrieved chat history: {len(filtered_history)} entries")
        
        return jsonify({
            'history': filtered_history,
            'total_entries': len(filtered_history),
            'filtered_entries': len(filtered_history),
            'filters_applied': {
                'chapter': chapter_filter if chapter_filter else None,
                'start_date': start_date if start_date else None,
                'end_date': end_date if end_date else None,
                'limit': limit if limit else None
            },
            'source': 'firestore' if current_app.config.get('FIREBASE_DB') else 'memory'
        })
        
    except Exception as e:
        logger.error(f"Error retrieving chat history: {str(e)}")
        return jsonify({'error': 'Failed to retrieve chat history'}), 500

@history_bp.route('/history/export', methods=['GET'])
def export_history():
    """
    Export chat history in various formats.
    
    Query parameters:
    - format: Export format ('json', 'csv', 'txt') - default: 'json'
    - chapter: Filter by specific chapter (optional)
    - start_date: Filter from specific date (ISO format, optional)
    - end_date: Filter until specific date (ISO format, optional)
    """
    try:
        export_format = request.args.get('format', 'json').lower()
        chapter_filter = request.args.get('chapter', '').strip()
        start_date = request.args.get('start_date', '').strip()
        end_date = request.args.get('end_date', '').strip()
        
        # Get filtered history
        if current_app.config.get('FIREBASE_DB'):
            user_id = get_user_id()
            firestore_history = get_chat_history(user_id)
            
            # Convert Firestore format to app format
            history_data = []
            for msg in firestore_history:
                if msg.get('sender') == 'user':
                    history_data.append({
                        'user_message': msg.get('message', ''),
                        'ai_reply': '',
                        'chapter': msg.get('chapter', ''),
                        'timestamp': format_firestore_timestamp(msg.get('timestamp', '')),
                        'model_used': msg.get('model_used', '')
                    })
                elif msg.get('sender') == 'tutor':
                    if history_data:
                        history_data[-1]['ai_reply'] = msg.get('message', '')
                        history_data[-1]['timestamp'] = format_firestore_timestamp(msg.get('timestamp', ''))
        else:
            history_data = chat_history.copy()
        
        # Apply filters
        if chapter_filter:
            history_data = [
                entry for entry in history_data 
                if entry.get('chapter', '').lower() == chapter_filter.lower()
            ]
        
        if start_date:
            try:
                start_datetime = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                history_data = [
                    entry for entry in history_data
                    if datetime.fromisoformat(entry['timestamp'].replace('Z', '+00:00')) >= start_datetime
                ]
            except ValueError:
                return jsonify({'error': 'Invalid start_date format'}), 400
        
        if end_date:
            try:
                end_datetime = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                history_data = [
                    entry for entry in history_data
                    if datetime.fromisoformat(entry['timestamp'].replace('Z', '+00:00')) <= end_datetime
                ]
            except ValueError:
                return jsonify({'error': 'Invalid end_date format'}), 400
        
        # Format export data
        if export_format == 'json':
            return jsonify({
                'export_format': 'json',
                'export_date': datetime.now().isoformat(),
                'total_entries': len(history_data),
                'filters_applied': {
                    'chapter': chapter_filter if chapter_filter else None,
                    'start_date': start_date if start_date else None,
                    'end_date': end_date if end_date else None
                },
                'history': history_data
            })
        
        elif export_format == 'csv':
            import csv
            from io import StringIO
            
            output = StringIO()
            writer = csv.writer(output)
            
            # Write header
            writer.writerow(['Timestamp', 'Chapter', 'User Message', 'AI Reply', 'Model Used'])
            
            # Write data
            for entry in history_data:
                writer.writerow([
                    entry.get('timestamp', ''),
                    entry.get('chapter', ''),
                    entry.get('user_message', ''),
                    entry.get('ai_reply', ''),
                    entry.get('model_used', '')
                ])
            
            from flask import Response
            return Response(
                output.getvalue(),
                mimetype='text/csv',
                headers={'Content-Disposition': f'attachment; filename=chat_history_{datetime.now().strftime("%Y%m%d")}.csv'}
            )
        
        elif export_format == 'txt':
            output = []
            output.append(f"Business Law AI Tutor - Chat History Export")
            output.append(f"Export Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            output.append(f"Total Entries: {len(history_data)}")
            output.append("=" * 80)
            output.append("")
            
            for i, entry in enumerate(history_data, 1):
                output.append(f"Entry {i}:")
                output.append(f"Timestamp: {entry.get('timestamp', '')}")
                output.append(f"Chapter: {entry.get('chapter', '')}")
                output.append(f"User: {entry.get('user_message', '')}")
                output.append(f"AI Tutor: {entry.get('ai_reply', '')}")
                output.append(f"Model: {entry.get('model_used', '')}")
                output.append("-" * 40)
                output.append("")
            
            from flask import Response
            return Response(
                '\n'.join(output),
                mimetype='text/plain',
                headers={'Content-Disposition': f'attachment; filename=chat_history_{datetime.now().strftime("%Y%m%d")}.txt'}
            )
        
        else:
            return jsonify({'error': 'Unsupported export format. Use: json, csv, or txt'}), 400
        
    except Exception as e:
        logger.error(f"Error exporting history: {str(e)}")
        return jsonify({'error': 'Failed to export chat history'}), 500

@history_bp.route('/history/clear', methods=['POST'])
def clear_history():
    """
    Clear all chat history and bookmarks for the current user from both memory and Firestore.
    """
    try:
        # Clear in-memory history
        global chat_history
        chat_history.clear()
        
        # Clear Firestore history and bookmarks
        firestore_cleared = False
        bookmarks_cleared = False
        if current_app.config.get('FIREBASE_DB'):
            user_id = get_user_id()
            
            # Delete chat messages
            firestore_cleared = delete_all_chat_messages(user_id)
            if firestore_cleared:
                logger.info(f"Chat history cleared from Firestore for user {user_id}")
            else:
                logger.warning(f"Failed to clear chat history from Firestore for user {user_id}")
            
            # Delete bookmarks (since they reference deleted messages)
            bookmarks_cleared = delete_all_bookmarks(user_id)
            if bookmarks_cleared:
                logger.info(f"Bookmarks cleared from Firestore for user {user_id}")
            else:
                logger.warning(f"Failed to clear bookmarks from Firestore for user {user_id}")
        
        logger.info("Chat history cleared from memory")
        
        return jsonify({
            'success': True,
            'message': 'Chat history and bookmarks cleared successfully',
            'firestore_cleared': firestore_cleared,
            'bookmarks_cleared': bookmarks_cleared,
            'note': 'Chat history and bookmarks have been permanently deleted from both memory and database.'
        })
        
    except Exception as e:
        logger.error(f"Error clearing history: {str(e)}")
        return jsonify({'error': 'Failed to clear chat history'}), 500

@history_bp.route('/history/clear-chat/<chat_id>', methods=['POST'])
def clear_chat_messages(chat_id):
    """
    Clear all messages and bookmarks from a specific chat.
    
    Args:
        chat_id: Chat ID to clear
    
    Returns:
    {
        "success": true,
        "message": "Chat messages and bookmarks cleared successfully",
        "chat_id": "chat_id"
    }
    """
    try:
        if current_app.config.get('FIREBASE_DB'):
            user_id = get_user_id()
            
            # Delete messages from the specific chat
            messages_cleared = delete_chat_messages(user_id, chat_id)
            
            # Delete bookmarks from the specific chat (cascade deletion)
            from firebase_config import delete_chat_bookmarks
            bookmarks_cleared = delete_chat_bookmarks(user_id, chat_id)
            
            if messages_cleared:
                logger.info(f"Chat messages cleared from Firestore for chat {chat_id}")
            else:
                logger.warning(f"Failed to clear chat messages from Firestore for chat {chat_id}")
                
            if bookmarks_cleared:
                logger.info(f"Chat bookmarks cleared from Firestore for chat {chat_id}")
            else:
                logger.warning(f"Failed to clear chat bookmarks from Firestore for chat {chat_id}")
        else:
            messages_cleared = True
            bookmarks_cleared = True
            logger.info("Chat messages and bookmarks cleared from memory")
        
        return jsonify({
            'success': True,
            'message': 'Chat messages and bookmarks cleared successfully',
            'chat_id': chat_id,
            'messages_cleared': messages_cleared,
            'bookmarks_cleared': bookmarks_cleared,
            'note': 'Chat messages and bookmarks have been permanently deleted.'
        })
        
    except Exception as e:
        logger.error(f"Error clearing chat messages and bookmarks: {str(e)}")
        return jsonify({'error': 'Failed to clear chat messages and bookmarks'}), 500

@history_bp.route('/bookmarks', methods=['GET'])
def get_user_bookmarks():
    """
    Retrieve all bookmarks for the current user.
    
    Returns:
    {
        "bookmarks": [
            {
                "id": "bookmark_id",
                "linkedMessageId": "message_id",
                "snippet": "Bookmark snippet",
                "timestamp": "ISO timestamp",
                "type": "user|tutor"
            }
        ]
    }
    """
    try:
        if current_app.config.get('FIREBASE_DB'):
            user_id = get_user_id()
            bookmarks = get_bookmarks(user_id)
            
            # Format bookmarks for frontend
            formatted_bookmarks = []
            for bookmark in bookmarks:
                formatted_bookmarks.append({
                    'id': bookmark.get('id', ''),
                    'linkedMessageId': bookmark.get('linkedMessageId', ''),
                    'snippet': bookmark.get('snippet', ''),
                    'timestamp': format_firestore_timestamp(bookmark.get('timestamp', '')),
                    'type': bookmark.get('type', 'user')
                })
            
            logger.info(f"Retrieved {len(formatted_bookmarks)} bookmarks for user {user_id}")
            
            return jsonify({
                'bookmarks': formatted_bookmarks,
                'total': len(formatted_bookmarks)
            })
        else:
            return jsonify({
                'bookmarks': [],
                'total': 0,
                'note': 'Firebase not available - using in-memory storage'
            })
        
    except Exception as e:
        logger.error(f"Error retrieving bookmarks: {str(e)}")
        return jsonify({'error': 'Failed to retrieve bookmarks'}), 500


# Structured Chat History Entries
@history_bp.route('/history/entries', methods=['GET'])
def get_structured_history_entries():
    """
    Retrieve structured chat history entries.
    
    Returns:
    {
        "entries": [
            {
                "id": "unique-entry-id",
                "time": "2025-08-19T12:10:03.502000",
                "chapter": "Business Organizations",
                "user": "What are the essential elements of a valid contract?",
                "aiTutor": "A valid contract needs offer, acceptance, consideration..."
            }
        ]
    }
    """
    try:
        if current_app.config.get('FIREBASE_DB'):
            user_id = get_user_id()
            
            # Get structured entries from Firestore
            from firebase_config import get_structured_history_entries
            entries = get_structured_history_entries(user_id)
            
            logger.info(f"Retrieved {len(entries)} structured history entries for user {user_id}")
            
            return jsonify({
                'entries': entries,
                'total': len(entries),
                'source': 'firestore'
            })
        else:
            # Fallback to in-memory storage
            return jsonify({
                'entries': [],
                'total': 0,
                'note': 'Firebase not available - using in-memory storage',
                'source': 'memory'
            })
        
    except Exception as e:
        logger.error(f"Error retrieving structured history entries: {str(e)}")
        return jsonify({'error': 'Failed to retrieve history entries'}), 500

@history_bp.route('/history/entries', methods=['POST'])
def save_structured_history_entry():
    """
    Save a structured chat history entry.
    
    Expected JSON payload:
    {
        "id": "unique-entry-id",
        "time": "2025-08-19T12:10:03.502000",
        "chapter": "Business Organizations",
        "user": "What are the essential elements of a valid contract?",
        "aiTutor": "A valid contract needs offer, acceptance, consideration..."
    }
    
    Returns:
    {
        "success": true,
        "entry_id": "unique-entry-id",
        "message": "Entry saved successfully"
    }
    """
    try:
        if not request.is_json:
            return jsonify({'error': 'Content-Type must be application/json'}), 400
        
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Validate required fields
        required_fields = ['id', 'time', 'chapter', 'user', 'aiTutor']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400
        
        if current_app.config.get('FIREBASE_DB'):
            user_id = get_user_id()
            
            # Save structured entry to Firestore
            from firebase_config import save_structured_history_entry
            success = save_structured_history_entry(user_id, data)
            
            if success:
                logger.info(f"Saved structured history entry {data['id']} for user {user_id}")
                return jsonify({
                    'success': True,
                    'entry_id': data['id'],
                    'message': 'Entry saved successfully'
                })
            else:
                logger.error(f"Failed to save structured history entry {data['id']} for user {user_id}")
                return jsonify({'error': 'Failed to save entry'}), 500
        else:
            # Fallback to in-memory storage
            return jsonify({
                'success': False,
                'message': 'Firebase not available - entry not saved',
                'note': 'Entries are only saved when Firebase is connected'
            })
        
    except Exception as e:
        logger.error(f"Error saving structured history entry: {str(e)}")
        return jsonify({'error': 'Failed to save entry'}), 500

@history_bp.route('/history/entries/clear', methods=['POST'])
def clear_structured_history_entries():
    """
    Clear all structured chat history entries for the current user.
    
    Returns:
    {
        "success": true,
        "message": "All history entries cleared successfully"
    }
    """
    try:
        if current_app.config.get('FIREBASE_DB'):
            user_id = get_user_id()
            
            # Clear structured entries from Firestore
            from firebase_config import clear_structured_history_entries
            success = clear_structured_history_entries(user_id)
            
            if success:
                logger.info(f"Cleared all structured history entries for user {user_id}")
                return jsonify({
                    'success': True,
                    'message': 'All history entries cleared successfully'
                })
            else:
                logger.error(f"Failed to clear structured history entries for user {user_id}")
                return jsonify({
                    'success': False,
                    'message': 'Failed to clear history entries'
                }), 500
        else:
            return jsonify({
                'success': False,
                'message': 'Firebase not available - entries cannot be cleared',
                'note': 'Entries are only managed when Firebase is connected'
            }), 500
        
    except Exception as e:
        logger.error(f"Error clearing structured history entries: {str(e)}")
        return jsonify({'error': 'Failed to clear history entries'}), 500
