// api/upload-s3.js — Upload PDFs to S3, return pre-signed URLs

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET, AWS_REGION } = process.env;

  if (!AWS_ACCESS_KEY_ID || AWS_ACCESS_KEY_ID === '...') {
    return res.status(503).json({
      error: 'Backend not configured',
      message: 'AWS S3 is not set up yet.',
    });
  }

  try {
    const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

    const s3 = new S3Client({
      region: AWS_REGION || 'us-west-2',
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    });

    const { orderId, fileName, fileBuffer, contentType = 'application/pdf' } = req.body;

    if (!orderId || !fileName || !fileBuffer) {
      return res.status(400).json({ error: 'orderId, fileName, and fileBuffer are required' });
    }

    const key = `orders/${orderId}/${fileName}`;

    // Upload
    await s3.send(new PutObjectCommand({
      Bucket: AWS_S3_BUCKET,
      Key: key,
      Body: Buffer.from(fileBuffer, 'base64'),
      ContentType: contentType,
    }));

    // Generate 7-day pre-signed URL
    const signedUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: AWS_S3_BUCKET, Key: key }),
      { expiresIn: 7 * 24 * 60 * 60 }
    );

    return res.status(200).json({ key, url: signedUrl });
  } catch (err) {
    console.error('S3 upload error:', err);
    return res.status(500).json({ error: err.message });
  }
}
