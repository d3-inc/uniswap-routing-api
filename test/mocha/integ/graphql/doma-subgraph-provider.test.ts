import { expect } from 'chai'
import { ChainId } from '@uniswap/sdk-core'
import dotenv from 'dotenv'
import { V3DomaSubgraphProvider } from '../../../../lib/graphql/doma-subgraph-provider'

dotenv.config()

const DOMA_API_KEY = process.env.DOMA_API_KEY
const DOMA_DEVNET_ENDPOINT = 'https://api-devnet.doma.xyz/graphql'

describe('integration tests for V3DomaSubgraphProvider', () => {
  let provider: V3DomaSubgraphProvider

  before(function () {
    if (!DOMA_API_KEY) {
      this.skip()
    }
  })

  // Each test may fetch all pages from the Doma API
  const TEST_TIMEOUT_MS = 30_000

  beforeEach(() => {
    provider = new V3DomaSubgraphProvider(
      ChainId.MAINNET,
      3,
      90_000,
      0.01,
      0,
      DOMA_DEVNET_ENDPOINT,
      DOMA_API_KEY
    )
  })

  it('should fetch pools and return a non-empty list', async function () {
    this.timeout(TEST_TIMEOUT_MS)
    const pools = await provider.getPools()

    expect(pools).to.be.an('array')
    expect(pools.length).to.be.greaterThan(0)
  })

  it('should return pools with required V3SubgraphPool fields', async function () {
    this.timeout(TEST_TIMEOUT_MS)
    const pools = await provider.getPools()
    const pool = pools[0]!

    expect(pool.id).to.be.a('string')
    expect(pool.feeTier).to.be.a('string')
    expect(pool.liquidity).to.be.a('string')
    expect(pool.token0).to.have.property('id').that.is.a('string')
    expect(pool.token1).to.have.property('id').that.is.a('string')
    expect(pool.tvlUSD).to.be.a('number')
    expect(pool.tvlETH).to.be.a('number')
  })

  it('should set tvlETH equal to tvlUSD', async () => {
    const pools = await provider.getPools()

    for (const pool of pools) {
      expect(pool.tvlETH).to.equal(pool.tvlUSD)
    }
  })

  it('should return pool ids and token addresses as lowercase', async () => {
    const pools = await provider.getPools()

    for (const pool of pools) {
      expect(pool.id).to.equal(pool.id.toLowerCase())
      expect(pool.token0.id).to.equal(pool.token0.id.toLowerCase())
      expect(pool.token1.id).to.equal(pool.token1.id.toLowerCase())
    }
  })

  it('should filter out pools below the tvlUSD threshold', async function () {
    this.timeout(TEST_TIMEOUT_MS)
    const highThresholdProvider = new V3DomaSubgraphProvider(
      ChainId.MAINNET,
      3,
      90_000,
      1_000_000,
      0,
      DOMA_DEVNET_ENDPOINT,
      DOMA_API_KEY
    )
    const allProvider = new V3DomaSubgraphProvider(
      ChainId.MAINNET,
      3,
      90_000,
      0,
      0,
      DOMA_DEVNET_ENDPOINT,
      DOMA_API_KEY
    )

    const filteredPools = await highThresholdProvider.getPools()
    const allPools = await allProvider.getPools()

    expect(filteredPools.length).to.be.lessThan(allPools.length)
    for (const pool of filteredPools) {
      expect(pool.tvlUSD).to.be.greaterThanOrEqual(1_000_000)
    }
  })

  it('should fetch all pools across multiple pages', async () => {
    // Use a small page size to force pagination — provider uses PAGE_SIZE=100 internally,
    // but with 233 total pools on devnet we expect more than 100 results when threshold is 0.
    const noFilterProvider = new V3DomaSubgraphProvider(
      ChainId.MAINNET,
      3,
      90_000,
      0,
      0,
      DOMA_DEVNET_ENDPOINT,
      DOMA_API_KEY
    )

    const pools = await noFilterProvider.getPools()
    expect(pools.length).to.be.greaterThan(100)
  })
})
