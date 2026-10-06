import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {Colors, Spacing, Typography} from '../theme';
import {countdownText, toleranceChip, type PeriodInfoLike} from '../roles/roleMap';
import {StatusBadge} from './ui/StatusBadge';

type PeriodChipProps = {
  info: PeriodInfoLike | null;
  compact?: boolean;
};

/**
 * C1-T9 — Chip periode + countdown (§14.6/13/15).
 * Toleransi → chip kuning; dikunci → chip abu; selain itu hanya countdown.
 * `info` null (offline/belum muat) → tidak render apa-apa (bukan 0 hari).
 */
export const PeriodChip: React.FC<PeriodChipProps> = ({info, compact = false}) => {
  const chip = info ? toleranceChip(info) : null;
  if (!info) return null;
  return (
    <View style={styles.row}>
      {chip ? (
        <StatusBadge status={chip.tone === 'warn' ? 'warning' : 'offline'} label={chip.label} />
      ) : null}
      {!compact ? <Text style={styles.countdown}>{countdownText(info)}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  countdown: {
    ...Typography.caption,
    color: Colors.text.muted,
    fontWeight: '600',
  },
});
