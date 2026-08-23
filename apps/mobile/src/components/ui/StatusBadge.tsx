import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {Colors, Radius, Spacing, Typography} from '../../theme';

export type StatusBadgeStatus =
  | 'success'
  | 'pending'
  | 'offline'
  | 'syncing'
  | 'corrected'
  | 'warning'
  | 'error';

type StatusBadgeProps = {
  status: StatusBadgeStatus;
  label: string;
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({status, label}) => {
  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return {bg: Colors.surface.successSoft, text: Colors.status.success};
      case 'pending':
        return {bg: Colors.surface.warningSoft, text: Colors.status.warning};
      case 'offline':
        return {bg: Colors.surface.progressTrack, text: Colors.text.muted};
      case 'syncing':
        return {bg: Colors.surface.successSoft, text: Colors.status.info};
      case 'corrected':
        return {bg: Colors.surface.warningSoft, text: Colors.status.warning};
      case 'warning':
        return {bg: Colors.surface.warningSoft, text: Colors.status.warning};
      case 'error':
        return {bg: Colors.surface.errorSoft, text: Colors.status.error};
    }
  };

  const colors = getStatusColor();

  return (
    <View style={[styles.container, {backgroundColor: colors.bg}]}>
      <Text style={[styles.text, {color: colors.text}]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    alignSelf: 'flex-start',
  },
  text: {
    ...Typography.caption,
    fontWeight: '700',
  },
});
