'use server'

import { OpenAI } from '@posthog/ai'
import { PostHog } from 'posthog-node'
import { conversational_ai_prompt_generator, final_11labs_prompt, style_extractor_agent_prompt } from "./prompts";
import { ElevenLabsClient } from "elevenlabs";
import { addPersona } from "./database";
import { Persona } from "./types";

async function openaiCompletion(prompt: string, userMessage: string): Promise<string> {
    console.log("Running AI completion...")

    const phClient = new PostHog(
        'phc_P0zmNW1JeorIbK4AMcUts2c3H1ZsozsRxKvZcYnklL5',
        { host: 'https://eu.i.posthog.com' }
    );
      
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY || '',
        posthog: phClient,
    });

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { 
                role: "system", 
                content: prompt
            },
            {
                role: "user",
                content: userMessage
            }
        ],
        posthogDistinctId: "user_123", // optional
        posthogTraceId: "trace_123", // optional
        posthogProperties: { conversation_id: "abc123", paid: true }, // optional
        posthogGroups: { company: "company_id_in_your_db" }, // optional 
        posthogPrivacyMode: false // optional
    });

    phClient.shutdown()

    return completion.choices[0].message.content || "Failed to run AI completion";
}

export async function createVirtualClone(formData: {
    name: string;
    description: string;
    file: File;
}) {
    if (!formData.file) {
        console.error("Cannot create voice - no file provided")
        return;
    }

    const person_name = formData.name;
    
    // Start voice creation early and let it run in parallel
    const voiceIDPromise = addVoice(formData.file, person_name);

    // Run the OpenAI operations sequentially since they depend on each other
    const extractedData = await openaiCompletion(style_extractor_agent_prompt, formData.description);
    const prompt = await openaiCompletion(conversational_ai_prompt_generator, extractedData);
    const system_prompt = final_11labs_prompt.replaceAll('{person_name}', person_name).replaceAll('{prompt}', prompt);
    
    // Wait for both voice creation and agent creation to complete
    const voice_id = await voiceIDPromise;
    const agent_id = await createAgent(system_prompt, `Hello, I am ${person_name}. It's really nice to see you again!`, voice_id, person_name);

    const uuid = crypto.randomUUID();
    console.log("Finished crafting persona ", uuid);

    const persona: Omit<Persona, 'created_at'> = {
        id: uuid,
        voice_id: voice_id,
        person_name: person_name,
        source_text: formData.description,
        system_prompt: system_prompt,
        agent_id: agent_id
    };

    await addPersona(persona);
    return uuid;
}

async function addVoice(file: File, voiceName: string): Promise<string> {
    console.log("Adding new voice...")

    const apiKey = process.env.XI_API_KEY
    if (!apiKey) {
        throw Error('XI_API_KEY is not set')
    }

    const client = new ElevenLabsClient({ apiKey: apiKey });
    
    try {
        const response = await client.voices.add({
            files: [file],
            name: voiceName,
            remove_background_noise: true
        });
        await client.voices.editSettings(response.voice_id, {
            stability: 0.1,
            similarity_boost: 0.9,
            style: 0.2
        });
        return response.voice_id;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        throw new Error(`Failed to add voice: ${errorMessage}`);
    }
}

// Example usage:
// const voiceId = await addVoice(fileObject, "Custom Voice Name");

async function createAgent(prompt: string, first_message: string, voice_id: string, internal_name: string, language: string = "en") {
    console.log("Adding new agent...")

    const apiKey = process.env.XI_API_KEY
    if (!apiKey) {
        throw Error('XI_API_KEY is not set')
    }

    const client = new ElevenLabsClient({ apiKey: apiKey });
    const res = await client.conversationalAi.createAgent({
        conversation_config: {
            agent: {
                prompt: {
                    prompt: prompt,
                    //llm
                    //temperature
                    //tools
                    //knowledge_base
                },
                first_message: first_message,
                language: language
            },
            tts: {
                voice_id: voice_id
            }
        },
        name: internal_name
    });
    return res.agent_id;
}

export async function getSignedUrl(agent_id: string) {
    if (!agent_id) {
        throw Error('AGENT_ID is not set')
    }
    const apiKey = process.env.XI_API_KEY
    if (!apiKey) {
        throw Error('XI_API_KEY is not set')
    }
    try {
        const response = await fetch(
            `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agent_id}`,
            {
                method: 'GET',
                headers: {
                    'xi-api-key': apiKey,
                }
            }
        );

        if (!response.ok) {
            throw new Error('Failed to get signed URL');
        }

        const data = await response.json();
        return data.signed_url
    } catch (error) {
        console.error('Error:', error);
        return null;
    }
}