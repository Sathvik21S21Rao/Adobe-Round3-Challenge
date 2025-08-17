// app/api/relevance/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import jwt from 'jsonwebtoken';

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/pdf-analysis';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// ---------- Types ----------
interface ExtractedSection {
  document: string;
  section_title: string;
  page_number: number;
  page_height: number;
}

interface SubsectionAnalysis {
  document: string;
  refined_text: string;
  page_number: number;
  bbox?: [number, number, number, number];
  page_height?: number;
}



interface SubsectionItem {
  refined_text: string;
  page_number: number;
  bbox?: [number, number, number, number];
  page_height?: number;
}

interface SectionItem {
  section_title: string;
  page_number: number;
  page_height: number;
}


interface CombinedDoc {
  originalName: string;
  sections: SectionItem[];
  subsections: SubsectionItem[];
}

interface IncomingBody {
  folderId: string;
  userId?: string;
  query: string;
}

interface RelevanceAPIResponse {
  results: {
    extracted_sections: ExtractedSection[];
    subsection_analysis: SubsectionAnalysis[];
  };
}

// ---------- Auth helper ----------
async function getUserFromToken(request: NextRequest): Promise<string> {
  const token = request.cookies.get('token')?.value;
  if (!token) throw new Error('Not authenticated');

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    if (!decoded?.userId) throw new Error('Invalid token');
    return decoded.userId;
  } catch {
    throw new Error('Invalid or expired token');
  }
}

// ---------- Helper to get PDF ID + name mapping ----------
async function getPdfIdMapping(docNames: string[]): Promise<Record<string, { id: string; name: string }>> {
  if (!docNames.length) return {};

  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db();

    const pdfs = await db
      .collection('pdfs')
      .find({ filename: { $in: docNames } })
      .project({ originalName: 1 , filename: 1, _id: 1 })
      .toArray();

    const mapping: Record<string, { id: string; name: string }> = {};
    for (const pdf of pdfs) {
      if (pdf.originalName && pdf._id) {
        mapping[pdf.filename] = {
          id: pdf._id.toString(),
          name: pdf.originalName
        };
      }
    }
    return mapping;
  } finally {
    await client.close();
  }
}

// ---------- Route handler ----------
export async function POST(request: NextRequest) {
  try {
    const authedUserId = await getUserFromToken(request);

    const payload = (await request.json()) as IncomingBody;
    if (!payload?.folderId || !payload?.query) {
      return NextResponse.json(
        { error: 'folderId and query are required' },
        { status: 400 }
      );
    }

    const relevanceRes = await fetch('http://127.0.0.1:8000/relevance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folder_id: payload.folderId,
        user_id: authedUserId,
        query: payload.query,
      }),
    });
  

    if (!relevanceRes.ok) {
      const text = await relevanceRes.text().catch(() => '');
      return NextResponse.json(
        { error: 'Failed to fetch relevance data', details: text || relevanceRes.statusText },
        { status: 502 }
      );
    }
    
    const relevanceJson = (await relevanceRes.json()) as RelevanceAPIResponse;
    const { extracted_sections = [], subsection_analysis = [] } =
      relevanceJson?.results || {};

    const sectionsByDoc = extracted_sections.reduce<Record<string, SectionItem[]>>(
      (acc, { document, section_title, page_number,page_height }) => {
        acc[document] ??= [];
        const exists = acc[document].some(
          (s) => s.section_title === section_title
        );
        if (!exists) {
          acc[document].push({ section_title, page_number, page_height });
        }
        return acc;
      },
      {}
    );

    const subsectionsByDoc = subsection_analysis.reduce<
      Record<string, SubsectionItem[]>
    >((acc, { document, refined_text, page_number, bbox, page_height }) => {
      acc[document] ??= [];
      acc[document].push({ refined_text, page_number, bbox, page_height });
      return acc;
    }, {});

    const allDocs = new Set<string>([
      ...Object.keys(sectionsByDoc),
      ...Object.keys(subsectionsByDoc),
    ]);

    // Get mapping name → {id, name}
    const pdfIdMapping = await getPdfIdMapping(Array.from(allDocs));

    // Build combined keyed by pdfId
    const combined: Record<string, CombinedDoc> = {};
    for (const docName of allDocs) {
      const mapping = pdfIdMapping[docName];
      if (!mapping) continue;

      combined[mapping.id] = {
        originalName: mapping.name,
        sections: sectionsByDoc[docName] || [],
        subsections: subsectionsByDoc[docName] || [],
      };
    }
    return NextResponse.json({ combined });
  } catch (err: any) {
    const message =
      typeof err?.message === 'string' ? err.message : 'Unexpected error';
    const status =
      message.includes('auth') || message.includes('token') ? 401 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
