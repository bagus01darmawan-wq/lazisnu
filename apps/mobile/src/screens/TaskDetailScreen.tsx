import React, {useEffect, useState} from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {AppButton, AppHeader, SkipReasonSheet} from '../components/ui';
import type {SkipReasonCode} from '../components/ui';
import {useTasksStore} from '../stores';
import {collectionService, tasksService} from '../services/api';
import {CanCondition, CanVisitOutcome, AssignmentStatus} from '@lazisnu/shared-types';
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

  // Tindakan NON_AKTIF dipisahkan dari submit ordinary. ISI tetap diarahkan
  // ke CollectionScreen agar nominal dan kondisi fisik berada dalam satu transaksi.
  const visitAlreadyCollectedThisPeriod = !!(
    task.is_visit_task &&
    task.assignment_status &&
    task.assignment_status !== AssignmentStatus.ACTIVE
  );

  const submitVisitOutcome = async (outcome: Exclude<CanVisitOutcome, 'ISI'>) => {
    setVisiting(true);
    try {
      const res = await collectionService.recordCanVisit(task.can_id, outcome);
      if (!res.success) {
        Alert.alert('Gagal Mencatat', res.error?.message || 'Gagal menyimpan tindakan kaleng.');
        return;
      }
      const message = res.data?.message || 'Tindakan kaleng tersimpan.';
      Alert.alert('Tindakan Tercatat', message, [{text: 'OK', onPress: () => navigation.goBack()}]);
    } catch (error) {
      Alert.alert(
        'Gagal Mencatat',
        error instanceof Error ? error.message : 'Gagal menyimpan tindakan kaleng.',
      );
    } finally {
      setVisiting(false);
    }
  };

  const handleFilled = () => {
    if (visitAlreadyCollectedThisPeriod) {
      Alert.alert(
        'Sudah Dijemput Periode Ini',
        'Kaleng ini sudah dijemput pada periode berjalan. Hubungi admin bila nominalnya perlu dikoreksi.',
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

        {task.condition === CanCondition.NON_AKTIF ? (
          <View style={styles.actions}>
            <AppButton label="Kaleng Isi" icon="cash-multiple" onPress={handleFilled} fullWidth />
            <AppButton
              label="Kaleng Kosong"
              icon="bottle-soda-outline"
              variant="outline"
              onPress={() => void submitVisitOutcome('KOSONG')}
              fullWidth
              disabled={visiting}
            />
            <AppButton
              label="Kaleng Dikembalikan"
              icon="package-down"
              variant="outline"
              onPress={() => void submitVisitOutcome('DIKEMBALIKAN')}
              fullWidth
              disabled={visiting}
            />
            <AppButton
              label="Tidak Dikunjungi"
              icon="map-marker-off-outline"
              variant="outline"
              onPress={() => void submitVisitOutcome('TIDAK_DIKUNJUNGI')}
              fullWidth
              disabled={visiting}
            />
          </View>
        ) : (
          <View style={styles.actions}>
            <AppButton label="Tidak Dijemput" variant="outline" onPress={handleSkip} fullWidth />
            <AppButton
              label="Lanjutkan"
              icon="arrow-right"
              onPress={() => navigation.navigate('Collection', {task})}
              fullWidth
            />
          </View>
        )}
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
