import fitz  # PyMuPDF
import pandas as pd
import re
import nltk
import os
import numpy as np
import string
from nltk.corpus import stopwords


STOPWORDS = set(stopwords.words('english'))

def build_style_profile(doc: fitz.Document) -> dict:
    font_sizes = {}
    for page in doc:
        for b in page.get_text("dict").get("blocks", []):
            if b.get('type') != 0:
                continue
            for l in b["lines"]:
                for s in l["spans"]:
                    size = round(s['size'])
                    font_sizes[size] = font_sizes.get(size, 0) + 1
    sorted_sizes = sorted(font_sizes.keys(), reverse=True)
    return {size: rank for rank, size in enumerate(sorted_sizes)}

def detect_table_regions(page: fitz.Page) -> list:
    return [d['rect'] for d in page.get_drawings() if d.get('rect')]

def get_linguistic_features_nltk(text: str) -> dict:
    words = nltk.word_tokenize(text.lower())
    wc = len(words)
    if wc == 0:
        return {"noun_verb_ratio": 0.0, "stopword_percentage": 0.0}
    pos = nltk.pos_tag(words)
    nouns = sum(1 for _, t in pos if t.startswith('NN'))
    verbs = sum(1 for _, t in pos if t.startswith('VB'))
    nvr = round(nouns / verbs, 2) if verbs else float(nouns)
    sw = sum(1 for w in words if w in STOPWORDS)
    swp = round(sw / wc * 100, 2)
    return {"noun_verb_ratio": nvr, "stopword_percentage": swp}

def compute_gap_and_indents(lines):
    gaps = []
    for i in range(1, len(lines)):
        r0 = fitz.Rect(lines[i-1]["bbox"])
        r1 = fitz.Rect(lines[i]["bbox"])
        gaps.append(r1.y0 - r0.y1)
    gap_thr = float(np.percentile(gaps, 90)) if gaps else 5.0

    x0s = sorted(line["bbox"][0] for line in lines)
    clusters = []
    for x in x0s:
        if clusters and abs(clusters[-1][-1] - x) < 5:
            clusters[-1].append(x)
        else:
            clusters.append([x])
    indent_centers = [float(np.mean(c)) for c in clusters]
    return gap_thr, indent_centers

def cluster_indent(x0, centers):
    for i, c in enumerate(centers):
        if abs(c - x0) < 5:
            return i
    return -1

def should_merge(prev_lines, next_lines, gap_thr, indent_centers):
    prev_span = prev_lines[-1]['spans'][0]
    next_span = next_lines[0]['spans'][0]
    style_prev = (round(prev_span['size']), "bold" in prev_span['font'].lower())
    style_next = (round(next_span['size']), "bold" in next_span['font'].lower())
    if style_prev != style_next:
        return False

    prev_text = " ".join(s['text'] for l in prev_lines for s in l['spans']).strip()
    if prev_text.endswith(('-', '–', '—')):
        return True
    if re.search(r'[\.!?;…—]$', prev_text):
        return False

    r0 = fitz.Rect(prev_lines[-1]['bbox'])
    r1 = fitz.Rect(next_lines[0]['bbox'])
    if (r1.y0 - r0.y1) > gap_thr:
        return False

    ind0 = cluster_indent(r0.x0, indent_centers)
    ind1 = cluster_indent(r1.x0, indent_centers)
    return ind0 == ind1

def extract_additional_features(txt, spans, bbox, page, font_size_map, indent_cluster, page_num):
    # Average font size for relative calculation
    avg_font_size = np.mean(list(font_size_map.keys())) if font_size_map else 1
    words = txt.split()
    num_words = len(words)
    total_chars = len(txt)
    total_digits = sum(c.isdigit() for c in txt)
    punctuation_count = sum(1 for c in txt if c in string.punctuation)
    
    return {
        "rel_font_size": round(spans[0]['size'] / avg_font_size, 2),
        "indent_cluster": indent_cluster,
        "ends_with_colon": txt.endswith(":"),
        "punct_density": round(punctuation_count / max(1, num_words), 2),
        "is_title_case": all(w.istitle() for w in words if len(w) > 1),
        "digit_ratio": round(total_digits / max(1, total_chars), 2),
        "is_first_page": page_num == 1,
        "font_family_hash": hash(spans[0]["font"].split(',')[0]) % 256,
        "lines_in_block": len(set([l['bbox'][1] for l in spans])),
        "avg_word_length": round(sum(len(w) for w in words) / max(1, num_words), 2),
    }

def generate_feature_rich_dataset(pdf_path: str) -> pd.DataFrame:
    doc = fitz.open(pdf_path)
    font_size_map = build_style_profile(doc)
    all_rows = []

    for pnum, page in enumerate(doc, start=1):
        raw_blocks = page.get_text("dict", sort=True)["blocks"]
        lines = [l for b in raw_blocks if b.get('type')==0 for l in b["lines"]]
        gap_thr, indent_centers = compute_gap_and_indents(lines)
        previous_y1 = 0

        for bnum, b in enumerate(raw_blocks):
            if b.get('type') != 0 or not b.get('lines'):
                continue

            sub_blocks = []
            curr = [b["lines"][0]]
            for ln in b["lines"][1:]:
                if should_merge(curr, [ln], gap_thr, indent_centers):
                    curr.append(ln)
                else:
                    sub_blocks.append(curr)
                    curr = [ln]
            sub_blocks.append(curr)

            for sub in sub_blocks:
                spans = [s for l in sub for s in l["spans"]]
                if not spans:
                    continue
                txt = " ".join(s["text"] for s in spans).strip()
                if not txt:
                    continue

                bbox = fitz.Rect(sub[0]["bbox"])
                space_above = round(bbox.y0 - previous_y1, 2)
                previous_y1 = bbox.y1
                indent_cluster = cluster_indent(bbox.x0, indent_centers)

                base_feats = {
                    "page_num": pnum,
                    "block_num": bnum,
                    "full_text": txt,
                    "font_size": round(spans[0]["size"]),
                    "text_length": len(txt),
                    "number_of_words": len(txt.split()),
                    "number_of_spaces": txt.count(" "),
                    "number_of_letters": len([c for c in txt if c.isalpha()]),
                    "font_size_rank": font_size_map.get(round(spans[0]["size"]), -1),
                    "is_bold": "bold" in spans[0]["font"].lower(),
                    "is_in_table": any(bbox.intersects(r) for r in detect_table_regions(page)),
                    "normalized_y_pos": round(bbox.y0 / page.rect.height, 2),
                    "is_centered": abs(((page.rect.width - bbox.width)/2) - bbox.x0) < 10,
                    "is_all_caps": txt.isupper() and len(txt) > 1,
                    "starts_with_number_or_bullet": bool(re.match(r'^\s*(\d+(\.\d+)*\.?|[A-Za-z]\.|[•-])', txt)),
                    "space_above": space_above,
                }

                base_feats.update(get_linguistic_features_nltk(txt))
                base_feats.update(extract_additional_features(txt, spans, bbox, page, font_size_map, indent_cluster, pnum))

                all_rows.append(base_feats)

    doc.close()
    return pd.DataFrame(all_rows)

def process_pdf_directory(input_dir: str, output_dir: str):
    os.makedirs(output_dir, exist_ok=True)
    for fname in os.listdir(input_dir):
        if not fname.lower().endswith(".pdf"):
            continue
        path_in = os.path.join(input_dir, fname)
        print(f"→ Processing {fname}")
        try:
            df = generate_feature_rich_dataset(path_in)
            out_name = os.path.splitext(fname)[0] + ".csv"
            df.to_csv(os.path.join(output_dir, out_name), index=False)
            print(f"  ✓ Saved {out_name}")
        except Exception as e:
            print(f"  ✗ Failed {fname}: {e}")

# --- USAGE ---
if __name__ == "__main__":
    process_pdf_directory("./pdfs", "./pdf_features")


