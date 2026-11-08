import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UnassignedQueue } from './UnassignedQueue';
import type { WorkQueueGroup } from './types';

const GROUP_A: WorkQueueGroup = {
  kind: 'rt',
  id: 'rt:001:rw:001',
  name: 'RT 001 / RW 001',
  totalCans: 2,
  assignedCans: 0,
  unassignedCans: 2,
  canIds: ['can-1', 'can-2'],
  cans: [
    {
      id: 'can-1',
      qrCode: 'QR-001',
      ownerName: 'Warga Satu',
      rt: '001',
      rw: '001',
      condition: 'AKTIF',
    },
    {
      id: 'can-2',
      qrCode: 'QR-002',
      ownerName: 'Warga Dua',
      rt: '001',
      rw: '001',
      condition: 'RUSAK',
    },
  ],
};

const GROUP_B: WorkQueueGroup = {
  kind: 'rt',
  id: 'rt:002:rw:001',
  name: 'RT 002 / RW 001',
  totalCans: 1,
  assignedCans: 0,
  unassignedCans: 1,
  canIds: ['can-3'],
  cans: [
    {
      id: 'can-3',
      qrCode: null,
      ownerName: 'Warga Tiga',
      rt: '002',
      rw: '001',
      condition: 'HILANG',
    },
  ],
};

function Harness({ groups }: { groups: WorkQueueGroup[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  return (
    <UnassignedQueue
      groups={groups}
      selectedIds={selectedIds}
      onToggle={(groupId) => {
        setSelectedIds((previous) => {
          const next = new Set(previous);
          if (next.has(groupId)) next.delete(groupId);
          else next.add(groupId);
          return next;
        });
      }}
      onToggleAll={() => {
        setSelectedIds((previous) => {
          if (groups.length > 0 && groups.every((group) => previous.has(group.id))) {
            return new Set();
          }
          return new Set(groups.map((group) => group.id));
        });
      }}
      loading={false}
      error={null}
      onRetry={() => {}}
    />
  );
}

describe('UnassignedQueue rincian per grup', () => {
  afterEach(cleanup);

  it('membuka rincian menampilkan kaleng tanpa mencentang grup', () => {
    render(<Harness groups={[GROUP_A, GROUP_B]} />);

    const toggle = screen.getByRole('button', { name: 'Lihat 2 kaleng' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('QR-001')).toBeTruthy();
    expect(screen.getByText('Warga Satu')).toBeTruthy();
    expect(screen.getByText('AKTIF')).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: /RT 001/ }) as HTMLInputElement).checked).toBe(
      false
    );

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('QR-001')).toBeNull();
  });

  it('mengklik nama grup mencentang tanpa membuka rincian', () => {
    render(<Harness groups={[GROUP_A]} />);

    fireEvent.click(screen.getByText('RT 001 / RW 001'));

    expect((screen.getByRole('checkbox', { name: /RT 001/ }) as HTMLInputElement).checked).toBe(
      true
    );
    expect(screen.queryByText('QR-001')).toBeNull();
  });

  it('grup tanpa cans menampilkan Rincian belum tersedia, bukan daftar kosong', () => {
    render(<Harness groups={[{ ...GROUP_A, cans: undefined }]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Lihat 2 kaleng' }));

    expect(screen.getByText('Rincian belum tersedia')).toBeTruthy();
  });

  it('grup dukuh tanpa canIds tidak menampilkan tombol rincian', () => {
    render(
      <Harness
        groups={[
          {
            kind: 'dukuh',
            id: 'dukuh-1',
            name: 'Dukuh Contoh',
            totalCans: 4,
            assignedCans: 1,
            unassignedCans: 3,
            canIds: null,
          },
        ]}
      />
    );

    expect(screen.queryByRole('button', { name: /lihat/i })).toBeNull();
  });

  it('state buka rincian dipangkas saat grup berubah', async () => {
    const { rerender } = render(<Harness groups={[GROUP_A]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Lihat 2 kaleng' }));
    expect(screen.getByText('QR-001')).toBeTruthy();

    rerender(<Harness groups={[GROUP_B]} />);
    await waitFor(() => expect(screen.queryByText('QR-001')).toBeNull());

    rerender(<Harness groups={[GROUP_A]} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Lihat 2 kaleng' }).getAttribute('aria-expanded')).toBe(
        'false'
      )
    );
    expect(screen.queryByText('QR-001')).toBeNull();
  });

  it('Pilih semua tetap mencentang seluruh grup', () => {
    render(<Harness groups={[GROUP_A, GROUP_B]} />);

    fireEvent.click(screen.getByRole('button', { name: /pilih semua/i }));

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes.every((checkbox) => checkbox.checked)).toBe(true);
  });
});
