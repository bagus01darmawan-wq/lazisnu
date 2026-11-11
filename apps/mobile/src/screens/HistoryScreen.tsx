import React, {useCallback, useMemo, useRef, useState} from 'react';
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
import {GestureDetector} from 'react-native-gesture-handler';
import NetInfo from '@react-native-community/netinfo';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type {Collection} from '@lazisnu/shared-types';
import type {CanVisitHistoryItem, Task} from '@lazisnu/shared-types';
import {collectionService, tasksService} from '../services/api';
import {correctionQueue, QueuedCorrection} from '../services/offline/corrections';
import {actionQueue} from '../services/offline/actionQueue';
import {composeUncollectedOffline} from '../services/offline/uncollected';
import {useCollectionsStore, usePeriodStore, useSyncStore, useTasksStore} from '../stores';
import {useFocusEffect} from '@react-navigation/native';
import {Colors, ComponentSizes, Layout, Radius, Spacing, Typography} from '../theme';
import {formatPeriod, periodKeyOf} from '../utils/format';
import {AppButton} from '../components/ui';
import {SKIP_REASON_OPTIONS} from '../components/ui/SkipReasonSheet';
import {useTabSwipeSwitch} from '../hooks/useTabSwipeSwitch';
import {
  HistoryCorrectionData,
  HistoryCorrectionFailureModal,
  HistoryCorrectionModal,
  HistoryFailureModal,
  HistoryItem,
} from './history';

type HistoryFilter = 'terjemput' | 'tidak' | 'kunjungan';

const VISIT_PURPOSE_LABELS: Record<CanVisitHistoryItem['purpose'], string> = {
  VERIFIKASI: 'Verifikasi kondisi',
  PENGGANTIAN: 'Penggantian unit',
};

const getVisitOutcomeLabel = (outcome: CanVisitHistoryItem['outcome']): string => {
  switch (outcome) {
    case 'KOSONG':
      return 'Kaleng kosong';
    case 'DIKEMBALIKAN':
      return 'Dikembalikan';
    case 'TIDAK_DIKUNJUNGI':
      return 'Tidak berhasil dikunjungi';
    case 'ISI':
      return 'Pengambilan tersimpan';
  }
  return 'Kunjungan selesai';
};

export const updatePendingCollectionNominal = (offlineId: string, nominal: number): boolean =>
  useCollectionsStore.getState().updatePendingNominal(offlineId, nominal);

const HistoryScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {collections, fetchCollections, loadMore, isLoading, error, page, totalPages} =
    useCollectionsStore();
  const displayYear = usePeriodStore(state => state.context?.display_period.year);
  const displayMonth = usePeriodStore(state => state.context?.display_period.month);
  const refreshPeriod = usePeriodStore(state => state.refresh);
  const displayKey =
    displayYear && displayMonth ? periodKeyOf({year: displayYear, month: displayMonth}) : null;
  const periodLabel = displayKey ? formatPeriod(displayKey) : 'periode berjalan';
  const collectionsThisMonth = useMemo(() => {
    if (!displayKey) return collections;
    return collections.filter(c => c.period === displayKey);
  }, [collections, displayKey]);
  const {checkStatus, failedCorrectionsCount} = useSyncStore();
  const [visits, setVisits] = useState<CanVisitHistoryItem[]>([]);
  const [visitCount, setVisitCount] = useState(0);
  const [visitsPeriodKey, setVisitsPeriodKey] = useState<string | null>(null);
  const [visitsLoading, setVisitsLoading] = useState(false);
  // Masing-masing tab menampung satu jenis aktivitas: koleksi, tidak dijemput,
  // atau catatan kunjungan tanpa pengambilan.
  const [historyTab, setHistoryTab] = useState<HistoryFilter>('terjemput');
  const moveHistoryTab = useCallback((direction: -1 | 1) => {
    setHistoryTab(current => {
      const tabs: HistoryFilter[] = ['terjemput', 'tidak', 'kunjungan'];
      const index = tabs.indexOf(current);
      const nextIndex = Math.max(0, Math.min(tabs.length - 1, index + direction));
      return tabs[nextIndex] ?? current;
    });
  }, []);
  // Geser samping berpindah satu filter tanpa melingkar dari ujung ke ujung.
  const tabSwipeGesture = useTabSwipeSwitch({
    onNext: () => moveHistoryTab(1),
    onPrevious: () => moveHistoryTab(-1),
  });
  const [uncollected, setUncollected] = useState<Task[]>([]);
  // Sumber baca saat offline menyusun daftar — sinkron tiap render.
  const uncollectedRef = useRef<Task[]>([]);
  uncollectedRef.current = uncollected;
  const [uncollectedLoading, setUncollectedLoading] = useState(false);
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const [uncollectedCount, setUncollectedCount] = useState(0);
  const [correction, setCorrection] = useState<HistoryCorrectionData | null>(null);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failureItem, setFailureItem] = useState<Collection | null>(null);
  const [showFailedCorrections, setShowFailedCorrections] = useState(false);
  const [failedCorrectionItems, setFailedCorrectionItems] = useState<QueuedCorrection[]>([]);
  const visitsThisPeriod = visitsPeriodKey === displayKey ? visits : [];
  const visitCountThisPeriod = visitsPeriodKey === displayKey ? visitCount : 0;
  const collectionCountThisPeriod = collectionsThisMonth.length;
  const periodActivityCount =
    collectionCountThisPeriod + uncollectedCount + visitCountThisPeriod;

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
      // Offline: server tak bisa ditanya — gabungkan daftar terakhir yang
      // masih tampil dengan aksi skip yang menunggu replay di perangkat,
      // agar tindakan yang barusan dilakukan tetap terhitung di sini.
      const netInfo = await NetInfo.fetch();
      if (!(netInfo.isConnected && netInfo.isInternetReachable)) {
        const composed = composeUncollectedOffline(uncollectedRef.current, actionQueue.getQueue(), {
          displayPeriod: displayKey ?? undefined,
        });
        const pickupTasks = composed.filter(task => task.kind !== 'VISIT' && !task.is_visit_task);
        setUncollected(pickupTasks);
        setUncollectedCount(pickupTasks.length);
        return;
      }
      const res = await tasksService.getTasks({
        status: 'UNCOLLECTED',
        kind: 'PICKUP',
        page: 1,
        limit: 50,
        ...(displayYear && displayMonth ? {year: displayYear, month: displayMonth} : {}),
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
  }, [displayKey, displayMonth, displayYear]);

  const fetchVisits = useCallback(async () => {
    setVisitsLoading(true);
    try {
      const response = await collectionService.getVisits({
        limit: 500,
        ...(displayYear && displayMonth ? {year: displayYear, month: displayMonth} : {}),
        excludeCollected: true,
      });
      if (response.success && response.data) {
        setVisits(response.data.items || []);
        setVisitCount(response.data.pagination?.total ?? response.data.items?.length ?? 0);
        setVisitsPeriodKey(displayKey);
      }
    } catch {
      // Riwayat yang terakhir berhasil dimuat tetap tersedia saat offline.
    } finally {
      setVisitsLoading(false);
    }
  }, [displayKey, displayMonth, displayYear]);

  // Refetch setiap kali tab kembali fokus: layar tab tidak pernah di-unmount,
  // dan aksi di Scan (tandai tidak dijemput) atau penjemputan baru mengubah
  // angka filter dan daftar di sini — tanpa ini tampil basi sampai di-swipe.
  useFocusEffect(
    useCallback(() => {
      refreshPeriod();
      fetchUncollected();
      fetchVisits();
      fetchCollections();
      checkStatus();
    }, [checkStatus, fetchCollections, fetchUncollected, fetchVisits, refreshPeriod]),
  );

  const handleReopen = useCallback(
    (task: Task) => {
      Alert.alert(
        'Jemput Sekarang',
        `Aktifkan kembali tugas kaleng ${task.qr_code} untuk ${periodLabel}?`,
        [
          {text: 'Batal', style: 'cancel'},
          {
            text: 'Ya, Jemput',
            onPress: async () => {
              setReopeningId(task.id);
              try {
                const res = await tasksService.reopenTask(task.id);
                if (res.success) {
                  await fetchUncollected();
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
    [fetchUncollected, periodLabel],
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

  const renderVisitItem = useCallback(({item}: {item: CanVisitHistoryItem}) => {
    const visitedDate = new Date(item.visited_at).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    return (
      <View style={styles.visitRowCard}>
        <View style={styles.visitIconWrap}>
          <Icon
            name={item.purpose === 'PENGGANTIAN' ? 'swap-horizontal' : 'eye-check-outline'}
            size={21}
            color={Colors.brand.emerald}
          />
        </View>
        <View style={styles.visitTextWrap}>
          <View style={styles.visitTopRow}>
            <Text style={styles.visitOwner} numberOfLines={1}>
              {item.owner_name || item.qr_code || 'Kaleng'}
            </Text>
            <Text style={styles.visitOutcome}>{getVisitOutcomeLabel(item.outcome)}</Text>
          </View>
          <Text style={styles.visitDescription} numberOfLines={1}>
            Kaleng non-aktif · {VISIT_PURPOSE_LABELS[item.purpose]}
          </Text>
          <View style={styles.visitFooter}>
            <Text style={styles.visitSub}>{visitedDate}</Text>
            <Text style={styles.visitNoAmount}>Tanpa nominal</Text>
          </View>
        </View>
      </View>
    );
  }, []);

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
            <Text style={styles.summaryValue}>{periodActivityCount}</Text>
            <Text style={styles.summaryLabel}>Aktivitas {periodLabel}</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Filter tab — gaya pill "Hari Ini/Minggu Ini" Beranda, tanpa kartu. */}
      <View style={styles.filterWrap}>
        <View style={styles.historyFilters}>
          {[
            {label: 'Terjemput', count: collectionCountThisPeriod, value: 'terjemput' as const},
            {label: 'Tidak Dijemput', count: uncollectedCount, value: 'tidak' as const},
            {label: 'Kunjungan', count: visitCountThisPeriod, value: 'kunjungan' as const},
          ].map(option => {
            const selected = historyTab === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                accessibilityRole="tab"
                accessibilityState={{selected}}
                onPress={() => setHistoryTab(option.value)}
                activeOpacity={0.8}
                style={[styles.historyFilter, selected && styles.historyFilterSelected]}>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                  style={[styles.historyFilterLabel, selected && styles.historyFilterLabelSelected]}>
                  {option.label}
                </Text>
                <Text
                  style={[styles.historyFilterCount, selected && styles.historyFilterCountSelected]}>
                  {option.count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
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

      <GestureDetector gesture={tabSwipeGesture}>
        <View style={styles.listWrap}>
          {historyTab === 'terjemput' ? (
            <FlatList
              data={collectionsThisMonth}
              renderItem={renderItem}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
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
          ) : historyTab === 'tidak' ? (
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
                      <Icon
                        name={'package-variant-closed'}
                        size={22}
                        color={Colors.status.warning}
                      />
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
                      <Icon
                        name={'clipboard-check-outline'}
                        size={44}
                        color={Colors.brand.deepGreen}
                      />
                    </View>
                    <Text style={styles.emptyTitle}>Tidak ada tugas tertunda</Text>
                    <Text style={styles.emptyText}>
                      Tugas yang Anda tandai tidak dijemput pada {periodLabel} akan muncul di sini.
                    </Text>
                  </View>
                ) : undefined
              }
              refreshControl={
                <RefreshControl
                  refreshing={uncollectedLoading}
                  onRefresh={fetchUncollected}
                  colors={[Colors.brand.emerald]}
                  tintColor={Colors.brand.emerald}
                />
              }
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <FlatList
              data={visitsThisPeriod}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={renderVisitItem}
              ListHeaderComponent={
                <View style={styles.visitListHeader}>
                  <Text style={styles.visitListTitle}>Daftar kunjungan</Text>
                  <Text style={styles.visitListSubtitle}>
                    Catatan kunjungan tanpa penjemputan
                  </Text>
                </View>
              }
              ListEmptyComponent={
                visitsLoading ? (
                  <ActivityIndicator style={styles.loadingFooter} color={Colors.brand.emerald} />
                ) : (
                  <View style={styles.emptyContainer}>
                    <View style={styles.emptyIcon}>
                      <Icon name="eye-check-outline" size={42} color={Colors.brand.deepGreen} />
                    </View>
                    <Text style={styles.emptyTitle}>Belum ada kunjungan</Text>
                    <Text style={styles.emptyText}>
                      Catatan kunjungan non-penjemputan pada {periodLabel} akan muncul di sini.
                    </Text>
                  </View>
                )
              }
              refreshControl={
                <RefreshControl
                  refreshing={visitsLoading}
                  onRefresh={fetchVisits}
                  colors={[Colors.brand.emerald]}
                  tintColor={Colors.brand.emerald}
                />
              }
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </GestureDetector>

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
  listWrap: {flex: 1},
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
    backgroundColor: Colors.surface.card,
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
  historyFilters: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  historyFilter: {
    flex: 1,
    minWidth: 0,
    minHeight: 54,
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.warm,
    backgroundColor: Colors.surface.card,
  },
  historyFilterSelected: {
    borderColor: Colors.brand.deepGreen,
    backgroundColor: Colors.brand.deepGreen,
  },
  historyFilterLabel: {
    ...Typography.caption,
    color: Colors.text.secondary,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  historyFilterLabelSelected: {color: Colors.text.inverse},
  historyFilterCount: {
    ...Typography.label,
    color: Colors.text.primary,
    fontSize: 13,
    lineHeight: 17,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  historyFilterCountSelected: {color: Colors.brand.mutedSand},
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
  visitListHeader: {
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  visitListTitle: {...Typography.heading3, color: Colors.brand.deepGreen},
  visitListSubtitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: Spacing.xs,
  },
  visitRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface.card,
    borderWidth: 1,
    borderColor: Colors.border.warm,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  visitIconWrap: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.successSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visitTextWrap: {flex: 1, minWidth: 0},
  visitTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  visitOwner: {
    ...Typography.bodySmall,
    color: Colors.text.primary,
    fontWeight: '700',
    flex: 1,
  },
  visitOutcome: {
    ...Typography.caption,
    color: Colors.status.success,
    backgroundColor: Colors.surface.successSubtle,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    fontWeight: '700',
    overflow: 'hidden',
  },
  visitDescription: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  visitFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  visitSub: {...Typography.caption, color: Colors.text.secondary},
  visitNoAmount: {...Typography.caption, color: Colors.status.warning, fontWeight: '600'},
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
