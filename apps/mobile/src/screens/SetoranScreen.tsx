import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {
  c1Service,
  type BaTextDto,
  type PeriodInfoDto,
  type PpkSubmissionDto,
  type SignedPpkBaHistoryDto,
} from '../services/api';
import {AppCard} from '../components/ui/AppCard';
import {AppHeader} from '../components/ui/AppHeader';
import {AppPressable} from '../components/ui/AppPressable';
import {StatusBadge, type StatusBadgeStatus} from '../components/ui/StatusBadge';
import {BaHistorySheet} from '../components/BaHistorySheet';
import {BaPreviewSheet} from '../components/BaPreviewSheet';
import {PeriodChip} from '../components/PeriodChip';
import {SignSheet} from '../components/SignSheet';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAuthStore, usePeriodStore} from '../stores';
import {normalizeRole} from '../roles/roleMap';
import {Colors, Spacing, Typography} from '../theme';
import {formatCurrency, formatPeriod} from '../utils/format';
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
  const navigation = useNavigation();
  const role = normalizeRole(useAuthStore(state => state.user?.role));
  // Periode tampilan berbasis aksi: BA bulan lalu yang belum tuntas tetap
  // ditampilkan, bukan kosong karena bulan kalender berganti.
  const displayYear = usePeriodStore(state => state.context?.display_period.year);
  const displayMonth = usePeriodStore(state => state.context?.display_period.month);
  const refreshPeriod = usePeriodStore(state => state.refresh);
  const [submission, setSubmission] = useState<PpkSubmissionDto | null>(null);
  const [periodInfo, setPeriodInfo] = useState<PeriodInfoDto | null>(null);
  const [signedBaHistory, setSignedBaHistory] = useState<SignedPpkBaHistoryDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // C1-T10: TTD interaktif PPK (DRAFT → PPK_SIGNED) via kanvas + PNG murni.
  const [signing, setSigning] = useState(false);
  const [signBusy, setSignBusy] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  // Draf BA yang bisa dibaca PPK sebelum menandatangani (kartu teratas).
  const [baDraft, setBaDraft] = useState<BaTextDto | null>(null);
  const [baLoading, setBaLoading] = useState(false);
  const [baError, setBaError] = useState<string | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  // Riwayat BA lintas periode dan unduhan per submission.
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [downloadingSubmissionId, setDownloadingSubmissionId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const loadSignedBaHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const historyRes = await c1Service.getSignedBaHistory();
      if (historyRes.success && historyRes.data) {
        setSignedBaHistory(historyRes.data);
        setHistoryError(null);
      } else {
        setHistoryError(historyRes.error?.message || 'Gagal memuat riwayat berita acara');
      }
    } catch (historyLoadError: unknown) {
      setHistoryError(getErrorMessage(historyLoadError, 'Gagal memuat riwayat berita acara'));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [subRes, periodRes] = await Promise.all([
        c1Service.getMySubmission(displayYear, displayMonth),
        c1Service.getPeriodInfo(displayYear, displayMonth),
      ]);
      if (!subRes.success || !subRes.data) {
        throw new Error(subRes.error?.message || 'Gagal memuat setoran');
      }
      setSubmission(subRes.data);
      if (periodRes.success && periodRes.data) setPeriodInfo(periodRes.data);
      await loadSignedBaHistory();
      // Isi BA dimuat di awal supaya kartu bisa dibuka kapan saja tanpa
      // menunggu jaringan. Gagal muat TIDAK menggagalkan layar — pesannya
      // tampil di dalam lembar baca, karena yang gagal hanya pratinjau.
      setBaLoading(true);
      try {
        const baRes = await c1Service.getBeritaAcara(subRes.data.id);
        if (baRes.success && baRes.data) {
          setBaDraft(baRes.data);
          setBaError(null);
        } else {
          setBaError(baRes.error?.message || 'Isi berita acara belum tersedia');
        }
      } catch (e: unknown) {
        setBaError(getErrorMessage(e, 'Gagal memuat isi berita acara'));
      } finally {
        setBaLoading(false);
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Gagal memuat setoran'));
    } finally {
      setIsLoading(false);
    }
  }, [displayYear, displayMonth, loadSignedBaHistory]);

  useEffect(() => {
    refreshPeriod();
  }, [refreshPeriod]);

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

  /**
   * Unduh BA PDF. Server yang menyiapkan berkasnya (dibuat saat pertama kali
   * diminta), lalu tautannya hanya berlaku 600 detik — karena itu tautan
   * diambil tepat sebelum dibuka, bukan disimpan.
   */
  const handleDownloadBa = async (submissionId: string) => {
    setDownloadingSubmissionId(submissionId);
    setDownloadError(null);
    try {
      const res = await c1Service.getPdf(submissionId);
      if (!res.success || !res.data) {
        throw new Error(res.error?.message || 'Gagal menyiapkan unduhan');
      }
      // Sengaja TANPA `Linking.canOpenURL` — di Android 11+ ia bisa menjawab
      // false untuk https sehingga unduhan yang sebenarnya dituduh "tak ada
      // aplikasi" (alasan sama dengan ProfileScreen).
      await Linking.openURL(res.data.download_url);
    } catch (e: unknown) {
      setDownloadError(getErrorMessage(e, 'Tidak dapat mengunduh berita acara'));
    } finally {
      setDownloadingSubmissionId(null);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.container}>
      <AppHeader variant="stack" title="Setoran Saya" onBack={() => navigation.goBack()} />
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
            <AppPressable
              accessibilityRole="button"
              accessibilityLabel="Baca draf berita acara sebelum menandatangani"
              onPress={() => setPreviewVisible(true)}>
              <AppCard>
                <View style={styles.rowBetween}>
                  <Text style={styles.period}>{formatPeriod(submission.period)}</Text>
                  <StatusBadge status={statusTone(submission.status)} label={submission.status} />
                </View>
                <Text style={styles.total}>{formatCurrency(submission.total_amount)}</Text>
                <Text style={styles.meta}>
                  {submission.collection_count} kaleng • Bisyaroh{' '}
                  {formatCurrency(submission.bisyaroh_amount)} • Bersih{' '}
                  {formatCurrency(submission.net_amount)}
                </Text>
                <View style={styles.actionRow}>
                  <Icon name={'file-document-outline'} size={16} color={Colors.brand.emerald} />
                  <Text style={styles.actionText}>Baca draf berita acara</Text>
                  <Icon name={'chevron-right'} size={18} color={Colors.brand.emerald} />
                </View>
              </AppCard>
            </AppPressable>
            <AppPressable
              accessibilityRole="button"
              accessibilityLabel="Tanda tangani berita acara"
              disabled={!canSign}
              onPress={() => {
                setSignError(null);
                setSigning(true);
              }}>
              <AppCard>
                <Text style={styles.cardTitle}>Tanda tangan</Text>
                <Text style={styles.meta}>
                  PPK: {submission.ppk_signer_id ? 'sudah' : 'belum'} • Bendahara:{' '}
                  {submission.bendahara_signer_id ? 'sudah' : 'belum'}
                </Text>
                {canSign ? (
                  <View style={styles.actionRow}>
                    <Icon name={'file-sign'} size={16} color={Colors.brand.emerald} />
                    <Text style={styles.actionText}>Tanda tangani di HP ini</Text>
                    <Icon name={'chevron-right'} size={18} color={Colors.brand.emerald} />
                  </View>
                ) : (
                  <Text style={styles.hint}>
                    Penandatanganan dilakukan bersama bendahara (2 HP).
                  </Text>
                )}
              </AppCard>
            </AppPressable>
            {signing ? (
              <SignSheet
                title="Tanda tangan PPK"
                submitLabel="Tanda Tangani"
                submitting={signBusy}
                serverError={signError}
                onSubmit={submitSign}
                onClose={() => setSigning(false)}
              />
            ) : null}
            <AppPressable
              accessibilityRole="button"
              accessibilityLabel="Buka riwayat berita acara yang sudah ditandatangani"
              onPress={() => {
                setDownloadError(null);
                setHistoryVisible(true);
              }}>
              <AppCard>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>Riwayat Berita Acara</Text>
                  <Icon name="chevron-right" size={20} color={Colors.brand.emerald} />
                </View>
                <Text style={styles.meta}>
                  {historyLoading
                    ? 'Memuat daftar berita acara…'
                    : historyError
                      ? 'Riwayat berita acara belum dapat dimuat'
                      : `${signedBaHistory.length} berita acara sudah ditandatangani lengkap`}
                </Text>
                <View style={styles.actionRow}>
                  <Icon name="file-document-outline" size={16} color={Colors.brand.emerald} />
                  <Text style={styles.actionText}>Pilih periode untuk mengunduh</Text>
                </View>
              </AppCard>
            </AppPressable>
          </>
        ) : null}
        {isLoading && !submission ? <ActivityIndicator size="large" /> : null}
      </ScrollView>
      <BaHistorySheet
        visible={historyVisible}
        history={signedBaHistory}
        loading={historyLoading}
        error={historyError}
        busyId={downloadingSubmissionId}
        downloadError={downloadError}
        onDownload={handleDownloadBa}
        onRetry={loadSignedBaHistory}
        onClose={() => setHistoryVisible(false)}
      />
      <BaPreviewSheet
        visible={previewVisible}
        onClose={() => setPreviewVisible(false)}
        ba={baDraft}
        loading={baLoading}
        error={baError}
      />
    </SafeAreaView>
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
  // Baris aksi di dalam kartu (baca draf / tanda tangan) — dipakai bersama
  // supaya kedua kartu tampil senada.
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  actionText: {
    ...Typography.caption,
    color: Colors.brand.emerald,
    fontWeight: '700',
    flex: 1,
  },
  error: {...Typography.body, color: Colors.status.error},
});

export default SetoranScreen;
