import os
import json
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Initialize Firebase
try:
    if not firebase_admin._apps:
        # Try loading credentials from environment variable first (for Render / production)
        firebase_creds_json = os.getenv("FIREBASE_CREDENTIALS")
        if firebase_creds_json:
            cred_dict = json.loads(firebase_creds_json)
            cred = credentials.Certificate(cred_dict)
        else:
            # Fallback to local JSON file (for local development)
            cred = credentials.Certificate("sentiment-analysis-a445c-firebase-adminsdk-fbsvc-1154771bf6.json")
        firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as e:
    print(f"Warning: Firebase initialization failed. Ensure credentials exist. Error: {e}")
    db = None
