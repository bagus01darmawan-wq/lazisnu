import React, {memo} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, {FadeInUp, Layout as AnimatedLayout} from 'react-native-reanimated';
import type {Collection} from '@lazisnu/shared-types';
import {AppCard, StatusBadge} from '../../components/ui';
import {Colors, Radius, Spacing, Typography} from '../../theme';
import {formatCurrency, formatDate} from '../../utils';

export interface HistoryItemProps {
  item: Collection;
  index: number;
  onCorrect: (item: Collection) => void;
  onViewFailureDetail?: (item: Collection) => void;
}

export const HistoryItem = memo(
  ({item, index, onCorrect, onViewFailureDetail}: HistoryItemProps) => (
    <Animated.View
      entering={FadeInUp.delay(index * 40).duration(320)}
      layout={AnimatedLayout.springify()}>
      <AppCard variant={'elevated'} style={styles.historyCard}>
        <View style={styles.cardTopRow}>
          <View style={styles.dateRow}>
            <Icon name={'calendar-outline'} size={16} color={Colors.text.muted} />
            <Text style={styles.dateText}>{formatDate(item.collected_at)}</Text>
          </View>
          {item.sync_status === 'PENDING' ? (
            <StatusBadge status={'pending'} label={'Belum Terkirim'} />
          ) : item.sync_status === 'FAILED' ? (
            <StatusBadge status={'error'} label={'Gagal Terkirim'} />
          ) : item.pending_correction ? (
            <StatusBadge status={'pending'} label={'Koreksi Menunggu'} />
          ) : Number(item.submit_sequence || 1) > 1 ? (
            <StatusBadge status={'corrected'} label={'Terkoreksi'} />
          ) : (
            <StatusBadge status={'success'} label={'Tersimpan'} />
          )}
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
        </View>

        <View style={styles.cardBottomRow}>
          <View style={styles.qrRow}>
            <Icon name={'qrcode'} size={16} color={Colors.text.muted} />
            <Text style={styles.qrText} numberOfLines={1}>
              {item.can?.qr_code || '-'}
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
  ),
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
  identityContent: {flex: 1},
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
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  qrRow: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, paddingRight: Spacing.sm},
  qrText: {...Typography.caption, color: Colors.text.muted, flex: 1},
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
