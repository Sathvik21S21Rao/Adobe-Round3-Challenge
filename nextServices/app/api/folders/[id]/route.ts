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

    const folder = await db.collection('folders').findOne({
      _id: new ObjectId(folderId),
      userId: new ObjectId(userId)
    });

    await client.close();

    if (!folder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }

    return NextResponse.json(folder);
  } catch (error) {
    console.error('Get folder error:', error);
    return NextResponse.json({ error: 'Failed to get folder' }, { status: 500 });
  }
}
