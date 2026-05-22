set -e
echo "Running node setup..."
pnpm install --frozen-lockfile > /dev/null

echo "Running shared types build..."
pnpm build:shared > /dev/null

echo "Running web lint..."
pnpm --filter web run lint > /dev/null

echo "Running typecheck..."
pnpm -r exec tsc --noEmit > /dev/null

echo "All checks passed!"
