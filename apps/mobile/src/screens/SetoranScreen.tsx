import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  c1Service,
  type BaVersionDto,
  type PeriodInfoDto,
  type PpkSubmissionDto,
} from '../services/api';
import {AppCard} from '../components/ui/AppCard';
import {AppHeader} from '../components/ui/AppHeader';
import {StatusBadge, type StatusBadgeStatus} from '../components/ui/StatusBadge';
import {PeriodChip} from '../components/PeriodChip';
import {Colors, Spacing, Typography} from '../theme';
import {formatCurrency} from '../utils/format';
import {getErrorMessage} from '../utils/error';

/**
 * C1-T9 — Layar Setoran PPK (tugas/scan/setor/TTD: baca).
 * Status setoran + angka + keadaan 2 TTD + BA teks + riwayat versi PDF.
 * Tanda tangan interaktif = T10 (perlu canvas→PNG + verifikasi perangkat);
 * klien sign/countersign sudah siap di c1Service (kontrak T5, teruji server).
 */
const statusTone = (status: string): StatusBadgeStatus => {
  switch (status) {
    case 'FINAL':
      return 'success';
    case 'PPK_SIGNED':
      return 'pending';
    default:
      return 'offline';
  }
};

export const SetoranScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [submission, setSubmission] = useState<PpkSubmissionDto | null>(null);
  const [periodInfo, setPeriodInfo] = useState<PeriodInfoDto | null>(null);
  const [versions, setVersions] = useState<BaVersionDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [subRes, periodRes] = await Promise.all([
        c1Service.getMySubmission(),
        c1Service.getPeriodInfo(),
      ]);
      if (!subRes.success || !subRes.data) {
        throw new Error(subRes.error?.message || 'Gagal memuat setoran');
      }
      setSubmission(subRes.data);
      if (periodRes.success && periodRes.data) setPeriodInfo(periodRes.data);
      const verRes = await c1Service.getPdfVersions(subRes.data.id);
      if (verRes.success && verRes.data) setVersions(verRes.data);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Gagal memuat setoran'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={[styles.container, {paddingTop: insets.top}]}>
      <AppHeader title="Setoran Saya" variant="main" />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}>
        <PeriodChip info={periodInfo} />
        {error ? (
          <AppCard>
            <Text style={styles.error}>{error}</Text>
          </AppCard>
        ) : null}
        {!isLoading && submission ? (
          <>
            <AppCard>
              <View style={styles.rowBetween}>
                <Text style={styles.period}>{submission.period}</Text>
                <StatusBadge status={statusTone(submission.status)} label={submission.status} />
              </View>
              <Text style={styles.total}>{formatCurrency(submission.total_amount)}</Text>
              <Text style={styles.meta}>
                {submission.collection_count} kaleng • Bisyaroh{' '}
                {formatCurrency(submission.bisyaroh_amount)} • Bersih{' '}
                {formatCurrency(submission.net_amount)}
              </Text>
            </AppCard>
            <AppCard>
              <Text style={styles.cardTitle}>Tanda tangan</Text>
              <Text style={styles.meta}>
                PPK: {submission.ppk_signer_id ? 'sudah' : 'belum'} • Bendahara:{' '}
                {submission.bendahara_signer_id ? 'sudah' : 'belum'}
              </Text>
              <Text style={styles.hint}>
                Penandatanganan dilakukan bersama bendahara (2 HP). Tanda tangan digital di HP ini
                menyusul.
              </Text>
            </AppCard>
            {versions.length > 0 ? (
              <AppCard>
                <Text style={styles.cardTitle}>Riwayat Berita Acara ({versions.length})</Text>
                {versions.map(v => (
                  <Text key={v.version} style={styles.meta}>
                    v{v.version} • {v.status}
                    {v.is_current ? ' • berlaku' : ''} • {v.pdf_hash ? 'PDF siap' : 'belum diunduh'}
                  </Text>
                ))}
              </AppCard>
            ) : null}
          </>
        ) : null}
        {isLoading && !submission ? <ActivityIndicator size="large" /> : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.surface.page},
  body: {padding: Spacing.lg, gap: Spacing.md},
  rowBetween: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  period: {...Typography.heading3, fontWeight: '700'},
  total: {...Typography.display, marginTop: Spacing.sm},
  meta: {...Typography.body, color: Colors.text.muted, marginTop: Spacing.xs},
  cardTitle: {...Typography.heading3, fontWeight: '700', marginBottom: Spacing.xs},
  hint: {...Typography.caption, color: Colors.text.muted, marginTop: Spacing.sm},
  error: {...Typography.body, color: Colors.status.error},
});

export default SetoranScreen;
