/**
 * Finds which Azure region a Speech key belongs to by trying the read-only
 * voices-list endpoint in each region. Prints the region and the endpoint
 * URL to use as AZURE_SPEECH_ENDPOINT.
 *
 *   pnpm tsx scripts/azure-find-region.ts   (reads AZURE_SPEECH_KEY from .env.local)
 */
try {
  process.loadEnvFile?.('.env.local');
} catch {
  // rely on the environment
}

const REGIONS = [
  'westeurope', 'northeurope', 'germanywestcentral', 'swedencentral', 'switzerlandnorth', 'switzerlandwest',
  'francecentral', 'uksouth', 'ukwest', 'norwayeast', 'polandcentral', 'italynorth', 'spaincentral',
  'eastus', 'eastus2', 'westus', 'westus2', 'westus3', 'centralus', 'northcentralus', 'southcentralus', 'westcentralus',
  'canadacentral', 'canadaeast', 'brazilsouth', 'australiaeast', 'southeastasia', 'eastasia', 'japaneast', 'japanwest',
  'koreacentral', 'centralindia', 'southafricanorth', 'uaenorth', 'qatarcentral',
];

const key = process.env.AZURE_SPEECH_KEY;
if (!key) {
  console.error('Set AZURE_SPEECH_KEY in .env.local');
  process.exit(1);
}

async function probe(region: string): Promise<boolean> {
  try {
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`, {
      headers: { 'Ocp-Apim-Subscription-Key': key! },
      signal: AbortSignal.timeout(8000),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

/** The issued token carries the pricing tier; batch synthesis needs S0, not F0. */
async function describeTier(region: string) {
  try {
    const res = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': key! },
    });
    const token = await res.text();
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()) as Record<string, string>;
    console.log(`tier: ${claims['product-id']}  resource: ${claims['azure-resource-id']?.split('/').pop()}`);
    if (claims['product-id']?.endsWith('.F0')) {
      console.log('Batch synthesis needs Standard S0. Change the pricing tier in the portal before running the probe.');
    }
  } catch {
    // tier is informational only
  }
}

async function main() {
  const results = await Promise.all(REGIONS.map(async (region) => ({ region, ok: await probe(region) })));
  const hits = results.filter((r) => r.ok).map((r) => r.region);

  if (hits.length === 0) {
    console.log('No region accepted the key. Check the key, or the resource may need its custom endpoint from the portal.');
    process.exit(2);
  }
  for (const region of hits) {
    console.log(`region: ${region}`);
    console.log(`AZURE_SPEECH_ENDPOINT=https://${region}.api.cognitive.microsoft.com`);
    await describeTier(region);
  }
}

main();
