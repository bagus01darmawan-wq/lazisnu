import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {c1Service, type KeuanganInboxItemDto} from '../services/api';
import {AppCard} from '../components/ui/AppCard';
import {AppHeader} from '../components/ui/AppHeader';
import {StatusBadge} from '../components/ui/StatusBadge';
import {SignSheet} from '../components/SignSheet';
import {Colors, Spacing, Typography} from '../theme';
import {formatCurrency} from '../utils/format';
import {getErrorMessage} from '../utils/error';

/**
 * C1-T9 — Layar Keuangan (BA/TTD kedua + unduh).
 * C1-T10 — TTD interaktif: countersign PPK + ranting via kanvas (PNG murni).
 * Antrean countersign dalam scope-nya + unduh BA per baris FINAL.
 */
export const KeuanganScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<KeuanganInboxItemDto[]>([]);
  const [period, setPeriod] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // C1-T10: item yang sedang ditandatangani (kanvas → PNG murni).
  const [signing, setSigning] = useState<KeuanganInboxItemDto | null>(null);
  const [signBusy, setSignBusy] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

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

  const submitSign = async (signaturePngBase64: string) => {
    if (!signing) return;
    setSignBusy(true);
    setSignError(null);
    try {
      const body = {
        signature_png: signaturePngBase64,
        consent: true,
        expected_version: signing.version,
      };
      const res =
        signing.kind === 'ppk'
          ? await c1Service.countersignSubmission(signing.submission_id, body)
          : await c1Service.countersignBranch(signing.submission_id, body);
      if (!res.success) throw new Error(res.error?.message || 'Gagal menandatangani');
      setSigning(null);
      await load();
    } catch (e: unknown) {
      setSignError(getErrorMessage(e, 'Gagal menandatangani'));
    } finally {
      setSignBusy(false);
    }
  };

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
              <Text
                style={styles.signLink}
                onPress={() => {
                  setSignError(null);
                  setSigning(item);
                }}>
                Tanda tangani di HP ini →
              </Text>
            )}
          </AppCard>
        ))}
        {signing ? (
          <SignSheet
            title={
              signing.kind === 'ppk'
                ? `Counter-sign ${signing.officer_name ?? ''}`
                : `Counter-sign ${signing.branch_name}`
            }
            submitLabel="Tanda Tangani"
            submitting={signBusy}
            serverError={signError}
            onSubmit={submitSign}
            onClose={() => setSigning(null)}
          />
        ) : null}
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
  signLink: {
    ...Typography.body,
    color: Colors.brand.emerald,
    fontWeight: '700',
    marginTop: Spacing.sm,
  },
  error: {...Typography.body, color: Colors.status.error},
});

export default KeuanganScreen;
