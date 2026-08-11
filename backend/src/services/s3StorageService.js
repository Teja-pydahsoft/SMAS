import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import path from 'path';

const AWS_REGION = (process.env.AWS_REGION || 'ap-south-1').trim();
const S3_BUCKET = (process.env.S3_BUCKET || '').trim();
const AWS_ACCESS_KEY_ID = (process.env.AWS_ACCESS_KEY_ID || '').trim();
const AWS_SECRET_ACCESS_KEY = (process.env.AWS_SECRET_ACCESS_KEY || '').trim();

console.log('--- AWS Config Check ---');
console.log(`AWS_REGION: ${AWS_REGION}`);
console.log(`S3_BUCKET: ${S3_BUCKET}`);
console.log(`AWS_ACCESS_KEY_ID exists: ${!!AWS_ACCESS_KEY_ID}`);
console.log(`AWS_SECRET_ACCESS_KEY exists: ${!!AWS_SECRET_ACCESS_KEY}`);

let s3Client = null;

function getClient() {
  if (!s3Client) {
    const config = { region: AWS_REGION };
    if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
      config.credentials = {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      };
    }
    s3Client = new S3Client(config);
  }
  return s3Client;
}

export function isS3Enabled() {
  return Boolean(S3_BUCKET && AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY);
}

export function getS3Bucket() {
  return S3_BUCKET;
}

export function getS3Region() {
  return AWS_REGION;
}

function formatAwsError(err) {
  const status = err?.$metadata?.httpStatusCode;
  const code = err?.Code || err?.code || err?.name || 'UnknownError';
  const message = err?.message || String(err);
  return { status, code, message };
}

async function verifyS3Connection() {
  const client = getClient();
  // ListObjects gives a clear AccessDenied message; HeadBucket often returns
  // a useless "UnknownError" on 403.
  await client.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, MaxKeys: 1 }));
  console.log('✓ S3 connected — bucket:', S3_BUCKET, `(${AWS_REGION})`);
}

if (isS3Enabled()) {
  verifyS3Connection().catch((err) => {
    const { status, code, message } = formatAwsError(err);
    console.error(`✗ S3 credential/bucket check FAILED: ${code}${status ? ` (${status})` : ''}`);
    console.error(`  ${message}`);
    if (code === 'AccessDenied' || status === 403) {
      console.error(
        '  Fix in AWS IAM: attach a policy to this user allowing s3:ListBucket on\n' +
          `  arn:aws:s3:::${S3_BUCKET} and s3:PutObject/GetObject/DeleteObject on\n` +
          `  arn:aws:s3:::${S3_BUCKET}/*`
      );
    } else if (code === 'NoSuchBucket' || status === 404) {
      console.error(`  Fix: create bucket "${S3_BUCKET}" in region ${AWS_REGION}, or fix S3_BUCKET`);
    } else {
      console.error(
        '  Fix: verify AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, and S3_BUCKET in .env'
      );
    }
  });
}

/**
 * Build the canonical object URL stored in Mongo (not necessarily publicly readable).
 */
export function buildS3ObjectUrl(key) {
  return `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`;
}

export function isS3Url(url) {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  return (
    url.includes('.amazonaws.com/') ||
    (Boolean(S3_BUCKET) && url.includes(`${S3_BUCKET}.s3`))
  );
}

/**
 * Extract object key from a stored S3 URL.
 */
export function extractS3Key(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    let key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));

    // Path-style: s3.region.amazonaws.com/bucket/key
    if (host.startsWith('s3.') || host === 's3.amazonaws.com') {
      if (S3_BUCKET && key.startsWith(`${S3_BUCKET}/`)) {
        key = key.slice(S3_BUCKET.length + 1);
      } else {
        const slash = key.indexOf('/');
        if (slash > 0) key = key.slice(slash + 1);
      }
    }

    return key || null;
  } catch {
    return null;
  }
}

function sanitizeFilename(filename) {
  const base = path.basename(String(filename || 'file')).replace(/[^\w.\-]+/g, '_');
  return base || `file-${Date.now()}`;
}

/**
 * Upload a buffer to S3 under smas/{folder}/...
 * @returns {Promise<{url: string, key: string, resourceType: string}>}
 */
export async function uploadToS3(buffer, folder, filename = null, contentType = 'application/octet-stream') {
  if (!isS3Enabled()) {
    throw new Error('S3 is not configured');
  }

  const safeName = sanitizeFilename(filename || `upload-${Date.now()}`);
  const key = `smas/${folder}/${safeName}`;

  console.log(`--- S3 Upload Start: ${folder} ---`);
  console.log(`Bucket: ${S3_BUCKET}`);
  console.log(`Key: ${key}`);
  console.log(`Mime: ${contentType}`);
  console.log(`Size: ${buffer ? buffer.length : 'unknown'} bytes`);

  try {
    const response = await getClient().send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType || 'application/octet-stream',
      })
    );

    const resourceType = String(contentType || '').startsWith('image/')
      ? 'image'
      : String(contentType || '').startsWith('video/')
        ? 'video'
        : 'raw';

    const url = buildS3ObjectUrl(key);
    console.log(`✓ Uploaded ${folder}: ${key}`);
    console.log(`Returned URL: ${url}`);
    console.log(`ETag: ${response.ETag}`);

    return {
      url,
      key,
      publicId: key,
      resourceType,
    };
  } catch (error) {
    console.error(`✗ S3 Upload Failed for ${folder}:`, error.stack);
    throw error;
  }
}

export async function deleteFromS3(keyOrUrl) {
  if (!isS3Enabled() || !keyOrUrl) return;

  const key = isS3Url(keyOrUrl) ? extractS3Key(keyOrUrl) : keyOrUrl;
  if (!key) return;

  try {
    await getClient().send(
      new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
      })
    );
  } catch (err) {
    console.error('Failed to delete from S3:', err.message);
  }
}

/**
 * Stream an S3 object for the private-bucket proxy.
 */
export async function getS3Object(key) {
  if (!isS3Enabled()) {
    throw new Error('S3 is not configured');
  }
  return getClient().send(
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    })
  );
}
