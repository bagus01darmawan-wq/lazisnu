import React from 'react';
import {ActivityIndicator, Linking, StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {AppButton, AppHeader} from '../../components/ui';
import {Colors, Spacing, Typography} from '../../theme';

export interface ScanPermissionViewProps {
  permission: 'checking' | 'denied' | 'blocked';
  onRequestPermission: () => void;
  onBack: () => void;
}

export const ScanPermissionView: React.FC<ScanPermissionViewProps> = ({
  permission,
  onRequestPermission,
  onBack,
}) => {
  if (permission === 'checking') {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <ActivityIndicator size="large" color={Colors.brand.emerald} />
          <Text style={styles.permissionText}>Memeriksa izin kamera...</Text>
        </View>
      </View>
    );
  }

  const isBlocked = permission === 'blocked';

  return (
    <View style={styles.container}>
      <AppHeader variant="stack" title="Scan QR Code" onBack={onBack} />
      <View style={styles.permissionContainer}>
        <Icon name="camera-off" size={64} color={Colors.text.muted} />
        <Text style={styles.permissionTitle}>Izin Kamera Diperlukan</Text>
        <Text style={styles.permissionDesc}>
          {isBlocked
            ? 'Izin kamera telah ditolak permanen. Buka Pengaturan untuk mengaktifkan.'
            : 'Izinkan akses kamera untuk memindai QR code kaleng infaq.'}
        </Text>
        <View style={styles.permissionAction}>
          <AppButton
            label={isBlocked ? 'Buka Pengaturan' : 'Izinkan Kamera'}
            icon={isBlocked ? 'cog' : 'camera'}
            onPress={() => (isBlocked ? Linking.openSettings() : onRequestPermission())}
            fullWidth
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface.page,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: Colors.surface.page,
  },
  permissionText: {
    ...Typography.body,
    color: Colors.text.secondary,
    marginTop: 16,
  },
  permissionTitle: {
    ...Typography.heading2,
    color: Colors.text.primary,
    marginTop: 20,
    textAlign: 'center',
  },
  permissionDesc: {
    ...Typography.body,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
  permissionAction: {
    width: '80%',
    marginTop: Spacing.lg,
  },
});

export default ScanPermissionView;
