import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {c1Service, type MwcRecapDto} from '../services/api';
import {AppCard} from '../components/ui/AppCard';
import {AppHeader} from '../components/ui/AppHeader';
import {StatusBadge} from '../components/ui/StatusBadge';
import {Colors, Spacing, Typography} from '../theme';
import {formatCurrency} from '../utils/format';
import {getErrorMessage} from '../utils/error';
import {useAuthStore} from '../stores';

/**
 * C1-T9 — Layar Manager (baca).
 * ADMIN_KECAMATAN: 2 kartu rekap MWC (FINAL saja). ADMIN_RANTING: daftar
 * setoran rantingnya (semua status — beda dengan rekap MWC yang FINAL saja).
 */
export const RekapScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const role = useAuthStore(state => state.user?.role);
  const [recap, setRecap] = useState<MwcRecapDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (role !== 'ADMIN_KECAMATAN') {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await c1Service.getLaporanMwc();
      if (!res.success || !res.data) throw new Error(res.error?.message || 'Gagal memuat rekap');
      setRecap(res.data);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Gagal memuat rekap'));
    } finally {
      setIsLoading(false);
    }
  }, [role]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={[styles.container, {paddingTop: insets.top}]}>
      <AppHeader title="Rekap" variant="main" />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}>
        {error ? (
          <AppCard>
            <Text style={styles.error}>{error}</Text>
          </AppCard>
        ) : null}
        {role === 'ADMIN_KECAMATAN' && recap ? (
          <>
            <AppCard>
              <Text style={styles.cardTitle}>Perolehan Ranting • {recap.period}</Text>
              <Text style={styles.total}>{formatCurrency(recap.kartu_ranting.total)}</Text>
              <Text style={styles.meta}>
                Share MWC {formatCurrency(recap.kartu_ranting.share_mwc)} • Lapor{' '}
                {recap.kartu_ranting.reported_count} • NOL {recap.kartu_ranting.final_nol_count} •
                Belum {recap.kartu_ranting.belum_lapor_count}
              </Text>
            </AppCard>
            <AppCard>
              <Text style={styles.cardTitle}>Perolehan Program MWC</Text>
              <Text style={styles.total}>{formatCurrency(recap.kartu_program.total)}</Text>
              <Text style={styles.meta}>Bruto penuh (tanpa share 30%)</Text>
            </AppCard>
            {recap.rows.map(r => (
              <AppCard key={r.branch_id}>
                <View style={styles.rowBetween}>
                  <Text style={styles.branch}>{r.branch_name}</Text>
                  <StatusBadge
                    status={
                      r.status === 'FINAL'
                        ? 'success'
                        : r.status === 'FINAL_NOL'
                          ? 'pending'
                          : 'error'
                    }
                    label={r.status === 'BELUM_LAPOR' ? 'BELUM LAPOR' : r.status}
                  />
                </View>
                <Text style={styles.meta}>
                  {formatCurrency(r.total)}
                  {r.flags.length > 0 ? ` • ${r.flags.join(', ')}` : ''}
                </Text>
              </AppCard>
            ))}
          </>
        ) : null}
        {role === 'ADMIN_RANTING' ? (
          <AppCard>
            <Text style={styles.meta}>
              Kelola setoran ranting melalui web dashboard. Kunci ranting &amp; tanda tangan tingkat
              ranting dilakukan di HP bendahara MWC.
            </Text>
          </AppCard>
        ) : null}
        {isLoading ? <ActivityIndicator size="large" /> : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.surface.page},
  body: {padding: Spacing.lg, gap: Spacing.md},
  rowBetween: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  cardTitle: {...Typography.heading3, fontWeight: '700', marginBottom: Spacing.xs},
  branch: {...Typography.heading3, fontWeight: '700', flex: 1},
  total: {...Typography.display, marginTop: Spacing.sm},
  meta: {...Typography.body, color: Colors.text.muted, marginTop: Spacing.xs},
  error: {...Typography.body, color: Colors.status.error},
});

export default RekapScreen;
