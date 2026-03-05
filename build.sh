#!/usr/bin/env bash
# Render build script for Aura Sentiment Engine
set -o errexit

# Install Python dependencies
pip install --upgrade pip
pip install -r backend/requirements.txt

# Download spaCy English language model
python -m spacy download en_core_web_sm

# Create a permanent NLTK data directory inside the project
mkdir -p /opt/render/nltk_data

# Download NLTK / TextBlob corpora (needed by TextBlob & NRCLex)
python -c "
import nltk
nltk.download('punkt', download_dir='/opt/render/nltk_data')
nltk.download('punkt_tab', download_dir='/opt/render/nltk_data')
nltk.download('averaged_perceptron_tagger', download_dir='/opt/render/nltk_data')
nltk.download('averaged_perceptron_tagger_eng', download_dir='/opt/render/nltk_data')
nltk.download('brown', download_dir='/opt/render/nltk_data')
nltk.download('wordnet', download_dir='/opt/render/nltk_data')
nltk.download('omw-1.4', download_dir='/opt/render/nltk_data')
"
python -m textblob.download_corpora lite

echo "✅ Build complete!"
