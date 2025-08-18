from sentence_transformers import SentenceTransformer
import torch
import os

# SentenceTransformer configuration
EMBEDDING_MODEL = "all-mpnet-base-v2"
SENTENCE_MODEL_DIR = "saved_models/sentence_transformer"

# check if model directory exists
if os.path.exists(SENTENCE_MODEL_DIR):
    print(f"✓ SentenceTransformer already exists at {SENTENCE_MODEL_DIR}")
else:
    os.makedirs(SENTENCE_MODEL_DIR, exist_ok=True)

try:
    sentence_model = SentenceTransformer(EMBEDDING_MODEL)
    print(f"✓ SentenceTransformer loaded: {EMBEDDING_MODEL}")
    
    # Save model
    sentence_model.save(SENTENCE_MODEL_DIR)
    print(f"✓ SentenceTransformer saved to {SENTENCE_MODEL_DIR}")
except Exception as e:
    print(f"❌ Error loading SentenceTransformer: {e}")
    sentence_model = None

