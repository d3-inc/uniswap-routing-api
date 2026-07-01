# Uniswap Routing API

This repository contains routing API for the Uniswap V3 protocol.

It deploys an API to AWS that uses @uniswap/smart-order-router to search for the most efficient way to swap token A for token B.

## Development

To develop on the Routing API you must have an AWS account where you can deploy your API for testing.

### Deploying the API

The best way to develop and test the API is to deploy your own instance to AWS.

1. Install and configure [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) and [AWS CDK V1](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html).
2. Create .env file in the root directory of the project with :
   ```
   THROTTLE_PER_FIVE_MINS = '' # Optional
   WEB3_RPC_{CHAIN ID} = { RPC Provider}
   # RPC Providers must be set for the following CHAIN IDs:
   # MAINNET = 1
   # ROPSTEN = 3
   # RINKEBY = 4
   # GOERLI = 5
   # KOVAN = 42
   # OPTIMISM = 10
   # OPTIMISTIC_KOVAN = 69
   # ARBITRUM_ONE = 42161
   # ARBITRUM_RINKEBY = 421611
   # POLYGON = 137
   # POLYGON_MUMBAI = 80001
   # BNB = 56
   # BASE = 8453
   # BLAST = 81457
   # ZORA = 7777777
   # ZKSYNC = 324
   TENDERLY_USER = '' # For enabling Tenderly simulations
   TENDERLY_PROJECT = '' # For enabling Tenderly simulations
   TENDERLY_ACCESS_KEY = '' # For enabling Tenderly simulations
   TENDERLY_NODE_API_KEY = '' # For enabling Tenderly node-level RPC access
   ALCHEMY_QUERY_KEY = '' # For Alchemy subgraph query access
   ALCHEMY_QUERY_KEY_2 = '' # For Alchemy subgraph query access
   GQL_URL = '' # The GraphQL endpoint url, for Uniswap graphql query access
   GQL_H_ORGN = '' # The GraphQL header origin, for Uniswap graphql query access
   ENVIRONMENT = '' # Add support to install another environment in the same account but different region
   #ROUTING_LAMBDA_MEMORY_SIZE = '1536' # Set lamdba default memory size
   TRACING = 'false' # Set to true to enable tracing.
   METRICS_SAMPLE_RATE = '0.05' # Log sampling rate (0 to 1). 0.05 sends 5% of logs, 1 sends all.
   ```
3. Install and build the package
   ```
   npm install && npm run build
   ```
4. To deploy the API run:
   ```
   cdk deploy RoutingAPIStack
   ```
   This will deploy to the default account your AWS CLI is configured for. Once complete it will output something like:
   ```
   RoutingAPIStack.Url = https://...
   ```
   You can then try it out:
   ```
   curl --request GET '<INSERT_YOUR_URL_HERE>/quote?tokenInAddress=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2&tokenInChainId=1&tokenOutAddress=0x1f9840a85d5af5bf1d1762f925bdaddc4201f984&tokenOutChainId=1&amount=100&type=exactIn'
   ```

## Deploying to a new region (via GitHub Actions)

The deploy workflow ([.github/workflows/deploy-routing-api.yml](.github/workflows/deploy-routing-api.yml)) picks the AWS region based on the branch name:

| Branch | Region |
|---|---|
| `main` | `us-west-1` (production) |
| any other branch | `us-east-2` (default test) |

To target a different test region, add a branch-specific entry to the `Select AWS region` step in the workflow.

### Step 1 — Bootstrap CDK in the target region (one-time)

CDK needs an S3 bucket and IAM roles in every region before it can deploy there. Run once from your local machine with credentials for the target AWS account:

```bash
export TARGET_REGION=us-east-1      # change to your target region
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

cdk bootstrap aws://${AWS_ACCOUNT_ID}/${TARGET_REGION}
```

Verify it succeeded:

```bash
aws cloudformation describe-stacks \
  --stack-name CDKToolkit \
  --region $TARGET_REGION \
  --query 'Stacks[0].StackStatus'
# expect: "CREATE_COMPLETE" or "UPDATE_COMPLETE"
```

### Step 2 — Update the branch→region mapping in the workflow

Edit the `Select AWS region based on branch` step in [.github/workflows/deploy-routing-api.yml](.github/workflows/deploy-routing-api.yml):

```yaml
- name: Select AWS region based on branch
  run: |
    if [ "${GITHUB_REF_NAME}" = "main" ]; then
      echo "AWS_REGION=us-west-1" >> $GITHUB_ENV
    elif [ "${GITHUB_REF_NAME}" = "test-node24" ]; then
      echo "AWS_REGION=us-east-1" >> $GITHUB_ENV   # your new test region
    else
      echo "AWS_REGION=us-east-2" >> $GITHUB_ENV
    fi
```

### Step 3 — Check GitHub secrets

Ensure the following secrets are set in **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Purpose |
|---|---|
| `AWS_ROLE_ARN` | IAM role CDK assumes (must trust GitHub OIDC and have deploy permissions in the target region/account) |
| `DOTENV` | Contents of the `.env` file injected at deploy time |
| `NODE_AUTH_TOKEN` | GitHub token for installing `@d3-inc` private packages |
| `SLACK_WEBHOOK` | (optional) Slack notifications on deploy completion/failure |

If the new test region uses a different AWS account, `AWS_ROLE_ARN` must reference a role in that account. If it needs different environment variables, add a second secret (e.g. `DOTENV_TEST`) and reference it in the workflow for that branch.

### Step 4 — Push your branch and trigger the workflow

```bash
git checkout -b test-node24
git push origin test-node24

# Trigger via GitHub CLI:
gh workflow run deploy-routing-api.yml --ref test-node24

# Watch the run:
gh run watch $(gh run list --workflow=deploy-routing-api.yml --limit 1 --json databaseId --jq '.[0].databaseId')
```

Or go to **Actions → Deploy Uniswap Routing API → Run workflow** and select your branch.

### Step 5 — Verify the deploy

```bash
export TARGET_REGION=us-east-1   # your test region

# Stack status
aws cloudformation describe-stacks \
  --stack-name RoutingAPIStack \
  --region $TARGET_REGION \
  --query 'Stacks[0].StackStatus'

# Get the API Gateway URL
aws cloudformation describe-stacks \
  --stack-name RoutingAPIStack \
  --region $TARGET_REGION \
  --query 'Stacks[0].Outputs'

# Confirm Lambda runtime is nodejs24.x
LAMBDA_NAME=$(aws lambda list-functions --region $TARGET_REGION \
  --query 'Functions[?contains(FunctionName,`RoutingLambda2`)].FunctionName' \
  --output text)

aws lambda get-function-configuration \
  --function-name $LAMBDA_NAME \
  --region $TARGET_REGION \
  --query 'Runtime'
# expect: "nodejs24.x"

# Hit the quote endpoint
curl -s "https://<api-id>.execute-api.${TARGET_REGION}.amazonaws.com/prod/quote?\
tokenInAddress=<TOKEN_IN>&tokenInChainId=<CHAIN_ID>\
&tokenOutAddress=<TOKEN_OUT>&tokenOutChainId=<CHAIN_ID>\
&amount=1000000000000000000&type=exactIn" | jq '{quote: .quote, routeLen: (.route | length)}'
```

---

### Tenderly Simulation

1. To get a more accurate estimate of the transaction's gas cost, request a tenderly simulation along with the swap. This is done by setting the optional query param "simulateFromAddress". For example:

```
curl --request GET '<INSERT_YOUR_URL_HERE>/quote?tokenInAddress=<0x...>&simulateFromAddress=<FROM_ADDRESS>&...'
```

2. Tenderly simulates the transaction and returns to us the simulated gasLimit as 'gasUseEstimate'. We use this gasLimit to update all our gas estimate heuristics. In the response body, the

```
{'gasUseEstimate':string, 'gasUseEstimateQuote':string, 'quoteGasAdjusted':string, and 'gasUseEstimateUSD':string}
```

fields will be updated/calculated using tenderly gasLimit estimate. These fields are already present even without Tenderly simulation, however in that case they are simply heuristics. The Tenderly gas estimates will be more accurate.

3. If the simulation fails, there will be one more field present in the response body: 'simulationError'. If this field is set and it is set to true, that means the Tenderly Simulation failed. The

```
{'gasUseEstimate':string, 'gasUseEstimateQuote':string, 'quoteGasAdjusted':string, and 'gasUseEstimateUSD':string}
```

fields will still be included, however they will be heuristics rather then Tenderly estimates. These heuristic values are not reliable for sending transactions on chain.

### Testing

#### Unit Tests

Unit tests are invoked by running `npm run test:unit` in the root directory. A 'watch' mode is also supported by running `npm run test:unit:watch`.

#### Integration Tests

Integration tests run against a local DynamoDB node deployed using [dynamodb-local](https://github.com/rynop/dynamodb-local). Note that JDK 8 is a dependency of this package. Invoke the integration tests by running `npm run test:integ` in the root directory.

#### End-to-end Tests

The end-to-end tests fetch quotes from your deployed API, then execute the swaps on a Hardhat mainnet fork.

1. First deploy your test API using the instructions above. Then update your `.env` file with the URL of the API, and the RPC URL of an archive node:

   ```
   UNISWAP_ROUTING_API='...'
   ARCHIVE_NODE_RPC='...'
   ```

2. Run the tests with:
   ```
   npm run test:e2e
   ```
