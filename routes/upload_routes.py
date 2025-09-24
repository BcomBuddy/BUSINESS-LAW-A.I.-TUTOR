"""
Upload Routes for Business Law AI Tutor
Handles file uploads, text extraction, and context storage with Firebase Firestore integration.
"""

import os
import logging
import tempfile
import shutil
from datetime import datetime
from flask import Blueprint, request, jsonify, session, current_app, send_file
from werkzeug.utils import secure_filename
import pytesseract
from PIL import Image
from io import BytesIO

# Utility to keep the latest uploaded content accessible for the chat
from flask import g

def set_global_pdf_context(content):
    """Store the latest extracted PDF content globally for chat usage"""
    g.latest_pdf_content = content


# Import Firebase functions
from firebase_config import save_upload, get_demo_user_id, get_uploads as firebase_get_uploads, delete_upload as firebase_delete_upload, format_firestore_timestamp

# Import helper for clean PDF extraction
from utils.pdf_utils import extract_text_from_pdf  # <-- NEW IMPORT

logger = logging.getLogger(__name__)
upload_bp = Blueprint('upload', __name__)

# Allowed file extensions
ALLOWED_EXTENSIONS = {
    'pdf': ['pdf'],
    'image': ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff']
}

MAX_FILE_SIZE = 16 * 1024 * 1024  # 16MB limit

# Create uploads directory if it doesn't exist
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), '..', 'uploads')
os.makedirs(UPLOADS_DIR, exist_ok=True)

def save_file_to_disk(file_content, filename, upload_id):
    """Save file content to disk and return the file path."""
    try:
        # Create a unique filename with upload_id
        file_extension = os.path.splitext(filename)[1]
        unique_filename = f"{upload_id}{file_extension}"
        file_path = os.path.join(UPLOADS_DIR, unique_filename)
        
        # Write file content to disk
        with open(file_path, 'wb') as f:
            f.write(file_content)
        
        logger.info(f"Saved file to disk: {file_path}")
        return file_path
    except Exception as e:
        logger.error(f"Error saving file to disk: {str(e)}")
        return None

def delete_file_from_disk(upload_id, filename):
    """Delete file from disk."""
    try:
        file_extension = os.path.splitext(filename)[1]
        unique_filename = f"{upload_id}{file_extension}"
        file_path = os.path.join(UPLOADS_DIR, unique_filename)
        
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"Deleted file from disk: {file_path}")
            return True
        return False
    except Exception as e:
        logger.error(f"Error deleting file from disk: {str(e)}")
        return False

def get_user_id():
    """Get the current user ID from the request parameters."""
    user_uid = request.args.get('user_uid')
    if user_uid:
        return user_uid
    else:
        # Fallback to demo user for backward compatibility
        return get_demo_user_id()

def allowed_file(filename, file_type):
    if '.' not in filename:
        return False
    ext = filename.rsplit('.', 1)[1].lower()
    return ext in ALLOWED_EXTENSIONS.get(file_type, [])

def extract_text_from_image(file_stream):
    """Extract text from image using Tesseract OCR"""
    try:
        image = Image.open(file_stream)
        text = pytesseract.image_to_string(image)
        return text.strip()
    except Exception as e:
        logger.error(f"Error extracting text from image: {str(e)}")
        raise

def store_file_content(filename, content):
    if 'chapter_context' not in session:
        session['chapter_context'] = {}
    session['chapter_context'][filename] = content
    logger.info(f"Stored file content for: {filename}")

def store_chapter_context(chapter_name, content):
    if 'chapter_context' not in session:
        session['chapter_context'] = {}
    session['chapter_context'][chapter_name] = content
    logger.info(f"Stored context for chapter: {chapter_name}")

@upload_bp.route('/upload', methods=['POST'])
def upload_file():
    """
    Handle file uploads with text extraction and Firestore storage.
    """
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Check file size
        file.seek(0, 2)
        file_size = file.tell()
        file.seek(0)
        if file_size > MAX_FILE_SIZE:
            return jsonify({'error': f'File too large. Max size is {MAX_FILE_SIZE // (1024*1024)}MB'}), 413

        filename = secure_filename(file.filename)
        file_extension = filename.rsplit('.', 1)[1].lower()
        chapter = request.form.get('chapter', '').strip()
        extracted_text = ""
        file_type = "unknown"

        # Store the original file content for serving later
        file.seek(0)
        file_content = file.read()
        file.seek(0)

        if file_extension in ALLOWED_EXTENSIONS['pdf']:
            file_type = "pdf"
            logger.info(f"Extracting text from PDF: {filename}")
            
            # Try multiple extraction methods
            extracted_text = ""
            
            # Method 1: Direct text extraction
            try:
                extracted_text = extract_text_from_pdf(file)
                logger.info(f"Direct extraction successful: {len(extracted_text)} characters")
            except Exception as e:
                logger.warning(f"Direct extraction failed: {str(e)}")
            
            # Method 2: If direct extraction failed or returned little text, try OCR
            if not extracted_text or len(extracted_text.strip()) < 50:
                logger.info("Attempting OCR extraction for PDF")
                try:
                    file.seek(0)
                    # Convert PDF pages to images and OCR them
                    import fitz
                    pdf_bytes = file.read()
                    file.seek(0)
                    pdf_stream = BytesIO(pdf_bytes)
                    
                    with fitz.open(stream=pdf_stream, filetype="pdf") as pdf:
                        ocr_text = ""
                        for page_num in range(min(pdf.page_count, 10)):  # Limit to first 10 pages
                            page = pdf.load_page(page_num)
                            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x zoom for better OCR
                            img_data = pix.tobytes("png")
                            img = Image.open(BytesIO(img_data))
                            page_text = pytesseract.image_to_string(img, config='--psm 6')
                            if page_text.strip():
                                ocr_text += page_text + "\n"
                        
                        if ocr_text.strip():
                            extracted_text = ocr_text
                            logger.info(f"OCR extraction successful: {len(extracted_text)} characters")
                except Exception as e:
                    logger.error(f"OCR extraction failed: {str(e)}")
            
            # Method 3: If still no text, try with different OCR settings
            if not extracted_text or len(extracted_text.strip()) < 50:
                logger.info("Attempting OCR with different settings")
                try:
                    file.seek(0)
                    pdf_bytes = file.read()
                    file.seek(0)
                    pdf_stream = BytesIO(pdf_bytes)
                    
                    with fitz.open(stream=pdf_stream, filetype="pdf") as pdf:
                        ocr_text = ""
                        for page_num in range(min(pdf.page_count, 5)):  # Limit to first 5 pages
                            page = pdf.load_page(page_num)
                            pix = page.get_pixmap(matrix=fitz.Matrix(3, 3))  # 3x zoom
                            img_data = pix.tobytes("png")
                            img = Image.open(BytesIO(img_data))
                            # Try different OCR modes
                            for psm in [6, 3, 1]:
                                try:
                                    page_text = pytesseract.image_to_string(img, config=f'--psm {psm}')
                                    if page_text.strip() and len(page_text.strip()) > 20:
                                        ocr_text += page_text + "\n"
                                        break
                                except:
                                    continue
                        
                        if ocr_text.strip():
                            extracted_text = ocr_text
                            logger.info(f"Advanced OCR extraction successful: {len(extracted_text)} characters")
                except Exception as e:
                    logger.error(f"Advanced OCR extraction failed: {str(e)}")
            
            if not extracted_text or len(extracted_text.strip()) < 10:
                logger.warning(f"All extraction methods failed for {filename}")
                extracted_text = f"PDF file '{filename}' uploaded but text extraction failed. The file may be encrypted, corrupted, or contain only images without text."

        elif file_extension in ALLOWED_EXTENSIONS['image']:
            file_type = "image"
            logger.info(f"Extracting text from image: {filename}")
            extracted_text = extract_text_from_image(file)


        else:
            return jsonify({'error': 'Unsupported file type'}), 400

        if extracted_text:
            store_file_content(filename, extracted_text)
            set_global_pdf_context(extracted_text)  # <--- NEW LINE
            logger.info(f"Stored file content in session for {filename}, session keys: {list(session.get('chapter_context', {}).keys())}")
        if chapter and extracted_text:
            store_chapter_context(chapter, extracted_text)

        upload_id = None
        if current_app.config.get('FIREBASE_DB'):
            user_id = get_user_id()
            upload_data = {
                'fileName': filename,
                'fileType': file.content_type or f'application/{file_extension}',
                'fileSize': file_size,
                'contentLength': len(extracted_text),
                'chapter': chapter if chapter else None,
                'extractedText': extracted_text[:1000] + "..." if len(extracted_text) > 1000 else extracted_text,
                'fileUrl': f'/api/uploads/{user_id}/file'  # Set the file serving URL
            }
            upload_id = save_upload(user_id, upload_data)
            
            # Save file to disk for serving
            if upload_id:
                file_path = save_file_to_disk(file_content, filename, upload_id)
                if not file_path:
                    logger.error(f"Failed to save file to disk for upload {upload_id}")
        else:
            # For non-Firebase mode, generate a temporary ID
            import uuid
            upload_id = str(uuid.uuid4())
            file_path = save_file_to_disk(file_content, filename, upload_id)

        return jsonify({
            'success': True,
            'filename': filename,
            'chapter': chapter if chapter else None,
            'content_length': len(extracted_text),
            'upload_id': upload_id,
            'file_type': file_type,
            'file_size': file_size
        })

    except Exception as e:
        logger.error(f"Error uploading file: {str(e)}")
        return jsonify({'error': 'File upload failed'}), 500

@upload_bp.route('/uploads', methods=['GET'])
def get_uploads():
    """
    Retrieve all uploaded files for the current user.
    """
    try:
        if current_app.config.get('FIREBASE_DB'):
            user_id = get_user_id()
            uploads = firebase_get_uploads(user_id)
            
            # Format uploads for frontend
            formatted_uploads = []
            for upload in uploads:
                formatted_uploads.append({
                    'id': upload.get('id', ''),
                    'fileName': upload.get('fileName', ''),
                    'fileType': upload.get('fileType', ''),
                    'fileUrl': upload.get('fileUrl', ''),
                    'uploadedAt': format_firestore_timestamp(upload.get('uploadedAt', ''))
                })
            
            logger.info(f"Retrieved {len(formatted_uploads)} uploads for user {user_id}")
            
            return jsonify({
                'uploads': formatted_uploads,
                'total': len(formatted_uploads)
            })
        else:
            return jsonify({
                'uploads': [],
                'total': 0,
                'note': 'Firebase not available - using in-memory storage'
            })
        
    except Exception as e:
        logger.error(f"Error retrieving uploads: {str(e)}")
        return jsonify({'error': 'Failed to retrieve uploads'}), 500

@upload_bp.route('/files/<upload_id>', methods=['GET'])
def serve_file_by_id(upload_id):
    """
    Serve a file by its upload ID with stable endpoint.
    """
    try:
        # Get current user ID
        current_user_id = get_user_id()
        
        # Get file info from Firestore
        if current_app.config.get('FIREBASE_DB'):
            uploads = firebase_get_uploads(current_user_id)
            file_info = None
            for upload in uploads:
                if upload.get('id') == upload_id:
                    file_info = upload
                    break
            
            if not file_info:
                return jsonify({'error': 'File not found'}), 404
            
            filename = file_info.get('fileName', '')
            content_type = file_info.get('fileType', 'application/octet-stream')
        else:
            return jsonify({'error': 'File not found'}), 404
        
        # Construct file path
        file_extension = os.path.splitext(filename)[1]
        unique_filename = f"{upload_id}{file_extension}"
        file_path = os.path.join(UPLOADS_DIR, unique_filename)
        
        # Check if file exists
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found on disk'}), 404
        
        # Serve the file
        return send_file(
            file_path,
            mimetype=content_type,
            as_attachment=False,
            download_name=filename
        )
        
    except Exception as e:
        logger.error(f"Error serving file {upload_id}: {str(e)}")
        return jsonify({'error': 'Failed to serve file'}), 500

@upload_bp.route('/uploads/<user_id>/file', methods=['GET'])
def serve_file(user_id):
    """
    Serve uploaded file content by user ID and upload ID.
    """
    try:
        upload_id = request.args.get('upload_id')
        if not upload_id:
            return jsonify({'error': 'Upload ID required'}), 400
        
        # Get file info from Firestore
        if current_app.config.get('FIREBASE_DB'):
            uploads = firebase_get_uploads(user_id)
            file_info = None
            for upload in uploads:
                if upload.get('id') == upload_id:
                    file_info = upload
                    break
            
            if not file_info:
                return jsonify({'error': 'File not found'}), 404
            
            filename = file_info.get('fileName', '')
            content_type = file_info.get('fileType', 'application/octet-stream')
        else:
            # For non-Firebase mode, we need to get filename from somewhere
            # This is a limitation - we'd need to store this info elsewhere
            return jsonify({'error': 'File not found'}), 404
        
        # Construct file path
        file_extension = os.path.splitext(filename)[1]
        unique_filename = f"{upload_id}{file_extension}"
        file_path = os.path.join(UPLOADS_DIR, unique_filename)
        
        # Check if file exists on disk
        if not os.path.exists(file_path):
            logger.error(f"File not found on disk: {file_path}")
            return jsonify({'error': 'File not found'}), 404
        
        # Serve file using Flask's send_file
        return send_file(
            file_path,
            mimetype=content_type,
            as_attachment=False,
            download_name=filename
        )
        
    except Exception as e:
        logger.error(f"Error serving file: {str(e)}")
        return jsonify({'error': 'Failed to serve file'}), 500

@upload_bp.route('/uploads/<upload_id>', methods=['DELETE'])
def delete_upload(upload_id):
    """
    Delete an uploaded file.
    """
    try:
        if current_app.config.get('FIREBASE_DB'):
            user_id = get_user_id()
            
            # Get file info before deleting from Firestore
            uploads = firebase_get_uploads(user_id)
            file_info = None
            for upload in uploads:
                if upload.get('id') == upload_id:
                    file_info = upload
                    break
            
            # Delete from Firestore
            if firebase_delete_upload(user_id, upload_id):
                # Delete file from disk
                if file_info:
                    filename = file_info.get('fileName', '')
                    delete_file_from_disk(upload_id, filename)
                
                logger.info(f"Deleted upload {upload_id} for user {user_id}")
                return jsonify({'success': True})
            else:
                return jsonify({'error': 'Failed to delete upload'}), 500
        else:
            return jsonify({'error': 'Firebase not available'}), 500
        
    except Exception as e:
        logger.error(f"Error deleting upload: {str(e)}")
        return jsonify({'error': 'Failed to delete upload'}), 500
