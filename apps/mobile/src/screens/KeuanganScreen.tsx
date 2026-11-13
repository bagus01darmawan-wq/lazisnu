import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {c1Service, type KeuanganInboxItemDto} from '../services/api';
import {AppCard} from '../components/ui/AppCard';
import {AppHeader} from '../components/ui/AppHeader';
import {StatusBadge} from '../components/ui/StatusBadge';
import {SignSheet} from '../components/SignSheet';
import {Colors, ComponentSizes, Spacing, Typography} from '../theme';
import {formatCurrency, formatPeriod} from '../utils/format';
import {getErrorMessage} from '../utils/error';
import {usePeriodStore} from '../stores';


/**
 * Laporan menampilkan antrean tanda tangan BA PPK oleh Bendahara Ranting.
 * Setelah tanda tangan Bendahara, BA PPK berstatus FINAL dan proses periode selesai.
 */
export const KeuanganScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  // Periode tampilan berbasis aksi: antrean TTD bulan lalu yang belum tuntas
  // tetap muncul walau bulan kalender sudah berganti.
  const displayYear = usePeriodStore(state => state.context?.display_period.year);
  const displayMonth = usePeriodStore(state => state.context?.display_period.month);
  const refreshPeriod = usePeriodStore(state => state.refresh);
  const [items, setItems] = useState<KeuanganInboxItemDto[]>([]);
  const [period, setPeriod] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Item yang sedang ditandatangani (kanvas → PNG murni).
  const [signing, setSigning] = useState<KeuanganInboxItemDto | null>(null);
  const [signBusy, setSignBusy] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  // Isi BA yang akan ditandatangani.
  const [baText, setBaText] = useState<string[] | null>(null);
  const [baNumber, setBaNumber] = useState<string | null>(null);
  const [baLoading, setBaLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      /* Periode dikirim eksplisit dari konteks aksi (`display_period`), bukan
         jam kalender: antrean BA bulan lalu tetap terlihat sampai tuntas.
         Bila konteks belum termuat, server memakai periode berjalan. */
      const res = await c1Service.getKeuanganInbox(displayYear, displayMonth);
      if (!res.success || !res.data) throw new Error(res.error?.message || 'Gagal memuat antrean');
      setItems(res.data.items);
      setPeriod(res.data.period);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Gagal memuat antrean'));
    } finally {
      setIsLoading(false);
    }
  }, [displayYear, displayMonth]);

  useEffect(() => {
    refreshPeriod();
  }, [refreshPeriod]);

  useEffect(() => {
    load();
  }, [load]);

  const openSign = async (item: KeuanganInboxItemDto) => {
    setSignError(null);
    setBaText(null);
    setBaNumber(null);
    setSigning(item);

    setBaLoading(true);
    try {
      const res = await c1Service.getBeritaAcara(item.submission_id);
      if (res.success && res.data) {
        setBaText(res.data.statements);
        setBaNumber(res.data.ba_number ?? null);
      } else {
        setSignError('Isi BA gagal dimuat — tutup lalu buka ulang.');
      }
    } catch (e: unknown) {
      setSignError(getErrorMessage(e, 'Isi BA gagal dimuat'));
    } finally {
      setBaLoading(false);
    }
  };

  const submitSign = async (signaturePngBase64: string) => {
    if (!signing) return;
    setSignBusy(true);
    setSignError(null);
    try {
      const res = await c1Service.countersignSubmission(signing.submission_id, {
        signature_png: signaturePngBase64,
        consent: true,
        expected_version: signing.version,
      });
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
      <AppHeader title="Laporan" variant="main" />
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
            <Text style={styles.meta}>
              Tidak ada antrean tanda tangan periode {formatPeriod(period)}.
            </Text>
          </AppCard>
        ) : null}
        {items.map(item => (
          <AppCard key={`${item.kind}-${item.submission_id}`}>
            <View style={styles.rowBetween}>
              <Text style={styles.branch}>{item.officer_name ?? '-'}</Text>
              <StatusBadge status="pending" label={item.status} />
            </View>
            <Text style={styles.meta}>
              BA PPK → Bendahara Ranting • {item.branch_name} • {formatCurrency(item.total)}
            </Text>
            {item.needs_force ? (
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
            title={`Tanda tangani BA PPK ${signing.officer_name ?? ''}`}
            submitLabel="Tanda Tangani"
            submitting={signBusy}
            serverError={signError}
            baText={baText}
            baNumber={baNumber}
            baLoading={baLoading}
            onSubmit={submitSign}
            onClose={() => setSigning(null)}>

          </SignSheet>
        ) : null}
        {isLoading && items.length === 0 ? <ActivityIndicator size="large" /> : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.surface.page},
  body: {
    padding: Spacing.lg,
    paddingBottom: ComponentSizes.bottomTabHeight + Spacing.xxl,
    gap: Spacing.md,
  },
  rowBetween: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  branch: {...Typography.heading3, fontWeight: '700', flex: 1},
  meta: {...Typography.body, color: Colors.text.muted, marginTop: Spacing.xs},

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
