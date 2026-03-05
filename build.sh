#!/usr/bin/env bash
# Render build script for Aura Sentiment Engine
set -o errexit

# Install Python dependencies
pip install --upgrade pip
pip install -r backend/requirements.txt

# Download spaCy English language model
python -m spacy download en_core_web_sm

# Download NLTK / TextBlob corpora (needed by TextBlob & NRCLex)
python -c "
import nltk
nltk.download('punkt')
nltk.download('punkt_tab')
nltk.download('averaged_perceptron_tagger')
nltk.download('averaged_perceptron_tagger_eng')
nltk.download('brown')
nltk.download('wordnet')
"
python -m textblob.download_corpora lite

echo "✅ Build complete!"
