import React, { useEffect, useState, useCallback, memo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Clipboard,
  ToastAndroid,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTasksStore } from '../stores';
import { Task } from '@lazisnu/shared-types';
import { Colors, Spacing, Typography, Shadows } from '../theme';
import Animated, { FadeInUp, Layout } from 'react-native-reanimated';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
};

const TaskItem = memo(({ item, index, onScan, onCopy }: { item: Task; index: number; onScan: (task: Task) => void; onCopy: (text: string) => void }) => (
  <Animated.View 
    entering={FadeInUp.delay(index * 50).duration(400)}
    layout={Layout.springify()}
  >
    <TouchableOpacity
      style={styles.taskCard}
      onPress={() => item.status === 'ACTIVE' && onScan(item)}
      activeOpacity={0.7}
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
          <Text style={styles.ownerName}>{item.owner_name}</Text>
          <View style={styles.qrBadge}>
            <Text style={styles.qrCode}>{item.qr_code}</Text>
            <TouchableOpacity onPress={() => onCopy(item.qr_code)} style={styles.copyBtn}>
              <Icon name="content-copy" size={14} color={Colors.secondary.main} />
            </TouchableOpacity>
          </View>
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
            onPress={() => onScan(item)}
          >
            <Icon name="qrcode-scan" size={16} color={Colors.primary.contrast} />
            <Text style={styles.scanButtonText}>Scan QR</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  </Animated.View>
));

const TasksScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { tasks, fetchTasks, loadMore, isLoading, page, totalPages } = useTasksStore();
  const [filter, setFilter] = useState<'ACTIVE' | 'COMPLETED' | 'ALL'>('ACTIVE');

  const copyToClipboard = (text: string) => {
    Clipboard.setString(text);
    ToastAndroid.show('Kode disalin!', ToastAndroid.SHORT);
  };

  useEffect(() => {
    fetchTasks(filter);
  }, [filter, fetchTasks]);

  const handleScan = useCallback((task: Task) => {
    navigation.navigate('Scan', { task });
  }, [navigation]);

  const renderTaskItem = useCallback(({ item, index }: { item: Task; index: number }) => (
    <TaskItem item={item} index={index} onScan={handleScan} onCopy={copyToClipboard} />
  ), [handleScan]);

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Icon name="clipboard-check" size={64} color={Colors.slate[200]} />
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

      <FlatList
        data={tasks}
        renderItem={renderTaskItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl 
            refreshing={isLoading && page === 1} 
            onRefresh={() => fetchTasks(filter)}
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
    flexDirection: 'row',
    backgroundColor: Colors.card,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.slate[100],
  },
  filterTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 20,
    marginRight: Spacing.sm,
    backgroundColor: Colors.slate[100],
  },
  filterTabActive: {
    backgroundColor: Colors.primary.main,
  },
  filterText: {
    fontSize: Typography.body2.fontSize,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  filterTextActive: {
    color: Colors.text.white,
  },
  listContainer: {
    padding: Spacing.md,
    flexGrow: 1,
  },
  taskCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    ...Shadows.soft,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.slate[50],
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusActive: {
    backgroundColor: '#FFFBEB', // Amber 50
  },
  statusCompleted: {
    backgroundColor: Colors.primary.light,
  },
  statusText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
  },
  statusTextActive: {
    color: Colors.status.warning,
  },
  statusTextCompleted: {
    color: Colors.status.success,
  },
  taskDate: {
    fontSize: Typography.caption.fontSize,
    color: Colors.text.muted,
  },
  taskBody: {
    padding: Spacing.md,
  },
  taskInfo: {
    marginBottom: Spacing.sm,
  },
  qrBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: Spacing.sm,
    alignSelf: 'flex-start',
  },
  qrCode: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.secondary.main,
  },
  copyBtn: {
    marginLeft: 6,
    padding: 2,
  },
  ownerName: {
    fontSize: Typography.h3.fontSize,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  ownerAddress: {
    fontSize: Typography.body2.fontSize,
    color: Colors.text.secondary,
    lineHeight: 20,
  },
  lastCollection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.slate[50],
    padding: Spacing.sm + 4,
    borderRadius: 12,
    marginTop: Spacing.sm,
  },
  lastCollectionLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.text.muted,
  },
  lastCollectionAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.status.success,
  },
  taskFooter: {
    borderTopWidth: 1,
    borderTopColor: Colors.slate[50],
    padding: Spacing.sm + 4,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary.main,
    borderRadius: 12,
    paddingVertical: 12,
  },
  scanButtonText: {
    color: Colors.text.white,
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
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

export default TasksScreen;