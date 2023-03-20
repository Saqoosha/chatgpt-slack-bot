async function writeKeyValue(key: string, value: string): Promise<string> {
    const response = await fetch(`${process.env.SSKVS_API_URL!}?action=write&key=${encodeURIComponent(key)}&value=${encodeURIComponent(value)}`);
    const result = await response.json();
    console.log(result);

    if (result.error) {
        throw new Error(result.error.message);
    }

    return result.value;
}

async function readKeyValue(key: string): Promise<string> {
    console.log(`${process.env.SSKVS_API_URL!}?action=read&key=${encodeURIComponent(key)}`);
    const response = await fetch(`${process.env.SSKVS_API_URL!}?action=read&key=${encodeURIComponent(key)}`);
    const result = await response.json();
    console.log(result);

    // if (result.error) {
    //     throw new Error(result.error.message);
    // }

    return result.value || '';
}

export { writeKeyValue, readKeyValue };
