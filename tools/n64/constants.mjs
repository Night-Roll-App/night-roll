// Numbers from the sm64 decomp that the parser and the test builder share.
export const TICKS_PER_BEAT = 48;   // TATUMS_PER_BEAT (internal.h)
export const SEMITONE_TO_MIDI = 21; // gNoteFrequencies[39] = 1.0: semitone 39 is the sample's root, middle C (60) by convention
// gDefaultShortNoteVelocityTable / gDefaultShortNoteDurationTable (data.c)
export const DEFAULT_SHORT_VEL = [12, 25, 38, 51, 57, 64, 71, 76, 83, 89, 96, 102, 109, 115, 121, 127];
export const DEFAULT_SHORT_GATE = [229, 203, 177, 151, 139, 126, 113, 100, 87, 74, 61, 48, 36, 23, 10, 0];
