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

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserFromToken(request);

    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db();

    // Get folders with PDF count
    const folders = await db.collection('folders').aggregate([
      { $match: { userId: new ObjectId(userId) } },
      {
        $lookup: {
          from: 'pdfs',
          localField: '_id',
          foreignField: 'folderId',
          as: 'pdfs'
        }
      },
      {
        $addFields: {
          pdfCount: { $size: '$pdfs' }
        }
      },
      {
        $project: {
          pdfs: 0
        }
      },
      { $sort: { createdAt: -1 } }
    ]).toArray();

    await client.close();
    return NextResponse.json(folders);
  } catch (error) {
    console.error('Get folders error:', error);
    return NextResponse.json({ error: 'Failed to get folders' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserFromToken(request);
    const { name, description } = await request.json();

    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db();

    const result = await db.collection('folders').insertOne({
      name,
      description: description || '',
      userId: new ObjectId(userId),
      createdAt: new Date(),
    });

    await client.close();
    return NextResponse.json({ id: result.insertedId });
  } catch (error) {
    console.error('Create folder error:', error);
    return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
  }
}
