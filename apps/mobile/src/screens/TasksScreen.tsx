import React, {useCallback, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import {GestureDetector} from 'react-native-gesture-handler';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import type {Task} from '@lazisnu/shared-types';
import {CanCondition} from '@lazisnu/shared-types';
import {useTasksStore, useSyncStore, usePeriodStore} from '../stores';
import {Colors, ComponentSizes, Layout, Radius, Shadows, Spacing, Typography} from '../theme';
import type {MainNavigationProp} from '../navigation/types';
import {TaskItem, TaskSearchBar} from './tasks';
import {SyncIssuesSheet} from '../components/SyncIssuesSheet';
import {SyncStatusModal} from '../components/SyncStatusModal';
import {useTabSwipeSwitch} from '../hooks/useTabSwipeSwitch';
import {matchesTaskQuery} from '../utils';

const TASK_FILTERS_HEIGHT = 54;

type TaskTab = 'aktif' | 'nonaktif';

const TasksScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<MainNavigationProp>();
  const {
    pendingCount,
    permanentFailedCount,
    pendingCorrectionsCount,
    failedCorrectionsCount,
    pendingActionsCount,
    failedActionsCount,
    checkStatus,
    triggerSync,
  } = useSyncStore();
  const totalSyncIssues =
    pendingCount +
    permanentFailedCount +
    pendingCorrectionsCount +
    failedCorrectionsCount +
    pendingActionsCount +
    failedActionsCount;
  const {
    tasks,
    fetchTasks,
    loadMore,
    isLoading,
    error,
    page,
    totalPages,
    fetchStats,
    reorderTasks,
  } = useTasksStore();
  const refreshPeriod = usePeriodStore(state => state.refresh);
  const [searchQuery, setSearchQuery] = useState('');
  const [issuesVisible, setIssuesVisible] = useState(false);
  const [syncStatusVisible, setSyncStatusVisible] = useState(false);
  const syncWaiting = pendingCount + pendingCorrectionsCount + pendingActionsCount;
  const syncReview = permanentFailedCount + failedCorrectionsCount + failedActionsCount;
  const [taskTab, setTaskTab] = useState<TaskTab>('aktif');

  // Geser samping untuk berpindah tab Aktif ↔ Non-Aktif (urutan pill).
  const tabSwipeGesture = useTabSwipeSwitch({
    onNext: () => setTaskTab('nonaktif'),
    onPrevious: () => setTaskTab('aktif'),
  });

  // Refetch setiap kali tab kembali fokus: layar tab tidak pernah di-unmount,
  // dan aksi di layar lain (jemput, reopen dari Riwayat) mengubah data tugas —
  // tanpa ini daftar basi sampai pengguna swipe-refresh sendiri.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        await refreshPeriod();
        if (cancelled) return;
        const display = usePeriodStore.getState().context?.display_period;
        fetchTasks();
        fetchStats(display);
        checkStatus();
      })();
      return () => {
        cancelled = true;
      };
    }, [checkStatus, fetchTasks, fetchStats, refreshPeriod]),
  );

  const copyToClipboard = useCallback((text: string) => {
    Clipboard.setString(text);
    ToastAndroid.show('Kode QR disalin', ToastAndroid.SHORT);
  }, []);

  // Tugas penjemputan: semua assignment ACTIVE dengan kind PICKUP. Kaleng
  // NON_AKTIF tetap disaring dari tab ini sebagai jaring pengaman data lama.
  const filteredTasks = tasks.filter(task => {
    if (task.kind === 'VISIT' || task.condition === CanCondition.NON_AKTIF) {
      return false;
    }
    return matchesTaskQuery(task, searchQuery);
  });

  // Tugas kunjungan: assignment VISIT bulan ini, sudah per petugas dan
  // tersimpan di cache yang sama dengan tugas penjemputan.
  const visitTasks = useMemo<Task[]>(() => {
    return tasks.filter(
      task =>
        (task.kind === 'VISIT' || task.condition === CanCondition.NON_AKTIF) &&
        matchesTaskQuery(task, searchQuery),
    );
  }, [tasks, searchQuery]);

  // Pengganti drag-reorder: react-native-draggable-flatlist 4.0.3 tidak
  // kompatibel dengan reanimated 4 + gesture-handler 3 (scroll daftar mati
  // total — diuji 2026-10-25; upstream tidak aktif sejak Mei 2025). Urutan
  // pribadi kini dipindah lewat menu tekan-lama pada kartu tugas.
  const showReorderMenu = useCallback(
    (task: Task) => {
      const {tasks} = useTasksStore.getState();
      const index = tasks.findIndex(t => t.id === task.id);
      if (index < 0) return;
      const move = (to: number) => {
        const next = [...tasks];
        const [moved] = next.splice(index, 1);
        if (moved) next.splice(to, 0, moved);
        reorderTasks(next.map(t => t.id));
      };
      const buttons: Array<{
        text: string;
        onPress?: () => void;
        style?: 'cancel' | 'default' | 'destructive';
      }> = [];
      if (index > 0) {
        buttons.push({text: 'Naikkan', onPress: () => move(index - 1)});
      }
      if (index < tasks.length - 1) {
        buttons.push({text: 'Turunkan', onPress: () => move(index + 1)});
      }
      buttons.push({text: 'Batal', style: 'cancel'});
      Alert.alert(task.owner_name, 'Pindahkan urutan tugas ini?', buttons);
    },
    [reorderTasks],
  );

  const renderTaskItem = useCallback(
    ({item}: {item: Task}) => (
      <TaskItem
        item={item}
        onCopy={copyToClipboard}
        onPress={task => navigation.navigate('TaskDetail', {task})}
        onLongPressDrag={() => showReorderMenu(item)}
      />
    ),
    [copyToClipboard, navigation, showReorderMenu],
  );

  const renderVisitItem = useCallback(
    ({item}: {item: Task}) => (
      <TaskItem
        item={item}
        onCopy={copyToClipboard}
        onPress={task => navigation.navigate('TaskDetail', {task})}
      />
    ),
    [copyToClipboard, navigation],
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Icon name={'clipboard-check-outline'} size={44} color={Colors.brand.deepGreen} />
      </View>
      <Text style={styles.emptyTitle}>Semua tugas selesai</Text>
      <Text style={styles.emptyText}>Tidak ada penjemputan yang masih menunggu.</Text>
    </View>
  );

  const renderEmptyVisit = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Icon name={'package-variant-closed'} size={44} color={Colors.brand.deepGreen} />
      </View>
      <Text style={styles.emptyTitle}>Tidak ada kaleng non-aktif</Text>
      <Text style={styles.emptyText}>Tidak ada kunjungan yang masih menunggu.</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.brand.heroStart, Colors.brand.deepGreen, Colors.brand.heroEnd]}
        style={[styles.header, {paddingTop: insets.top + Spacing.lg}]}>
        <View style={styles.titleRow}>
          <View style={styles.titleColumn}>
            <Text style={styles.headerTitle}>Daftar Tugas</Text>
            <Text style={styles.headerSubtitle}>
              {isLoading && page === 1
                ? 'Memuat penugasan...'
                : taskTab === 'aktif'
                  ? `${filteredTasks.length} tugas ditampilkan`
                  : `${visitTasks.length} kaleng non-aktif`}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityRole={totalSyncIssues ? 'button' : undefined}
            accessibilityLabel={
              totalSyncIssues ? `${totalSyncIssues} data belum tersinkronisasi` : undefined
            }
            disabled={!totalSyncIssues}
            activeOpacity={totalSyncIssues ? 0.8 : 1}
            onPress={() => setSyncStatusVisible(true)}
            style={styles.iconButton}>
            <Icon
              name={
                permanentFailedCount || failedCorrectionsCount || failedActionsCount
                  ? 'cloud-alert'
                  : pendingCount || pendingCorrectionsCount || pendingActionsCount
                    ? 'cloud-sync-outline'
                    : 'cloud-check-outline'
              }
              size={28}
              color={Colors.text.white}
            />
            {!!totalSyncIssues && (
              <View style={styles.syncCountBadge}>
                <Text style={styles.syncCountText}>{totalSyncIssues}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <TaskSearchBar
          searchQuery={searchQuery}
          onChangeText={setSearchQuery}
          onClear={() => setSearchQuery('')}
        />
      </LinearGradient>

      {!!error && !isLoading && (
        <TouchableOpacity
          accessibilityRole={'button'}
          accessibilityLabel={'Coba lagi memuat tugas'}
          onPress={() => fetchTasks()}
          style={styles.errorBanner}>
          <Icon name={'alert-circle-outline'} size={20} color={Colors.status.error} />
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retryText}>Coba lagi</Text>
        </TouchableOpacity>
      )}

      <GestureDetector gesture={tabSwipeGesture}>
        <View style={styles.listWrap}>
          {/* Filter melayang di atas daftar — kartu terlihat lewat celah antar tombol. */}
          <View style={styles.filterWrap}>
            <View style={styles.taskFilters}>
              {[
                {label: 'Aktif', count: filteredTasks.length, value: 'aktif' as const},
                {label: 'Non-Aktif', count: visitTasks.length, value: 'nonaktif' as const},
              ].map(option => {
                const selected = taskTab === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    accessibilityRole="tab"
                    accessibilityState={{selected}}
                    onPress={() => setTaskTab(option.value)}
                    activeOpacity={0.8}
                    style={[styles.taskFilter, selected && styles.taskFilterSelected]}>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                      style={[
                        styles.taskFilterLabel,
                        selected && styles.taskFilterLabelSelected,
                      ]}>
                      {option.label}
                    </Text>
                    <Text
                      style={[
                        styles.taskFilterCount,
                        selected && styles.taskFilterCountSelected,
                      ]}>
                      {option.count}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <FlatList
            data={taskTab === 'aktif' ? filteredTasks : visitTasks}
            renderItem={taskTab === 'aktif' ? renderTaskItem : renderVisitItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContainer}
            ListHeaderComponent={
              // B2: kaleng NON_AKTIF — bukan penjemputan, tapi kunjungan penyelesaian.
              taskTab === 'nonaktif' && visitTasks.length > 0 ? (
                <Text style={styles.listSectionTitle}>Perlu Dikunjungi ({visitTasks.length})</Text>
              ) : undefined
            }
            ListEmptyComponent={
              isLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size={'large'} color={Colors.brand.emerald} />
                  <Text style={styles.loadingText}>Memuat tugas...</Text>
                </View>
              ) : taskTab === 'aktif' ? (
                renderEmpty
              ) : (
                renderEmptyVisit
              )
            }
            refreshControl={
              <RefreshControl
                refreshing={isLoading && page === 1}
                onRefresh={() => {
                  fetchTasks();
                  fetchStats();
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
            maxToRenderPerBatch={10}
            windowSize={5}
          />
        </View>
      </GestureDetector>
      <SyncStatusModal
        visible={syncStatusVisible}
        onClose={() => setSyncStatusVisible(false)}
        waiting={syncWaiting}
        review={syncReview}
        onRetry={triggerSync}
        onDetail={() => setIssuesVisible(true)}
      />
      <SyncIssuesSheet visible={issuesVisible} onClose={() => setIssuesVisible(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface.page,
  },
  header: {
    overflow: 'hidden',
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: Spacing.md,
    borderBottomLeftRadius: Radius.hero,
    borderBottomRightRadius: Radius.hero,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  titleColumn: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncCountBadge: {
    position: 'absolute',
    right: -5,
    top: -5,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.status.error,
  },
  syncCountText: {
    ...Typography.caption,
    color: Colors.text.white,
    fontWeight: '700',
    fontSize: 11,
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
  listWrap: {
    flex: 1,
    position: 'relative',
  },
  filterWrap: {
    position: 'absolute',
    top: Spacing.sm,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: Layout.screenPadding,
  },
  taskFilters: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  taskFilter: {
    flex: 1,
    minWidth: 0,
    minHeight: TASK_FILTERS_HEIGHT,
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.warm,
    backgroundColor: Colors.surface.card,
    ...Shadows.medium,
  },
  taskFilterSelected: {
    borderColor: Colors.brand.deepGreen,
    backgroundColor: Colors.brand.deepGreen,
  },
  taskFilterLabel: {
    ...Typography.caption,
    color: Colors.text.secondary,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  taskFilterLabelSelected: {
    color: Colors.text.inverse,
  },
  taskFilterCount: {
    ...Typography.label,
    color: Colors.text.primary,
    fontSize: 13,
    lineHeight: 17,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  taskFilterCountSelected: {
    color: Colors.brand.mutedSand,
  },
  listContainer: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: TASK_FILTERS_HEIGHT + Spacing.xl,
    paddingBottom: ComponentSizes.bottomTabHeight + Spacing.xxl,
    flexGrow: 1,
  },
  listSectionTitle: {
    ...Typography.heading3,
    color: Colors.brand.deepGreen,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  errorBanner: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Layout.screenPadding,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.errorSoft,
  },
  errorText: {
    flex: 1,
    ...Typography.caption,
    color: Colors.status.error,
  },
  retryText: {
    ...Typography.label,
    color: Colors.status.error,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  loadingText: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
    marginTop: Spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: 80,
  },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface.successSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...Typography.heading3,
    color: Colors.text.primary,
    marginTop: Spacing.md,
  },
  emptyText: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    lineHeight: 20,
  },
  loadingFooter: {
    paddingVertical: Spacing.lg,
  },
});

export default TasksScreen;
