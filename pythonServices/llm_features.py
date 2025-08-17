from google import genai
from typing import List
from dotenv import load_dotenv
from pydantic import BaseModel
load_dotenv()

client = genai.Client()

class FAQ(BaseModel):
    question: str
    answer: str

class SummaryFAQ(BaseModel):
    summary: str
    faqs: List[FAQ]

class DialogueLine(BaseModel):
    speaker: str
    text: str

class PodcastScript(BaseModel):
    script: List[DialogueLine]

def get_summary_faq(path: str):
    # Upload file
    file = client.files.upload(file=path)

    # Generate structured response
    response = client.models.generate_content(
        model="gemini-2.0-flash-001",
        contents=["Summarize this document and generate FAQs. Use only the content from the document to generate FAQs and summary. Generate them in markdown format", file],
        config={
            "response_mime_type": "application/json",
            "response_schema": SummaryFAQ
        }
    )

    result = response.parsed
    return {
        "summary": result.summary,
        "FAQ": [{"question": faq.question, "answer": faq.answer} for faq in result.faqs]
    }



async def stream_insights(prev_summaries: str, selected_text: str, currPDFName: str):
    prompt = f"""A user is currently reading the following passage in the PDF **{currPDFName}**:  
{selected_text}  

They have previously read and summarized content from these PDFs:  
{prev_summaries}  

Your task:  
- Identify overlapping themes, reinforcing ideas, or contradictions between the current text and the previous summaries.
- Include "Did you know?" facts to make it more engaging.  
- Highlight nuanced perspectives, relevant examples, or connections that deepen understanding.  
- If appropriate, contrast methodologies, assumptions, or conclusions.  
- If some of the PDFs are irrelevant to the current text, strictly do not mention about them at all.  
- Don't return anything but the insight.
- Use headings to organize the content.
Return the output in **markdown** format.  
"""

    # Streaming API (sync generator)
    response_stream = client.models.generate_content_stream(
        model="gemini-2.0-flash",
        contents=[prompt]
    )

    # Wrap sync iteration in async generator
    for event in response_stream:
        if event.candidates and event.candidates[0].content.parts:
            for part in event.candidates[0].content.parts:
                if part.text:
                    yield part.text

def make_podcast(summaries:str):
    prompt = f"Create a podcast script based on the following summaries: {summaries}. The 2 podcast hosts are 'kore' and 'enceladus'. Make sure to include engaging dialogue and a clear narrative structure. The podcast should be about 5 minutes. Each person's dialogue should be at least 30 seconds."
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=[prompt],
        config={
            "response_mime_type": "application/json",
            "response_schema": PodcastScript
        }
    )
    result=response.parsed
    return { "script": [[dialog.speaker, dialog.text] for dialog in result.script ]}

async def stream_guide(summaries: str):
    prompt = f"""Create a comprehensive reading guide based on the following document summaries: {summaries}

Your task is to:
- Organize the content into a logical reading sequence that builds understanding progressively
- Identify key concepts, themes, and learning objectives from each document
- Suggest the optimal order for reading these documents and explain why
- Highlight important connections and dependencies between documents
- Include key questions readers should consider while reading each document
- Provide brief context about what makes each document valuable
- Suggest areas where readers should pay special attention
- Include practical tips for effective comprehension and retention
- Maintain brevity and keep it concise

Format the guide in **markdown** with clear headings and structure. Make it actionable and engaging for someone who wants to deeply understand this material."""
    response_stream = client.models.generate_content_stream(
        model="gemini-2.0-flash",
        contents=[prompt]
    )

    # Wrap sync iteration in async generator
    for event in response_stream:
        if event.candidates and event.candidates[0].content.parts:
            for part in event.candidates[0].content.parts:
                if part.text:
                    yield part.text