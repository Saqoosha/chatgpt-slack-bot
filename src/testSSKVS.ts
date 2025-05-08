#!/usr/bin/env ts-node
import dotenv from "dotenv";
dotenv.config();

import { getAllKeyValue, writeKeyValue } from "./sskvs";
import { logger } from "./logger";

async function main() {
    try {
        console.log("SSKVSのデータを確認します...");
        const data = await getAllKeyValue();
        console.log("SSKVSのデータ:", JSON.stringify(data, null, 2));
        
        console.log("\nテストデータをSSKVSに作成します...");
        await writeKeyValue('test-sskvs:test-channel', 'SSKVSからの移行テストデータ - ' + new Date().toISOString());
        console.log("テストデータを作成しました");
        
        console.log("\n再度SSKVSのデータを確認します...");
        const updatedData = await getAllKeyValue();
        console.log("SSKVSのデータ:", JSON.stringify(updatedData, null, 2));
        
        process.exit(0);
    } catch (error) {
        logger.error({ event: "test_sskvs_error", error }, "Error testing SSKVS");
        console.error("エラーが発生しました:", error);
        process.exit(1);
    }
}

main();
