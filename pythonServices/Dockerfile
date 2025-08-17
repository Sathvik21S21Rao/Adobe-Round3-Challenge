FROM python:3.10-slim

RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    libffi-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*
# Set the working directory
WORKDIR /app
# Copy the requirements file
COPY requirements.txt .
# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt
# Copy the application code
COPY download_nltk.py .
COPY process_pdfs.py .
COPY multi_model_class.py .
COPY final_nltk.py .
COPY pdf_title_outline_extractor.py .
COPY infer_realtime.py .
COPY xgb_model.pkl .
RUN python download_nltk.py
CMD ["python", "process_pdfs.py"]
