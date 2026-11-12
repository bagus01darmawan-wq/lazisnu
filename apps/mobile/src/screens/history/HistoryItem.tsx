import React, {memo} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type {CanCondition, Collection} from '@lazisnu/shared-types';
import {AppCard} from '../../components/ui';
import {Colors, Radius, Spacing, Typography} from '../../theme';
import {formatDate, formatRtRw} from '../../utils';

export interface HistoryItemProps {
  item: Collection;
  index: number;
  onPress: (item: Collection) => void;
  onViewFailureDetail?: (item: Collection) => void;
}

const CONDITION_LABELS: Record<CanCondition, string> = {
  AKTIF: 'Aktif',
  NON_AKTIF: 'Non-Aktif',
  RUSAK: 'Rusak',
  HILANG: 'Hilang',
  DIKEMBALIKAN: 'Dikembalikan',
};

const getConditionLabel = (condition?: CanCondition): string =>
  condition ? CONDITION_LABELS[condition] : 'Aktif';

const CONDITION_CHIP_STYLES = StyleSheet.create({
  RUSAK: {backgroundColor: Colors.surface.warningSoft},
  HILANG: {backgroundColor: Colors.surface.errorSoft},
});

const CONDITION_CHIP_TEXT_STYLES = StyleSheet.create({
  RUSAK: {color: Colors.status.warning},
  HILANG: {color: Colors.status.error},
});

/** Ikon status sinkronisasi tetap terpisah dari kondisi bisnis kaleng. */
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

export const HistoryItem = memo(({item, onPress, onViewFailureDetail}: HistoryItemProps) => {
  const statusIcon = getStatusIcon(item);
  const condition =
    item.condition === 'RUSAK' || item.condition === 'HILANG' ? item.condition : null;

  return (
    <TouchableOpacity
      accessibilityRole={'button'}
      accessibilityLabel={`Buka detail penjemputan ${item.can?.owner_name || 'Donatur'}`}
      activeOpacity={0.85}
      onPress={() => onPress(item)}>
      <View>
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
            <View style={styles.identityContent}>
              <Text style={styles.ownerName} numberOfLines={1}>
                {item.can?.owner_name || 'Donatur'}
              </Text>
              <Text style={styles.ownerRtRw} numberOfLines={1}>
                {formatRtRw(item.can?.rt, item.can?.rw) || 'RT/RW belum tersedia'}
              </Text>
              <Text style={styles.ownerDukuh} numberOfLines={1}>
                {item.can?.dukuh_name?.trim() ||
                  item.can?.owner_address?.trim() ||
                  'Nama dukuh belum tersedia'}
              </Text>
            </View>
            <View style={styles.conditionStatusStack} testID={'condition-status-stack'}>
              {condition ? (
                <View
                  style={[styles.conditionChip, CONDITION_CHIP_STYLES[condition]]}
                  testID={'condition-chip'}>
                  <Text style={[styles.conditionChipText, CONDITION_CHIP_TEXT_STYLES[condition]]}>
                    {getConditionLabel(condition)}
                  </Text>
                </View>
              ) : null}
              <View
                accessible
                accessibilityRole={'image'}
                accessibilityLabel={statusIcon.label}
                style={styles.syncStatusIcon}
                testID={'sync-status-icon'}>
                <Icon name={statusIcon.name} size={22} color={statusIcon.color} />
              </View>
            </View>
          </View>
          {item.sync_status === 'FAILED' && onViewFailureDetail ? (
            <TouchableOpacity
              accessibilityRole={'button'}
              accessibilityLabel={'Lihat detail kegagalan'}
              onPress={() => onViewFailureDetail(item)}
              style={styles.failureButton}>
              <Icon name={'alert-circle-outline'} size={17} color={Colors.status.error} />
              <Text style={styles.failureButtonText}>Detail Gagal</Text>
            </TouchableOpacity>
          ) : null}
        </AppCard>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  historyCard: {
    padding: Spacing.md,
    marginBottom: Spacing.sm,
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
  identityRow: {flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm},
  identityContent: {flex: 1, paddingRight: Spacing.sm},
  ownerName: {...Typography.heading3, color: Colors.brand.deepGreen},
  ownerRtRw: {...Typography.bodySmall, color: Colors.text.secondary, marginTop: 2},
  ownerDukuh: {...Typography.bodySmall, color: Colors.text.secondary, marginTop: 1},
  conditionStatusStack: {alignItems: 'flex-end', gap: Spacing.xs},
  conditionChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  conditionChipText: {...Typography.caption, fontWeight: '700'},
  syncStatusIcon: {alignItems: 'center', justifyContent: 'center'},
  failureButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  failureButtonText: {...Typography.label, color: Colors.status.error},
});

export default HistoryItem;
