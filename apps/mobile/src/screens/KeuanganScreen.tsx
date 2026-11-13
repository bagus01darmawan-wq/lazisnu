import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import {c1Service, type BaTextDto, type KeuanganInboxItemDto} from '../services/api';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {AppCard} from '../components/ui/AppCard';
import {AppHeader} from '../components/ui/AppHeader';
import {AppPressable} from '../components/ui/AppPressable';
import {StatusBadge} from '../components/ui/StatusBadge';
import {SignSheet} from '../components/SignSheet';
import {BaPreviewSheet} from '../components/BaPreviewSheet';
import {Colors, ComponentSizes, Radius, Spacing, Typography} from '../theme';
import {formatCurrency, formatPeriod, getInitials} from '../utils/format';
import {getErrorMessage} from '../utils/error';
import {usePeriodStore} from '../stores';

/**
 * Laporan menampilkan antrean tanda tangan BA PPK oleh Bendahara Ranting.
 * Setelah tanda tangan Bendahara, BA PPK berstatus FINAL dan proses periode selesai.
 */
export const KeuanganScreen: React.FC = () => {
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
  // Langkah baca dulu — kartu hanya membuka pratinjau dokumen; menandatangani
  // dilakukan dari dalam pratinjau (seperti memeriksa kertas sebelum TTD).
  const [previewItem, setPreviewItem] = useState<KeuanganInboxItemDto | null>(null);
  const [previewBa, setPreviewBa] = useState<BaTextDto | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const totalPending = items.reduce((sum, item) => sum + (item.total || 0), 0);
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

  const openPreview = async (item: KeuanganInboxItemDto) => {
    setPreviewError(null);
    setPreviewBa(null);
    setPreviewItem(item);
    setPreviewLoading(true);
    try {
      const res = await c1Service.getBeritaAcara(item.submission_id);
      if (res.success && res.data) {
        setPreviewBa(res.data);
      } else {
        setPreviewError(res.error?.message || 'Isi berita acara belum tersedia');
      }
    } catch (e: unknown) {
      setPreviewError(getErrorMessage(e, 'Gagal memuat isi berita acara'));
    } finally {
      setPreviewLoading(false);
    }
  };

  // Dipanggil dari tombol "Tanda tangani" di pratinjau — isi BA yang sudah
  // termuat dipakai langsung untuk lembar TTD (tanpa fetch ulang).
  const startSigningFromPreview = () => {
    if (!previewItem) {
      return;
    }
    setSigning(previewItem);
    setBaText(previewBa?.statements ?? null);
    setBaNumber(previewBa?.ba_number ?? null);
    setSignError(null);
    setPreviewItem(null);
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
    <View style={styles.container}>
      <AppHeader title="Staf Keuangan" variant="main" />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Berita Acara</Text>
          <Text style={styles.sectionCaption}>Rekap Berita Acara PPK</Text>
        </View>
        {!isLoading && !error ? (
          <AppCard>
            <View style={styles.rowBetween}>
              <View style={styles.rekapLeft}>
                <Icon
                  name={'file-document-multiple-outline'}
                  size={22}
                  color={Colors.brand.deepGreen}
                />
                <Text style={styles.cardTitle}>Rekap</Text>
              </View>
              <Text style={styles.meta}>{formatPeriod(period)}</Text>
            </View>
            <View style={styles.rekapStats}>
              <View style={styles.rekapStat}>
                <Text style={styles.rekapValue}>{items.length}</Text>
                <Text style={styles.rekapLabel}>Draft menunggu</Text>
              </View>
              <View style={styles.rekapDivider} />
              <View style={styles.rekapStat}>
                <Text style={styles.rekapValue}>{formatCurrency(totalPending)}</Text>
                <Text style={styles.rekapLabel}>Total nilai</Text>
              </View>
            </View>
          </AppCard>
        ) : null}
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
          <DraftBaCard
            key={`${item.kind}-${item.submission_id}`}
            item={item}
            onSign={openPreview}
          />
        ))}
        {previewItem ? (
          <BaPreviewSheet
            visible
            onClose={() => setPreviewItem(null)}
            ba={previewBa}
            loading={previewLoading}
            error={previewError}
            onSign={
              !previewLoading && !previewError && previewBa ? startSigningFromPreview : undefined
            }
          />
        ) : null}
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
            onClose={() => setSigning(null)}></SignSheet>
        ) : null}
        {isLoading && items.length === 0 ? <ActivityIndicator size="large" /> : null}
        <AppCard>
          <View style={styles.placeholderRow}>
            <Icon name={'history'} size={28} color={Colors.text.muted} />
            <View style={styles.placeholderTextWrap}>
              <Text style={styles.placeholderTitle}>Riwayat Berita Acara</Text>
              <Text style={styles.placeholderNote}>
                Menyusul — riwayat BA untuk bendahara belum ada endpointnya. Menunggu backend.
              </Text>
            </View>
          </View>
        </AppCard>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Laporan</Text>
          <Text style={styles.sectionCaption}>Rekap dan laporan keuangan ranting</Text>
        </View>
        <AppCard>
          <View style={styles.placeholderRow}>
            <Icon name={'file-chart-outline'} size={28} color={Colors.text.muted} />
            <View style={styles.placeholderTextWrap}>
              <Text style={styles.placeholderTitle}>Kartu Laporan</Text>
              <Text style={styles.placeholderNote}>
                Isi kartu Laporan belum ditentukan. Menyusul setelah kontennya disepakati.
              </Text>
            </View>
          </View>
        </AppCard>
      </ScrollView>
    </View>
  );
};

/**
 * Kartu draf BA PPK menunggu tanda tangan Bendahara.
 * Seluruh kartu bisa ditekan untuk membuka lembar tanda tangan (kecuali yang
 * needs_force — tetap menunggu Admin Ranting).
 */
const DraftBaCard: React.FC<{
  item: KeuanganInboxItemDto;
  onSign: (item: KeuanganInboxItemDto) => void;
}> = ({item, onSign}) => {
  const officer = item.officer_name ?? 'Petugas';
  const name = (
    <View style={cardStyles.headerRow}>
      <View style={cardStyles.avatar}>
        <Text style={cardStyles.avatarText}>{getInitials(officer)}</Text>
      </View>
      <View style={cardStyles.headerText}>
        <Text style={cardStyles.officer} numberOfLines={1}>
          {officer}
        </Text>
        <View style={cardStyles.branchRow}>
          <Icon name={'storefront-outline'} size={12} color={Colors.text.muted} />
          <Text style={cardStyles.branch} numberOfLines={1}>
            {item.branch_name}
          </Text>
        </View>
      </View>
      <StatusBadge status="pending" label={item.status} />
    </View>
  );

  const body = (
    <AppCard style={cardStyles.card}>
      <View style={cardStyles.eyebrowRow}>
        <Text style={cardStyles.eyebrow}>Draft BA PPK</Text>
      </View>
      {name}
      <View style={cardStyles.amountBlock}>
        <Text style={cardStyles.amountLabel}>Total BA PPK</Text>
        <Text style={cardStyles.amount}>{formatCurrency(item.total)}</Text>
      </View>
      {item.needs_force ? (
        <View style={cardStyles.forceBox}>
          <Icon name={'shield-alert-outline'} size={18} color={Colors.status.warning} />
          <Text style={cardStyles.forceText}>
            Masih ada tugas ACTIVE — teruskan ke Admin Ranting (force).
          </Text>
        </View>
      ) : (
        <View style={cardStyles.footer}>
          <Icon name={'file-document-outline'} size={18} color={Colors.brand.emerald} />
          <Text style={cardStyles.footerText}>Baca lalu tandatangani</Text>
          <Icon name={'chevron-right'} size={20} color={Colors.brand.emerald} />
        </View>
      )}
    </AppCard>
  );

  if (item.needs_force) {
    return <View accessibilityRole="none">{body}</View>;
  }

  return (
    <AppPressable
      accessibilityRole="button"
      accessibilityLabel={`Baca draf BA PPK milik ${officer}, ${item.branch_name}, ${formatCurrency(item.total)}, lalu tandatangani`}
      pressedOpacity={0.72}
      onPress={() => onSign(item)}>
      {body}
    </AppPressable>
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
  cardTitle: {...Typography.heading3, fontWeight: '700'},
  rekapLeft: {flexDirection: 'row', alignItems: 'center', gap: Spacing.sm},
  rekapStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    gap: Spacing.md,
  },
  rekapStat: {flex: 1, alignItems: 'flex-start'},
  rekapValue: {...Typography.heading3, fontWeight: '800', color: Colors.text.primary},
  rekapLabel: {...Typography.caption, color: Colors.text.muted, marginTop: 2},
  rekapDivider: {width: 1, alignSelf: 'stretch', backgroundColor: Colors.border.warm},
  sectionHeader: {
    gap: Spacing.xs / 2,
    marginTop: Spacing.xs,
  },
  sectionTitle: {
    ...Typography.heading3,
    fontWeight: '700',
    color: Colors.brand.deepGreen,
  },
  sectionCaption: {
    ...Typography.bodySmall,
    color: Colors.text.muted,
  },
  placeholderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  placeholderTextWrap: {flex: 1, gap: 2},
  placeholderTitle: {...Typography.label, color: Colors.text.primary},
  placeholderNote: {...Typography.bodySmall, color: Colors.text.muted},
  meta: {...Typography.body, color: Colors.text.muted, marginTop: Spacing.xs},

  error: {...Typography.body, color: Colors.status.error},
});

const cardStyles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: Colors.border.warm,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  eyebrowRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  eyebrow: {
    ...Typography.caption,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: Colors.brand.emerald,
    textTransform: 'uppercase',
  },
  headerRow: {flexDirection: 'row', alignItems: 'center', gap: Spacing.md},
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface.avatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {...Typography.label, fontSize: 18, color: Colors.brand.deepGreen},
  headerText: {flex: 1, gap: 2},
  officer: {...Typography.label, fontSize: 15},
  branchRow: {flexDirection: 'row', alignItems: 'center', gap: 4},
  branch: {...Typography.caption, color: Colors.text.muted, flexShrink: 1},
  amountBlock: {
    backgroundColor: Colors.surface.cardMuted,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: 2,
  },
  amountLabel: {
    ...Typography.caption,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: Colors.text.muted,
  },
  amount: {
    ...Typography.heading1,
    fontSize: 28,
    letterSpacing: -0.8,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border.warm,
    paddingTop: Spacing.md,
  },
  footerText: {...Typography.label, color: Colors.brand.emerald, flex: 1},
  forceBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.surface.warningSoft,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  forceText: {
    ...Typography.bodySmall,
    color: Colors.status.warning,
    fontWeight: '600',
    flex: 1,
  },
});

export default KeuanganScreen;
