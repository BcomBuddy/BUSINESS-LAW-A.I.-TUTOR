#!/bin/bash

# A.I. Tutor - Render Deployment Script
echo "🚀 Deploying A.I. Tutor to Render..."

# Check if we're in the right directory
if [ ! -f "app.py" ]; then
    echo "❌ Error: app.py not found. Please run this script from the project root."
    exit 1
fi

# Check if requirements.txt exists
if [ ! -f "requirements.txt" ]; then
    echo "❌ Error: requirements.txt not found."
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: .env file not found. Make sure to set environment variables in Render dashboard."
    echo "📝 Copy env.example to .env and fill in your values:"
    echo "   cp env.example .env"
fi

echo "✅ Project structure looks good!"
echo ""
echo "📋 Next steps:"
echo "1. Go to https://render.com"
echo "2. Sign up/Login with GitHub"
echo "3. Click 'New +' → 'Web Service'"
echo "4. Connect your GitHub repository"
echo "5. Configure the service:"
echo "   - Name: ai-tutor"
echo "   - Environment: Python 3"
echo "   - Build Command: pip install -r requirements.txt"
echo "   - Start Command: python app.py"
echo "6. Set environment variables (see RENDER_DEPLOYMENT.md)"
echo "7. Deploy!"
echo ""
echo "📖 For detailed instructions, see RENDER_DEPLOYMENT.md"
echo "🔗 Your app will be available at: https://your-app-name.onrender.com"
