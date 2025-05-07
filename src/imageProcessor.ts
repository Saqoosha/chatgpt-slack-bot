import axios from "axios"; // Using axios instead of node-fetch
// import * as Jimp from "jimp"; // Remove Jimp
import photon from "@silvia-odwyer/photon-node"; // Add Photon
import { logger } from "./logger"; // Assuming logger is in the same directory or adjust path
import type { SlackFile } from "./types"; // Assuming types.ts is in the same directory or adjust path

const MAX_IMAGE_DIMENSION = 2048; // Max dimension for OpenAI Vision (long edge)
// const MIN_IMAGE_DIMENSION_SHORT_EDGE = 768; // Recommended min dimension for short edge if resizing - jimpでは直接制御しづらいので一旦コメントアウト

// Define a custom error class for download errors
export class DownloadError extends Error {
    details: {
        url?: string;
        errorMessage: string;
        status?: number;
        dataPreview?: string;
        data?: unknown;
        headers?: unknown;
        stack?: string;
    };

    constructor(message: string, details: DownloadError["details"]) {
        super(message);
        this.name = "DownloadError";
        this.details = details;
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, DownloadError.prototype);
    }
}

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
            let preview = "(binary data or too large to preview)";
            if (response.data instanceof ArrayBuffer && response.data.byteLength > 0) {
                // Attempt to get a UTF-8 string preview, limit to 1KB
                try {
                    preview = Buffer.from(response.data.slice(0, Math.min(response.data.byteLength, 1024))).toString("utf-8");
                } catch (e) {
                    preview = "(failed to decode as UTF-8)";
                }
            }
            logger.warn(
                {
                    event: "image_download_unexpected_content_type",
                    url,
                    contentType: contentType || "(unknown)", // Ensure contentType is logged
                    dataPreview: preview, // Log the preview data
                },
                "Downloaded content type is not an image.",
            );
            // No longer logging image_download_html_content_preview_success separately
            // as the preview is now part of image_download_unexpected_content_type
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
            errorDetails.url = url; // Ensure URL is part of error details

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
                    url, // Ensure URL is logged
                    status: error.response.status,
                    dataPreview: errorDetails.dataPreview,
                    errorMessage: errorDetails.errorMessage, // Log the composed error message
                },
                errorDetails.errorMessage,
            );
        } else if (error instanceof Error) {
            errorDetails.errorMessage = error.message;
            errorDetails.stack = error.stack;
            errorDetails.url = url; // Ensure URL is part of error details
            logger.error(
                { event: "image_download_exception", url, error: error.message, stack: error.stack, details: errorDetails },
                "Exception during image download",
            );
        } else {
            errorDetails.url = url; // Ensure URL is part of error details
            logger.error({ event: "image_download_unknown_exception", url, error, details: errorDetails }, "Unknown exception during image download");
        }
        throw new DownloadError(`Download failed for ${url}: ${errorDetails.errorMessage}`, errorDetails);
    }
}

/**
 * Resizes an image buffer using Photon.
 * It aims to keep the image within MAX_IMAGE_DIMENSION on its longest side.
 * Also logs the duration of the resize operation.
 * @param imageBuffer The buffer containing the image data.
 * @param originalMimeType The original MIME type of the image (e.g., "image/jpeg", "image/png").
 * @returns A Promise that resolves to an object containing the resized image buffer and its MIME type.
 */
export async function resizeImage(imageBuffer: Buffer, originalMimeType: string): Promise<{ resizedBuffer: Buffer; mimeType: string }> {
    const startTime = performance.now();
    logger.debug(
        { event: "image_resize_photon_start", originalSize: imageBuffer.length, mimeType: originalMimeType },
        "Attempting to resize image with Photon",
    );
    try {
        let pImage = photon.PhotonImage.new_from_byteslice(imageBuffer);
        const currentWidth = pImage.get_width();
        const currentHeight = pImage.get_height();

        let newWidth = currentWidth;
        let newHeight = currentHeight;

        const isWidthLonger = currentWidth > currentHeight;
        const longEdge = isWidthLonger ? currentWidth : currentHeight;

        if (longEdge > MAX_IMAGE_DIMENSION) {
            if (isWidthLonger) {
                newWidth = MAX_IMAGE_DIMENSION;
                newHeight = Math.round((currentHeight * MAX_IMAGE_DIMENSION) / currentWidth); // Maintain aspect ratio
            } else {
                newHeight = MAX_IMAGE_DIMENSION;
                newWidth = Math.round((currentWidth * MAX_IMAGE_DIMENSION) / currentHeight); // Maintain aspect ratio
            }
            // Photon resize might not return a new PhotonImage, but modify in place or need specific handling.
            // Assuming resize modifies pImage or returns a new one that should be reassigned.
            // The resize function in photon-node is a global function, not a method of PhotonImage.
            const resizedPhotonImage = photon.resize(pImage, newWidth, newHeight, photon.SamplingFilter.CatmullRom);
            pImage = resizedPhotonImage; // Ensure pImage refers to the resized image for get_bytes_...

            let outputBufferBytes: Uint8Array;
            if (originalMimeType.includes("jpeg") || originalMimeType.includes("jpg")) {
                outputBufferBytes = pImage.get_bytes_jpeg(90); // Quality 0-100
            } else if (originalMimeType.includes("png")) {
                outputBufferBytes = pImage.get_bytes();
            } else {
                // Fallback or error for unsupported types for Photon output
                logger.warn(
                    { event: "image_resize_photon_unsupported_output", mimeType: originalMimeType },
                    "Unsupported MIME type for Photon output, attempting JPEG.",
                );
                outputBufferBytes = pImage.get_bytes_jpeg(90); // Default to JPEG if unsure
            }
            const resizedBuffer = Buffer.from(outputBufferBytes);

            const endTime = performance.now();
            const duration = endTime - startTime;
            logger.info(
                {
                    event: "image_resize_photon_success",
                    originalSize: imageBuffer.length,
                    newSize: resizedBuffer.length,
                    originalDimensions: { width: currentWidth, height: currentHeight },
                    newDimensions: { width: pImage.get_width(), height: pImage.get_height() },
                    duration: `${duration.toFixed(1)}ms`,
                    mimeType: originalMimeType,
                },
                "Image resized successfully with Photon",
            );
            // If we defaulted to JPEG, the mimeType should reflect that.
            const finalMimeType =
                originalMimeType.includes("jpeg") || originalMimeType.includes("jpg") || originalMimeType.includes("png")
                    ? originalMimeType
                    : "image/jpeg";
            return { resizedBuffer, mimeType: finalMimeType };
        }
        // No resize needed
        const endTime = performance.now();
        const duration = endTime - startTime;
        logger.info(
            {
                event: "image_resize_photon_skipped",
                originalSize: imageBuffer.length,
                dimensions: { width: currentWidth, height: currentHeight },
                duration: `${duration.toFixed(1)}ms`,
                mimeType: originalMimeType,
            },
            "Image resizing skipped (already within limits) with Photon",
        );
        return { resizedBuffer: imageBuffer, mimeType: originalMimeType };
    } catch (error) {
        const endTime = performance.now();
        const duration = endTime - startTime;
        let errorMessage = "Unknown error during image resize with Photon";
        let errorStack: string | undefined;
        if (error instanceof Error) {
            errorMessage = error.message;
            errorStack = error.stack;
        }
        logger.error({
            event: "image_resize_photon_exception",
            errorMessage: errorMessage,
            details: {
                message: "Exception during image resize with Photon",
                originalSize: imageBuffer.length,
                stack: errorStack,
                mimeType: originalMimeType,
            },
            duration: `${duration.toFixed(1)}ms`,
        });
        throw error; // Re-throw the error to be caught by the caller
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
        const originalMimeType = slackFile.mimetype; // Store original mimetype

        // Resize image
        const { resizedBuffer, mimeType: finalMimeType } = await resizeImage(imageBuffer, originalMimeType);
        imageBuffer = resizedBuffer; // Update imageBuffer with the resized one

        const dataUrl = encodeImageToBase64(imageBuffer, finalMimeType); // Use the mimeType from resizeImage result
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
