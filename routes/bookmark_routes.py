"""
Bookmark Routes for Business Law AI Tutor
Handles bookmark creation, retrieval, and management with Firebase Firestore integration.
"""

import logging
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app

# Import Firebase functions
from firebase_config import (
    save_bookmark, get_bookmarks, delete_bookmark, update_message_bookmark,
    get_demo_user_id, format_firestore_timestamp, get_chat_bookmarks
)

# Configure logging
logger = logging.getLogger(__name__)

# Create blueprint
bookmark_bp = Blueprint('bookmarks', __name__)

def get_user_id():
    """Get the current user ID from the request parameters."""
    user_uid = request.args.get('user_uid')
    if user_uid:
        return user_uid
    else:
        # Fallback to demo user for backward compatibility
        return get_demo_user_id()

@bookmark_bp.route('/bookmarks', methods=['GET'])
def get_user_bookmarks_endpoint():
    """
    Retrieve all bookmarks for the current user.
    
    Query parameters:
    - limit: Maximum number of bookmarks to return (optional)
    - type: Filter by bookmark type ('user', 'tutor', or 'all') - default: 'all'
    - chatId: Filter by specific chat ID (optional)
    
    Returns:
    {
        "bookmarks": [
            {
                "id": "bookmark_id",
                "linkedMessageId": "message_id",
                "snippet": "Bookmark snippet",
                "timestamp": "ISO timestamp",
                "type": "user|tutor",
                "chatId": "chat_id"
            }
        ],
        "total": 123
    }
    """
    try:
        # Get query parameters
        limit = request.args.get('limit', type=int)
        bookmark_type = request.args.get('type', 'all').lower()
        chat_id = request.args.get('chatId', '').strip()
        
        if current_app.config.get('FIREBASE_DB'):
            user_id = get_user_id()
            
            # Get bookmarks based on filter
            if chat_id:
                # Get bookmarks for specific chat
                all_bookmarks = get_chat_bookmarks(user_id, chat_id)
            else:
                # Get all bookmarks from all chats
                all_bookmarks = get_bookmarks(user_id)
            
            # Filter by type if specified
            if bookmark_type != 'all':
                all_bookmarks = [
                    bookmark for bookmark in all_bookmarks 
                    if bookmark.get('type', 'user') == bookmark_type
                ]
            
            # Apply limit
            if limit and limit > 0:
                all_bookmarks = all_bookmarks[:limit]
            
            # Format bookmarks for frontend
            formatted_bookmarks = []
            for bookmark in all_bookmarks:
                formatted_bookmarks.append({
                    'id': bookmark.get('id', ''),
                    'linkedMessageId': bookmark.get('linkedMessageId', ''),
                    'snippet': bookmark.get('snippet', ''),
                    'timestamp': format_firestore_timestamp(bookmark.get('timestamp', '')),
                    'type': bookmark.get('type', 'user'),
                    'chatId': bookmark.get('chatId', '') # Include chat ID
                })
            
            logger.info(f"Retrieved {len(formatted_bookmarks)} bookmarks for user {user_id}")
            
            return jsonify({
                'bookmarks': formatted_bookmarks,
                'total': len(formatted_bookmarks),
                'source': 'firestore'
            })
        else:
            return jsonify({
                'bookmarks': [],
                'total': 0,
                'note': 'Firebase not available - using in-memory storage',
                'source': 'memory'
            })
        
    except Exception as e:
        logger.error(f"Error retrieving bookmarks: {str(e)}")
        return jsonify({'error': 'Failed to retrieve bookmarks'}), 500

@bookmark_bp.route('/bookmarks', methods=['POST'])
def create_bookmark():
    """
    Create a new bookmark.
    
    Expected JSON payload:
    {
        "linkedMessageId": "message_id",
        "snippet": "Bookmark snippet text",
        "type": "user|tutor",
        "chatId": "chat_id"
    }
    
    Returns:
    {
        "success": true,
        "bookmark_id": "new_bookmark_id",
        "message": "Bookmark created successfully"
    }
    """
    try:
        # Validate request
        if not request.is_json:
            return jsonify({'error': 'Content-Type must be application/json'}), 400
        
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        linked_message_id = data.get('linkedMessageId', '').strip()
        snippet = data.get('snippet', '').strip()
        bookmark_type = data.get('type', 'user').lower()
        chat_id = data.get('chatId', '').strip()
        
        if not linked_message_id:
            return jsonify({'error': 'linkedMessageId is required'}), 400
        
        if not snippet:
            return jsonify({'error': 'snippet is required'}), 400
        
        if not chat_id:
            return jsonify({'error': 'chatId is required'}), 400
        
        if bookmark_type not in ['user', 'tutor']:
            return jsonify({'error': 'type must be either "user" or "tutor"'}), 400
        
        if current_app.config.get('FIREBASE_DB'):
            user_id = get_user_id()
            
            # Create bookmark data
            bookmark_data = {
                'linkedMessageId': linked_message_id,
                'snippet': snippet,
                'type': bookmark_type,
                'chatId': chat_id
            }
            
            # Save bookmark to Firestore
            bookmark_id = save_bookmark(user_id, bookmark_data)
            
            if bookmark_id:
                # Update the corresponding message's bookmark status
                update_message_bookmark(user_id, linked_message_id, True)
                
                logger.info(f"Created bookmark {bookmark_id} for user {user_id}")
                
                return jsonify({
                    'success': True,
                    'bookmark_id': bookmark_id,
                    'message': 'Bookmark created successfully'
                })
            else:
                return jsonify({'error': 'Failed to create bookmark'}), 500
        else:
            return jsonify({
                'success': False,
                'message': 'Firebase not available - bookmark not saved',
                'note': 'Bookmarks are only saved when Firebase is connected'
            })
        
    except Exception as e:
        logger.error(f"Error creating bookmark: {str(e)}")
        return jsonify({'error': 'Failed to create bookmark'}), 500

@bookmark_bp.route('/bookmarks/<bookmark_id>', methods=['DELETE'])
def delete_bookmark_endpoint(bookmark_id):
    """
    Delete a bookmark by ID.
    
    Args:
        bookmark_id: The ID of the bookmark to delete
    
    Returns:
    {
        "success": true,
        "message": "Bookmark deleted successfully"
    }
    """
    try:
        if current_app.config.get('FIREBASE_DB'):
            user_id = get_user_id()
            
            # Get bookmark details before deletion to update message status
            all_bookmarks = get_bookmarks(user_id)
            bookmark_to_delete = None
            
            for bookmark in all_bookmarks:
                if bookmark.get('id') == bookmark_id:
                    bookmark_to_delete = bookmark
                    break
            
            # Delete bookmark from Firestore (will find the chat automatically)
            success = delete_bookmark(user_id, bookmark_id)
            
            if success:
                # Update the corresponding message's bookmark status if found
                if bookmark_to_delete:
                    linked_message_id = bookmark_to_delete.get('linkedMessageId')
                    if linked_message_id:
                        update_message_bookmark(user_id, linked_message_id, False)
                
                logger.info(f"Deleted bookmark {bookmark_id} for user {user_id}")
                
                return jsonify({
                    'success': True,
                    'message': 'Bookmark deleted successfully'
                })
            else:
                return jsonify({'error': 'Failed to delete bookmark'}), 500
        else:
            return jsonify({
                'success': False,
                'message': 'Firebase not available - bookmark not deleted',
                'note': 'Bookmarks can only be deleted when Firebase is connected'
            })
        
    except Exception as e:
        logger.error(f"Error deleting bookmark: {str(e)}")
        return jsonify({'error': 'Failed to delete bookmark'}), 500

@bookmark_bp.route('/bookmarks/message/<message_id>', methods=['PUT'])
def toggle_message_bookmark(message_id):
    """
    Toggle the bookmark status of a specific message.
    
    Expected JSON payload:
    {
        "bookmarked": true|false,
        "snippet": "Bookmark snippet text" (required if bookmarked=true)
    }
    
    Returns:
    {
        "success": true,
        "bookmarked": true|false,
        "message": "Bookmark status updated successfully"
    }
    """
    try:
        # Validate request
        if not request.is_json:
            return jsonify({'error': 'Content-Type must be application/json'}), 400
        
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        bookmarked = data.get('bookmarked', False)
        snippet = data.get('snippet', '').strip()
        bookmark_type = data.get('type', 'user').lower()
        
        if bookmarked and not snippet:
            return jsonify({'error': 'snippet is required when creating a bookmark'}), 400
        
        if bookmark_type not in ['user', 'tutor']:
            return jsonify({'error': 'type must be either "user" or "tutor"'}), 400
        
        if current_app.config.get('FIREBASE_DB'):
            user_id = get_user_id()
            
            # Update message bookmark status
            success = update_message_bookmark(user_id, message_id, bookmarked)
            
            if success:
                if bookmarked:
                    # Create bookmark entry
                    bookmark_data = {
                        'linkedMessageId': message_id,
                        'snippet': snippet,
                        'type': bookmark_type
                    }
                    
                    bookmark_id = save_bookmark(user_id, bookmark_data)
                    
                    if bookmark_id:
                        logger.info(f"Created bookmark {bookmark_id} for message {message_id}")
                    else:
                        logger.warning(f"Failed to create bookmark for message {message_id}")
                else:
                    # Remove bookmark entry
                    all_bookmarks = get_bookmarks(user_id)
                    bookmark_to_delete = None
                    
                    for bookmark in all_bookmarks:
                        if bookmark.get('linkedMessageId') == message_id:
                            bookmark_to_delete = bookmark
                            break
                    
                    if bookmark_to_delete:
                        delete_bookmark(user_id, bookmark_to_delete.get('id'))
                        logger.info(f"Deleted bookmark for message {message_id}")
                
                return jsonify({
                    'success': True,
                    'bookmarked': bookmarked,
                    'message': 'Bookmark status updated successfully'
                })
            else:
                return jsonify({'error': 'Failed to update bookmark status'}), 500
        else:
            return jsonify({
                'success': False,
                'message': 'Firebase not available - bookmark status not updated',
                'note': 'Bookmarks are only managed when Firebase is connected'
            })
        
    except Exception as e:
        logger.error(f"Error toggling message bookmark: {str(e)}")
        return jsonify({'error': 'Failed to update bookmark status'}), 500

@bookmark_bp.route('/bookmarks/search', methods=['GET'])
def search_bookmarks():
    """
    Search bookmarks by content.
    
    Query parameters:
    - q: Search query string
    - type: Filter by bookmark type ('user', 'tutor', or 'all') - default: 'all'
    - limit: Maximum number of results to return (optional)
    
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
        ],
        "total": 123,
        "query": "search_query"
    }
    """
    try:
        # Get query parameters
        search_query = request.args.get('q', '').strip()
        bookmark_type = request.args.get('type', 'all').lower()
        limit = request.args.get('limit', type=int)
        
        if not search_query:
            return jsonify({'error': 'Search query is required'}), 400
        
        if current_app.config.get('FIREBASE_DB'):
            user_id = get_user_id()
            all_bookmarks = get_bookmarks(user_id)
            
            # Filter by type if specified
            if bookmark_type != 'all':
                all_bookmarks = [
                    bookmark for bookmark in all_bookmarks 
                    if bookmark.get('type', 'user') == bookmark_type
                ]
            
            # Search in snippet content
            search_results = []
            search_lower = search_query.lower()
            
            for bookmark in all_bookmarks:
                snippet = bookmark.get('snippet', '').lower()
                if search_lower in snippet:
                    search_results.append(bookmark)
            
            # Apply limit
            if limit and limit > 0:
                search_results = search_results[:limit]
            
            # Format results for frontend
            formatted_results = []
            for bookmark in search_results:
                formatted_results.append({
                    'id': bookmark.get('id', ''),
                    'linkedMessageId': bookmark.get('linkedMessageId', ''),
                    'snippet': bookmark.get('snippet', ''),
                    'timestamp': format_firestore_timestamp(bookmark.get('timestamp', '')),
                    'type': bookmark.get('type', 'user')
                })
            
            logger.info(f"Search for '{search_query}' returned {len(formatted_results)} bookmarks")
            
            return jsonify({
                'bookmarks': formatted_results,
                'total': len(formatted_results),
                'query': search_query,
                'source': 'firestore'
            })
        else:
            return jsonify({
                'bookmarks': [],
                'total': 0,
                'query': search_query,
                'note': 'Firebase not available - search not available',
                'source': 'memory'
            })
        
    except Exception as e:
        logger.error(f"Error searching bookmarks: {str(e)}")
        return jsonify({'error': 'Failed to search bookmarks'}), 500

@bookmark_bp.route('/bookmarks/clear', methods=['POST'])
def clear_all_bookmarks():
    """
    Clear all bookmarks for the current user.
    
    Returns:
    {
        "success": true,
        "message": "All bookmarks cleared successfully",
        "deleted_count": 123
    }
    """
    try:
        if current_app.config.get('FIREBASE_DB'):
            user_id = get_user_id()
            
            # Use the existing delete_all_bookmarks function
            from firebase_config import delete_all_bookmarks
            success = delete_all_bookmarks(user_id)
            
            if success:
                logger.info(f"Cleared all bookmarks for user {user_id}")
                return jsonify({
                    'success': True,
                    'message': 'All bookmarks cleared successfully',
                    'deleted_count': 'all'
                })
            else:
                logger.error(f"Failed to clear bookmarks for user {user_id}")
                return jsonify({
                    'success': False,
                    'message': 'Failed to clear bookmarks'
                }), 500
        else:
            return jsonify({
                'success': False,
                'message': 'Firebase not available - bookmarks cannot be cleared',
                'note': 'Bookmarks are only managed when Firebase is connected'
            }), 500
        
    except Exception as e:
        logger.error(f"Error clearing bookmarks: {str(e)}")
        return jsonify({'error': 'Failed to clear bookmarks'}), 500
