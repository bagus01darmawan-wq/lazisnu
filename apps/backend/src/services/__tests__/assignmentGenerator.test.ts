import { buildRoundRobinAssignments, buildFirstOfficerAssignments } from '../assignmentGenerator';

type CanWithOfficers = {
  id: string;
  branchId: string;
  branch: {
    id: string;
    name: string;
    code: string;
    districtId: string;
    officers: Array<{ id: string; fullName: string }>;
  } | null;
};

function makeCan(id: string, branchId: string, officers: Array<{ id: string; fullName: string }>): CanWithOfficers {
  return {
    id,
    branchId,
    branch: {
      id: branchId,
      name: `Branch ${branchId}`,
      code: `BR-${branchId}`,
      districtId: 'district-1',
      officers,
    },
  };
}

describe('buildRoundRobinAssignments', () => {
  it('mendistribusikan kaleng ke petugas secara round-robin per cabang (O(N))', () => {
    const officerA = { id: 'officer-1', fullName: 'A' };
    const officerB = { id: 'officer-2', fullName: 'B' };
    const cans = [
      makeCan('can-1', 'branch-1', [officerA, officerB]),
      makeCan('can-2', 'branch-1', [officerA, officerB]),
      makeCan('can-3', 'branch-1', [officerA, officerB]),
      makeCan('can-4', 'branch-1', [officerA, officerB]),
    ];

    const result = buildRoundRobinAssignments(cans as any, 2026, 5);

    expect(result).toHaveLength(4);
    expect(result[0].officerId).toBe('officer-1');
    expect(result[1].officerId).toBe('officer-2');
    expect(result[2].officerId).toBe('officer-1');
    expect(result[3].officerId).toBe('officer-2');
  });

  it('counter per cabang independen (tidak campur antar branch)', () => {
    const offA = { id: 'off-a', fullName: 'A' };
    const offB = { id: 'off-b', fullName: 'B' };
    const offX = { id: 'off-x', fullName: 'X' };
    const offY = { id: 'off-y', fullName: 'Y' };

    const cans = [
      makeCan('can-1a', 'branch-1', [offA, offB]),
      makeCan('can-1b', 'branch-1', [offA, offB]),
      makeCan('can-2a', 'branch-2', [offX, offY]),
      makeCan('can-2b', 'branch-2', [offX, offY]),
    ];

    const result = buildRoundRobinAssignments(cans as any, 2026, 5);

    expect(result).toHaveLength(4);
    expect(result[0].officerId).toBe('off-a');
    expect(result[1].officerId).toBe('off-b');
    expect(result[2].officerId).toBe('off-x');
    expect(result[3].officerId).toBe('off-y');
  });

  it('skip kaleng yang tidak punya petugas', () => {
    const cans = [
      makeCan('can-1', 'branch-1', []),
      makeCan('can-2', 'branch-1', [{ id: 'off-1', fullName: 'A' }]),
    ];

    const result = buildRoundRobinAssignments(cans as any, 2026, 5);

    expect(result).toHaveLength(1);
    expect(result[0].canId).toBe('can-2');
  });

  it('branch null tidak crash', () => {
    const can = {
      id: 'can-1',
      branchId: 'branch-1',
      branch: null,
    };
    const result = buildRoundRobinAssignments([can as any], 2026, 5);
    expect(result).toHaveLength(0);
  });

  it('semua field assignment terisi dengan benar', () => {
    const officer = { id: 'off-1', fullName: 'A' };
    const cans = [makeCan('can-1', 'branch-1', [officer])];

    const result = buildRoundRobinAssignments(cans as any, 2026, 5);

    expect(result[0]).toMatchObject({
      canId: 'can-1',
      officerId: 'off-1',
      periodYear: 2026,
      periodMonth: 5,
      status: 'ACTIVE',
    });
  });

  it('array kosong mengembalikan array kosong', () => {
    const result = buildRoundRobinAssignments([], 2026, 5);
    expect(result).toEqual([]);
  });
});

describe('buildFirstOfficerAssignments', () => {
  it('mengambil petugas pertama sebagai primary', () => {
    const offA = { id: 'off-1', fullName: 'A' };
    const offB = { id: 'off-2', fullName: 'B' };
    const cans = [makeCan('can-1', 'branch-1', [offA, offB])];

    const result = buildFirstOfficerAssignments(cans as any, 2026, 5);

    expect(result).toHaveLength(1);
    expect(result[0].officerId).toBe('off-1');
    expect(result[0].backupOfficerId).toBe('off-2');
  });

  it('backup null jika hanya 1 petugas', () => {
    const offA = { id: 'off-1', fullName: 'A' };
    const cans = [makeCan('can-1', 'branch-1', [offA])];

    const result = buildFirstOfficerAssignments(cans as any, 2026, 5);

    expect(result).toHaveLength(1);
    expect(result[0].backupOfficerId).toBeNull();
  });

  it('skip kaleng tanpa petugas', () => {
    const cans = [
      makeCan('can-1', 'branch-1', []),
      makeCan('can-2', 'branch-1', [{ id: 'off-1', fullName: 'A' }]),
    ];

    const result = buildFirstOfficerAssignments(cans as any, 2026, 5);

    expect(result).toHaveLength(1);
    expect(result[0].canId).toBe('can-2');
  });
});
