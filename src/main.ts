import { posix } from "path";
import { PassThrough } from "stream";
import { getInput, getMultilineInput, setFailed } from "@actions/core";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { create } from "tar";
import globby from "globby";

async function main() {
    try {
        const bucket = getInput("bucket", { required: true });
        const path = getMultilineInput("path", { required: true });
        const name = getInput("name", { required: true });
        const prefix = getInput("prefix");

        const aggregatedPaths = (await Promise.all(path.map((path) => {
            return globby(path, { onlyFiles: false, markDirectories: true });
        }))).flat();

        // Filter out directories that are common prefixes.
        const files = Array.from(new Set(aggregatedPaths))
            .filter((a, i, arr) => {
                return a.at(-1) !== "/" || !arr.some((b, j) => i !== j && b.startsWith(a) && b.length > a.length)
            });

        const key = posix.join(prefix, name + ".tgz");
        const stream = create({ gzip: true }, files).pipe(new PassThrough());

        console.info("Uploading...");

        const upload = new Upload({
            client: new S3Client({}),
            params: {
                Bucket: bucket,
                Key: key,
                Body: stream,
            },
        });

        upload.on("httpUploadProgress", (progress) => {
            console.log("progress.part", progress.part);
            console.log("progress.loaded:", progress.loaded, "progress.total:", progress.total);
        });

        await upload.done();

        console.info("Upload complete.")
    } catch (err) {
        console.info("Upload failed.")
        if (err instanceof Error) setFailed(err);
    }
}

main();
