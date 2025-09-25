// Business Law AI Tutor - Main JavaScript

// Firebase Auth functions
async function logout() {
    try {
        const { getAuth, signOut } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        const auth = getAuth();
        await signOut(auth);
        console.log('User logged out successfully');
        window.location.href = '/login';
    } catch (error) {
        console.error('Logout error:', error);
        // Force redirect to login even if logout fails
        window.location.href = '/login';
    }
}

// Helper function to add user UID to API calls
function addUserUIDToRequest(url, options = {}) {
    const userUID = window.currentUserUID;
    if (!userUID) {
        console.error('No user UID available');
        return { url, options };
    }
    
    // Add user UID as query parameter
    const separator = url.includes('?') ? '&' : '?';
    const newUrl = `${url}${separator}user_uid=${encodeURIComponent(userUID)}`;
    
    return { url: newUrl, options };
}

// Global variables
let activeChapter = '';
let isHistoryPanelOpen = false;
let isProcessing = false;
let bookmarks = [];
let uploadedFiles = [];
let openDropdowns = new Set();
let chats = [];
let currentChatId = null;
let currentChatMessages = []; // Track messages for current chat
let messageIdCounter = 0; // For generating unique message IDs
let loadedChatIds = new Set(); // Track which chats have been loaded to prevent reloading
let lastAIResponse = ''; // Track last AI response for dynamic suggestions
let messageIdMap = new Map(); // Map to track message IDs and prevent duplicates
let chatListeners = new Map(); // Map to track Firestore listeners for each chat
let currentChatListener = null; // Current chat's real-time listener
let chatsListener = null; // Global chats listener
let bookmarksListener = null; // Global bookmarks listener
let uploadsListener = null; // Global uploads listener
let attachedFiles = []; // Track files attached to current prompt

// Chapter-based suggestions based on Osmania University Business Laws Syllabus
const chapterSuggestions = {
    'INDIAN CONTRACT ACT': [
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
    'SALE OF GOODS ACT AND CONSUMER PROTECTION ACT': [
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
    'INTELLECTUAL PROPERTY RIGHTS': [
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
    'MANAGEMENT OF COMPANIES AND MEETINGS': [
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
    'WINDING UP': [
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
};

// Default suggestions when no chapter is selected
const defaultSuggestions = [
    "What is business law and why is it important?",
    "What are the essential elements of a valid contract?",
    "What are the different types of contracts?",
    "What is the Sale of Goods Act?",
    "What are intellectual property rights?",
    "How are companies managed and wound up?"
];

// DOM elements
const chatContainer = document.getElementById('chatContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.querySelector('.send-btn');
const fileInput = document.getElementById('fileInput');
const audioInput = document.getElementById('audioInput');
const scrollBottomBtn = document.getElementById('scrollBottomBtn');
const suggestedQuestions = document.getElementById('suggestedQuestions');
const historyPanel = document.getElementById('historyPanel');
const historyContent = document.getElementById('historyContent');
const loadingOverlay = document.getElementById('loadingOverlay');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing Business Law AI Tutor...');
    
    // Setup event listeners
    setupEventListeners();
    
    // Setup scroll behavior
    setupScrollBehavior();
    
    // Setup search functionality
    setupSearchFunctionality();
    
    // Setup drag-and-drop for file attachments
    setupPromptBarDropZone();
    
    // Initialize suggestions
    updateSuggestedQuestions(defaultSuggestions);
    
    // Setup periodic sync with backend
    setInterval(syncChatsWithBackend, 30000); // Sync every 30 seconds
    
    // Mark app as initialized
    window.appInitialized = true;
    
    // Check if user UID is already available (in case auth state changed before DOM loaded)
    if (window.currentUserUID) {
        console.log('User UID already available, loading data...');
        loadDataFromFirestore();
        loadChapters();
    } else {
        console.log('Waiting for user authentication...');
        // Data loading will be triggered by the auth state change handler
    }
    
    console.log('Application initialized successfully');
});

// Load data from Firestore on page load
window.loadDataFromFirestore = async function loadDataFromFirestore() {
    console.log('Loading data from Firestore...');
    
    try {
        // First, load data using regular fetch to ensure we have data
        await loadChatsFromFirestore();
        await loadBookmarksFromFirestore();
        await loadUploadsFromFirestore();
        
        // Ensure bookmarks are properly filtered after all data is loaded
        if (bookmarks.length > 0) {
            const originalCount = bookmarks.length;
            bookmarks = bookmarks.filter(bookmark => {
                if (bookmark.chatId && bookmark.chatId !== 'unknown') {
                    const chatExists = chats.some(chat => chat.id === bookmark.chatId);
                    if (!chatExists) {
                        console.warn(`Removing bookmark from deleted chat during initialization: ${bookmark.chatId}`);
                        return false;
                    }
                }
                return true;
            });
            
            if (bookmarks.length !== originalCount) {
                console.log(`Filtered bookmarks during initialization: ${originalCount} -> ${bookmarks.length}`);
                renderBookmarks();
                updateBookmarkHighlights();
            }
        }
        
        // Then setup real-time listeners for updates
        setupRealTimeListeners();
        
        // If no chats exist, create a new one
        if (chats.length === 0) {
            console.log('No chats found, creating new chat...');
            await createNewChat();
        } else {
            // Restore the last selected chat (or load most recent if none saved)
            await restoreLastSelectedChat();
        }
        
        console.log('Data loaded from Firestore successfully');
    } catch (error) {
        console.error('Error loading data from Firestore:', error);
        // Create a new chat as fallback
        await createNewChat();
    }
}

// Setup real-time Firestore listeners
function setupRealTimeListeners() {
    console.log('Real-time listeners disabled for now - focusing on basic functionality');
    // TODO: Re-enable real-time listeners once basic functionality is stable
    /*
    // Setup listeners in background (non-blocking)
    setupChatsListener().catch(error => {
        console.error('Chats listener failed:', error);
    });
    
    setupBookmarksListener().catch(error => {
        console.error('Bookmarks listener failed:', error);
    });
    
    setupUploadsListener().catch(error => {
        console.error('Uploads listener failed:', error);
    });
    */
}

// Setup real-time chats listener
async function setupChatsListener() {
    try {
        console.log('Setting up chats listener...');
        
        const { url, options } = addUserUIDToRequest('/api/chats/listen');
        const response = await fetch(url, options);
        
        if (response.ok) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            const processStream = async () => {
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        
                        const chunk = decoder.decode(value);
                        const lines = chunk.split('\n');
                        
                        for (const line of lines) {
                            if (line.trim() && line.startsWith('data: ')) {
                                try {
                                    const data = JSON.parse(line.slice(6));
                                    if (data.type === 'chats_update') {
                                        const oldChatIds = new Set(chats.map(c => c.id));
                                        const newChatIds = new Set(data.chats.map(c => c.id));
                                        
                                        // Update chats array
                                        chats = data.chats || [];
                                        renderChats();
                                        
                                        // Check for deleted chats and remove associated bookmarks
                                        const deletedChatIds = [...oldChatIds].filter(id => !newChatIds.has(id));
                                        if (deletedChatIds.length > 0) {
                                            console.log(`Detected deleted chats: ${deletedChatIds.join(', ')}`);
                                            
                                            // Remove bookmarks from deleted chats
                                            const originalBookmarkCount = bookmarks.length;
                                            bookmarks = bookmarks.filter(bookmark => {
                                                if (bookmark.chatId && bookmark.chatId !== 'unknown') {
                                                    return !deletedChatIds.includes(bookmark.chatId);
                                                }
                                                return true;
                                            });
                                            
                                            if (bookmarks.length !== originalBookmarkCount) {
                                                console.log(`Removed ${originalBookmarkCount - bookmarks.length} bookmarks from deleted chats`);
                                                renderBookmarks();
                                                updateBookmarkHighlights();
                                            }
                                        }
                                        
                                        console.log(`Real-time chats update: ${chats.length} chats`);
                                    }
                                } catch (e) {
                                    console.warn('Error parsing real-time data:', e);
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error in chats stream:', error);
                }
            };
            
            processStream();
        } else {
            console.log('Chats listener not available, skipping real-time updates');
        }
    } catch (error) {
        console.error('Error setting up chats listener:', error);
    }
}

// Setup real-time bookmarks listener
async function setupBookmarksListener() {
    try {
        console.log('Setting up bookmarks listener...');
        
        const { url, options } = addUserUIDToRequest('/api/bookmarks/listen');
        const response = await fetch(url, options);
        
        if (response.ok) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            const processStream = async () => {
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        
                        const chunk = decoder.decode(value);
                        const lines = chunk.split('\n');
                        
                        for (const line of lines) {
                            if (line.trim() && line.startsWith('data: ')) {
                                try {
                                    const data = JSON.parse(line.slice(6));
                                    if (data.type === 'bookmarks_update') {
                                        // Update bookmarks array
                                        bookmarks = data.bookmarks || [];
                                        renderBookmarks();
                                        updateBookmarkHighlights();
                                        console.log(`Real-time bookmarks update: ${bookmarks.length} bookmarks`);
                                    }
                                } catch (e) {
                                    console.warn('Error parsing real-time data:', e);
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error in bookmarks stream:', error);
                }
            };
            
            processStream();
        } else {
            console.log('Bookmarks listener not available, skipping real-time updates');
        }
    } catch (error) {
        console.error('Error setting up bookmarks listener:', error);
    }
}

// Setup real-time uploads listener
async function setupUploadsListener() {
    try {
        console.log('Setting up uploads listener...');
        
        const { url, options } = addUserUIDToRequest('/api/uploads/listen');
        const response = await fetch(url, options);
        
        if (response.ok) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            const processStream = async () => {
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        
                        const chunk = decoder.decode(value);
                        const lines = chunk.split('\n');
                        
                        for (const line of lines) {
                            if (line.trim() && line.startsWith('data: ')) {
                                try {
                                    const data = JSON.parse(line.slice(6));
                                    if (data.type === 'uploads_update') {
                                        // Update uploads array
                                        uploadedFiles = data.uploads || [];
                                        renderUploadedFiles();
                                        console.log(`Real-time uploads update: ${uploadedFiles.length} uploads`);
                                    }
                                } catch (e) {
                                    console.warn('Error parsing real-time data:', e);
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error in uploads stream:', error);
                }
            };
            
            processStream();
        } else {
            console.log('Uploads listener not available, skipping real-time updates');
        }
    } catch (error) {
        console.error('Error setting up uploads listener:', error);
    }
}

// Load chat history from Firestore
async function loadChatHistoryFromFirestore() {
    try {
        const { url, options } = addUserUIDToRequest('/api/history');
        const response = await fetch(url, options);
        const data = await response.json();
        
        if (data.history && data.history.length > 0) {
            // Clear existing chat messages except welcome message
            const messages = chatContainer.querySelectorAll('.message');
            messages.forEach((message, index) => {
                if (index > 0) { // Keep first message (welcome)
                    message.remove();
                }
            });
            
            // Add historical messages to chat
            data.history.forEach(entry => {
                addMessage('user', entry.user_message, entry.timestamp);
                if (entry.ai_reply) {
                    addMessage('ai', entry.ai_reply, entry.timestamp);
                }
            });
            
            console.log(`Loaded ${data.history.length} chat messages from Firestore`);
        }
    } catch (error) {
        console.error('Error loading chat history from Firestore:', error);
    }
}

// Load bookmarks from Firestore
async function loadBookmarksFromFirestore() {
    try {
        const { url, options } = addUserUIDToRequest('/api/bookmarks');
        const response = await fetch(url, options);
        const data = await response.json();
        
        if (data.bookmarks && data.bookmarks.length > 0) {
            // Convert Firestore bookmarks to app format
            bookmarks = data.bookmarks.map(bookmark => ({
                id: bookmark.id,
                messageId: bookmark.linkedMessageId, // This is the key mapping
                content: bookmark.snippet,
                timestamp: bookmark.timestamp,
                type: bookmark.type,
                chatId: bookmark.chatId || 'unknown' // Include chat ID from backend
            }));
            
            // Filter out bookmarks from deleted chats (consistency check)
            bookmarks = bookmarks.filter(bookmark => {
                if (bookmark.chatId && bookmark.chatId !== 'unknown') {
                    const chatExists = chats.some(chat => chat.id === bookmark.chatId);
                    if (!chatExists) {
                        console.warn(`Removing bookmark from deleted chat: ${bookmark.chatId}`);
                        return false;
                    }
                }
                return true;
            });
            
            // Render bookmarks in sidebar
            renderBookmarks();
            
            // Update bookmark highlights in chat
            updateBookmarkHighlights();
            
            console.log(`Loaded ${bookmarks.length} bookmarks from Firestore`);
        } else {
            bookmarks = [];
            renderBookmarks();
            console.log('No bookmarks found in Firestore');
        }
    } catch (error) {
        console.error('Error loading bookmarks from Firestore:', error);
        bookmarks = [];
        renderBookmarks();
    }
}

// Load uploads from Firestore
async function loadUploadsFromFirestore() {
    try {
        const { url, options } = addUserUIDToRequest('/api/uploads');
        const response = await fetch(url, options);
        const data = await response.json();
        
        if (data.uploads && data.uploads.length > 0) {
            // Convert Firestore uploads to app format
            uploadedFiles = data.uploads.map(upload => ({
                id: upload.id,
                name: upload.fileName,
                type: upload.fileType,
                size: upload.fileSize || 0,
                url: upload.fileUrl ? `${upload.fileUrl}?upload_id=${upload.id}` : null
            }));
            
            // Render uploads in sidebar
            renderUploadedFiles();
            
            console.log(`Loaded ${uploadedFiles.length} uploads from Firestore`);
        }
    } catch (error) {
        console.error('Error loading uploads from Firestore:', error);
    }
}

// Load chats from Firestore
async function loadChatsFromFirestore() {
    try {
        console.log('Loading chats from Firestore...');
        console.log('Making request to /api/chats...');
        
        const { url, options } = addUserUIDToRequest('/api/chats');
        const response = await fetch(url, options);
        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);
        
        const data = await response.json();
        console.log('Response data:', data);
        
        if (data.chats && data.chats.length > 0) {
            // Convert Firestore chats to app format
            chats = data.chats.map(chat => ({
                id: chat.id,
                chatName: chat.chatName,
                createdAt: chat.createdAt,
                lastUpdated: chat.lastUpdated
            }));
            
            console.log('Processed chats:', chats);
            
            // Render chats in sidebar
            renderChats();
            
            // Update bookmarks to filter out any from deleted chats
            if (bookmarks.length > 0) {
                const originalCount = bookmarks.length;
                bookmarks = bookmarks.filter(bookmark => {
                    if (bookmark.chatId && bookmark.chatId !== 'unknown') {
                        const chatExists = chats.some(chat => chat.id === bookmark.chatId);
                        if (!chatExists) {
                            console.warn(`Removing bookmark from deleted chat: ${bookmark.chatId}`);
                            return false;
                        }
                    }
                    return true;
                });
                
                if (bookmarks.length !== originalCount) {
                    console.log(`Filtered bookmarks: ${originalCount} -> ${bookmarks.length}`);
                    renderBookmarks();
                    updateBookmarkHighlights();
                }
            }
            
            // Refresh history panel if open
            refreshHistoryPanel();
            
            // Restore last selected chat
            await restoreLastSelectedChat();
            
            console.log(`Loaded ${chats.length} chats from Firestore`);
        } else {
            chats = [];
            console.log('No chats found in Firestore');
        }
    } catch (error) {
        console.error('Error loading chats from Firestore:', error);
        console.error('Error details:', error.message);
        chats = [];
    }
}

// Restore last selected chat from localStorage
async function restoreLastSelectedChat() {
    try {
        const savedChatId = localStorage.getItem('currentChatId');
        if (savedChatId && chats.some(chat => chat.id === savedChatId)) {
            console.log(`Restoring last selected chat: ${savedChatId}`);
            await loadChatWithMessages(savedChatId);
        } else if (chats.length > 0) {
            // If no saved chat or saved chat doesn't exist, load the most recent chat
            const mostRecentChat = chats.reduce((latest, current) => {
                return new Date(current.lastUpdated) > new Date(latest.lastUpdated) ? current : latest;
            });
            console.log(`Loading most recent chat: ${mostRecentChat.id}`);
            await loadChatWithMessages(mostRecentChat.id);
        }
    } catch (error) {
        console.error('Error restoring last selected chat:', error);
    }
}

// Load chat with messages
async function loadChatWithMessages(chatId) {
    try {
        console.log(`Loading chat with messages: ${chatId}`);
        
        // Clear current chat state
        currentChatId = chatId;
        messageIdMap.clear();
        
        // Clear chat container except system messages
        const systemMessages = chatContainer.querySelectorAll('.system-message');
        chatContainer.innerHTML = '';
        systemMessages.forEach(msg => chatContainer.appendChild(msg));
        
        // Load messages for this chat
        await loadChatMessages(chatId);
        
        // Update UI
        renderChats();
        updateActiveChat(chatId);
        
        // Store current chat ID in localStorage
        localStorage.setItem('currentChatId', chatId);
        
        console.log(`Successfully loaded chat: ${chatId}`);
    } catch (error) {
        console.error('Error loading chat with messages:', error);
        showError('Failed to load chat');
    }
}

// Update active chat in UI
function updateActiveChat(chatId) {
    const chatItems = document.querySelectorAll('.chat-item');
    chatItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-chat-id') === chatId) {
            item.classList.add('active');
        }
    });
}

// Sync frontend state with backend
async function syncChatsWithBackend() {
    try {
        const { url, options } = addUserUIDToRequest('/api/chats');
        const response = await fetch(url, options);
        const data = await response.json();
        
        if (data.chats) {
            // Update frontend state
            chats = data.chats.map(chat => ({
                id: chat.id,
                chatName: chat.chatName,
                createdAt: chat.createdAt,
                lastUpdated: chat.lastUpdated
            }));
            
            // Update UI
            renderChats();
            refreshHistoryPanel();
            
            console.log(`Synced ${chats.length} chats with backend`);
        }
    } catch (error) {
        console.error('Error syncing chats with backend:', error);
    }
}

// Setup event listeners
function setupEventListeners() {
    // File input change
    fileInput.addEventListener('change', handleFileUpload);
    
    // Audio input change
    audioInput.addEventListener('change', handleAudioUpload);
    
    // Chat container scroll is handled in setupScrollBehavior()
    
    // Window resize
    window.addEventListener('resize', handleWindowResize);
}

// Setup scroll behavior
function setupScrollBehavior() {
    let scrollTimeout;
    let suggestionBarTimeout;
    let isScrolling = false;
    let lastSuggestionBarState = null;
    let lastScrollButtonState = null;
    
    chatContainer.addEventListener('scroll', function() {
        clearTimeout(scrollTimeout);
        
        const scrollTop = chatContainer.scrollTop;
        const isAtBottom = isScrolledToBottom();
        const showScrollButton = !isAtBottom && scrollTop > 100;
        
        // Handle scroll button (less sensitive to rapid changes)
        if (showScrollButton !== lastScrollButtonState) {
            if (showScrollButton) {
            scrollBottomBtn.classList.add('visible');
        } else {
            scrollBottomBtn.classList.remove('visible');
            }
            lastScrollButtonState = showScrollButton;
        }
        
        // Handle suggestion bar with stricter tolerance and debouncing
        clearTimeout(suggestionBarTimeout);
        suggestionBarTimeout = setTimeout(() => {
            // Use stricter bottom detection for suggestion bar
            const strictIsAtBottom = isStrictlyAtBottom();
            
            if (strictIsAtBottom !== lastSuggestionBarState) {
                if (strictIsAtBottom) {
            suggestedQuestions.style.display = 'flex';
        } else {
            suggestedQuestions.style.display = 'none';
        }
                lastSuggestionBarState = strictIsAtBottom;
            }
        }, 100); // Longer debounce specifically for suggestion bar
        
        // Debounce scroll state for better performance
        scrollTimeout = setTimeout(() => {
            isScrolling = false;
        }, 150);
        
        isScrolling = true;
    }, { passive: true }); // Use passive listener for better performance
}

// Stricter bottom detection for suggestion bar (prevents flicker)
function isStrictlyAtBottom() {
    const tolerance = 5; // Very strict tolerance for suggestion bar
    const scrollTop = chatContainer.scrollTop;
    const clientHeight = chatContainer.clientHeight;
    const scrollHeight = chatContainer.scrollHeight;
    
    return scrollHeight - scrollTop - clientHeight <= tolerance;
}

// Load chapters from API
window.loadChapters = async function loadChapters() {
    try {
        const { url, options } = addUserUIDToRequest('/api/chapters');
        const response = await fetch(url, options);
        const data = await response.json();
        
        if (data.chapters) {
            renderChapters(data.chapters);
            if (data.active_chapter) {
                activeChapter = data.active_chapter;
                highlightActiveChapter();
            }
        }
    } catch (error) {
        console.error('Error loading chapters:', error);
        showError('Failed to load chapters');
    }
}

// Render chapters in sidebar
function renderChapters(chapters) {
    const chaptersList = document.getElementById('chaptersList');
    if (!chaptersList) return;
    
    chaptersList.innerHTML = '';
    chapters.forEach(chapter => {
        const chapterItem = document.createElement('div');
        chapterItem.className = 'chapter-item';
        chapterItem.textContent = chapter;
        chapterItem.onclick = () => selectChapter(chapter);
        chaptersList.appendChild(chapterItem);
    });
}

// Select a chapter
async function selectChapter(chapterName) {
    try {
        const { url, options } = addUserUIDToRequest(`/api/chapters/${encodeURIComponent(chapterName)}`, {
            method: 'POST'
        });
        const response = await fetch(url, options);
        
        const data = await response.json();
        
        if (data.success) {
            activeChapter = chapterName;
            highlightActiveChapter();
            
            // Add a system message to chat
            addMessage('system', `Switched to chapter: ${chapterName}`, 'Just now');
            
            // Update input placeholder
            messageInput.placeholder = `Ask about ${chapterName}...`;
            
            // Update suggested questions for the selected chapter
            updateSuggestionsForChapter(chapterName);
        }
    } catch (error) {
        console.error('Error selecting chapter:', error);
        showError('Failed to select chapter');
    }
}

// Highlight active chapter
function highlightActiveChapter() {
    const chapterItems = document.querySelectorAll('.chapter-item');
    chapterItems.forEach(item => {
        item.classList.remove('active');
        if (item.textContent === activeChapter) {
            item.classList.add('active');
        }
    });
}

// Update suggested questions based on selected chapter or AI response
function updateSuggestedQuestions(questions) {
    const suggestedQuestionsContainer = document.getElementById('suggestedQuestions');
    if (!suggestedQuestionsContainer) return;
    
    // Clear existing questions
    suggestedQuestionsContainer.innerHTML = '';
    
    // Limit to maximum 4 suggestions
    const limitedQuestions = questions.slice(0, 4);
    
    // Add new questions
    limitedQuestions.forEach(question => {
        const questionBtn = document.createElement('button');
        questionBtn.className = 'suggestion-chip';
        questionBtn.textContent = question;
        questionBtn.onclick = () => {
            messageInput.value = question;
            messageInput.focus();
            autoResize(messageInput);
            // Only insert text, don't auto-send
        };
        suggestedQuestionsContainer.appendChild(questionBtn);
    });
}

// Get suggestions based on current context
function getContextualSuggestions() {
    // If a chapter is selected, use chapter-specific suggestions
    if (activeChapter && chapterSuggestions[activeChapter]) {
        return chapterSuggestions[activeChapter];
    }
    
    // If we have a recent AI response, generate dynamic suggestions
    if (lastAIResponse) {
        return generateDynamicSuggestions(lastAIResponse);
    }
    
    // Default suggestions
    return defaultSuggestions;
}

// Generate dynamic suggestions based on AI response
function generateDynamicSuggestions(aiResponse) {
    const suggestions = [];
    
    // Extract key topics from AI response
    const topics = extractTopicsFromResponse(aiResponse);
    
    // Generate follow-up questions based on topics
    topics.forEach(topic => {
        const followUpQuestions = getFollowUpQuestions(topic);
        suggestions.push(...followUpQuestions);
    });
    
    // If we don't have enough suggestions, add some general ones
    if (suggestions.length < 3) {
        suggestions.push(...defaultSuggestions.slice(0, 3));
    }
    
    // Return unique suggestions (max 4)
    return [...new Set(suggestions)].slice(0, 4);
}

// Extract topics from AI response
function extractTopicsFromResponse(response) {
    const topics = [];
    const lowerResponse = response.toLowerCase();
    
    // Check for common business law topics based on syllabus
    const topicKeywords = {
        'contract': ['contract', 'agreement', 'offer', 'acceptance', 'consideration', 'breach', 'remedy'],
        'sale of goods': ['sale', 'goods', 'consumer', 'warranty', 'condition', 'caveat emptor'],
        'intellectual property': ['trademark', 'patent', 'copyright', 'trade secret', 'geographical indication'],
        'company management': ['director', 'meeting', 'quorum', 'resolution', 'corporate governance'],
        'winding up': ['winding up', 'insolvency', 'bankruptcy', 'liquidation', 'creditor']
    };
    
    Object.entries(topicKeywords).forEach(([topic, keywords]) => {
        if (keywords.some(keyword => lowerResponse.includes(keyword))) {
            topics.push(topic);
        }
    });
    
    return topics;
}

// Get follow-up questions for a topic
function getFollowUpQuestions(topic) {
    const followUpQuestions = {
        'contract': [
            "Can you explain more about contract formation?",
            "What happens if a contract is breached?",
            "How do courts interpret contracts?",
            "What are the different types of contracts?"
        ],
        'sale of goods': [
            "What are the rights of consumers?",
            "How does the Sale of Goods Act protect buyers?",
            "What are conditions vs warranties?",
            "What is caveat emptor?"
        ],
        'intellectual property': [
            "How do I protect my intellectual property?",
            "What's the difference between copyright and trademark?",
            "How long does IP protection last?",
            "What are trade secrets?"
        ],
        'company management': [
            "What are the duties of directors?",
            "How are company meetings conducted?",
            "What is corporate governance?",
            "What are the different types of resolutions?"
        ],
        'winding up': [
            "What are the different modes of winding up?",
            "What happens to company assets during winding up?",
            "How does insolvency affect creditors?",
            "What is the Insolvency and Bankruptcy Code?"
        ]
    };
    
    return followUpQuestions[topic] || [];
}

// Refresh suggestions based on current context
function refreshSuggestions() {
    const suggestions = getContextualSuggestions();
    updateSuggestedQuestions(suggestions);
}

// Update suggestions when chapter changes
function updateSuggestionsForChapter(chapterName) {
    if (chapterName && chapterSuggestions[chapterName]) {
        updateSuggestedQuestions(chapterSuggestions[chapterName]);
    } else {
        updateSuggestedQuestions(defaultSuggestions);
    }
}


// Send message to AI
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || isProcessing) return;
    
    // Check if we're in edit & regenerate mode
    const isEditRegenerate = window.editingMessageId && document.querySelector('.send-btn').classList.contains('regenerate-mode');
    
    // Ensure we have a current chat
    if (!currentChatId) {
        console.log('No current chat, creating new one...');
        await createNewChat();
        if (!currentChatId) {
            showError('Failed to create chat');
            return;
        }
    }
    
    // Set processing state (no loading overlay)
    isProcessing = true;
    
    // Clear input immediately after sending
    messageInput.value = '';
    messageInput.style.height = 'auto';
    
    // Store attached files before clearing them
    const filesToSend = [...attachedFiles];
    
    // Clear attached files immediately for UI responsiveness
    attachedFiles = [];
    renderFileAttachments();
    
    try {
        let response, data;
        
        if (isEditRegenerate) {
            // Handle edit & regenerate flow
            console.log('Processing edit & regenerate for message:', window.editingMessageId);
            
            // Remove the old assistant message immediately (optimistic update)
            const messages = document.querySelectorAll('.message');
            let userMessageFound = false;
            for (let i = 0; i < messages.length; i++) {
                const msg = messages[i];
                if (msg.getAttribute('data-message-id') === window.editingMessageId) {
                    userMessageFound = true;
                    // Remove the next message (assistant response) if it exists
                    if (i + 1 < messages.length && messages[i + 1].classList.contains('ai-message')) {
                        messages[i + 1].remove();
                    }
                    break;
                }
            }
            
            // Update the user message content in the UI
            const userMessage = document.querySelector(`[data-message-id="${window.editingMessageId}"]`);
            if (userMessage) {
                const messageContent = userMessage.querySelector('.message-content');
                if (messageContent) {
                    messageContent.textContent = message;
                }
            }
            
            // Call edit-regenerate endpoint
            const requestBody = {
                userMessageId: window.editingMessageId,
                newMessage: message,
                chatId: currentChatId
            };
            
            const { url, options } = addUserUIDToRequest('/api/chat/edit-regenerate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
                body: JSON.stringify(requestBody)
            });
            response = await fetch(url, options);
            
            data = await response.json();
            
            // Clear edit mode
            window.editingMessageId = null;
            const sendButton = document.querySelector('.send-btn');
            if (sendButton) {
                sendButton.innerHTML = '<i class="fas fa-paper-plane"></i>';
                sendButton.classList.remove('regenerate-mode');
            }
            
        } else {
            // Regular message flow
            // Add user message to chat (will be updated with proper ID from server)
            const tempUserMessageId = 'temp_user_' + Date.now();
            addMessage('user', message, formatTimestamp(new Date().toISOString()), tempUserMessageId);
            
            // Add attached files to the message if any
            if (attachedFiles.length > 0) {
                attachedFiles.forEach(file => {
                    addFileMessage(file);
                });
            }
            
            // Add thinking animation AFTER user message and attachments
            addLoadingMessage();
            
            // Prepare request body with attached files
            const requestBody = {
                message: message,
                chapter: activeChapter,
                chatId: currentChatId
            };
            
            // Add attached files information with enhanced metadata
            console.log('Attached files before sending:', filesToSend);
            if (filesToSend.length > 0) {
                requestBody.attachedFiles = filesToSend.map(file => {
                    // Find matching uploaded file for additional metadata
                    const uploadedFile = uploadedFiles.find(uf => uf.name === file.name);
                    console.log('Mapping file:', file.name, 'uploadedFile:', uploadedFile);
                    return {
                    name: file.name,
                        type: file.type,
                        id: file.id,
                        uploadId: uploadedFile ? uploadedFile.id : null,
                        size: uploadedFile ? uploadedFile.size : null
                    };
                });
                console.log('Final attachedFiles in request:', requestBody.attachedFiles);
            } else {
                console.log('No attached files to send');
            }
            
            const { url, options } = addUserUIDToRequest('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            response = await fetch(url, options);
            
            data = await response.json();
        
        if (data.reply) {
            // Update user message with proper ID from server
            if (data.userMessageId) {
                const userMessage = document.querySelector(`[data-message-id="${tempUserMessageId}"]`);
                if (userMessage) {
                    userMessage.setAttribute('data-message-id', data.userMessageId);
                    userMessage.id = data.userMessageId;
                    messageIdMap.delete(tempUserMessageId);
                    messageIdMap.set(data.userMessageId, true);
                }
            }
            
            
            // Save Q&A pair to structured history
            await saveQAEntry(message, data.reply, activeChapter);
            }
        }
        
        // Remove loading message
        removeLoadingMessage();
        
        console.log('AI Response data:', data);
        if (data.reply) {
            // Add AI response to chat with proper ID from server
            const aiMessageId = data.aiMessageId || 'ai_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            addMessage('ai', data.reply, formatTimestamp(data.timestamp), aiMessageId);
            
            // Add structured file content if available (after AI message is added)
            if (data.structuredFileContent && data.structuredFileContent.length > 0) {
                addFileContentToMessage(aiMessageId, data.structuredFileContent);
            }
            
            // Store last AI response for dynamic suggestions
            lastAIResponse = data.reply;
            
            // Refresh suggestions based on AI response
            refreshSuggestions();
            
            // Scroll to bottom
            scrollToBottom();
            
            // Attached files already cleared immediately after sending
            
        } else {
            showError(data.error || 'Failed to get response');
        }
        
    } catch (error) {
        console.error('Error sending message:', error);
        showError('Failed to send message');
    } finally {
        
        // Clear edit mode if it was set
        if (window.editingMessageId) {
            // Remove the hidden assistant message completely
            if (window.hiddenAssistantMessage) {
                window.hiddenAssistantMessage.remove();
                window.hiddenAssistantMessage = null;
            }
            
            window.editingMessageId = null;
            const sendButton = document.querySelector('.send-btn');
            if (sendButton) {
                sendButton.innerHTML = '<i class="fas fa-paper-plane"></i>';
                sendButton.classList.remove('regenerate-mode');
            }
        }
        
        // Reset processing state
        isProcessing = false;
        removeLoadingMessage();
    }
}

// Save Q&A pair to structured chat history
async function saveQAEntry(userMessage, aiReply, chapter) {
    try {
        const entry = {
            id: 'entry_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            time: new Date().toISOString(),
            chapter: chapter || 'General',
            user: userMessage,
            aiTutor: aiReply
        };
        
        // Save to backend
        const { url, options } = addUserUIDToRequest('/api/history/entries', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(entry)
        });
        const response = await fetch(url, options);
        
        const data = await response.json();
        
        if (data.success) {
            // Add to frontend state
            chatHistoryEntries.unshift(entry);
            
            // Refresh history panel if open
            if (isHistoryPanelOpen) {
                renderChatHistory(chatHistoryEntries);
            }
            
            console.log('Q&A entry saved successfully:', entry.id);
        } else {
            console.error('Failed to save Q&A entry:', data.error);
        }
    } catch (error) {
        console.error('Error saving Q&A entry:', error);
    }
}

// Add loading message with animation
function addLoadingMessage() {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message ai-message loading-message';
    loadingDiv.setAttribute('data-message-id', 'loading');
    
    // Create avatar
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    avatarDiv.innerHTML = '<i class="fas fa-robot"></i>';
    avatarDiv.title = 'AI Tutor';
    loadingDiv.appendChild(avatarDiv);
    
    // Create content container
    const contentContainer = document.createElement('div');
    contentContainer.className = 'message-content-container';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content loading-content';
    contentDiv.innerHTML = '<strong><em>Thinking</em></strong><span class="loading-dots">...</span>';
    
    contentContainer.appendChild(contentDiv);
    loadingDiv.appendChild(contentContainer);
    
    chatContainer.appendChild(loadingDiv);
    scrollToBottom();
}

// Remove loading message
function removeLoadingMessage() {
    const loadingMessage = document.querySelector('.loading-message');
    if (loadingMessage) {
        loadingMessage.remove();
    }
}

// Add message to chat container with proper ID management
function addMessage(type, content, timestamp = null, messageId = null) {
    // Check if message already exists to prevent duplicates
    if (messageId && messageIdMap.has(messageId)) {
        console.log(`Message ${messageId} already exists, skipping duplicate`);
        return;
    }
    
    const messageDiv = document.createElement('div');
    
    // Use provided messageId or generate a new one with better uniqueness
    const finalMessageId = messageId || 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '_' + Math.random().toString(36).substr(2, 9);
    
    messageDiv.className = `message ${type}-message`;
    messageDiv.setAttribute('data-message-id', finalMessageId);
    messageDiv.id = finalMessageId; // Add ID attribute for better DOM selection
    
    // Track this message ID to prevent duplicates
    messageIdMap.set(finalMessageId, true);
    
    // Create avatar
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    
    if (type === 'ai') {
        avatarDiv.innerHTML = '<i class="fas fa-robot"></i>';
        avatarDiv.title = 'AI Tutor';
    } else if (type === 'user') {
        avatarDiv.innerHTML = '<i class="fas fa-user"></i>';
        avatarDiv.title = 'You';
    } else {
        avatarDiv.innerHTML = '<i class="fas fa-info-circle"></i>';
        avatarDiv.title = 'System';
    }
    
    messageDiv.appendChild(avatarDiv);
    
    // Create message content container
    const messageContentContainer = document.createElement('div');
    messageContentContainer.className = 'message-content-container';
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    // Handle different content types
    if (type === 'system') {
        messageContent.innerHTML = `<em>${content}</em>`;
    } else {
        messageContent.textContent = content;
    }
    
    messageContentContainer.appendChild(messageContent);
    
    // Add 3-dot menu for ALL non-system messages (user and AI)
    if (type !== 'system') {
        const messageMenu = document.createElement('div');
        messageMenu.className = 'message-menu';
        messageMenu.innerHTML = '<i class="fas fa-ellipsis-v"></i>';
        messageMenu.title = 'Message options';
        messageMenu.onclick = (e) => toggleMessageMenu(finalMessageId, e);
        
        messageContentContainer.appendChild(messageMenu);
    }
    
    messageDiv.appendChild(messageContentContainer);
    
    if (timestamp) {
        const timestampDiv = document.createElement('div');
        timestampDiv.className = 'message-timestamp';
        timestampDiv.textContent = timestamp;
        messageDiv.appendChild(timestampDiv);
    }
    
    chatContainer.appendChild(messageDiv);
    
    // Update bookmark highlights for this message after it's added to DOM
    setTimeout(() => {
        updateBookmarkHighlightForMessage(finalMessageId);
    }, 10);
    
    scrollToBottom();
}

// Add file message to chat
function addFileMessage(file) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user-message';
    messageDiv.setAttribute('data-message-id', 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
    
    // Create avatar
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    avatarDiv.innerHTML = '<i class="fas fa-user"></i>';
    avatarDiv.title = 'You';
    
    messageDiv.appendChild(avatarDiv);
    
    // Create message content container
    const messageContentContainer = document.createElement('div');
    messageContentContainer.className = 'message-content-container';
    
    // Create file message content
    const fileMessage = document.createElement('div');
    fileMessage.className = 'file-message';
    
    const fileIcon = getFileIcon(file.type || file.name);
    
    fileMessage.innerHTML = `
        <i class="fas ${fileIcon} file-icon"></i>
        <span class="file-name">${file.name}</span>
    `;
    
    messageContentContainer.appendChild(fileMessage);
    messageDiv.appendChild(messageContentContainer);
    
    chatContainer.appendChild(messageDiv);
    scrollToBottom();
}

// Add file bubble to a specific message by ID
function addFileBubbleToMessage(messageId, fileData) {
    const message = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!message) return;
    
    const messageContentContainer = message.querySelector('.message-content-container');
    if (!messageContentContainer) return;
    
    // Create compact file bubble (like in prompt bar)
    const fileBubble = document.createElement('div');
    fileBubble.className = 'file-attachment-bubble';
    fileBubble.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: #e3f2fd;
        border: 1px solid #2196f3;
        border-radius: 16px;
        padding: 4px 12px;
        font-size: 12px;
        color: #1976d2;
        max-width: 200px;
        margin-top: 8px;
        cursor: pointer;
    `;
    
    const fileIcon = getFileIcon(fileData.type || fileData.name);
    
    fileBubble.innerHTML = `
        <i class="fas ${fileIcon} file-icon"></i>
        <span class="file-name" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${fileData.name}</span>
    `;
    
    // Add click handler for file download/preview
    if (fileData.downloadUrl) {
        fileBubble.onclick = () => {
            window.open(fileData.downloadUrl, '_blank');
        };
        fileBubble.title = `Click to open ${fileData.name}`;
    }
    
    messageContentContainer.appendChild(fileBubble);
}

// Make file draggable on double-click
function makeFileDraggable(fileId, element) {
    element.draggable = true;
    element.style.opacity = '0.8';
    element.style.cursor = 'grab';
    
    // Add drag event listeners
    element.ondragstart = function(e) {
        e.dataTransfer.setData('text/plain', fileId);
        e.dataTransfer.effectAllowed = 'copy';
        element.style.opacity = '0.5';
        element.style.cursor = 'grabbing';
        
        // Add visual feedback
        const promptBar = document.querySelector('.prompt-bar');
        if (promptBar) {
            promptBar.classList.add('drag-target');
        }
    };
    
    element.ondragend = function(e) {
        element.style.opacity = '1';
        element.style.cursor = 'pointer';
        element.draggable = false;
        
        // Remove visual feedback
        const promptBar = document.querySelector('.prompt-bar');
        if (promptBar) {
            promptBar.classList.remove('drag-target');
        }
    };
    
    console.log(`File ${fileId} is now draggable - drag it to the prompt bar to attach`);
}

// Setup prompt bar as drop zone
function setupPromptBarDropZone() {
    const promptBar = document.querySelector('.prompt-bar');
    if (!promptBar) return;
    
    promptBar.ondragover = function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        promptBar.classList.add('drag-over');
    };
    
    promptBar.ondragleave = function(e) {
        // Only remove highlight if we're actually leaving the prompt bar
        if (!promptBar.contains(e.relatedTarget)) {
            promptBar.classList.remove('drag-over');
        }
    };
    
    promptBar.ondrop = function(e) {
        e.preventDefault();
        promptBar.classList.remove('drag-over', 'drag-target');
        
        const fileId = e.dataTransfer.getData('text/plain');
        if (fileId) {
            // Use the existing attach logic
            attachFileToPrompt(fileId);
            console.log(`File ${fileId} dropped and attached to prompt bar`);
        }
    };
}

// Add file explanation message (recreate from database)
function addFileExplanationMessage(fileName, parentMessageId, fileIndex) {
    const explanationDiv = document.createElement('div');
    explanationDiv.className = 'message ai-message file-explanation';
    explanationDiv.setAttribute('data-message-id', `${parentMessageId}_file_explanation_${fileIndex}`);
    explanationDiv.setAttribute('data-parent-message', parentMessageId);
    
    // Create avatar
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    avatarDiv.innerHTML = '<i class="fas fa-robot"></i>';
    avatarDiv.title = 'AI Tutor';
    explanationDiv.appendChild(avatarDiv);
    
    // Create content container
    const contentContainer = document.createElement('div');
    contentContainer.className = 'message-content-container';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = `
        <div class="file-explanation-header">
            <i class="fas fa-file-alt"></i>
            <strong>File Content: ${fileName}</strong>
        </div>
        <p>Here's the content from the uploaded file:</p>
    `;
    
    contentContainer.appendChild(contentDiv);
    explanationDiv.appendChild(contentContainer);
    
    chatContainer.appendChild(explanationDiv);
    messageIdMap.set(`${parentMessageId}_file_explanation_${fileIndex}`, true);
}

// Add file content message (recreate from database)
function addFileContentMessage(fileName, fileContent, fileType, parentMessageId, fileIndex) {
    const contentCellDiv = document.createElement('div');
    contentCellDiv.className = 'message ai-message file-content-cell';
    contentCellDiv.setAttribute('data-message-id', `${parentMessageId}_file_content_${fileIndex}`);
    contentCellDiv.setAttribute('data-parent-message', parentMessageId);
    
    // Create avatar for content cell
    const contentAvatarDiv = document.createElement('div');
    contentAvatarDiv.className = 'message-avatar';
    contentAvatarDiv.innerHTML = '<i class="fas fa-robot"></i>';
    contentAvatarDiv.title = 'AI Tutor';
    contentCellDiv.appendChild(contentAvatarDiv);
    
    // Create content container for content cell
    const contentCellContainer = document.createElement('div');
    contentCellContainer.className = 'message-content-container';
    
    const contentCellContent = document.createElement('div');
    contentCellContent.className = 'message-content file-content-display';
    
    // Format the content based on file type
    let formattedContent = fileContent;
    if (fileType && fileType.includes('pdf')) {
        formattedContent = fileContent.replace(/\n/g, '<br>');
    }
    
    contentCellContent.innerHTML = `
        <div class="file-content-wrapper">
            <div class="file-content-text">${formattedContent}</div>
        </div>
    `;
    
    contentCellContainer.appendChild(contentCellContent);
    contentCellDiv.appendChild(contentCellContainer);
    
    chatContainer.appendChild(contentCellDiv);
    messageIdMap.set(`${parentMessageId}_file_content_${fileIndex}`, true);
}

// Add file content directly to the main message
function addFileContentToMessage(messageId, fileContents) {
    // Try to find the message element, with a small delay if needed
    let messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    
    if (!messageElement) {
        // If not found immediately, try again after a short delay
        setTimeout(() => {
            messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
            if (messageElement) {
                addFileContentToMessageImmediate(messageElement, fileContents);
            } else {
                console.error(`Message element not found for ID: ${messageId} after delay`);
            }
        }, 100);
        return;
    }
    
    addFileContentToMessageImmediate(messageElement, fileContents);
}

function addFileContentToMessageImmediate(messageElement, fileContents) {
    const messageContent = messageElement.querySelector('.message-content');
    if (!messageContent) {
        console.error(`Message content not found for message element`);
        return;
    }
    
    fileContents.forEach((fileData, index) => {
        // Create file content display
        const fileContentDiv = document.createElement('div');
        fileContentDiv.className = 'file-content-display';
        fileContentDiv.innerHTML = `
            <div class="file-content-header">
                <i class="fas fa-file-alt"></i>
                <strong>File Content: ${fileData.filename}</strong>
            </div>
            <p>Here's the content from the uploaded file:</p>
            <div class="file-content-wrapper">
                <div class="file-content-text">${fileData.content.replace(/\n/g, '<br>')}</div>
            </div>
        `;
        
        // Insert at the beginning of the message content
        messageContent.insertBefore(fileContentDiv, messageContent.firstChild);
    });
}

// Add structured file content in ChatGPT-like format
function addStructuredFileContent(fileContents, parentMessageId) {
    fileContents.forEach((fileData, index) => {
        // Create explanation cell
        const explanationDiv = document.createElement('div');
        explanationDiv.className = 'message ai-message file-explanation';
        explanationDiv.setAttribute('data-message-id', `${parentMessageId}_file_explanation_${index}`);
        explanationDiv.setAttribute('data-parent-message', parentMessageId);
        
        // Create avatar
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'message-avatar';
        avatarDiv.innerHTML = '<i class="fas fa-robot"></i>';
        avatarDiv.title = 'AI Tutor';
        explanationDiv.appendChild(avatarDiv);
        
        // Create content container
        const contentContainer = document.createElement('div');
        contentContainer.className = 'message-content-container';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = `
            <div class="file-explanation-header">
                <i class="fas fa-file-alt"></i>
                <strong>File Content: ${fileData.filename}</strong>
            </div>
            <p>Here's the content from the uploaded file:</p>
        `;
        
        contentContainer.appendChild(contentDiv);
        explanationDiv.appendChild(contentContainer);
        
        // Create content cell
        const contentCellDiv = document.createElement('div');
        contentCellDiv.className = 'message ai-message file-content-cell';
        contentCellDiv.setAttribute('data-message-id', `${parentMessageId}_file_content_${index}`);
        contentCellDiv.setAttribute('data-parent-message', parentMessageId);
        
        // Create avatar for content cell
        const contentAvatarDiv = document.createElement('div');
        contentAvatarDiv.className = 'message-avatar';
        contentAvatarDiv.innerHTML = '<i class="fas fa-robot"></i>';
        contentAvatarDiv.title = 'AI Tutor';
        contentCellDiv.appendChild(contentAvatarDiv);
        
        // Create content container for content cell
        const contentCellContainer = document.createElement('div');
        contentCellContainer.className = 'message-content-container';
        
        const contentCellContent = document.createElement('div');
        contentCellContent.className = 'message-content file-content-display';
        
        // Format the content based on file type
        let formattedContent = fileData.content;
        if (fileData.type && fileData.type.includes('pdf')) {
            // For PDFs, preserve formatting
            formattedContent = fileData.content.replace(/\n/g, '<br>');
        }
        
        contentCellContent.innerHTML = `
            <div class="file-content-wrapper">
                <div class="file-content-text">${formattedContent}</div>
            </div>
        `;
        
        contentCellContainer.appendChild(contentCellContent);
        contentCellDiv.appendChild(contentCellContainer);
        
        // Find the parent message and insert file content after it
        const parentMessage = document.querySelector(`[data-message-id="${parentMessageId}"]`);
        if (parentMessage) {
            // Insert file content immediately after the parent message
            parentMessage.parentNode.insertBefore(explanationDiv, parentMessage.nextSibling);
            parentMessage.parentNode.insertBefore(contentCellDiv, explanationDiv.nextSibling);
        } else {
            // Fallback: add to end of chat container
            chatContainer.appendChild(explanationDiv);
            chatContainer.appendChild(contentCellDiv);
        }
        
        // Track message IDs
        messageIdMap.set(`${parentMessageId}_file_explanation_${index}`, true);
        messageIdMap.set(`${parentMessageId}_file_content_${index}`, true);
    });
    
    scrollToBottom();
}

// Handle file upload (including audio files)
function triggerFileUpload() {
    // Create a temporary input that accepts both files and audio
    const tempInput = document.createElement('input');
    tempInput.type = 'file';
    tempInput.accept = '.pdf,.png,.jpg,.jpeg,.gif,.bmp,.tiff,.mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm';
    tempInput.style.display = 'none';
    
    tempInput.onchange = function(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const fileExtension = file.name.split('.').pop().toLowerCase();
        const audioExtensions = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'];
        
        if (audioExtensions.includes(fileExtension)) {
            // Handle audio file upload
            handleAudioUpload(event);
        } else {
            // Handle regular file upload
            handleFileUpload(event);
        }
        
        // Clean up
        document.body.removeChild(tempInput);
    };
    
    document.body.appendChild(tempInput);
    tempInput.click();
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Show loading
    setLoading(true);
    
    const formData = new FormData();
    formData.append('file', file);
    if (activeChapter) {
        formData.append('chapter', activeChapter);
    }
    
    try {
        const { url, options } = addUserUIDToRequest('/api/upload', {
            method: 'POST',
            body: formData
        });
        const response = await fetch(url, options);
        
        const data = await response.json();
        
        if (data.success) {
            // Add file to uploaded files list
            addUploadedFile(file);
            
            // Automatically attach file to prompt bar using the actual filename
            attachedFiles.push({
                id: 'file_' + Date.now(),
                name: file.name, // Use the actual file name
                type: file.type
            });
            renderFileAttachments();
            
            showSuccess(`File "${file.name}" uploaded and attached to prompt`);
        } else {
            showError(data.error || 'Upload failed');
        }
    } catch (error) {
        console.error('Error uploading file:', error);
        showError('Upload failed. Please try again.');
    } finally {
        setLoading(false);
        fileInput.value = ''; // Reset file input
    }
}

// Handle live voice input
let recognition = null;
let isListening = false;

function startVoiceInput() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showError('Speech recognition not supported in this browser');
        return;
    }
    
    if (isListening) {
        stopVoiceInput();
        return;
    }
    
    // Initialize speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    
    recognition.continuous = true; // Keep running continuously
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    // Update mic button appearance
    const micBtn = document.querySelector('.voice-btn');
    micBtn.innerHTML = '<i class="fas fa-stop"></i>';
    micBtn.style.background = '#dc3545';
    micBtn.style.color = 'white';
    isListening = true;
    
    recognition.onstart = function() {
        console.log('Voice recognition started');
        showSuccess('Voice recognition active - speak now');
    };
    
    recognition.onresult = function(event) {
        let finalTranscript = '';
        
        // Only process final results to prevent hallucinations
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            }
        }
        
        // Only handle final results
        if (finalTranscript) {
            const existingText = messageInput.value;
            const trimmedTranscript = finalTranscript.trim();
            
            // Check if this exact phrase is already in the text to prevent duplication
            if (!existingText.includes(trimmedTranscript)) {
                // Add space if needed and append the final transcript
                const spaceNeeded = existingText && !existingText.endsWith(' ') ? ' ' : '';
                messageInput.value = existingText + spaceNeeded + trimmedTranscript;
                autoResize(messageInput);
            }
        }
    };
    
    recognition.onend = function() {
        // Only stop if user manually stopped it
        if (isListening) {
            // Restart recognition automatically
            setTimeout(() => {
                if (isListening) {
                    recognition.start();
                }
            }, 100);
        }
    };
    
    recognition.onerror = function(event) {
        console.error('Speech recognition error:', event.error);
        if (event.error !== 'no-speech') {
            showError('Voice recognition error: ' + event.error);
        }
        // Restart recognition on error (except for no-speech)
        if (isListening && event.error !== 'no-speech') {
            setTimeout(() => {
                if (isListening) {
                    recognition.start();
                }
            }, 1000);
        }
    };
    
    recognition.start();
}

function stopVoiceInput() {
    if (recognition) {
        recognition.stop();
    }
    
    // Reset mic button appearance
    const micBtn = document.querySelector('.voice-btn');
    micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
    micBtn.style.background = '#f8f9fa';
    micBtn.style.color = '#6c757d';
    isListening = false;
    
    // Focus on input for editing
    messageInput.focus();
}

// Handle file upload (moved from mic button to + button)
async function handleAudioUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Show loading
    setLoading(true);
    
    const formData = new FormData();
    formData.append('audio', file);
    
    try {
        const { url, options } = addUserUIDToRequest('/api/voice', {
            method: 'POST',
            body: formData
        });
        const response = await fetch(url, options);
        
        const data = await response.json();
        
        if (data.success) {
            // Insert transcribed text into input
            messageInput.value = data.transcription;
            autoResize(messageInput);
            messageInput.focus();
        } else {
            showError(data.error || 'Voice transcription failed');
        }
    } catch (error) {
        console.error('Error transcribing audio:', error);
        showError('Voice transcription failed. Please try again.');
    } finally {
        setLoading(false);
        audioInput.value = ''; // Reset audio input
    }
}

// Chat History Storage (Frontend State)
let chatHistoryEntries = [];

// History panel functions
function toggleHistoryPanel() {
    isHistoryPanelOpen = !isHistoryPanelOpen;
    
    if (isHistoryPanelOpen) {
        historyPanel.classList.add('open');
        loadChatHistory();
    } else {
        historyPanel.classList.remove('open');
    }
}

// Refresh history panel when chats are updated
function refreshHistoryPanel() {
    if (isHistoryPanelOpen) {
        loadChatHistory();
    }
}

async function loadChatHistory() {
    try {
        // Load structured chat history entries
        const { url, options } = addUserUIDToRequest('/api/history/entries');
        const response = await fetch(url, options);
        const data = await response.json();
        
        if (data.entries) {
            chatHistoryEntries = data.entries;
            renderChatHistory(chatHistoryEntries);
        } else {
            chatHistoryEntries = [];
            renderChatHistory([]);
        }
    } catch (error) {
        console.error('Error loading chat history:', error);
        showError('Failed to load chat history');
        chatHistoryEntries = [];
        renderChatHistory([]);
    }
}

function renderChatHistory(entries) {
    historyContent.innerHTML = '';
    
    if (entries.length === 0) {
        historyContent.innerHTML = '<p style="text-align: center; color: #6c757d; padding: 20px;">No chat history yet</p>';
        return;
    }
    
    // Group entries by timestamp and chapter
    const groupedEntries = groupEntriesByTimestampAndChapter(entries);
    
    // Show most recent first
    Object.keys(groupedEntries).sort().reverse().forEach(timestamp => {
        const chapterGroups = groupedEntries[timestamp];
        
        Object.keys(chapterGroups).forEach(chapter => {
            const entry = chapterGroups[chapter];
            
            const historyItem = document.createElement('div');
            historyItem.className = 'history-entry';
            historyItem.onclick = () => viewHistoryEntry(entry);
            
            const formattedTime = formatTimestamp(entry.time);
            
            historyItem.innerHTML = `
                <div class="history-entry-header">
                    <div class="history-time">Time: ${formattedTime}</div>
                    <div class="history-chapter">Chapter: ${entry.chapter}</div>
                </div>
                <div class="history-content">
                    <div class="history-user"><strong>User:</strong> ${truncateText(entry.user, 100)}</div>
                    <div class="history-ai"><strong>AI Tutor:</strong> ${truncateText(entry.aiTutor, 150)}</div>
                </div>
            `;
            
            historyContent.appendChild(historyItem);
        });
    });
}

function groupEntriesByTimestampAndChapter(entries) {
    const grouped = {};
    
    entries.forEach(entry => {
        const timestamp = entry.time;
        const chapter = entry.chapter;
        
        if (!grouped[timestamp]) {
            grouped[timestamp] = {};
        }
        
        if (!grouped[timestamp][chapter]) {
            grouped[timestamp][chapter] = entry;
        }
    });
    
    return grouped;
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function viewHistoryEntry(entry) {
    // Show the full entry in a modal or expand the history item
    const modal = document.createElement('div');
    modal.className = 'history-modal';
    modal.innerHTML = `
        <div class="history-modal-content">
            <div class="history-modal-header">
                <h3>Chat History Entry</h3>
                <button class="close-modal" onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
            </div>
            <div class="history-modal-body">
                <div class="history-detail">
                    <strong>Time:</strong> ${formatTimestamp(entry.time)}
                </div>
                <div class="history-detail">
                    <strong>Chapter:</strong> ${entry.chapter}
                </div>
                <div class="history-detail">
                    <strong>User:</strong> ${entry.user}
                </div>
                <div class="history-detail">
                    <strong>AI Tutor:</strong> ${entry.aiTutor}
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

function loadHistoryItem(chat) {
    // Switch to the selected chat
    switchToChat(chat.id);
    
    // Close history panel
    toggleHistoryPanel();
}

async function exportHistory() {
    try {
        // Get structured chat history entries for export
        const { url, options } = addUserUIDToRequest('/api/history/entries');
        const response = await fetch(url, options);
        const data = await response.json();
        
        if (!data.entries || data.entries.length === 0) {
            showError('No chat history to export');
            return;
        }
        
        // Generate PDF with structured entries and bookmarks
        generatePDF({ 
            entries: data.entries,
            bookmarks: bookmarks.filter(bookmark => {
                // Only include bookmarks from existing chats
                if (bookmark.chatId && bookmark.chatId !== 'unknown') {
                    return chats.some(chat => chat.id === bookmark.chatId);
                }
                return true;
            })
        });
        
    } catch (error) {
        console.error('Error exporting history:', error);
        showError('Failed to export chat history');
    }
}

function generatePDF(data) {
    try {
        // Initialize jsPDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Set up PDF styling
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 20;
        const contentWidth = pageWidth - (2 * margin);
        let yPosition = 30;
        
        // Add title
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('Business Law AI Tutor - Chat History', pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 15;
        
        // Add export info
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Export Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, margin, yPosition);
        yPosition += 10;
        doc.text(`Total Entries: ${data.entries.length}`, margin, yPosition);
        yPosition += 15;
        
        // Add separator line
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 10;
        
        // Add structured entries
        data.entries.forEach((entry, index) => {
            // Check if we need a new page
            if (yPosition > 250) {
                doc.addPage();
                yPosition = 30;
            }
            
            // Entry number
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(`Entry ${index + 1}:`, margin, yPosition);
            yPosition += 8;
            
            // Entry details in structured format
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text(`Time: ${formatTimestamp(entry.time)}`, margin, yPosition);
            yPosition += 6;
            doc.text(`Chapter: ${entry.chapter}`, margin, yPosition);
            yPosition += 6;
            doc.text(`User: ${entry.user}`, margin, yPosition);
            yPosition += 6;
            doc.text(`AI Tutor: ${entry.aiTutor}`, margin, yPosition);
            yPosition += 6;
            
            // Add bookmarks for this entry if any exist
            if (data.bookmarks && data.bookmarks.length > 0) {
                const entryBookmarks = data.bookmarks.filter(bookmark => {
                    // Match bookmarks to entries based on content similarity
                    return entry.user.includes(bookmark.content.substring(0, 50)) || 
                           entry.aiTutor.includes(bookmark.content.substring(0, 50));
                });
                
                if (entryBookmarks.length > 0) {
                    doc.setTextColor(255, 140, 0); // Orange color for bookmarks
                    doc.text(`★ Bookmarked: ${entryBookmarks.map(b => b.content.substring(0, 60) + '...').join(', ')}`, margin, yPosition);
                    yPosition += 6;
                }
            }
            
            yPosition += 4;
            
            // Add separator between entries
            if (index < data.entries.length - 1) {
                doc.setDrawColor(200, 200, 200);
                doc.line(margin, yPosition, pageWidth - margin, yPosition);
                yPosition += 10;
            }
        });
        
        // Generate filename
        const date = new Date().toISOString().split('T')[0];
        const filename = `business-law-chat-history-${date}.pdf`;
        
        // Save the PDF
        doc.save(filename);
        
        showSuccess('Chat history exported as PDF successfully');
        
    } catch (error) {
        console.error('Error generating PDF:', error);
        showError('Failed to generate PDF. Please try again.');
    }
}

async function clearHistory() {
    console.log('clearHistory() called - this should only happen when user clicks Clear History button');
    console.trace('Stack trace for clearHistory call');
    
    if (!confirm('Are you sure you want to clear all chat history? This action cannot be undone and will permanently delete the structured history entries from the database.')) {
        console.log('User cancelled clear history');
        return;
    }
    
    console.log('User confirmed clear history - proceeding with deletion');
    
    try {
        // Clear structured chat history entries only
        const { url, options } = addUserUIDToRequest('/api/history/entries/clear', {
            method: 'POST'
        });
        const response = await fetch(url, options);
        
        const data = await response.json();
        
        if (data.success) {
            // Clear only the structured history entries from frontend state
            chatHistoryEntries = [];
            
            // Refresh history panel if open (show empty history)
            if (isHistoryPanelOpen) {
                renderChatHistory([]);
            }
            
            console.log('Clear history successful:', data);
            showSuccess('Chat history cleared successfully');
        } else {
            showError(data.error || 'Failed to clear chat history');
        }
        
    } catch (error) {
        console.error('Error clearing history:', error);
        showError('Failed to clear chat history');
    }
}

// Utility functions
function insertSuggestion(text) {
    messageInput.value = text;
    autoResize(messageInput);
    messageInput.focus();
}

function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

function scrollToBottom() {
    // Use smooth scrolling with better performance
    const targetScrollTop = chatContainer.scrollHeight - chatContainer.clientHeight;
    
    // Use smooth scrolling if the distance is small, otherwise instant scroll
    const currentScrollTop = chatContainer.scrollTop;
    const scrollDistance = Math.abs(targetScrollTop - currentScrollTop);
    
    if (scrollDistance < 500) {
        // For small distances, use smooth scrolling
        chatContainer.scrollTo({
            top: targetScrollTop,
            behavior: 'smooth'
        });
    } else {
        // For large distances, use instant scroll for better performance
        requestAnimationFrame(() => {
            chatContainer.scrollTop = targetScrollTop;
        });
    }
}

function isScrolledToBottom() {
    const threshold = 20; // Increased tolerance to prevent edge-case glitching
    return chatContainer.scrollTop + chatContainer.clientHeight >= chatContainer.scrollHeight - threshold;
}

function handleChatScroll() {
    // This is handled in setupScrollBehavior
}

function handleWindowResize() {
    // Handle responsive behavior
    if (window.innerWidth <= 480) {
        // Mobile view adjustments
    }
}

function handleBackClick() {
    // Placeholder for back functionality
    console.log('Back button clicked');
}

function setLoading(loading) {
    if (loading) {
        loadingOverlay.classList.add('visible');
        sendBtn.disabled = true;
    } else {
        loadingOverlay.classList.remove('visible');
        sendBtn.disabled = false;
    }
}

function showError(message) {
    // Popup notifications disabled - functionality remains intact
    console.log('Error:', message);
}

function showSuccess(message) {
    // Popup notifications disabled - functionality remains intact
    console.log('Success:', message);
}

function formatTimestamp(timestamp) {
    if (!timestamp) return 'Just now';
    
    const date = new Date(timestamp);
    
    // Format as HH:MM (24-hour format)
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${hours}:${minutes}`;
}

// Add CSS animation for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    /* Enhanced highlight animation for bookmarks */
    @keyframes highlight {
        0% { 
            background-color: rgba(255, 193, 7, 0.3);
            transform: scale(1);
        }
        50% {
            background-color: rgba(255, 193, 7, 0.5);
            transform: scale(1.02);
        }
        100% { 
            background-color: transparent;
            transform: scale(1);
        }
    }
`;
document.head.appendChild(style);

// ===== NEW SIDEBAR FUNCTIONALITY =====

// Dropdown functionality
function toggleDropdown(type) {
    const dropdown = document.getElementById(`${type}Dropdown`);
    const arrow = document.getElementById(`${type}Arrow`);
    const label = document.getElementById(`${type}Label`);
    const searchContainer = document.getElementById(`${type}SearchContainer`);
    const searchInput = document.getElementById(`${type}Search`);
    
    if (openDropdowns.has(type)) {
        // Close dropdown
        dropdown.classList.remove('expanded');
        arrow.classList.remove('rotated');
        openDropdowns.delete(type);
        
        // Reset label and hide search
        if (type === 'chapters') {
            label.textContent = 'Chapters';
        } else if (type === 'videos') {
            label.textContent = 'Videos';
        } else if (type === 'audio') {
            label.textContent = 'Audio Files';
        }
        searchContainer.style.display = 'none';
        searchInput.value = '';
    } else {
        // Close other dropdowns first
        openDropdowns.forEach(openType => {
            const openDropdown = document.getElementById(`${openType}Dropdown`);
            const openArrow = document.getElementById(`${openType}Arrow`);
            const openLabel = document.getElementById(`${openType}Label`);
            const openSearchContainer = document.getElementById(`${openType}SearchContainer`);
            const openSearchInput = document.getElementById(`${openType}Search`);
            
            openDropdown.classList.remove('expanded');
            openArrow.classList.remove('rotated');
            
            if (openType === 'chapters') {
                openLabel.textContent = 'Chapters';
            } else if (openType === 'videos') {
                openLabel.textContent = 'Videos';
            } else if (openType === 'audio') {
                openLabel.textContent = 'Audio Files';
            }
            openSearchContainer.style.display = 'none';
            openSearchInput.value = '';
        });
        openDropdowns.clear();
        
        // Open current dropdown
        dropdown.classList.add('expanded');
        arrow.classList.add('rotated');
        openDropdowns.add(type);
        
        // Show search bar
        searchContainer.style.display = 'block';
        searchInput.focus();
    }
}


// Setup dropdown search functionality
function setupDropdownSearch() {
    const searchInputs = ['chaptersSearch', 'videosSearch', 'audioSearch', 'bookmarksSearch'];
    
    searchInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('input', function() {
                if (inputId === 'bookmarksSearch') {
                    filterBookmarks(this.value);
                } else {
                    const type = inputId.replace('Search', '');
                    filterDropdownItems(type, this.value);
                }
            });
        }
    });
}

// Filter dropdown items based on search
function filterDropdownItems(type, searchTerm) {
    const list = document.getElementById(`${type}List`);
    
    if (type === 'chapters') {
        // Handle regular dropdown items for chapters
        const items = list.querySelectorAll('.dropdown-item');
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        const matches = text.includes(searchTerm.toLowerCase());
        item.style.display = matches ? 'block' : 'none';
    });
    } else {
        // Handle hierarchical items for videos and audio
        const units = list.querySelectorAll('.hierarchical-unit');
        const searchLower = searchTerm.toLowerCase();
        
        units.forEach(unit => {
            const unitHeader = unit.querySelector('.unit-header span');
            const unitContent = unit.querySelector('.unit-content');
            const subtopics = unitContent.querySelectorAll('.subtopic-item');
            
            let hasMatchingSubtopic = false;
            let unitMatches = unitHeader.textContent.toLowerCase().includes(searchLower);
            
            subtopics.forEach(subtopic => {
                const subtopicText = subtopic.textContent.toLowerCase();
                const subtopicMatches = subtopicText.includes(searchLower);
                
                if (subtopicMatches) {
                    hasMatchingSubtopic = true;
                    subtopic.style.display = 'block';
                } else {
                    subtopic.style.display = 'none';
                }
            });
            
            // Show unit if unit name matches or has matching subtopics
            if (unitMatches || hasMatchingSubtopic) {
                unit.style.display = 'block';
                if (hasMatchingSubtopic && !unitContent.classList.contains('expanded')) {
                    // Auto-expand units with matching subtopics
                    toggleUnit(type, unitHeader.textContent);
                }
            } else {
                unit.style.display = 'none';
            }
        });
    }
}

// Hierarchical data structure for Videos and Audio Files
const hierarchicalData = {
    videos: {
        "UNIT–I: INDIAN CONTRACT ACT": [
            "Agreement and Contract",
            "Essentials of a valid contract",
            "Types of contracts",
            "Offer and Acceptance",
            "Essentials of valid offer and acceptance",
            "Communication and revocation of offer and acceptance",
            "Consideration",
            "Definition",
            "Essentials of valid consideration",
            "Modes of Discharge of a contract",
            "Performance of Contracts",
            "Breach of Contract",
            "Remedies for Breach",
            "Significance of Information Technology Act"
        ],
        "UNIT–II: SALE OF GOODS ACT AND CONSUMER PROTECTION ACT": [
            "Contract of Sale: Essentials of Valid Sale",
            "Sale and Agreement to Sell",
            "Definition and Types of Goods",
            "Conditions and Warranties",
            "Caveat Emptor",
            "Exceptions",
            "Unpaid Seller",
            "Rights of Unpaid Seller",
            "Consumer Protection Act 1986: Definition of Consumer",
            "Person",
            "Goods",
            "Service",
            "Consumer Dispute",
            "Consumer Protection Councils",
            "Consumer Dispute Redressal Agencies",
            "Appeals"
        ],
        "UNIT–III: INTELLECTUAL PROPERTY RIGHTS": [
            "Trade Marks: Definition",
            "Registration of Trade Marks",
            "Patents: Definition",
            "Kinds of Patents",
            "Transfer of the Patent Rights",
            "Rights of the Patentee",
            "Copy Rights: Definition",
            "Rights of the Copyright Owner",
            "Terms of Copy Right",
            "Copy Rights Infringement",
            "Other Intellectual Property Rights: Trade Secrets",
            "Geographical Indications"
        ],
        "UNIT–IV: MANAGEMENT OF COMPANIES AND MEETINGS": [
            "Director: Qualification",
            "Disqualification",
            "Position",
            "Appointment",
            "Removal",
            "Duties and Liabilities",
            "Loans",
            "Remuneration",
            "Managing Director",
            "Corporate Social Responsibility",
            "Corporate Governance",
            "Meeting: Meaning",
            "Requisites",
            "Notice",
            "Proxy",
            "Agenda",
            "Quorum",
            "Resolutions",
            "Minutes",
            "Kinds",
            "Shareholder Meetings",
            "Statutory Meeting",
            "Annual General Body Meeting",
            "Extraordinary General Body Meeting",
            "Board Meetings"
        ],
        "UNIT–V: WINDING UP": [
            "Meaning",
            "Modes of Winding Up",
            "Winding Up by tribunal",
            "Voluntary Winding Up",
            "Compulsory Winding Up",
            "Consequences of Winding Up",
            "Removal of name of the company from Registrar of Companies",
            "Insolvency and Bankruptcy code – 2016"
        ]
    },
    audio: {
        "UNIT–I: INDIAN CONTRACT ACT": [
            "Agreement and Contract",
            "Essentials of a valid contract",
            "Types of contracts",
            "Offer and Acceptance",
            "Essentials of valid offer and acceptance",
            "Communication and revocation of offer and acceptance",
            "Consideration",
            "Definition",
            "Essentials of valid consideration",
            "Modes of Discharge of a contract",
            "Performance of Contracts",
            "Breach of Contract",
            "Remedies for Breach",
            "Significance of Information Technology Act"
        ],
        "UNIT–II: SALE OF GOODS ACT AND CONSUMER PROTECTION ACT": [
            "Contract of Sale: Essentials of Valid Sale",
            "Sale and Agreement to Sell",
            "Definition and Types of Goods",
            "Conditions and Warranties",
            "Caveat Emptor",
            "Exceptions",
            "Unpaid Seller",
            "Rights of Unpaid Seller",
            "Consumer Protection Act 1986: Definition of Consumer",
            "Person",
            "Goods",
            "Service",
            "Consumer Dispute",
            "Consumer Protection Councils",
            "Consumer Dispute Redressal Agencies",
            "Appeals"
        ],
        "UNIT–III: INTELLECTUAL PROPERTY RIGHTS": [
            "Trade Marks: Definition",
            "Registration of Trade Marks",
            "Patents: Definition",
            "Kinds of Patents",
            "Transfer of the Patent Rights",
            "Rights of the Patentee",
            "Copy Rights: Definition",
            "Rights of the Copyright Owner",
            "Terms of Copy Right",
            "Copy Rights Infringement",
            "Other Intellectual Property Rights: Trade Secrets",
            "Geographical Indications"
        ],
        "UNIT–IV: MANAGEMENT OF COMPANIES AND MEETINGS": [
            "Director: Qualification",
            "Disqualification",
            "Position",
            "Appointment",
            "Removal",
            "Duties and Liabilities",
            "Loans",
            "Remuneration",
            "Managing Director",
            "Corporate Social Responsibility",
            "Corporate Governance",
            "Meeting: Meaning",
            "Requisites",
            "Notice",
            "Proxy",
            "Agenda",
            "Quorum",
            "Resolutions",
            "Minutes",
            "Kinds",
            "Shareholder Meetings",
            "Statutory Meeting",
            "Annual General Body Meeting",
            "Extraordinary General Body Meeting",
            "Board Meetings"
        ],
        "UNIT–V: WINDING UP": [
            "Meaning",
            "Modes of Winding Up",
            "Winding Up by tribunal",
            "Voluntary Winding Up",
            "Compulsory Winding Up",
            "Consequences of Winding Up",
            "Removal of name of the company from Registrar of Companies",
            "Insolvency and Bankruptcy code – 2016"
        ]
    }
};

// Load videos with hierarchical structure
function loadVideos() {
    renderHierarchicalItems('videos', hierarchicalData.videos);
}

// Load audio files with hierarchical structure
function loadAudioFiles() {
    renderHierarchicalItems('audio', hierarchicalData.audio);
}

// Render hierarchical items for Videos and Audio Files
function renderHierarchicalItems(type, hierarchicalData) {
    const list = document.getElementById(`${type}List`);
    list.innerHTML = '';
    
    Object.keys(hierarchicalData).forEach(unitName => {
        const unitElement = document.createElement('div');
        unitElement.className = 'hierarchical-unit';
        
        // Create unit header
        const unitHeader = document.createElement('div');
        unitHeader.className = 'unit-header';
        unitHeader.onclick = () => toggleUnit(type, unitName);
        
        const unitLabel = document.createElement('span');
        unitLabel.textContent = unitName;
        
        const unitArrow = document.createElement('i');
        unitArrow.className = 'fas fa-chevron-down unit-arrow';
        unitArrow.id = `${type}-${unitName.replace(/[^a-zA-Z0-9]/g, '')}-arrow`;
        
        unitHeader.appendChild(unitLabel);
        unitHeader.appendChild(unitArrow);
        
        // Create unit content
        const unitContent = document.createElement('div');
        unitContent.className = 'unit-content';
        unitContent.id = `${type}-${unitName.replace(/[^a-zA-Z0-9]/g, '')}-content`;
        
        // Add subtopics
        hierarchicalData[unitName].forEach(subtopic => {
            const subtopicElement = document.createElement('div');
            subtopicElement.className = 'subtopic-item';
            subtopicElement.textContent = subtopic;
            subtopicElement.onclick = () => selectDropdownItem(type, subtopic);
            unitContent.appendChild(subtopicElement);
        });
        
        unitElement.appendChild(unitHeader);
        unitElement.appendChild(unitContent);
        list.appendChild(unitElement);
    });
}

// Toggle unit expansion
function toggleUnit(type, unitName) {
    const unitId = `${type}-${unitName.replace(/[^a-zA-Z0-9]/g, '')}`;
    const content = document.getElementById(`${unitId}-content`);
    const arrow = document.getElementById(`${unitId}-arrow`);
    
    if (!content || !arrow) return;
    
    const isExpanded = content.classList.contains('expanded');
    
    if (isExpanded) {
        content.classList.remove('expanded');
        arrow.classList.remove('rotated');
    } else {
        content.classList.add('expanded');
        arrow.classList.add('rotated');
    }
}

// Render dropdown items (for chapters)
function renderDropdownItems(type, items) {
    const list = document.getElementById(`${type}List`);
    list.innerHTML = '';
    
    items.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = 'dropdown-item';
        itemElement.textContent = item;
        itemElement.onclick = () => selectDropdownItem(type, item);
        list.appendChild(itemElement);
    });
}

// Select dropdown item
function selectDropdownItem(type, item) {
    if (type === 'chapters') {
        selectChapter(item);
    } else if (type === 'videos') {
        selectVideo(item);
    } else if (type === 'audio') {
        selectAudio(item);
    }
    
    // Close dropdown
    toggleDropdown(type);
}

// Handle video selection
function selectVideo(videoName) {
    console.log('Selected video:', videoName);
    // TODO: Implement video playback functionality
    showSuccess(`Video "${videoName}" selected`);
}

// Handle audio selection
function selectAudio(audioName) {
    console.log('Selected audio:', audioName);
    // TODO: Implement audio playback functionality
    showSuccess(`Audio "${audioName}" selected`);
}

// ===== BOOKMARKS FUNCTIONALITY =====

// Toggle message menu
function toggleMessageMenu(messageId, event) {
    event.stopPropagation();
    
    const message = document.querySelector(`[data-message-id="${messageId}"]`);
    const existingMenu = message.querySelector('.message-menu-dropdown');
    
    // If menu is already open, close it
    if (existingMenu) {
        existingMenu.remove();
        return;
    }
    
    // Close any other open menus first
    document.querySelectorAll('.message-menu-dropdown').forEach(menu => {
        menu.remove();
    });
    
    const messageMenu = message.querySelector('.message-menu');
    const messageContent = message.querySelector('.message-content').textContent;
    const isAI = message.classList.contains('ai-message');
    
    // Create dropdown menu with all 4 options always present
    const dropdown = document.createElement('div');
    dropdown.className = 'message-menu-dropdown';
    dropdown.innerHTML = `
        <div class="menu-item" onclick="bookmarkMessage('${messageId}')">
            <i class="fas fa-bookmark"></i> Bookmark Message
        </div>
        <div class="menu-item" onclick="copyMessage('${messageId}')">
            <i class="fas fa-copy"></i> Copy Message
        </div>
        <div class="menu-item ${isAI ? 'disabled' : ''}" onclick="${isAI ? 'return false' : 'editAndRegenerate(\'' + messageId + '\')'}">
            <i class="fas fa-edit"></i> Edit & Regenerate
        </div>
        <div class="menu-item" onclick="selectText('${messageId}')">
            <i class="fas fa-highlighter"></i> Select Text
        </div>
    `;
    
    // Position the dropdown directly below the 3-dot button
    const rect = messageMenu.getBoundingClientRect();
    
    dropdown.style.position = 'fixed';
    dropdown.style.left = (rect.left - 180 + 28) + 'px'; // Align with the right edge of the 3-dot button
    dropdown.style.top = (rect.bottom + 5) + 'px'; // Directly below the 3-dot button with small gap
    dropdown.style.zIndex = '1000';
    
    // Append to body for proper positioning
    document.body.appendChild(dropdown);
    
    // Close menu when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function closeMenu() {
            dropdown.remove();
            document.removeEventListener('click', closeMenu);
        });
    }, 0);
}

// Bookmark a message
async function bookmarkMessage(messageId) {
    const message = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!message) {
        showError('Message not found');
        return;
    }
    
    const messageContent = message.querySelector('.message-content').textContent;
    const existingBookmark = bookmarks.find(b => b.messageId === messageId);
    
    if (existingBookmark) {
        // Remove bookmark
        try {
            const { url, options } = addUserUIDToRequest(`/api/bookmarks/${existingBookmark.id}`, {
                method: 'DELETE'
            });
            const response = await fetch(url, options);
            
            if (response.ok) {
                bookmarks = bookmarks.filter(b => b.messageId !== messageId);
                showSuccess('Bookmark removed');
            } else {
                showError('Failed to remove bookmark');
            }
        } catch (error) {
            console.error('Error removing bookmark:', error);
            showError('Failed to remove bookmark');
        }
    } else {
        // Add bookmark
        try {
            const bookmarkData = {
                linkedMessageId: messageId,
                snippet: messageContent.substring(0, 100) + (messageContent.length > 100 ? '...' : ''),
                type: message.classList.contains('ai-message') ? 'tutor' : 'user',
                chatId: currentChatId // Include the current chat ID
            };
            
            const { url, options } = addUserUIDToRequest('/api/bookmarks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(bookmarkData)
            });
            const response = await fetch(url, options);
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                const bookmark = {
                    id: data.bookmark_id,
                    messageId: messageId,
                    content: bookmarkData.snippet,
                    timestamp: new Date().toISOString(),
                    type: bookmarkData.type,
                    chatId: currentChatId // Include chat ID in frontend bookmark object
                };
                bookmarks.push(bookmark);
                showSuccess('Message bookmarked');
            } else {
                showError('Failed to create bookmark');
            }
        } catch (error) {
            console.error('Error creating bookmark:', error);
            showError('Failed to create bookmark');
        }
    }
    
    renderBookmarks();
    updateBookmarkHighlights();
}

// Copy message to clipboard
function copyMessage(messageId) {
    const message = document.querySelector(`[data-message-id="${messageId}"]`);
    const messageContent = message.querySelector('.message-content').textContent;
    
    navigator.clipboard.writeText(messageContent).then(() => {
        showSuccess('Message copied to clipboard');
    }).catch(() => {
        showError('Failed to copy message');
    });
}

// Edit and regenerate (for user messages)
function editAndRegenerate(messageId) {
    const message = document.querySelector(`[data-message-id="${messageId}"]`);
    const messageContent = message.querySelector('.message-content').textContent;
    
    // Store the message ID for edit & regenerate mode
    window.editingMessageId = messageId;
    
    // Fill the input with the original message
    messageInput.value = messageContent;
    autoResize(messageInput);
    messageInput.focus();
    
    // Change send button to "Regenerate" mode
    const sendButton = document.querySelector('.send-btn');
    if (sendButton) {
        sendButton.innerHTML = '<i class="fas fa-sync-alt"></i>';
        sendButton.classList.add('regenerate-mode');
    }
    
    // Optimistic update: Find and immediately hide the following assistant message
    const allMessages = Array.from(chatContainer.querySelectorAll('.message'));
    const currentMessageIndex = allMessages.findIndex(msg => msg.getAttribute('data-message-id') === messageId);
    
    if (currentMessageIndex !== -1 && currentMessageIndex + 1 < allMessages.length) {
        const nextMessage = allMessages[currentMessageIndex + 1];
        if (nextMessage && nextMessage.classList.contains('ai-message')) {
            nextMessage.style.opacity = '0.3';
            nextMessage.style.pointerEvents = 'none';
            nextMessage.style.transition = 'opacity 0.3s ease';
            // Store reference for cleanup
            window.hiddenAssistantMessage = nextMessage;
        }
    }
    
    showSuccess('Message ready for editing - click Regenerate when done');
}

// Enable text selection mode
function selectText(messageId) {
    const message = document.querySelector(`[data-message-id="${messageId}"]`);
    const messageContent = message.querySelector('.message-content');
    
    // Make text selectable
    messageContent.style.userSelect = 'text';
    messageContent.style.webkitUserSelect = 'text';
    messageContent.style.mozUserSelect = 'text';
    messageContent.style.msUserSelect = 'text';
    
    // Highlight the message to indicate selection mode
    message.style.backgroundColor = '#f8f9fa';
    message.style.border = '2px solid #007bff';
    
    showSuccess('Text selection enabled - click and drag to select text');
    
    // Reset after 5 seconds
    setTimeout(() => {
        messageContent.style.userSelect = 'none';
        messageContent.style.webkitUserSelect = 'none';
        messageContent.style.mozUserSelect = 'none';
        messageContent.style.msUserSelect = 'none';
        message.style.backgroundColor = '';
        message.style.border = '';
    }, 5000);
}

// Render bookmarks in sidebar
function renderBookmarks() {
    const bookmarksList = document.getElementById('bookmarksList');
    
    // Filter bookmarks to only show those from existing chats
    const validBookmarks = bookmarks.filter(bookmark => {
        if (bookmark.chatId && bookmark.chatId !== 'unknown') {
            const chatExists = chats.some(chat => chat.id === bookmark.chatId);
            if (!chatExists) {
                console.warn(`Hiding bookmark from deleted chat: ${bookmark.chatId}`);
                return false;
            }
        }
        return true;
    });
    
    if (validBookmarks.length === 0) {
        bookmarksList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-bookmark"></i>
                <p>No bookmarks yet</p>
                <small>Click the 3-dot menu on any message to bookmark it</small>
            </div>
        `;
        return;
    }
    
    bookmarksList.innerHTML = '';
    validBookmarks.forEach(bookmark => {
        const bookmarkItem = document.createElement('div');
        bookmarkItem.className = 'bookmark-item';
        bookmarkItem.setAttribute('data-bookmark-id', bookmark.messageId);
        bookmarkItem.onclick = () => scrollToBookmark(bookmark.messageId);
        
        // Get chat name for display
        let chatName = 'Unknown Chat';
        if (bookmark.chatId && bookmark.chatId !== 'unknown') {
            const chat = chats.find(c => c.id === bookmark.chatId);
            if (chat) {
                chatName = chat.chatName || chat.name || 'New Chat';
            }
        }
        
        // Show if bookmark is from different chat
        const isFromDifferentChat = bookmark.chatId && bookmark.chatId !== 'unknown' && bookmark.chatId !== currentChatId;
        const chatIndicator = isFromDifferentChat ? `<div class="bookmark-chat-indicator">📁 ${chatName}</div>` : '';
        
        bookmarkItem.innerHTML = `
            <div class="bookmark-content">${bookmark.content}</div>
            <div class="bookmark-timestamp">${formatTimestamp(bookmark.timestamp)}</div>
            ${chatIndicator}
        `;
        
        // Add visual indicator if bookmark is from different chat
        if (isFromDifferentChat) {
            bookmarkItem.classList.add('bookmark-from-different-chat');
        }
        
        bookmarksList.appendChild(bookmarkItem);
    });
    
    updateBookmarkHighlights();
}

// Update bookmark highlights in chat
function updateBookmarkHighlights() {
    // Filter bookmarks to only those from existing chats
    const validBookmarks = bookmarks.filter(bookmark => {
        if (bookmark.chatId && bookmark.chatId !== 'unknown') {
            const chatExists = chats.some(chat => chat.id === bookmark.chatId);
            if (!chatExists) {
                return false;
            }
        }
        return true;
    });
    
    console.log(`Updating bookmark highlights for ${validBookmarks.length} valid bookmarks`);
    
    // Remove existing highlights
    document.querySelectorAll('.message.bookmarked').forEach(msg => {
        msg.classList.remove('bookmarked');
    });
    
    // Add highlights for bookmarked messages
    let highlightedCount = 0;
    validBookmarks.forEach(bookmark => {
        const message = document.querySelector(`[data-message-id="${bookmark.messageId}"]`) || document.getElementById(bookmark.messageId);
        if (message) {
            message.classList.add('bookmarked');
            highlightedCount++;
        } else {
            console.warn(`Bookmark references message not found in current chat: ${bookmark.messageId}`);
        }
    });
    
    console.log(`Applied bookmark highlights to ${highlightedCount} messages`);
}

// Update bookmark highlight for a specific message
function updateBookmarkHighlightForMessage(messageId) {
    const message = document.querySelector(`[data-message-id="${messageId}"]`) || document.getElementById(messageId);
    if (!message) {
        console.warn(`Message element not found for ID: ${messageId}`);
        return;
    }
    
    // Check if this message is bookmarked
    const isBookmarked = bookmarks.some(bookmark => bookmark.messageId === messageId);
    
    if (isBookmarked) {
        message.classList.add('bookmarked');
        console.log(`Applied bookmark highlight to message: ${messageId}`);
    } else {
        message.classList.remove('bookmarked');
    }
}

// Filter bookmarks based on search
function filterBookmarks(searchTerm) {
    const bookmarkItems = document.querySelectorAll('.bookmark-item');
    
    bookmarkItems.forEach(item => {
        const content = item.querySelector('.bookmark-content').textContent.toLowerCase();
        const matches = content.includes(searchTerm.toLowerCase());
        item.style.display = matches ? 'block' : 'none';
    });
}

// Scroll to bookmarked message
function scrollToBookmark(messageId) {
    const message = document.querySelector(`[data-message-id="${messageId}"]`) || document.getElementById(messageId);
    if (message) {
        // Calculate the target scroll position for better control
        const containerRect = chatContainer.getBoundingClientRect();
        const messageRect = message.getBoundingClientRect();
        const targetScrollTop = chatContainer.scrollTop + messageRect.top - containerRect.top - (containerRect.height / 2) + (messageRect.height / 2);
        
        // Use smooth scrolling with better performance
        chatContainer.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth'
        });
        
        // Add highlight animation
        message.style.animation = 'highlight 2s ease';
        
        // Remove animation after it completes
        setTimeout(() => {
            message.style.animation = '';
        }, 2000);
        
        // Focus the message briefly with outline
        message.style.outline = '2px solid #007bff';
        message.style.outlineOffset = '2px';
        setTimeout(() => {
            message.style.outline = '';
            message.style.outlineOffset = '';
        }, 3000);
        
        console.log(`Successfully scrolled to bookmarked message: ${messageId}`);
    } else {
        console.log(`Bookmarked message not found in current chat: ${messageId}`);
        
        // Find the bookmark to get its chat ID
        const bookmark = bookmarks.find(b => b.messageId === messageId);
        if (bookmark && bookmark.chatId && bookmark.chatId !== 'unknown') {
            console.log(`Bookmark belongs to chat: ${bookmark.chatId}, current chat: ${currentChatId}`);
            
            // Check if we need to switch chats
            if (bookmark.chatId !== currentChatId) {
                console.log(`Switching to chat ${bookmark.chatId} to show bookmarked message`);
                
                // Find the chat in the chats list
                const targetChat = chats.find(c => c.id === bookmark.chatId);
                if (targetChat) {
                    // Switch to the correct chat
                    switchToChat(bookmark.chatId).then(() => {
                        // After switching, try to scroll to the message again
                        setTimeout(() => {
                            const messageAfterSwitch = document.querySelector(`[data-message-id="${messageId}"]`) || document.getElementById(messageId);
                            if (messageAfterSwitch) {
                                // Calculate the target scroll position for better control
                                const containerRect = chatContainer.getBoundingClientRect();
                                const messageRect = messageAfterSwitch.getBoundingClientRect();
                                const targetScrollTop = chatContainer.scrollTop + messageRect.top - containerRect.top - (containerRect.height / 2) + (messageRect.height / 2);
                                
                                // Use smooth scrolling with better performance
                                chatContainer.scrollTo({
                                    top: Math.max(0, targetScrollTop),
                                    behavior: 'smooth'
                                });
                                
                                // Add highlight animation
                                messageAfterSwitch.style.animation = 'highlight 2s ease';
                                setTimeout(() => {
                                    messageAfterSwitch.style.animation = '';
                                }, 2000);
                                
                                // Focus the message briefly with outline
                                messageAfterSwitch.style.outline = '2px solid #007bff';
                                messageAfterSwitch.style.outlineOffset = '2px';
                                setTimeout(() => {
                                    messageAfterSwitch.style.outline = '';
                                    messageAfterSwitch.style.outlineOffset = '';
                                }, 3000);
                                
                                showSuccess(`Switched to "${targetChat.chatName}" and found bookmarked message`);
                            } else {
                                showError('Bookmarked message not found. It may have been deleted.');
                            }
                        }, 500); // Wait for chat to load
                    });
                } else {
                    showError('Chat containing this bookmark no longer exists.');
                }
            } else {
                showError('Bookmarked message not found in current chat. It may have been deleted.');
            }
        } else {
            showError('Bookmarked message not found. It may have been deleted or the chat has been cleared.');
        }
        
        // Try to find the message in other chats or suggest refreshing
        console.warn('Attempting to find message in other chats...');
        const allMessages = document.querySelectorAll('[data-message-id]');
        const foundMessageIds = Array.from(allMessages).map(msg => msg.getAttribute('data-message-id'));
        console.log('Available message IDs in current chat:', foundMessageIds);
    }
}

// ===== UPLOADED FILES FUNCTIONALITY =====

// Add uploaded file to sidebar
function addUploadedFile(file) {
    const fileId = 'file_' + Date.now();
    const uploadedFile = {
        id: fileId,
        name: file.name,
        type: file.type,
        size: file.size,
        url: URL.createObjectURL(file)
    };
    
    uploadedFiles.push(uploadedFile);
    renderUploadedFiles();
}

// Render uploaded files in sidebar
function renderUploadedFiles() {
    const uploadedFilesList = document.getElementById('uploadedFilesList');
    
    if (uploadedFiles.length === 0) {
        uploadedFilesList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-file-upload"></i>
                <p>No files uploaded</p>
                <small>Upload files to see them here</small>
            </div>
        `;
        return;
    }
    
    uploadedFilesList.innerHTML = '';
    uploadedFiles.forEach(file => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <div class="file-header" draggable="false" ondblclick="makeFileDraggable('${file.id}', this)" data-file-id="${file.id}">
                <i class="fas fa-file file-icon"></i>
                <span class="file-name">${file.name}</span>
                <button class="file-menu-btn" onclick="toggleFileMenu('${file.id}')">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            </div>
            <div class="file-menu" id="fileMenu_${file.id}">
                <div class="file-menu-item" onclick="openFile('${file.id}')">
                    <i class="fas fa-external-link-alt"></i> Open
                </div>
                <div class="file-menu-item" onclick="attachFileToPrompt('${file.id}')">
                    <i class="fas fa-paperclip"></i> Attach to Prompt Bar
                </div>
                <div class="file-menu-item delete-option" onclick="deleteFile('${file.id}')">
                    <i class="fas fa-trash"></i> Delete File
                </div>
            </div>
        `;
        
        uploadedFilesList.appendChild(fileItem);
    });
}

// Toggle file menu
function toggleFileMenu(fileId) {
    const menu = document.getElementById(`fileMenu_${fileId}`);
    const allMenus = document.querySelectorAll('.file-menu');
    
    // Close other menus
    allMenus.forEach(m => {
        if (m !== menu) {
            m.classList.remove('show');
        }
    });
    
    // Toggle current menu
    menu.classList.toggle('show');
}

// Open file in new tab
function openFile(fileId) {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (file && file.url) {
        window.open(file.url, '_blank');
    } else {
        showError('File not available for viewing');
    }
    toggleFileMenu(fileId);
}

// Attach file to prompt bar
function attachFileToPrompt(fileId) {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (file) {
        // Add file to attached files array
        if (!attachedFiles.find(f => f.id === fileId)) {
            attachedFiles.push({
                id: fileId,
                name: file.name,
                type: file.type
            });
            renderFileAttachments();
        showSuccess(`File "${file.name}" attached to prompt`);
        } else {
            showError(`File "${file.name}" is already attached`);
        }
    }
    toggleFileMenu(fileId);
}

// Render file attachment bubbles in prompt bar
function renderFileAttachments() {
    const fileAttachmentsContainer = document.getElementById('fileAttachments');
    
    if (attachedFiles.length === 0) {
        fileAttachmentsContainer.style.display = 'none';
        return;
    }
    
    fileAttachmentsContainer.style.display = 'block';
    fileAttachmentsContainer.innerHTML = '';
    
    attachedFiles.forEach(file => {
        const bubble = document.createElement('div');
        bubble.className = 'file-attachment-bubble';
        
        // Get file icon based on type
        const fileIcon = getFileIcon(file.type || file.name);
        
        bubble.innerHTML = `
            <i class="fas ${fileIcon} file-icon"></i>
            <span class="file-name">${file.name}</span>
            <button class="remove-btn" onclick="removeFileAttachment('${file.id}')" title="Remove file">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        fileAttachmentsContainer.appendChild(bubble);
    });
}

// Remove file attachment from prompt bar
function removeFileAttachment(fileId) {
    attachedFiles = attachedFiles.filter(f => f.id !== fileId);
    renderFileAttachments();
    showSuccess('File removed from prompt');
}

// Restore attached files for a specific chat
async function restoreAttachedFilesForChat(chatId) {
    try {
        // Clear current attached files
        attachedFiles = [];
        
        // Get the last user message with attachments from this chat
        const { url, options } = addUserUIDToRequest(`/api/chats/${chatId}`);
        const response = await fetch(url, options);
        const data = await response.json();
        
        if (data.success && data.messages) {
            // Find the most recent user message with file attachments
            const userMessagesWithFiles = data.messages
                .filter(msg => msg.sender === 'user' && msg.fileAttachments && msg.fileAttachments.length > 0)
                .reverse();
            
            if (userMessagesWithFiles.length > 0) {
                const latestMessageWithFiles = userMessagesWithFiles[0];
                attachedFiles = latestMessageWithFiles.fileAttachments.map(attachment => ({
                    id: attachment.uploadId || 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    name: attachment.fileName,
                    type: attachment.mimeType
                }));
            }
        }
        
        renderFileAttachments();
    } catch (error) {
        console.error('Error restoring attached files for chat:', error);
        attachedFiles = [];
        renderFileAttachments();
    }
}

// Get file icon based on file type
function getFileIcon(fileType) {
    if (typeof fileType === 'string') {
        const extension = fileType.split('.').pop().toLowerCase();
        const mimeType = fileType.includes('/') ? fileType.split('/')[0] : '';
        
        if (mimeType === 'image' || ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff'].includes(extension)) {
            return 'fa-image';
        } else if (extension === 'pdf') {
            return 'fa-file-pdf';
        } else if (['doc', 'docx'].includes(extension)) {
            return 'fa-file-word';
        } else if (['xls', 'xlsx'].includes(extension)) {
            return 'fa-file-excel';
        } else if (['ppt', 'pptx'].includes(extension)) {
            return 'fa-file-powerpoint';
        } else if (['txt', 'md'].includes(extension)) {
            return 'fa-file-alt';
        } else {
            return 'fa-file';
        }
    }
    return 'fa-file';
}

// Delete file from both frontend and backend
async function deleteFile(fileId) {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (!file) {
        showError('File not found');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete "${file.name}"? This action cannot be undone.`)) {
        return;
    }
    
    try {
        const { url, options } = addUserUIDToRequest(`/api/uploads/${fileId}`, {
            method: 'DELETE'
        });
        const response = await fetch(url, options);
        
        const data = await response.json();
        
        if (data.success) {
            // Remove file from frontend array
            uploadedFiles = uploadedFiles.filter(f => f.id !== fileId);
            renderUploadedFiles();
            
            // Remove any references to this file from the prompt bar
            const fileReference = `[Attached: ${file.name}]`;
            if (messageInput.value.includes(fileReference)) {
                messageInput.value = messageInput.value.replace(fileReference, '').trim();
                autoResize(messageInput);
            }
            
            // Remove file from attached files if it's there
            attachedFiles = attachedFiles.filter(f => f.id !== fileId);
            renderFileAttachments();
            
            showSuccess(`File "${file.name}" deleted successfully`);
        } else {
            showError(data.error || 'Failed to delete file');
        }
    } catch (error) {
        console.error('Error deleting file:', error);
        showError('Failed to delete file. Please try again.');
    }
    
    toggleFileMenu(fileId);
}

// Close file menus when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.file-menu-btn') && !e.target.closest('.file-menu')) {
        document.querySelectorAll('.file-menu').forEach(menu => {
            menu.classList.remove('show');
        });
    }
    
    // Close chat menus when clicking outside
    if (!e.target.closest('.chat-menu-btn') && !e.target.closest('.chat-menu')) {
        document.querySelectorAll('.chat-menu').forEach(menu => {
            menu.classList.remove('show');
        });
    }
});

// Add highlight animation for bookmarks
const highlightStyle = document.createElement('style');
highlightStyle.textContent = `
    @keyframes highlight {
        0% { background-color: rgba(255, 193, 7, 0.3); }
        100% { background-color: transparent; }
    }
`;
document.head.appendChild(highlightStyle);

// ===== CHAT MANAGEMENT FUNCTIONALITY =====

// Create new chat
async function createNewChat() {
    try {
        console.log('Creating new chat...');
        
        // Create new chat in Firestore
        const { url, options } = addUserUIDToRequest('/api/chats', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chatName: 'New Chat'
            })
        });
        const response = await fetch(url, options);
        
        const data = await response.json();
        
        if (data.success) {
            // Add new chat to list
            const newChat = {
                id: data.chat_id,
                chatName: 'New Chat',
                createdAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            };
            
            chats.unshift(newChat);
            
            // Load the new chat
            await loadChatWithMessages(data.chat_id);
            
            // Refresh history panel if open
            refreshHistoryPanel();
            
            // Reset input placeholder
            messageInput.placeholder = 'Ask me anything about Business Law...';
            
            // Reset suggestions to default
            lastAIResponse = '';
            refreshSuggestions();
            
            console.log('New chat created successfully:', data.chat_id);
            showSuccess('New chat created successfully');
        } else {
            showError('Failed to create new chat');
        }
    } catch (error) {
        console.error('Error creating new chat:', error);
        showError('Failed to create new chat');
    }
}

// Render chats in sidebar
function renderChats() {
    console.log('renderChats called with chats:', chats);
    console.log('chats.length:', chats.length);
    
    const chatsList = document.getElementById('chatsList');
    console.log('chatsList element:', chatsList);
    
    if (!chatsList) {
        console.error('chatsList element not found!');
        return;
    }
    
    if (chats.length === 0) {
        console.log('No chats to render, showing empty state');
        chatsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-comments"></i>
                <p>No chats yet</p>
                <small>Click "New Chat" to start a conversation</small>
            </div>
        `;
        return;
    }
    
    console.log(`Rendering ${chats.length} chats`);
    chatsList.innerHTML = '';
    chats.forEach((chat, index) => {
        console.log(`Rendering chat ${index}:`, chat);
        
        const chatItem = document.createElement('div');
        chatItem.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
        chatItem.setAttribute('data-chat-id', chat.id);
        chatItem.onclick = () => switchToChat(chat.id);
        
        const chatName = chat.chatName || chat.name || 'New Chat';
        const lastUpdated = chat.lastUpdated || new Date().toISOString();
        
        chatItem.innerHTML = `
            <div class="chat-item-content">
                <div class="chat-name">${chatName}</div>
                <div class="chat-timestamp">${formatTimestamp(lastUpdated)}</div>
            </div>
            <button class="chat-menu-btn" onclick="toggleChatMenu('${chat.id}', event)" title="Chat options">
                <i class="fas fa-ellipsis-v"></i>
            </button>
            <div class="chat-menu" id="chatMenu_${chat.id}">
                <div class="chat-menu-item" onclick="renameChat('${chat.id}')">
                    <i class="fas fa-edit"></i> Rename Chat
                </div>
                <div class="chat-menu-item" onclick="clearChatMessages('${chat.id}')">
                    <i class="fas fa-eraser"></i> Clear Chat
                </div>
                <div class="chat-menu-item" onclick="shareChat('${chat.id}')">
                    <i class="fas fa-share"></i> Share Chat
                </div>
                <div class="chat-menu-item delete-option" onclick="deleteChat('${chat.id}')">
                    <i class="fas fa-trash"></i> Delete Chat
                </div>
            </div>
        `;
        
        chatsList.appendChild(chatItem);
    });
    
    console.log('renderChats completed');
}

// Switch to a specific chat
async function switchToChat(chatId) {
    try {
        console.log(`Switching to chat: ${chatId}`);
        
        // Clear attached files when switching chats (files should only auto-attach once on upload)
        attachedFiles = [];
        renderFileAttachments();
        
        // Load chat with messages
        await loadChatWithMessages(chatId);
        
        // Update input placeholder
        const chat = chats.find(c => c.id === chatId);
        if (chat) {
            const chatName = chat.chatName || chat.name || 'New Chat';
            messageInput.placeholder = `Ask about ${chatName}...`;
            showSuccess(`Switched to "${chatName}"`);
        }
    } catch (error) {
        console.error('Error switching to chat:', error);
        showError('Failed to load chat');
    }
}

// Toggle chat menu
function toggleChatMenu(chatId, event) {
    event.stopPropagation();
    event.preventDefault();
    
    const menu = document.getElementById(`chatMenu_${chatId}`);
    const allMenus = document.querySelectorAll('.chat-menu');
    
    // Close other menus
    allMenus.forEach(m => {
        if (m !== menu) {
            m.classList.remove('show');
        }
    });
    
    // Toggle current menu
    if (menu) {
        const isVisible = menu.classList.contains('show');
        
        // Close all menus first
        allMenus.forEach(m => m.classList.remove('show'));
        
        // Toggle current menu
        if (!isVisible) {
            menu.classList.add('show');
            
            // Ensure menu is visible within the container
            const chatItem = menu.closest('.chat-item');
            const chatsList = document.getElementById('chatsList');
            
            // Check if menu would be cut off
            const menuRect = menu.getBoundingClientRect();
            const listRect = chatsList.getBoundingClientRect();
            
            if (menuRect.bottom > listRect.bottom) {
                // Position menu above the button instead
                menu.style.top = 'auto';
                menu.style.bottom = '100%';
            } else {
                // Reset to default position
                menu.style.top = '100%';
                menu.style.bottom = 'auto';
            }
        }
    }
}

// Rename chat
async function renameChat(chatId) {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    
    const currentName = chat.chatName || chat.name || 'New Chat';
    const newName = prompt('Enter new chat name:', currentName);
    if (!newName || newName.trim() === '') return;
    
    try {
        const { url, options } = addUserUIDToRequest(`/api/chats/${chatId}/rename`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                newName: newName.trim()
            })
        });
        const response = await fetch(url, options);
        
        const data = await response.json();
        
        if (data.success) {
            // Update chat in list
            chat.chatName = newName.trim();
            renderChats();
            
            // Refresh history panel if open
            refreshHistoryPanel();
            
            // Update input placeholder if this is the current chat
            if (currentChatId === chatId) {
                messageInput.placeholder = `Ask about ${newName.trim()}...`;
            }
            
            showSuccess('Chat renamed successfully');
        } else {
            showError('Failed to rename chat');
        }
    } catch (error) {
        console.error('Error renaming chat:', error);
        showError('Failed to rename chat');
    }
    
    toggleChatMenu(chatId, new Event('click'));
}

// Share chat
async function shareChat(chatId) {
    try {
        const { url, options } = addUserUIDToRequest(`/api/chats/${chatId}/share`, {
            method: 'POST'
        });
        const response = await fetch(url, options);
        
        const data = await response.json();
        
        if (data.success) {
            // Copy link to clipboard
            navigator.clipboard.writeText(data.shareLink).then(() => {
                showSuccess('Share link copied to clipboard');
            }).catch(() => {
                showError('Failed to copy link to clipboard');
            });
        } else {
            showError('Failed to generate share link');
        }
    } catch (error) {
        console.error('Error sharing chat:', error);
        showError('Failed to share chat');
    }
    
    toggleChatMenu(chatId, new Event('click'));
}

// Delete chat
async function deleteChat(chatId) {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    
    const chatName = chat.chatName || chat.name || 'this chat';
    if (!confirm(`Are you sure you want to delete "${chatName}"? This action cannot be undone.`)) {
        return;
    }
    
    try {
        console.log(`Deleting chat: ${chatId}`);
        
        const { url, options } = addUserUIDToRequest(`/api/chats/${chatId}`, {
            method: 'DELETE'
        });
        const response = await fetch(url, options);
        
        const data = await response.json();
        
        if (data.success) {
            // Remove chat from list
            chats = chats.filter(c => c.id !== chatId);
            
            // Remove bookmarks associated with this chat from frontend state
            const bookmarksToRemove = bookmarks.filter(bookmark => bookmark.chatId === chatId);
            if (bookmarksToRemove.length > 0) {
                bookmarks = bookmarks.filter(bookmark => bookmark.chatId !== chatId);
                console.log(`Removed ${bookmarksToRemove.length} bookmarks from deleted chat: ${chatId}`);
                renderBookmarks();
                updateBookmarkHighlights();
            }
            
            // If this was the current chat, handle the transition
            if (currentChatId === chatId) {
                // Remove from localStorage
                localStorage.removeItem('currentChatId');
                
                // If there are other chats available, switch to the first one
                if (chats.length > 0) {
                    const nextChat = chats[0];
                    await switchToChat(nextChat.id);  // Use switchToChat instead of loadChatWithMessages
                } else {
                    // If this was the only chat, create a new one
                    await createNewChat();
                }
            } else {
                // If we deleted a different chat, just re-render the chat list
                renderChats();
            }
            
            // Refresh history panel if open
            refreshHistoryPanel();
            
            console.log('Chat deleted successfully');
            showSuccess('Chat deleted successfully');
        } else {
            showError('Failed to delete chat');
        }
    } catch (error) {
        console.error('Error deleting chat:', error);
        showError('Failed to delete chat');
    }
    
    toggleChatMenu(chatId, new Event('click'));
}

// Close chat menus when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.chat-menu-btn') && !e.target.closest('.chat-menu')) {
        document.querySelectorAll('.chat-menu').forEach(menu => {
            menu.classList.remove('show');
        });
    }
});

// Clear messages from a specific chat
async function clearChatMessages(chatId) {
    if (!confirm('Are you sure you want to clear all messages from this chat? This action cannot be undone.')) {
        return;
    }
    
    try {
        const { url, options } = addUserUIDToRequest(`/api/history/clear-chat/${chatId}`, {
            method: 'POST'
        });
        const response = await fetch(url, options);
        
        const data = await response.json();
        
        if (data.success) {
            // Remove bookmarks associated with this chat from frontend state
            const bookmarksToRemove = bookmarks.filter(bookmark => bookmark.chatId === chatId);
            if (bookmarksToRemove.length > 0) {
                bookmarks = bookmarks.filter(bookmark => bookmark.chatId !== chatId);
                console.log(`Removed ${bookmarksToRemove.length} bookmarks from cleared chat: ${chatId}`);
                renderBookmarks();
                updateBookmarkHighlights();
            }
            
            // If this is the current chat, clear the chat container
            if (currentChatId === chatId) {
                // Clear message ID map
                messageIdMap.clear();
                
                // Clear chat container except welcome message
                const messages = chatContainer.querySelectorAll('.message');
                messages.forEach((message, index) => {
                    if (index > 0) { // Keep first message (welcome)
                        message.remove();
                    }
                });
                
                // Reset suggestions to default
                lastAIResponse = '';
                refreshSuggestions();
            }
            
            showSuccess('Chat messages and bookmarks cleared successfully');
        } else {
            showError('Failed to clear chat messages');
        }
    } catch (error) {
        console.error('Error clearing chat messages:', error);
        showError('Failed to clear chat messages');
    }
}

// Save current chat state
async function saveCurrentChat() {
    if (!currentChatId) return;
    
    try {
        const currentMessages = [];
        const messages = chatContainer.querySelectorAll('.message');
        
        // Skip the first message (welcome message) and collect user/AI messages
        for (let i = 1; i < messages.length; i++) {
            const message = messages[i];
            const messageContent = message.querySelector('.message-content');
            const isAI = message.classList.contains('ai-message');
            
            if (messageContent) {
                currentMessages.push({
                    message: messageContent.textContent,
                    sender: isAI ? 'tutor' : 'user',
                    timestamp: new Date().toISOString()
                });
            }
        }
        
        // Update chat timestamp
        const { url, options } = addUserUIDToRequest(`/api/chats/${currentChatId}/update-timestamp`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        await fetch(url, options);
        
        console.log(`Saved current chat state with ${currentMessages.length} messages`);
    } catch (error) {
        console.error('Error saving current chat state:', error);
    }
}

// Cleanup function to close all listeners
function cleanupListeners() {
    console.log('Cleaning up all listeners...');
    
    // Cleanup current chat listener
    if (currentChatListener) {
        currentChatListener();
        currentChatListener = null;
    }
    
    // Cleanup all chat listeners
    chatListeners.forEach((listener, chatId) => {
        if (listener) {
            listener();
        }
    });
    chatListeners.clear();
    
    console.log('All listeners cleaned up');
}

// Handle page unload to save current chat state and cleanup listeners
window.addEventListener('beforeunload', function(e) {
    // Save current chat state before leaving
    if (currentChatId) {
        saveCurrentChat();
    }
    
    // Cleanup all listeners
    cleanupListeners();
});

// Handle page visibility change to pause/resume listeners
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        console.log('Page hidden, pausing listeners');
        // Could pause listeners here if needed
    } else {
        console.log('Page visible, resuming listeners');
        // Could resume listeners here if needed
    }
});

// Setup search functionality
function setupSearchFunctionality() {
    // Setup dropdown search
    setupDropdownSearch();
    
    // Setup bookmark search
    const bookmarkSearch = document.getElementById('bookmarksSearch');
    if (bookmarkSearch) {
        bookmarkSearch.addEventListener('input', function() {
            filterBookmarks(this.value);
        });
    }
}

// Ensure proper chat loading and prevent duplication
function ensureChatLoaded(chatId) {
    if (!chatId) return false;
    
    // If we're switching to a different chat, we need to load it
    if (currentChatId !== chatId) {
        console.log(`Switching from chat ${currentChatId} to ${chatId}, need to load messages`);
        // Clear the loaded status for the new chat to force loading
        loadedChatIds.delete(chatId);
        return false;
    }
    
    // Check if this chat is already loaded
    if (loadedChatIds.has(chatId)) {
        console.log(`Chat ${chatId} already loaded, skipping duplicate load`);
        return true;
    }
    
    // Mark chat as loaded
    loadedChatIds.add(chatId);
    return false;
}

// Clear chat loaded status
function clearChatLoadedStatus(chatId) {
    if (chatId) {
        loadedChatIds.delete(chatId);
    }
}

// Clear all chat loaded statuses
function clearAllChatLoadedStatuses() {
    loadedChatIds.clear();
}

// Setup real-time listener for a specific chat's messages
async function setupChatMessagesListener(chatId) {
    try {
        console.log(`Setting up real-time listener for chat ${chatId}`);
        
        // For now, just load messages once and skip real-time updates
        // This ensures immediate loading without complex streaming issues
        await loadChatMessages(chatId);
        
        // TODO: Implement real-time updates later if needed
        console.log(`Chat ${chatId} messages loaded successfully`);
        
    } catch (error) {
        console.error('Error setting up chat messages listener:', error);
        // Fallback to regular fetch
        await loadChatMessages(chatId);
    }
}

// Fallback function to load chat messages (for when streaming is not available)
async function loadChatMessages(chatId) {
    try {
        console.log(`Loading messages for chat: ${chatId}`);
        const { url, options } = addUserUIDToRequest(`/api/chats/${chatId}`);
        const response = await fetch(url, options);
        const data = await response.json();
        
        console.log('Chat messages response:', data);
        
        if (data.success && data.messages) {
            console.log(`Loading ${data.messages.length} messages for chat ${chatId}`);
            
            // Clear existing messages first
            const existingMessages = chatContainer.querySelectorAll('.message:not(.system-message)');
            existingMessages.forEach(msg => msg.remove());
            
            console.log('FRONTEND: Starting to process', data.messages.length, 'messages');
            data.messages.forEach((msg, index) => {
                const messageId = msg.id || msg.messageId || `msg_${msg.timestamp}_${index}_${Math.random().toString(36).substr(2, 9)}`;
                
                if (!messageIdMap.has(messageId)) {
                    // DEBUG: Log all message data to see what's actually saved
                    console.log('FRONTEND: Loading message', index, 'Sender:', msg.sender, 'ID:', messageId);
                    console.log('FRONTEND: Message data:', msg);
                    
                    // Add the message first
                    addMessage(
                        msg.sender === 'tutor' ? 'ai' : 'user', 
                        msg.message, 
                        formatTimestamp(msg.timestamp),
                        messageId
                    );
                    
                    // Add file bubbles to user messages
                    if (msg.sender === 'user' && msg.fileAttachments && msg.fileAttachments.length > 0) {
                        console.log('Found file attachments in user message:', msg.fileAttachments);
                        msg.fileAttachments.forEach(attachment => {
                            addFileBubbleToMessage(messageId, {
                                name: attachment.fileName,
                                type: attachment.mimeType,
                                id: attachment.uploadId,
                                downloadUrl: attachment.downloadRoute
                            });
                        });
                    }
                    
                    // Add structured file content to AI messages
                    if (msg.sender === 'tutor' && msg.structuredFileContent) {
                        console.log('Found structured file content in AI message:', msg.structuredFileContent);
                        // Instead of creating separate elements, add the file content to the main message
                        addFileContentToMessage(messageId, msg.structuredFileContent);
                    }
                    
                    messageIdMap.set(messageId, true);
                }
            });
            
            // Update suggestions based on the last AI response
            const lastAIMessage = data.messages.filter(msg => msg.sender === 'tutor').pop();
            if (lastAIMessage) {
                lastAIResponse = lastAIMessage.message;
                refreshSuggestions();
            } else {
                lastAIResponse = '';
                refreshSuggestions();
            }
            
            // Update bookmark highlights
            setTimeout(() => {
                updateBookmarkHighlights();
                console.log(`Applied bookmark highlights for ${bookmarks.length} bookmarks`);
            }, 100);
            
            // Scroll to bottom after loading messages
            setTimeout(() => {
                scrollToBottom();
            }, 200);
        } else {
            // No messages, reset suggestions
            lastAIResponse = '';
            refreshSuggestions();
        }
    } catch (error) {
        console.error('Error loading chat messages:', error);
        showError('Failed to load chat messages');
    }
}
