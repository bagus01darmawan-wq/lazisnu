'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import type { RegionKind, WorkQueueResponse } from './types';

interface UseAssignmentWorkQueueArgs {
  regionId: string;
  regionKind: RegionKind;
  year: number;
  month: number;
}

interface WorkQueueApiResponse {
  success: boolean;
  data: WorkQueueResponse;
}

export function useAssignmentWorkQueue({
  regionId,
  regionKind,
  year,
  month,
}: UseAssignmentWorkQueueArgs) {
  const [data, setData] = useState<WorkQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get<WorkQueueApiResponse>('/admin/assignments/work-queue', {
          params: {
            year,
            month,
            ...(regionKind === 'dukuh' ? { dukuh_id: regionId } : { branch_id: regionId }),
          },
        });
        if (cancelled) return;
        if (response?.success) {
          setData(response.data);
        } else {
          setError('Gagal memuat ruang kerja penugasan');
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const message =
          (err as { error?: { message?: string }; message?: string })?.error?.message ||
          (err as { message?: string })?.message ||
          'Gagal memuat ruang kerja penugasan';
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // react-hooks/set-state-in-effect (React Hooks v6): lihat persetujuan.
    void Promise.resolve().then(load);

    return () => {
      cancelled = true;
    };
  }, [regionId, regionKind, year, month, reloadKey]);

  return { data, loading, error, reload };
}
