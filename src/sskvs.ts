interface KeyValue {
    key: string;
    value: string;
}

async function writeKeyValue(key: string, value: string): Promise<string> {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${process.env.SSKVS_API_URL!}?action=write&key=${encodeURIComponent(key)}&value=${encodeURIComponent(value)}`);
    const result: any = await response.json();
    console.log(result);

    if (result.error) {
        throw new Error(result.error.message);
    }

    return result.value;
}

async function readKeyValue(key: string): Promise<string> {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${process.env.SSKVS_API_URL!}?action=read&key=${encodeURIComponent(key)}`);
    const result: any = await response.json();
    console.log("readKeyValue:", result);

    return result.value || '';
}

async function getAllKeyValue(): Promise<KeyValue[]> {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${process.env.SSKVS_API_URL!}?action=getAll`);
    const result: any = await response.json();
    // console.log(result);

    if (result.error) {
        throw new Error(result.error.message);
    }

    return result;
}

export { writeKeyValue, readKeyValue, getAllKeyValue };
