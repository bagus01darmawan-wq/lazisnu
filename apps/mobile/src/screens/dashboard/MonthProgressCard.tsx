import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {Colors, Layout, Radius, Shadows, Spacing, Typography} from '../../theme';
import {formatCurrency} from '../../utils';

export interface MonthProgressCardProps {
  collected: number;
  nominal: number;
  taskTotal: number;
  taskCompleted: number;
  /** Bila disediakan, seluruh kartu dapat ditekan untuk membuka layar detail. */
  onPress?: () => void;
}

/**
 * Kartu ringkasan bulan berjalan di beranda.
 * Angka mencakup penjemputan + infak bulan ini dan progres tugas periode
 * berjalan — berbeda dengan TaskSummaryCard yang merekap sepanjang masa.
 */
export const MonthProgressCard: React.FC<MonthProgressCardProps> = ({
  collected,
  nominal,
  taskTotal,
  taskCompleted,
  onPress,
}) => {
  const progress = taskTotal ? taskCompleted / taskTotal : 0;

  const body = (
    <View style={styles.card}>
      <View style={styles.heading}>
        <Text style={styles.title}>Bulan Ini</Text>
        <Icon name={'chevron-right'} size={20} color={Colors.text.secondary} />
      </View>
      <View style={styles.statsRow}>
        <Stat value={`${collected}`} label={'Dijemput'} />
        <View style={styles.statDivider} />
        <Stat value={formatCurrency(nominal)} label={'Infak'} />
        <View style={styles.statDivider} />
        <Stat value={`${taskCompleted}/${taskTotal}`} label={'Selesai'} />
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, {width: `${Math.round(progress * 100)}%`}]} />
      </View>
      <Text style={styles.progressCaption}>
        {Math.round(progress * 100)}% tugas periode ini selesai
      </Text>
    </View>
  );

  if (!onPress) {
    return body;
  }

  return (
    <TouchableOpacity
      accessibilityRole={'button'}
      accessibilityLabel={'Lihat statistik bulan ini'}
      activeOpacity={0.85}
      onPress={onPress}>
      {body}
    </TouchableOpacity>
  );
};

const Stat = ({value, label}: {value: string; label: string}) => (
  <View style={styles.stat}>
    <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
      {value}
    </Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: Colors.border.accent,
    padding: Layout.cardPadding,
    ...Shadows.medium,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.heading2,
    color: Colors.brand.deepGreen,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: Colors.brand.deepGreen,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
  },
  statLabel: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 48,
    backgroundColor: Colors.border.summary,
  },
  progressTrack: {
    height: 10,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface.progressTrack,
    marginTop: Spacing.md,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.pill,
    backgroundColor: Colors.brand.emerald,
  },
  progressCaption: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: Spacing.xs,
  },
});

export default MonthProgressCard;
