import React, {useRef} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import SignatureScreen, {type SignatureViewRef} from 'react-native-signature-canvas';
import {Colors, Radius, Spacing, Typography} from '../theme';
import {AppPressable} from './ui/AppPressable';

type SignaturePadProps = {
  /** base64 PNG murni (tanpa prefix data-URI) + ada isi. */
  onChange: (base64: string, hasContent: boolean) => void;
};

/**
 * Kanvas coretan TTD berbasis WebView offline-first
 * (`react-native-signature-canvas` → signature_pad: kurva Bézier kubik,
 * smoothing kecepatan pena; render di dalam WebView sehingga JS thread bebas
 * lag). HTML/JS dibundel lokal di APK — tidak butuh internet.
 *
 * Kontrak: tiap goresan selesai (`onEnd`) diekspor via `readSignature()`;
 * `onOK` membersihkan prefix data-URI dan meneruskan base64 murni ke
 * pemanggil (format yang divalidasi backend: PNG magic bytes, ≤50KB).
 */
const WEB_STYLE = `.m-signature-pad {box-shadow: none; border: none; background-color: transparent;}
.m-signature-pad--body {border: none;}
.m-signature-pad--footer {display: none; margin: 0px;}
body, html {width: 100%; height: 100%; background-color: transparent;}`;

export const SignaturePad: React.FC<SignaturePadProps> = function SignaturePad({onChange}) {
  const ref = useRef<SignatureViewRef>(null);

  const clear = () => {
    ref.current?.clearSignature();
  };

  return (
    <View>
      <View style={styles.pad}>
        <SignatureScreen
          ref={ref}
          onOK={(signature: string) => {
            const base64 = signature.replace('data:image/png;base64,', '');
            onChange(base64, base64.length > 0);
          }}
          onEmpty={() => onChange('', false)}
          onClear={() => onChange('', false)}
          onBegin={() => {
            // Goresan pertama = ada isi (tombol kirim aktif lebih awal);
            // base64 definitif menyusul lewat onOK saat goresan selesai.
          }}
          onEnd={() => {
            ref.current?.readSignature();
          }}
          autoClear={false}
          imageType="image/png"
          minWidth={1.5}
          maxWidth={3.5}
          dotSize={2.0}
          penColor="#1a1a1a"
          backgroundColor="rgba(255,255,255,1)"
          webStyle={WEB_STYLE}
        />
      </View>
      <AppPressable
        accessibilityRole="button"
        accessibilityLabel="Hapus coretan"
        onPress={clear}
        style={styles.clearBtn}>
        <Text style={styles.clearText}>Hapus</Text>
      </AppPressable>
    </View>
  );
};

const styles = StyleSheet.create({
  pad: {
    height: 150,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.border.warm,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearBtn: {alignSelf: 'flex-end', padding: Spacing.sm},
  clearText: {...Typography.caption, fontWeight: '700'},
});
