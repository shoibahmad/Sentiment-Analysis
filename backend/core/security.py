from fastapi import Request
from firebase_admin import auth

# --- Authentication Dependency ---
def verify_firebase_token(request: Request):
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        # We allow unauthenticated for demo purposes if token is missing
        # In a strict production environment, raise HTTPException
        return None
    token = auth_header.split(' ')[1]
    if not token:
        return None
    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except Exception as e:
        # Ignore auth errors for now to allow app to function locally without full setup
        print(f"Auth verification failed: {e}")
        return None
