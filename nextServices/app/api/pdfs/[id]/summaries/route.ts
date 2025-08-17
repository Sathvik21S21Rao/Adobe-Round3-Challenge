import { NextResponse,NextRequest } from "next/server";
import {MongoClient, ObjectId} from "mongodb";
import jwt from 'jsonwebtoken';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pdf-analysis';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';


async function getUserFromToken(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
  if (!token) throw new Error('Not authenticated');

  const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
  return decoded.userId;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const userId = await getUserFromToken(request);

    const pdfId = params.id;
    const { searchParams } = new URL(request.url);
    const get_all = searchParams.get('get_all') === 'true';
    const client = new MongoClient(MONGODB_URI);
    try {
        await client.connect();
        const database = client.db();
        const pdfs = database.collection('pdfs');
        const pdf = await pdfs.findOne({ _id: new ObjectId(pdfId), userId: new ObjectId(userId) });

        if (!pdf) {
            return NextResponse.json({ success: false, error: 'PDF not found' });
        }
        if(get_all){
            const folderId = pdf.folderId;
            const pdfs = database.collection('pdfs');
            const allSummaries=await pdfs.find(
  { folderId: new ObjectId(folderId), userId: new ObjectId(userId) },
  { projection: { summary: 1 } }
).toArray();
    const stringSummaries = allSummaries.map(pdf => `${pdf.filename}: ${pdf.summary}`).join('\n');
            return NextResponse.json({ success: true, summary: stringSummaries, currPDFName: pdf.originalName });
        }
        return NextResponse.json({ success: true, summary: pdf.summary });
    } catch (error) {
        console.error('Error fetching PDF:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch PDF' });
    } finally {
        await client.close();
    }
}