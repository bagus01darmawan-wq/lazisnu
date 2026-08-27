import React, {useMemo, useState} from 'react';
import {Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {AppButton} from './ui';
import {Colors, Radius, Spacing, Typography} from '../theme';
import {formatCurrency, formatDate} from '../utils';
import {offlineQueue} from '../services/offline/queue';
import {correctionQueue} from '../services/offline/corrections';
import {taskCache} from '../services/offline/tasks';
import {collectionsCache} from '../services/offline/cache';
import {useCollectionsStore, useSyncStore} from '../stores';

export interface SyncIssuesSheetProps {
  visible: boolean;
  onClose: () => void;
}

type IssueItem = {
  key: string;
  title: string;
  meta: string;
  body: string;
  tone: 'pending' | 'failed';
  action?: {label: string; onPress: () => void};
};

/**
 * "Detail Sinkronisasi" — daftar item yang belum sampai ke server.
 * Dibuka dari tombol "Lihat Detail" pada modal awan sinkronisasi
 * (Tugas & Beranda). Pesan tanpa label: isi penjelasan langsung
 * menyebut letak masalah dan langkah evakuasi.
 */
export const SyncIssuesSheet: React.FC<SyncIssuesSheetProps> = ({visible, onClose}) => {
  const [refreshKey, setRefreshKey] = useState(0);

  const issues = useMemo(() => {
    if (!visible) {
      return {pending: [] as IssueItem[], failed: [] as IssueItem[]};
    }

    const allTasks = [...taskCache.getTasks('ACTIVE'), ...taskCache.getTasks('COMPLETED')];
    const findTask = (id: string) => allTasks.find(t => t.id === id);
    const findCollection = (id: string) => collectionsCache.get().find(c => c.id === id);
    const pending: IssueItem[] = [];
    const failed: IssueItem[] = [];

    // ── Penjemputan menunggu kirim (antrean lokal) ──
    for (const item of offlineQueue.getQueue()) {
      const task = findTask(item.assignment_id);
      const attempts = item.retry_attempts || 0;
      pending.push({
        key: `cp-${item.offline_id}`,
        title: task?.owner_name || 'Kaleng Masukan QR',
        meta: `${task?.qr_code || 'QR offline'} · ${formatCurrency(item.nominal)} · ${formatDate(item.collected_at)}`,
        body:
          attempts > 0
            ? `Belum terkirim — aman tersimpan di perangkat. Sudah dicoba ${attempts}×, percobaan berikutnya otomatis saat internet tersedia.`
            : 'Belum terkirim — aman tersimpan di perangkat. Terkirim otomatis saat internet tersedia, atau ketuk Kirim Sekarang.',
        tone: 'pending',
        action: {
          label: 'Kirim Sekarang',
          onPress: () => {
            useSyncStore.getState().triggerSync();
            setRefreshKey(k => k + 1);
          },
        },
      });
    }

    // ── Koreksi menunggu kirim ──
    for (const corr of correctionQueue.getQueue()) {
      const col = findCollection(corr.collection_id);
      pending.push({
        key: `cq-${corr.correction_id}`,
        title: col?.can?.owner_name || 'Koreksi Penjemputan',
        meta: `${col?.can?.qr_code || 'QR offline'} · ${formatCurrency(corr.nominal_lama)} → ${formatCurrency(corr.nominal_baru)} · ${formatDate(corr.created_at)}`,
        body: 'Koreksi nominal belum terkirim — aman tersimpan di perangkat. Terkirim otomatis saat internet tersedia.',
        tone: 'pending',
      });
    }

    // ── Penjemputan gagal permanen (ditolak server / retry habis) ──
    for (const item of offlineQueue.getFailedPermanent()) {
      const task = findTask(item.assignment_id);
      const reason = item.error_message || 'Server menolak data ini.';
      failed.push({
        key: `cf-${item.offline_id}`,
        title: task?.owner_name || 'Kaleng Masukan QR',
        meta: `${task?.qr_code || 'QR offline'} · ${formatCurrency(item.nominal)} · ${formatDate(item.collected_at)}`,
        body: `${reason} Ketuk Kirim Ulang untuk mencoba lagi — bila tetap gagal, periksa data atau hubungi admin.`,
        tone: 'failed',
        action: {
          label: 'Kirim Ulang',
          onPress: () => {
            useCollectionsStore.getState().retryFailedCollection(item.offline_id);
            setRefreshKey(k => k + 1);
          },
        },
      });
    }

    // ── Koreksi ditolak server ──
    for (const corr of correctionQueue.getFailedPermanent()) {
      const col = findCollection(corr.collection_id);
      const reason = corr.error_message || 'Koreksi ditolak server.';
      failed.push({
        key: `rq-${corr.correction_id}`,
        title: col?.can?.owner_name || 'Koreksi Penjemputan',
        meta: `${col?.can?.qr_code || 'QR offline'} · ${formatCurrency(corr.nominal_lama)} → ${formatCurrency(corr.nominal_baru)} · ${formatDate(corr.created_at)}`,
        body: `${reason} Nominal kembali ke nilai server — koreksi ulang bila masih perlu, atau buang catatan ini.`,
        tone: 'failed',
        action: {
          label: 'Buang Catatan',
          onPress: () => {
            correctionQueue.removeFromFailedPermanent([corr.correction_id]);
            setRefreshKey(k => k + 1);
          },
        },
      });
    }

    return {pending, failed};
    // refreshKey: bangun ulang daftar setelah aksi (kirim ulang / buang).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, refreshKey]);

  const total = issues.pending.length + issues.failed.length;

  const renderCard = (item: IssueItem) => (
    <View key={item.key} style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardIdentity}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={2}>
            {item.meta}
          </Text>
        </View>
        <View
          style={[styles.badge, item.tone === 'failed' ? styles.badgeFailed : styles.badgePending]}>
          <Text
            style={[
              styles.badgeText,
              item.tone === 'failed' ? styles.badgeTextFailed : styles.badgeTextPending,
            ]}>
            {item.tone === 'failed' ? 'Gagal' : 'Menunggu'}
          </Text>
        </View>
      </View>
      <Text
        style={[
          styles.cardBody,
          item.tone === 'failed' ? styles.cardBodyFailed : styles.cardBodyPending,
        ]}>
        {item.body}
      </Text>
      {item.action && (
        <TouchableOpacity
          accessibilityRole={'button'}
          accessibilityLabel={item.action.label}
          onPress={item.action.onPress}
          style={styles.cardAction}>
          <Icon
            name={'refresh'}
            size={16}
            color={item.tone === 'failed' ? Colors.status.error : Colors.brand.deepGreen}
          />
          <Text
            style={[
              styles.cardActionText,
              {color: item.tone === 'failed' ? Colors.status.error : Colors.brand.deepGreen},
            ]}>
            {item.action.label}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderSection = (title: string, items: IssueItem[], failedTone: boolean) => (
    <>
      <Text
        style={[
          styles.sectionTitle,
          failedTone ? styles.sectionTitleFailed : styles.sectionTitlePending,
        ]}>
        {title} ({items.length})
      </Text>
      {items.map(renderCard)}
    </>
  );

  return (
    <Modal visible={visible} transparent animationType={'slide'} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.heading}>
            <View style={styles.headingContent}>
              <Text style={styles.title}>Detail Sinkronisasi</Text>
              <Text style={styles.subtitle}>
                {issues.pending.length} menunggu · {issues.failed.length} gagal — data tetap aman di
                perangkat
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole={'button'}
              accessibilityLabel={'Tutup detail sinkronisasi'}
              onPress={onClose}
              style={styles.closeButton}>
              <Icon name={'close'} size={24} color={Colors.text.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {total === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>Tidak ada masalah sinkronisasi.</Text>
              </View>
            ) : (
              <>
                {issues.pending.length > 0 &&
                  renderSection('Menunggu Kirim', issues.pending, false)}
                {issues.failed.length > 0 &&
                  renderSection('Gagal — Perlu Tindakan', issues.failed, true)}
              </>
            )}
          </ScrollView>

          {total > 0 && (
            <View style={styles.footer}>
              <AppButton
                label={'Kirim Semua Sekarang'}
                icon={'cloud-upload-outline'}
                onPress={() => {
                  useSyncStore.getState().triggerSync();
                  setRefreshKey(k => k + 1);
                }}
                fullWidth
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Colors.overlay.dark,
  },
  sheet: {
    maxHeight: '86%',
    backgroundColor: Colors.surface.page,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  grabber: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border.warm,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headingContent: {flex: 1, paddingRight: Spacing.sm},
  title: {...Typography.heading3, color: Colors.text.primary},
  subtitle: {...Typography.caption, color: Colors.text.secondary, marginTop: 3},
  closeButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {marginTop: Spacing.md},
  sectionTitle: {...Typography.heading3, marginBottom: Spacing.sm},
  sectionTitlePending: {color: Colors.status.warning},
  sectionTitleFailed: {color: Colors.status.error},
  card: {
    backgroundColor: Colors.surface.card,
    borderWidth: 1,
    borderColor: Colors.border.warm,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  cardTop: {flexDirection: 'row', alignItems: 'center', gap: Spacing.sm},
  cardIdentity: {flex: 1, minWidth: 0},
  cardTitle: {...Typography.body, color: Colors.text.primary, fontWeight: '700'},
  cardMeta: {...Typography.caption, color: Colors.text.muted, marginTop: 2},
  badge: {
    flexShrink: 0,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  badgePending: {backgroundColor: Colors.surface.warningSoft},
  badgeFailed: {backgroundColor: Colors.surface.errorSoft},
  badgeText: {...Typography.caption, fontWeight: '700'},
  badgeTextPending: {color: Colors.status.warning},
  badgeTextFailed: {color: Colors.status.error},
  cardBody: {
    ...Typography.caption,
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
  cardBodyPending: {color: Colors.status.warning},
  cardBodyFailed: {color: Colors.status.error},
  cardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
    minHeight: 44,
    paddingHorizontal: Spacing.sm,
  },
  cardActionText: {...Typography.label},
  emptyWrap: {alignItems: 'center', paddingVertical: Spacing.xl},
  emptyText: {...Typography.body, color: Colors.text.secondary},
  footer: {marginTop: Spacing.sm},
});

export default SyncIssuesSheet;
