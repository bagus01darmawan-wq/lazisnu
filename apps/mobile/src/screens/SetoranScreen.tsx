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
import {SignSheet} from '../components/SignSheet';
import {useAuthStore} from '../stores';
import {normalizeRole} from '../roles/roleMap';
import {Colors, Spacing, Typography} from '../theme';
import {formatCurrency} from '../utils/format';
import {getErrorMessage} from '../utils/error';

/**
 * C1-T9 — Layar Setoran PPK (tugas/scan/setor/TTD: baca).
 * C1-T10 — tambah TTD interaktif PPK (kanvas → PNG murni, kontrak T5).
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
  const role = normalizeRole(useAuthStore(state => state.user?.role));
  const [submission, setSubmission] = useState<PpkSubmissionDto | null>(null);
  const [periodInfo, setPeriodInfo] = useState<PeriodInfoDto | null>(null);
  const [versions, setVersions] = useState<BaVersionDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // C1-T10: TTD interaktif PPK (DRAFT → PPK_SIGNED) via kanvas + PNG murni.
  const [signing, setSigning] = useState(false);
  const [signBusy, setSignBusy] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

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

  const canSign = role === 'PETUGAS' && submission?.status === 'DRAFT';

  const submitSign = async (signaturePngBase64: string) => {
    if (!submission) return;
    setSignBusy(true);
    setSignError(null);
    try {
      const res = await c1Service.signSubmission(submission.id, {
        signature_png: signaturePngBase64,
        consent: true,
        expected_version: submission.version,
      });
      if (!res.success || !res.data) throw new Error(res.error?.message || 'Gagal menandatangani');
      setSigning(false);
      await load();
    } catch (e: unknown) {
      setSignError(getErrorMessage(e, 'Gagal menandatangani'));
    } finally {
      setSignBusy(false);
    }
  };

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
              {canSign && !signing ? (
                <Text
                  style={styles.signLink}
                  onPress={() => {
                    setSignError(null);
                    setSigning(true);
                  }}>
                  Tanda tangani di HP ini →
                </Text>
              ) : null}
              {!canSign ? (
                <Text style={styles.hint}>Penandatanganan dilakukan bersama bendahara (2 HP).</Text>
              ) : null}
            </AppCard>
            {signing && submission ? (
              <SignSheet
                title="Tanda tangan PPK"
                submitLabel="Tanda Tangani"
                submitting={signBusy}
                serverError={signError}
                onSubmit={submitSign}
                onClose={() => setSigning(false)}
              />
            ) : null}
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
  signLink: {
    ...Typography.body,
    color: Colors.brand.emerald,
    fontWeight: '700',
    marginTop: Spacing.sm,
  },
  error: {...Typography.body, color: Colors.status.error},
});

export default SetoranScreen;
