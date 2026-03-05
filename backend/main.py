from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

# Import our modular routers
from api.analysis_routes import router as analysis_router
from api.user_routes import router as user_router
from api.admin_routes import router as admin_router
from api.ai_routes import router as ai_router

HOST = "0.0.0.0"
PORT = int(os.getenv("PORT", 8000))
BASE_URL = f"http://localhost:{PORT}"

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup: print clickable frontend links ──
    print("\n" + "=" * 58)
    print("  🔮  AURA — Sentiment Intelligence Platform")
    print("=" * 58)
    print(f"\n  🌐  Frontend :  {BASE_URL}/")
    print(f"  🔐  Auth     :  {BASE_URL}/auth.html")
    print(f"  🔮  App      :  {BASE_URL}/app.html")
    print(f"  📊  Dashboard:  {BASE_URL}/dashboard.html")
    print(f"  🛡️   Admin    :  {BASE_URL}/admin.html")
    print(f"  ℹ️   About    :  {BASE_URL}/about.html")
    print(f"\n  📡  API Docs :  {BASE_URL}/docs")
    print("=" * 58 + "\n")
    yield
    # ── Shutdown ──
    print("\n  👋  Aura server stopped.\n")

app = FastAPI(title="Aura Advanced API", description="Modular architecture version", lifespan=lifespan)

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Logic Routes ---
# We prefix them with /api to separate from frontend serving
app.include_router(analysis_router, prefix="/api")
app.include_router(user_router, prefix="/api")
app.include_router(admin_router, prefix="/api/admin")
app.include_router(ai_router, prefix="/api")

# --- Frontend Serving Routes ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="css")
app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")

@app.get("/")
@app.get("/index.html")
def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

@app.get("/app.html")
def serve_app():
    return FileResponse(os.path.join(FRONTEND_DIR, "app.html"))

@app.get("/admin.html")
def serve_admin():
    return FileResponse(os.path.join(FRONTEND_DIR, "admin.html"))

@app.get("/auth.html")
def serve_auth():
    return FileResponse(os.path.join(FRONTEND_DIR, "auth.html"))

@app.get("/privacy.html")
def serve_privacy():
    return FileResponse(os.path.join(FRONTEND_DIR, "privacy.html"))

@app.get("/terms.html")
def serve_terms():
    return FileResponse(os.path.join(FRONTEND_DIR, "terms.html"))

@app.get("/about.html")
def serve_about():
    return FileResponse(os.path.join(FRONTEND_DIR, "about.html"))

@app.get("/dashboard.html")
def serve_dashboard():
    return FileResponse(os.path.join(FRONTEND_DIR, "dashboard.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
