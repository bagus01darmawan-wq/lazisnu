import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View, ViewStyle} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {Colors, Radius, Spacing, Typography} from '../../theme';

export type SyncBannerStatus = 'synced' | 'offline' | 'syncing' | 'failed';

export interface SyncBannerProps {
  status: SyncBannerStatus;
  text?: string;
  subtext?: string;
  count?: number;
  onPress?: () => void;
  style?: ViewStyle;
}

const statusConfig: Record<
  SyncBannerStatus,
  {
    icon: string;
    iconColor: string;
    bgColor: string;
    textColor: string;
    defaultText: string;
  }
> = {
  synced: {
    icon: 'cloud-check-outline',
    iconColor: Colors.brand.deepGreen,
    bgColor: Colors.brand.mutedSand,
    textColor: Colors.brand.deepGreen,
    defaultText: 'Semua data tersinkronisasi',
  },
  offline: {
    icon: 'cloud-sync-outline',
    iconColor: Colors.brand.deepGreen,
    bgColor: Colors.brand.mutedSand,
    textColor: Colors.brand.deepGreen,
    defaultText: 'Data tersimpan di perangkat',
  },
  syncing: {
    icon: 'sync',
    iconColor: Colors.status.info,
    bgColor: Colors.surface.successSoft,
    textColor: Colors.brand.deepGreen,
    defaultText: 'Menyinkronkan data...',
  },
  failed: {
    icon: 'alert-circle-outline',
    iconColor: Colors.status.error,
    bgColor: Colors.surface.errorSoft,
    textColor: Colors.status.error,
    defaultText: 'Data belum tersinkronisasi',
  },
};

export const SyncBanner: React.FC<SyncBannerProps> = ({
  status,
  text,
  subtext,
  count,
  onPress,
  style,
}) => {
  const config = statusConfig[status];
  const displayText =
    text ||
    (count !== undefined && count > 0 && status !== 'synced'
      ? `${count} data belum tersinkronisasi`
      : config.defaultText);

  const isClickable = Boolean(onPress);

  const content = (
    <View style={[styles.container, {backgroundColor: config.bgColor}, style]}>
      <Icon name={config.icon} size={24} color={config.iconColor} />
      <View style={styles.content}>
        <Text style={[styles.text, {color: config.textColor}]}>{displayText}</Text>
        {!!subtext && <Text style={[styles.subtext, {color: config.textColor}]}>{subtext}</Text>}
      </View>
      {isClickable && <Icon name={'chevron-right'} size={20} color={config.iconColor} />}
    </View>
  );

  if (isClickable) {
    return (
      <TouchableOpacity
        accessibilityRole={'button'}
        accessibilityLabel={displayText}
        activeOpacity={0.8}
        onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  container: {
    minHeight: 48,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  content: {
    flex: 1,
  },
  text: {
    ...Typography.body,
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 18,
  },
  subtext: {
    ...Typography.caption,
    opacity: 0.8,
    marginTop: 2,
  },
});

export default SyncBanner;
