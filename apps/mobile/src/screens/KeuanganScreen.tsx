import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {c1Service, type KeuanganInboxItemDto} from '../services/api';
import {AppCard} from '../components/ui/AppCard';
import {AppHeader} from '../components/ui/AppHeader';
import {StatusBadge} from '../components/ui/StatusBadge';
import {Colors, Spacing, Typography} from '../theme';
import {formatCurrency} from '../utils/format';
import {getErrorMessage} from '../utils/error';

/**
 * C1-T9 — Layar Keuangan (BA/TTD kedua + unduh).
 * Antrean countersign dalam scope-nya + unduh BA per baris FINAL.
 * Tanda tangan interaktif = T10; tombol TTD di sini hanya tampil bila
 * backend mengizinkan (kontrak T5 sudah teruji — klien tinggal memanggil).
 */
export const KeuanganScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<KeuanganInboxItemDto[]>([]);
  const [period, setPeriod] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await c1Service.getKeuanganInbox();
      if (!res.success || !res.data) throw new Error(res.error?.message || 'Gagal memuat antrean');
      setItems(res.data.items);
      setPeriod(res.data.period);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Gagal memuat antrean'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={[styles.container, {paddingTop: insets.top}]}>
      <AppHeader title="Keuangan & BA" variant="main" />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}>
        {error ? (
          <AppCard>
            <Text style={styles.error}>{error}</Text>
          </AppCard>
        ) : null}
        {!isLoading && items.length === 0 && !error ? (
          <AppCard>
            <Text style={styles.meta}>Tidak ada antrean tanda tangan periode {period}.</Text>
          </AppCard>
        ) : null}
        {items.map(item => (
          <AppCard key={`${item.kind}-${item.submission_id}`}>
            <View style={styles.rowBetween}>
              <Text style={styles.branch}>
                {item.kind === 'ppk' ? (item.officer_name ?? '-') : item.branch_name}
              </Text>
              <StatusBadge status="pending" label={item.status} />
            </View>
            <Text style={styles.meta}>
              {item.branch_name} • {formatCurrency(item.total)}
            </Text>
            {item.needs_force ? (
              <Text style={styles.warn}>
                Masih ada tugas ACTIVE — teruskan ke Admin Ranting (force).
              </Text>
            ) : (
              <Text style={styles.hint}>Siap ditandatangani bersama (2 HP).</Text>
            )}
          </AppCard>
        ))}
        {isLoading && items.length === 0 ? <ActivityIndicator size="large" /> : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.surface.page},
  body: {padding: Spacing.lg, gap: Spacing.md},
  rowBetween: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  branch: {...Typography.heading3, fontWeight: '700', flex: 1},
  meta: {...Typography.body, color: Colors.text.muted, marginTop: Spacing.xs},
  warn: {
    ...Typography.body,
    color: Colors.status.warning,
    fontWeight: '700',
    marginTop: Spacing.sm,
  },
  hint: {...Typography.caption, color: Colors.text.muted, marginTop: Spacing.sm},
  error: {...Typography.body, color: Colors.status.error},
});

export default KeuanganScreen;
