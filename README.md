## Conversational AI Demo

## Setup

Set up the environment variables:

```bash
cp .env.example .env
```

Follow [this guide](https://elevenlabs.io/docs/conversational-ai/docs/agent-setup) to configure your agent and get your API key and set them in the `.env` file.

Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```


## Docker

```bash
i=node:hydrogen-alpine3.21
docker pull $i
docker run -w /app -v $PWD:/app -p 3000:3000 -it --rm $i sh
npm i
npm run dev
# npm run build
```

## Technologies used

- ElevenLabs (Conversational AI, Voice Cloning)
- Next.js
- Vercel
- Supabase
- OpenAI
- Tailwind CSS

## Learn More

- [Conversational AI Tutorial](https://elevenlabs.io/docs/product/introduction)
- [Conversational AI SDK](https://elevenlabs.io/docs/libraries/conversational-ai-sdk-js)
