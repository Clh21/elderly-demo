import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, RadioTower, Send, Watch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const DEFAULT_WATCH_PORT = 8765;

const formatSavedAt = (value) => {
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

const WatchPairingPanel = ({
  selectedWatch,
  selectedResident,
  serverTarget,
  savedRecord,
  isConfiguring,
  result,
  error,
  onConfigure,
}) => {
  const [watchIp, setWatchIp] = useState('');
  const [watchPort, setWatchPort] = useState(String(DEFAULT_WATCH_PORT));
  const [pairingCode, setPairingCode] = useState('');
  const [serverHost, setServerHost] = useState('');
  const [serverPort, setServerPort] = useState('3100');

  useEffect(() => {
    const savedPayload = savedRecord?.requestPayload;
    setWatchIp(savedPayload?.watchIp || '');
    setWatchPort(String(savedPayload?.watchPort || DEFAULT_WATCH_PORT));
    setPairingCode('');
    setServerHost(savedPayload?.serverHost || serverTarget?.serverHost || '');
    setServerPort(String(savedPayload?.serverPort || serverTarget?.serverPort || 3100));
  }, [savedRecord, selectedWatch, serverTarget]);

  const effectiveResult = result || savedRecord?.result;
  const paired = Boolean(savedRecord || result);
  const savedAt = formatSavedAt(savedRecord?.savedAt);
  const buttonLabel = paired ? 'Repair' : 'Pair';

  const canSubmit = Boolean(
    selectedWatch &&
    watchIp.trim() &&
    Number(watchPort) > 0 &&
    serverHost.trim() &&
    Number(serverPort) > 0 &&
    !isConfiguring
  );

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    onConfigure({
      watchIp: watchIp.trim(),
      watchPort: Number(watchPort),
      watchId: selectedWatch,
      pairingCode: pairingCode.trim(),
      serverHost: serverHost.trim(),
      serverPort: Number(serverPort),
    });
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
            <RadioTower className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Watch pairing</h2>
            <p className="text-sm text-slate-500">
              {selectedResident?.name || 'Selected resident'} - {selectedWatch || 'No watch selected'}
            </p>
          </div>
        </div>
        {effectiveResult ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            <span>{paired ? 'Paired' : 'Ready'}</span>
          </div>
        ) : null}
      </div>

      <form className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5" onSubmit={handleSubmit}>
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Watch IP</span>
          <Input
            value={watchIp}
            onChange={(event) => setWatchIp(event.target.value)}
            placeholder="192.168.0.23"
            autoComplete="off"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Watch port</span>
          <Input
            value={watchPort}
            onChange={(event) => setWatchPort(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Pairing code</span>
          <Input
            value={pairingCode}
            onChange={(event) => setPairingCode(event.target.value)}
            placeholder="Shown on watch"
            autoComplete="off"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Server IP</span>
          <Input
            value={serverHost}
            onChange={(event) => setServerHost(event.target.value)}
            placeholder="192.168.0.5"
            autoComplete="off"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Server port</span>
          <div className="flex gap-2">
            <Input
              value={serverPort}
              onChange={(event) => setServerPort(event.target.value)}
              inputMode="numeric"
              autoComplete="off"
            />
            <Button type="submit" disabled={!canSubmit} className="shrink-0 gap-2">
              {isConfiguring ? <RadioTower className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
              <span>{isConfiguring ? 'Checking' : buttonLabel}</span>
            </Button>
          </div>
        </label>
      </form>

      {effectiveResult ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-800">
          <Watch className="h-4 w-4 shrink-0" />
          <span>
            {effectiveResult.serverEndpoint || 'Watch configuration saved.'}
            {savedAt ? ` Last paired ${savedAt}.` : ''}
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error.message || 'Failed to configure watch.'}</span>
        </div>
      ) : null}
    </section>
  );
};

export default WatchPairingPanel;
