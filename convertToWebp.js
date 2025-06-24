require("dotenv").config();
const AWS = require("aws-sdk");
const sharp = require("sharp");

const s3 = new AWS.S3({ region: process.env.AWS_S3_REGION });
const BUCKET = process.env.AWS_S3_BUCKET_NAME;

async function listAllKeys(prefix = "") {
  let keys = [];
  let ContinuationToken;

  do {
    const resp = await s3
      .listObjectsV2({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken,
      })
      .promise();

    keys = keys.concat(resp.Contents.map((item) => item.Key));
    ContinuationToken = resp.IsTruncated ? resp.NextContinuationToken : null;
  } while (ContinuationToken);

  return keys;
}

async function convertAndUpload(key) {
  if (key.endsWith(".webp")) return; // 이미 webp면 스킵

  try {
    const s3Obj = await s3.getObject({ Bucket: BUCKET, Key: key }).promise();

    const webpBuffer = await sharp(s3Obj.Body)
      .rotate()
      .resize(800) // 원하는 너비로 조정
      .webp({ quality: 80 })
      .toBuffer();

    const newKey = key
      .replace(/^images\//, "webp/")
      .replace(/\.[^.]+$/, ".webp");

    await s3
      .putObject({
        Bucket: BUCKET,
        Key: newKey,
        Body: webpBuffer,
        ContentType: "image/webp",
        ACL: "public-read", // 공개 설정 필요시
      })
      .promise();

    console.log("Converted and uploaded: ", newKey);
  } catch (e) {
    console.error(`Failed for ${key}: `, e.message);
  }
}

(async () => {
  const keys = await listAllKeys("images/"); // 원본 이미지 폴더
  for (const key of keys) {
    await convertAndUpload(key);
  }
  console.log("All done!");
})();
