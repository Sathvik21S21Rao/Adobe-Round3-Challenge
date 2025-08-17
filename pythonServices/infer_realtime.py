import os
import json
import glob
import pickle
import shutil
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb


def predict_headings(
    model_path="XGB.pkl",
    annotated_dir="output",
    output_dir="predicted_jsons"
):
    """
    Predict heading levels (H1, H2, H3) from annotated JSONs using a trained XGBoost model.
    Skips predictions labeled as "OTHER". If outline is empty, copy file as-is.

    Parameters:
        model_path (str): Path to trained XGBoost model pickle file.
        annotated_dir (str): Directory containing annotated JSON files.
        output_dir (str): Directory where output JSON files will be saved.
    """

    os.makedirs(output_dir, exist_ok=True)

    # === 1) Load model and features ===
    with open(model_path, "rb") as f:
        data = pickle.load(f)

    if isinstance(data, tuple) and len(data) == 3:
        clf, feature_cols, model_type = data
    else:
        clf, feature_cols = data
        model_type = "xgb"

    if model_type != "xgb":
        raise ValueError("Expected XGB model type")

    if "prev_label" not in feature_cols:
        feature_cols.append("prev_label")

    labels = {0: "H1", 1: "H2", 2: "H3", 3: "OTHER"}

    # === 2) Process each input JSON file ===
    for jfile in glob.glob(os.path.join(annotated_dir, "*.json")):
        
        with open(jfile, "r", encoding="utf-8") as f:
            doc = json.load(f)

        outline_entries = doc.get("outline", [])

        if not outline_entries:
            
            continue

        records = []
        for idx, entry in enumerate(outline_entries):
            feats = entry.get("features", {})
            row = {k: feats[k] for k in feats if isinstance(feats[k], (int, float, bool))}
            row["index_in_file"] = idx
            row["text"] = entry.get("text", "")
            row["page"] = entry.get("page", None)
            records.append(row)

        df = pd.DataFrame(records).sort_values("index_in_file").reset_index(drop=True)

        prev_pred = 3  # Start with "OTHER"
        output_outline = []

        for _, row in df.iterrows():
            x = {}
            for feat in feature_cols:
                if feat == "prev_label":
                    x[feat] = prev_pred
                else:
                    x[feat] = row.get(feat, 0)

            X_df = pd.DataFrame([[x[c] for c in feature_cols]], columns=feature_cols)
            dtest = xgb.DMatrix(X_df, feature_names=feature_cols)

            probs = clf.predict(dtest)
            pred = int(np.argmax(probs))
            
            prev_pred = pred
            if labels[pred] == "OTHER":
              
                continue  # Skip OTHER predictions

            output_outline.append({
                "text": row["text"],
                "level": labels[pred],
                "page": row["page"]
            })

        # === 3) Save output JSON ===
        output_json = {
            "title": doc.get("title", Path(jfile).stem),
            "outline": output_outline
        }

        out_path = os.path.join(output_dir, Path(jfile).name)
        with open(out_path, "w", encoding="utf-8") as out_f:
            json.dump(output_json, out_f, indent=2, ensure_ascii=False)

def predict_single_pdf(
    model_path="XGB.pkl",
    doc={}
):
    with open(model_path, "rb") as f:
        data = pickle.load(f)

    if isinstance(data, tuple) and len(data) == 3:
        clf, feature_cols, model_type = data
    else:
        clf, feature_cols = data
        model_type = "xgb"

    if model_type != "xgb":
        raise ValueError("Expected XGB model type")

    if "prev_label" not in feature_cols:
        feature_cols.append("prev_label")

    labels = {0: "H1", 1: "H2", 2: "H3", 3: "OTHER"}

    outline_entries = doc.get("outline", [])
    if not outline_entries:
        return []

    records = []
    for idx, entry in enumerate(outline_entries):
        feats = entry.get("features", {})
        row = {k: feats[k] for k in feats if isinstance(feats[k], (int, float, bool))}
        row["index_in_file"] = idx
        row["text"] = entry.get("text", "")
        row["page"] = entry.get("page", None)
        records.append(row)

    df = pd.DataFrame(records).sort_values("index_in_file").reset_index(drop=True)

    prev_pred = 3  # Start with "OTHER"
    output_outline = []

    for _, row in df.iterrows():
        x = {}
        for feat in feature_cols:
            if feat == "prev_label":
                    x[feat] = prev_pred
            else:
                x[feat] = row.get(feat, 0)

        X_df = pd.DataFrame([[x[c] for c in feature_cols]], columns=feature_cols)
        dtest = xgb.DMatrix(X_df, feature_names=feature_cols)

        probs = clf.predict(dtest)
        pred = int(np.argmax(probs))
            
        prev_pred = pred
        if labels[pred] == "OTHER":
              
            continue  # Skip OTHER predictions

        output_outline.append({
                "text": row["text"],
                "level": labels[pred],
                "page": row["page"]
            })

        # === 3) Save output JSON ===
    
    output= {
        "title": doc.get("title", "Unknown Title"),
        "outline": output_outline
    }

    return output

if __name__ =="__main__":
    predict_headings(
        model_path="./xgb_model.pkl",
        annotated_dir="output",
        output_dir="output"
    )