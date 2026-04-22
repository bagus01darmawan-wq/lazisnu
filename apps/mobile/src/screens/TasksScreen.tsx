// Tasks Screen - Mobile App

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
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTasksStore } from '../stores';
import { Task } from '../types';

const TasksScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { tasks, fetchTasks, loadMore, isLoading, page, totalPages } = useTasksStore();
  const [filter, setFilter] = useState<'ACTIVE' | 'COMPLETED' | 'ALL'>('ACTIVE');

  useEffect(() => {
    fetchTasks(filter);
  }, [filter]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const renderTaskItem = ({ item }: { item: Task }) => (
    <TouchableOpacity
      style={styles.taskCard}
      onPress={() => {
        if (item.status === 'ACTIVE') {
          navigation.navigate('Scan', { task: item });
        }
      }}
    >
      <View style={styles.taskHeader}>
        <View
          style={[
            styles.statusBadge,
            item.status === 'ACTIVE' ? styles.statusActive : styles.statusCompleted,
          ]}
        >
          <Text
            style={[
              styles.statusText,
              item.status === 'ACTIVE' ? styles.statusTextActive : styles.statusTextCompleted,
            ]}
          >
            {item.status === 'ACTIVE' ? 'Pending' : 'Selesai'}
          </Text>
        </View>
        <Text style={styles.taskDate}>{item.period}</Text>
      </View>

      <View style={styles.taskBody}>
        <View style={styles.taskInfo}>
          <View style={styles.qrContainer}>
            <Icon name="qrcode" size={20} color="#1E88E5" />
            <Text style={styles.qrCode}>{item.qr_code}</Text>
          </View>
          <Text style={styles.ownerName}>{item.owner_name}</Text>
          <Text style={styles.ownerAddress} numberOfLines={2}>
            {item.owner_address}
          </Text>
        </View>

        {item.last_collection && (
          <View style={styles.lastCollection}>
            <Text style={styles.lastCollectionLabel}>Penjemputan Terakhir</Text>
            <Text style={styles.lastCollectionAmount}>
              {formatCurrency(item.last_collection.nominal)}
            </Text>
          </View>
        )}
      </View>

      {item.status === 'ACTIVE' && (
        <View style={styles.taskFooter}>
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => navigation.navigate('Scan', { task: item })}
          >
            <Icon name="qrcode-scan" size={18} color="#fff" />
            <Text style={styles.scanButtonText}>Scan QR</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Icon name="clipboard-check" size={64} color="#ddd" />
      <Text style={styles.emptyTitle}>Tidak Ada Tugas</Text>
      <Text style={styles.emptyText}>
        {filter === 'ACTIVE'
          ? 'Semua tugas telah selesai dijemput'
          : 'Belum ada histori penjemputan'}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {(['ACTIVE', 'COMPLETED', 'ALL'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'ACTIVE' ? 'Pending' : f === 'COMPLETED' ? 'Selesai' : 'Semua'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Task List */}
      <FlatList
        data={tasks}
        renderItem={renderTaskItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={() => fetchTasks(filter)} />
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
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: '#f5f5f5',
  },
  filterTabActive: {
    backgroundColor: '#1E88E5',
  },
  filterText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#fff',
  },
  listContainer: {
    padding: 16,
    flexGrow: 1,
  },
  taskCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusActive: {
    backgroundColor: '#fff3e0',
  },
  statusCompleted: {
    backgroundColor: '#e8f5e9',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusTextActive: {
    color: '#FF9800',
  },
  statusTextCompleted: {
    color: '#4CAF50',
  },
  taskDate: {
    fontSize: 12,
    color: '#999',
  },
  taskBody: {
    padding: 16,
  },
  taskInfo: {
    marginBottom: 12,
  },
  qrContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  qrCode: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E88E5',
    marginLeft: 8,
  },
  ownerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  ownerAddress: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  lastCollection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
  },
  lastCollectionLabel: {
    fontSize: 12,
    color: '#999',
  },
  lastCollectionAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  taskFooter: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    padding: 12,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E88E5',
    borderRadius: 8,
    paddingVertical: 10,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
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

export default TasksScreen;