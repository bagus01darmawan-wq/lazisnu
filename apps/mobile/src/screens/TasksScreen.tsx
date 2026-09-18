import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  RefreshControl,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import DraggableFlatList, {RenderItemParams, ScaleDecorator} from 'react-native-draggable-flatlist';
import type {Task} from '@lazisnu/shared-types';
import {AssignmentStatus, CanCondition, VisitTask} from '@lazisnu/shared-types';
import {collectionService} from '../services/api';
import {useTasksStore, useSyncStore} from '../stores';
import {Colors, Layout, Radius, Spacing, Typography} from '../theme';
import type {MainNavigationProp} from '../navigation/types';
import {TaskItem, TaskSearchBar} from './tasks';
import {SyncIssuesSheet} from '../components/SyncIssuesSheet';

const TasksScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<MainNavigationProp>();
  const {
    pendingCount,
    permanentFailedCount,
    pendingCorrectionsCount,
    failedCorrectionsCount,
    checkStatus,
    triggerSync,
  } = useSyncStore();
  const totalSyncIssues =
    pendingCount + permanentFailedCount + pendingCorrectionsCount + failedCorrectionsCount;
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
  const [searchQuery, setSearchQuery] = useState('');
  // Urutan pribadi hanya bermakna pada daftar penuh — saat mencari, drag dinonaktifkan.
  const dragEnabled = !searchQuery.trim();
  const [issuesVisible, setIssuesVisible] = useState(false);
  const [visitRequired, setVisitRequired] = useState<VisitTask[]>([]);
  const [visitLoading, setVisitLoading] = useState(false);

  const fetchVisitRequired = useCallback(async () => {
    setVisitLoading(true);
    try {
      const res = await collectionService.getVisitRequired();
      if (res.success && res.data) {
        setVisitRequired(res.data.items);
      }
    } catch {
      // Bukan halangan utama — daftar penjemputan tetap tampil.
    } finally {
      setVisitLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchStats();
    fetchVisitRequired();
    checkStatus();
  }, [checkStatus, fetchTasks, fetchStats, fetchVisitRequired]);

  const copyToClipboard = useCallback((text: string) => {
    Clipboard.setString(text);
    ToastAndroid.show('Kode QR disalin', ToastAndroid.SHORT);
  }, []);

  const filteredTasks = tasks.filter(task => {
    // B2: kaleng NON_AKTIF mendapat section sendiri ("Perlu Dikunjungi").
    // Meskipun backend /tasks mengembalikan assignment periode berjalan untuk
    // kaleng NON_AKTIF (diperlukan agar penjemputan berisi bisa tersimpan),
    // kaleng itu BUKAN tugas penjemputan biasa — jangan tampilkan dua-duanya.
    if (task.condition === CanCondition.NON_AKTIF) {
      return false;
    }
    const query = searchQuery.toLowerCase().trim();
    if (!query) {
      return true;
    }
    return (
      task.owner_name?.toLowerCase().includes(query) ||
      task.owner_address?.toLowerCase().includes(query) ||
      task.qr_code?.toLowerCase().includes(query)
    );
  });

  const renderTaskItem = useCallback(
    ({item, drag, getIndex}: RenderItemParams<Task>) => (
      <ScaleDecorator activeScale={1.05}>
        <TaskItem
          item={item}
          index={getIndex() ?? 0}
          onCopy={copyToClipboard}
          onPress={task => navigation.navigate('TaskDetail', {task})}
          onLongPressDrag={dragEnabled ? drag : undefined}
        />
      </ScaleDecorator>
    ),
    [copyToClipboard, navigation, dragEnabled],
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
                : `${tasks.length} tugas ditampilkan`}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityRole={totalSyncIssues ? 'button' : undefined}
            accessibilityLabel={
              totalSyncIssues ? `${totalSyncIssues} data belum tersinkronisasi` : undefined
            }
            disabled={!totalSyncIssues}
            activeOpacity={totalSyncIssues ? 0.8 : 1}
            onPress={() => {
              Alert.alert(
                'Data Belum Terkirim',
                'Penjemputan dan koreksi tetap aman tersimpan di perangkat. Aplikasi akan mencoba mengirim kembali secara otomatis.',
                [
                  {text: 'Nanti', style: 'cancel'},
                  {text: 'Lihat Detail', onPress: () => setIssuesVisible(true)},
                  {text: 'Coba Kirim Lagi', onPress: () => triggerSync()},
                ],
              );
            }}
            style={styles.iconButton}>
            <Icon
              name={
                permanentFailedCount || failedCorrectionsCount
                  ? 'cloud-alert'
                  : pendingCount || pendingCorrectionsCount
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

      <Text style={[styles.sectionTitle, styles.sectionTitleFirst]}>Perlu Dijemput</Text>

      {/* B2: kaleng NON_AKTIF — bukan penjemputan, tapi kunjungan penyelesaian. */}
      {visitRequired.length > 0 && (
        <Text style={styles.sectionTitle}>Perlu Dikunjungi ({visitRequired.length})</Text>
      )}
      {visitRequired.map(v => {
        // Kaleng NON_AKTIF tidak punya assignment asli — bentuk tugas ringkas
        // dari data visit-required supaya layar detail bisa dipakai.
        // B2: assignment_id dari backend (periode berjalan) bila sudah ada;
        // kalau belum, id sintetis dipakai hanya sebagai key React —
        // TaskDetailScreen tahu membedakannya via is_visit_task.
        const visitTask: Task = {
          id: v.assignment_id ?? `visit-${v.can_id}`,
          can_id: v.can_id,
          qr_code: v.qr_code,
          owner_name: v.owner_name,
          owner_phone: '',
          owner_address: v.owner_address ?? '',
          latitude: v.latitude,
          longitude: v.longitude,
          condition: CanCondition.NON_AKTIF,
          is_active: true,
          status: AssignmentStatus.ACTIVE,
          assigned_at: v.last_visit ?? new Date().toISOString(),
          period: '',
          is_visit_task: true,
          assignment_status: (v.assignment_status as AssignmentStatus | null) ?? null,
        };
        return (
          <TouchableOpacity
            key={v.can_id}
            accessibilityRole={'button'}
            accessibilityLabel={`Detail kaleng nonaktif ${v.qr_code}`}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('TaskDetail', {task: visitTask})}>
            <TaskItem item={visitTask} index={0} onCopy={copyToClipboard} />
          </TouchableOpacity>
        );
      })}

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

      <DraggableFlatList
        data={filteredTasks}
        renderItem={renderTaskItem}
        keyExtractor={item => item.id}
        onDragEnd={({data}) => reorderTasks(data.map(task => task.id))}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size={'large'} color={Colors.brand.emerald} />
              <Text style={styles.loadingText}>Memuat tugas...</Text>
            </View>
          ) : (
            renderEmpty
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={isLoading && page === 1}
            onRefresh={() => {
              fetchTasks();
              fetchStats();
              fetchVisitRequired();
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
        maxToRenderPerBatch={10}
        windowSize={5}
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
  listContainer: {
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: Spacing.xl,
    flexGrow: 1,
  },
  sectionTitle: {
    ...Typography.heading3,
    color: Colors.brand.deepGreen,
    marginHorizontal: Layout.screenPadding,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionTitleFirst: {marginTop: Spacing.md},
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
