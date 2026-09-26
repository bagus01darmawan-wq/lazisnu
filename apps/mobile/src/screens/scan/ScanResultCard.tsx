import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {CanCondition, type CanVisitOutcome, type Task} from '@lazisnu/shared-types';
import {AppButton} from '../../components/ui';
import {Colors, Radius, Spacing, Typography} from '../../theme';

import {KalengInfoCard} from './KalengInfoCard';

export interface ScanResultCardProps {
  task: Task;
  /** Tandai kaleng tidak dijemput untuk periode berjalan. */
  onSkip: (task: Task) => void;
  onContinue: (task: Task) => void;
  onVisitOutcome: (outcome: Exclude<CanVisitOutcome, 'ISI'>) => void;
  visiting: boolean;
}

export const ScanResultCard: React.FC<ScanResultCardProps> = ({
  task,
  onSkip,
  onContinue,
  onVisitOutcome,
  visiting,
}) => {
  return (
    <View style={styles.resultContainer}>
      <View style={styles.successIcon}>
        <Icon name="check" size={48} color={Colors.status.success} />
      </View>

      <Text style={styles.successTitle}>QR Code Terdeteksi!</Text>

      <KalengInfoCard task={task} />

      {task.condition === CanCondition.NON_AKTIF ? (
        <View style={styles.actionButtons}>
          <AppButton
            label="Kaleng Isi"
            icon="cash-multiple"
            onPress={() => onContinue(task)}
            fullWidth
          />
          <AppButton
            label="Kaleng Kosong"
            icon="bottle-soda-outline"
            variant="outline"
            onPress={() => onVisitOutcome('KOSONG')}
            fullWidth
            disabled={visiting}
          />
          <AppButton
            label="Kaleng Dikembalikan"
            icon="package-down"
            variant="outline"
            onPress={() => onVisitOutcome('DIKEMBALIKAN')}
            fullWidth
            disabled={visiting}
          />
          <AppButton
            label="Tidak Dikunjungi"
            icon="map-marker-off-outline"
            variant="outline"
            onPress={() => onVisitOutcome('TIDAK_DIKUNJUNGI')}
            fullWidth
            disabled={visiting}
          />
        </View>
      ) : (
        <View style={styles.actionButtons}>
          <AppButton
            label="Tidak Dijemput"
            variant="outline"
            onPress={() => onSkip(task)}
            fullWidth
          />
          <AppButton
            label="Lanjutkan"
            icon="arrow-right"
            onPress={() => onContinue(task)}
            fullWidth
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  resultContainer: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface.successSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  successTitle: {
    ...Typography.heading2,
    color: Colors.brand.deepGreen,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  actionButtons: {
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
});

export default ScanResultCard;
