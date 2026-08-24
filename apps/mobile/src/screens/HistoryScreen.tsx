import React, {useCallback, useEffect, useState} from 'react';
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
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type {Collection} from '@lazisnu/shared-types';
import {correctionQueue, QueuedCorrection} from '../services/offline/corrections';
import {useCollectionsStore, useSyncStore, useTasksStore} from '../stores';
import {Colors, Layout, Radius, Spacing, Typography} from '../theme';
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
  const {collections, fetchCollections, loadMore, isLoading, error, page, totalPages, total} =
    useCollectionsStore();
  const {checkStatus, failedCorrectionsCount} = useSyncStore();
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

  const dismissFailedCorrection = useCallback((correctionId: string) => {
    correctionQueue.removeFromFailedPermanent([correctionId]);
    setFailedCorrectionItems(correctionQueue.getFailedPermanent());
  }, []);

  const openFailureDetail = useCallback((item: Collection) => {
    setFailureItem(item);
  }, []);

  useEffect(() => {
    fetchCollections();
    checkStatus();
  }, [checkStatus, fetchCollections]);

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
      <View style={[styles.header, {paddingTop: insets.top + Spacing.sm}]}>
        <Text style={styles.headerTitle}>Riwayat Penjemputan</Text>
        <Text style={styles.headerSubtitle}>Data penjemputan yang sudah tersimpan</Text>
        <View style={styles.headerSummary}>
          <View style={styles.summaryIcon}>
            <Icon name={'history'} size={24} color={Colors.brand.deepGreen} />
          </View>
          <View>
            <Text style={styles.summaryValue}>{total}</Text>
            <Text style={styles.summaryLabel}>Total riwayat penjemputan</Text>
          </View>
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

      <FlatList
        data={collections}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          collections.length ? <Text style={styles.listTitle}>Terbaru</Text> : null
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
          ) : null
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
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />

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
    paddingBottom: Spacing.lg,
    backgroundColor: Colors.brand.deepGreen,
    borderBottomLeftRadius: Radius.panel,
    borderBottomRightRadius: Radius.panel,
  },
  headerTitle: {...Typography.heading1, color: Colors.text.white},
  headerSubtitle: {...Typography.bodySmall, color: Colors.text.white, opacity: 0.78, marginTop: 3},
  headerSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.brand.mutedSand,
    borderRadius: Radius.lg,
    padding: Spacing.sm,
    marginTop: Spacing.md,
  },
  summaryIcon: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    backgroundColor: Colors.overlay.lightGlass,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  summaryValue: {...Typography.heading2, color: Colors.brand.deepGreen},
  summaryLabel: {...Typography.caption, color: Colors.brand.deepGreen},
  listContent: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    flexGrow: 1,
  },
  listTitle: {...Typography.heading3, color: Colors.brand.deepGreen, marginBottom: Spacing.sm},
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
