// app/api/podcast/route.ts
import { NextResponse, NextRequest } from "next/server";
import { MongoClient, ObjectId } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const folderId = params.id;

    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db();
    const pdfs = db.collection("pdfs").find(
      { folderId: new ObjectId(folderId) }, // adjust if stored as string
      { projection: { originalName: 1, summary: 1 } }
    );
    const pdfSummaries = await pdfs.toArray();
    await client.close();

    const joinedSummaries=pdfSummaries.map(pdf=>`Summary of ${pdf.originalName}: ${pdf.summary}`).join("\n");

    // Call FastAPI backend
    const fastapiRes = await fetch("http://127.0.0.1:8000/podcast", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ summaries: joinedSummaries }),
    });

    if (!fastapiRes.ok) {
      const errText = await fastapiRes.text();
      console.error("FastAPI error:", errText);
      return NextResponse.json(
        { error: "Failed to generate podcast", details: errText },
        { status: 500 }
      );
    }

    const audioBuffer = await fastapiRes.arrayBuffer();

    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'attachment; filename="podcast.mp3"',
      },
    });
  } catch (error: any) {
    console.error("Route error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
