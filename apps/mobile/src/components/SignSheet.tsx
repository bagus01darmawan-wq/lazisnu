import React, {useRef, useState} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {AppButton} from './ui/AppButton';
import {AppPressable} from './ui/AppPressable';
import {SignaturePad} from './SignaturePad';
import {Colors, Spacing, Typography} from '../theme';

/** Batas backend: PNG coretan ≤ 50KB (`cosign.ts` SIGNATURE_MAX_BYTES). */
const SIGNATURE_MAX_BYTES = 50 * 1024;

/** Estimasi byte dari base64 tanpa decode penuh. */
export function base64ByteLength(base64: string): number {
  return Math.ceil(base64.length * 3 * 0.25);
}

type SignSheetProps = {
  title: string;
  submitLabel: string;
  submitting: boolean;
  serverError: string | null;
  onSubmit: (signaturePngBase64: string) => void;
  onClose: () => void;
  /**
   * Isi berita acara yang akan ditandatangani.
   *
   * Menutup celah kepatuhan yang ditemukan 23 Sep 2026: sheet ini meminta
   * centang "Saya menyetujui berita acara ini" **tanpa pernah menampilkan**
   * teksnya. Opsional supaya pemanggil lama tidak wajib berubah.
   */
  baText?: string[] | null;
  /** Nomor BA (001/BA/IX/2026) — ditampilkan di atas isi. */
  baNumber?: string | null;
  /** true = isi BA sedang dimuat. */
  baLoading?: boolean;
  /**
   * Kolom tambahan yang dibutuhkan sebagian alur (mis. isian Share MWC untuk
   * tanda tangan BA ranting), dirender **di atas kanvas**. State-nya milik
   * pemanggil; sheet hanya menyediakan tempat.
   */
  children?: React.ReactNode;
};

/**
 * C1-T10 — Lembar tanda tangan: isi BA + kanvas coretan WebView + persetujuan
 * eksplisit + kirim. PNG diekspor kanvas per goresan (base64 murni); coretan
 * kosong, melebihi 50KB, atau tanpa consent tak bisa dikirim (gerbang ganda
 * klien + server T5).
 */
export const SignSheet: React.FC<SignSheetProps> = ({
  title,
  submitLabel,
  submitting,
  serverError,
  onSubmit,
  onClose,
  baText,
  baNumber,
  baLoading,
  children,
}) => {
  const signature = useRef('');
  const [hasContent, setHasContent] = useState(false);
  const [consent, setConsent] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = () => {
    const b64 = signature.current;
    if (!b64) {
      setLocalError('Coret tanda tangan dulu');
      return;
    }
    if (base64ByteLength(b64) > SIGNATURE_MAX_BYTES) {
      setLocalError('Coretan maksimal 50KB — coret lebih ringkas.');
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
    <View style={styles.sheet}>
      <Text style={styles.title}>{title}</Text>
      {baLoading ? <Text style={styles.hint}>Memuat isi berita acara…</Text> : null}
      {baText && baText.length > 0 ? (
        <View style={styles.baText}>
          {baNumber ? <Text style={styles.baNumber}>Nomor: {baNumber}</Text> : null}
          {baText.map((line, i) => (
            <Text key={`${i}-${line.slice(0, 12)}`} style={styles.baLine}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
      {children}
      <SignaturePad
        onChange={(base64, content) => {
          signature.current = base64;
          setHasContent(content && base64.length > 0);
          if (content) setLocalError(null);
        }}
      />
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
    </View>
  );
};

const styles = StyleSheet.create({
  sheet: {gap: Spacing.md},
  title: {...Typography.heading3},
  hint: {...Typography.caption, color: Colors.text.muted},
  baText: {gap: Spacing.xs},
  baNumber: {...Typography.caption, fontWeight: '700'},
  baLine: {...Typography.body, color: Colors.text.primary},
  consentRow: {flexDirection: 'row', alignItems: 'center', gap: Spacing.sm},
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
  error: {...Typography.body, color: Colors.status.error},
  actions: {flexDirection: 'row', gap: Spacing.sm},
});
