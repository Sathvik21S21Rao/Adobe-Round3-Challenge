import json
import numpy as np
from datetime import datetime
from sentence_transformers import SentenceTransformer
import chromadb

# Create local ChromaDB client & collection for semantic search
chroma_client = chromadb.PersistentClient(path="./chroma_storage")
collection = chroma_client.get_or_create_collection(
    name="pdf_chunks",
    metadata={"hnsw:space": "cosine"}
)

# SentenceTransformer configuration
SENTENCE_MODEL_DIR = "saved_models/sentence_transformer"


try:
    sentence_model = SentenceTransformer(SENTENCE_MODEL_DIR)
    print(f"✓ SentenceTransformer loaded from: {SENTENCE_MODEL_DIR}")
except Exception as e:
    print(f"❌ Error loading SentenceTransformer from local path: {e}")
    sentence_model = None


def get_sentence_transformer_embedding(text):
    """Get embedding from SentenceTransformer"""
    if not sentence_model:
        print("SentenceTransformer model not loaded")
        return None
    
    try:
        # Get embedding using SentenceTransformer
        embedding = sentence_model.encode(text, convert_to_tensor=False)
        return embedding.tolist()
    except Exception as e:
        print(f"Error getting embedding: {e}")
        return None

def perform_semantic_search(query, top_k=5, folder_id=None, user_id=None):
    """
    Perform semantic search over stored chunks in ChromaDB for a specific user and folder.
    Returns top_k ranked results with metadata.
    """
    if not sentence_model:
        print("❌ SentenceTransformer model not loaded, cannot search.")
        return []

    
    expanded_query = query

    # 2. Embed the expanded query
    try:
        query_embedding = sentence_model.encode(expanded_query, convert_to_numpy=True).tolist()
    except Exception as e:
        print(f"❌ Error generating embedding for query: {e}")
        return []

    # 3. Apply ChromaDB search with filtering
    try:
        where_filter = {
            "$and": [
                {"folder_id": folder_id},
                {"user_id": user_id}
            ]
        }

        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=where_filter if where_filter else None
        )
    except Exception as e:
        print(f"❌ Error querying ChromaDB: {e}")
        return []

    # 4. Transform results into a consistent format
    ranked_results = []

    for i, (doc, meta, dist) in enumerate(zip(results["documents"][0], results["metadatas"][0], results["distances"][0])):
        ranked_results.append({
            "rank": i + 1,
            "document": meta.get("filename", "unknown"),
            "section": meta.get("section", "unknown"),
            "page_number": meta.get("page", None),
            "bbox": eval(meta.get("bbox", None)),
            "text": doc,
            "score": 1 - dist,  # cosine distance → similarity score
            "page_height": meta.get("page_height", None)
        })

    return ranked_results


def format_search_results(query, results, top_k):
    """Format search results in the exact specified format"""
    
    # Use the exact format specified - always output in chunking format
    output = {
        
        'extracted_sections': [
            {
                'document': result['document'],
                'section_title': f"{result['section']}",
                'importance_rank': result['rank'],
                'page_number': result['page_number'],
                'page_height': result['page_height'],
            }
            for result in results[:top_k]  # Top 5 results for extracted_sections
        ],
        'subsection_analysis': [
            {
                'document': result['document'],
                'refined_text': result['text'],
                'page_number': result['page_number'],
                'bbox': result['bbox'],
                'page_height': result['page_height'],
            }
            for result in results[:top_k]  # Top k results for subsection_analysis
        ]
    }
    
    return output


