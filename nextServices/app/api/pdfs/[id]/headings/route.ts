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
    const pdfId = params.id;

    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db();

    // Verify PDF ownership
    const pdf = await db.collection('pdfs').findOne({
      _id: new ObjectId(pdfId),
      userId: new ObjectId(userId)
    });

    if (!pdf) {
      await client.close();
      return NextResponse.json({ error: 'PDF not found' }, { status: 404 });
    }
    await client.close();
    // Fetch headings for the PDF
    const headings=pdf.headings.outline.map((heading: any,index:number) => ({
      id: index.toString(),
      text: heading.text,
      level: heading.level,
      page: heading.page,
      bbox: heading.bbox
    }));

    return NextResponse.json({ headings });

  } catch (error) {
    console.error('Failed to fetch PDF headings:', error);
    return NextResponse.json({ error: 'Failed to fetch PDF headings' }, { status: 500 });
}
}
