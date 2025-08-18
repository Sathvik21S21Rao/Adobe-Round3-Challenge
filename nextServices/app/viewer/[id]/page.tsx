'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useRelevance } from '@/contexts/RelevanceContext';
import InsightGenerator from '@/components/InsightGenerator';
import { se } from 'date-fns/locale';

interface Heading {
  id: string;
  text: string;
  level: string;
  page: number;
  bbox: number[];
}
interface PDF {
  _id: string;
  filename: string;
  originalName: string;
  folderId: string;
}

declare global {
  interface Window {
    AdobeDC?: any;
  }
}

function buildHeadingTree(headings: Heading[]) {
  const root: any[] = [];
  const stack: any[] = [];

  headings.forEach((heading) => {
    const levelNum = parseInt(heading.level.replace('H', ''), 10);
    const node: any = { ...heading, children: [] };

    while (
      stack.length > 0 &&
      parseInt(stack[stack.length - 1].level.replace('H', ''), 10) >= levelNum
    ) {
      stack.pop();
    }
    if (stack.length === 0) root.push(node);
    else stack[stack.length - 1].children.push(node);

    stack.push(node);
  });

  return root;
}

export default function PDFViewerPage() {
  const [pdf, setPdf] = useState<PDF | null>(null);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [selectedHeading, setSelectedHeading] = useState<Heading | null>(null);
  const [selectedText, setSelectedText] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [viewerReady, setViewerReady] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const params = useParams();
  const router = useRouter();
  const pdfId = params.id as string;

  const viewerRef = useRef<any>(null); // annotation manager
  const apisRef = useRef<any>(null);   // PDF viewer APIs

  const { results, setResults } = useRelevance();

useEffect(() => {
  // Load PDF metadata and SDK in parallel
  const init = async () => {
    setLoading(true);
    try {
      await Promise.all([loadPDFData(), loadAdobeSDK()]);
      setLoading(false);
    } catch (err) {
      console.error("Init error:", err);
      setLoading(false);
    }
  };
  init();
}, [pdfId]);

  useEffect(() => {
    if (pdf && window.AdobeDC) initializePDFViewer();
  }, [pdf, results]);

  const loadPDFData = async () => {
    setLoading(true);
    try {
      const [pdfResponse, headingsResponse] = await Promise.all([
        fetch(`/api/pdfs/${pdfId}`),
        fetch(`/api/pdfs/${pdfId}/headings`),
      ]);
      if (pdfResponse.ok) setPdf(await pdfResponse.json());
      if (headingsResponse.ok) {
        const data = await headingsResponse.json();
        setHeadings(data.headings || []);
      }
    } catch (error) {
      console.error('Failed to load PDF data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAdobeSDK = async () => {
    if (window.AdobeDC) return;
    return new Promise<void>((resolve, reject) => {
      if (document.getElementById('adobe-dc-sdk')) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.id = 'adobe-dc-sdk';
      script.src = 'https://documentservices.adobe.com/view-sdk/viewer.js';
      script.onload = () => resolve();
      script.onerror = (err) => reject(err);
      document.head.appendChild(script);
    });
  };

  const initializePDFViewer = async () => {
    setViewerReady(false);
    try {
      await loadAdobeSDK();
      if (!window.AdobeDC || !pdf) return;

      const adobeDCView = new window.AdobeDC.View({
        clientId: process.env.NEXT_PUBLIC_PDF_EMBED_API_KEY!,
        divId: 'adobe-dc-view',
      });

      const previewFilePromise = adobeDCView.previewFile(
        {
          content: { location: { url: `/api/pdfs/${pdfId}/file` } },
          metaData: { fileName: pdf.originalName || 'document.pdf', id: pdf._id },
        },
        {
          embedMode: 'FULL_WINDOW',
          showAnnotationTools: true,
          showLeftHandPanel: true,
          enableFilePreviewEvents: true,
          enableAnnotationAPIs: true,
          includePDFAnnotations: true,
        }
      );

      previewFilePromise.then((adobeViewer: any) => {
        adobeViewer.getAnnotationManager().then(async (annotationManager: any) => {
          viewerRef.current = annotationManager;
          setViewerReady(true);

          const docData = results[pdfId];
          if (docData) {
            const { sections = [], subsections = [] } = docData;
            const now = new Date().toISOString();
            const annotations: any[] = [];

            const fitzToAdobeBBox = (fitzBBox: number[], pageHeight: number) => {
              const [x0, y0, x1, y1] = fitzBBox;
              return [x0, pageHeight - y1, x1, pageHeight - y0];
            };

            const buildAnnotation = (
              id: string,
              subtype: string,
              pageIndex: number,
              bbox: number[],
              color: string,
              page_height: number
            ) => {
              bbox = fitzToAdobeBBox(bbox, page_height);
              
              return {
                "@context": [
                  "https://www.w3.org/ns/anno.jsonld",
                  "https://comments.acrobat.com/ns/anno.jsonld"
                ],
                "type": "Annotation",
                "id": id,
                "bodyValue": "Highlighting!",
                "motivation": "commenting",
                "creator": { "type": "Person", "name": "System" },
                "created": now,
                "modified": now,
                "target": {
                  "source": pdf._id,
                  "selector": {
                    "type": "AdobeAnnoSelector",
                    "subtype": subtype,
                    "node": { "index": pageIndex - 1 },
                    "boundingBox": bbox,
                    "quadPoints": [
                      bbox[0], bbox[1], bbox[2], bbox[1],
                      bbox[0], bbox[3], bbox[2], bbox[3]
                    ],
                    "strokeColor": color,
                    "opacity": 1,
                    "styleClass": `${subtype}-auto`
                  }
                }
              };
            };

            sections.forEach((section, idx) => {
              if (section.bbox) {
                annotations.push(
                  buildAnnotation(
                    `section${idx}`,
                    'highlight',
                    section.page_number,
                    section.bbox,
                    '#FFA700',
                    section.page_height
                  )
                );
              }
            });

            subsections.forEach((sub, idx) => {
              if (sub.bbox) {
                annotations.push(
                  buildAnnotation(
                    `subsection${idx}`,
                    'highlight',
                    sub.page_number,
                    sub.bbox,
                    '#FFFF99',
                    sub.page_height
                  )
                );
              }
            });

            if (annotations.length) {
              for (const annotation of annotations) {
                try {
                  await annotationManager.addAnnotations([annotation]);
                } catch (e) {
                  console.error('Error adding annotation:', e);
                }
              }
            }
          }
        });

        adobeViewer.getAPIs().then((apis: any) => {
          apisRef.current = apis;
        });
      });

      adobeDCView.registerCallback(
        window.AdobeDC.View.Enum.CallbackType.EVENT_LISTENER,
        (event: any) => {
          if (event.type === 'PREVIEW_SELECTION_END') {
            previewFilePromise.then((v: any) => {
              v.getAPIs().then((apis: any) => {
                apis.getSelectedContent()
                  .then((res: any) => setSelectedText(res.data))
                  .catch(console.error);
              });
            });
          }
        },
        { enableFilePreviewEvents: true }
      );

    } catch (error) {
      console.error('Failed to initialize PDF viewer:', error);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const handleHeadingClick = (heading: Heading) => {
    if (!viewerReady || !apisRef.current?.gotoLocation) return;
    setSelectedHeading(heading);
    const pageNumber = heading.page + 1;
    setTimeout(() => apisRef.current.gotoLocation(pageNumber), 300);
  };

  function renderHeadings(items: any[], level = 1) {
    return items.map((item) => {
      const hasChildren = item.children?.length > 0;
      const isExpanded = expandedIds.has(item.id);
      const indentPx = (level - 1) * 24;
      const fontClasses =
        level === 1 ? 'font-semibold text-base' :
        level === 2 ? 'font-medium text-sm' :
        'font-normal text-xs';

      return (
        <div key={item.id}>
          <div
            className={`
              flex items-center cursor-pointer py-2 px-3 rounded-md
              ${selectedHeading?.id === item.id ? 'bg-indigo-700' : 'hover:bg-gray-800'}
              transition-colors duration-150
            `}
            style={{ paddingLeft: `${indentPx}px` }}
            onClick={() => handleHeadingClick(item)}
          >
            <div className={`flex-1 ${fontClasses}`}>
              <div className="whitespace-normal break-words">{item.text}</div>
              <div className="text-[11px] opacity-70">Page {item.page + 1}</div>
            </div>
            {hasChildren && (
              <div
                className="ml-2 text-xs opacity-80 select-none"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(item.id);
                }}
                style={{
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s ease',
                }}
              >
                ▶
              </div>
            )}
          </div>
          <AnimatePresence initial={false}>
            {hasChildren && isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
              >
                {renderHeadings(item.children, level + 1)}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  const headingTree = buildHeadingTree(headings);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="flex items-center px-3 py-1 text-sm border rounded-md 
              hover:bg-gray-900 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </button>
          <h1 className="text-lg font-semibold text-gray-800">
            {pdf?.originalName}
          </h1>
        </div>
      </header>

      <div className="flex h-[calc(100vh-64px)]">
        {/* Sidebar */}
        <aside className="w-72 bg-black text-white border-r border-gray-800 shadow-lg flex flex-col">
          <div className="p-4 border-b border-gray-800 space-y-4">
            {selectedText && (
              <div>
                <div className="bg-gray-900 text-gray-200 p-3 rounded-md text-sm">
                  <span className="block font-semibold mb-1">Selected Text</span>
                  { selectedText.length > 200 ? selectedText.slice(0, 200) + "...." : selectedText }
                </div>
                <Button
                  className="w-full bg-indigo-600 hover:bg-indigo-700 mt-2"
                  onClick={() => {
                    if (!selectedText) return;
                    fetch('/api/relevance', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ folderId: pdf?.folderId, query: selectedText }),
                    })
                      .then((res) => res.json())
                      .then((data) => { setResults(data.combined); })
                      .catch((err) => console.error('Error calling API:', err));
                  }}
                >
                  Search Relevant
                </Button>
              </div>
            )}
          </div>

          {/* Related PDFs */}
          {Object.keys(results).length > 0 && (
            <div className="p-3 border-b border-gray-800">
              <h2 className="text-lg font-bold mb-2">Related PDFs</h2>
              <ul className="space-y-2">
                {Object.entries(results).map(([item, val], idx: number) => (
                  <li key={idx}>
                    <button
                      className="text-indigo-400 hover:underline text-sm"
                      onClick={() => router.push(`/viewer/${item}`)}
                    >
                      {val.originalName || `PDF ${idx + 1}`}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="p-3 border-b border-gray-800">
            <h2 className="text-lg font-bold">Document Headings</h2>
          </div>

          <ScrollArea className="flex-1 bg-black text-white">
            <div className="p-2 space-y-1">{renderHeadings(headingTree)}</div>
          </ScrollArea>
        </aside>

        {/* PDF Viewer */}
        <main className="flex-1 bg-white">
          <div id="adobe-dc-view" className="w-full h-full"></div>
        </main>
      </div>

          {selectedText && (
            <InsightGenerator selected_text={selectedText} currPDFId={pdfId} />
          )}
      
    </div>
  );
}
