#!/usr/bin/env bash
# One-time setup of the S3 bucket and IAM user for audio generation (issue #109).
# Requires: aws CLI with admin credentials, jq. Safe to re-run.
#
#   scripts/setup-audio-s3.sh              # uses defaults below
#   BUCKET=my-bucket scripts/setup-audio-s3.sh
set -euo pipefail

BUCKET="${BUCKET:-translation-helper-audios}"
REGION="${REGION:-eu-central-1}"
IAM_USER="${IAM_USER:-translation-helper-audios}"
POLICY_NAME="${POLICY_NAME:-translation-helper-audios-writer}"
ORIGINS="${ORIGINS:-https://translator.ff0000.cz,https://translator-staging.ff0000.cz,http://localhost:3000}"

command -v aws >/dev/null || { echo "aws CLI not found" >&2; exit 1; }
command -v jq  >/dev/null || { echo "jq not found" >&2; exit 1; }

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
echo "Account $ACCOUNT, bucket $BUCKET, region $REGION"

# 1. Bucket (create if missing)
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "Bucket exists"
else
  echo "Creating bucket"
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
fi

# 2. ACLs off, versioning off
aws s3api put-bucket-ownership-controls --bucket "$BUCKET" \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
aws s3api put-bucket-versioning --bucket "$BUCKET" \
  --versioning-configuration Status=Suspended

# 3. Block public access: keep ACL blocks, allow public bucket policy
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false

# 4. Public read on objects only (no listing)
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "$(jq -n --arg b "$BUCKET" '{
  Version: "2012-10-17",
  Statement: [{
    Sid: "PublicReadAudio",
    Effect: "Allow",
    Principal: "*",
    Action: "s3:GetObject",
    Resource: "arn:aws:s3:::\($b)/*"
  }]
}')"

# 5. CORS for the app origins
aws s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration "$(jq -n --arg o "$ORIGINS" '{
  CORSRules: [{
    AllowedOrigins: ($o | split(",")),
    AllowedMethods: ["GET", "HEAD"],
    AllowedHeaders: ["*"],
    ExposeHeaders: ["Content-Length", "Content-Type"],
    MaxAgeSeconds: 3000
  }]
}')"

# 6. No lifecycle rules: PR links must never expire
aws s3api delete-bucket-lifecycle --bucket "$BUCKET" 2>/dev/null || true

# 7. IAM policy (write, no delete), create or update
POLICY_ARN="arn:aws:iam::$ACCOUNT:policy/$POLICY_NAME"
POLICY_DOC=$(jq -n --arg b "$BUCKET" '{
  Version: "2012-10-17",
  Statement: [
    {
      Sid: "WriteAudioObjects",
      Effect: "Allow",
      Action: ["s3:PutObject", "s3:GetObject", "s3:HeadObject", "s3:AbortMultipartUpload"],
      Resource: "arn:aws:s3:::\($b)/*"
    },
    {
      Sid: "ProbeBucket",
      Effect: "Allow",
      Action: ["s3:ListBucket", "s3:GetBucketLocation"],
      Resource: "arn:aws:s3:::\($b)"
    }
  ]
}')
if aws iam get-policy --policy-arn "$POLICY_ARN" >/dev/null 2>&1; then
  echo "Policy exists, updating"
  # IAM keeps max 5 versions; drop the oldest non-default if full
  for v in $(aws iam list-policy-versions --policy-arn "$POLICY_ARN" \
      --query 'Versions[?IsDefaultVersion==`false`].VersionId' --output text); do
    aws iam delete-policy-version --policy-arn "$POLICY_ARN" --version-id "$v"
  done
  aws iam create-policy-version --policy-arn "$POLICY_ARN" \
    --policy-document "$POLICY_DOC" --set-as-default >/dev/null
else
  echo "Creating policy"
  aws iam create-policy --policy-name "$POLICY_NAME" --policy-document "$POLICY_DOC" >/dev/null
fi

# 8. IAM user
if aws iam get-user --user-name "$IAM_USER" >/dev/null 2>&1; then
  echo "User exists"
else
  echo "Creating user"
  aws iam create-user --user-name "$IAM_USER" >/dev/null
fi
aws iam attach-user-policy --user-name "$IAM_USER" --policy-arn "$POLICY_ARN"

# 9. Access key (only if the user has none yet; keys can't be re-read later)
EXISTING=$(aws iam list-access-keys --user-name "$IAM_USER" --query 'AccessKeyMetadata[].AccessKeyId' --output text)
if [ -n "$EXISTING" ]; then
  echo
  echo "User already has access key(s): $EXISTING"
  echo "Secrets cannot be shown again. To rotate:"
  echo "  aws iam delete-access-key --user-name $IAM_USER --access-key-id <id>"
  echo "then re-run this script."
  exit 0
fi

KEY=$(aws iam create-access-key --user-name "$IAM_USER" --output json)

echo
echo "# Paste into .env.local and Coolify:"
echo "AUDIO_S3_ENDPOINT=https://s3.$REGION.amazonaws.com"
echo "AUDIO_S3_REGION=$REGION"
echo "AUDIO_S3_BUCKET=$BUCKET"
echo "AUDIO_S3_ACCESS_KEY_ID=$(jq -r .AccessKey.AccessKeyId <<<"$KEY")"
echo "AUDIO_S3_SECRET_ACCESS_KEY=$(jq -r .AccessKey.SecretAccessKey <<<"$KEY")"
echo "AUDIO_S3_PUBLIC_BASE_URL=https://$BUCKET.s3.$REGION.amazonaws.com"
