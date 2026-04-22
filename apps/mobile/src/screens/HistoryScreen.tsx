import React, { useEffect, useState, useCallback, memo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCollectionsStore } from '../stores';
import { Collection } from '@lazisnu/shared-types';
import { Colors, Spacing, Typography, Shadows } from '../theme';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const CollectionItem = memo(({ item }: { item: Collection }) => {
  const getPaymentMethodIcon = (method: string) => {
    return method === 'CASH' ? 'cash' : 'bank-transfer';
  };

  return (
    <View style={styles.collectionCard}>
      <View style={styles.cardHeader}>
        <View style={styles.dateContainer}>
          <Icon name="calendar" size={14} color={Colors.text.muted} />
          <Text style={styles.dateText}>{formatDate(item.collected_at)}</Text>
        </View>
        <View style={styles.methodBadge}>
          <Icon
            name={getPaymentMethodIcon(item.payment_method)}
            size={12}
            color={Colors.secondary.main}
          />
          <Text style={styles.methodText}>
            {item.payment_method === 'CASH' ? 'Tunai' : 'Transfer'}
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.qrInfo}>
          <Icon name="qrcode" size={18} color={Colors.secondary.main} />
          <Text style={styles.qrCode}>{item.can?.qr_code || 'N/A'}</Text>
        </View>
        <Text style={styles.ownerName}>{item.can?.owner_name || 'Pemilik'}</Text>
        <Text style={styles.ownerAddress} numberOfLines={1}>
          {item.can?.owner_address || '-'}
        </Text>
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.amountContainer}>
          <Text style={styles.amountLabel}>Nominal</Text>
          <Text style={styles.amountValue}>{formatCurrency(item.nominal)}</Text>
        </View>
        <View style={styles.statusContainer}>
          <Icon
            name={item.whatsapp_sent ? 'check-circle' : 'clock-outline'}
            size={14}
            color={item.whatsapp_sent ? Colors.status.success : Colors.status.warning}
          />
          <Text
            style={[
              styles.statusText,
              { color: item.whatsapp_sent ? Colors.status.success : Colors.status.warning },
            ]}
          >
            {item.whatsapp_sent ? 'Notifikasi Terkirim' : 'Menunggu'}
          </Text>
        </View>
      </View>

      {item.notes && (
        <View style={styles.notesContainer}>
          <Icon name="note-text" size={14} color={Colors.text.muted} />
          <Text style={styles.notesText}>{item.notes}</Text>
        </View>
      )}
    </View>
  );
});

const HistoryScreen: React.FC = () => {
  const {
    collections,
    fetchCollections,
    isLoading,
    page,
    totalPages,
    loadMore,
  } = useCollectionsStore();
  const [filter, setFilter] = useState<'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH'>('ALL');

  useEffect(() => {
    fetchCollections(filter);
  }, [filter, fetchCollections]);

  const renderCollectionItem = useCallback(({ item }: { item: Collection }) => (
    <CollectionItem item={item} />
  ), []);

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Icon name="history" size={64} color={Colors.slate[200]} />
      <Text style={styles.emptyTitle}>Belum Ada Riwayat</Text>
      <Text style={styles.emptyText}>
        Riwayat penjemputan Anda akan muncul di sini
      </Text>
    </View>
  );

  const filterOptions: { key: 'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH'; label: string }[] = [
    { key: 'ALL', label: 'Semua' },
    { key: 'TODAY', label: 'Hari Ini' },
    { key: 'THIS_WEEK', label: 'Minggu Ini' },
    { key: 'THIS_MONTH', label: 'Bulan Ini' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={filterOptions}
          renderItem={({ item }) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.filterChip, filter === item.key && styles.filterChipActive]}
              onPress={() => setFilter(item.key)}
            >
              <Text style={[styles.filterText, filter === item.key && styles.filterTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.filterList}
        />
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{collections.length}</Text>
          <Text style={styles.summaryLabel}>Total Jemput</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {formatCurrency(
              collections.reduce((sum: number, c: Collection) => sum + Number(c.nominal), 0)
            )}
          </Text>
          <Text style={styles.summaryLabel}>Total Nominal</Text>
        </View>
      </View>

      <FlatList
        data={collections}
        renderItem={renderCollectionItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={isLoading && page === 1}
            onRefresh={() => fetchCollections(filter)}
            colors={[Colors.primary.main]}
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
            <ActivityIndicator style={styles.loadingFooter} color={Colors.primary.main} />
          ) : null
        }
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={5}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  filterContainer: {
    backgroundColor: Colors.card,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.slate[100],
  },
  filterList: {
    paddingHorizontal: Spacing.md,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 20,
    backgroundColor: Colors.slate[100],
    marginRight: Spacing.sm,
  },
  filterChipActive: {
    backgroundColor: Colors.primary.main,
  },
  filterText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  filterTextActive: {
    color: Colors.text.white,
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    borderRadius: 16,
    padding: Spacing.md,
    ...Shadows.soft,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: Typography.h3.fontSize,
    fontWeight: '800',
    color: Colors.primary.main,
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.text.muted,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: Colors.slate[100],
  },
  listContainer: {
    padding: Spacing.md,
    flexGrow: 1,
  },
  collectionCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    ...Shadows.soft,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.slate[50],
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.text.secondary,
    marginLeft: 4,
  },
  methodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.secondary.light,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  methodText: {
    fontSize: Typography.caption.fontSize - 1,
    color: Colors.secondary.dark,
    fontWeight: '600',
    marginLeft: 4,
  },
  cardBody: {
    padding: Spacing.md,
  },
  qrInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  qrCode: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.secondary.main,
    marginLeft: 6,
  },
  ownerName: {
    fontSize: Typography.body1.fontSize,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  ownerAddress: {
    fontSize: Typography.body2.fontSize,
    color: Colors.text.secondary,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  amountContainer: {},
  amountLabel: {
    fontSize: Typography.caption.fontSize - 2,
    color: Colors.text.muted,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountValue: {
    fontSize: Typography.h3.fontSize,
    fontWeight: '800',
    color: Colors.status.success,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
    marginLeft: 4,
  },
  notesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.slate[50],
    paddingTop: 8,
  },
  notesText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.text.muted,
    marginLeft: 4,
    fontStyle: 'italic',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: Typography.h3.fontSize,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: Typography.body2.fontSize,
    color: Colors.text.muted,
    textAlign: 'center',
  },
  loadingFooter: {
    paddingVertical: 20,
  },
});

export default HistoryScreen;
