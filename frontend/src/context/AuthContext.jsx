import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchCurrentUser, loginWithCredentials, logoutSession } from '../services/authApi';
import { UNAUTHORIZED_EVENT, clearStoredSession, readStoredSession, writeStoredSession } from '../services/http';
import { openWatchUpdatesStream } from '../services/realtime';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;

    const restoreSession = async () => {
      const storedSession = readStoredSession();
      if (!storedSession?.token) {
        if (active) {
          setIsReady(true);
        }
        return;
      }

      try {
        const user = await fetchCurrentUser(storedSession.token);
        if (!active) {
          return;
        }

        const restoredSession = {
          token: storedSession.token,
          user,
        };

        writeStoredSession(restoredSession);
        setSession(restoredSession);
      } catch {
        clearStoredSession();
        if (active) {
          setSession(null);
        }
      } finally {
        if (active) {
          setIsReady(true);
        }
      }
    };

    restoreSession();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearStoredSession();
      setSession(null);
      queryClient.clear();
    };

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, [queryClient]);

  useEffect(() => {
    if (!session?.token) {
      return undefined;
    }

    const scheduledInvalidations = new Map();

    const scheduleInvalidation = (key, callback, delay = 300) => {
      if (scheduledInvalidations.has(key)) {
        return;
      }

      const timeoutId = window.setTimeout(() => {
        scheduledInvalidations.delete(key);
        callback();
      }, delay);

      scheduledInvalidations.set(key, timeoutId);
    };

    const invalidateWatchScopedQueries = (watchId) => {
      if (!watchId) {
        return;
      }

      scheduleInvalidation(`watch:${watchId}`, () => {
        queryClient.invalidateQueries({ queryKey: ['watchData', watchId] });
        queryClient.invalidateQueries({
          predicate: ({ queryKey }) => Array.isArray(queryKey)
            && queryKey[0] === 'metricDetail'
            && queryKey[1] === watchId,
        });
        queryClient.invalidateQueries({
          predicate: ({ queryKey }) => Array.isArray(queryKey)
            && queryKey[0] === 'ecgHistory'
            && queryKey[1] === watchId,
        });
        queryClient.invalidateQueries({
          predicate: ({ queryKey }) => Array.isArray(queryKey)
            && queryKey[0] === 'ecgHistoryDetail'
            && queryKey[1] === watchId,
        });
      });
    };

    const invalidateResidentScopedQueries = (residentId) => {
      if (residentId == null) {
        return;
      }

      const residentKey = String(residentId);
      scheduleInvalidation(`resident:${residentKey}`, () => {
        queryClient.invalidateQueries({
          predicate: ({ queryKey }) => Array.isArray(queryKey)
            && queryKey[0] === 'healthData'
            && String(queryKey[1]) === residentKey,
        });
        queryClient.invalidateQueries({
          predicate: ({ queryKey }) => Array.isArray(queryKey)
            && queryKey[0] === 'historicalData'
            && String(queryKey[1]) === residentKey,
        });
      });
    };

    const invalidateGlobalQueries = () => {
      scheduleInvalidation('global', () => {
        queryClient.invalidateQueries({ queryKey: ['overviewStats'] });
        queryClient.invalidateQueries({ queryKey: ['alerts'] });
        queryClient.invalidateQueries({ queryKey: ['allAlerts'] });
        queryClient.invalidateQueries({ queryKey: ['allResidentsData'] });
      });
    };

    const closeStream = openWatchUpdatesStream(session.token, {
      onUpdate: (update) => {
        invalidateWatchScopedQueries(update.watchId);
        invalidateResidentScopedQueries(update.residentId);

        if (session.user?.role === 'ADMIN') {
          invalidateGlobalQueries();
        }
      },
      onError: () => {
        scheduleInvalidation('stream-recovery', () => {
          if (session.user?.watchId) {
            invalidateWatchScopedQueries(session.user.watchId);
          }

          if (session.user?.residentId != null) {
            invalidateResidentScopedQueries(session.user.residentId);
          }

          if (session.user?.role === 'ADMIN') {
            invalidateGlobalQueries();
          }
        }, 1000);
      },
    });

    return () => {
      closeStream();
      scheduledInvalidations.forEach((timeoutId) => window.clearTimeout(timeoutId));
      scheduledInvalidations.clear();
    };
  }, [queryClient, session]);

  const login = async (username, password) => {
    const result = await loginWithCredentials(username, password);
    const nextSession = {
      token: result.token,
      user: result.user,
    };

    writeStoredSession(nextSession);
    setSession(nextSession);
    queryClient.clear();
    return result.user;
  };

  const logout = async () => {
    const token = session?.token;
    clearStoredSession();
    setSession(null);
    queryClient.clear();

    if (token) {
      try {
        await logoutSession(token);
      } catch {
        // Ignore logout failures during client-side teardown.
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        token: session?.token || null,
        user: session?.user || null,
        isReady,
        isAuthenticated: !!session,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};