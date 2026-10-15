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
   TRACING = 'false' # X-Ray tracing. ONLY the exact string 'false' disables it; unset/anything else = ACTIVE (billed).
   METRICS_SAMPLE_RATE = '0.05' # EMF metrics sampling (0 to 1). 0.05 emits metrics for 5% of invocations, 1 for all.
   LOG_LEVEL = 'warn' # Lambda bunyan log level. Defaults to 'warn' when unset. 'info' restores verbose request logs.
   LAMBDA_INSIGHTS_ENABLED = '' # 'true' attaches the CloudWatch Lambda Insights layer to the routing lambdas (extra cost).
   ENABLE_CONTRIBUTOR_INSIGHTS = '' # 'true' enables the CloudWatch Contributor Insights rules (extra cost).
   # Optional vanity domain in front of the generated execute-api URL. Leave BOTH unset to
   # keep the plain execute-api URL. An API Gateway custom domain name is globally unique,
   # so only ONE deployment may claim a given name.
   API_DOMAIN_NAME = '' # e.g. routing-api.doma.xyz
   API_CERTIFICATE_ARN = '' # ACM cert ARN. MUST be in us-east-1 (the API is EDGE-optimized).
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

## Deploying via GitHub Actions

The deploy workflow ([.github/workflows/deploy-routing-api.yml](.github/workflows/deploy-routing-api.yml))
is triggered manually (`workflow_dispatch`) and always deploys to **us-east-1**.

Earlier revisions picked the region from the branch name (`main` → us-west-1, anything else →
us-east-2). That mapping is gone: every branch now deploys to the same stack, so triggering the
workflow on a feature branch updates production. Deploy from `main` unless you mean otherwise.

### Deploy configuration

Non-secret settings live in the workflow's `env:` block, where they are reviewable in a pull
request — there is no `DOTENV` secret any more:

```yaml
env:
  AWS_REGION: us-east-1
  ENVIRONMENT: mainnet            # suffixes the DynamoDB table names
  API_DOMAIN_NAME: routing-api.doma.xyz
  METRICS_SAMPLE_RATE: '0.05'
  ROUTING_LAMBDA_MEMORY_SIZE: '1024'
  TRACING: 'false'
  QUICKNODE_97476: https://rpc-testnet.doma.xyz
  QUICKNODE_97477: https://rpc.doma.xyz
```

This works because `bin/app.ts` calls `dotenv.config()`, which does **not** overwrite variables
already present in the environment. No `.env` file is created in the runner.

> Do not commit a local `.env` to replace this. It stays in `.gitignore`: this repository is
> **public**, and `.env` is where credentials land the moment anyone fills in
> `TENDERLY_ACCESS_KEY` or an RPC URL with an embedded API key.

### Required secrets

Set in **GitHub → Settings → Secrets and variables → Actions**. Only three are needed:

| Secret | Why it must stay secret |
|---|---|
| `AWS_ROLE_ARN` | IAM role CDK assumes (trusts GitHub OIDC). Embeds the AWS account id |
| `NODE_AUTH_TOKEN` | GitHub PAT with `read:packages` for the private `@d3-inc/*` SDKs |
| `SLACK_WEBHOOK` | (optional) Anyone with the URL can post to the channel |

`DOTENV`, `DOTENV_MAIN` and `DOTENV_OTHER` are no longer referenced and can be deleted.

The ACM certificate ARN is resolved at deploy time by domain name instead of being stored,
since the ARN embeds the account id. That step needs `acm:ListCertificates` on the deploy role;
if you would rather not grant it, delete the step and add an `API_CERTIFICATE_ARN` secret.

### One-time: bootstrap CDK in the target region

CDK needs an S3 assets bucket and IAM roles in a region before it can deploy there. Already done
for us-east-1 — only needed if you add a region:

```bash
export TARGET_REGION=us-east-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

npx aws-cdk@2.1128.1 bootstrap aws://${AWS_ACCOUNT_ID}/${TARGET_REGION}

aws cloudformation describe-stacks --stack-name CDKToolkit \
  --region $TARGET_REGION --query 'Stacks[0].StackStatus'
# expect: "CREATE_COMPLETE" or "UPDATE_COMPLETE"
```

### Trigger a deploy

```bash
# Trigger via GitHub CLI (every branch deploys to the same us-east-1 stack):
gh workflow run deploy-routing-api.yml --ref main

# Watch the run:
gh run watch $(gh run list --workflow=deploy-routing-api.yml --limit 1 --json databaseId --jq '.[0].databaseId')
```

Or go to **Actions → Deploy Uniswap Routing API → Run workflow** and select the branch.

### Verify the deploy

```bash
export TARGET_REGION=us-east-1

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

## Custom domain (`routing-api.doma.xyz`)

Optional. Leave `API_DOMAIN_NAME` and `API_CERTIFICATE_ARN` unset and the stack deploys exactly
as before, serving the generated `execute-api` URL. Set **both** to put a vanity host in front
of it.

Two constraints shape the steps:

- **The ACM certificate must live in `us-east-1`.** `RoutingAPIStack` sets no
  `endpointConfiguration`, so the API is EDGE-optimized (the CloudFormation default), and an
  EDGE custom domain only accepts a certificate from `us-east-1` — regardless of which region
  the stack is deployed to.
- **`doma.xyz` is hosted in Cloudflare, not Route 53.** CDK cannot write the ACM validation
  record, so the certificate is issued out of band and passed in by ARN. Issuing it in-stack
  would leave CloudFormation blocked on validation until someone added the record by hand.

> An API Gateway custom domain name is **globally unique across all AWS accounts**, so only one
> deployment may claim `routing-api.doma.xyz`. Set these two vars for that environment only and
> leave them unset everywhere else.

### Step 1 — Request the certificate in `us-east-1` (one-time)

```bash
CERT_ARN=$(aws acm request-certificate \
  --region us-east-1 \
  --domain-name routing-api.doma.xyz \
  --validation-method DNS \
  --query CertificateArn --output text)

echo "$CERT_ARN"
```

### Step 2 — Read the validation record

ACM DNS validation uses a **CNAME**, not a TXT record.

```bash
aws acm describe-certificate \
  --region us-east-1 \
  --certificate-arn "$CERT_ARN" \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
```

Output looks like:

```json
{
  "Name": "_abc123.routing-api.doma.xyz.",
  "Type": "CNAME",
  "Value": "_def456.xxxxxxxx.acm-validations.aws."
}
```

### Step 3 — Create that CNAME in Cloudflare

In the `doma.xyz` zone, add a **CNAME** record using the `Name` and `Value` above, set to
**DNS only (grey cloud)**. A proxied record breaks validation.

Cloudflare appends the zone automatically, so paste the `Name` without the trailing
`.doma.xyz.` — e.g. `_abc123.routing-api`.

Then wait for issuance (polls until `ISSUED`, exits non-zero on timeout):

```bash
aws acm wait certificate-validated --region us-east-1 --certificate-arn "$CERT_ARN"

aws acm describe-certificate --region us-east-1 --certificate-arn "$CERT_ARN" \
  --query 'Certificate.Status'
# expect: "ISSUED"
```

### Step 4 — Deploy with the domain configured

Add to `.env`:

```
API_DOMAIN_NAME=routing-api.doma.xyz
API_CERTIFICATE_ARN=<the CERT_ARN from Step 1>
```

Deploy as usual, then read the CloudFront hostname the stack outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name RoutingAPIStack \
  --region $TARGET_REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`CustomDomainTarget`].OutputValue' \
  --output text
# e.g. d1a2b3c4d5e6f7.cloudfront.net
# (EDGE domains resolve to a CloudFront hostname. A REGIONAL one would instead
#  look like d-abc123.execute-api.<region>.amazonaws.com.)
```

### Step 5 — Point the hostname at it in Cloudflare

Add a second **CNAME**: `routing-api` → the `CustomDomainTarget` value, again **DNS only
(grey cloud)**. Proxying would stack Cloudflare in front of CloudFront for no benefit and
interferes with the TLS handshake the EDGE domain expects.

### Step 6 — Verify

```bash
# Certificate chain and HTTP status
curl -s -o /dev/null -w 'http=%{http_code} tls_verify=%{ssl_verify_result}\n' \
  https://routing-api.doma.xyz/quote

# Real quote — note there is no /prod prefix: the base path maps to the deployed stage
curl -s "https://routing-api.doma.xyz/quote?\
tokenInAddress=<TOKEN_IN>&tokenInChainId=97476\
&tokenOutAddress=<TOKEN_OUT>&tokenOutChainId=97476\
&amount=1000000000000000000&type=exactIn" | jq '{quote: .quote, routeLen: (.route | length)}'
```

> On first creation, the CloudFront distribution behind an EDGE domain can take up to ~40
> minutes to propagate. A 403 right after deploying usually means "not ready yet", not
> "misconfigured".

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
