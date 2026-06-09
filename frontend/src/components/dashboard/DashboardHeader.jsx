import React from 'react';
import { ArrowLeft, Watch } from 'lucide-react';

const formatDateTime = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const DashboardHeader = ({
  canReturnToResidentList,
  resident,
  selectedWatch,
  watchData,
  fallbackResidentName,
  onBackToResidentList,
}) => (
  <>
    <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-start">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-gray-900">Elderly Care Dashboard</h1>
        <p className="text-gray-600">
          Real-time health monitoring and emergency alerts for {resident?.name || fallbackResidentName || 'your assigned resident'}
        </p>
      </div>
      {canReturnToResidentList ? (
        <button
          type="button"
          onClick={onBackToResidentList}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to resident list
        </button>
      ) : null}
    </div>

    <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Watch className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">
              {resident?.name || 'Assigned resident'}
            </div>
            <div className="text-sm text-gray-500">
              Watch ID: {selectedWatch || 'Unavailable'}
              {resident?.room ? ` - Room ${resident.room}` : ''}
            </div>
          </div>
        </div>
        {watchData?.timestamp ? (
          <div className="text-sm text-gray-500">Latest update: {formatDateTime(watchData.timestamp) || '--'}</div>
        ) : null}
      </div>
    </div>
  </>
);

export default DashboardHeader;
