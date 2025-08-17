from pdf_title_outline_extractor import batch_process_pdfs,process_single_pdf
from infer_realtime import predict_headings,predict_single_pdf
import os,json

def main():
    batch_process_pdfs("./input","./output")
    predict_headings(
        model_path="./xgb_model.pkl",
        annotated_dir="./output",
        output_dir="./output"
)

def get_single_pdf_prediction(model_path,file_path):
    doc=process_single_pdf(file_path)
    return predict_single_pdf(model_path=model_path, doc=doc)


if __name__ == "__main__":
    main()

