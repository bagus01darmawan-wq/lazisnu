// History Screen - Mobile App

import React, { useEffect, useState } from 'react';
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
import { Collection } from '../types';

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
  }, [filter]);

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

  const getPaymentMethodIcon = (method: string) => {
    return method === 'CASH' ? 'cash' : 'bank-transfer';
  };

  const renderCollectionItem = ({ item }: { item: Collection }) => (
    <View style={styles.collectionCard}>
      <View style={styles.cardHeader}>
        <View style={styles.dateContainer}>
          <Icon name="calendar" size={14} color="#666" />
          <Text style={styles.dateText}>{formatDate(item.collected_at)}</Text>
        </View>
        <View style={styles.methodBadge}>
          <Icon
            name={getPaymentMethodIcon(item.payment_method)}
            size={12}
            color="#1E88E5"
          />
          <Text style={styles.methodText}>
            {item.payment_method === 'CASH' ? 'Tunai' : 'Transfer'}
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.qrInfo}>
          <Icon name="qrcode" size={20} color="#1E88E5" />
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
            color={item.whatsapp_sent ? '#4CAF50' : '#FF9800'}
          />
          <Text
            style={[
              styles.statusText,
              { color: item.whatsapp_sent ? '#4CAF50' : '#FF9800' },
            ]}
          >
            {item.whatsapp_sent ? 'Notifikasi Terkirim' : 'Menunggu'}
          </Text>
        </View>
      </View>

      {item.notes && (
        <View style={styles.notesContainer}>
          <Icon name="note-text" size={14} color="#999" />
          <Text style={styles.notesText}>{item.notes}</Text>
        </View>
      )}
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Icon name="history" size={64} color="#ddd" />
      <Text style={styles.emptyTitle}>Belum Ada Riwayat</Text>
      <Text style={styles.emptyText}>
        Riwayat penjemputan Anda akan muncul di sini
      </Text>
    </View>
  );

  const renderFilterChip = (f: 'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH', label: string) => (
    <TouchableOpacity
      key={f}
      style={[styles.filterChip, filter === f && styles.filterChipActive]}
      onPress={() => setFilter(f)}
    >
      <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const filterOptions: { key: 'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH'; label: string }[] = [
    { key: 'ALL', label: 'Semua' },
    { key: 'TODAY', label: 'Hari Ini' },
    { key: 'THIS_WEEK', label: 'Minggu Ini' },
    { key: 'THIS_MONTH', label: 'Bulan Ini' },
  ];

  return (
    <View style={styles.container}>
      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={filterOptions}
          renderItem={({ item }) => renderFilterChip(item.key, item.label)}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.filterList}
        />
      </View>

      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{collections.length}</Text>
          <Text style={styles.summaryLabel}>Total Jemput</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {formatCurrency(
              collections.reduce((sum: number, c: Collection) => sum + c.nominal, 0)
            )}
          </Text>
          <Text style={styles.summaryLabel}>Total Nominal</Text>
        </View>
      </View>

      {/* Collection List */}
      <FlatList
        data={collections}
        renderItem={renderCollectionItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => fetchCollections(filter)}
          />
        }
        onEndReached={() => {
          if (!isLoading && page < totalPages) {
            loadMore();
          }
        }}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          isLoading && page < totalPages ? (
            <ActivityIndicator style={styles.loadingFooter} color="#1E88E5" />
          ) : null
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  filterContainer: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filterList: {
    paddingHorizontal: 16,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#1E88E5',
  },
  filterText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#fff',
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E88E5',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 11,
    color: '#666',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#e0e0e0',
  },
  listContainer: {
    padding: 16,
    flexGrow: 1,
  },
  collectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  methodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  methodText: {
    fontSize: 11,
    color: '#1E88E5',
    fontWeight: '500',
    marginLeft: 4,
  },
  cardBody: {
    padding: 12,
  },
  qrInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  qrCode: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E88E5',
    marginLeft: 6,
  },
  ownerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  ownerAddress: {
    fontSize: 12,
    color: '#666',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  amountContainer: {},
  amountLabel: {
    fontSize: 10,
    color: '#999',
    marginBottom: 2,
  },
  amountValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4CAF50',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
    marginLeft: 4,
  },
  notesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  notesText: {
    fontSize: 12,
    color: '#999',
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
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  loadingFooter: {
    paddingVertical: 20,
  },
});

export default HistoryScreen;
