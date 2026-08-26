import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type {Task} from '@lazisnu/shared-types';
import {AppButton, AppCard} from '../../components/ui';
import {Colors, Radius, Spacing, Typography} from '../../theme';
import {formatCurrency} from '../../utils';

export interface ScanResultCardProps {
  task: Task;
  /** Tandai kaleng tidak dijemput untuk periode berjalan. */
  onSkip: (task: Task) => void;
  onContinue: (task: Task) => void;
}

export const ScanResultCard: React.FC<ScanResultCardProps> = ({task, onSkip, onContinue}) => {
  return (
    <View style={styles.resultContainer}>
      <View style={styles.successIcon}>
        <Icon name="check" size={48} color={Colors.status.success} />
      </View>

      <Text style={styles.successTitle}>QR Code Terdeteksi!</Text>

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

      <View style={styles.actionButtons}>
        <View style={styles.actionHalf}>
          <AppButton
            label="Tidak Dijemput"
            variant="outline"
            icon="cancel"
            onPress={() => onSkip(task)}
            fullWidth
          />
        </View>
        <View style={styles.actionHalf}>
          <AppButton
            label="Lanjutkan"
            icon="arrow-right"
            onPress={() => onContinue(task)}
            fullWidth
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  resultContainer: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface.successSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  successTitle: {
    ...Typography.heading2,
    color: Colors.brand.deepGreen,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
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
  divider: {
    height: 1,
    backgroundColor: Colors.border.warm,
    marginVertical: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  actionHalf: {
    flex: 1,
  },
});

export default ScanResultCard;
