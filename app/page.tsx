'use client'

import { useState } from 'react';
import { createVirtualClone } from '../lib/actions';
import { useRouter } from 'next/navigation';

const MAX_FILE_SIZE_MB = 20;

export default function Home() {
    const router = useRouter();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [errors, setErrors] = useState({ name: false, description: false });
    const [sizeError, setSizeError] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        setSizeError(false);

        const newErrors = {
            name: !name,
            description: !description,
        };
        setErrors(newErrors);

        if (!name || !description) {
            return;
        }

        // Only check file size if a file was uploaded
        if (file && file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            setSizeError(true);
            return;
        }

        setLoading(true);
        const cloneId = await createVirtualClone({
            name,
            description,
            ...(file && { file })
        });
        setLoading(false);

        router.push(`/talk/${cloneId}`);
    };

    return (
        <div className="w-full items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
            {loading && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg flex items-center gap-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                        <span className="text-gray-700">Creating the person...</span>
                    </div>
                </div>
            )}
            <div className="w-[41vw] flex flex-col gap-8 row-start-2 items-center bg-gray-300 p-8 rounded-xl">
                <h1 className="text-4xl font-bold">Unspoken AI</h1>
                <h3 className="w-full text-gray-600 text-xl text-center">
                    Bring back your predecessors to life with our AI virtual personas.
                    Create digitalized immortal versions of your loved ones.
                    Bring back historical figures to life.
                    Create memorials of your ancestors.
                </h3>
                <div className="w-full relative">
                    <p className="mb-2 text-gray-700">What's the name of the person?</p>
                    <input
                        type="text" 
                        placeholder="Enter clone name"
                        className={`w-full p-2 border rounded-md ${errors.name ? 'border-red-500' : ''}`}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                    {errors.name && <div className="text-red-500 text-sm mt-1">Please fill this field</div>}
                </div>
                <div className="w-full relative">
                    <p className="mb-2 text-gray-700">Enter that person's diary, journal or autobiography.</p>
                    <textarea
                        placeholder="Enter detailed description"
                        className={`w-full h-48 p-2 border rounded-md resize-y overflow-auto ${errors.description ? 'border-red-500' : ''}`}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                    {errors.description && <div className="text-red-500 text-sm mt-1">Please fill this field</div>}
                </div>
                <div className="w-full relative">
                    <p className="mb-2 text-gray-700">Upload mp3 of the person's voice (optional, max 20MB)</p>
                    <input
                        type="file"
                        accept=".mp3"
                        className={`w-full p-2 border rounded-md ${sizeError ? 'border-red-500' : ''}`}
                        onChange={(e) => {
                            setFile(e.target.files?.[0] || null);
                            setSizeError(false);
                        }}
                    />
                    {sizeError && <div className="text-red-500 text-sm mt-1">File size must be less than 20MB</div>}
                </div>
                <p className="text-gray-400 text-sm">By clicking the button you agree that you have sole rights to the audio file and the text provided.</p>
                <button 
                    className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-md transition-colors"
                    onClick={handleSubmit}
                >
                    {name ? `Bring ${name} to life!` : "Bring the person to life!"}
                </button>
            </div>
        </div>
    );
}