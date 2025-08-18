from fastapi import FastAPI
from pydantic import BaseModel
from process_pdfs import get_single_pdf_prediction
from chunking_3 import create_chunks_with_sections
from semantic_search_3 import format_search_results,perform_semantic_search
from llm_features import get_summary_faq,stream_insights,make_podcast,stream_guide
from fastapi.responses import StreamingResponse,FileResponse
from generate_audio import generate_podcast



app = FastAPI()
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # or ["http://localhost:3000"] for more security
    allow_credentials=True,
    allow_methods=["*"],   # important! allows POST, OPTIONS, etc.
    allow_headers=["*"],
)


class PDFRequest(BaseModel):
    file_path: str
    folder_id: str
    user_id: str

class Relevance(BaseModel):
    folder_id:str
    user_id:str
    query:str

class InsightRequest(BaseModel):
    selected_text: str
    currPDFName: str
    summaries: str

class PodcastRequest(BaseModel):
    summaries: str

class GuideRequest(BaseModel):
    summaries: str

@app.post("/predict")
def predict(request: PDFRequest):
    model_path = "./xgb_model.pkl"
    result = get_single_pdf_prediction(model_path=model_path, file_path=request.file_path)
    
    # Create chunks with sections
    chunks, sections = create_chunks_with_sections(
        pdf_path=request.file_path,
        headers=result.get("outline", []) if type(result) is dict else [],
        folder_id=request.folder_id,
        user_id=request.user_id
    )
    summary_faq = get_summary_faq(request.file_path)
    return {"result":result,"summary":summary_faq["summary"],"faq":summary_faq["FAQ"]}

@app.post("/relevance")
def similar(request: Relevance):
    query = request.query
    user_id = request.user_id
    folder_id = request.folder_id
   

    # Perform semantic search
    results = perform_semantic_search(query, user_id=user_id, folder_id=folder_id, top_k=10)

    # Format search results
    formatted_results = format_search_results(query, results, top_k=10)

    return {"results": formatted_results}

@app.post("/insights")
async def insights(request: InsightRequest):
    prev_summaries = request.summaries
    selected_text = request.selected_text
    currPDFName = request.currPDFName
    async def event_generator():
        async for chunk in stream_insights(prev_summaries, selected_text, currPDFName):
            yield chunk.encode('utf-8')

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/podcast")
def podcast(request: PodcastRequest):
    conversation=make_podcast(request.summaries)["script"]
    generate_podcast(conversation, "podcast.mp3")
    return FileResponse("podcast.mp3", media_type="audio/mpeg")

@app.post("/guide")
async def guide(request: GuideRequest):
    summaries = request.summaries
    async def event_generator():
        async for chunk in stream_guide(summaries):
            
            yield chunk.encode('utf-8')

    return StreamingResponse(event_generator(), media_type="text/event-stream")
