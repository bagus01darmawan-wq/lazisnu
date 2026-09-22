import React, {useRef, useState} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {AppCard} from './ui/AppCard';
import {AppButton} from './ui/AppButton';
import {AppPressable} from './ui/AppPressable';
import {SignaturePad} from './SignaturePad';
import {strokesToSignaturePng, type Stroke} from '../signature/signaturePng';
import {Colors, Spacing, Typography} from '../theme';

type SignSheetProps = {
  title: string;
  submitLabel: string;
  submitting: boolean;
  serverError: string | null;
  onSubmit: (signaturePngBase64: string) => void;
  onClose: () => void;
};

/**
 * C1-T10 — Lembar tanda tangan: kanvas coretan + persetujuan eksplisit +
 * kirim. Raster PNG dikerjakan di sini (encoder murni); coretan kosong atau
 * tanpa consent tak bisa dikirim (gerbang ganda klien + server T5).
 */
export const SignSheet: React.FC<SignSheetProps> = ({
  title,
  submitLabel,
  submitting,
  serverError,
  onSubmit,
  onClose,
}) => {
  const strokes = useRef<Stroke[]>([]);
  const [hasContent, setHasContent] = useState(false);
  const [consent, setConsent] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const viewSize = useRef({w: 300, h: 150});

  const submit = () => {
    const b64 = strokesToSignaturePng(strokes.current, viewSize.current.w, viewSize.current.h);
    if (!b64) {
      setLocalError('Coret tanda tangan dulu');
      return;
    }
    if (!consent) {
      setLocalError('Centang persetujuan eksplisit dulu');
      return;
    }
    setLocalError(null);
    onSubmit(b64);
  };

  return (
    <AppCard>
      <Text style={styles.title}>{title}</Text>
      <View
        onLayout={e => {
          viewSize.current = {w: e.nativeEvent.layout.width, h: 150};
        }}>
        <SignaturePad
          onChange={(next, content) => {
            strokes.current = next;
            setHasContent(content);
            if (content) setLocalError(null);
          }}
        />
      </View>
      <AppPressable
        accessibilityRole="checkbox"
        accessibilityState={{checked: consent}}
        accessibilityLabel="Persetujuan eksplisit tanda tangan"
        onPress={() => setConsent(v => !v)}
        style={styles.consentRow}>
        <View style={[styles.box, consent && styles.boxOn]}>
          {consent ? <Text style={styles.check}>✓</Text> : null}
        </View>
        <Text style={styles.consentText}>Saya menyetujui berita acara ini</Text>
      </AppPressable>
      {localError ? <Text style={styles.error}>{localError}</Text> : null}
      {serverError ? <Text style={styles.error}>{serverError}</Text> : null}
      <View style={styles.actions}>
        <AppButton label="Batal" onPress={onClose} disabled={submitting} />
        <AppButton
          label={submitting ? 'Mengirim…' : submitLabel}
          onPress={submit}
          disabled={submitting || !hasContent || !consent}
          loading={submitting}
        />
      </View>
    </AppCard>
  );
};

const styles = StyleSheet.create({
  title: {...Typography.heading3, marginBottom: Spacing.sm},
  consentRow: {flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md},
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.border.warm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: {backgroundColor: Colors.brand.emerald, borderColor: Colors.brand.emerald},
  check: {color: '#FFFFFF', fontWeight: '800', fontSize: 14},
  consentText: {...Typography.body, flex: 1},
  error: {...Typography.body, color: Colors.status.error, marginTop: Spacing.sm},
  actions: {flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md},
});
