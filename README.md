# Adobe Round 3 Challenge

This project is a multi-service application consisting of:
- A Next.js frontend (`nextServices/`)
- A FastAPI backend (`pythonServices/`)
- A MongoDB database

All services are orchestrated using Docker Compose for easy setup and deployment.

## Folder Structure

```
adobe-r3/
│   .dockerignore
│   .gitignore
│   Dockerfile
│   entrypoint.sh
│   nginx.conf
│   supervisord.conf
├── nextServices/
│   ├── .dockerignore
│   ├── components.json
│   ├── next-env.d.ts
│   ├── next.config.mjs
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── postcss.config.mjs
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── app/
│   ├── components/
│   ├── contexts/
│   ├── hooks/
│   ├── lib/
│   ├── public/
│   ├── scripts/
│   ├── styles/
│   └── uploads/
├── pythonServices/
│   ├── .dockerignore
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── server.py
│   ├── ... (other Python scripts and model files)
│   ├── chroma_storage/
│   ├── saved_models/
```


## How to Run

1. **Clone the repository**

2. **Build Docker**
```bash
docker build -t adobe-round3 .
```

3. **Run container**

Include all the environment variables with -e flag. All the ports must be included as given below:

```bash
docker run -it -p 8080:8080 -p 8000:8000 -p 27017:27017 --name adobe-r3-container -e ADOBE_EMBED_API_KEY="...." -e GOOGLE_API_KEY="...." -e TTS_PROVIDER="..." -e GEMINI_MODEL="gemini-2.5-flash" -e LLM_PROVIDER="gemini" -e AZURE_TTS_ENDPOINT="...." -e AZURE_TTS_KEY="....."
```

## Features

- **PDF Upload & Folder Organization**  
  Upload PDFs and keep them neatly grouped by folders for better management and quick access.

- **User Authentication**  
  Secure user login to manage and access personalized document collections.

- **Smart PDF Store**  
  - Automatic PDF heading detection and structured chunking using Chroma DB.  
  - AI-powered PDF summaries and FAQ generation for faster understanding.  

- **AI-Powered Podcasts & Reading Guides**  
  - Generate a **3-minute podcast** summarizing all PDFs in a folder.  
  - Get an **intelligent reading guide** that recommends an optimal reading order based on document summaries.  

- **Interactive Document Navigation**  
  - Navigate through PDFs via detected headings.  
  - Select any text and retrieve related content from the same document or other PDFs in the folder.  

- **Insight Generation with LLM**  
  - Select text passages and generate AI-driven insights.  
  - Discover **supporting information**, **contradicting viewpoints**, and fun **“Did You Know?” facts** to enrich understanding.  

