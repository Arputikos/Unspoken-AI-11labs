'use server'

import OpenAI from "openai";
import { PostHog } from 'posthog-node';
import { conversational_ai_prompt_generator, final_11labs_prompt, style_extractor_agent_prompt } from "./prompts";
import { ElevenLabsClient } from "elevenlabs";
import { addPersona } from "./database";
import { Persona } from "./types";

const openai = new OpenAI();

const posthog = new PostHog(
    'phc_P0zmNW1JeorIbK4AMcUts2c3H1ZsozsRxKvZcYnklL5',
    { host: 'https://eu.i.posthog.com' }
);

async function openaiCompletion(prompt: string, userMessage: string): Promise<string> {
    const startTime = Date.now();
    const status = 200;
    let completion;
    
    try {
        completion = await openai.chat.completions.create({
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
        });

        const latency = (Date.now() - startTime) / 1000;
        
        // Log the AI generation event
        posthog.capture({
            distinctId: 'system', // You might want to pass actual user ID here
            event: '$ai_generation',
            properties: {
                $ai_trace_id: completion.id,
                $ai_model: "gpt-4o-mini",
                $ai_provider: "openai",
                $ai_input: JSON.stringify([
                    { role: "system", content: prompt },
                    { role: "user", content: userMessage }
                ]),
                $ai_input_tokens: completion.usage?.prompt_tokens,
                $ai_output_choices: JSON.stringify(completion.choices),
                $ai_output_tokens: completion.usage?.completion_tokens,
                $ai_latency: latency,
                $ai_http_status: status,
                $ai_base_url: "https://api.openai.com/v1"
            },
        });

        // Make sure to flush the event
        await posthog.flush();
        
        return completion.choices[0].message.content || "Failed to run AI completion";
    } catch (error) {
        throw error;
    }
}

export async function createVirtualClone(formData: {
    name: string;
    description: string;
    file: File;
}) {
    const person_name = formData.name;

    let voiceIDPromise;

    const languagePrompt = "What is language of the message? Based user messagre respond with two letter: en, fr, pl etc.";

    console.log("languagePrompt\n", languagePrompt);

    const awaitLanguage = openaiCompletion(languagePrompt, formData.description);

    if (!formData.file) {
        console.log("No file provided, using prebuild voice");
        // check if male or female
        const genderPrompt = "What is gender of person described? Based user messagre respond with one word male or female.";
        const genderMessage = "# Name\n" + formData.name + "\n\n# Description\n" + formData.description;

        console.log("genderPrompt\n", genderPrompt);
        console.log("genderMessage\n", genderMessage);

        const gender = await openaiCompletion(genderPrompt, genderMessage);

        console.log("Detected gender:", gender);
        
        if (gender === "male") {
            // male

            // Remy
            // voiceIDPromise = "HgVtfyEbd484Fg7KDrp7";

            // Antonio - Grumpy Grandpa
            voiceIDPromise = "s2wvuS7SwITYg8dqsJdn";

            console.log("Using male voice ID:", voiceIDPromise);
        }
        else {
            // female
            // Lunaria - Calm Meditations and Manifestations
            voiceIDPromise = "Nyip1VgoS6bg9Vl30y8v";
            console.log("Using female voice ID:", voiceIDPromise);
        }
    }
    else {
        console.log("File:", formData.file);
        // Start voice creation early and let it run in parallel
        voiceIDPromise = addVoice(formData.file, person_name);
    }

    // Run the OpenAI operations sequentially since they depend on each other
    const extractedData = await openaiCompletion(style_extractor_agent_prompt, formData.description);
    const prompt = await openaiCompletion(conversational_ai_prompt_generator, extractedData);
    const system_prompt = final_11labs_prompt.replaceAll('{person_name}', person_name).replaceAll('{prompt}', prompt);
    
    // Wait for both voice creation and agent creation to complete
    const voice_id = await voiceIDPromise;
    const agent_first_message = `Hello, I am ${person_name}. It's really nice to see you again!`;
    const agent_language = await awaitLanguage;
    console.log("Agent language:", agent_language);
    const agent_id = await createAgent(system_prompt, agent_first_message, voice_id, person_name, agent_language);

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

    deleteVoices();
    
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

async function deleteVoices(): Promise<void> {
    console.log("Checking voice count...")

    const apiKey = process.env.XI_API_KEY
    if (!apiKey) {
        throw Error('XI_API_KEY is not set')
    }

    const client = new ElevenLabsClient({ apiKey: apiKey });
    const voices = await client.voices.getAll();

    console.log(`Current voice count: ${voices.voices.length}`);



    if (voices.voices.length > 25) {
        // Find the oldest voice based on created_at_unix
        const oldestVoice = voices.voices.reduce((oldest, current) => {
            const oldestTime = oldest.created_at_unix ?? Number.MAX_VALUE;
            const currentTime = current.created_at_unix ?? Number.MAX_VALUE;
            console.log("Checking", current.name, current.category)
            if (current.category === "premade") {
                return oldest;
            }
            return currentTime < oldestTime ? current : oldest;
        });

        console.log(`Deleting oldest voice ${oldestVoice.voice_id} (${oldestVoice.name})...`);
        await client.voices.delete(oldestVoice.voice_id);
        console.log("Deleted oldest voice.");
        console.log(`Updated voice count: ${voices.voices.length - 1}`);
    } else {
        console.log("No deletion needed - voice count is within limit.");
    }
}

async function createAgent(prompt: string, first_message: string, voice_id: string, internal_name: string, language: string) {
    console.log("Adding new agent...")

    const apiKey = process.env.XI_API_KEY
    if (!apiKey) {
        throw Error('XI_API_KEY is not set')
    }

    console.log(`Voice ID: ${voice_id} (type: ${typeof voice_id})`);
    console.log(`Language: ${language}`);

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
                // voice_id: "cjVigY5qzO86Huf0OWal"
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