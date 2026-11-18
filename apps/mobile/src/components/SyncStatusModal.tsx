import React from 'react';
import {Modal, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {Colors, Layout, Radius, Spacing, Typography} from '../theme';
import {AppButton} from './ui';

export interface SyncStatusModalProps {
  visible: boolean;
  onClose: () => void;
  /** Antrean valid yang terkirim otomatis saat internet tersedia. */
  waiting: number;
  /** Item gagal yang butuh pemeriksaan manual. */
  review: number;
  onRetry: () => void;
  onDetail: () => void;
}

/**
 * Modal "Status Sinkronisasi" — ringkasan antrean gagal/tertunda sebelum
 * membuka detail (SyncIssuesSheet). Menggantikan Alert.alert bawaan agar
 * senada dengan modal konfirmasi lainnya.
 */
export const SyncStatusModal: React.FC<SyncStatusModalProps> = ({
  visible,
  onClose,
  waiting,
  review,
  onRetry,
  onDetail,
}) => {
  const canRetry = waiting > 0;
  const reviewFirst = review > 0;

  const handleDetail = () => {
    onDetail();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType={'fade'} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.titleRow}>
            <View
              style={[styles.iconBadge, reviewFirst ? styles.iconBadgeError : styles.iconBadgePending]}>
              <Icon
                name={reviewFirst ? 'cloud-alert' : 'cloud-sync-outline'}
                size={26}
                color={reviewFirst ? Colors.status.error : Colors.status.warning}
              />
            </View>
            <View style={styles.titleContent}>
              <Text style={styles.title}>Status Sinkronisasi</Text>
              <Text style={styles.subtitle}>Data tetap aman di perangkat</Text>
            </View>
          </View>

          <View style={styles.tiles}>
            <View style={[styles.tile, styles.tilePending]}>
              <Text style={[styles.tileCount, styles.tileCountPending]}>{waiting}</Text>
              <Text style={styles.tileLabel}>Menunggu dikirim</Text>
            </View>
            <View style={[styles.tile, styles.tileReview]}>
              <Text style={[styles.tileCount, styles.tileCountReview]}>{review}</Text>
              <Text style={styles.tileLabel}>Perlu diperiksa</Text>
            </View>
          </View>

          <Text style={styles.caption}>
            {reviewFirst
              ? 'Catatan yang perlu diperiksa tidak dikirim ulang secara otomatis.'
              : 'Terkirim otomatis saat internet tersedia, atau ketuk Coba Kirim Lagi.'}
          </Text>

          <View style={styles.actions}>
            <View style={styles.action}>
              <AppButton label="Nanti" variant="outline" onPress={onClose} fullWidth />
            </View>
            <View style={styles.action}>
              {canRetry ? (
                <AppButton
                  label="Coba Kirim Lagi"
                  icon="cloud-upload-outline"
                  onPress={() => {
                    onRetry();
                    onClose();
                  }}
                  fullWidth
                />
              ) : (
                <AppButton label="Lihat Detail" onPress={handleDetail} fullWidth />
              )}
            </View>
          </View>
          {canRetry && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Lihat detail masalah sinkronisasi"
              onPress={handleDetail}
              activeOpacity={0.7}
              style={styles.detailLink}>
              <Text style={styles.detailLinkText}>
                Lihat detail masalah yang perlu diperiksa
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: Colors.overlay.dark,
    padding: Layout.screenPadding,
  },
  card: {
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.warm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadgePending: {
    backgroundColor: Colors.surface.warningSoft,
  },
  iconBadgeError: {
    backgroundColor: Colors.surface.errorSoft,
  },
  titleContent: {
    flex: 1,
  },
  title: {
    ...Typography.heading2,
    color: Colors.brand.deepGreen,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  tiles: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  tilePending: {
    backgroundColor: Colors.surface.warningSoft,
    borderColor: 'rgba(138, 90, 0, 0.28)',
  },
  tileReview: {
    backgroundColor: Colors.surface.errorSoft,
    borderColor: 'rgba(180, 35, 24, 0.28)',
  },
  tileCount: {
    ...Typography.heading2,
    fontVariant: ['tabular-nums'],
  },
  tileCountPending: {
    color: Colors.status.warning,
  },
  tileCountReview: {
    color: Colors.status.error,
  },
  tileLabel: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 2,
    textAlign: 'center',
  },
  caption: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
    lineHeight: 19,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  action: {
    flex: 1,
  },
  detailLink: {
    alignSelf: 'center',
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  detailLinkText: {
    ...Typography.label,
    color: Colors.brand.deepGreen,
  },
});
