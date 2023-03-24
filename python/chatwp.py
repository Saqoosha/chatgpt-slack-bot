import sys
import fire
import logging

import os

if os.environ.get("OPENAI_API_KEY") == "":
    print("`OPENAI_API_KEY` is not set", file=sys.stderr)
    sys.exit(1)

url = os.environ.get("WORDPRESS_URL")
username = os.environ.get("WORDPRESS_USERNAME")
password = os.environ.get("WORDPRESS_PASSWORD")

from llama_index import GPTSimpleVectorIndex, download_loader
from llama_index.langchain_helpers.chatgpt import ChatGPTLLMPredictor
from llama_index.indices.prompt_helper import PromptHelper
from llama_index import LangchainEmbedding
from langchain.embeddings import HuggingFaceEmbeddings
from llama_index import GPTSimpleVectorIndex, LLMPredictor
from langchain.llms import OpenAI

prompt = """
Answer the question below based on the blog's content as if you were the author.

Question: {question}

Answer to the question in the same language as the question.
"""


def run(make_index=False, query=False, verbose=False):
    if verbose:
        logging.basicConfig(stream=sys.stdout, level=logging.DEBUG, force=True)
    else:
        logging.basicConfig(stream=sys.stdout, level=logging.WARNING, force=True)

    if make_index:
        do_make_index()
    elif query != False:
        do_query(query)
    else:
        do_chat()


def load_index():
    llm_predictor = LLMPredictor(
        llm=OpenAI(temperature=0, max_tokens=1024, model_name="gpt-3.5-turbo")
    )
    # llm_predictor = ChatGPTLLMPredictor()
    return GPTSimpleVectorIndex.load_from_disk(
        "data/wordpress.json",
        llm_predictor=llm_predictor,
        # prompt_helper=PromptHelper(
        #     max_input_size=4000,  # LLM入力の最大トークン数
        #     num_output=256,  # LLM出力のトークン数
        #     chunk_size_limit=500,  # チャンクのトークン数
        #     max_chunk_overlap=0,  # チャンクオーバーラップの最大トークン数
        #     separator="。",  # セパレータ
        # ),
        # embed_model=LangchainEmbedding(
        #     HuggingFaceEmbeddings(
        #         model_name="oshizo/sbert-jsnli-luke-japanese-base-lite"
        #     )
        # ),
    )


def do_make_index():
    WordpressReader = download_loader("WordpressReader")

    loader = WordpressReader(url=url, username=username, password=password)
    documents = loader.load_data()

    index = GPTSimpleVectorIndex(documents, llm_predictor=ChatGPTLLMPredictor())
    # index = GPTSimpleVectorIndex(
    #     documents,
    #     prompt_helper=PromptHelper(
    #         max_input_size=4000,  # LLM入力の最大トークン数
    #         num_output=256,  # LLM出力のトークン数
    #         chunk_size_limit=500,  # チャンクのトークン数
    #         max_chunk_overlap=0,  # チャンクオーバーラップの最大トークン数
    #         separator="。",  # セパレータ
    #     ),
    #     embed_model=LangchainEmbedding(
    #         HuggingFaceEmbeddings(
    #             model_name="oshizo/sbert-jsnli-luke-japanese-base-lite"
    #         )
    #     ),
    # )
    index.save_to_disk("data/wordpress.json")


def do_query(query):
    index = load_index()
    output = index.query(prompt.format(question=query))
    print(output)


def do_chat():
    print("Loading index...")
    index = load_index()

    print("Question: ", end="", flush=True)
    try:
        while question := next(sys.stdin).strip():
            output = index.query(prompt.format(question=question))
            print("Answer: ", end="")
            print(output)
            print("")
            print("Question: ", end="", flush=True)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    fire.Fire(run)
