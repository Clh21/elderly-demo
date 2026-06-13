import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AlertPopup from '../components/AlertPopup';
import AiAnalysisBar from '../components/dashboard/AiAnalysisBar';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import DashboardSidePanel from '../components/dashboard/DashboardSidePanel';
import ResidentPicker from '../components/dashboard/ResidentPicker';
import WatchMetricsGrid from '../components/dashboard/WatchMetricsGrid';
import ECGHistoryModal from '../components/ECGHistoryModal';
import EdaBaselineResultModal from '../components/EdaBaselineResultModal';
import MetricDetailModal from '../components/MetricDetailModal';
import RoomLocationModal from '../components/RoomLocationModal';
import { useAuth } from '../context/AuthContext';
import {
  buildEdaBaseline,
  clearAlerts,
  fetchAlerts,
  fetchElderlyResidents,
  fetchLatestAlerts,
  fetchWatchData,
} from '../services/api';
import { fetchActiveIndoorLayout } from '../services/indoorLayoutApi';
import { fetchLatestIndoorPosition, openIndoorPositionStream } from '../services/positioningApi';
import { normalizeIndoorLayout, normalizeIndoorPositionPayload } from '../lib/indoorRooms';

const Index = () => {
  const { user, token } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();
  const lastSeenAlertId = useRef(0);

  const [selectedWatch, setSelectedWatch] = useState(null);
  const [pendingAlerts, setPendingAlerts] = useState([]);
  const [showPopup, setShowPopup] = useState(false);
  const [showEcgHistory, setShowEcgHistory] = useState(false);
  const [activeMetricModal, setActiveMetricModal] = useState(null);
  const [edaBaselineFeedback, setEdaBaselineFeedback] = useState(null);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [indoorPosition, setIndoorPosition] = useState(null);
  const [roomHistory, setRoomHistory] = useState([]);

  const { data: activeIndoorLayoutPayload } = useQuery({
    queryKey: ['activeIndoorLayout'],
    queryFn: fetchActiveIndoorLayout,
    enabled: !!token,
    retry: 1,
  });

  const activeIndoorLayout = useMemo(
    () => normalizeIndoorLayout(activeIndoorLayoutPayload),
    [activeIndoorLayoutPayload]
  );

  // Indoor position data is independent from health-watch data, so it keeps its own compact history.
  const handleIndoorUpdate = useCallback((payload) => {
    const normalized = normalizeIndoorPositionPayload(payload, activeIndoorLayout);
    if (!normalized) {
      return;
    }

    const entryKey = [
      normalized.ts,
      normalized.roomId,
      normalized.x.toFixed(2),
      normalized.y.toFixed(2),
    ].join('|');

    setIndoorPosition(normalized);
    setRoomHistory((prev) => {
      if (prev.some((entry) => entry.entryKey === entryKey)) {
        return prev;
      }

      return [{ ...normalized, entryKey }, ...prev].slice(0, 32);
    });
  }, [activeIndoorLayout]);

  const { data: residents = [], isLoading: residentsLoading } = useQuery({
    queryKey: ['residents'],
    queryFn: fetchElderlyResidents,
  });

  // Admins make an explicit resident choice; resident users go straight to their assigned watch.
  useEffect(() => {
    if (!residents.length) {
      if (!isAdmin && !selectedWatch && user?.watchId) {
        setSelectedWatch(user.watchId);
      }
      return;
    }

    const availableWatchIds = residents.map((resident) => resident.watchId);
    if (isAdmin) {
      if (selectedWatch && !availableWatchIds.includes(selectedWatch)) {
        setSelectedWatch(null);
      }
      return;
    }

    if (!selectedWatch || !availableWatchIds.includes(selectedWatch)) {
      const defaultWatchId = availableWatchIds.includes(user?.watchId)
        ? user.watchId
        : (availableWatchIds[0] || user?.watchId || null);
      setSelectedWatch(defaultWatchId);
    }
  }, [isAdmin, residents, selectedWatch, user?.watchId]);

  const selectedResident = useMemo(() => (
    residents.find((resident) => resident.watchId === selectedWatch)
    || (!isAdmin && user?.watchId === selectedWatch
      ? {
          id: user.residentId,
          name: user.residentName,
          watchId: user.watchId,
          status: 'active',
        }
      : null)
  ), [isAdmin, residents, selectedWatch, user?.residentId, user?.residentName, user?.watchId]);

  useEffect(() => {
    setEdaBaselineFeedback(null);
  }, [selectedWatch]);

  const { data: watchData, isLoading: watchLoading } = useQuery({
    queryKey: ['watchData', selectedWatch],
    queryFn: () => fetchWatchData(selectedWatch),
    refetchInterval: 10000,
    enabled: !!selectedWatch,
  });

  const { data: latestIndoorPositionPayload } = useQuery({
    queryKey: ['latestIndoorPosition', 'dashboard'],
    queryFn: fetchLatestIndoorPosition,
    enabled: !!token,
    refetchInterval: 30000,
    retry: 1,
  });

  useEffect(() => {
    if (latestIndoorPositionPayload) {
      handleIndoorUpdate(latestIndoorPositionPayload);
    }
  }, [latestIndoorPositionPayload, handleIndoorUpdate]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const closeStream = openIndoorPositionStream(token, {
      onUpdate: handleIndoorUpdate,
    });

    return () => {
      closeStream();
    };
  }, [token, handleIndoorUpdate]);

  const edaBaselineMutation = useMutation({
    mutationFn: (watchId) => buildEdaBaseline(watchId),
    onSuccess: (result, watchId) => {
      if (watchId !== selectedWatch) {
        return;
      }

      setEdaBaselineFeedback({
        ...result,
        type: result.built ? 'success' : 'warning',
      });
      queryClient.invalidateQueries({ queryKey: ['watchData', watchId] });
    },
    onError: (error, watchId) => {
      if (watchId !== selectedWatch) {
        return;
      }

      setEdaBaselineFeedback({
        watchId,
        stageLabel: 'Build failed',
        type: 'error',
        message: error.message || 'Failed to build EDA baseline',
        unmetRequirements: [],
        selectedWindowCount: null,
        selectedDayCount: null,
        selectedDaypartCount: null,
      });
    },
  });

  const clearAlertsMutation = useMutation({
    mutationFn: clearAlerts,
    onSuccess: () => {
      setShowPopup(false);
      setPendingAlerts([]);
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['allAlerts'] });
      queryClient.invalidateQueries({ queryKey: ['overviewStats'] });
    },
  });

  // Start from the current max alert id so old active alerts do not re-open as fresh popups.
  useEffect(() => {
    if (!token) {
      return undefined;
    }

    let intervalId;
    let cancelled = false;

    const checkAlerts = async () => {
      try {
        const newAlerts = await fetchLatestAlerts(lastSeenAlertId.current);
        if (cancelled || newAlerts.length === 0) {
          return;
        }

        lastSeenAlertId.current = newAlerts[newAlerts.length - 1].id;
        setPendingAlerts((prev) => [...prev, ...newAlerts]);
        setShowPopup(true);
        queryClient.invalidateQueries({ queryKey: ['overviewStats'] });
      } catch (error) {
        // Keep the dashboard usable during transient polling failures.
        console.error('Alert polling error:', error);
      }
    };

    const initPolling = async () => {
      try {
        const all = await fetchAlerts();
        if (!cancelled && all.length > 0) {
          lastSeenAlertId.current = Math.max(...all.map((alert) => alert.id));
        }
      } catch {
        // The next interval will retry; this should not block the dashboard.
      }

      if (!cancelled) {
        intervalId = setInterval(checkAlerts, 15000);
      }
    };

    initPolling();

    return () => {
      cancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [queryClient, token]);

  const handleBackToResidentList = () => {
    setSelectedWatch(null);
    setActiveMetricModal(null);
    setShowEcgHistory(false);
    setEdaBaselineFeedback(null);
  };

  const handleBuildEdaBaseline = async () => {
    if (!selectedWatch || edaBaselineMutation.isPending) {
      return;
    }

    await edaBaselineMutation.mutateAsync(selectedWatch);
  };

  const showResidentPicker = isAdmin && !selectedWatch;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {showPopup ? (
        <AlertPopup
          alerts={pendingAlerts}
          onClose={() => {
            setShowPopup(false);
            setPendingAlerts([]);
          }}
          onClearAll={() => clearAlertsMutation.mutate()}
          isClearing={clearAlertsMutation.isPending}
        />
      ) : null}

      <EdaBaselineResultModal feedback={edaBaselineFeedback} onClose={() => setEdaBaselineFeedback(null)} />
      <ECGHistoryModal isOpen={showEcgHistory} onClose={() => setShowEcgHistory(false)} watchId={selectedWatch} />
      <MetricDetailModal
        isOpen={!!activeMetricModal}
        onClose={() => setActiveMetricModal(null)}
        watchId={selectedWatch}
        metric={activeMetricModal}
      />
      <RoomLocationModal
        isOpen={showRoomModal}
        onClose={() => setShowRoomModal(false)}
        currentPosition={indoorPosition}
        history={roomHistory}
        layout={activeIndoorLayout}
      />

      <div className="mx-auto max-w-7xl">
        {showResidentPicker ? (
          <ResidentPicker
            residents={residents}
            isLoading={residentsLoading}
            onSelectResident={(resident) => setSelectedWatch(resident.watchId)}
          />
        ) : (
          <>
            <DashboardHeader
              canReturnToResidentList={isAdmin}
              resident={selectedResident}
              selectedWatch={selectedWatch}
              watchData={watchData}
              fallbackResidentName={user?.residentName}
              onBackToResidentList={handleBackToResidentList}
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
              <div className="space-y-6 lg:col-span-3">
                <WatchMetricsGrid
                  watchData={watchData}
                  watchLoading={watchLoading}
                  selectedWatch={selectedWatch}
                  isBuildingEdaBaseline={edaBaselineMutation.isPending}
                  onBuildEdaBaseline={handleBuildEdaBaseline}
                  onOpenEcgHistory={() => setShowEcgHistory(true)}
                  onOpenMetric={setActiveMetricModal}
                />
                <AiAnalysisBar watchId={selectedWatch} />
              </div>

              <DashboardSidePanel
                activeIndoorLayout={activeIndoorLayout}
                indoorPosition={indoorPosition}
                roomHistory={roomHistory}
                selectedResident={selectedResident}
                selectedWatch={selectedWatch}
                watchData={watchData}
                onOpenRoomModal={() => setShowRoomModal(true)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Index;
