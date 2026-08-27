import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type {Task} from '@lazisnu/shared-types';
import {AppCard} from '../../components/ui';
import {Colors, Spacing, Typography} from '../../theme';
import {formatCurrency, formatPeriod} from '../../utils';

export interface KalengInfoCardProps {
  task: Task;
  /** Tampilkan baris Periode — relevan untuk detail dari kartu tugas. */
  showPeriod?: boolean;
}

/**
 * Kartu informasi kaleng (Kode QR, Pemilik, HP, Alamat, dst).
 * Dipakai bersama oleh:
 * - ScanResultCard (hasil scan QR — alur kamera)
 * - TaskDetailScreen (detail dari kartu tugas belum dijemput)
 * Satu sumber informasi agar perilaku & tampilan konsisten.
 */
export const KalengInfoCard: React.FC<KalengInfoCardProps> = ({task, showPeriod = false}) => {
  return (
    <AppCard variant="elevated" style={styles.detailCard}>
      <View style={styles.detailRow}>
        <Icon name="identifier" size={20} color={Colors.brand.emerald} />
        <View style={styles.detailContent}>
          <Text style={styles.detailLabel}>Kode QR</Text>
          <Text style={styles.detailValue}>{task.qr_code}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.detailRow}>
        <Icon name="account" size={20} color={Colors.brand.emerald} />
        <View style={styles.detailContent}>
          <Text style={styles.detailLabel}>Nama Pemilik</Text>
          <Text style={styles.detailValue}>{task.owner_name}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.detailRow}>
        <Icon name="phone" size={20} color={Colors.brand.emerald} />
        <View style={styles.detailContent}>
          <Text style={styles.detailLabel}>Nomor HP</Text>
          <Text style={styles.detailValue}>{task.owner_phone}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.detailRow}>
        <Icon name="map-marker" size={20} color={Colors.brand.emerald} />
        <View style={styles.detailContent}>
          <Text style={styles.detailLabel}>Alamat</Text>
          <Text style={styles.detailValue}>{task.owner_address || 'Alamat belum tersedia'}</Text>
        </View>
      </View>

      {showPeriod && (
        <>
          <View style={styles.divider} />
          <View style={styles.detailRow}>
            <Icon name="calendar-month-outline" size={20} color={Colors.brand.emerald} />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Periode</Text>
              <Text style={styles.detailValue}>{formatPeriod(task.period)}</Text>
            </View>
          </View>
        </>
      )}

      {task.last_collection && (
        <>
          <View style={styles.divider} />
          <View style={styles.detailRow}>
            <Icon name="history" size={20} color={Colors.status.warning} />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Penjemputan Terakhir</Text>
              <Text style={styles.detailValue}>
                {formatCurrency(task.last_collection.nominal)}
              </Text>
            </View>
          </View>
        </>
      )}
    </AppCard>
  );
};

const styles = StyleSheet.create({
  detailCard: {
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.warm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border.warm,
    marginVertical: 4,
  },
  detailContent: {
    flex: 1,
    marginLeft: 12,
  },
  detailLabel: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  detailValue: {
    ...Typography.body,
    fontWeight: '600',
    color: Colors.text.primary,
    marginTop: 2,
  },
});

export default KalengInfoCard;
