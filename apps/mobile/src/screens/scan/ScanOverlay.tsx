import React from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {Colors, Radius, Spacing, Typography} from '../../theme';

export interface ScanOverlayProps {
  scanStatus: string;
  isLoading: boolean;
  isPickingImage: boolean;
  topInset: number;
  bottomInset: number;
  onClose: () => void;
  onManualInputPress: () => void;
  onPickImagePress: () => void;
}

export const ScanOverlay: React.FC<ScanOverlayProps> = ({
  scanStatus,
  isLoading,
  isPickingImage,
  topInset,
  bottomInset,
  onClose,
  onManualInputPress,
  onPickImagePress,
}) => {
  return (
    <View style={styles.overlay}>
      <View style={[styles.transparentHeader, {paddingTop: topInset + Spacing.sm}]}>
        <TouchableOpacity
          accessibilityRole={'button'}
          accessibilityLabel={'Tutup pemindai'}
          onPress={onClose}
          style={styles.backButton}>
          <Icon name="close" size={28} color={Colors.text.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan QR Code</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={[styles.scannerContainer, {paddingBottom: bottomInset + Spacing.lg}]}>
        <View style={styles.scannerFrame}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
          {isLoading && <ActivityIndicator size="large" color={Colors.brand.emerald} />}
        </View>

        <Text style={styles.instructionText}>{scanStatus}</Text>
        <Text style={styles.instructionHelper}>
          Posisikan seluruh kode QR kaleng di dalam bingkai
        </Text>

        <TouchableOpacity
          accessibilityRole={'button'}
          accessibilityLabel={'Tempel kode QR secara manual'}
          style={styles.manualButton}
          onPress={onManualInputPress}>
          <Icon name="keyboard-outline" size={20} color={Colors.text.white} />
          <Text style={styles.manualButtonText}>Tempel Kode</Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole={'button'}
          accessibilityLabel={'Pilih gambar berisi kode QR'}
          style={styles.imageButton}
          onPress={onPickImagePress}
          disabled={isPickingImage || isLoading}>
          {isPickingImage ? (
            <ActivityIndicator size="small" color={Colors.text.white} />
          ) : (
            <Icon name="image-search-outline" size={20} color={Colors.text.white} />
          )}
          <Text style={styles.manualButtonText}>Pilih Gambar QR</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay.dark,
  },
  transparentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.overlay.darkSubtle,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.overlay.darkSoft,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text.white,
  },
  placeholder: {
    width: 40,
  },
  scannerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  scannerFrame: {
    width: 264,
    height: 264,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: Colors.brand.mutedSand,
  },
  topLeft: {top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 8},
  topRight: {top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 8},
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  instructionText: {
    marginTop: Spacing.lg,
    ...Typography.heading3,
    color: Colors.text.white,
    textAlign: 'center',
  },
  instructionHelper: {
    ...Typography.bodySmall,
    color: Colors.text.white,
    opacity: 0.78,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  manualButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.overlay.lightSubtle,
    width: 220,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderRadius: Radius.pill,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.overlay.lightBorder,
  },
  imageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.overlay.emeraldStrong,
    width: 220,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderRadius: Radius.pill,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.overlay.lightBorder,
  },
  manualButtonText: {
    color: Colors.text.white,
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
  },
});

export default ScanOverlay;
