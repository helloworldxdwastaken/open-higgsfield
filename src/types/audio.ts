export type AudioVoice = {
    id: string;
    name: string;
    description: string;
    language: string;
    type: "cloned" | "preset";
    createdAt: string;
};

export type AudioJob = {
    id: string;
    kind: "speech" | "transcript";
    name: string;
    text: string;
    voiceName: string;
    status: "processing" | "completed" | "failed";
    duration: number;
    createdAt: string;
    error?: string;
};

export type AudioPreset = { id: string; name: string; gender: string; language: string };
export type AudioDashboard = {
    voices: AudioVoice[];
    presets: AudioPreset[];
    jobs: AudioJob[];
    engines: { online: boolean; speech: boolean; cloning: boolean; transcription: boolean };
};
