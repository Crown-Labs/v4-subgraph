# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build & Development

- `yarn build` - Generate TypeScript types from GraphQL schema and build the subgraph
- `yarn buildonly` - Build the subgraph without regenerating types
- `yarn codegen` - Generate TypeScript types from GraphQL schema (outputs to `src/types/`)
- `yarn lint` - Run ESLint on TypeScript files
- `yarn lint:fix` - Run ESLint with auto-fix
- `yarn test` - Run unit tests with Docker (requires Docker and postgres installed)

### Deployment

All deployments (except `deploy:local`) require a `.env` file with `DEPLOY_KEY` (0xnode) or `ORMI_DEPLOY_KEY` (Ormi):

- `yarn deploy:arbitrum-one` - Deploy `kittycorn-arbitrum-one/v4-subgraph` to 0xnode (network `arbitrum-one`); needs `DEPLOY_KEY`
- `yarn deploy:ormi:arbitrum-one` - Deploy `kittycorn-arbitrum-one` to Ormi 0xGraph (network `arbitrum-one`); needs `ORMI_DEPLOY_KEY` in `.env`, optional `VERSION_LABEL` (default `v0.0.1`)
- `yarn deploy:ormi:base-sepolia` - Deploy `kittycorn-base-sepolia` to Ormi 0xGraph (network `base-sepolia`, chainId 84532); same `ORMI_DEPLOY_KEY` / `VERSION_LABEL`
- `yarn deploy:local` - Deploy to local graph node (http://localhost:8020)

For new deployments, first run the corresponding `create:*` command.

### Run locally on base-sepolia

1. Put `BASE_SEPOLIA_RPC_URL=<your RPC URL>` in `.env` (see `example.env`). It must be an **archive** RPC: PoolManager starts at block 19088197, and the public `sepolia.base.org` node prunes old state. `docker compose` reads `.env` and refuses to start if the variable is missing.
2. `docker compose up -d` (postgres is pinned to 16; postgres 18+ moved its data dir and breaks the `./data/postgres` mount)
3. `yarn codegen`
4. `yarn create:local:base-sepolia && yarn deploy:local:base-sepolia`. `graph deploy --network` rewrites `subgraph.yaml` with base-sepolia addresses, so check `git diff subgraph.yaml` before committing.
5. Query at http://localhost:8000/subgraphs/name/v4-subgraph-base-sepolia. Follow indexing with `docker compose logs -f graph-node`.
6. Reset: `docker compose down && rm -rf ./data` (on Linux the files are root-owned, so use `sudo rm -rf ./data`)

On Apple Silicon, graph-node only ships `linux/amd64` images, so the compose file sets `platform: linux/amd64` and Docker runs it under emulation. It is slower but works. The compose file only configures the `base-sepolia` provider; to run arbitrum-one locally, add an `arbitrum-one:<url>` entry to the `ethereum` env var, separated by a space.

## Architecture Overview

This is a Uniswap V4 subgraph modified for Kittycorn, tracking DEX activity and lending functionality. The subgraph indexes three main contracts:

### Core Data Sources

1. **PoolManager** (Uniswap V4 core)

   - Handles pool initialization, liquidity modifications, and swaps
   - Tracks tokens, pools, ticks, and transaction data

2. **PositionManager** (NFT positions)

   - Manages liquidity positions as NFTs
   - Tracks subscriptions, unsubscriptions, and transfers

3. **KittycornBank** (Lending protocol)
   - Manages borrowing/lending functionality
   - Handles collateral configuration and liquidations

### Key Mappings

- **Event Handlers**: Located in `src/mappings/`, each file handles specific contract events
- **Utilities**: `src/utils/` contains pricing logic, token helpers, and chain-specific configurations
- **Chain Configuration**: `src/utils/chains.ts` defines network-specific settings (addresses, tokens, etc.)

### Data Flow

1. Events from contracts trigger mapping handlers
2. Handlers create/update entities defined in `schema.graphql`
3. Price calculations use wrapped native token pools (e.g., WETH/USDC)
4. Tokenized assets (tTokens) are mapped to their underlying assets for pricing

### Supported Networks

Only `arbitrum-one` and `base-sepolia` are configured (`src/utils/chains.ts` throws `Unsupported Network` for anything else).

### Adding New Chains

1. Add network configuration in `src/utils/chains.ts`
2. Create entry in `networks.json` with factory address
3. Update deployment scripts in `package.json`
4. Deploy using yarn commands above

### Testing

Tests use matchstick-as framework and require Docker. Test files are in `tests/` directory mirroring the source structure.

## Commit Message Guidelines

When creating git commits, use concise, descriptive messages without the following signatures:

```
🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

Use standard conventional commit format instead:

```
feat: add new feature
fix: resolve bug issue
chore: update dependencies
refactor: improve code structure
```

# Summary instructions

When you are using compact, please focus on test output and code changes
