import axios from "axios"; // Using axios instead of node-fetch
import sharp from "sharp";
import { logger } from "./logger"; // Assuming logger is in the same directory or adjust path
import type { SlackFile } from "./types"; // Assuming types.ts is in the same directory or adjust path

const MAX_IMAGE_DIMENSION = 2048; // Max dimension for OpenAI Vision (long edge)
const MIN_IMAGE_DIMENSION_SHORT_EDGE = 768; // Recommended min dimension for short edge if resizing

/**
 * Downloads an image from a given URL using a Slack bot token for authorization.
 * Uses axios for HTTP requests.
 * @param url The URL of the image to download.
 * @param token The Slack bot token.
 * @returns A Promise that resolves to a Buffer containing the image data.
 */
export async function downloadImage(url: string, token: string): Promise<Buffer> {
    logger.debug({ event: "image_download_start", url }, "Attempting to download image");
    try {
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
            responseType: "arraybuffer", // Crucial for getting binary data with axios
        });

        const contentType = response.headers["content-type"];
        if (contentType && !contentType.startsWith("image/")) {
            logger.warn(
                { event: "image_download_unexpected_content_type", url, contentType },
                "Downloaded content type is not an image. Logging beginning of response.",
            );
            if (response.data instanceof ArrayBuffer && response.data.byteLength > 0) {
                const firstKiloByte = Buffer.from(response.data.slice(0, Math.min(response.data.byteLength, 1024))).toString("utf-8");
                logger.warn({ event: "image_download_html_content_preview_success", dataPreview: firstKiloByte });
            }
        }

        logger.info({ event: "image_download_success", url, size: response.data.byteLength }, "Image downloaded successfully");
        return Buffer.from(response.data);
    } catch (error: unknown) {
        const errorDetails: {
            url: string;
            errorMessage: string;
            status?: number;
            dataPreview?: string;
            data?: unknown;
            headers?: unknown;
            stack?: string;
        } = {
            url,
            errorMessage: "Unknown error during image download",
        };
        if (axios.isAxiosError(error) && error.response) {
            errorDetails.errorMessage = `Failed to download image: ${error.response.status} ${error.response.statusText}`;
            errorDetails.status = error.response.status;

            if (error.response.data) {
                let preview = "";
                if (error.response.data instanceof ArrayBuffer) {
                    preview = Buffer.from(error.response.data.slice(0, Math.min(error.response.data.byteLength, 1024))).toString("utf-8");
                } else if (typeof error.response.data === "string") {
                    preview = error.response.data.substring(0, 1024);
                } else {
                    try {
                        preview = JSON.stringify(error.response.data).substring(0, 1024);
                    } catch {
                        preview = "Could not stringify error.response.data";
                    }
                }
                errorDetails.dataPreview = preview;
            }
            errorDetails.data = error.response.data;
            errorDetails.headers = error.response.headers;

            logger.error(
                {
                    event: "image_download_failed_axios",
                    url,
                    status: error.response.status,
                    dataPreview: errorDetails.dataPreview,
                },
                errorDetails.errorMessage,
            );
        } else if (error instanceof Error) {
            errorDetails.errorMessage = error.message;
            errorDetails.stack = error.stack;
            logger.error({ event: "image_download_exception", url, error: error.message, stack: error.stack }, "Exception during image download");
        } else {
            logger.error({ event: "image_download_unknown_exception", url, error }, "Unknown exception during image download");
        }
        throw new Error(errorDetails.errorMessage);
    }
}

/**
 * Resizes an image buffer using sharp.
 * It aims to keep the image within MAX_IMAGE_DIMENSION on its longest side,
 * and tries to ensure the shorter side is at least MIN_IMAGE_DIMENSION_SHORT_EDGE if aspect ratio allows.
 * @param imageBuffer The buffer containing the image data.
 * @returns A Promise that resolves to a Buffer of the resized image.
 */
export async function resizeImage(imageBuffer: Buffer): Promise<Buffer> {
    logger.debug({ event: "image_resize_start", originalSize: imageBuffer.length }, "Attempting to resize image");
    try {
        const image = sharp(imageBuffer);
        const metadata = await image.metadata();

        const resizeOptions: sharp.ResizeOptions = {}; // Changed to const

        if (metadata.width && metadata.height) {
            const isWidthLonger = metadata.width > metadata.height;
            const longEdge = isWidthLonger ? metadata.width : metadata.height;
            const shortEdge = isWidthLonger ? metadata.height : metadata.width;

            if (longEdge > MAX_IMAGE_DIMENSION) {
                if (isWidthLonger) {
                    resizeOptions.width = MAX_IMAGE_DIMENSION;
                } else {
                    resizeOptions.height = MAX_IMAGE_DIMENSION;
                }
                // After constraining the long edge, check if the short edge needs to be upscaled (if it's too small)
                // This part might be complex if we strictly adhere to MIN_IMAGE_DIMENSION_SHORT_EDGE
                // For now, just cap the max dimension.
            }
        }

        // If no resize options were set (image is smaller than MAX_IMAGE_DIMENSION)
        // or to apply the determined resize options
        if (Object.keys(resizeOptions).length > 0) {
            const resizedBuffer = await image.resize(resizeOptions).toBuffer();
            logger.info(
                { event: "image_resize_success", originalSize: imageBuffer.length, newSize: resizedBuffer.length, options: resizeOptions },
                "Image resized successfully",
            );
            return resizedBuffer;
        }
        logger.info({ event: "image_resize_skipped", originalSize: imageBuffer.length }, "Image resizing skipped (already within limits)");
        return imageBuffer; // Return original buffer if no resize needed
    } catch (error) {
        let errorMessage = "Unknown error during image resize";
        let errorStack: string | undefined;
        if (error instanceof Error) {
            errorMessage = error.message;
            errorStack = error.stack;
        }
        logger.error({
            event: "image_resize_exception",
            errorMessage: errorMessage,
            details: {
                message: "Exception during image resize",
                originalSize: imageBuffer.length,
                stack: errorStack,
            },
        });
        throw error;
    }
}

/**
 * Encodes an image buffer to a Base64 Data URL.
 * @param imageBuffer The buffer containing the image data.
 * @param mimeType The MIME type of the image (e.g., "image/png", "image/jpeg").
 * @returns The Base64 encoded Data URL string.
 */
export function encodeImageToBase64(imageBuffer: Buffer, mimeType: string): string {
    if (!mimeType.startsWith("image/")) {
        logger.warn(
            { event: "base64_encode_invalid_mimetype", mimeType },
            "Attempting to Base64 encode non-image type, proceeding but may cause issues.",
        );
    }
    const base64String = imageBuffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64String}`;
    logger.debug(
        { event: "image_base64_encoded", mimeType, originalSize: imageBuffer.length, dataUrlLength: dataUrl.length },
        "Image encoded to Base64 Data URL",
    );
    return dataUrl;
}

/**
 * Processes a SlackFile object: downloads, (optionally) resizes, and Base64 encodes an image.
 * @param slackFile The SlackFile object containing file metadata.
 * @param slackBotToken The Slack bot token for downloading.
 * @returns A Promise resolving to the Base64 encoded Data URL string, or null if processing fails or not an image.
 */
export async function processImageForOpenAI(slackFile: SlackFile, slackBotToken: string): Promise<string | null> {
    if (!slackFile.url_private_download || !slackFile.mimetype?.startsWith("image/")) {
        logger.info(
            { event: "process_image_skipped_not_image", fileId: slackFile.id, mimeType: slackFile.mimetype },
            "Skipping file processing, not a downloadable image or not an image mimetype.",
        );
        return null;
    }

    try {
        logger.info({ event: "process_image_start", fileId: slackFile.id, fileName: slackFile.name }, "Starting image processing for OpenAI");
        let imageBuffer = await downloadImage(slackFile.url_private_download, slackBotToken);

        imageBuffer = await resizeImage(imageBuffer);

        const dataUrl = encodeImageToBase64(imageBuffer, slackFile.mimetype);
        logger.info(
            { event: "process_image_success", fileId: slackFile.id, dataUrlLength: dataUrl.length },
            "Image processed successfully for OpenAI",
        );
        return dataUrl;
    } catch (error) {
        logger.error({ event: "process_image_failed", fileId: slackFile.id, fileName: slackFile.name, error }, "Failed to process image for OpenAI");
        return null; // Return null or rethrow, depending on desired error handling
    }
}
