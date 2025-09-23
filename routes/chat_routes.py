"""
Chat Routes for Business Law AI Tutor
Handles AI chat interactions with Gemini API support and Firebase Firestore integration.
"""

import os
import json
import logging
import re
from datetime import datetime
from flask import Blueprint, request, jsonify, session, current_app, g
import google.generativeai as genai

# Import Firebase functions
from firebase_config import (
    save_chat_message, get_chat_history, get_demo_user_id,
    format_firestore_timestamp, update_chat_timestamp, create_chat,
    update_chat_name, get_chat_history_by_chat, update_message_bookmark_in_chat,
    get_user_chats, get_bookmarks, get_uploads, update_chat_message,
    delete_followup_assistant_message
)

# Configure logging
logger = logging.getLogger(__name__)

chat_bp = Blueprint('chat', __name__)

# Configure Gemini API
genai.configure(api_key=os.environ.get('GEMINI_API_KEY'))

# Initialize Gemini model
model = genai.GenerativeModel('gemini-1.5-flash', generation_config={
    'max_output_tokens': 8192,
    'temperature': 0.7
})

chat_history = []
chapter_context = {}
activeChapter = ''

# Business Law chapters for the sidebar
BUSINESS_LAW_CHAPTERS = [
    "INDIAN CONTRACT ACT",
    "SALE OF GOODS ACT AND CONSUMER PROTECTION ACT",
    "INTELLECTUAL PROPERTY RIGHTS",
    "MANAGEMENT OF COMPANIES AND MEETINGS",
    "WINDING UP"
]

# Default suggestions when no chapter is selected
defaultSuggestions = [
    "What is business law and why is it important?",
    "What are the essential elements of a valid contract?",
    "What are the different types of contracts?",
    "What is the Sale of Goods Act?",
    "What are intellectual property rights?",
    "How are companies managed and wound up?"
]

# Chapter-specific suggested questions
CHAPTER_QUESTIONS = {
    "INDIAN CONTRACT ACT": [
        "What are the essential elements of a valid contract?",
        "What is the difference between agreement and contract?",
        "How does offer and acceptance work in contract formation?",
        "What is consideration and why is it important?",
        "What are the different types of contracts?",
        "What are the modes of discharge of a contract?",
        "What happens when a contract is breached?",
        "What remedies are available for breach of contract?",
        "How does the Information Technology Act affect contracts?"
    ],
    "SALE OF GOODS ACT AND CONSUMER PROTECTION ACT": [
        "What are the essentials of a valid sale contract?",
        "What's the difference between sale and agreement to sell?",
        "What are conditions and warranties in sale of goods?",
        "What is caveat emptor and its exceptions?",
        "What are the rights of an unpaid seller?",
        "Who is a consumer under Consumer Protection Act?",
        "What are consumer dispute redressal agencies?",
        "How does the Consumer Protection Act protect consumers?",
        "What are the rights of consumers under the law?"
    ],
    "INTELLECTUAL PROPERTY RIGHTS": [
        "What is a trademark and how is it registered?",
        "What are the different types of patents?",
        "What rights does a patentee have?",
        "What is copyright and how long does it last?",
        "What constitutes copyright infringement?",
        "What are trade secrets and how are they protected?",
        "What are geographical indications?",
        "How can intellectual property rights be transferred?",
        "What is the importance of IPR protection?"
    ],
    "MANAGEMENT OF COMPANIES AND MEETINGS": [
        "What are the qualifications and disqualifications of directors?",
        "What are the duties and liabilities of directors?",
        "How are directors appointed and removed?",
        "What is corporate governance?",
        "What is corporate social responsibility?",
        "What are the different types of company meetings?",
        "What is the importance of quorum in meetings?",
        "What are the different types of resolutions?",
        "How are board meetings conducted?"
    ],
    "WINDING UP": [
        "What are the different modes of winding up?",
        "What is voluntary winding up?",
        "What is compulsory winding up?",
        "What are the consequences of winding up?",
        "How is a company removed from Registrar of Companies?",
        "What is the Insolvency and Bankruptcy Code 2016?",
        "What happens to company assets during winding up?",
        "What are the rights of creditors during winding up?",
        "How does winding up affect shareholders?"
    ]
}

def get_system_prompt(chapter=None, user_message=None, has_attached_files=False):
    base_prompt = (
        "You are a professional Business Law tutor. "
        "By default, give concise, student-friendly answers in 2–3 sentences. "
        "Use simple language and clear examples."
    )

    if has_attached_files:
        base_prompt += (
            "\n\nIMPORTANT: The user has attached files. Read and analyze them carefully. "
            "Reference specific content from the files when answering."
        )

    msg_lower = user_message.lower() if user_message else ""
    word_limit = None
    match = re.search(r"(\d+)\s*words?", msg_lower)
    if match:
        word_limit = int(match.group(1))

    if any(x in msg_lower for x in ["essay", "structured", "report", "write an essay", "detailed essay"]):
        base_prompt = (
            "You are a professional Business Law tutor. "
            "Write a well-structured essay with: Introduction, Key Points, Analysis with examples, and Conclusion."
        )
    elif any(x in msg_lower for x in ["elaborate", "explain", "detailed", "expand"]):
        base_prompt = (
            "You are a professional Business Law tutor. "
            "Give a detailed, clear explanation with examples."
        )

    if word_limit:
        base_prompt += f" Ensure the response is around {word_limit} words."
    
    if chapter and chapter in chapter_context:
        notes = chapter_context[chapter]
        return f"{base_prompt}\n\nChapter context:\n{notes}"
    
    return base_prompt

def get_user_id():
    """Get the current user ID from the request parameters."""
    user_uid = request.args.get('user_uid')
    if user_uid:
        return user_uid
    else:
        # Fallback to demo user for backward compatibility
        return get_demo_user_id()

def load_chat_history_from_firestore():
    global chat_history
    try:
        user_id = get_user_id()
        firestore_history = get_chat_history(user_id)
        chat_history = []
        for msg in firestore_history:
            if msg.get('sender') == 'user':
                chat_history.append({
                    'user_message': msg.get('message', ''),
                    'ai_reply': '',
                    'chapter': msg.get('chapter', ''),
                    'timestamp': format_firestore_timestamp(msg.get('timestamp', '')),
                    'model_used': msg.get('model_used', ''),
                    'message_id': msg.get('id', '')
                })
            elif msg.get('sender') == 'tutor' and chat_history:
                    chat_history[-1]['ai_reply'] = msg.get('message', '')
                    chat_history[-1]['timestamp'] = format_firestore_timestamp(msg.get('timestamp', ''))
    except Exception as e:
        logger.error(f"Failed to load chat history: {str(e)}")

def get_ai_response(system_prompt, user_message, chat_id=None):
    try:
        conversation_history = []
        if chat_id:
            user_id = get_user_id()
            messages = get_chat_history_by_chat(user_id, chat_id)
            recent = messages[-20:] if len(messages) > 20 else messages
            for msg in recent:
                if msg.get('sender') == 'user':
                    conversation_history.append(f"User: {msg.get('message', '')}")
                elif msg.get('sender') == 'tutor':
                    conversation_history.append(f"AI: {msg.get('message', '')}")
        
        full_prompt = system_prompt + "\n\n"
        if conversation_history:
            full_prompt += "Previous conversation:\n" + "\n".join(conversation_history) + "\n\n"
        full_prompt += f"User: {user_message}\nAI:"
        
        logger.info(f"Prompt length: {len(full_prompt)}")
        response = model.generate_content(full_prompt)
        return response.text
    except Exception as e:
        logger.error(f"Error generating AI response: {str(e)}")
        return None

@chat_bp.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.get_json()
        user_message = data.get('message', '').strip()
        chapter = data.get('chapter', '').strip()
        chat_id = data.get('chatId')
        attached_files = data.get('attachedFiles', [])
        
        if not user_message:
            return jsonify({'error': 'Message is required'}), 400
        
        user_id = get_user_id()
        
        if not chat_id:
            chat_id = create_chat(user_id, "New Chat")
            if not chat_id:
                return jsonify({'error': 'Failed to create new chat'}), 500
        
        # Store the original user message for saving to Firestore
        original_user_message = user_message

        file_context = ""
        structured_file_content = []

        if attached_files:
            file_context = "\n\n=== ATTACHED FILES CONTENT ===\n"
            for f in attached_files:
                filename = f.get('name', '')
                if filename in session.get('chapter_context', {}):
                    content = session['chapter_context'][filename]
                    file_context += f"\n📄 FILE: {filename}\nCONTENT:\n{content}\nEND OF FILE\n"
                    structured_file_content.append({
                        'filename': filename,
                        'content': content,
                        'type': f.get('type', 'text')
                    })
            file_context += "\n=== END OF ATTACHED FILES ===\n"

        # Build global context dynamically (PDF + chapters)
        # Only include context if files are attached or user explicitly references files/chapters
        global_context = ""
        
        # Check if user explicitly references files/chapters in their message
        user_message_lower = user_message.lower()
        file_reference_keywords = ['pdf', 'document', 'file', 'uploaded', 'attached', 'content', 'text', 'syllabus']
        chapter_reference_keywords = ['chapter', 'section', 'topic']
        
        has_file_references = any(keyword in user_message_lower for keyword in file_reference_keywords)
        has_chapter_references = any(keyword in user_message_lower for keyword in chapter_reference_keywords)
        
        # Only include PDF context if files are attached OR user explicitly references files
        if attached_files or has_file_references:
            try:
                if hasattr(g, "latest_pdf_content") and g.latest_pdf_content:
                    global_context += "\n\n=== PDF CONTEXT ===\n"
                    global_context += g.latest_pdf_content[:4000]
                    global_context += "\n=== END OF PDF CONTEXT ===\n"
            except RuntimeError:
                logger.warning("No request context for g.latest_pdf_content")

        # Only include chapter context if user explicitly references chapters
        if has_chapter_references and "chapter_context" in session:
            for name, content in session["chapter_context"].items():
                if name.lower() in user_message_lower:
                    global_context += f"\n\n=== CHAPTER: {name} ===\n"
                    global_context += content[:4000]
                    global_context += f"\n=== END OF CHAPTER: {name} ===\n"

        # Build the full prompt for the AI (including context)
        full_user_prompt = user_message
        if file_context:
            full_user_prompt += file_context
        if global_context:
            full_user_prompt += "\n\n" + global_context

        has_attached_files = len(attached_files) > 0
        system_prompt = get_system_prompt(chapter, full_user_prompt, has_attached_files)
        
        if chapter:
            system_prompt += f"\n\nChapter: {chapter}"
        
        ai_response = get_ai_response(system_prompt, full_user_prompt, chat_id)
        if not ai_response:
            return jsonify({'error': 'Failed to get AI response'}), 500
        
        # Save the original user message (without context) to Firestore
        user_message_data = {
            'message': original_user_message, 
            'sender': 'user', 
            'chapter': chapter, 
            'bookmarked': False
        }
        
        # Include attached files information with full metadata if any
        if attached_files:
            logger.info(f"Processing {len(attached_files)} attached files for message saving")
            # Get full attachment metadata from uploads
            from firebase_config import get_uploads
            user_id = get_user_id()
            uploads = get_uploads(user_id)
            logger.info(f"Found {len(uploads)} uploads for user {user_id}")
            
            enhanced_attachments = []
            for file in attached_files:
                logger.info(f"Processing attached file: {file}")
                # Find matching upload by filename
                matching_upload = next((u for u in uploads if u.get('fileName') == file.get('name')), None)
                if matching_upload:
                    logger.info(f"Found matching upload for {file.get('name')}: {matching_upload.get('id')}")
                    enhanced_attachments.append({
                        'uploadId': matching_upload.get('id'),
                        'fileName': matching_upload.get('fileName'),
                        'mimeType': matching_upload.get('fileType'),
                        'size': matching_upload.get('fileSize'),
                        'downloadRoute': f"/api/files/{matching_upload.get('id')}",
                        'extractedText': matching_upload.get('extractedText', ''),  # Full content for structured display
                        'originalData': file  # Keep original for compatibility
                    })
                else:
                    logger.warning(f"No matching upload found for file: {file.get('name')}")
                    # Fallback to original data if upload not found
                    enhanced_attachments.append(file)
            
            user_message_data['fileAttachments'] = enhanced_attachments  # Use clear field name for file bubbles
            logger.info(f"Added fileAttachments to user message: {len(enhanced_attachments)} attachments")
        
        user_message_id = save_chat_message(user_id, user_message_data, chat_id)
        

        # Save AI message with structured file content for persistence
        ai_message_data = {
            'message': ai_response, 
            'sender': 'tutor', 
            'chapter': chapter, 
            'bookmarked': False
        }
        
        # Include structured file content with AI message for persistence
        if structured_file_content:
            logger.info(f"Adding structured file content to AI message: {len(structured_file_content)} items")
            logger.info(f"Structured content: {structured_file_content}")
            ai_message_data['structuredFileContent'] = structured_file_content
        else:
            logger.info("No structured file content to add to AI message")
        
        ai_message_id = save_chat_message(user_id, ai_message_data, chat_id)

        update_chat_timestamp(user_id, chat_id)
        
        # Auto-rename chat if it's the first message
        chat_messages = get_chat_history_by_chat(user_id, chat_id)
        chat_renamed, new_chat_name = False, None
        if len(chat_messages) == 2:
            from_name = user_message.strip().split()[:4]
            new_chat_name = " ".join(from_name).title()
            if new_chat_name:
                if update_chat_name(user_id, chat_id, new_chat_name):
                    chat_renamed = True
        
        chat_history.append({
            'user_message': user_message,
            'ai_reply': ai_response,
            'chapter': chapter,
            'timestamp': datetime.now().isoformat(),
            'model_used': 'gemini-1.5-flash'
        })
        
        response_data = {
            'reply': ai_response,
            'timestamp': datetime.now().isoformat(),
            'chapter': chapter,
            'chatId': chat_id,
            'userMessageId': user_message_id,
            'aiMessageId': ai_message_id,
            'structuredFileContent': structured_file_content
        }
        
        if chat_renamed:
            response_data['chatRenamed'] = True
            response_data['newChatName'] = new_chat_name
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        return jsonify({'error': 'Failed to process chat request'}), 500

@chat_bp.route('/chat/edit-regenerate', methods=['POST'])
def edit_regenerate():
    """Handle edit and regenerate flow - delete old assistant reply and generate fresh response."""
    try:
        data = request.get_json()
        user_message_id = data.get('userMessageId')
        new_message = data.get('newMessage', '').strip()
        chat_id = data.get('chatId')
        
        if not user_message_id or not new_message or not chat_id:
            return jsonify({'error': 'Missing required parameters'}), 400
        
        user_id = get_user_id()
        
        # Update the user message in Firestore with the new content
        # Clear any legacy context fields to prevent stale data
        update_data = {
            'message': new_message,
            'editedAt': datetime.now().isoformat(),
            'ragContext': None,  # Clear any legacy RAG context
            'fileContext': None,  # Clear any legacy file context
            'debugContext': None  # Clear any legacy debug context
        }
        if not update_chat_message(user_id, chat_id, user_message_id, update_data):
            return jsonify({'error': 'Failed to update user message'}), 500
        
        # Delete the old assistant message that follows this user message
        if not delete_followup_assistant_message(user_id, chat_id, user_message_id):
            logger.warning(f"Could not delete old assistant message for user message {user_message_id}")
        
        
        # For edit & regenerate, ONLY include RAG context if the edited message explicitly references files/chapters
        # This prevents stale PDF context from being used
        include_rag_context = False
        rag_context = ""
        
        # Check for explicit file references in the edited message
        if hasattr(g, "latest_pdf_content") and g.latest_pdf_content:
            # Look for explicit keywords that suggest the user wants to reference the PDF
            pdf_keywords = ['pdf', 'document', 'file', 'uploaded', 'attached', 'content', 'text', 'syllabus']
            if any(keyword in new_message.lower() for keyword in pdf_keywords):
                include_rag_context = True
                rag_context += "\n\n=== PDF CONTEXT ===\n"
                rag_context += g.latest_pdf_content[:2000]  # Reduced context for edit-regenerate
                rag_context += "\n=== END OF PDF CONTEXT ===\n"
        
        # Check for explicit chapter references
        if "chapter_context" in session:
            for name, content in session["chapter_context"].items():
                if name.lower() in new_message.lower():
                    include_rag_context = True
                    rag_context += f"\n\n=== CHAPTER: {name} ===\n"
                    rag_context += content[:2000]  # Reduced context for edit-regenerate
                    rag_context += f"\n=== END OF CHAPTER: {name} ===\n"
        
        # Build the prompt for regeneration - prioritize fresh responses
        if include_rag_context:
            full_prompt = new_message + rag_context
            system_prompt = get_system_prompt("", full_prompt, True)
        else:
            # Use a clean system prompt for fresh responses without any RAG context
            system_prompt = """You are a helpful AI tutor for Business Law. Provide clear, accurate, and helpful responses to the user's questions. Focus on the specific question asked without referencing external documents unless explicitly mentioned. Give fresh, original responses based on your knowledge."""
            full_prompt = new_message
        
        # Generate fresh AI response with conversation history (excluding deleted messages)
        ai_response = get_ai_response(system_prompt, full_prompt, chat_id)
        if not ai_response:
            return jsonify({'error': 'Failed to generate AI response'}), 500
        
        # Save the new AI response
        ai_message_id = save_chat_message(user_id, {
            'message': ai_response, 
            'sender': 'tutor', 
            'chapter': '', 
            'bookmarked': False,
            'replacesMessageId': user_message_id  # Link to the edited message
        }, chat_id)
        
        # Update chat timestamp
        update_chat_timestamp(user_id, chat_id)
        
        return jsonify({
            'reply': ai_response,
            'timestamp': datetime.now().isoformat(),
            'aiMessageId': ai_message_id,
            'success': True
        })
        
    except Exception as e:
        logger.error(f"Error in edit-regenerate endpoint: {str(e)}")
        return jsonify({'error': 'Failed to process edit-regenerate request'}), 500

@chat_bp.route('/chapters', methods=['GET'])
def get_chapters():
    """Get available chapters and active chapter."""
    try:
            return jsonify({
            'chapters': BUSINESS_LAW_CHAPTERS,
            'activeChapter': activeChapter
            })
    except Exception as e:
        logger.error(f"Error getting chapters: {str(e)}")
        return jsonify({'error': 'Failed to get chapters'}), 500

@chat_bp.route('/chapters/<chapter_name>', methods=['POST'])
def set_active_chapter(chapter_name):
    """Set the active chapter and return suggested questions."""
    try:
        global activeChapter
        activeChapter = chapter_name
        
        # Get suggested questions for the chapter
        suggested_questions = CHAPTER_QUESTIONS.get(chapter_name, defaultSuggestions)
        
        return jsonify({
            'success': True,
            'activeChapter': activeChapter,
            'suggestedQuestions': suggested_questions
        })
    except Exception as e:
        logger.error(f"Error setting active chapter: {str(e)}")
        return jsonify({'error': 'Failed to set active chapter'}), 500
