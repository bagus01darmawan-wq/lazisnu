import React, {useRef, useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useCollectionStore} from '../stores';
import type {RootStackParamList} from '../navigation/types';
import {collectionService} from '../services/api';
import {AppButton, AppCard, AppHeader, AppTextInput, SegmentedControl} from '../components/ui';
import {CanCondition} from '@lazisnu/shared-types';
import {Colors, Layout, Radius, Spacing, Typography} from '../theme';
import {formatCanAddress, formatCurrency, formatInputCurrency} from '../utils';
import {GOOD_CAN_CONDITION_LABEL} from './collectionConditionLabels';

type Props = NativeStackScreenProps<RootStackParamList, 'Collection'>;

const CollectionScreen: React.FC<Props> = ({navigation, route}) => {
  const {task} = route.params;
  const {submitCollection, isSubmitting, reset} = useCollectionStore();
  const [nominal, setNominal] = useState('');
  const lastConditionIsTrusted =
    task.physical_condition_source === 'OBSERVED' && task.physical_condition !== undefined;
  const initialCondition = lastConditionIsTrusted
    ? task.physical_condition === 'RUSAK'
      ? CanCondition.RUSAK
      : task.physical_condition === 'HILANG'
        ? CanCondition.HILANG
        : CanCondition.AKTIF
    : CanCondition.AKTIF;
  const lastConditionLabel =
    task.physical_condition === 'RUSAK'
      ? 'Rusak'
      : task.physical_condition === 'HILANG'
        ? 'Hilang'
        : GOOD_CAN_CONDITION_LABEL;
  const [condition, setCondition] = useState<
    CanCondition.AKTIF | CanCondition.RUSAK | CanCondition.HILANG
  >(initialCondition);
  const [showConditionConfirmation, setShowConditionConfirmation] = useState(false);
  const [pendingNominal, setPendingNominal] = useState<number | null>(null);
  const confirmationSubmitted = useRef(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const isVisitCollection =
    task.kind === 'VISIT' ||
    task.is_visit_task === true ||
    task.condition === CanCondition.NON_AKTIF;

  const handleSubmit = async () => {
    const numericNominal = Number(nominal);
    if (isNaN(numericNominal) || nominal === '') {
      Alert.alert('Nominal Belum Diisi', 'Masukkan nominal hasil penjemputan.');
      return;
    }
    if (numericNominal > 10_000_000) {
      Alert.alert(
        'Nominal Terlalu Besar',
        'Maksimal nominal per penjemputan adalah Rp10.000.000. Hubungi admin untuk penjemputan khusus.',
      );
      return;
    }
    if (isVisitCollection && numericNominal === 0) {
      Alert.alert(
        'Nominal Belum Valid',
        'Untuk mencatat kunjungan Isi, nominal harus lebih dari Rp0. Jika kaleng kosong, kembali dan pilih tombol Kosong.',
        [{text: 'Kembali ke Kunjungan', onPress: () => navigation.goBack()}],
      );
      return;
    }

    const openConditionConfirmation = () => {
      confirmationSubmitted.current = false;
      setPendingNominal(numericNominal);
      setShowConditionConfirmation(true);
    };
    if (numericNominal === 0) {
      Alert.alert(
        'Konfirmasi Kaleng Kosong',
        'Nominal yang dimasukkan adalah Rp0. Apakah kaleng benar-benar kosong?',
        [
          {text: 'Tidak', style: 'cancel'},
          {text: 'Ya, Lanjutkan', onPress: openConditionConfirmation},
        ],
      );
      return;
    }
    openConditionConfirmation();
  };

  const doSubmit = async (numericNominal: number) => {
    reset();

    // B2: visit-task (kaleng NON_AKTIF) belum tentu punya assignment_id asli.
    // Id sintetis "visit-<can_id>" TIDAK valid sebagai assignment_id server
    // (bukan UUID → 400). Buat assignment on-demand dulu; jika offline, antri
    // dan sync.ts akan melengkapinya saat mengirim.
    let assignmentId = task.id;
    if (isVisitCollection && task.id.startsWith('visit-')) {
      const res = await collectionService.ensureAssignment(task.can_id);
      if (res.success && res.data?.assignment_id) {
        assignmentId = res.data.assignment_id;
      } else {
        const code = res.error?.code;
        const isOffline = code === 'NETWORK_ERROR' || code === 'SESSION_EXPIRED' || !code;
        if (!isOffline) {
          // Server menjawab tegas (mis. sudah dijemput periode ini) — jangan
          // antri data yang pasti ditolak; beri tahu petugas apa adanya.
          Alert.alert(
            'Tidak Bisa Disimpan',
            res.error?.message || 'Assignment kaleng ini tidak bisa disiapkan.',
          );
          return;
        }
        // Offline: lanjut antri; sync.ts melengkapi assignment_id saat online.
      }
    }

    const result = await submitCollection({
      assignment_id: assignmentId,
      can_id: task.can_id,
      nominal: numericNominal,
      collected_at: new Date().toISOString(),
      condition,
      physical_condition:
        condition === CanCondition.RUSAK
          ? 'RUSAK'
          : condition === CanCondition.HILANG
            ? 'HILANG'
            : 'BAIK',
      visit_outcome: isVisitCollection ? 'ISI' : undefined,
    });

    if (!result.success) {
      Alert.alert(
        'Gagal Menyimpan',
        result.error || useCollectionStore.getState().error || 'Data penjemputan gagal disimpan.',
      );
      return;
    }

    setShowSuccess(true);
    if (!result.synced) {
      Alert.alert(
        'Tersimpan di Perangkat',
        'Data akan dikirim otomatis saat koneksi internet tersedia.',
      );
    }
  };

  if (showSuccess) {
    return (
      <View style={styles.container}>
        <AppHeader
          variant={'stack'}
          title={'Penjemputan Tersimpan'}
          onBack={() => navigation.navigate('Main', {screen: 'Dashboard'})}
        />
        <ScrollView
          contentContainerStyle={styles.successContainer}
          showsVerticalScrollIndicator={false}>
          <View style={styles.successIcon}>
            <Icon name={'check'} size={48} color={Colors.text.white} />
          </View>
          <Text style={styles.successTitle}>Penjemputan Berhasil</Text>
          <Text style={styles.successSubtitle}>
            Data penjemputan sudah tersimpan dan siap disinkronkan.
          </Text>

          <AppCard variant={'elevated'} style={styles.summaryCard}>
            <SummaryRow label={'Kode QR'} value={task.qr_code} />
            <SummaryRow label={'Pemilik'} value={task.owner_name} />
            <SummaryRow label={'Nominal'} value={formatCurrency(Number(nominal))} accent last />
          </AppCard>

          <View style={styles.whatsappInfo}>
            <Icon name={'whatsapp'} size={22} color={Colors.brand.whatsapp} />
            <Text style={styles.whatsappText}>
              Pesan konfirmasi akan dikirim ke {task.owner_phone}.
            </Text>
          </View>

          <View style={styles.successActions}>
            <AppButton
              label={'Kembali ke Beranda'}
              icon={'home-outline'}
              onPress={() => navigation.navigate('Main', {screen: 'Dashboard'})}
              fullWidth
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppHeader variant={'stack'} title={'Input Penjemputan'} onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps={'handled'}
        showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionTitle, styles.sectionTitleFirst]}>Detail penerimaan</Text>
        <AppCard variant={'default'} style={styles.formCard}>
          <Text style={styles.label}>Nominal infaq</Text>
          <View style={styles.nominalRow}>
            <Text style={styles.currencyPrefix}>Rp</Text>
            <View style={styles.nominalInputContainer}>
              <AppTextInput
                placeholder={'0'}
                value={formatInputCurrency(nominal)}
                onChangeText={text => setNominal(text.replace(/\D/g, ''))}
                keyboardType={'numeric'}
                returnKeyType={'done'}
                style={styles.nominalInput}
              />
            </View>
          </View>
          <Text style={styles.helperText}>
            Pastikan nominal sesuai dengan uang yang diterima. Nominal akan dicantumkan pada pesan
            konfirmasi donatur.
          </Text>
        </AppCard>

        <Text style={styles.sectionTitle}>Detail Kaleng</Text>
        <AppCard variant={'elevated'} style={styles.detailCard}>
          <View style={styles.detailRow}>
            <Icon name="qrcode" size={20} color={Colors.brand.emerald} />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Kode QR</Text>
              <Text style={styles.detailValue}>{task.qr_code}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Icon name="account" size={20} color={Colors.brand.emerald} />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Nama Pemilik</Text>
              <Text style={styles.detailValue}>{task.owner_name}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Icon name="phone" size={20} color={Colors.brand.emerald} />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Nomor HP</Text>
              <Text style={styles.detailValue}>{task.owner_phone || '-'}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Icon name="map-marker" size={20} color={Colors.brand.emerald} />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Alamat</Text>
              <Text style={styles.detailValue}>{formatCanAddress(task)}</Text>
            </View>
          </View>

          {task.last_collection && (
            <>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Icon name="history" size={20} color={Colors.status.warning} />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Penjemputan Terakhir</Text>
                  <Text style={styles.detailValue}>
                    {formatCurrency(task.last_collection.nominal)}
                  </Text>
                </View>
              </View>
            </>
          )}
        </AppCard>
      </ScrollView>

      <View style={styles.submitContainer}>
        <AppButton
          label={'Simpan Penjemputan'}
          icon={'check-circle-outline'}
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={nominal === ''}
          fullWidth
        />
      </View>
      <Modal
        visible={showConditionConfirmation}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConditionConfirmation(false)}>
        <View style={styles.confirmationBackdrop}>
          <View style={styles.confirmationCard} accessibilityViewIsModal>
            <Text style={styles.confirmationTitle}>Konfirmasi Penjemputan</Text>
            <Text style={styles.confirmationText}>
              {lastConditionIsTrusted ? (
                <>
                  {'Kondisi fisik terakhir tercatat: '}
                  <Text style={styles.confirmationCondition}>{lastConditionLabel}</Text>
                  {'. Periksa kondisi yang Anda lihat sebelum mengirim.'}
                </>
              ) : (
                <>
                  {'Kondisi terakhir yang dapat dipercaya tidak tersedia; '}
                  <Text style={styles.confirmationCondition}>{GOOD_CAN_CONDITION_LABEL}</Text>
                  {
                    ' dipilih sebagai asumsi awal. Periksa kondisi fisik yang Anda lihat sebelum mengirim.'
                  }
                </>
              )}
            </Text>
            <SegmentedControl
              options={[
                {label: GOOD_CAN_CONDITION_LABEL, value: CanCondition.AKTIF},
                {
                  label: 'Rusak',
                  value: CanCondition.RUSAK,
                  activeColor: Colors.status.warning,
                  activeBackgroundColor: Colors.surface.warningSoft,
                },
                {
                  label: 'Hilang',
                  value: CanCondition.HILANG,
                  activeColor: Colors.status.error,
                  activeBackgroundColor: Colors.surface.errorSoft,
                },
              ]}
              value={condition}
              onChange={setCondition}
            />
            <View style={styles.confirmationActions}>
              <View style={styles.confirmationAction}>
                <AppButton
                  label="Batal"
                  variant="outline"
                  onPress={() => setShowConditionConfirmation(false)}
                  fullWidth
                />
              </View>
              <View style={styles.confirmationAction}>
                <AppButton
                  label="Konfirmasi & Simpan"
                  onPress={async () => {
                    if (confirmationSubmitted.current || pendingNominal === null) return;
                    confirmationSubmitted.current = true;
                    setShowConditionConfirmation(false);
                    await doSubmit(pendingNominal);
                  }}
                  loading={isSubmitting}
                  fullWidth
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const SummaryRow = ({
  label,
  value,
  accent = false,
  last = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  last?: boolean;
}) => (
  <View style={[styles.summaryRow, last && styles.summaryRowLast]}>
    <Text style={styles.summaryLabel}>{label}</Text>
    <Text style={[styles.summaryValue, accent && styles.summaryValueAccent]} numberOfLines={2}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.surface.page},
  formContent: {
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: Spacing.xl,
  },
  detailCard: {
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.warm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  detailContent: {
    flex: 1,
    marginLeft: 12,
  },
  detailLabel: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  detailValue: {
    ...Typography.body,
    fontWeight: '600',
    color: Colors.text.primary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border.warm,
    marginVertical: 4,
  },
  sectionTitle: {
    ...Typography.heading3,
    color: Colors.brand.deepGreen,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionTitleFirst: {marginTop: Spacing.md},
  formCard: {
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.warm,
  },
  label: {...Typography.label, color: Colors.text.primary, marginBottom: Spacing.sm},
  nominalRow: {flexDirection: 'row', alignItems: 'center'},
  nominalInputContainer: {flex: 1},
  currencyPrefix: {
    ...Typography.heading2,
    color: Colors.brand.deepGreen,
    marginRight: Spacing.sm,
    marginBottom: Spacing.md,
  },
  nominalInput: {fontSize: 22, fontWeight: '700', color: Colors.brand.deepGreen},
  helperText: {...Typography.caption, color: Colors.text.muted, marginTop: -Spacing.sm},
  confirmationBackdrop: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
    padding: Layout.screenPadding,
  },
  confirmationCard: {
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  confirmationTitle: {...Typography.heading2, color: Colors.brand.deepGreen},
  confirmationText: {...Typography.bodySmall, color: Colors.text.secondary},
  confirmationCondition: {fontWeight: '700', color: Colors.text.primary},
  confirmationActions: {flexDirection: 'row', gap: Spacing.sm},
  confirmationAction: {flex: 1},
  submitContainer: {
    padding: Spacing.md,
    // Sisi bawah lebih tinggi: tombol terangkat dari gesture bar (edge-to-edge).
    paddingBottom: Spacing.xxl,
    backgroundColor: Colors.surface.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border.warm,
  },
  successContainer: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  successIcon: {
    width: 88,
    height: 88,
    borderRadius: Radius.pill,
    backgroundColor: Colors.brand.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
  },
  successTitle: {...Typography.heading1, color: Colors.brand.deepGreen, marginTop: Spacing.md},
  successSubtitle: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  summaryCard: {
    width: '100%',
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.warm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.warm,
  },
  summaryRowLast: {borderBottomWidth: 0},
  summaryLabel: {...Typography.bodySmall, color: Colors.text.secondary},
  summaryValue: {
    flex: 1,
    ...Typography.bodySmall,
    fontWeight: '700',
    color: Colors.text.primary,
    textAlign: 'right',
  },
  summaryValueAccent: {color: Colors.brand.emerald, fontSize: 17},
  whatsappInfo: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface.successSoft,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  whatsappText: {
    flex: 1,
    ...Typography.bodySmall,
    color: Colors.brand.deepGreen,
    marginLeft: Spacing.sm,
  },
  successActions: {width: '100%', gap: Spacing.sm, marginTop: Spacing.lg},
});

export default CollectionScreen;
