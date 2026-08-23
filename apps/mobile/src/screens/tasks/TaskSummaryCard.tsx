import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {Colors, DashboardLayout, Layout, Radius, Shadows, Spacing, Typography} from '../../theme';
import {formatCurrency} from '../../utils';

export interface TaskSummaryCardProps {
  activeCount: number;
  completedCount: number;
  totalCount: number;
  completedNominal: number;
  onCompletePeriod: () => void;
}

const Stat = ({value, label}: {value: string; label: string}) => (
  <View style={styles.stat}>
    <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
      {value}
    </Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

export const TaskSummaryCard: React.FC<TaskSummaryCardProps> = ({
  activeCount,
  completedCount,
  totalCount,
  completedNominal,
  onCompletePeriod,
}) => {
  const progress = totalCount ? completedCount / totalCount : 0;

  return (
    <View style={styles.body}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Progres Tugas</Text>
        <View style={styles.statsRow}>
          <Stat value={`${activeCount}`} label={'Belum'} />
          <View style={styles.statDivider} />
          <Stat value={`${completedCount}`} label={'Selesai'} />
          <View style={styles.statDivider} />
          <Stat value={`${totalCount}`} label={'Semua'} />
        </View>
        <View style={styles.progressDivider} />
        <View style={styles.progressHeading}>
          <Text style={styles.progressLabel}>{formatCurrency(completedNominal)} terjemput</Text>
          <Text style={styles.progressPercent}>{Math.round(progress * 100)}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, {width: `${Math.round(progress * 100)}%`}]} />
        </View>
        {activeCount > 0 && (
          <TouchableOpacity
            accessibilityRole={'button'}
            accessibilityLabel={'Selesaikan periode berjalan'}
            onPress={onCompletePeriod}
            style={styles.completePeriodButton}>
            <Icon name={'flag-checkered'} size={18} color={Colors.status.warning} />
            <Text style={styles.completePeriodText}>Selesai Periode ({activeCount} belum)</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: Layout.screenPadding,
    marginTop: -DashboardLayout.heroOverlap,
  },
  summaryCard: {
    minHeight: 160,
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: Colors.border.accent,
    padding: Layout.cardPadding,
    ...Shadows.medium,
  },
  summaryTitle: {
    ...Typography.heading2,
    color: Colors.brand.deepGreen,
    marginBottom: Spacing.md,
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
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '800',
  },
  statLabel: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 54,
    backgroundColor: Colors.border.summary,
  },
  progressDivider: {
    height: 1,
    backgroundColor: Colors.border.summary,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  progressHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: {
    ...Typography.bodySmall,
    color: Colors.brand.deepGreen,
    fontWeight: '600',
  },
  progressPercent: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  progressTrack: {
    height: 10,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface.progressTrack,
    marginTop: Spacing.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.pill,
    backgroundColor: Colors.brand.emerald,
  },
  completePeriodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.status.warning + '60',
    backgroundColor: Colors.surface.warningSoft,
  },
  completePeriodText: {
    ...Typography.label,
    color: Colors.status.warning,
  },
});

export default TaskSummaryCard;
