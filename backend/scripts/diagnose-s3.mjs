import 'dotenv/config';
import {
  S3Client,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

const region = (process.env.AWS_REGION || '').trim();
const bucket = (process.env.S3_BUCKET || '').trim();
const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || '').trim();
const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || '').trim();

console.log('region:', region);
console.log('bucket:', bucket);
console.log('accessKeyId length:', accessKeyId.length, 'prefix:', `${accessKeyId.slice(0, 4)}...`);
console.log('secret length:', secretAccessKey.length);

const client = new S3Client({
  region,
  credentials: { accessKeyId, secretAccessKey },
});

function dump(label, err) {
  console.log('---', label, '---');
  console.log('name:', err.name);
  console.log('message:', err.message);
  console.log('code:', err.Code || err.code);
  console.log('status:', err.$metadata?.httpStatusCode);
  console.log('requestId:', err.$metadata?.requestId);
  console.log('extended:', err.$metadata?.extendedRequestId);
}

try {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log('HeadBucket: OK');
} catch (err) {
  dump('HeadBucket', err);
}

try {
  const r = await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
  console.log('ListObjectsV2: OK, count=', r.KeyCount);
} catch (err) {
  dump('ListObjectsV2', err);
}

const key = 'smas/_healthcheck.txt';
try {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: 'ok',
      ContentType: 'text/plain',
    })
  );
  console.log('PutObject: OK');
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  console.log('DeleteObject: OK');
} catch (err) {
  dump('Put/Delete', err);
}
