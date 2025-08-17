"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface RelevantItem {
  // Adjust to match your API response structure
  id?: string;
  title?: string;
  snippet?: string;
  [key: string]: any;
}

interface RelevanceContextType {
  results: RelevantItem[];
  setResults: (data: RelevantItem[]) => void;
  clearResults: () => void;
}

const RelevanceContext = createContext<RelevanceContextType | undefined>(undefined);

export const RelevanceProvider = ({ children }: { children: ReactNode }) => {
  const [results, setResultsState] = useState<RelevantItem[]>([]);

  const setResults = (data: RelevantItem[]) => setResultsState(data);
  const clearResults = () => setResultsState([]);

  return (
    <RelevanceContext.Provider value={{ results, setResults, clearResults }}>
      {children}
    </RelevanceContext.Provider>
  );
};

export const useRelevance = () => {
  const context = useContext(RelevanceContext);
  if (!context) throw new Error("useRelevance must be used within RelevanceProvider");
  return context;
};
