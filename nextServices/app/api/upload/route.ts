import { NextRequest, NextResponse } from 'next/server';
import { MongoClient, ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pdf-analysis';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

async function getUserFromToken(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
  if (!token) throw new Error('Not authenticated');

  const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
  return decoded.userId;
}

export async function POST(request: NextRequest) {
  let client: MongoClient | null = null;

  try {
    const userId = await getUserFromToken(request);
    const formData = await request.formData();
    const folderId = formData.get('folderId') as string;
    const files = formData.getAll('pdfs') as File[]; 

    if (!folderId || files.length === 0) {
      return NextResponse.json({ error: 'Missing folder ID or files' }, { status: 400 });
    }

    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db();

    // Verify folder ownership
    const folder = await db.collection('folders').findOne({
      _id: new ObjectId(folderId),
      userId: new ObjectId(userId),
    });

    if (!folder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }

    // Create upload directory if not exists
    await mkdir(UPLOAD_DIR, { recursive: true });

    const insertedIds: string[] = [];

    for (const file of files) {
      // Generate unique filename
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filename = `${timestamp}-${safeName}`;
      const filepath = path.join(UPLOAD_DIR, filename);

      // Save file to disk
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      await writeFile(filepath, buffer);

      // Save metadata to DB
      const pdfDoc = {
        filename,
        originalName: file.name,
        folderId: new ObjectId(folderId),
        userId: new ObjectId(userId),
        size: file.size,
        uploadDate: new Date(),
        headingsProcessed: false,
        filepath,
      };

      const result = await db.collection('pdfs').insertOne(pdfDoc);
      insertedIds.push(result.insertedId.toString());
    }

    // Process headings one by one 🔄
    for (const pdfId of insertedIds) {
      await processHeadings(pdfId);
    }

    return NextResponse.json({ ids: insertedIds });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  } finally {
    if (client) {
      await client.close();
    }
  }
}

// Simulate heading detection for one PDF
async function processHeadings(pdfId: string) {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db();
    const pdfDoc = await db.collection('pdfs').findOne({ _id: new ObjectId(pdfId) });

    if (!pdfDoc) {
      console.error(`PDF ${pdfId} not found for heading processing`);
      return;
    }

    const response = await fetch('http://127.0.0.1:8000/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_path: pdfDoc.filepath,
        folder_id: pdfDoc.folderId,
        user_id: pdfDoc.userId,
      }),
    });

    if (response.ok) {
      const json = await response.json();
      const headings = json.result;
      const summary = json.summary;
      const faq = json.faq;

      await db.collection('pdfs').updateOne(
        { _id: new ObjectId(pdfId) },
        { $set: { headingsProcessed: true, headings, summary, faq } }
      );
    }
  } catch (err) {
    console.error(`Error processing headings for PDF ${pdfId}:`, err);
  } finally {
    await client.close();
  }
}
