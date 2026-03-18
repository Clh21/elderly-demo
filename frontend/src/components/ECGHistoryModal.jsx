import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Eye, X } from 'lucide-react';
import ECGWaveform from './ECGWaveform';
import { fetchEcgHistory, fetchEcgHistoryDetail } from '../services/api';

const ECGHistoryModal = ({ isOpen, onClose, watchId }) => {
  const [page, setPage] = useState(1);
  const [selectedRecordId, setSelectedRecordId] = useState(null);

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['ecgHistory', watchId, page],
    queryFn: () => fetchEcgHistory(watchId, page, 10),
    enabled: isOpen && !!watchId,
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['ecgHistoryDetail', watchId, selectedRecordId],
    queryFn: () => fetchEcgHistoryDetail(watchId, selectedRecordId),
    enabled: isOpen && !!watchId && !!selectedRecordId,
  });

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">ECG History</h2>
              <p className="text-sm text-slate-500">Latest ECG tests for {watchId}</p>
            </div>
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="p-6">
            {historyLoading ? (
              <div className="text-sm text-slate-500">Loading ECG history...</div>
            ) : historyData?.items?.length ? (
              <>
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Recorded at</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Rhythm</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Rate</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Samples</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Duration</th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {historyData.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3 text-sm text-slate-700">{new Date(item.recordedAt || item.sourceTimestamp).toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-slate-900">{item.ecgResult || '--'}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{item.ecgHeartRate != null ? `${item.ecgHeartRate} bpm` : '--'}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{item.ecgSampleCount ?? '--'}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{item.ecgDurationSeconds != null ? `${item.ecgDurationSeconds}s` : '--'}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedRecordId(item.id)}
                              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Eye className="h-4 w-4" />
                              <span>View ECG</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-slate-500">
                    Page {historyData.page} of {historyData.totalPages}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      disabled={page <= 1}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span>Previous</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage((current) => Math.min(historyData.totalPages, current + 1))}
                      disabled={page >= historyData.totalPages}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span>Next</span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
                No ECG history available for this watch.
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedRecordId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">ECG Record Detail</h3>
                <p className="text-sm text-slate-500">
                  {detailData?.recordedAt || detailData?.sourceTimestamp ? new Date(detailData.recordedAt || detailData.sourceTimestamp).toLocaleString() : 'Loading...'}
                </p>
              </div>
              <button type="button" onClick={() => setSelectedRecordId(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6">
              {detailLoading || !detailData ? (
                <div className="text-sm text-slate-500">Loading ECG record...</div>
              ) : (
                <>
                  <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Rhythm</div>
                      <div className="text-base font-semibold text-slate-900">{detailData.ecgResult || '--'}</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Rate</div>
                      <div className="text-base font-semibold text-slate-900">{detailData.ecgHeartRate != null ? `${detailData.ecgHeartRate} bpm` : '--'}</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Samples</div>
                      <div className="text-base font-semibold text-slate-900">{detailData.ecgSampleCount ?? '--'}</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Duration</div>
                      <div className="text-base font-semibold text-slate-900">{detailData.ecgDurationSeconds != null ? `${detailData.ecgDurationSeconds}s` : '--'}</div>
                    </div>
                  </div>

                  <ECGWaveform
                    chartData={detailData.ecgHistory}
                    durationSeconds={detailData.ecgDurationSeconds}
                    displayRangeMv={detailData.ecgDisplayRangeMv}
                    height={380}
                  />

                  <div className="mt-4 text-sm text-slate-600">
                    {detailData.ecgInterpretationBasis || 'Rhythm classification is based on R-peak detection and R-R interval regularity in the selected ECG waveform.'}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ECGHistoryModal;