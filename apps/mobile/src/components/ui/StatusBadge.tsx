import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../theme';

export type StatusBadgeStatus =
  | 'success'
  | 'pending'
  | 'offline'
  | 'syncing'
  | 'error';

type StatusBadgeProps = {
  status: StatusBadgeStatus;
  label: string;
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return { bg: Colors.status.success + '20', text: Colors.status.success };
      case 'pending':
        return { bg: Colors.status.warning + '20', text: Colors.status.warning };
      case 'offline':
        return { bg: Colors.text.muted + '20', text: Colors.text.muted };
      case 'syncing':
        return { bg: Colors.status.info + '20', text: Colors.status.info };
      case 'error':
        return { bg: Colors.status.error + '20', text: Colors.status.error };
    }
  };

  const colors = getStatusColor();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
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
