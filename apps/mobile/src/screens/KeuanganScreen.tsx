import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {c1Service, type KeuanganInboxItemDto} from '../services/api';
import {AppCard} from '../components/ui/AppCard';
import {AppHeader} from '../components/ui/AppHeader';
import {AppPressable} from '../components/ui/AppPressable';
import {AppTextInput} from '../components/ui/AppTextInput';
import {StatusBadge} from '../components/ui/StatusBadge';
import {SignSheet} from '../components/SignSheet';
import {Colors, Radius, Spacing, Typography} from '../theme';
import {formatCurrency} from '../utils/format';
import {getErrorMessage} from '../utils/error';

/** Selisih share di luar nilai ini wajib alasan — cerminan `SHARE_TOLERANCE`. */
const SHARE_TOLERANCE = 10_000;

/** Cerminan `varianceReasonEnum` di server (urutan & nilai harus sama). */
const VARIANCE_REASONS: Array<{value: string; label: string}> = [
  {value: 'KURANG_BAYAR', label: 'Kurang bayar'},
  {value: 'LEBIH_BAYAR', label: 'Lebih bayar'},
  {value: 'GABUNG_PERIODE', label: 'Gabung periode'},
  {value: 'KOREKSI_ADMIN', label: 'Koreksi admin'},
  {value: 'HP_HILANG', label: 'HP hilang'},
];

const digitsOnly = (s: string): number => Number(s.replace(/[^\d]/g, '')) || 0;

/**
 * C1-T9/T10 — Layar Keuangan (BA/TTD kedua + unduh).
 *
 * Tiga antrean tanda tangan (koreksi Pion 23 Sep 2026):
 * 1. `ppk` — **counter-sign** BA PPK → BA PPK jadi FINAL.
 * 2. `branch_sign` — **tanda tangan tahap 1** BA ranting oleh **Bendahara
 *    Ranting**, setelah semua PPK periode itu FINAL. Dulu tidak ada UI-nya
 *    sama sekali (yang menandatangani dianggap Admin Ranting — keliru).
 * 3. `branch` — **counter-sign** BA ranting oleh Bendahara MWC → FINAL.
 *
 * Isi berita acara ditampilkan sebelum minta persetujuan — menutup celah
 * kepatuhan 23 Sep 2026: dulu pengguna diminta menyetujui dokumen yang tak
 * pernah bisa dibacanya.
 */
export const KeuanganScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<KeuanganInboxItemDto[]>([]);
  const [period, setPeriod] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Item yang sedang ditandatangani (kanvas → PNG murni).
  const [signing, setSigning] = useState<KeuanganInboxItemDto | null>(null);
  const [signBusy, setSignBusy] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  // Kolom tambahan khusus tanda tangan BA ranting (tahap 1).
  const [share, setShare] = useState('');
  const [reason, setReason] = useState('');
  const [linkedPeriods, setLinkedPeriods] = useState('');
  const [asNol, setAsNol] = useState(false);

  // Isi BA yang akan ditandatangani.
  const [baText, setBaText] = useState<string[] | null>(null);
  const [baNumber, setBaNumber] = useState<string | null>(null);
  const [baLoading, setBaLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      /* Periode SENGAJA tidak dikirim — lihat ProfileScreen.loadBa: server
         memakai periode berjalan, sumber kebenaran yang sama dengan
         penjaga-fresh (`periodComplete`). Periode yang dipakai server tetap
         ditampilkan ke pengguna lewat `setPeriod` di bawah, jadi antrean tidak
         pernah tampak kosong tanpa keterangan periode mana yang dimaksud. */
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

  const openSign = async (item: KeuanganInboxItemDto) => {
    setSignError(null);
    setShare('');
    setReason('');
    setLinkedPeriods('');
    setAsNol(false);
    setBaText(null);
    setBaNumber(null);
    setSigning(item);

    // Share MWC adalah isian bebas; ekspektasi dari server dipakai sebagai
    // titik awal supaya Bendahara tidak mengetik dari nol.
    if (item.kind === 'branch_sign') setShare(String(item.expected_share));

    // Isi BA dimuat untuk KETIGA alur — semuanya meminta centang "Saya
    // menyetujui berita acara ini". Meminta persetujuan atas dokumen yang tak
    // pernah bisa dibaca adalah celah kepatuhan, bukan sekadar soal UX.
    setBaLoading(true);
    try {
      const res =
        item.kind === 'ppk'
          ? await c1Service.getBeritaAcara(item.submission_id)
          : await c1Service.getBranchBeritaAcara(item.submission_id);
      if (res.success && res.data) {
        setBaText(res.data.statements);
        setBaNumber(res.data.ba_number ?? null);
      } else {
        setSignError('Isi berita acara gagal dimuat — tutup lalu buka ulang.');
      }
    } catch (e: unknown) {
      setSignError(getErrorMessage(e, 'Isi berita acara gagal dimuat'));
    } finally {
      setBaLoading(false);
    }
  };

  const submitSign = async (signaturePngBase64: string) => {
    if (!signing) return;
    setSignBusy(true);
    setSignError(null);
    try {
      if (signing.kind === 'branch_sign') {
        if (asNol && signing.total !== 0) {
          throw new Error('FINAL_NOL hanya untuk 0 pemasukan.');
        }
        const linked = linkedPeriods
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        const res = await c1Service.signBranch(signing.submission_id, {
          signature_png: signaturePngBase64,
          consent: true,
          expected_version: signing.version,
          share_mwc: digitsOnly(share),
          variance_reason: reason || undefined,
          linked_periods: linked.length > 0 ? linked : undefined,
          as_nol: asNol || undefined,
        });
        if (!res.success) throw new Error(res.error?.message || 'Gagal menandatangani');
      } else {
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
      }
      setSigning(null);
      await load();
    } catch (e: unknown) {
      setSignError(getErrorMessage(e, 'Gagal menandatangani'));
    } finally {
      setSignBusy(false);
    }
  };

  const shareNum = digitsOnly(share);
  const variance = signing?.kind === 'branch_sign' ? shareNum - signing.expected_share : 0;
  const needsReason = Math.abs(variance) > SHARE_TOLERANCE;

  const titleFor = (item: KeuanganInboxItemDto): string => {
    if (item.kind === 'ppk') return `Counter-sign ${item.officer_name ?? ''}`;
    if (item.kind === 'branch_sign') return `Tanda tangan BA ranting ${item.branch_name}`;
    return `Counter-sign ${item.branch_name}`;
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
              {item.kind === 'branch_sign' ? 'BA ranting → MWC' : item.branch_name} •{' '}
              {formatCurrency(item.total)}
            </Text>
            {item.kind === 'branch_sign' && item.ppk_belum_final > 0 ? (
              <Text style={styles.warn}>
                Masih ada {item.ppk_belum_final} dari {item.ppk_total} setoran PPK yang belum FINAL —
                selesaikan dulu sebelum serah terima ke MWC.
              </Text>
            ) : item.needs_force ? (
              <Text style={styles.warn}>
                Masih ada tugas ACTIVE — teruskan ke Admin Ranting (force).
              </Text>
            ) : (
              <Text style={styles.signLink} onPress={() => openSign(item)}>
                Tanda tangani di HP ini →
              </Text>
            )}
          </AppCard>
        ))}
        {signing ? (
          <SignSheet
            title={titleFor(signing)}
            submitLabel="Tanda Tangani"
            submitting={signBusy}
            serverError={signError}
            baText={baText}
            baNumber={baNumber}
            baLoading={baLoading}
            onSubmit={submitSign}
            onClose={() => setSigning(null)}>
            {signing.kind === 'branch_sign' ? (
              <>
                <View style={styles.numRow}>
                  <Text style={styles.meta}>Total {formatCurrency(signing.total)}</Text>
                  <Text style={styles.meta}>Bisyaroh {formatCurrency(signing.bisyaroh_total)}</Text>
                </View>
                <AppTextInput
                  label="Share MWC (Rp)"
                  value={share}
                  onChangeText={setShare}
                  keyboardType="number-pad"
                  editable={!asNol}
                  helperText={`Ekspektasi ${formatCurrency(
                    signing.expected_share,
                  )} • selisih ${formatCurrency(variance)}`}
                  error={
                    needsReason && !reason
                      ? 'Selisih di luar toleransi Rp 10.000 — pilih alasan.'
                      : undefined
                  }
                />
                <Text style={styles.fieldLabel}>Alasan selisih</Text>
                <View style={styles.chips}>
                  {VARIANCE_REASONS.map(r => {
                    const on = reason === r.value;
                    return (
                      <AppPressable
                        key={r.value}
                        accessibilityRole="button"
                        accessibilityLabel={`Alasan ${r.label}`}
                        onPress={() => setReason(prev => (prev === r.value ? '' : r.value))}
                        style={[styles.chip, on && styles.chipOn]}>
                        <Text style={[styles.chipText, on && styles.chipTextOn]}>{r.label}</Text>
                      </AppPressable>
                    );
                  })}
                </View>
                {reason === 'GABUNG_PERIODE' ? (
                  <AppTextInput
                    label="Periode digabung"
                    value={linkedPeriods}
                    onChangeText={setLinkedPeriods}
                    placeholder="2026-07, 2026-08"
                    autoCapitalize="none"
                    helperText="Pisahkan dengan koma."
                  />
                ) : null}
                <AppPressable
                  accessibilityRole="checkbox"
                  accessibilityState={{checked: asNol}}
                  accessibilityLabel="Kunci 0 pemasukan (FINAL_NOL)"
                  onPress={() =>
                    setAsNol(v => {
                      const next = !v;
                      if (next) setShare('0');
                      return next;
                    })
                  }
                  style={styles.consentRow}>
                  <View style={[styles.box, asNol && styles.boxOn]}>
                    {asNol ? <Text style={styles.check}>✓</Text> : null}
                  </View>
                  <Text style={styles.consentText}>Kunci 0 pemasukan (FINAL_NOL)</Text>
                </AppPressable>
              </>
            ) : null}
          </SignSheet>
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
  numRow: {flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md},
  fieldLabel: {
    ...Typography.label,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm},
  chip: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    backgroundColor: Colors.surface.card,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  chipOn: {backgroundColor: Colors.brand.emerald, borderColor: Colors.brand.emerald},
  chipText: {...Typography.caption, fontWeight: '700', color: Colors.text.secondary},
  chipTextOn: {color: '#FFFFFF'},
  consentRow: {flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm},
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.border.warm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: {backgroundColor: Colors.brand.emerald, borderColor: Colors.brand.emerald},
  check: {color: '#FFFFFF', fontWeight: '800', fontSize: 14},
  consentText: {...Typography.body, flex: 1},
  warn: {
    ...Typography.body,
    color: Colors.status.warning,
    fontWeight: '700',
    marginTop: Spacing.sm,
  },
  signLink: {
    ...Typography.body,
    color: Colors.brand.emerald,
    fontWeight: '700',
    marginTop: Spacing.sm,
  },
  error: {...Typography.body, color: Colors.status.error},
});

export default KeuanganScreen;
