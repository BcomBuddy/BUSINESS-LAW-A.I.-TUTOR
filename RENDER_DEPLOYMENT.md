# 🚀 Deploying A.I. Tutor to Render

## Prerequisites
- GitHub repository with your code
- Render account (free tier available)
- Firebase project with service account

## Step 1: Prepare Your Repository

### 1.1 Create a .env file for local development
```bash
# Copy the example and fill in your values
cp env.example .env
```

### 1.2 Update your .env file with your credentials:
```env
# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour-Private-Key-Here\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/your-service-account%40your-project.iam.gserviceaccount.com

# AI Configuration
GROQ_API_KEY=your-groq-api-key
GEMINI_API_KEY=your-gemini-api-key

# Email Configuration (Optional)
GMAIL_USER=your-email@gmail.com
GMAIL_PASS=your-app-password
HR_EMAIL=hr@yourcompany.com

# Flask Configuration
SECRET_KEY=your-secret-key-here
FLASK_DEBUG=False
FLASK_HOST=0.0.0.0
FLASK_PORT=5000
```

## Step 2: Deploy to Render

### 2.1 Create a Render Account
1. Go to [render.com](https://render.com)
2. Sign up with your GitHub account
3. Connect your GitHub repository

### 2.2 Create a New Web Service
1. Click "New +" → "Web Service"
2. Connect your GitHub repository
3. Choose your repository: `A.I. Tutor`

### 2.3 Configure the Service
- **Name**: `ai-tutor` (or your preferred name)
- **Environment**: `Python 3`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `python app.py`
- **Plan**: Free (or paid for production)

### 2.4 Set Environment Variables
In the Render dashboard, go to "Environment" tab and add:

```
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour-Private-Key-Here\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/your-service-account%40your-project.iam.gserviceaccount.com
GROQ_API_KEY=your-groq-api-key
GEMINI_API_KEY=your-gemini-api-key
SECRET_KEY=your-secret-key-here
FLASK_DEBUG=False
FLASK_HOST=0.0.0.0
FLASK_PORT=5000
```

### 2.5 Deploy
1. Click "Create Web Service"
2. Render will automatically build and deploy your app
3. Your app will be available at: `https://your-app-name.onrender.com`

## Step 3: Post-Deployment

### 3.1 Test Your Deployment
1. Visit your Render URL
2. Test the login functionality
3. Test file upload
4. Test AI chat features

### 3.2 Monitor Your App
- Check Render dashboard for logs
- Monitor performance metrics
- Set up alerts if needed

## Troubleshooting

### Common Issues:
1. **Build Failures**: Check requirements.txt and Python version
2. **Environment Variables**: Ensure all required variables are set
3. **Firebase Connection**: Verify service account credentials
4. **Memory Issues**: Upgrade to paid plan if needed

### Debug Commands:
```bash
# Check logs in Render dashboard
# Test locally with same environment
python app.py
```

## Security Notes
- Never commit .env files to Git
- Use strong SECRET_KEY in production
- Regularly rotate API keys
- Monitor for security vulnerabilities

## Performance Optimization
- Use Render's paid plans for better performance
- Implement caching for frequently accessed data
- Optimize database queries
- Use CDN for static assets

## Support
- Render Documentation: https://render.com/docs
- Flask Documentation: https://flask.palletsprojects.com/
- Firebase Documentation: https://firebase.google.com/docs
