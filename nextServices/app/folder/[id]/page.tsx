'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ArrowLeft, Upload, FileText, Eye, HelpCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import Sidebar from '@/components/Sidebar';

// --- Types ---
interface PDF {
  _id: string;
  filename: string;
  originalName: string;
  uploadDate: string;
  size: number;
  headingsProcessed: boolean;
}

interface Folder {
  _id: string;
  name: string;
  description: string;
}

// --- Data loaders (client-safe via fetch) ---
async function fetchFolder(folderId: string): Promise<Folder> {
  const res = await fetch(`/api/folders/${folderId}`);
  if (!res.ok) throw new Error('Failed to load folder');
  return res.json();
}

async function fetchPDFs(folderId: string): Promise<PDF[]> {
  const res = await fetch(`/api/folders/${folderId}/pdfs`);
  if (!res.ok) throw new Error('Failed to load PDFs');
  return res.json();
}

// --- Loading spinner fallback ---
function Loader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
    </div>
  );
}

// --- PDF List Component (wrapped in Suspense) ---
function PdfList({ folderId }: { folderId: string }) {
  const [pdfs, setPdfs] = useState<PDF[] | null>(null);
  const [folder, setFolder] = useState<Folder | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);           // For summary dialog
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false); // NEW
  const [uploading, setUploading] = useState(false); // NEW
  const router = useRouter();
  const [faqOpen, setFaqOpen] = useState(false);
  const [faq, setFaq] = useState<Array<{ question: string; answer: string }> | null>(null);
  const [loadingFAQ, setLoadingFAQ] = useState(false);

  useEffect(() => {
    fetchFolder(folderId).then(setFolder).catch(console.error);
    fetchPDFs(folderId).then(setPdfs).catch(console.error);
  }, [folderId]);

  const handleGetSummary = async (pdfId: string) => {
    setLoadingSummary(true);
    try {
      const res = await fetch(`/api/pdfs/${pdfId}/summaries`);
      if (!res.ok) throw new Error('Failed to fetch summary');
      const data = await res.json();
      setSummary(data.summary); // expecting { summary: "..." }
    } catch (err) {
      console.error(err);
      setSummary('Error loading summary.');
    } finally {
      setLoadingSummary(false);
      setSummaryOpen(true);
    
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

   const handlePdfUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem('pdfs') as HTMLInputElement;
    if (!input?.files || input.files.length === 0) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('folderId', folderId);
      Array.from(input.files).forEach(file => formData.append('pdfs', file));

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        setIsUploadDialogOpen(false);
        // Reload PDFs
        const updatedPdfs = await fetchPDFs(folderId);
        setPdfs(updatedPdfs);
      }
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };
  const handleGetFAQ = async (pdfId: string) => {
    setLoadingFAQ(true);
    try {
      const res = await fetch(`/api/pdfs/${pdfId}/faqs`);
      if (!res.ok) throw new Error('Failed to fetch FAQ');
      const data = await res.json();
      setFaq(data.faq); // expecting { faq: "..." }
    } catch (err) {
      console.error(err);
      
    } finally {
      setLoadingFAQ(false);
      setFaqOpen(true);
    }
  };
  if (!folder || !pdfs) return <Loader />;

  return (
    <>
      <header className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center space-x-4">
            <Button
              onClick={() => router.push('/dashboard')}
              variant="outline"
              size="sm"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{folder?.name}</h1>
              {folder?.description && (
                <p className="text-gray-600">{folder.description}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">PDF Documents</h2>
          <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="w-4 h-4 mr-2" />
                Upload PDFs
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload PDF Document(s)</DialogTitle>
                <DialogDescription>
                  Select one or more PDF files to upload to this folder.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handlePdfUpload} className="space-y-4">
                <Input
                  name="pdfs"
                  type="file"
                  accept="application/pdf"
                  multiple
                  required
                />
                <Button type="submit" className="w-full" disabled={uploading}>
                  {uploading ? 'Uploading...' : 'Upload PDF(s)'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {pdfs.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <FileText className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No PDFs yet</h3>
              <p className="text-gray-600 mb-4">
                Upload your first PDF document to get started with analysis.
              </p>
              <Button onClick={() => setIsUploadDialogOpen(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Your First PDF(s)
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pdfs.map((pdf) => (
              // ...card code unchanged...
              <Card key={pdf._id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    <FileText className="w-8 h-8 text-red-600" />
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{pdf.originalName}</CardTitle>
                      <CardDescription>
                        {formatFileSize(pdf.size)} • {new Date(pdf.uploadDate).toLocaleDateString()}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          pdf.headingsProcessed
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {pdf.headingsProcessed ? 'Processed' : 'Processing...'}
                      </span>
                    </div>
                    <div className="flex gap-2">

                      <Button
                        onClick={() => router.push(`/viewer/${pdf._id}`)}
                        variant="outline"
                        size="sm"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View
                      </Button>
                      <Button onClick={() => handleGetFAQ(pdf._id)} variant="outline" size="sm">
                        <HelpCircle className="w-4 h-4 mr-2" />
                        FAQ
                      </Button>
                      <Button
                        onClick={() => handleGetSummary(pdf._id)}
                        variant="outline"
                        size="sm"
                      >
                        {loadingSummary ? 'Loading...' : 'Get Summary'}
                      </Button>

                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Summary Modal (unchanged) */}
      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Summary</DialogTitle>
            <DialogDescription>
              {loadingSummary
                ? 'Fetching summary...'
                : 'Generated summary of the document.'}
            </DialogDescription>
          </DialogHeader>
          <div className="prose max-h-[70vh] overflow-y-auto">
            {summary ? <ReactMarkdown>{summary}</ReactMarkdown> : 'No summary available.'}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={faqOpen} onOpenChange={setFaqOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
        <DialogTitle>FAQ</DialogTitle>
        <DialogDescription>
          {loadingFAQ
            ? 'Fetching FAQ...'
            : 'Generated FAQ for the document.'}
        </DialogDescription>
          </DialogHeader>
          <div className="prose max-h-[70vh] overflow-y-auto space-y-4">
        {faq ? (
          faq.map((item: {question: string, answer: string}, index: number) => (
            <div key={index} className="border-b pb-4 last:border-b-0">
          <h4 className="font-semibold text-gray-900 mb-2">{item.question}</h4>
          <div className="text-gray-700">
            <ReactMarkdown>{item.answer}</ReactMarkdown>
          </div>
            </div>
          ))
        ) : (
          'No FAQ available.'
        )}
          </div>
        </DialogContent>
      </Dialog>
      <Sidebar folderId={folderId} pdfList={pdfs.map(pdf => pdf.originalName)} />
    </>
  );

}

// --- Page Component ---
export default function FolderPage() {
  const params = useParams();
  const folderId = params.id as string;

  return (
    <Suspense fallback={<Loader />}>
      <PdfList folderId={folderId} />
    </Suspense>
  );
}
