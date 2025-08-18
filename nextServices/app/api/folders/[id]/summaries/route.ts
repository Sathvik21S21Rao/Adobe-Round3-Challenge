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

    return NextResponse.json({ success: true, summaries: joinedSummaries });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: "Failed to fetch summaries" });
  }
}
