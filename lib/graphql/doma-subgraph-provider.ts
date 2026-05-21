import retry from 'async-retry'
import axios from 'axios'
import { IV3SubgraphProvider, log, V3SubgraphPool } from '@uniswap/smart-order-router'
import { ChainId, Token } from '@uniswap/sdk-core'
import { ProviderConfig } from '@uniswap/smart-order-router/build/main/providers/provider'

const DOMA_POOLS_QUERY = `
  query Pools($skip: Int, $take: Int) {
    pools(skip: $skip, take: $take) {
      items {
        address
        feeTier
        tvlUsd
        liquidity
        token0Address
        token1Address
      }
      hasNextPage
    }
  }
`

const PAGE_SIZE = 100

interface DomaPool {
  address: string
  feeTier: number
  tvlUsd: number
  liquidity: string
  token0Address: string
  token1Address: string
}

interface DomaPoolsPage {
  pools: {
    items: DomaPool[]
    hasNextPage: boolean
  }
}

export class V3DomaSubgraphProvider implements IV3SubgraphProvider {
  constructor(
    private readonly chainId: ChainId,
    private readonly retries = 3,
    private readonly timeout = 90_000,
    private readonly trackedEthThreshold = 0.01,
    _untrackedUsdThreshold = 0,
    private readonly endpoint: string,
    private readonly apiKey?: string
  ) {}

  async getPools(_tokenIn?: Token, _tokenOut?: Token, _providerConfig?: ProviderConfig): Promise<V3SubgraphPool[]> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.apiKey) headers['Api-Key'] = this.apiKey

    let allPools: DomaPool[] = []

    await retry(
      async () => {
        const fetched: DomaPool[] = []
        let skip = 0

        while (true) {
          const response = await axios.post<{ data: DomaPoolsPage; errors?: { message: string }[] }>(
            this.endpoint,
            { query: DOMA_POOLS_QUERY, variables: { skip, take: PAGE_SIZE } },
            { headers, timeout: this.timeout }
          )

          if (response.data.errors?.length) {
            throw new Error(`Doma GraphQL error: ${JSON.stringify(response.data.errors)}`)
          }

          const page = response.data.data
          fetched.push(...page.pools.items)

          if (!page.pools.hasNextPage) break
          skip += PAGE_SIZE
        }

        allPools = fetched
      },
      {
        retries: this.retries,
        onRetry: (err, attempt) => {
          log.info({ err }, `Failed to fetch pools from Doma API. Retry attempt: ${attempt}`)
        },
      }
    )

    log.info(`Fetched ${allPools.length} pools from Doma API for chain ${this.chainId}`)

    return allPools
      // Use this as rough approximation, to filter almost empty pools
      .filter((pool) => pool.tvlUsd >= this.trackedEthThreshold * 1000)
      .map((pool) => ({
        id: pool.address.toLowerCase(),
        feeTier: pool.feeTier.toString(),
        liquidity: pool.liquidity.toString(),
        token0: { id: pool.token0Address.toLowerCase() },
        token1: { id: pool.token1Address.toLowerCase() },
        tvlETH: pool.tvlUsd,
        tvlUSD: pool.tvlUsd,
      }))
  }
}
