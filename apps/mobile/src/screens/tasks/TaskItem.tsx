import React, {memo} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, {FadeInUp, Layout as AnimatedLayout} from 'react-native-reanimated';
import type {Task} from '@lazisnu/shared-types';
import {AppCard, StatusBadge} from '../../components/ui';
import {Colors, Radius, Spacing, Typography} from '../../theme';
import {formatCurrency, formatPeriod} from '../../utils';

export interface TaskItemProps {
  item: Task;
  index: number;
  onCopy: (text: string) => void;
}

export const TaskItem = memo(({item, index, onCopy}: TaskItemProps) => {
  const active = item.status === 'ACTIVE';

  return (
    <Animated.View
      entering={FadeInUp.delay(index * 40).duration(320)}
      layout={AnimatedLayout.springify()}>
      <AppCard variant={'elevated'} style={styles.taskCard}>
        <View style={styles.taskHeading}>
          <View style={styles.taskIcon}>
            <Icon name={'package-variant-closed'} size={24} color={Colors.brand.deepGreen} />
          </View>
          <View style={styles.taskIdentity}>
            <Text style={styles.ownerName} numberOfLines={1}>
              {item.owner_name}
            </Text>
            <Text style={styles.ownerAddress} numberOfLines={2}>
              {item.owner_address || 'Alamat belum tersedia'}
            </Text>
          </View>
          <StatusBadge
            status={active ? 'pending' : item.status === 'UNCOLLECTED' ? 'warning' : 'success'}
            label={active ? 'Belum' : item.status === 'UNCOLLECTED' ? 'Terlewat' : 'Selesai'}
          />
        </View>

        <View style={styles.metaRow}>
          <TouchableOpacity
            accessibilityRole={'button'}
            accessibilityLabel={'Salin kode QR'}
            onPress={() => onCopy(item.qr_code)}
            style={styles.qrChip}>
            <Icon name={'qrcode'} size={16} color={Colors.brand.deepGreen} />
            <Text style={styles.qrCode} numberOfLines={1}>
              {item.qr_code}
            </Text>
            <Icon name={'content-copy'} size={14} color={Colors.text.muted} />
          </TouchableOpacity>
          <View style={styles.periodChip}>
            <Icon name={'calendar-month-outline'} size={15} color={Colors.text.muted} />
            <Text style={styles.periodText}>{formatPeriod(item.period)}</Text>
          </View>
        </View>

        {item.last_collection && (
          <View style={styles.lastCollection}>
            <View>
              <Text style={styles.lastCollectionLabel}>Penjemputan terakhir</Text>
              <Text style={styles.lastCollectionAmount}>
                {formatCurrency(item.last_collection.nominal)}
              </Text>
            </View>
            <Icon name={'history'} size={22} color={Colors.brand.mutedTeal} />
          </View>
        )}

        {!active && item.status === 'UNCOLLECTED' && (
          <View style={styles.uncollectedBadge}>
            <Icon name={'alert-circle-outline'} size={17} color={Colors.status.warning} />
            <Text style={styles.uncollectedText}>Terlewat</Text>
          </View>
        )}
      </AppCard>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  taskCard: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.warm,
  },
  taskHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  taskIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.successSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  taskIdentity: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  ownerName: {
    ...Typography.heading3,
    color: Colors.brand.deepGreen,
  },
  ownerAddress: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
    marginTop: 3,
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  qrChip: {
    minWidth: 0,
    minHeight: 48,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    backgroundColor: Colors.surface.page,
  },
  qrCode: {
    flex: 1,
    ...Typography.caption,
    color: Colors.text.primary,
  },
  periodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  periodText: {
    ...Typography.caption,
    color: Colors.text.muted,
  },
  lastCollection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.cardMuted,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
  },
  lastCollectionLabel: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  lastCollectionAmount: {
    ...Typography.bodySmall,
    fontWeight: '700',
    color: Colors.brand.deepGreen,
    marginTop: 2,
  },
  uncollectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface.warningSoft,
    alignSelf: 'flex-start',
  },
  uncollectedText: {
    ...Typography.caption,
    color: Colors.status.warning,
    fontWeight: '600',
  },
});

export default TaskItem;
