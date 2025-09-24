"""
Firebase Configuration for Business Law AI Tutor
Handles Firebase Admin SDK initialization and Firestore operations.
"""

import os
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore import DocumentReference, CollectionReference

# Configure logging
logger = logging.getLogger(__name__)

# Global Firestore client
db = None

def initialize_firebase():
    """
    Initialize Firebase Admin SDK with Firestore.
    
    Requires firebase_key.json file in the project root with service account credentials.
    """
    global db
    
    try:
        # Check if Firebase is already initialized
        if firebase_admin._apps:
            logger.info("Firebase already initialized")
            db = firestore.client()
            return db
        
        # Try to get Firebase credentials from environment variables first
        firebase_config = {
            "type": "service_account",
            "project_id": os.getenv('FIREBASE_PROJECT_ID'),
            "private_key_id": os.getenv('FIREBASE_PRIVATE_KEY_ID'),
            "private_key": os.getenv('FIREBASE_PRIVATE_KEY', '').replace('\\n', '\n'),
            "client_email": os.getenv('FIREBASE_CLIENT_EMAIL'),
            "client_id": os.getenv('FIREBASE_CLIENT_ID'),
            "auth_uri": os.getenv('FIREBASE_AUTH_URI'),
            "token_uri": os.getenv('FIREBASE_TOKEN_URI'),
            "auth_provider_x509_cert_url": os.getenv('FIREBASE_AUTH_PROVIDER_X509_CERT_URL'),
            "client_x509_cert_url": os.getenv('FIREBASE_CLIENT_X509_CERT_URL'),
            "universe_domain": os.getenv('FIREBASE_UNIVERSE_DOMAIN')
        }
        
        # Check if all required environment variables are set
        if not all(firebase_config.values()):
            # Fallback to JSON file for local development
            key_path = os.path.join(os.path.dirname(__file__), 'firebase_key.json')
            
            if not os.path.exists(key_path):
                logger.error("Firebase credentials not found in environment variables or firebase_key.json")
                logger.error("Please set Firebase environment variables or create firebase_key.json")
                return None
            
            logger.info("Using firebase_key.json for local development")
            cred = credentials.Certificate(key_path)
        else:
            logger.info("Using environment variables for Firebase credentials")
            cred = credentials.Certificate(firebase_config)
        
        # Initialize Firebase Admin SDK
        firebase_admin.initialize_app(cred)
        
        # Get Firestore client
        db = firestore.client()
        
        logger.info("Firebase Admin SDK initialized successfully")
        return db
        
    except Exception as e:
        logger.error(f"Failed to initialize Firebase: {str(e)}")
        return None

def get_user_collection(user_id: str) -> CollectionReference:
    """Get the user's root collection reference."""
    return db.collection('users').document(user_id)

def get_chat_history_collection(user_id: str) -> CollectionReference:
    """Get the user's chat history collection reference."""
    return db.collection('users').document(user_id).collection('chat_history')

def get_uploads_collection(user_id: str) -> CollectionReference:
    """Get the user's uploads collection reference."""
    return db.collection('users').document(user_id).collection('uploads')

def get_bookmarks_collection(user_id: str) -> CollectionReference:
    """Get the user's bookmarks collection reference."""
    return db.collection('users').document(user_id).collection('bookmarks')

def get_chats_collection(user_id: str) -> CollectionReference:
    """Get the user's chats collection reference."""
    return db.collection('users').document(user_id).collection('chats')

def get_chat_messages_collection(user_id: str, chat_id: str) -> CollectionReference:
    """Get the messages subcollection for a specific chat."""
    return db.collection('users').document(user_id).collection('chats').document(chat_id).collection('messages')

def get_chat_bookmarks_collection(user_id: str, chat_id: str) -> CollectionReference:
    """Get the bookmarks subcollection for a specific chat."""
    return db.collection('users').document(user_id).collection('chats').document(chat_id).collection('bookmarks')

# Chat History Operations
def save_chat_message(user_id: str, message_data: Dict[str, Any], chat_id: str = None) -> Optional[str]:
    """
    Save a chat message to Firestore.
    
    Args:
        user_id: User identifier
        message_data: Dictionary containing message, sender, timestamp, chapter, bookmarked
        chat_id: Chat ID to associate the message with (required)
    
    Returns:
        Message ID if successful, None otherwise
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return None
        
        if not chat_id:
            logger.error("Chat ID is required to save message")
            return None
        
        # Add server timestamp and chat ID
        message_data['timestamp'] = firestore.SERVER_TIMESTAMP
        message_data['createdAt'] = datetime.now().isoformat()
        message_data['chatId'] = chat_id
        
        # DEBUG: Log what data is actually being saved
        logger.info(f"SAVING MESSAGE DATA: {message_data}")
        
        # Save to the messages subcollection within the chat
        doc_ref = get_chat_messages_collection(user_id, chat_id).add(message_data)
        
        logger.info(f"Saved chat message for user {user_id} in chat {chat_id}: {doc_ref[1].id}")
        return doc_ref[1].id
        
    except Exception as e:
        logger.error(f"Failed to save chat message: {str(e)}")
        return None

def get_chat_history(user_id: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Retrieve chat history for a user.
    
    Args:
        user_id: User identifier
        limit: Maximum number of messages to retrieve
    
    Returns:
        List of chat messages
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return []
        
        # Query chat history collection
        query = get_chat_history_collection(user_id).order_by('timestamp', direction=firestore.Query.DESCENDING)
        
        if limit:
            query = query.limit(limit)
        
        docs = query.stream()
        
        # Convert to list of dictionaries
        messages = []
        for doc in docs:
            message_data = doc.to_dict()
            message_data['id'] = doc.id
            messages.append(message_data)
        
        # Sort by timestamp (oldest first for display)
        messages.sort(key=lambda x: x.get('timestamp', ''))
        
        logger.info(f"Retrieved {len(messages)} chat messages for user {user_id}")
        return messages
        
    except Exception as e:
        logger.error(f"Failed to retrieve chat history: {str(e)}")
        return []

def get_chat_history_by_chat(user_id: str, chat_id: str) -> List[Dict[str, Any]]:
    """
    Retrieve chat history for a specific chat.
    
    Args:
        user_id: User identifier
        chat_id: Chat ID
    
    Returns:
        List of chat messages for the specific chat
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return []
        
        # Query the messages subcollection within the specific chat
        query = get_chat_messages_collection(user_id, chat_id).order_by('timestamp', direction=firestore.Query.ASCENDING)
        
        docs = query.stream()
        
        # Convert to list of dictionaries
        messages = []
        for doc in docs:
            message_data = doc.to_dict()
            message_data['id'] = doc.id
            messages.append(message_data)
        
        logger.info(f"Retrieved {len(messages)} chat messages for chat {chat_id}")
        return messages
        
    except Exception as e:
        logger.error(f"Failed to retrieve chat history for chat {chat_id}: {str(e)}")
        return []

def update_message_bookmark(user_id: str, message_id: str, bookmarked: bool) -> bool:
    """
    Update the bookmark status of a chat message.
    
    Args:
        user_id: User identifier
        message_id: Message ID to update
        bookmarked: New bookmark status
    
    Returns:
        True if successful, False otherwise
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return False
        
        # Search for the message across all chats since messages are stored in chat subcollections
        chats = get_user_chats(user_id)
        message_found = False
        
        for chat in chats:
            chat_id = chat.get('id')
            if not chat_id:
                continue
                
            # Check if message exists in this chat
            doc_ref = get_chat_messages_collection(user_id, chat_id).document(message_id)
            doc = doc_ref.get()
            
            if doc.exists:
                # Update the message
                doc_ref.update({
                    'bookmarked': bookmarked,
                    'updatedAt': datetime.now().isoformat()
                })
                message_found = True
                logger.info(f"Updated bookmark status for message {message_id} in chat {chat_id}: {bookmarked}")
                break
        
        if not message_found:
            logger.warning(f"Message {message_id} not found in any chat for user {user_id}")
            return False
        
        return True
        
    except Exception as e:
        logger.error(f"Failed to update message bookmark: {str(e)}")
        return False

def update_message_bookmark_in_chat(user_id: str, chat_id: str, message_id: str, bookmarked: bool) -> bool:
    """
    Update the bookmark status of a chat message in a specific chat.
    
    Args:
        user_id: User identifier
        chat_id: Chat ID
        message_id: Message ID to update
        bookmarked: New bookmark status
    
    Returns:
        True if successful, False otherwise
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return False
        
        # Update the message in the specific chat
        doc_ref = get_chat_messages_collection(user_id, chat_id).document(message_id)
        doc = doc_ref.get()
        
        if doc.exists:
            doc_ref.update({
                'bookmarked': bookmarked,
                'updatedAt': datetime.now().isoformat()
            })
            logger.info(f"Updated bookmark status for message {message_id} in chat {chat_id}: {bookmarked}")
            return True
        else:
            logger.warning(f"Message {message_id} not found in chat {chat_id}")
            return False
        
    except Exception as e:
        logger.error(f"Failed to update message bookmark in chat: {str(e)}")
        return False

def delete_all_chat_messages(user_id: str) -> bool:
    """
    Delete all chat messages for a user from Firestore.
    
    Args:
        user_id: User identifier
    
    Returns:
        True if successful, False otherwise
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return False
        
        # Get all chats for the user
        chats = get_user_chats(user_id)
        total_deleted = 0
        
        # Delete messages from each chat's messages subcollection
        for chat in chats:
            chat_id = chat.get('id')
            if not chat_id:
                continue
                
            # Get all messages in this chat
            messages_docs = get_chat_messages_collection(user_id, chat_id).stream()
            
            # Delete each message
            chat_deleted = 0
            for doc in messages_docs:
                doc.reference.delete()
                chat_deleted += 1
            
            total_deleted += chat_deleted
            logger.info(f"Deleted {chat_deleted} messages from chat {chat_id}")
        
        logger.info(f"Deleted {total_deleted} total chat messages for user {user_id}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to delete chat messages: {str(e)}")
        return False

# Bookmark Operations
def save_bookmark(user_id: str, bookmark_data: Dict[str, Any]) -> Optional[str]:
    """
    Save a bookmark to Firestore under the chat document.
    
    Args:
        user_id: User identifier
        bookmark_data: Dictionary containing linkedMessageId, snippet, chatId, etc.
    
    Returns:
        Bookmark ID if successful, None otherwise
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return None
        
        chat_id = bookmark_data.get('chatId')
        if not chat_id:
            logger.error("chatId is required for bookmark creation")
            return None
        
        # Verify chat exists
        chat_doc = get_chats_collection(user_id).document(chat_id).get()
        if not chat_doc.exists:
            logger.error(f"Chat {chat_id} does not exist for user {user_id}")
            return None
        
        # Add server timestamp
        bookmark_data['createdAt'] = firestore.SERVER_TIMESTAMP
        bookmark_data['timestamp'] = datetime.now().isoformat()
        
        # Save to Firestore under chat document
        doc_ref = get_chat_bookmarks_collection(user_id, chat_id).add(bookmark_data)
        
        logger.info(f"Saved bookmark for user {user_id} in chat {chat_id}: {doc_ref[1].id}")
        return doc_ref[1].id
        
    except Exception as e:
        logger.error(f"Failed to save bookmark: {str(e)}")
        return None

def get_bookmarks(user_id: str) -> List[Dict[str, Any]]:
    """
    Retrieve all bookmarks for a user from all chats.
    
    Args:
        user_id: User identifier
    
    Returns:
        List of bookmarks
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return []
        
        all_bookmarks = []
        
        # Get all chats for the user
        chats = get_user_chats(user_id)
        
        # Get bookmarks from each chat
        for chat in chats:
            chat_id = chat.get('id')
            if chat_id:
                chat_bookmarks = get_chat_bookmarks(user_id, chat_id)
                all_bookmarks.extend(chat_bookmarks)
        
        # Sort by timestamp (newest first)
        all_bookmarks.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        
        logger.info(f"Retrieved {len(all_bookmarks)} bookmarks for user {user_id}")
        return all_bookmarks
        
    except Exception as e:
        logger.error(f"Failed to retrieve bookmarks: {str(e)}")
        return []

def get_chat_bookmarks(user_id: str, chat_id: str) -> List[Dict[str, Any]]:
    """
    Retrieve bookmarks for a specific chat.
    
    Args:
        user_id: User identifier
        chat_id: Chat ID
    
    Returns:
        List of bookmarks for the chat
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return []
        
        # Query bookmarks subcollection for the chat
        docs = get_chat_bookmarks_collection(user_id, chat_id).order_by('createdAt', direction=firestore.Query.DESCENDING).stream()
        
        # Convert to list of dictionaries
        bookmarks = []
        for doc in docs:
            bookmark_data = doc.to_dict()
            bookmark_data['id'] = doc.id
            bookmark_data['chatId'] = chat_id  # Ensure chatId is included
            bookmarks.append(bookmark_data)
        
        logger.info(f"Retrieved {len(bookmarks)} bookmarks for chat {chat_id}")
        return bookmarks
        
    except Exception as e:
        logger.error(f"Failed to retrieve bookmarks for chat {chat_id}: {str(e)}")
        return []

def delete_bookmark(user_id: str, bookmark_id: str, chat_id: str = None) -> bool:
    """
    Delete a bookmark from Firestore.
    
    Args:
        user_id: User identifier
        bookmark_id: Bookmark ID to delete
        chat_id: Chat ID (optional, will be found if not provided)
    
    Returns:
        True if successful, False otherwise
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return False
        
        # If chat_id is not provided, find it by searching all chats
        if not chat_id:
            chats = get_user_chats(user_id)
            for chat in chats:
                chat_id = chat.get('id')
                if chat_id:
                    # Check if bookmark exists in this chat
                    bookmark_doc = get_chat_bookmarks_collection(user_id, chat_id).document(bookmark_id).get()
                    if bookmark_doc.exists:
                        break
            else:
                logger.error(f"Bookmark {bookmark_id} not found in any chat for user {user_id}")
                return False
        
        # Delete the bookmark
        get_chat_bookmarks_collection(user_id, chat_id).document(bookmark_id).delete()
        
        logger.info(f"Deleted bookmark {bookmark_id} from chat {chat_id} for user {user_id}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to delete bookmark: {str(e)}")
        return False

def delete_chat_bookmarks(user_id: str, chat_id: str) -> bool:
    """
    Delete all bookmarks for a specific chat.
    
    Args:
        user_id: User identifier
        chat_id: Chat ID
    
    Returns:
        True if successful, False otherwise
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return False
        
        # Get all bookmarks for the chat
        docs = get_chat_bookmarks_collection(user_id, chat_id).stream()
        
        # Delete each bookmark
        deleted_count = 0
        for doc in docs:
            doc.reference.delete()
            deleted_count += 1
        
        logger.info(f"Deleted {deleted_count} bookmarks for chat {chat_id} and user {user_id}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to delete bookmarks for chat {chat_id}: {str(e)}")
        return False

def delete_all_bookmarks(user_id: str) -> bool:
    """
    Delete all bookmarks for a user from all chats.
    
    Args:
        user_id: User identifier
    
    Returns:
        True if successful, False otherwise
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return False
        
        # Get all chats for the user
        chats = get_user_chats(user_id)
        
        # Delete bookmarks from each chat
        total_deleted = 0
        for chat in chats:
            chat_id = chat.get('id')
            if chat_id:
                success = delete_chat_bookmarks(user_id, chat_id)
                if success:
                    # Count bookmarks that were deleted (we'll get this from the log)
                    total_deleted += 1
        
        logger.info(f"Deleted bookmarks from {total_deleted} chats for user {user_id}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to delete bookmarks: {str(e)}")
        return False

# Chat Management Operations
def create_chat(user_id: str, chat_name: str = "New Chat") -> Optional[str]:
    """
    Create a new chat for a user.
    
    Args:
        user_id: User identifier
        chat_name: Name of the chat
    
    Returns:
        Chat ID if successful, None otherwise
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return None
        
        # Create chat document
        chat_data = {
            'chatName': chat_name,
            'createdAt': firestore.SERVER_TIMESTAMP,
            'lastUpdated': firestore.SERVER_TIMESTAMP,
            'timestamp': datetime.now().isoformat()
        }
        
        doc_ref = get_chats_collection(user_id).add(chat_data)
        
        logger.info(f"Created chat for user {user_id}: {doc_ref[1].id}")
        return doc_ref[1].id
        
    except Exception as e:
        logger.error(f"Failed to create chat: {str(e)}")
        return None

def get_user_chats(user_id: str) -> List[Dict[str, Any]]:
    """
    Retrieve all chats for a user.
    
    Args:
        user_id: User identifier
    
    Returns:
        List of chats
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return []
        
        # Query chats collection
        docs = get_chats_collection(user_id).order_by('lastUpdated', direction=firestore.Query.DESCENDING).stream()
        
        # Convert to list of dictionaries
        chats = []
        for doc in docs:
            chat_data = doc.to_dict()
            chat_data['id'] = doc.id
            chats.append(chat_data)
        
        logger.info(f"Retrieved {len(chats)} chats for user {user_id}")
        return chats
        
    except Exception as e:
        logger.error(f"Failed to retrieve chats: {str(e)}")
        return []

def get_chat(user_id: str, chat_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve a specific chat for a user.
    
    Args:
        user_id: User identifier
        chat_id: Chat ID
    
    Returns:
        Chat data if found, None otherwise
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return None
        
        doc = get_chats_collection(user_id).document(chat_id).get()
        
        if doc.exists:
            chat_data = doc.to_dict()
            chat_data['id'] = doc.id
            return chat_data
        else:
            return None
        
    except Exception as e:
        logger.error(f"Failed to retrieve chat: {str(e)}")
        return None

def update_chat_name(user_id: str, chat_id: str, new_name: str) -> bool:
    """
    Update the name of a chat.
    
    Args:
        user_id: User identifier
        chat_id: Chat ID
        new_name: New chat name
    
    Returns:
        True if successful, False otherwise
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return False
        
        # Update the chat
        doc_ref = get_chats_collection(user_id).document(chat_id)
        doc_ref.update({
            'chatName': new_name,
            'lastUpdated': firestore.SERVER_TIMESTAMP,
            'timestamp': datetime.now().isoformat()
        })
        
        logger.info(f"Updated chat name for chat {chat_id}: {new_name}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to update chat name: {str(e)}")
        return False

def delete_chat(user_id: str, chat_id: str) -> bool:
    """
    Delete a chat and all its associated messages and bookmarks.
    
    Args:
        user_id: User identifier
        chat_id: Chat ID
    
    Returns:
        True if successful, False otherwise
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return False
        
        # Check if chat exists before trying to delete
        chat_doc = get_chats_collection(user_id).document(chat_id).get()
        if not chat_doc.exists:
            logger.warning(f"Chat {chat_id} does not exist for user {user_id}")
            return False
        
        # Delete all bookmarks in the bookmarks subcollection (cascade deletion)
        bookmarks_query = get_chat_bookmarks_collection(user_id, chat_id)
        bookmarks = bookmarks_query.stream()
        
        bookmarks_deleted = 0
        for bookmark in bookmarks:
            bookmark.reference.delete()
            bookmarks_deleted += 1
        
        # Delete all messages in the messages subcollection
        messages_query = get_chat_messages_collection(user_id, chat_id)
        messages = messages_query.stream()
        
        messages_deleted = 0
        for message in messages:
            message.reference.delete()
            messages_deleted += 1
        
        # Delete the chat document
        chat_ref = get_chats_collection(user_id).document(chat_id)
        chat_ref.delete()
        
        # Verify deletion
        chat_doc_after = chat_ref.get()
        if chat_doc_after.exists:
            logger.error(f"Chat {chat_id} still exists after deletion attempt")
            return False
        
        logger.info(f"Successfully deleted chat {chat_id}, {messages_deleted} messages, and {bookmarks_deleted} bookmarks for user {user_id}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to delete chat {chat_id}: {str(e)}")
        return False

def update_chat_timestamp(user_id: str, chat_id: str) -> bool:
    """
    Update the lastUpdated timestamp of a chat.
    
    Args:
        user_id: User identifier
        chat_id: Chat ID
    
    Returns:
        True if successful, False otherwise
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return False
        
        # Update the chat timestamp
        doc_ref = get_chats_collection(user_id).document(chat_id)
        doc_ref.update({
            'lastUpdated': firestore.SERVER_TIMESTAMP,
            'timestamp': datetime.now().isoformat()
        })
        
        return True
        
    except Exception as e:
        logger.error(f"Failed to update chat timestamp: {str(e)}")
        return False

# Upload Operations
def save_upload(user_id: str, upload_data: Dict[str, Any]) -> Optional[str]:
    """
    Save upload metadata to Firestore.
    
    Args:
        user_id: User identifier
        upload_data: Dictionary containing fileName, fileType, fileUrl, etc.
    
    Returns:
        Upload ID if successful, None otherwise
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return None
        
        # Add server timestamp
        upload_data['uploadedAt'] = firestore.SERVER_TIMESTAMP
        upload_data['timestamp'] = datetime.now().isoformat()
        
        # Save to Firestore
        doc_ref = get_uploads_collection(user_id).add(upload_data)
        
        logger.info(f"Saved upload for user {user_id}: {doc_ref[1].id}")
        return doc_ref[1].id
        
    except Exception as e:
        logger.error(f"Failed to save upload: {str(e)}")
        return None

def get_uploads(user_id: str) -> List[Dict[str, Any]]:
    """
    Retrieve uploads for a user.
    
    Args:
        user_id: User identifier
    
    Returns:
        List of uploads
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return []
        
        # Query uploads collection
        docs = get_uploads_collection(user_id).order_by('uploadedAt', direction=firestore.Query.DESCENDING).stream()
        
        # Convert to list of dictionaries
        uploads = []
        for doc in docs:
            upload_data = doc.to_dict()
            upload_data['id'] = doc.id
            uploads.append(upload_data)
        
        logger.info(f"Retrieved {len(uploads)} uploads for user {user_id}")
        return uploads
        
    except Exception as e:
        logger.error(f"Failed to retrieve uploads: {str(e)}")
        return []

def delete_upload(user_id: str, upload_id: str) -> bool:
    """
    Delete an upload from Firestore.
    
    Args:
        user_id: User identifier
        upload_id: Upload ID to delete
    
    Returns:
        True if successful, False otherwise
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return False
        
        # Delete the upload
        get_uploads_collection(user_id).document(upload_id).delete()
        
        logger.info(f"Deleted upload {upload_id} for user {user_id}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to delete upload: {str(e)}")
        return False

def delete_chat_messages(user_id: str, chat_id: str) -> bool:
    """
    Delete all messages from a specific chat.
    
    Args:
        user_id: User identifier
        chat_id: Chat ID
    
    Returns:
        True if successful, False otherwise
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return False
        
        # Get all messages in this chat
        messages_docs = get_chat_messages_collection(user_id, chat_id).stream()
        
        # Delete each message
        deleted_count = 0
        for doc in messages_docs:
            doc.reference.delete()
            deleted_count += 1
        
        logger.info(f"Deleted {deleted_count} messages from chat {chat_id} for user {user_id}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to delete chat messages: {str(e)}")
        return False

# Utility Functions
def get_demo_user_id() -> str:
    """
    Get the demo user ID for development/testing.
    In production, this should be replaced with actual user authentication.
    """
    return "demoUser"

def format_firestore_timestamp(timestamp) -> str:
    """
    Format Firestore timestamp to ISO string.
    
    Args:
        timestamp: Firestore timestamp object
    
    Returns:
        ISO formatted string
    """
    if hasattr(timestamp, 'timestamp'):
        return datetime.fromtimestamp(timestamp.timestamp()).isoformat()
    elif isinstance(timestamp, str):
        return timestamp
    else:
        return datetime.now().isoformat()

# Structured History Entries Functions
def get_structured_history_collection(user_id: str) -> CollectionReference:
    """Get the user's structured history entries collection reference."""
    return db.collection('users').document(user_id).collection('structured_history')

def save_structured_history_entry(user_id: str, entry_data: Dict[str, Any]) -> bool:
    """
    Save a structured history entry to Firestore.
    
    Args:
        user_id: User identifier
        entry_data: Dictionary containing id, time, chapter, user, aiTutor
    
    Returns:
        True if successful, False otherwise
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return False
        
        # Add timestamp for Firestore
        entry_data['createdAt'] = firestore.SERVER_TIMESTAMP
        
        # Save to structured history collection
        get_structured_history_collection(user_id).document(entry_data['id']).set(entry_data)
        
        logger.info(f"Saved structured history entry {entry_data['id']} for user {user_id}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to save structured history entry: {str(e)}")
        return False

def get_structured_history_entries(user_id: str) -> List[Dict[str, Any]]:
    """
    Retrieve all structured history entries for a user.
    
    Args:
        user_id: User identifier
    
    Returns:
        List of structured history entries
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return []
        
        # Query structured history collection
        docs = get_structured_history_collection(user_id).order_by('time', direction=firestore.Query.DESCENDING).stream()
        
        # Convert to list of dictionaries
        entries = []
        for doc in docs:
            entry_data = doc.to_dict()
            entries.append(entry_data)
        
        logger.info(f"Retrieved {len(entries)} structured history entries for user {user_id}")
        return entries
        
    except Exception as e:
        logger.error(f"Failed to retrieve structured history entries: {str(e)}")
        return []

def clear_structured_history_entries(user_id: str) -> bool:
    """
    Clear all structured history entries for a user.
    
    Args:
        user_id: User identifier
    
    Returns:
        True if successful, False otherwise
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return False
        
        # Get all structured history entries
        entries_docs = get_structured_history_collection(user_id).stream()
        
        # Delete each entry
        deleted_count = 0
        for doc in entries_docs:
            doc.reference.delete()
            deleted_count += 1
        
        logger.info(f"Deleted {deleted_count} structured history entries for user {user_id}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to clear structured history entries: {str(e)}")
        return False

def update_chat_message(user_id: str, chat_id: str, message_id: str, update_data: Dict[str, Any]) -> bool:
    """
    Update a specific chat message's content and metadata.
    
    Args:
        user_id: User identifier
        chat_id: Chat ID
        message_id: Message ID to update
        update_data: Dictionary containing fields to update
    
    Returns:
        True if successful, False otherwise
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return False
        
        # Update the message in the specific chat
        doc_ref = get_chat_messages_collection(user_id, chat_id).document(message_id)
        doc = doc_ref.get()
        
        if doc.exists:
            # Add updated timestamp
            update_data['updatedAt'] = datetime.now().isoformat()
            
            doc_ref.update(update_data)
            logger.info(f"Updated message {message_id} in chat {chat_id} for user {user_id}")
            return True
        else:
            logger.warning(f"Message {message_id} not found in chat {chat_id}")
            return False
        
    except Exception as e:
        logger.error(f"Failed to update chat message: {str(e)}")
        return False

def delete_followup_assistant_message(user_id: str, chat_id: str, user_message_id: str) -> bool:
    """
    Find and delete the assistant message immediately following a given user message.
    
    Args:
        user_id: User identifier
        chat_id: Chat ID
        user_message_id: User message ID to find the followup for
    
    Returns:
        True if successful, False otherwise
    """
    try:
        if not db:
            logger.error("Firestore not initialized")
            return False
        
        # Get all messages in the chat ordered by timestamp
        messages = get_chat_history_by_chat(user_id, chat_id)
        
        # Find the user message and the next assistant message
        user_message_found = False
        assistant_message_id = None
        
        for i, msg in enumerate(messages):
            if msg.get('id') == user_message_id and msg.get('sender') == 'user':
                user_message_found = True
                # Look for the next assistant message
                if i + 1 < len(messages) and messages[i + 1].get('sender') == 'tutor':
                    assistant_message_id = messages[i + 1].get('id')
                break
        
        if not user_message_found:
            logger.warning(f"User message {user_message_id} not found in chat {chat_id}")
            return False
        
        if not assistant_message_id:
            logger.info(f"No assistant message found after user message {user_message_id}")
            return True  # Not an error if there's no assistant message to delete
        
        # Delete the assistant message
        doc_ref = get_chat_messages_collection(user_id, chat_id).document(assistant_message_id)
        doc = doc_ref.get()
        
        if doc.exists:
            doc.reference.delete()
            logger.info(f"Deleted assistant message {assistant_message_id} after user message {user_message_id}")
            return True
        else:
            logger.warning(f"Assistant message {assistant_message_id} not found for deletion")
            return False
        
    except Exception as e:
        logger.error(f"Failed to delete followup assistant message: {str(e)}")
        return False

def get_upload_by_filename(user_id, filename):
    """Get upload data by filename for a specific user."""
    try:
        if not db:
            logger.error("Firebase not initialized")
            return None
        
        uploads_ref = db.collection('users').document(user_id).collection('uploads')
        query = uploads_ref.where('fileName', '==', filename).limit(1)
        docs = query.get()
        
        if docs:
            doc = docs[0]
            data = doc.to_dict()
            data['id'] = doc.id
            return data
        else:
            logger.warning(f"No upload found for filename: {filename}")
            return None
            
    except Exception as e:
        logger.error(f"Failed to get upload by filename: {str(e)}")
        return None

