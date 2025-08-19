"use client";

import { useState, useEffect } from "react";
import { MessageCircle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";

interface InsightGeneratorProps {
  selected_text: string;
  currPDFId: string;
}

export default function InsightGenerator({
  selected_text,
  currPDFId,
}: InsightGeneratorProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState(""); // streaming Markdown content

  // Reset panel when text/pdf changes
  useEffect(() => {
    setInsight("");
    setOpen(false);
  }, [selected_text, currPDFId]);

  const handleGenerate = async () => {
    if (insight) {
      setOpen((prev) => !prev);
      return;
    }

    setOpen(true);
    setLoading(true);
    setInsight("");

    let summaries = "";
    let currPDFName = "";
    try {
      const res = await fetch(`/api/pdfs/${currPDFId}/summaries?get_all=true`);
      const data = await res.json();
      if (data.success) {
        summaries = data.summary;
        currPDFName = data.currPDFName;
      } else {
        summaries = "⚠️ Failed to fetch summaries.";
        currPDFName = "";
      }
    } catch (err) {
      console.error(err);
      summaries = "⚠️ Failed to fetch summaries.";
      currPDFName = "";
    }

    try {
      const serviceName = process.env.SERVICE_NAME || '127.0.0.1';
      const res = await fetch(`http://${serviceName}:8000/insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected_text, currPDFName, summaries }),
         cache: "no-store",
      });

      if (!res.ok || !res.body) {
        setInsight("⚠️ Failed to generate insights.");
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let str = "";

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          // Append chunk to insight for live Markdown rendering
          str += chunk;
        }
        done = readerDone;
      }

      // SIMULATE STREAMING
      const simulateStreaming = async () => {
        for (let i = 0; i < str.length; i++) {
          setInsight((prev) => prev + str[i]);
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      };

      await simulateStreaming();

      setLoading(false);
    } catch (err) {
      console.error(err);
      setInsight("⚠️ Failed to generate insights.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-10 right-24 flex flex-col items-end z-50">
      {/* Floating Button */}
      <div className="relative group">
        <button
          onClick={handleGenerate}
          className="w-12 h-12 flex items-center justify-center rounded-full shadow-lg bg-black hover:bg-indigo-600 transition-colors duration-300"
        >
          <MessageCircle className="w-6 h-6 text-white" />
        </button>
        <span className="absolute right-14 top-1/2 -translate-y-1/2 scale-0 group-hover:scale-100 transition bg-gray-800 text-white text-sm px-2 py-1 rounded-md">
          Generate insights
        </span>
      </div>

      {/* Insight Panel */}
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 w-[36rem] max-w-full max-h-[36rem] p-6 rounded-3xl shadow-2xl bg-white border border-gray-200 text-gray-800 overflow-y-auto overflow-x-hidden"
        >
          {loading && !insight && (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <p>Generating insights...</p>
            </div>
          )}

          {/* Live Markdown rendering */}
          {insight && (
            <div className="text-sm prose prose-sm max-w-full leading-relaxed break-words whitespace-pre-wrap overflow-x-hidden">
              <ReactMarkdown
                children={insight}
                components={{
                  code({ node, inline, className, children, ...props }) {
                    return (
                      <code
                        className="break-words whitespace-pre-wrap w-full"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  pre({ node, className, children, ...props }) {
                    return (
                      <pre
                        className="break-words whitespace-pre-wrap w-full"
                        {...props}
                      >
                        {children}
                      </pre>
                    );
                  },
                }}
              />
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
