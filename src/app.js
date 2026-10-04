import { S, prof } from "./state.js";
import { iconSvg } from "./ui/icons.js";
import { setVolBtn, setPlayBtn, setControl } from "./ui/controls.js";
import { secToTick } from "./midi/parse.js";
import { parseMidi } from "./midi/parse.js";
import { tickToSec } from "./midi/parse.js";
import { writeMidi } from "./midi/write.js";
import { SF_MAJOR } from "./theory/chords.js";
import { spellPc } from "./theory/chords.js";
import { pitchName } from "./theory/chords.js";
import { nameChord } from "./theory/chords.js";
import { LETTER_PC } from "./theory/chords.js";
import { CHORD_FLAT } from "./theory/chords.js";
import { SHARP_SPELL } from "./theory/chords.js";
import { spellFor } from "./theory/chords.js";
import { chordSym } from "./theory/chords.js";
import { splitProgression } from "./theory/chords.js";
import { parseNumeral } from "./theory/chords.js";
import { parseChordSym } from "./theory/chords.js";
import { CHORD_TEMPLATES } from "./theory/chords.js";
import { chordQualCompose } from "./theory/chords.js";
import { chordQualParse } from "./theory/chords.js";
import { CHORD_BASES } from "./theory/chords.js";
import { CHORD_EXTS } from "./theory/chords.js";
import { spellMemo } from "./theory/chords.js";
import { LETTERS } from "./theory/chords.js";
import { keySpelling } from "./theory/chords.js";
import { NUM_DEG } from "./theory/chords.js";
import { MAJ_STEP } from "./theory/chords.js";
import { MIN_STEP } from "./theory/chords.js";
import { pearsonCorr } from "./theory/key.js";
import { keyNameFor } from "./theory/key.js";
import { TONIC_SPELL } from "./theory/key.js";
import { fileKeyAt } from "./theory/key.js";
import { checkMeterVsFile } from "./theory/key.js";
import { FIFTHS_POS } from "./theory/key.js";
import { MODE_FIFTHS } from "./theory/key.js";
import { trueSf } from "./theory/key.js";
import { keyNameToSf } from "./theory/key.js";
import { MODE_OFFSET } from "./theory/key.js";
import { LETTER_SF } from "./theory/key.js";
import { MODE_SF_OFFSET } from "./theory/key.js";
import { barTicks } from "./model/rollnotes.js";
import { noteToJSON } from "./model/rollnotes.js";
import { deriveNoteTypes } from "./model/rollnotes.js";
import { jsonToRawNote } from "./model/rollnotes.js";
import { resolveNote } from "./model/rollnotes.js";
import { applyChop } from "./model/rollnotes.js";
import { notesBase } from "./model/rollnotes.js";
import { parseRollnotes } from "./model/rollnotes.js";
import { ROLLNOTES_LOCK_MSG } from "./model/rollnotes.js";
import { notesStoreKey } from "./model/rollnotes.js";
import { dedupedNotesWithIndex } from "./model/rollnotes.js";
import { baseName } from "./model/rollnotes.js";
import { audioDirText } from "./model/rollnotes.js";
import { trackDirText } from "./model/rollnotes.js";
import { serializeRollnotes } from "./model/rollnotes.js";
import { serializeNotesList } from "./model/rollnotes.js";
import { serializeRollnotesStamped } from "./model/rollnotes.js";
import { ROLLNOTES_FORMAT } from "./model/rollnotes.js";
import { ROLLNOTES_MAX_VERSION } from "./model/rollnotes.js";
import { parseRollnotesJSON } from "./model/rollnotes.js";
import { trackIsDrums } from "./model/grid.js";
import { secDepthCap } from "./model/grid.js";
import { beatTicks } from "./model/grid.js";
import { beatsPerBarDisp } from "./model/grid.js";
import { effTs } from "./model/grid.js";
import { gridAnchorTick } from "./model/grid.js";
import { moveSnapTicks } from "./model/grid.js";
import { cursorTapSnapTicks } from "./model/grid.js";
import { cursorDragSnapTicks } from "./model/grid.js";
import { pencilTicks } from "./model/grid.js";
import { gridCellStart } from "./model/grid.js";
import { snapTickAbs } from "./model/grid.js";
import { pencilCellAt } from "./model/grid.js";
import { isTripletDur } from "./model/grid.js";
import { songHas32nds } from "./model/grid.js";
import { beatsPerBarEff } from "./model/grid.js";
import { catalogHas } from "./model/catalog.js";
import { groupOf } from "./model/catalog.js";
import { folderTitle } from "./model/catalog.js";
import { folderOf } from "./model/catalog.js";
import { titleCaseSlug } from "./model/catalog.js";
import { segTitle } from "./model/catalog.js";
import { publishedPaths } from "./model/catalog.js";
import { FOLDER_NAMES } from "./model/catalog.js";
import { albumFolders } from "./model/catalog.js";
import { editsKey } from "./model/edits.js";
import { isLocalDraft } from "./model/edits.js";
import { updateClearBtn } from "./model/edits.js";
import { overlayNoteSig } from "./model/edits.js";
import { LINK_SONGS } from "./platform/base.js";
import { recentSongs } from "./platform/base.js";
import { saveRecentSongsRaw } from "./platform/base.js";
import { RECENT_MAX } from "./platform/base.js";
import { songPathFromURL } from "./platform/base.js";
import { setDocTitle } from "./platform/base.js";
import { PERF_FLAGS } from "./platform/base.js";
import { rememberLastSong } from "./platform/base.js";
import { movedPath } from "./platform/base.js";
import { songShareURL } from "./platform/base.js";
import { PERF_NOSCENE } from "./platform/base.js";
import { linkRepoLabel } from "./platform/base.js";
import { clearRecentSongs } from "./platform/base.js";
import { albumParamFromURL } from "./platform/base.js";
import { linkSongsBase } from "./platform/base.js";
import { RECENT_KEY } from "./platform/base.js";
import { MOVED_DIRS } from "./platform/base.js";
// Song links are the song's PATH without its extension (Josh, 2026-09-14):
//   https://…/night-roll/albums/compositions/nightroll/ambush   → the player
//   https://…/night-roll/albums/compositions/nightroll/ambush.mid → the file
// The path form is served by 404.html (Pages has no such file), which sends
// the browser to ?song=…; the app then puts the path form back in the address
// bar. Old ?song=…mid links keep opening the player. APP_BASE is the app's own
// directory, snapshotted before the address bar ever changes, and pinned as
// <base> so relative fetches (soundfonts, albums/, tools/nsf) never follow the
// song path.
// EDITION moved to src/edition.js (docs/split-plan.md §1): the packager
// (tools/package.mjs) now rewrites THAT file's one line to "app" for the
// store build. The app edition hides what only makes sense on the public
// study site (class="webonly"), nothing else changes.
import { EDITION } from "./edition.js";
import { hasExistingNightRollPrefs } from "./platform/mode.js";
import { appMode } from "./platform/mode.js";
import { analysisAvailable } from "./platform/mode.js";
import { setAppMode } from "./platform/mode.js";
import { audioSessionType } from "./platform/native.js";
import { nativeCall } from "./platform/native.js";
import { draftStoreKey } from "./platform/storage.js";
import { songsURL } from "./platform/storage.js";
import { cfg } from "./platform/storage.js";
import { idbDraftMove } from "./platform/storage.js";
import { idbDraftGet } from "./platform/storage.js";
import { idbDraftDelete } from "./platform/storage.js";
import { nsfURL } from "./platform/storage.js";
import { repoApi } from "./platform/storage.js";
import { apiError } from "./platform/storage.js";
import { repoName } from "./platform/storage.js";
import { idbNsfGet } from "./platform/storage.js";
import { idbNsfPut } from "./platform/storage.js";
import { idbAudioGet } from "./platform/storage.js";
import { saveCfg } from "./platform/storage.js";
import { idbSf2Put } from "./platform/storage.js";
import { idbAudioPut } from "./platform/storage.js";
import { idbAudioMove } from "./platform/storage.js";
import { idbSf2Get } from "./platform/storage.js";
import { CONSOLE_OF } from "./platform/storage.js";
import { draftInIdb } from "./platform/storage.js";
import { idbDraftOp } from "./platform/storage.js";
import { idbOpen } from "./platform/storage.js";
import { analysisURL } from "./platform/storage.js";
import { idbFsPut } from "./platform/storage.js";
import { idbFsGet } from "./platform/storage.js";
import { idbAudioDelete } from "./platform/storage.js";
import { IMP_DIR } from "./platform/storage.js";
import { idbNsfPutNow } from "./platform/storage.js";
import { baseJoin } from "./platform/storage.js";
import { readBase } from "./platform/storage.js";
import { folderOnly } from "./platform/folder.js";
import { readData } from "./platform/folder.js";
import { nativeFs } from "./platform/folder.js";
import { folderActive } from "./platform/folder.js";
import { fsRoot } from "./platform/folder.js";
import { bundledPath } from "./platform/folder.js";
import { folderWrite } from "./platform/folder.js";
import { folderDelete } from "./platform/folder.js";
import { fsDirFor } from "./platform/folder.js";
import { folderRead } from "./platform/folder.js";
import { nativeDirHandle } from "./platform/folder.js";
import { fsReadJSON } from "./platform/folder.js";
import { folderSupported } from "./platform/folder.js";
import { folderPermission } from "./platform/folder.js";
import { restoreFolder } from "./platform/folder.js";
import { updateTrackGains } from "./audio/engine.js";
import { trackVol } from "./audio/engine.js";
import { trackPan } from "./audio/engine.js";
import { MASTER_VOL } from "./audio/engine.js";
import { trackGain } from "./audio/engine.js";
import { trackAudible } from "./audio/engine.js";
import { pieceState } from "./audio/engine.js";
import { pieceAudible } from "./audio/engine.js";
import { gestureActive } from "./audio/engine.js";
import { warmContext } from "./audio/engine.js";
import { clockAlive } from "./audio/engine.js";
import { clockProbeText } from "./audio/engine.js";
import { openMaster } from "./audio/engine.js";
import { drumHit } from "./audio/engine.js";
import { pluckBuffer } from "./audio/engine.js";
import { makeOsc } from "./audio/engine.js";
import { dutyWave } from "./audio/engine.js";
import { drumNoise } from "./audio/engine.js";
import { drumNoiseBuf } from "./audio/engine.js";
import { DRUM_LONG_SEC } from "./audio/engine.js";
import { DRUM_SUSTAIN_CAP_SEC } from "./audio/engine.js";
import { sfFileFor } from "./audio/voices.js";
import { trackVoice } from "./audio/voices.js";
import { sfDecode } from "./audio/voices.js";
import { sfBank } from "./audio/voices.js";
import { VOICES } from "./audio/voices.js";
import { voiceType } from "./audio/voices.js";
import { parseGameVoice } from "./audio/voices.js";
import { gameVoiceVault } from "./audio/voices.js";
import { parseSf2Voice } from "./audio/voices.js";
import { VOICE_GROUPS } from "./audio/voices.js";
import { gameVoiceId } from "./audio/voices.js";
import { sf2VoiceId } from "./audio/voices.js";
import { playSynthVoice } from "./audio/voices.js";
import { SF_VOICES } from "./audio/voices.js";
import { sfPick } from "./audio/voices.js";
import { VOICE_AMP } from "./audio/voices.js";
import { SF_NOTE_NAMES } from "./audio/voices.js";
import { sfNoteName } from "./audio/voices.js";
import { sfEnsure } from "./audio/voices.js";
import { sfDecodeCtx } from "./audio/voices.js";
import { currentLoop } from "./audio/transport.js";
import { albumEndSec } from "./audio/transport.js";
import { ALBUM_FADE } from "./audio/transport.js";
import { audioStopSrcs } from "./audio/transport.js";
import { ALBUM_PASSES } from "./audio/transport.js";
import { albumNextIdx } from "./audio/transport.js";
import { albumPrevIdx } from "./audio/transport.js";
import { ALBUM_MAX_FAILS } from "./audio/transport.js";
import { ALBUM_CAP_SEC } from "./audio/transport.js";
import { playSec } from "./audio/transport.js";
import { albumMetaFor } from "./model/provenance.js";
import { chipActive } from "./audio/chip.js";
import { chipHas } from "./audio/chip.js";
import { chip } from "./audio/chip.js";
import { chipPreviewBuffer } from "./audio/chip.js";
import { chipTrackNo } from "./audio/chip.js";
import { vaultFetch } from "./audio/chip.js";
import { chipAlbumHasSource } from "./audio/chip.js";
import { chipStopSrcs } from "./audio/chip.js";
import { chipPreviewCache } from "./audio/chip.js";
import { chipRenderBudget } from "./audio/chip.js";
import { chipWorkerAvailable } from "./audio/chip.js";
import { planChipRender } from "./audio/chip.js";
import { chipRenderStreamed } from "./audio/chip.js";
import { chipIsPcm } from "./audio/chip.js";
import { chipSilent } from "./audio/chip.js";
import { chipStaticPan } from "./audio/chip.js";
import { chipDownmixStatic } from "./audio/chip.js";
import { chipPreviewProgAt } from "./audio/chip.js";
import { chipPcmToBuffers } from "./audio/chip.js";
import { chipPreviewPending } from "./audio/chip.js";
import { chipBuffers } from "./audio/chip.js";
import { chipStart } from "./audio/chip.js";
import { ghHeaders } from "./audio/chip.js";
import { albumMetaCache } from "./model/provenance.js";
import { CHIP_BUDGET_APP } from "./audio/chip.js";
import { CHIP_BUDGET_WEB } from "./audio/chip.js";
import { CHIP_RATE_STEPS } from "./audio/chip.js";
import { CHIP_STREAMED_RENDER_CHUNK_SEC } from "./audio/chip.js";
import { chipNoteSlice } from "./audio/chip-stream.js";
import { chipStreamOnChunk } from "./audio/chip-stream.js";
import { chipStreamOnSilent } from "./audio/chip-stream.js";
import { CHIP_STREAM_CHUNK_SEC } from "./audio/chip-stream.js";
import { CHIP_STREAM_OVERLAP } from "./audio/chip-stream.js";
import { chipAutoShouldStream } from "./audio/chip-stream.js";
import { chipAutoReason } from "./audio/chip-stream.js";
import { chipStreamIdxForTapeSec } from "./audio/chip-stream.js";
import { chipStreamRequestRange } from "./audio/chip-stream.js";
import { chipStreamWaitFor } from "./audio/chip-stream.js";
import { chipStreamMode } from "./audio/chip-stream.js";
import { chipStreamStart } from "./audio/chip-stream.js";
import { chipStreamPump } from "./audio/chip-stream.js";
import { CHIP_STREAM_HORIZON_VISIBLE } from "./audio/chip-stream.js";
import { CHIP_STREAM_HORIZON_HIDDEN } from "./audio/chip-stream.js";
import { CHIP_STREAM_PIN_LOOKAHEAD } from "./audio/chip-stream.js";
import { CHIP_SEG_HORIZON_SEC } from "./audio/chip-stream.js";
import { CHIP_SEG_MAX_SEGMENTS } from "./audio/chip-stream.js";
import { chipSegments } from "./audio/chip-stream.js";
import { chipStreamPinLoopStart } from "./audio/chip-stream.js";
import { chipStreamEvict } from "./audio/chip-stream.js";
import { chipStreamScheduled } from "./audio/chip-stream.js";
import { chipStreamScheduleChunk } from "./audio/chip-stream.js";
import { clipEndTick } from "./model/song.js";
import { songHasAudio } from "./model/song.js";
import { stretchCache } from "./audio/clips.js";
import { clipLen } from "./model/song.js";
import { forEachClip } from "./audio/clips.js";
import { stretchPending } from "./audio/clips.js";
import { clipOnsetSec } from "./audio/clips.js";
import { clipTempo } from "./audio/clips.js";
import { clipBeatMap } from "./audio/clips.js";
import { keepPitch } from "./audio/clips.js";
import { audioBufCache } from "./audio/clips.js";
import { audioCacheKey } from "./audio/clips.js";
import { audioBytesFor } from "./audio/clips.js";
import { decodeAudioBytes } from "./audio/clips.js";
import { stretchKey } from "./audio/clips.js";
import { stretchInWorker } from "./audio/clips.js";
import { clipClamp } from "./audio/clips.js";
import { audioReady } from "./audio/clips.js";
import { audioDirFor } from "./audio/clips.js";
import { PEAK_BUCKET } from "./audio/clips.js";
import { peaksOf } from "./audio/clips.js";
import { tempoFromPeaks } from "./audio/clips.js";
import { onsetCurve } from "./audio/clips.js";
import { beatTrack } from "./audio/clips.js";
import { wsolaStretch } from "./audio/clips.js";
import { stretchJobs } from "./audio/clips.js";
import { met } from "./audio/metronome.js";
import { ensureMetGain } from "./audio/metronome.js";
import { metClick } from "./audio/metronome.js";
import { metPump } from "./audio/metronome.js";
import { metBuildCells } from "./audio/metronome.js";
import { applyMetMode } from "./audio/metronome.js";
import { metHalt } from "./audio/metronome.js";
import { metSave } from "./audio/metronome.js";
import { metDefaultAccents } from "./audio/metronome.js";
import { metFollowNum } from "./audio/metronome.js";
import { metFollowBeatTicks } from "./audio/metronome.js";
import { metPumpFollow } from "./audio/metronome.js";
import { midiBase64 } from "./audio/bounce.js";
import { audioBufferToWav } from "./audio/bounce.js";
import { deliverAudioFile } from "./audio/bounce.js";
import { wavEncode } from "./audio/bounce.js";
import { isUnsaved } from "./model/provenance.js";
import { isComposition } from "./model/provenance.js";
import { ownFolderPath } from "./model/provenance.js";
import { originOf } from "./model/provenance.js";
import { bakesTempo } from "./model/provenance.js";
import { canEditMusic } from "./model/provenance.js";
import { isCaptureKey } from "./model/provenance.js";
import { slugify } from "./model/provenance.js";
import { folderFromInput } from "./model/provenance.js";
import { albumTitleFor } from "./model/provenance.js";
import { bakesMeter } from "./model/provenance.js";
import { untitledKey } from "./model/provenance.js";
import { setOrigin } from "./model/provenance.js";
import { NR_DIR } from "./model/provenance.js";
import { chosenFolder } from "./model/provenance.js";
import { isCompositionKey } from "./model/provenance.js";
import { originFor } from "./model/provenance.js";
import { COMP_DIR } from "./model/provenance.js";
import { PROVENANCE_RE } from "./model/provenance.js";
import { READONLY_DIRS } from "./model/provenance.js";
import { hasProvenanceNote } from "./model/provenance.js";
import { pendingOriginKey } from "./model/provenance.js";
import { pendingOrigin } from "./model/provenance.js";
import { RULES } from "./model/provenance.js";
import { rulesFor } from "./model/provenance.js";
import { COMP_ALBUMS } from "./model/provenance.js";
import { RESERVED_FOLDERS } from "./model/provenance.js";
import { editableSong } from "./model/song.js";
import { selEditItems } from "./model/selection.js";
import { clipboardHas } from "./model/selection.js";
import { clipSummary } from "./model/selection.js";
import { albumEffectiveOrder } from "./model/album-order.js";
import { albumHasTrackData } from "./model/album-order.js";
import { albumOrderControl } from "./model/album-order.js";
import { setAlbumOrderPref } from "./model/album-order.js";
import { slugOfPath } from "./model/album-order.js";
import { albumTrackMap } from "./model/album-order.js";
import { albumOrder } from "./model/album-order.js";
import { songUnsaved } from "./model/versions.js";
import { draftKeys } from "./model/versions.js";
import { migrateVersions } from "./model/versions.js";
import { musicSig } from "./model/versions.js";
import { draftTracks } from "./model/versions.js";
import { draftDoc } from "./model/versions.js";
import { readVersions } from "./model/versions.js";
import { pushVersion } from "./model/versions.js";
import { songDirtyFlag } from "./model/versions.js";
import { autosaveOn } from "./model/versions.js";
import { versionsStoreKey } from "./model/versions.js";
import { readVersionsRaw } from "./model/versions.js";
import { writeVersionsRaw } from "./model/versions.js";
import { jobListeners } from "./model/jobs.js";
import { jobsSave } from "./model/jobs.js";
import { JOBS_AUTOCLEAR_MS } from "./model/jobs.js";
import { jobControls } from "./model/jobs.js";
import { JOB_KINDS } from "./model/jobs.js";
import { jobBarSet } from "./model/jobs.js";
import { jobFraction } from "./model/jobs.js";
import { jobProgress } from "./model/jobs.js";
import { jobsOnChange } from "./model/jobs.js";
import { logLines } from "./model/jobs.js";
import { logPush } from "./model/jobs.js";
import { appErrors } from "./model/jobs.js";
import { appDebug } from "./model/jobs.js";
import { debugLogOn } from "./model/jobs.js";
import { BENIGN_ERRORS } from "./model/jobs.js";
import { logLine } from "./model/jobs.js";
import { jobsFind } from "./model/jobs.js";
import { jobsList } from "./model/jobs.js";
import { importHubLabel } from "./import/hub.js";
import { impDisplayTitle } from "./import/capture.js";
import { sf2Magic } from "./import/capture.js";
import { audioMagic } from "./import/capture.js";
import { streamedAudioMagic } from "./import/capture.js";
import { importDraftKeys } from "./import/capture.js";
import { impDirFor } from "./import/capture.js";
import { impTrackLabel } from "./import/capture.js";
import { impTrackKey } from "./import/capture.js";
import { connected } from "./sync/publish.js";
import { writeToken } from "./sync/publish.js";
import { putMidAt } from "./sync/publish.js";
import { declaredTsForKey } from "./model/rollnotes.js";
import { putRollnotes } from "./sync/publish.js";
import { putSongsText } from "./sync/publish.js";
import { notesTxtFor } from "./model/rollnotes.js";
import { uploadAudioClipsFor } from "./sync/publish.js";
import { audioDirFiles } from "./sync/publish.js";
import { deleteRepoFile } from "./sync/publish.js";
import { writeSongsReadme } from "./sync/publish.js";
import { takeToken } from "./sync/publish.js";
import { shareLinkFor } from "./sync/publish.js";
import { recordLastSync } from "./sync/publish.js";
import { uploadAudioClips } from "./sync/publish.js";
import { APP_REPO } from "./sync/publish.js";
import { PUBLIC_BASE } from "./sync/publish.js";
import { publicBase } from "./sync/publish.js";
import { README_OPEN } from "./sync/publish.js";
import { README_CLOSE } from "./sync/publish.js";
import { songsReadmeBlock } from "./sync/publish.js";
import { spliceReadme } from "./sync/publish.js";
import { estimateKey } from "./model/song.js";
import { checkKeyVsFile } from "./model/song.js";
import { KS_MAJOR_PROFILE } from "./model/song.js";
import { KS_MINOR_PROFILE } from "./model/song.js";
import { keyEstimateSig } from "./model/song.js";
import { tonicPcFromName } from "./model/song.js";
import { initCatalog } from "./model/catalog.js";
import { folderScanAlbums } from "./model/catalog.js";
import { tonicPcOfName } from "./theory/key.js";
import { modeOfName } from "./theory/key.js";
import { keyNameAt } from "./model/song.js";
import { sfShownAt } from "./model/song.js";
import { sfDeclaredAt } from "./model/song.js";
import { sfAt } from "./model/song.js";
import { sfDeclaredAtRaw } from "./model/song.js";
import { fmtBarBeat } from "./gen/drummer.js";
import { drNormParts } from "./gen/drummer.js";
import { drBassTrack } from "./gen/drummer.js";
import { drBoundaries } from "./gen/drummer.js";
import { sectionLane } from "./gen/drummer.js";
import { drumRng } from "./gen/drummer.js";
import { DR_FILLS } from "./gen/drummer.js";
import { drBackbeats } from "./gen/drummer.js";
import { fnv1a32 } from "./gen/drummer.js";
import { DR_TOMS } from "./gen/drummer.js";
import { bsInferTimeline } from "./gen/bassist.js";
import { bsChordTimeline } from "./gen/bassist.js";
import { chordAt } from "./gen/bassist.js";
import { nextChange } from "./gen/bassist.js";
import { bsChordTone } from "./gen/bassist.js";
import { computeAnalysisLayer } from "./gen/analysis.js";
import { harmonyTrackIndices } from "./gen/analysis.js";
import { RULER_W_ROLL } from "./render/roll.js";
import { BASE_RULER_H } from "./render/roll.js";
import { STRIP_H } from "./render/roll.js";
import { TRACK_COLORS } from "./render/roll.js";
import { LANE_H } from "./render/roll.js";
import { AUDIO_STRIP_H } from "./render/roll.js";
import { isDirective } from "./model/rollnotes.js";
import { curTick } from "./render/roll.js";
import { activeNoteAt } from "./render/roll.js";
import { sectionPathAt } from "./render/roll.js";
import { rangeSelRestore } from "./render/roll.js";
import { trackColor } from "./render/roll.js";
import { canvas } from "./render/roll.js";
import { wrap } from "./render/roll.js";
import { ctx } from "./render/roll.js";
import { drawRangeTints } from "./render/roll.js";
import { rangeSelPersist } from "./render/roll.js";
import { viewPersistSoon } from "./render/roll.js";
import { fallActive } from "./render/roll.js";
import { pxPerTick } from "./render/roll.js";
import { css } from "./render/roll.js";
import { drawStripPlayhead } from "./render/roll.js";
import { drawRuler } from "./render/roll.js";
import { stripPlayheadX } from "./render/roll.js";
import { topRow } from "./render/roll.js";
import { botRow } from "./render/roll.js";
import { inKitLane } from "./render/roll.js";
import { kitLaneTop } from "./render/roll.js";
import { trackShown } from "./render/roll.js";
import { noteRow } from "./render/roll.js";
import { showAddedOutline } from "./render/roll.js";
import { drawLasso } from "./render/roll.js";
import { laneBotRow } from "./render/roll.js";
import { kitSlots } from "./render/roll.js";
import { DRUM_LABELS } from "./render/roll.js";
import { drumStep } from "./hooks.js";
import { annoInLasso } from "./hooks.js";
import { songHasDrums } from "./render/roll.js";
import { viewRestore } from "./render/roll.js";
import { TRACKS_GUTTER } from "./render/roll.js";
import { setAddedOutline } from "./render/roll.js";
import { DRUM_SLOTS } from "./render/roll.js";
import { computeLaneTop } from "./render/roll.js";
import { AUTO_COLOR_S } from "./render/roll.js";
import { AUTO_COLOR_L } from "./render/roll.js";
import { hslToHex } from "./render/roll.js";
import { hueOf } from "./render/roll.js";
import { hueDist } from "./render/roll.js";
import { relLuminance } from "./render/roll.js";
import { contrastRatio } from "./render/roll.js";
import { ROLL_SURFACE_COLORS } from "./render/roll.js";
import { TRACK_COLOR_CANDIDATES } from "./render/roll.js";
import { pickFarthestColor } from "./render/roll.js";
import { autoTrackColors } from "./render/roll.js";
import { cssCache } from "./render/roll.js";
import { viewKey } from "./render/roll.js";
import { rangeSelKey } from "./render/roll.js";
import { drawPlayheadStripBand } from "./render/roll.js";
import { isCopyableAnno } from "./model/rollnotes.js";
import { drawAnalysisLayer } from "./render/roll.js";
import { drawTracks } from "./render/tracks.js";
import { trackLaneAt } from "./render/tracks.js";
import { laneGeom } from "./render/tracks.js";
import { tracksNoteY } from "./render/tracks.js";
import { clipLabel } from "./render/tracks.js";
import { clipSpanX } from "./render/tracks.js";
import { selClipIs } from "./render/tracks.js";
import { tracksLaneH } from "./render/tracks.js";
import { fmtSec } from "./render/tracks.js";
import { clipStatusText } from "./render/tracks.js";
import { selClipObj } from "./render/tracks.js";
import { drawAudioStrip } from "./render/tracks.js";
import { drawClipLane } from "./render/tracks.js";
import { buildScoreModel } from "./hooks.js";
import { scoreTickToX } from "./render/score.js";
import { VF } from "./render/score.js";
import { drawScore } from "./render/score.js";
import { SCORE_PAD } from "./render/score.js";
import { renderMeasure } from "./render/score.js";
import { SCORE_INTRO_W } from "./render/score.js";
import { scoreContentH } from "./render/score.js";
import { scoreXToTick } from "./render/score.js";
import { SCORE_TOP } from "./render/score.js";
import { STAVE_H } from "./render/score.js";
import { DRUM_SCORE } from "./render/score.js";
import { drumScoreRole } from "./render/score.js";
import { vexKey } from "./render/score.js";
import { durationPieces } from "./render/score.js";
import { renderIntro } from "./render/score.js";
import { scoreMeasureAnchors } from "./render/score.js";
import { drawScorePencilGuides } from "./render/score.js";
import { drawInst } from "./render/instrument.js";
import { drawFall } from "./render/instrument.js";
import { FALL_WINDOW } from "./render/instrument.js";
import { pianoGeom } from "./render/instrument.js";
import { WHITE_PCS } from "./render/instrument.js";
import { degreeOf } from "./render/instrument.js";
import { drawPiano } from "./render/instrument.js";
import { drawGuitar } from "./render/instrument.js";
import { guitarGeom } from "./render/instrument.js";
import { GTR_FRETS } from "./render/instrument.js";
import { GTR_TUNING } from "./render/instrument.js";
import { instCanvas } from "./render/instrument.js";
import { instWrap } from "./render/instrument.js";
import { GTR_NAMES } from "./render/instrument.js";
import { instResize } from "./render/instrument.js";
import { ictx } from "./render/instrument.js";
import { DEGREE_LABEL } from "./render/instrument.js";
import { instRange } from "./render/instrument.js";
import { instLitPitches } from "./render/instrument.js";
import { instLitColor } from "./render/instrument.js";
import { gtrFold } from "./render/instrument.js";
import { wrapSf } from "./render/cof.js";
import { drawCof } from "./render/cof.js";
import { cofCanvas } from "./render/cof.js";
import { cofCtx } from "./render/cof.js";
import { cofMinor } from "./render/cof.js";
import { cofDim } from "./render/cof.js";
import { cofSigLabel } from "./render/cof.js";
import { cofMajorName } from "./render/cof.js";
import { drawCompare } from "./render/compare.js";
import { cmpDiff } from "./render/compare.js";
import { cmpTrackKey } from "./render/compare.js";
import { posToTickPitch } from "./input/gestures.js";
import { evtPos } from "./input/gestures.js";
import { cursorHandleHit } from "./input/gestures.js";
import { armNoteEdit } from "./input/gestures.js";
import { cursorHit } from "./input/gestures.js";
import { rulerSnapX } from "./input/gestures.js";
import { tickAtX } from "./input/gestures.js";
import { recOpenEnded } from "./model/song.js";
import { recSnap } from "./input/record.js";
import { recSnapOn } from "./input/record.js";
import { midiStatusLine } from "./input/record.js";
import { songTitleOf } from "./hooks.js";
import { songWhereLabel } from "./ask/context.js";
import { aiHostKind } from "./ask/backend.js";
import { aiRunTest } from "./ask/backend.js";
import { aiBackendRows } from "./ask/backend.js";
import { aiUrl } from "./ask/backend.js";
import { aiHeaders } from "./ask/backend.js";
import { AI_BROWSER_MODELS } from "./ask/backend.js";
import { aiProvider } from "./ask/backend.js";
import { aiBrowserMenu } from "./ask/backend.js";
import { aiModelMenu } from "./ask/backend.js";
import { aiSay } from "./ask/backend.js";
import { aiSSE } from "./ask/backend.js";
import { aiRemote } from "./ask/backend.js";
import { aiPickModel } from "./ask/backend.js";
import { AI_TEST_MS } from "./ask/backend.js";
import { aiTest } from "./ask/backend.js";
import { AI_WEBLLM_URL } from "./ask/backend.js";
import { aiWebllmLoad } from "./ask/backend.js";
import { aiEngineFor } from "./ask/backend.js";
import { aiBrowserTest } from "./ask/backend.js";
import { aiBrowser } from "./ask/backend.js";
import { askKeySpellComment } from "./ask/context.js";
import { askBarRow } from "./ask/context.js";
import { askSpanNotesCompact } from "./ask/context.js";
import { askAppState } from "./ask/context.js";
import { askOpenSongLine } from "./ask/context.js";
import { askNewSinceLines } from "./ask/context.js";
import { askViewCursorLine } from "./ask/context.js";
import { askModeLine } from "./ask/context.js";
import { askSentGet } from "./ask/context.js";
import { askLegendText } from "./ask/context.js";
import { askSentStage } from "./ask/context.js";
import { ASK_CPT } from "./ask/context.js";
import { askCachedBlock } from "./ask/context.js";
import { askSpanCachedBlock } from "./ask/context.js";
import { askStripContext } from "./ask/context.js";
import { askSentReset } from "./ask/context.js";
import { askMsgMode } from "./ask/context.js";
import { askSpan } from "./ask/context.js";
import { askSpanLabel } from "./ask/context.js";
import { askSentCommit } from "./ask/context.js";
import { askSentDrop } from "./ask/context.js";
import { askBudget } from "./ask/context.js";
import { askEstimate } from "./ask/context.js";
import { askSys } from "./ask/context.js";
import { askTerminalContext } from "./ask/context.js";
import { askBuildMessages } from "./ask/context.js";
import { ASK_SYS_BASE1 } from "./ask/context.js";
import { RULE_LEARNING } from "./ask/context.js";
import { RULE_NORMAL } from "./ask/context.js";
import { ASK_SYS_BASE2 } from "./ask/context.js";
import { askKeyDeclared } from "./ask/context.js";
import { askSpanNotes } from "./ask/context.js";
import { askBarFingerprint } from "./ask/context.js";
import { askSpanNotesCompactCached } from "./ask/context.js";
import { askCapLines } from "./ask/context.js";
import { askSentKey } from "./ask/context.js";
import { askSentStageBars } from "./ask/context.js";
import { ASK_SENT_BARS_CAP } from "./ask/context.js";
import { askEpochKey } from "./ask/context.js";
import { askEpochGet } from "./ask/context.js";
import { askEpochSet } from "./ask/context.js";
import { askEpochNote } from "./ask/context.js";
import { askFindAnnotation } from "./ask/tools.js";
import { askAnnotationStructural } from "./ask/tools.js";
import { askNoteKind } from "./ask/tools.js";
import { askSongPath } from "./ask/tools.js";
import { notesTxtForDoc } from "./ask/tools.js";
import { askReadBars } from "./ask/tools.js";
import { askAnnotationsTextCompact } from "./ask/tools.js";
import { askAnnotationsText } from "./ask/tools.js";
import { ASK_TOOLS } from "./ask/tools.js";
import { askWritableGate } from "./ask/tools.js";
import { askFindTrackIndex } from "./ask/tools.js";
import { askWriteNotesValidate } from "./ask/tools.js";
import { askBarsValidate } from "./ask/tools.js";
import { askBarsCount } from "./ask/tools.js";
import { askNoteValue } from "./ask/tools.js";
import { ASK_READ_BARS_MAX } from "./ask/tools.js";
import { askNormChip } from "./ask/tools.js";
import { parsePitch } from "./ask/tools.js";
import { askNoteVel } from "./ask/tools.js";
import { askSeenMax } from "./ask/bridge.js";
import { askUnsavedCount } from "./ask/bridge.js";
import { askRevertToSaved } from "./ask/bridge.js";
import { askTermModelsLoad } from "./ask/bridge.js";
import { askStatusRender } from "./ask/bridge.js";
import { ASK_TERMINAL_KEY } from "./ask/bridge.js";
import { ASK_GENERAL_KEY } from "./ask/bridge.js";
import { askStore } from "./ask/bridge.js";
import { ASK_LOCAL_SOFT } from "./ask/bridge.js";
import { askEvictOthers } from "./ask/bridge.js";
import { askLogKey } from "./ask/bridge.js";
import { askLogSong } from "./ask/bridge.js";
import { askLogPath } from "./ask/bridge.js";
import { askLogMarkdown } from "./ask/bridge.js";
import { askLogHeader } from "./ask/bridge.js";
import { askInboxAllowed } from "./ask/bridge.js";
import { askInboxSeenKey } from "./ask/bridge.js";
import { deployButtonTick } from "./ask/bridge.js";
import { askSessionRender } from "./ask/bridge.js";
import { askSessionRefresh } from "./ask/bridge.js";
import { askTabsVisible } from "./ask/bridge.js";
import { askSessionName } from "./ask/bridge.js";
import { askSessionLine } from "./ask/bridge.js";
import { askCompactModelName } from "./ask/bridge.js";
import { askComposing } from "./ask/bridge.js";
import { askSeenCommit } from "./ask/bridge.js";
import { askPendingIndex } from "./ask/bridge.js";
import { askModelName } from "./ask/bridge.js";
import { askSeenDrop } from "./ask/bridge.js";
import { askJobsSupported } from "./ask/bridge.js";
import { askToolsNow } from "./ask/bridge.js";
import { askLoad } from "./ask/bridge.js";
import { askJobId } from "./ask/bridge.js";
import { askPendingAll } from "./ask/bridge.js";
import { askBadgeOff } from "./ask/bridge.js";
import { deployActive } from "./ask/bridge.js";
import { askStatusToggle } from "./ask/bridge.js";
import { ASK_GENERAL_LOG } from "./ask/bridge.js";
import { ASK_TOTAL_CAP } from "./ask/bridge.js";
import { askSeenKey } from "./ask/bridge.js";
import { askSeenGet } from "./ask/bridge.js";
import { askMaxErrId } from "./ask/bridge.js";
import { askMaxStatusId } from "./ask/bridge.js";
import { askSeenMaxKey } from "./ask/bridge.js";
import { askSeenSet } from "./ask/bridge.js";
import { askSeenAdvance } from "./ask/bridge.js";
import { askSeenStage } from "./ask/bridge.js";
import { ASK_SONG_ONLY_TOOLS } from "./ask/bridge.js";
import { askAgeText } from "./ask/bridge.js";
import { deployBannerShow } from "./ask/bridge.js";
import { askStatusIdle } from "./ask/bridge.js";
import { askStatusLine } from "./ask/bridge.js";
import { askStatusRecentShow } from "./ask/bridge.js";
import { askStatusFetchCommits } from "./ask/bridge.js";
import { TERM_MODELS } from "./ask/bridge.js";
import { askModeButtons } from "./ask/sheet.js";
import { asksheet } from "./ask/sheet.js";
import { askStoreKey } from "./ask/sheet.js";
import { askstatus } from "./ask/sheet.js";
import { askClock } from "./ask/sheet.js";
import { askNoteLabel } from "./ask/sheet.js";
import { askSetMode } from "./ask/sheet.js";
import { askDraftSaveSoon } from "./ask/sheet.js";
import { asklog } from "./ask/sheet.js";
import { askDraftSave } from "./ask/sheet.js";
import { askDraftLoad } from "./ask/sheet.js";
import { askPartial } from "./ask/sheet.js";
import { askScrollEnd } from "./ask/sheet.js";
import { askShowThinking } from "./ask/sheet.js";
import { askinput } from "./ask/sheet.js";
import { askDraftClear } from "./ask/sheet.js";
import { askGrow } from "./ask/sheet.js";
import { askRefresh } from "./ask/sheet.js";
import { askFocusIfKeyboard } from "./ask/sheet.js";
import { askDraftStore } from "./ask/sheet.js";
import { b64Bytes } from "./ask/shots.js";
import { ASKSHOT_MAX } from "./ask/shots.js";
import { askShotUpload } from "./ask/shots.js";
import { askShotAdd } from "./ask/shots.js";
import { askShotStatusLabel } from "./ask/shots.js";
import { askShotClearAll } from "./ask/shots.js";
import { askPickFiles } from "./ask/shots.js";
import { askShotDisplayText } from "./ask/shots.js";
import { askShotOutgoing } from "./ask/shots.js";
import { askShotLine } from "./ask/shots.js";
import { askShotRender } from "./ask/shots.js";
import { askShotRemove } from "./ask/shots.js";
import { askShotRestore } from "./ask/shots.js";
import { MAX_SHOT_SIDE } from "./ask/shots.js";
import { MAX_SHOT_KEEP_BYTES } from "./ask/shots.js";
import { askPrepImage } from "./ask/shots.js";
import { updateTrackMore } from "./ui/trackbar.js";
import { fitTrackRow } from "./ui/trackbar.js";
import { scheduleFitTrackRow } from "./ui/trackbar.js";
import { TRACK_ROW_SLACK } from "./ui/trackbar.js";
import { trackRowNeed } from "./ui/trackbar.js";
import { moveInSameOrder } from "./ui/mixer.js";
import { mixerMasterStripEl } from "./ui/mixer.js";
import { mixerPanLabel } from "./ui/mixer.js";
import { ensureMixerMeters } from "./ui/mixer.js";
import { ensureMixerMeterLoop } from "./ui/mixer.js";
import { teardownMixerMeters } from "./ui/mixer.js";
import { mixerIsOpen } from "./ui/mixer.js";
import { mixerMeterRms } from "./ui/mixer.js";
import { mixerMeterLoop } from "./ui/mixer.js";
import { setInfo } from "./hooks.js";
import { renderViewMenu } from "./ui/chrome.js";
import { logDebug } from "./hooks.js";
import { keyLabelState } from "./ui/chrome.js";
import { updateSyncBtn } from "./hooks.js";
import { updateSongBtn } from "./hooks.js";
import { appConfirm } from "./hooks.js";
import { updateJobsBtn } from "./hooks.js";
import { logErr } from "./hooks.js";
import { srAnnounce } from "./hooks.js";
import { songHeader } from "./ui/chrome.js";
import { localLabel } from "./ui/chrome.js";
import { songRow } from "./ui/chrome.js";
import { closeDropUp } from "./ui/chrome.js";
import { findsel } from "./ui/chrome.js";
import { refreshFindSel } from "./ui/chrome.js";
import { scheduleFitReadline } from "./ui/chrome.js";
import { fitReadline } from "./ui/chrome.js";
import { applyChrome } from "./ui/chrome.js";
import { renderViewSwitch } from "./ui/chrome.js";
import { viewbtn } from "./ui/chrome.js";
import { viewSwitchMenu } from "./ui/chrome.js";
import { applyInst } from "./ui/chrome.js";
import { instbtn } from "./ui/chrome.js";
import { subbtn } from "./ui/chrome.js";
import { instFallBtn } from "./ui/chrome.js";
import { micStop } from "./ui/chrome.js";
import { errChip } from "./ui/chrome.js";
import { STATUS_HISTORY_CAP } from "./ui/chrome.js";
import { expandKeyName } from "./ui/chrome.js";
import { FOOTER_DROPUP_BTN_IDS } from "./ui/chrome.js";
import { viewSaved } from "./ui/chrome.js";
import { keyNameShownAt } from "./ui/chrome.js";
import { nmic } from "./ui/chrome.js";
import { pendingSongs } from "./ui/chrome.js";
import { songtitleEl } from "./ui/chrome.js";
import { dirtySongs } from "./ui/chrome.js";
import { syncable } from "./ui/chrome.js";
import { draftDirtyState } from "./ui/chrome.js";
import { GAME_FAMILY } from "./ui/voice-menu.js";
import { SF2_FAMILY } from "./ui/voice-menu.js";
import { autoVoiceLabel } from "./ui/voice-menu.js";
import { gameVoiceFromSet } from "./ui/voice-menu.js";
import { gameVoiceFrom } from "./ui/voice-menu.js";
import { gameVoiceFromAll } from "./ui/voice-menu.js";
import { refreshKeysetLabel } from "./ui/notes.js";
import { keysel } from "./ui/notes.js";
import { tonicLabel } from "./ui/notes.js";
import { chosenTonicPc } from "./ui/notes.js";
import { keymodeSel } from "./ui/notes.js";
import { keysetBtn } from "./ui/notes.js";
import { chosenTonic } from "./ui/notes.js";
import { partialNameOf } from "./ui/notes.js";
import { NOTE_GROUPS } from "./ui/notes.js";
import { notelistSheet } from "./ui/notes.js";
import { runKeyCheck } from "./ui/notes.js";
import { runMeterCheck } from "./ui/notes.js";
import { useFileMeter } from "./ui/notes.js";
import { renderNoteJump } from "./ui/notes.js";
import { showHelpTab } from "./ui/notes.js";
import { lassobtn } from "./ui/notes.js";
import { openChallenge } from "./ui/notes.js";
import { tonicOptionValue } from "./ui/notes.js";
import { fileCheckLine } from "./ui/notes.js";
import { chordEvidence } from "./ui/notes.js";
import { snapBeat } from "./model/grid.js";
import { openEditor } from "./ui/note-editor.js";
import { updateEditButtons } from "./ui/note-editor.js";
import { CHORD_QUALS } from "./ui/note-editor.js";
import { stampChordBand } from "./ui/note-editor.js";
import { chordLabel } from "./ui/note-editor.js";
import { CHORD_ROOTS } from "./ui/note-editor.js";
import { INS_DURS } from "./ui/note-editor.js";
import { PROG_LIB } from "./ui/note-editor.js";
import { applyEditorType } from "./ui/note-editor.js";
import { BASS_SPELLINGS } from "./ui/note-editor.js";
import { chordSel } from "./ui/note-editor.js";
import { refreshChordChips } from "./ui/note-editor.js";
import { composeChord } from "./ui/note-editor.js";
import { micToggle } from "./ui/note-editor.js";
import { editor } from "./ui/note-editor.js";
import { editorType } from "./ui/note-editor.js";
import { getBeatPair } from "./ui/note-editor.js";
import { setBeatPair } from "./ui/note-editor.js";
import { SPEECH } from "./ui/note-editor.js";
import { fillBarBeatSelects } from "./ui/note-editor.js";
import { setChordWidget } from "./ui/note-editor.js";
import { micJoin } from "./ui/note-editor.js";
import { setAnchorBQ } from "./hooks.js";
import { setEndBQ } from "./model/rollnotes.js";
import { lassoedAnnos } from "./hooks.js";
import { dropSupersededBy } from "./model/rollnotes.js";
import { renderJobs } from "./ui/sheets.js";
import { jobCancel } from "./ui/sheets.js";
import { renderPubJob } from "./ui/sheets.js";
import { openAnalyzeSheet } from "./ui/sheets.js";
import { publishDest } from "./ui/sheets.js";
import { publishLabel } from "./ui/sheets.js";
import { openPubJobSheet } from "./ui/sheets.js";
import { openSettingsSheet } from "./ui/sheets.js";
import { openShareSheet } from "./ui/sheets.js";
import { versionLabel } from "./ui/sheets.js";
import { jobsDismiss } from "./ui/sheets.js";
import { jobApi } from "./ui/sheets.js";
import { askCopyText } from "./ui/sheets.js";
import { penInstant } from "./ui/sheets.js";
import { noteTapMovesCursor } from "./ui/sheets.js";
import { dropLocalSong } from "./ui/sheets.js";
import { pubCheck } from "./ui/sheets.js";
import { cfgShowPane } from "./ui/sheets.js";
import { ghCheckOut } from "./ui/sheets.js";
import { ghCheck } from "./ui/sheets.js";
import { syncsheet } from "./ui/sheets.js";
import { pubItemIcon } from "./ui/sheets.js";
import { textSizePref } from "./ui/sheets.js";
import { jobsNotify } from "./model/jobs.js";
import { CFG_PANES } from "./ui/sheets.js";
import { pubCompareDraft } from "./ui/sheets.js";
import { jobsAutoClear } from "./ui/sheets.js";
import { ghCheckMessage } from "./ui/sheets.js";
import { draftWrite } from "./model/versions.js";
import { localDraftWrite } from "./model/versions.js";
import { idbDraftPut } from "./platform/storage.js";
import { wmInnerHeight } from "./ui/wm.js";
import { WM_WINDOWS } from "./ui/wm.js";
import { wmZoneForPointer } from "./ui/wm.js";
import { wmShowDropZone } from "./ui/wm.js";
import { wmHideDropZone } from "./ui/wm.js";
import { wmLoad } from "./ui/wm.js";
import { wmRemoveSideTab } from "./ui/wm.js";
import { wmClearBottom } from "./ui/wm.js";
import { wmSave } from "./ui/wm.js";
import { wmSideCells } from "./ui/wm.js";
import { wmAllowed } from "./ui/wm.js";
import { wmInnerWidth } from "./ui/wm.js";
import { wmWhereIs } from "./ui/wm.js";
import { wmSetActiveSideTab } from "./ui/wm.js";
import { wmClampSize } from "./ui/wm.js";
import { wmWindowTitle } from "./ui/wm.js";
import { wmLayoutBottom } from "./ui/wm.js";
import { wmSyncDockButtons } from "./ui/wm.js";
import { wmAddSideTab } from "./ui/wm.js";
import { wmSetSideMode } from "./ui/wm.js";
import { wmDockBottom } from "./ui/wm.js";
import { wmMenuItem } from "./ui/wm.js";
import { wmCloseMenu } from "./ui/wm.js";
import { wmSetSideWidth } from "./ui/wm.js";
import { WM_DEFAULT_W } from "./ui/wm.js";
import { wmSetBottomHeight } from "./ui/wm.js";
import { WM_DEFAULT_H } from "./ui/wm.js";
import { wmSetBottomSplit } from "./ui/wm.js";
import { WM_KEY } from "./ui/wm.js";
import { WM_OLD_KEY } from "./ui/wm.js";
import { WM_MIN_W } from "./ui/wm.js";
import { WM_MIN_H } from "./ui/wm.js";
import { WM_MIN_SPLIT } from "./ui/wm.js";
import { WM_PHONE_MAX } from "./ui/wm.js";
import { WM_ZONE_FRAC } from "./ui/wm.js";
import { WM_EDGE_GAP } from "./ui/wm.js";
import { wmClampHeight } from "./ui/wm.js";
import { wmClampSplit } from "./ui/wm.js";
import { wmMigrate } from "./ui/wm.js";
import { wmMigrateShape } from "./ui/wm.js";
import { wmMigrateShapeB } from "./ui/wm.js";
import { wmSetSide } from "./ui/wm.js";
import { wmClearSide } from "./ui/wm.js";
import { wmZoneFor } from "./ui/wm.js";
import { wmDockLabel } from "./ui/wm.js";
import { wmDockShort } from "./ui/wm.js";
import { draw } from "./hooks.js";
import { playbackFrame } from "./hooks.js";
import { drawFull } from "./ui/chrome.js";
import { resize } from "./ui/chrome.js";
import { updateCanvasA11y } from "./ui/chrome.js";
import { pushUndo } from "./model/edits.js";
import { addTrackUndoable } from "./model/edits.js";
import { clampView } from "./hooks.js";
import { minPxq } from "./ui/chrome.js";
import { pxqFloor } from "./ui/chrome.js";
import { rowHFloor } from "./ui/chrome.js";
import { PAN_TAIL_BARS } from "./ui/chrome.js";
import { dispPitchExtent } from "./ui/chrome.js";
import { ROLL_AIR } from "./ui/chrome.js";
import { saveDraft } from "./model/versions.js";
import { scheduleBackupFlush } from "./hooks.js";
import { retireOldOverlay } from "./model/versions.js";
import { filesMirrorSoon } from "./model/versions.js";
import { filesMirror } from "./model/versions.js";
import { draftRead } from "./model/versions.js";
import { flushBackupNow } from "./ui/chrome.js";
import { localDraftTracks } from "./model/versions.js";
import { bsRange } from "./ui/sheets.js";
import { drRange } from "./ui/sheets.js";
import { drPartsGet } from "./ui/sheets.js";
import { drKitCountT } from "./ui/sheets.js";
import { segSet } from "./ui/sheets.js";
import { drPartsSet } from "./ui/sheets.js";
import { drPartsSync } from "./ui/sheets.js";
import { computeSongEnd } from "./model/song.js";
import { dpTick } from "./ui/sheets.js";
import { undoTrackAdd } from "./model/edits.js";
import { refreshSelInfo } from "./ui/note-editor.js";
import { renderOctBtn } from "./ui/note-editor.js";
import { reflectSelVel } from "./ui/note-editor.js";
import { installHooks } from "./wire.js";
import { resumeAudio } from "./audio/engine.js";
import { ensureAudio } from "./audio/engine.js";
import { rebuildAudio } from "./audio/engine.js";
import { metStart } from "./audio/metronome.js";
import { chipSource } from "./audio/chip.js";
import { CHIPS } from "./audio/chip.js";
import { chipModules } from "./audio/chip.js";
import { chipEstimateTracks } from "./audio/chip.js";
import { chipCleanupAfterFailure } from "./audio/chip.js";
import { chipExt } from "./audio/chip.js";
import { PSX_SOUNDING_ON } from "./audio/chip.js";
import { chipVaultFile } from "./audio/chip.js";
import { sonySeqCapture } from "./audio/chip.js";
import { psfInflater } from "./audio/chip.js";
import { chipStreamOpenWorker } from "./audio/chip-stream.js";
import { gameLibSync } from "./audio/voices.js";
import { sf2Sync } from "./audio/voices.js";
import { scheduleGameNote } from "./audio/voices.js";
import { gameNoteCache } from "./audio/voices.js";
import { gameNoteBucket } from "./audio/voices.js";
import { gameVoiceWarned } from "./audio/voices.js";
import { gameVoiceWarn } from "./audio/voices.js";
import { resolveVoiceInstrument } from "./audio/voices.js";
import { fitView } from "./hooks.js";
import { renderTrackbar } from "./hooks.js";
import { updateEditBtnVis } from "./hooks.js";
import { updateChipBtn } from "./hooks.js";
import { updateSubtitle } from "./hooks.js";
import { askRender } from "./hooks.js";
import { finalizeNotes } from "./hooks.js";
import { recFinish } from "./hooks.js";
import { albumAdvance } from "./hooks.js";
import { updateSongMeta } from "./hooks.js";
import { chipRender } from "./audio/chip.js";
import { chipPublish } from "./audio/chip.js";
import { chipRenderInWorker } from "./audio/chip.js";
import { chipRenderAuto } from "./audio/chip-stream.js";
import { chipStreamOpen } from "./audio/chip-stream.js";
import { buildSchedule } from "./audio/transport.js";
import { tombKeyFor } from "./model/edits.js";
import { noteIdentity } from "./model/edits.js";
import { annoSnapshot } from "./model/edits.js";
import { tombstone } from "./model/edits.js";
import { tombKey } from "./model/edits.js";
import { saveLocalNotes } from "./model/edits.js";
import { setClipDir } from "./audio/clips.js";
import { splitClipAt } from "./audio/clips.js";
import { deleteClip } from "./audio/clips.js";
import { writeClips } from "./audio/clips.js";
import { titleCompare } from "./model/catalog.js";
import { romanValue } from "./model/catalog.js";
import { titleSortKey } from "./model/catalog.js";
import { resolveGameVault } from "./audio/voices.js";
import { instAlbums } from "./audio/voices.js";
import { instLibrary } from "./audio/voices.js";
import { sf2Font } from "./audio/voices.js";
import { instPlayer } from "./audio/voices.js";
import { gameVoicesInSong } from "./audio/voices.js";
import { instPlayerReady } from "./audio/voices.js";
import { instSamples } from "./audio/voices.js";
import { sf2VoicesInSong } from "./audio/voices.js";
import { sf2Module } from "./audio/voices.js";
import { sf2Fonts } from "./audio/voices.js";
import { instLibs } from "./audio/voices.js";
import { instWavs } from "./audio/voices.js";
import { instDecodeWav } from "./audio/voices.js";
import { INST_CHIPS } from "./audio/voices.js";
import { instFolder } from "./audio/voices.js";
import { sf2Bytes } from "./audio/voices.js";
import { albumStrip } from "./audio/transport.js";
import { stretchEnsureAll } from "./audio/clips.js";
import { scheduleClip } from "./audio/clips.js";
import { audioChaseNow } from "./audio/clips.js";
import { stretchEnsure } from "./audio/clips.js";
import { sfPreloadForSong } from "./audio/voices.js";
import { gamePreloadForSong } from "./audio/voices.js";
import { scheduleNote } from "./audio/voices.js";
import { gamePreloadTokens } from "./audio/voices.js";
import { sfWaitForSong } from "./audio/voices.js";
import { gameWaitForSong } from "./audio/voices.js";
import { stop } from "./audio/transport.js";
import { play } from "./audio/transport.js";
import { playGateTick } from "./audio/transport.js";
import { playGateKick } from "./audio/transport.js";
import { playGateWait } from "./audio/transport.js";
import { PLAY_GATE_GRACE } from "./audio/transport.js";
import { PLAY_GATE_MAX } from "./audio/transport.js";
import { gateSettled } from "./audio/transport.js";
import { gateWatched } from "./audio/transport.js";
import { gatePending } from "./audio/transport.js";
import { playGate } from "./audio/transport.js";
import { playGateActive } from "./audio/transport.js";
import { previewNote } from "./audio/voices.js";
import { applyAudioDirs } from "./audio/clips.js";
import { setSongTempo } from "./audio/clips.js";
import { applyBeatMap } from "./audio/clips.js";
import { audioEnsureFile } from "./audio/clips.js";
import { renderSongOffline } from "./audio/bounce.js";
import { offlineWaitForAssets } from "./audio/bounce.js";
import { filesMirrorFor } from "./model/versions.js";
import { transposeChordLabel } from "./theory/chords.js";
import { dropLocalKeyAt } from "./model/rollnotes.js";
import { adoptChordBand } from "./gen/analysis.js";
import { adoptKeyRegion } from "./gen/analysis.js";
import { adoptAllChords } from "./gen/analysis.js";
import { scheduleAnalysisRecompute } from "./gen/analysis.js";
import { loadEdits } from "./model/edits.js";
import { saveEdits } from "./model/edits.js";
import { foldOldOverlay } from "./model/edits.js";
import { insertTime } from "./model/selection.js";
import { deleteTime } from "./model/selection.js";
import { clearMultiSel } from "./model/selection.js";
import { duplicateSelectionInPlace } from "./model/selection.js";
import { selEditApply } from "./model/selection.js";
import { deleteSelection } from "./model/selection.js";
import { transposeTrack } from "./model/selection.js";
import { removeDuplicateNotes } from "./model/selection.js";
import { sweepStrandedClones } from "./model/selection.js";
import { copySelection } from "./model/selection.js";
import { pasteClipboard } from "./model/selection.js";
import { nudgeSelection } from "./model/selection.js";
import { diatonicShift } from "./model/selection.js";
import { divideSelection } from "./model/selection.js";
import { quantizeSelection } from "./model/selection.js";
import { cutSelection } from "./model/selection.js";
import { splitSelectionAt } from "./model/selection.js";
import { splitSelectionHalves } from "./model/selection.js";
import { joinSelection } from "./model/selection.js";
import { duplicateSelection } from "./model/selection.js";
import { resizeSelection } from "./model/selection.js";
import { openGapShift } from "./model/selection.js";
import { ridealongChordBands } from "./model/selection.js";
import { pasteAnnotations } from "./model/selection.js";
import { splitApply } from "./model/selection.js";
import { closeGap } from "./model/selection.js";
import { moveClip } from "./audio/clips.js";
import { trimClip } from "./audio/clips.js";
import { splitSelectedClipAtCursor } from "./audio/clips.js";
import { drGenerate } from "./gen/drummer.js";
import { bsGenerate } from "./gen/bassist.js";
import { applyTake } from "./gen/bassist.js";
import { subtractTombstones } from "./model/rollnotes.js";
import { mergeLocalAdditions } from "./model/rollnotes.js";
import { annotationsFor } from "./model/rollnotes.js";
import { resolveNoteWith } from "./model/rollnotes.js";
import { bakeTempos } from "./model/rollnotes.js";
import { bakeMeter } from "./model/rollnotes.js";
import { draftFingerprint } from "./model/versions.js";
import { cmpBar } from "./ui/chrome.js";
import { syncDurSeg } from "./ui/note-editor.js";
import { finalizeNotesImpl } from "./session/song.js";
import { reflectSongURL } from "./session/song.js";
import { loadSong } from "./session/song.js";
import { openDraft } from "./session/song.js";
import { setSong } from "./session/song.js";
import { rememberRecentSong } from "./session/song.js";
import { loadNotes } from "./session/song.js";
import { loadSongInner } from "./session/song.js";
import { fitViewImpl } from "./session/song.js";
import { updateSongMetaImpl } from "./session/song.js";
import { openDraftDoc } from "./session/song.js";
import { albumPrev } from "./session/album.js";
import { albumNext } from "./session/album.js";
import { albumLeave } from "./session/album.js";
import { albumClear } from "./session/album.js";
import { albumStart } from "./session/album.js";
import { armAlbumLink } from "./session/album.js";
import { albumPos } from "./session/album.js";
import { albumPlayIdx } from "./session/album.js";
import { albumAdvanceImpl } from "./session/album.js";
import { fillFolderSelect } from "./session/files.js";
import { openSaveForm } from "./session/files.js";
import { forkCurrentSong } from "./session/files.js";
import { saveSongAs } from "./session/files.js";
import { saveVersion } from "./session/files.js";
import { renameLocalKeys } from "./session/files.js";
import { folderChoices } from "./session/files.js";
import { localFolders } from "./session/files.js";
import { songRegionRight } from "./ui/chrome.js";
import { placeLassoBtn } from "./ui/chrome.js";
import { updateEditBtnVisImpl } from "./ui/chrome.js";
import { toggleHl } from "./ui/chrome.js";
import { updateLCD } from "./ui/chrome.js";
import { updateSubtitleImpl } from "./ui/chrome.js";
import { updateChipBtnImpl } from "./ui/chrome.js";
import { updateChipBtnInner } from "./ui/chrome.js";
import { openNoteList } from "./ui/notes.js";
import { renderNoteList } from "./ui/notes.js";
import { updateChordStale } from "./ui/notes.js";
import { useFileKey } from "./ui/notes.js";
import { renderGameInstNav } from "./ui/sheets.js";
import { instAudition } from "./ui/sheets.js";
import { gameInstUsedBySong } from "./ui/sheets.js";
import { sf2Registry } from "./ui/sheets.js";
import { instKeys } from "./ui/sheets.js";
import { sf2RegistryAdd } from "./ui/sheets.js";
import { renderInstSheet } from "./ui/sheets.js";
import { INST_SYS_ORDER } from "./ui/sheets.js";
import { gameSongRows } from "./ui/sheets.js";
import { songInstrumentRows } from "./ui/sheets.js";
import { currentSongGameContext } from "./ui/sheets.js";
import { usedInstruments } from "./ui/sheets.js";
import { usedInstrumentRows } from "./ui/sheets.js";
import { openDrummer } from "./ui/sheets.js";
import { openBassist } from "./ui/sheets.js";
import { bsRefresh } from "./ui/sheets.js";
import { drRefresh } from "./ui/sheets.js";
import { bsBuildControls } from "./ui/sheets.js";
import { drBuildControls } from "./ui/sheets.js";
import { wmFloat } from "./ui/wm.js";
import { wmDockBottomWindow } from "./ui/wm.js";
import { wmDockSide } from "./ui/wm.js";
import { makeWindow } from "./ui/wm.js";
import { wmSideDividerize } from "./ui/wm.js";
import { wmLayoutAll } from "./ui/wm.js";
import { wmCloseWindow } from "./ui/wm.js";
import { wmLayoutSide } from "./ui/wm.js";
import { wmLayoutTabs } from "./ui/wm.js";
import { wmSetSideModeFor } from "./ui/wm.js";
import { wmOpenMenu } from "./ui/wm.js";
import { trackToggle } from "./ui/trackbar.js";
import { saveTrackDir } from "./ui/trackbar.js";
import { saveVoices } from "./ui/trackbar.js";
import { renameTrack } from "./ui/trackbar.js";
import { toggleMixer } from "./ui/mixer.js";
import { renderMixer } from "./ui/mixer.js";
import { reorderTrack } from "./ui/mixer.js";
import { mixerStripEl } from "./ui/mixer.js";
import { mixerStripDragize } from "./ui/mixer.js";
import { openMixer } from "./ui/mixer.js";
import { closeMixer } from "./ui/mixer.js";
import { openVoiceMenu } from "./ui/voice-menu.js";
import { gameVoiceLabels } from "./ui/voice-menu.js";
import { gameVoiceLabel } from "./ui/voice-menu.js";
import { sf2VoiceLabels } from "./ui/voice-menu.js";
import { sf2VoiceLabel } from "./ui/voice-menu.js";
import { buildVoiceMenu } from "./ui/voice-menu.js";
import { buildGameVoicePicker } from "./ui/voice-menu.js";
import { openGameVoiceMenuTo } from "./ui/voice-menu.js";
import { renderSf2Nav } from "./ui/voice-menu.js";
import { sf2AuditionPreset } from "./ui/voice-menu.js";
import { buildSf2VoicePicker } from "./ui/voice-menu.js";
import { buildClipControls } from "./ui/voice-menu.js";
import { gameVaultResolved } from "./ui/voice-menu.js";
import { resolvedGameVaultSync } from "./ui/voice-menu.js";
import { renderTrackbarImpl } from "./ui/trackbar.js";
import { folderTree } from "./model/catalog.js";
import { subfolderKeys } from "./model/catalog.js";
import { nodeCount } from "./model/catalog.js";
import { publishedLabel } from "./model/catalog.js";
import { nodeAt } from "./model/catalog.js";
import { parentFolder } from "./model/catalog.js";
import { retireEdited } from "./model/edits.js";
import { pruneTombstones } from "./model/edits.js";
import { clearTombstonesFor } from "./model/edits.js";
import { clearTombstones } from "./model/edits.js";
import { jobsClearFinished } from "./ui/sheets.js";
import { jobStart } from "./ui/sheets.js";
import { jobsLoad } from "./ui/sheets.js";
import { cmpExit } from "./ui/chrome.js";
import { cmpEnter } from "./ui/chrome.js";
import { cmpShow } from "./ui/chrome.js";
import { askCommitLog } from "./ask/bridge.js";
import { askSave } from "./ask/bridge.js";
import { createComposition } from "./session/files.js";
import { makeItMine } from "./session/files.js";
import { editHereNow } from "./session/files.js";
import { forkClashTitle } from "./session/files.js";
installHooks(); // docs/split-phase2-plan.md §1 M1: before any init*() / top-level effect — every S.hooks port throws if called first
try {
  if (S.APP_BASE && document.head && !document.querySelector("base")) {
    const b = document.createElement("base"); b.href = S.APP_BASE;
    document.head.insertBefore(b, document.head.firstChild);
  }
} catch (e) {}
 // shown list only: drops a song that's gone from BOTH this device's drafts
// and the catalog — but only once the catalog has actually loaded (an empty
// CATALOG at boot means "don't know yet", not "gone"; a genuinely missing
// song still fails gracefully through loadSong's own error path)
function recentSongsForMenu() {
  const list = recentSongs();
  const catalogKnown = Object.keys(S.CATALOG).length > 0;
  const kept = list.filter(r => localStorage.getItem(draftStoreKey(r.key)) !== null || !catalogKnown || catalogHas(r.key));
  if (kept.length !== list.length) saveRecentSongsRaw(kept);
  return kept;
}
// the album shown beside each title: the catalog's own album name when the
// song is in it (same value updateSongBtn's breadcrumb uses), else the
// folder title the breadcrumb falls back to for a local-only song
function recentAlbumFor(key) { return groupOf(key) || folderTitle(folderOf(key)); }
try {
  const q = typeof location !== "undefined" && songPathFromURL(location.href);
  if (q) setDocTitle(titleCaseSlug(q.split("/").pop().replace(/\.midi?$/i, "")));
} catch (e) {}
// Night Roll — FF1 OST analysis player. READ NIGHT-ROLL.md FIRST:
// feature inventory, the .rollnotes format spec, this file's section map,
// and the project conventions (keys are Josh's discoveries — never pre-fill).
"use strict";
S.APP_MODE = (() => {
  try {
    const v = localStorage.getItem("ff1roll-mode");
    if (v === "learning" || v === "normal") return v; // never overwritten once set
    const mode = hasExistingNightRollPrefs() ? "learning" : "normal";
    localStorage.setItem("ff1roll-mode", mode);
    return mode;
  } catch (e) { return "learning"; } // storage denied: default to the law
})();
 if (typeof document !== "undefined" && document.body) {
  document.body.dataset.mode = S.APP_MODE;
}
 // File ▾ → "Open Recent ▸" expand state — same pattern/reasoning as vwOpenGroup just above
// UI refresh after an interactive mode flip (View ▾ toggle, Settings
// checkbox) — boot itself never calls this, it just reads APP_MODE above.
// Chrome density follow-up (2026-10-01 pm, Josh's ruling): the header's
// gold "🎓 Learning" tag (#modepill) is gone entirely — Learning mode is
// read from Settings → Other or View ▾ → Mode only, never a header badge.
function applyMode() {
  if (typeof document === "undefined") return;
  if (document.body) document.body.dataset.mode = S.APP_MODE; // vm harness has no body (sentinel) — see tests/harness.mjs
  const cb = document.getElementById("cfglearning");
  if (cb) cb.checked = S.APP_MODE === "learning";
  if (typeof S._keyEstCache !== "undefined") S._keyEstCache = null; // stale conf/label from the other mode
  // P6: Learning is the law — the Analyze layer (and any pending debounced
  // recompute of it) must stop existing the instant the mode flips, not
  // just stop being drawn (the spy test proves bsInferTimeline/estimateKey
  // never fire for it in Learning).
  if (typeof S.APP_MODE !== "undefined" && S.APP_MODE === "learning" && typeof S.analysisOn !== "undefined") {
    if (typeof S._analysisTimer !== "undefined" && S._analysisTimer) { clearTimeout(S._analysisTimer); S._analysisTimer = null; }
    S.analysisOn = false;
    S.analysisBands = {chords: [], key: null};
  }
  if (typeof S.song !== "undefined" && S.song) {
    finalizeNotes(); // rebuilds keyunset label + keysetest visibility for the new mode
    if (typeof updateSubtitle === "function") updateSubtitle();
    if (typeof draw === "function") draw();
  }
}
if (PERF_FLAGS.get("dpr")) { // override the source, not the call sites — every
  const forced = +PERF_FLAGS.get("dpr") || 1; // dpr read in the app picks it up
  try { Object.defineProperty(window, "devicePixelRatio", {get: () => forced, configurable: true}); }
  catch (err) { /* locked down: the flag simply does nothing */ }
}
         
 
                                        const HOLD_MS = 160; // hold-to-grab dwell (was 230 — "way too damn hard", 2026-08-24)
const HOLD_SLOP = 20;                                                                                             // rollnote being edited, or null for new
const RULER_RANGE_SLOP = 24;                                                           // An anchored menu/dropdown clamped against raw window.innerWidth could open
 S.RULER_W = RULER_W_ROLL;
S.STRIP_Y = BASE_RULER_H;
S.RULER_H = S.STRIP_Y + STRIP_H;
      // the band the Analyze sheet is currently open on
function setSecDepth(next) { // clamped stepper (the wrap-around cycle read as awkward)
  next = Math.max(0, Math.min(S.secMaxDepth - 1, next));
  if (next >= S.secMaxDepth - 1) localStorage.removeItem("ff1roll-secdepth-" + S.songKey);
  else localStorage.setItem("ff1roll-secdepth-" + S.songKey, String(next));
  finalizeNotes();
  setInfo(next >= S.secMaxDepth - 1 ? "all " + S.secMaxDepth + " section levels shown"
                                  : "showing " + (next + 1) + " of " + S.secMaxDepth + " section levels (deeper ones still drive the drums)");
  clampView(); draw();
  if (typeof renderViewMenu === "function") renderViewMenu();
}
function cycleSecDepth() { // the gutter chevron keeps its one-tap cycle (fold, fold, unfold-all)
  const cur = Math.min(secDepthCap(), S.secMaxDepth - 1);
  setSecDepth(cur - 1 < 0 ? S.secMaxDepth - 1 : cur - 1);
}
     

function annoRestore(str) {
  const arr = JSON.parse(str);
  S.rollnotes = deriveNoteTypes(arr.map(e => jsonToRawNote(e.j))).map(resolveNote);
  S.rollnotes.forEach((n, i) => { n.added = arr[i].a; });
}
(function migrateAlbumPaths() {
  const remap = v => v.replace(/^(ff1roll-(?:notes|edits|ts)-)?midi\//, "$1albums/final-fantasy-i/songs/")
                     .replace(/^(ff1roll-(?:notes|edits|ts)-)?compositions\//, "$1albums/compositions/");
  for (const k of Object.keys(localStorage)) {
    if (!/^ff1roll-(notes|edits|ts)-(midi|compositions)\//.test(k)) continue;
    const nk = remap(k);
    if (!localStorage.getItem(nk)) localStorage.setItem(nk, localStorage.getItem(k));
    localStorage.removeItem(k);
  }
  const last = localStorage.getItem("ff1roll-lastsong");
  if (last && /^(midi|compositions)\//.test(last))
    rememberLastSong(remap(last));
  // second wave (same day): ff1 filename prefix dropped, multiword names hyphenated
  const SONGS = "albums/final-fantasy-i/songs/";
  const RENAME = {ff1corneliacastle: "cornelia-castle", ff1gurguvolcano: "gurgu-volcano",
    ff1matouyascave: "matoyas-cave", ff1chaostemple: "chaos-temple",
    ff1floatingcastle: "floating-castle", ff1underwaterpalace: "underwater-palace",
    ff1gameover: "game-over"};
  const remap2 = v => v.replace(new RegExp("(" + SONGS.replace(/[/]/g, "\\/") + ")ff1([a-z]+)(\\.mid)"),
    (all, pre, base, ext) => pre + (RENAME["ff1" + base] || base) + ext);
  for (const k of Object.keys(localStorage)) {
    if (!/^ff1roll-(notes|edits|ts)-/.test(k) || !k.includes(SONGS + "ff1")) continue;
    const nk = remap2(k);
    if (nk !== k) {
      if (!localStorage.getItem(nk)) localStorage.setItem(nk, localStorage.getItem(k));
      localStorage.removeItem(k);
    }
  }
  const last2 = localStorage.getItem("ff1roll-lastsong");
  if (last2 && last2.includes(SONGS + "ff1"))
    rememberLastSong(remap2(last2));
  // third wave (2026-09-23, Josh's cleanup): two of his songs moved — every
  // per-song key rides along so no device shows an orphan draft
  const MOVED = {"albums/compositions/nightroll/town-theme.mid": "albums/compositions/nightroll/carnival.mid",
                 "albums/compositions/KeyChangeTest-07-26.mid": "albums/compositions/nightroll/KeyChangeTest-07-26.mid"};
  for (const k of Object.keys(localStorage)) {
    const m = k.match(/^(ff1roll-(?:notes|edits|ts|draft|tombs|lastsync)-)(.+)$/);
    if (!m || !MOVED[m[2]]) continue;
    const nk = m[1] + MOVED[m[2]];
    if (!localStorage.getItem(nk)) localStorage.setItem(nk, localStorage.getItem(k));
    localStorage.removeItem(k);
  }
  const last3 = localStorage.getItem("ff1roll-lastsong");
  if (last3 && MOVED[last3]) rememberLastSong(MOVED[last3]);
  // fourth wave (2026-09-27, "just folders"): whole folders moved under console
  // folders — every per-song key follows by prefix (MOVED_DIRS, defined with the
  // link parser); a capture's draft from imports/ is stamped as a capture so
  // it stays read-only (its new folder no longer says so by name)
  for (const k of Object.keys(localStorage)) {
    const m = k.match(/^(ff1roll-(?:notes|edits|ts|draft|tombs|lastsync|save|stash|ask)-)(.+)$/);
    if (!m) continue;
    const np = movedPath(m[2]);
    if (!np) continue;
    let v = localStorage.getItem(k);
    if (m[1] === "ff1roll-draft-" && m[2].startsWith("albums/imports/")) {
      try { const d = JSON.parse(v); if (d && typeof d === "object") { d.capture = true; v = JSON.stringify(d); } } catch (err) { /* keep as is */ }
      if (typeof idbDraftMove === "function") idbDraftMove(m[2], np); // big drafts keep their notes in IndexedDB
    }
    if (!localStorage.getItem(m[1] + np)) localStorage.setItem(m[1] + np, v);
    localStorage.removeItem(k);
  }
  const last4 = localStorage.getItem("ff1roll-lastsong");
  if (last4 && movedPath(last4)) rememberLastSong(movedPath(last4));
})();
// The first song a fresh device sees. Overworld on the web; the app edition
// ships only the starter albums (FF1 rips are not ours to sell), so a
// hardcoded path would fail there (Josh, 2026-09-27: "Couldn't open
// Overworld. Load failed" on the packaged shell's first launch).
function homeSong(all) {
  const ow = "albums/nes/final-fantasy-i/songs/overworld.mid";
  return all.includes(ow) ? ow : (all[0] || ow);
}
 function governingAt(match, at) { // latest matching annotation at or before the cursor (or tick `at`)
  const t = at === undefined ? curTick() : at;
  let hit = null;
  for (const n of S.rollnotes)
    if (match(n) && n.start <= t && (!hit || n.start >= hit.start)) hit = n;
  return hit;
}
document.getElementById("lcdtemposeg").addEventListener("click", () => {
  if (!S.song) return; // the song's opening tempo — always bar 1, not the cursor (Josh, 2026-10-01: "I almost always want the whole song"; a mid-song change is + Note)
  openEditor(governingAt(n => n.tempodir !== undefined, 0), "tempo", {atStart: true});
});
// meter and key are independent targets in the shared segment (Josh, 2026-08-19)
document.getElementById("lcdmeter").addEventListener("click", e => {
  if (!S.song) return;
  e.stopPropagation();
  openEditor(governingAt(n => !!n.tsdir, 0), "timesig", {atStart: true}); // bar 1, not the cursor (see the tempo segment)
});
document.getElementById("lcdkey").addEventListener("click", e => {
  if (!S.song) return;
  e.stopPropagation();
  const kn = governingAt(n => n.keydir !== undefined || n.keypartial, 0); // bar 1, not the cursor (see the tempo segment)
  openEditor(kn, kn ? undefined : "key", {atStart: true});
});

 
document.getElementById("trackmore").addEventListener("click", () => {
  S.trackExpand = !S.trackExpand;
  updateTrackMore();
});
if (typeof document !== "undefined" && document.body && typeof ResizeObserver === "function") {
  const tr = document.getElementById("trackrow");
  if (tr) new ResizeObserver(scheduleFitTrackRow).observe(tr); // the row's WIDTH changes with the window/dock; stacking only changes its height
  const tb = document.getElementById("trackbar");
  if (tb && typeof MutationObserver === "function") new MutationObserver(scheduleFitTrackRow).observe(tb, {childList: true}); // tracks added/removed change the need
}
// slide the whole chip cluster away when the row feels noisy (Josh, 2026-08-15)
{
  const slide = document.getElementById("trackslide");
  const tog = document.getElementById("tracktoggle");
  const apply = hidden => {
    slide.classList.toggle("off", hidden);
    tog.textContent = hidden ? "▸" : "◂";
    tog.setAttribute("aria-label", hidden ? "Show tracks" : "Hide tracks");
    if (!hidden) updateTrackMore();
  };
  tog.addEventListener("click", () => {
    const hidden = !slide.classList.contains("off");
    localStorage.setItem("ff1roll-tracks-hidden", hidden ? "1" : "0");
    apply(hidden);
  });
  // re-measure once the slide animation actually finishes — measuring at a
  // transitional width wrapped chips onto phantom rows (Josh's toggle bug)
  slide.addEventListener("transitionend", () => {
    if (!slide.classList.contains("off")) updateTrackMore();
  });
  apply(localStorage.getItem("ff1roll-tracks-hidden") === "1");
}
 
 
function finalizeLasso() {
  const r = S.lassoRect;
  S.lassoRect = null;
  if (!r) return;
  const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1);
  const y0 = Math.min(r.y0, r.y1), y1 = Math.max(r.y0, r.y1);
  const ppt = pxPerTick();
  let t0 = (x0 - S.RULER_W + S.view.x) / ppt;
  const t1 = (x1 - S.RULER_W + S.view.x) / ppt;
  // the box reaching into the ruler is what makes its bands part of the copy —
  // and only the LANES it covers: a box up to the chord row takes chords, not
  // the section row above it (Josh, 2026-09-13)
  // S.STRIP_Y, not S.RULER_H: reaching into the playhead strip (its own
  // gesture zone, no annotation lanes of its own) must not count as "into
  // the ruler" — only the bands above it do.
  S.lassoAnno = S.viewMode === "roll" && !fallActive() && y0 < S.STRIP_Y ? {t0, t1, y0, y1} : null;
  // union: a new box ADDS to the selection (taps toggle individuals; an
  // empty-space tap clears) — rectangle-only couldn't isolate interleaved
  // targets like undersea-shrine's offbeat pedal (Josh, 2026-08-07)
  const addSel = (ti, ni) => {
    const k = ti + ":" + ni;
    if (!S.multiSelKey.has(k)) { S.multiSel.push({ti, ni}); S.multiSelKey.add(k); }
  };
  if (fallActive()) {
    // fall geometry: x = key column, y = time (bottom edge = now, later above)
    const W = wrap.clientWidth, H = wrap.clientHeight;
    const nowSec = S.playing ? playSec() : tickToSec(S.song, S.playCursor);
    const pps = H / FALL_WINDOW;
    const sLo = nowSec + (H - y1) / pps, sHi = nowSec + (H - y0) / pps;
    const g = pianoGeom(W);
    const bw = g.wW * 0.6;
    S.song.tracks.forEach((tr, ti) => {
      if (!trackAudible(ti) || trackIsDrums(ti)) return;
      tr.notes.forEach((n, ni) => {
        if (n.gone) return;
        const white = WHITE_PCS.includes(n.p % 12);
        const nx0 = white ? g.wx[n.p] : g.wx[n.p - 1] + g.wW - bw / 2;
        if (nx0 + (white ? g.wW : bw) < x0 || nx0 > x1) return;
        if (tickToSec(S.song, n.t) < sHi && tickToSec(S.song, n.t + n.d) > sLo) addSel(ti, ni);
      });
    });
    t0 = secToTick(S.song, Math.max(0, sLo)); // key context for spelling comes from the box's start
  } else if (S.viewMode === "tracks") {
    // arrange lasso: time span × lane span — a box across lanes selects
    // across tracks (the advisor's ruling: selection IS the arrange currency)
    const tiLo = trackLaneAt(y0), tiHi = trackLaneAt(y1);
    const lo = tiLo < 0 ? 0 : tiLo, hi = tiHi < 0 ? S.song.tracks.length - 1 : tiHi;
    for (let ti = lo; ti <= hi; ti++) {
      if (!trackShown(ti)) continue;
      S.song.tracks[ti].notes.forEach((n, ni) => {
        if (!n.gone && n.t < t1 && n.t + n.d > t0) addSel(ti, ni);
      });
    }
  } else if (S.viewMode === "score" && S.scoreModel) {
    // hit-test the engraved notehead boxes themselves — the roll's linear
    // x->tick map doesn't hold on a score (noteheads aren't engraved
    // proportionally), and selecting whole staff bands by time range grabbed
    // notes far outside a narrow lasso (Josh, on Town's bass)
    const topY = S.RULER_H + 4 - (S.view.y || 0);
    const mbt = S.scoreModel.bt * ppt;
    const mOrigin = k => S.RULER_W + k * mbt - S.view.x - SCORE_PAD;
    const mLo = Math.max(0, Math.floor((x0 - S.RULER_W + S.view.x) / mbt) - 1);
    const mHi = Math.min(S.scoreModel.nMeasures - 1, Math.ceil((x1 - S.RULER_W + S.view.x) / mbt) + 1);
    for (let k = mLo; k <= mHi; k++) {
      const entry = S.scoreCache.get(k) || renderMeasure(k);
      if (!entry) continue;
      for (const g of entry.geo) {
        const gx0 = mOrigin(k) + g.x0, gx1 = mOrigin(k) + g.x1;
        const gy0 = topY + g.y0, gy1 = topY + g.y1;
        if (gx1 < x0 || gx0 > x1 || gy1 < y0 || gy0 > y1) continue;
        for (const ref of g.refs) {
          if (S.song.tracks[ref.ti].notes[ref.ni].gone) continue;
          addSel(ref.ti, ref.ni);
        }
      }
    }
  } else {
    const rHi = topRow() - Math.floor((y0 - S.RULER_H + S.view.y) / S.view.rowH);
    const rLo = topRow() - Math.floor((y1 - S.RULER_H + S.view.y) / S.view.rowH);
    S.song.tracks.forEach((tr, ti) => {
      if (!trackShown(ti)) return;
      tr.notes.forEach((n, ni) => {
        const rw = noteRow(ti, n.p);
        if (!n.gone && rw >= rLo && rw <= rHi && n.t < t1 && n.t + n.d > t0) addSel(ti, ni);
      });
    });
  }
  refreshSelInfo();
}
function toggleSel(hit) { // lasso-mode tap on a note: in/out of the selection
  const k = hit.ti + ":" + hit.ni;
  if (S.multiSelKey.has(k) || (S.selNote && S.selNote.ti === hit.ti && S.selNote.ni === hit.ni)) {
    S.multiSelKey.delete(k);
    S.multiSel = S.multiSel.filter(s => s.ti + ":" + s.ni !== k);
    if (S.selNote && S.selNote.ti === hit.ti && S.selNote.ni === hit.ni) S.selNote = null; // same gold ring, so tapping it out removes both
  } else {
    S.multiSel.push(hit);
    S.multiSelKey.add(k);
    previewNote(hit.ti, S.song.tracks[hit.ti].notes[hit.ni].p, S.song.tracks[hit.ti].notes[hit.ni].t);
  }
  refreshSelInfo();
}
 renderOctBtn(); // boot: correct checkmark before any selection ever runs refreshSelInfo
document.getElementById("octbtn").addEventListener("click", () => {
  S.selOctaves = !S.selOctaves;
  localStorage.setItem("ff1roll-seloct", S.selOctaves ? "1" : "0");
  refreshSelInfo();
});
function fallHitNote(pos) { // reverse of drawFall's geometry
  const W = wrap.clientWidth, H = wrap.clientHeight;
  const nowSec = S.playing ? playSec() : tickToSec(S.song, S.playCursor);
  const pps = H / FALL_WINDOW;
  const g = pianoGeom(W);
  const bw = g.wW * 0.6;
  let best = null;
  S.song.tracks.forEach((tr, ti) => {
    if (!trackAudible(ti) || trackIsDrums(ti)) return;
    tr.notes.forEach((n, ni) => {
      if (n.gone) return;
      const yB = H - (tickToSec(S.song, n.t) - nowSec) * pps;
      const yT = H - (tickToSec(S.song, n.t + n.d) - nowSec) * pps;
      if (pos.y < yT - 2 || pos.y > yB + 2) return;
      const white = WHITE_PCS.includes(n.p % 12);
      const x = white ? g.wx[n.p] + 1 : g.wx[n.p - 1] + g.wW - bw / 2;
      if (pos.x < x - 1 || pos.x > x + (white ? g.wW : bw) - 1) return;
      if (!best || !white) best = {ti, ni}; // black columns overlay white ones: narrower wins
    });
  });
  return best;
}
function hitTracksNote(pos) {
  const ti = trackLaneAt(pos.y);
  if (ti < 0 || pos.x < S.RULER_W) return null;
  const tick = (pos.x - S.RULER_W + S.view.x) / pxPerTick();
  const g = laneGeom(ti);
  const noteH = Math.max(3, (g.lh - 8) / Math.max(12, g.hi - g.lo));
  const tr = S.song.tracks[ti];
  for (let ni = tr.notes.length - 1; ni >= 0; ni--) {
    const n = tr.notes[ni];
    if (n.gone || tick < n.t - 8 / pxPerTick() || tick > n.t + n.d + 8 / pxPerTick()) continue;
    if (Math.abs(tracksNoteY(g, ti, n.p) - pos.y) <= Math.max(6, noteH)) return {ti, ni};
  }
  return null;
}
  function hitTracksClip(pos) { // {ti, ci, zone: "clip" | "clipL" | "clipR"} for the piece under the point, or null
  const ti = trackLaneAt(pos.y);
  if (ti < 0 || pos.x < S.RULER_W) return null;
  const tr = S.song.tracks[ti];
  if (tr.kind !== "audio" || !tr.clips.length) return null;
  for (let ci = tr.clips.length - 1; ci >= 0; ci--) {
    const {x0, x1} = clipSpanX(tr.clips[ci]);
    if (pos.x < x0 - 4 || pos.x > x1 + 4) continue;
    const edge = Math.max(8, Math.min(14, (x1 - x0) * 0.3)); // finger-sized edge zones, never the whole piece
    const zone = x1 - x0 < 24 ? "clip" : pos.x <= x0 + edge ? "clipL" : pos.x >= x1 - edge ? "clipR" : "clip";
    return {ti, ci, zone};
  }
  return null;
}

   function selectAllNotes() { // ⌘A: every visible note (hidden tracks stay out — H means out of reach)
  if (!S.song) return 0;
  S.multiSel = [];
  S.song.tracks.forEach((tr, ti) => { if (!trackShown(ti) || tr.kind === "audio") return; tr.notes.forEach((n, ni) => { if (!n.gone) S.multiSel.push({ti, ni}); }); });
  S.multiSelKey = new Set(S.multiSel.map(({ti, ni}) => ti + ":" + ni));
  S.selNote = null; S.lassoAnno = null;
  if (typeof refreshSelInfo === "function") refreshSelInfo();
  draw();
  return S.multiSel.length;
}
 function openInsertBars() {
  const bt = barTicks(), qt = beatTicks();
  document.getElementById("insb").value = Math.floor(S.playCursor / bt) + 1;
  document.getElementById("insq").value = Math.round(((S.playCursor % bt) / qt + 1) * 100) / 100;
  const row = document.getElementById("insunit");
  row.innerHTML = "";
  for (const u of ["bars", "beats", "16ths"]) {
    const b = document.createElement("button");
    b.textContent = u;
    b.className = "chip" + (S.insUnit === u ? " selected" : "");
    b.style.cssText = "min-height:44px;justify-content:center" +
      (S.insUnit === u ? ";background:var(--gold);color:#111;font-weight:700" : "");
    b.addEventListener("click", () => { S.insUnit = u; openInsertBars(); });
    row.appendChild(b);
  }
  document.getElementById("insbarsheet").classList.add("on");
}
document.getElementById("insgo").addEventListener("click", () => {
  const bt = barTicks(), qt = beatTicks();
  const b = Math.max(1, Math.round(+document.getElementById("insb").value || 1));
  const q = Math.max(1, +document.getElementById("insq").value || 1);
  const n = Math.max(1, Math.round(+document.getElementById("insn").value || 1));
  const T = Math.round((b - 1) * bt + (q - 1) * qt);
  const delta = n * (S.insUnit === "bars" ? bt : S.insUnit === "beats" ? qt : qt / 4);
  const k = insertTime(T, Math.round(delta));
  document.getElementById("insbarsheet").classList.remove("on");
  setInfo(k ? "inserted " + n + " " + S.insUnit + " at " + b + "." + q + " — " + k + " things moved (one undo undoes)"
            : "nothing to insert into — is this song editable?");
});
document.getElementById("insclose").addEventListener("click", () =>
  document.getElementById("insbarsheet").classList.remove("on"));
function openDeleteBars() {
  const bt = barTicks();
  document.getElementById("delb").value = Math.floor(S.playCursor / bt) + 1;
  document.getElementById("deln").value = 1;
  document.getElementById("delbarsheet").classList.add("on");
}
document.getElementById("delgo").addEventListener("click", () => {
  const bt = barTicks();
  const fromBar = Math.max(1, Math.round(+document.getElementById("delb").value || 1));
  const n = Math.max(1, Math.round(+document.getElementById("deln").value || 1));
  const r = deleteTime((fromBar - 1) * bt, n * bt);
  document.getElementById("delbarsheet").classList.remove("on");
  const where = n > 1 ? ("bar " + fromBar + "–" + (fromBar + n - 1)) : ("bar " + fromBar);
  setInfo(r ? where + " removed — everything after moved " + n + " bar" + (n === 1 ? "" : "s") + " earlier" +
               (r.movedToT ? "; " + r.movedToT + " annotation" + (r.movedToT === 1 ? "" : "s") + " moved to bar " + fromBar : "")
            : "nothing to delete from — is this song editable?");
});
document.getElementById("delclose").addEventListener("click", () =>
  document.getElementById("delbarsheet").classList.remove("on"));
function hitNote(pos) {
  const {tick, pitch} = posToTickPitch(pos);
  for (let ti = S.song.tracks.length - 1; ti >= 0; ti--) {
    if (!trackShown(ti)) continue;
    const tr = S.song.tracks[ti];
    for (let ni = 0; ni < tr.notes.length; ni++) {
      const n = tr.notes[ni];
      if (!n.gone && noteRow(ti, n.p) === pitch && tick >= n.t && tick <= n.t + Math.max(n.d, 8 / pxPerTick())) return {ti, ni};
    }
  }
  return null;
}
function scoreLassoTap(pos) { // lasso-mode tap on the score: toggle the notehead under it
  if (!S.scoreModel) return;
  const x0 = pos.x - 7, x1 = pos.x + 7, y0 = pos.y - 7, y1 = pos.y + 7;
  const ppt = pxPerTick();
  const topY = S.RULER_H + 4 - (S.view.y || 0);
  const mbt = S.scoreModel.bt * ppt;
  const mOrigin = k => S.RULER_W + k * mbt - S.view.x - SCORE_PAD;
  const mLo = Math.max(0, Math.floor((x0 - S.RULER_W + S.view.x) / mbt) - 1);
  const mHi = Math.min(S.scoreModel.nMeasures - 1, Math.ceil((x1 - S.RULER_W + S.view.x) / mbt) + 1);
  for (let k = mLo; k <= mHi; k++) {
    const entry = S.scoreCache.get(k) || renderMeasure(k);
    if (!entry) continue;
    for (const g of entry.geo) {
      const gx0 = mOrigin(k) + g.x0, gx1 = mOrigin(k) + g.x1;
      const gy0 = topY + g.y0, gy1 = topY + g.y1;
      if (gx1 < x0 || gx0 > x1 || gy1 < y0 || gy0 > y1) continue;
      for (const ref of g.refs) {
        if (S.song.tracks[ref.ti].notes[ref.ni].gone) continue;
        toggleSel({ti: ref.ti, ni: ref.ni});
        return;
      }
    }
  }
  clearMultiSel();
  S.selNote = null;
  setInfo("lasso: cleared");
  draw();
}
function beatLabel(beat) {
  const base = Math.floor(beat + 0.03);
  const frac = beat - base;
  const SYL = [[0, ""], [0.25, "e"], [0.5, "&"], [0.75, "a"]];
  for (const [f, s] of SYL) if (Math.abs(frac - f) < 0.06) return base + s;
  return beat.toFixed(2);
}
function noteLabel(ti, ni) {
  const n = S.song.tracks[ti].notes[ni];
  const bt = barTicks();
  const bar = Math.floor(n.t / bt) + 1;
  const beat = (n.t % bt) / beatTicks() + 1;
  const name = pitchName(n.p, sfAt(n.t));
  const tname = S.song.tracks[ti].name || "tr" + (ti+1);
  return name + " · bar " + bar + " beat " + beatLabel(beat) + " · " +
         (n.d / S.song.ppq).toFixed(2) + "q · vel " + n.v + " · " + tname + (n.added ? " · added" : "");
}
             if (typeof document !== "undefined" && document.getElementById("jobsbtn")) {
  document.getElementById("jobsbtn").addEventListener("click", () => { renderJobs(); document.getElementById("jobssheet").classList.add("on"); });
  document.getElementById("jobsclear").addEventListener("click", () => { jobsClearFinished(); renderJobs(); });
  document.getElementById("pubjobcancel").addEventListener("click", () => { if (S.pubJobShown) jobCancel(S.pubJobShown); renderPubJob(); });
  document.getElementById("pubjobclose").addEventListener("click", () => document.getElementById("pubjobsheet").classList.remove("on"));
  jobsOnChange(() => {
    if (document.getElementById("jobssheet").classList.contains("on")) renderJobs();
    if (document.getElementById("pubjobsheet").classList.contains("on")) renderPubJob();
  });
}
window.addEventListener("error", e => {
  if (BENIGN_ERRORS.test(e.message || "")) return;
  logErr("uncaught: " + e.message + (e.filename ? " (" + (e.filename.split("/").pop()) + ":" + e.lineno + ")" : ""));
});
window.addEventListener("unhandledrejection", e =>
  logErr("unhandled: " + (e.reason && e.reason.message || e.reason)));
document.getElementById("errbtn").addEventListener("click", () => {
  const lines = logLines();
  const max = askSeenMax().err; // Mark-as-read (2026-09-30): grey out lines already included in a "New since…" bridge context block, in ANY chat
  const list = document.getElementById("errlist");
  list.innerHTML = "";
  if (!lines.length) list.textContent = "No messages.";
  else for (const x of lines.slice().reverse()) {
    const d = document.createElement("div");
    d.style.marginBottom = "0.6em";
    d.textContent = logLine(x);
    if (x.id <= max) d.style.color = "var(--dim)";
    list.appendChild(d);
  }
  document.getElementById("errsheet").classList.add("on");
});
document.getElementById("errcopy").addEventListener("click", async () => { // the whole log, newest first, for pasting to Claude (Josh, 2026-09-27) — built from the data, not the rendered DOM (errlist is now one div per line, so its own textContent runs the lines together)
  const text = logLines().slice().reverse().map(logLine).join("\n\n") || "No messages.";
  const b = document.getElementById("errcopy");
  try { await navigator.clipboard.writeText(text); b.textContent = "Copied ✓"; }
  catch (err) { b.textContent = "⚠ couldn't copy"; }
  setTimeout(() => { b.textContent = "Copy all"; }, 1500);
});
document.getElementById("errclear").addEventListener("click", () => {
  appErrors.length = 0; appDebug.length = 0;
  document.getElementById("errbtn").style.display = "none";
  document.getElementById("errsheet").classList.remove("on");
});
 document.getElementById("noteinfo").addEventListener("click", async () => {
  if (!S.infoCopyText) { // no copy action on this message: the tap reveals it in full instead
    if (S.infoFull) {
      document.getElementById("infosheettext").textContent = S.infoFull;
      document.getElementById("infosheet").classList.add("on");
    }
    return;
  }
  let ok = true;
  try { await navigator.clipboard.writeText(S.infoCopyText); }
  catch (err) { // clipboard API denied: fall back to a hidden textarea
    try {
      const ta = document.createElement("textarea");
      ta.value = S.infoCopyText;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select(); ok = document.execCommand("copy");
      ta.remove();
    } catch (err2) { ok = false; }
  }
  const chip = document.querySelector("#noteinfo .copychip");
  if (chip) chip.textContent = ok ? "✓ copied" : "✗ copy failed";
});
// the Status window itself (#infosheet) had no way to copy its text at all
// (Josh, 2026-09-30: "I can't copy from the Status window") — the info strip
// already copies SOME messages (infoCopyText above); this covers the rest.
document.getElementById("infosheetcopy").addEventListener("click", ev => {
  ev.stopPropagation();
  askCopyText(S.infoFull || document.getElementById("infosheettext").textContent, document.getElementById("infosheetcopy"));
});

 // Roll zoom-out clamp (Josh, 2026-08-06): pinch-out stops once the whole song
// is in view — per axis, flush to the song's own extents (chop-trimmed), no
// padding. While time still overflows, both axes zoom; once every bar fits,
// further pinch-out only reveals pitch; once every note is visible, nothing.
function songPitchExtent() { // lowest..highest sounding pitch of the (trimmed) song
  let lo = Infinity, hi = -Infinity;
  S.song.tracks.forEach(tr => tr.notes.forEach(n => {
    if (!n.gone) { if (n.p < lo) lo = n.p; if (n.p > hi) hi = n.p; }
  }));
  return lo <= hi ? {lo: Math.max(S.PMIN, lo), hi: Math.min(S.PMAX, hi)} : {lo: 55, hi: 79};
}
 function scrubTo(pos) {
  const snap = cursorDragSnapTicks(); // 32nds (triplet/custom grid while active) — the fine path
  const tick = (pos.x - S.RULER_W + S.view.x) / pxPerTick();
  S.playCursor = Math.max(0, Math.round(tick / snap) * snap);
  updateSubtitle();
  draw();
}
// a ruler (or playhead strip) TAP's landing: while rolling, seek there like
// the transport does; at rest, just move the cursor. Shared so the strip's
// tap-to-move reuses exactly what the ruler's own tap already did.
function seekOrMoveCursor(target, opts = {}) {
  if (S.playing) { stop(); play(tickToSec(S.song, target), opts).catch(() => {}); }
  else { S.playCursor = target; updateSubtitle(); draw(); }
}
// iOS Safari ignores user-scalable=no: kill page-level pinch zoom explicitly,
// or a missed gesture zooms the whole page and hides the footer.
for (const ev of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(ev, e => e.preventDefault(), {passive: false});
}
document.addEventListener("touchmove", e => {
  if (e.touches.length > 1) e.preventDefault();
}, {passive: false});
document.addEventListener("touchend", e => {
  const now = Date.now();
  if (now - S.lastTapEnd < 350 && !e.target.closest("button, select, input, textarea, a"))
    e.preventDefault();
  S.lastTapEnd = now;
}, {passive: false, capture: true});

function placePencilNote(pp) { // deferred pencil: called by the dwell timer or a clean tap
  const tr = S.song.tracks[S.selTrack];
  if (tr.kind === "audio") { setInfo("that track is a recording — pick a MIDI track to pencil on"); return; }
  // a note already at this tick+pitch: tapping it again must not stack a twin
  // (Josh, 2026-09-12) — hand back the existing one so a drag still stretches it
  const dup = tr.notes.findIndex(n => !n.gone && n.t === pp.t && n.p === pp.pitch);
  if (dup >= 0) { previewNote(S.selTrack, pp.pitch, pp.t); return {ti: S.selTrack, ni: dup, t: pp.t, snap: pp.snap, existing: true}; }
  const added = !isComposition();
  tr.notes.push({t: pp.t, d: pp.snap, p: pp.pitch, v: S.pencilVel, added});
  if (S.song.rawNotes) S.song.rawNotes[S.selTrack].push({t: pp.t + S.chopS, d: pp.snap, p: pp.pitch, v: S.pencilVel, added});
  pushUndo({kind: "add", ti: S.selTrack, ni: tr.notes.length - 1});
  previewNote(S.selTrack, pp.pitch, pp.t);
  draw();
  return {ti: S.selTrack, ni: tr.notes.length - 1, t: pp.t, snap: pp.snap};
}
canvas.addEventListener("pointerdown", e => {
  if (fallActive() && !S.lassoMode) return; // fall rides the playhead — no pan/zoom; lasso still works
  // a PRIMARY pointer starts a new gesture: whatever an earlier one left
  // behind (a lift the canvas never heard) is gone. A stale drag made the next
  // touch a "second finger", so every drag zoomed (Josh, 2026-09-30, on his
  // iPad: "dragging only controls zoom"; couldn't lasso or range)
  // palm rejection: while the Pencil is down, a touch is the hand resting on
  // the glass, not a second finger for a pinch (checked first — a palm is
  // "primary" too: isPrimary is per pointer type)
  if (S.drag && S.drag.ptype === "pen" && e.pointerType === "touch") return;
  if (e.isPrimary && (S.pinch || (S.drag && S.drag.ptype === e.pointerType))) { logDebug("gesture: cleared a stale " + (S.pinch ? "pinch" : "drag") + " on a new touch"); clearTimeout(S.drag && S.drag.holdTimer); S.drag = null; S.pinch = null; }
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {} // Safari can refuse mid-gesture
  if (S.pinch) return; // third finger: ignore
  if (S.drag && S.drag.id !== e.pointerId) {
    clearTimeout(S.drag.holdTimer);
    // the first finger wasn't a scroll after all — undo whatever it started
    // (a second finger means "pan/zoom", even with pencil or select armed)
    if (S.drag.pencil && !S.drag.pencil.existing) { // remove the just-penciled note and its undo entry
      const pn = S.drag.pencil;
      S.song.tracks[pn.ti].notes.splice(pn.ni, 1);
      if (S.song.rawNotes) S.song.rawNotes[pn.ti].pop();
      const u = S.editUndo[S.editUndo.length - 1];
      if (u && u.kind === "add" && u.ti === pn.ti && u.ni === pn.ni) S.editUndo.pop();
    }
    if (S.drag.noteEdit) { // put every grabbed note back where it was
      S.drag.noteEdit.items.forEach((it, i) => {
        const o = S.drag.noteEdit.orig[i];
        it.n.t = o.t; it.n.d = o.d; it.n.p = o.p;
      });
    }
    if (S.drag.bandEdge) { // restore the band's original span
      const be = S.drag.bandEdge;
      setAnchorBQ(be.n, be.s0);
      setEndBQ(be.n, be.e0);
      resolveNote(be.n);
    }
    S.lassoRect = null;
    S.pinch = {a: {id: S.drag.id, x: S.drag.x, y: S.drag.y},
             b: {id: e.pointerId, x: e.clientX, y: e.clientY},
             pxq: S.view.pxq, vx: S.view.x, rowH0: S.view.rowH, vy: S.view.y};
    S.pinch.dx0 = Math.abs(S.pinch.a.x - S.pinch.b.x);
    S.pinch.dy0 = Math.abs(S.pinch.a.y - S.pinch.b.y);
    S.pinch.mid0x = (S.pinch.a.x + S.pinch.b.x) / 2 - S.RULER_W; // fixed anchor: parallel fingers PAN
    S.pinch.mid0y = (S.pinch.a.y + S.pinch.b.y) / 2 - S.RULER_H;
    S.drag = null;
    return;
  }
  const p = evtPos(e);
  // a mouse press is deliberate; so is an Apple Pencil touch (iPadOS habit:
  // the pen draws, fingers navigate — 2026-09-29; device pref, default on).
  // A finger still dwells: a fast finger stroke pans
  const instantGrab = e.pointerType === "mouse" || (e.pointerType === "pen" && penInstant());
  let lasso = S.lassoMode && !!S.song && (fallActive() || p.y >= S.RULER_H) &&
              !cursorHandleHit(p); // the triangle outranks the lasso (Josh, 2026-08-22)
  let noteEdit = null, pendingEdit = null;
  // a drag that STARTS on a selected note moves the selection even in lasso
  // mode (drag from empty space still draws a box; a tap still toggles)
  if (editableSong() && (S.mode === "select" || lasso) && S.viewMode !== "score" && !fallActive() && p.y >= S.RULER_H) {
    const hit = S.viewMode === "tracks" ? hitTracksNote(p) : hitNote(p);
    const hitKey0 = hit ? hit.ti + ":" + hit.ni : null;
    const wasSelected = !!hit && S.multiSelKey.has(hitKey0);
    if (hit && !lasso && S.multiSel.length && !wasSelected) {
      // grabbing a note OUTSIDE the selection reselects just it (Logic
      // behavior) — but only when the grab actually ARMS (below), so a fast
      // pan across notes never churns the selection (Josh, 2026-08-24)
      S.selNote = hit;
    }
    if (hit && (wasSelected || !lasso)) {
      if (!S.multiSel.length) S.selNote = hit; // single note is draggable too
      gridFollowNote(S.song.tracks[hit.ti].notes[hit.ni]); // before any move math reads the grid
      if (e.altKey) duplicateSelectionInPlace(); // option-drag = drag out a copy
      const items = wasSelected || !S.multiSel.length ? selEditItems()
        : [{ti: hit.ti, ni: hit.ni, n: S.song.tracks[hit.ti].notes[hit.ni]}];
      if (items.length) {
        const hn = S.song.tracks[hit.ti].notes[hit.ni];
        const tickHere = posToTickPitch(p).tick;
        const edgeOk = hn.d * pxPerTick() >= 24 && !e.altKey; // tiny notes are all move handle
        const nearEnd = edgeOk && Math.abs(tickHere - (hn.t + hn.d)) < 8 / pxPerTick();
        const nearStart = edgeOk && !nearEnd && Math.abs(tickHere - hn.t) < 8 / pxPerTick();
        pendingEdit = {kind: nearEnd ? "resize" : nearStart ? "resizeL" : "move",
                       orig: items.map(({ti, ni, n: nn}) => ({ti, ni, t: nn.t, d: nn.d, p: nn.p})),
                       items, hitKey: hitKey0, reselect: !wasSelected};
        // a SELECTED note grabs instantly for every pointer — tap once, then
        // drag; the dwell is only for cold grabs (Josh: "way too damn hard")
        if (instantGrab || wasSelected) { armNoteEdit(pendingEdit); noteEdit = pendingEdit; pendingEdit = null; }
        lasso = false;
      }
    }
  }
  // a clip slides in time like a note — in Select mode only, like a note: with no
  // tool armed a drag over it pans (Josh, 2026-09-16: a pan moved his take to bar 5)
  if (editableSong() && S.mode === "select" && S.viewMode === "tracks" && !noteEdit && !pendingEdit && !lasso && p.y >= S.RULER_H && p.x >= S.RULER_W) {
    const ch = hitTracksClip(p); // selected = instant grab, cold = dwell; edges trim, the body moves
    if (ch) {
      const wasSel = selClipIs(ch.ti, ch.ci);
      pendingEdit = {kind: wasSel ? ch.zone : "clip", ti: ch.ti, ci: ch.ci, items: [], orig: [], reselect: false}; // edges only on a selected piece
      if (instantGrab || wasSel) { noteEdit = pendingEdit; pendingEdit = null; }
      S.selClip = {ti: ch.ti, ci: ch.ci};
    }
  }
  if (S.viewMode === "tracks" && p.x < S.RULER_W && p.y >= S.RULER_H && S.song) { // lane header column
    const ti = trackLaneAt(p.y);
    if (ti >= 0) {
      const g = laneGeom(ti);
      const ly = p.y - g.y0;
      if (ly >= 22 && ly <= 42 && p.x >= 8 && p.x <= 30) { // M
        trackToggle(ti, "muted");
        S.drag = null; return;
      }
      if (ly >= 22 && ly <= 42 && p.x >= 34 && p.x <= 56) { // S
        trackToggle(ti, "solo");
        S.drag = null; return;
      }
      if (g.lh >= 56 && ly >= 22 && ly <= 42 && p.x >= 56 && p.x <= 126) { // fader
        S.drag = {id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY,
                moved: false, trFader: {ti}, spos: p};
        return;
      }
      S.drag = {id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY,
              moved: false, trHeader: {ti}, spos: p};
      return;
    }
  }
  if (S.viewMode === "roll" && p.x < S.RULER_W && p.y >= S.RULER_H && songHasDrums()) { // grab the lane by its gutter labels
    const row = topRow() - Math.floor((p.y - S.RULER_H + S.view.y) / S.view.rowH);
    if (inKitLane(row)) {
      S.drag = {id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY,
              moved: false, lane: {y0: e.clientY, top0: kitLaneTop()}, spos: p};
      return;
    }
  }
  let pencil = null, pendingPencil = null; // pencil-drag: note at finger-down, stretch as you drag
  if (editableSong() && S.mode === "pencil" && S.viewMode === "roll" && !fallActive() && !lasso && p.y >= S.RULER_H) {
    const {tick, pitch: row} = posToTickPitch(p);
    const kit = trackIsDrums(S.selTrack);
    const li = kitLaneTop() - row; // lane slot index when the tap lands in the docked lane
    const pitch = kit ? (li >= 0 && li < kitSlots().length ? kitSlots()[li] : -1)
                      : (row >= S.PMIN && row <= S.PMAX && !inKitLane(row) ? row : -1);
    if (pitch >= (kit ? 0 : S.PMIN) && pitch <= 127 && tick >= 0) {
      const snap = S.gridDiv ? moveSnapTicks() : pencilTicks(); // custom grid: a tap = one cell
      const t = gridCellStart(tick); // the CELL you touch, not the nearest line —
      // tapping mid-gap between two notes lands the note IN the gap (rounding made only edges work)
      pendingPencil = {pitch, t, snap}; // created on dwell or a clean tap — never by a fast stroke
      if (instantGrab) pencil = placePencilNote(pendingPencil), pendingPencil = null;
    }
  }
  // Grab a section/chord band by its edge (roll view, any song). This used to
  // require editableSong(), which conflated "the MIDI is editable" with "this
  // annotation is mine" — so Josh could not adjust a section boundary on an
  // FF1 song, the songs he annotates most (2026-08-25). A band lives in the
  // .rollnotes sidecar; dragging it touches zero MIDI bytes, and the drop path
  // is the same finalizeNotes + saveLocalNotes his FF1 notes already use.
  let bandEdge = null;
  if (S.song && S.viewMode !== "score" && !fallActive() && !noteEdit && !pencil &&
      p.y >= BASE_RULER_H && p.y < S.STRIP_Y) { // the band rows only — not the playhead strip below them
    const laneAt = Math.floor((p.y - BASE_RULER_H) / LANE_H);
    const tk = posToTickPitch(p).tick, ppt = pxPerTick();
    const band = S.rollnotes.find(n => (n.section || n.chord) && n.lane === laneAt &&
      (Math.abs((n.start - tk) * ppt) < 10 || Math.abs((n.end - tk) * ppt) < 10));
    if (band) bandEdge = {n: band,
      side: Math.abs((band.end - tk) * ppt) <= Math.abs((band.start - tk) * ppt) ? "end" : "start",
      s0: band.start, e0: band.end, pre: annoSnapshot()};
  }
  let rangeEdge = null; // grab the cycle highlight by an END and stretch it
  if (!lasso && !noteEdit && !pendingEdit && !pencil && !pendingPencil && !bandEdge &&
      S.song && p.y < BASE_RULER_H && S.rangeSel && S.rangeSel.b > S.rangeSel.a && S.viewMode !== "score") {
    const ppt = pxPerTick();
    const ax = S.RULER_W + S.rangeSel.a * ppt - S.view.x, bx = S.RULER_W + S.rangeSel.b * ppt - S.view.x;
    if (Math.abs(p.x - bx) < 12) rangeEdge = "b";
    else if (Math.abs(p.x - ax) < 12) rangeEdge = "a";
  }
  S.drag = {id: e.pointerId, ptype: e.pointerType, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false,
          lasso, noteEdit, pencil, bandEdge, pendingEdit, pendingPencil, rangeEdge,
          cursor: !lasso && !noteEdit && !pendingEdit && !pencil && !pendingPencil && !bandEdge && !rangeEdge && cursorHit(p),
          ruler: !lasso && !noteEdit && !pendingEdit && !pencil && !pendingPencil && !bandEdge && !rangeEdge && !!S.song && p.y < BASE_RULER_H,
          // the playhead strip, between the ruler/bands and the notes (Josh,
          // 2026-10-03): tap moves the cursor, drag scrubs — NEVER touches
          // rangeSel (that's the whole point — the ruler above still parks
          // it). No viewMode exclusion: same linear-tick approximation the
          // ruler's own tap/drag already uses in Score.
          stripCursor: !lasso && !noteEdit && !pendingEdit && !pencil && !pendingPencil && !bandEdge && !rangeEdge &&
                     !!S.song && !fallActive() && p.y >= S.STRIP_Y && p.y < S.RULER_H,
          spos: p};
  if (pendingEdit || pendingPencil) { // hold-to-grab: dwell arms the edit; a fast stroke pans
    const d = S.drag;
    d.holdTimer = setTimeout(() => {
      // pending survives small jitter (moved flips at 8px, pending dies at
      // HOLD_SLOP) — only a real swipe or a finished gesture cancels the arm
      if (S.drag !== d || (!d.pendingEdit && !d.pendingPencil)) return;
      if (d.pendingEdit) {
        armNoteEdit(d.pendingEdit);
        d.noteEdit = d.pendingEdit; d.pendingEdit = null;
        // the dwell armed — SAY so, or moving a beat early silently pans instead
        // (Josh, 2026-08-22: "sometimes I did [hold] and it was still difficult")
        const k = d.noteEdit.items.length;
        setInfo("✊ grabbed " + k + " note" + (k === 1 ? "" : "s") + " — drag to move");
        previewNote(d.noteEdit.items[0].ti, d.noteEdit.items[0].n.p, d.noteEdit.items[0].n.t); // audible arm cue
      }
      else if (d.pendingPencil) { d.pencil = placePencilNote(d.pendingPencil); d.pendingPencil = null; }
      draw();
    }, HOLD_MS);
  }
});
canvas.addEventListener("pointermove", e => {
  if (S.pinch) {
    const pt = S.pinch.a.id === e.pointerId ? S.pinch.a : S.pinch.b.id === e.pointerId ? S.pinch.b : null;
    if (!pt) return;
    pt.x = e.clientX; pt.y = e.clientY;
    // per-axis zoom: horizontal finger spread scales time, vertical spread
    // scales pitch rows (roll only). PAD damps the axis the fingers are
    // nearly aligned on, so a one-axis pinch doesn't wobble the other.
    const PAD = 40;
    const sx = (Math.abs(S.pinch.a.x - S.pinch.b.x) + PAD) / (S.pinch.dx0 + PAD);
    const midX = (S.pinch.a.x + S.pinch.b.x) / 2 - S.RULER_W;
    const floorX = S.viewMode === "score" ? minPxq() : pxqFloor();
    const newPxq = Math.min(400, Math.max(floorX, S.pinch.pxq * sx));
    // anchored at the gesture's STARTING midpoint: spreading zooms around it,
    // moving both fingers together pans — so two fingers always scroll, even
    // with pencil or select armed (Josh, 2026-08-19: sweeping scrolls misfired)
    S.view.x = (S.pinch.vx + S.pinch.mid0x) * (newPxq / S.pinch.pxq) - midX;
    S.view.pxq = newPxq;
    if (S.viewMode !== "score" && newPxq === floorX) S.view.x = 0; // flush: bar 1 at the left edge
    if (S.viewMode === "roll") { // roll rows only — score staves and tracks lanes are fixed-height
      const sy = (Math.abs(S.pinch.a.y - S.pinch.b.y) + PAD) / (S.pinch.dy0 + PAD);
      const midY = (S.pinch.a.y + S.pinch.b.y) / 2 - S.RULER_H;
      const floorY = rowHFloor();
      const newRowH = Math.min(32, Math.max(floorY, S.pinch.rowH0 * sy));
      S.view.y = (S.pinch.vy + S.pinch.mid0y) * (newRowH / S.pinch.rowH0) - midY;
      S.view.rowH = newRowH;
      if (newRowH === floorY) S.view.y = (topRow() - dispPitchExtent().hi - ROLL_AIR) * newRowH; // top row + air below the ruler
    }
    clampView(); draw();
    return;
  }
  if (!S.drag || S.drag.id !== e.pointerId) return;
  const dx = e.clientX - S.drag.x, dy = e.clientY - S.drag.y;
  const trav = Math.abs(e.clientX - S.drag.sx) + Math.abs(e.clientY - S.drag.sy);
  if (trav > 8) S.drag.moved = true;
  if (trav > HOLD_SLOP && (S.drag.pendingEdit || S.drag.pendingPencil)) {
    S.drag.pendingEdit = S.drag.pendingPencil = null; // a real swipe, not pen jitter: it's a scroll
    clearTimeout(S.drag.holdTimer);
  }
  if (S.drag.moved) {
    if (S.drag.lasso) {
      const p = evtPos(e);
      S.lassoRect = {x0: S.drag.spos.x, y0: S.drag.spos.y, x1: p.x, y1: p.y};
      draw();
    }
    else if (S.drag.trFader) { // lane fader: live while dragging, persist on release
      const ti = S.drag.trFader.ti;
      const v = Math.max(0, Math.min(1.5, ((evtPos(e).x - 62) / 56) * 1.5));
      S.song.tracks[ti].vol = Math.abs(v - 1) < 0.04 ? undefined : Math.round(v * 100) / 100;
      updateTrackGains();
      draw();
    }
    else if (S.drag.lane) { // drag the kit lane anywhere; it pins there for this song
      const dRow = Math.round((S.drag.lane.y0 - e.clientY) / S.view.rowH);
      S.laneOverride = Math.min(S.PMAX - 4, Math.max(S.PMIN - 2, S.drag.lane.top0 + dRow));
      draw();
    }
    else if (S.drag.pencil && !S.drag.pencil.existing) { // stretch the just-penciled note under the finger, on the fine grid
      const pn = S.drag.pencil, nn = S.song.tracks[pn.ti].notes[pn.ni];
      const g = moveSnapTicks(); // 16ths (or triplet steps) — not the coarse tap length
      const tickHere = posToTickPitch(evtPos(e)).tick;
      nn.d = Math.max(g, Math.round((tickHere - pn.t) / g) * g);
      const rn = S.song.rawNotes && nn.ri !== undefined && S.song.rawNotes[pn.ti][nn.ri];
      if (rn) rn.d = nn.d;
      draw();
    }
    else if (S.drag.noteEdit) { // 16th grid — or triplet steps while a T duration is active
      const p = evtPos(e);
      const snap = moveSnapTicks();
      const dT = Math.round((p.x - S.drag.spos.x) / pxPerTick() / snap) * snap;
      if (S.drag.noteEdit.kind === "clip" || S.drag.noteEdit.kind === "clipL" || S.drag.noteEdit.kind === "clipR") {
        S.tracksGhost = {dT, dLane: 0, zone: S.drag.noteEdit.kind}; // ghost only; the annotation rewrites on release
        draw();
      }
      else if (S.drag.noteEdit.kind === "move" && S.viewMode === "tracks") {
        // arrange drag is a GHOST — commit on release (live retrack would churn
        // the {ti,ni} selection under our feet; advisor's structural ruling)
        const snap = moveSnapTicks();
        const dT = Math.round((p.x - S.drag.spos.x) / pxPerTick() / snap) * snap;
        let dLane = Math.round((p.y - S.drag.spos.y) / tracksLaneH());
        const fromTi = S.drag.noteEdit.items[0].ti;
        const tgt = fromTi + dLane;
        if (tgt < 0 || tgt >= S.song.tracks.length ||
            trackIsDrums(tgt) !== trackIsDrums(fromTi) ||
            S.song.tracks[tgt].kind === "audio") dLane = 0; // compatible lanes only; notes never land in a clip lane
        S.tracksGhost = {dT, dLane};
        draw();
      }
      else if (S.drag.noteEdit.kind === "move") {
        const dP = Math.round((S.drag.spos.y - p.y) / S.view.rowH);
        // absolute snap: the GRABBED note lands ON grid lines (an off-phase
        // note — born on a custom grid — could never reach the "and of 1" by
        // relative steps; Josh, 2026-08-24); mates keep their offsets
        const gi = S.drag.noteEdit.orig.findIndex((o, i) => {
          const it = S.drag.noteEdit.items[i]; return it.ti + ":" + it.ni === S.drag.noteEdit.hitKey;
        });
        const go = S.drag.noteEdit.orig[gi] || S.drag.noteEdit.orig[0];
        const dTr = (p.x - S.drag.spos.x) / pxPerTick();
        const dMove = snapTickAbs(go.t + dTr) - go.t;
        for (let i = 0; i < S.drag.noteEdit.items.length; i++) {
          const it = S.drag.noteEdit.items[i], o = S.drag.noteEdit.orig[i];
          it.n.t = Math.max(0, o.t + dMove);
          it.n.p = trackIsDrums(it.ti) ? drumStep(o.p, -dP) // lane rows run opposite to slot order
                                       : Math.min(S.PMAX, Math.max(S.PMIN, o.p + dP));
        }
      } else if (S.drag.noteEdit.kind === "resizeL") { // left edge: end stays put
        const minD = Math.max(24, Math.round(S.song.ppq / 8));
        const gi = S.drag.noteEdit.orig.findIndex((o, i) => {
          const it = S.drag.noteEdit.items[i]; return it.ti + ":" + it.ni === S.drag.noteEdit.hitKey;
        });
        const go = S.drag.noteEdit.orig[gi] || S.drag.noteEdit.orig[0];
        const edgeT = Math.round((go.t + dT) / snap) * snap; // absolute: land ON lines
        const dEdge = edgeT - go.t;
        for (let i = 0; i < S.drag.noteEdit.items.length; i++) {
          const it = S.drag.noteEdit.items[i], o = S.drag.noteEdit.orig[i];
          const nt = Math.max(0, Math.min(o.t + dEdge, o.t + o.d - minD));
          it.n.t = nt;
          it.n.d = o.d + (o.t - nt);
        }
      } else {
        const minD = Math.max(24, Math.round(S.song.ppq / 8));
        const gi = S.drag.noteEdit.orig.findIndex((o, i) => {
          const it = S.drag.noteEdit.items[i]; return it.ti + ":" + it.ni === S.drag.noteEdit.hitKey;
        });
        const go = S.drag.noteEdit.orig[gi] || S.drag.noteEdit.orig[0];
        const edgeT = Math.round((go.t + go.d + dT) / snap) * snap; // absolute: land ON lines
        const dEdge = edgeT - (go.t + go.d);
        for (let i = 0; i < S.drag.noteEdit.items.length; i++) {
          const it = S.drag.noteEdit.items[i], o = S.drag.noteEdit.orig[i];
          it.n.d = Math.max(minD, o.d + dEdge);
        }
      }
      draw();
    }
    else if (S.drag.rangeEdge) { // stretch the cycle by its end — bar-magnetic, stays armed
      const tk = rulerSnapX(evtPos(e).x);
      const min16 = Math.round(S.song.ppq / 4);
      if (S.drag.rangeEdge === "a") S.rangeSel.a = Math.max(0, Math.min(tk, S.rangeSel.b - min16));
      else S.rangeSel.b = Math.max(tk, S.rangeSel.a + min16);
      S.rangeSel.off = false; // stretching re-arms a parked cycle
      draw();
    }
    else if (S.drag.bandEdge) {
      const be = S.drag.bandEdge, n = be.n;
      const tk = tickAtX(evtPos(e).x, Math.round(S.song.ppq / 4)); // 16ths, like ruler selects
      if (be.side === "end") setEndBQ(n, Math.max(be.s0 + beatTicks(), tk));
      else setAnchorBQ(n, Math.min(Math.max(0, tk), be.e0 - beatTicks()));
      resolveNote(n);
      draw();
    }
    else if (S.drag.cursor || S.drag.stripCursor) scrubTo(evtPos(e));
    else if (S.drag.ruler) { // drag along the ruler = select a beat range
      // a finger placing the cursor wobbles past the 8px "moved" mark; under
      // RULER_RANGE_SLOP it is still that tap, not a 16th-note cycle (Josh,
      // 2026-10-02: "I'm always accidentally selecting a 16th note … then
      // press play and it loops back-and-forth super fast")
      if (!S.drag.rulerRange && Math.abs(evtPos(e).x - S.drag.spos.x) < RULER_RANGE_SLOP) return;
      S.drag.rulerRange = true;
      const a = rulerSnapX(S.drag.spos.x);
      const b = rulerSnapX(evtPos(e).x);
      S.rangeSel = a === b ? null : {a: Math.min(a, b), b: Math.max(a, b), cycle: true}; // drags arm the cycle
      draw();
    }
    else { S.view.x -= dx; S.view.y -= dy; S.followFree = true; clampView(); draw(); }
  }
  S.drag.x = e.clientX; S.drag.y = e.clientY;
});
function endPointer(e) {
  if (S.pinch && (S.pinch.a.id === e.pointerId || S.pinch.b.id === e.pointerId)) {
    // one finger lifted: hand control to the survivor as a fresh pan drag
    const survivor = S.pinch.a.id === e.pointerId ? S.pinch.b : S.pinch.a;
    S.drag = {id: survivor.id, x: survivor.x, y: survivor.y, sx: survivor.x, sy: survivor.y,
            moved: true, cursor: false, ruler: false};
    S.pinch = null;
    return;
  }
  if (!S.drag || S.drag.id !== e.pointerId) return;
  clearTimeout(S.drag.holdTimer);
  if (S.drag.trFader) { // persist the fader as the track: annotation (song truth)
    if (S.drag.moved && editableSong()) { S.voiceMenuTi = S.drag.trFader.ti; saveVoices(); }
    S.drag = null;
    draw();
    return;
  }
  if (S.drag.trHeader && !S.drag.moved) { // header tap: select; second tap = voice menu
    const ti = S.drag.trHeader.ti;
    if (S.selTrack === ti) {
      const g = laneGeom(ti);
      openVoiceMenu(ti, {getBoundingClientRect: () => ({left: 10, bottom: canvas.getBoundingClientRect().top + g.y0 + g.lh, top: canvas.getBoundingClientRect().top + g.y0, right: 130})});
    } else {
      S.selTrack = ti;
      renderTrackbar();
      setInfo((S.song.tracks[ti].name || "track " + (ti + 1)) + " selected — tap its header again for voice & volume");
    }
    S.drag = null;
    draw();
    return;
  }
  if (S.drag.trHeader) { S.drag = null; return; }
  if (S.drag.pendingPencil && !S.drag.moved && !S.drag.pencil) { // released before the dwell: a tap still pencils
    S.drag.pencil = placePencilNote(S.drag.pendingPencil);
    S.drag.pendingPencil = null;
  }
  if (S.drag.lane) { // pin the lane where it was dropped — as a synced lane: annotation
    if (!S.drag.moved) { // TAP a gutter label: normal -> SOLO -> mute -> normal (audition tool)
      const row = topRow() - Math.floor((S.drag.spos.y - S.RULER_H + S.view.y) / S.view.rowH);
      if (row === laneBotRow() - 1) { // the ⋯ row: toggle the full kit
        S.kitShowAll = !S.kitShowAll;
        localStorage.setItem("ff1roll-kitshowall", S.kitShowAll ? "1" : "0");
        S._kitSlots = null;
        setInfo(S.kitShowAll ? "full kit shown — pencil any piece, ⋯ hides the unused again"
                           : "unused pieces hidden — hat/snare/kick stay, plus whatever the song uses");
        clampView(); draw();
        S.drag = null;
        return;
      }
      const gm = kitSlots()[kitLaneTop() - row];
      if (gm !== undefined) {
        const st = pieceState.get(gm);
        if (st === undefined) pieceState.set(gm, "solo");
        else if (st === "solo") pieceState.set(gm, "mute");
        else pieceState.delete(gm);
        const solos = [...pieceState].filter(([, v]) => v === "solo").map(([k]) => DRUM_LABELS[k] || k);
        const mutes = [...pieceState].filter(([, v]) => v === "mute").map(([k]) => DRUM_LABELS[k] || k);
        setInfo((DRUM_LABELS[gm] || gm) + ": " + (pieceState.get(gm) || "normal") +
                (solos.length ? " · solo: " + solos.join(" ") : "") +
                (mutes.length ? " · muted: " + mutes.join(" ") : "") +
                " (tap cycles; session only — notes untouched)");
        draw();
      }
      S.drag = null;
      return;
    }
    if (S.drag.moved && S.songKey) {
      const old = S.rollnotes.find(n => /^lane:\s*-?\d+\s*$/.test(n.text));
      if (old) old.text = "lane: " + S.laneOverride;
      else S.rollnotes.push(resolveNote({b1: 1, q1: 1, b2: null, q2: null, text: "lane: " + S.laneOverride, added: true}));
      finalizeNotes();
      saveLocalNotes();
      setInfo("kit lane pinned (a lane: annotation — syncs with the song)");
    }
    S.drag = null;
    return;
  }
  if (S.drag.pencil) { // tap or stretch — either way the note exists; persist once
    const pn = S.drag.pencil;
    if (S.song.rawNotes && !pn.existing) { // late mirror: rawNotes index for undo/chop bookkeeping
      const rn = S.song.rawNotes[pn.ti][S.song.rawNotes[pn.ti].length - 1];
      if (rn) S.song.tracks[pn.ti].notes[pn.ni].ri = S.song.rawNotes[pn.ti].length - 1;
    }
    saveEdits();
    computeSongEnd();
    setInfo(noteLabel(pn.ti, pn.ni));
    draw();
  }
  else if (S.drag.lasso && S.drag.moved) finalizeLasso();
  else if (S.drag.noteEdit && /^clip/.test(S.drag.noteEdit.kind)) {
    const dT = S.drag.moved && S.tracksGhost ? S.tracksGhost.dT : 0;
    const zone = S.drag.noteEdit.kind;
    S.tracksGhost = null;
    if (dT === 0) draw();
    else if (zone === "clip") moveClip(S.drag.noteEdit.ti, S.drag.noteEdit.ci, dT);
    else trimClip(S.drag.noteEdit.ti, S.drag.noteEdit.ci, zone === "clipL" ? "L" : "R", dT);
  }
  else if (S.drag.noteEdit && S.drag.moved && S.viewMode === "tracks" && S.tracksGhost && S.drag.noteEdit.kind === "move") {
    const {dT, dLane} = S.tracksGhost;
    S.tracksGhost = null;
    if (dLane !== 0) { // retrack: the killer feature — one group undo, keeps pitch
      moveSelectionToTrack(S.drag.noteEdit.items[0].ti + dLane, dT);
    } else if (dT !== 0) {
      selEditApply(S.drag.noteEdit.items, n => { n.t = Math.max(0, n.t + dT); });
    } else draw();
  }
  else if (S.drag.noteEdit && S.drag.moved) { // commit the gesture: one undo entry, one save
    const o = S.drag.noteEdit.orig;
    const changed = S.drag.noteEdit.items.some((it, i) =>
      it.n.t !== o[i].t || it.n.d !== o[i].d || it.n.p !== o[i].p);
    if (changed) selEditApply(S.drag.noteEdit.items, () => {}, o);
  }
  else if (S.drag.rangeEdge && S.drag.moved && S.playing && S.rangeSel && S.rangeSel.cycle) {
    // new boundaries take effect NOW: the schedule pre-computes wrap passes, so
    // the cycle is rescheduled — from where the playhead IS when it's still
    // inside the new span (Josh, 2026-10-03: stretching the end while it plays
    // "should just go to the end of the selection", not jump back), from the
    // new top only when the stretch left the playhead outside it
    const at = secToTick(S.song, playSec());
    const inside = at >= S.rangeSel.a && at < S.rangeSel.b;
    const from = tickToSec(S.song, inside ? at : S.rangeSel.a);
    stop();
    play(from, {keepPos: inside, noCountIn: true}).catch(() => {});
  }
  else if (S.drag.bandEdge && S.drag.moved) {
    const n = S.drag.bandEdge.n;
    n.added = true; // edited spans must persist and sync
    pushUndo({kind: "anno", json: S.drag.bandEdge.pre}); // edge drags undo like any edit now
    finalizeNotes();
    saveLocalNotes();
    setInfo((n.chord ? "chord " : "section ") + n.text + " · bar " + n.b1 + "–" + (n.b2 || n.b1));
  }
  else if (S.drag.stripCursor) { // the playhead strip: tap moves the cursor, NEVER touches rangeSel
    if (!S.drag.moved) {
      const tick = (S.drag.spos.x - S.RULER_W + S.view.x) / pxPerTick();
      const snap = cursorTapSnapTicks(); // a tap lands on the nearest 8th; drag for finer
      seekOrMoveCursor(Math.max(0, Math.round(tick / snap) * snap), {fromHere: true, noCountIn: true});
    } else if (S.playing) seekOrMoveCursor(S.playCursor, {fromHere: true, noCountIn: true}); // a scrub while rolling: playback picks up where the finger lifted
  }
  else if (S.drag.ruler && !S.drag.rulerRange) tap(S.drag.spos); // a wobbly ruler tap still just places the cursor
  else if (!S.drag.moved) tap(evtPos(e));
  S.drag = null;
  if (S.viewMode === "score" && S.scoreModel && S.scoreZoom !== S.view.pxq) draw(); // re-engrave after pinch
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", () => { S.drag = null; S.pinch = null; draw(); });
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const mid = evtPos(e).x - S.RULER_W;
    const floorX = S.viewMode === "score" ? minPxq() : pxqFloor();
    const newPxq = Math.min(400, Math.max(floorX, S.view.pxq * (e.deltaY < 0 ? 1.1 : 0.9)));
    S.view.x = (S.view.x + mid) * (newPxq / S.view.pxq) - mid;
    S.view.pxq = newPxq;
    if (S.viewMode !== "score" && newPxq === floorX) S.view.x = 0;
  } else { S.view.x += e.deltaX; S.view.y += e.deltaY; }
  S.followFree = true;
  clampView(); draw();
}, {passive: false});
 
function tap(pos) {
  // lasso mode: taps EDIT the selection — tap a note to toggle it in/out,
  // tap empty space to clear. The box unions; taps are the precision tool.
  // Ruler taps keep their normal meaning (fall view has no ruler).
  if (S.lassoMode && S.song && (fallActive() || pos.y >= S.RULER_H)) {
    const hit = fallActive() ? fallHitNote(pos)
              : S.viewMode === "score" ? null : hitNote(pos);
    if (S.viewMode === "score" && !fallActive()) { scoreLassoTap(pos); return; }
    if (hit) { toggleSel(hit); return; }
    clearMultiSel();
    S.selNote = null; // a single selection from before lasso mode draws the same gold ring — "cleared" must clear it too (Josh, 2026-10-02)
    setInfo("lasso: cleared");
    draw();
    return;
  }
  if (S.viewMode === "tracks" && pos.y >= S.RULER_H && pos.x >= S.RULER_W && S.song) {
    const hit = hitTracksNote(pos);
    if (hit && S.mode === "erase" && editableSong()) {
      S.multiSel = [hit]; S.multiSelKey = new Set([hit.ti + ":" + hit.ni]);
      deleteSelection();
      return;
    }
    if (hit) {
      S.selNote = hit;
      S.multiSel = [hit]; S.multiSelKey = new Set([hit.ti + ":" + hit.ni]);
      S.selTrack = hit.ti;
      gridFollowNote(S.song.tracks[hit.ti].notes[hit.ni]);
      renderTrackbar();
      previewNote(hit.ti, S.song.tracks[hit.ti].notes[hit.ni].p, S.song.tracks[hit.ti].notes[hit.ni].t);
      setInfo(noteLabel(hit.ti, hit.ni));
      draw();
      return;
    }
    const ch = hitTracksClip(pos);
    if (ch) { // a piece: erase removes it; first tap selects (and says what it is), second tap plays from its start
      if (S.mode === "erase" && editableSong()) { deleteClip(ch.ti, ch.ci); return; }
      if (selClipIs(ch.ti, ch.ci) && editableSong()) {
        const from = tickToSec(S.song, S.song.tracks[ch.ti].clips[ch.ci].at);
        stop();
        play(from, {noCountIn: true}).catch(() => {});
        setInfo("playing from the piece's start");
      } else {
        S.selClip = {ti: ch.ti, ci: ch.ci}; S.selTrack = ch.ti;
        clearMultiSel();
        renderTrackbar();
        setInfo(clipLabel(ch.ti, ch.ci));
      }
      draw();
      return;
    }
    if (S.mode === "pencil") setInfo("pencil draws in Roll or Score — Tracks moves notes between tracks");
    const ti = trackLaneAt(pos.y);
    if (ti >= 0 && ti !== S.selTrack) { S.selTrack = ti; renderTrackbar(); }
    S.selClip = null;
    clearMultiSel();
    draw();
    return;
  }
  if (pos.y >= S.RULER_H) clearMultiSel(); // the ruler is NOT the background:
  // seeking/ranging must never cost the lasso (select -> range -> audition is ONE workflow)
  if (pos.y < S.RULER_H) { // section tap, marker tap, or seek
    if (S.rangeSel) {
      const {tick: rt} = posToTickPitch(pos);
      if (S.rangeSel.off && rt >= S.rangeSel.a && rt < S.rangeSel.b && pos.y < BASE_RULER_H) {
        S.rangeSel.off = false; // tap the dimmed span: it re-arms without redrawing it
        setInfo("cycle re-armed: " + "▶ loops the highlighted span again");
        draw();
        return;
      }
      // Logic-style: the first tap fades the highlight but it survives; a tap
      // OUTSIDE a faded one removes it (Josh, 2026-09-30: a stray range he
      // couldn't get rid of — it only ever dimmed)
      if (S.rangeSel.off && pos.y < BASE_RULER_H) { S.rangeSel = null; setInfo("range cleared"); }
      else S.rangeSel.off = true;
    }
    const {tick} = posToTickPitch(pos);
    const ppt = pxPerTick();
    if (pos.x < 18 && pos.y >= BASE_RULER_H && S.secMaxDepth > 1) { // ▸ chevron: cycle visible levels
      cycleSecDepth();
      return;
    }
    if (pos.y >= BASE_RULER_H) { // section lanes
      const lane = Math.floor((pos.y - BASE_RULER_H) / LANE_H);
      const sec = S.rollnotes.find(n => (n.section || n.chord) && n.lane === lane && tick >= n.start && tick < n.end);
      if (sec) {
        if (S.tapBand.n === sec && performance.now() - S.tapBand.t < 400) { // double-tap opens the annotation
          S.tapBand = {n: null, t: 0};
          openEditor(sec);
          return;
        }
        S.tapBand = {n: sec, t: performance.now()};
        S.rangeSel = {a: sec.start, b: sec.end};
        S.playCursor = sec.start;
        setInfo((sec.chord ? "chord " : "section ") + sec.text + " · bar " + sec.b1 + "–" + (sec.b2 || sec.b1) +
                (sec.cnote ? " · ✱ " + sec.cnote.split("\n")[0] : "") +
                (sec.stale ? " · notes here now read " + sec.stale + " — rename in ☰ Notes if you agree" : ""));
        if (sec.chord) { // arm the challenge — evidence only on request, never volunteered
          S.challengeSec = sec;
          const cb = document.getElementById("chordbtn");
          cb.textContent = "Challenge?";
          cb.style.display = "";
        }
        updateSubtitle(); draw();
        return;
      }
      // P6: the Analyze layer's own rows sit below the real section/chord
      // ones (never the same lane index) — a tap here opens the Adopt
      // sheet; it never touches rollnotes/rangeSel/tapBand itself.
      if (S.analysisOn && appMode() === "normal") {
        if (S.analysisChordLane !== null && lane === S.analysisChordLane) {
          const c = S.analysisBands.chords.find(b => tick >= b.start && tick < b.end);
          if (c) { openAnalyzeSheet({kind: "chord", start: c.start, end: c.end, text: c.text}); return; }
        }
        if (S.analysisKeyLane !== null && lane === S.analysisKeyLane && S.analysisBands.key &&
            tick >= S.analysisBands.key.start && tick < S.analysisBands.key.end) {
          openAnalyzeSheet({kind: "key", start: S.analysisBands.key.start, end: S.analysisBands.key.end, text: S.analysisBands.key.name});
          return;
        }
      }
    }
    let hitMark = null;
    for (const n of S.rollnotes) {
      if (Math.abs((n.start - tick) * ppt) < 14) { hitMark = n; break; }
    }
    if (hitMark && hitMark.keydir !== undefined && hitMark.added && !S.playing) {
      S.playCursor = hitMark.start;
      openEditor(hitMark); // key markers have no subtitle — flag tap opens the editor (Delete lives there)
      return;
    }
    const target = hitMark ? hitMark.start
                 : Math.max(0, Math.round(tick / cursorTapSnapTicks()) * cursorTapSnapTicks()); // nearest 8th
    seekOrMoveCursor(target);
    return;
  }
  if (S.viewMode === "score") {
    if (S.mode === "pencil") { scorePencil(pos); return; }
    if (S.mode === "erase") { scoreErase(pos); return; }
    scoreTap(pos);
    return;
  }
  if (S.mode === "pencil") { // reached only where pencil-drag isn't wired (fall view)
    const {tick, pitch} = posToTickPitch(pos);
    if (pitch < S.PMIN || pitch > S.PMAX || tick < 0) return;
    const {t, snap} = pencilCellAt(tick);
    const tr = S.song.tracks[S.selTrack];
    if (tr.kind === "audio") { setInfo("that track is a recording — pick a MIDI track to pencil on"); return; }
    if (tr.notes.some(n => !n.gone && n.t === t && n.p === pitch)) { previewNote(S.selTrack, pitch, t); return; } // no twins
    const added = !isComposition(); // in a composition the note IS the song, not an overlay
    tr.notes.push({t, d: snap, p: pitch, v: S.pencilVel, added});
    if (S.song.rawNotes) S.song.rawNotes[S.selTrack].push({t: t + S.chopS, d: snap, p: pitch, v: S.pencilVel, added});
    pushUndo({kind: "add", ti: S.selTrack, ni: tr.notes.length - 1});
    saveEdits();
    previewNote(S.selTrack, pitch, t);
    setInfo(noteLabel(S.selTrack, tr.notes.length - 1));
    draw();
    return;
  }
  const hit = hitNote(pos);
  if (S.mode === "erase") {
    if (hit) {
      const en = S.song.tracks[hit.ti].notes[hit.ni];
      en.gone = true;
      if (S.song.rawNotes && en.ri !== undefined && S.song.rawNotes[hit.ti][en.ri]) S.song.rawNotes[hit.ti][en.ri].gone = true;
      if (S.selNote && S.selNote.ti === hit.ti && S.selNote.ni === hit.ni) S.selNote = null;
      pushUndo({kind: "erase", ti: hit.ti, ni: hit.ni});
      saveEdits(); draw();
    }
    return;
  }
  S.selNote = hit;
  if (hit) {
    const n = S.song.tracks[hit.ti].notes[hit.ni];
    if (noteTapMovesCursor()) S.playCursor = n.t; // off by default: selecting never moves the playhead (DAW habit, 2026-09-29); + Note anchors at the tapped note either way
    setInfo(noteLabel(hit.ti, hit.ni));
    reflectSelVel(); // the vol slider doubles as the velocity readout
    previewNote(hit.ti, n.p, n.t);
    updateSubtitle();
  } else setInfo("—");
  draw();
}

 if (typeof document !== "undefined" && document.addEventListener) document.addEventListener("touchstart", () => {}, {passive: true});
document.addEventListener("visibilitychange", async () => {
  if (document.hidden || !S.audio || S.audio.state === "closed" || S.wakeInFlight) return; // a closed one waits for the tap
  if (S.playing && S.audio.state === "running") return;
  // idle: back to the mixing session BEFORE the wake. A tap, ▶ or the click
  // left "playback" behind if the app was hidden when it ended (every revert
  // skips a hidden page), and resuming the context under "playback" stopped
  // YouTube the moment Josh switched back in (2026-10-02)
  if (!S.playing && !S.albumRun && !met.on) audioSessionType("ambient");
  S.wakeInFlight = true;
  try { await resumeAudio(); } finally { S.wakeInFlight = false; }
});
// first touch anywhere: create + warm the context inside a user gesture
// ?perf=1 — on-device performance HUD (iPad has no Activity Monitor): fps,
// worst frame gap, long-task count/max over the last second. ⏺ records a
// session and prints a report Josh can copy out — the iPad has no profiler,
// so attribution has to come from the app's own instrumentation.
if (typeof location !== "undefined" && document.body && new URLSearchParams(location.search).get("perf")) (() => {
  const el = document.createElement("div");
  // right:8px from the viewport would sit under the right dock (window
  // manager, build steps 1-2) when it's open — offset from the song
  // region's own right edge instead, same 8px gutter
  el.style.cssText = "position:fixed;right:" + (window.innerWidth - songRegionRight() + 8) + "px;bottom:64px;z-index:9999;background:rgba(0,0,0,.75);" +
    "color:#7fdc7f;font:11px monospace;padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre";
  document.body.appendChild(el);
  let frames = 0, worst = 0, last = performance.now(), longs = 0, longMax = 0;
  let lagWorst = 0, lagExp = performance.now() + 50;
  setInterval(() => { const n = performance.now(); // event-loop stall probe: fires
    lagWorst = Math.max(lagWorst, n - lagExp);     // even when rAF is throttled
    lagExp = n + 50; }, 50);
  try {
    new PerformanceObserver(l => { for (const e of l.getEntries()) { longs++; longMax = Math.max(longMax, e.duration); } })
      .observe({entryTypes: ["longtask"]});
  } catch (err) { /* webkit: no longtask — fps + gap still tell the story */ }
  // frame-delta histogram: separates "uniformly throttled" (one fat bucket)
  // from "mostly fine with spikes" (bimodal) — the two have different causes
  const BUCKETS = [8, 17, 25, 34, 50, 100, 200, Infinity];
  const hist = BUCKETS.map(() => 0);
  // S.perfRec (src/state.js): null when idle, else the in-flight recording
  // session object. Was a closure-local `rec` here; prof() (which now runs
  // from wherever each profiled function is actually defined, not from
  // inside this HUD) needs to read/write the exact same flag, so it moved
  // to S.
  // loop-wrap detection without touching app code: playSec() runs backwards
  // when the transport wraps a cycle. If the stalls land ON wraps it is the
  // transport's re-schedule; if they land anywhere, it is GC or the platform.
  let prevSec = null, lastWrap = -1e9;
  const loop = t => {
    frames++;
    const dt = t - last;
    worst = Math.max(worst, dt);
    last = t;
    if (S.perfRec) {
      S.perfRec.frames++;
      hist[BUCKETS.findIndex(b => dt <= b)]++;
      try {
        const ps = typeof S.playing !== "undefined" && S.playing ? playSec() : null;
        if (ps !== null && prevSec !== null && ps < prevSec - 0.05) { S.perfRec.wraps++; lastWrap = t; }
        prevSec = ps;
      } catch (err) { /* transport not running: wrap census simply stays empty */ }
      if (dt > 50) { // a stall worth attributing
        S.perfRec.blocks++;
        S.perfRec.blockMs += dt;
        if (t - lastWrap < 250) S.perfRec.blocksAtWrap++;
        S.perfRec.secBlocks++;
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // self-profiler: WebKit has no longtask attribution — wrap the app's own
  // hot functions and report top offenders (ms spent in the last second)
  const acct = S.perfAcct;   // rolling, cleared every second for the HUD line — shared with prof() (src/state.js)
  const total = S.perfTotal;  // session totals: {ms, calls} — shared with prof() (src/state.js)
  // self-profiler (step 7, docs/split-plan.md §2.4): each profiled function
  // now wraps ITSELF at its own definition site via prof() (src/state.js —
  // "name = prof(\"name\", name);", right after the function declaration,
  // wherever that declaration now lives). The old wrap() installed this
  // centrally by patching globalThis[name], which only ever worked while
  // every profiled name was a classic <script> global; the first function
  // this step moved out of app.js (secToTick, step 3) silently broke it —
  // attribution kept reporting nothing, with no error. acct/total below are
  // the SAME shared objects prof()'s wrapped calls write into (S.perfAcct/
  // S.perfTotal), not a fresh local pair, so this HUD still reads them live.
  // second pass: the edit entry points also mark the timeline, so the report
  // shows the exact second an edit landed and what it changed
  setTimeout(() => ["saveEdits", "selEditApply", "insertTime"].forEach(name => {
    const fn = typeof globalThis[name] === "function" ? globalThis[name] : null;
    if (!fn) return;
    globalThis[name] = function () {
      const r = fn.apply(this, arguments);
      if (S.perfRec) S.perfRec.marks.push("  ==== EDIT (" + name + ") @" + S.perfRec.sec + "s  " + snapshot());
      return r;
    };
  }), 1);
  // audio-node census: a leaked graph costs time in the realtime render thread,
  // where no page-side profiler can see it. Patched on the prototype so the
  // app's own code stays untouched; 'ended' via addEventListener so an app
  // .onended assignment is not clobbered.
  const nodes = {osc: 0, gain: 0, buf: 0, filt: 0, ended: 0, stopped: 0, disc: 0};
  let livePeak = 0;
  const liveNow = () => nodes.osc + nodes.buf - nodes.ended; // stop() and 'ended'
  // fire for the same node — counting both double-subtracts and reads negative
  try {
    const P = (typeof BaseAudioContext !== "undefined" ? BaseAudioContext : AudioContext).prototype;
    const src = (m, key) => {
      const f = P[m];
      if (!f) return;
      P[m] = function () {
        const n = f.apply(this, arguments);
        nodes[key]++;
        livePeak = Math.max(livePeak, liveNow());
        try {
          n.addEventListener("ended", () => { nodes.ended++; });
          const st = n.stop;
          if (st) n.stop = function () { nodes.stopped++; return st.apply(this, arguments); };
        } catch (err) { /* node type without stop/ended: creation count still counts */ }
        return n;
      };
    };
    src("createOscillator", "osc");
    src("createBufferSource", "buf");
    for (const [m, k] of [["createGain", "gain"], ["createBiquadFilter", "filt"]]) {
      const f = P[m];
      if (f) P[m] = function () { nodes[k]++; return f.apply(this, arguments); };
    }
    const dc = AudioNode.prototype.disconnect;
    AudioNode.prototype.disconnect = function () { nodes.disc++; return dc.apply(this, arguments); };
  } catch (err) { /* no WebAudio in this context: the rest of the report stands */ }
  // Josh's Safari recording: ff1-battle ran 131s with zero stalls in every
  // second, then graveyard-2 degraded from the second he edited a note and
  // never recovered. Per-frame JS is identical either side of that line, so
  // the edit changes the DATA. Snapshot what it changes, at the boundary.
  const snapshot = () => {
    const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (err) { return d; } };
    const all = g(() => S.song.tracks.reduce((a, t) => a + t.notes.length, 0), -1);
    const gone = g(() => S.song.tracks.reduce((a, t) => a + t.notes.filter(n => n.gone).length, 0), -1);
    const added = g(() => S.song.tracks.reduce((a, t) => a + t.notes.filter(n => n.added).length, 0), -1);
    return "notes " + all + " (gone " + gone + ", added " + added + ")" +
           "  roll " + g(() => S.rollnotes.length, -1) +
           "  sched " + g(() => S.schedEvents.length, -1) +
           "  undo " + g(() => S.editUndo.length, -1) + "/" + g(() => S.editRedo.length, -1) +
           "  sceneValid " + g(() => String(S.sceneValid), "?") +
           "  songEndTick " + g(() => Math.round(S.songEndTick), -1);
  };
  const dims = id => {
    const c = document.getElementById(id);
    return c ? c.width + "x" + c.height : "—";
  };
  const lsReport = () => {
    let bytes = 0, keys = 0;
    const per = [];
    try {
      for (const k of Object.keys(localStorage)) {
        const n = (k.length + (localStorage.getItem(k) || "").length) * 2; // UTF-16
        bytes += n; keys++; per.push([k, n]);
      }
    } catch (err) { return "unavailable"; }
    per.sort((a, b) => b[1] - a[1]);
    return Math.round(bytes / 1024) + " KB in " + keys + " keys; top: " +
      per.slice(0, 4).map(([k, n]) => k + " " + Math.round(n / 1024) + "KB").join(", ");
  };
  const report = () => {
    const secs = (performance.now() - S.perfRec.t0) / 1000;
    const L = [];
    L.push("NIGHT ROLL PERF REPORT");
    L.push("build " + (document.lastModified || "?") + "   session " + secs.toFixed(1) + "s");
    L.push("song at stop " + (typeof S.songKey !== "undefined" ? S.songKey : "?") +
           "   tracks " + (typeof S.song !== "undefined" && S.song ? S.song.tracks.length : 0) +
           "   notes " + (typeof S.song !== "undefined" && S.song
             ? S.song.tracks.reduce((a, t) => a + t.notes.filter(n => !n.gone).length, 0) : 0) +
           "   view " + (typeof S.viewMode !== "undefined" ? S.viewMode : "?") +
           "   playing " + (typeof S.playing !== "undefined" ? !!S.playing : "?"));
    L.push("ua " + navigator.userAgent);
    L.push("dpr " + (window.devicePixelRatio || 1) +
           "   win " + innerWidth + "x" + innerHeight +
           "   screen " + screen.width + "x" + screen.height);
    L.push("flags dpr=" + (PERF_FLAGS.get("dpr") || "off") +
           "  scene=" + (PERF_NOSCENE ? "0 (cache disabled)" : "on"));
    L.push("state at stop: " + snapshot());
    L.push("canvas roll " + dims("roll") + "   inst " + dims("instcanvas") +
           "   instOpen " + (typeof S.instOpen !== "undefined" ? S.instOpen : "?") +
           "   fall " + (typeof S.fallOn !== "undefined" ? S.fallOn : "?") +
           "   scene " + (typeof S.sceneCanvas !== "undefined" && S.sceneCanvas
             ? S.sceneCanvas.width + "x" + S.sceneCanvas.height : "none"));
    try {
      L.push("audio sr " + S.audio.sampleRate + "  baseLatency " +
             Math.round((S.audio.baseLatency || 0) * 1000) + "ms  state " + S.audio.state);
    } catch (err) { L.push("audio —"); }
    L.push("");
    L.push("--- frames ---");
    L.push("frames " + S.perfRec.frames + "   avg fps " + (S.perfRec.frames / secs).toFixed(1) +
           "   worst frame " + Math.round(S.perfRec.worst) + "ms   worst lag " + Math.round(S.perfRec.lag) + "ms");
    L.push("longtasks " + S.perfRec.longs + (S.perfRec.longMax ? " (max " + Math.round(S.perfRec.longMax) + "ms)" : ""));
    // the discriminator: a blocked main thread stalls the 50ms timer AND the
    // frame; a throttled rAF starves frames while the timer stays on time
    // average fps is the WRONG test: Josh's 271s recording averaged 56.9 while
    // stalling 185ms, because it ran clean for two minutes before degrading.
    // Judge by stall density and by whether the probe timer went late with it.
    const perMin = S.perfRec.blocks / Math.max(1, secs / 60);
    L.push("shape " + (S.perfRec.frames / secs < 20 && S.perfRec.lag < 50
        ? "frames starved, event loop on time — rAF THROTTLED (environment/backgrounded)"
      : perMin < 2 ? "healthy (no meaningful stalls)"
      : S.perfRec.lag > 100 ? "main thread BLOCKED — " + Math.round(perMin) + " stalls/min, probe timer late too"
      : "stalls present — " + Math.round(perMin) + "/min, probe timer on time (paint or compositor side)"));
    L.push("frame deltas  " + BUCKETS.map((b, i) =>
      (b === Infinity ? ">200" : "<=" + b) + ":" + hist[i]).join("  "));
    L.push("");
    const segs = Object.entries(S.perfRec.bySong);
    if (segs.length > 1) { // only interesting when a song switch actually happened
      L.push("--- per song (the A/B) ---");
      for (const [k, v] of segs)
        L.push(k.padEnd(46) + String(v.secs).padStart(4) + "s  avg fps " +
               (v.frames / v.secs).toFixed(1).padStart(6) +
               "  worst " + String(Math.round(v.worst)).padStart(4) + "ms" +
               "  lag " + String(Math.round(v.lag)).padStart(4) + "ms");
      L.push("NOTE: attribution below is the WHOLE session, not per song.");
      L.push("");
    }
    L.push("--- attribution (session totals) ---");
    const rows = Object.entries(total).sort((a, b) => b[1].ms - a[1].ms).filter(([, v]) => v.ms >= 1);
    if (!rows.length) L.push("(nothing measurable)");
    for (const [n, v] of rows)
      L.push(n.padEnd(20) + String(Math.round(v.ms)).padStart(7) + "ms " +
             String(Math.round(v.ms / (secs * 10))).padStart(4) + "%   calls " + v.calls);
    L.push("NOTE: drawFull nests inside playbackFrame — percentages overlap.");
    L.push("");
    L.push("--- audio nodes ---");
    L.push("created osc " + nodes.osc + "  buf " + nodes.buf + "  gain " + nodes.gain +
           "  filt " + nodes.filt);
    L.push("ended " + nodes.ended + "  stopped " + nodes.stopped + "  disconnect " + nodes.disc +
           "   live(est) " + liveNow() + "   peak " + livePeak);
    L.push("");
    L.push("--- stalls (>50ms frames) ---");
    L.push("count " + S.perfRec.blocks + "   mean " +
           (S.perfRec.blocks ? Math.round(S.perfRec.blockMs / S.perfRec.blocks) : 0) + "ms" +
           "   loop wraps " + S.perfRec.wraps +
           "   stalls within 250ms of a wrap " + S.perfRec.blocksAtWrap +
           (S.perfRec.blocks ? " (" + Math.round(S.perfRec.blocksAtWrap / S.perfRec.blocks * 100) + "%)" : ""));
    L.push("read: high % = the transport's loop re-schedule; low % = GC/platform.");
    L.push("");
    L.push("--- growth (first vs last, and the slope) ---");
    if (S.perfRec.growth.length > 1) {
      const a = S.perfRec.growth[0], b = S.perfRec.growth[S.perfRec.growth.length - 1];
      const span = Math.max(1, b.s - a.s);
      for (const k of ["dom", "nodes", "live", "sched", "roll", "undo"])
        L.push(k.padEnd(8) + String(a[k]).padStart(8) + " -> " + String(b[k]).padStart(8) +
               "   " + ((b[k] - a[k]) / span).toFixed(1) + "/s");
      L.push("(nodes is cumulative and SHOULD climb; live/dom/sched/roll/undo should not)");
    } else L.push("(too short)");
    L.push("");
    L.push("--- storage ---");
    L.push(lsReport());
    L.push("");
    L.push("--- per second (fps / worst / lag / hottest) ---");
    for (const s of S.perfRec.marks) L.push(s);
    return L.join("\n");
  };
  const sheet = text => {
    const bg = document.createElement("div");
    bg.style.cssText = "position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.85);" +
      "display:flex;flex-direction:column;gap:8px;padding:12px;box-sizing:border-box";
    const ta = document.createElement("textarea");
    ta.readOnly = true;
    ta.value = text;
    ta.style.cssText = "flex:1;width:100%;box-sizing:border-box;background:#111;color:#7fdc7f;" +
      "font:11px monospace;border:1px solid #444;border-radius:6px;padding:8px";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px";
    const mk = (label, fn) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = "flex:1;padding:10px;font:13px monospace;background:#222;color:#eee;" +
        "border:1px solid #555;border-radius:6px";
      b.addEventListener("click", fn);
      return b;
    };
    row.append(mk("Copy", () => {
      ta.select();
      const done = () => { row.firstChild.textContent = "Copied ✓"; };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => {
        try { document.execCommand("copy"); done(); } catch (err) {}
      });
      else { try { document.execCommand("copy"); done(); } catch (err) {} }
    }), mk("Close", () => bg.remove()));
    bg.append(ta, row);
    document.body.appendChild(bg);
  };
  const btn = document.createElement("button");
  // same right-dock offset as the HUD panel above
  btn.style.cssText = "position:fixed;right:" + (window.innerWidth - songRegionRight() + 8) + "px;bottom:8px;z-index:9999;background:rgba(0,0,0,.8);" +
    "color:#e66767;font:13px monospace;padding:8px 12px;border-radius:6px;border:1px solid #555";
  btn.textContent = "⏺ rec";
  btn.addEventListener("click", () => {
    if (S.perfRec) { const t = report(); S.perfRec = null; btn.textContent = "⏺ rec"; btn.style.color = "#e66767"; sheet(t); return; }
    hist.fill(0);
    for (const k in total) delete total[k];
    for (const k in nodes) nodes[k] = 0;
    livePeak = 0;
    S.perfRec = {t0: performance.now(), frames: 0, worst: 0, lag: 0, longs: 0, longMax: 0,
           marks: [], sec: 0, bySong: {}, song: null,
           wraps: 0, blocks: 0, blockMs: 0, blocksAtWrap: 0, secBlocks: 0, growth: []};
    btn.textContent = "⏹ stop";
    btn.style.color = "#7fdc7f";
  });
  document.body.appendChild(btn);
  setInterval(() => {
    const entries = Object.entries(acct).sort((a, b) => b[1] - a[1]);
    const top = entries.slice(0, 3).map(([n, ms]) => n + " " + Math.round(ms)).join("  ");
    el.textContent = "fps " + frames + "  worst " + Math.round(worst) + "ms  lag " + Math.round(lagWorst) + "ms\n" +
                     "longtasks " + longs + (longMax ? " (max " + Math.round(longMax) + "ms)" : "") +
                     "\nhot: " + (top || "—") +
                     "\nbuild " + (document.lastModified || "?") +
                     (S.perfRec ? "\nREC " + Math.round((performance.now() - S.perfRec.t0) / 1000) + "s" : "");
    if (S.perfRec) {
      S.perfRec.sec++;
      S.perfRec.worst = Math.max(S.perfRec.worst, worst);
      S.perfRec.lag = Math.max(S.perfRec.lag, lagWorst);
      S.perfRec.longs += longs;
      S.perfRec.longMax = Math.max(S.perfRec.longMax, longMax);
      // song switches mid-recording are the point: airship-vs-his-song in ONE
      // session is a controlled A/B no bisect can match. Segment by songKey so
      // the seconds do not blend into one pile.
      const key = (typeof S.songKey !== "undefined" && S.songKey) || "(none)";
      if (key !== S.perfRec.song) { S.perfRec.song = key; S.perfRec.marks.push("  ---- song -> " + key + " ----"); }
      const seg = S.perfRec.bySong[key] || (S.perfRec.bySong[key] = {secs: 0, frames: 0, worst: 0, lag: 0});
      seg.secs++; seg.frames += frames;
      seg.worst = Math.max(seg.worst, worst); seg.lag = Math.max(seg.lag, lagWorst);
      S.perfRec.marks.push(String(S.perfRec.sec).padStart(4) + "s  fps " + String(frames).padStart(3) +
                     "  worst " + String(Math.round(worst)).padStart(4) +
                     "  lag " + String(Math.round(lagWorst)).padStart(4) +
                     "  blk " + String(S.perfRec.secBlocks).padStart(2) +
                     "  " + (entries[0] ? entries[0][0] + " " + Math.round(entries[0][1]) : "—"));
      S.perfRec.secBlocks = 0;
      // growth probe: the stalls lengthen over a session, so SOMETHING is
      // being retained. Sample the candidates rather than guess at them.
      const g = num => { try { return num(); } catch (err) { return -1; } };
      S.perfRec.growth.push({
        s: S.perfRec.sec,
        dom: document.getElementsByTagName("*").length,
        nodes: nodes.osc + nodes.buf + nodes.gain + nodes.filt,
        live: nodes.osc + nodes.buf - nodes.ended,
        sched: g(() => S.schedEvents.length),
        roll: g(() => S.rollnotes.length),
        undo: g(() => S.editUndo.length + S.editRedo.length),
      });
    }
    frames = 0; worst = 0; longs = 0; longMax = 0; lagWorst = 0;
    for (const k in acct) acct[k] = 0;
  }, 1000);
})();
// The iOS silent-switch bypass is GONE (Josh, 2026-08-25). It looped a 2.0s
// silent <audio> forever to hold the tab in the "media playback" category the
// hardware mute switch does not silence. On WebKit every loop wrap is a seek,
// and his recordings put a stall burst on exactly that 2.0s beat — clean for
// 70s, then every other second after one note move, worsening until reload.
// It was added 2026-08-22 for a friend's "it won't play"; the perf collapse
// dates from 08-24. A comfort feature is not worth a third of the frame
// budget. If the mute switch bites someone again: say so in the UI, or hold
// the classification with a MUCH longer buffer so seeks are rare — do not
// re-introduce a 2-second loop.
document.addEventListener("pointerdown", function warm() {
  document.removeEventListener("pointerdown", warm);
  ensureAudio();
  resumeAudio();
  if (S.sfPreloadPending) sfPreloadForSong(); // the boot-time preload deferred to this gesture
}, {capture: true});
           document.addEventListener("pointerdown", e => { // tap-away closes the Edit menu
  const es = document.getElementById("editsheet");
  if (es.classList.contains("on") && !es.contains(e.target) && e.target.id !== "editsheetbtn")
    es.classList.remove("on");
}, {capture: true});
document.addEventListener("pointerdown", e => { // tap-away closes the voice menu
  const menu = document.getElementById("voicemenu");
  if (!menu.classList.contains("on")) return;
  if (menu.contains(e.target)) return;
  // only the chip the menu ALREADY belongs to is exempt (its own click handler
  // toggles/rebuilds it) — a tap on any OTHER track's chip is a tap-away, same
  // as tapping the roll (Josh, traced 2026-09-29: a stale menu stayed open,
  // still pointing at the old track, after a first tap on a different chip)
  const chip = e.target.closest && e.target.closest(".chip");
  if (chip && Number(chip.dataset.ti) === S.voiceMenuTi) return;
  menu.classList.remove("on");
}, {capture: true});
                         
                        
        play.gen = 0;
  document.getElementById("albumprev").addEventListener("click", albumPrev);
document.getElementById("albumnext").addEventListener("click", albumNext);
document.getElementById("albumleave").addEventListener("click", albumLeave);


  if (S.viewMode === "tracks") S.RULER_W = TRACKS_GUTTER;                         





function scorePencilTick(x) {
  // scoreXToTick interpolates between engraved noteheads — fine when a bar
  // has them, wildly coarse when it's empty (a blank composition's default).
  // Sparse bars get a LINEAR map from the note-start edge instead, which is
  // exactly what the pencil beat guides draw.
  const ppt = pxPerTick();
  const mw = S.scoreModel.bt * ppt;
  const mi = Math.max(0, Math.floor((x - S.RULER_W + S.view.x) / mw));
  const entry = S.scoreCache.get(mi) || renderMeasure(mi);
  if (entry && entry.timeMap.length >= 2) return scoreXToTick(x);
  const nsx = entry ? entry.noteStartX : SCORE_PAD;
  const localX = x - (S.RULER_W + mi * mw - S.view.x - SCORE_PAD);
  const frac = Math.max(0, Math.min(0.999, (localX - nsx) / Math.max(1, mw + SCORE_PAD - nsx)));
  return mi * S.scoreModel.bt + frac * S.scoreModel.bt;
}
function scoreStaveAt(pos) {
  const localY = pos.y - (S.RULER_H + 4 - (S.view.y || 0));
  const si = Math.max(0, Math.min(S.scoreModel.staves.length - 1,
    Math.floor((localY - SCORE_TOP) / STAVE_H)));
  return {si, sy: localY - (SCORE_TOP + si * STAVE_H)};
}
function scorePencil(pos) {
  if (!S.scoreModel || !S.scoreModel.staves.length) return;
  const {si, sy} = scoreStaveAt(pos);
  const st = S.scoreModel.staves[si];
  if (st.drums) { setInfo("kit entry lives in the roll (its lane) — score shows the chart"); return; }
  const probe = new VF.Stave(0, 0, 100); // VexFlow's own line geometry
  const topLineY = probe.getYForLine(0);
  const step = (probe.getYForLine(1) - topLineY) / 2; // line-to-space distance
  const k = Math.round((sy - topLineY) / step); // diatonic steps below the top line
  if (k < -9 || k > 17) return; // past ~4 ledger lines: not a note tap
  const nTop = st.clef === "bass" ? 26 : 38; // diatonic index of the top line: A3 / F5
  const n = nTop - k;
  const letter = "CDEFGAB"[((n % 7) + 7) % 7];
  const octave = Math.floor(n / 7);
  const sf = sfAt(S.playCursor);
  const acc = S.pencilAcc === "key"
    ? (["F", "C", "G", "D", "A", "E", "B"].slice(0, Math.max(0, sf)).includes(letter) ? 1
       : ["B", "E", "A", "D", "G", "C", "F"].slice(0, Math.max(0, -sf)).includes(letter) ? -1 : 0)
    : +S.pencilAcc;
  const pitch = (octave + 1) * 12 + LETTER_PC[letter] + acc;
  if (pitch < 0 || pitch > 127) return;
  const {t, snap} = pencilCellAt(scorePencilTick(pos.x));
  S.selTrack = st.ti;
  const tr = S.song.tracks[st.ti];
  if (tr.notes.some(n => !n.gone && n.t === t && n.p === pitch)) { previewNote(st.ti, pitch, t); return; } // no twins
  const added = !isComposition();
  tr.notes.push({t, d: snap, p: pitch, v: S.pencilVel, added});
  if (S.song.rawNotes) S.song.rawNotes[st.ti].push({t: t + S.chopS, d: snap, p: pitch, v: S.pencilVel, added});
  pushUndo({kind: "add", ti: st.ti, ni: tr.notes.length - 1});
  saveEdits();
  previewNote(st.ti, pitch, t);
  renderTrackbar();
  buildScoreModel();
  setInfo(noteLabel(st.ti, tr.notes.length - 1));
  draw();
}
function scoreErase(pos) {
  const m = S.scoreModel;
  if (!m) return;
  const ppt = pxPerTick();
  const mi = Math.floor((pos.x - S.RULER_W + S.view.x) / (m.bt * ppt));
  const entry = S.scoreCache.get(mi);
  if (!entry) return;
  const localX = pos.x - (S.RULER_W + mi * m.bt * ppt - S.view.x - SCORE_PAD);
  const localY = pos.y - (S.RULER_H + 4 - (S.view.y || 0));
  for (const g of entry.geo) {
    if (localX >= g.x0 && localX <= g.x1 && localY >= g.y0 && localY <= g.y1 && g.refs[0]) {
      const {ti, ni} = g.refs[0];
      const en = S.song.tracks[ti].notes[ni];
      en.gone = true;
      if (S.song.rawNotes && en.ri !== undefined && S.song.rawNotes[ti][en.ri]) S.song.rawNotes[ti][en.ri].gone = true;
      if (S.selNote && S.selNote.ti === ti && S.selNote.ni === ni) S.selNote = null;
      pushUndo({kind: "erase", ti, ni});
      saveEdits();
      buildScoreModel();
      draw();
      return;
    }
  }
}
function scoreTap(pos) {
  const m = S.scoreModel;
  const ppt = pxPerTick();
  const mw = m.bt * ppt;
  const mi = Math.floor((pos.x - S.RULER_W + S.view.x) / mw);
  const entry = S.scoreCache.get(mi);
  if (entry) {
    const localX = pos.x - (S.RULER_W + mi * m.bt * ppt - S.view.x - SCORE_PAD);
    const localY = pos.y - (S.RULER_H + 4 - (S.view.y || 0));
    for (const g of entry.geo) {
      if (localX >= g.x0 && localX <= g.x1 && localY >= g.y0 && localY <= g.y1) {
        S.selNote = g.refs[0] ? {ti: g.refs[0].ti, ni: g.refs[0].ni} : null;
        S.playCursor = g.tick;
        if (S.selNote) {
          setInfo(noteLabel(S.selNote.ti, S.selNote.ni));
          reflectSelVel(); // the vol slider doubles as the velocity readout
          previewNote(g.ti, g.pitches[g.pitches.length - 1], g.tick);
        }
        updateSubtitle(); draw();
        return;
      }
    }
  }
  // empty area: move the cursor there, on the move grid
  const snap = moveSnapTicks();
  S.playCursor = Math.max(0, Math.round(scoreXToTick(pos.x) / snap) * snap);
  S.selNote = null;
  setInfo("—");
  updateSubtitle(); draw();
}

const songsheet = document.getElementById("songsheet");
 function renderSongGroups() { // top: LOCAL's top-level folders, then PUBLISHED's
  S.songViewRedraw = () => renderSongGroups();
  document.getElementById("songsheettitle").textContent = "OPEN";
  const rows = document.getElementById("songrows");
  rows.innerHTML = "";
  { const sh = rows.closest ? rows.closest(".sheet") : null; if (sh) sh.scrollTop = 0; songsheet.scrollTop = 0; } // a new folder starts at its top: the ‹ row must be in reach (Josh, 2026-09-28) — unless it holds the song you are on: then that row (below)
  const local = folderTree(draftKeys());
  if (subfolderKeys(local).length) {
    rows.appendChild(songHeader(localLabel()));
    for (const seg of subfolderKeys(local)) rows.appendChild(songRow(segTitle(local.sub[seg].path) + "  (" + nodeCount(local.sub[seg]) + ") ›", () => renderFolder("local", local.sub[seg].path)));
  }
  rows.appendChild(songHeader(publishedLabel()));
  const pub = folderTree(publishedPaths());
  for (const seg of subfolderKeys(pub)) rows.appendChild(songRow(segTitle(pub.sub[seg].path) + "  (" + nodeCount(pub.sub[seg]) + ") ›", () => renderFolder("published", pub.sub[seg].path)));
}
function renderFolder(section, folder) { // one level: subfolders, then this folder's songs
  S.songViewRedraw = () => renderFolder(section, folder);
  const root = folderTree(section === "local" ? draftKeys() : publishedPaths());
  const node = nodeAt(root, folder);
  if (!node) return renderSongGroups();
  document.getElementById("songsheettitle").textContent = folderTitle(folder).toUpperCase();
  const rows = document.getElementById("songrows");
  rows.innerHTML = "";
  { const sh = rows.closest ? rows.closest(".sheet") : null; if (sh) sh.scrollTop = 0; songsheet.scrollTop = 0; } // a new folder starts at its top: the ‹ row must be in reach (Josh, 2026-09-28) — unless it holds the song you are on: then that row (below)
  const up = parentFolder(folder);
  rows.appendChild(songRow("‹ " + (up ? segTitle(up) : "All folders"), () => up ? renderFolder(section, up) : renderSongGroups(), true));
  rows.appendChild(songHeader(section === "local" ? localLabel() : publishedLabel()));
  for (const seg of subfolderKeys(node)) rows.appendChild(songRow(segTitle(node.sub[seg].path) + "  (" + nodeCount(node.sub[seg]) + ") ›", () => renderFolder(section, node.sub[seg].path)));
  if (section === "local") {
    for (const key of node.songs.sort((a, b) => songTitleOf(a).localeCompare(songTitleOf(b))))
      { const r = songRow(songTitleOf(key) + "  · " + songStatus(key) + (key === S.currentPath ? "   ✓" : ""), () => { songsheet.classList.remove("on"); openDraft(key); }); if (key === S.currentPath) r.dataset.current = "1"; rows.appendChild(r); }
  } else {
    // this folder is one album iff every song here maps to the same CATALOG
    // group — the only case where game order (and the switch) applies
    const group = node.songs.length && groupOf(node.songs[0]);
    const oneAlbum = !!(group && node.songs.every(p => groupOf(p) === group));
    if (oneAlbum && albumHasTrackData(group)) rows.appendChild(albumOrderControl(group, () => renderFolder(section, folder)));
    const songs = oneAlbum
      ? albumEffectiveOrder(group).map(([, p]) => p).filter(p => node.songs.includes(p))
      : node.songs.slice().sort((a, b) => songTitleOf(a).localeCompare(songTitleOf(b)));
    for (const path of songs) {
      const local = localStorage.getItem(draftStoreKey(path)) !== null; // the tap opens the local copy (draft wins)
      const r = songRow(songTitleOf(path) + (local ? "  · local copy" : "") + (path === S.currentPath ? "   ✓" : ""), () => {
        S.currentPath = path;
        rememberLastSong(path);
        reflectSongURL(path);
        updateSongBtn();
        songsheet.classList.remove("on");
        loadSong(path).catch(e => setInfo(e.message));
      }); if (path === S.currentPath) r.dataset.current = "1"; rows.appendChild(r);
    }
  }
  { const cur = rows.querySelector ? rows.querySelector("[data-current]") : null; if (cur && cur.scrollIntoView) cur.scrollIntoView({block: "center"}); } // the song you are on comes into view; a folder without it starts at the top (Josh, 2026-09-28)
}
function renderSongList(group) { renderFolder("published", folderOf(S.CATALOG[group][0][1])); } // an album is its folder
function openSongPicker() {
  // open straight into the current song's folder — one less tap for the sweep
  if (S.currentPath && localStorage.getItem("ff1roll-draft-" + S.currentPath)) renderFolder("local", folderOf(S.currentPath)); // the local copy is what's open
  else if (S.currentPath && catalogHas(S.currentPath)) renderFolder("published", folderOf(S.currentPath));
  else renderSongGroups();
  songsheet.classList.add("on");
  // the published list is re-read on every open (at most once per 20 s), and
  // the view redraws only if something changed — a song published from the
  // terminal or another device shows up without relaunching (Josh, 2026-09-28)
  if (Date.now() - S.catalogRefreshedAt > 20000 && typeof initCatalog === "function") {
    S.catalogRefreshedAt = Date.now();
    const sig = () => JSON.stringify(Object.entries(S.CATALOG).map(([k, v]) => k + ":" + v.length));
    const before = sig();
    initCatalog().then(() => { if (songsheet.classList.contains("on") && S.songViewRedraw && sig() !== before) S.songViewRedraw(); }).catch(() => { /* offline: the list you had */ });
  }
}
document.getElementById("playbtn").addEventListener("click", () => {
  if (!S.song) return; // first song still fetching
  if (!S.playing && S.playGateShown) { playGateTick.queued = !playGateTick.queued; playGateTick(); return; } // loading: the tap queues (or cancels) the play; it starts when the sound is ready
  S.playing ? stop() : play(S.playCursor > 0 ? tickToSec(S.song, S.playCursor) : 0); // in an album run this is pause/resume — the run stays
});
document.getElementById("rwbtn").addEventListener("click", () => {
  const startX = S.viewMode === "score" ? -SCORE_INTRO_W : 0;
  // an armed cycle owns the transport: ⏮ returns to ITS start, not bar 1
  const home = S.rangeSel && S.rangeSel.cycle && !S.rangeSel.off ? S.rangeSel.a : 0;
  if (S.playing) { stop(); S.playCursor = home; S.view.x = startX; play(tickToSec(S.song, home)); return; }
  S.playCursor = home;
  S.view.x = startX;
  updateSubtitle();
  draw();
});
const speedsl = document.getElementById("speedsl");
const speedlbl = document.getElementById("speedlbl");
const speedreset = document.getElementById("speedreset");
function applySpeed(pct) {
  speedsl.value = String(pct);
  speedlbl.textContent = pct + "%";
  speedreset.style.display = pct === 100 ? "none" : ""; // snap-back appears when off-native
  if (!S.song) { S.playRate = pct / 100; return; }
  const tk = curTick(); // keep the musical position across the rate change
  const wasPlaying = S.playing;
  if (wasPlaying) stop();
  S.playRate = pct / 100;
  stretchCache.clear(); // a new rate: re-render the takes (pitch-preserving), old renders go
  stretchEnsureAll();
  updateSongMeta();
  if (wasPlaying) play(tickToSec(S.song, tk));
  else { S.playCursor = tk; updateSubtitle(); draw(); }
}
speedsl.addEventListener("input", () => { speedlbl.textContent = speedsl.value + "%"; });
speedsl.addEventListener("change", () => applySpeed(+speedsl.value)); // on release, not per drag-tick
speedreset.addEventListener("click", () => {
  applySpeed(100);
  document.getElementById("speedpop").style.display = "none"; // reset means done — fold immediately
});
// speed + volume live behind BUTTONS (Josh, 2026-08-22: the slider "takes too
// much space... if I click it, it opens up the slider") — tap toggles the
// popover open; tapping anywhere else folds it back to a button
{
  const pops = [["speedbtn", "speedpop"], ["volbtn", "volpop"]];
  for (const [bid, pid] of pops) {
    document.getElementById(bid).addEventListener("click", () => {
      for (const [b2, p2] of pops) // one open at a time
        document.getElementById(p2).style.display = p2 === pid &&
          document.getElementById(p2).style.display === "none" ? "flex" : "none";
    });
  }
  document.addEventListener("pointerdown", e => {
    for (const [bid, pid] of pops) {
      const pop = document.getElementById(pid);
      if (pop.style.display !== "none" && !pop.contains(e.target) && e.target.id !== bid)
        pop.style.display = "none";
    }
  }, {capture: true});
}
const speedbtn = document.getElementById("speedbtn");
const _applySpeedInner = applySpeed;
applySpeed = pct => { _applySpeedInner(pct); speedbtn.textContent = pct + "%"; };
// master volume: device pref, multiplies MASTER_VOL everywhere it lands
const volsl = document.getElementById("volsl");
const vollbl = document.getElementById("vollbl");
const volbtn = document.getElementById("volbtn");
S.masterVol = +(localStorage.getItem("ff1roll-mastervol") || 1);
volsl.value = String(Math.round(S.masterVol * 100));
vollbl.textContent = Math.round(S.masterVol * 100) + "%";
setVolBtn(Math.round(S.masterVol * 100));
volsl.addEventListener("input", () => {
  S.masterVol = (+volsl.value) / 100;
  vollbl.textContent = volsl.value + "%";
  setVolBtn(+volsl.value);
  localStorage.setItem("ff1roll-mastervol", String(S.masterVol));
  if (S.audio && S.master) S.master.gain.setValueAtTime(MASTER_VOL * S.masterVol, S.audio.currentTime);
});

 function fileMeterAt(tick) { // the file's own declared meter at a tick, or null
  if (!S.song || !S.song.source || !S.song.source.timesigs || !S.song.source.timesigs.length) return null;
  let cur = S.song.source.timesigs[0];
  for (const ts of S.song.source.timesigs) { if (ts.tick <= tick) cur = ts; else break; }
  return {num: cur.num, den: cur.den};
}
{
  // black keys get THREE options (2026-08-12 spec): fused "A#/Bb" = spelling
  // undetermined, plus each asserted spelling — Josh can know a tonic is Bb
  // and not A# before knowing the mode, and the picker must let him say so.
  // Option value = "pc:spelling", fused/naturals = "pc:".
  for (let pc = 0; pc < 12; pc++) {
    const add = (sp, label) => {
      const o = document.createElement("option");
      o.value = pc + ":" + sp;
      o.textContent = label;
      keysel.appendChild(o);
    };
    if (TONIC_SPELL[pc].length === 1) add("", TONIC_SPELL[pc][0]);
    else {
      add("", tonicLabel(pc)); // undecided
      for (const sp of TONIC_SPELL[pc]) add(sp, "· " + sp);
    }
  }
  const nk = document.getElementById("nkeysel"); // editor picker: same tonic list
  for (const opt of keysel.querySelectorAll("option")) {
    if (opt.value === "") continue;
    nk.appendChild(opt.cloneNode(true));
  }
}
 function refreshKeyPreview() { // preview applies only when tonic AND mode are chosen
  const pc = chosenTonicPc(), mode = keymodeSel.value;
  const full = pc !== null && mode ? keyNameFor(pc, mode) : null;
  S.previewSf = full ? full.sf : null;
  keymodeSel.style.display = pc === null ? "none" : "";
  keysetBtn.style.display = pc === null ? "none" : "";
  refreshKeysetLabel();
  buildScoreModel();
  clampView();
  draw();
}
keysel.addEventListener("change", refreshKeyPreview);
keymodeSel.addEventListener("change", refreshKeyPreview);
keysetBtn.addEventListener("click", () => {
  const t = chosenTonic(), mode = keymodeSel.value;
  if (!t || !S.song || !S.songKey) return;
  const bar = Math.floor(S.playCursor / barTicks()) + 1;
  dropLocalKeyAt(bar);
  let name, fresh;
  if (mode) {
    const full = keyNameFor(t.pc, mode);
    name = full.name;
    fresh = {b1: bar, q1: 1, b2: null, q2: null, text: "key: " + name, keydir: full.sf, added: true};
  } else { // tonic only: stored, NOT applied — asserted spelling if Josh chose one
    const tonic = partialNameOf(t);
    name = tonic + "?";
    fresh = {b1: bar, q1: 1, b2: null, q2: null, text: "key: " + name, keypartial: tonic, added: true};
  }
  S.rollnotes.push(resolveNote(fresh));
  S.previewSf = null;
  keysel.value = "";
  keymodeSel.value = "";
  keysetBtn.style.display = "none";
  keymodeSel.style.display = "none";
  finalizeNotes();
  saveLocalNotes();
  buildScoreModel();
  S.lastSubtitle = undefined;
  updateSubtitle();
  draw();
  setInfo(mode ? "key set to " + name + " at bar " + bar + " (unsynced — Sync to commit)"
               : "tonic " + name + " stored at bar " + bar + " — NOT applied until a mode is set");
});
document.getElementById("keysetest").addEventListener("click", () => {
  // promotes the Normal-mode estimate to a real, declared key: annotation —
  // still only on a tap, same as any other key declaration (never written
  // just because Normal mode is on)
  if (!S.song || !S.songKey) return;
  const est = estimateKey();
  if (!est) return;
  const bar = Math.floor(S.playCursor / barTicks()) + 1;
  dropLocalKeyAt(bar);
  const fresh = {b1: bar, q1: 1, b2: null, q2: null, text: "key: " + est.name, keydir: est.sf, added: true};
  S.rollnotes.push(resolveNote(fresh));
  finalizeNotes();
  saveLocalNotes();
  buildScoreModel();
  S.lastSubtitle = undefined;
  updateSubtitle();
  draw();
  setInfo("key set to " + est.name + " at bar " + bar + " (from the estimate — unsynced — Sync to commit)");
});

met.on = false;
{
  const num = document.getElementById("metnum");
  for (let n = 1; n <= 12; n++) {
    const o = document.createElement("option");
    o.textContent = String(n);
    num.appendChild(o);
  }
  num.value = String(met.num);
  document.getElementById("metden").value = String(met.den);
  document.getElementById("metsub").value = String(met.sub);
  document.getElementById("metbpm").value = String(met.bpm);
  document.getElementById("metbpmlbl").textContent = met.bpm + " bpm";
  document.getElementById("metfollow").value = met.follow;
  document.getElementById("metcountin").checked = !!met.countIn;
  metBuildCells();
  applyMetMode();
}
// ⏱ is a one-tap click toggle, the DAW habit (Logic's K); ⚙ beside it opens
// the settings (Josh, 2026-09-29: three taps to turn the click on was too many)
document.getElementById("metbtn").addEventListener("click", () => met.on ? metHalt() : metStart());
document.getElementById("metcfg").addEventListener("click", () => {
  const sheet = document.getElementById("metsheet");
  if (sheet.classList.contains("on")) { sheet.classList.remove("on"); return; }
  const r = document.getElementById("metbtn").getBoundingClientRect();
  sheet.style.top = (r.bottom + 6) + "px";
  sheet.classList.add("on");
  // right-anchor near the button, clamped on-screen
  requestAnimationFrame(() => {
    const w = sheet.offsetWidth;
    sheet.style.left = Math.max(6, Math.min(r.right - w, songRegionRight() - w - 6)) + "px";
  });
});
document.getElementById("metclose").addEventListener("click", () =>
  document.getElementById("metsheet").classList.remove("on")); // panel closes; the click keeps going
document.getElementById("metgo").addEventListener("click", () => met.on ? metHalt() : metStart());
document.getElementById("metbpm").addEventListener("input", e => {
  met.bpm = +e.target.value;
  document.getElementById("metbpmlbl").textContent = met.bpm + " bpm";
  metSave();
});
document.getElementById("metnum").addEventListener("change", e => {
  met.num = +e.target.value;
  met.accents = metDefaultAccents();
  metSave();
  metBuildCells();
});
document.getElementById("metden").addEventListener("change", e => {
  met.den = +e.target.value;
  met.accents = metDefaultAccents();
  metSave();
  metBuildCells();
});
document.getElementById("metsub").addEventListener("change", e => {
  met.sub = +e.target.value;
  metSave();
});
document.getElementById("metfollow").addEventListener("change", e => {
  met.follow = e.target.value;
  applyMetMode();
});
document.getElementById("metnudgeL").addEventListener("click", () => {
  met.nudge = (((met.nudge - 1) % metFollowNum()) + metFollowNum()) % metFollowNum();
  metSave();
});
document.getElementById("metnudgeR").addEventListener("click", () => {
  met.nudge = (met.nudge + 1) % metFollowNum();
  metSave();
});
document.getElementById("metcountin").addEventListener("change", e => {
  met.countIn = e.target.checked;
  metSave();
});
document.getElementById("mettap").addEventListener("click", () => {
  const now = performance.now();
  S.metTaps = S.metTaps.filter(t => now - t < 3000);
  S.metTaps.push(now);
  if (S.metTaps.length >= 2) {
    const gaps = S.metTaps.slice(1).map((t, i) => t - S.metTaps[i]);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    met.bpm = Math.max(30, Math.min(260, Math.round(60000 / avg)));
    document.getElementById("metbpm").value = String(met.bpm);
    document.getElementById("metbpmlbl").textContent = met.bpm + " bpm";
    metSave();
  }
});

                  function moveSelectionToTrack(target, dT = 0) { // ⇄ / tracks-view retrack: keeps pitch; dT slides time
  if (!editableSong() || !S.song.tracks[target] || S.song.tracks[target].kind === "audio") return 0;
  const items = selEditItems().filter(({ti}) => ti !== target &&
    (S.mvFromFilter === null || ti === S.mvFromFilter));
  if (!items.length) return 0;
  const tr = S.song.tracks[target], isAdd = !isComposition();
  const added = [], erased = [];
  for (const it of items) {
    const n = it.n;
    const nt = Math.max(0, n.t + dT);
    tr.notes.push({t: nt, d: n.d, p: n.p, v: n.v, duty: n.duty, added: isAdd});
    if (S.song.rawNotes) S.song.rawNotes[target].push({t: nt + S.chopS, d: n.d, p: n.p, v: n.v, added: isAdd});
    added.push({ti: target, ni: tr.notes.length - 1});
    n.gone = true;
    const rn = S.song.rawNotes && n.ri !== undefined && S.song.rawNotes[it.ti][n.ri];
    if (rn) rn.gone = true;
    erased.push({ti: it.ti, ni: it.ni});
  }
  pushUndo({kind: "group", entries: [{kind: "eraseBatch", items: erased}, {kind: "addBatch", items: added}]});
  S.multiSel = added.slice();
  S.multiSelKey = new Set(added.map(({ti, ni}) => ti + ":" + ni));
  S.selNote = null;
  saveEdits();
  computeSongEnd();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  return items.length;
}
function dedupeSong() { // 🧹 back by demand (Josh 2026-08-18: old drafts keep
  // re-saving pre-guard stacks over the cleaned repo file — HE runs it, HE
  // saves). Whole song, every track; exact same start+pitch WITHIN one track
  // collapses to the longest; cross-track unisons untouched by construction.
  if (!editableSong()) return 0;
  const erased = [];
  S.song.tracks.forEach((tr, ti) => {
    const best = new Map();
    tr.notes.forEach((n, ni) => {
      if (n.gone) return;
      const k = n.t + ":" + n.p;
      const prev = best.get(k);
      if (!prev) { best.set(k, {ni, d: n.d}); return; }
      const loser = n.d > prev.d ? prev.ni : ni;
      if (n.d > prev.d) best.set(k, {ni, d: n.d});
      const ln = tr.notes[loser];
      ln.gone = true;
      const rn = S.song.rawNotes && ln.ri !== undefined && S.song.rawNotes[ti][ln.ri];
      if (rn) rn.gone = true;
      erased.push({ti, ni: loser});
    });
  });
  if (!erased.length) return 0;
  pushUndo({kind: "eraseBatch", items: erased});
  S.multiSel = []; S.multiSelKey = new Set(); S.selNote = null;
  saveEdits();
  computeSongEnd();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  return erased.length;
}
function insertChordAt(tick, rootPc, qual, oct, durQ) {
  if (!editableSong()) return 0;
  // P4 (docs/annotations-v2.md): closes P3's gap — this tool writes a chord
  // BAND (an annotation, stampChordBand below) along with the notes; a
  // locked song refuses the whole gesture rather than leave the band out
  if (S.rollnotesReadOnly) { setInfo(S.rollnotesLockReason || ROLLNOTES_LOCK_MSG); return 0; }
  const annoBefore = annoSnapshot(); // the ruler band undoes with the notes (Josh, 2026-09-12)
  const ivs = (CHORD_QUALS.find(([q]) => q === qual) || CHORD_QUALS[0])[1];
  const snap = Math.max(1, Math.round(S.song.ppq * (durQ || S.pencilDur)));
  const t0 = Math.max(0, Math.round(tick / snap) * snap);
  const base = (oct + 1) * 12 + rootPc;
  const tr = S.song.tracks[S.selTrack], isAdd = !isComposition();
  const added = [];
  for (const iv of ivs) {
    const p = base + iv;
    if (p < S.PMIN || p > S.PMAX) continue;
    if (tr.notes.some(n => !n.gone && n.t === t0 && n.p === p)) continue; // never stack
    tr.notes.push({t: t0, d: snap, p, v: S.pencilVel, added: isAdd});
    if (S.song.rawNotes) S.song.rawNotes[S.selTrack].push({t: t0 + S.chopS, d: snap, p, v: S.pencilVel, added: isAdd});
    added.push({ti: S.selTrack, ni: tr.notes.length - 1});
  }
  if (!added.length) return 0;
  pushUndo({kind: "group", entries: [{kind: "anno", json: annoBefore}, {kind: "addBatch", items: added}]});
  S.multiSel = added.slice();
  S.multiSelKey = new Set(added.map(({ti, ni}) => ti + ":" + ni));
  S.selNote = null;
  stampChordBand(t0, snap, chordSym(rootPc, qual));
  finalizeNotes();
  saveLocalNotes();
  S.playCursor = t0 + snap; // walk forward: the next insert lands right after
  saveEdits();
  computeSongEnd();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  return added.length;
}
{
  const roots = document.getElementById("chroots"), quals = document.getElementById("chquals");
  const preview = () => { document.getElementById("chpreview").textContent = chordLabel(); };
  roots.innerHTML = CHORD_ROOTS.map((r, i) =>
    '<button data-root="' + i + '" style="min-height:40px">' + r + '</button>').join("");
  quals.innerHTML = CHORD_QUALS.map(([q]) =>
    '<button data-qual="' + q + '" style="min-height:40px">' + (q === "maj" ? "maj" : q) + '</button>').join("");
  const sel = document.getElementById("choct");
  sel.innerHTML = [2, 3, 4, 5, 6].map(o => '<option' + (o === 4 ? ' selected' : '') + '>' + o + '</option>').join("");
  sel.addEventListener("change", () => { S.chordOct = parseInt(sel.value, 10); });
  const durOpts = v => INS_DURS.map(([lb, q]) =>
    '<option value="' + q + '"' + (q === v ? ' selected' : '') + '>' + lb + '</option>').join("");
  const chdur = document.getElementById("chdur");
  chdur.innerHTML = durOpts(S.chordInsDur);
  chdur.addEventListener("change", () => {
    S.chordInsDur = parseFloat(chdur.value);
    const pg = document.getElementById("pgdur");
    if (pg) pg.value = chdur.value;
  });
  const mark = () => {
    for (const b of roots.children) b.classList.toggle("primary", +b.dataset.root === S.chordRoot);
    for (const b of quals.children) b.classList.toggle("primary", b.dataset.qual === S.chordQual);
    preview();
  };
  roots.addEventListener("click", e => {
    const b = e.target.closest("button[data-root]");
    if (b) { S.chordRoot = +b.dataset.root; mark(); }
  });
  quals.addEventListener("click", e => {
    const b = e.target.closest("button[data-qual]");
    if (b) { S.chordQual = b.dataset.qual; mark(); }
  });
  document.getElementById("insbtn").addEventListener("click", () => {
    if (!editableSong()) { setInfo("chords insert on your own songs — captures are locked"); return; }
    mark();
    document.getElementById("chordsheet").classList.add("on");
  });
  document.getElementById("chinsert").addEventListener("click", () => {
    const k = insertChordAt(S.playCursor, S.chordRoot, S.chordQual, S.chordOct, S.chordInsDur);
    setInfo(k ? "inserted " + chordLabel() + " (" + k + " notes) — cursor moved to the next slot"
              : "couldn't insert — check the octave fits the C1..C7 range");
  });
}
 function insertProgressionAt(tick, progStr, tonicPc, oct, durQ, minorScale) {
  if (!editableSong()) return 0;
  const chords = splitProgression(progStr).map(t => parseNumeral(t, minorScale));
  if (!chords.length || chords.some(c => !c)) return 0;
  const annoBefore = annoSnapshot(); // the bands undo with the notes (Josh, 2026-09-12: undo left them behind)
  const snap = Math.max(1, Math.round(S.song.ppq * (durQ || S.pencilDur)));
  let t0 = Math.max(0, Math.round(tick / snap) * snap);
  const tr = S.song.tracks[S.selTrack], isAdd = !isComposition();
  const added = [];
  for (const c of chords) {
    const ivs = CHORD_QUALS.find(([q]) => q === c.qual)[1];
    const base = (oct + 1) * 12 + ((tonicPc + c.pcOff) % 12);
    for (const iv of ivs) {
      const p = base + iv;
      if (p < S.PMIN || p > S.PMAX) continue;
      if (tr.notes.some(n => !n.gone && n.t === t0 && n.p === p)) continue; // never stack
      tr.notes.push({t: t0, d: snap, p, v: S.pencilVel, added: isAdd});
      if (S.song.rawNotes) S.song.rawNotes[S.selTrack].push({t: t0 + S.chopS, d: snap, p, v: S.pencilVel, added: isAdd});
      added.push({ti: S.selTrack, ni: tr.notes.length - 1});
    }
    stampChordBand(t0, snap, chordSym((tonicPc + c.pcOff) % 12, c.qual));
    t0 += snap;
  }
  if (!added.length) return 0;
  pushUndo({kind: "group", entries: [{kind: "anno", json: annoBefore}, {kind: "addBatch", items: added}]}); // notes + bands = one undo
  finalizeNotes();
  saveLocalNotes();
  S.multiSel = added.slice();
  S.multiSelKey = new Set(added.map(({ti, ni}) => ti + ":" + ni));
  S.selNote = null;
  S.playCursor = t0;
  saveEdits();
  computeSongEnd();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  return added.length;
}
{
  const panel = document.getElementById("progpanel");
  panel.innerHTML =
    '<div class="row" style="flex-wrap:wrap;gap:6px;padding:4px 2px 8px">' +
      '<span class="lbl">tonic</span><select id="pgtonic">' +
        CHORD_ROOTS.map((r, i) => '<option value="' + i + '">' + r + '</option>').join("") +
      '</select><span class="lbl">octave</span><select id="pgoct">' +
        [2, 3, 4, 5, 6].map(o => '<option' + (o === 4 ? ' selected' : '') + '>' + o + '</option>').join("") +
      '</select><span class="lbl">duration</span><select id="pgdur">' +
        INS_DURS.map(([lb, q]) => '<option value="' + q + '"' + (q === 1 ? ' selected' : '') + '>' + lb + '</option>').join("") +
      '</select><span class="lbl" style="opacity:.7">tap a progression to insert it at the cursor — one chord per slot</span></div>' +
    '<div class="row" style="flex-wrap:wrap;gap:6px;padding:0 2px 8px">' +
      '<span class="lbl">type your own</span>' +
      '<input type="text" id="pgcustom" placeholder="i – VI – VII – V" style="flex:1;min-width:160px;min-height:40px">' +
      '<select id="pgmode"><option value="major">major scale</option><option value="minor">minor scale</option></select>' +
      '<button id="pggo">Insert</button></div>' +
    PROG_LIB.map(([mood, prog, why], i) =>
      '<div class="prow" data-prog="' + i + '"><b>' + mood + '</b><span class="pchords">' + prog + '</span><small>' + why + '</small></div>'
    ).join("");
  panel.addEventListener("click", e => {
    const row = e.target.closest(".prow[data-prog]");
    if (!row) return;
    if (!editableSong()) { setInfo("progressions insert on your own songs — captures are locked"); return; }
    const [mood, prog] = PROG_LIB[+row.dataset.prog];
    const tonicPc = +document.getElementById("pgtonic").value;
    const oct = parseInt(document.getElementById("pgoct").value, 10);
    S.chordInsDur = parseFloat(document.getElementById("pgdur").value);
    document.getElementById("chdur").value = document.getElementById("pgdur").value;
    const k = insertProgressionAt(S.playCursor, prog, tonicPc, oct, S.chordInsDur);
    setInfo(k ? "inserted " + mood + " in " + CHORD_ROOTS[tonicPc].split("/")[0] + " (" + k + " notes) — stretch or move them from here"
              : "couldn't insert — check the octave fits C1..C7");
  });
  // typed progression: the same insert, numerals read against the chosen
  // scale (minor pre-selects itself from a minor key at the cursor)
  const insertCustom = () => {
    const prog = document.getElementById("pgcustom").value.trim();
    if (!prog) { setInfo("type a progression first — numerals like i – VI – VII – V"); return; }
    if (!editableSong()) { setInfo("progressions insert on your own songs — captures are locked"); return; }
    const minorScale = document.getElementById("pgmode").value === "minor";
    const bad = splitProgression(prog).filter(t => !parseNumeral(t, minorScale));
    if (bad.length) { setInfo("couldn't read " + bad.join(", ") + " — use I..VII, lowercase for minor, ♭/♯ or b/# in front, °/7/maj7/6 after"); return; }
    const tonicPc = +document.getElementById("pgtonic").value;
    const oct = parseInt(document.getElementById("pgoct").value, 10);
    S.chordInsDur = parseFloat(document.getElementById("pgdur").value);
    document.getElementById("chdur").value = document.getElementById("pgdur").value;
    const k = insertProgressionAt(S.playCursor, prog, tonicPc, oct, S.chordInsDur, minorScale);
    setInfo(k ? "inserted " + prog + " in " + CHORD_ROOTS[tonicPc].split("/")[0] + (minorScale ? " minor" : "") + " (" + k + " notes) — erase tones to make arpeggios"
              : "couldn't insert — check the octave fits C1..C7");
  };
  document.getElementById("pggo").addEventListener("click", insertCustom);
  document.getElementById("pgcustom").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); insertCustom(); } });
  // one panel, two homes (Josh: "let's do both") — it reparents into whichever
  // dialog summons it
  const tabC = document.getElementById("chtab-chord"), tabP = document.getElementById("chtab-prog");
  const seedTonic = () => { // declared key at the cursor pre-fills the tonic (override freely)
    const name = S.song ? keyNameAt(S.playCursor) : null;
    const pc = name ? tonicPcOfName(name) : null;
    if (pc !== null) document.getElementById("pgtonic").value = pc;
    if (name) document.getElementById("pgmode").value = /m$|minor|aeolian|dorian|phrygian/i.test(name) ? "minor" : "major";
  };
  const setTab = prog => {
    if (prog) { document.getElementById("chprogslot").appendChild(panel); seedTonic(); }
    document.getElementById("chchordpane").style.display = prog ? "none" : "";
    panel.style.display = prog ? "block" : "none";
    tabC.classList.toggle("primary", !prog);
    tabP.classList.toggle("primary", prog);
    tabC.setAttribute("aria-selected", String(!prog));
    tabP.setAttribute("aria-selected", String(prog));
  };
  tabC.addEventListener("click", () => setTab(false));
  tabP.addEventListener("click", () => setTab(true));
  // reopening the dialog re-reads the key too: Josh set a key with the
  // dialog already on the Progression tab and it kept the stale scale
  document.getElementById("insbtn").addEventListener("click", () => { if (editableSong()) seedTonic(); });
  const cofBtn = document.getElementById("cofprogbtn");
  cofBtn.addEventListener("click", () => {
    const showing = panel.parentElement.id === "cofprogslot" && panel.style.display !== "none";
    if (!showing) { document.getElementById("cofprogslot").appendChild(panel); panel.style.display = "block"; seedTonic(); }
    else panel.style.display = "none";
    for (const id of ["cofcanvas", "cofdetail", "cofccw", "cofcw"])
      document.getElementById(id).style.display = showing ? "" : "none";
    cofBtn.textContent = showing ? "Progressions" : "Wheel";
  });
}
 document.getElementById("cofbtn").addEventListener("click", () => {
  const g = S.song ? sfShownAt(curTick()) : null;
  S.cofSf = g !== null ? wrapSf(g) : 0;
  S.cofRot = S.cofSf; // the song's key rides at 12 o'clock
  document.getElementById("cofsheet").classList.add("on");
  drawCof();
});
// Undo/Redo spin the WHEEL a fifth at a time; the degree window moves by tapping wedges
document.getElementById("cofcw").addEventListener("click", () => { S.cofRot = wrapSf(S.cofRot - 1); drawCof(); });
document.getElementById("cofccw").addEventListener("click", () => { S.cofRot = wrapSf(S.cofRot + 1); drawCof(); });
const cofAngle = e => {
  const r = cofCanvas.getBoundingClientRect();
  return Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2);
};
cofCanvas.addEventListener("pointerdown", e => {
  cofCanvas.setPointerCapture(e.pointerId);
  S.cofPtr = {id: e.pointerId, a0: cofAngle(e), rot0: S.cofRot, moved: false};
});
cofCanvas.addEventListener("pointermove", e => {
  if (!S.cofPtr || S.cofPtr.id !== e.pointerId) return;
  let d = cofAngle(e) - S.cofPtr.a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  if (Math.abs(d) > 0.06) S.cofPtr.moved = true;
  if (S.cofPtr.moved) {
    S.cofDragRot = S.cofPtr.rot0 - d / (Math.PI / 6); // wheel follows the finger
    drawCof();
  }
});
function cofRelease(e) {
  if (!S.cofPtr || S.cofPtr.id !== e.pointerId) return;
  if (S.cofPtr.moved) {
    S.cofRot = wrapSf(Math.round(S.cofDragRot));
    S.cofDragRot = null;
  } else { // plain tap: center the degree window on the tapped wedge
    let i = Math.round((cofAngle(e) + Math.PI / 2) / (Math.PI / 6));
    i = ((i % 12) + 12) % 12;
    S.cofSf = wrapSf(wrapSf(i > 6 ? i - 12 : i) + S.cofRot);
  }
  S.cofPtr = null;
  drawCof();
}
cofCanvas.addEventListener("pointerup", cofRelease);
cofCanvas.addEventListener("pointercancel", () => { S.cofPtr = null; S.cofDragRot = null; drawCof(); });

document.getElementById("listbtn").addEventListener("click", e => {
  document.getElementById("notesstrip").textContent = S.subOn ? "Hide notes strip" : "Show notes strip";
  openDropUp(e.currentTarget, document.getElementById("notesmenu"));
});
document.getElementById("notesstrip").addEventListener("click", () => { closeDropUp(); toggleSubtitle(); renderViewMenu(); });
document.getElementById("notesall").addEventListener("click", () => { closeDropUp(); openNoteList(); });
document.getElementById("notelistSync").addEventListener("click", () => {
  notelistSheet.classList.remove("on");
  document.getElementById("syncbtn").click();
  S.syncReturnToList = true; // after a successful commit, go back to the list
});
document.getElementById("notelistAdd").addEventListener("click", () => {
  notelistSheet.classList.remove("on");
  openEditor(null);
});

document.getElementById("helptabs").addEventListener("click", e => {
  const b = e.target.closest("button[data-hs]");
  if (b) showHelpTab(b.dataset.hs);
});
document.getElementById("filehelp").addEventListener("click", () => {
  closeFileMenus();
  showHelpTab(localStorage.getItem("ff1roll-helptab") || "views");
  document.getElementById("helpsheet").classList.add("on");
});
document.getElementById("fileabout").addEventListener("click", () => {
  closeFileMenus();
  const n = Object.values(S.CATALOG).reduce((k, s) => k + s.length, 0);
  document.getElementById("aboutstats").textContent =
    Object.keys(S.CATALOG).length + " albums · " + n + " songs · " + draftKeys().length + " local drafts";
  document.getElementById("aboutsheet").classList.add("on");
});

findsel.addEventListener("focus", refreshFindSel);
findsel.addEventListener("change", () => {
  S.findPc = findsel.value === "" ? null : +findsel.value;
  if (S.findPc === null) { setInfo("find: off"); draw(); return; }
  let count = 0;
  const chans = new Set();
  if (S.song) S.song.tracks.forEach((tr, ti) => {
    if (!trackShown(ti) || trackIsDrums(ti)) return;
    for (const n of tr.notes) if (!n.gone && n.p % 12 === S.findPc) { count++; chans.add(tr.name || "track " + (ti + 1)); }
  });
  const sf = sfShownAt(curTick());
  const deg = degreeOf(S.findPc, keyNameShownAt(curTick()));
  const name = spellPc(S.findPc, sf) + (deg ? " (degree " + deg + ")" : "");
  setInfo(count ? "find " + name + ": " + count + " notes — " + [...chans].join(", ")
                : "find " + name + ": 0 — not present in this song");
  draw();
});

lassobtn.addEventListener("click", () => {
  S.lassoMode = !S.lassoMode;
  lassobtn.classList.toggle("active", S.lassoMode);
  lassobtn.setAttribute("aria-pressed", String(S.lassoMode));
  clearMultiSel();
  setInfo(S.lassoMode ? "lasso: drag across notes to identify them" : "tap a note");
  draw();
});
document.getElementById("chcopy").addEventListener("click", async e => {
  try { await navigator.clipboard.writeText(S.challengeCopy); e.target.textContent = "✓ copied"; }
  catch { e.target.textContent = "✗ copy failed"; }
  setTimeout(() => { e.target.textContent = "Copy"; }, 1200);
});
document.getElementById("chordbtn").addEventListener("click", () => {
  if (S.challengeSec) { openChallenge(S.challengeSec); return; }
  if (!S.multiSel.length) return;
  const pitches = S.multiSel.map(s => S.song.tracks[s.ti].notes[s.ni].p);
  const names = [...new Set(pitches)].sort((a, b) => a - b).map(p => pitchName(p, S.multiSelSf));
  const chordName = nameChord(pitches, S.multiSelSf);
  setInfo(names.join(" · ") + "  →  " + chordName, names.join(", ") + " — " + chordName);
});

function applyListener() {
  if (!document.body) return; // vm harness has no body
  document.body.classList.toggle("listener", S.listenerMode);
  if (S.song) finalizeNotes(); // band lanes + RULER_H depend on the mode
  window.dispatchEvent(new Event("resize"));
}
if (typeof document !== "undefined" && document.body) { // real browser only — layout/Mutation observers are not unit tested, like the wmdock menu's own dismissal above
  const footerEl = document.getElementById("footer");
  if (typeof ResizeObserver === "function") new ResizeObserver(scheduleFitReadline).observe(footerEl);
  // buttons appearing/disappearing (⚠/✦ reply/Clear edits, ⊞ Lasso's own
  // label dropping to a glyph past ~420px) change the leftover without
  // necessarily resizing the footer itself
  if (typeof MutationObserver === "function") new MutationObserver(scheduleFitReadline).observe(footerEl, {attributes: true, attributeFilter: ["style", "class"], subtree: true});
}
fitReadline(); // initial state — applyChrome() isn't called at boot when nothing is folded
{
  const old = localStorage.getItem("ff1roll-panelhide"); // migrate the combined key
  if (old !== null) {
    localStorage.setItem("ff1roll-editrow-hidden", old);
    localStorage.setItem("ff1roll-footer-hidden", old);
    localStorage.removeItem("ff1roll-panelhide");
  }
  // phones start folded (a hand-sized screen is for the music, not the
  // buttons); an explicit choice becomes the remembered one. iPads and up
  // start open. min(screen dims) < 500 CSS px ≈ every phone, no iPad.
  const scr = (typeof screen !== "undefined" && screen) || {width: 1024, height: 768};
  const phone = Math.min(scr.width, scr.height) < 500;
  const er = localStorage.getItem("ff1roll-editrow-hidden");
  const fo = localStorage.getItem("ff1roll-footer-hidden");
  S.editrowHidden = er === null ? phone : er === "1";
  S.footerHidden = fo === null ? phone : fo === "1";
  // phones are PLAYERS by default (Josh, 2026-08-23: "I want to send songs to
  // people and have them open them and listen") — roll + transport, nothing
  // else; the Full app button opts a device back into the whole DAW
  const lm = localStorage.getItem("ff1roll-listener");
  S.listenerMode = lm === null ? phone : lm === "1";
  applyListener();
  document.getElementById("fullappbtn").addEventListener("click", () => {
    S.listenerMode = false;
    localStorage.setItem("ff1roll-listener", "0");
    applyListener();
    setInfo("full app on — View ▾ → 'Listener mode' folds it back");
  });
  // the ▾ hide buttons retired (Josh, 2026-08-22): hiding is the View menu's
  // job now; the floating ▴ stays as the never-strand restore
  document.getElementById("panelshow").addEventListener("click", () => { S.editrowHidden = S.footerHidden = false; applyChrome(); });
  if (S.editrowHidden || S.footerHidden) applyChrome();
}


// each view keeps its own zoom and scroll, per song, this session (Josh,
// 2026-09-29: a fully zoomed-out roll came back from Score at ~6 bars —
// Score raises pxq to what engraving can space). Restored BEFORE
// applyViewMode, whose clamps would otherwise act on the other view's numbers.
function setViewMode(m) {
  if (m === "score" && !VF) { setInfo("score engine failed to load"); return; }
  if (S.songKey) viewSaved.set(S.songKey + "|" + S.viewMode, {...S.view});
  S.viewMode = m;
  localStorage.setItem("ff1roll-view", S.viewMode);
  const sv = S.songKey && viewSaved.get(S.songKey + "|" + m);
  if (sv) Object.assign(S.view, sv);
  applyViewMode();
}
 function applyViewMode() {
  const tracks = S.viewMode === "tracks", score = S.viewMode === "score";
  const vText = tracks ? "Tracks" : score ? "Score" : "Roll";
  const aria = "View: " + vText + " — tap to switch";
  if (tracks) setControl("viewbtn", {icon: "tableRows", cls: "txt", label: vText + " ▴", aria});
  else if (score) setControl("viewbtn", {glyph: "𝄞", cls: "txt", label: " " + vText + " ▴", aria});
  else setControl("viewbtn", {icon: "gridView", cls: "txt", label: vText + " ▴", aria});
  renderViewSwitch();
  S.RULER_W = S.viewMode === "tracks" ? TRACKS_GUTTER : RULER_W_ROLL;
  // score entry (2026-08-15): Edit works in both views; ♮♯♭ is score-only
  document.getElementById("accseg").style.display =
    S.viewMode === "score" && S.editOn && S.mode === "pencil" ? "" : "none";
  if (S.viewMode === "score") {
    S.view.y = 0;
    if (S.view.pxq < minPxq()) S.view.pxq = minPxq(); // roll zooms out further than engraving can
    if (S.view.x < 40) S.view.x = -SCORE_INTRO_W; // near the start: show clef/key column
  } else if (S.viewMode === "tracks") {
    S.view.y = 0;
    if (S.view.x < 0) S.view.x = 0;
  } else if (S.view.x < 0) S.view.x = 0;
  clampView();
  draw();
}
 viewbtn.addEventListener("click", e => openDropUp(e.currentTarget, viewSwitchMenu));
document.getElementById("vsRoll").addEventListener("click", () => { closeDropUp(); setViewMode("roll"); });
document.getElementById("vsTracks").addEventListener("click", () => { closeDropUp(); setViewMode("tracks"); });
document.getElementById("vsScore").addEventListener("click", () => { closeDropUp(); setViewMode("score"); });

// (editOn is declared early, with the view state — the phone boot path calls
// renderViewMenu before this file's later sections ran; TDZ here bricked
// every iPhone: "Cannot access 'editOn' before initialization", 2026-08-23)
document.getElementById("accseg").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  S.pencilAcc = b.dataset.acc;
  for (const x of document.querySelectorAll("#accseg button")) {
    x.classList.toggle("active", x === b);
    x.setAttribute("aria-checked", String(x === b));
  }
});
// .m3u track-name playlists (the emu-scene convention: NSF rips ship with
// one). Zero-typing names (Josh, 2026-08-17 — hands hurt; data entry that a
// file already did is theft): pick the m3u with the NSF, or alone while an
// import session is open, and every row gets its real title.
// Zophar's playlists are latin-1, not UTF-8: the © in "©1989-12-15 Square" is
// one byte (0xA9). A plain UTF-8 decode turns it into U+FFFD, which defeated
// the copyright test below and made every FFL row read the same (Josh,
// 2026-09-27). Strict UTF-8 first — real UTF-8 rips keep working — else 1252.
function decodeM3u(bytes) {
  try { return new TextDecoder("utf-8", {fatal: true}).decode(bytes); }
  catch { return new TextDecoder("windows-1252").decode(bytes); }
}
function parseM3u(text) { // ordered [{n, title}] — playlist order IS album order
  const list = [];
  for (const line of text.split(/\r?\n/)) {
    // NSF and GBS rips share the line shape; the length is M:SS (Game Boy rips)
    // or H:MM:SS(.fff) (every Zophar NES rip). Read as M:SS, "0:01:16" was 1 s:
    // every track a "jingle", captured 12 s, never retried (2026-09-27, the
    // Castlevania batch — Stalker came back 12 s of a 64 s song).
    const m = line.match(/::(?:NSF|GBS),(\d+),(.+?),(?:(\d+):)?(\d+):(\d\d(?:\.\d+)?)/);
    if (!m) continue;
    const raw = m[2].replace(/\\,/g, ",");
    // split only OUTSIDE brackets: "Bloody Tears (Street - Day time BGM)" is
    // one title, not "Bloody Tears (Street" + "Day time BGM)" (Castlevania II,
    // 2026-09-29 — the song came out as "Day time BGM)")
    const parts = []; let depth = 0, cur = "";
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if ("([{".includes(ch)) depth++; else if (")]}".includes(ch)) depth = Math.max(0, depth - 1);
      if (depth === 0 && raw.startsWith(" - ", i)) { parts.push(cur); cur = ""; i += 2; continue; }
      cur += ch;
    }
    parts.push(cur);
    // two scenes, two layouts (the real FFL1 rip, 2026-09-27): NSF lines are
    // "Game - Artist - Title" with 1-based tracks; GBS lines are "Title -
    // Artist - Game - ©1989-12-15 Square" with 0-BASED tracks (gbsplay's
    // numbering, 0-16 for 17 subsongs) — title first, and +1 to the app's
    // rows. Keyed on the ::GBS marker, so a single picked per-track file
    // (no track 0 in sight) still lands on the right subsong.
    const gb = m[0].includes("::GBS,");
    const title = (gb && parts.length >= 2 ? parts[0] : parts.length >= 3 ? parts.slice(2).join(" - ") : parts[parts.length - 1]).trim();
    if (title) list.push({n: +m[1] + (gb ? 1 : 0), title, len: (+m[3] || 0) * 3600 + +m[4] * 60 + +m[5]});
  }
  return list;
}
function applyM3uNames(list) {
  if (!S.nsfSess) return 0;
  let applied = 0;
  for (const {n, title} of list) {
    const row = S.nsfSess.rows[n];
    if (!row) continue;
    row.name.value = title;
    if (row.key) { // captured already: rename the draft in place
      const nk = renameImportDraft(row.key, title);
      if (nk !== null) row.key = nk;
    }
    applied++;
  }
  return applied;
}
// A playlist picked AFTER the import (Josh, 2026-09-28: Zelda and Super Mario
// Bros. 3 arrived as track-01…): the open song's album is the target; each
// playlist line names the song whose chip slot number matches — local drafts
// are renamed in place (file and title, as the import session does), a
// published album gets its titles in one album.json write.
async function applyM3uToAlbum(list) {
  if (!S.songKey || !S.songKey.startsWith("albums/")) { setInfo("⚠ that is a track-name playlist — open a song from the album it names first"); return 0; }
  const dir = S.songKey.replace(/\/(?:songs\/)?[^/]+\.mid$/, "");
  const meta = await albumMetaFor(S.songKey);
  let tracks = meta && meta.nsf && meta.nsf.tracks;
  if (!tracks && isCaptureKey(S.songKey)) { const rec = await idbNsfGet(dir.split("/").pop()); tracks = rec && rec.tracks; } // unpublished: the device record
  if (!tracks) { setInfo("⚠ this album has no chip slot numbers to match the playlist against"); return 0; }
  const byN = {};
  for (const [base, t] of Object.entries(tracks)) { const n = typeof t === "number" ? t : t && t.n; if (n != null && byN[n] === undefined) byN[n] = dir + "/" + base + ".mid"; }
  const local = {}, published = {};
  for (const {n, title} of list) {
    const key = byN[n]; if (!key || !title) continue;
    const draft = localStorage.getItem(draftStoreKey(key));
    if (draft !== null && !(JSON.parse(draft) || {}).savedStamp) local[key] = title; else if (catalogHas(key)) published[key] = title;
  }
  const count = Object.keys(local).length + Object.keys(published).length;
  if (!count) { setInfo("⚠ no playlist line matched a song of this album (slot numbers differ?)"); return 0; }
  const ok = await appConfirm("NAME " + count + " SONG" + (count === 1 ? "" : "S") + "?",
    "From the playlist, by chip slot number: " + Object.keys(local).length + " local, " + Object.keys(published).length + " published" +
    (Object.keys(published).length ? " (one album.json write on GitHub)" : "") + ".", "Name them", "Cancel");
  if (!ok) return 0;
  let done = 0;
  for (const [key, title] of Object.entries(local)) { if (renameImportDraft(key, title) !== null) done++; }
  if (Object.keys(published).length) {
    const token = writeToken();
    if (!token) { setInfo("✓ " + done + " local song(s) named; the published ones need a GitHub token (File → Settings)"); return done; }
    setInfo("naming " + Object.keys(published).length + " published song(s)…");
    await renameRepoTitles(published, ghHeaders(token));
    for (const [key, title] of Object.entries(published)) { for (const songs of Object.values(S.CATALOG)) { const e = songs.find(x => x[1] === key); if (e) e[0] = title; } done++; } // the manifest write is done; the CDN copy lags
  }
  if (songsheet.classList.contains("on") && S.songViewRedraw) S.songViewRedraw();
  updateSongBtn();
  setInfo("✓ " + done + " song" + (done === 1 ? "" : "s") + " named from the playlist");
  return done;
}
// "create mine": a public <login>/night-roll-archive for this user's game files
// and instruments. A user on their own songs repo started with none, so their
// published imports played only on the importing device (Josh, 2026-09-28).
// Reuses an existing repo of that name; creating needs a token allowed to
// create repositories, and the status line says so when GitHub refuses.
async function createGameFilesRepo(say) {
  const token = writeToken();
  if (!token) { say("Add your token (step 2) first."); return null; }
  const h = ghHeaders(token);
  const me = await fetch("https://api.github.com/user", {headers: h});
  if (!me.ok) { say("GitHub didn't accept the token (HTTP " + me.status + ")."); return null; }
  const login = (await me.json()).login, name = "night-roll-archive", full = login + "/" + name;
  const have = await fetch("https://api.github.com/repos/" + full, {headers: h});
  if (!have.ok) {
    const r = await fetch("https://api.github.com/user/repos", {method: "POST", headers: h,
      body: JSON.stringify({name, description: "Game files and instruments for Night Roll", private: false, auto_init: true})});
    if (!r.ok) { say("GitHub wouldn't create " + full + " (HTTP " + r.status + "). The token needs permission to create repositories — or create it on github.com and type its name here."); return null; }
  }
  saveCfg({nsfRepo: full, nsfBase: "https://raw.githubusercontent.com/" + full + "/main"}); cfg.c = null;
  say("✓ " + full + (have.ok ? " (already there) " : " created ") + "— your game files and instruments go there from now on. If your token only lists some repos, add this one to it.");
  return full;
}
 // [{name, parsed}] awaiting a destination choice
document.getElementById("cfgnsfcreate").addEventListener("click", async e => {
  const btn = e.currentTarget, out = document.getElementById("cfgnsfstatus");
  btn.disabled = true;
  try { const full = await createGameFilesRepo(t => { out.textContent = t; }); if (full) document.getElementById("cfgnsfrepo").value = full; }
  catch (err) { out.textContent = "⚠ " + err.message; }
  finally { btn.disabled = false; }
});
document.getElementById("fileinput").addEventListener("change", async e => {
  const files = [...e.target.files];
  if (!files.length) return;
  stop();
  closeFileMenus();
  try {
    const loaded = [];
    for (const f of files) loaded.push({name: f.name, bytes: new Uint8Array(await f.arrayBuffer())});
    await openPickedFiles(loaded);
  } catch (err) { setInfo("could not import: " + err.message); }
  e.target.value = ""; // allow re-picking the same file
});
document.getElementById("fileimporthub").addEventListener("click", () => {
  closeFileMenus();
  document.getElementById("importhubstatus").textContent = "Drop files anywhere on this panel, or use a section's Choose files… above.";
  document.getElementById("importhub").classList.add("on");
});
// by id, not document.querySelectorAll("[data-kind]") — the vm harness's
// document stub has no querySelectorAll, only getElementById (NIGHT-ROLL.md/
// CLAUDE.md: the harness strings-match the hub's markup instead)
for (const [id, kind] of [["ihMidi", "midi"], ["ihNes", "nes"], ["ihGb", "gb"], ["ihSnes", "snes"],
                          ["ihGenesis", "genesis"], ["ihPs1", "ps1"], ["ihPs2", "ps2"], ["ihN64", "n64"],
                          ["ihSf2", "sf2"], ["ihAudio", "audio"]]) {
  document.getElementById(id).addEventListener("click", () => {
    document.getElementById("importhubstatus").textContent = "choose your " + importHubLabel(kind) + " file(s)…";
    document.getElementById("fileinput").click();
  });
}
// the drop target (phase 2 of the design): dragover/drop on #importhub only,
// feeding the dropped files to the same openPickedFiles the picker uses —
// its own comment above already anticipated a drop.
document.getElementById("importhub").addEventListener("dragover", e => {
  e.preventDefault();
  document.getElementById("importhub").classList.add("dragover");
});
document.getElementById("importhub").addEventListener("dragleave", e => {
  if (e.target === document.getElementById("importhub")) document.getElementById("importhub").classList.remove("dragover");
});
document.getElementById("importhub").addEventListener("drop", async e => {
  e.preventDefault();
  document.getElementById("importhub").classList.remove("dragover");
  const files = [...((e.dataTransfer && e.dataTransfer.files) || [])];
  if (!files.length) return;
  stop();
  try {
    const loaded = [];
    for (const f of files) loaded.push({name: f.name, bytes: new Uint8Array(await f.arrayBuffer())});
    await openPickedFiles(loaded);
  } catch (err) { setInfo("could not import: " + err.message); }
  closeFileMenus();
});
async function openPickedFiles(loaded) { // [{name, bytes}] from the picker, a drop, or a file handed to the iPad app
  {
    const isM3u = x => /\.m3u8?$/i.test(x.name);
    const m3us = loaded.filter(isM3u);
    const rest = loaded.filter(x => !isM3u(x));
    // Game Boy rips (Zophar) ship ONE .m3u per track — "02 Main Theme.m3u" —
    // so every picked playlist merges, in file-name order (Josh, from the
    // Final Fantasy Legend zip, 2026-09-27)
    const names = m3us.length
      ? [].concat(...m3us.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true})).map(x => parseM3u(decodeM3u(x.bytes))))
      : null;
    const nsfs = rest.filter(x => chipKindOf(x.bytes, x.name));
    const sf2s = rest.filter(x => sf2Magic(x.bytes));
    const audios = rest.filter(x => audioMagic(x.bytes));
    // PS2 rips that are only streamed audio, not sequence data (Zophar's Ico
    // is GENH-tagged, XIII is Ubisoft's own SShd/SSbd — docs/plans/ps2.md
    // "Findings, milestone 1"): refused by name at import, not a MIDI parse
    // error. Format identification only (no game table — CLAUDE.md).
    const streamed = nsfs.length ? [] : rest.filter(x => streamedAudioMagic(x.bytes));
    if (audios.length && audios.length === rest.length && !m3us.length) { // recordings → a new song (Import hub's "New song from a recording", no song open) or a track on the open one (the ＋∿ chip's own #audioinput never reaches here)
      const freshSong = !S.song;
      if (freshSong) createComposition(120, 4, 4);
      S.audioReplaceTi = null;
      await importAudioFiles(audios.map(x => ({name: x.name, bytes: x.bytes, type: ""})));
      if (freshSong) setInfo("new song — Edit → Pencil to write notes against the recording. It lives on this device until Save.");
    } else if (nsfs.length) { // a chip-music file (NSF or GBS) is an album by itself
      if (rest.length > 1 && !CHIPS[chipKindOf(nsfs[0].bytes, nsfs[0].name)].perFile) setInfo("importing the chip file; pick MIDI files separately from other formats");
      const kind = chipKindOf(nsfs[0].bytes, nsfs[0].name);
      await openChipImport(kind, nsfs[0].bytes, nsfs[0].name, names, CHIPS[kind].perFile ? nsfs.filter(x => chipKindOf(x.bytes, x.name) === kind) : null);
    } else if (sf2s.length) { // a SoundFont: parse, keep a device copy, push to the archive — its presets become track voices, no song open needed
      if (sf2s.length < rest.length) setInfo("importing the SoundFont" + (sf2s.length === 1 ? "" : "s") + "; pick other formats separately");
      for (const f of sf2s) await importSf2File(f);
    } else if (m3us.length && !rest.length) { // playlist alone: name the open session's tracks/drafts — or, with no session, the open song's album
      if (!S.nsfSess) await applyM3uToAlbum(names);
      else setInfo("✓ " + applyM3uNames(names) + " tracks named from the playlist" +
                   " — captured drafts renamed in place.");
    } else if (streamed.length && streamed.length === rest.length) {
      setInfo("this is streamed audio, not note data — Night Roll reads sequence data (notes), not pre-rendered streams");
    } else {
      S.pendingMidis = loaded.map(x => ({name: x.name, parsed: parseMidi(x.bytes.buffer, {trust: true, foreign: true})})); // sniffed: MThd found anywhere; foreign: carries its own source (declared-vs-learner-spec.md C2)
      document.getElementById("miditle").textContent =
        "IMPORT " + loaded.length + " MIDI FILE" + (loaded.length === 1 ? "" : "S");
      document.getElementById("midlocal").style.display = loaded.length === 1 ? "" : "none";
      const guess = loaded[0].name.replace(/\.(midi?|smf|kar|rmi)$/i, "").replace(/[-_ ]*\d+$/, "");
      document.getElementById("midalbum").value = loaded.length === 1 ? "" : guess;
      document.getElementById("midisheet").classList.add("on");
    }
  }
}
// The iPad app is registered for .mid and chip files: one tapped in Files,
// or handed over from another app's share sheet, arrives as a file: URL
// (iOS copies it into Documents/Inbox — documents are not opened in place).
// Read it through the Filesystem plugin, open it like a picked file, drop
// the Inbox copy. A lone MIDI skips the import sheet and becomes a local
// draft straight away: one tap from Files to the roll (hands hurt).
async function nativeOpenUrl(url) {
  const fs = nativeFs();
  if (!fs || !url || !/^file:/i.test(url)) return false;
  const name = decodeURIComponent(url.split("/").pop() || "file");
  let bytes;
  try {
    const r = await fs.readFile({path: url});
    bytes = typeof r.data === "string" ? Uint8Array.from(atob(r.data), c => c.charCodeAt(0)) : new Uint8Array(await r.data.arrayBuffer());
  } catch (err) { setInfo("couldn't read " + name + ": " + err.message); return false; }
  stop();
  closeFileMenus();
  try {
    if (!chipKindOf(bytes, name) && !audioMagic(bytes) && !streamedAudioMagic(bytes) && !/\.m3u8?$/i.test(name)) localMidiOpen(parseMidi(bytes.buffer, {trust: true, foreign: true}), name);
    else await openPickedFiles([{name, bytes}]);
  } catch (err) { setInfo("could not import " + name + ": " + err.message); return false; }
  if (/\/Inbox\//.test(url)) fs.deleteFile({path: url}).catch(() => {});
  return true;
}
function nativeOpenHook() { // boot, after the first song: the cold-start hand-over, then every later one
  try {
    const c = typeof window !== "undefined" && window.Capacitor;
    const app = c && c.isNativePlatform && c.isNativePlatform() && c.Plugins && c.Plugins.App;
    if (!app) return;
    app.addListener("appUrlOpen", e => { nativeOpenUrl(e && e.url); });
    if (app.getLaunchUrl) app.getLaunchUrl().then(r => { if (r && r.url) nativeOpenUrl(r.url); }).catch(() => {});
  } catch (err) { /* the web: no shell */ }
}
document.getElementById("midcancel").addEventListener("click", () => {
  S.pendingMidis = null;
  document.getElementById("midisheet").classList.remove("on");
});
 const SF2_SIZE_WARN = 50e6, SF2_SIZE_REFUSE = 95e6; // GitHub itself warns over 50 MB, rejects over 100 MB in the Contents API
// File → Import…'s .sf2 route: parse it (tools/instruments/sf2.mjs), keep a copy on
// this device (IndexedDB, so it plays offline and even with no GitHub token at all),
// and — a song depends on it, so it has to live somewhere every device can reach —
// push it to the game files & instruments repo's soundfonts/<slug>.sf2, check-before-
// PUT like every other archive file this app writes.
async function importSf2File({name, bytes}) {
  let font;
  try { font = (await sf2Module()).parseSf2(bytes); }
  catch (err) { setInfo("⚠ " + name + " didn't load: " + err.message); return; }
  const slug = slugify(font.name || name.replace(/\.sf2$/i, "")) || "soundfont";
  const mb = bytes.length / 1e6;
  await idbSf2Put(slug, bytes);
  sf2Fonts.set(slug, Promise.resolve(font));
  sf2RegistryAdd(slug, font.name || name.replace(/\.sf2$/i, ""));
  setInfo("✓ " + (font.name || name) + ": " + font.presets.length + " preset" + (font.presets.length === 1 ? "" : "s") + " — pick them in a track's voice menu under Soundfonts");
  if (mb > SF2_SIZE_REFUSE) { setInfo("⚠ " + (font.name || name) + " is " + mb.toFixed(0) + " MB — over the archive's 95 MB limit, so it stays on this device only (still usable there)"); return; }
  if (folderActive() || !cfg().nsfRepo) { if (!folderActive()) setInfo("(" + (font.name || name) + " stays on this device — set a game files & instruments repo in Settings → GitHub → advanced to share it with your other devices)"); return; }
  const token = writeToken();
  if (!token) { setInfo("(" + (font.name || name) + " stays on this device — add a GitHub token in Settings to share it)"); return; }
  if (mb > SF2_SIZE_WARN) {
    const go = await appConfirm("LARGE SOUNDFONT — " + mb.toFixed(0) + " MB", "GitHub warns about files over 50 MB in the archive. It plays fine on this device either way; uploading just makes it reach your other devices too.", "Upload to the archive", "Keep on this device only");
    if (!go) return;
  }
  const file = "soundfonts/" + slug + ".sf2";
  try {
    const chk = await fetch(nsfURL(file) + "?t=" + Date.now(), {cache: "no-cache"});
    if (chk.ok) return; // already there (a previous import, or another device's) — nothing to do
    setInfo("uploading " + (font.name || name) + " (" + mb.toFixed(1) + " MB) to the archive…");
    const put = await fetch(repoApi("nsf") + file, {method: "PUT", headers: ghHeaders(token), body: JSON.stringify({
      message: "SoundFont " + slug + " (" + font.presets.length + " presets)", branch: "main", content: midiBase64(bytes)})});
    if (!put.ok) throw new Error("HTTP " + put.status);
    const verify = await fetch(nsfURL(file) + "?t=" + Date.now(), {cache: "no-cache"});
    const verifyBytes = verify.ok ? new Uint8Array(await verify.arrayBuffer()) : null;
    if (!verifyBytes || verifyBytes.length !== bytes.length)
      setInfo("⚠ " + (font.name || name) + " uploaded, but the archive copy's size doesn't match yet (CDN lag?) — it should catch up shortly");
    else setInfo("✓ " + (font.name || name) + " is in the archive — your other devices can play it now");
  } catch (err) { setInfo("⚠ soundfont upload failed (" + err.message + ") — " + (font.name || name) + " stays on this device only"); }
}
function slugFile(name) { // the kv grammar is \S+: no spaces, no weirdness
  const m = name.match(/^(.*?)(\.[A-Za-z0-9]+)?$/);
  const base = slugify(m[1] || "take"), ext = (m[2] || "").toLowerCase();
  return base + ext;
}
function monoWavBytes(buffer) { // 16-bit PCM mono WAV: lossless for a mono source, half a stereo bounce
  const sr = buffer.sampleRate, data = buffer.getChannelData(0), n = data.length;
  const out = new ArrayBuffer(44 + n * 2), v = new DataView(out);
  const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, data[i])); v.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true); }
  return new Uint8Array(out);
}
const AUDIO_SIZE_GATE = 20e6; // bytes: RAM is paid at import, git at Save — nudge, don't wall
async function importAudioFiles(items) { // items: {name, bytes: Uint8Array, type}
  if (!S.song) return;
  if (!(isComposition() || isLocalDraft())) {
    setInfo("this song is locked — File → Save As… makes an editable copy, then add the recording there");
    return;
  }
  const cursorBar = Math.floor(S.playCursor / barTicks()) * barTicks();
  let lastTi = -1;
  for (const it of items) {
    let bytes = it.bytes;
    if (!audioMagic(bytes)) { setInfo(it.name + " isn't an audio file this browser knows"); continue; }
    if (bytes.length > AUDIO_SIZE_GATE) {
      const mb = (bytes.length / 1e6).toFixed(0);
      const mono = await appConfirm("BIG RECORDING — " + mb + " MB",
        "A 3-minute stereo WAV is ~30 MB; the same take as 16-bit mono WAV is half that, and lossless for a guitar or a voice. It stays this size on every device and in every Save.",
        "Store as 16-bit mono WAV", "Import as-is (" + mb + " MB)");
      if (mono) {
        setInfo("converting " + it.name + " to mono…");
        try { bytes = monoWavBytes((await decodeAudioBytes(bytes.buffer)).buffer); }
        catch (err) { setInfo("couldn't decode " + it.name + " — importing as-is"); }
        it.name = it.name.replace(/\.[^.]+$/, "") + ".wav";
      }
    }
    // unique slug and track name within the song
    let file = slugFile(it.name), k = 2;
    const taken = f => { let t = false; forEachClip(c => { if (c.file === f) t = true; }); return t; };
    while (taken(file)) { file = slugFile(it.name).replace(/(\.[^.]+)?$/, "-" + k++ + "$1"); }
    const stem = file.replace(/\.[^.]+$/, "");
    let name = stem, j = 2;
    while (S.song.tracks.some(t => (t.name || "").toLowerCase() === name.toLowerCase())) name = stem + "-" + j++;
    const stored = await idbAudioPut(S.songKey + "|" + file, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), it.type || "");
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if (S.audioReplaceTi !== null && S.song.tracks[S.audioReplaceTi] && S.song.tracks[S.audioReplaceTi].kind === "audio") {
      const ti = S.audioReplaceTi; S.audioReplaceTi = null;
      // every piece of the old file swaps to the new one, placement kept
      const old = (S.song.tracks[ti].clips[0] || {}).file;
      writeClips(ti, S.song.tracks[ti].clips.map(c => c.file === old ? {...c, file, offset: 0, len: null} : c));
      lastTi = ti;
      setInfo("replaced the recording on " + (S.song.tracks[ti].name || "the track") + " — one undo brings the old one back");
      continue;
    }
    const before = annoSnapshot();
    S.autoAlignFiles.add(file);
    const ti = addTrackUndoable({name, notes: []});
    pushUndo({kind: "group", entries: [{kind: "trackRemove", ti}, {kind: "anno", json: before}]});
    const n = {b1: 1, q1: 1, b2: null, q2: null, text: audioDirText({track: name, file, offset: 0, local: false}), added: true};
    setAnchorBQ(n, cursorBar);
    S.rollnotes.push(resolveNote(deriveNoteTypes([n])[0]));
    finalizeNotes();
    saveLocalNotes();
    saveDraft();
    lastTi = ti;
    S.selTrack = ti; S.selClip = ti; S.trackExpand = true;
    setInfo("added " + name + " ∿ at bar " + (cursorBar / barTicks() + 1) +
            (stored ? "" : " — ⚠ this browser wouldn't store the bytes; the take lives for this session only") +
            (S.viewMode === "tracks" ? "" : " — the Tracks view shows the waveform") +
            " · tap its chip again to nudge it");
  }
  if (lastTi < 0) return;
  renderTrackbar(); buildScoreModel(); updateTrackGains(); computeSongEnd(); draw();
  requestAnimationFrame(renderTrackbar);
}
document.getElementById("audioinput").addEventListener("change", async e => {
  const files = [...e.target.files];
  e.target.value = "";
  if (!files.length) return;
  stop();
  try {
    const items = [];
    for (const f of files) items.push({name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), type: f.type});
    await importAudioFiles(items);
  } catch (err) { setInfo("could not import: " + err.message); }
});
document.getElementById("midlocal").addEventListener("click", () => {
  if (!S.pendingMidis || !S.pendingMidis.length) return;
  const {name, parsed} = S.pendingMidis[0];
  S.pendingMidis = null;
  document.getElementById("midisheet").classList.remove("on");
  localMidiOpen(parsed, name);
});
document.getElementById("midcreate").addEventListener("click", () => {
  if (!S.pendingMidis || !S.pendingMidis.length) return;
  const alb = document.getElementById("midalbum").value.trim();
  if (!alb) { setInfo("⚠ name the album first"); return; }
  const slug = folderFromInput(alb) || slugify(alb);
  let firstKey = null;
  for (const {name, parsed} of S.pendingMidis) {
    const base = slugify(name.replace(/\.(midi?|smf|kar|rmi)$/i, ""));
    const key = "albums/" + slug + "/" + base + ".mid"; // MIDI files: a folder of the user's own, editable, published like any song
    if (!firstKey) firstKey = key;
    draftWrite(key, {
      savedStamp: 0, dirty: true, title: name.replace(/\.(midi?|smf|kar|rmi)$/i, ""),
      ppq: parsed.ppq, timesig: parsed.timesig || [4, 4],
      ...(parsed.source ? {source: parsed.source} : {}), // the file's OWN meter/key history, kept apart from what he later declares (docs/declared-vs-learner-spec.md)
      tempos: parsed.tempos,
      tracks: parsed.tracks.map(tr => ({name: tr.name,
        ...(tr.midiPan !== undefined ? {midiPan: tr.midiPan} : {}),
        ...(tr.offset ? {offset: tr.offset} : {}),
        ...(tr.srcIndex !== undefined ? {srcIndex: tr.srcIndex} : {}), // docs/declared-vs-learner-spec.md phase 2: how the raw metas in source.metas reattach after edits
        notes: tr.notes.map(nt => {
        const o = {t: nt.t, d: nt.d, p: nt.p, v: nt.v};
        if (nt.ch !== undefined) o.ch = nt.ch;
        if (nt.duty !== undefined) o.duty = nt.duty;
        if (nt.ve !== undefined) o.ve = nt.ve;
        return o;
      })}))});
  }
  const count = S.pendingMidis.length;
  S.pendingMidis = null;
  document.getElementById("midisheet").classList.remove("on");
  stop();
  openDraft(firstKey);
  setInfo(count + " song" + (count === 1 ? "" : "s") + " in album \"" + alb +
          "\" — Open → LOCAL to audition/rename, ⇪ Publish sends it to the songs repo.");
});
// The Normal auto-seed that used to write the file's own meter/key straight
// into a real annotation at import (P2, 2026-09-29) is GONE
// (docs/declared-vs-learner-spec.md C5, superseding that ruling): the file's
// own labels now live apart, in source (see parseMidi/checkKeyVsFile/
// checkMeterVsFile), never written as his answer just because Normal mode is
// on. An import writes NO ff1roll-notes-* in either mode.
function localMidiOpen(parsed, name) {
  // a local MIDI becomes a device-local draft (Josh's report 2026-08-15:
  // switching songs used to lose it with no way back) — reopen from
  // Open → drafts; ✕ there to let it go; never synced to the repo
  const key = "local/" + slugify(name.replace(/\.(midi?|smf|kar|rmi)$/i, "")) + ".mid";
  draftWrite(key, {
    savedStamp: 0, dirty: true, title: name, ppq: parsed.ppq, timesig: parsed.timesig || [4, 4],
    ...(parsed.source ? {source: parsed.source} : {}), // the file's OWN meter/key history, kept apart from what he later declares (docs/declared-vs-learner-spec.md)
    tempos: parsed.tempos,
    tracks: parsed.tracks.map(tr => ({name: tr.name,
      ...(tr.midiPan !== undefined ? {midiPan: tr.midiPan} : {}), // CC10 in the dropped file — survives to the republished copy
      ...(tr.offset ? {offset: tr.offset} : {}),
      ...(tr.srcIndex !== undefined ? {srcIndex: tr.srcIndex} : {}), // docs/declared-vs-learner-spec.md phase 2: how the raw metas in source.metas reattach after edits
      notes: tr.notes.map(nt => {
      const o = {t: nt.t, d: nt.d, p: nt.p, v: nt.v};
      if (nt.ch !== undefined) o.ch = nt.ch; // drums live on ch 9 — must survive the round-trip
      if (nt.duty !== undefined) o.duty = nt.duty; // chip timbre survives too
      if (nt.ve !== undefined) o.ve = nt.ve; // decay target survives
      return o;
    })}))});
  openDraft(key);
  setInfo(name + " imported — edits stay on this device; reopen from Open → LOCAL");
}
document.getElementById("modeseg").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  // tapping the active tool AGAIN turns it off (Josh: sometimes you just want
  // to drag the song around without accidentally moving a note)
  S.mode = b.dataset.mode === S.mode ? null : b.dataset.mode;
  for (const x of document.querySelectorAll("#modeseg button")) {
    x.classList.toggle("active", x.dataset.mode === S.mode);
    x.setAttribute("aria-checked", String(x.dataset.mode === S.mode));
  }
  // duration chips show in Select too: there they are the MOVE grid (T = triplet
  // steps), so changing it doesn't cost a trip through Pencil (Josh, 2026-09-12)
  document.getElementById("durseg").style.display = S.mode === "pencil" || S.mode === "select" ? "" : "none";
  // velocities show in Select too: with a selection they APPLY to it
  document.getElementById("velseg").style.display = S.mode === "pencil" || S.mode === "select" ? "" : "none";
  document.getElementById("accseg").style.display =
    S.mode === "pencil" && S.viewMode === "score" ? "" : "none";
  setInfo(S.mode === "pencil" ? (S.viewMode === "score" ? "pencil: tap a staff position — the stave picks the track"
                                                    : "pencil: tap grid to add to selected track") :
          S.mode === "erase" ? "erase: tap a note to remove" :
          S.mode === "select" ? "tap a note" : "pan: drag moves the view — notes are safe");
});
document.getElementById("durseg").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.grid) { openGridSheet(); return; } // the ▦N chip: the grid sheet, from either mode
  if (b.dataset.nv) S.pencilNV = parseInt(b.dataset.nv, 10);
  else if (b.dataset.mod) S.pencilMod = parseFloat(b.dataset.mod);
  else return;
  S.pencilDur = (4 / S.pencilNV) * S.pencilMod;
  syncDurSeg();
});
// The grid picks up the note you touch: a triplet note (triplet position or
// triplet length) moves on triplet steps, a straight one on 16ths — no trip
// to the chips to move either (Josh, 2026-09-12). Chips still override after.
function gridFollowNote(n) {
  if (!n || S.gridDiv) return false; // a custom grid outranks all
  const q = S.song.ppq, onLine = (t, g) => Math.abs(t / g - Math.round(t / g)) < 1e-6;
  const trip = (onLine(n.t, q / 3) && !onLine(n.t, q / 4)) || isTripletDur(n.d / q);
  if (trip === isTripletDur(S.pencilDur)) return false;
  if (trip) { S.pencilMod = 2 / 3; S.pencilNV = n.d / q >= 0.6 ? 4 : n.d / q >= 0.3 ? 8 : 16; }
  else { S.pencilMod = 1; S.pencilNV = 16; }
  S.pencilDur = (4 / S.pencilNV) * S.pencilMod;
  syncDurSeg();
  return true;
}
document.getElementById("clearbtn").addEventListener("click", () => {
  if (editsKey()) localStorage.removeItem(editsKey());
  loadSong(S.songKey).catch(e => setInfo(e.message));
});
window.addEventListener("resize", resize);
new ResizeObserver(resize).observe(wrap);
function pianoHit(x, y, W, H) {
  const g = pianoGeom(W);
  const bw = g.wW * 0.6, bh = H * 0.6;
  if (y <= bh) { // black keys claim their zone first
    for (let p = g.lo; p <= g.hi; p++) {
      if (WHITE_PCS.includes(p % 12)) continue;
      const bx = g.wx[p - 1] + g.wW - bw / 2;
      if (x >= bx && x <= bx + bw) return p;
    }
  }
  return g.whites[Math.max(0, Math.min(g.whites.length - 1, Math.floor(x / g.wW)))];
}
function guitarHit(x, y, W, H) {
  const g = guitarGeom(W, H);
  const si = Math.max(0, Math.min(5, Math.round((y - g.top) / g.sh)));
  const f = x < g.nutX ? 0 : Math.min(GTR_FRETS, Math.floor((x - g.nutX) / g.fw) + 1);
  return {p: GTR_TUNING[si] + f, si, f};
}
async function instPlay(p) {
  ensureAudio();
  await resumeAudio();
  openMaster();
  const o = makeOsc(S.instTab === "guitar" ? "triangle" : "square25");
  o.frequency.value = 440 * Math.pow(2, (p - 69) / 12);
  const g = S.audio.createGain();
  const when = S.audio.currentTime + 0.01, dur = 0.5;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.35, when + 0.008);
  g.gain.setValueAtTime(0.35, when + dur - 0.06);
  g.gain.linearRampToValueAtTime(0, when + dur);
  o.connect(g);
  g.connect(S.master); // master, not a track gain: mutes never silence the panel
  o.start(when);
  o.stop(when + dur + 0.05);
}
function setInstInfo(s) { // linger 10s, then fade — a stale key name reads like a live one
  const el = document.getElementById("instinfo");
  el.textContent = s;
  el.style.opacity = "1";
  clearTimeout(S.instInfoTimer);
  S.instInfoTimer = setTimeout(() => { el.style.opacity = "0"; }, 10000);
}
function instTap(e, dragging) {
  const r = instCanvas.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const W = instWrap.clientWidth, H = instWrap.clientHeight;
  let p, si, f;
  if (S.instTab === "piano") p = pianoHit(x, y, W, H);
  else ({p, si, f} = guitarHit(x, y, W, H));
  if (p === undefined || (dragging && p === S.instLastP)) return p;
  S.instLastP = p;
  S.instFlash = {p, si, f, until: performance.now() + 350};
  instPlay(p);
  const deg = degreeOf(p % 12, keyNameShownAt(curTick()));
  const at = si !== undefined ? "  ·  " + GTR_NAMES[si] + " string" + (f ? ", fret " + f : ", open") : "";
  setInstInfo(pitchName(p, sfShownAt(curTick())) + (deg ? "  ·  degree " + deg : "") + at);
  drawInst();
  setTimeout(drawInst, 400); // clear the flash when idle (playback frames handle it otherwise)
  return p;
}
 function recNoteOn(pid, p, vel) {
  recNoteOff(pid); // sliding to a new key closes the old one
  S.recPending.set(pid, {p, vel, tick: recSnap(secToTick(S.song, playSec()))});
}
function recNoteOff(pid) {
  const pend = S.recPending.get(pid);
  if (!pend) return;
  S.recPending.delete(pid);
  const end = recSnap(secToTick(S.song, playSec()));
  // a snapped take's minimum is one grid step (unchanged); a raw take's
  // minimum is the app's usual shortest-editable-note floor (resizeSelection
  // uses the same number) — a very fast tap must not leave a zero/negative
  // length note behind.
  const minD = recSnapOn() ? moveSnapTicks() : Math.max(24, Math.round(S.song.ppq / 8));
  const d = Math.max(minD, end - pend.tick);
  const tr = S.song.tracks[S.selTrack], isAdd = !isComposition();
  const vv = pend.vel !== undefined ? pend.vel : S.pencilVel;
  tr.notes.push({t: pend.tick, d, p: pend.p, v: vv, added: isAdd});
  if (S.song.rawNotes) S.song.rawNotes[S.selTrack].push({t: pend.tick + S.chopS, d, p: pend.p, v: vv, added: isAdd});
  S.recTake.push({ti: S.selTrack, ni: tr.notes.length - 1});
  draw();
}
export function recFinishImpl() { // called from stop(): close pendings, commit the take
  for (const pid of [...S.recPending.keys()]) recNoteOff(pid);
  S.recording = false;
  document.getElementById("recbtn").classList.remove("rec");
  if (S.recTake.length) {
    pushUndo({kind: "addBatch", items: S.recTake.slice()});
    saveEdits();
    if (isComposition() || isLocalDraft()) saveDraft(); // the take is part of the working copy, not just the undo stack
    computeSongEnd();
    if (S.viewMode === "score") buildScoreModel();
    setInfo("recorded " + S.recTake.length + " note" + (S.recTake.length === 1 ? "" : "s") + " — one undo removes the take");
  }
  S.recTake = [];
}
 // CoreMidi source names, once the iPad app has connected any
// One MIDI message's bytes (status, data1, data2?) — Web MIDI's
// MIDIMessageEvent.data is already exactly this shape; CoreMidiPlugin
// expands running status on the native side so its "midi" events are too.
function midiMessage(data) {
  const [st, note, vel] = data;
  const cmd = st & 0xf0;
  if (cmd === 0x90 && vel > 0) {
    if (S.recording && S.playing) recNoteOn("midi" + note + (st & 15), note, vel);
    previewNote(S.selTrack, note);
    S.instFlash = {p: note, until: performance.now() + 300}; // light the panel key
    if (S.instOpen) drawInst();
  } else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) {
    recNoteOff("midi" + note + (st & 15));
  }
}
function initWebMidi() {
  if (S.midiReady) return;
  const C = typeof window !== "undefined" && window.Capacitor;
  if (C && C.isNativePlatform && C.isNativePlatform()) { initCoreMidi(C); return; }
  if (!navigator.requestMIDIAccess) return;
  S.midiReady = true;
  navigator.requestMIDIAccess({sysex: false}).then(access => {
    S.midiAccess = access;
    const hook = input => input.addEventListener("midimessage", e => midiMessage(e.data));
    for (const input of access.inputs.values()) hook(input);
    access.addEventListener("statechange", e => {
      if (e.port.type === "input" && e.port.state === "connected") hook(e.port);
      setInfo("MIDI " + e.port.state + ": " + e.port.name);
    });
    const names = [...access.inputs.values()].map(i => i.name);
    if (names.length || S.recording) setInfo(midiStatusLine()); // silence at first tap unless there's a device or ● is waiting
  }).catch(err => { S.midiErr = err; S.midiReady = false; setInfo(midiStatusLine()); }); // retry on the next tap
}
// The iPad app: WKWebView has no Web MIDI, so a keyboard reaches this page
// through the shell's own CoreMidi plugin instead (registered next to 📷's
// Screenshot in MainViewController.capacitorDidLoad — same mechanism, see
// askShotCapture's comment). Capacitor auto-generates Plugins.CoreMidi
// (addListener + start/stop/list) once a plugin is registered natively, so
// that's the normal path; Capacitor.addListener/nativePromise underneath it
// is the same primitive the generated wrapper itself calls, so it's a real
// fallback (not a guess) if the wrapper object is ever missing.
function initCoreMidi(C) {
  if (S.midiReady) return;
  S.midiReady = true;
  const plugin = C.Plugins && C.Plugins.CoreMidi;
  const listen = (name, cb) => plugin && plugin.addListener ? plugin.addListener(name, cb)
    : C.addListener ? C.addListener("CoreMidi", name, cb) : null;
  const call = (method, opts) => plugin && plugin[method] ? plugin[method](opts || {})
    : C.nativePromise ? C.nativePromise("CoreMidi", method, opts || {})
    : Promise.reject(new Error("no CoreMidi bridge"));
  if (!(plugin && plugin.addListener) && !C.addListener) { S.midiReady = false; return; } // truly nothing to call: leave midiReady false so a later tap retries
  listen("midi", e => {
    if (!e || !Array.isArray(e.data)) return;
    if (e.source && !S.nativeMidiNames.includes(e.source)) {
      S.nativeMidiNames.push(e.source);
      setInfo("MIDI keyboard connected: " + e.source);
    }
    midiMessage(e.data);
  });
  call("start").then(() => call("list")).then(r => {
    const names = r && r.sources || [];
    if (names.length) {
      S.nativeMidiNames = names;
      setInfo("MIDI keyboard connected: " + names.join(", "));
    }
  }).catch(err => { S.midiErr = err; setInfo(midiStatusLine()); });
}
document.addEventListener("pointerdown", function midiWarm() {
  document.removeEventListener("pointerdown", midiWarm);
  // the iPad app's native MIDI bridge starts only when ● asks for it — never
  // on the first touch, where an untested native path failing would cost
  // the whole app (2026-09-30, the plugin is new and unheard on a device)
  const C = typeof window !== "undefined" && window.Capacitor;
  if (C && C.isNativePlatform && C.isNativePlatform()) return;
  initWebMidi(); // permission prompt wants a user gesture
}, {capture: true});
document.getElementById("recbtn").addEventListener("click", async () => {
  albumClear();
  if (S.recording || S.playing) { stop(); return; } // ● while rolling = stop (commits the take)
  if (!S.song || !editableSong()) { setInfo("recording works on your own songs"); return; }
  if (!S.instOpen) { S.instOpen = true; localStorage.setItem("ff1roll-inst-open", "1"); applyInst(); }
  S.recording = true;
  S.recTake = [];
  document.getElementById("recbtn").classList.add("rec");
  initWebMidi();
  setInfo("recording onto " + (S.song.tracks[S.selTrack].name || "track") + " — 🎹 keys or MIDI; ● or ■ stops · " + midiStatusLine());
  await play(S.playCursor > 0 ? tickToSec(S.song, S.playCursor) : 0);
  if (!S.recording && S.playing) stop(); // ● was released while play() was still waking the audio context
});
instCanvas.addEventListener("pointerdown", e => {
  S.instPtrOn = true;
  instCanvas.setPointerCapture(e.pointerId);
  const p = instTap(e);
  if (S.recording && S.playing && p !== undefined) recNoteOn(e.pointerId, p);
});
instCanvas.addEventListener("pointermove", e => {
  if (!S.instPtrOn) return;
  const p = instTap(e, true);
  if (S.recording && S.playing && p !== undefined) recNoteOn(e.pointerId, p);
});
instCanvas.addEventListener("pointerup", e => {
  S.instPtrOn = false; S.instLastP = null;
  recNoteOff(e.pointerId);
});
instCanvas.addEventListener("pointercancel", e => {
  S.instPtrOn = false; S.instLastP = null;
  recNoteOff(e.pointerId);
});
new ResizeObserver(instResize).observe(instWrap);
instbtn.addEventListener("click", () => {
  S.instOpen = !S.instOpen;
  localStorage.setItem("ff1roll-inst-open", S.instOpen ? "1" : "0");
  applyInst();
  draw(); // closing the panel while Fall is active must restore the roll
});
// ⎘ Web session (Sync sheet): copies the clone-first bootstrap instruction —
// Josh pastes it into a fresh Claude Web chat to start a from-bed tutoring
// session with full project context.
document.getElementById("websess").addEventListener("click", async e => {
  // Copy an INSTRUCTION, not a bare URL (Josh, 2026-08-25: "I have to tell
  // Claude on the web every single time to clone the repo instead of
  // following URLs"). Pasting a URL makes the session's first act a fetch,
  // and it keeps fetching from there. Lead with the clone.
  const repo = "https://github.com/" + repoName("analysis") + ".git";
  const msg = "Clone this repo, then read night-roll/WEB-SESSION.md from disk and follow it. " +
    "Work entirely from the clone — do not fetch any file by URL.\n\n" +
    "cd /home/claude && git clone --depth 1 --filter=blob:limit=1m " + repo + "\n";
  try { await navigator.clipboard.writeText(msg); e.target.textContent = "✓ copied — paste to Claude"; }
  catch { e.target.textContent = "✗ copy failed"; }
  setTimeout(() => { e.target.textContent = "⎘ Web session"; }, 1800);
});
subbtn.classList.toggle("active", S.subOn);
subbtn.setAttribute("aria-pressed", String(S.subOn));
function toggleSubtitle() {
  S.subOn = !S.subOn;
  localStorage.setItem("ff1roll-sub", S.subOn ? "1" : "0");
  subbtn.classList.toggle("active", S.subOn);
  subbtn.setAttribute("aria-pressed", String(S.subOn));
  updateSubtitle();
}
instFallBtn.addEventListener("click", () => {
  S.fallOn = !S.fallOn;
  if (S.fallOn) { // fall is piano-only and needs the keys visible
    S.instTab = "piano";
    localStorage.setItem("ff1roll-inst-tab", "piano");
    if (!S.instOpen) { S.instOpen = true; localStorage.setItem("ff1roll-inst-open", "1"); }
  }
  localStorage.setItem("ff1roll-inst-fall", S.fallOn ? "1" : "0");
  applyInst();
  draw();
});
for (const tab of ["piano", "guitar"]) {
  document.getElementById("insttab-" + tab).addEventListener("click", () => {
    S.instTab = tab;
    localStorage.setItem("ff1roll-inst-tab", S.instTab);
    if (tab === "guitar" && S.fallOn) { // notes can only fall into piano keys
      S.fallOn = false;
      localStorage.setItem("ff1roll-inst-fall", "0");
    }
    applyInst();
    draw();
  });
}
S.instTab = localStorage.getItem("ff1roll-inst-tab") || "piano";
S.instOpen = localStorage.getItem("ff1roll-inst-open") === "1";
// Fall is PARKED (Josh, 2026-09-27: opening it killed playback on the iPad — the
// per-frame full redraw starves the note scheduler; "we can re-implement it
// later"). The code stays; the button is hidden and the view never turns on.
S.fallOn = false; // was: localStorage.getItem("ff1roll-inst-fall") === "1" && instTab === "piano"
applyInst();

document.getElementById("ntype").addEventListener("change", applyEditorType);

(function buildChordWidget() {
  const mkRow = (id, items) => {
    const row = document.getElementById(id);
    for (const [v, label] of items) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.v = v;
      b.textContent = label;
      row.appendChild(b);
    }
  };
  mkRow("nchordroot", "CDEFGAB".split("").map(l => [l, l]));
  mkRow("nchordacc", [["b", "♭"], ["", "♮"], ["#", "♯"]]);
  mkRow("nchordqual", CHORD_BASES.map(q => [q, q]));
  mkRow("nchordext", CHORD_EXTS.map(q => [q, q]));
  const bass = document.getElementById("nchordbass");
  const none = document.createElement("option");
  none.value = ""; none.textContent = "—";
  bass.appendChild(none);
  for (const s of BASS_SPELLINGS) {
    const o = document.createElement("option");
    o.value = s; o.textContent = s;
    bass.appendChild(o);
  }
  document.getElementById("nchordroot").addEventListener("click", e => {
    if (!e.target.dataset.v) return;
    chordSel.root = e.target.dataset.v;
    if (chordSel.base === null) { chordSel.base = "maj"; chordSel.exts = []; }
    refreshChordChips(); composeChord();
  });
  document.getElementById("nchordacc").addEventListener("click", e => {
    if (e.target.dataset.v === undefined) return;
    chordSel.acc = e.target.dataset.v;
    refreshChordChips(); composeChord();
  });
  document.getElementById("nchordqual").addEventListener("click", e => {
    if (!e.target.dataset.v) return;
    chordSel.base = e.target.dataset.v;
    if (chordSel.exts === null) chordSel.exts = [];
    refreshChordChips(); composeChord();
  });
  document.getElementById("nchordext").addEventListener("click", e => { // extensions STACK
    if (!e.target.dataset.v) return;
    if (chordSel.base === null) chordSel.base = "maj";
    const x = e.target.dataset.v, i = chordSel.exts.indexOf(x);
    if (i >= 0) chordSel.exts.splice(i, 1); else chordSel.exts.push(x);
    refreshChordChips(); composeChord();
  });
  bass.addEventListener("change", composeChord);
  const sym = document.getElementById("nchordsym");
  sym.addEventListener("input", () => { // follow hand-edits without rewriting them
    const m = parseChordSym(sym.value);
    chordSel.root = m ? m[1] : null;
    chordSel.acc = m ? m[2] : "";
    const q = m ? chordQualParse(m[3]) : null;
    chordSel.base = q ? q.base : null;
    chordSel.exts = q ? q.exts : [];
    if (m) bass.value = m[4] || "";
    refreshChordChips();
  });
  sym.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("nsave").click(); }
  });
})();

  nmic.addEventListener("click", () =>
  micToggle(nmic, document.getElementById("ntext"), s2 => document.getElementById("nstatus").textContent = s2));

document.getElementById("notebtn").addEventListener("click", () => {
  if (!S.song) return;
  // ALWAYS a new note (Josh, 2026-08-25). It used to reopen whatever
  // annotation the cursor sat on, so a note at 1.1 made the button
  // permanently un-add-able, with no way to tell whether Save would create or
  // overwrite. + Note adds; editing an existing one is a tap in ☰ Notes.
  openEditor(null);
});
document.getElementById("ncancel").addEventListener("click", () => { micStop(true); editor.classList.remove("on"); });
 // two-tap confirmation for meter changes that move annotations
// re-express every annotation's anchors under a new meter so they stay glued
// to the MUSIC (bar.beat is a coordinate system; changing the meter re-bars)
// shift every non-chop annotation in DISPLAYED space (start-chop add/remove)
function shiftAnchors(deltaTicks) {
  const bt = barTicks(), unit = beatTicks();
  for (const n of S.rollnotes) {
    if (n.chopdir) continue;
    const conv = (b, q) => {
      const tick = Math.max(0, (b - 1) * bt + (q - 1) * unit + deltaTicks);
      return [Math.floor(tick / bt) + 1, (tick % bt) / unit + 1];
    };
    [n.b1, n.q1] = conv(n.b1, n.q1);
    if (n.b2) [n.b2, n.q2] = conv(n.b2, n.q2 || beatsPerBarDisp());
    const lm = n.text.match(/^loop:\s*(\d+)(?:\.(\d+(?:\.\d+)?))?/);
    if (lm) {
      const [lb, lq] = conv(+lm[1], lm[2] ? +lm[2] : 1);
      n.text = "loop: " + lb + (lq === 1 ? "" : "." + (+lq.toFixed(2)));
    }
  }
}
function convertAnchors(oldTs, newTs) {
  const oldUnit = S.song.ppq * 4 / oldTs[1], newUnit = S.song.ppq * 4 / newTs[1];
  const oldBt = oldTs[0] * oldUnit, newBt = newTs[0] * newUnit;
  const conv = (b, q) => {
    const tick = (b - 1) * oldBt + (q - 1) * oldUnit;
    return [Math.floor(tick / newBt) + 1, (tick % newBt) / newUnit + 1];
  };
  for (const n of S.rollnotes) {
    [n.b1, n.q1] = conv(n.b1, n.q1);
    if (n.b2) [n.b2, n.q2] = conv(n.b2, n.q2 || oldBpb);
    const lm = n.text.match(/^loop:\s*(\d+)(?:\.(\d+(?:\.\d+)?))?/);
    if (lm) {
      const [lb, lq] = conv(+lm[1], lm[2] ? +lm[2] : 1);
      n.text = "loop: " + lb + (lq === 1 ? "" : "." + (+lq.toFixed(2)));
    }
  }
}
document.getElementById("ntext").addEventListener("keydown", e => {
  // sections are one-line labels: Enter = save. Text notes keep Enter = newline
  if (e.key === "Enter" && editorType() === "section") {
    e.preventDefault();
    document.getElementById("nsave").click();
  }
});
document.getElementById("nsave").addEventListener("click", () => {
  // P4 (docs/annotations-v2.md): closes P3's known gap — every manual
  // annotation edit refuses on a locked (newer-than-this-app) song, same
  // message as the Ask tool's add/edit_annotation, instead of landing
  // in-memory/localStorage with no way to ever publish it
  if (S.rollnotesReadOnly) { document.getElementById("nstatus").textContent = S.rollnotesLockReason || ROLLNOTES_LOCK_MSG; return; }
  micStop(true); // the text is read now; a late result would land in a closed editor
  const type = editorType();
  const text = document.getElementById("ntext").value.trim();
  if (type === "note" && !text) { document.getElementById("nstatus").textContent = "Note text is empty."; return; }
  const b1 = Math.max(1, +document.getElementById("nb1").value || 1);
  const q1 = Math.max(1, getBeatPair("nq1", "ns1"));
  const b2raw = +document.getElementById("nb2").value || 0;
  const q2raw = document.getElementById("nb2").value === "" ? 0 : getBeatPair("nq2", "ns2");
  if (S.editingNote) retireEdited(S.editingNote);
  let fresh;
  if (type === "key") {
    const [pcS, spS] = document.getElementById("nkeysel").value.split(":");
    const pc = +pcS, sp = spS || "";
    const mode = document.getElementById("nkeymode").value;
    dropLocalKeyAt(b1, q1); // anchor-level: only a key at this exact beat is replaced
    if (mode) {
      const full = keyNameFor(pc, mode);
      fresh = {b1, q1, b2: b2raw || null, q2: b2raw ? (q2raw || null) : null,
               text: "key: " + full.name, keydir: full.sf, cnote: text || undefined, added: true};
    } else { // tonic only: stored, not applied — asserted spelling if chosen
      const tonic = sp || tonicLabel(pc);
      fresh = {b1, q1, b2: b2raw || null, q2: b2raw ? (q2raw || null) : null,
               text: "key: " + tonic + "?", keypartial: tonic, cnote: text || undefined, added: true};
    }
  } else if (type === "tempo") {
    const bpm = Math.max(20, Math.min(400, +document.getElementById("ntempo").value || 120));
    fresh = {b1, q1, b2: null, q2: null, text: "tempo: " + bpm, tempodir: bpm, cnote: text || undefined, added: true};
  } else if (type === "timesig") {
    const num = +document.getElementById("ntsnum").value, den = +document.getElementById("ntsden").value;
    const oldTs = effTs();
    // bar length OR beat unit changing moves anchors (6/8 counts eighths)
    const tsChanged = num !== oldTs[0] || den !== oldTs[1];
    const others = S.rollnotes.filter(n => !n.tsdir).length;
    if (tsChanged && others > 0 && !S.rebarArmed) {
      S.rebarArmed = true; // big warning, second tap confirms
      document.getElementById("nstatus").textContent =
        "⚠ Re-bar from " + effTs()[0] + "/" + effTs()[1] + " to " + num + "/" + den + "? " +
        others + " annotation(s) will be converted to keep their musical positions. " +
        "Tap Save again to confirm (then Sync to make permanent).";
      return;
    }
    S.rebarArmed = false;
    if (tsChanged) convertAnchors(oldTs, [num, den]);
    S.rollnotes = S.rollnotes.filter(n => !(n.tsdir)); // one meter per song
    fresh = {b1: tsChanged ? 1 : b1, q1: tsChanged ? 1 : q1, b2: null, q2: null,
             text: "timesig: " + num + "/" + den, tsdir: [num, den], cnote: text || undefined, added: true};
  } else if (type === "loop") {
    const lb = Math.max(1, +document.getElementById("nlb").value || 1);
    const lq = getBeatPair("nlq", "nls");
    // one loop point per song: a new one replaces any local one
    S.rollnotes = S.rollnotes.filter(n => !(n.added && n.loopTo !== undefined));
    fresh = {b1, q1, b2: null, q2: null, text: "loop: " + lb + "." + lq, cnote: text || undefined, added: true};
  } else if (type === "chop") {
    const cmode = document.getElementById("nchopmode").value;
    const dispTick = (b1 - 1) * barTicks() + (q1 - 1) * beatTicks();
    const raw = dispTick + S.chopS; // fields are displayed coords; the directive stores raw
    const newS = cmode === "start" ? raw : S.chopS;
    const delta = S.chopS - newS;
    const others = S.rollnotes.filter(n => !n.chopdir).length;
    if (cmode === "start" && delta !== 0 && others > 0 && !S.rebarArmed) {
      S.rebarArmed = true;
      document.getElementById("nstatus").textContent =
        "⚠ Chop the song start here? Bars renumber and " + others +
        " annotation(s) shift to keep their musical positions. Tap Save again to confirm.";
      return;
    }
    S.rebarArmed = false;
    if (cmode === "start" && delta !== 0) shiftAnchors(delta);
    S.rollnotes = S.rollnotes.filter(n => n.chopdir !== cmode); // one chop per side
    const cbt = barTicks();
    fresh = {b1: Math.floor(raw / cbt) + 1, q1: snapBeat((raw % cbt) / beatTicks() + 1),
             b2: null, q2: null, text: "chop: " + cmode, added: true};
  } else if (type === "chord") {
    const sym = document.getElementById("nchordsym").value.trim();
    if (!sym) { document.getElementById("nstatus").textContent = "Chord symbol is empty — tap chips or type one."; return; }
    localStorage.setItem("ff1roll-dragtype", "chord");
    fresh = {b1, q1, b2: b2raw || null, q2: b2raw ? (q2raw || null) : null,
             text: sym, chord: true, cnote: text || undefined, added: true};
  } else if (type === "section") {
    const label = document.getElementById("nsectlabel").value.trim();
    if (!label) { document.getElementById("nstatus").textContent = "Section label is empty."; return; }
    localStorage.setItem("ff1roll-dragtype", "section");
    fresh = {b1, q1, b2: b2raw || null, q2: b2raw ? (q2raw || null) : null,
             text: label, section: true, added: true,
             cnote: text || undefined};
  } else {
    fresh = {b1, q1, b2: b2raw || null, q2: b2raw ? (q2raw || null) : null, text, added: true};
  }
  dropSupersededBy(fresh);
  S.rollnotes.push(resolveNote(fresh));
  S.rangeSel = null;
  finalizeNotes();
  saveLocalNotes();
  buildScoreModel(); // annotations can change signatures/spelling
  clampView();
  S.lastSubtitle = undefined;
  updateSubtitle();
  editor.classList.remove("on");
  draw();
});
document.getElementById("ndelete").addEventListener("click", () => {
  // P4 (docs/annotations-v2.md): closes P3's known gap — see #nsave's own guard
  if (S.rollnotesReadOnly) { document.getElementById("nstatus").textContent = S.rollnotesLockReason || ROLLNOTES_LOCK_MSG; return; }
  // deleting the meter directive re-bars back to neutral 4/4 — same two-tap
  // warning + anchor conversion as declaring one, never a silent move
  if (S.editingNote && S.editingNote.tsdir) {
    const oldTs = effTs(), others = S.rollnotes.filter(n => !n.tsdir).length;
    const tsChanged = oldTs[0] !== 4 || oldTs[1] !== 4;
    if (tsChanged && others > 0 && !S.rebarArmed) {
      S.rebarArmed = true;
      document.getElementById("nstatus").textContent =
        "⚠ Removing the meter re-bars back to neutral 4/4. " + others +
        " annotation(s) will be converted to keep their musical positions. Tap Delete again to confirm.";
      return;
    }
    S.rebarArmed = false;
    if (tsChanged) convertAnchors(oldTs, [4, 4]);
  }
  // removing a start chop restores hidden bars: annotations shift right to stay
  // glued to their music, with the same two-tap warning as re-barring
  if (S.editingNote && S.editingNote.chopdir === "start" && S.chopS) {
    const others = S.rollnotes.filter(n => !n.chopdir).length;
    if (others > 0 && !S.rebarArmed) {
      S.rebarArmed = true;
      document.getElementById("nstatus").textContent =
        "⚠ Removing the start chop restores the hidden bars; " + others +
        " annotation(s) will shift to keep their musical positions. Tap Delete again to confirm.";
      return;
    }
    S.rebarArmed = false;
    shiftAnchors(S.chopS);
  }
  tombstone(S.editingNote); // synced notes need the deletion to survive a reload
  S.rollnotes = S.rollnotes.filter(n => n !== S.editingNote);
  finalizeNotes();
  saveLocalNotes();
  buildScoreModel();
  clampView();
  S.lastSubtitle = undefined;
  updateSubtitle();
  editor.classList.remove("on");
  draw();
});

 async function updateManifest(h, mutate) { // GET manifest.json, mutate, PUT — keeps the dropdown honest
  if (folderActive()) return; // the folder has no manifest: initCatalog rescans it
  const path = "albums/manifest.json";
  const putOnce = async () => {
    const g = await fetch(repoApi("songs") + path + "?ref=main", {headers: h, cache: "no-store"});
    if (!g.ok) throw apiError("songs", g, "manifest GET");
    const j = await g.json();
    const albums = JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\n/g, "")))));
    if (!mutate(albums)) return {ok: true};
    return fetch(repoApi("songs") + path, {method: "PUT", headers: h, body: JSON.stringify({
      message: "Update manifest from Night Roll", branch: "main", sha: j.sha,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(albums, null, 1) + "\n"))),
    })});
  };
  let r = await putOnce();
  if (r.status === 409) r = await putOnce();
  if (!r.ok) throw new Error("manifest PUT " + r.status);
}
function manifestPlace(albums, dropPath, addPath) { // remove one path, add another; returns changed
  let changed = false;
  for (const a of albums) {
    const i = a.songs.findIndex(s => s.path === dropPath || s.path === addPath);
    if (i >= 0) { a.songs.splice(i, 1); changed = true; }
  }
  if (addPath) {
    const title = albumTitleFor(addPath);
    let album = albums.find(a => a.title === title);
    if (!album) { album = {title, songs: []}; albums.push(album); }
    album.songs.push({title: titleCaseSlug(addPath.split("/").pop().replace(/\.mid$/, "")), path: addPath});
    album.songs.sort((a, b) => a.title.localeCompare(b.title));
    changed = true;
  }
  return changed;
}
  function songStatus(key) { // the word on a LOCAL row
  if (isUnsaved(key)) return "never saved";
  if (!catalogHas(key)) return "not published";
  let d = null;
  try { d = JSON.parse(localStorage.getItem(draftStoreKey(key)) || "null"); } catch (err) { d = null; }
  if (d && d.dirty) return "changed since publish";
  if (dirtySongs().includes(key)) return "annotations changed here";
  return "published";
}
  // once per launch, a few seconds in (after the boot's own fetches): the
// Publish (N) count is right before the sheet is ever opened
if (typeof window !== "undefined" && !LINK_SONGS) setTimeout(() => { fingerprintOldDrafts().catch(() => {}); }, 4000);
function openVersionsSheet() {
  document.getElementById("versionssheet").classList.add("on");
  renderVersionsSheet();
}
async function goBackToVersion(key, idx) {
  const list = readVersions(key);
  const v = list[idx];
  if (!v) return;
  const label = versionLabel(v);
  const ok = await appConfirm("GO BACK TO " + label.toUpperCase() + "?",
    "Your current state is kept as a version first.", "Go back to this", "Cancel");
  if (!ok) return;
  pushVersion(key, "Before going back"); // list[idx] is still valid after this: pushVersion only appends
  localStorage.setItem(draftStoreKey(key), JSON.stringify(v.draft));
  if (v.notes) localStorage.setItem("ff1roll-notes-" + key, JSON.stringify(v.notes)); else localStorage.removeItem("ff1roll-notes-" + key);
  if (v.ts) localStorage.setItem("ff1roll-ts-" + key, v.ts); else localStorage.removeItem("ff1roll-ts-" + key);
  S.editUndo = []; S.editRedo = [];
  if (key === S.songKey) await openDraft(key);
  document.getElementById("versionssheet").classList.remove("on");
  setInfo("back to " + label + " — your previous state is saved as a version too");
}
function renderVersionsSheet() {
  const box = document.getElementById("versionsrows");
  box.textContent = "";
  const key = S.songKey;
  const row = (label, onGoBack) => {
    const r = document.createElement("div");
    r.className = "noterow";
    const body = document.createElement("span");
    body.className = "body";
    body.textContent = label;
    r.appendChild(body);
    if (onGoBack) {
      const b = document.createElement("button");
      b.className = "fitem";
      b.style.cssText = "flex:none;width:auto";
      b.textContent = "Go back to this";
      b.addEventListener("click", onGoBack);
      r.appendChild(b);
    }
    box.appendChild(r);
    return r;
  };
  if (!key) { row("open a song first"); return; }
  if (catalogHas(key)) row("Published copy", () => goBackToPublished(key));
  const list = readVersions(key);
  if (!list.length && !catalogHas(key)) row("Nothing saved here yet — File → Save Version to start.");
  for (let i = list.length - 1; i >= 0; i--) { // newest first on screen
    const v = list[i];
    row(versionLabel(v), () => goBackToVersion(key, i));
  }
}
async function goBackToPublished(key) { // same door as the Publish sheet's Revert (revertSongToRepo) — same contract: chat included
  const chatKey = "ff1roll-ask-" + key;
  const chatN = askUnsavedCount(chatKey);
  const ok = await appConfirm("GO BACK TO THE PUBLISHED COPY?",
    "Your current state is kept as a version first." + (chatN ? " Drops " + chatN + " unsaved chat message" + (chatN === 1 ? "" : "s") + " too." : ""),
    "Go back to this", "Cancel");
  if (!ok) return;
  dropLocalSong(key);
  askRevertToSaved(chatKey);
  pubCheck.delete(key);
  S.editUndo = []; S.editRedo = [];
  if (key === S.songKey) { S.songKey = null; await loadSong(key); }
  updateSyncBtn();
  updateSongBtn();
  if (typeof asksheet !== "undefined" && asksheet.classList.contains("on") && askStoreKey() === chatKey) askRender();
  document.getElementById("versionssheet").classList.remove("on");
  setInfo("back to the published copy" + (chatN ? " and dropped " + chatN + " chat message" + (chatN === 1 ? "" : "s") : "") + " — your previous state is saved as a version too");
}
const fileStatus = s => {
  if (/⚠|failed|error|can't|cannot/i.test(s)) logErr(s);
  document.getElementById("filestatus").textContent = s;
};
const filesheet = document.getElementById("filesheet");
function openGridSheet() {
  const row = document.getElementById("gridchips");
  row.innerHTML = "";
  for (const n of [4, 5, 6, 7, 8, 9, 10, 12, 16]) {
    const b = document.createElement("button");
    b.textContent = String(n);
    b.className = "chip" + (S.gridDiv === n ? " selected" : "");
    b.style.cssText = "min-width:52px;min-height:44px;font-size:1.0625rem;justify-content:center" +
      (S.gridDiv === n ? ";background:var(--gold);color:#111;font-weight:700" : "");
    b.addEventListener("click", () => { S.gridDiv = n; syncDurSeg(); draw(); openGridSheet(); });
    row.appendChild(b);
  }
  const ab = document.getElementById("gridab"), aq = document.getElementById("gridaq");
  ab.value = S.gridAnchor.b; aq.value = S.gridAnchor.q;
  const an = document.getElementById("gridanchor");
  an.textContent = !S.gridDiv ? "Grid off — the roll shows the meter's own lines."
    : "Lines run from " + S.gridAnchor.b + "." + S.gridAnchor.q + ", every 1/" + S.gridDiv +
      " of a bar, across the whole song. Bar lines stay visible but don't snap.";
  document.getElementById("gridsheet").classList.add("on");
}
for (const id of ["gridab", "gridaq"]) document.getElementById(id).addEventListener("input", () => {
  const b = Math.max(1, Math.round(+document.getElementById("gridab").value || 1));
  const q = Math.max(1, +document.getElementById("gridaq").value || 1);
  S.gridAnchor = {b, q};
  draw();
  const an = document.getElementById("gridanchor");
  if (S.gridDiv) an.textContent = "Lines run from " + b + "." + q + ", every 1/" + S.gridDiv +
    " of a bar, across the whole song. Bar lines stay visible but don't snap.";
});
document.getElementById("gridoff").addEventListener("click", () => { S.gridDiv = null; syncDurSeg(); draw(); openGridSheet(); });
document.getElementById("gridclose").addEventListener("click", () => {
  document.getElementById("gridsheet").classList.remove("on");
  setInfo(S.gridDiv ? "grid: " + S.gridDiv + " lines/bar — View ▾ → Grid to change" : "grid off");
});
// the rest of Logic's transport keys (DAW review, 2026-09-29: muscle memory
// failed silently): Return = to the start, K = click on/off, C = cycle
// on/off, R = record, ⌘← / ⌘→ = zoom out / in around the cursor. Any song.
document.addEventListener("keydown", e => {
  if (!S.song || e.repeat || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
  const meta = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
  if (meta && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    const f = e.key === "ArrowRight" ? 1.25 : 0.8, ppt0 = pxPerTick(), cx = S.RULER_W + S.playCursor * ppt0 - S.view.x;
    S.view.pxq = Math.min(400, Math.max(S.viewMode === "score" ? minPxq() : pxqFloor(), S.view.pxq * f));
    S.view.x = S.playCursor * pxPerTick() + S.RULER_W - cx; // the cursor stays where it was on screen
    clampView(); draw(); e.preventDefault(); return;
  }
  if (meta || e.shiftKey) return;
  if (e.key === "Enter" && t && (t.tagName === "BUTTON" || t.getAttribute("role") === "button")) return; // Return on a focused button (real or role=button) presses it
  if (e.key === "Enter") { document.getElementById("rwbtn").click(); e.preventDefault(); return; }
  if (k === "k") { document.getElementById("metbtn").click(); e.preventDefault(); return; }
  if (k === "x") { toggleMixer(); e.preventDefault(); return; } // Logic's mixer key
  if (e.key === "Escape" && S.rangeSel) { S.rangeSel = null; setInfo("range cleared"); draw(); return; }
  if (k === "c" && S.rangeSel && S.rangeSel.cycle && S.rangeSel.b > S.rangeSel.a) { S.rangeSel.off = !S.rangeSel.off; setInfo(S.rangeSel.off ? "cycle off" : "cycle on"); draw(); e.preventDefault(); return; }
  if (k === "r") { const rb = document.getElementById("recbtn"); if (rb && rb.offsetParent !== null) { rb.click(); e.preventDefault(); } return; }
  if (k === "q") { // Logic's Q: quantize the selection — only on your own songs
    if (editableSong()) document.getElementById("quantbtn").click(); else setInfo("Quantize works on your own songs");
    e.preventDefault(); return;
  }
});
// VoiceOver/keyboard (2026-09-30): the app's own role="button" elements
// (track-chip M/S/H, the chip itself, the "what's Claude doing" strip, …)
// are <span>/<div>, not real <button>s — a browser gives those no built-in
// Enter/Space activation the way it does a <button>. One delegated listener
// covers every one of them, present and future, the same way SHEET_TOP is
// the one choke point for every sheet.
document.addEventListener("keydown", e => {
  if ((e.key !== "Enter" && e.key !== " ") || e.repeat) return;
  const t = e.target;
  if (!t || t.tagName === "BUTTON" || t.getAttribute("role") !== "button") return;
  e.preventDefault();
  t.click();
});
document.addEventListener("keydown", e => { // space = play/stop, Logic-style
  if (e.code !== "Space" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" ||
            t.isContentEditable || t.tagName === "BUTTON" || t.getAttribute("role") === "button")) return; // typing/tabbing wins
  if (!S.song) return;
  e.preventDefault(); // page must not scroll
  if (S.playing) stop(); else document.getElementById("playbtn").click();
});
document.getElementById("viewsheetbtn").addEventListener("click", e => {
  const sheet = document.getElementById("viewsheet");
  if (sheet.classList.contains("on")) { closeFileMenus(); return; }
  closeFileMenus();
  S.vwOpenGroup = null; // sub-menu follow-up, 2026-10-02: every group starts closed, each time View ▾ opens
  renderViewMenu();
  const r = e.currentTarget.getBoundingClientRect();
  sheet.style.left = Math.max(6, Math.min(r.left, songRegionRight() - 250)) + "px";
  sheet.style.top = (r.bottom + 6) + "px";
  sheet.classList.add("on");
});
{ // View toggles flip in place — the menu STAYS OPEN (batch hiding is the use)
  const on = (id, fn) => document.getElementById(id).addEventListener("click", () => { fn(); renderViewMenu(); });
  // Each group header toggles vwOpenGroup accordion-style: tapping the OPEN
  // group's own header closes it (back to null); tapping any other closes
  // whichever was open and opens this one — at most one group's content div
  // is ever visible. Same expanding-row mechanics "View type ▸" always used
  // (ruling #4, 2026-10-01 pm), just generalized to all six (sub-menu
  // follow-up, 2026-10-02, Josh: "View ▾ is too tall — make EVERY section an
  // expanding sub-menu").
  const toggleGroup = key => { S.vwOpenGroup = S.vwOpenGroup === key ? null : key; };
  on("vwViewType", () => toggleGroup("view"));
  on("vwPanels", () => toggleGroup("panels"));
  on("vwTools", () => toggleGroup("tools"));
  on("vwDisplay", () => toggleGroup("display"));
  on("vwBackground", () => toggleGroup("background"));
  on("vwMode", () => toggleGroup("mode"));
  // VIEW group is a radio (Josh, 2026-09-30): each item always SELECTS its
  // mode — no toggle-off — same as the footer's #viewbtn segmented control.
  // "View type ▸" (chrome density follow-up, 2026-10-01 pm): expands/
  // collapses #vwViewTypeRow in place — picking a row below still re-renders
  // (the "on" wrapper) so the ▸/▾ + current-view label stay in sync.
  on("vwRoll", () => setViewMode("roll"));
  on("vwScore", () => setViewMode("score"));
  on("vwListener", () => {
    S.listenerMode = !S.listenerMode;
    localStorage.setItem("ff1roll-listener", S.listenerMode ? "1" : "0");
    applyListener();
  });
  on("vwTracksView", () => setViewMode("tracks"));
  on("vwMixer", () => toggleMixer());
  on("vwLearning", () => { setAppMode(appMode() === "learning" ? "normal" : "learning"); applyMode(); });
  on("vwAnalyze", () => { // Normal-only (the item is absent otherwise) — compute on toggle, never per frame
    if (!analysisAvailable() || !S.song) return;
    S.analysisOn = !S.analysisOn;
    if (S.analysisOn) computeAnalysisLayer(); else { if (S._analysisTimer) { clearTimeout(S._analysisTimer); S._analysisTimer = null; } S.analysisBands = {chords: [], key: null}; }
    finalizeNotes();
    clampView();
    draw();
  });
  on("vwCompare", () => { document.getElementById("viewsheet").classList.remove("on"); if (S.cmp) cmpExit(); else cmpEnter(); });
  on("vwTracks", () => document.getElementById("tracktoggle").click());
  on("vwEdit", () => { S.editrowHidden = !S.editrowHidden; applyChrome(); });
  on("vwAdded", () => { setAddedOutline(!showAddedOutline()); drawFull(); });
  on("vwFooter", () => { S.footerHidden = !S.footerHidden; applyChrome(); });
  on("vwInst", () => document.getElementById("instbtn").click());
  on("vwSub", () => toggleSubtitle());
  on("vwGrid", () => { document.getElementById("viewsheet").classList.remove("on"); openGridSheet(); });
  // BACKGROUND (chrome density follow-up, 2026-10-01 pm): both forward to
  // the footer buttons' own click handlers (renderJobs/errChip's sheets are
  // unchanged) — same "close View ▾ first" convention as vwGrid/vwCompare
  // above, since these open a separate overlay rather than toggling in
  // place. Works even while #jobsbtn/#errbtn are themselves hidden (0 jobs,
  // 0 unread) — a hidden button's own click() still fires.
  on("vwJobs", () => { document.getElementById("viewsheet").classList.remove("on"); document.getElementById("jobsbtn").click(); });
  on("vwMessages", () => { document.getElementById("viewsheet").classList.remove("on"); document.getElementById("errbtn").click(); });
  on("vwLevelsMinus", () => setSecDepth(Math.min(secDepthCap(), S.secMaxDepth - 1) - 1));
  on("vwLevelsPlus", () => setSecDepth(Math.min(secDepthCap(), S.secMaxDepth - 1) + 1));
}
// P6: the Analyze sheet — opened by tapping a band in the Analyze layer
// (tap()); Adopt writes ONE annotation (or all chords) through the existing
// write path, Cancel just closes (nothing is written by looking).
document.getElementById("analyzeadopt").addEventListener("click", () => {
  if (!S.analyzeTarget) return;
  if (S.analyzeTarget.kind === "chord") adoptChordBand(S.analyzeTarget);
  else adoptKeyRegion({start: S.analyzeTarget.start, end: S.analyzeTarget.end, text: S.analyzeTarget.text,
                        name: S.analyzeTarget.text, sf: S.analysisBands.key ? S.analysisBands.key.sf : 0});
  document.getElementById("analyzesheet").classList.remove("on");
});
document.getElementById("analyzeadoptall").addEventListener("click", () => {
  adoptAllChords();
  document.getElementById("analyzesheet").classList.remove("on");
});
document.getElementById("analyzeclose").addEventListener("click", () => document.getElementById("analyzesheet").classList.remove("on"));
document.addEventListener("pointerdown", e => { // tap-away closes the View menu
  const vs = document.getElementById("viewsheet");
  if (vs.classList.contains("on") && !vs.contains(e.target) && e.target.id !== "viewsheetbtn")
    vs.classList.remove("on");
}, {capture: true});
document.getElementById("editsheetbtn").addEventListener("click", e => {
  const sheet = document.getElementById("editsheet");
  if (sheet.classList.contains("on")) { closeFileMenus(); return; }
  closeFileMenus();
  const r = e.currentTarget.getBoundingClientRect();
  sheet.style.left = Math.max(6, Math.min(r.left, songRegionRight() - 250)) + "px";
  sheet.style.top = (r.bottom + 6) + "px";
  sheet.classList.add("on");
});
{ // menu items proxy the edit-row buttons — same guards, same messages
  const proxy = (id, fn) => document.getElementById(id).addEventListener("click", () => { closeFileMenus(); fn(); });
  proxy("emUndo", editUndoPop);
  proxy("emRedo", editRedoPop);
  proxy("emDup", () => document.getElementById("copybtn").click());
  proxy("emPaste", () => document.getElementById("pastebtn").click());
  proxy("emPasteTo", openPasteTo);
  proxy("emCut", () => document.getElementById("cutbtn").click());
  proxy("emDelete", () => document.getElementById("delbtn").click());
  proxy("emSplit", () => document.getElementById("splitbtn").click());
  proxy("emDivide", () => document.getElementById("divbtn").click());
  proxy("emJoin", () => document.getElementById("joinbtn").click());
  proxy("emQuantize", () => document.getElementById("quantbtn").click());
  proxy("emDedupe", () => {
    if (!editableSong()) { setInfo("Remove duplicate notes works on your own songs"); return; }
    const k = removeDuplicateNotes();
    setInfo(k ? "removed " + k + " duplicate note" + (k === 1 ? "" : "s") + " (undo restores them)" : "no duplicate notes in this song");
  });
  proxy("emMove", () => document.getElementById("movebtn").click());
  proxy("emTranspose", () => document.getElementById("trbtn").click());
  proxy("emInsertBars", () => { if (editableSong()) openInsertBars(); else setInfo("Insert bars works on your own songs"); });
  proxy("emDeleteBars", () => { if (editableSong()) openDeleteBars(); else setInfo("Delete bars works on your own songs"); });
  proxy("emChord", () => document.getElementById("insbtn").click());
  proxy("emFill", () => document.getElementById("drumfillbtn").click());
  proxy("emDrummer", () => openDrummer());
  proxy("emBassist", () => openBassist());
}
function fileMenuSaveLabels() { // Save Version: your own local songs only. Versions…: any open song with a repo path (browsing/going back to the published copy also works on a read-only capture with local annotation edits)
  // an Untitled song is his too — and Save Version is how it gets a folder at
  // all (Josh, 2026-10-03: "there is no Save Version")
  const comp = !!S.song && (isComposition() || isUnsaved(S.songKey)) && !LINK_SONGS;
  document.getElementById("filesavelocal").style.display = comp ? "" : "none";
  document.getElementById("filerevert").style.display = !!S.song && !!S.songKey && !S.songKey.startsWith("local/") && !LINK_SONGS ? "" : "none";
}
// File ▾ → "Open Recent ▸" (2026-10-01): same expanding-row pattern as
// View ▾'s own groups (renderViewMenu/vwOpenGroup) — keeps the ▸/▾
// glyph and #fileopenrecentrow's own rows in sync; called on every File ▾
// open and again after any tap inside the row (pick/Clear) so the menu
// reflects the new state in place, without closing.
function renderOpenRecentRow() {
  const btn = document.getElementById("fileopenrecent");
  btn.textContent = (S.fileOpenRecentOpen ? "▾  " : "▸  ") + "Open Recent";
  btn.setAttribute("aria-expanded", String(S.fileOpenRecentOpen));
  const row = document.getElementById("fileopenrecentrow");
  row.style.display = S.fileOpenRecentOpen ? "" : "none";
  if (!S.fileOpenRecentOpen) return;
  row.innerHTML = "";
  const list = recentSongsForMenu();
  if (!list.length) {
    const d = document.createElement("div");
    d.className = "fitem";
    d.style.cssText = "min-height:44px;opacity:.55;cursor:default";
    d.textContent = "No recent songs";
    row.appendChild(d);
    return;
  }
  for (const r of list) {
    const b = document.createElement("button");
    b.className = "fitem";
    b.style.minHeight = "44px";
    const current = r.key === S.songKey;
    b.textContent = (current ? "✓ " : "   ") + r.title + "  — " + recentAlbumFor(r.key);
    if (current) b.style.opacity = "0.55";
    b.addEventListener("click", () => { closeFileMenus(); openRecentSong(r.key); });
    row.appendChild(b);
  }
  const clear = document.createElement("button");
  clear.className = "fitem";
  clear.style.cssText = "min-height:44px;color:var(--dim)";
  clear.textContent = "Clear recent";
  clear.addEventListener("click", () => { clearRecentSongs(); renderOpenRecentRow(); });
  row.appendChild(clear);
}
// tapping a row: the same two functions File → Open…'s own rows use
// (fsubFolder/renderFolder) — a local draft wins, otherwise the catalog path
function openRecentSong(key) {
  if (localStorage.getItem(draftStoreKey(key)) !== null) { openDraft(key); return; }
  albumClear(); // picking a song by hand ends an album run — Open…'s own rule (fsubFolder)
  S.currentPath = key;
  rememberLastSong(key);
  reflectSongURL(key);
  updateSongBtn();
  loadSong(key).catch(err => setInfo(err.message));
}
document.getElementById("filesheetbtn").addEventListener("click", e => {
  if (filesheet.classList.contains("on")) { closeFileMenus(); return; }
  closeFileMenus();
  fileMenuSaveLabels();
  renderOpenRecentRow();
  filesub.classList.remove("on");
  document.getElementById("filenewform").style.display = "none";
  document.getElementById("filesaveasform").style.display = "none";
  document.getElementById("filerenameform").style.display = "none";
  document.getElementById("filemoverow").style.display = isComposition() ? "" : "none";
  document.getElementById("filesavelocal").textContent = S.song && isUnsaved(S.songKey) ? "Save Version…" : "Save Version";
  if (isComposition()) { // move targets: any folder of yours, or a new one
    const sel = document.getElementById("fmdest");
    // name the current home first — a dropdown holding only the OTHER album
    // read as "destination selected" (Josh, 2026-09-07)
    document.getElementById("fmlbl").textContent = "In " + folderTitle(folderOf(S.songKey)) + " · move to";
    fillFolderSelect(sel, folderOf(S.songKey));
    document.getElementById("fmnewfolder").style.display = sel.value === "__new__" ? "" : "none";
  }
  const impN = importDraftKeys().length;
  const impBtn = document.getElementById("fileimpcommit");
  impBtn.style.display = impN ? "" : "none";
  impBtn.textContent = publishLabel("import (" + impN + ")");
  impBtn.disabled = !publishDest();
  { // the rename item names its victim: Rename "Overworld"…
    const t = S.currentPath ? songTitleOf(S.currentPath) : "";
    document.getElementById("filerename").textContent =
      t ? "Rename “" + (t.length > 18 ? t.slice(0, 17) + "…" : t) + "”…" : "Rename…";
  }
  { const origin = S.song && S.songKey ? originOf(S.songKey) : null;
    fileStatus(S.song && isUnsaved(S.songKey) ? "not saved yet — Save names it and picks its folder"
               : isComposition() ? "your song — editable"
               : (origin === "capture" || origin === "starter") ? "read-only here — ✎ Edit (or Save As…) makes an editable copy"
               : "read-only here — Save As makes an editable copy in a folder of yours"); }
  const r = e.currentTarget.getBoundingClientRect();
  filesheet.style.left = Math.max(6, r.left) + "px";
  filesheet.style.top = (r.bottom + 4) + "px";
  filesheet.classList.add("on");
});
document.addEventListener("pointerdown", e => { // tap-away closes, like a real menu
  if (!filesheet.classList.contains("on") && !filesub.classList.contains("on")) return;
  if (filesheet.contains(e.target) || filesub.contains(e.target) || e.target.closest("#filesheetbtn")) return;
  closeFileMenus();
}, {capture: true});
document.getElementById("fmdest").addEventListener("change", () => {
  const isNew = document.getElementById("fmdest").value === "__new__";
  document.getElementById("fmnewfolder").style.display = isNew ? "" : "none";
  if (isNew) document.getElementById("fmnewfolder").focus();
});
document.getElementById("fmgo").addEventListener("click", e => {
  const folder = chosenFolder(document.getElementById("fmdest"), document.getElementById("fmnewfolder"));
  if (!folder) { fileStatus("⚠ Pick a folder, or type a name for a new one."); return; }
  if (!isComposition()) return;
  localStorage.setItem("ff1roll-lastfolder", folder);
  e.currentTarget.disabled = true;
  moveComposition("albums/" + folder + "/").finally(() => { e.currentTarget.disabled = false; });
});
// Open › is a cascading submenu: albums fly out beside the File menu,
// drill into a group, tap a song. Opens straight into the current group.
const filesub = document.getElementById("filesub");
function closeFileMenus() {
  filesheet.classList.remove("on");
  filesub.classList.remove("on");
  document.getElementById("editsheet").classList.remove("on");
  document.getElementById("viewsheet").classList.remove("on");
  document.getElementById("importhub").classList.remove("on");
  closeDropUp();
}
 function openDropUp(btn, menu) {
  const was = S.dropUpOpen === menu && menu.classList.contains("on"); // tapping an already-open trigger toggles it closed
  closeFileMenus();
  if (was) return;
  const r = btn.getBoundingClientRect();
  menu.style.left = Math.max(6, Math.min(r.left, songRegionRight() - 250)) + "px";
  menu.style.bottom = (wmInnerHeight() - r.top + 6) + "px";
  menu.classList.add("on");
  S.dropUpOpen = menu;
}
document.addEventListener("pointerdown", e => { // tap-away closes — exempts the trigger buttons themselves (their own click handler does the toggle-closed, via `was` above) and anything inside the open menu, so a native <select> inside it (#findsel) and its iOS picker stay safe
  if (!S.dropUpOpen) return;
  if (S.dropUpOpen.contains(e.target) || e.target.closest("#viewbtn, #listbtn, #askattach")) return;
  closeDropUp();
}, {capture: true});
function fsubItem(label, onTap, dim, icon) { // icon: an ICON table name — label is always a hardcoded string, never user text, so innerHTML is safe here
  const b = document.createElement("button");
  b.className = "fitem";
  if (dim) b.style.color = "var(--dim)";
  if (icon) b.innerHTML = iconSvg(icon) + "  " + label;
  else b.textContent = label;
  b.addEventListener("click", onTap);
  filesub.appendChild(b);
}
function fsubHeader(text) {
  const h = document.createElement("div");
  h.className = "meta";
  h.style.cssText = "padding:8px 10px 2px;letter-spacing:.1em;white-space:normal";
  h.textContent = text;
  filesub.appendChild(h);
}
function fsubAlbums() { // File → Open, top: LOCAL's top-level folders, then PUBLISHED's
  filesub.innerHTML = "";
  const local = folderTree(draftKeys());
  if (subfolderKeys(local).length) {
    fsubHeader(localLabel());
    for (const seg of subfolderKeys(local)) fsubItem(segTitle(local.sub[seg].path) + "  (" + nodeCount(local.sub[seg]) + ")  ›", () => fsubFolder("local", local.sub[seg].path));
  }
  fsubHeader(publishedLabel());
  const pub = folderTree(publishedPaths());
  for (const seg of subfolderKeys(pub)) fsubItem(segTitle(pub.sub[seg].path) + "  (" + nodeCount(pub.sub[seg]) + ")  ›", () => fsubFolder("published", pub.sub[seg].path));
  { // build stamp: which deploy THIS tab is actually running (stale-cache tell)
    // ONE stamp: this runs on every open and every "‹ back", and each run
    // appended another line (Josh, 2026-09-27: "there's two of them … earlier three")
    const old = document.getElementById("fsubbuild"); if (old) old.remove();
    const d = document.createElement("div");
    d.id = "fsubbuild";
    d.className = "meta";
    d.style.cssText = "padding:6px 10px;opacity:.6;white-space:normal";
    const installed = typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches;
    d.textContent = "build " + (document.lastModified || "unknown") + (installed ? " · installed" : "") + (typeof navigator !== "undefined" && navigator.onLine === false ? " · offline" : "");
    document.getElementById("filesheet").appendChild(d);
  }
}
function fsubFolder(section, folder) { // one level: subfolders, then this folder's songs
  const root = folderTree(section === "local" ? draftKeys() : publishedPaths());
  const node = nodeAt(root, folder);
  if (!node) return fsubAlbums();
  if (section === "local" && node.songs.length && node.songs.every(isCaptureKey) && !subfolderKeys(node).length)
    return fsubImportAlbum(folder.split("/").pop()); // captures: publish-all + per-track rows
  filesub.innerHTML = "";
  const up = parentFolder(folder);
  fsubItem("‹ " + (up ? segTitle(up) : "All folders"), () => up ? fsubFolder(section, up) : fsubAlbums(), true);
  fsubHeader((section === "local" ? localLabel() : publishedLabel()) + "  ·  " + folderTitle(folder));
  for (const seg of subfolderKeys(node)) fsubItem(segTitle(node.sub[seg].path) + "  (" + nodeCount(node.sub[seg]) + ")  ›", () => fsubFolder(section, node.sub[seg].path));
  if (section === "local") {
    const songs = node.songs.slice().sort((a, b) => songTitleOf(a).localeCompare(songTitleOf(b)));
    const rerender = () => { (nodeAt(folderTree(draftKeys()), folder) || {songs: []}).songs.length ? fsubFolder("local", folder) : fsubAlbums(); };
    for (const key of songs) draftRow(key, songTitleOf(key) + "  · " + songStatus(key), rerender);
    return;
  }
  const group = node.songs.length && groupOf(node.songs[0]);
  const oneAlbum = !!(group && node.songs.every(p => groupOf(p) === group)); // this folder is one album: the only way into an album run
  if (oneAlbum && albumHasTrackData(group)) filesub.appendChild(albumOrderControl(group, () => fsubFolder(section, folder)));
  const songs = oneAlbum
    ? albumEffectiveOrder(group).map(([, p]) => p).filter(p => node.songs.includes(p))
    : node.songs.slice().sort((a, b) => songTitleOf(a).localeCompare(songTitleOf(b)));
  if (oneAlbum) { // play follows the SAME order the list just showed (Josh: WYSIWYG)
    const here = songs.indexOf(S.currentPath);
    const from = here >= 0 ? here : 0;
    fsubItem("Play album" + (here >= 0 ? " from " + (here + 1) + "/" + songs.length : ""),
             () => { closeFileMenus(); albumStart(group, from); }, false, "album");
  }
  for (const path of songs)
    fsubItem(songTitleOf(path) + (localStorage.getItem(draftStoreKey(path)) !== null ? "  · local copy" : "") + (path === S.currentPath ? "   ✓" : ""), () => {
      closeFileMenus();
      albumClear(); // picking a song by hand ends an album run
      S.currentPath = path;
      rememberLastSong(path);
      reflectSongURL(path);
      updateSongBtn();
      loadSong(path).catch(err => setInfo(err.message));
    });
}
function fsubSongs(group) { fsubFolder("published", folderOf(S.CATALOG[group][0][1])); } // an album is its folder
function draftRow(key, label, rerender, extra) { // open + (optional extra) + two-tap ✕
  const row = document.createElement("div");
  row.style.cssText = "display:flex;align-items:center;gap:4px";
  const open = document.createElement("button");
  open.className = "fitem";
  open.style.flex = "1";
  open.textContent = label + (key === S.currentPath ? "   ✓" : "");
  open.addEventListener("click", () => { closeFileMenus(); openDraft(key); });
  row.appendChild(open);
  if (extra) row.appendChild(extra);
  const del = document.createElement("button");
  del.className = "fitem";
  del.style.cssText = "flex:none;width:auto;color:var(--dim)";
  del.textContent = "✕";
  del.addEventListener("click", () => {
    if (del.textContent === "✕") { // two-tap confirm: unsaved work dies with a draft
      del.textContent = "sure?";
      del.style.color = "#e66767";
      return;
    }
    for (const pre of ["ff1roll-draft-", "ff1roll-notes-", "ff1roll-ts-", "ff1roll-edits-"])
      localStorage.removeItem(pre + key);
    idbDraftDelete(key);
    rerender();
  });
  row.appendChild(del);
  filesub.appendChild(row);
}
function fsubLocalFolder(folder) { return fsubFolder("local", folder); }
// A running "Commit album" outlives the menu: the File menu is rebuilt on
// every open, so its progress must live outside the button (Josh,
// 2026-09-27, minutes into the Chrono Trigger commit: "I didn't know if I
// could click away"). The footer strip carries the same line everywhere.
// A publish of captures is a job too: one per folder at a time, its note is
// commitImports' status line, ↻ re-runs it for the drafts still there
// (commitImports deletes drafts only after success, so a retry is safe).
function publishJobStart(slug, keys, statusFn) {
  keys = keys || importDraftKeys();
  if (!keys.length) { statusFn && statusFn("No captures to publish."); return null; }
  const live = jobsFind("publish", slug, true) || (slug ? null : jobsFind("publish", null, true));
  if (live) { statusFn && statusFn("a publish is running: " + live.title + " — tap ⏳"); return null; }
  const title = slug ? titleCaseSlug(slug) : keys.length + " tracks";
  return jobStart("publish", title, [{label: keys.length + " track" + (keys.length === 1 ? "" : "s")}], async api => {
    api.update(0, {st: "running"});
    await commitImports(s => { api.note(s); statusFn && statusFn(s); }, keys);
    const left = keys.filter(k => localStorage.getItem(draftStoreKey(k)) !== null && importDraftKeys().includes(k));
    api.update(0, {st: left.length ? "failed" : "done", msg: left.length ? left.length + " not published" : ""});
    if (left.length) throw new Error(left.length + " of " + keys.length + " not published");
  }, {slug, keys});
}
JOB_KINDS.publish = {
  label: j => "Publish · " + j.title,
  open: j => openPubJobSheet(j), // the publish dialog (Josh, 2026-09-29: the old jump to File → Open → folder "brought me to a weird page")
  retry: j => { const keys = (j.keys || []).filter(k => importDraftKeys().includes(k)); if (!keys.length) { setInfo(j.title + ": nothing left to publish"); return; } const job = publishJobStart(j.slug, keys, setInfo); if (job) openPubJobSheet(job); },
};
function fsubImportAlbum(slug) {
  filesub.innerHTML = "";
  { const f = folderOf(importDraftKeys().find(k => k.split("/")[2] === slug) || "albums/imports/" + slug + "/x.mid");
    fsubItem("‹ " + (parentFolder(f) ? segTitle(parentFolder(f)) : "All folders"), () => parentFolder(f) ? fsubFolder("local", parentFolder(f)) : fsubAlbums(), true); }
  fsubHeader(localLabel());
  const keys = importDraftKeys().filter(k => k.split("/")[2] === slug);
  const all = document.createElement("button"); // whole folder in one publish
  all.className = "fitem";
  all.style.color = "var(--gold)";
  all.dataset.impcommit = slug;
  all.textContent = publishLabel("folder (" + keys.length + " track" + (keys.length === 1 ? "" : "s") + ")");
  all.disabled = !publishDest();
  { const live = jobsFind("publish", slug, true); if (live) { all.disabled = true; all.textContent = "⏳ " + (live.note || "publishing…"); } } // reopened mid-run: the job carries the line
  all.addEventListener("click", () => {
    const status = s => { // the button if the menu shows it, and the footer strip always
      const b = filesub.querySelector('[data-impcommit="' + slug + '"]');
      if (b) b.textContent = s;
      setInfo("⇪ " + titleCaseSlug(slug) + ": " + s);
    };
    const job = publishJobStart(slug, keys, status);
    if (!job) return;
    all.disabled = true;
    closeFileMenus(); // Josh's ask (3a): starting a folder publish from File → Open opens the dialog, not a bare status line
    openPubJobSheet(job);
    const off = jobsOnChange(() => { if (job.state === "running") return; off(); importDraftKeys().some(k => k.split("/")[2] === slug) ? fsubImportAlbum(slug) : fsubAlbums(); });
  });
  filesub.appendChild(all);
  { // the folder's ✕ (tap twice) discards the WHOLE album's captures at once (Josh 2026-08-16)
    const del = document.createElement("button");
    del.className = "fitem";
    del.style.cssText = "color:var(--dim)";
    del.textContent = "✕ Discard this folder's captures";
    del.addEventListener("click", () => {
      if (!del.dataset.armed) { del.dataset.armed = "1"; del.textContent = "✕ Discard all " + keys.length + "? Tap again"; del.style.color = "#e66767"; return; }
      for (const k of importDraftKeys().filter(k => k.split("/")[2] === slug)) {
        for (const pre of ["ff1roll-draft-", "ff1roll-notes-", "ff1roll-ts-", "ff1roll-edits-"])
          localStorage.removeItem(pre + k);
        idbDraftDelete(k);
      }
      fsubAlbums();
    });
    filesub.appendChild(del);
  }
  for (const key of keys) {
    const up = document.createElement("button"); // single track -> same album, top level
    up.className = "fitem";
    up.style.cssText = "flex:none;width:auto;color:var(--dim)";
    up.textContent = "⇪";
    up.setAttribute("aria-label", "Publish this track");
    up.disabled = !publishDest();
    up.addEventListener("click", () => {
      const job = publishJobStart(slug, [key], s => fileStatus(s));
      if (!job) return;
      up.disabled = true;
      const off = jobsOnChange(() => { if (job.state === "running") return; off(); importDraftKeys().some(k => k.split("/")[2] === slug) ? fsubImportAlbum(slug) : fsubAlbums(); });
    });
    draftRow(key, songTitleOf(key) + "  · " + songStatus(key),
             () => { importDraftKeys().some(k => k.split("/")[2] === slug) ? fsubImportAlbum(slug) : fsubAlbums(); },
             up);
  }
}
  document.getElementById("fileinst").addEventListener("click", () => {
  closeFileMenus();
  document.getElementById("instsheet").classList.add("on");
  S.instNav = {sys: null, game: null, sub: null};
  renderInstSheet();
});
document.getElementById("fileopen").addEventListener("click", e => {
  const group = Object.entries(S.CATALOG).find(([, songs]) => songs.some(([, p]) => p === S.currentPath));
  if (S.currentPath && localStorage.getItem("ff1roll-draft-" + S.currentPath)) fsubFolder("local", folderOf(S.currentPath)); // the local copy is what's open
  else if (group) fsubFolder("published", folderOf(S.currentPath));
  else fsubAlbums();
  const mr = filesheet.getBoundingClientRect();
  const ir = e.currentTarget.getBoundingClientRect();
  filesub.style.left = Math.min(mr.right + 4, songRegionRight() - 240) + "px";
  filesub.style.top = ir.top + "px";
  filesub.classList.add("on");
});
document.getElementById("fileopenrecent").addEventListener("click", () => {
  S.fileOpenRecentOpen = !S.fileOpenRecentOpen;
  renderOpenRecentRow();
});
document.getElementById("filenew").addEventListener("click", () => {
  document.getElementById("filenewform").style.display = "";
  document.getElementById("filesaveasform").style.display = "none";
  document.getElementById("fnbpm").focus();
});
document.getElementById("fncreate").addEventListener("click", () => {
  stop();
  createComposition(+document.getElementById("fnbpm").value || 120,
                    +document.getElementById("fnnum").value, +document.getElementById("fnden").value);
  document.getElementById("filesheet").classList.remove("on");
  setInfo("new song — Edit → Pencil to write. It lives on this device as " + songTitleOf(S.songKey) + " until File → Save Version names it and picks its folder.");
});
// return key in the name fields = the primary action (iOS keyboards
// otherwise cost an extra tap: the first one just dismisses the keyboard)
document.getElementById("fsname").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); document.getElementById("fsgo").click(); }
});
document.getElementById("fsnewfolder").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); document.getElementById("fsname").focus(); }
});
document.getElementById("fsfolder").addEventListener("change", () => {
  const isNew = document.getElementById("fsfolder").value === "__new__";
  document.getElementById("fsnewfolder").style.display = isNew ? "" : "none";
  if (isNew) document.getElementById("fsnewfolder").focus();
});
document.getElementById("filesaveas").addEventListener("click", () => { if (S.song) openSaveForm("fork"); });
document.getElementById("fsgo").addEventListener("click", async () => {
  const form = document.getElementById("filesaveasform");
  const name = document.getElementById("fsname").value;
  const folder = chosenFolder(document.getElementById("fsfolder"), document.getElementById("fsnewfolder"));
  if (!folder) { fileStatus("⚠ Pick a folder, or type a name for a new one."); document.getElementById("fsnewfolder").focus(); return; }
  if (!name.trim()) { fileStatus("⚠ Name the song."); document.getElementById("fsname").focus(); return; }
  stop();
  if (form.dataset.mode === "editcopy") {
    makeItMine(name, folder);
    document.getElementById("filesheet").classList.remove("on");
    return;
  }
  if (form.dataset.mode === "fork") {
    forkCurrentSong(name, folder);
    document.getElementById("filesheet").classList.remove("on");
    setInfo("copy saved as " + name.trim() + " in " + folderTitle(folder) + " — fully editable; Publish sends it to GitHub.");
    return;
  }
  if (form.dataset.mode === "publish") { // Publish on a song with no folder yet (lotion, 2026-10-03) — publishUnsavedSong is the one place this happens, left open afterward (status line) like ghsave's own writing-mode branch
    const btn = document.getElementById("fsgo");
    btn.disabled = true;
    try { await publishUnsavedSong(folder, name); }
    finally { btn.disabled = false; }
    return;
  }
  if (await saveSongAs(folder, name)) document.getElementById("filesheet").classList.remove("on");
});
// Rename works on EVERYTHING (Josh 2026-08-16): an uncommitted draft renames
// its file; a repo song keeps its filename (analysis docs reference it) and
// gets a display-title override in album.json + the manifest instead
document.getElementById("filerename").addEventListener("click", () => {
  if (!S.songKey) { fileStatus("Nothing to rename — no song open."); return; }
  document.getElementById("filerenameform").style.display = "";
  document.getElementById("filenewform").style.display = "none";
  document.getElementById("filesaveasform").style.display = "none";
  const inp = document.getElementById("frname");
  inp.value = songTitleOf(S.songKey);
  inp.focus();
  inp.select();
});
document.getElementById("frname").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); document.getElementById("frgo").click(); }
});
document.getElementById("frgo").addEventListener("click", async e => {
  const raw = document.getElementById("frname").value.trim();
  if (!raw || !S.songKey) { fileStatus("⚠ Type the new name first."); return; }
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const hasDraft = localStorage.getItem(draftStoreKey(S.songKey)) !== null;
    if (hasDraft && !(S.song && S.song.savedStamp)) { // never committed: rename the file itself
      const newKey = renameImportDraft(S.songKey, raw);
      if (newKey === null) { fileStatus("⚠ A draft named \"" + slugify(raw) + "\" already exists."); return; }
      updateSongBtn();
      fileStatus("Renamed ✓ (local draft — the name commits with it).");
    } else { // repo song: title override, filename untouched
      const token = writeToken();
      if (!token) { fileStatus("No GitHub token stored yet — add one in File → Settings."); return; }
      fileStatus("Renaming…");
      await renameRepoTitle(S.songKey, raw, ghHeaders(token));
      await initCatalog().catch(() => { /* CDN lag; next boot */ });
      // the refetched manifest can be CDN-stale for ~10 min — the repo write
      // succeeded, so patch the in-memory catalog instead of trusting it
      // (Josh renamed Main Theme and the crumb kept saying Main Theme)
      for (const songs of Object.values(S.CATALOG)) {
        const hit = songs.find(([, p]) => p === S.songKey);
        if (hit) hit[0] = raw;
      }
      updateSongBtn();
      fileStatus("Renamed ✓ — \"" + raw + "\" everywhere the dropdown shows it.");
    }
    document.getElementById("filerenameform").style.display = "none";
  } catch (err) { fileStatus("Rename failed: " + err.message); }
  finally { btn.disabled = false; }
});
async function renameRepoTitle(key, title, h) { return renameRepoTitles({[key]: title}, h); }
async function renameRepoTitles(titles, h) { // {key: title} for songs of ONE album: album.json songs overrides + manifest entries, one write each
  const keys = Object.keys(titles);
  if (!keys.length) return;
  const key = keys[0];
  const parts = key.split("/");
  const file = parts.pop();
  if (parts[parts.length - 1] === "songs") parts.pop(); // FF1-style albums keep songs/ nested
  const path = parts.join("/") + "/album.json";
  const base = file.replace(/\.midi?$/i, "");
  let meta = {title: titleCaseSlug(parts[parts.length - 1]), songs: {}}, sha = null;
  if (folderActive()) { // folder: the album.json there (or the site's, copied in) gets the override
    const r = await readData("songs", path, true);
    if (r.ok) { try { meta = await r.json(); } catch (err) { /* rewrite */ } }
    if (Array.isArray(meta.songs)) meta.songs = {};
    for (const k of keys) meta.songs[k.split("/").pop().replace(/\.midi?$/i, "")] = titles[k];
    await folderWrite(path, JSON.stringify(meta, null, 1) + "\n");
    return;
  }
  const g = await fetch(repoApi("songs") + path + "?ref=main", {headers: h, cache: "no-store"});
  if (g.ok) { // preserve every existing field (FF1's album.json carries notes/order)
    const j = await g.json();
    sha = j.sha;
    try { meta = JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\n/g, ""))))); } catch (err) { /* rewrite */ }
  }
  if (Array.isArray(meta.songs)) meta.songs = {}; // ancient shape guard
  meta.songs = {...(meta.songs || {})};
  for (const k of keys) meta.songs[k.split("/").pop().replace(/\.midi?$/i, "")] = titles[k];
  const body = {message: keys.length === 1 ? "Rename " + base + " to \"" + titles[key] + "\" from Night Roll" : "Name " + keys.length + " songs of " + (meta.title || base) + " from Night Roll", branch: "main",
    content: btoa(unescape(encodeURIComponent(JSON.stringify(meta, null, 1) + "\n")))};
  if (sha) body.sha = sha;
  const r = await fetch(repoApi("songs") + path, {method: "PUT", headers: h, body: JSON.stringify(body)});
  if (!r.ok) throw apiError("songs", r, "album.json");
  await updateManifest(h, albums => {
    let changed = false;
    for (const a of albums) {
      let hit = false;
      for (const k of keys) { const s = a.songs.find(x => x.path === k); if (s) { s.title = titles[k]; hit = true; } }
      if (hit) { a.songs.sort((x, y) => x.title.localeCompare(y.title)); changed = true; }
    }
    return changed;
  });
}
document.getElementById("editherebtn").addEventListener("click", () => editHereNow());
// ✎ Edit (Josh's ruling, renamed from "✎ Make it mine"): opens the "Edit a
// copy" sheet instead of forking straight away — same destination, one more
// tap to see/change the name and folder first.
document.getElementById("makeitminebtn").addEventListener("click", () => openSaveForm("editcopy"));
document.getElementById("filesavelocal").addEventListener("click", () => { if (S.song && isUnsaved(S.songKey)) { openSaveForm("save"); return; } closeFileMenus(); saveVersion(); });
async function revertSongToRepo(key) { // a Publish row's Revert: any pending song, open or not.
  // Reverts EVERYTHING unpublished for this song, chat included (Josh,
  // 2026-09-30, ruling on the "N chat messages + Revert does nothing" bug) —
  // the confirm/button name what's dropped so a chat-only revert isn't silent.
  const chatKey = "ff1roll-ask-" + key;
  const chatN = askUnsavedCount(chatKey);
  const chatPhrase = chatN ? chatN + " chat message" + (chatN === 1 ? "" : "s") : "";
  let notes = [];
  try { notes = JSON.parse(localStorage.getItem("ff1roll-notes-" + key) || "[]"); } catch (err) { /* corrupt: treat as none */ }
  const hasEdits = !!draftDirtyState(key) || notes.length > 0;
  const drops = hasEdits && chatPhrase ? "your edits and " + chatPhrase
              : hasEdits ? "your edits"
              : chatPhrase ? chatPhrase
              : "";
  const ok = await appConfirm("REVERT " + songTitleOf(key).toUpperCase() + "?",
    "Discards this device's unpublished changes to this song" + (hasEdits ? " — music, unsynced annotations, deletions" : "") +
    (chatPhrase ? (hasEdits ? ", and " + chatPhrase : " — " + chatPhrase) : "") + ". " +
    "The published copy becomes what you see. Your current state is kept as a version first — File → Versions… brings it back.",
    "Revert" + (drops ? " — drops " + drops : ""), "Cancel");
  if (!ok) return;
  dropLocalSong(key);
  askRevertToSaved(chatKey);
  pubCheck.delete(key);
  if (key === S.songKey) { S.editUndo = []; S.editRedo = []; S.songKey = null; await loadSong(key); }
  updateSyncBtn();
  updateSongBtn();
  if (document.getElementById("syncsheet").classList.contains("on")) renderSyncPending();
  if (typeof asksheet !== "undefined" && asksheet.classList.contains("on") && askStoreKey() === chatKey) askRender(); // chat sheet open on this song: reflect the drop live
  setInfo("reverted " + songTitleOf(key) + (chatPhrase ? " and dropped " + chatPhrase : "") + " — this device now has the published copy");
}
document.getElementById("filerevert").addEventListener("click", () => {
  if (!S.songKey) { setInfo("open a song first"); return; }
  if (S.songKey.startsWith("local/")) { setInfo("local imports have no repo copy to go back to"); return; }
  closeFileMenus();
  openVersionsSheet();
});
// today's path — kept as the fallback for a browser with no
// OfflineAudioContext, or an offline render that failed: m4a on Safari, webm
// on Chrome, both shareable everywhere. True MP3 would need a bundled
// encoder; the recorder route is dependency-free. Resolves null (after
// saying why) if this browser can record neither way.
function recordRealtimeAudio() {
  return new Promise(resolve => {
    ensureAudio();
    const dest = S.audio.createMediaStreamDestination();
    S.master.connect(dest);
    const mime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    if (!mime) { setInfo("this browser can't record audio — use Download .mid instead"); resolve(null); return; }
    const rec = new MediaRecorder(dest.stream, {mimeType: mime, audioBitsPerSecond: 192000});
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const ext = mime.startsWith("audio/mp4") ? "m4a" : "webm";
    const name = (S.songKey ? S.songKey.split("/").pop().replace(/\.mid$/, "") : "song") + "." + ext;
    rec.onstop = () => { S.master.disconnect(dest); resolve({blob: new Blob(chunks, {type: mime}), name, mime}); };
    stop();
    resumeAudio().then(() => {
      rec.start();
      setInfo("recording " + name + " — plays the song through once, hands off the transport");
      const lenSec = tickToSec(S.song, S.songEndTick) / S.playRate + 1;
      play(0, {noCountIn: true}).then(() => { // a count-in bar recorded as silence (Josh's re-imported export, 2026-09-16)
        setTimeout(() => { if (!S.exporting) return; stop(); rec.stop(); }, Math.min(600, lenSec) * 1000);
      });
    });
  });
}
document.getElementById("filedlaudio").addEventListener("click", async () => {
  if (!S.song) return;
  closeFileMenus();
  if (S.exporting) { setInfo("already exporting — it finishes when the song does"); return; }
  albumClear();
  S.exporting = true;
  let result = null, method = "offline";
  try {
    ensureAudio();
    await resumeAudio();
    const off = await renderSongOffline();
    if (off.ok) {
      result = {blob: new Blob([audioBufferToWav(off.buffer)], {type: "audio/wav"}),
                name: (S.songKey ? S.songKey.split("/").pop().replace(/\.mid$/, "") : "song") + ".wav"};
    } else {
      logDebug("Download audio: offline bounce unavailable (" + off.why + ") — falling back to the real-time recorder");
      method = "realtime";
      result = await recordRealtimeAudio();
    }
  } finally { S.exporting = false; }
  if (!result) return; // recordRealtimeAudio already said why (no MediaRecorder either)
  try { await deliverAudioFile(result.blob, result.name); }
  catch (err) { logErr("Download audio: " + (err && err.message || err)); return; }
  setInfo((method === "offline" ? "audio bounced: " : "audio saved: ") + result.name + " (" + Math.round(result.blob.size / 1024) + " KB)");
});
document.getElementById("filedlmid").addEventListener("click", () => {
  if (!S.song) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([writeMidi(S.song)], {type: "audio/midi"}));
  a.download = (S.songKey ? S.songKey.split("/").pop() : "song.mid");
  a.click();
  URL.revokeObjectURL(a.href);
});
   function chipTrackOrder(files) { // a set's files in disc/track/part order, unlisted (99/999) last; anything unparsable by name
  const M = chipModules.cache && chipModules.cache.spc;
  const key = f => { const t = M && M.parseTrackName ? M.parseTrackName(f.name) : null; return t ? [t.unlisted ? 1 : 0, t.disc || 0, t.track, t.part || ""] : [2, 0, 0, f.name]; };
  return files.slice().sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 4; i++) { if (x[i] < y[i]) return -1; if (x[i] > y[i]) return 1; } return a.name.localeCompare(b.name, undefined, {numeric: true}); });
}
function chipKindOf(bytes, name) { for (const k of Object.keys(CHIPS)) if (bytes.length > 8 && CHIPS[k].magic(bytes, name)) return k; return null; }
function chipVaultMeta(slug, kind) { // album.json's nsf: block for an import — one file per album, or a folder of one file per track
  const c = CHIPS[kind] || CHIPS.nsf;
  // the archive mirrors albums/: a console folder, then the album (Josh,
  // 2026-09-29: "why is the NSF repository not following the same directory
  // structure") — also what kept tetris.nsf and tetris.gbs from colliding
  const dir = (CONSOLE_OF[kind || "nsf"] || "other") + "/";
  const m = {vault: dir + (c.perFile ? slug + "/" : slug + c.ext), tracks: {}};
  if (kind && kind !== "nsf") m.chip = kind;
  if (c.perFile) m.perFile = true;
  return m;
}
 function nsfModules() { return chipModules("nsf"); }
async function captureChipTrack(kind, M, nsf, track, seconds, onProgress) { // dump-all.mjs recipe, minus the FF1 reference data
  // async runner yields to the event loop — a 300s emulation as one sync
  // block froze the tab long enough for iOS Safari's watchdog to force a
  // reload, killing the whole import mid-run (Josh, 2026-08-16)
  // NO sync fallback: a long sync run freezes the tab until Safari's
  // watchdog force-reloads it — an honest error beats a dead page
  const run = CHIPS[kind || "nsf"].run(M);
  if (!run || !M.detectLoopAsync) throw new Error("pipeline update still deploying — close the import panel and retry in a minute");
  const res = await run(nsf, track, seconds, onProgress);
  const {apuLog, frames, frameSec} = res;
  let events = res.events || M.reconstruct(apuLog, frames, frameSec); // a chip whose runner already reconstructed (SPC) hands its events over
  if (!events.length) return null; // silent slot (SFX banks have them)
  const t0 = Math.min(...events.map(ev => ev.startFrame));
  events = events.map(ev => ({...ev, startFrame: ev.startFrame - t0, endFrame: ev.endFrame - t0}));
  if (onProgress && !CHIPS[kind || "nsf"].tagged) onProgress("scan"); // emulation done — the loop scan is its own beacon phase
  const loop = CHIPS[kind || "nsf"].tagged ? null : await M.detectLoopAsync(events, frames - t0, null); // yielding twin: the sync scan froze the tab post-100%; a tagged set's length is the tag's
  let keptFrames = frames - t0;
  if (loop) { // trim to intro + one pass, timing backported from later passes
    events = M.backportTiming(events, loop.period);
    keptFrames = loop.keep;
    events = events.filter(ev => ev.startFrame < loop.onsets - 3)
      .map(ev => ({...ev, endFrame: Math.min(ev.endFrame, keptFrames)}));
  } else if (!CHIPS[kind || "nsf"].tagged && M.trimSustainedTail) {
    // no loop found: the capture ran to its seconds ceiling, but the driver
    // may have stopped changing anything long before that — a jingle under a
    // bar, held out by a re-attacked tail note (Zelda NES tracks 5-7, Josh
    // 2026-09-29: 1 beat of music, then $4000-$4017 rewritten unchanged
    // every frame for 37 more beats). Cut the dead tail to a ~1s ring-out;
    // any register actually differing anywhere keeps the window live.
    const changedAt = M.lastRegisterChangeFrame(apuLog, frames) - t0;
    const trimmed = M.trimSustainedTail(events, keptFrames, changedAt, Math.round(1 / frameSec));
    events = trimmed.events;
    keptFrames = trimmed.frames;
  }
  const bpm = M.fitBpm(events, frameSec, 120);
  const statedLoop = !loop && res.loopFrame != null && res.loopFrame > t0 ? res.loopFrame - t0 : null; // a log format (VGM) states its loop point; no scan needed
  // snap-residual gate: a through-composed track with a mid-song tempo
  // change fits ONE grid — snapping the off-grid section audibly warps it
  // ("slows down at the end", MM2 title). If too many onsets sit far from
  // the fitted grid, keep raw chip timing (the offline dumper's NO_SNAP,
  // automated). Bar labels stay approximate; the music stays true.
  const grid = 60 / bpm / 4 / frameSec; // frames per 16th
  let far = 0, timed = 0;
  for (const ev of events) {
    if (ev.channel === "noise" || ev.drum != null) continue;
    timed++;
    const ph = ev.startFrame % grid;
    if (Math.min(ph, grid - ph) > 1.6) far++;
  }
  const snap = far / Math.max(1, timed) < 0.12;
  const bytes = M.makeMidi(events, {bpm, tsNum: 4, tsDen: 4, frameSec, snap, ...CHIPS[kind || "nsf"].midiOpts(M)});
  const beatSec = 60 / bpm;
  const backBeats = loop ? (loop.keep - loop.period) * frameSec / beatSec : statedLoop != null ? statedLoop * frameSec / beatSec : 0;
  const bq = beats => { // beats-from-zero -> [bar, beat] on the 16th grid (4/4 until re-barred)
    const qb = Math.round(beats * 4) / 4;
    return [Math.floor(qb / 4) + 1, qb - Math.floor(qb / 4) * 4 + 1];
  };
  const loops = !!loop || statedLoop != null;
  return {bytes, bpm, secs: keptFrames * frameSec, looped: loops, snapped: snap,
          loopAnchor: loops && backBeats > 0.4 ? bq(keptFrames * frameSec / beatSec) : null,
          loopTarget: loops && backBeats > 0.4 ? bq(backBeats) : null};
}
async function openChipImport(kind, bytes, name, m3uList, files) {
  kind = kind || "nsf";
  const M = await chipModules(kind);
  const perFile = !!CHIPS[kind].perFile;
  let set = null, nsf;
  if (perFile) { // one file per track: parse them all, order the set, the first one names the album
    const parsedFiles = [], libs = {};
    for (const f of files || []) {
      if (CHIPS[kind].libFile && CHIPS[kind].libFile(f.name)) { libs[f.name.toLowerCase()] = f; continue; } // a set's shared library rides beside the songs, not as a row
      let parsed = null; try { parsed = CHIPS[kind].parseAsync ? await CHIPS[kind].parseAsync(M)(f.bytes, f.name) : CHIPS[kind].parse(M)(f.bytes); } catch (err) { parsed = null; }
      parsedFiles.push({name: f.name, bytes: f.bytes, parsed});
    }
    set = chipTrackOrder(parsedFiles.filter(f => f.parsed));
    var libFiles = libs;
    if (!set.length) { setInfo("⚠ none of those " + CHIPS[kind].label + " files could be read"); return; }
    const first = set[0].parsed;
    nsf = {name: first.game || name.replace(/\.[a-z0-9]+$/i, ""), artist: first.artist, songs: set.length};
  } else nsf = CHIPS[kind].parse(M)(bytes);
  S.nsfSess = {chip: kind, M, nsf, bytes: perFile ? null : bytes, set, libs: perFile ? libFiles : null, rows: []};
  document.getElementById("imptitle").textContent =
    ((nsf.name || name) + (nsf.artist && nsf.artist !== "<?>" ? " — " + nsf.artist : "")).toUpperCase();
  document.getElementById("impslug").value = slugify(nsf.name || name.replace(/\.(nsf|gbs|spc)$/i, ""));
  const list = document.getElementById("implist");
  list.innerHTML = "";
  // an m3u names the MUSIC tracks — an NSF like TMNT2 carries 120 slots of
  // which 95 are sound effects; with a playlist we list only the songs, in
  // album order, pre-named. Without one: every slot, as before. A per-file
  // set is its own list: one row per file, the tag's title, its tagged length.
  S.nsfSess.trackList = perFile
    ? set.map((f, i) => { const t = M.parseTrackName ? M.parseTrackName(f.name) : null; return {n: i + 1, title: f.parsed.name || (t && t.title) || f.name.replace(/\.[a-z0-9]+$/i, ""), len: f.parsed.tags && f.parsed.tags.seconds || 0}; })
    : m3uList && m3uList.length
    ? m3uList.filter(e => e.n >= 1 && e.n <= nsf.songs)
    : Array.from({length: nsf.songs}, (_, i) => ({n: i + 1, title: null}));
  for (const {n, title} of S.nsfSess.trackList) {
    const row = document.createElement("div");
    row.className = "row";
    const lbl = document.createElement("input"); // editable: type the real name once you recognize the tune
    lbl.type = "text";
    lbl.value = title || ("track-" + String(n).padStart(2, "0"));
    lbl.style.cssText = "flex:2 1 200px;min-width:160px;max-width:40%;min-height:32px;font-family:var(--mono);font-size:0.75rem"; // the name gets room but not the row: 150px cut tag titles, the first widening took too much (Josh, 2026-09-27, both)
    lbl.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); lbl.blur(); } });
    lbl.addEventListener("change", () => impRename(n));
    const st = document.createElement("span");
    st.className = "st";
    st.textContent = "—";
    st.addEventListener("click", () => { if (st.title) setInfo("ⓘ " + st.title.split("\n").join(" · ")); }); // touch has no tooltip: a tap shows the warnings in the footer
    const cap = document.createElement("button");
    cap.style.cssText = "min-height:32px;padding:4px 10px;flex:none";
    cap.textContent = "capture";
    cap.addEventListener("click", () => captureJobStart([n], impStatus)); // one row = a one-item job
    const open = document.createElement("button");
    open.style.cssText = "min-height:32px;padding:4px 10px;flex:none;display:none";
    open.textContent = "open";
    open.addEventListener("click", () => { // key pinned at capture time — slug edits later don't orphan it
      const k = S.nsfSess.rows[n] && S.nsfSess.rows[n].key;
      if (!k) return;
      stop();
      openDraft(k);
    });
    row.append(lbl, st, cap, open);
    list.appendChild(row);
    S.nsfSess.rows[n] = {name: lbl, st, open, cap, parsed: set ? set[n - 1].parsed : null, bytes: set ? set[n - 1].bytes : null};
  }
  document.getElementById("impall").textContent = "Capture all"; // fresh import, fresh verb
  if (m3uList && m3uList.length) setInfo(S.nsfSess.trackList.length + " songs listed from the playlist (of " + nsf.songs + " NSF slots) — names loaded.");
  const sheet = document.getElementById("importsheet");
  sheet.classList.add("on");
  requestAnimationFrame(() => {
    const w = sheet.offsetWidth;
    sheet.style.left = Math.max(6, (songRegionRight() - w) / 2) + "px";
    sheet.style.top = "56px";
  });
  // a timer-driven GBS runs PLAY at up to 4 kHz: same seconds, a longer emulation
  const libNames = set ? [...new Set(set.flatMap(f => f.parsed.libs || []))] : [];
  const missingLibs = libNames.filter(n => !(S.nsfSess.libs && S.nsfSess.libs[n.toLowerCase()]));
  const pace = kind === "gbs" ? (nsf.timerMode ? " · Game Boy, timer " + Math.round(nsf.playRateHz) + " Hz" : " · Game Boy") : kind === "spc" ? " · Super Nintendo (synth voices; no console audio yet)" : kind === "vgm" ? " · Genesis (synth voices; no console audio yet)" : kind === "psf" ? " · PlayStation (synth voices; no console audio yet)" + (missingLibs.length ? " — ⚠ pick the library file too: " + missingLibs.join(", ") : "") : kind === "psf2" ? " · PlayStation 2 (synth voices; no console audio yet)" + (missingLibs.length ? " — ⚠ pick the library file too: " + missingLibs.join(", ") : "") : kind === "usf" ? " · Nintendo 64 (synth voices; no console audio yet)" + (missingLibs.length ? " — ⚠ pick the library file too: " + missingLibs.join(", ") : "") : "";
  { const b = document.getElementById("impcommit"); b.textContent = publishLabel("kept tracks"); b.disabled = !publishDest(); }
  impStatus(nsf.songs + " tracks" + pace + " — Capture all, audition, then publish the keepers.");
}
function openNsfImport(bytes, name, m3uList) { return openChipImport("nsf", bytes, name, m3uList); }
const impStatus = s => {
  const err = /⚠|failed|error|can't|cannot/i.test(s);
  if (err) logErr(s);
  document.getElementById("impstatus").textContent = s;
  const cp = document.getElementById("impstatuscopy"); // read-only status line, easy to lose on the iPad — Copy when it's an error
  if (cp) {
    cp.style.display = err ? "" : "none";
    cp.onclick = ev => { ev.stopPropagation(); askCopyText(s, cp); };
  }
};
function renameImportDraft(oldKey, raw) { // returns the new key; null = name collision
  const base = slugify(raw);
  const dir = oldKey.slice(0, oldKey.lastIndexOf("/") + 1);
  const newKey = dir + base + ".mid";
  if (newKey !== oldKey && localStorage.getItem(draftStoreKey(newKey)) !== null) return null;
  if (newKey !== oldKey) {
    for (const pre of ["ff1roll-draft-", "ff1roll-notes-", "ff1roll-ts-", "ff1roll-edits-"]) {
      const v = localStorage.getItem(pre + oldKey);
      if (v !== null) { localStorage.setItem(pre + newKey, v); localStorage.removeItem(pre + oldKey); }
    }
    idbDraftMove(oldKey, newKey); // the notes follow the stub
    if (S.songKey === oldKey) { // renamed the song being auditioned — follow it
      S.songKey = newKey;
      S.currentPath = newKey;
      rememberLastSong(newKey);
      reflectSongURL(newKey);
      updateSongBtn();
    }
  }
  try { // the typed name (punctuation intact) rides the draft into Commit
    const d = JSON.parse(localStorage.getItem(draftStoreKey(newKey)));
    d.title = raw.trim();
    localStorage.setItem(draftStoreKey(newKey), JSON.stringify(d));
  } catch (err) { /* draft absent — nothing to title */ }
  return newKey;
}
async function impCapture(n, api, i) { // api/i: the capture job and this track's item, when run as one
  if (!S.nsfSess) return;
  const slug = slugify(document.getElementById("impslug").value) || "import";
  S.nsfSess.slug = slug; // the job's Open/↻ find this session by slug
  const item = patch => { if (api) api.update(i, patch); };
  let secs = Math.max(10, Math.min(300, +document.getElementById("impsecs").value || 75));
  // the playlist knows each track's length: size the capture to it (a 10s
  // jingle should not produce a 300s draft), and skip the 300s no-loop
  // retry for known-short jingles — they are through-composed by nature
  const meta = (S.nsfSess.trackList || []).find(e => e.n === n);
  const isJingle = meta && meta.len && meta.len <= 22;
  const tagged = !!CHIPS[S.nsfSess.chip || "nsf"].tagged;
  if (meta && meta.len) secs = tagged ? Math.max(12, Math.min(300, Math.ceil(meta.len + 1))) : Math.max(12, Math.min(300, Math.ceil(meta.len * 2.5 + 4)));
  const row = S.nsfSess.rows[n];
  row.st.textContent = "capturing…";
  row.open.style.display = "none";
  item({st: "running", pct: 0, msg: "capturing…"});
  await new Promise(r => setTimeout(r)); // let the label paint before the CPU burn
  // progress goes to the row (the panel may be hidden — it still exists) and
  // to the job (the ⏳ list, the mirror a reload reads); ✕ on the job aborts
  // at the next tick, inside the emulation
  const tick = (label) => p => {
    if (api && api.aborted) throw new Error("cancelled");
    if (p === "scan") { row.st.textContent = label + "detecting loop…"; item({msg: label + "detecting loop…"}); }
    else { row.st.textContent = label + "capturing… " + Math.round(p * 100) + "%"; item({pct: p, msg: label + "capturing…"}); }
  };
  const pct = tick("");
  try {
    const own = CHIPS[S.nsfSess.chip || "nsf"].capture; // a sequence reader (PSF) writes its MIDI itself
    let cap = own ? await own(S.nsfSess.M, row.parsed, secs, pct, S.nsfSess) : await captureChipTrack(S.nsfSess.chip, S.nsfSess.M, row.parsed || S.nsfSess.nsf, n, secs, pct);
    // the detector needs intro + TWO full passes in frame — a 35s loop with an
    // intro already busts 75s. No loop found? ONE retry straight at the 300s
    // ceiling (a doubling ladder just re-emulates the same song extra times)
    if (cap && !cap.looped && secs < 300 && !isJingle && !tagged && !own) {
      secs = 300;
      cap = await captureChipTrack(S.nsfSess.chip, S.nsfSess.M, row.parsed || S.nsfSess.nsf, n, secs, tick("no loop — 300s: "));
    }
    if (!cap) { row.st.textContent = "silent — nothing to keep"; item({st: "silent", msg: "silent"}); return; }
    let raw = row.name.value.trim() || "track-" + String(n).padStart(2, "0");
    let base = slugify(raw) || "track-" + String(n).padStart(2, "0");
    // two rows of THIS import with one title are two songs, not a mistake:
    // real rips name many different pieces alike (Ocarina of Time has 20
    // "Hyrule Field"s, Banjo-Kazooie 18 "Gruntilda's Lair"s). The old guard
    // failed the second one "name taken" and it was silently missing from
    // the album (49 songs across three games — docs/release-sweep-2026-09-29.md).
    // Number them instead: "Hyrule Field", "Hyrule Field (2)", …, by row
    // order, so a re-import names them the same way. A draft left by an
    // earlier import of the same album is still simply overwritten — that's
    // what re-importing means (Josh 2026-08-16).
    const dir = impDirFor(S.nsfSess.chip) + slug + "/";
    const taken = k => S.nsfSess.rows.some((r, j) => r && j !== n && r.key === k);
    if (taken(dir + base + ".mid")) {
      let i = 2;
      while (taken(dir + base + "-" + i + ".mid")) i++;
      base = base + "-" + i; raw = raw + " (" + i + ")";
    }
    const key = dir + base + ".mid";
    row.key = key;
    localStorage.removeItem("ff1roll-notes-" + key); // stale loop note dies with the old capture
    const parsed = parseMidi(cap.bytes.buffer, {trust: true}); // our own bytes: the corrupt-file guards (8-bar notes, 32-bar tacets) must not cut real music
    draftWrite(key, {
      savedStamp: 0, dirty: true, title: raw, capture: true, ppq: parsed.ppq, timesig: parsed.timesig || [4, 4], // capture: read-only wherever its folder sits
      tempos: parsed.tempos,
      tracks: parsed.tracks.map(tr => ({name: tr.name,
        ...(tr.offset ? {offset: tr.offset} : {}), // tools/sounding.mjs: the roll shows the sounding pitch — carried through so a tap keeps sounding right, and so commitImports' re-serialized .mid keeps it
        ...(tr.midiPan !== undefined ? {midiPan: tr.midiPan} : {}), // CC10 — the capture's own channel pan (open-items.md "FORMATS AUDIT" #1: commitImports used to drop this)
        notes: tr.notes.map(nt => {
          const o = {t: nt.t, d: nt.d, p: nt.p, v: nt.v};
          if (nt.ch !== undefined) o.ch = nt.ch; // noise rides ch 9 — dropping it made drums play as pitched tones
          if (nt.duty !== undefined) o.duty = nt.duty; // chip timbre (per-note duty) survives
          if (nt.ve !== undefined) o.ve = nt.ve; // decay target survives
          return o;
        })}))});
    { // capture-time annotations: the hardware loop point (same rule as the FF1
      // dumps) and, for sequence chips with no sound of their own, a soft voice
      // for pad tracks — every note 8+ quarters long, a handful of them — so a
      // held chord hums on a sine instead of buzzing on a saw (Josh, FF7 "You
      // Can Hear the Cry of the Planet": three detuned D2 drones, 2026-09-27)
      const anns = [];
      if (cap.loopAnchor) anns.push({b1: cap.loopAnchor[0], q1: cap.loopAnchor[1], b2: null, q2: null, text: "loop: " + cap.loopTarget[0] + "." + cap.loopTarget[1]});
      if (!CHIPS[S.nsfSess.chip || "nsf"].render) parsed.tracks.forEach((tr, ti) => {
        if (tr.notes.length && tr.notes.length <= 6 && tr.notes.every(x => x.d >= parsed.ppq * 8) && !tr.notes.some(x => x.ch === 9))
          anns.push({b1: 1, q1: 1, b2: null, q2: null, text: "track: tr" + (ti + 1) + " voice=sine"});
      });
      if (anns.length) localStorage.setItem("ff1roll-notes-" + key, JSON.stringify(anns));
    }
    row.secs = cap.secs; // chip-audio render length for this track
    if (chip.key === key) { chip.key = null; updateChipBtn(); } // re-capture invalidates rendered audio
    // NSF bytes + track number persist on this device so chip audio outlives
    // the session (never the repo — *.nsf is gitignored ROM music)
    if (S.nsfSess.bytes) idbNsfPut(slug, S.nsfSess.bytes, {[base]: {n, secs: cap.secs}}, S.nsfSess.chip);
    else if (row.bytes && CHIPS[S.nsfSess.chip || "nsf"].keepBytes) idbNsfPut(slug, null, {[base]: {n: 1, secs: cap.secs, bytes: row.bytes}}, S.nsfSess.chip); // a per-file set with a renderer: the track's own file rides in its entry (64 KB an .spc)
    if (S.nsfSess.libs && Object.keys(S.nsfSess.libs).length && S.nsfSess.libsStored !== slug) { // the set's shared library, once: chip audio after a reload needs it too
      const libs = {}; for (const [k, f] of Object.entries(S.nsfSess.libs)) libs[k] = f.bytes;
      S.nsfSess.libsStored = slug;
      idbNsfPut(slug, null, {}, S.nsfSess.chip, libs);
    }
    row.st.textContent = "✓ saved · " + cap.secs.toFixed(1) + "s · " + cap.bpm + "bpm · " +
                         (cap.looped ? "loop" : tagged ? "tagged length" : "no loop ≤" + secs + "s") +
                         (cap.snapped ? "" : " · raw timing (tempo shifts)") +
                         (cap.warnings && cap.warnings.length ? " · " + cap.warnings.length + " warning" + (cap.warnings.length === 1 ? "" : "s") + " (tap to read)" : ""); // "1 note" read as one musical note (Josh, 2026-09-27)
    if (cap.warnings && cap.warnings.length) { row.st.title = cap.warnings.join("\n"); console.log("[import] " + raw + ":\n" + cap.warnings.join("\n")); }
    row.open.style.display = "";
    row.cap.textContent = "↻"; // captured: tapping again re-runs and overwrites this draft
    row.cap.setAttribute("aria-label", "Re-capture this track");
    item({st: "done", pct: 1, msg: "", key});
    return true;
  } catch (err) {
    const cancelled = /cancelled/.test(err.message);
    row.st.textContent = cancelled ? "cancelled" : "failed: " + err.message;
    item({st: cancelled ? "cancelled" : "failed", msg: cancelled ? "" : err.message});
  }
  return false;
}
function captureJobStart(ns, statusFn) { // ns: track numbers to capture, in order
  if (!S.nsfSess) return null;
  const live = jobsFind("capture", null, true);
  if (live) { statusFn && statusFn("a capture is running: " + live.title + " " + jobProgress(live) + " — tap ⏳"); return null; }
  const slug = slugify(document.getElementById("impslug").value) || "import";
  S.nsfSess.slug = slug;
  const list = S.nsfSess.trackList || [];
  const items = ns.map(n => ({label: impTrackLabel(list.find(e => e.n === n)) || ("track " + n)}));
  return jobStart("capture", titleCaseSlug(slug), items, async api => {
    let saved = 0;
    for (let i = 0; i < ns.length; i++) {
      if (api.aborted) { for (let j = i; j < ns.length; j++) api.update(j, {st: "cancelled"}); api.cancel(); return; }
      statusFn && statusFn("capturing " + (i + 1) + "/" + ns.length + "… (close this panel any time — ⏳ in the footer keeps the progress)");
      if (await impCapture(ns[i], api, i)) saved++;
      if (api.aborted && api.job.items[i].st !== "done") { for (let j = i + 1; j < ns.length; j++) api.update(j, {st: "cancelled"}); api.cancel(); return; }
    }
    api.note(saved + " saved");
    statusFn && statusFn(saved + " track" + (saved === 1 ? "" : "s") + " saved as local drafts — folder \"" + titleCaseSlug(slug) + "\" in Open → LOCAL. Re-capturing overwrites them.");
  }, {slug, ns, chip: S.nsfSess.chip || "nsf"});
}
JOB_KINDS.capture = {
  label: j => "Capture · " + j.title,
  open: j => { // the panel, if this session is still the one; else say what a retry needs
    if (S.nsfSess && S.nsfSess.slug === j.slug) { document.getElementById("importsheet").classList.add("on"); return; }
    setInfo(j.title + ": " + jobProgress(j) + " — the files are no longer open; Import them again to continue (captured tracks are kept)");
  },
  retry: j => { // what is not done, in the same session; a re-import of the same set attaches by slug
    if (!(S.nsfSess && S.nsfSess.slug === j.slug)) { setInfo(j.title + ": Import the same files again, then Capture all — tracks already captured are skipped"); return; }
    const left = (j.ns || []).filter((n, i) => !(j.items[i] && j.items[i].st === "done"));
    if (!left.length) { setInfo(j.title + ": nothing left to capture"); return; }
    document.getElementById("importsheet").classList.add("on");
    captureJobStart(left, impStatus);
  },
};
function impRename(n) { // typed a name in a row: rename its captured draft in place
  const row = S.nsfSess && S.nsfSess.rows[n];
  if (!row) return;
  const raw = row.name.value.trim() || "track-" + String(n).padStart(2, "0");
  if (!row.key) return; // not captured yet — the name simply applies at capture time
  const newKey = renameImportDraft(row.key, raw);
  if (newKey === null) {
    impStatus("⚠ a captured track is already named \"" + slugify(raw) + "\" — pick another");
    row.name.value = row.key.split("/").pop().replace(/\.mid$/, "");
    return;
  }
  row.key = newKey;
  impStatus("renamed → " + newKey.split("/").pop());
}
document.getElementById("impall").addEventListener("click", e => {
  if (!S.nsfSess) return;
  const btn = e.currentTarget; // currentTarget nulls once the dispatch ends — grab it pre-await
  const list = S.nsfSess.trackList || [];
  // re-capture skips what this session already saved (Josh's rule: a re-run overwrites only what it captures)
  const ns = list.map(x => x.n);
  const job = captureJobStart(ns, impStatus);
  if (!job) return;
  btn.disabled = true;
  const off = jobsOnChange(() => {
    if (job.state === "running") { btn.textContent = "⏳ " + jobProgress(job).split(" · ")[0]; return; }
    btn.disabled = false; btn.textContent = "↻ Re-capture all"; off();
  });
});
document.getElementById("impclose").addEventListener("click", () =>
  document.getElementById("importsheet").classList.remove("on")); // captures live on as drafts
document.getElementById("impcommit").addEventListener("click", e => {
  const btn = e.currentTarget;
  const slug = S.nsfSess && S.nsfSess.slug;
  const job = publishJobStart(slug || null, slug ? importDraftKeys().filter(k => k.split("/")[2] === slug) : importDraftKeys(), impStatus);
  if (!job) return;
  btn.disabled = true;
  const off = jobsOnChange(() => { if (job.state === "running") return; off(); btn.disabled = false; });
});
async function computeImportAlbumJson(slug, h, songTitles, nsfTracks, chipKind, dir, libs) { // libs: [{name, file}] in the archive folder
  // album.json keeps build_manifest.mjs honest offline; NSF link = vault
  // file + track map (pure metadata — ROM data lives in the private
  // archive). GET current, merge, return content for the batch commit.
  const path = (dir || impDirFor(chipKind) + slug) + "/album.json";
  let meta = {title: titleCaseSlug(slug), order: 50, songs: {}};
  if (folderActive()) {
    const r = await readData("songs", path, true);
    if (r.ok) { try { meta = await r.json(); } catch (err) { /* rewrite */ } }
  } else {
    const g = await fetch(repoApi("songs") + path + "?ref=main", {headers: h, cache: "no-store"});
    if (g.ok) { // second batch into the same album: merge, don't clobber earlier titles
      try { meta = JSON.parse(decodeURIComponent(escape(atob((await g.json()).content.replace(/\n/g, ""))))); } catch (err) { /* rewrite */ }
    }
  }
  meta.songs = {...(meta.songs || {}), ...(songTitles || {})};
  if (nsfTracks && Object.keys(nsfTracks).length) {
    meta.nsf = meta.nsf || chipVaultMeta(slug, chipKind);
    meta.nsf.tracks = {...meta.nsf.tracks, ...nsfTracks};
    if (libs && libs.length) meta.nsf.libs = libs;
  }
  return {path, text: JSON.stringify(meta, null, 1) + "\n"};
}
// One commit for many files: blobs -> tree -> commit -> ref (Git Data API).
// The per-file Contents API made a commit (and a Pages build) per song —
// Josh's 46-file import took minutes and errored 30 Pages builds.
async function batchCommit(which, files, message, h, status) {
  if (folderActive()) { // the batch is just files: write each one
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      status("writing " + (i + 1) + "/" + files.length + ": " + f.path.split("/").pop() + "…");
      if (f.b64 !== undefined) {
        const bin = atob(f.b64);
        const bytes = new Uint8Array(bin.length);
        for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
        await folderWrite(f.path, bytes);
      } else await folderWrite(f.path, f.text);
    }
    return;
  }
  const api = "https://api.github.com/repos/" + repoName(which);
  const attempt = async () => {
    const refR = await fetch(api + "/git/ref/heads/main", {headers: h, cache: "no-store"});
    if (!refR.ok) throw apiError(which, refR, "ref");
    const baseSha = (await refR.json()).object.sha;
    const baseC = await (await fetch(api + "/git/commits/" + baseSha, {headers: h})).json();
    const tree = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      status("packing " + (i + 1) + "/" + files.length + ": " + f.path.split("/").pop() + "…");
      const br = await fetch(api + "/git/blobs", {method: "POST", headers: h,
        body: JSON.stringify(f.b64 !== undefined ? {content: f.b64, encoding: "base64"}
                                                 : {content: f.text, encoding: "utf-8"})});
      if (!br.ok) throw apiError(which, br, "blob " + f.path);
      tree.push({path: f.path, mode: "100644", type: "blob", sha: (await br.json()).sha});
    }
    status("committing " + files.length + " files in one commit…");
    const tr = await fetch(api + "/git/trees", {method: "POST", headers: h,
      body: JSON.stringify({base_tree: baseC.tree.sha, tree})});
    if (!tr.ok) throw apiError(which, tr, "tree");
    const cr = await fetch(api + "/git/commits", {method: "POST", headers: h,
      body: JSON.stringify({message, tree: (await tr.json()).sha, parents: [baseSha]})});
    if (!cr.ok) throw apiError(which, cr, "commit");
    const newSha = (await cr.json()).sha;
    const ur = await fetch(api + "/git/refs/heads/main", {method: "PATCH", headers: h,
      body: JSON.stringify({sha: newSha, force: false})});
    return {ok: ur.ok, retry: !ur.ok && (ur.status === 409 || ur.status === 422), r: ur};
  };
  let a = await attempt();
  if (!a.ok && a.retry) a = await attempt(); // someone pushed mid-flight: rebuild on the new tip
  if (!a.ok) throw apiError(which, a.r, "ref update");
}
 async function commitImports(status, keys) { // ONE commit for the whole batch
  keys = keys || importDraftKeys();
  if (!keys.length) { status("No import drafts to commit."); return; }
  const token = writeToken();
  if (!token) { status("No GitHub token stored yet — add one in File → Settings."); return; }
  const h = ghHeaders(token);
  try {
    const titles = {}, songFiles = [], analysisFiles = [], bridges = [];
    for (const key of keys) {
      const d = await draftRead(key);
      if (!d) throw new Error("draft missing on this device: " + key);
      const base = key.split("/").pop().replace(/\.mid$/, "");
      titles[key] = impDisplayTitle(d, base);
      songFiles.push({path: key,
        b64: midiBase64(writeMidi({ppq: d.ppq, timesig: d.timesig, ...(d.source ? {source: d.source} : {}), tempos: d.tempos, tracks: d.tracks}))});
      // P4 (docs/annotations-v2.md): stash the origin regardless of whether
      // this commit writes a .rollnotes.json below (no local notes yet) —
      // publishSong's originFor falls back to this for the song's first
      // EVER annotations publish, whenever that happens.
      const importOrigin = {kind: "import", at: new Date().toISOString()};
      setOrigin(key, importOrigin);
      let local = [];
      try { local = LINK_SONGS ? [] : JSON.parse(localStorage.getItem("ff1roll-notes-" + key) || "[]"); } catch (err) { /* none */ }
      if (local.length) {
        const stamp = Date.now();
        const content = serializeNotesList(local, 4, base, stamp, importOrigin);
        analysisFiles.push({path: key.replace(/\.mid$/, "") + ".rollnotes.json", text: content});
        bridges.push({key, stamp, content});
      }
    }
    const slugs = [...new Set(keys.map(k => k.split("/")[2]))];
    for (const slug of slugs) {
      const overrides = {}; // only names the filename can't spell need album.json
      for (const k of keys) {
        const base = k.split("/").pop().replace(/\.mid$/, "");
        if (k.split("/")[2] === slug && titles[k] !== titleCaseSlug(base)) overrides[base] = titles[k];
      }
      const rec = await idbNsfGet(slug);
      const nsfTracks = {};
      if (rec && rec.tracks) for (const k of keys) {
        const base = k.split("/").pop().replace(/\.mid$/, "");
        const t = rec.tracks[base];
        if (k.split("/")[2] === slug && t !== undefined) nsfTracks[base] = typeof t === "object" && t && t.bytes ? {n: t.n, secs: t.secs} : t; // the file itself never enters album.json
      }
      const chipKind = (rec && rec.chip) || "nsf", vaultFile = slug + chipExt(chipKind);
      const perFile = !!(CHIPS[chipKind] && CHIPS[chipKind].perFile);
      const trackFiles = perFile && rec && rec.tracks ? Object.entries(rec.tracks).filter(([b, t]) => nsfTracks[b] && t && t.bytes) : [];
      const dir = keys.find(k => k.split("/")[2] === slug).replace(/\/[^/]+\.mid$/, "");
      const libFiles = rec && rec.libs ? Object.entries(rec.libs).map(([name, bytes]) => ({name, file: slugify(name.replace(/\.[a-z0-9]+$/i, "")) + (name.match(/\.[a-z0-9]+$/i) || [""])[0].toLowerCase(), bytes})) : [];
      songFiles.push(await computeImportAlbumJson(slug, h, overrides, nsfTracks, chipKind, dir, libFiles.map(l => ({name: l.name, file: l.file}))));
      if (((rec && rec.bytes) || trackFiles.length) && !folderActive() && !cfg().nsfRepo) status("No game files & instruments repo in Settings → GitHub — the game files stay on this device (the game's own sound here; synth voices elsewhere). Settings → GitHub → create mine sets one up.");
      if (trackFiles.length && !folderActive() && cfg().nsfRepo) { // a per-file set: one archive file per track, only the ones not there yet
        let up = 0, failed = 0;
        for (const [b, t] of trackFiles) {
          const file = slug + "/" + b + chipExt(chipKind);
          try {
            const chk = await fetch(nsfURL(file) + "?t=" + Date.now(), {cache: "no-cache"});
            if (chk.ok) continue;
            status("Uploading " + CHIPS[chipKind].label + " " + (++up) + "/" + trackFiles.length + " to the archive…");
            const put = await fetch(repoApi("nsf") + file, {method: "PUT", headers: h, body: JSON.stringify({
              message: CHIPS[chipKind].label + " for " + slug + "/" + b + " (chip audio)", branch: "main",
              content: midiBase64(t.bytes instanceof Uint8Array ? t.bytes : new Uint8Array(t.bytes))})});
            if (!put.ok) throw new Error("HTTP " + put.status);
          } catch (err) { failed++; }
        }
        if (failed) status("⚠ " + failed + " " + CHIPS[chipKind].label + " upload" + (failed === 1 ? "" : "s") + " failed — chip audio for those stays device-local");
      }
      if (libFiles.length && !folderActive() && cfg().nsfRepo) { // the set's shared library, once per album (check-before-PUT: a second publish skips it)
        for (const l of libFiles) {
          const file = slug + "/" + l.file;
          try {
            const chk = await fetch(nsfURL(file) + "?t=" + Date.now(), {cache: "no-cache"});
            if (chk.ok) continue;
            status("Uploading the set's library " + l.file + " to the archive (" + Math.round(l.bytes.length / 1024) + " KB)…");
            const put = await fetch(repoApi("nsf") + file, {method: "PUT", headers: h, body: JSON.stringify({
              message: CHIPS[chipKind].label + " library for " + slug + " (chip audio)", branch: "main",
              content: midiBase64(l.bytes instanceof Uint8Array ? l.bytes : new Uint8Array(l.bytes))})});
            if (!put.ok) throw new Error("HTTP " + put.status);
          } catch (err) { status("⚠ library upload failed (" + err.message + ") — chip audio for this album stays device-local"); }
        }
      }
      if (rec && rec.bytes && !folderActive() && cfg().nsfRepo) { // folder mode: the chip file stays in this device's IndexedDB
        try { // chip file -> archive if it isn't publicly there yet
          const chk = await fetch(nsfURL(vaultFile) + "?t=" + Date.now(), {cache: "no-cache"});
          if (!chk.ok) {
            status("Uploading " + CHIPS[chipKind].label + " to the archive…");
            const put = await fetch(repoApi("nsf") + vaultFile, {
              method: "PUT", headers: h, body: JSON.stringify({
                message: CHIPS[chipKind].label + " for " + slug + " (chip audio)", branch: "main",
                content: midiBase64(rec.bytes instanceof Uint8Array ? rec.bytes : new Uint8Array(rec.bytes))})});
            if (!put.ok) throw new Error("HTTP " + put.status);
          }
        } catch (err) { status("⚠ " + CHIPS[chipKind].label + " upload failed (" + err.message + ") — chip audio stays device-local"); }
      }
      for (const d of Object.keys(albumMetaCache)) if (d.endsWith("/" + slug)) delete albumMetaCache[d];
    }
    let manifestNow = null; // the manifest as this publish writes it: the dropdown applies it directly (Pages serves the old one for a minute)
    if (!folderActive()) { // manifest: GET repo truth, apply the same mutation updateManifest would
      // (the folder has no manifest — initCatalog rescans it)
      const mg = await fetch(repoApi("songs") + "albums/manifest.json?ref=main", {headers: h, cache: "no-store"});
      if (!mg.ok) throw apiError("songs", mg, "manifest GET");
      const albums = JSON.parse(decodeURIComponent(escape(atob((await mg.json()).content.replace(/\n/g, "")))));
      manifestNow = albums;
      for (const k of keys) {
        manifestPlace(albums, null, k);
        const album = albums.find(a => a.title === albumTitleFor(k));
        const entry = album && album.songs.find(x => x.path === k);
        if (entry && titles[k]) entry.title = titles[k];
      }
      for (const a of albums) a.songs.sort((x, y) => x.title.localeCompare(y.title));
      songFiles.push({path: "albums/manifest.json", text: JSON.stringify(albums, null, 1) + "\n"});
    }
    const msg = "Import " + slugs.join(", ") + ": " + keys.length + " song" +
                (keys.length === 1 ? "" : "s") + " from Night Roll";
    if (repoName("songs") === repoName("analysis")) {
      await batchCommit("songs", songFiles.concat(analysisFiles), msg, h, status);
    } else { // split repos: one commit each
      await batchCommit("songs", songFiles, msg, h, status);
      if (analysisFiles.length) await batchCommit("analysis", analysisFiles, msg + " (annotations)", h, status);
    }
    for (const b of bridges)
      localStorage.setItem("ff1roll-lastsync-" + b.key, JSON.stringify({t: b.stamp, text: b.content}));
    for (const key of keys) { // repo owns them now; drafts + note stashes retire
      localStorage.removeItem(draftStoreKey(key));
      localStorage.removeItem("ff1roll-notes-" + key);
      if (key === S.songKey && S.song) S.song.savedStamp = Date.now();
    }
    // the site serves the OLD manifest for about a minute after the commit, so
    // initCatalog alone brought back a list without the album just published
    // (Josh, 2026-09-27: "I published Final Fantasy V … I don't see it in Open";
    // FF4 'worked' only because he looked later). Apply what we wrote, on top.
    const applyNow = () => { if (manifestNow) for (const a of manifestNow) S.CATALOG[a.title] = a.songs.map(x => [x.title, x.path]); };
    applyNow();
    await initCatalog().catch(() => { /* Pages lag; dropdown refreshes next boot */ });
    applyNow();
    updateSongBtn();
    updateSyncBtn();
    status("Published " + keys.length + " track" + (keys.length === 1 ? "" : "s") +
           " in one commit ✓ (Pages takes ~1 min to serve them).");
  } catch (err) { status("Publish failed: " + err.message); }
}
document.getElementById("fileimpcommit").addEventListener("click", e => {
  const btn = e.currentTarget;
  const job = publishJobStart(null, importDraftKeys(), fileStatus);
  if (!job) return;
  btn.disabled = true;
  const off = jobsOnChange(() => {
    if (job.state === "running") return;
    off();
    btn.disabled = false;
    const n = importDraftKeys().length;
    btn.style.display = n ? "" : "none";
    btn.textContent = publishLabel("import (" + n + ")");
  });
});
// ---- ONE publish function per song (Josh's ruling, 2026-09-30,
// docs/provenance-plan.md P2: "Publish all must behave exactly like
// publishing the open song — one publish function per song"). Both the
// Publish button (ghsave, below) and Publish all (publishAllJobStart) call
// this, for every song, open or not — it is the only place that writes a
// .mid or a .rollnotes.json for Publish. doc = the open song, after
// saveDraft flushes it to its draft (so both paths read the SAME shape back
// out of storage below) — or a not-open song's existing draft — or null for
// an analyzed song with no music draft to publish (annotations only; its
// .mid is never touched here, per Josh's ruling in the plan: captures and
// starters write their .mid once, at capture commit, never again).
async function publishSong(key, h, report) {
  report = report || (() => {});
  const isOpen = key === S.songKey && !!S.song;
  if (isOpen) {
    if (S.cmp && S.cmp.showing === "repo") throw new Error("You are hearing the published copy — switch back to your version first (the compare bar).");
    sweepStrandedClones(); // never publish invisible stacks
    saveDraft(false); // the open song's edits land in its draft, same as any other song's, before it's read back below
  }
  const hisMusic = isOpen ? isComposition() : isCompositionKey(key); // never local/ — it has no repo path to publish a .mid to (bakesTempo, playback-only, is the wider one)
  const notes = await annotationsFor(key); // repo file + local additions, tombstones subtracted (Bugs found: a tombstoned note republished)
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(draftStoreKey(key)) || "null"); } catch (err) { stored = null; }

  let doc = null;
  if (hisMusic && stored) {
    const d = await draftRead(key); // whole draft, notes included (tracksRef drafts read through to IndexedDB)
    if (d && d.tracks) {
      const ts = d.timesig || [4, 4];
      const resolved = notes.map(n => resolveNoteWith({...n}, d.ppq, ts)); // d's OWN meter — never the globally open song's
      doc = {ppq: d.ppq, timesig: d.timesig, ...(d.source ? {source: d.source} : {}),
             tempos: bakeTempos(d.tempos, resolved, d.ppq), // d.tempos is the un-baked base (draftDoc's convention) — baked fresh every publish, never accumulated, so removing a tempo: note removes its baked event
             // Q9 (docs/provenance-plan.md): a declared meter bakes wherever
             // tempo bakes. Base = d's OWN [num,den] as a one-event list (the
             // file's own label, or his declared default on a fresh
             // composition — "one meter per song" today, so that's always
             // the whole un-baked base); bakeMeter returns it UNCHANGED when
             // there's no timesig: note (Q6: an import's own label written
             // back verbatim), or the declared meter's event otherwise —
             // baked fresh every publish, never accumulated, same as tempo.
             ...(bakesMeter(key) ? {timesigs: bakeMeter([{tick: 0, num: ts[0], den: ts[1]}], resolved)} : {}),
             tracks: d.tracks.map(tr => ({name: tr.name,
               ...(tr.midiPan !== undefined ? {midiPan: tr.midiPan} : {}),
               ...(tr.offset ? {offset: tr.offset} : {}),
               ...(tr.srcIndex !== undefined ? {srcIndex: tr.srcIndex} : {}), // docs/declared-vs-learner-spec.md phase 2: how source.metas reattaches after edits
               notes: tr.notes.map(n => ({...n}))}))};
    }
  }

  let wroteMid = false, midSig = null;
  const stamp = Date.now();
  if (doc) {
    midSig = musicSig(doc); // now includes the baked tempo map: a tempo-only change republishes (Bugs found)
    if (!stored.midSig || stored.midSig !== midSig) { // never published, or music/baked-tempo changed since
      report("writing the .mid…");
      const r1 = await putMidAt(key, h, writeMidi(doc));
      if (!r1.ok) throw new Error(".mid HTTP " + r1.status);
      wroteMid = true;
    }
  }

  const beats = isOpen ? beatsPerBarDisp() : ((declaredTsForKey(key) || [4])[0]);
  const base = key.replace(/\.midi?$/i, ""), title = base.split("/").pop();
  // P4 (docs/annotations-v2.md): the v2 header's origin — whatever's already
  // on disk for this song (never re-derived once set), else what this
  // device stashed at creation (fork/move/composition never yet published)
  const content = serializeNotesList(notes, beats, title, stamp, originFor(key, notes));
  report("publishing annotations…");
  const r2 = await putRollnotes(base + ".rollnotes.json", content, h);
  if (!r2.ok) throw new Error(".rollnotes.json HTTP " + r2.status);

  if (hisMusic && doc) {
    const r3 = await putSongsText(base + ".notes.txt", notesTxtFor(doc, key), h);
    if (!r3.ok) throw new Error(".notes.txt HTTP " + r3.status);
  }

  await askCommitLog(h, isOpen ? undefined : key, hisMusic); // the ✦ AI chat since the last save, appended to <song>.ask.md

  if (hisMusic) await uploadAudioClipsFor(key, notes, h, report); // recordings ride along, next to the .mid; "local" ones never (Bugs found: Publish all skipped this for a not-open song)
  if (wroteMid) await updateManifest(h, albums => manifestPlace(albums, null, key));
  if (hisMusic && doc) { if (isOpen) await filesMirror(); else await filesMirrorFor(key, doc, content).catch(() => {}); } // the iPad app: the Files copy follows every Publish, not just the open song's (Bugs found)

  markPublished(key, stamp, content, {midSig: doc ? midSig : undefined});
  return {wroteMid};
}
document.getElementById("filesave").addEventListener("click", () => {
  // one door for both modes (Josh, 2026-08-18): Save opens the sync sheet, which
  // shows pending annotations; its commit button pushes what the mode owns —
  // compositions: .mid + annotations together; analyzed songs: annotations only
  if (!S.song) return;
  closeFileMenus();
  openSyncSheet();
});
// clips are addressed only by filename — audioDirFor(key) derives WHERE they
// live from the song's own key, so a moved song's clips must physically move
// with it or every audio: reference resolves against an empty new directory
// (Bugs found 2026-09-30, moveComposition — the clip stayed at the old dir).
// Runs after publishSong, which may already have uploaded a locally-held clip
// straight to the new path (from this device's IndexedDB, via renameLocal's
// idbAudioMove) — skip those, never double-upload. Must throw on any failure
// BEFORE the caller's delete loop runs: the old clips are never removed out
// from under a song that still needs them (same "old song stays whole" rule
// as the publishSong failure path above).
async function copyAudioClips(oldKey, newKey, h, report) {
  const files = await audioDirFiles(oldKey, h);
  for (const file of files) {
    try {
      const there = await readData("songs", audioDirFor(newKey) + "/" + file, true);
      if (there.ok) continue; // publishSong's uploadAudioClipsFor already put this one at the new path
    } catch (err) { /* not there yet — copy it below */ }
    const src = await readData("songs", audioDirFor(oldKey) + "/" + file, true);
    if (!src.ok) throw new Error(file + ": couldn't read the clip to copy it");
    const bytes = new Uint8Array(await src.arrayBuffer());
    report((folderActive() ? "writing " : "uploading ") + file + " (" + (bytes.length / 1e6).toFixed(1) + " MB)…");
    const r = await putMidAt(audioDirFor(newKey) + "/" + file, h, bytes); // same PUT shape: any bytes
    if (!r.ok) throw new Error(file + " HTTP " + r.status);
  }
  return files; // every clip that was at the old dir — the caller's delete loop removes them all next
}
async function moveComposition(destDir) {
  const oldKey = S.songKey;
  const newKey = destDir + oldKey.split("/").pop();
  if (newKey === oldKey) { fileStatus("Already there."); return; }
  // version guard (docs/annotations-v2.md P3): a Move republishes the
  // annotations at the new path (annotationsFor would refuse this itself,
  // below — checked here too, early, so the failure shows a clear message
  // instead of a silently-rejected promise)
  if (S.rollnotesReadOnly) { fileStatus(S.rollnotesLockReason || ROLLNOTES_LOCK_MSG); return; }
  // Leaving nightroll/ loses the by-directory editability, so the song
  // carries its provenance with it (the draft rename below is device-local).
  // P4 (docs/annotations-v2.md, Q8): movedFrom goes in the v2 header now,
  // not a "moved from <path>" note — kind is kept as-is (a moved copy is
  // still a copy, a moved composition still a composition); only the FIRST
  // move out of nightroll/ is recorded, same as the note it replaces never
  // got overwritten by a later move either.
  if (oldKey.startsWith(NR_DIR) && !(S.rollnotesOrigin && S.rollnotesOrigin.movedFrom)) {
    S.rollnotesOrigin = {...(S.rollnotesOrigin || {kind: originOf(oldKey)}), movedFrom: oldKey, at: new Date().toISOString()};
    setOrigin(oldKey, S.rollnotesOrigin); // rides to newKey with every other per-song local key (renameLocalKeys, below)
  }
  const token = writeToken();
  const renameLocal = () => renameLocalKeys(oldKey, newKey); // every per-song key rides along
  if (!catalogHas(oldKey)) { // never published: the move is this device's alone; Publish will use the new path
    renameLocal();
    fileStatus("Moved to " + folderTitle(folderOf(newKey)) + ".");
    return;
  }
  if (!token) { // no token: draft-only move on this device
    renameLocal();
    fileStatus("Moved locally (draft only — no token stored; add one in File → Settings to enable repo moves).");
    return;
  }
  fileStatus("Moving to " + destDir + "…");
  try {
    const h = ghHeaders(token);
    // publishSong reads annotations from DISK at the given key (plus this
    // device's still-local additions) — the same merge for every song, open
    // or not. The old path's disk file is about to disappear from under it,
    // so snapshot its current, already-tombstone-filtered note set now,
    // while it's still readable at oldKey — otherwise a move would silently
    // drop every already-published annotation that wasn't still locally
    // pending (Bugs found in this refactor: annotationsFor(newKey) finds
    // nothing on disk at a path nothing has ever been published to yet).
    const priorNotes = await annotationsFor(oldKey);
    const origLocalNotes = localStorage.getItem("ff1roll-notes-" + oldKey); // restored verbatim if the publish below fails
    // every per-song key (draft, local notes, tombstones, midSig) rides to
    // newKey FIRST, so publishSong below is publishing the open song at its
    // new path — one publish function, no hand-written writes here (Josh's
    // ruling: a moved song is byte-identical to publishing it at the new path)
    renameLocal();
    // seed newKey's local-additions bucket with the COMPLETE snapshot above
    // (overwriting whatever renameLocal() just carried over, which was only
    // ever the still-unsynced subset) — mergeLocalAdditions re-derives each
    // one the same way a genuine unsynced note would be, so annotationsFor
    // (newKey) inside publishSong reproduces the full set.
    const seed = priorNotes.map(n => ({b1: n.b1, q1: n.q1, b2: n.b2, q2: n.q2, text: n.text,
      section: n.section || undefined, chord: n.chord || undefined, cnote: n.cnote || undefined, keydir: n.keydir}));
    if (seed.length) localStorage.setItem("ff1roll-notes-" + newKey, JSON.stringify(seed));
    else localStorage.removeItem("ff1roll-notes-" + newKey);
    try {
      const d = JSON.parse(localStorage.getItem(draftStoreKey(newKey)) || "null");
      // the rename carried the OLD path's midSig along; left alone,
      // publishSong would see "already matches" and skip writing the .mid
      // at newKey, leaving the move mid-less. Clearing it makes publishSong
      // treat the .mid as never-written here.
      if (d && d.midSig !== undefined) { delete d.midSig; localStorage.setItem(draftStoreKey(newKey), JSON.stringify(d)); }
    } catch (err) { /* no draft to clear */ }
    let clipFiles = [];
    try {
      await publishSong(newKey, h, m => fileStatus(m));
      clipFiles = await copyAudioClips(oldKey, newKey, h, m => fileStatus(m)); // clips ride along — still before any old file is deleted
    } catch (err) {
      renameLocalKeys(newKey, oldKey); // failed before any delete — the old files (and clips) are intact; undo the rename so the device still points at a path that has them
      // renameLocalKeys just carried the FULL snapshot back under "ff1roll-notes-" + oldKey (it followed the "ff1roll-notes-" prefix); oldKey's own disk file already had the ones that weren't local-only, so put back exactly what was there before this attempt, not the superset
      if (origLocalNotes === null) localStorage.removeItem("ff1roll-notes-" + oldKey); else localStorage.setItem("ff1roll-notes-" + oldKey, origLocalNotes);
      throw err;
    }
    // a delete that silently fails is how a Move becomes two copies of a song
    const left = [];
    for (const p of [oldKey,
                     oldKey.replace(/\.mid$/, ".rollnotes.json"),
                     oldKey.replace(/\.mid$/, ".notes.txt"),
                     oldKey.replace(/\.mid$/, ".rollnotes"), // last one: legacy, if any
                     ...clipFiles.map(f => audioDirFor(oldKey) + "/" + f)]) {
      if (!await deleteRepoFile(p, h)) left.push(p.split("/").pop());
    }
    await updateManifest(h, albums => manifestPlace(albums, oldKey, newKey));
    await initCatalog().catch(() => {});
    updateSongBtn();
    fileStatus(left.length
      ? "Moved → " + newKey + " — but the old copy could NOT be removed (" +
        left.join(", ") + "). Both paths now exist; clean up in the repo."
      : "Moved ✓ → " + newKey);
  } catch (err) { fileStatus("Move failed: " + err.message); }
}
{ // velocity slider: pencil loudness always; with a selection it LIVE-adjusts
  // those notes while dragging and commits ONE undo step on release
  const slider = document.getElementById("velslider"), val = document.getElementById("velval");
  let velSnap = null; // pre-gesture values for the undo entry
  slider.addEventListener("input", () => {
    const v = parseInt(slider.value, 10);
    val.textContent = v;
    S.pencilVel = v;
    if (S.mode !== "select" || !editableSong()) return;
    const items = selEditItems();
    if (!items.length) return;
    if (!velSnap) velSnap = items.map(({ti, ni, n}) => ({ti, ni, t: n.t, d: n.d, p: n.p, v: n.v}));
    for (const it of items) it.n.v = v;
    draw(); // brightness tracks the drag
  });
  slider.addEventListener("change", () => {
    if (!velSnap) return;
    const items = selEditItems();
    if (items.length) {
      selEditApply(items, () => {}, velSnap);
      setInfo("set " + items.length + " note" + (items.length === 1 ? "" : "s") + " to velocity " + slider.value);
    }
    velSnap = null;
  });
}
document.getElementById("copybtn").addEventListener("click", () => {
  const k = copySelection();
  if (!k) { setInfo("nothing selected — lasso or tap notes first"); return; }
  setInfo("copied " + clipSummary() + " — move the cursor anywhere, Paste puts them there");
  updateEditButtons();
});
const DP_PIECES = [["hat", 42], ["snare", 38], ["kick", 36]];  // [piece][step] booleans, rebuilt when meter/grid changes
function dpSteps() { return effTs()[0] * parseInt(document.getElementById("dpdiv").value, 10); }
function dpDefault() { // a sane backbeat for the current meter: kick on 1 (+mid), snare on the even beats, hat everywhere
  const beats = effTs()[0], div = parseInt(document.getElementById("dpdiv").value, 10), n = beats * div;
  const kick = Array(n).fill(false), snare = Array(n).fill(false), hat = Array(n).fill(true);
  kick[0] = true;
  if (beats >= 4) kick[Math.floor(beats / 2) * div] = true;
  for (let b = 1; b < beats; b += 2) snare[b * div] = true;
  return [hat, snare, kick]; // same order as DP_PIECES
}
function dpRender() {
  const n = dpSteps(), div = parseInt(document.getElementById("dpdiv").value, 10);
  if (!S.dpPattern || S.dpPattern[0].length !== n) S.dpPattern = dpDefault();
  const g = document.getElementById("dpgrid");
  g.innerHTML = "";
  DP_PIECES.forEach(([name], pi) => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:3px;align-items:center;margin-top:6px";
    const lb = document.createElement("span");
    lb.className = "lbl";
    lb.style.cssText = "width:44px;flex:none";
    lb.textContent = name;
    row.appendChild(lb);
    for (let i = 0; i < n; i++) {
      const c = document.createElement("button");
      c.style.cssText = "flex:1;min-width:0;min-height:40px;padding:0;border-radius:5px;" +
        (i % div === 0 ? "border-width:2px;" : "opacity:.9;");
      c.classList.toggle("primary", S.dpPattern[pi][i]);
      c.textContent = i % div === 0 ? String(i / div + 1) : "·";
      c.addEventListener("click", () => { S.dpPattern[pi][i] = !S.dpPattern[pi][i]; dpRender(); });
      row.appendChild(c);
    }
    g.appendChild(row);
  });
}
document.getElementById("dpdiv").addEventListener("change", dpRender);
function dpBuildBeatSelects() { // bar typed (fills extend past the song's end), beat+sub picked
  const beats = effTs()[0];
  for (const id of ["dpfromq", "dptoq"]) {
    const sel = document.getElementById(id);
    sel.innerHTML = "";
    for (let b = 1; b <= beats; b++) {
      const o = document.createElement("option");
      o.value = String(b); o.textContent = String(b);
      sel.appendChild(o);
    }
  }
  for (const id of ["dpfroms", "dptos"]) {
    const sel = document.getElementById(id);
    sel.innerHTML = "";
    for (const [f, syl] of [[0, "·"], [0.25, "e"], [0.5, "&"], [0.75, "a"]]) {
      const o = document.createElement("option");
      o.value = String(f); o.textContent = syl;
      sel.appendChild(o);
    }
  }
}
document.getElementById("drumfillbtn").addEventListener("click", () => {
  if (!editableSong()) { setInfo("drum fills work on your own songs — captures are locked"); return; }
  dpBuildBeatSelects();
  const bt = barTicks(), qt = beatTicks();
  document.getElementById("dpfromb").value = Math.floor(S.playCursor / bt) + 1; // cursor's exact spot
  const q = snapBeat((S.playCursor % bt) / qt + 1);
  document.getElementById("dpfromq").value = String(Math.floor(q + 0.03));
  document.getElementById("dpfroms").value = String(Math.round((q - Math.floor(q + 0.03)) * 4) / 4);
  document.getElementById("dptob").value = Math.floor(S.playCursor / bt) + 5;
  document.getElementById("dptoq").value = "1";
  document.getElementById("dptos").value = "0";
  dpRender();
  document.getElementById("drumsheet").classList.add("on");
});
document.getElementById("dpfill").addEventListener("click", () => {
  let di = S.song.tracks.findIndex((_, ti) => trackIsDrums(ti));
  const madeTrack = di < 0, undoLen = S.editUndo.length;
  if (madeTrack) { // no kit yet: create one
    di = addTrackUndoable({name: "drums", notes: []});
    saveDraft(); // the chip path saves; this path silently lost the track on reload
    renderTrackbar();
  }
  const startTick = dpTick("dpfromb", "dpfromq", "dpfroms");
  const endTick = Math.max(startTick + barTicks(), dpTick("dptob", "dptoq", "dptos"));
  const div = parseInt(document.getElementById("dpdiv").value, 10);
  const step = Math.round(beatTicks() / div), bt = barTicks();
  const tr = S.song.tracks[di], isAdd = !isComposition();
  const added = [];
  const passes = Math.ceil((endTick - startTick) / bt); // pattern phase starts AT the from point
  for (let pass = 0; pass < passes; pass++) {
    for (let pi = 0; pi < DP_PIECES.length; pi++) {
      for (let i = 0; i < S.dpPattern[pi].length; i++) {
        if (!S.dpPattern[pi][i]) continue;
        const t = startTick + pass * bt + i * step;
        if (t >= endTick) continue;
        const p = DP_PIECES[pi][1];
        if (tr.notes.some(n => !n.gone && n.t === t && n.p === p)) continue; // don't stack over an existing hit
        tr.notes.push({t, d: Math.max(30, Math.round(step / 2)), p, v: S.pencilVel, added: isAdd});
        if (S.song.rawNotes) S.song.rawNotes[di].push({t: t + S.chopS, d: Math.max(30, Math.round(step / 2)), p, v: S.pencilVel, added: isAdd});
        added.push({ti: di, ni: tr.notes.length - 1});
      }
    }
  }
  if (added.length) {
    pushUndo({kind: "addBatch", items: added});
  if (madeTrack) undoTrackAdd(di, undoLen); // the new kit leaves with its fill
    saveEdits();
    computeSongEnd();
    if (S.viewMode === "score") buildScoreModel();
    S.view.y = 1e9; // the kit lane hangs below the pitch rows — scroll it into view,
    clampView();  // or a first fill looks like nothing happened (Josh)
    draw();
  }
  document.getElementById("drumsheet").classList.remove("on");
  setInfo(added.length ? "filled " + added.length + " drum hits from bar " + (Math.floor(startTick / barTicks()) + 1) + " (one undo undoes the fill)"
                       : "nothing to fill — pattern is empty or those hits already exist");
});

 document.getElementById("bassistbtn").addEventListener("click", openBassist);
document.getElementById("bsgen").addEventListener("click", () => {
  const r = bsRange();
  let targetTi = document.getElementById("bstarget").value;
  const madeTrack = targetTi === "new", undoLen = S.editUndo.length;
  if (madeTrack) {
    targetTi = addTrackUndoable({name: "bass", notes: []});
    saveDraft();
    renderTrackbar();
    // rebuild the pickers so the new track is selectable next time
    const tsel = document.getElementById("bstarget");
    const o = document.createElement("option"); o.value = String(targetTi); o.textContent = "bass";
    tsel.insertBefore(o, tsel.lastElementChild);
    tsel.value = String(targetTi);
  } else targetTi = parseInt(targetTi, 10);
  const fv = document.getElementById("bsfollow").value;
  const opts = {
    style: segGet("bsstyle"), busy: parseInt(segGet("bsbusy"), 10) || 3,
    oct: parseInt(segGet("bsoct"), 10) || 2,
    follow: fv, targetTi,
    fromBar: r.from, toBar: r.to, t0: r.t0, t1: r.t1,
  };
  const seed = (Math.random() * 0xFFFFFFFF) >>> 0;
  const k = bsGenerate(seed, opts);
  if (madeTrack) undoTrackAdd(targetTi, undoLen); // the new bass track is part of the same undo step
  if (!k) { bsRefresh(); return; }
  S.bsTakes.push({seed, opts, style: opts.style, busy: opts.busy, oct: opts.oct,
                followSel: fv, targetTi,
                from: parseInt(document.getElementById("bsfrom").value, 10) || 1,
                to: parseInt(document.getElementById("bsto").value, 10) || 1,
                q: [getBeatPair("bsfromq", "bsfroms"), getBeatPair("bstoq", "bstos")]});
  if (S.bsTakes.length > 8) S.bsTakes.shift();
  S.bsActive = S.bsTakes.length - 1;
  bsRefresh();
  setInfo("take " + S.bsTakes.length + ": " + k + " bass notes in " + fmtBarBeat(r.t0) + "–" + fmtBarBeat(r.t1) + " (one undo restores what was there)");
});
for (const id of ["bsfrom", "bsto"]) document.getElementById(id).addEventListener("input", bsRefresh);
for (const id of ["bsfromq", "bsfroms", "bstoq", "bstos", "bstarget", "bsfollow"]) document.getElementById(id).addEventListener("change", bsRefresh);
function segGet(id) { const a = document.querySelector("#" + id + " button.active"); return a ? a.dataset.v : null; }
document.getElementById("drgen").addEventListener("click", () => {
  const r = drRange();
  const opts = {
    busy: parseInt(segGet("drbusy"), 10) || 3,
    hard: parseInt(segGet("drhard"), 10) || 3,
    fillAmt: (v => isNaN(v) ? 3 : v)(parseInt(segGet("drfills"), 10)),
    parts: drPartsGet(),
    follow: (v => v.startsWith("t") ? "bass" : v)(document.getElementById("drfollow").value),
    followTi: (v => v.startsWith("t") ? parseInt(v.slice(1), 10) : undefined)(document.getElementById("drfollow").value),
    feel: segGet("drfeel"),
    fromBar: r.from, toBar: r.to, t0: r.t0, t1: r.t1,
  };
  if (!opts.parts.length) { setInfo("pick at least one part"); return; }
  const seed = (Math.random() * 0xFFFFFFFF) >>> 0; // the ONLY nondeterminism; takes replay it exactly
  const k = drGenerate(seed, opts);
  if (!k) { drRefresh(); return; }
  S.drTakes.push({seed, ...opts,
                from: parseInt(document.getElementById("drfrom").value, 10) || 1,
                to: parseInt(document.getElementById("drto").value, 10) || 1,
                q: [getBeatPair("drfromq", "drfroms"), getBeatPair("drtoq", "drtos")]});
  if (S.drTakes.length > 8) S.drTakes.shift();
  S.drActive = S.drTakes.length - 1;
  drRefresh();
  setInfo("take " + S.drTakes.length + ": " + k + " hits in " + fmtBarBeat(r.t0) + "–" + fmtBarBeat(r.t1) + " (one undo restores what was there)");
});
for (const id of ["drfrom", "drto"]) document.getElementById(id).addEventListener("input", drRefresh);
for (const id of ["drfromq", "drfroms", "drtoq", "drtos", "drfollow"]) document.getElementById(id).addEventListener("change", drRefresh);
document.getElementById("drummerbtn").addEventListener("click", openDrummer);
document.getElementById("movebtn").addEventListener("click", () => {
  if (!editableSong()) { setInfo("editing works on your own songs — captures are locked"); return; }
  const box = document.getElementById("mvtracks");
  box.innerHTML = S.song.tracks.map((tr, ti) =>
    '<button data-mv="' + ti + '" style="min-height:44px"' + (ti === S.selTrack ? ' class="primary"' : '') + '>' +
    (tr.name || "track " + (ti + 1)) + '</button>').join("");
  // selection spanning several tracks (unison doubles): offer a source filter,
  // so Josh moves ONLY pulse2's copy instead of both (2026-08-18)
  S.mvFromFilter = null;
  const counts = new Map();
  for (const {ti} of selEditItems()) counts.set(ti, (counts.get(ti) || 0) + 1);
  const fromRow = document.getElementById("mvfromrow"), from = document.getElementById("mvfrom");
  if (counts.size > 1) {
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    from.innerHTML = '<button data-mf="all" class="primary" style="min-height:44px">all (' + total + ')</button>' +
      [...counts.entries()].map(([ti, n]) =>
        '<button data-mf="' + ti + '" style="min-height:44px">' +
        (S.song.tracks[ti].name || "track " + (ti + 1)) + " (" + n + ")</button>").join("");
    fromRow.style.display = "";
  } else fromRow.style.display = "none";
  document.getElementById("movesheet").classList.add("on");
});
document.getElementById("mvfrom").addEventListener("click", e => {
  const b = e.target.closest("button[data-mf]");
  if (!b) return;
  S.mvFromFilter = b.dataset.mf === "all" ? null : +b.dataset.mf;
  for (const x of document.querySelectorAll("#mvfrom button")) x.classList.toggle("primary", x === b);
});
document.getElementById("mvtracks").addEventListener("click", e => {
  const b = e.target.closest("button[data-mv]");
  if (!b) return;
  const k = moveSelectionToTrack(+b.dataset.mv);
  document.getElementById("movesheet").classList.remove("on");
  setInfo(k ? "moved " + k + " note" + (k === 1 ? "" : "s") + " to " + (S.song.tracks[+b.dataset.mv].name || "track")
            : "select notes first (lasso or tap), then ⇄");
});
document.getElementById("mvdedupe").addEventListener("click", () => {
  const k = dedupeSong();
  document.getElementById("movesheet").classList.remove("on");
  setInfo(k ? "removed " + k + " duplicate note" + (k === 1 ? "" : "s") + " — SAVE to make it stick (undo restores them)"
            : "no duplicates found anywhere");
});
function openPasteTo() {
  if (!editableSong()) { setInfo("paste works on your own songs — captures are locked"); return; }
  if (!clipboardHas()) { setInfo("nothing copied yet — select notes and tap Copy (or ⌘C) first"); return; }
  S.ptTarget = S.selTrack;
  const box = document.getElementById("pttracks");
  box.innerHTML = S.song.tracks.map((tr, ti) =>
    '<button data-pt="' + ti + '" style="min-height:44px"' + (ti === S.ptTarget ? ' class="primary"' : '') + '>' +
    (tr.name || "track " + (ti + 1)) + '</button>').join("");
  document.getElementById("pastesheet").classList.add("on");
}
document.getElementById("pttracks").addEventListener("click", e => {
  const b = e.target.closest("button[data-pt]");
  if (!b) return;
  S.ptTarget = +b.dataset.pt;
  for (const x of document.querySelectorAll("#pttracks button")) x.classList.toggle("primary", +x.dataset.pt === S.ptTarget);
});
document.getElementById("ptgo").addEventListener("click", () => {
  const oct = parseInt(document.getElementById("ptoct").value, 10) || 0;
  const semi = Math.max(-24, Math.min(24, parseInt(document.getElementById("ptsemi").value, 10) || 0));
  const k = pasteClipboard(S.playCursor, {ti: S.ptTarget, dP: oct * 12 + semi});
  if (!k) { setInfo("nothing landed — every note was already there or shifted off the roll"); return; }
  S.selTrack = S.ptTarget; renderTrackbar(); draw();
  document.getElementById("pastesheet").classList.remove("on");
  const shift = (oct ? (oct > 0 ? "+" : "") + oct + " oct" : "") + (semi ? (oct ? " " : "") + (semi > 0 ? "+" : "") + semi + " st" : "");
  setInfo("pasted " + k + " note" + (k === 1 ? "" : "s") + " onto " + (S.song.tracks[S.ptTarget].name || "track") + (shift ? " (" + shift + ")" : "") + " — selected, cursor at their end");
});
document.getElementById("pastebtn").addEventListener("click", () => {
  if (!editableSong()) { setInfo("paste works on your own songs — captures are locked"); return; }
  const k = pasteClipboard(S.playCursor); // pastes the last ⧉/⌘C copy — surviving any scrolling
  setInfo(k ? "pasted " + clipSummary() + " — cursor moved to their end, paste again to chain"
            : "nothing copied yet — select notes and tap Copy (or ⌘C) first");
});
document.getElementById("octupbtn").addEventListener("click", () => {
  if (nudgeSelection(0, 12)) setInfo("selection up an octave (undo undoes)");
  else setInfo("nothing selected — lasso or tap notes first");
});
document.getElementById("octdownbtn").addEventListener("click", () => {
  if (nudgeSelection(0, -12)) setInfo("selection down an octave (undo undoes)");
  else setInfo("nothing selected — lasso or tap notes first");
});
// ⋯ folds the less-used tools (Josh, 2026-08-22: pencil mode wrapped the row)
{
  const wrap2 = document.getElementById("morewrap");
  const open = localStorage.getItem("ff1roll-editmore") === "1";
  wrap2.style.display = open ? "inline-flex" : "none";
  document.getElementById("morebtn").classList.toggle("active", open);
  document.getElementById("morebtn").addEventListener("click", () => {
    const on = wrap2.style.display === "none";
    wrap2.style.display = on ? "inline-flex" : "none";
    document.getElementById("morebtn").classList.toggle("active", on);
    localStorage.setItem("ff1roll-editmore", on ? "1" : "0");
  });
}
document.getElementById("trbtn").addEventListener("click", () => {
  if (!selEditItems().length) { setInfo("select notes first — then ⇅ transposes them"); return; }
  const row = document.getElementById("trchips");
  if (!row.children.length) {
    const mk = (label, fn) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = "flex:1;min-height:44px";
      b.addEventListener("click", fn);
      row.appendChild(b);
    };
    mk("−2", () => nudgeSelection(0, -2) && setInfo("down a whole step (chromatic)"));
    mk("−1", () => nudgeSelection(0, -1) && setInfo("down a half step"));
    mk("+1", () => nudgeSelection(0, 1) && setInfo("up a half step"));
    mk("+2", () => nudgeSelection(0, 2) && setInfo("up a whole step (chromatic)"));
    mk("in key ▼", () => diatonicShift(-1) && setInfo("down one scale degree — still in key"));
    mk("in key ▲", () => diatonicShift(1) && setInfo("up one scale degree — still in key"));
    mk("▼ 8va", () => nudgeSelection(0, -12) && setInfo("down an octave"));
    mk("▲ 8va", () => nudgeSelection(0, 12) && setInfo("up an octave"));
  }
  document.getElementById("trsheet").classList.add("on");
});
document.getElementById("divbtn").addEventListener("click", () => {
  if (!selEditItems().length) { setInfo("select notes first — then ➗ divides each into equal parts"); return; }
  const row = document.getElementById("divchips");
  if (!row.children.length) {
    for (const n of [2, 3, 4, 5, 6, 7]) {
      const b = document.createElement("button");
      b.textContent = String(n);
      b.style.cssText = "flex:1;min-height:44px;font-size:1.0625rem";
      b.addEventListener("click", () => {
        const k = divideSelection(n);
        document.getElementById("divsheet").classList.remove("on");
        setInfo(k ? "divided " + k + " note" + (k === 1 ? "" : "s") + " into " + n + " (one undo undoes)"
                  : "those notes are too short to divide by " + n);
      });
      row.appendChild(b);
    }
  }
  document.getElementById("divsheet").classList.add("on");
});
document.getElementById("quantbtn").addEventListener("click", () => {
  if (!selEditItems().length) { setInfo("select notes first — then Q quantizes them to the grid"); return; }
  const row = document.getElementById("quantchips");
  if (!row.children.length) {
    for (const pct of [100, 75, 50]) {
      const b = document.createElement("button");
      b.textContent = pct + "%";
      b.style.cssText = "flex:1;min-height:44px;font-size:1.0625rem";
      b.addEventListener("click", () => {
        const alsoEnds = document.getElementById("quantends").checked;
        const k = quantizeSelection(pct / 100, alsoEnds);
        document.getElementById("quantsheet").classList.remove("on");
        setInfo(k ? "quantized " + k + " note" + (k === 1 ? "" : "s") + " at " + pct + "% (one undo undoes)"
                  : "nothing to quantize");
      });
      row.appendChild(b);
    }
  }
  document.getElementById("quantsheet").classList.add("on");
});
document.getElementById("cutbtn").addEventListener("click", () => {
  const k = cutSelection();
  if (!k) { setInfo("nothing selected — lasso or tap notes first"); return; }
  setInfo("cut " + clipSummary() + " — Paste puts them at the cursor (undo restores)");
});
document.getElementById("splitbtn").addEventListener("click", () => {
  if (S.selClip && !S.multiSel.length && editableSong()) { splitSelectedClipAtCursor(); return; } // a selected audio piece splits like a note would
  let k = splitSelectionAt(S.playCursor), how = "at the cursor";
  if (!k) { k = splitSelectionHalves(); how = "in half"; }
  setInfo(k ? "split " + k + " note" + (k === 1 ? "" : "s") + " " + how
            : "select notes first — cursor inside splits there, otherwise each splits in half");
});
document.getElementById("joinbtn").addEventListener("click", () => {
  const k = joinSelection();
  setInfo(k ? "joined " + k + " notes"
            : "select two or more notes on the same pitch first");
});
document.getElementById("delbtn").addEventListener("click", () => {
  const k = deleteSelection();
  setInfo(k ? "deleted " + k + " note" + (k === 1 ? "" : "s") + " (undo restores them)"
            : "nothing selected — lasso or tap notes first");
});
 function invertEdit(u) { // the entry that would undo an applyU(u), captured NOW
  if (u.kind === "group") return {kind: "group", entries: u.entries.map(invertEdit).reverse()};
  if (u.kind === "trackRemove") return {kind: "trackInsert", ti: u.ti, track: S.song.tracks[u.ti],
    raw: S.song.rawNotes ? S.song.rawNotes[u.ti] : null, state: S.trackState[u.ti]};
  if (u.kind === "trackInsert") return {kind: "trackRemove", ti: u.ti};
  if (u.kind === "trackReorder") return {kind: "trackReorder", tracks: S.song.tracks.slice(), trackState: S.trackState.slice(), // current state, like anno/mod
    trackGains: S.trackGains.slice(), trackPanners: S.trackPanners.slice(), rawNotes: S.song.rawNotes ? S.song.rawNotes.slice() : null,
    selTrack: S.selTrack, selNote: S.selNote ? {ti: S.selNote.ti, ni: S.selNote.ni} : null, selClip: S.selClip ? {ti: S.selClip.ti, ci: S.selClip.ci} : null};
  if (u.kind === "mod") return {kind: "mod", items: u.items.map(({ti, ni}) => {
    const n = S.song.tracks[ti].notes[ni];
    return {ti, ni, t: n.t, d: n.d, p: n.p, v: n.v};
  })};
  if (u.kind === "addBatch") return {kind: "eraseBatch", items: u.items};
  if (u.kind === "eraseBatch") return {kind: "addBatch", items: u.items};
  if (u.kind === "anno") return {kind: "anno", json: annoSnapshot()}; // current state, like mod
  return {ti: u.ti, ni: u.ni, kind: u.kind === "add" ? "erase" : "add"};
}
function editRedoPop() {
  const r = S.editRedo.pop();
  if (!r || !S.song) return;
  S.editUndo.push(invertEdit(r)); // plain push: redo must not clear its own stack
  applyEditEntry(r);
}
function editUndoPop() {
  const u = S.editUndo.pop();
  if (!u || !S.song) return;
  S.editRedo.push(invertEdit(u));
  applyEditEntry(u);
}
function applyEditEntry(u) {
  const setGone = (ti, ni, gone) => {
    const nn = S.song.tracks[ti] && S.song.tracks[ti].notes[ni];
    if (!nn) return;
    nn.gone = gone;
    if (S.song.rawNotes && nn.ri !== undefined && S.song.rawNotes[ti][nn.ri]) S.song.rawNotes[ti][nn.ri].gone = gone;
  };
  const applyU = v => {
    if (v.kind === "group") { for (let i = v.entries.length - 1; i >= 0; i--) applyU(v.entries[i]); }
    else if (v.kind === "mod") { // restore each note's prior time/duration/pitch
      for (const it of v.items) {
        const nn = S.song.tracks[it.ti] && S.song.tracks[it.ti].notes[it.ni];
        if (!nn) continue;
        nn.t = it.t; nn.d = it.d; nn.p = it.p;
        if (it.v !== undefined) nn.v = it.v;
        const rn = S.song.rawNotes && nn.ri !== undefined && S.song.rawNotes[it.ti][nn.ri];
        if (rn) { rn.t = it.t + S.chopS; rn.d = it.d; rn.p = it.p; if (it.v !== undefined) rn.v = it.v; }
      }
    } else if (v.kind === "anno") { // restore the whole annotation layer
      annoRestore(v.json);
      finalizeNotes();
      saveLocalNotes();
      pruneTombstones();
      if (S.viewMode === "score") buildScoreModel();
    } else if (v.kind === "trackInsert") { // put a deleted track back where it was
      S.song.tracks.splice(v.ti, 0, v.track);
      if (S.song.rawNotes) S.song.rawNotes.splice(v.ti, 0, v.raw || []);
      S.trackState.splice(v.ti, 0, v.state || {muted: false, solo: false});
      S.selTrack = v.ti;
      S.multiSel = []; S.multiSelKey = new Set(); S.selNote = null;
      renderTrackbar(); updateTrackGains();
    } else if (v.kind === "trackRemove") {
      S.song.tracks.splice(v.ti, 1);
      if (S.song.rawNotes) S.song.rawNotes.splice(v.ti, 1);
      S.trackState.splice(v.ti, 1);
      S.selTrack = Math.max(0, Math.min(S.selTrack, S.song.tracks.length - 1));
      S.multiSel = []; S.multiSelKey = new Set(); S.selNote = null;
      renderTrackbar(); updateTrackGains();
    } else if (v.kind === "trackReorder") { // Mixer drag reorder: a full snapshot restore, not a re-derived move — see reorderTrack()
      S.song.tracks = v.tracks.slice();
      S.trackState = v.trackState.slice();
      S.trackGains = v.trackGains.slice();
      S.trackPanners = v.trackPanners.slice();
      if (v.rawNotes) S.song.rawNotes = v.rawNotes.slice();
      S.selTrack = v.selTrack;
      S.selNote = v.selNote ? {ti: v.selNote.ti, ni: v.selNote.ni} : null;
      S.selClip = v.selClip ? {ti: v.selClip.ti, ci: v.selClip.ci} : null;
      S.multiSel = []; S.multiSelKey = new Set();
      saveDraft(); // the track order is draft-only state; saveEdits() below drafts only compositions and local songs
      renderTrackbar(); renderMixer(); updateTrackGains();
    } else if (v.kind === "addBatch") { for (const it of v.items) setGone(it.ti, it.ni, true); }
    else if (v.kind === "eraseBatch") { for (const it of v.items) setGone(it.ti, it.ni, false); }
    else setGone(v.ti, v.ni, v.kind === "add"); // undo an add = remove it; undo an erase = restore it
  };
  applyU(u);
  saveEdits();
  computeSongEnd();
  if (S.viewMode === "score") buildScoreModel();
  draw();
}
document.getElementById("undobtn").addEventListener("click", editUndoPop);
document.getElementById("redobtn").addEventListener("click", editRedoPop);
// keyboard editing — every drag gesture has a key equivalent (easier on the
// hands): arrows move, shift = octave, alt+arrows resize, cmd-c/v copy/paste
// at the playhead, delete removes. Ignored while typing in a field.
document.addEventListener("keydown", e => {
  if (!S.song || !editableSong()) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  const grid = moveSnapTicks(); // 16ths, or triplet steps while a T duration is active
  const meta = e.metaKey || e.ctrlKey;
  if (meta && e.key.toLowerCase() === "s") { e.preventDefault(); saveVersion(); return; }
  if (meta && e.key.toLowerCase() === "c") {
    const k = copySelection();
    if (k) { setInfo("copied " + clipSummary() + " — ⌘V pastes at the playhead"); e.preventDefault(); }
    return;
  }
  if (meta && e.key.toLowerCase() === "v") {
    const k = pasteClipboard(S.playCursor);
    if (k) { setInfo("pasted " + clipSummary() + " (selected — arrows move them; cursor at their end, ⌘V again chains)"); e.preventDefault(); }
    return;
  }
  if (meta && e.key.toLowerCase() === "z") { // ⌘Z / ⇧⌘Z (Josh, 2026-09-12: ⌘Z did nothing on his Mac)
    if (e.shiftKey) editRedoPop(); else editUndoPop();
    e.preventDefault();
    return;
  }
  if (meta && e.key.toLowerCase() === "y") { editRedoPop(); e.preventDefault(); return; }
  if (meta && e.key.toLowerCase() === "a") { const k = selectAllNotes(); setInfo(k + " notes selected"); e.preventDefault(); return; }
  if (meta && e.key.toLowerCase() === "x") { // cut = copy, then delete — one ⌘Z brings the notes back
    if (copySelection()) { const s = clipSummary(); deleteSelection(); setInfo("cut " + s + " — ⌘V pastes at the playhead"); e.preventDefault(); }
    return;
  }
  if (meta && e.key.toLowerCase() === "d") { if (duplicateSelection()) setInfo("duplicated — ⌘D again repeats it"); e.preventDefault(); return; }
  if (meta) return; // don't eat browser shortcuts
  if (e.key === "Backspace" || e.key === "Delete") {
    if (deleteSelection()) e.preventDefault();
    return;
  }
  if (!selEditItems().length) return;
  let did = false;
  if (e.key === "ArrowUp") did = nudgeSelection(0, e.shiftKey ? 12 : 1);
  else if (e.key === "ArrowDown") did = nudgeSelection(0, e.shiftKey ? -12 : -1);
  else if (e.key === "ArrowLeft") did = e.altKey ? resizeSelection(-grid) : nudgeSelection(-grid, 0);
  else if (e.key === "ArrowRight") did = e.altKey ? resizeSelection(grid) : nudgeSelection(grid, 0);
  if (did) e.preventDefault();
});
{
  const fn = document.getElementById("fnnum");
  for (let n = 2; n <= 12; n++) {
    const o = document.createElement("option");
    o.textContent = String(n);
    if (n === 4) o.selected = true;
    fn.appendChild(o);
  }
}

 if (document.getElementById("cmpswap")) {
  document.getElementById("cmpswap").addEventListener("click", () => cmpShow(S.cmp && S.cmp.showing === "mine" ? "repo" : "mine"));
  document.getElementById("cmpdone").addEventListener("click", cmpExit);
}


         async function aiHostOk(url) { // per-host consent: the payload is his annotations + notes
  const kind = aiHostKind(url);
  if (kind === "bad") return false;
  if (kind === "local") return true;
  const host = new URL(url).host;
  let ok = [];
  try { ok = JSON.parse(localStorage.getItem("ff1roll-ai-hosts") || "[]"); } catch (err) { ok = []; }
  if (ok.includes(host)) return true;
  const yes = await appConfirm("Send your notes to " + host + "?",
    "Every message sends this song's notes and your annotations to " + host + ". Only do this for a machine you trust. Asked once per machine.",
    "Send", "Cancel");
  if (yes) { ok.push(host); localStorage.setItem("ff1roll-ai-hosts", JSON.stringify(ok)); }
  return yes;
}
document.getElementById("cfgaitest").addEventListener("click", aiRunTest);
document.getElementById("cfgaitestb").addEventListener("click", aiRunTest);
document.getElementById("cfgaiurl").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); aiRunTest(); } });
document.getElementById("cfgaibackend").addEventListener("change", aiBackendRows);

function askAddAnnotation(a) { // the same text grammar the editor and the files use: one line, parsed by parseRollnotes
  if (!S.song || !S.songKey) throw new Error("no song open");
  if (LINK_SONGS) throw new Error("this song is being viewed from a link to another repo — read-only");
  if (S.rollnotesReadOnly) throw new Error(S.rollnotesLockReason || ROLLNOTES_LOCK_MSG); // version guard, docs/annotations-v2.md P3
  const bar = Math.max(1, Math.round(+a.bar || 1)), beat = Math.max(1, +a.beat || 1);
  const eb = a.end_bar ? Math.max(bar, Math.round(+a.end_bar)) : null;
  const eq = eb && a.end_beat ? Math.max(1, +a.end_beat) : null;
  const kind = String(a.kind || "note"), text = String(a.text || "").trim();
  if (!text) throw new Error("empty text");
  const line = (kind === "note" ? text : kind + ": " + text) + (a.comment ? "\n" + String(a.comment).trim() : "");
  const head = "[" + bar + "." + beat + (eb ? " - " + eb + (eq ? "." + eq : "") : "") + "]";
  const parsed = parseRollnotes(head + "\n" + line);
  if (!parsed.length) throw new Error("could not parse that annotation");
  const fresh = parsed[0];
  fresh.added = true;
  const isLoop = n => n.loopTo !== undefined || /^loop:/i.test(n.text || "");
  if (isLoop(fresh)) S.rollnotes = S.rollnotes.filter(n => !(n.added && isLoop(n))); // one loop point per song, as the editor does (loopTo is derived later, in finalizeNotes)
  dropSupersededBy(fresh);
  S.rollnotes.push(resolveNote(fresh));
  finalizeNotes();
  saveLocalNotes();
  if (typeof draw === "function") draw();
  if (typeof updateSongBtn === "function") updateSongBtn();
  if (typeof updateSyncBtn === "function") updateSyncBtn();
  return {ok: true, at: head, text: fresh.text, unsynced: true, note: "written on this device; Publish sends it with the song — the user can discard it in the Publish sheet"};
}
function askEditAnnotation(a) {
  if (S.rollnotesReadOnly) throw new Error(S.rollnotesLockReason || ROLLNOTES_LOCK_MSG); // version guard, docs/annotations-v2.md P3
  a = a || {};
  const n = askFindAnnotation(a);
  if (askAnnotationStructural(n)) throw new Error("that annotation is a structural directive (meter/chop/track/audio/lane) — change it in the app's own editor, not here");
  const kind = askNoteKind(n);
  const bar = a.new_bar !== undefined ? Math.max(1, Math.round(+a.new_bar)) : n.b1;
  const beat = a.new_beat !== undefined ? Math.max(1, +a.new_beat) : (n.q1 || 1);
  const eb = a.new_end_bar !== undefined ? Math.max(bar, Math.round(+a.new_end_bar)) : (n.b2 || null);
  const eq = eb !== null ? (a.new_end_beat !== undefined ? Math.max(1, +a.new_end_beat) : (eb === n.b2 ? (n.q2 || null) : null)) : null;
  const text = String(a.text || "").trim();
  if (!text) throw new Error("empty text");
  const comment = a.comment !== undefined ? String(a.comment).trim() : (n.cnote || "");
  const line = (kind === "note" ? text : kind + ": " + text) + (comment ? "\n" + comment : "");
  const head = "[" + bar + "." + beat + (eb ? " - " + eb + (eq ? "." + eq : "") : "") + "]";
  const parsed = parseRollnotes(head + "\n" + line);
  if (!parsed.length) throw new Error("could not parse that annotation");
  const fresh = parsed[0];
  fresh.added = true;
  if (kind === "key") dropLocalKeyAt(bar, beat); // anchor-level: only a key at the (possibly new) exact beat is replaced
  retireEdited(n); // tombstones a synced original (so it can't come back on reload) and drops it — same path the note editor's own Save uses on an edit
  const isLoop = nn => nn.loopTo !== undefined || /^loop:/i.test(nn.text || "");
  if (isLoop(fresh)) S.rollnotes = S.rollnotes.filter(nn => !(nn.added && isLoop(nn))); // one loop point per song
  dropSupersededBy(fresh);
  S.rollnotes.push(resolveNote(fresh));
  finalizeNotes();
  saveLocalNotes();
  if (typeof buildScoreModel === "function") buildScoreModel();
  if (typeof clampView === "function") clampView();
  S.lastSubtitle = undefined;
  if (typeof updateSubtitle === "function") updateSubtitle();
  if (typeof draw === "function") draw();
  if (typeof updateSongBtn === "function") updateSongBtn();
  if (typeof updateSyncBtn === "function") updateSyncBtn();
  return {ok: true, at: head, text: fresh.text, note: "edited in place"};
}
function askDeleteAnnotation(a) {
  if (S.rollnotesReadOnly) throw new Error(S.rollnotesLockReason || ROLLNOTES_LOCK_MSG); // version guard, docs/annotations-v2.md P3
  const n = askFindAnnotation(a || {});
  if (askAnnotationStructural(n)) throw new Error("that annotation is a structural directive (meter/chop/track/audio/lane) — remove it in the app's own editor, not here");
  const at = "[" + n.b1 + "." + (n.q1 || 1) + (n.b2 ? " - " + n.b2 + (n.q2 ? "." + n.q2 : "") : "") + "]", text = (n.text || "").split("\n")[0];
  tombstone(n); // synced notes need the deletion to survive a reload — same path the note editor's own Delete uses
  S.rollnotes = S.rollnotes.filter(x => x !== n);
  finalizeNotes();
  saveLocalNotes();
  if (typeof buildScoreModel === "function") buildScoreModel();
  if (typeof clampView === "function") clampView();
  S.lastSubtitle = undefined;
  if (typeof updateSubtitle === "function") updateSubtitle();
  if (typeof draw === "function") draw();
  if (typeof updateSongBtn === "function") updateSongBtn();
  if (typeof updateSyncBtn === "function") updateSyncBtn();
  return {ok: true, at, text, note: "deleted"};
}
// publish_song (2026-10-01): the exact per-song flow the footer's Publish
// button runs (#ghsave's "writing mode" branch for his own songs; the plain
// annotations-only branch otherwise) — never a parallel path, so a tool-run
// publish and a tapped one behave identically.
async function askPublishSong() {
  if (!S.song || !S.songKey) throw new Error("no song open");
  if (LINK_SONGS) throw new Error("this song is being viewed from a link to another repo — read-only");
  if (!connected()) throw new Error("not connected — add a GitHub token, or choose a local folder, in File → Settings first");
  const token = writeToken();
  const h = ghHeaders(token);
  const hisMusic = isComposition();
  let status = "";
  await publishSong(S.songKey, h, m => { status = m; });
  if (hisMusic) {
    try { await writeSongsReadme(h); } catch (err) { status = "published, but the repo's song list didn't update: " + err.message; }
  }
  try { await initCatalog(); } catch (err) { /* best-effort refresh */ }
  if (typeof updateSongBtn === "function") updateSongBtn();
  if (typeof renderSyncPending === "function") renderSyncPending();
  const where = folderActive() ? ("to " + fsRoot.name) : "(GitHub Pages takes ~1 min to serve it)";
  return {ok: true, message: "Published " + S.songKey + " " + where + (hisMusic ? " — song and annotations together." : " — annotations.")};
}
async function askRunTool(name, a) {
  if (name === "add_annotation") return askAddAnnotation(a || {});
  if (name === "edit_annotation") return askEditAnnotation(a || {});
  if (name === "delete_annotation") return askDeleteAnnotation(a || {});
  if (name === "publish_song") return askPublishSong();
  if (name === "list_songs") return Object.entries(S.CATALOG).map(([album, songs]) => ({album, songs: songs.map(([title, path]) => ({title, path}))}));
  if (name === "read_song") {
    const path = askSongPath(a && a.path);
    const res = await readData("songs", path);
    if (!res.ok) throw new Error("could not read " + path);
    const doc = parseMidi(await res.arrayBuffer());
    return notesTxtForDoc(doc, songTitleOf(path), a.from_bar, a.to_bar, 6000, path);
  }
  if (name === "read_notes") {
    const path = askSongPath(a && a.path);
    const res = await readData("analysis", path.replace(/\.midi?$/i, "") + ".rollnotes.json");
    if (!res.ok) return "(no annotations saved for " + path + ")";
    let j; try { j = JSON.parse(await res.text()); } catch (err) { return "(annotations unreadable)"; }
    const at = e => "[" + (e.at || [1, 1]).join(".") + (e.to ? " - " + e.to.join(".") : "") + "]";
    return (j.notes || []).map(e => at(e) + " " + (e.type ? e.type + ": " + (e.chord || e.label || e.key || e.bpm || e.loop || e.timesig || e.track || e.chop || e.lane || "") : e.text || "") + (e.note ? " — " + e.note : "")).join("\n") || "(no annotations)";
  }
  if (name === "read_bars") return askReadBars(a || {});
  if (name === "write_notes") return askWriteNotes(a || {});
  if (name === "copy_bars") return askCopyBars(a || {});
  if (name === "insert_bars") return askInsertBars(a || {});
  if (name === "delete_bars") return askDeleteBars(a || {});
  throw new Error("unknown tool " + name);
}

// askKeyStateLine (P4): Learning matches keyLabelState()'s text BYTE FOR
// BYTE (built from data now, never the DOM — see keyLabelState's comment);
// Normal states declared-vs-estimated plainly instead, since an estimate
// may be named under RULE_NORMAL.
function askKeyStateLine() {
  if (appMode() !== "normal") return "key state: " + keyLabelState().text + " — 'not set' means the user has NOT discovered the key; do not reveal it";
  if (S.keyRegions.length) return "key state: declared " + S.keyRegions.map(r => r.name + (r.b2 ? "(" + r.b1 + "–" + r.b2 + ")" : "")).join(", ");
  const est = estimateKey();
  return est ? "key state: estimated " + est.name + " (Krumhansl, confidence " + (Math.round(est.conf * 100) / 100) + ")"
             : "key state: undetermined — not enough notes yet to estimate";
}
  function askContext(sp, budget) { // the ONE block per request; never stored
  if (S.askGeneral) {
    let s = "general chat — no song attached. The user opened the general Ask: for the app, the project, music in general, or a message for the terminal; nothing here is about one song. Do not read or discuss the open song unless asked, and do not add annotations. " +
      (appMode() === "normal" ? "The tutor rule about answering music questions directly still holds." : "The tutor rule about the user's own discoveries still holds for music questions.") +
      (appMode() === "normal" ? "\nmode: normal" : "") + "\n" + askAppState();
    const openLine = askOpenSongLine();
    if (openLine) s += "\n" + openLine;
    const ns = askNewSinceLines(askStoreKey());
    if (ns) s += "\n" + ns;
    return s;
  }
  const bt = barTicks(), qt = beatTicks(), ts = effTs();
  const tick = curTick();
  const own = editableSong(); // P1: was missing the link-mode/compare-repo guards editableSong() has (Bugs found, docs/provenance-plan.md) — a linked/compare-repo song now correctly tells the tutor it's locked, like everywhere else
  const tempo = S.song.tempos.reduce((acc, t) => (t.tick <= sp.t0 ? t : acc), S.song.tempos[0]);
  const L = [];
  L.push("song: " + baseName() + (S.songKey && S.songKey.startsWith("albums/") ? " (album: " + S.songKey.split("/")[1] + ")" : "") +
         (own ? " — the user's own composition (editable)" : " — a locked capture the user is studying"));
  L.push("meter: " + ts[0] + "/" + ts[1] + " (beat = " + (ts[1] === 8 ? "eighth" : ts[1] === 16 ? "sixteenth" : ts[1] === 2 ? "half note" : "quarter") + "), tempo: " +
         Math.round(6e7 / tempo.usq) + " bpm, " + Math.max(1, Math.ceil(S.songEndTick / bt)) + " bars");
  L.push("tracks: " + S.song.tracks.map((t, i) => (t.name || "track " + (i + 1)) + (trackIsDrums(i) ? " (drums)" : "") + (trackAudible(i) ? "" : " (muted)")).join(", "));
  L.push(askViewCursorLine(bt, qt, tick));
  L.push(askKeyStateLine());
  const modeLine = askModeLine();
  if (modeLine) L.push(modeLine);
  L.push(askAppState());
  if (S.multiSel.length) {
    const pitches = [...new Set(S.multiSel.map(m => S.song.tracks[m.ti].notes[m.ni].p))].sort((a, b) => a - b);
    const names = pitches.map(p => pitchName(p, S.multiSelSf)).join(" ");
    L.push(appMode() === "normal"
      ? "lasso-selected notes: " + names + " — chord: " + nameChord(pitches, S.multiSelSf)
      : "lasso-selected notes: " + names + " — do not name this chord unless the user has guessed or insists");
  }
  const cacheKey = askStoreKey();
  // step 5 (docs/ask-token-plan.md): the BRIDGE gets the compact encodings
  // (askSpanNotesCompact/askAnnotationsTextCompact) — a resumed Claude Code
  // session is the only backend that can lean on a one-time legend instead
  // of a format explanation every turn; a local/LM Studio provider has no
  // memory of its own, so it keeps today's full, self-explaining format.
  if (S.askCaps.bridge) {
    const sent = askSentGet(cacheKey);
    if (!sent.legend) { L.push(askLegendText()); askSentStage(cacheKey, "legend", true); }
  }
  const anno = S.askCaps.bridge ? askAnnotationsTextCompact() : askAnnotationsText();
  const annoCap = budget.anno * ASK_CPT;
  const annoFull = anno.length > annoCap ? anno.slice(0, annoCap) + "\n# (annotations cut here to fit the window)" : anno;
  const annoCount = S.askCaps.bridge ? dedupedNotesWithIndex(S.rollnotes).filter(({n}) => !askAnnotationStructural(n)).length : dedupedNotesWithIndex(S.rollnotes).length;
  L.push(askCachedBlock(cacheKey, "anno", "annotations", "the user's annotations (.rollnotes) — each entry's \"id\" is this turn's handle for edit_annotation/delete_annotation", annoFull, annoCount));
  const spanLabel = "notes in bars " + sp.from + "–" + sp.to;
  L.push(askSpanCachedBlock(cacheKey, spanLabel, sp.t0, sp.t1, budget.span * ASK_CPT)); // step 6: per-bar collapsing on the bridge (askSpanNotesCompactCached), full askSpanNotes otherwise — see both above
  const ns = askNewSinceLines(askStoreKey());
  if (ns) L.push(ns);
  return L.join("\n");
}
 // what the configured backend can do (askStatusPoll detects; askTabsApply shows). sessions: the bridge's Clear-really-resets/Compact/usage-line trio (askSessionRender gates on it)
try { const m = localStorage.getItem("ff1roll-ask-mode"); S.askTerminal = m === "terminal"; S.askGeneral = S.askTerminal || m === "general"; } catch (err) { S.askGeneral = S.askTerminal = false; }
  
  async function askInboxPoll() {
  if (!askInboxAllowed() || !S.song) return;
  const url = aiUrl();
  let r;
  try { r = await fetch(url + "/v1/inbox?since=" + (+(localStorage.getItem(askInboxSeenKey()) || 0)), {headers: aiHeaders(), cache: "no-store"}); } catch (err) { return; }
  if (r.status === 404) { S.askInboxNo = url; askShotShow(false); return; }
  if (!r.ok) return;
  askShotShow(true); // an inbox means the Mac's bridge: it takes 📷 screenshots too
  let j; try { j = await r.json(); } catch (err) { return; }
  let notes = (j && j.notes || []).filter(n => n && n.text);
  // a device that has never polled (a fresh install: the Xcode shell,
  // 2026-09-27, got the whole night's 40 notes poured into Threnody II's
  // chat) takes only the last few hours, then keeps up like any other
  if (localStorage.getItem(askInboxSeenKey()) === null) { const cutoff = Date.now() - 6 * 3600e3; notes = notes.filter(n => (n.t || 0) >= cutoff); }
  if (!notes.length) { if (j && j.last) localStorage.setItem(askInboxSeenKey(), String(j.last)); return; }
  askNotesArrived(notes);
  localStorage.setItem(askInboxSeenKey(), String(j.last || notes[notes.length - 1].id));
}
function askNotesArrived(notes) { // the terminal's notes go to the Terminal tab (its answers); others to the open chat — saved like any message; shown now if that chat is on screen, else the ✉ light
  const toTerm = n => !n.from || n.from === "terminal";
  for (const key of [ASK_TERMINAL_KEY, null]) {
    const mine = notes.filter(n => key ? toTerm(n) : !toTerm(n));
    if (!mine.length) continue;
    const k = key || askStoreKey(), msgs = askStore(k).msgs;
    for (const n of mine) msgs.push({role: "note", content: String(n.text), t: n.t || Date.now(), m: n.from || "terminal", mode: appMode()});
    askSave(msgs, undefined, k);
  }
  const shown = asksheet.classList.contains("on") ? notes.filter(n => (toTerm(n) ? ASK_TERMINAL_KEY : askStoreKey()) === askStoreKey()) : [];
  if (shown.length) { for (const n of shown) askBubble("note", askClock(n.t) + askNoteLabel(n.from) + String(n.text)); askNoteSeen(); }
  if (shown.length === notes.length) return;
  else { document.getElementById("askbtn").classList.add("hasnote"); setInfo("✉ a note from your Mac — tap ✦ AI to read it"); }
}
    document.addEventListener("visibilitychange", () => { if (document.hidden) flushBackupNow(); });

// ---- Deploy safeguard #2: a Version before every install. On deployWarn's
// FIRST tick of a cycle, if the open song is editable and its music/
// annotations differ from its newest Version, save one labelled "Before
// update HH:MM" (the same Versions store File → Versions… reads) and flush
// a backup right away too (#1) — belt and suspenders right before a relaunch.
function deployBeforeInstall() {
  if (!S.song || !S.songKey || !editableSong()) return;
  try {
    saveDraft(false); // the working copy is what a Version snapshots — make sure it's current first
    const list = readVersions(S.songKey); // newest LAST
    const newest = list.length ? list[list.length - 1] : null;
    // musicSig (not a raw-blob compare): a local/ draft's own seq stamp bumps
    // on every saveDraft() (NIGHT-ROLL.md "Local song persistence") even when
    // the music itself hasn't changed — comparing the full stored JSON would
    // "detect" a change on every single tick. musicSig reads only ppq/tracks/
    // tempos/timesigs, same fields Save Version's own dirty check uses.
    const curSig = musicSig(draftDoc(false));
    let curNotes = null; try { const n = localStorage.getItem("ff1roll-notes-" + S.songKey); curNotes = n ? JSON.parse(n) : null; } catch (err) { curNotes = null; }
    const draftChanged = !newest || musicSig(newest.draft) !== curSig;
    const notesChanged = !newest || JSON.stringify(newest.notes || null) !== JSON.stringify(curNotes);
    if (draftChanged || notesChanged) {
      const now = new Date(), hhmm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
      pushVersion(S.songKey, "Before update " + hhmm);
      flushBackupNow();
    }
  } catch (err) { logDebug("deploy version: " + (err && err.message || err)); }
}

async function deployInstallNow() {
  const wasHeld = S.deployHeld;
  try { await fetch(aiUrl() + "/v1/deploy", {method: "POST", headers: aiHeaders(), body: JSON.stringify({hold: false, inSec: wasHeld ? 3 : 0})}); }
  catch (err) { logDebug("deploy install-now: " + (err && err.message || err)); }
  deploySetHeld(false);
  if (wasHeld) deployWarn(3000); else { S.deployAt = Date.now(); deployButtonTick(); }
}
async function deployHoldNow() {
  try { await fetch(aiUrl() + "/v1/deploy", {method: "POST", headers: aiHeaders(), body: JSON.stringify({hold: true})}); }
  catch (err) { logDebug("deploy hold: " + (err && err.message || err)); }
  deploySetHeld(true);
}
document.getElementById("deploynotnow").addEventListener("click", deployHoldNow);
document.getElementById("deploynow").addEventListener("click", deployInstallNow);
function deployWarn(ms) {
  const first = !S.deployTimer;
  S.deployAt = Date.now() + ms;
  if (first) {
    setInfo("a new version installs in " + Math.ceil(ms / 1000) + " s — the app will restart");
    S.deployTimer = setInterval(deployButtonTick, 1000);
    deployBeforeInstall(); // safeguard #2 (+ a backup flush)
  }
  deployButtonTick();
}
function deploySetHeld(on) {
  on = !!on;
  if (on === S.deployHeld) return;
  S.deployHeld = on;
  if (S.deployHeld) {
    if (!S.deployTimer) S.deployTimer = setInterval(deployButtonTick, 1000); // held with no local countdown running yet (e.g. a fresh poll after a reload)
    setInfo("update waiting — tap ✦ AI to install when you're ready");
  }
  deployButtonTick();
}
 // a countdown or a hold is in effect: ✦ AI opens the install sheet, not the chat
async function deployAskTap() { // the "Not now" / "Install now" sheet (appConfirm — no native dialogs)
  const yes = await appConfirm("Update ready", "A new version is ready. The app will restart.", "Install now", "Not now");
  if (yes) {
    await deployInstallNow();
  } else {
    await deployHoldNow();
  }
}
async function askStatusPoll() {
  if (!askInboxAllowed() || !S.song) return; // same gate as the inbox: a host allowed for Ask, and a song open (Ask itself needs one)
  const url = aiUrl();
  if (S.askStatusNo === url) return;
  let r;
  try { r = await fetch(url + "/v1/status", {headers: aiHeaders(), cache: "no-store"}); } catch (err) { S.askCaps = {...S.askCaps, terminalLive: false}; askStatusRender(); return; } // unreachable this moment: say so in the tab — never pull a tab out from under him (Josh, 2026-09-30: the Terminal tab vanished mid-conversation)
  if (r.status === 404) { S.askStatusNo = url; S.askStatusNow = null; S.askCaps = {bridge: false, terminal: false, sessions: false}; askStatusRender(); askTabsApply(); askSessionRender(); return; }
  if (!r.ok) return;
  let j; try { j = await r.json(); } catch (err) { return; }
  S.askStatusNow = (j && j.now) || null;
  S.askStatusRecent = (j && j.recent) || [];
  S.askQuota = (j && j.quota) || null;
  if (j && j.deployInMs > 0) deployWarn(j.deployInMs);
  deploySetHeld(!!(j && j.deployHold));
  S.askCaps = {bridge: true, terminal: !!(j && j.terminal), terminalLive: !!(j && (j.terminalLive !== undefined ? j.terminalLive : j.terminal)), sessions: !!(j && j.sessions)};
  askStatusRender();
  askTabsApply();
  askSessionRefresh();
}
function askTabsApply() {
  const v = askTabsVisible({backend: cfg().aiBackend === "browser" || !!aiUrl(), bridge: S.askCaps.bridge, terminal: S.askCaps.terminal});
  const g = document.getElementById("askmodegen"), t = document.getElementById("askmodeterm");
  if (g) g.style.display = v.general ? "" : "none";
  if (t) t.style.display = v.terminal ? "" : "none";
  askTermModelsLoad();
  if ((S.askTerminal && !v.terminal) || (S.askGeneral && !S.askTerminal && !v.general)) { askSetMode("song"); if (asksheet.classList.contains("on")) askRender(); }
}
  document.getElementById("askcompact").addEventListener("click", async () => {
  const key = askSessionName();
  const u = S.askSessionCache[key];
  if (!u || !u.turns) return;
  const yes = await appConfirm("Compact chat", "Summarize this chat's memory on the bridge and shrink it — " + askSessionLine(u) + " now. This can't be undone.", "Compact", "Cancel");
  if (!yes) return;
  const btn = document.getElementById("askcompact");
  btn.disabled = true;
  askstatus.textContent = "compacting…";
  try {
    const r = await fetch(aiUrl() + "/v1/sessions/" + encodeURIComponent(key) + "/compact", {method: "POST", headers: aiHeaders(), body: JSON.stringify({model: askCompactModelName()})});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || "HTTP " + r.status);
    askSentReset(askStoreKey()); // the compacted session no longer holds the full text verbatim — resend in full next time
    const k = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n);
    askstatus.textContent = "compacted: " + j.turnsBefore + " → " + j.turnsAfter + " turns · ~" + k(j.tokensBefore) + " → ~" + k(j.tokensAfter) + " tokens";
  } catch (err) { askstatus.textContent = "⚠ Compact failed — " + err.message; }
  await askSessionRefresh();
});
// live while the bridge is there and the app is on screen: every 10 s (the
// inbox keeps its own 60 s pace)
// (askStatusPoll asks only an allowed host, and never again after a 404 —
// so for LM Studio or no AI at all this costs one request, then nothing)
if (typeof window !== "undefined") setInterval(() => { if (!document.hidden) askStatusPoll(); }, 10000);
// ---- 📷 (Josh, 2026-09-29: "I wish there would be a way for me to send you
// screenshots from the app itself"). The iPad shell's native snapshot
// (WKWebView, exact pixels, no prompt); a browser shares its own tab
// (getDisplayMedia — Chrome asks once per shot). 🖼 (2026-10-02) picks
// existing pictures from Photos/Files instead of capturing the app itself —
// same pending list, same upload, same outgoing line, just a different
// source for the bytes. The bridge stores the bytes (POST /v1/shot) and
// answers a path on the Mac; each lands as its own "(screenshot: <path>)"
// line and Claude Reads it. The AI panel steps aside for a 📷 capture unless
// it's docked — the picture is of the song, not the chat (🖼 doesn't need
// that: nothing of the app is on screen while the OS picker is up).
function askShotShow(on) {
  const b = document.getElementById("askattach");
  if (b) b.style.display = on ? "" : "none";
  if (!on && S.dropUpOpen === document.getElementById("askattachmenu")) closeDropUp();
}
async function askShotCapture() { // -> {bytes, mime}
  // the shell's own plugin (registered in its AppDelegate.swift): native-bridge.js
  // has no registerPlugin (that's @capacitor/core, which this page doesn't
  // load), and Capacitor.Plugins may lack it — nativePromise reaches any
  // registered plugin by name, and a missing one answers "not implemented"
  const C = typeof window !== "undefined" && window.Capacitor;
  const native = !!(C && C.isNativePlatform && C.isNativePlatform());
  logDebug("📷 Capacitor: " + typeof C + ", native: " + native + ", Plugins: " + (C && C.Plugins ? Object.keys(C.Plugins).join(",") : "none") +
           ", nativePromise: " + typeof (C && C.nativePromise) + ", registerPlugin: " + typeof (C && C.registerPlugin));
  if (native) {
    const r = C.Plugins && C.Plugins.Screenshot ? await C.Plugins.Screenshot.capture()
      : C.nativePromise ? await C.nativePromise("Screenshot", "capture", {})
      : null;
    if (!r) throw new Error("the app has no screenshot bridge (no Plugins.Screenshot, no nativePromise)");
    if (!r.jpeg) throw new Error("the app's screenshot came back empty");
    return {bytes: b64Bytes(r.jpeg), mime: "image/jpeg"};
  }
  if (!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)) throw new Error("this browser can't take a screenshot (not the app: Capacitor " + (C ? "present, not native" : "missing") + "; no getDisplayMedia)");
  const stream = await navigator.mediaDevices.getDisplayMedia({video: {displaySurface: "browser"}, audio: false, preferCurrentTab: true});
  try {
    const v = document.createElement("video");
    v.muted = true; v.srcObject = stream; await v.play();
    await new Promise(r => setTimeout(r, 300)); // the share banner and the panel's step-aside settle first
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    return {bytes: new Uint8Array(await blob.arrayBuffer()), mime: "image/png"};
  } finally { stream.getTracks().forEach(t => t.stop()); }
}
async function askShotTake() {
  if (S.askShotPending.length >= ASKSHOT_MAX) { askstatus.textContent = "📷 already " + ASKSHOT_MAX + " attached (max) — remove one first"; return; }
  const sheet = document.getElementById("asksheet");
  const aside = !sheet.classList.contains("docked");
  askstatus.textContent = aside ? "📷 taking…" : ""; // docked, the panel is IN the picture: no stale "taking…" in it
  if (aside) sheet.style.visibility = "hidden";
  let shot;
  try {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    shot = await Promise.race([askShotCapture(), new Promise((_, rej) => setTimeout(() => rej(new Error("screenshot timed out")), 10000))]); // a native call that never answers must not leave "taking…" up forever
  } catch (err) { askstatus.textContent = "📷 " + (err && err.message || "no screenshot"); return; }
  finally { if (aside) sheet.style.visibility = ""; }
  askstatus.textContent = "📷 sending…";
  try {
    const path = await askShotUpload(shot.bytes, shot.mime);
    askShotAdd(path, shot);
    askstatus.textContent = askShotStatusLabel();
    // no focus: the keyboard stays down (Josh, 2026-09-29: the path in the box
    // summoned it and cluttered what he was writing)
  } catch (err) { askstatus.textContent = "📷 not sent: " + err.message; }
}
 document.getElementById("askattach").addEventListener("click", () => {
  const btn = document.getElementById("askattach"), menu = document.getElementById("askattachmenu");
  const was = S.dropUpOpen === menu && menu.classList.contains("on");
  closeFileMenus();
  if (was) return;
  const r = btn.getBoundingClientRect();
  menu.style.left = Math.max(6, Math.min(r.right - 240, window.innerWidth - 246)) + "px"; // right-aligned to ＋: it sits at the AI window's right edge
  menu.style.bottom = (wmInnerHeight() - r.top + 6) + "px";
  menu.classList.add("on");
  S.dropUpOpen = menu;
});
document.getElementById("askattachmenu").addEventListener("click", () => closeDropUp(), {capture: true}); // the item's own handler still runs
document.getElementById("askshot").addEventListener("click", askShotTake);
document.getElementById("askshotx").addEventListener("click", () => { askShotClearAll(); askstatus.textContent = ""; });
document.getElementById("askpick").addEventListener("click", () => document.getElementById("askpickfile").click());
document.getElementById("askpickfile").addEventListener("change", e => {
  // copy BEFORE clearing: e.target.files is live, and WebKit empties it when
  // value is reset — the picker then "did nothing" (Josh, 2026-10-03, iPad)
  const files = Array.from(e.target.files || []); e.target.value = ""; askPickFiles(files);
});
function askInboxStart() { clearInterval(S.askInboxTimer); S.askInboxTimer = setInterval(() => { if (!document.hidden) { askInboxPoll(); askStatusPoll(); askResume(); } }, 60000); askInboxPoll(); askStatusPoll(); askResumeSoon(1500); }
if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("visibilitychange", () => { if (document.hidden) askDraftSave(); });
  if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("pagehide", askDraftSave);
}
  // The store key rides with the job: the reply belongs to the song that asked,
// even if another song is open by the time it lands (Josh, 2026-09-26: "scroll
// away … work on a song … get a notification").
function askFinish(jobId, text, key) { // the reply for a pending question landed: store it, drop the marker
  delete askPartial[jobId];
  key = key || askStoreKey();
  askSentCommit(key); // this context reached (and was acted on by) the bridge session — its cache entries are now confirmed
  askSeenCommit(key); // same: the "New since" lines it carried are now confirmed seen by the bridge
  const msgs = askStore(key).msgs;
  const i = askPendingIndex(msgs, jobId);
  if (i < 0) return;
  delete msgs[i].pending;
  msgs.splice(i + 1, 0, {role: "assistant", content: text, m: askModelName(), mode: appMode()});
  askSave(msgs, undefined, key);
  askLanded(key, false);
}
function askFail(jobId, note, key) { // no reply will come: keep the question, say why
  delete askPartial[jobId];
  key = key || askStoreKey();
  askSentDrop(key); // never confirmed landed — the full sections go again next time, not a stand-in for content the bridge may never have gotten
  askSeenDrop(key); // same: never mark a "new since" line seen that was never actually delivered
  const msgs = askStore(key).msgs;
  const i = askPendingIndex(msgs, jobId);
  if (i < 0) return;
  delete msgs[i].pending;
  msgs.splice(i + 1, 0, {role: "assistant", content: "⚠ " + note, m: askModelName(), mode: appMode()});
  askSave(msgs, undefined, key);
  askLanded(key, true);
}
// A reply landed. Sheet open on that song: redraw it (the live bubble may be
// a stale node — the sheet was closed and reopened mid-run). Otherwise the
// footer gets a gold ✦ badge, the ⚠ way: it stays until tapped, and the info
// strip says so once. Tapping opens Ask.
function askLanded(key, failed) {
  askSessionRefresh(); // a turn just landed on the bridge: its usage/turns grew
  if (asksheet.classList.contains("on") && key === askStoreKey()) { askRender(); return; }
  const b = document.getElementById("askreplybtn");
  b.style.display = "";
  const other = key !== askStoreKey() ? " in " + songTitleOf(key.replace(/^ff1roll-ask-/, "")) : "";
  setInfo((failed ? "✦ AI: no reply" : "✦ AI replied") + other + " — tap ✦ reply to read it");
}
async function askRun({msgs, text, sp, messages, jobId, live, key}) { // one exchange (tool rounds inside); the pending marker outlives a dropped connection
  const budget = askBudget();
  const est = askEstimate(askSys(), messages);
  askstatus.textContent = "thinking… (~" + (est >= 1000 ? (est / 1000).toFixed(1) + "k" : est) + " of " + Math.round(budget.win / 1000) + "k" + (budget.small ? ", small window — raise it in Settings if the server allows" : "") + ")";
  const ctl = typeof AbortController === "function" ? new AbortController() : {abort() {}, signal: undefined};
  S.askBusy = ctl;
  document.getElementById("askstop").style.display = "";
  document.getElementById("asksend").disabled = true;
  const jobs = await askJobsSupported(); // true / false / null = unreachable this instant (the POST decides)
  let cur = jobId, delivered = false; // cur: the job id the marker carries now (tool rounds move it); delivered: the Mac took the question
  try {
    let out = await aiProvider().chat({system: askSys(), messages, signal: ctl.signal, onDelta: raw => askShowThinking(live, raw), onStatus: t => { askstatus.textContent = t; }, tools: askToolsNow(), onTool: askRunTool, job: jobs !== false ? jobId : undefined,
      onOpen: () => { delivered = true; },
      onRound: id => { askRepending(key, cur, id); cur = id; if (live) live.dataset.job = id; },
      onNote: n => { if (!live.textContent || /^…/.test(live.textContent)) live.textContent = "… (" + n + ")"; askstatus.textContent = "working: " + n; }});
    out = out.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
    if (!out) out = "(no reply — try rephrasing)";
    askFillBubble(live, out);
    askFinish(cur, out, key);
    askstatus.textContent = "";
  } catch (err) {
    const aborted = err && err.name === "AbortError";
    const partial = live.textContent && !/^…/.test(live.textContent) ? live.textContent : ""; // a step note ("… (reading x)") is not an answer
    const http = !!(err && /^HTTP /.test(err.message));
    if (aborted) { if (partial) askFinish(cur, partial, key); else askFail(cur, "stopped", key); askstatus.textContent = "stopped"; if (!partial) { live.classList.add("err"); live.textContent = "⚠ stopped"; } }
    else if (jobs !== false && !http && delivered) { // the connection died, not the job: the answer is still cooking on the server
      askstatus.textContent = "the live stream was cut (Safari does that when the app leaves the screen) — the reply keeps cooking on the Mac; checking every few seconds";
      live.textContent = "… (still working — reopen or come back to see it)";
      askResumeSoon(3000);
    } else if (jobs !== false && !http && !delivered) { // no sign it arrived — but a relaunch cuts the stream before the first byte even when the Mac HAS it (Josh, 2026-09-29): keep it pending and ask the bridge (askResume: found → carries on, 404 → really not delivered)
      live.textContent = "… (checking whether the Mac got it)";
      askstatus.textContent = "";
      askResumeSoon(2000);
    } else { live.classList.add("err"); live.textContent = "⚠ " + err.message + " — check File → Settings… → AI model, and Test"; askFail(cur, err.message, key); askstatus.textContent = ""; }
  } finally {
    S.askBusy = null;
    document.getElementById("askstop").style.display = "none";
    document.getElementById("asksend").disabled = false;
  }
}
for (const [id, k] of [["asktermadvisor", "advisor"], ["asktermbuilder", "builder"]]) document.getElementById(id).addEventListener("change", async e => {
  try { await fetch(aiUrl() + "/v1/terminal-prefs", {method: "POST", headers: aiHeaders(), body: JSON.stringify({[k]: e.target.value})}); askstatus.textContent = k + "s will use " + e.target.value; }
  catch (err) { askstatus.textContent = "⚠ couldn't reach the bridge: " + err.message; }
});
async function askTerminalSend(text) { // the Terminal tab: queue it for the Mac's Claude Code; the reply comes back as a note
  const key = ASK_TERMINAL_KEY, msgs = askStore(key).msgs;
  const ctx = askTerminalContext(); // stages this turn's seen-watermark (askNewSinceLines) — committed below only if the POST actually lands
  const bodyText = ctx ? "<context>\n" + ctx + "\n</context>\n\n" + text : text;
  msgs.push({role: "user", content: text, t: Date.now()}); // stored/shown WITHOUT the context block, like every other chat (askStripContext strips it back out of history elsewhere; the terminal's own store never carries it at all)
  askSave(msgs, undefined, key);
  askMicOff(); // a live 🎤 writes its transcript back after we clear the box (Josh, 2026-09-30: the text stayed after Send)
  askinput.value = ""; askShotClearAll(); askDraftClear(); askGrow(); askComposing(false);
  askBubble("user", askClock(Date.now()) + askShotDisplayText(text));
  askstatus.textContent = "sending to the terminal…";
  try {
    const r = await fetch(aiUrl() + "/v1/terminal", {method: "POST", headers: aiHeaders(), body: JSON.stringify({text: bodyText})});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error && j.error.message || "HTTP " + r.status);
    askSeenCommit(key); // the bridge actually got it: this turn's "new since" lines are now confirmed seen
    askstatus.textContent = j.now && j.now.text ? "sent — the terminal is working: " + j.now.text : "sent — the terminal will answer here";
    S.askTerminalFast = Date.now() + 15 * 60000; // its answer shouldn't wait for the 60 s poll
    if (!S.askTerminalTimer) S.askTerminalTimer = setInterval(() => {
      if (Date.now() > S.askTerminalFast) { clearInterval(S.askTerminalTimer); S.askTerminalTimer = null; return; }
      if (!document.hidden) { askInboxPoll(); askStatusPoll(); }
    }, 5000);
  } catch (err) { // not queued: say so and give the words back, never lose them
    askSeenDrop(key); // never delivered: the "new since" lines it carried are still unseen
    msgs.pop(); askSave(msgs, undefined, key); askRender();
    askinput.value = text; askGrow();
    askstatus.textContent = "⚠ not sent — the Mac's bridge didn't answer (" + err.message + "); your message is back in the box";
  }
}
async function askSend() {
  const typed = askinput.value.trim();
  if ((!typed && !S.askShotPending.length) || S.askBusy || !S.song) return;
  const text = askShotOutgoing(typed);
  if (S.askTerminal) return askTerminalSend(text);
  if (cfg().aiBackend !== "browser" && !(await aiHostOk(aiUrl()))) { askstatus.textContent = "not sent"; return; }
  const sp = askSpan();
  S.askSpanFrozen = sp;
  document.getElementById("askspan").textContent = askSpanLabel(sp);
  const budget = askBudget();
  const msgs = askLoad();
  const ctx = askContext(sp, budget); // stages this turn's "New since your last message:" watermark (askNewSinceLines) — askFinish commits it, askFail drops it
  const messages = askBuildMessages(msgs, text, ctx, budget);
  const jobId = askJobId();
  msgs.push({role: "user", content: text, t: Date.now(), at: askSpanLabel(sp), pending: jobId, mode: appMode()}); // saved NOW: closing the sheet or leaving the app cannot lose it
  askSave(msgs);
  askMicOff(); // a live 🎤 would write its transcript back into the box after we clear it
  askinput.value = "";
  askShotClearAll();
  askDraftClear();
  askGrow();
  askComposing(false);
  askBubble("user", askShotDisplayText(text));
  const live = askBubble("ai", "…");
  live.dataset.job = jobId; // askResume finds THIS bubble by job, never "the last ai bubble"
  await askRun({msgs, text, sp, messages, jobId, live, key: askStoreKey()});
}
function askRepending(key, from, to) { // a tool round continues under a new job id: the marker follows it (re-read, never a stale array)
  const msgs = askStore(key).msgs, i = askPendingIndex(msgs, from);
  if (i < 0) return false;
  msgs[i].pending = to;
  askSave(msgs, undefined, key);
  return true;
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) { askResumeSoon(300); askInboxPoll(); } });
askInboxStart();
// Drag any sheet by its title line (and the capture panel by its title row).
// The offset lives in a transform so the overlay's centering still applies;
// it resets each time the sheet opens. Pointer capture keeps the drag alive
// when the finger leaves the title.
(function sheetDrag() {
  if (typeof document === "undefined" || !document.body) return;
  const handleFor = t => {
    if (t.closest && t.closest("button")) return null; // never start a drag from a button tap (a window's Dock control lives inside its h2)
    const h2 = t.closest && t.closest(".sheet > h2");
    if (h2) return {handle: h2, box: h2.parentElement};
    const row = t.closest && t.closest("#importsheet .row:first-child");
    if (row) return {handle: row, box: document.getElementById("importsheet")};
    return null;
  };
  let drag = null, size = null;
  // the ◢ grip on every sheet and on the capture panel (Josh, 2026-09-27: "resize them too by clicking in the corner")
  const addGrips = () => { for (const box of [...document.querySelectorAll(".sheet"), document.getElementById("importsheet") && document.getElementById("importsheet").querySelector(".metpanel")]) { if (!box || box.querySelector(":scope > .sheetgrip")) continue; const g = document.createElement("div"); g.className = "sheetgrip"; g.textContent = "◢"; g.setAttribute("aria-label", "Resize"); box.appendChild(g); } };
  addGrips();
  document.addEventListener("pointerdown", e => {
    if (e.button && e.button !== 0) return;
    const grip = e.target.closest && e.target.closest(".sheetgrip");
    if (grip) {
      // a docked sheet is fixed by the dock, not by drag-and-resize — its
      // divider resizes it instead
      if (e.target.closest && e.target.closest(".overlay.docked")) return;
      const box = grip.parentElement.classList.contains("metpanel") ? document.getElementById("importsheet") : grip.parentElement;
      const r = box.getBoundingClientRect();
      // a centered sheet grows out from its middle, so the top-left drifts up
      // and off the screen (Josh, 2026-09-27); hold the corner still by
      // translating half the growth. The capture panel is absolutely placed
      // and grows down-right on its own.
      const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(box.style.transform || "");
      size = {box, x0: e.clientX, y0: e.clientY, w0: r.width, h0: r.height, id: e.pointerId,
              tx: m ? +m[1] : 0, ty: m ? +m[2] : 0, centered: box.id !== "importsheet"};
      try { grip.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
      e.preventDefault(); return;
    }
    const hit = handleFor(e.target);
    if (!hit || !hit.box) return;
    // Phase B (drag-to-dock): a DOCKED window's title now also arms a drag —
    // it's undocked once the drag crosses the threshold below (a plain tap
    // must not rip it out of its dock).
    const overlay = hit.box.closest && hit.box.closest(".overlay");
    const wasDocked = !!(overlay && overlay.classList.contains("docked"));
    const wmId = overlay && overlay.id;
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(hit.box.style.transform || "");
    drag = {box: hit.box, x0: e.clientX, y0: e.clientY, dx: m ? +m[1] : 0, dy: m ? +m[2] : 0, id: e.pointerId,
            wasDocked, wmId, moved: false, zone: null};
    if (!wasDocked) hit.box.classList.add("dragging");
    try { hit.handle.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    e.preventDefault();
  }, {capture: true});
  document.addEventListener("pointermove", e => {
    if (size && e.pointerId === size.id) {
      const w = Math.max(280, Math.round(size.w0 + e.clientX - size.x0)), h = Math.max(160, Math.round(size.h0 + e.clientY - size.y0));
      size.box.style.width = w + "px"; size.box.style.maxWidth = "none"; size.box.style.height = h + "px"; size.box.style.maxHeight = "none";
      if (size.centered) size.box.style.transform = "translate(" + Math.round(size.tx + (w - size.w0) / 2) + "px, " + Math.round(size.ty + (h - size.h0) / 2) + "px)";
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.wasDocked && !drag.moved) {
      // a tap on a docked title must not undock it — only a real drag does
      // (the app's own 8px gesture threshold, reused here for drag-to-dock)
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) return;
      drag.moved = true;
      drag.box.classList.add("dragging");
      wmFloat(drag.wmId); // undock — its node moves back to its floating home
      drag.box.style.transform = ""; // measure the floating (centered) position it just landed at…
      const r = drag.box.getBoundingClientRect();
      drag.dx = e.clientX - (r.left + r.width / 2); drag.dy = e.clientY - (r.top + r.height / 2); // …so the drag continues under the SAME finger position instead of jumping to center
      drag.x0 = e.clientX; drag.y0 = e.clientY;
    } else if (!drag.moved) {
      drag.moved = true; // a floating window: unchanged behavior — moves from the very first pixel
    }
    drag.box.style.transform = "translate(" + Math.round(drag.dx + e.clientX - drag.x0) + "px, " + Math.round(drag.dy + e.clientY - drag.y0) + "px)";
    if (drag.wmId && WM_WINDOWS[drag.wmId] && WM_WINDOWS[drag.wmId].dockable) {
      drag.zone = wmZoneForPointer(e.clientX, e.clientY);
      wmShowDropZone(drag.zone);
    }
  });
  // where you left a sheet is where it reopens, on this device (Josh,
  // 2026-09-27): translate + size per overlay id, a UI pref in localStorage
  const sheetKey = box => { const ov = box.id === "importsheet" ? box : box.closest(".overlay"); return ov && ov.id ? "ff1roll-sheetpos-" + ov.id : null; };
  const remember = box => {
    const k = sheetKey(box); if (!k) return;
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(box.style.transform || "");
    const rec = {tx: m ? +m[1] : 0, ty: m ? +m[2] : 0, w: box.style.width || "", h: box.style.height || ""};
    try { localStorage.setItem(k, JSON.stringify(rec)); } catch (err) { /* private mode */ }
  };
  const restore = box => { // the saved spot, nudged back on screen if the window shrank; nothing saved = centered, as before
    box.style.transform = ""; box.style.width = ""; box.style.height = ""; box.style.maxWidth = ""; box.style.maxHeight = "";
    const k = sheetKey(box); let rec = null;
    try { rec = k && JSON.parse(localStorage.getItem(k) || "null"); } catch (err) { rec = null; }
    if (!rec) return;
    if (rec.w) { box.style.width = rec.w; box.style.maxWidth = "none"; }
    if (rec.h) { box.style.height = rec.h; box.style.maxHeight = "none"; }
    box.style.transform = "translate(" + rec.tx + "px, " + rec.ty + "px)";
    // measured right away (the overlay is already display:flex here); an
    // animation frame would never come in a hidden tab
    const r = box.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
    if (!r.width) return;
    let dx = 0, dy = 0;
    if (r.right > W - 8) dx = W - 8 - r.right; if (r.left + dx < 8) dx += 8 - (r.left + dx);
    if (r.bottom > H - 8) dy = H - 8 - r.bottom; if (r.top + dy < 8) dy += 8 - (r.top + dy);
    if (dx || dy) box.style.transform = "translate(" + Math.round(rec.tx + dx) + "px, " + Math.round(rec.ty + dy) + "px)";
  };
  const end = e => {
    if (size && (!e || e.pointerId === size.id)) { remember(size.box); size = null; }
    if (drag && (!e || e.pointerId === drag.id)) {
      drag.box.classList.remove("dragging");
      wmHideDropZone();
      // released over a drop zone (drag-to-dock): dock there instead of
      // remembering a floating position
      if (drag.moved && drag.zone && drag.wmId && WM_WINDOWS[drag.wmId] && WM_WINDOWS[drag.wmId].dockable) {
        if (drag.zone.side === "bottom") wmDockBottomWindow(drag.wmId);
        else wmDockSide(drag.wmId, drag.zone.side, drag.zone.mode);
      } else {
        remember(drag.box);
      }
      drag = null;
    }
  };
  document.addEventListener("pointerup", end); document.addEventListener("pointercancel", end);
  // a sheet opens where you left it (or centered, the first time) when its
  // overlay turns on — a docked sheet skips this, the dock lays it out instead
  if (typeof MutationObserver === "function") new MutationObserver(muts => {
    for (const mu of muts) { const el = mu.target; if (el.classList && el.classList.contains("on") && !el.classList.contains("docked")) { const box = el.classList.contains("overlay") ? el.querySelector(".sheet") : el.id === "importsheet" ? el : null; if (box) restore(box); } }
  }).observe(document.body, {attributes: true, attributeFilter: ["class"], subtree: true});
})();
                             S.wm = wmLoad();
// ⋯ More is gone entirely now (a drop-up, 2026-10-01, then removed outright
// in the chrome density follow-up the same day) — a device that had
// "moresheet" docked or tabbed from before either change would otherwise
// strand a dead id in wm forever (wmLayoutAll has nothing to lay out for
// it; makeWindow() is never called for it either). Purge it once, here,
// before any layout runs — pure (wmRemoveSideTab/wmClearBottom take no
// DOM), so it's safe at module-eval time in the vm harness too.
for (const side of ["left", "right"]) if (S.wm[side] && S.wm[side].ids && S.wm[side].ids.includes("moresheet")) S.wm = wmRemoveSideTab(S.wm, side, "moresheet");
if (S.wm.bottom && S.wm.bottom.ids && S.wm.bottom.ids.includes("moresheet")) S.wm = wmClearBottom(S.wm, "moresheet");
wmSave(S.wm);
try { localStorage.removeItem("ff1roll-sheetpos-moresheet"); } catch (err) { /* private mode */ }  // Applies wm[side] to the DOM: parks EVERY member of the tab group (full or
if (typeof document !== "undefined" && document.body) { // real browser only — dismissing the menu is not unit tested (see comment above)
  document.addEventListener("pointerdown", e => {
    const menu = document.getElementById("wmmenu");
    if (menu.classList.contains("on") && !(e.target.closest && (e.target.closest("#wmmenu") || e.target.closest(".wmdock")))) wmCloseMenu();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") wmCloseMenu(); });
}
// ---- migrate the windows onto the shared window shape (phase A, extended
// footer v2 tweaks 2026-09-30) — asksheet already had a right-only dock;
// the rest are new. infosheet
// (Status, the full-message reader) is registered but NOT dockable (Josh,
// 2026-09-29) — a one-shot reveal for a truncated status line isn't a panel
// worth pinning open while working the roll, same reasoning as the import
// hub below. Settings (#settingssheet, not yet migrated onto makeWindow at
// all) stays non-dockable too.
makeWindow("asksheet", {dockable: true});
makeWindow("notelistsheet", {dockable: true});
makeWindow("instsheet", {dockable: true});
makeWindow("jobssheet", {dockable: true});
makeWindow("pubjobsheet", {dockable: true});
makeWindow("mixersheet", {dockable: true}); // Logic-style: dockable to the bottom
// ⋯ More was briefly the seventh window (footer v2 tweaks, 2026-09-30),
// then a drop-up (2026-10-01), then removed entirely (chrome density
// follow-up, 2026-10-01 pm) — its tools are in View ▾ and the footer now;
// nothing here was ever registered for it.
makeWindow("infosheet", {dockable: false});
// the import hub (docs/import-hub-design.md): a one-shot picker, not a panel
// worth pinning open while working the roll — registered so it's a known
// window (WM_WINDOWS), but not dockable, so it gets no Dock button.
makeWindow("importhub", {dockable: false});
makeWindow("versionssheet", {dockable: false});
wmSideDividerize("wmdivider-left-full", "left");
wmSideDividerize("wmdivider-left-inner", "left");
wmSideDividerize("wmdivider-right-full", "right");
wmSideDividerize("wmdivider-right-inner", "right");
(function wmBottomHeightDividerize() { // along the bottom dock's top edge — drag up (negative clientY delta) grows it
  const divider = document.getElementById("wmdivider-bottomh");
  let drag = null, lastTap = -Infinity; // double-tap resets to the default height
  divider.addEventListener("pointerdown", e => {
    if (e.button && e.button !== 0) return;
    if (!S.wm.bottom) return;
    const now = performance.now();
    if (now - lastTap < 350) {
      lastTap = -Infinity;
      S.wm = wmSetBottomHeight(S.wm, WM_DEFAULT_H, wmInnerHeight());
      wmSave(S.wm);
      wmLayoutAll();
      e.preventDefault();
      return;
    }
    lastTap = now;
    drag = {y0: e.clientY, h0: S.wm.bottom.h, id: e.pointerId};
    divider.classList.add("dragging");
    try { divider.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    e.preventDefault();
  });
  document.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id || !S.wm.bottom) return;
    S.wm = wmSetBottomHeight(S.wm, drag.h0 - (e.clientY - drag.y0), wmInnerHeight());
    wmLayoutAll();
  });
  const end = e => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    divider.classList.remove("dragging");
    drag = null;
    wmSave(S.wm);
  };
  document.addEventListener("pointerup", end); document.addEventListener("pointercancel", end);
})();
(function wmBottomSplitDividerize() { // between the bottom dock's two slots, only shown with both occupied
  const divider = document.getElementById("wmdivider-bottomsplit");
  let drag = null;
  divider.addEventListener("pointerdown", e => {
    if (e.button && e.button !== 0) return;
    if (!S.wm.bottom) return;
    const r = document.getElementById("dockbottom").getBoundingClientRect();
    drag = {x0: e.clientX, split0: S.wm.bottom.split != null ? S.wm.bottom.split : 0.5, width: r.width || wmInnerWidth(), id: e.pointerId};
    divider.classList.add("dragging");
    try { divider.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    e.preventDefault();
  });
  document.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id || !S.wm.bottom) return;
    S.wm = wmSetBottomSplit(S.wm, drag.split0 + (e.clientX - drag.x0) / Math.max(1, drag.width));
    wmLayoutAll();
  });
  const end = e => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    divider.classList.remove("dragging");
    drag = null;
    wmSave(S.wm);
  };
  document.addEventListener("pointerup", end); document.addEventListener("pointercancel", end);
})();
// growing/shrinking the window re-checks wmAllowed() live: crossing below
// phone width mid-session floats every docked window (the pref itself is
// untouched — growing back re-offers and reapplies it)
window.addEventListener("resize", wmLayoutAll);
function askNoteSeen() { // the notes are on screen: the ✉ light and its footer line go (Josh, 2026-09-29: it stayed up with the panel open)
  document.getElementById("askbtn").classList.remove("hasnote");
  if (/^✉ a note from your Mac/.test(S.infoFull || "")) setInfo("");
}
function openAsk() {
  if (!S.song) return;
  askBadgeOff();
  askNoteSeen();
  askTabsApply(); // Settings may have changed the backend since
  askInboxPoll();
  askStatusPoll();
  askSessionRefresh();
  askRender();
  askRefresh();
  askModeButtons(); // sets the placeholder for the mode (and the "Now:" strip)
  asksheet.classList.add("on");
  wmLayoutAll(); // reopens docked if it was docked (open-items.md "a real windowing system")
  askGrow();
  askScrollEnd(); // the log was drawn while the sheet was display:none (scrollHeight 0), so every open landed at the top (Josh, 2026-09-27)
  askFocusIfKeyboard();
}
function askBtnTap() { if (deployActive()) return deployAskTap(); openAsk(); } // a countdown or a hold in effect: the install sheet, not the chat
document.getElementById("askbtn").addEventListener("click", askBtnTap);
for (const [id, mode] of [["askmodesong", "song"], ["askmodegen", "general"], ["askmodeterm", "terminal"]]) document.getElementById(id).addEventListener("click", () => {
  if ((S.askTerminal ? "terminal" : S.askGeneral ? "general" : "song") === mode) return;
  askSetMode(mode);
  askRender(); askRefresh(); askSessionRefresh();
});
document.getElementById("asknowstrip").addEventListener("click", askStatusToggle);
document.getElementById("askreplybtn").addEventListener("click", openAsk);
document.getElementById("askgear").addEventListener("click", () => { asksheet.classList.remove("on"); openSettingsSheet(); });
document.getElementById("askclear").addEventListener("click", async () => { // Clear = new session; unsaved messages are the one thing it can destroy
  const n = askUnsavedCount();
  if (n && !(await appConfirm("Clear chat", n + " message" + (n === 1 ? " is" : "s are") + " not in the repo yet — Save the song first to keep " + (n === 1 ? "it" : "them") + ". Clear anyway?", "Clear", "Keep"))) return;
  localStorage.removeItem(askStoreKey()); askSentReset(askStoreKey()); askRender(); updateSongBtn();
  // Clear really resets (open-items.md "NEXT: AI SESSION CONTROLS" #1, Josh:
  // "the app's Clear chat only clears this device's log and never tells the
  // bridge, so the same Claude session keeps being resumed and growing"):
  // drop the bridge's session id too, when the backend is the bridge —
  // best-effort, never blocks the local clear above
  if (S.askCaps.bridge && S.askCaps.sessions && !S.askTerminal) {
    const key = askSessionName();
    delete S.askSessionCache[key];
    try { await fetch(aiUrl() + "/v1/sessions/" + encodeURIComponent(key), {method: "DELETE", headers: aiHeaders()}); } catch (err) { /* the local clear already happened; the bridge just keeps resuming the old one */ }
    askSessionRender();
  }
});
document.getElementById("asksend").addEventListener("click", askSend);
document.getElementById("askstop").addEventListener("click", () => { if (S.askBusy) S.askBusy.abort(); });
function askMicOff() { // Send clears the box: a late result must not refill it
  if (S.micBtn === document.getElementById("askmic")) micStop(true);
  // ■ Stop leaves the stopped session's onresult attached (Safari's final
  // words arrive after stop) — a Send right after it must silence that too,
  // or the late transcript lands in the emptied box (Josh, 2026-09-30)
  if (S.micPrev) { S.micPrev.onresult = null; try { S.micPrev.abort(); } catch (err) { /* already gone */ } S.micPrev = null; }
}
askinput.addEventListener("input", askGrow);
askinput.addEventListener("blur", () => { if (!(typeof S.micBtn !== "undefined" && S.micBtn === document.getElementById("askmic"))) askComposing(false); }); // the draft is saved; a build may go ahead
document.getElementById("askmic").addEventListener("click", () => {
  if (!SPEECH) { askstatus.textContent = "no speech recognition in this browser — the keyboard mic still works"; return; }
  micToggle(document.getElementById("askmic"), askinput, s2 => { askstatus.textContent = s2; });
});
askinput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askSend(); }
});

 function askWriteNotes(a) {
  const gate = askWritableGate();
  if (gate) throw new Error(gate);
  a = a || {};
  const ti = askFindTrackIndex(a.track);
  if (trackIsDrums(ti)) throw new Error("\"" + (S.song.tracks[ti].name || "track " + (ti + 1)) + "\" is a drum/noise track — write_notes doesn't write there");
  const bt = barTicks(), qt = beatTicks(), beats = beatsPerBarDisp();
  const v = askWriteNotesValidate(a.notes, bt, qt, beats);
  if (v.error) throw new Error(v.error);
  let t0 = 0, t1 = 0; // default: erase nothing (t0 === t1 never satisfies applyTake's "t >= t0 && t < t1")
  if (a.replace) {
    const r = a.replace;
    const fb = Math.max(1, Math.round(+r.from_bar || 1)), fq = Math.max(1, +(r.from_beat !== undefined ? r.from_beat : 1));
    const tb = Math.max(fb, Math.round(+(r.to_bar !== undefined ? r.to_bar : fb)));
    const tq = r.to_beat !== undefined ? Math.max(1, +r.to_beat) : beats + 1;
    t0 = (fb - 1) * bt + (fq - 1) * qt;
    t1 = Math.max(t0 + 1, (tb - 1) * bt + (tq - 1) * qt);
  }
  const hits = v.hits.sort((x, y) => x.t - y.t || x.p - y.p);
  const added = applyTake(ti, t0, t1, hits);
  const bars = a.notes.map(n => Math.round(+n.bar)), lo = Math.min(...bars), hi = Math.max(...bars);
  const where = lo === hi ? ("bar " + lo) : ("bars " + lo + "–" + hi);
  return {ok: true, note: "wrote " + added + " note" + (added === 1 ? "" : "s") + " on " + (S.song.tracks[ti].name || "track " + (ti + 1)) + ", " + where};
}

 function askInsertBars(a) { // {at_bar, count}: empty bars, same shift as Edit ▾ → Insert bars…
  const gate = askWritableGate();
  if (gate) throw new Error(gate);
  a = a || {};
  const count = Math.round(+a.count || 0);
  if (!(count >= 1)) throw new Error("count must be ≥ 1");
  const {atBar} = askBarsValidate(a, false);
  const bt = barTicks();
  insertTime((atBar - 1) * bt, count * bt);
  return {ok: true, note: "inserted " + count + " empty bar" + (count === 1 ? "" : "s") + " at bar " + atBar + " — everything after moved " + count + " bar" + (count === 1 ? "" : "s") + " later"};
}
function askCopyBars(a) { // {from_bar, to_bar, at_bar}: repeat/duplicate bars — insert + copy, one undo step
  const gate = askWritableGate();
  if (gate) throw new Error(gate);
  a = a || {};
  const {fromBar, toBar, atBar} = askBarsValidate(a, true);
  const bt = barTicks(), count = toBar - fromBar + 1;
  const sourceStart = (fromBar - 1) * bt, sourceEnd = toBar * bt, T = (atBar - 1) * bt, delta = count * bt;
  // snapshot the source range (every track, drums included) BEFORE the
  // shift mutates live note objects — ticks stored relative to sourceStart
  // so the copy lands correctly at T regardless of where T falls relative
  // to the source (before, after, or overlapping it)
  const snapshot = [];
  S.song.tracks.forEach((tr, ti) => tr.notes.forEach(n => {
    if (!n.gone && n.t >= sourceStart && n.t < sourceEnd) snapshot.push({ti, t: n.t - sourceStart, d: n.d, p: n.p, v: n.v});
  }));
  const {modItems, annoBefore} = openGapShift(T, delta);
  const added = [];
  for (const h of snapshot) {
    const tr = S.song.tracks[h.ti], isAdd = !isComposition(), t = T + h.t;
    tr.notes.push({t, d: h.d, p: h.p, v: h.v, added: isAdd});
    if (S.song.rawNotes) S.song.rawNotes[h.ti].push({t: t + S.chopS, d: h.d, p: h.p, v: h.v, added: isAdd});
    added.push({ti: h.ti, ni: tr.notes.length - 1});
  }
  pushUndo({kind: "group", entries: [{kind: "mod", items: modItems}, {kind: "anno", json: annoBefore}, {kind: "addBatch", items: added}]});
  finalizeNotes();
  saveEdits(); // persists the copied (added:true) notes for an edited-capture song; drafts whole for a composition
  computeSongEnd();
  saveLocalNotes(); // the shifted annotation layer
  saveDraft();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  const fromLabel = fromBar === toBar ? ("bar " + fromBar) : ("bars " + fromBar + "–" + toBar);
  return {ok: true, note: "copied " + fromLabel + " to bar " + atBar + "; everything after moved " + count + " bar" + (count === 1 ? "" : "s") + " later"};
}
// delete_bars (2026-10-02, open-items 22:20) — Josh in the terminal: "Is
// there a way to delete a bar?" … "we have Insert bars in the Edit [menu],
// it would be next to that". The inverse of insert_bars/copy_bars: built on
// closeGap (closeGap is to openGapShift as this is to insertTime) so the
// same note-clip/shift and annotation-shrink/move-to-cut rules back both
// the menu's Delete bars… and this tool.
function askDeleteBars(a) { // {from_bar, count}: removes bars — same gate/validation shape as copy_bars
  const gate = askWritableGate();
  if (gate) throw new Error(gate);
  a = a || {};
  const nBars = askBarsCount();
  const fromBar = Math.round(+a.from_bar || 0);
  if (!(fromBar >= 1)) throw new Error("from_bar must be ≥ 1");
  const count = Math.round(+a.count || 0);
  if (!(count >= 1)) throw new Error("count must be ≥ 1");
  const toBar = fromBar + count - 1;
  if (toBar > nBars) throw new Error("bars " + fromBar + "–" + toBar + " don't all exist — this song has " + nBars + " bar" + (nBars === 1 ? "" : "s"));
  const bt = barTicks();
  const r = deleteTime((fromBar - 1) * bt, count * bt);
  const where = count > 1 ? ("bars " + fromBar + "–" + toBar) : ("bar " + fromBar);
  return {ok: true, note: where + " removed — everything after moved " + count + " bar" + (count === 1 ? "" : "s") + " earlier" +
    (r.movedToT ? "; " + r.movedToT + " annotation" + (r.movedToT === 1 ? "" : "s") + " moved to bar " + fromBar : "")};
}


   function renderFolderUI() {
  const nameEl = document.getElementById("foldername");
  const pick = document.getElementById("folderpick");
  const forget = document.getElementById("folderforget");
  const recon = document.getElementById("filefolder");
  const native = !!nativeFs();
  document.getElementById("filesrow").style.display = native ? "" : "none";
  document.getElementById("folderrow").style.display = native ? "none" : "";
  if (native) { // the iPad app: nothing to set — Files is where saves live, GitHub is where Publish goes
    document.getElementById("fileshelp").textContent = "Your songs are kept in Files → On My iPad → Night Roll: every Save writes a copy there. Publish sends them to GitHub.";
  } else if (!folderSupported() && fsRoot.mode !== "opfs") {
    // Chrome hides the API on plain http (except localhost/127.0.0.1) — say
    // which of the two it is, or a LAN-served dev copy reads as "wrong browser"
    const insecure = typeof window !== "undefined" && window.isSecureContext === false;
    const brave = typeof navigator !== "undefined" && !!navigator.brave; // Brave ships the API switched OFF (Josh hit this, 2026-09-15)
    nameEl.textContent = insecure
      ? "needs https (or localhost) — this page is plain http, so Chrome hides the folder door; saves go to GitHub here"
      : brave ? "Brave turns this off: open brave://flags/#file-system-access-api, enable, relaunch — or use Chrome"
      : "needs Chrome or Edge on a computer — saves go to GitHub here";
    pick.style.display = "none";
    forget.style.display = "none";
  } else if (fsRoot.handle) {
    nameEl.textContent = (fsRoot.needsGrant ? "⚠ reconnect: " : "📁 ") + fsRoot.name +
      (fsRoot.needsGrant ? " (Chrome needs a fresh OK)" : " — every Publish writes here, nothing goes to GitHub");
    pick.textContent = fsRoot.needsGrant ? "Reconnect" : "Change folder…";
    pick.style.display = "";
    forget.style.display = fsRoot.mode === "opfs" ? "none" : "";
  } else {
    nameEl.textContent = "not set — saves go to GitHub";
    pick.textContent = "Choose folder…";
    pick.style.display = "";
    forget.style.display = "none";
  }
  recon.style.display = fsRoot.handle && fsRoot.needsGrant ? "" : "none";
  document.getElementById("folderonlyrow").style.display = folderActive() ? "" : "none";
  document.getElementById("folderonly").checked = localStorage.getItem("ff1roll-folderonly") === "1";
  document.getElementById("filesave").textContent = folderActive() ? "Publish to folder…" : "Publish…";
  updateSyncBtn();
  updateSongBtn();
}
async function folderAfterChange(msg) { // the catalog and the open song both depend on where data lives
  renderFolderUI();
  albumMetaCache && Object.keys(albumMetaCache).forEach(k => delete albumMetaCache[k]);
  try { await initCatalog(); } catch (err) { /* offline: the folder alone still lists */ }
  if (S.currentPath) { const k = S.currentPath; S.songKey = null; await loadSong(k).catch(() => {}); }
  setInfo(msg);
}
async function chooseFolder() { // must run inside a user gesture
  if (fsRoot.handle && fsRoot.needsGrant) { // reconnect: same folder, fresh permission
    if (await folderPermission(true) === "granted") { fsRoot.needsGrant = false; await folderAfterChange("folder reconnected: " + fsRoot.name); }
    else setInfo("Chrome didn't grant the folder — choose it again");
    return;
  }
  if (!folderSupported()) return;
  let h;
  try { h = await window.showDirectoryPicker({mode: "readwrite", id: "nightroll"}); }
  catch (err) { return; } // cancelled
  fsRoot.handle = h; fsRoot.name = h.name; fsRoot.mode = "picker"; fsRoot.needsGrant = false;
  await idbFsPut(h);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  await folderAfterChange("saving to folder: " + h.name);
}
async function forgetFolder() {
  fsRoot.handle = null; fsRoot.name = ""; fsRoot.mode = null; fsRoot.needsGrant = false;
  await idbFsPut(null);
  await folderAfterChange("folder forgotten — saves go to GitHub again");
}
         function discardPending(key, idx) { // drop one never-synced note from the stash
  let notes = [];
  try { notes = JSON.parse(localStorage.getItem("ff1roll-notes-" + key) || "[]"); }
  catch (err) {}
  const [gone] = notes.splice(idx, 1);
  if (notes.length) localStorage.setItem("ff1roll-notes-" + key, JSON.stringify(notes));
  else localStorage.removeItem("ff1roll-notes-" + key);
  if (gone && key === S.songKey) { // it may be live in the open song — drop there too
    const k = S.rollnotes.findIndex(n => n.added && n.b1 === gone.b1 &&
      n.q1 === gone.q1 && n.text === gone.text);
    if (k >= 0) { S.rollnotes.splice(k, 1); finalizeNotes(); draw(); }
  }
  updateSyncBtn();
  renderSyncPending();
}
document.getElementById("syncbtn").addEventListener("click", openSyncSheet);
for (const p of CFG_PANES) document.getElementById("cfgtab-" + p).addEventListener("click", () => cfgShowPane(p));
function applyTextSize(v) { try { document.documentElement.style.setProperty("--userscale", v); } catch (err) {} }
function settingsPersist(id) {
  const v = el => document.getElementById(el).value.trim();
  const keep = (k, val) => { if (val) localStorage.setItem(k, val); else localStorage.removeItem(k); };
  switch (id) {
    case "ghtoken": keep("ff1roll-ghtoken", v("ghtoken")); ghCheckOut(""); updateSyncBtn(); updateSongBtn(); break; // connecting/disconnecting GitHub changes whether the footer Publish button and ● show (Model B)
    case "cfglearning": setAppMode(document.getElementById("cfglearning").checked ? "learning" : "normal"); applyMode(); break;
    case "cfgnotetapcursor": { try { localStorage.setItem("ff1roll-notetapcursor", document.getElementById("cfgnotetapcursor").checked ? "1" : "0"); } catch (err) { /* private mode */ } break; }
    case "cfgpeninstant": { try { localStorage.setItem("ff1roll-peninstant", document.getElementById("cfgpeninstant").checked ? "1" : "0"); } catch (err) { /* private mode */ } break; }
    case "cfgrecsnap": { try { localStorage.setItem("ff1roll-recsnap", document.getElementById("cfgrecsnap").checked ? "1" : "0"); } catch (err) { /* private mode */ } break; }
    case "cfgtextsize": { const tv = v("cfgtextsize") || "1"; try { localStorage.setItem("ff1roll-textsize", tv); } catch (err) { /* private mode */ } applyTextSize(tv); break; }
    case "cfgdebuglog": { try { if (document.getElementById("cfgdebuglog").checked) localStorage.setItem("ff1roll-debuglog", "1"); else localStorage.removeItem("ff1roll-debuglog"); } catch (err) { /* private mode: stays off */ } errChip(); break; }
    case "cfgchipstream": { const sv = v("cfgchipstream") || "auto"; try { localStorage.setItem("ff1roll-chipstream", sv); } catch (err) { /* private mode: stays the default */ } break; }
    case "cfgaikey": keep("ff1roll-aikey", v("cfgaikey")); S.askModelCache = null; break;
    case "cfgaibackend": saveCfg({aiBackend: v("cfgaibackend") === "browser" ? "browser" : "remote"}); aiBackendRows(); break;
    case "cfgaibrowsermodel": saveCfg({aiBrowserModel: v("cfgaibrowsermodel") || "Llama-3.2-1B-Instruct-q4f16_1-MLC"}); break;
    case "cfgaiurl": {
      const url = (v("cfgaiurl") || "http://localhost:1234").replace(/\/+$/, "");
      if (url !== cfg().aiUrl) { saveCfg({aiUrl: url}); S.askModelCache = null; aiModelMenu([], cfg().aiModel); }
      break;
    }
    case "cfgaimodel": saveCfg({aiModel: v("cfgaimodel")}); break;
    case "cfgaiwindow": saveCfg({aiWindow: parseInt(v("cfgaiwindow"), 10) || 8192}); break;

    case "cfgsongsrepo": { // annotations follow unless the advanced row split them on purpose
      const c = cfg(), repo = v("cfgsongsrepo") || "Night-Roll-App/night-roll", patch = {songsRepo: repo};
      if (c.analysisRepo === c.songsRepo) patch.analysisRepo = repo;
      // saveCfg stores every default with the first saved setting, so a new
      // user's cfg carried Josh's archive; switching to their own songs repo
      // then published their game files to a repo their token can't write
      // (Josh, 2026-09-28: "it's going to try to push to my NSF repo?")
      if (repo !== "Night-Roll-App/night-roll" && c.nsfRepo === "Night-Roll-App/nsf-archive") { patch.nsfRepo = ""; patch.nsfBase = ""; document.getElementById("cfgnsfrepo").value = ""; }
      saveCfg(patch); ghCheckOut(""); break;
    }
    case "cfgnsfrepo": { const r = v("cfgnsfrepo"); saveCfg({nsfRepo: r, nsfBase: r ? "https://raw.githubusercontent.com/" + r + "/main" : ""}); cfg.c = null; break; }
    default: return; // folderonly has its own listener
  }
  if (id.startsWith("cfgai")) askRefresh();
}
document.getElementById("settingssheet").addEventListener("change", e => { if (e.target && e.target.id) settingsPersist(e.target.id); });
document.getElementById("ghcheck").addEventListener("click", ghCheck);
document.getElementById("filesettings").addEventListener("click", () => {
  closeFileMenus();
  openSettingsSheet();
});
document.getElementById("folderpick").addEventListener("click", () => { chooseFolder(); });
document.getElementById("folderforget").addEventListener("click", () => { forgetFolder(); });
document.getElementById("folderonly").addEventListener("change", e => {
  if (e.target.checked) localStorage.setItem("ff1roll-folderonly", "1"); else localStorage.removeItem("ff1roll-folderonly");
  folderAfterChange(e.target.checked ? "the song list is now your folder only" : "the song list shows the site's albums again");
});
document.getElementById("filefolder").addEventListener("click", () => { closeFileMenus(); chooseFolder(); });
// Every sheet closes three ways (Josh, 2026-08-25: "I have a lot of problems
// with our modals" — opening the notes list by mistake meant scrolling to the
// bottom to find Close). Tap the backdrop, press Esc, or hit a ✕ that stays
// pinned at the top while the body scrolls. confirmsheet is exempt: it asks a
// question and has to get an answer.
const MODAL_KEEP = new Set(["confirmsheet"]);
if (typeof document.querySelectorAll === "function") { // vm harness stubs document
// A sheet keeps the scroll position it had when it was last closed, so
// reopening the notes list dropped Josh halfway down it (2026-08-25). Reset on
// open wherever the open happens — watching the class beats hunting ~30 call
// sites and cannot miss a future one. Scoped to the overlays themselves, NOT
// document.body: an app that repaints at 60fps must not run an observer over
// every class write in the tree. Overlay classes change only when a sheet
// opens or closes.
const SHEET_TOP = new MutationObserver(ms => {
  for (const m of ms) {
    // VoiceOver (2026-09-30): a docked window sits beside the roll like a
    // panel, not over it — aria-modal="true" would tell a screen reader
    // everything else on the page is inert, which is false while docked.
    // Recomputed on every class write (open/close AND dock-side changes all
    // touch the class), so it never goes stale.
    m.target.setAttribute("aria-modal", m.target.classList.contains("on") && !m.target.classList.contains("docked") ? "true" : "false");
    // any migrated, docked window: reserve/free its dock's space alongside
    // its own visibility, however it closes (✕, backdrop, Esc, or
    // reopening) — the one choke point every close path already runs through
    if (WM_WINDOWS[m.target.id]) wmLayoutAll();
    if (!m.target.classList.contains("on")) { // closing: a live 🎤 inside must not keep transcribing
      if (S.micBtn && m.target.contains(S.micBtn)) micStop(true);
      if (m.target.id === "mixersheet") teardownMixerMeters(); // ✕/backdrop/Esc all end here too — no cost while closed
      // VoiceOver: give focus back to whatever opened this sheet (a button
      // in most cases) — otherwise focus is left on a now-hidden node and a
      // screen reader user loses their place. Deferred repeat closes (the
      // Escape handler below, or a second class write before this one even
      // ran) leave nothing to restore — harmless no-op.
      if (m.target._srReturnFocus) {
        const back = m.target._srReturnFocus;
        m.target._srReturnFocus = null;
        if (typeof back.focus === "function") try { back.focus(); } catch (err) {}
      }
      continue;
    }
    // only a sheet that has just OPENED starts at its top: docking, undocking
    // and switching sides rewrite the class too, and reset the AI chat to its
    // first message every time (Josh, 2026-09-29, the docked AI panel)
    if (/(^|\s)on(\s|$)/.test(m.oldValue || "")) continue;
    if (m.target.id === "mixersheet") { // opened some other way than openMixer() (e.g. a docked tab click): render + start meters
      renderMixer();
      ensureMixerMeters();
      ensureMixerMeterLoop();
    }
    const sh = m.target.querySelector(".sheet");
    if (sh) sh.scrollTop = 0;
    // VoiceOver: remember who had focus, then move focus INTO the sheet —
    // deferred one frame so a sheet's own open-time focus (e.g. rename's
    // text input, already existing code) wins if it set one; only step in
    // when nothing in the sheet already has focus.
    m.target._srReturnFocus = (typeof document !== "undefined" && document.activeElement && document.activeElement !== document.body) ? document.activeElement : null;
    const target = m.target;
    requestAnimationFrame(() => {
      if (!target.classList.contains("on")) return; // closed again before the frame landed
      if (document.activeElement && document.activeElement !== document.body && target.contains(document.activeElement)) return; // the sheet already focused itself
      // the SHEET itself, never a field inside it: focusing a text box pops
      // the iPad keyboard every time a sheet opens (Josh already fought an
      // unwanted keyboard in ✦ AI); VoiceOver still announces the dialog
      const sh2 = target.querySelector(".sheet");
      const land = sh2 || target;
      if (land && !land.hasAttribute("tabindex")) land.setAttribute("tabindex", "-1");
      if (land && typeof land.focus === "function") try { land.focus({preventScroll: true}); } catch (err) {}
    });
  }
});
for (const ov of document.querySelectorAll(".overlay")) {
  SHEET_TOP.observe(ov, {attributes: true, attributeFilter: ["class"], attributeOldValue: true}); // incl. confirm
  // VoiceOver: every overlay is a dialog (confirmsheet included — it's the
  // one MODAL_KEEP exempts from backdrop/Esc dismissal, not from being a
  // dialog), labelled by its own heading so a screen reader announces WHICH
  // sheet just opened instead of a bare "dialog". aria-modal is kept live by
  // the observer above (docked vs. floating can change after open).
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "true");
  const sh0 = ov.querySelector(".sheet");
  if (sh0) {
    if (!(sh0.tabIndex >= 0)) sh0.tabIndex = -1; // a focus target with nothing else inside, never in the Tab order itself
    const h = sh0.querySelector("h2, h3");
    if (h) {
      if (!h.id) h.id = ov.id + "-srlabel";
      ov.setAttribute("aria-labelledby", h.id);
    }
  }
  if (MODAL_KEEP.has(ov.id)) continue;
  // pointerdown, and only when the backdrop ITSELF is the target — a drag that
  // starts inside the sheet and releases outside must not count as a dismiss
  ov.addEventListener("pointerdown", e => { if (e.target === ov) ov.classList.remove("on"); });
  const sh = ov.querySelector(".sheet");
  if (!sh || sh.querySelector(".sheetx")) continue;
  const x = document.createElement("button");
  x.className = "sheetx";
  x.textContent = "✕";
  x.setAttribute("aria-label", "Close");
  x.addEventListener("click", () => wmCloseWindow(ov));
  sh.prepend(x);
}
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  const open = [...document.querySelectorAll(".overlay.on")].filter(o => !MODAL_KEEP.has(o.id));
  if (!open.length) return;
  open[open.length - 1].classList.remove("on"); // topmost only, so Esc unstacks
  e.preventDefault();
});
}
 document.getElementById("sharelink").addEventListener("click", async () => {
  const st = document.getElementById("syncstatus");
  if (!S.songKey || !/^albums\//.test(S.songKey)) { st.textContent = "Local files have no link — publish the song first."; return; }
  const link = shareLinkFor(S.songKey);
  try {
    if (navigator.share) { await navigator.share({title: songTitleOf(S.songKey) + " · Night Roll", url: link}); st.textContent = "Shared."; return; }
    await navigator.clipboard.writeText(link);
    st.textContent = "Link copied: " + link;
  } catch (err) { st.textContent = err && err.name === "AbortError" ? "" : "Couldn't share: " + err.message + " — " + link; }
});
document.getElementById("fileshare").addEventListener("click", () => { closeFileMenus(); openShareSheet(); });
document.getElementById("shClose").addEventListener("click", () => document.getElementById("sharesheet").classList.remove("on"));
document.getElementById("shUrl").addEventListener("focus", e => e.target.select());
document.getElementById("shCopy").addEventListener("click", async e => {
  try { await navigator.clipboard.writeText(document.getElementById("shUrl").value); e.target.textContent = "Copied ✓"; }
  catch (err) { document.getElementById("shUrl").select(); e.target.textContent = "Select + copy"; }
  setTimeout(() => { e.target.textContent = "Copy"; }, 1500);
});
document.getElementById("shSend").addEventListener("click", async () => {
  try { await navigator.share({title: songTitleOf(S.songKey) + " · Night Roll", url: document.getElementById("shUrl").value}); }
  catch (err) { /* AbortError = he closed the share sheet */ }
});
document.getElementById("copyfile").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(serializeRollnotes());
    document.getElementById("syncstatus").textContent = "Copied to clipboard.";
  } catch (err) { document.getElementById("syncstatus").textContent = "Copy failed: " + err.message; }
});
document.getElementById("dlfile").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([serializeRollnotes()], {type: "text/plain"}));
  a.download = baseName() + ".rollnotes.json";
  a.click();
  URL.revokeObjectURL(a.href);
});
// The post-publish state update, for the open song and any other, alike
// (docs/provenance-plan.md P2 — Bugs found: Publish all never did any of
// this for a song that wasn't open, so its tombstones never cleared and its
// draft never learned it had been published). opts.keepDraft: annotations
// went up without the .mid (an analyzed song). opts.midSig: publishSong's
// baked signature of what it just wrote (or would have written) — stored
// separately from the legacy (un-baked) pubSig below, which several OTHER
// comparisons (draftDoc, pubCompareDraft, draftFingerprint) already agree on.
function markPublished(key, stamp, content, opts) {
  opts = opts || {};
  clearTombstonesFor(key); // the pushed file IS the post-deletion state
  if (key === S.songKey && S.song) {
    S.rollnotes.forEach(n => n.added = false); // now canonical in the repo
    saveLocalNotes();
    // Pages deploys lag the commit by ~1 min; a reload in that window fetches
    // the PRE-sync file and the notes look gone. Keep the EXACT pushed content
    // as a bridge — loadNotes prefers it while fresh and the CDN disagrees.
    recordLastSync(key, content || serializeRollnotes());
    if (stamp) {
      S.song.savedStamp = stamp; // cross-device freshness beacon
      if (isComposition() && !opts.keepDraft) saveDraft(true); // draft now clean, based on this save
    }
    if (opts.midSig !== undefined) { // patch in the baked signature saveDraft(true) doesn't know about
      let d = null; try { d = JSON.parse(localStorage.getItem(draftStoreKey(key)) || "null"); } catch (err) { d = null; }
      if (d) { d.midSig = opts.midSig; try { draftWrite(key, d); } catch (err) {} }
    }
    S.lastSubtitle = undefined;
    updateSubtitle();
    draw();
  } else {
    recordLastSync(key, content || "");
    localStorage.removeItem("ff1roll-notes-" + key); // this device's local additions are now canonical in the repo file
    let d = null;
    try { d = JSON.parse(localStorage.getItem(draftStoreKey(key)) || "null"); } catch (err) { d = null; }
    if (d) {
      d.dirty = false;
      if (stamp) d.savedStamp = stamp;
      d.pubSig = musicSig({ppq: d.ppq, tracks: d.tracks, tempos: d.tempos}); // legacy, un-baked convention (see musicSig) — matters the next time this song is opened (openDraftDoc reads it)
      if (opts.midSig !== undefined) d.midSig = opts.midSig;
      try { draftWrite(key, d); } catch (err) { /* full: the next edit writes it */ }
    }
  }
}
function markCurrentSongSynced(content, stamp, opts) { markPublished(S.songKey, stamp, content, opts); } // The ONE "ship everything" publish for the OPEN song, once it has a real
// folder path and hisMusic is true (isComposition()): ghsave's writing-mode
// branch below, and Publish-on-an-unsaved-song's continuation (fsgo, mode
// "publish", above) after saveSongAs has given it one. Returns the final
// status line; throws on failure (the .mid/annotations write itself) — the
// README/catalog refresh after are best-effort and never fail the publish.
async function publishOpenComposition(h, report) {
  await publishSong(S.songKey, h, report);
  let readmeNote = "";
  try { await writeSongsReadme(h); } catch (err) { readmeNote = " (the repo's song list didn't update: " + err.message + ")"; } // the song is published either way
  await initCatalog().catch(() => {});
  updateSongBtn();
  renderSyncPending();
  return folderActive() ? "Published ✓ to " + fsRoot.name + " — song and annotations together."
                        : "Published ✓ — song and annotations together (Pages takes ~1 min)." + readmeNote;
}
// Publish on a song with no folder yet (lotion, 2026-10-03: Josh published
// "lotion" and only its annotations went anywhere — publishSong's hisMusic
// check is false for local/, which has no repo path to write a .mid to).
// Names it FIRST, via the SAME saveSongAs Save Version's first save already
// uses (renameLocalKeys carries the draft/notes/versions/origin — the one
// tested rename path, not a new one), THEN ships via publishOpenComposition
// — one publish function either way. A failure after the rename still
// leaves the song safely under its new name; Publish can just be tapped
// again. Called from fsgo's "publish"-mode branch (openSaveForm/below), and
// directly testable the same way saveSongAs already is.
async function publishUnsavedSong(folder, name) {
  if (!(await saveSongAs(folder, name))) return false; // saveSongAs already explained why (e.g. a declined name clash) — nothing else happened, same as Save Version's own silent no-op here
  const token = writeToken(); // re-checked: openSyncSheet's gate already confirmed one before this sheet ever opened
  if (!token) { fileStatus("No GitHub token stored yet — add one in File → Settings. (Saved as " + songTitleOf(S.songKey) + " — Publish again once connected.)"); return false; }
  fileStatus("Publishing " + S.songKey + " (.mid + annotations)…");
  try {
    fileStatus(await publishOpenComposition(ghHeaders(token), m => fileStatus(m)));
    return true;
  } catch (err) {
    fileStatus("Publish failed: " + err.message + " (the song is saved under " + S.songKey + " — Publish again to retry)");
    return false;
  }
}
document.getElementById("ghsave").addEventListener("click", async e => {
  const btn = e.currentTarget;
  const status = document.getElementById("syncstatus");
  if (S.song && isUnsaved(S.songKey)) { // no folder yet (lotion, 2026-10-03): name it first — same sheet Save Version uses — then ship, instead of silently publishing annotations only
    const token = takeToken(status);
    if (!token) return;
    syncsheet.classList.remove("on");
    openSaveForm("publish");
    return;
  }
  if (S.song && isComposition()) { // writing mode: the ONE button ships everything, via the one publish function
    btn.disabled = true;
    status.textContent = "Publishing " + S.songKey + " (.mid + annotations)…";
    try {
      const token = writeToken();
      if (!token) { status.textContent = "No GitHub token stored yet — add one in File → Settings."; return; }
      status.textContent = await publishOpenComposition(ghHeaders(token), m => status.textContent = m);
    } catch (err) { status.textContent = "Publish failed: " + err.message; }
    finally { btn.disabled = false; }
    return;
  }
  const token = takeToken(status);
  if (!token) return;
  if (!S.songKey) { status.textContent = "Local file — no repo path. Use Copy/Download."; return; }
  btn.disabled = true;
  status.textContent = "Publishing…";
  try {
    await publishSong(S.songKey, ghHeaders(token), m => status.textContent = m); // annotations only: publishSong's own hisMusic check skips the .mid
    status.textContent = folderActive() ? "Published ✓ to " + fsRoot.name + "."
                                        : "Published ✓ (GitHub Pages takes ~1 min to serve the new file.)";
    setTimeout(() => { // done — close, and return to the notes list if that's where we came from
      syncsheet.classList.remove("on");
      if (S.syncReturnToList) { renderNoteList(); notelistSheet.classList.add("on"); }
    }, 900);
  } catch (err) { status.textContent = "Publish failed: " + err.message; }
  finally { btn.disabled = false; }
});
// sync every song with unsynced local notes, not just the loaded one — a key
// sweep touches many songs in one sitting and shouldn't strand work per-song.
// Publish all as a job (Josh's ask 4, 2026-09-29): one item per pending song
// (the general chat rides along as its own item, same as before) — the exact
// same per-song flow, just wrapped so it reports progress and can be
// cancelled between songs; the publish dialog is the same one folder
// publishes use. One Publish-all job at a time.
function publishAllJobStart(statusFn, onlyKeys) { // onlyKeys: one row's Publish — the same flow for just those songs
  const pending = onlyKeys ? pendingSongs().filter(k => onlyKeys.includes(k)) : pendingSongs();
  if (!pending.length) { statusFn && statusFn("Nothing pending on this device."); return null; }
  if (jobsFind("publishall", null, true)) { statusFn && statusFn("A publish is already running — tap ⏳"); return null; }
  const items = pending.map(key => ({label: key === "general" ? "General chat" : songTitleOf(key), key}));
  const jobTitle = onlyKeys && pending.length === 1 ? "Publish " + items[0].label : "Publish all";
  return jobStart("publishall", jobTitle, items, async api => {
    const token = writeToken();
    if (!token) throw new Error("No GitHub token stored yet — add one in File → Settings.");
    const h = ghHeaders(token);
    let failed = 0, anyPublished = false;
    for (let i = 0; i < pending.length; i++) {
      if (api.aborted) { for (let j = i; j < pending.length; j++) api.update(j, {st: "cancelled"}); api.cancel(); return; }
      const key = pending[i], short = items[i].label;
      api.update(i, {st: "running", pct: 0});
      api.note("Publishing " + short + "…");
      try {
        if (key === "general") await askCommitLog(ghHeaders(token), ASK_GENERAL_KEY); // the general chat rides Publish all too — no song, so the one publish function doesn't apply
        else { await publishSong(key, h, m => api.note(short + ": " + m)); anyPublished = true; }
        api.update(i, {st: "done", pct: 1});
      } catch (err) {
        failed++;
        api.update(i, {st: "failed", msg: err.message});
      }
    }
    if (anyPublished) try { await writeSongsReadme(h); } catch (err) { /* never fatal for the publish itself — the README is best-effort */ } // once per job, not once per song (Bugs found, docs/provenance-plan.md)
    await initCatalog().catch(() => {});
    updateSyncBtn();
    updateSongBtn();
    renderSyncPending();
    const msg = failed ? failed + " of " + pending.length + " failed to publish" : "Published " + pending.length + " ✓";
    api.note(msg);
    statusFn && statusFn(msg);
    if (failed) throw new Error(msg);
  });
}
JOB_KINDS.publishall = {
  label: j => j.title,
  open: j => openPubJobSheet(j),
  retry: j => { const job = publishAllJobStart(setInfo); if (job) openPubJobSheet(job); },
};
document.getElementById("ghsaveall").addEventListener("click", () => {
  const status = document.getElementById("syncstatus");
  const token = takeToken(status);
  if (!token) return;
  const job = publishAllJobStart(s => { status.textContent = s; });
  if (!job) return;
  document.getElementById("syncsheet").classList.remove("on");
  openPubJobSheet(job);
});

if (typeof document !== "undefined" && document.body && document.body.dataset) document.body.dataset.edition = EDITION; // the vm harness has no body
applyViewMode();
resize();
updateSyncBtn();
// ---- service worker (Phase 0, 2026-09-26): offline launch from the Home
// Screen; network-first for the page itself so a stale index.html can never
// stick. ?sw=0 is the kill switch: unregister + drop the caches, for a device
// that misbehaves. Secure contexts only (Pages is https; localhost counts).
if (typeof navigator !== "undefined" && navigator.serviceWorker && typeof location !== "undefined" && S.APP_BASE) {
  if (PERF_FLAGS.get("sw") === "0") {
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
    if (typeof caches !== "undefined") caches.keys().then(ks => ks.forEach(k => { if (k.startsWith("night-roll-")) caches.delete(k); })).catch(() => {});
    setInfo("offline support turned off on this device — reload without ?sw=0 to turn it back on");
  } else {
    navigator.serviceWorker.register(new URL("sw.js", S.APP_BASE).href, {scope: S.APP_BASE})
      .then(reg => { const w = reg.active || reg.waiting || reg.installing; if (w && navigator.onLine !== false) w.postMessage("warm"); }) // every catalog song into the cache, in the background
      .catch(err => console.warn("sw:", err.message));
  }
}
try { // a job still "running" in the mirror = the page died mid-way; the row keeps its last counts (this replaced the sessionStorage capture beacon, 2026-09-27)
  const j = jobsLoad();
  if (j) {
    const msg = "⚠ interrupted: " + j.title + " " + jobProgress(j) + " — tap ⏳ to see or retry";
    setInfo(msg);
    setTimeout(() => setInfo(msg), 2500); // outlive whatever boot writes over it
  }
} catch (err) { /* no mirror */ }
(async function boot() {
  // boot watchdog (docs/split-plan.md §4 step 0b): the inline classic
  // script in index.html's <head> arms a 10s failsafe before any module
  // runs, for a module 404/syntax error that would otherwise leave a blank
  // screen. Reaching here proves the module graph loaded and boot() is
  // running, so the dangerous window has passed — clear it now, not at the
  // end of boot(), so a slow catalog fetch can never trip a false alarm.
  if (typeof window !== "undefined" && window.__nrBoot) { clearTimeout(window.__nrBoot); window.__nrBoot = null; }
  await restoreFolder(); // where data lives decides what the catalog holds
  renderFolderUI();
  try { await initCatalog(); }
  catch (e) {
    const b = cfg().songsBase || "(this site)";
    setInfo("catalog failed to load from " + b + " — check File → Settings, or serve over http: " + e.message);
    return;
  }
  const all = Object.values(S.CATALOG).flat().map(([, p]) => p);
  const qsong = typeof location !== "undefined" ? songPathFromURL(location.href) : null; // shared link wins — ?song= (old) or the path form
  const last = localStorage.getItem("ff1roll-lastsong");
  // drafts aren't in the manifest but are perfectly loadable (draft-wins path)
  const loadable = p => all.includes(p) || (p && localStorage.getItem("ff1roll-draft-" + p));
  if (folderOnly() && !qsong && !loadable(last)) { // his list, not Overworld: first of his songs, or a fresh one
    if (all.length) S.currentPath = all[0];
    else {
      setInfo("your folder has no songs yet — name one below and it lands there");
      document.getElementById("filenewform").style.display = "";
      document.getElementById("filesheet").classList.add("on");
      return;
    }
  } else S.currentPath = qsong ? qsong
    : loadable(last) ? last : homeSong(all);
  // album links (2026-09-29): a shared link can arm an album too (armAlbumLink)
  armAlbumLink(typeof location !== "undefined" ? albumParamFromURL(location.href) : null, S.currentPath);
  updateSongBtn();
  reflectSongURL(S.currentPath); // the address bar is the share link from the first frame: path form, never ?song=
  // a dead link (moved/renamed song in ?song= or a stale last-song) must not
  // strand you on a blank page: warn, then fall back to something that exists
  const bootFallback = why => {
    const fb = loadable(last) && last !== S.currentPath ? last : homeSong(all);
    setInfo("⚠ " + why + " — opening " + fb.split("/").pop() + " instead (the song may have moved: use Open…)");
    S.currentPath = fb;
    updateSongBtn();
    reflectSongURL(fb);
    return loadSong(fb);
  };
  const first = (qsong && !loadable(S.currentPath))
    ? bootFallback("that link's song isn't in the catalog: " + S.currentPath)
        .catch(e => setInfo("load failed — open via a web server (GitHub Pages): " + e.message))
    : loadSong(S.currentPath).catch(e => {
        if (/fetch failed/.test(e.message)) return bootFallback("couldn't load " + S.currentPath).catch(() => setInfo("load failed: " + e.message));
        setInfo("load failed — open via a web server (GitHub Pages): " + e.message);
      });
  first.finally(nativeOpenHook); // a file handed to the iPad app at launch opens over the first song, not under it
})();

async function fingerprintOldDrafts() {
  if (S.pubCheckRunning || LINK_SONGS) return;
  S.pubCheckRunning = true;
  let changed = false;
  const sheetOn = () => document.getElementById("syncsheet").classList.contains("on");
  if (sheetOn() && S.song) renderSyncPending(); // shows the "checking…" line
  try {
    for (const key of draftKeys()) {
      if (!syncable(key)) continue;
      let d = null; try { d = JSON.parse(localStorage.getItem(draftStoreKey(key)) || "null"); } catch (err) { d = null; }
      if (!d || !d.dirty) { pubCheck.delete(key); continue; }
      if (!d.tracks) { pubCheck.set(key, "not checked: its notes live in this device's database (an import)"); continue; }
      const r = await pubCompareDraft(key, d);
      changed = true;
      if (r.same) {
        pubCheck.delete(key);
        if (key === S.songKey && S.song) { S.song.pubSig = d.pubSig; S.song.savedStamp = d.savedStamp || S.song.savedStamp; updateSongBtn(); }
      } else pubCheck.set(key, r.text);
      logDebug("publish check " + key.split("/").pop() + ": " + (r.same ? "matches the published copy — off the list" : r.text));
    }
  } finally { S.pubCheckRunning = false; }
  updateSyncBtn();
  if (sheetOn() && S.song) renderSyncPending(); // the list as checked (and the "checking…" line gone)
}
export function askRenderImpl() {
  askDraftLoad();
  asklog.innerHTML = "";
  const st = askStore();
  const msgs = st.msgs;
  if (st.trimmed) askRenderEarlier();
  let pendingSeen = false;
  if (!msgs.length && !st.trimmed && S.askTerminal) askBubble("ai", "This goes straight to Claude Code in the Mac's terminal — the session that builds Night Roll. Tell it what to build or fix; its answers come back here, and the Now: line above shows what it's doing.");
  else if (!msgs.length && !st.trimmed && S.askGeneral) askBubble("ai", "This is the general chat — not about any one song. Ask about the app, the project, music in general, or say \"tell the terminal…\" to pass a message to the Claude Code sessions on your Mac.");
  else if (!msgs.length && !st.trimmed) askBubble("ai", appMode() === "normal"
    ? "Ask me about what you're looking at — I can see the song, your cursor, your notes, and the bars in view. I'll answer directly — keys, chords, cadences, form — and say how sure I am."
    : "Ask me about what you're looking at — I can see the song, your cursor, your notes, and the bars in view. I'll point you toward things before I name them; say you give up and I'll just tell you.");
  for (const m of msgs) {
    // a different mode's turn (askMsgMode/appMode, SAFETY 2026-10-01): still
    // shown here (this is the on-device log, not a model request) but dimmed
    // and tagged, so Josh can tell it was never part of the current mode's
    // AI context, not just missing from it.
    const otherMode = !S.askTerminal && askMsgMode(m) !== appMode();
    const tag = otherMode ? "[" + (askMsgMode(m) === "normal" ? "Normal" : "Learning") + " mode] " : "";
    const div = askBubble(m.role === "user" ? "user" : m.role === "note" ? "note" : "ai", tag + (m.role === "note" ? askClock(m.t) + askNoteLabel(m.m) + m.content : (S.askTerminal && m.role === "user" ? askClock(m.t) : "") + askStripContext(m.content)));
    if (otherMode) div.classList.add("othermode");
    if (m.pending) { const part = askPartial[m.pending]; askBubble("ai", part ? part + "\n\n… (still writing)" : "… (still working — the reply lands here)").dataset.job = m.pending; pendingSeen = true; }
  }
  if (pendingSeen) askResumeSoon(200);
}
function askBubble(role, text) {
  const div = document.createElement("div");
  div.className = "askmsg " + role;
  askFillBubble(div, text);
  asklog.appendChild(div);
  asklog.scrollTop = asklog.scrollHeight;
  return div;
}
async function askRenderEarlier() { // what this device let go of after it reached the repo file
  const div = askBubble("ai", "loading the earlier messages from the repo file…");
  div.classList.add("earlier");
  const path = askLogPath();
  try {
    let text;
    if (folderActive()) { const f = await folderRead(path); text = f ? await f.text() : ""; }
    else {
      const r = await fetch((isComposition() ? songsURL : analysisURL)(path) + "?t=" + Date.now(), {cache: "no-cache"});
      if (!r.ok) throw new Error("HTTP " + r.status);
      text = await r.text();
    }
    div.textContent = text.trim() || "(the repo file is empty)";
  } catch (err) { div.textContent = "earlier messages are in " + path + " — couldn't load it (" + err.message + ")"; }
  askScrollEnd(); // the earlier block grows above the conversation: keep its end in view
}
function askResumeSoon(ms) { clearTimeout(S.askResumeTimer); S.askResumeTimer = setTimeout(() => { S.askResumeTimer = null; askResume(); }, ms); }
function askFillBubble(div, text) { // the words, web addresses tappable, a ⧉ copy at the end
  div.textContent = text;
  // links only where the DOM can rebuild children (the test harness's fake
  // elements keep textContent as a plain string, so they get the text alone)
  const re = /https?:\/\/[^\s<>"'`]+/g;
  if (re.test(text) && typeof div.replaceChildren === "function") {
    const nodes = []; let last = 0, m; re.lastIndex = 0;
    while ((m = re.exec(text))) {
      let url = m[0]; const trail = url.match(/[.,;:!?)\]]+$/); if (trail) url = url.slice(0, -trail[0].length);
      nodes.push(document.createTextNode(text.slice(last, m.index)));
      const a = document.createElement("a"); a.href = url; a.textContent = url; a.target = "_blank"; a.rel = "noopener"; // the PWA hands _blank to Safari
      nodes.push(a);
      last = m.index + url.length;
    }
    nodes.push(document.createTextNode(text.slice(last)));
    div.replaceChildren(...nodes);
  }
  if (text.trim() && text !== "…") {
    const b = document.createElement("button");
    b.className = "askcopy"; b.type = "button"; b.setAttribute("aria-label", "Copy this message"); b.title = "copy";
    b.addEventListener("click", ev => { ev.stopPropagation(); askCopyText(text, b); });
    div.appendChild(b);
  }
}
// Resume (2026-09-26 audit): every pending question gets looked at, in every
// chat, not just the open one — and a look that cannot happen now (busy,
// backgrounded, the Mac unreachable) is rescheduled, never dropped. Only
// a real answer from the bridge ("no such job", "error") fails a question.
async function askResume() {
  const all = askPendingAll();
  if (!all.length) return;
  if (S.askBusy || !S.song || (typeof document.hidden === "boolean" && document.hidden)) { askResumeSoon(3000); return; }
  const liveFor = jobId => [...asklog.querySelectorAll(".askmsg.ai")].find(d => d.dataset.job === jobId) || null;
  const sup = await askJobsSupported();
  if (sup === null) { // unreachable right now: the reply is kept on the Mac; say so where the bubble is, and look again
    for (const p of all) { const live = p.key === askStoreKey() ? liveFor(p.jobId) : null; if (live) live.textContent = "… (can't reach the Mac right now — the reply is kept there; retrying)"; }
    askResumeSoon(5000); return;
  }
  if (!sup) { for (const p of all) askFail(p.jobId, "no reply came back (the connection dropped) — ask again", p.key); return; }
  let again = false;
  for (const p of all) {
    const mine = p.key === askStoreKey(), live = mine ? liveFor(p.jobId) : null;
    let j;
    try { const r = await fetch(aiUrl() + "/v1/jobs/" + encodeURIComponent(p.jobId), {headers: aiHeaders()}); if (r.status === 404) { askFail(p.jobId, "the Mac no longer has this reply (its bridge restarted, or the question never reached it) — ask again", p.key); continue; } j = await r.json(); }
    catch (err) { again = true; continue; }
    const step = ((j.notes || []).slice(-1)[0] || "working").replace(/^using /, "").replace(/…\s*$/, "");
    if (j.status === "running") { if (j.text) askPartial[p.jobId] = j.text; if (live) live.textContent = j.text ? j.text : "… (" + step + ")"; if (mine) askstatus.textContent = "working: " + step; again = true; continue; }
    if (mine) askstatus.textContent = ""; // the "stream was cut" line is over once the reply lands or fails
    if (j.status === "error") { askFail(p.jobId, j.error || "the job failed", p.key); continue; }
    const calls = j.result && j.result.tool_calls;
    if (!calls || !calls.length) { askFinish(p.jobId, (j.text || "").trim() || "(no reply)", p.key); continue; }
    if (!mine) { again = true; continue; } // a tool round acts on the OPEN song: it continues when that chat is opened again
    // the job ended in a tool call: run it here, then continue the exchange as a new job
    const msgs = askStore(p.key).msgs, i = askPendingIndex(msgs, p.jobId);
    if (i < 0) continue;
    const pend = msgs[i];
    const sp = S.askSpanFrozen || askSpan();
    const budget = askBudget();
    const history = msgs.slice(0, i);
    const messages = askBuildMessages(history, pend.content, askContext(sp, budget), budget);
    messages.push({role: "assistant", content: "", tool_calls: calls});
    for (const c of calls) {
      let args = {}; try { args = JSON.parse(c.function.arguments || "{}"); } catch (err) { args = {}; }
      let result; try { result = await askRunTool(c.function.name, args); } catch (err) { result = {error: String(err.message || err)}; }
      messages.push({role: "tool", tool_call_id: c.id, content: typeof result === "string" ? result : JSON.stringify(result)});
    }
    const nextId = askJobId();
    askRepending(p.key, p.jobId, nextId);
    await askRun({msgs, text: pend.content, sp, messages, jobId: nextId, live: live || askBubble("ai", "…"), key: p.key});
    askResumeSoon(500); return; // one exchange at a time; the others get their look after it
  }
  if (again) askResumeSoon(3000);
}
function openSyncSheet() { // callable even with no song loaded (bad-config recovery)
  S.syncReturnToList = false; // notelistSync sets it true right after this runs
  if (S.song) renderSyncPending();
  fingerprintOldDrafts().catch(() => {});
  const comp = !!S.song && isComposition();
  document.getElementById("ghsave").textContent = "⇪ Publish song"; // edits already live on the device; this is the deliberate step that puts a song where others can reach it (Josh, 2026-09-26) — one word for what it ships, in folder mode too (Model B, 2026-09-29): Save is Save Version now, never Publish's word
  document.getElementById("repolink").href = "https://github.com/" + cfg().songsRepo;
  // the status line starts empty (Josh, 2026-09-25: the buttons are clear on
  // their own) and speaks only for progress, results, or a missing prerequisite
  document.getElementById("syncstatus").textContent = !S.song
    ? "No song loaded — if the catalog failed, check File → Settings, then reload."
    : !S.songKey
    ? "Local file — Copy/Download only (no repo path to commit to)."
    : LINK_SONGS
    ? "You're viewing " + linkRepoLabel(LINK_SONGS) + "'s songs from a link — read-only here. Share link copies this song's link."
    : !writeToken()
    ? "Connect GitHub first: File → Settings… → GITHUB (your repo, then a token) — Publish sends songs there."
    : isUnsaved(S.songKey) // lotion, 2026-10-03: say so before he taps — Publish used to look like it shipped the song and only sent the annotations
    ? "This song has no folder yet — Publish will ask for a name and folder first."
    : "";
  document.getElementById("ghsave").disabled = !!LINK_SONGS;
  if (LINK_SONGS) document.getElementById("ghsaveall").style.display = "none";
  syncsheet.classList.add("on");
}
function renderSyncPending() {
  updateSyncBtn(); // the count follows the list it is drawn from (Josh: "it doesn't update that number")
  const box = document.getElementById("syncpending");
  box.textContent = "";
  const line = (parent, text, cls) => {
    const row = document.createElement("div");
    row.className = "pline" + (cls ? " " + cls : "");
    const span = document.createElement("span");
    span.textContent = text;
    row.appendChild(span);
    parent.appendChild(row);
    return row;
  };
  // the list shrinks when the check below finishes: say so, or it reads as a
  // glitch ("it said five, then boom, two" — Josh, 2026-09-29)
  if (S.pubCheckRunning) line(box, "checking each song against its published copy…", "pempty");
  for (const key of pendingSongs()) {
    const block = document.createElement("div");
    if (key === "general") { // the general chat ships by itself: one tap, no song involved
      block.className = "psong";
      const title = document.createElement("div");
      title.className = "ptitle";
      const tspan = document.createElement("span"); tspan.textContent = "✦ General chat";
      const b = document.createElement("button");
      b.textContent = "Publish chat";
      b.title = "Append the unsaved general chat to " + ASK_GENERAL_LOG;
      b.addEventListener("click", async () => {
        const status = document.getElementById("syncstatus");
        const token = folderActive() ? "folder" : takeToken(status);
        if (!token) return;
        b.disabled = true; status.textContent = "Publishing the general chat…";
        try { await askCommitLog(folderActive() ? null : ghHeaders(token), ASK_GENERAL_KEY); status.textContent = "General chat published ✓"; }
        catch (err) { status.textContent = "⚠ general chat: " + err.message; }
        b.disabled = false; updateSyncBtn(); renderSyncPending();
      });
      title.append(tspan, b);
      block.appendChild(title);
      const n = askUnsavedCount(ASK_GENERAL_KEY);
      line(block, "✦ " + n + " chat message" + (n === 1 ? "" : "s") + " unsaved");
      box.appendChild(block);
      continue;
    }
    block.className = "psong" + (key === S.songKey ? " open" : "");
    const title = document.createElement("div");
    title.className = "ptitle";
    const tspan = document.createElement("span");
    tspan.textContent = songTitleOf(key) + (key === S.songKey ? " · open" : "");
    title.appendChild(tspan);
    // every row: Open / Publish / Revert (Josh, 2026-09-29) — the same three
    // on every song, not Open only when a draft happened to exist
    if (key !== S.songKey) {
      const o = document.createElement("button");
      o.textContent = "Open";
      o.title = "Open this song here";
      o.addEventListener("click", () => {
        (localStorage.getItem(draftStoreKey(key)) !== null ? openDraft(key) : loadSong(key)).then(openSyncSheet);
      });
      title.appendChild(o);
    }
    const pb = document.createElement("button");
    pb.textContent = "Publish";
    pb.title = "Publish this song only (a job — ⏳ shows it)";
    pb.addEventListener("click", () => {
      const status = document.getElementById("syncstatus");
      if (!takeToken(status)) return; // same gate as Publish all
      const job = publishAllJobStart(t => { status.textContent = t; }, [key]);
      if (!job) return;
      document.getElementById("syncsheet").classList.remove("on");
      openPubJobSheet(job);
    });
    title.appendChild(pb);
    if (draftDirtyState(key) !== "never") { // a never-published song has no repo copy: Revert would delete it
      const rb = document.createElement("button");
      rb.textContent = "Revert";
      rb.title = "Drop this device's changes to this song; the published copy becomes what you see";
      rb.addEventListener("click", () => revertSongToRepo(key));
      title.appendChild(rb);
    }
    block.appendChild(title);
    const music = draftDirtyState(key);
    if (music) {
      const row = line(block, "♪ music " + (music === "never" ? "never published" : "edited since publish") + (pubCheck.get(key) ? " — " + pubCheck.get(key) : ""));
      if (key === S.songKey && music === "edited") { // what changed? the roll shows it (View → Compare with repo)
        const b = document.createElement("button");
        b.textContent = "Compare";
        b.title = "Outline every note that differs from the published copy on the roll";
        b.style.marginLeft = "auto";
        b.addEventListener("click", () => { syncsheet.classList.remove("on"); cmpEnter(); });
        row.appendChild(b);
      }
    }
    let notes = [];
    try { notes = JSON.parse(localStorage.getItem("ff1roll-notes-" + key) || "[]"); } catch (err) { notes = []; }
    if (notes.length) {
      line(block, "✎ " + notes.length + " annotation" + (notes.length === 1 ? "" : "s") + " unsynced");
      notes.forEach((n, i) => {
        const at = "[" + n.b1 + "." + n.q1 + (n.b2 ? " - " + n.b2 + "." + (n.q2 || "") : "") + "]";
        const text = n.text.length > 60 ? n.text.slice(0, 57) + "…" : n.text;
        // loop:/key: texts already carry their prefix; only label the others
        const row = line(block, at + " " + (n.section ? "section: " : "") + text, "note");
        const x = document.createElement("button");
        x.textContent = "✕";
        x.title = "Discard this note (this device only — it was never synced)";
        x.addEventListener("click", () => discardPending(key, i));
        row.prepend(x);
      });
    }
    const chat = askUnsavedCount("ff1roll-ask-" + key);
    if (chat) line(block, "✦ " + chat + " chat message" + (chat === 1 ? "" : "s") + " unsaved");
    box.appendChild(block);
  }
  if (!box.childElementCount) {
    const e = document.createElement("div");
    e.className = "pempty";
    e.textContent = "Nothing pending on this device.";
    box.appendChild(e);
  }
  const all = document.getElementById("ghsaveall");
  const n = pendingSongs().length;
  all.textContent = "Publish all (" + n + ")";
  all.style.display = n > 1 ? "" : "none";
}


// ---- e2e accessor mirror (docs/split-plan.md §4 step 0b deviation) -------
// Generated by tools/split/cutover.mjs (step 0b) / tools/split/
// regen-e2e-footer.mjs (step 1 on), not hand-maintained — re-running either
// regenerates this block from app.js's CURRENT top-level names, so it never
// drifts. app.js is the legacy container: as module-split steps carve real
// modules out of it, its remaining top-level names shrink (step 1's
// promote-state.mjs moved ~257 of them to `S`; later steps move functions
// to their own modules, where a real `export` replaces this mirror for
// them), so without regenerating this block after a change, src/devtools.js's
// window mirror would offer a stale accessor referencing a name no longer
// declared here — a free-identifier violation tools/split/check.mjs's rule 1
// catches statically, and a ReferenceError at runtime if it weren't. get
// covers every top-level name; set covers the mutable ones (function/class
// declarations and non-const variables — ES modules allow reassigning those,
// same as `let`). Identical technique to tests/harness.mjs's own per-module
// footer (§3.2), which already solves this for the vm test harness — but a
// DIFFERENT name (__nrExpose$, not __nr$): tests/harness.mjs's module-mode
// loader blindly appends its OWN __nr$ footer to every src/ file it loads
// (including app.js, as a test fixture), so reusing that name here would
// double-declare it the moment a vm test loads this file. tools/split/
// check.mjs's rule 1 treats every name referenced here as already bound
// (they're this module's own top-level declarations), so this block does
// not introduce free-identifier findings.
export const __nrExpose$ = {get: {"recentSongsForMenu": () => recentSongsForMenu, "recentAlbumFor": () => recentAlbumFor, "applyMode": () => applyMode, "HOLD_MS": () => HOLD_MS, "HOLD_SLOP": () => HOLD_SLOP, "RULER_RANGE_SLOP": () => RULER_RANGE_SLOP, "setSecDepth": () => setSecDepth, "cycleSecDepth": () => cycleSecDepth, "annoRestore": () => annoRestore, "homeSong": () => homeSong, "governingAt": () => governingAt, "finalizeLasso": () => finalizeLasso, "toggleSel": () => toggleSel, "fallHitNote": () => fallHitNote, "hitTracksNote": () => hitTracksNote, "hitTracksClip": () => hitTracksClip, "selectAllNotes": () => selectAllNotes, "openInsertBars": () => openInsertBars, "openDeleteBars": () => openDeleteBars, "hitNote": () => hitNote, "scoreLassoTap": () => scoreLassoTap, "beatLabel": () => beatLabel, "noteLabel": () => noteLabel, "songPitchExtent": () => songPitchExtent, "scrubTo": () => scrubTo, "seekOrMoveCursor": () => seekOrMoveCursor, "placePencilNote": () => placePencilNote, "endPointer": () => endPointer, "tap": () => tap, "scorePencilTick": () => scorePencilTick, "scoreStaveAt": () => scoreStaveAt, "scorePencil": () => scorePencil, "scoreErase": () => scoreErase, "scoreTap": () => scoreTap, "songsheet": () => songsheet, "renderSongGroups": () => renderSongGroups, "renderFolder": () => renderFolder, "renderSongList": () => renderSongList, "openSongPicker": () => openSongPicker, "speedsl": () => speedsl, "speedlbl": () => speedlbl, "speedreset": () => speedreset, "applySpeed": () => applySpeed, "speedbtn": () => speedbtn, "_applySpeedInner": () => _applySpeedInner, "volsl": () => volsl, "vollbl": () => vollbl, "volbtn": () => volbtn, "fileMeterAt": () => fileMeterAt, "refreshKeyPreview": () => refreshKeyPreview, "moveSelectionToTrack": () => moveSelectionToTrack, "dedupeSong": () => dedupeSong, "insertChordAt": () => insertChordAt, "insertProgressionAt": () => insertProgressionAt, "cofAngle": () => cofAngle, "cofRelease": () => cofRelease, "applyListener": () => applyListener, "setViewMode": () => setViewMode, "applyViewMode": () => applyViewMode, "decodeM3u": () => decodeM3u, "parseM3u": () => parseM3u, "applyM3uNames": () => applyM3uNames, "applyM3uToAlbum": () => applyM3uToAlbum, "createGameFilesRepo": () => createGameFilesRepo, "openPickedFiles": () => openPickedFiles, "nativeOpenUrl": () => nativeOpenUrl, "nativeOpenHook": () => nativeOpenHook, "SF2_SIZE_WARN": () => SF2_SIZE_WARN, "SF2_SIZE_REFUSE": () => SF2_SIZE_REFUSE, "importSf2File": () => importSf2File, "slugFile": () => slugFile, "monoWavBytes": () => monoWavBytes, "AUDIO_SIZE_GATE": () => AUDIO_SIZE_GATE, "importAudioFiles": () => importAudioFiles, "localMidiOpen": () => localMidiOpen, "gridFollowNote": () => gridFollowNote, "pianoHit": () => pianoHit, "guitarHit": () => guitarHit, "instPlay": () => instPlay, "setInstInfo": () => setInstInfo, "instTap": () => instTap, "recNoteOn": () => recNoteOn, "recNoteOff": () => recNoteOff, "recFinishImpl": () => recFinishImpl, "midiMessage": () => midiMessage, "initWebMidi": () => initWebMidi, "initCoreMidi": () => initCoreMidi, "toggleSubtitle": () => toggleSubtitle, "shiftAnchors": () => shiftAnchors, "convertAnchors": () => convertAnchors, "updateManifest": () => updateManifest, "manifestPlace": () => manifestPlace, "songStatus": () => songStatus, "openVersionsSheet": () => openVersionsSheet, "goBackToVersion": () => goBackToVersion, "renderVersionsSheet": () => renderVersionsSheet, "goBackToPublished": () => goBackToPublished, "fileStatus": () => fileStatus, "filesheet": () => filesheet, "openGridSheet": () => openGridSheet, "fileMenuSaveLabels": () => fileMenuSaveLabels, "renderOpenRecentRow": () => renderOpenRecentRow, "openRecentSong": () => openRecentSong, "filesub": () => filesub, "closeFileMenus": () => closeFileMenus, "openDropUp": () => openDropUp, "fsubItem": () => fsubItem, "fsubHeader": () => fsubHeader, "fsubAlbums": () => fsubAlbums, "fsubFolder": () => fsubFolder, "fsubSongs": () => fsubSongs, "draftRow": () => draftRow, "fsubLocalFolder": () => fsubLocalFolder, "publishJobStart": () => publishJobStart, "fsubImportAlbum": () => fsubImportAlbum, "renameRepoTitle": () => renameRepoTitle, "renameRepoTitles": () => renameRepoTitles, "revertSongToRepo": () => revertSongToRepo, "recordRealtimeAudio": () => recordRealtimeAudio, "chipTrackOrder": () => chipTrackOrder, "chipKindOf": () => chipKindOf, "chipVaultMeta": () => chipVaultMeta, "nsfModules": () => nsfModules, "captureChipTrack": () => captureChipTrack, "openChipImport": () => openChipImport, "openNsfImport": () => openNsfImport, "impStatus": () => impStatus, "renameImportDraft": () => renameImportDraft, "impCapture": () => impCapture, "captureJobStart": () => captureJobStart, "impRename": () => impRename, "computeImportAlbumJson": () => computeImportAlbumJson, "batchCommit": () => batchCommit, "commitImports": () => commitImports, "publishSong": () => publishSong, "copyAudioClips": () => copyAudioClips, "moveComposition": () => moveComposition, "DP_PIECES": () => DP_PIECES, "dpSteps": () => dpSteps, "dpDefault": () => dpDefault, "dpRender": () => dpRender, "dpBuildBeatSelects": () => dpBuildBeatSelects, "segGet": () => segGet, "openPasteTo": () => openPasteTo, "invertEdit": () => invertEdit, "editRedoPop": () => editRedoPop, "editUndoPop": () => editUndoPop, "applyEditEntry": () => applyEditEntry, "aiHostOk": () => aiHostOk, "askAddAnnotation": () => askAddAnnotation, "askEditAnnotation": () => askEditAnnotation, "askDeleteAnnotation": () => askDeleteAnnotation, "askPublishSong": () => askPublishSong, "askRunTool": () => askRunTool, "askKeyStateLine": () => askKeyStateLine, "askContext": () => askContext, "askInboxPoll": () => askInboxPoll, "askNotesArrived": () => askNotesArrived, "deployBeforeInstall": () => deployBeforeInstall, "deployInstallNow": () => deployInstallNow, "deployHoldNow": () => deployHoldNow, "deployWarn": () => deployWarn, "deploySetHeld": () => deploySetHeld, "deployAskTap": () => deployAskTap, "askStatusPoll": () => askStatusPoll, "askTabsApply": () => askTabsApply, "askShotShow": () => askShotShow, "askShotCapture": () => askShotCapture, "askShotTake": () => askShotTake, "askInboxStart": () => askInboxStart, "askFinish": () => askFinish, "askFail": () => askFail, "askLanded": () => askLanded, "askRun": () => askRun, "askTerminalSend": () => askTerminalSend, "askSend": () => askSend, "askRepending": () => askRepending, "askNoteSeen": () => askNoteSeen, "openAsk": () => openAsk, "askBtnTap": () => askBtnTap, "askMicOff": () => askMicOff, "askWriteNotes": () => askWriteNotes, "askInsertBars": () => askInsertBars, "askCopyBars": () => askCopyBars, "askDeleteBars": () => askDeleteBars, "renderFolderUI": () => renderFolderUI, "folderAfterChange": () => folderAfterChange, "chooseFolder": () => chooseFolder, "forgetFolder": () => forgetFolder, "discardPending": () => discardPending, "applyTextSize": () => applyTextSize, "settingsPersist": () => settingsPersist, "MODAL_KEEP": () => MODAL_KEEP, "markPublished": () => markPublished, "markCurrentSongSynced": () => markCurrentSongSynced, "publishOpenComposition": () => publishOpenComposition, "publishUnsavedSong": () => publishUnsavedSong, "publishAllJobStart": () => publishAllJobStart, "fingerprintOldDrafts": () => fingerprintOldDrafts, "askRenderImpl": () => askRenderImpl, "askBubble": () => askBubble, "askRenderEarlier": () => askRenderEarlier, "askResumeSoon": () => askResumeSoon, "askFillBubble": () => askFillBubble, "askResume": () => askResume, "openSyncSheet": () => openSyncSheet, "renderSyncPending": () => renderSyncPending}, set: {"recentSongsForMenu": (v) => (recentSongsForMenu = v), "recentAlbumFor": (v) => (recentAlbumFor = v), "applyMode": (v) => (applyMode = v), "setSecDepth": (v) => (setSecDepth = v), "cycleSecDepth": (v) => (cycleSecDepth = v), "annoRestore": (v) => (annoRestore = v), "homeSong": (v) => (homeSong = v), "governingAt": (v) => (governingAt = v), "finalizeLasso": (v) => (finalizeLasso = v), "toggleSel": (v) => (toggleSel = v), "fallHitNote": (v) => (fallHitNote = v), "hitTracksNote": (v) => (hitTracksNote = v), "hitTracksClip": (v) => (hitTracksClip = v), "selectAllNotes": (v) => (selectAllNotes = v), "openInsertBars": (v) => (openInsertBars = v), "openDeleteBars": (v) => (openDeleteBars = v), "hitNote": (v) => (hitNote = v), "scoreLassoTap": (v) => (scoreLassoTap = v), "beatLabel": (v) => (beatLabel = v), "noteLabel": (v) => (noteLabel = v), "songPitchExtent": (v) => (songPitchExtent = v), "scrubTo": (v) => (scrubTo = v), "seekOrMoveCursor": (v) => (seekOrMoveCursor = v), "placePencilNote": (v) => (placePencilNote = v), "endPointer": (v) => (endPointer = v), "tap": (v) => (tap = v), "scorePencilTick": (v) => (scorePencilTick = v), "scoreStaveAt": (v) => (scoreStaveAt = v), "scorePencil": (v) => (scorePencil = v), "scoreErase": (v) => (scoreErase = v), "scoreTap": (v) => (scoreTap = v), "renderSongGroups": (v) => (renderSongGroups = v), "renderFolder": (v) => (renderFolder = v), "renderSongList": (v) => (renderSongList = v), "openSongPicker": (v) => (openSongPicker = v), "applySpeed": (v) => (applySpeed = v), "fileMeterAt": (v) => (fileMeterAt = v), "refreshKeyPreview": (v) => (refreshKeyPreview = v), "moveSelectionToTrack": (v) => (moveSelectionToTrack = v), "dedupeSong": (v) => (dedupeSong = v), "insertChordAt": (v) => (insertChordAt = v), "insertProgressionAt": (v) => (insertProgressionAt = v), "cofRelease": (v) => (cofRelease = v), "applyListener": (v) => (applyListener = v), "setViewMode": (v) => (setViewMode = v), "applyViewMode": (v) => (applyViewMode = v), "decodeM3u": (v) => (decodeM3u = v), "parseM3u": (v) => (parseM3u = v), "applyM3uNames": (v) => (applyM3uNames = v), "applyM3uToAlbum": (v) => (applyM3uToAlbum = v), "createGameFilesRepo": (v) => (createGameFilesRepo = v), "openPickedFiles": (v) => (openPickedFiles = v), "nativeOpenUrl": (v) => (nativeOpenUrl = v), "nativeOpenHook": (v) => (nativeOpenHook = v), "importSf2File": (v) => (importSf2File = v), "slugFile": (v) => (slugFile = v), "monoWavBytes": (v) => (monoWavBytes = v), "importAudioFiles": (v) => (importAudioFiles = v), "localMidiOpen": (v) => (localMidiOpen = v), "gridFollowNote": (v) => (gridFollowNote = v), "pianoHit": (v) => (pianoHit = v), "guitarHit": (v) => (guitarHit = v), "instPlay": (v) => (instPlay = v), "setInstInfo": (v) => (setInstInfo = v), "instTap": (v) => (instTap = v), "recNoteOn": (v) => (recNoteOn = v), "recNoteOff": (v) => (recNoteOff = v), "midiMessage": (v) => (midiMessage = v), "initWebMidi": (v) => (initWebMidi = v), "initCoreMidi": (v) => (initCoreMidi = v), "toggleSubtitle": (v) => (toggleSubtitle = v), "shiftAnchors": (v) => (shiftAnchors = v), "convertAnchors": (v) => (convertAnchors = v), "updateManifest": (v) => (updateManifest = v), "manifestPlace": (v) => (manifestPlace = v), "songStatus": (v) => (songStatus = v), "openVersionsSheet": (v) => (openVersionsSheet = v), "goBackToVersion": (v) => (goBackToVersion = v), "renderVersionsSheet": (v) => (renderVersionsSheet = v), "goBackToPublished": (v) => (goBackToPublished = v), "openGridSheet": (v) => (openGridSheet = v), "fileMenuSaveLabels": (v) => (fileMenuSaveLabels = v), "renderOpenRecentRow": (v) => (renderOpenRecentRow = v), "openRecentSong": (v) => (openRecentSong = v), "closeFileMenus": (v) => (closeFileMenus = v), "openDropUp": (v) => (openDropUp = v), "fsubItem": (v) => (fsubItem = v), "fsubHeader": (v) => (fsubHeader = v), "fsubAlbums": (v) => (fsubAlbums = v), "fsubFolder": (v) => (fsubFolder = v), "fsubSongs": (v) => (fsubSongs = v), "draftRow": (v) => (draftRow = v), "fsubLocalFolder": (v) => (fsubLocalFolder = v), "publishJobStart": (v) => (publishJobStart = v), "fsubImportAlbum": (v) => (fsubImportAlbum = v), "renameRepoTitle": (v) => (renameRepoTitle = v), "renameRepoTitles": (v) => (renameRepoTitles = v), "revertSongToRepo": (v) => (revertSongToRepo = v), "recordRealtimeAudio": (v) => (recordRealtimeAudio = v), "chipTrackOrder": (v) => (chipTrackOrder = v), "chipKindOf": (v) => (chipKindOf = v), "chipVaultMeta": (v) => (chipVaultMeta = v), "nsfModules": (v) => (nsfModules = v), "captureChipTrack": (v) => (captureChipTrack = v), "openChipImport": (v) => (openChipImport = v), "openNsfImport": (v) => (openNsfImport = v), "renameImportDraft": (v) => (renameImportDraft = v), "impCapture": (v) => (impCapture = v), "captureJobStart": (v) => (captureJobStart = v), "impRename": (v) => (impRename = v), "computeImportAlbumJson": (v) => (computeImportAlbumJson = v), "batchCommit": (v) => (batchCommit = v), "commitImports": (v) => (commitImports = v), "publishSong": (v) => (publishSong = v), "copyAudioClips": (v) => (copyAudioClips = v), "moveComposition": (v) => (moveComposition = v), "dpSteps": (v) => (dpSteps = v), "dpDefault": (v) => (dpDefault = v), "dpRender": (v) => (dpRender = v), "dpBuildBeatSelects": (v) => (dpBuildBeatSelects = v), "segGet": (v) => (segGet = v), "openPasteTo": (v) => (openPasteTo = v), "invertEdit": (v) => (invertEdit = v), "editRedoPop": (v) => (editRedoPop = v), "editUndoPop": (v) => (editUndoPop = v), "applyEditEntry": (v) => (applyEditEntry = v), "aiHostOk": (v) => (aiHostOk = v), "askAddAnnotation": (v) => (askAddAnnotation = v), "askEditAnnotation": (v) => (askEditAnnotation = v), "askDeleteAnnotation": (v) => (askDeleteAnnotation = v), "askPublishSong": (v) => (askPublishSong = v), "askRunTool": (v) => (askRunTool = v), "askKeyStateLine": (v) => (askKeyStateLine = v), "askContext": (v) => (askContext = v), "askInboxPoll": (v) => (askInboxPoll = v), "askNotesArrived": (v) => (askNotesArrived = v), "deployBeforeInstall": (v) => (deployBeforeInstall = v), "deployInstallNow": (v) => (deployInstallNow = v), "deployHoldNow": (v) => (deployHoldNow = v), "deployWarn": (v) => (deployWarn = v), "deploySetHeld": (v) => (deploySetHeld = v), "deployAskTap": (v) => (deployAskTap = v), "askStatusPoll": (v) => (askStatusPoll = v), "askTabsApply": (v) => (askTabsApply = v), "askShotShow": (v) => (askShotShow = v), "askShotCapture": (v) => (askShotCapture = v), "askShotTake": (v) => (askShotTake = v), "askInboxStart": (v) => (askInboxStart = v), "askFinish": (v) => (askFinish = v), "askFail": (v) => (askFail = v), "askLanded": (v) => (askLanded = v), "askRun": (v) => (askRun = v), "askTerminalSend": (v) => (askTerminalSend = v), "askSend": (v) => (askSend = v), "askRepending": (v) => (askRepending = v), "askNoteSeen": (v) => (askNoteSeen = v), "openAsk": (v) => (openAsk = v), "askBtnTap": (v) => (askBtnTap = v), "askMicOff": (v) => (askMicOff = v), "askWriteNotes": (v) => (askWriteNotes = v), "askInsertBars": (v) => (askInsertBars = v), "askCopyBars": (v) => (askCopyBars = v), "askDeleteBars": (v) => (askDeleteBars = v), "renderFolderUI": (v) => (renderFolderUI = v), "folderAfterChange": (v) => (folderAfterChange = v), "chooseFolder": (v) => (chooseFolder = v), "forgetFolder": (v) => (forgetFolder = v), "discardPending": (v) => (discardPending = v), "applyTextSize": (v) => (applyTextSize = v), "settingsPersist": (v) => (settingsPersist = v), "markPublished": (v) => (markPublished = v), "markCurrentSongSynced": (v) => (markCurrentSongSynced = v), "publishOpenComposition": (v) => (publishOpenComposition = v), "publishUnsavedSong": (v) => (publishUnsavedSong = v), "publishAllJobStart": (v) => (publishAllJobStart = v), "fingerprintOldDrafts": (v) => (fingerprintOldDrafts = v), "askBubble": (v) => (askBubble = v), "askRenderEarlier": (v) => (askRenderEarlier = v), "askResumeSoon": (v) => (askResumeSoon = v), "askFillBubble": (v) => (askFillBubble = v), "askResume": (v) => (askResume = v), "openSyncSheet": (v) => (openSyncSheet = v), "renderSyncPending": (v) => (renderSyncPending = v)}};
