import React, {useEffect} from 'react';
import {AppState, Modal, StyleSheet, Text, View} from 'react-native';
import {useUpdateStore} from '../stores/useUpdateStore';
import {AppButton} from './ui';
import {Colors, Radius, Shadows, Spacing, Typography} from '../theme';
import {APP_VERSION} from '../config/appConfig';

/**
 * Modal pembaruan (fitur update-in-app Tingkat 1).
 * Seluruh alur — cek versi, unduh dengan progress, sampai siap pasang —
 * terjadi DI DALAM modal. Satu-satunya layar di luar modal adalah layar
 * konfirmasi pemasangan milik sistem Android (tidak dapat digantikan).
 */
const UpdateModal = () => {
  const {
    releaseInfo,
    modalVisible,
    forceUpdate,
    downloadState,
    downloadProgress,
    downloadError,
    dismiss,
    startDownload,
    install,
    handleAppActive,
  } = useUpdateStore();

  // Setelah petugas kembali dari layar pemasangan sistem, tutup modal.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        handleAppActive();
      }
    });
    return () => sub.remove();
  }, [handleAppActive]);

  if (!releaseInfo) {
    return null;
  }

  const changelogLines = releaseInfo.changelog
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const renderActions = () => {
    if (downloadState === 'downloading') {
      return null;
    }
    return (
      <View style={styles.actions}>
        {!forceUpdate && (
          <View style={styles.actionWrap}>
            <AppButton label="Nanti" variant="outline" fullWidth onPress={dismiss} />
          </View>
        )}
        <View style={styles.actionWrap}>
          {downloadState === 'idle' && (
            <AppButton label="Unduh Pembaruan" fullWidth onPress={startDownload} />
          )}
          {downloadState === 'error' && (
            <AppButton label="Coba Lagi" fullWidth onPress={startDownload} />
          )}
          {downloadState === 'ready' && (
            <AppButton label="Pasang Sekarang" fullWidth onPress={install} />
          )}
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="fade"
      // Paksa-update: tombol back Android tidak boleh menutup modal.
      onRequestClose={forceUpdate ? () => {} : dismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{forceUpdate ? 'Pembaruan Wajib' : 'Pembaruan Tersedia'}</Text>
          <Text style={styles.subtitle}>
            Versi {releaseInfo.version} — saat ini {APP_VERSION}
          </Text>

          {changelogLines.length > 0 && (
            <View style={styles.changelog}>
              {changelogLines.map((line, index) => (
                <Text key={index} style={styles.changelogLine}>
                  • {line}
                </Text>
              ))}
            </View>
          )}

          {downloadState === 'downloading' && (
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, {width: `${downloadProgress}%`}]} />
              </View>
              <Text style={styles.progressText}>Mengunduh… {downloadProgress}%</Text>
              <Text style={styles.progressHint}>Biarkan aplikasi terbuka hingga selesai.</Text>
            </View>
          )}

          {downloadState === 'ready' && (
            <Text style={styles.readyText}>
              Siap dipasang — ketuk "Pasang Sekarang", lalu konfirmasi di layar Android.
            </Text>
          )}

          {downloadState === 'error' && <Text style={styles.errorText}>{downloadError}</Text>}

          {renderActions()}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 25, 20, 0.65)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    ...Shadows.strong,
  },
  title: {
    ...Typography.heading2,
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.text.muted,
    marginBottom: Spacing.md,
  },
  changelog: {
    marginBottom: Spacing.md,
  },
  changelogLine: {
    ...Typography.body,
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  progressWrap: {
    marginBottom: Spacing.md,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border.warm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.brand.emerald,
  },
  progressText: {
    ...Typography.caption,
    color: Colors.text.primary,
    marginTop: Spacing.xs,
  },
  progressHint: {
    ...Typography.caption,
    color: Colors.text.muted,
  },
  readyText: {
    ...Typography.body,
    color: Colors.brand.emerald,
    marginBottom: Spacing.md,
  },
  errorText: {
    ...Typography.body,
    color: Colors.status.error,
    marginBottom: Spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionWrap: {
    flex: 1,
  },
});

export default UpdateModal;
