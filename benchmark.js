const { performance } = require('perf_hooks');

const SIZES = [500, 2000, 5000, 10000];
const ITERATIONS = 10000;

function createData(size) {
  const data = [];
  for (let i = 0; i < size; i++) {
    data.push({ id: `officer_${i}`, name: `Officer ${i}`, branchId: `branch_${i % 10}` });
  }
  return data;
}

function runBenchmark() {
  console.log('--- Array.find vs Map.get Benchmark ---');
  console.log(`Iterations per test: ${ITERATIONS}\n`);

  for (const size of SIZES) {
    console.log(`=== Size: ${size} ===`);
    const data = createData(size);
    const map = new Map();

    // Measure Map creation time as well to understand the tradeoff
    const startMapCreate = performance.now();
    for (const item of data) {
      map.set(item.id, item);
    }
    const endMapCreate = performance.now();
    console.log(`Map creation time: ${(endMapCreate - startMapCreate).toFixed(4)} ms`);

    // We'll search for random existing items and some non-existing items
    const searchKeys = [];
    for (let i = 0; i < ITERATIONS; i++) {
      if (i % 10 === 0) {
        searchKeys.push('non_existent');
      } else {
        searchKeys.push(`officer_${Math.floor(Math.random() * size)}`);
      }
    }

    // Benchmark Array.find
    const arrayTimes = [];
    for (const key of searchKeys) {
      const start = performance.now();
      data.find(o => o.id === key);
      const end = performance.now();
      arrayTimes.push(end - start);
    }

    // Benchmark Map.get
    const mapTimes = [];
    for (const key of searchKeys) {
      const start = performance.now();
      map.get(key);
      const end = performance.now();
      mapTimes.push(end - start);
    }

    // Calculate metrics
    const calcMetrics = (times) => {
      times.sort((a, b) => a - b);
      const sum = times.reduce((a, b) => a + b, 0);
      const mean = sum / times.length;
      const median = times[Math.floor(times.length / 2)];
      const p95 = times[Math.floor(times.length * 0.95)];
      const p99 = times[Math.floor(times.length * 0.99)];
      return { sum, mean, median, p95, p99 };
    };

    const arrayMetrics = calcMetrics(arrayTimes);
    const mapMetrics = calcMetrics(mapTimes);

    console.log(`Array.find - Total: ${arrayMetrics.sum.toFixed(2)}ms | Mean: ${arrayMetrics.mean.toFixed(4)}ms | Median: ${arrayMetrics.median.toFixed(4)}ms | p95: ${arrayMetrics.p95.toFixed(4)}ms | p99: ${arrayMetrics.p99.toFixed(4)}ms`);
    console.log(`Map.get    - Total: ${mapMetrics.sum.toFixed(2)}ms | Mean: ${mapMetrics.mean.toFixed(4)}ms | Median: ${mapMetrics.median.toFixed(4)}ms | p95: ${mapMetrics.p95.toFixed(4)}ms | p99: ${mapMetrics.p99.toFixed(4)}ms`);
    console.log(`Speedup (Total Time): ${(arrayMetrics.sum / mapMetrics.sum).toFixed(2)}x\n`);
  }
}

runBenchmark();
