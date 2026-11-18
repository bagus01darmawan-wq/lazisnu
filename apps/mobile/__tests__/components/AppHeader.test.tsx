/**
 * AppHeader — regresi "periode basi" crash (2026-11-18).
 *
 * Banner menyinkronkan sebelumnya memakai accessibilityRole="status" yang
 * tidak ada di enum AccessibilityRole Android (RN 0.88) → crashFatal di
 * perangkat saat banner tampil ("Invalid accessibility role value: status").
 * Uji ini mengunci perbaikan dan memeriksa atribut role eksplisit di src
 * terhadap enum native Android yang terpasang.
 */
import React from 'react';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {Text} from 'react-native';
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));

import {AppHeader} from '../../src/components/ui/AppHeader';
import {usePeriodStore} from '../../src/stores';

// Gunakan enum RN yang terpasang agar daftar mengikuti versi native aplikasi.
const rnRoot = path.dirname(require.resolve('react-native/package.json'));
const nativeAccessibility = fs.readFileSync(
  path.join(
    rnRoot,
    'ReactAndroid/src/main/java/com/facebook/react/uimanager/ReactAccessibilityDelegate.kt',
  ),
  'utf8',
);
const enumBody = nativeAccessibility.match(/enum class AccessibilityRole\s*\{([\s\S]*?);/);
const rolesBody = enumBody?.[1];
if (!rolesBody) {
  throw new Error('Enum AccessibilityRole Android tidak ditemukan pada React Native terpasang');
}
const validRoles = new Set(
  Array.from(rolesBody.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*[,;]?\s*$/gm), match =>
    (match[1] ?? '').toLowerCase(),
  ),
);
if (validRoles.size === 0) {
  throw new Error('Enum AccessibilityRole Android kosong');
}

function auditRoles(source: string, file: string): string[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const errors: string[] = [];

  function checkValue(value: ts.Expression) {
    if (
      ts.isParenthesizedExpression(value) ||
      ts.isAsExpression(value) ||
      ts.isNonNullExpression(value)
    ) {
      checkValue(value.expression);
    } else if (ts.isConditionalExpression(value)) {
      checkValue(value.whenTrue);
      checkValue(value.whenFalse);
    } else if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
      if (!validRoles.has(value.text.toLowerCase())) {
        errors.push(`Role tidak valid: ${value.text}`);
      }
    } else if (
      value.kind !== ts.SyntaxKind.NullKeyword &&
      !(ts.isIdentifier(value) && value.text === 'undefined')
    ) {
      errors.push(`Role dinamis tidak dapat diverifikasi: ${value.getText(sourceFile)}`);
    }
  }

  function visit(node: ts.Node) {
    if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === 'accessibilityRole') {
      const value = node.initializer;
      if (value && ts.isStringLiteral(value)) {
        checkValue(value);
      } else if (value && ts.isJsxExpression(value) && value.expression) {
        checkValue(value.expression);
      } else {
        errors.push('Role tidak memiliki nilai yang dapat diverifikasi');
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return errors;
}

const SRC_DIR = path.join(__dirname, '..', '..', 'src');

function* walkTsx(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.name === 'node_modules' || entry.name === '__tests__') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkTsx(full);
      continue;
    }
    if (/\.tsx?$/.test(entry.name)) {
      yield full;
    }
  }
}

describe('AppHeader banner periode basi', () => {
  const wasStale = usePeriodStore.getState().isStale;
  let tree: renderer.ReactTestRenderer | undefined;

  afterEach(async () => {
    await act(async () => {
      tree?.unmount();
      usePeriodStore.setState({isStale: wasStale});
    });
    tree = undefined;
  });

  it('merender banner dengan liveRegion, bukan accessibilityRole invalid', async () => {
    usePeriodStore.setState({isStale: true});
    await act(async () => {
      tree = renderer.create(<AppHeader variant="main" title="Beranda" />);
    });
    expect(tree).toBeDefined();
    const texts = tree!.root
      .findAllByType(Text)
      .map((node: ReactTestInstance) => node.props.children)
      .flat()
      .join(' ');
    expect(texts).toContain('Periode dari penyimpanan');

    const banner = tree!.root.findByProps({
      accessibilityLabel: 'Periode dari penyimpanan, sedang menyinkronkan data terbaru',
    });
    expect(banner.props.accessibilityLiveRegion).toBe('polite');
    expect(banner.props.accessibilityRole).toBeUndefined();
  });
});

describe('audit atribut accessibilityRole eksplisit', () => {
  it('menerima role native termasuk viewgroup dan kedua cabang yang aman', () => {
    expect(
      auditRoles(`<View accessibilityRole={ready ? 'viewgroup' : undefined} />`, 'example.tsx'),
    ).toEqual([]);
  });

  it('menolak role invalid pada literal dan kedua cabang conditional', () => {
    expect(
      auditRoles(
        `<><View accessibilityRole="status" /><View accessibilityRole={ready ? 'button' : 'status'} /></>`,
        'example.tsx',
      ),
    ).toEqual(['Role tidak valid: status', 'Role tidak valid: status']);
  });

  it('menolak role dinamis yang tidak dapat dibuktikan aman', () => {
    expect(auditRoles(`<View accessibilityRole={role} />`, 'example.tsx')).toEqual([
      'Role dinamis tidak dapat diverifikasi: role',
    ]);
  });

  it('memeriksa atribut JSX eksplisit di seluruh src', () => {
    const errors = Array.from(walkTsx(SRC_DIR)).flatMap(file =>
      auditRoles(fs.readFileSync(file, 'utf8'), file).map(
        error => `${path.relative(SRC_DIR, file)}: ${error}`,
      ),
    );
    expect(errors).toEqual([]);
  });
});
