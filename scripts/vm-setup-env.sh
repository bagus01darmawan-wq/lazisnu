=> [web deps 5/5] RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile                                                                               31.6s
 => [backend build 2/6] COPY --from=deps /app/node_modules node_modules                                                                                                           15.0s 
 => [backend build 3/6] COPY --from=deps /app/pnpm-lock.yaml ./                                                                                                                    0.7s 
 => [worker build 4/6] COPY . .                                                                                                                                                    0.5s 
 => ERROR [backend build 5/6] RUN pnpm --filter @lazisnu/shared-types build                                                                                                        3.6s 
 => CANCELED [web build 2/5] COPY --from=deps /app/node_modules node_modules                                                                                                       2.0s 
------                                                                                                                                                                                  
 > [backend build 5/6] RUN pnpm --filter @lazisnu/shared-types build:                                                                                                                   
0.705 ! Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-10.33.2.tgz
3.367 
3.367 > @lazisnu/shared-types@1.0.0 build /app/packages/shared-types
3.367 > tsc
3.367 
3.377 sh: tsc: not found
3.400 /app/packages/shared-types:
3.400  ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @lazisnu/shared-types@1.0.0 build: `tsc`
3.400 spawn ENOENT
3.402  WARN   Local package.json exists, but node_modules missing, did you mean to install?
------
[+] up 0/3
 ⠙ Image lazisnu-worker  Building                                                                                                                                                  62.2s
 ⠙ Image lazisnu-web     Building                                                                                                                                                  62.2s
 ⠙ Image lazisnu-backend Building                                                                                                                                                  62.2s
Dockerfile:18

--------------------

  16 |     COPY --from=deps /app/pnpm-lock.yaml ./

  17 |     COPY . .

  18 | >>> RUN pnpm --filter @lazisnu/shared-types build

  19 |     RUN pnpm --filter lazisnu-backend build

  20 |     

--------------------

target worker: failed to solve: process "/bin/sh -c pnpm --filter @lazisnu/shared-types build" did not complete successfully: exit code: 1