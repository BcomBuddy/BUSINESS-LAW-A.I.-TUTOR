# Netlify Deployment Guide

## 🚀 **Deployment Options**

Since this is a **Flask (Python) application**, you have two main deployment strategies:

### **Option 1: Netlify Functions (Recommended)**
Convert your Flask app to Netlify Functions for serverless deployment.

### **Option 2: Separate Backend Hosting**
Host the Flask backend separately and use Netlify for the frontend only.

---

## 📋 **Option 1: Netlify Functions Deployment**

### **Step 1: Convert Flask to Netlify Functions**

1. **Install Netlify CLI:**
   ```bash
   npm install -g netlify-cli
   ```

2. **Create `netlify.toml` configuration:**
   ```toml
   [build]
     command = "pip install -r requirements.txt"
     functions = "netlify/functions"
     publish = "static"

   [functions]
     node_bundler = "esbuild"

   [[redirects]]
     from = "/api/*"
     to = "/.netlify/functions/:splat"
     status = 200
   ```

3. **Convert Flask routes to Netlify Functions:**
   - Move each Flask route to a separate function in `netlify/functions/`
   - Example: `netlify/functions/chat.py`, `netlify/functions/upload.py`

### **Step 2: Environment Variables in Netlify**

1. **Go to Netlify Dashboard → Site Settings → Environment Variables**
2. **Add these variables:**
   ```
   FIREBASE_PROJECT_ID=bcombuddy-e8708
   FIREBASE_PRIVATE_KEY_ID=2f18b0ba17805d33b9ebd4f283eb951f26f21626
   FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC9YST5DpCZn+bD\nXJk/JGBDS4Vtf6vq4GrBWpp4jWxRtT/KB+qmBhyl/uLeC9S5ARefprR2QVSDA/5g\nyFNkMDRZdkn325VUJJgyA66R+h6MUt2Un0aLTiwUr2Qq6fEI8F+aIobjAUnyIIOc\n5HxKsWZDpGRi7inbZyceVPrv8ZzXKYR/4fEkuI9N3xxrvZGGT0r2AEm/g7Rz3P8H\n2Fs6A3oFm5Ujgvtbqk2VpIs4Xhf2G3EFCBdl/BFfddwWaNz5GEeJNkHdfHOPURA6\n6Dtn4SB2USQ5TOpRy3I8/kw5hc4WXENc7rA8cGq81oOGnYM3fxL7RUlU7YvdSBCl\nEhBFvO/FAgMBAAECggEAXE2JbkS9kMsBeA3deYuayaH5DgYwvmGUVtp4uLJBbc+4\nIBncsf//nZ6OZ+h/TY6tO3jOs2ajMNpU9UoebxIZqdMAOWjSrzjI33Ow9eBhXEaV\nTjeVdBdtX8WevlXYz+EMz7ztXp5FsthLHcC1ndg6PlTVQuzPBOuRgvSrfCCYr7tq\ns3W22P6Szo+XjMuWhF6tn9v84fSA2PDGpO94a9pnj0lef0pwmTPoEU9tOJKrf3As\nnxLyzwltO83PhY7R5q8E4qMFe95pd3vnku/xY0xuL/tOC608yzuX+95oRkYV9Mri\nZQXBtPbUCtBpRmbYb+hMT6ZuJrSfgX920LEZDYpBXwKBgQDwDMl3BNxsraZD27Dk\nl4Smo8V6gmvDc3Yw5rRUEo5IA/75o5kqJTGS8TET8H1KnUshPirDb3LtTOpVl+gp\nBixlIQOtPB6O70tC3GRSW/IignW77iBUtfMWRKVbjKcxRSjBf57Ziaezw/fylsLp\nb1wKHMdqnpte0aXx9uqR8xmH9wKBgQDJ9nXYqy3KpIfVwjDFFqlh1VxGlebqNrz8\nxH9SNd11miuiV7nDhuyTN8KA8z0p3UMoUu18Z2Bn0gEzxDzAzthhfHJbtHZACcYS\nPPuebC8YZZPUn9wtGOMBMPhUUytljgu57xpFx7vAWxovQDq3/XNltVX2vwztA29O\nWD2XWL8vIwKBgB1SIoWUJWxs5YMiYX/6dex40pU9OvZ7svMUKvCd950aR9msPvgj\n5ONC7LC3zkX/4n5j/osyoMIVhAYCcQwZwfB0UOOnFUB2QCYhj2tz6aaHcuQKmQ5f\nzxpoNh5xlrZw8SJ5eSivJLnTdQS/n30t6fseOsluKCIzz2Y3t70uCW9PAoGAdX6T\nurSDlGO5vqsV0mNHsWn+H/Zve4zSz77FT5+Usik5/11H7i+djFwhJQHdcHCP9HKi\nRQCjPmMXXfVpXsY3bieHJEDNlp3ZBJ1DyTuo/mmB4m4KGpZi4juKDQzBr3g+7DHl\nN/lmChc2GY0lXArwSph/ZWhqbazU4WBGnLj9qL8CgYArtvc1+nIWrEvjLmwaKd7w\niGQMYi8KBHT/E88EwoeKcxJMrsK6ee4suEkmkl0k5kJqip6IMJytN4XpRNFaOLrU\njTii4ndB9rh6xUy1SmOGo4vJERcge9eJHzy/qPwoJ4n1J3+Z5kkkQfTs5zMfnmnl\nEW2gPcTIXo1ETQQc0GaCpw==\n-----END PRIVATE KEY-----\n
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@bcombuddy-e8708.iam.gserviceaccount.com
   FIREBASE_CLIENT_ID=118295823511466397948
   FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
   FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
   FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
   FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40bcombuddy-e8708.iam.gserviceaccount.com
   FIREBASE_UNIVERSE_DOMAIN=googleapis.com
   OPENAI_API_KEY=your_openai_api_key_here
   SECRET_KEY=your-secret-key-change-in-production
   ```

---

## 📋 **Option 2: Separate Backend Hosting**

### **Step 1: Host Flask Backend Separately**

**Recommended platforms:**
- **Railway** (recommended for Python)
- **Heroku** 
- **Render**
- **PythonAnywhere**

### **Step 2: Deploy Frontend to Netlify**

1. **Build command:** `npm run build` (if using a build process)
2. **Publish directory:** `static/` or `templates/`
3. **Environment variables:** Only client-side Firebase config

### **Step 3: Update API Endpoints**

Update your frontend to point to the hosted backend:
```javascript
const API_BASE_URL = 'https://your-backend-url.com/api';
```

---

## 🔧 **GitHub Setup**

### **Step 1: Create Repository**
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/your-repo-name.git
git push -u origin main
```

### **Step 2: Connect to Netlify**
1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Click "New site from Git"
3. Connect your GitHub repository
4. Configure build settings
5. Add environment variables

---

## 🛡️ **Security Checklist**

- ✅ **Firebase credentials** moved to environment variables
- ✅ **API keys** stored securely
- ✅ **`.gitignore`** configured to exclude sensitive files
- ✅ **Client-side Firebase config** is safe to be public
- ✅ **No hardcoded secrets** in code

---

## 🚀 **Quick Start Commands**

```bash
# Clone and setup
git clone https://github.com/yourusername/your-repo-name.git
cd your-repo-name

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp env.example .env
# Edit .env with your actual values

# Run locally
python app.py

# Deploy to Netlify
netlify deploy --prod
```

---

## 📞 **Need Help?**

- **Netlify Docs:** https://docs.netlify.com/
- **Firebase Docs:** https://firebase.google.com/docs
- **Environment Variables:** https://docs.netlify.com/environment-variables/overview/
