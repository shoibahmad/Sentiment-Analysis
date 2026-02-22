import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firebase
# Make sure to replace 'firebase-adminsdk.json' with your actual service account key
try:
    if not firebase_admin._apps:
        cred = credentials.Certificate("sentiment-analysis-a445c-firebase-adminsdk-fbsvc-1154771bf6.json")
        firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as e:
    print(f"Warning: Firebase initialization failed. Ensure credentials exist. Error: {e}")
    db = None
