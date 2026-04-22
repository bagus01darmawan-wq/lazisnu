// Dashboard Screen - Mobile App

import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDashboardStore, useSyncStore } from '../stores';

const DashboardScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { todayStats, weekStats, pendingTasks, recentCollections, fetchDashboard, isLoading } =
    useDashboardStore();
  const { pendingCount, checkStatus } = useSyncStore();

  useEffect(() => {
    fetchDashboard();
    checkStatus();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={() => { fetchDashboard(); checkStatus(); }} />
      }
    >
      {/* Banner Mode Trip Aktif */}
      {pendingCount > 0 && (
        <View style={styles.offlineBanner}>
          <Icon name="wifi-off" size={24} color="#fff" style={styles.offlineIcon} />
          <View style={styles.offlineContent}>
            <Text style={styles.offlineTitle}>Mode Trip Aktif</Text>
            <Text style={styles.offlineDesc}>{pendingCount} data infaq tersimpan offline dan akan sinkronisasi otomatis saat online.</Text>
          </View>
        </View>
      )}

      {/* Welcome Section */}
      <View style={styles.welcomeSection}>
        <Text style={styles.welcomeText}>Selamat Datang, Petugas!</Text>
        <Text style={styles.dateText}>
          {new Date().toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </Text>
      </View>

      {/* Today's Stats Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Hari Ini</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{todayStats?.collected || 0}</Text>
            <Text style={styles.statLabel}>Dijemput</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {formatCurrency(todayStats?.total_amount || 0)}
            </Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, styles.remainingValue]}>
              {todayStats?.remaining || 0}
            </Text>
            <Text style={styles.statLabel}>Sisa</Text>
          </View>
        </View>
      </View>

      {/* Week Stats Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Minggu Ini</Text>
        <View style={styles.weekStatsContainer}>
          <View style={styles.weekStatItem}>
            <Icon name="package-variant" size={24} color="#4CAF50" />
            <View style={styles.weekStatContent}>
              <Text style={styles.weekStatValue}>{weekStats?.collected || 0}</Text>
              <Text style={styles.weekStatLabel}>Penjemputan</Text>
            </View>
          </View>
          <View style={styles.weekStatItem}>
            <Icon name="cash" size={24} color="#4CAF50" />
            <View style={styles.weekStatContent}>
              <Text style={styles.weekStatValue}>
                {formatCurrency(weekStats?.total_amount || 0)}
              </Text>
              <Text style={styles.weekStatLabel}>Total</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Scan')}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#1E88E5' }]}>
            <Icon name="qrcode-scan" size={32} color="#fff" />
          </View>
          <Text style={styles.actionText}>Scan QR</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Tasks')}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#FF9800' }]}>
            <Icon name="clipboard-list" size={32} color="#fff" />
          </View>
          <Text style={styles.actionText}>Lihat Tugas</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('History')}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#4CAF50' }]}>
            <Icon name="history" size={32} color="#fff" />
          </View>
          <Text style={styles.actionText}>Riwayat</Text>
        </TouchableOpacity>
      </View>

      {/* Pending Tasks Preview */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Tugas Pending</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Tasks')}>
            <Text style={styles.seeAllText}>Lihat Semua</Text>
          </TouchableOpacity>
        </View>

        {pendingTasks && pendingTasks.length > 0 ? (
          pendingTasks.slice(0, 3).map((task, index) => (
            <TouchableOpacity key={task.id || index} style={styles.taskCard}>
              <View style={styles.taskIcon}>
                <Icon name="package-variant" size={20} color="#1E88E5" />
              </View>
              <View style={styles.taskContent}>
                <Text style={styles.taskOwner}>{task.owner_name}</Text>
                <Text style={styles.taskAddress} numberOfLines={1}>
                  {task.owner_address}
                </Text>
              </View>
              <Icon name="chevron-right" size={20} color="#999" />
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Icon name="check-circle" size={48} color="#4CAF50" />
            <Text style={styles.emptyText}>Semua tugas telah selesai!</Text>
          </View>
        )}
      </View>

      {/* Recent Collections */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Penjemputan Terakhir</Text>
          <TouchableOpacity onPress={() => navigation.navigate('History')}>
            <Text style={styles.seeAllText}>Lihat Semua</Text>
          </TouchableOpacity>
        </View>

        {recentCollections && recentCollections.length > 0 ? (
          recentCollections.slice(0, 5).map((collection, index) => (
            <View key={collection.id || index} style={styles.collectionCard}>
              <View style={styles.collectionIcon}>
                <Icon name="cash" size={20} color="#4CAF50" />
              </View>
              <View style={styles.collectionContent}>
                <Text style={styles.collectionOwner}>{(collection as any).owner_name}</Text>
                <Text style={styles.collectionDate}>
                  {new Date(collection.collected_at).toLocaleDateString('id-ID')}
                </Text>
              </View>
              <Text style={styles.collectionAmount}>
                {formatCurrency(collection.nominal)}
              </Text>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Icon name="inbox" size={48} color="#ddd" />
            <Text style={styles.emptyText}>Belum ada penjemputan</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  offlineBanner: {
    backgroundColor: '#FF9800',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  offlineIcon: {
    marginRight: 12,
  },
  offlineContent: {
    flex: 1,
  },
  offlineTitle: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  offlineDesc: {
    color: '#fff',
    fontSize: 12,
    marginTop: 2,
  },
  welcomeSection: {
    backgroundColor: '#1E88E5',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  dateText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: -20,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#e0e0e0',
  },
  remainingValue: {
    color: '#FF9800',
  },
  weekStatsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  weekStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weekStatContent: {
    marginLeft: 12,
  },
  weekStatValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  weekStatLabel: {
    fontSize: 12,
    color: '#999',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 10,
  },
  actionButton: {
    alignItems: 'center',
  },
  actionIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  seeAllText: {
    fontSize: 14,
    color: '#1E88E5',
    fontWeight: '500',
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  taskIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e3f2fd',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  taskContent: {
    flex: 1,
  },
  taskOwner: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  taskAddress: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  collectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  collectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  collectionContent: {
    flex: 1,
  },
  collectionOwner: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  collectionDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  collectionAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: '#999',
  },
});

export default DashboardScreen;