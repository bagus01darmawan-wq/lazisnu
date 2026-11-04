'use client';

import { useEffect, useState } from 'react';
import { c1Api, type PeriodStateView } from '@/lib/c1';

/**
 * Konteks periode berbasis aksi untuk halaman admin.
 *
 * `displayPeriod` = periode berhak tertua yang belum tuntas untuk cakupan
 * pengguna. Halaman memakainya sebagai **nilai awal** pemilih periode; tanggal
 * kalender hanya pengingat, tidak memblokir. `unsettled` dipakai banner.
 */
export interface OperationalPeriod {
  context: PeriodStateView | null;
  loading: boolean;
  displayYear: number | null;
  displayMonth: number | null;
}

export function useOperationalPeriod(): OperationalPeriod {
  const [context, setContext] = useState<PeriodStateView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    c1Api
      .getPeriodContext()
      .then((res) => {
        if (alive && res.success && res.data) setContext(res.data);
      })
      .catch(() => {
        // Abaikan: halaman tetap memakai periode berjalan sebagai fallback.
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return {
    context,
    loading,
    displayYear: context?.displayPeriod?.year ?? null,
    displayMonth: context?.displayPeriod?.month ?? null,
  };
}
