import React, {memo, useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, {FadeInUp, Layout as AnimatedLayout} from 'react-native-reanimated';
import type {Collection} from '@lazisnu/shared-types';
import {useCollectionsStore, useSyncStore, useTasksStore} from '../stores';
import api from '../services/api';
import {offlineQueue} from '../services/offline/queue';
import {AppButton, AppCard, AppTextInput, StatusBadge} from '../components/ui';
import {Colors, Layout, Radius, Spacing, Typography} from '../theme';

export const updatePendingCollectionNominal = (
  offlineId: string,
  nominal: number,
): boolean => offlineQueue.updateNominal(offlineId, nominal);

const formatCurrency = (nominal: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(nominal);

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const HistoryItem = memo(
  ({
    item,
    index,
    onCorrect,
    onViewFailureDetail,
  }: {
    item: Collection;
    index: number;
    onCorrect: (item: Collection) => void;
    onViewFailureDetail?: (item: Collection) => void;
  }) => (
    <Animated.View
      entering={FadeInUp.delay(index * 40).duration(320)}
      layout={AnimatedLayout.springify()}>
      <AppCard variant={'elevated'} style={styles.historyCard}>
        <View style={styles.cardTopRow}>
          <View style={styles.dateRow}>
            <Icon name={'calendar-outline'} size={16} color={Colors.text.muted} />
            <Text style={styles.dateText}>{formatDate(item.collected_at)}</Text>
          </View>
          {item.sync_status === 'PENDING' ? (
            <StatusBadge status={'pending'} label={'Belum Terkirim'} />
          ) : item.sync_status === 'FAILED' ? (
            <StatusBadge status={'error'} label={'Gagal Terkirim'} />
          ) : (
            <StatusBadge status={'success'} label={'Tersimpan'} />
          )}
        </View>

        <View style={styles.identityRow}>
          <View style={styles.packageIcon}>
            <Icon
              name={'package-variant-closed'}
              size={24}
              color={Colors.brand.deepGreen}
            />
          </View>
          <View style={styles.identityContent}>
            <Text style={styles.ownerName} numberOfLines={1}>
              {item.can?.owner_name || 'Donatur'}
            </Text>
            <Text style={styles.ownerAddress} numberOfLines={2}>
              {item.can?.owner_address || 'Alamat tidak tersedia'}
            </Text>
          </View>
        </View>

        <View style={styles.valueRow}>
          <View>
            <Text style={styles.valueLabel}>Nominal diterima</Text>
            <Text
              style={styles.nominalValue}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}>
              {formatCurrency(Number(item.nominal))}
            </Text>
          </View>
        </View>

        <View style={styles.cardBottomRow}>
          <View style={styles.qrRow}>
            <Icon name={'qrcode'} size={16} color={Colors.text.muted} />
            <Text style={styles.qrText} numberOfLines={1}>
              {item.can?.qr_code || '-'}
            </Text>
          </View>
          {item.sync_status === 'FAILED' ? (
            <TouchableOpacity
              accessibilityRole={'button'}
              accessibilityLabel={'Lihat detail kegagalan'}
              onPress={() => onViewFailureDetail?.(item)}
              style={styles.correctButton}>
              <Icon name={'alert-circle-outline'} size={17} color={Colors.status.error} />
              <Text style={[styles.correctButtonText, { color: Colors.status.error }]}>Detail Gagal</Text>
            </TouchableOpacity>
          ) : item.sync_status === 'PENDING' ? (
            <TouchableOpacity
              accessibilityRole={'button'}
              accessibilityLabel={'Koreksi data penjemputan yang belum terkirim'}
              onPress={() => onCorrect(item)}
              style={styles.correctButton}>
              <Icon name={'pencil-outline'} size={17} color={Colors.brand.mutedTeal} />
              <Text style={[styles.correctButtonText, { color: Colors.brand.mutedTeal }]}>Koreksi</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              accessibilityRole={'button'}
              accessibilityLabel={'Koreksi data penjemputan'}
              onPress={() => onCorrect(item)}
              style={styles.correctButton}>
              <Icon name={'pencil-outline'} size={17} color={Colors.brand.deepGreen} />
              <Text style={styles.correctButtonText}>Koreksi</Text>
            </TouchableOpacity>
          )}
        </View>
      </AppCard>
    </Animated.View>
  ),
);

type Correction = {
  id: string;
  nominal: string;
  originalNominal: number;
  isPending: boolean; // true = item masih di queue lokal, false = sudah sync ke server
};

const HistoryScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {collections, fetchCollections, loadMore, isLoading, error, page, totalPages, total} =
    useCollectionsStore();
  const {checkStatus} = useSyncStore();
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failureItem, setFailureItem] = useState<Collection | null>(null);

  const openFailureDetail = useCallback((item: Collection) => {
    setFailureItem(item);
  }, []);

  useEffect(() => {
    fetchCollections();
    checkStatus();
  }, [checkStatus, fetchCollections]);

  const openCorrection = useCallback((item: Collection) => {
    setCorrection({
      id: item.offline_id || item.id,
      nominal: String(item.nominal),
      originalNominal: item.nominal,
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
      Alert.alert('Koreksi Tersimpan', 'Nominal diperbarui. Data akan dikirim saat koneksi tersedia.');
      return;
    }

    // Synced items: koreksi via API resubmit
    if (reason.trim().length < 5) {
      Alert.alert('Alasan Terlalu Singkat', 'Jelaskan alasan koreksi minimal 5 karakter.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.collection.resubmitCollection(correction.id, {
        nominal,
        alasan_resubmit: reason.trim(),
      });
      if (!response.success) {
        Alert.alert('Koreksi Gagal', response.error?.message || 'Data belum dapat dikoreksi.');
        return;
      }
      setCorrection(null);
      setReason('');
      await fetchCollections();
      Alert.alert('Koreksi Tersimpan', 'Riwayat telah diperbarui.');
    } catch {
      Alert.alert('Koreksi Gagal', 'Terjadi kesalahan saat mengirim koreksi.');
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
        <Text style={styles.headerSubtitle}>
          Data penjemputan yang sudah tersimpan
        </Text>
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
            onRefresh={() => { fetchCollections(); checkStatus(); }}
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

      <Modal
        visible={!!correction}
        transparent
        animationType={'fade'}
        onRequestClose={closeCorrection}>
        <View style={styles.modalOverlay}>
          <AppCard variant={'elevated'} style={styles.modalCard}>
            <View style={styles.modalHeading}>
              <View>
                <Text style={styles.modalTitle}>Koreksi Penjemputan</Text>
                <Text style={styles.modalSubtitle}>
                  {correction?.isPending
                    ? 'Nominal akan diperbarui sebelum dikirim ke server.'
                    : 'Perubahan akan tercatat dalam audit.'}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole={'button'}
                accessibilityLabel={'Tutup koreksi'}
                onPress={closeCorrection}
                style={styles.closeButton}>
                <Icon name={'close'} size={22} color={Colors.text.secondary} />
              </TouchableOpacity>
            </View>

            <AppTextInput
              label={'Nominal baru'}
              keyboardType={'numeric'}
              value={correction?.nominal || ''}
              onChangeText={text =>
                setCorrection(previous =>
                  previous ? {...previous, nominal: text.replace(/\D/g, '')} : null,
                )
              }
              placeholder={'Masukkan nominal'}
            />
            {!correction?.isPending && (
              <AppTextInput
                label={'Alasan koreksi'}
                multiline
                numberOfLines={3}
                value={reason}
                onChangeText={setReason}
                placeholder={'Contoh: salah memasukkan nominal'}
                helperText={'Minimal 5 karakter'}
              />
            )}

            <View style={styles.modalActions}>
              <View style={styles.modalButton}>
                <AppButton
                  label={'Batal'}
                  variant={'outline'}
                  onPress={closeCorrection}
                  disabled={isSubmitting}
                  fullWidth
                />
              </View>
              <View style={styles.modalButton}>
                <AppButton
                  label={'Simpan Koreksi'}
                  onPress={submitCorrection}
                  loading={isSubmitting}
                  fullWidth
                />
              </View>
            </View>
          </AppCard>
        </View>
      </Modal>

      {/* Modal Detail Gagal Kirim */}
      <Modal
        visible={!!failureItem}
        transparent
        animationType="fade"
        onRequestClose={() => setFailureItem(null)}
      >
        <View style={styles.modalOverlay}>
          <AppCard style={styles.modalCard}>
            <View style={styles.modalHeading}>
              <View>
                <Text style={styles.modalTitle}>Detail Gagal Kirim</Text>
                <Text style={styles.modalSubtitle}>Transaksi tertunda di perangkat</Text>
              </View>
              <TouchableOpacity onPress={() => setFailureItem(null)} style={styles.closeButton}>
                <Icon name="close" size={24} color={Colors.text.muted} />
              </TouchableOpacity>
            </View>

            <View style={{ marginBottom: Spacing.md }}>
              <Text style={styles.inputLabel}>Kaleng Infaq</Text>
              <Text style={styles.textValue}>{failureItem?.can?.owner_name || 'Donatur'} ({failureItem?.can?.qr_code || '-'})</Text>

              <Text style={styles.inputLabel}>Nominal</Text>
              <Text style={styles.textValue}>{failureItem ? formatCurrency(Number(failureItem.nominal)) : ''}</Text>

              <Text style={styles.inputLabel}>Waktu Penjemputan</Text>
              <Text style={styles.textValue}>{failureItem ? formatDate(failureItem.collected_at) : ''}</Text>

              <Text style={styles.inputLabel}>Jumlah Percobaan</Text>
              <Text style={styles.textValue}>{failureItem?.retry_attempts || 0} kali</Text>

              <Text style={styles.inputLabel}>Pesan Masalah</Text>
              <Text style={[styles.textValue, { color: Colors.status.error }]}>
                {failureItem?.error_message || 'Koneksi internet bermasalah. Sistem akan mencoba mengirim kembali secara otomatis.'}
              </Text>
            </View>

            <View style={styles.modalActions}>
              <View style={styles.modalButton}>
                <AppButton
                  label={'Tutup'}
                  variant={'outline'}
                  onPress={() => setFailureItem(null)}
                  disabled={isSubmitting}
                  fullWidth
                />
              </View>
              <View style={styles.modalButton}>
                <AppButton
                  label={'Kirim Ulang'}
                  onPress={async () => {
                    if (!failureItem) {return;}
                    setIsSubmitting(true);
                    try {
                      const failedList = offlineQueue.getFailedPermanent();
                      const itemToRecover = failedList.find(i => i.offline_id === failureItem.id);
                      if (itemToRecover) {
                        itemToRecover.retry_attempts = 0;
                        delete itemToRecover.error_message;
                        delete itemToRecover.error_type;
                        delete itemToRecover.can_retry;
                        delete itemToRecover.next_retry_at;

                        // Tulis active queue lebih dahulu; jika gagal, record tetap di quarantine.
                        offlineQueue.enqueue(itemToRecover);
                        offlineQueue.removeFromFailedPermanent([failureItem.id]);

                        await useSyncStore.getState().triggerSync();
                        setFailureItem(null);
                        await fetchCollections();
                        Alert.alert('Proses Sinkronisasi', 'Mencoba mengirim kembali data penjemputan...');
                      }
                    } catch (err) {
                      Alert.alert('Gagal', 'Terjadi kesalahan saat memproses pengiriman ulang.');
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                  loading={isSubmitting}
                  fullWidth
                />
              </View>
            </View>
          </AppCard>
        </View>
      </Modal>
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
  historyCard: {
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.warm,
  },
  cardTopRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  dateRow: {flexDirection: 'row', alignItems: 'center', gap: 5},
  dateText: {...Typography.caption, color: Colors.text.secondary},
  identityRow: {flexDirection: 'row', alignItems: 'center', marginTop: Spacing.md},
  packageIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.successSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  identityContent: {flex: 1},
  ownerName: {...Typography.heading3, color: Colors.brand.deepGreen},
  ownerAddress: {...Typography.bodySmall, color: Colors.text.secondary, marginTop: 2},
  valueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface.cardMuted,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginTop: Spacing.md,
  },
  valueLabel: {...Typography.caption, color: Colors.text.secondary},
  nominalValue: {...Typography.heading3, color: Colors.brand.emerald, marginTop: 2},
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  qrRow: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, paddingRight: Spacing.sm},
  qrText: {...Typography.caption, color: Colors.text.muted, flex: 1},
  correctButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: Spacing.sm,
    justifyContent: 'center',
  },
  correctButtonText: {...Typography.label, color: Colors.brand.deepGreen},
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
  errorText: {...Typography.caption, color: Colors.text.white, flex: 1, marginHorizontal: Spacing.sm},
  retryText: {...Typography.label, color: Colors.text.white},
  loadingFooter: {paddingVertical: Spacing.lg},
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: Colors.overlay.dark,
    padding: Spacing.md,
  },
  modalCard: {padding: Spacing.lg},
  inputLabel: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: Spacing.sm,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  modalHeading: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md},
  modalTitle: {...Typography.heading3, color: Colors.brand.deepGreen},
  modalSubtitle: {...Typography.caption, color: Colors.text.secondary, marginTop: 3},
  closeButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActions: {flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm},
  modalButton: {flex: 1},
  textValue: {
    ...Typography.bodySmall,
    color: Colors.text.primary,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
});

export default HistoryScreen;
