import dotenv from 'dotenv';
dotenv.config();

/*
(async () => {
    const { OpenAI } = await import('langchain');
    const { PromptTemplate } = await import('langchain/prompts');
    const { LLMChain } = await import('langchain/chains');

    const model = new OpenAI({ temperature: 0.9 });
    const template = "What is a good name for a company that makes {product}?";
    const prompt = new PromptTemplate({
        template: template,
        inputVariables: ["product"],
    });

    const chain = new LLMChain({ llm: model, prompt: prompt });
    const res = await chain.call({ product: "colorful socks" });
    console.log(res);
})();
// */

// /*
(async () => {
    const { OpenAI } = await import('langchain');
    const { initializeAgentExecutor } = await import("langchain/agents");
    const { SerpAPI, Calculator } = await import("langchain/tools");

    const model = new OpenAI({ temperature: 0 });
    const tools = [new SerpAPI(), new Calculator()];

    const executor = await initializeAgentExecutor(
        tools,
        model,
        "zero-shot-react-description"
    );
    console.log("Loaded agent.");

    const input =
        "Who is Olivia Wilde's boyfriend?" +
        " How old will I be if I raise my current age to the 0.23rd power?";
    console.log(`Executing with input "${input}"...`);

    const result = await executor.call({ input });

    console.log(`Got output ${result.output}`);
})();
// */
