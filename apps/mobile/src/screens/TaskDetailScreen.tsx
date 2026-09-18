import React, {useEffect, useState} from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {AppButton, AppHeader, SkipReasonSheet} from '../components/ui';
import type {SkipReasonCode} from '../components/ui';
import {useTasksStore} from '../stores';
import {collectionService, tasksService} from '../services/api';
import {CanCondition, AssignmentStatus} from '@lazisnu/shared-types';
import type {ProposalStatusResponse} from '@lazisnu/shared-types';
import {KalengInfoCard} from './scan';
import {Colors, Radius, Spacing, Typography} from '../theme';
import type {RootStackParamList} from '../navigation/types';

/**
 * Detail Penjemputan — dibuka dengan menekan KARTU TUGAS (belum dijemput)
 * di halaman Tugas. Variasi dari "Detail Kaleng" hasil scan:
 * TANPA ikon centang & "QR Code Terdeteksi!" (itu eksklusif alur kamera),
 * ditambah baris Periode dan aksi tidak-lanjut / lanjutkan.
 */
const TaskDetailScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'TaskDetail'>>();
  const {task} = route.params;

  const [skipSheetVisible, setSkipSheetVisible] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [visiting, setVisiting] = useState(false);
  const [proposal, setProposal] = useState<NonNullable<ProposalStatusResponse['proposal']> | null>(
    null,
  );

  // Status usulan kondisi terbaru untuk tugas ini (on-demand, gagal senyap —
  // banner hanya pelengkap, bukan penghalang alur utama).
  // B2: untuk visit-task (kaleng NON_AKTIF), task.id MUNGKIN id sintetis
  // "visit-<can_id>" bila backend belum menyediakan assignment_id. Jangan
  // kirim id sintetis ke endpoint assignment — itu UUID di DB (invalid input
  // → crash). Hanya panggil bila id ini assignment asli.
  const isVisitTaskWithoutAssignment = !!(task.is_visit_task && task.id.startsWith('visit-'));
  useEffect(() => {
    let cancelled = false;
    if (isVisitTaskWithoutAssignment) {
      return;
    }
    tasksService
      .getProposalStatus(task.id)
      .then(res => {
        if (!cancelled && res.success && res.data?.proposal) {
          setProposal(res.data.proposal);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [task.id, isVisitTaskWithoutAssignment]);

  const handleSkip = () => {
    setSkipSheetVisible(true);
  };

  // Kunjungan non-penjemputan (Fase 3): verifikasi kaleng non-aktif atau
  // penggantian unit rusak/hilang. Bukan collection — tanpa nominal dan
  // tidak mengubah angka infak.
  const submitVisit = async (purpose: 'VERIFIKASI' | 'PENGGANTIAN' | 'PENCABUTAN') => {
    setVisiting(true);
    try {
      const res = await collectionService.recordCanVisit(task.can_id, purpose);
      if (res.success && res.data) {
        // B2: pencabutan menutup kasus — kembali ke daftar, jangan hanya diam.
        if (purpose === 'PENCABUTAN') {
          Alert.alert(
            'Kaleng Dicabut',
            res.data.message || 'Kaleng ditandai dikembalikan ke kantor. Tugas selesai.',
            [{text: 'OK', onPress: () => navigation.goBack()}],
          );
          return;
        }
        Alert.alert(
          'Kunjungan Tercatat',
          `Kondisi kaleng: ${res.data.condition}. Angka infak tidak berubah.`,
        );
      } else {
        Alert.alert('Gagal Mencatat', res.error?.message || 'Gagal mencatat kunjungan. Coba lagi.');
      }
    } catch (e) {
      Alert.alert(
        'Gagal Mencatat',
        e instanceof Error ? e.message : 'Gagal mencatat kunjungan. Coba lagi.',
      );
    } finally {
      setVisiting(false);
    }
  };

  const handleVisit = () => {
    Alert.alert(
      'Catat Kunjungan',
      'Kunjungan bukan penjemputan: tidak ada nominal dan tidak mengubah angka infak.',
      [
        {text: 'Batal', style: 'cancel'},
        {text: 'Verifikasi', onPress: () => void submitVisit('VERIFIKASI')},
        {text: 'Penggantian', onPress: () => void submitVisit('PENGGANTIAN')},
      ],
    );
  };

  // B2: kaleng NON_AKTIF — petugas menarik kaleng untuk dikembalikan ke kantor.
  // Konfirmasi tegas karena tindakan ini menutup kasus (DIKEMBALIKAN).
  const handleWithdraw = () => {
    Alert.alert(
      'Cabut Kaleng',
      'Kaleng akan ditandai DIKEMBALIKAN ke kantor dan kasusnya ditutup. Hanya lakukan jika kaleng sudah Anda bawa.',
      [
        {text: 'Batal', style: 'cancel'},
        {text: 'Cabut Kaleng', style: 'destructive', onPress: () => void submitVisit('PENCABUTAN')},
      ],
    );
  };

  // B2: kaleng NON_AKTIF ternyata berisi → input penjemputan biasa; setelah
  // nominal masuk, sistem mengembalikannya ke AKTIF (shouldRestoreActive).
  // Penjemputan butuh assignment asli (collections.assignment_id NOT NULL).
  // Jika belum ada assignment periode berjalan, CollectionScreen membuatnya
  // on-demand (POST /mobile/cans/:canId/ensure-assignment); saat offline item
  // diantri dan dilengkapi otomatis oleh sync.
  // Yang TIDAK boleh lanjut: kaleng ini sudah dijemput pada periode berjalan
  // (assignment sudah selesai) — penjemputan kedua akan ditolak server.
  const visitAlreadyCollectedThisPeriod = !!(
    task.is_visit_task &&
    task.assignment_status &&
    task.assignment_status !== AssignmentStatus.ACTIVE
  );
  const handleFilled = () => {
    if (visitAlreadyCollectedThisPeriod) {
      Alert.alert(
        'Sudah Dijemput Periode Ini',
        'Kaleng ini sudah dijemput pada periode berjalan, jadi penjemputan baru tidak bisa dicatat. ' +
          'Hubungi admin bila nominalnya perlu dikoreksi.',
      );
      return;
    }
    navigation.navigate('Collection', {task});
  };

  const handleSkipConfirm = async (reasonCode: SkipReasonCode, notes: string) => {
    setSkipping(true);
    try {
      const result = await useTasksStore.getState().skipAssignment(task.id, reasonCode, notes);
      if (result.success) {
        setSkipSheetVisible(false);
        // Segarkan daftar di belakang lalu kembali.
        useTasksStore
          .getState()
          .fetchTasks('ACTIVE')
          .catch(() => {});
        if (result.proposalId) {
          // Alasan memicu usulan kondisi: kondisi TIDAK berubah di sini,
          // admin yang memutuskan. Petugas wajib tahu statusnya menunggu.
          Alert.alert(
            'Usulan Terkirim',
            'Usulan perubahan status kaleng terkirim dan menunggu persetujuan admin.',
            [{text: 'OK', onPress: () => navigation.goBack()}],
          );
        } else {
          navigation.goBack();
        }
      } else {
        // Pesan jujur: alasan asli (server / jaringan) — bukan tuduhan sinyal.
        Alert.alert('Gagal Menandai', result.error || 'Gagal menandai kaleng. Coba lagi.');
      }
    } finally {
      setSkipping(false);
    }
  };

  return (
    <View style={styles.screen}>
      <AppHeader variant="stack" onBack={() => navigation.goBack()} />

      <View style={styles.head}>
        <View style={styles.headIcon}>
          <Icon name="clipboard-list-outline" size={48} color={Colors.brand.deepGreen} />
        </View>
        <Text style={styles.headTitle}>Detail Penjemputan</Text>
      </View>

      <View style={styles.body}>
        <KalengInfoCard task={task} showPeriod />

        {proposal ? (
          <View style={styles.proposalBox}>
            <Text style={styles.proposalTitle}>
              {proposal.status === 'PENDING'
                ? 'Usulan menunggu persetujuan admin'
                : proposal.status === 'APPROVED'
                  ? 'Usulan disetujui admin'
                  : 'Usulan ditolak admin'}
            </Text>
            <Text style={styles.proposalText}>
              {proposal.to_condition}
              {proposal.action_label ? ` — ${proposal.action_label}` : ''}
            </Text>
          </View>
        ) : null}

        {/** B2: kaleng NON_AKTIF — perlakuan berbeda: kunjungan + pencabutan. */}
        {task.condition === CanCondition.NON_AKTIF ? (
          <View style={styles.proposalBox}>
            <Text style={styles.proposalTitle}>Kaleng Nonaktif</Text>
            <Text style={styles.proposalText}>
              Kaleng ini sudah 6x kosong berturut-turut. Bukan tugas penjemputan biasa — cabut
              kalengnya untuk dikembalikan ke kantor, atau catat jika kaleng ternyata berisi.
            </Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          {task.condition === CanCondition.NON_AKTIF ? (
            <>
              <AppButton
                label="Kaleng Terisi"
                icon="cash-multiple"
                onPress={handleFilled}
                fullWidth
              />
              <AppButton
                label={visiting ? 'Memproses…' : 'Cabut Kaleng'}
                icon="package-down"
                variant="outline"
                onPress={handleWithdraw}
                fullWidth
                disabled={visiting}
              />
            </>
          ) : (
            <>
              <AppButton label="Tidak Dijemput" variant="outline" onPress={handleSkip} fullWidth />
              <AppButton
                label={visiting ? 'Mencatat…' : 'Catat Kunjungan'}
                variant="outline"
                onPress={handleVisit}
                fullWidth
                disabled={visiting}
              />
              <AppButton
                label="Lanjutkan"
                icon="arrow-right"
                onPress={() => navigation.navigate('Collection', {task})}
                fullWidth
              />
            </>
          )}
        </View>
      </View>

      <SkipReasonSheet
        visible={skipSheetVisible}
        qrCode={task.qr_code}
        loading={skipping}
        onDismiss={() => setSkipSheetVisible(false)}
        onConfirm={handleSkipConfirm}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.surface.page,
  },
  head: {
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  headIcon: {
    width: 72,
    height: 72,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface.successSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headTitle: {
    ...Typography.heading2,
    color: Colors.brand.deepGreen,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  body: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  proposalBox: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.warningSoft,
  },
  proposalTitle: {
    ...Typography.label,
    color: Colors.brand.deepGreen,
  },
  proposalText: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  actions: {
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
});

export default TaskDetailScreen;
