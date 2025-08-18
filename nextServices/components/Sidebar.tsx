"use client";

import { useState, useEffect } from "react";
import { Mic2, BookOpen, Loader2, X, PanelRightOpen } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface SidebarProps {
  folderId: string;
  pdfList: string[];
}

export default function Sidebar({ folderId, pdfList }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [response, setResponse] = useState<string>("");

  const [audioLoading, setAudioLoading] = useState(false);
  const [guideLoading, setGuideLoading] = useState(false);

  const [prevPdfList, setPrevPdfList] = useState<string[]>([]);
  const [prevFolderId, setPrevFolderId] = useState<string>("");

  // Reset audio/guide if folderId or pdfList changes
  useEffect(() => {
    if (
      JSON.stringify(pdfList) !== JSON.stringify(prevPdfList) ||
      folderId !== prevFolderId
    ) {
      setAudioUrl(null);
      setResponse("");
      setPrevPdfList(pdfList);
      setPrevFolderId(folderId);
    }
  }, [pdfList, folderId, prevPdfList, prevFolderId]);

  const generatePodcast = async () => {
    if (audioUrl) return; // don't regenerate if already exists

    setAudioLoading(true);
    try {
      const res = await fetch(`/api/folders/${folderId}/podcast`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to generate podcast");
      const blob = await res.blob();
      setAudioUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
    } finally {
      setAudioLoading(false);
    }
  };

  const generateGuide = async () => {
    if (response) return; // don't regenerate if already exists

    setGuideLoading(true);
    try {
      const resSummaries = await fetch(`/api/folders/${folderId}/summaries`, { method: "POST" });
      if (!resSummaries.ok) throw new Error("Failed to fetch summaries");

      const data = await resSummaries.json();
      const summaries = data.summaries;
      const serviceName = process.env.SERVICE_NAME || '127.0.0.1';
      const res = await fetch(`http://${serviceName}:8000/guide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summaries }),
        cache: "no-store",
   
      });

      if (!res.ok || !res.body) {
        setResponse("⚠️ Failed to generate guide.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          setResponse((prev) => prev + chunk);
        }
        done = readerDone;
      }
    } catch (err) {
      console.error(err);
      setResponse("⚠️ Something went wrong.");
    } finally {
      setGuideLoading(false);
    }
  };

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed top-4 right-4 z-50 p-2 bg-indigo-600 text-white rounded-md shadow-lg hover:bg-indigo-700"
        >
          <PanelRightOpen className="w-5 h-5" />
        </button>
      )}

      <div
  className={`fixed top-0 right-0 h-full w-[450px] bg-gray-50 border-l border-gray-200 shadow-lg transform transition-transform duration-300 z-40 flex flex-col ${
    isOpen ? "translate-x-0" : "translate-x-full"
  }`}
>

        <div className="px-4 py-3 border-b bg-white flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">AI Assistant</h2>
          <button onClick={() => setIsOpen(false)} className="p-1 rounded-md hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="flex flex-col p-3 gap-2 border-b">
          <button
            onClick={generatePodcast}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-white border text-gray-700 hover:bg-indigo-50 transition"
          >
            <Mic2 className="w-4 h-4" />
            Generate Podcast
          </button>
          <button
            onClick={generateGuide}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-white border text-gray-700 hover:bg-indigo-50 transition"
          >
            <BookOpen className="w-4 h-4" />
            Reading Guide
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Podcast Section */}
          {audioLoading && (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <p>Generating podcast...</p>
            </div>
          )}
          {audioUrl && (
            <div className="flex flex-col items-center gap-3">
              <audio controls src={audioUrl} className="w-full" />
              <a
                href={audioUrl}
                download="podcast.mp3"
                className="px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
              >
                ⬇ Download Podcast
              </a>
            </div>
          )}

          {/* Guide Section */}
          {guideLoading && !response && (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <p>Generating guide...</p>
            </div>
          )}
          {response && (
            <div className="prose prose-sm max-w-none break-all whitespace-pre-wrap overflow-x-hidden">
              <ReactMarkdown>{response}</ReactMarkdown>
            </div>
          )}

          {/* Empty state */}
          {!audioUrl && !response && !audioLoading && !guideLoading && (
            <p className="text-gray-500 italic">Click a button to generate content.</p>
          )}
        </div>
      </div>
    </>
  );
}
