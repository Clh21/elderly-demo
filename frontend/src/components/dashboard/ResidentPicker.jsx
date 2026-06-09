import React from 'react';
import { MapPin, Users } from 'lucide-react';

const skeletonItems = [1, 2, 3, 4, 5, 6];

const ResidentPickerSkeleton = () => (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
    {skeletonItems.map((item) => (
      <div key={item} className="h-36 animate-pulse rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="h-4 w-1/2 rounded bg-gray-200" />
        <div className="mt-4 h-3 w-3/4 rounded bg-gray-200" />
        <div className="mt-3 h-3 w-2/3 rounded bg-gray-200" />
      </div>
    ))}
  </div>
);

const ResidentPicker = ({ residents, isLoading, onSelectResident }) => (
  <>
    <div className="mb-8">
      <h1 className="mb-2 text-3xl font-bold text-gray-900">Select Resident</h1>
      <p className="text-gray-600">
        Choose a resident before opening their watch dashboard.
      </p>
    </div>

    {isLoading ? (
      <ResidentPickerSkeleton />
    ) : residents.length ? (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {residents.map((resident) => (
          <button
            key={resident.id}
            type="button"
            onClick={() => onSelectResident(resident)}
            className="rounded-lg border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Users className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-gray-900">{resident.name}</h2>
                  <p className="mt-1 text-sm text-gray-500">Watch ID: {resident.watchId}</p>
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium capitalize text-slate-600">
                {resident.status}
              </span>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
              <MapPin className="h-4 w-4 text-gray-400" />
              Room {resident.room || '--'}
            </div>
          </button>
        ))}
      </div>
    ) : (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
        No residents are available.
      </div>
    )}
  </>
);

export default ResidentPicker;
