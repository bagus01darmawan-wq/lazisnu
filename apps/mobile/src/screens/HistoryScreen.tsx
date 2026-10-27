import React, {useCallback, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type {Collection} from '@lazisnu/shared-types';
import type {CanVisitHistoryItem, Task} from '@lazisnu/shared-types';
import {collectionService, tasksService} from '../services/api';
import {correctionQueue, QueuedCorrection} from '../services/offline/corrections';
import {useCollectionsStore, useSyncStore, useTasksStore} from '../stores';
import {useFocusEffect} from '@react-navigation/native';
import {Colors, ComponentSizes, Layout, Radius, Spacing, Typography} from '../theme';
import {AppButton, SegmentedControl} from '../components/ui';
import {SKIP_REASON_OPTIONS} from '../components/ui/SkipReasonSheet';
import {
  HistoryCorrectionData,
  HistoryCorrectionFailureModal,
  HistoryCorrectionModal,
  HistoryFailureModal,
  HistoryItem,
} from './history';

export const updatePendingCollectionNominal = (offlineId: string, nominal: number): boolean =>
  useCollectionsStore.getState().updatePendingNominal(offlineId, nominal);

const HistoryScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {collections, fetchCollections, loadMore, isLoading, error, page, totalPages} =
    useCollectionsStore();
  const collectionsThisMonth = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return collections.filter(c => {
      const t = Date.parse(String(c.collected_at).replace(' ', 'T'));
      return !isNaN(t) && t >= start;
    });
  }, [collections]);
  const {checkStatus, failedCorrectionsCount} = useSyncStore();
  const [visits, setVisits] = useState<CanVisitHistoryItem[]>([]);
  // Tab Riwayat: "terjemput" = riwayat penjemputan (list lama); "tidak" =
  // tugas UNCOLLECTED periode berjalan yang masih bisa dibuka kembali.
  const [historyTab, setHistoryTab] = useState<'terjemput' | 'tidak'>('terjemput');
  const [uncollected, setUncollected] = useState<Task[]>([]);
  const [uncollectedLoading, setUncollectedLoading] = useState(false);
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const [completedPeriodCount, setCompletedPeriodCount] = useState(0);
  const [uncollectedCount, setUncollectedCount] = useState(0);
  const [correction, setCorrection] = useState<HistoryCorrectionData | null>(null);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failureItem, setFailureItem] = useState<Collection | null>(null);
  const [showFailedCorrections, setShowFailedCorrections] = useState(false);
  const [failedCorrectionItems, setFailedCorrectionItems] = useState<QueuedCorrection[]>([]);

  const openFailedCorrections = useCallback(() => {
    setFailedCorrectionItems(correctionQueue.getFailedPermanent());
    setShowFailedCorrections(true);
  }, []);

  // ── Tab "Tidak Dijemput" + hitungan filter ──────────────────────────────
  // Angka dihitung server (pagination.total) agar filter & kartu statistik
  // akurat — bukan hitungan client dari daftar yang terpotong paginasi.
  const fetchUncollected = useCallback(async () => {
    setUncollectedLoading(true);
    try {
      const res = await tasksService.getTasks({
        status: 'UNCOLLECTED',
        page: 1,
        limit: 50,
        current_period: true,
      });
      if (res.success && res.data) {
        setUncollected(res.data.tasks || []);
        setUncollectedCount(res.data.pagination?.total || 0);
      }
    } catch {
      // Senyap: daftar lama tetap tampil; tarik-untuk-refresh bisa mengulang.
    } finally {
      setUncollectedLoading(false);
    }
  }, []);

  const fetchRiwayatCounts = useCallback(async () => {
    try {
      const [done, skipped] = await Promise.all([
        tasksService.getTasks({status: 'COMPLETED', page: 1, limit: 1, current_period: true}),
        tasksService.getTasks({status: 'UNCOLLECTED', page: 1, limit: 1, current_period: true}),
      ]);
      setCompletedPeriodCount(done.data?.pagination?.total || 0);
      if (!skipped.success) return;
      setUncollectedCount(skipped.data?.pagination?.total || 0);
    } catch {
      // Senyap — angka terakhir dipertahankan.
    }
  }, []);

  // Refetch setiap kali tab kembali fokus: layar tab tidak pernah di-unmount,
  // dan aksi di Scan (tandai tidak dijemput) atau penjemputan baru mengubah
  // angka filter dan daftar di sini — tanpa ini tampil basi sampai di-swipe.
  useFocusEffect(
    useCallback(() => {
      fetchUncollected();
      fetchRiwayatCounts();
      fetchCollections();
      checkStatus();
      // Kunjungan non-penjemputan (gagal senyap — pelengkap, bukan penghalang).
      collectionService
        .getVisits(5)
        .then(res => {
          if (res.success && res.data) {
            setVisits(res.data.items || []);
          }
        })
        .catch(() => {});
    }, [checkStatus, fetchCollections, fetchRiwayatCounts, fetchUncollected]),
  );

  const handleReopen = useCallback(
    (task: Task) => {
      Alert.alert(
        'Jemput Sekarang',
        `Aktifkan kembali tugas kaleng ${task.qr_code} untuk bulan ini?`,
        [
          {text: 'Batal', style: 'cancel'},
          {
            text: 'Ya, Jemput',
            onPress: async () => {
              setReopeningId(task.id);
              try {
                const res = await tasksService.reopenTask(task.id);
                if (res.success) {
                  await Promise.all([fetchUncollected(), fetchRiwayatCounts()]);
                  Alert.alert(
                    'Tugas Aktif Kembali',
                    'Tugas sudah muncul kembali di layar Tugas dan bisa dijalani.',
                  );
                } else {
                  Alert.alert(
                    'Gagal',
                    res.error?.message || 'Tugas tidak dapat diaktifkan kembali.',
                  );
                }
              } catch {
                Alert.alert('Gagal', 'Periksa koneksi internet lalu coba lagi.');
              } finally {
                setReopeningId(null);
              }
            },
          },
        ],
      );
    },
    [fetchUncollected, fetchRiwayatCounts],
  );

  const dismissFailedCorrection = useCallback((correctionId: string) => {
    correctionQueue.removeFromFailedPermanent([correctionId]);
    setFailedCorrectionItems(correctionQueue.getFailedPermanent());
  }, []);

  const openFailureDetail = useCallback((item: Collection) => {
    setFailureItem(item);
  }, []);

  const openCorrection = useCallback((item: Collection) => {
    // Item dengan koreksi offline tertunda menampilkan nominal optimistis;
    // baseline audit harus nominal server asli, bukan hasil overlay.
    const baselineNominal = item.pending_correction
      ? (correctionQueue.getLatestByCollectionId(item.id)?.nominal_lama ?? item.nominal)
      : item.nominal;
    setCorrection({
      id: item.sync_status === 'PENDING' ? item.offline_id || item.id : item.id,
      nominal: String(item.nominal),
      originalNominal: baselineNominal,
      isPending: item.sync_status === 'PENDING',
    });
    setReason('');
  }, []);

  const closeCorrection = () => {
    if (!isSubmitting) {
      setCorrection(null);
      setReason('');
    }
  };

  const submitCorrection = async () => {
    if (!correction) {
      return;
    }
    const nominal = Number(correction.nominal.replace(/\D/g, ''));
    if (!nominal) {
      Alert.alert('Nominal Tidak Valid', 'Masukkan nominal koreksi yang benar.');
      return;
    }

    // PENDING items: koreksi lokal di offlineQueue (belum ada di server)
    if (correction.isPending) {
      const updated = updatePendingCollectionNominal(correction.id, nominal);
      if (!updated) {
        Alert.alert('Koreksi Gagal', 'Item tidak ditemukan di antrean.');
        return;
      }
      useTasksStore.getState().adjustCompletedNominal(nominal - correction.originalNominal);
      setCorrection(null);
      setReason('');
      // Refresh UI dari queue MMKV yang sudah diperbarui.
      await fetchCollections();
      Alert.alert(
        'Koreksi Tersimpan',
        'Nominal diperbarui. Data akan dikirim saat koneksi tersedia.',
      );
      return;
    }

    // Synced items: koreksi via API resubmit lewat Store
    if (reason.trim().length < 5) {
      Alert.alert('Alasan Terlalu Singkat', 'Jelaskan alasan koreksi minimal 5 karakter.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await useCollectionsStore.getState().resubmitCollection(correction.id, {
        nominal,
        alasan_resubmit: reason.trim(),
        nominal_lama: correction.originalNominal,
      });
      if (!response.success) {
        Alert.alert('Koreksi Gagal', response.error || 'Data belum dapat dikoreksi.');
        return;
      }
      setCorrection(null);
      setReason('');
      if (response.queued) {
        Alert.alert(
          'Koreksi Tersimpan',
          'Perubahan dikirim otomatis saat koneksi internet tersedia.',
        );
      } else {
        Alert.alert('Koreksi Tersimpan', 'Riwayat telah diperbarui.');
      }
    } catch {
      Alert.alert('Koreksi Gagal', 'Terjadi kesalahan saat mengirim koreksi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetryFailure = async (id: string) => {
    setIsSubmitting(true);
    try {
      const success = await useCollectionsStore.getState().retryFailedCollection(id);
      if (success) {
        setFailureItem(null);
        Alert.alert('Proses Sinkronisasi', 'Mencoba mengirim kembali data penjemputan...');
      } else {
        Alert.alert('Gagal', 'Item tidak ditemukan di daftar gagal permanen.');
      }
    } catch {
      Alert.alert('Gagal', 'Terjadi kesalahan saat memproses pengiriman ulang.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderItem = useCallback(
    ({item, index}: {item: Collection; index: number}) => (
      <HistoryItem
        item={item}
        index={index}
        onCorrect={openCorrection}
        onViewFailureDetail={openFailureDetail}
      />
    ),
    [openCorrection, openFailureDetail],
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.brand.heroStart, Colors.brand.deepGreen, Colors.brand.heroEnd]}
        style={[styles.header, {paddingTop: insets.top + Spacing.lg}]}>
        <Text style={styles.headerTitle}>Riwayat Tugas</Text>
        <Text style={styles.headerSubtitle}>Data tugas yang sudah tersimpan</Text>
        <View style={styles.headerSummary}>
          <Icon
            name={'history'}
            size={ComponentSizes.fieldIconSize}
            color={Colors.brand.deepGreen}
          />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryValue}>{completedPeriodCount + uncollectedCount}</Text>
            <Text style={styles.summaryLabel}>Tugas selesai bulan ini</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Filter tab — gaya pill "Hari Ini/Minggu Ini" Beranda, tanpa kartu. */}
      <View style={styles.filterWrap}>
        <SegmentedControl
          options={[
            {label: `Terjemput (${completedPeriodCount})`, value: 'terjemput'},
            {label: `Tidak Dijemput (${uncollectedCount})`, value: 'tidak'},
          ]}
          value={historyTab}
          onChange={setHistoryTab}
        />
      </View>

      {error && !isLoading && (
        <View style={styles.errorBanner}>
          <Icon name={'alert-circle-outline'} size={20} color={Colors.text.white} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => fetchCollections()}>
            <Text style={styles.retryText}>Coba lagi</Text>
          </TouchableOpacity>
        </View>
      )}

      {historyTab === 'terjemput' ? (
        <FlatList
          data={collectionsThisMonth}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <>
              {visits.length ? (
                <View style={styles.visitCard}>
                  <Text style={styles.visitTitle}>Kunjungan non-penjemputan</Text>
                  {visits.map(v => (
                    <View key={v.id} style={styles.visitRow}>
                      <Icon
                        name={v.purpose === 'PENGGANTIAN' ? 'swap-horizontal' : 'eye-check-outline'}
                        size={18}
                        color={Colors.brand.deepGreen}
                      />
                      <View style={styles.visitTextWrap}>
                        <Text style={styles.visitText}>
                          {v.purpose === 'PENGGANTIAN' ? 'Penggantian unit' : 'Verifikasi'} ·{' '}
                          {v.owner_name || v.qr_code}
                        </Text>
                        <Text style={styles.visitSub}>
                          {new Date(v.visited_at).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}{' '}
                          · tanpa nominal
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          }
          ListEmptyComponent={
            !isLoading ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIcon}>
                  <Icon name={'history'} size={44} color={Colors.brand.deepGreen} />
                </View>
                <Text style={styles.emptyTitle}>Belum ada riwayat</Text>
                <Text style={styles.emptyText}>
                  Penjemputan yang selesai akan muncul di halaman ini.
                </Text>
              </View>
            ) : undefined
          }
          refreshControl={
            <RefreshControl
              refreshing={isLoading && page === 1}
              onRefresh={() => {
                fetchCollections();
                checkStatus();
              }}
              colors={[Colors.brand.emerald]}
              tintColor={Colors.brand.emerald}
            />
          }
          onEndReached={() => {
            if (!isLoading && page < totalPages) {
              loadMore();
            }
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isLoading && page > 1 ? (
              <ActivityIndicator style={styles.loadingFooter} color={Colors.brand.emerald} />
            ) : undefined
          }
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={uncollected}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({item}) => {
            const reasonLabel = item.skip_reason_code
              ? (SKIP_REASON_OPTIONS.find(o => o.value === item.skip_reason_code)?.label ??
                item.skip_reason_code)
              : 'Ditutup otomatis saat penutupan periode';
            return (
              <View style={styles.uncollectedCard}>
                <View style={styles.uncollectedHead}>
                  <Icon name={'package-variant-closed'} size={22} color={Colors.status.warning} />
                  <View style={styles.uncollectedHeadText}>
                    <Text style={styles.uncollectedOwner}>{item.owner_name}</Text>
                    <Text style={styles.uncollectedQr}>{item.qr_code}</Text>
                  </View>
                </View>
                <Text style={styles.uncollectedReason}>{`Alasan: ${reasonLabel}`}</Text>
                <AppButton
                  label="Jemput Sekarang"
                  icon="restore"
                  onPress={() => handleReopen(item)}
                  loading={reopeningId === item.id}
                  fullWidth
                />
              </View>
            );
          }}
          ListEmptyComponent={
            !uncollectedLoading ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIcon}>
                  <Icon name={'clipboard-check-outline'} size={44} color={Colors.brand.deepGreen} />
                </View>
                <Text style={styles.emptyTitle}>Tidak ada tugas tertunda</Text>
                <Text style={styles.emptyText}>
                  Tugas yang Anda tandai tidak dijemput bulan ini akan muncul di sini.
                </Text>
              </View>
            ) : undefined
          }
          refreshControl={
            <RefreshControl
              refreshing={uncollectedLoading}
              onRefresh={() => {
                fetchUncollected();
                fetchRiwayatCounts();
              }}
              colors={[Colors.brand.emerald]}
              tintColor={Colors.brand.emerald}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {failedCorrectionsCount > 0 && !showFailedCorrections && (
        <TouchableOpacity
          accessibilityRole={'button'}
          accessibilityLabel={'Buka daftar koreksi yang ditolak server'}
          onPress={openFailedCorrections}
          style={styles.failedCorrectionBanner}>
          <Icon name={'pencil-off'} size={18} color={Colors.status.error} />
          <Text style={styles.failedCorrectionText}>
            {failedCorrectionsCount} koreksi ditolak server — ketuk untuk detail
          </Text>
          <Icon name={'chevron-right'} size={20} color={Colors.status.error} />
        </TouchableOpacity>
      )}

      <HistoryCorrectionFailureModal
        visible={showFailedCorrections}
        items={failedCorrectionItems}
        onClose={() => setShowFailedCorrections(false)}
        onDismiss={dismissFailedCorrection}
      />

      <HistoryCorrectionModal
        correction={correction}
        reason={reason}
        isSubmitting={isSubmitting}
        onNominalChange={text =>
          setCorrection(previous =>
            previous ? {...previous, nominal: text.replace(/\D/g, '')} : null,
          )
        }
        onReasonChange={setReason}
        onClose={closeCorrection}
        onSubmit={submitCorrection}
      />

      <HistoryFailureModal
        failureItem={failureItem}
        isSubmitting={isSubmitting}
        onClose={() => setFailureItem(null)}
        onRetry={handleRetryFailure}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.surface.page},
  header: {
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: Spacing.md,
    borderBottomLeftRadius: Radius.hero,
    borderBottomRightRadius: Radius.hero,
  },
  headerTitle: {
    ...Typography.heading1,
    color: Colors.text.white,
    fontSize: 23,
    lineHeight: 29,
  },
  headerSubtitle: {
    ...Typography.body,
    color: Colors.text.white,
    opacity: 0.86,
    marginTop: Spacing.xs,
  },
  headerSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.brand.mutedSand,
    borderRadius: Radius.lg,
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    minHeight: ComponentSizes.fieldHeight,
    gap: ComponentSizes.fieldIconGap,
    marginTop: Spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryValue: {...Typography.heading2, color: Colors.brand.deepGreen},
  summaryLabel: {...Typography.caption, color: Colors.brand.deepGreen, marginLeft: Spacing.sm},
  filterWrap: {
    paddingHorizontal: Layout.screenPadding,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  uncollectedCard: {
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border.warm,
    gap: Spacing.sm,
  },
  uncollectedHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  uncollectedHeadText: {
    flex: 1,
  },
  uncollectedOwner: {...Typography.body, fontWeight: '700', color: Colors.text.primary},
  uncollectedQr: {...Typography.caption, color: Colors.text.muted, marginTop: 2},
  uncollectedReason: {
    ...Typography.caption,
    color: Colors.status.warning,
    backgroundColor: Colors.surface.warningSoft,
    borderRadius: Radius.md,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  listContent: {
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: Spacing.xl,
    flexGrow: 1,
  },
  sectionTitle: {
    ...Typography.heading3,
    color: Colors.brand.deepGreen,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionTitleFirst: {marginTop: Spacing.md},
  visitCard: {
    backgroundColor: Colors.surface.card,
    borderWidth: 1,
    borderColor: Colors.border.warm,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  visitTitle: {...Typography.label, color: Colors.brand.deepGreen},
  visitRow: {flexDirection: 'row', alignItems: 'center', gap: Spacing.sm},
  visitTextWrap: {flex: 1},
  visitText: {...Typography.bodySmall, color: Colors.text.primary},
  visitSub: {...Typography.caption, color: Colors.text.secondary, marginTop: 1},
  emptyContainer: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 70},
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface.successSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {...Typography.heading3, color: Colors.text.primary, marginTop: Spacing.md},
  emptyText: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.status.error,
    margin: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.md,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.text.white,
    flex: 1,
    marginHorizontal: Spacing.sm,
  },
  retryText: {...Typography.label, color: Colors.text.white},
  loadingFooter: {paddingVertical: Spacing.lg},
  failedCorrectionBanner: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    bottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surface.errorSoft,
    borderColor: Colors.status.error,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  failedCorrectionText: {
    ...Typography.caption,
    color: Colors.status.error,
    flex: 1,
    fontWeight: '600',
  },
});

export default HistoryScreen;
