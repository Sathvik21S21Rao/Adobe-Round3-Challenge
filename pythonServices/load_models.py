from sentence_transformers import SentenceTransformer
from transformers import DistilBertTokenizer, DistilBertModel
import torch
import os

# SentenceTransformer configuration
EMBEDDING_MODEL = "all-mpnet-base-v2"
SENTENCE_MODEL_DIR = "saved_models/sentence_transformer"
DISTILBERT_MODEL_DIR = "saved_models/distilbert_model"
DISTILBERT_TOKENIZER_DIR = "saved_models/distilbert_tokenizer"

os.makedirs(SENTENCE_MODEL_DIR, exist_ok=True)
os.makedirs(DISTILBERT_MODEL_DIR, exist_ok=True)
os.makedirs(DISTILBERT_TOKENIZER_DIR, exist_ok=True)

# Initialize and save SentenceTransformer
try:
    sentence_model = SentenceTransformer(EMBEDDING_MODEL)
    print(f"✓ SentenceTransformer loaded: {EMBEDDING_MODEL}")
    
    # Save model
    sentence_model.save(SENTENCE_MODEL_DIR)
    print(f"✓ SentenceTransformer saved to {SENTENCE_MODEL_DIR}")
except Exception as e:
    print(f"❌ Error loading SentenceTransformer: {e}")
    sentence_model = None

# Initialize and save DistilBERT
try:
    tokenizer = DistilBertTokenizer.from_pretrained("distilbert-base-uncased")
    bert_model = DistilBertModel.from_pretrained("distilbert-base-uncased")
    print("✓ DistilBERT loaded successfully")

    # Save tokenizer and model
    tokenizer.save_pretrained(DISTILBERT_TOKENIZER_DIR)
    bert_model.save_pretrained(DISTILBERT_MODEL_DIR)
    print(f"✓ DistilBERT tokenizer saved to {DISTILBERT_TOKENIZER_DIR}")
    print(f"✓ DistilBERT model saved to {DISTILBERT_MODEL_DIR}")
except Exception as e:
    print(f"❌ Error loading DistilBERT: {e}")
    tokenizer = None
    bert_model = None
