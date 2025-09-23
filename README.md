# Business Law AI Tutor

A comprehensive Flask-based web application that provides an intelligent tutoring system for Business Law students. The application features AI-powered chat interactions, file upload capabilities, voice input, chapter-specific learning contexts, and persistent data storage with Firebase Firestore.

## Features

### 🤖 AI-Powered Tutoring
- **Multi-model AI Support**: Uses Gemini 1.5 Flash for intelligent responses
- **Chapter-Specific Context**: Upload PDFs and images to provide context for specific Business Law chapters
- **Intelligent Responses**: AI always explains concepts in clear, student-friendly terms with examples

### 📚 Chapter Management
- **10 Business Law Chapters**: Pre-configured chapters covering essential topics
- **Context Storage**: Upload study materials for each chapter to enhance AI responses
- **Active Chapter Selection**: Focus learning on specific topics

### 📁 File Upload & Processing
- **PDF Support**: Extract text from PDF documents using pdfplumber with OCR fallback
- **Image OCR**: Extract text from images using Tesseract OCR
- **Persistent Storage**: Store file metadata in Firebase Firestore

### 🎤 Voice Input
- **Live Voice Recognition**: Real-time speech-to-text using Web Speech API
- **Continuous Recording**: Keep microphone active until manually stopped
- **Accurate Transcription**: Clean, non-repetitive text output

### 💬 Chat Features
- **Real-time Messaging**: Instant AI responses with loading indicators
- **Persistent Chat History**: Complete conversation history stored in Firebase Firestore
- **Export Options**: Export chat history in JSON, TXT, or CSV formats
- **Suggested Questions**: Quick-start questions for common topics

### 🔖 Bookmark System
- **Message Bookmarks**: Save important messages for quick access
- **Searchable Bookmarks**: Find bookmarks by content with real-time search
- **Visual Indicators**: Highlighted bookmarked messages in chat
- **Persistent Storage**: Bookmarks stored in Firebase Firestore

### 🎨 Modern UI/UX
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Smooth Animations**: Professional transitions and interactions
- **Scroll Management**: Smart scroll-to-bottom with arrow button
- **Loading States**: Visual feedback for all operations
- **Message Avatars**: Visual distinction between user and AI messages
- **3-Dot Menu**: Comprehensive message options (bookmark, copy, edit, select)

### 🗄️ Data Persistence
- **Firebase Firestore**: Cloud-based NoSQL database for persistent storage
- **User Data**: Chat history, bookmarks, and uploads persist across sessions
- **Real-time Sync**: Data automatically loads on page refresh
- **Offline Fallback**: Graceful degradation when Firebase is unavailable

## Installation

### Prerequisites

1. **Python 3.8+** installed on your system
2. **Tesseract OCR** installed for image text extraction
3. **Google Gemini API Key** for AI functionality
4. **Firebase Project** for data persistence

### System Dependencies

#### Windows
```bash
# Install Tesseract OCR
# Download from: https://github.com/UB-Mannheim/tesseract/wiki
# Add to PATH environment variable
```

#### macOS
```bash
# Install Tesseract OCR
brew install tesseract
```

#### Linux (Ubuntu/Debian)
```bash
# Install Tesseract OCR
sudo apt-get update
sudo apt-get install tesseract-ocr
```

### Firebase Setup

1. **Create a Firebase Project**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Click "Add project" and follow the setup wizard
   - Enable Firestore Database in your project

2. **Generate Service Account Key**
   - In Firebase Console, go to Project Settings > Service Accounts
   - Click "Generate new private key"
   - Download the JSON file

3. **Configure Service Account**
   - Rename the downloaded JSON file to `firebase_key.json`
   - Place it in the project root directory
   - **Important**: Never commit this file to version control

### Application Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd business-law-ai-tutor
```

2. **Create virtual environment**
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install Python dependencies**
```bash
pip install -r requirements.txt
```

4. **Set up environment variables**
```bash
# Create .env file
cp .env.example .env

# Edit .env file with your API keys
GEMINI_API_KEY=your_gemini_api_key_here
SECRET_KEY=your_secret_key_here
FLASK_DEBUG=True
FLASK_HOST=0.0.0.0
FLASK_PORT=5000
```

5. **Configure Firebase**
```bash
# Copy your Firebase service account key
cp firebase_key.json.example firebase_key.json
# Edit firebase_key.json with your actual Firebase credentials
```

6. **Run the application**
```bash
python app.py
```

The application will be available at `http://localhost:5000`

## API Endpoints

### Chat Endpoints

#### `POST /api/chat`
Send a message to the AI tutor.

**Request Body:**
```json
{
    "message": "What are the key elements of a valid contract?",
    "chapter": "Contracts and Agreements"
}
```

**Response:**
```json
{
    "reply": "The key elements of a valid contract are...",
    "chapter": "Contracts and Agreements",
    "timestamp": "2024-01-15T10:30:00Z",
    "model_used": "gemini-1.5-flash",
    "user_message_id": "firestore_message_id",
    "ai_message_id": "firestore_message_id"
}
```

#### `GET /api/chapters`
Get list of available Business Law chapters.

**Response:**
```json
{
    "chapters": [
        "Introduction to Business Law",
        "Contracts and Agreements",
        "Business Organizations",
        // ... more chapters
    ],
    "active_chapter": "Contracts and Agreements"
}
```

#### `POST /api/chapters/{chapter_name}`
Set the active chapter for the session.

### Upload Endpoints

#### `POST /api/upload`
Upload PDF or image files for text extraction and Firestore storage.

**Form Data:**
- `file`: The file to upload
- `chapter`: (Optional) Chapter name for context storage

**Response:**
```json
{
    "success": true,
    "filename": "contract_law.pdf",
    "chapter": "Contracts and Agreements",
    "content_length": 1500,
    "upload_id": "firestore_upload_id",
    "file_type": "pdf",
    "file_size": 1024000
}
```

#### `GET /api/upload/status`
Get upload statistics and Firebase connection status.

#### `POST /api/upload/clear`
Clear uploaded content from session (Firestore data remains persistent).

### Voice Endpoints

#### `POST /api/voice`
Upload audio file for transcription.

**Form Data:**
- `audio`: The audio file to transcribe

**Response:**
```json
{
    "success": true,
    "transcription": "What are the key elements of a valid contract?",
    "filename": "question.mp3",
    "file_size": 1024000,
    "timestamp": "2024-01-15T10:30:00Z"
}
```

#### `GET /api/voice/status`
Check voice transcription service availability.

### History Endpoints

#### `GET /api/history`
Get chat history from Firestore with optional filtering.

**Query Parameters:**
- `limit`: Maximum number of entries
- `chapter`: Filter by chapter
- `start_date`: Filter from date (ISO format)
- `end_date`: Filter until date (ISO format)

**Response:**
```json
{
    "history": [
        {
            "user_message": "What is a contract?",
            "ai_reply": "A contract is...",
            "chapter": "Contracts and Agreements",
            "timestamp": "2024-01-15T10:30:00Z",
            "model_used": "gemini-1.5-flash"
        }
    ],
    "total_entries": 50,
    "filtered_entries": 25,
    "source": "firestore"
}
```

#### `GET /api/history/export`
Export chat history in various formats (JSON, CSV, TXT).

#### `POST /api/history/clear`
Clear chat history from memory (Firestore data remains persistent).

### Bookmark Endpoints

#### `GET /api/bookmarks`
Get all bookmarks for the current user.

**Query Parameters:**
- `limit`: Maximum number of bookmarks
- `type`: Filter by type ('user', 'tutor', 'all')

**Response:**
```json
{
    "bookmarks": [
        {
            "id": "bookmark_id",
            "linkedMessageId": "message_id",
            "snippet": "Bookmark snippet text",
            "timestamp": "2024-01-15T10:30:00Z",
            "type": "user"
        }
    ],
    "total": 10,
    "source": "firestore"
}
```

#### `POST /api/bookmarks`
Create a new bookmark.

**Request Body:**
```json
{
    "linkedMessageId": "message_id",
    "snippet": "Bookmark snippet text",
    "type": "user"
}
```

#### `DELETE /api/bookmarks/{bookmark_id}`
Delete a bookmark by ID.

#### `PUT /api/bookmarks/message/{message_id}`
Toggle bookmark status for a specific message.

#### `GET /api/bookmarks/search`
Search bookmarks by content.

**Query Parameters:**
- `q`: Search query string
- `type`: Filter by type ('user', 'tutor', 'all')
- `limit`: Maximum number of results

### Upload Management Endpoints

#### `GET /api/uploads`
Get all uploaded files for the current user.

**Response:**
```json
{
    "uploads": [
        {
            "id": "upload_id",
            "fileName": "contract_law.pdf",
            "fileType": "application/pdf",
            "fileUrl": "file_url",
            "uploadedAt": "2024-01-15T10:30:00Z"
        }
    ],
    "total": 5
}
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Google Gemini API key for AI functionality | Required |
| `SECRET_KEY` | Flask secret key for sessions | `dev-secret-key-change-in-production` |
| `FLASK_DEBUG` | Enable debug mode | `False` |
| `FLASK_HOST` | Host to bind the server to | `0.0.0.0` |
| `FLASK_PORT` | Port to bind the server to | `5000` |

### Firebase Database Structure

The application uses Firebase Firestore with the following structure:

```
users/
├── {userId}/
│   ├── chat_history/
│   │   ├── {messageId}/
│   │   │   ├── message: string
│   │   │   ├── sender: "user" | "tutor"
│   │   │   ├── timestamp: server timestamp
│   │   │   ├── chapter: string (optional)
│   │   │   ├── bookmarked: boolean
│   │   │   ├── model_used: string (optional)
│   │   │   └── createdAt: string
│   │   └── ...
│   ├── bookmarks/
│   │   ├── {bookmarkId}/
│   │   │   ├── linkedMessageId: string
│   │   │   ├── snippet: string
│   │   │   ├── type: "user" | "tutor"
│   │   │   ├── timestamp: string
│   │   │   └── createdAt: server timestamp
│   │   └── ...
│   └── uploads/
│       ├── {uploadId}/
│       │   ├── fileName: string
│       │   ├── fileType: string
│       │   ├── fileSize: number
│       │   ├── contentLength: number
│       │   ├── chapter: string (optional)
│       │   ├── extractedText: string (preview)
│       │   ├── fileUrl: string (optional)
│       │   ├── timestamp: string
│       │   └── uploadedAt: server timestamp
│       └── ...
```

### File Size Limits

- **PDF/Image Uploads**: 16MB maximum
- **Audio Uploads**: 25MB maximum

### Supported File Formats

- **PDF**: `.pdf`
- **Images**: `.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.tiff`
- **Audio**: `.mp3`, `.mp4`, `.mpeg`, `.mpga`, `.m4a`, `.wav`, `.webm`

## Business Law Chapters

The application includes 10 pre-configured Business Law chapters:

1. **Introduction to Business Law**
2. **Contracts and Agreements**
3. **Business Organizations**
4. **Employment Law**
5. **Intellectual Property**
6. **Consumer Protection**
7. **Corporate Governance**
8. **International Business Law**
9. **Tax Law Basics**
10. **Regulatory Compliance**

## Usage Examples

### Basic Chat Interaction
1. Open the application in your browser
2. Type a question in the input field
3. Press Enter or click the send button
4. Receive an AI-generated response

### Chapter-Specific Learning
1. Select a chapter from the left sidebar
2. Upload relevant study materials (PDFs/images)
3. Ask questions specific to that chapter
4. AI will use the uploaded context for more accurate responses

### Voice Input
1. Click the microphone button
2. Select an audio file
3. Wait for transcription
4. Review and edit the transcribed text
5. Send the message

### File Upload
1. Click the "+" button
2. Select a PDF or image file
3. Optionally specify a chapter
4. Wait for text extraction
5. Content is stored as chapter context

### Chat History
1. Click "Chat History" in the sidebar
2. Browse previous conversations
3. Click on any entry to reload it
4. Export or clear history as needed

## Development

### Project Structure
```
business-law-ai-tutor/
├── app.py                 # Main Flask application
├── firebase_config.py     # Firebase Firestore configuration
├── firebase_key.json      # Firebase service account key (not in repo)
├── firebase_key.json.example # Example Firebase key file
├── routes/               # Route modules
│   ├── __init__.py
│   ├── chat_routes.py    # Chat and AI endpoints
│   ├── upload_routes.py  # File upload endpoints
│   ├── voice_routes.py   # Voice transcription endpoints
│   ├── history_routes.py # Chat history endpoints
│   └── bookmark_routes.py # Bookmark management endpoints
├── templates/            # HTML templates
│   └── index.html        # Main application page
├── static/              # Static assets
│   ├── css/
│   │   └── style.css     # Main stylesheet
│   └── js/
│       └── app.js        # Frontend JavaScript
├── requirements.txt      # Python dependencies
├── .env                 # Environment variables (not in repo)
├── .env.example         # Example environment file
└── README.md            # This file
```

### Running in Development Mode
```bash
export FLASK_DEBUG=True
python app.py
```

## Firebase Integration

### Features

- **Persistent Data Storage**: All chat history, bookmarks, and uploads are stored in Firebase Firestore
- **Real-time Sync**: Data automatically loads when the application starts
- **Offline Fallback**: Application gracefully degrades when Firebase is unavailable
- **User Isolation**: Each user's data is stored separately (currently using demo user ID)

### Troubleshooting

#### Firebase Connection Issues

1. **Check Service Account Key**
   - Ensure `firebase_key.json` exists in the project root
   - Verify the JSON file contains valid credentials
   - Check that the service account has Firestore permissions

2. **Firebase Project Setup**
   - Ensure Firestore Database is enabled in your Firebase project
   - Check that the project ID matches your service account key
   - Verify billing is enabled if required

3. **Network Issues**
   - Check internet connectivity
   - Verify firewall settings allow Firebase connections
   - Check if your network blocks Google Cloud services

#### Common Error Messages

- **"Firebase service account key not found"**: Missing or incorrectly named `firebase_key.json`
- **"Firebase not initialized"**: Service account key is invalid or corrupted
- **"Permission denied"**: Service account lacks Firestore read/write permissions

### Production Deployment

For production deployment:

1. **Environment Variables**: Set all required environment variables
2. **Firebase Security Rules**: Configure appropriate Firestore security rules
3. **Service Account**: Use a dedicated service account with minimal required permissions
4. **Monitoring**: Set up Firebase monitoring and alerts
5. **Backup**: Implement regular data backup strategies

### Data Migration

To migrate from in-memory storage to Firebase:

1. Export existing data using the `/api/history/export` endpoint
2. Set up Firebase project and service account
3. Restart the application with Firebase enabled
4. Data will be automatically stored in Firestore going forward

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Create an issue in the repository
- Check the troubleshooting section above
- Review the API documentation

## Acknowledgments

- OpenAI for providing the AI models and Whisper API
- PyMuPDF for PDF text extraction
- Tesseract for OCR capabilities
- Flask community for the excellent web framework
