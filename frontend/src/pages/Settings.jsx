import React, { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Settings as SettingsIcon, Watch } from 'lucide-react';
import WatchPairingPanel from '../components/WatchPairingPanel';
import { useAuth } from '../context/AuthContext';
import { readPairingResult, savePairingResult } from '../lib/watchPairingStorage';
import { fetchElderlyResidents } from '../services/api';
import { configureWatchPairing, fetchWatchPairingServerTarget } from '../services/watchPairingApi';

const Settings = () => {
  const { user } = useAuth();
  const [selectedWatch, setSelectedWatch] = useState(null);
  const [pairingRecord, setPairingRecord] = useState(null);
  const [pairingResult, setPairingResult] = useState(null);

  const { data: residents = [] } = useQuery({
    queryKey: ['residents'],
    queryFn: fetchElderlyResidents,
  });

  const { data: serverTarget } = useQuery({
    queryKey: ['watchPairingServerTarget'],
    queryFn: fetchWatchPairingServerTarget,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!residents.length) {
      return;
    }

    const availableWatchIds = residents.map((resident) => resident.watchId);
    if (!selectedWatch || !availableWatchIds.includes(selectedWatch)) {
      const defaultWatchId = availableWatchIds.includes(user?.watchId) ? user.watchId : availableWatchIds[0];
      setSelectedWatch(defaultWatchId);
    }
  }, [residents, selectedWatch, user]);

  useEffect(() => {
    setPairingResult(null);
    setPairingRecord(readPairingResult(selectedWatch));
  }, [selectedWatch]);

  const selectedResident = residents.find((resident) => resident.watchId === selectedWatch) || residents[0] || null;
  const watchOptions = residents.map((resident) => ({
    id: resident.watchId,
    name: `${resident.name} (${resident.watchId})`,
  }));

  const pairingMutation = useMutation({
    mutationFn: configureWatchPairing,
    onSuccess: (result, payload) => {
      setPairingResult(result);
      setPairingRecord(savePairingResult(payload.watchId, result, payload));
    },
    onError: () => {
      setPairingResult(null);
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="mb-2 flex items-center gap-3 text-3xl font-bold text-gray-900">
            <SettingsIcon className="h-7 w-7 text-slate-700" />
            Settings
          </h1>
          <p className="text-gray-600">Manage watch pairing and device upload targets.</p>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-slate-100 p-2 text-slate-700">
              <Watch className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Device scope</h2>
              <p className="text-sm text-slate-500">Choose the watch that will receive pairing settings.</p>
            </div>
          </div>

          <select
            value={selectedWatch || ''}
            onChange={(event) => setSelectedWatch(event.target.value)}
            disabled={watchOptions.length <= 1}
            className="w-full max-w-md rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
          >
            {!watchOptions.length ? <option value="">No assigned watch</option> : null}
            {watchOptions.map((watch) => (
              <option key={watch.id} value={watch.id}>
                {watch.name}
              </option>
            ))}
          </select>
        </section>

        <WatchPairingPanel
          selectedWatch={selectedWatch}
          selectedResident={selectedResident}
          serverTarget={serverTarget}
          savedRecord={pairingRecord}
          isConfiguring={pairingMutation.isPending}
          result={pairingResult}
          error={pairingMutation.error}
          onConfigure={(payload) => pairingMutation.mutate(payload)}
        />
      </div>
    </div>
  );
};

export default Settings;
