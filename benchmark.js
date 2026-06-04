/* eslint-disable no-console */

function createOfficers(size) {
  return Array.from({ length: size }, (_, i) => ({
    id: `officer-${i}`,
    full_name: `Officer ${i}`,
    branch_id: `branch-${i % 100}`,
  }));
}

function benchmarkFind(officers, lookups) {
  const start = performance.now();
  for (const id of lookups) {
    officers.find((officer) => officer.id === id);
  }
  return performance.now() - start;
}

function benchmarkMap(officers, lookups) {
  const map = new Map(officers.map((officer) => [officer.id, officer]));
  const start = performance.now();
  for (const id of lookups) {
    map.get(id);
  }
  return performance.now() - start;
}

function run() {
  const sizes = [500, 2000, 5000, 10000];
  const iterations = 5000;

  console.log('Lookup benchmark: Array.find vs Map.get');
  console.log(`Iterations per size: ${iterations}`);

  for (const size of sizes) {
    const officers = createOfficers(size);
    const lookups = Array.from({ length: iterations }, (_, i) => `officer-${i % size}`);

    const findMs = benchmarkFind(officers, lookups);
    const mapMs = benchmarkMap(officers, lookups);

    console.log(
      `size=${size} | find=${findMs.toFixed(3)}ms | map=${mapMs.toFixed(3)}ms | speedup=${(findMs / mapMs).toFixed(2)}x`
    );
  }
}

run();
