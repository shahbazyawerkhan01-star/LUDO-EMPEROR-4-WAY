// Tiny channel between React UI and the running Pixi scene (the scene fills these in while it is alive).
export const bus: {
    /** Post a chat line as a player (typed message, reaction, quick phrase). Spoken in that player's voice. */
    chat?: (idx: number, text: string, opts?: { voice?: boolean }) => void;
    /** Use the current human player's pre-set lucky wish for this roll. */
    wish?: () => void;
} = {};
