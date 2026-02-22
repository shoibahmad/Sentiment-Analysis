<div align="center">
  <img src="frontend/favicon.svg" alt="Aura Logo" width="120"/>
  <h1>Aura ✨ Sentiment Intelligence Engine</h1>
  <p>A modern, full-stack Natural Language Processing (NLP) application that decodes the emotional frequency, linguistic topography, and underlying entities of any given text in real-time.</p>
</div>

<br/>

## 🌟 Overview

The **Aura Sentiment Engine** is a scalable, premium web application built to analyze text streams for precise sentiment polarity (Positive, Negative, Neutral), emotional dimensions (Joy, Anger, Trust, etc.), and named entities using advanced Natural Language Processing. 

Moving beyond simple rule-based parsers, Aura utilizes **spaCy**, **TextBlob**, and **NRCLex** backed by a **FastAPI** Python microservice. The entire application is secured and synchronized via **Google Firebase** (Firestore & Auth), ensuring that each user has a personalized, private dashboard mapping their linguistic history over time.

---

## 🚀 Key Features

### 🧠 Advanced NLP Pipeline
- **Sentiment Polarity Analysis:** Accurately classifies sentences computationally using TextBlob.
- **Aspect-Based Sentiment (ABSA):** Utilizes `spaCy`'s dependency parsing (`en_core_web_sm`) to isolate specific nouns/subjects (e.g., "The food" vs "The service") and rank their individual sentiments.
- **Emotional Profiling:** Employs `NRCLex` to detect complex emotional undercurrents (e.g., fear, anticipation, surprise) from raw input.
- **Language Detection:** Automatically identifies input language using `langdetect`.

### ⚡ Interactive Web Interface
- **Glassmorphic "Dark Aura" Design:** A stunning, highly-polished user interface built entirely with vanilla HTML, CSS, and Tailwind CSS.
- **Real-Time Live Typing:** The interface automatically pauses and triggers NLP analysis smoothly as the user types, requiring zero clicks.
- **Bulk CSV Ingestion:** Upload datasets (up to 50 rows per batch) for instantaneous bulk NLP processing.

### 🔐 Secure User Environments
- **Firebase Authentication:** Robust JWT-based security supporting both standard Email/Password limits and Google OAuth Sign-In.
- **Personal Dashboards:** Every query is saved to a secure, cloud-hosted **Firestore database**. Users get access to a private dashboard detailing their historical polarity shifts via `Chart.js` gradient line charts and Linguistic Concept Word Clouds via `wordcloud2.js`.
- **Super-Admin Portal:** Role-based access enabling administrators to view global volume trends, system-wide word frequencies, and monitor application health.

---

## 🏗️ Architecture Stack

### Backend (Python)
- **Framework:** FastAPI / Uvicorn (Asynchronous, Type-Hinted API)
- **Database:** Firebase Admin SDK (Cloud Firestore)
- **Machine Learning / NLP:** `spacy`, `textblob`, `nrclex`, `langdetect`
- **Data Handling:** `pandas` (for CSV bulk ingestion)

### Frontend (Javascript)
- **Core:** Vanilla JS (ES6 modules), HTML5
- **Styling:** Tailwind CSS (via CDN) + Custom CSS variables
- **Auth Layer:** Firebase JS SDK (v10.8.0)
- **Visualizations:** `Chart.js` (Trends) and `wordcloud2.js` (Linguistics)

---

## ⚙️ Installation & Setup

### Prerequisites
- Python 3.9+ installed natively.
- A free [Google Firebase](https://console.firebase.google.com/) Project.

### 1. Clone the Repository
```bash
git clone https://github.com/shoibahmad/Sentiment-Analysis.git
cd Sentiment-Analysis
```

### 2. Backend Setup
```bash
cd backend
# Create a virtual environment (Optional but Recommended)
python -m venv venv
venv\Scripts\activate  # On Windows
# source venv/bin/activate  # On Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Download the SpaCy core model
python -m spacy download en_core_web_sm
```

### 3. Firebase Configuration
To ensure maximum security, the Firebase keys are **not** tracked in this repository.

#### Backend Key
1. Go to your Firebase Console -> Project Settings -> Service Accounts.
2. Click **Generate new private key** (JSON format).
3. Place the downloaded file into the `backend/` directory.
4. Rename it or update the path in `backend/core/config.py` to match the exact filename.

#### Frontend Key
1. Go to your Firebase Console -> Project Settings -> General -> Your apps (Web app).
2. Copy the `firebaseConfig` object block.
3. In this repository, rename `frontend/js/firebaseConfig.example.js` to `frontend/js/firebaseConfig.js`.
4. Paste your keys into the newly created `firebaseConfig.js` file.

### 4. Running the Application
Within the `backend/` directory, simply run:
```bash
python main.py
```
Aura will automatically mount the frontend static files and begin serving on `http://localhost:8000`.

---

## 📂 Project Structure

```text
Sentiment-Analysis/
├── .gitignore                   # Guards API Keys and Virtual Envs
├── backend/
│   ├── main.py                  # Entry point, mounts static files & API routers
│   ├── requirements.txt         # NLP & Server dependencies
│   ├── core/
│   │   ├── config.py            # Firebase initialization logic
│   │   └── security.py          # Firebase Bearer token verification
│   ├── services/
│   │   └── nlp_service.py       # Isolated SpaCy, TextBlob, and NRCLex logic
│   └── api/
│       ├── analysis_routes.py   # Secure NLP endpoints
│       ├── user_routes.py       # Personal Dashboard fetching
│       └── admin_routes.py      # System-wide metrics
│
└── frontend/
    ├── css/style.css            # Aura custom styling
    ├── js/
    │   ├── auth.js              # Authentication UI handlers
    │   ├── dashboard.js         # User Dashboard UI and Chart.js initialization
    │   ├── userPortal.js        # Main application logic & fetch API
    │   ├── adminPortal.js       # Admin Dashboard data fetching
    │   └── firebaseConfig.js    # Firebase initialization (Add your keys here)
    │
    ├── index.html               # Public Landing Page
    ├── auth.html                # Login / Registration Portal
    ├── app.html                 # Core NLP Analyzer Console
    ├── dashboard.html           # Private User Data Dashboard
    └── admin.html               # Global Administrator Panel
```

---

<p align="center">
  Built with ❤️ for advanced machine learning visualization and cloud architecture.
</p>
