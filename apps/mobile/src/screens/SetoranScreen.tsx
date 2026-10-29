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
  type BaVersionDto,
  type PeriodInfoDto,
  type PpkSubmissionDto,
} from '../services/api';
import {AppCard} from '../components/ui/AppCard';
import {AppHeader} from '../components/ui/AppHeader';
import {AppPressable} from '../components/ui/AppPressable';
import {StatusBadge, type StatusBadgeStatus} from '../components/ui/StatusBadge';
import {BaPreviewSheet} from '../components/BaPreviewSheet';
import {PeriodChip} from '../components/PeriodChip';
import {SignSheet} from '../components/SignSheet';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
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

/**
 * Label status di baris versi BA. "DRAFT" diberi periode berjalan supaya jelas
 * bulan mana yang masih berupa draf; status lain dibiarkan apa adanya.
 */
const versionStatusLabel = (status: string, period: string): string =>
  status === 'DRAFT' ? `draft ${period}` : status;

export const SetoranScreen: React.FC = () => {
  const navigation = useNavigation();
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
  // Draf BA yang bisa dibaca PPK sebelum menandatangani (kartu teratas).
  const [baDraft, setBaDraft] = useState<BaTextDto | null>(null);
  const [baLoading, setBaLoading] = useState(false);
  const [baError, setBaError] = useState<string | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  // Unduh BA PDF — hanya sah setelah FINAL (server menolak sebelum itu).
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

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
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const canSign = role === 'PETUGAS' && submission?.status === 'DRAFT';
  const isFinal = submission?.status === 'FINAL';

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
  const handleDownloadBa = async () => {
    if (!submission) return;
    setDownloadBusy(true);
    setDownloadError(null);
    try {
      const res = await c1Service.getPdf(submission.id);
      if (!res.success || !res.data) {
        throw new Error(res.error?.message || 'Gagal menyiapkan unduhan');
      }
      // Sengaja TANPA `Linking.canOpenURL` — di Android 11+ ia bisa menjawab
      // false untuk https sehingga unduhan yang sebenarnya dituduh "tak ada
      // aplikasi" (alasan sama dengan ProfileScreen).
      await Linking.openURL(res.data.download_url);
      // Muat ulang: `pdf_hash` baru terisi setelah berkas dibuat, dan itulah
      // yang mengubah label versi menjadi "PDF siap".
      await load();
    } catch (e: unknown) {
      setDownloadError(getErrorMessage(e, 'Tidak dapat mengunduh berita acara'));
    } finally {
      setDownloadBusy(false);
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
                  <Text style={styles.period}>{submission.period}</Text>
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
            {versions.length > 0 ? (
              <AppCard>
                <Text style={styles.cardTitle}>Riwayat Berita Acara ({versions.length})</Text>
                {versions.map(v => (
                  <Text key={v.version} style={styles.meta}>
                    v{v.version} • {versionStatusLabel(v.status, submission.period)}
                    {v.is_current ? ' • berlaku' : ''} • {v.pdf_hash ? 'PDF siap' : 'belum diunduh'}
                  </Text>
                ))}
                <AppPressable
                  accessibilityRole="button"
                  accessibilityLabel="Unduh berita acara PDF"
                  disabled={!isFinal || downloadBusy}
                  onPress={handleDownloadBa}
                  style={styles.actionRow}>
                  <Icon
                    name={'download'}
                    size={16}
                    color={isFinal ? Colors.brand.emerald : Colors.text.muted}
                  />
                  <Text style={[styles.actionText, !isFinal && styles.actionTextMuted]}>
                    {downloadBusy ? 'Menyiapkan berkas…' : 'Unduh berita acara'}
                  </Text>
                  <Icon
                    name={'chevron-right'}
                    size={18}
                    color={isFinal ? Colors.brand.emerald : Colors.text.muted}
                  />
                </AppPressable>
                {!isFinal ? (
                  <Text style={styles.hint}>Siap setelah kedua tanda tangan lengkap.</Text>
                ) : null}
                {downloadError ? <Text style={styles.error}>{downloadError}</Text> : null}
              </AppCard>
            ) : null}
          </>
        ) : null}
        {isLoading && !submission ? <ActivityIndicator size="large" /> : null}
      </ScrollView>
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
  actionTextMuted: {
    color: Colors.text.muted,
  },
  error: {...Typography.body, color: Colors.status.error},
});

export default SetoranScreen;
