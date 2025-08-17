import { NextRequest, NextResponse } from 'next/server';
import { MongoClient, ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pdf-analysis';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

async function getUserFromToken(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
  if (!token) throw new Error('Not authenticated');
  
  const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
  return decoded.userId;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await getUserFromToken(request);
    const folderId = params.id;

    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db();

    // Verify folder ownership
    const folder = await db.collection('folders').findOne({
      _id: new ObjectId(folderId),
      userId: new ObjectId(userId)
    });

    if (!folder) {
      await client.close();
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }

    // Get PDFs in folder
    const pdfs = await db.collection('pdfs').find({
      folderId: new ObjectId(folderId)
    }).sort({ uploadDate: -1 }).toArray();

    await client.close();
    return NextResponse.json(pdfs);
  } catch (error) {
    console.error('Get PDFs error:', error);
    return NextResponse.json({ error: 'Failed to get PDFs' }, { status: 500 });
  }
}
