import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Colors, Spacing, Typography } from '../../theme';

type SyncStatus = 'synced' | 'offline' | 'syncing' | 'failed';

type SyncBannerProps = {
  status: SyncStatus;
  message: string;
};

export const SyncBanner: React.FC<SyncBannerProps> = ({ status, message }) => {
  if (status === 'synced') {
    return null;
  }

  const getStyle = () => {
    switch (status) {
      case 'offline':
        return { bg: Colors.surface.dark, icon: 'wifi-off', color: Colors.text.white };
      case 'syncing':
        return { bg: Colors.status.info, icon: 'sync', color: Colors.text.white };
      case 'failed':
        return { bg: Colors.status.error, icon: 'alert-circle', color: Colors.text.white };
      default:
        return { bg: Colors.text.muted, icon: 'information', color: Colors.text.white };
    }
  };

  const { bg, icon, color } = getStyle();

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Icon name={icon} size={20} color={color} />
      <Text style={[styles.text, { color }]}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    justifyContent: 'center',
  },
  text: {
    ...Typography.caption,
    marginLeft: Spacing.sm,
    fontWeight: '600',
  },
});
