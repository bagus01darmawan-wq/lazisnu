import React, {memo} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, {FadeInUp, Layout as AnimatedLayout} from 'react-native-reanimated';
import type {Collection} from '@lazisnu/shared-types';
import {AppCard} from '../../components/ui';
import {Colors, Radius, Spacing, Typography} from '../../theme';
import {formatCurrency, formatDate} from '../../utils';

export interface HistoryItemProps {
  item: Collection;
  index: number;
  onCorrect: (item: Collection) => void;
  onViewFailureDetail?: (item: Collection) => void;
}

/**
 * Status kartu ditampilkan sebagai ikon (sejajar nama pemilik, kanan) agar
 * kartu ramping. Warna ikon mengikuti warna teks badge lama; label status
 * tetap dibacakan screen reader via accessibilityLabel.
 */
const getStatusIcon = (item: Collection): {name: string; color: string; label: string} => {
  if (item.sync_status === 'PENDING') {
    return {name: 'cloud-upload-outline', color: Colors.status.warning, label: 'Belum Terkirim'};
  }
  if (item.sync_status === 'FAILED') {
    return {name: 'alert-circle-outline', color: Colors.status.error, label: 'Gagal Terkirim'};
  }
  if (item.pending_correction) {
    return {name: 'update', color: Colors.status.warning, label: 'Koreksi Menunggu'};
  }
  if (Number(item.submit_sequence || 1) > 1) {
    return {name: 'pencil-outline', color: Colors.status.warning, label: 'Terkoreksi'};
  }
  return {name: 'check-circle-outline', color: Colors.status.success, label: 'Tersimpan'};
};

export const HistoryItem = memo(
  ({item, index, onCorrect, onViewFailureDetail}: HistoryItemProps) => {
    const statusIcon = getStatusIcon(item);

    return (
      <Animated.View
        entering={FadeInUp.delay(index * 40).duration(320)}
        layout={AnimatedLayout.springify()}>
        <AppCard variant={'elevated'} style={styles.historyCard}>
          <View style={styles.cardTopRow}>
            <View style={styles.dateRow}>
              <Icon name={'calendar-outline'} size={16} color={Colors.text.muted} />
              <Text style={styles.dateText}>{formatDate(item.collected_at)}</Text>
            </View>
            <View style={styles.qrRow}>
              <Icon name={'qrcode'} size={16} color={Colors.text.muted} />
              <Text style={styles.qrText} numberOfLines={1}>
                {item.can?.qr_code || '-'}
              </Text>
            </View>
          </View>

          <View style={styles.identityRow}>
            <View style={styles.packageIcon}>
              <Icon name={'package-variant-closed'} size={24} color={Colors.brand.deepGreen} />
            </View>
            <View style={styles.identityContent}>
              <Text style={styles.ownerName} numberOfLines={1}>
                {item.can?.owner_name || 'Donatur'}
              </Text>
              <Text style={styles.ownerAddress} numberOfLines={2}>
                {item.can?.owner_address || 'Alamat tidak tersedia'}
              </Text>
            </View>
            <Icon
              name={statusIcon.name}
              size={22}
              color={statusIcon.color}
              accessibilityLabel={statusIcon.label}
            />
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
            {item.sync_status === 'FAILED' ? (
              <TouchableOpacity
                accessibilityRole={'button'}
                accessibilityLabel={'Lihat detail kegagalan'}
                onPress={() => onViewFailureDetail?.(item)}
                style={styles.correctButton}>
                <Icon name={'alert-circle-outline'} size={17} color={Colors.status.error} />
                <Text style={[styles.correctButtonText, {color: Colors.status.error}]}>
                  Detail Gagal
                </Text>
              </TouchableOpacity>
            ) : item.sync_status === 'PENDING' ? (
              <TouchableOpacity
                accessibilityRole={'button'}
                accessibilityLabel={'Koreksi data penjemputan yang belum terkirim'}
                onPress={() => onCorrect(item)}
                style={styles.correctButton}>
                <Icon name={'pencil-outline'} size={17} color={Colors.brand.mutedTeal} />
                <Text style={[styles.correctButtonText, {color: Colors.brand.mutedTeal}]}>
                  Koreksi
                </Text>
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
    );
  },
);

const styles = StyleSheet.create({
  historyCard: {
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.warm,
  },
  cardTopRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  dateRow: {flexDirection: 'row', alignItems: 'center', gap: 5},
  dateText: {...Typography.caption, color: Colors.text.secondary},
  qrRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    minWidth: 0,
  },
  qrText: {...Typography.caption, color: Colors.text.muted, flexShrink: 1},
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
  identityContent: {flex: 1, paddingRight: Spacing.sm},
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
});

export default HistoryItem;
