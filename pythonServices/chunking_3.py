from typing import List, Dict, Tuple, Any
import os
import re
import fitz  # PyMuPDF
import chromadb
from sentence_transformers import SentenceTransformer
import nltk
nltk.download("punkt", quiet=True)

# ===== Embedding + ChromaDB Setup =====
EMBEDDING_MODEL = "all-mpnet-base-v2"
embedding_model = SentenceTransformer(EMBEDDING_MODEL)

chroma_client = chromadb.PersistentClient(path="./chroma_storage")
collection = chroma_client.get_or_create_collection(
    name="pdf_chunks",
    metadata={"hnsw:space": "cosine"}
)

def find_header_bbox_precise(page, header_text: str) -> Any:
    """
    Find header bbox by grouping all spans that match fully or partially.
    Returns merged bbox or None.
    """
    header_lower = header_text.lower().strip()
    spans = []
    blocks = page.get_text("dict")["blocks"]

    for block in blocks:
        if "lines" in block:
            for line in block["lines"]:
                for span in line["spans"]:
                    span_text = span["text"].lower().strip()
                    if span_text and (header_lower in span_text or span_text in header_lower):
                        spans.append(span["bbox"])

    if spans:
        x0 = min(b[0] for b in spans)
        y0 = min(b[1] for b in spans)
        x1 = max(b[2] for b in spans)
        y1 = max(b[3] for b in spans)
        return (x0, y0, x1, y1)
    else:
        return None

def batch_add_to_chromadb(collection, ids, embeddings, documents, metadatas, batch_size=5000):
    total = len(ids)
    for start in range(0, total, batch_size):
        end = min(start + batch_size, total)
        collection.add(
            ids=ids[start:end],
            embeddings=embeddings[start:end],
            documents=documents[start:end],
            metadatas=metadatas[start:end]
        )

def store_chunks_in_chromadb(chunks: List[Dict], folder_id: str, user_id: str, filename: str):
    """
    Stores chunks in ChromaDB with embeddings, replacing existing ones if IDs match.
    Uses batch processing to respect max batch size limits.
    """
    ids = []
    documents = []
    metadatas = []

    for chunk in chunks:
        pk = f"{folder_id}:{user_id}:{filename}:{chunk['chunk_index']}"
        ids.append(pk)
        documents.append(chunk["text"])
        metadatas.append({
            "folder_id": folder_id,
            "user_id": user_id,
            "filename": filename,
            "page": chunk["page"]+1,
            "bbox": str(chunk["bbox"]),
            "section": chunk["section"],
            "section_level": chunk["section_level"],
            "page_height": chunk["page_height"]
        })

    unique_ids = list(dict.fromkeys(ids))
    id_to_doc = dict(zip(ids, documents))
    id_to_meta = dict(zip(ids, metadatas))

    embeddings = embedding_model.encode(
        [id_to_doc[uid] for uid in unique_ids],
        show_progress_bar=True,
        convert_to_numpy=True
    )

    existing = collection.get(ids=unique_ids)
    if existing["ids"]:
        collection.delete(ids=existing["ids"])

    batch_add_to_chromadb(
        collection,
        unique_ids,
        embeddings.tolist(),
        [id_to_doc[uid] for uid in unique_ids],
        [id_to_meta[uid] for uid in unique_ids],
        batch_size=5000  # safe limit below 5461
    )

    print(f"✅ Stored {len(unique_ids)} unique chunks for {filename} in ChromaDB.")

def create_chunks_with_sections(
    pdf_path: str,
    headers: List[Dict],
    folder_id: str,
    user_id: str,
    chunk_size: int = 512,  # ignored, kept for signature
    overlap: int = 3        # ignored, kept for signature
) -> Tuple[List[Dict], List[Dict]]:
    """
    Creates chunks by merging 3 consecutive spans between headers.
    Each chunk contains merged text, combined bbox, and metadata.
    """
    doc = fitz.open(pdf_path)
    chunks: List[Dict] = []
    sections: List[Dict] = []
    index = 0
    filename = os.path.basename(pdf_path)

    def _sort_key(h: Dict):
        return (
            h.get("page", 0),
            round(h.get("y", 0.0), 1),
            round(h.get("x", 0.0), 1),
        )

    # Sort and resolve headers with bbox
    headers_sorted = sorted(headers, key=_sort_key)
    resolved = []
    for h in headers_sorted:
        page_num = h["page"]
        if page_num < 0 or page_num >= doc.page_count:
            continue
        page = doc[page_num]
        bbox = find_header_bbox_precise(page, h["text"])
        if not bbox:
            continue
        resolved.append({**h, "bbox": bbox})

    if not resolved:
        doc.close()
        return [], []

    # Iterate over sections
    for si, h in enumerate(resolved):
        start_page = h["page"]
        start_y = h["bbox"][1]

        if si + 1 < len(resolved):
            next_h = resolved[si + 1]
            end_page = next_h["page"]
            end_y = next_h["bbox"][1]
        else:
            end_page = doc.page_count - 1
            end_y = doc[end_page].rect.height

        section_id = f"{folder_id}:{user_id}:{filename}:sec{si}"
        sections.append({
            "id": section_id,
            "text": h["text"],
            "level": h.get("level"),
            "page": start_page + 1,
            "bbox": tuple(h["bbox"]),
            "document_path": pdf_path,
            "page_height": doc[start_page].rect.height
        })

        # Buffer for merging spans
        span_buffer = []

        for p in range(start_page, end_page + 1):
            page = doc[p]
            blocks = page.get_text("dict")["blocks"]

            for block in blocks:
                if "lines" in block:
                    for line in block["lines"]:
                        for span in line["spans"]:
                            span_text = span["text"].strip()
                            if not span_text:
                                continue
                            span_bbox = tuple(span["bbox"])
                            span_buffer.append((span_text, span_bbox, p))

                            # If we have 5 spans, merge them
                            if len(span_buffer) == 5:
                                merged_text = " ".join(s[0] for s in span_buffer)
                                x0 = min(s[1][0] for s in span_buffer)
                                y0 = min(s[1][1] for s in span_buffer)
                                x1 = max(s[1][2] for s in span_buffer)
                                y1 = max(s[1][3] for s in span_buffer)
                                chunks.append({
                                    "text": merged_text,
                                    "bbox": (x0, y0, x1, y1),
                                    "page": span_buffer[0][2],
                                    "section_id": section_id,
                                    "section": h["text"],
                                    "section_level": h.get("level"),
                                    "chunk_index": index,
                                    "document_path": pdf_path,
                                    "page_height": page.rect.height
                                })
                                index += 1
                                span_buffer = []

        # Add any leftover spans (less than 3)
        if span_buffer:
            merged_text = " ".join(s[0] for s in span_buffer)
            x0 = min(s[1][0] for s in span_buffer)
            y0 = min(s[1][1] for s in span_buffer)
            x1 = max(s[1][2] for s in span_buffer)
            y1 = max(s[1][3] for s in span_buffer)
            chunks.append({
                "text": merged_text,
                "bbox": (x0, y0, x1, y1),
                "page": span_buffer[0][2],
                "section_id": section_id,
                "section": h["text"],
                "section_level": h.get("level"),
                "chunk_index": index,
                "document_path": pdf_path,
                "page_height": doc[span_buffer[0][2]].rect.height
            })
            index += 1
            span_buffer = []

    doc.close()
    store_chunks_in_chromadb(chunks, folder_id, user_id, filename)
    return chunks, sections
