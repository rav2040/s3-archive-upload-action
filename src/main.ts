import { posix } from "path";
import { PassThrough } from "stream";
import { getBooleanInput, getInput, getMultilineInput, setFailed } from "@actions/core";
import { S3Client, GetObjectAttributesCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { create } from "tar";
import globby from "globby";

async function main() {
    try {
        const bucket = getInput("bucket", { required: true });
        const name = getInput("name", { required: true });
        const path = getMultilineInput("path", { required: true });
        const prefix = getInput("prefix");
        const gzip = getBooleanInput("gzip");

        const paths = await globby(path, { onlyFiles: false, markDirectories: true });

        // Filter out directories that are common prefixes.
        const files = paths.filter((a, i, arr) => {
            return a.at(-1) !== "/" || !arr.some((b, j) => i !== j && b.startsWith(a) && b.length > a.length)
        });

        const stream = create({ gzip }, files).pipe(new PassThrough());

        console.info("Uploading...");

        const interval = setInterval(() => console.info("Still uploading..."), 5000);

        const s3 = new S3Client({});
        const key = posix.join(prefix, name);

        const upload = new Upload({
            client: s3,
            params: {
                Bucket: bucket,
                Key: key,
                Body: stream,
            },
        });

        await upload.done();

        const { ObjectSize: objectSize } = await s3.send(new GetObjectAttributesCommand({
            Bucket: bucket,
            Key: key,
            ObjectAttributes: ["ObjectSize"],
        }))

        clearInterval(interval);
        console.info("Upload complete.");

        if (objectSize) {
            console.info("Size of uploaded archive:", Math.round(objectSize / 1_000_000), "MB");
        }
    } catch (err) {
        console.info("Upload failed.")
        if (err instanceof Error) setFailed(err);
    }
}

main();
