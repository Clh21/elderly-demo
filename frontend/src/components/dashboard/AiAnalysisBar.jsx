import React, { useState } from 'react';
import { Bot, Loader2 } from 'lucide-react';
import { fetchAiAnalysis } from '../../services/api';
import { toast } from 'sonner';

const AiAnalysisBar = ({ watchId }) => {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  const handleAnalyze = async () => {
    if (!watchId) return;
    setLoading(true);
    try {
      const result = await fetchAiAnalysis(watchId);
      setAnalysis(result.analysis);
      toast.success('AI Analysis complete');
    } catch (err) {
      toast.error('Failed to get AI Analysis: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!watchId) return null;

  return (
    <div className="mt-6 rounded-xl border border-indigo-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Zhipu AI Health Analysis</h3>
            <p className="text-sm text-gray-500">Analyze the last 24 hours of health data using GLM-4-Flash</p>
          </div>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? 'Analyzing...' : 'Run Analysis'}
        </button>
      </div>

      {analysis && (
        <div className="mt-4 rounded-lg bg-indigo-50 p-4 text-sm leading-relaxed text-indigo-900">
          <div className="whitespace-pre-wrap">
            {analysis}
          </div>
        </div>
      )}
    </div>
  );
};

export default AiAnalysisBar;